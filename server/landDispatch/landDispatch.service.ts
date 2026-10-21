import { eq, and, sql, or, isNull, inArray, gte, lte } from "drizzle-orm";
import { toZagreb, fromZagreb } from "@shared/timezone";
import { getDb } from "../db";
import {
  cranes,
  landZones,
  landOccupancies,
  reservations,
  vessels,
  users,
  serviceTypes,
  seasons,
  craneZoneAffinities,
  operationDependencies,
  waitingOffers,
  workOrders,
  craneOperationLog,
  landWaitingList,
  workStoppages,
} from "../../drizzle/schema";
import {
  DispatchOverviewResponse,
  DispatchReservationItem,
  UnassignedRequestItem,
  SlotRecommendation,
  OperationCategory,
} from "./types";
import { calculateZoneCapacitySnapshots } from "./capacity";
import { checkFeasibility } from "./feasibility";
import { computeRecommendationScore } from "./scoring";
import { fetchActiveStoppagesForDate } from "./stoppage";

export class LandDispatchService {
  /**
   * Helper to get working hours for a date from the seasons table.
   * Standard fallback: 07:00 - 15:00 if no season or weekend config.
   */
  async getWorkingHoursForDate(dateStr: string) {
    const db = await getDb();
    if (!db) {
      return { from: "07:00", to: "15:00", isOpen: true, seasonName: "Standard (Fallback)" };
    }

    const [season] = await db
      .select()
      .from(seasons)
      .where(
        and(
          eq(seasons.isActive, true),
          sql`${seasons.startDate} <= ${dateStr}`,
          sql`${seasons.endDate} >= ${dateStr}`
        )
      )
      .limit(1);

    if (!season || !season.workingHours) {
      return { from: "07:00", to: "15:00", isOpen: true, seasonName: "Standard 07:00-15:00" };
    }

    // day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
    const targetDate = new Date(`${dateStr}T12:00:00Z`);
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[targetDate.getDay()];

    const wh = (season.workingHours as Record<string, { from?: string; to?: string }>)[dayKey];
    if (wh && wh.from && wh.to) {
      return {
        from: wh.from,
        to: wh.to,
        isOpen: true,
        seasonName: season.name,
      };
    }

    return { from: "07:00", to: "15:00", isOpen: true, seasonName: season.name };
  }

  /**
   * Generates 30-minute interval slots between from and to (e.g. 07:00, 07:30, ...)
   */
  generate30MinSlots(fromStr: string, toStr: string): string[] {
    const slots: string[] = [];
    const [fromH, fromM] = fromStr.split(":").map(Number);
    const [toH, toM] = toStr.split(":").map(Number);

    let curr = fromH * 60 + fromM;
    const end = toH * 60 + toM;

    while (curr < end) {
      const h = Math.floor(curr / 60)
        .toString()
        .padStart(2, "0");
      const m = (curr % 60).toString().padStart(2, "0");
      slots.push(`${h}:${m}`);
      curr += 30;
    }

    return slots;
  }

