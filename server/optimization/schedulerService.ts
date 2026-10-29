import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  cranes,
  landZones,
  reservations,
  vessels,
  users,
  serviceTypes,
  craneZoneAffinities,
  seasons,
  landSpots,
  landOccupancies,
} from "../../drizzle/schema";
import { HighsMarinaOptimizer } from "./highsSolver";
import type {
  OptimizationProblemInput,
  OptimizationResult,
  OptimizationRequest,
  OptimizationCrane,
  OptimizationZone,
  OptimizationAffinity,
  ExistingSlotOccupation,
  OptimizationOverrides,
} from "./types";
import { toZagreb, fromZagreb } from "@shared/timezone";

export class SchedulerOptimizationService {
  private optimizer = new HighsMarinaOptimizer();

  /**
   * Generira 30-minutne vremenske slotove za radno vrijeme
   */
  private generateTimeSlots(fromTime: string = "07:00", toTime: string = "15:00"): string[] {
    const slots: string[] = [];
    const [fromH, fromM] = fromTime.split(":").map(Number);
    const [toH, toM] = toTime.split(":").map(Number);

    let curMin = fromH * 60 + fromM;
    const endMin = toH * 60 + toM;

    while (curMin < endMin) {
      const h = Math.floor(curMin / 60).toString().padStart(2, "0");
      const m = (curMin % 60).toString().padStart(2, "0");
      slots.push(`${h}:${m}`);
      curMin += 30;
    }
    return slots;
  }

  /**
   * Dohvaća radno vrijeme za datum
   */
  async getWorkingHoursForDate(dateStr: string): Promise<{ from: string; to: string }> {
    const db = await getDb();
    if (!db) return { from: "07:00", to: "15:00" };

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
      return { from: "07:00", to: "15:00" };
    }

    const targetDate = new Date(`${dateStr}T12:00:00Z`);
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[targetDate.getDay()];