  /**
   * Full Dispatch Overview for a given day
   */
  async getDailyDispatchOverview(dateStr: string): Promise<DispatchOverviewResponse> {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const workingHours = await this.getWorkingHoursForDate(dateStr);
    const timeSlots = this.generate30MinSlots(workingHours.from, workingHours.to);

    // 1. Fetch 3 active cranes
    const rawCranes = await db
      .select({
        id: cranes.id,
        name: cranes.name,
        type: cranes.type,
        maxCapacityKN: cranes.maxCapacityKN,
        maxPoolWidth: cranes.maxPoolWidth,
        status: cranes.craneStatus,
      })
      .from(cranes)
      .where(eq(cranes.craneStatus, "active"));

    const dbCranes = rawCranes.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      maxCapacityKN: Number(c.maxCapacityKN),
      maxPoolWidth: c.maxPoolWidth ? Number(c.maxPoolWidth) : null,
      status: c.status,
      craneStatus: c.status,
    }));

    // 2. Fetch the 6 land zones
    const dbZones = await db
      .select({
        id: landZones.id,
        code: landZones.code,
        name: landZones.name,
        totalSpots: landZones.totalSpots,
        manualOccupiedSpots: landZones.manualOccupiedSpots,
      })
      .from(landZones)
      .where(eq(landZones.isActive, true));

    // 3. Count current occupancies on land (returned_at IS NULL)
    const activeOccupancies = await db
      .select({
        zoneId: landOccupancies.zoneId,
        count: sql<number>`count(*)::int`,
      })
      .from(landOccupancies)
      .where(isNull(landOccupancies.returnedAt))
      .groupBy(landOccupancies.zoneId);

    const currentOccupiedMap = new Map<string, number>();
    for (const zone of dbZones) {
      currentOccupiedMap.set(zone.id, zone.manualOccupiedSpots || 0);
    }
    for (const row of activeOccupancies) {
      const existing = currentOccupiedMap.get(row.zoneId) || 0;
      currentOccupiedMap.set(row.zoneId, existing + row.count);
    }

    // 4. Fetch all reservations for this date + all pending / waitlisted
    const targetDateStr = dateStr || toZagreb(new Date()).dateStr;
    const dayStartUtc = fromZagreb(targetDateStr, "00:00");
    const dayEndUtc = fromZagreb(targetDateStr, "23:59:59");

    const allReservationsRaw = await db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        userId: reservations.userId,
        userName: users.name,
        userPhone: users.phone,
        userEmail: users.email,
        vesselId: reservations.vesselId,
        vesselName: reservations.vesselName,
        vesselRegistration: vessels.registration,
        vesselType: reservations.vesselType,
        vesselWeightTons: reservations.vesselWeightTons,
        vesselBeamM: reservations.vesselBeamM,
        vesselLengthM: reservations.vesselLengthM,
        serviceTypeId: reservations.serviceTypeId,
        serviceTypeName: serviceTypes.name,
        operationCategory: serviceTypes.operationCategory,
        defaultDurationMin: serviceTypes.defaultDurationMin,
        durationMin: reservations.durationMin,
        craneId: reservations.craneId,
        craneName: cranes.name,
        landZoneId: reservations.landZoneId,
        requestedZoneId: reservations.requestedZoneId,

        scheduledStart: reservations.scheduledStart,
        scheduledEnd: reservations.scheduledEnd,
        requestedDate: reservations.requestedDate,
        requestedTimeSlot: reservations.requestedTimeSlot,

        status: reservations.status,
        teamOverride: reservations.teamOverride,
        teamOverrideReason: reservations.teamOverrideReason,
        notPerformedReason: reservations.notPerformedReason,
        userNote: reservations.userNote,
        adminNote: reservations.adminNote,
      })
      .from(reservations)
      .leftJoin(users, eq(reservations.userId, users.id))
      .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
      .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
      .leftJoin(cranes, eq(reservations.craneId, cranes.id))
      .where(
        or(
          and(
            gte(reservations.scheduledStart, dayStartUtc),
            lte(reservations.scheduledStart, dayEndUtc)
          ),
          inArray(reservations.status, ["pending", "waitlisted"]),
          and(
            eq(reservations.status, "approved"),
            isNull(reservations.scheduledStart)
          )
        )
      );

    const allReservations = allReservationsRaw.map((r) => ({
      ...r,
      userName: r.userName || "Korisnik",
      vesselName: r.vesselName || "Plovilo",
      vesselRegistration: r.vesselRegistration || null,
      vesselWeightTons: r.vesselWeightTons ? Number(r.vesselWeightTons) : null,
      vesselBeamM: r.vesselBeamM ? Number(r.vesselBeamM) : null,
      vesselLengthM: r.vesselLengthM ? Number(r.vesselLengthM) : null,
      serviceTypeName: r.serviceTypeName || "Usluga",
      operationCategory: (r.operationCategory as OperationCategory) || "other",
      durationMin: Number(r.durationMin) || 30,
      scheduledEnd: r.scheduledStart
        ? (r.scheduledEnd && new Date(r.scheduledEnd).getTime() >= new Date(r.scheduledStart).getTime() + (Number(r.durationMin) || 30) * 60000
            ? r.scheduledEnd
            : new Date(new Date(r.scheduledStart).getTime() + (Number(r.durationMin) || 30) * 60000))
        : r.scheduledEnd,
    }));

    // 5. Active stoppages
    const activeStoppages = await fetchActiveStoppagesForDate(db, dateStr);

    // 6. Active offers (holding land capacity)
    const activeOffers = await db
      .select()
      .from(waitingOffers)
      .where(
        and(
          eq(waitingOffers.status, "pending"),
          sql`${waitingOffers.expiresAt} > NOW()`
        )
      );

    // 7. Calculate zone ATP snapshots
    const zoneSnapshots = calculateZoneCapacitySnapshots({
      zones: dbZones,
      currentOccupiedMap,
      scheduledReservations: allReservations
        .filter(
          (r) =>
            r.scheduledStart != null &&
            r.status !== "pending" &&
            r.status !== "waitlisted" &&
            r.status !== "cancelled" &&
            r.status !== "not_performed"
        )
        .map((r) => ({
          id: r.id,
          landZoneId: r.landZoneId,
          operationCategory: (r.operationCategory as string) || "other",
          scheduledStart: r.scheduledStart!,
          scheduledEnd: r.scheduledEnd!,
          status: r.status,
        })),
      activeOfferHolds: activeOffers.map((o) => ({
        zoneId: o.zoneId,
        offeredStart: o.offeredStart,
        expiresAt: o.expiresAt,
      })),
      timeSlots,
      dateStr: targetDateStr,
    });

    // 8. Operation dependencies for today's reservations
    const reservationIds: string[] = allReservations.map((r) => r.id);
    const dbDependencies =
      reservationIds.length > 0
        ? await db
            .select({
              id: operationDependencies.id,
              predecessorReservationId: operationDependencies.predecessorReservationId,
              successorReservationId: operationDependencies.successorReservationId,
              dependencyType: operationDependencies.dependencyType,
              status: operationDependencies.status,
            })
            .from(operationDependencies)
            .where(
              or(
                inArray(operationDependencies.predecessorReservationId, reservationIds),
                inArray(operationDependencies.successorReservationId, reservationIds)
              )
            )
        : [];

    const zoneMap = new Map(dbZones.map((z) => [z.id, z]));

    // Format scheduled operations
    const scheduledOperations: DispatchReservationItem[] = allReservations
      .filter(
        (r) =>
          r.scheduledStart != null &&
          r.status !== "pending" &&
          r.status !== "waitlisted" &&
          r.status !== "cancelled" &&
          r.status !== "not_performed"
      )
      .map((r) => {
        const zone = r.landZoneId ? zoneMap.get(r.landZoneId) : undefined;
        const deps = dbDependencies.filter(
          (d) => d.successorReservationId === r.id || d.predecessorReservationId === r.id
        );

        return {
          id: r.id,
          reservationNumber: r.reservationNumber,
          userId: r.userId,
          userName: r.userName,
          userPhone: r.userPhone,
          vesselId: r.vesselId,
          vesselName: r.vesselName,
          vesselRegistration: r.vesselRegistration || null,
          vesselType: r.vesselType,
          vesselWeightTons: r.vesselWeightTons,
          vesselBeamM: r.vesselBeamM,
          vesselLengthM: r.vesselLengthM,
          serviceTypeId: r.serviceTypeId,
          serviceTypeName: r.serviceTypeName,
          operationCategory: r.operationCategory,
          craneId: r.craneId,
          craneName: r.craneName,
          landZoneId: r.landZoneId,
          landZoneCode: zone?.code || null,
          landZoneName: zone?.name || null,
          scheduledStart: new Date(r.scheduledStart!).toISOString(),
          scheduledEnd: new Date(r.scheduledEnd!).toISOString(),
          durationMin: r.durationMin,
          adminNote: r.adminNote,
          status: r.status,
          teamOverride: r.teamOverride,
          teamOverrideReason: r.teamOverrideReason,
          notPerformedReason: r.notPerformedReason,
          dependencies: deps.map((d) => ({
            id: d.id,
            predecessorReservationId: d.predecessorReservationId,
            successorReservationId: d.successorReservationId,
            dependencyType: d.dependencyType,
            status: d.status,
          })),
          isAtRiskOrBroken: deps.some((d) => d.status === "broken" || d.status === "at_risk"),
        };
      });

    // Format unassigned requests from reservations
    const existingResIds = new Set<string>();
    const unassignedRequests: UnassignedRequestItem[] = allReservations
      .filter((r) => r.status === "pending" || r.status === "waitlisted" || (!r.scheduledStart && r.status === "approved"))
      .map((r) => {
        existingResIds.add(r.id);
        const reqZone = r.requestedZoneId ? zoneMap.get(r.requestedZoneId) : undefined;
        const vesselWeight = r.vesselWeightTons || 0;
        const vesselBeam = r.vesselBeamM || 0;

        // Quick check: has allowed crane?
        const hasAllowedCrane = dbCranes.some((c) => {
          const weightKN = vesselWeight * 9.80665;
          const fitsWeight = c.maxCapacityKN >= weightKN;
          const fitsBeam = !c.maxPoolWidth || vesselBeam <= c.maxPoolWidth;
          return fitsWeight && fitsBeam;
        });

        // Quick check: zone capacity
        const targetZoneSnapshot = reqZone ? zoneSnapshots.find((z) => z.zoneId === reqZone.id) : undefined;
        const hasZoneCapacity = targetZoneSnapshot ? targetZoneSnapshot.currentFree > 0 : true;

        return {
          id: r.id,
          reservationNumber: r.reservationNumber,
          requestedDate: r.requestedDate ? String(r.requestedDate) : targetDateStr,
          requestedTimeSlot: r.requestedTimeSlot,
          userId: r.userId,
          userName: r.userName,
          userPhone: r.userPhone,
          userEmail: r.userEmail,
          vesselId: r.vesselId,
          vesselName: r.vesselName,
          vesselRegistration: r.vesselRegistration,
          vesselType: r.vesselType,
          vesselWeightTons: r.vesselWeightTons,
          vesselBeamM: r.vesselBeamM,
          vesselLengthM: r.vesselLengthM,
          serviceTypeId: r.serviceTypeId,
          serviceTypeName: r.serviceTypeName,
          operationCategory: r.operationCategory,
          craneId: r.craneId,
          craneName: r.craneName,
          requestedZoneId: r.requestedZoneId,
          requestedZoneCode: reqZone?.code || null,
          userNote: r.userNote,
          adminNote: r.adminNote,
          status: r.status,
          durationMin: r.durationMin,
          scheduledStart: r.scheduledStart ? new Date(r.scheduledStart).toISOString() : null,
          quickChecks: {
            hasAllowedCrane,
            hasFreeSlot: timeSlots.length > 0,
            hasZoneCapacity,
          },
        };
      });

    // Also fetch waitlist items from landWaitingList that may not have reservations yet
    const dbWaitlistItems = await db
      .select({
        id: landWaitingList.id,
        userId: landWaitingList.userId,
        userName: users.name,
        userPhone: users.phone,
        userEmail: users.email,
        vesselId: landWaitingList.vesselId,
        vesselName: vessels.name,
        vesselRegistration: vessels.registration,
        vesselType: vessels.type,
        vesselLengthM: vessels.lengthM,
        vesselBeamM: vessels.beamM,
        vesselWeightTons: vessels.weightTons,
        preferredZoneId: landWaitingList.preferredZoneId,
        craneId: landWaitingList.craneId,
        craneName: cranes.name,
        note: landWaitingList.note,
        adminNote: landWaitingList.adminNote,
        reservationId: landWaitingList.reservationId,
        status: landWaitingList.status,
        createdAt: landWaitingList.createdAt,
      })
      .from(landWaitingList)
      .leftJoin(users, eq(landWaitingList.userId, users.id))
      .leftJoin(vessels, eq(landWaitingList.vesselId, vessels.id))
      .leftJoin(cranes, eq(landWaitingList.craneId, cranes.id))
      .where(inArray(landWaitingList.status, ["waiting", "offered"]));

    for (const wl of dbWaitlistItems) {
      if (wl.reservationId && existingResIds.has(wl.reservationId)) {
        continue; // Already included from reservations
      }
      const reqZone = wl.preferredZoneId ? zoneMap.get(wl.preferredZoneId) : undefined;
      const vesselWeight = wl.vesselWeightTons ? Number(wl.vesselWeightTons) : 0;
      const vesselBeam = wl.vesselBeamM ? Number(wl.vesselBeamM) : 0;
      const hasAllowedCrane = dbCranes.some((c) => {
        const weightKN = vesselWeight * 9.80665;
        const fitsWeight = c.maxCapacityKN >= weightKN;
        const fitsBeam = !c.maxPoolWidth || vesselBeam <= c.maxPoolWidth;
        return fitsWeight && fitsBeam;
      });
      const targetZoneSnapshot = reqZone ? zoneSnapshots.find((z) => z.zoneId === reqZone.id) : undefined;
      const hasZoneCapacity = targetZoneSnapshot ? targetZoneSnapshot.currentFree > 0 : true;

      unassignedRequests.push({
        id: wl.reservationId || wl.id,
        reservationNumber: null,
        requestedDate: targetDateStr,
        requestedTimeSlot: "po_dogovoru",
        userId: wl.userId,
        userName: wl.userName || "Korisnik",
        userPhone: wl.userPhone || null,
        userEmail: wl.userEmail || null,
        vesselId: wl.vesselId,
        vesselName: wl.vesselName || "Plovilo",
        vesselRegistration: wl.vesselRegistration || null,
        vesselType: wl.vesselType || null,
        vesselWeightTons: wl.vesselWeightTons ? Number(wl.vesselWeightTons) : null,
        vesselBeamM: wl.vesselBeamM ? Number(wl.vesselBeamM) : null,
        vesselLengthM: wl.vesselLengthM ? Number(wl.vesselLengthM) : null,
        serviceTypeId: null,
        serviceTypeName: "Čeka suhi vez",
        operationCategory: "lift_from_sea",
        craneId: wl.craneId || null,
        craneName: wl.craneName || null,
        requestedZoneId: wl.preferredZoneId,
        requestedZoneCode: reqZone?.code || null,
        userNote: wl.note,
        adminNote: wl.adminNote,
        status: "waitlisted",
        durationMin: 30,
        scheduledStart: null,
        quickChecks: {
          hasAllowedCrane,
          hasFreeSlot: timeSlots.length > 0,
          hasZoneCapacity,
        },
      });
    }

    // KPI calculation
    const maxTeams = 2; // Black box teams
    let peakConcurrentTeams = 0;

    for (const slot of timeSlots) {
      const [hStr, mStr] = slot.split(":");
      const slotMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
      const slotEndMins = slotMins + 30;

      const activeInSlot = scheduledOperations.filter((op) => {
        const start = new Date(op.scheduledStart);
        const end = new Date(op.scheduledEnd);
        const opStartMins = toZagreb(start).hours * 60 + toZagreb(start).minutes;
        const opEndMins = toZagreb(end).hours * 60 + toZagreb(end).minutes;
        return slotMins < opEndMins && slotEndMins > opStartMins;
      });

      if (activeInSlot.length > peakConcurrentTeams) {
        peakConcurrentTeams = activeInSlot.length;
      }
    }

    const totalLandFree = zoneSnapshots.reduce((acc, z) => acc + z.currentFree, 0);
    const zonesInDeficitCount = zoneSnapshots.filter((z) => z.hasDeficit).length;
    const liftsCount = scheduledOperations.filter((o) => o.operationCategory === "lift_from_sea").length;
    const lowersCount = scheduledOperations.filter((o) => o.operationCategory === "lower_to_sea").length;

    return {
      date: dateStr,
      workingHours,
      cranes: dbCranes.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        maxCapacityKN: c.maxCapacityKN,
        maxPoolWidth: c.maxPoolWidth,
        status: c.status,
      })),
      zones: zoneSnapshots,
      timeSlots,
      scheduledOperations,
      unassignedRequests,
      activeStoppages,
      kpi: {
        totalScheduled: scheduledOperations.length,
        liftsCount,
        lowersCount,
        peakConcurrentTeams,
        maxTeams,
        unassignedCount: unassignedRequests.length,
        zonesInDeficitCount,
        totalLandFree,
      },
    };
  }

  /**
   * Evaluates slot combinations (3 cranes x timeSlots x zones) for a reservation.
   * Returns sorted recommendations (isFeasible DESC, score DESC).
   */
  async getSlotRecommendations(params: {
    reservationId: string;
    dateStr: string;
    preferredZoneId?: string | null;
  }): Promise<SlotRecommendation[]> {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [resRaw] = await db
      .select({
        id: reservations.id,
        vesselName: reservations.vesselName,
        vesselWeightTons: reservations.vesselWeightTons,
        vesselBeamM: reservations.vesselBeamM,
        vesselLengthM: reservations.vesselLengthM,
        operationCategory: serviceTypes.operationCategory,
        defaultDurationMin: serviceTypes.defaultDurationMin,
        durationMin: reservations.durationMin,
        requestedZoneId: reservations.requestedZoneId,

      })
      .from(reservations)
      .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
      .where(eq(reservations.id, params.reservationId));

    if (!resRaw) throw new Error("Reservation not found");

    const res = {
      ...resRaw,
      vesselWeightTons: resRaw.vesselWeightTons ? Number(resRaw.vesselWeightTons) : null,
      vesselBeamM: resRaw.vesselBeamM ? Number(resRaw.vesselBeamM) : null,
      vesselLengthM: resRaw.vesselLengthM ? Number(resRaw.vesselLengthM) : null,
    };

    const overview = await this.getDailyDispatchOverview(params.dateStr);
    const affinities = await db.select().from(craneZoneAffinities);
    const targetZoneId = params.preferredZoneId || res.requestedZoneId || overview.zones[0]?.zoneId;

    const targetZone = overview.zones.find((z) => z.zoneId === targetZoneId) || overview.zones[0];
    if (!targetZone) throw new Error("Zone not found");

    const recommendations: SlotRecommendation[] = [];

    for (const crane of overview.cranes) {
      const affinity = affinities.find((a) => a.craneId === crane.id && a.zoneId === targetZone.zoneId);

      for (const slot of overview.timeSlots) {
        const [hStr, mStr] = slot.split(":");
        const slotStart = fromZagreb(params.dateStr, slot);
        const reqDurMin = Number(res.durationMin) || Number(res.defaultDurationMin) || 30;
        const slotEnd = new Date(slotStart.getTime() + reqDurMin * 60 * 1000);
        const endHourStr = slotEnd.getUTCHours().toString().padStart(2, "0");
        const endMinStr = slotEnd.getUTCMinutes().toString().padStart(2, "0");
        const endSlotStr = toZagreb(slotEnd).timeStr;

        const zoneTimelineItem = targetZone.hourlyTimeline.find((t) => t.time === slot);
        const freeAtSlot = zoneTimelineItem ? zoneTimelineItem.free : targetZone.currentFree;

        const feas = checkFeasibility({
          crane: {
            id: crane.id,
            name: crane.name,
            maxCapacityKN: crane.maxCapacityKN,
            maxPoolWidth: crane.maxPoolWidth,
            craneStatus: crane.status,
          },
          zone: {
            id: targetZone.zoneId,
            code: targetZone.zoneCode,
            name: targetZone.zoneName,
            totalSpots: targetZone.totalSpots,
          },
          affinity: affinity
            ? {
                isAllowed: affinity.isAllowed,
                isBlocked: affinity.isBlocked,
                affinityScore: affinity.affinityScore,
                penaltySlots: affinity.penaltySlots,
              }
            : undefined,
          vessel: {
            name: res.vesselName || "Plovilo",
            weightTons: res.vesselWeightTons,
            beamM: res.vesselBeamM,
            lengthM: res.vesselLengthM,
          },
          operationCategory: (res.operationCategory as string) || "lift_from_sea",
          slotStart,
          slotEnd,
          activeStoppages: overview.activeStoppages,
          existingReservations: overview.scheduledOperations.map((o) => ({
            id: o.id,
            craneId: o.craneId,
            landZoneId: o.landZoneId,
            operationCategory: o.operationCategory,
            scheduledStart: o.scheduledStart,
            scheduledEnd: o.scheduledEnd,
            status: o.status,
            vesselName: o.vesselName,
          })),
          currentZoneFreeAtSlot: freeAtSlot,
          maxConcurrentTeams: 2,
          teamOverride: false,
        });

        const scoreBreakdown = computeRecommendationScore({
          affinityScore: affinity?.affinityScore ?? 50,
          isPrimary: affinity?.isPrimary ?? false,
          penaltySlots: affinity?.penaltySlots ?? 0,
          concurrentTeamsInSlot: feas.concurrentTeamsInSlot,
          maxConcurrentTeams: 2,
          craneName: crane.name,
          zoneCode: targetZone.zoneCode,
          zoneName: targetZone.zoneName,
          isRotational: !!feas.rotationalCandidateReservationId,
          rotationalVesselName: feas.rotationalCandidateVesselName,
          teamCapacityExceeded: feas.teamCapacityExceeded,
        });

        recommendations.push({
          craneId: crane.id,
          craneName: crane.name,
          zoneId: targetZone.zoneId,
          zoneCode: targetZone.zoneCode,
          zoneName: targetZone.zoneName,
          startTime: slot,
          endTime: endSlotStr,
          scheduledStartIso: slotStart.toISOString(),
          scheduledEndIso: slotEnd.toISOString(),
          score: scoreBreakdown.finalScore,
          isPrimary: affinity?.isPrimary ?? false,
          teamCapacityExceeded: feas.teamCapacityExceeded,
          concurrentTeamsInSlot: feas.concurrentTeamsInSlot,
          requiresTeamOverride: feas.requiresTeamOverride,
          isFeasible: feas.isFeasible,
          hardBlockReasons: feas.hardBlockReasons,
          warnings: feas.warnings,
          explanations: scoreBreakdown.explanations,
          rotationalCandidateReservationId: feas.rotationalCandidateReservationId,
          rotationalCandidateVesselName: feas.rotationalCandidateVesselName,
        });
      }
    }

    // Sort: feasible first, then highest score
    recommendations.sort((a, b) => {
      if (a.isFeasible !== b.isFeasible) return a.isFeasible ? -1 : 1;
      return b.score - a.score;
    });

    return recommendations;
  }

  /**
   * Assigns crane, slot, and zone to a reservation, confirming it (status = 'approved').
   */
  async assignReservation(params: {
    reservationId: string;
    craneId: string;
    landZoneId: string;
    scheduledStartIso: string;
    scheduledEndIso: string;
    teamOverride?: boolean;
    teamOverrideReason?: string;
    rotationalPredecessorId?: string;
    adminUserId?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const {
      reservationId,
      craneId,
      landZoneId,
      scheduledStartIso,
      scheduledEndIso,
      teamOverride = false,
      teamOverrideReason,
      rotationalPredecessorId,
      adminUserId,
    } = params;

    const start = new Date(scheduledStartIso);
    const end = new Date(scheduledEndIso);
    const durationMin = Math.round((end.getTime() - start.getTime()) / (60 * 1000));

    // Update reservation
    await db
      .update(reservations)
      .set({
        craneId,
        landZoneId,
        scheduledStart: start,
        scheduledEnd: end,
        durationMin: durationMin > 0 ? durationMin : 30,
        status: "approved",
        teamOverride,
        teamOverrideReason: teamOverride ? (teamOverrideReason || "Dispečerski override kapaciteta posade") : null,
        approvedBy: adminUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    // If rotational predecessor is specified, create operation dependency
    if (rotationalPredecessorId) {
      await db.insert(operationDependencies).values({
        predecessorReservationId: rotationalPredecessorId,
        successorReservationId: reservationId,
        dependencyType: "capacity_release",
        minimumGapMinutes: 0,
        status: "active",
        note: "Rotacija isti dan: spuštanje oslobađa mjesto za podizanje",
      });
    }

    return { success: true, reservationId };
  }

  /**
   * Concludes an operation at the end of the day.
   */
  async concludeOperation(params: {
    reservationId: string;
    status: "completed" | "not_performed";
    actualZoneId?: string;
    notPerformedReason?: string;
    operatorUserId?: string;
    notes?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const { reservationId, status, actualZoneId, notPerformedReason, operatorUserId, notes } = params;

    const [res] = await db
      .select({
        id: reservations.id,
        vesselId: reservations.vesselId,
        userId: reservations.userId,
        craneId: reservations.craneId,
        landZoneId: reservations.landZoneId,
        operationCategory: serviceTypes.operationCategory,
        defaultDurationMin: serviceTypes.defaultDurationMin,
        durationMin: reservations.durationMin,
        scheduledStart: reservations.scheduledStart,
        scheduledEnd: reservations.scheduledEnd,

      })
      .from(reservations)
      .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
      .where(eq(reservations.id, reservationId));

    if (!res) throw new Error("Reservation not found");

    const now = new Date();

    if (status === "completed") {
      const finalZoneId = actualZoneId || res.landZoneId;

      // 1. Update reservation
      await db
        .update(reservations)
        .set({
          status: "completed",
          landZoneId: finalZoneId,
          completedAt: now,
          adminNote: notes ? notes : undefined,
          updatedAt: now,
        })
        .where(eq(reservations.id, reservationId));

      // 2. Update dry berth occupancies (land_occupancies)
      if (res.operationCategory === "lift_from_sea" && res.vesselId && finalZoneId) {
        // Vessel is now on land: create active occupancy
        await db.insert(landOccupancies).values({
          vesselId: res.vesselId,
          userId: res.userId,
          zoneId: finalZoneId,
          reservationId: res.id,
          liftedAt: res.scheduledStart ? new Date(res.scheduledStart) : now,
          returnedAt: null,
          createdBy: operatorUserId,
          note: notes || "Podignuto na kopno kroz Dispečerski centar",
        });
      } else if (res.operationCategory === "lower_to_sea" && res.vesselId) {
        // Vessel left land: update existing open occupancy
        await db
          .update(landOccupancies)
          .set({
            returnedAt: res.scheduledEnd ? new Date(res.scheduledEnd) : now,
            returnReservationId: res.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(landOccupancies.vesselId, res.vesselId),
              isNull(landOccupancies.returnedAt)
            )
          );
      }

      // 3. Complete associated work order if exists
      await db
        .update(workOrders)
        .set({
          status: "completed",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(workOrders.reservationId, reservationId));

      // 4. Record in craneOperationLog
      if (res.craneId) {
        await db.insert(craneOperationLog).values({
          craneId: res.craneId,
          reservationId: res.id,
          operationType: res.operationCategory || "crane_operation",
          startTime: res.scheduledStart ? new Date(res.scheduledStart) : now,
          endTime: res.scheduledEnd ? new Date(res.scheduledEnd) : now,
          durationMinutes: res.durationMin || 30,
          operatorId: operatorUserId,
          note: notes || "Zaključeno na kraju dana",
        });
      }

      // 5. If this was a predecessor in operation_dependencies, mark as fulfilled
      await db
        .update(operationDependencies)
        .set({
          status: "fulfilled",
          updatedAt: now,
        })
        .where(eq(operationDependencies.predecessorReservationId, reservationId));

    } else if (status === "not_performed") {
      await db
        .update(reservations)
        .set({
          status: "not_performed",
          notPerformedReason: notPerformedReason || "Operacija nije izvedena",
          updatedAt: now,
        })
        .where(eq(reservations.id, reservationId));

      // Cancel associated work order
      await db
        .update(workOrders)
        .set({
          status: "cancelled",
          updatedAt: now,
        })
        .where(eq(workOrders.reservationId, reservationId));

      // If this was predecessor, break dependency
      await db
        .update(operationDependencies)
        .set({
          status: "broken",
          note: `Prethodna operacija nije izvedena: ${notPerformedReason || ""}`,
          updatedAt: now,
        })
        .where(eq(operationDependencies.predecessorReservationId, reservationId));
    }

    return { success: true, reservationId, status };
  }

  /**
   * Batch concludes all approved operations for a day as completed.
   */
  async batchConcludeDay(dateStr: string, operatorUserId?: string) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const dayStartIso = `${dateStr}T00:00:00.000Z`;
    const dayEndIso = `${dateStr}T23:59:59.999Z`;

    const approvedOps = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.status, "approved"),
          sql`${reservations.scheduledStart} >= ${dayStartIso}`,
          sql`${reservations.scheduledStart} <= ${dayEndIso}`
        )
      );

    const results = [];
    for (const op of approvedOps) {
      const res = await this.concludeOperation({
        reservationId: op.id,
        status: "completed",
        operatorUserId,
        notes: "Grupno zaključenje na kraju dana",
      });
      results.push(res);
    }

    return { success: true, concludedCount: results.length };
  }

  /**
   * Administrative zone change for a vessel on dry berth (no crane operation).
   */
  async changeLandZone(params: {
    vesselId: string;
    newZoneId: string;
    reason?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const { vesselId, newZoneId, reason } = params;

    // Verify active occupancy
    const [occ] = await db
      .select()
      .from(landOccupancies)
      .where(
        and(
          eq(landOccupancies.vesselId, vesselId),
          isNull(landOccupancies.returnedAt)
        )
      )
      .limit(1);

    if (!occ) {
      throw new Error("Plovilo trenutno nije evidentirano na kopnu.");
    }

    // Verify destination zone has free capacity
    const [targetZone] = await db
      .select()
      .from(landZones)
      .where(eq(landZones.id, newZoneId));

    if (!targetZone) throw new Error("Ciljna zona ne postoji.");

    const [targetCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(landOccupancies)
      .where(
        and(
          eq(landOccupancies.zoneId, newZoneId),
          isNull(landOccupancies.returnedAt)
        )
      );

    const activeInTarget = (targetCount?.count || 0) + (targetZone.manualOccupiedSpots || 0);
    if (activeInTarget >= targetZone.totalSpots) {
      throw new Error(`Ciljna zona ${targetZone.code} (${targetZone.name}) je popunjena (${activeInTarget}/${targetZone.totalSpots}).`);
    }

    // Update zone
    await db
      .update(landOccupancies)
      .set({
        zoneId: newZoneId,
        note: reason ? `${occ.note || ""} [Premješteno u ${targetZone.code}: ${reason}]`.trim() : occ.note,
        updatedAt: new Date(),
      })
      .where(eq(landOccupancies.id, occ.id));

    return { success: true, vesselId, newZoneId, zoneCode: targetZone.code };
  }

  /**
   * Creates a work stoppage (emergency wind, maintenance, high tide).
   */
  async createWorkStoppage(params: {
    scope: "all_cranes" | "single_crane" | "single_zone";
    craneId?: string | null;
    zoneId?: string | null;
    startsAtIso: string;
    endsAtIso?: string | null;
    reason: string;
    note?: string | null;
    createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [stoppage] = await db
      .insert(workStoppages)
      .values({
        scope: params.scope,
        craneId: params.craneId || null,
        zoneId: params.zoneId || null,
        startsAt: new Date(params.startsAtIso),
        endsAt: params.endsAtIso ? new Date(params.endsAtIso) : null,
        reason: params.reason,
        note: params.note || null,
        createdBy: params.createdBy || null,
        isActive: true,
      })
      .returning();

    return stoppage;
  }

  /**
   * Cancels/deactivates an active work stoppage.
   */
  async cancelWorkStoppage(stoppageId: string) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    await db
      .update(workStoppages)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(workStoppages.id, stoppageId));

    return { success: true, stoppageId };
  }

  /**
   * Creates a 24h waiting offer holding spot and crane.
   */
  async createWaitingOffer(params: {
    waitingListId: string;
    zoneId: string;
    craneId: string;
    offeredStartIso: string;
    offeredEndIso: string;
    expiresInHours?: number; // default 24
    createdBy?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [wl] = await db
      .select()
      .from(landWaitingList)
      .where(eq(landWaitingList.id, params.waitingListId));

    if (!wl || !wl.vesselId) throw new Error("Stavka s liste čekanja ne postoji ili nema dodijeljeno plovilo.");

    const start = new Date(params.offeredStartIso);
    const end = new Date(params.offeredEndIso);
    const hours = params.expiresInHours || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const [offer] = await db
      .insert(waitingOffers)
      .values({
        waitingListId: params.waitingListId,
        vesselId: wl.vesselId,
        zoneId: params.zoneId,
        craneId: params.craneId,
        offeredStart: start,
        offeredEnd: end,
        expiresAt,
        status: "pending",
        createdBy: params.createdBy || null,
      })
      .returning();

    // Update status on waiting list
    await db
      .update(landWaitingList)
      .set({
        status: "offered",
        offeredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(landWaitingList.id, params.waitingListId));

    return offer;
  }

  /**
   * Responds to a waiting offer (accept/decline).
   */
  async respondToWaitingOffer(params: {
    offerId: string;
    accept: boolean;
    declineReason?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [offer] = await db
      .select()
      .from(waitingOffers)
      .where(eq(waitingOffers.id, params.offerId));

    if (!offer) throw new Error("Ponuda nije pronađena.");

    if (offer.status !== "pending") {
      throw new Error(`Ponuda više nije aktivna (status: ${offer.status}).`);
    }

    const now = new Date();

    if (params.accept) {
      await db
        .update(waitingOffers)
        .set({
          status: "accepted",
          updatedAt: now,
        })
        .where(eq(waitingOffers.id, params.offerId));

      await db
        .update(landWaitingList)
        .set({
          status: "assigned",
          updatedAt: now,
        })
        .where(eq(landWaitingList.id, offer.waitingListId));

      return { success: true, status: "accepted" };
    } else {
      await db
        .update(waitingOffers)
        .set({
          status: "declined",
          declineReason: params.declineReason || "Korisnik odbio ponuđeni termin",
          updatedAt: now,
        })
        .where(eq(waitingOffers.id, params.offerId));

      await db
        .update(landWaitingList)
        .set({
          status: "declined",
          declinedAt: now,
          declineCount: sql`${landWaitingList.declineCount} + 1`,
          updatedAt: now,
        })
        .where(eq(landWaitingList.id, offer.waitingListId));

      return { success: true, status: "declined" };
    }
  }
}

export const landDispatchService = new LandDispatchService();