    const wh = (season.workingHours as Record<string, { from?: string; to?: string }>)[dayKey];
    if (wh && wh.from && wh.to) {
      return { from: wh.from, to: wh.to };
    }
    return { from: "07:00", to: "15:00" };
  }

  /**
   * Pokreće matematičku optimizaciju dnevnog rasporeda za odabrani datum
   */
  async optimizeDailySchedule(params: {
    dateStr: string;
    requestIds?: string[]; // opcionalno: ako se želi optimizirati specifičan skup zahtjeva
    maxConcurrentTeams?: number;
    overrides?: OptimizationOverrides;
  }): Promise<OptimizationResult> {
    const db = await getDb();
    if (!db) {
      throw new Error("Baza podataka nije dostupna");
    }

    const { dateStr, requestIds, maxConcurrentTeams = 2, overrides } = params;
    const wh = await this.getWorkingHoursForDate(dateStr);
    const timeSlots = this.generateTimeSlots(wh.from, wh.to);

    // 1. Aktivne dizalice
    const activeCranes = await db
      .select()
      .from(cranes)
      .where(eq(cranes.craneStatus, "active"));

    const optCranes: OptimizationCrane[] = activeCranes.map((c) => ({
      id: c.id,
      name: c.name,
      maxCapacityTons: c.maxCapacityKN ? Math.round(Number(c.maxCapacityKN) / 9.80665) : 50,
      isActive: true,
    }));

    // 2. Zone na kopnu
    const zones = await db
      .select()
      .from(landZones)
      .where(eq(landZones.isActive, true));

    // Izračun slobodnih mjesta po zonama
    const optZones: OptimizationZone[] = [];
    for (const z of zones) {
      const occupied = await db
        .select({ count: sql<number>`count(*)` })
        .from(landOccupancies)
        .where(
          and(
            eq(landOccupancies.zoneId, z.id),
            sql`${landOccupancies.returnedAt} IS NULL`
          )
        );
      const occupiedCount = Number(occupied[0]?.count || 0) + (z.manualOccupiedSpots || 0);
      const freeSpots = Math.max(0, z.totalSpots - occupiedCount);

      optZones.push({
        id: z.id,
        code: z.code,
        name: z.name,
        totalSpots: z.totalSpots,
        freeSpots,
      });
    }

    // 3. Matrica afiniteta dizalica i zona
    const affinities = await db.select().from(craneZoneAffinities);
    const optAffinities: OptimizationAffinity[] = affinities.map((a) => ({
      craneId: a.craneId,
      zoneId: a.zoneId,
      affinityScore: a.affinityScore,
      extraTransportMinutes: a.extraTransportMinutes,
      isAllowed: a.isAllowed,
    }));

    // 4. Postojeće odobrene rezervacije na taj datum (zauzeti slotovi)
    const dayStart = fromZagreb(dateStr, "00:00");
    const dayEnd = fromZagreb(dateStr, "23:59");

    const existingRes = await db
      .select()
      .from(reservations)
      .where(
        and(
          inArray(reservations.status, ["approved", "completed"]),
          gte(reservations.scheduledStart, dayStart),
          lt(reservations.scheduledStart, dayEnd)
        )
      );

    const existingOccupations: ExistingSlotOccupation[] = [];
    for (const res of existingRes) {
      if (!res.craneId || !res.scheduledStart || !res.scheduledEnd) continue;

      const startSlotStr = toZagreb(res.scheduledStart).timeStr;
      const startIdx = timeSlots.indexOf(startSlotStr);
      if (startIdx >= 0) {
        const durationMin = Math.round(
          (new Date(res.scheduledEnd).getTime() - new Date(res.scheduledStart).getTime()) / (60 * 1000)
        );
        const slotsCount = Math.max(1, Math.ceil(durationMin / 30));
        for (let span = 0; span < slotsCount; span++) {
          if (startIdx + span < timeSlots.length) {
            existingOccupations.push({
              craneId: res.craneId,
              slotIndex: startIdx + span,
              reservationId: res.id,
            });
          }
        }
      }
    }

    // 5. Neraspoređeni zahtjevi koji se trebaju optimizirati
    let pendingQuery = db
      .select({
        res: reservations,
        vessel: vessels,
        user: users,
        serviceType: serviceTypes,
      })
      .from(reservations)
      .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
      .leftJoin(users, eq(reservations.userId, users.id))
      .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
      .where(
        and(
          requestIds && requestIds.length > 0
            ? inArray(reservations.id, requestIds)
            : and(
                inArray(reservations.status, ["pending", "waitlisted"]),
                gte(reservations.scheduledStart, dayStart),
                lt(reservations.scheduledStart, dayEnd)
              )
        )
      );

    const pendingRows = await pendingQuery;

    const optRequests: OptimizationRequest[] = pendingRows.map(({ res, vessel, serviceType }) => {
      let prefSlotIdx: number | undefined;
      if (res.scheduledStart) {
        const startSlotStr = toZagreb(res.scheduledStart).timeStr;
        const idx = timeSlots.indexOf(startSlotStr);
        if (idx >= 0) prefSlotIdx = idx;
      }

      return {
        id: res.id,
        reservationNumber: res.reservationNumber || undefined,
        vessel: {
          name: vessel?.name || "Plovilo",
          weightTons: vessel?.weightTons ? Number(vessel.weightTons) : 5,
          lengthM: vessel?.lengthM ? Number(vessel.lengthM) : 8,
          beamM: vessel?.beamM ? Number(vessel.beamM) : 3,
        },
        operationCategory: (serviceType?.operationCategory as any) || "lift_from_sea",
        durationMin: res.durationMin || 30,
        preferredCraneId: res.craneId || undefined,
        preferredSlotIndex: prefSlotIdx,
        preferredZoneId: res.landZoneId || undefined,
      };
    });

    const problemInput: OptimizationProblemInput = {
      dateStr,
      timeSlots,
      requests: optRequests,
      cranes: optCranes,
      zones: optZones,
      affinities: optAffinities,
      existingOccupations,
      maxConcurrentTeams,
      overrides,
    };

    return await this.optimizer.solve(problemInput);
  }

  /**
   * Primjenjuje optimizirani raspored u bazi podataka
   */
  async applyOptimizedSchedule(params: {
    dateStr: string;
    assignments: OptimizationResult["assignments"];
    adminUserId?: string;
  }): Promise<{ updatedCount: number; message: string }> {
    const db = await getDb();
    if (!db) {
      throw new Error("Baza podataka nije dostupna");
    }

    const { dateStr, assignments } = params;
    let updatedCount = 0;

    for (const a of assignments) {
      const startIso = fromZagreb(dateStr, a.startTime);
      const endIso = fromZagreb(dateStr, a.endTime);

      await db
        .update(reservations)
        .set({
          craneId: a.craneId,
          landZoneId: a.zoneId || null,
          scheduledStart: startIso,
          scheduledEnd: endIso,
          durationMin: a.durationMin,
          status: "approved",
          teamOverride: a.hasOverride ?? false,
          teamOverrideReason: a.overrideReasons ? a.overrideReasons.join("; ") : null,
          adminNote: sql`COALESCE(admin_note || E'\n', '') || 'Optimizirano HiGHS solverom: ' || ${a.explanation}`,
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, a.requestId));

      updatedCount++;
    }

    return {
      updatedCount,
      message: `Uspješno primijenjen optimalni raspored za ${updatedCount} rezervacija.`,
    };
  }

  /**
   * Preporučuje optimalni slot za jedan pojedinačni zahtjev uzimajući u obzir cijeli dan
   */
  async recommendBestSlotForRequest(params: {
    requestId: string;
    targetDateStr: string;
    overrides?: OptimizationOverrides;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Baza podataka nije dostupna");

    const optResult = await this.optimizeDailySchedule({
      dateStr: params.targetDateStr,
      requestIds: [params.requestId],
      overrides: params.overrides,
    });

    const assignment = optResult.assignments.find((a) => a.requestId === params.requestId);
    if (assignment) {
      return {
        found: true,
        recommendation: assignment,
        metrics: optResult.metrics,
      };
    }

    const unassigned = optResult.unassignedRequests.find((u) => u.requestId === params.requestId);
    return {
      found: false,
      reason: unassigned?.reason || "Nije pronađen slobodan termin unutar radnog vremena.",
      metrics: optResult.metrics,
    };
  }
}
