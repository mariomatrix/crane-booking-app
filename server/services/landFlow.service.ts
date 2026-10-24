import { getDb, createAuditEntry } from "../db";
import {
    landZones,
    landSpots,
    landOccupancies,
    landSpotAllocations,
    landTurnaroundLinks,
    craneZoneAffinities,
    cranes,
    reservations,
    serviceTypes,
    vessels,
    users,
    type LandSpot,
    type CraneZoneAffinity,
} from "../../drizzle/schema";
import { eq, and, sql, or, isNull, inArray, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export interface CapacityEvent {
    timestamp: Date;
    type: "release" | "occupy";
    delta: number; // +1 or -1
    reservationId: string;
    vesselName?: string;
    spotId?: string;
    spotCode?: string;
    isConfirmed: boolean;
}

export interface HubZoneBreakdown {
    zoneId: string;
    zoneName: string;
    zoneCode: string;
    affinityScore: number;
    extraTransportMinutes: number;
    isPrimary: boolean;
    isBlocked: boolean;
    totalSpots: number;
    freeSpots: number;
    departuresCount: number;
    arrivalsCount: number;
    netBalance: number;
}

export interface HubCraneBreakdown {
    craneId: string;
    craneName: string;
    craneType: string;
    zones: HubZoneBreakdown[];
}

export interface ConflictItem {
    id: string;
    severity: "blocking" | "warning";
    code: string;
    message: string;
    spotId?: string;
    spotCode?: string;
    reservationIds: string[];
}

export interface DailyBalanceResult {
    date: string;
    openingFreeSpots: number;
    closingProjectedFreeSpots: number;
    minimumProjectedFreeSpots: number;
    firstDeficitAt: Date | null;
    isFeasible: boolean;
    hasBlockingConflicts: boolean;
    summary: {
        totalSpots: number;
        physicallyOccupied: number;
        scheduledReleases: number;
        confirmedArrivals: number;
        unassignedArrivals: number;
    };
    conflicts: ConflictItem[];
    hubBreakdown: HubCraneBreakdown[];
}

export interface FlowMatrixItem {
    id: string;
    timeSlot: string; // e.g. "08:00"
    sortTime: Date;
    craneId?: string;
    craneName?: string;
    spotId?: string;
    spotCode?: string;
    zoneId?: string;
    zoneCode?: string;
    departure?: {
        reservationId: string;
        vesselId: string;
        vesselName: string;
        vesselLengthM: number | null;
        vesselBeamM: number | null;
        userName: string | null;
        scheduledStart: Date;
        scheduledEnd: Date;
        status: string;
    };
    arrival?: {
        reservationId: string;
        vesselId: string;
        vesselName: string;
        vesselLengthM: number | null;
        vesselBeamM: number | null;
        userName: string | null;
        scheduledStart: Date;
        scheduledEnd: Date;
        status: string;
        allocationStatus: "proposed" | "confirmed" | "unassigned";
    };
    turnaroundLink?: {
        id: string;
        status: "proposed" | "confirmed" | "at_risk" | "broken" | "completed" | "cancelled";
        bufferMinutes: number;
        minimumBufferMinutes: number;
    };
    conflict?: {
        severity: "blocking" | "warning";
        code: string;
        message: string;
    };
}

export class LandFlowService {
    /**
     * Izračunava kronološki event-based dnevni kapacitet i detektira deficite
     */
    async getDailyBalance(dateStr: string, craneFilterId?: string): Promise<DailyBalanceResult> {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        // Definiraj početak i kraj radnog dana u lokalnom vremenu
        const dayStart = new Date(`${dateStr}T00:00:00Z`);
        const dayEnd = new Date(`${dateStr}T23:59:59Z`);

        // 1. Dohvati sve aktivne zone i mjesta
        const allZones = await db.select().from(landZones).where(eq(landZones.isActive, true)).orderBy(asc(landZones.sortOrder));
        const allSpots = await db.select().from(landSpots).where(eq(landSpots.isActive, true));
        const activeUnblockedSpots = allSpots.filter(s => !s.isBlocked);
        const totalSpotsCount = activeUnblockedSpots.length;

        // 2. Fizički zauzeta mjesta na početku dana (liftedAt <= dayStart AND (returnedAt IS NULL OR returnedAt > dayStart))
        const activeOccupancies = await db.select().from(landOccupancies).where(
            and(
                sql`${landOccupancies.liftedAt} <= ${dayStart.toISOString()}`,
                or(isNull(landOccupancies.returnedAt), sql`${landOccupancies.returnedAt} > ${dayStart.toISOString()}`)
            )
        );
        const physicallyOccupied = activeOccupancies.length;
        const openingFreeSpots = Math.max(0, totalSpotsCount - physicallyOccupied);

        // 3. Dohvati rezervacije za taj datum
        const dayReservations = await db.select({
            reservation: reservations,
            serviceType: serviceTypes,
            vessel: vessels,
            user: users,
        })
            .from(reservations)
            .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
            .leftJoin(users, eq(reservations.userId, users.id))
            .where(
                and(
                    sql`${reservations.scheduledStart} >= ${dayStart.toISOString()}`,
                    sql`${reservations.scheduledStart} <= ${dayEnd.toISOString()}`,
                    or(eq(reservations.status, "approved"), eq(reservations.status, "completed"))
                )
            );

        // 4. Dohvati postojeće alokacije mjesta za te rezervacije
        const resIds = dayReservations.map(r => r.reservation.id);
        const existingAllocations = resIds.length > 0
            ? await db.select().from(landSpotAllocations).where(inArray(landSpotAllocations.reservationId, resIds))
            : [];
        const allocByResId = new Map(existingAllocations.map(a => [a.reservationId!, a]));

        // 5. Dohvati perzistirane turnaround linkove
        const existingTurnarounds = resIds.length > 0
            ? await db.select().from(landTurnaroundLinks).where(
                or(
                    inArray(landTurnaroundLinks.releaseReservationId, resIds),
                    inArray(landTurnaroundLinks.arrivalReservationId, resIds)
                )
            )
            : [];

        // 6. Razvrstaj u odobrena spuštanja (release) i vađenja (occupy)
        const scheduledReleases: CapacityEvent[] = [];
        const scheduledOccupy: CapacityEvent[] = [];
        let confirmedArrivalsCount = 0;
        let unassignedArrivalsCount = 0;

        for (const row of dayReservations) {
            const cat = row.serviceType?.operationCategory;
            const start = row.reservation.scheduledStart;
            const end = row.reservation.scheduledEnd || (start ? new Date(start.getTime() + (row.reservation.durationMin || 60) * 60000) : null);
            if (!start || !end) continue;

            const alloc = allocByResId.get(row.reservation.id);
            const isConfirmed = alloc?.status === "confirmed";

            if (cat === "lower_to_sea") {
                // Spuštanje oslobađa mjesto na kraju operacije + 15 min buffer
                const releaseAt = new Date(end.getTime() + 15 * 60000);
                scheduledReleases.push({
                    timestamp: releaseAt,
                    type: "release",
                    delta: 1,
                    reservationId: row.reservation.id,
                    vesselName: row.vessel?.name,
                    spotId: alloc?.spotId,
                    isConfirmed: true,
                });
            } else if (cat === "lift_from_sea") {
                // Vađenje zauzima mjesto na početku operacije
                scheduledOccupy.push({
                    timestamp: start,
                    type: "occupy",
                    delta: -1,
                    reservationId: row.reservation.id,
                    vesselName: row.vessel?.name,
                    spotId: alloc?.spotId,
                    isConfirmed,
                });
                if (alloc && alloc.status === "confirmed") {
                    confirmedArrivalsCount++;
                } else {
                    unassignedArrivalsCount++;
                }
            }
        }

        // 7. Kronološki event-based kumulativni proračun kapaciteta
        const allEvents: CapacityEvent[] = [...scheduledReleases, ...scheduledOccupy].sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        let runningCapacity = openingFreeSpots;
        let minimumProjectedFreeSpots = openingFreeSpots;
        let firstDeficitAt: Date | null = null;

        for (const ev of allEvents) {
            runningCapacity += ev.delta;
            if (runningCapacity < minimumProjectedFreeSpots) {
                minimumProjectedFreeSpots = runningCapacity;
            }
            if (runningCapacity < 0 && !firstDeficitAt) {
                firstDeficitAt = ev.timestamp;
            }
        }

        const closingProjectedFreeSpots = runningCapacity;
        const capacityFeasible = minimumProjectedFreeSpots >= 0;

        // 8. Detekcija konflikata (Hard / Blocking i Warning)
        const conflicts: ConflictItem[] = [];

        // Ako kapacitet ide u minus:
        if (!capacityFeasible && firstDeficitAt) {
            conflicts.push({
                id: `deficit-${firstDeficitAt.getTime()}`,
                severity: "blocking",
                code: "CAPACITY_DEFICIT",
                message: `Kapacitet kopna pada u deficit (${minimumProjectedFreeSpots}) u ${firstDeficitAt.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}. Vađenje je zakazano prije nego su oslobođena dovoljna mjesta.`,
                reservationIds: [],
            });
        }

        // Provjeri preklapanja za isto mjesto među alokacijama
        const spotOccupyMap = new Map<string, Array<{ start: Date; end: Date; resId: string }>>();
        for (const row of dayReservations) {
            const alloc = allocByResId.get(row.reservation.id);
            if (!alloc) continue;
            const start = row.reservation.scheduledStart!;
            const end = row.reservation.scheduledEnd || new Date(start.getTime() + 3600000);
            const list = spotOccupyMap.get(alloc.spotId) || [];
            for (const prev of list) {
                if (start < prev.end && end > prev.start) {
                    const spot = allSpots.find(s => s.id === alloc.spotId);
                    conflicts.push({
                        id: `double-alloc-${alloc.spotId}`,
                        severity: "blocking",
                        code: "DOUBLE_SPOT_ALLOCATION",
                        message: `Mjesto ${spot?.code || alloc.spotId} ima dvostruku preklapajuću dodjelu u isto vrijeme!`,
                        spotId: alloc.spotId,
                        spotCode: spot?.code,
                        reservationIds: [prev.resId, row.reservation.id],
                    });
                }
            }
            list.push({ start, end, resId: row.reservation.id });
            spotOccupyMap.set(alloc.spotId, list);
        }

        // Nedodijeljeni dolasci kao upozorenje
        for (const row of dayReservations) {
            if (row.serviceType?.operationCategory === "lift_from_sea") {
                const alloc = allocByResId.get(row.reservation.id);
                if (!alloc || alloc.status !== "confirmed") {
                    conflicts.push({
                        id: `unassigned-${row.reservation.id}`,
                        severity: "warning",
                        code: "UNASSIGNED_ARRIVAL",
                        message: `Dolazak "${row.vessel?.name || "Plovilo"}" u ${row.reservation.scheduledStart?.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })} još nema potvrđeno mjesto na kopnu.`,
                        reservationIds: [row.reservation.id],
                    });
                }
            }
        }

        // Provjera turnaround linkova i kratkih buffera
        for (const link of existingTurnarounds) {
            const diffMin = Math.round((link.plannedOccupyAt.getTime() - link.plannedReleaseAt.getTime()) / 60000);
            if (diffMin < 0) {
                conflicts.push({
                    id: `turnaround-neg-${link.id}`,
                    severity: "blocking",
                    code: "NEGATIVE_TURNAROUND_TIME",
                    message: `Rotacija na mjestu je fizički nemoguća: vađenje počinje prije završetka spuštanja (${diffMin} min razlike).`,
                    spotId: link.spotId,
                    reservationIds: [link.releaseReservationId, link.arrivalReservationId],
                });
            } else if (diffMin < link.minimumBufferMinutes) {
                conflicts.push({
                    id: `turnaround-tight-${link.id}`,
                    severity: "warning",
                    code: "TIGHT_BUFFER_WARNING",
                    message: `Razmak između spuštanja i vađenja na mjestu je samo ${diffMin} min (preporučeno: ${link.minimumBufferMinutes} min).`,
                    spotId: link.spotId,
                    reservationIds: [link.releaseReservationId, link.arrivalReservationId],
                });
            }
        }

        // 9. Hub Breakdown (Dizalice × Zone)
        const allCranes = await db.select().from(cranes).where(eq(cranes.craneStatus, "active"));
        const allAffinities = await db.select().from(craneZoneAffinities);
        const filteredCranes = craneFilterId ? allCranes.filter(c => c.id === craneFilterId) : allCranes;

        const hubBreakdown: HubCraneBreakdown[] = [];

        for (const crane of filteredCranes) {
            const craneAffinities = allAffinities.filter(a => a.craneId === crane.id);
            const zonesBreakdown: HubZoneBreakdown[] = [];

            for (const zone of allZones) {
                const aff = craneAffinities.find(a => a.zoneId === zone.id);
                const zoneSpots = allSpots.filter(s => s.zoneId === zone.id && !s.isBlocked);
                const zoneOcc = activeOccupancies.filter(o => o.zoneId === zone.id);
                const freeCount = Math.max(0, zoneSpots.length - zoneOcc.length);

                const depCount = scheduledReleases.filter(r => {
                    const spot = allSpots.find(s => s.id === r.spotId);
                    return spot?.zoneId === zone.id;
                }).length;

                const arrCount = scheduledOccupy.filter(o => {
                    const spot = allSpots.find(s => s.id === o.spotId);
                    return spot?.zoneId === zone.id;
                }).length;

                zonesBreakdown.push({
                    zoneId: zone.id,
                    zoneName: zone.name,
                    zoneCode: zone.code,
                    affinityScore: aff?.affinityScore ?? 50,
                    extraTransportMinutes: aff?.extraTransportMinutes ?? 0,
                    isPrimary: aff?.isPrimary ?? false,
                    isBlocked: aff?.isBlocked ?? false,
                    totalSpots: zoneSpots.length,
                    freeSpots: freeCount,
                    departuresCount: depCount,
                    arrivalsCount: arrCount,
                    netBalance: freeCount + depCount - arrCount,
                });
            }

            zonesBreakdown.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || b.affinityScore - a.affinityScore);

            hubBreakdown.push({
                craneId: crane.id,
                craneName: crane.name,
                craneType: crane.type,
                zones: zonesBreakdown,
            });
        }

        const hasBlocking = conflicts.some(c => c.severity === "blocking");

        return {
            date: dateStr,
            openingFreeSpots,
            closingProjectedFreeSpots,
            minimumProjectedFreeSpots,
            firstDeficitAt,
            isFeasible: capacityFeasible && !hasBlocking,
            hasBlockingConflicts: hasBlocking,
            summary: {
                totalSpots: totalSpotsCount,
                physicallyOccupied,
                scheduledReleases: scheduledReleases.length,
                confirmedArrivals: confirmedArrivalsCount,
                unassignedArrivals: unassignedArrivalsCount,
            },
            conflicts,
            hubBreakdown,
        };
    }

    /**
     * Dohvat matrice protoka i izmjena za odabrani datum
     */
    async getFlowMatrix(dateStr: string, craneFilterId?: string, zoneFilterId?: string): Promise<{ date: string; items: FlowMatrixItem[] }> {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const dayStart = new Date(`${dateStr}T00:00:00Z`);
        const dayEnd = new Date(`${dateStr}T23:59:59Z`);

        // Dohvati rezervacije
        const dayReservations = await db.select({
            reservation: reservations,
            serviceType: serviceTypes,
            vessel: vessels,
            user: users,
            crane: cranes,
        })
            .from(reservations)
            .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
            .leftJoin(users, eq(reservations.userId, users.id))
            .leftJoin(cranes, eq(reservations.craneId, cranes.id))
            .where(
                and(
                    sql`${reservations.scheduledStart} >= ${dayStart.toISOString()}`,
                    sql`${reservations.scheduledStart} <= ${dayEnd.toISOString()}`,
                    or(eq(reservations.status, "approved"), eq(reservations.status, "completed"))
                )
            )
            .orderBy(asc(reservations.scheduledStart));

        const resIds = dayReservations.map(r => r.reservation.id);
        const allSpots = await db.select().from(landSpots);
        const allZones = await db.select().from(landZones);
        const spotMap = new Map(allSpots.map(s => [s.id, s]));
        const zoneMap = new Map(allZones.map(z => [z.id, z]));

        const existingAllocations = resIds.length > 0
            ? await db.select().from(landSpotAllocations).where(inArray(landSpotAllocations.reservationId, resIds))
            : [];
        const allocByResId = new Map(existingAllocations.map(a => [a.reservationId!, a]));

        const existingTurnarounds = resIds.length > 0
            ? await db.select().from(landTurnaroundLinks).where(
                or(
                    inArray(landTurnaroundLinks.releaseReservationId, resIds),
                    inArray(landTurnaroundLinks.arrivalReservationId, resIds)
                )
            )
            : [];
        const turnaroundByArrivalResId = new Map(existingTurnarounds.map(t => [t.arrivalReservationId, t]));
        const turnaroundByReleaseResId = new Map(existingTurnarounds.map(t => [t.releaseReservationId, t]));

        // Spari operacije u retke matrice
        const departures = dayReservations.filter(r => r.serviceType?.operationCategory === "lower_to_sea");
        const arrivals = dayReservations.filter(r => r.serviceType?.operationCategory === "lift_from_sea");

        const handledArrivalIds = new Set<string>();
        const handledDepartureIds = new Set<string>();
        const items: FlowMatrixItem[] = [];

        // 1. Prvo obrađujemo eksplicitno perzistirane turnaround linkove
        for (const link of existingTurnarounds) {
            const depRow = departures.find(d => d.reservation.id === link.releaseReservationId);
            const arrRow = arrivals.find(a => a.reservation.id === link.arrivalReservationId);
            const spot = spotMap.get(link.spotId);
            const zone = spot ? zoneMap.get(spot.zoneId) : undefined;

            const bufferMin = Math.round((link.plannedOccupyAt.getTime() - link.plannedReleaseAt.getTime()) / 60000);
            let conflict: { severity: "blocking" | "warning"; code: string; message: string } | undefined = undefined;

            if (bufferMin < 0) {
                conflict = { severity: "blocking", code: "NEGATIVE_BUFFER", message: `Vađenje počinje prije završetka spuštanja (${bufferMin} min).` };
            } else if (bufferMin < link.minimumBufferMinutes) {
                conflict = { severity: "warning", code: "TIGHT_BUFFER", message: `Kratak buffer: ${bufferMin} min (preporučeno: ${link.minimumBufferMinutes} min).` };
            }

            const sortTime = depRow?.reservation.scheduledStart || link.plannedReleaseAt;
            const timeSlot = sortTime.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });

            items.push({
                id: `turnaround-${link.id}`,
                timeSlot,
                sortTime,
                craneId: depRow?.crane?.id || arrRow?.crane?.id,
                craneName: depRow?.crane?.name || arrRow?.crane?.name,
                spotId: link.spotId,
                spotCode: spot?.code,
                zoneId: spot?.zoneId,
                zoneCode: zone?.code,
                departure: depRow ? {
                    reservationId: depRow.reservation.id,
                    vesselId: depRow.vessel!.id,
                    vesselName: depRow.vessel!.name,
                    vesselLengthM: depRow.vessel?.lengthM ? parseFloat(depRow.vessel.lengthM) : null,
                    vesselBeamM: depRow.vessel?.beamM ? parseFloat(depRow.vessel.beamM) : null,
                    userName: depRow.user?.name || null,
                    scheduledStart: depRow.reservation.scheduledStart!,
                    scheduledEnd: depRow.reservation.scheduledEnd!,
                    status: depRow.reservation.status,
                } : undefined,
                arrival: arrRow ? {
                    reservationId: arrRow.reservation.id,
                    vesselId: arrRow.vessel!.id,
                    vesselName: arrRow.vessel!.name,
                    vesselLengthM: arrRow.vessel?.lengthM ? parseFloat(arrRow.vessel.lengthM) : null,
                    vesselBeamM: arrRow.vessel?.beamM ? parseFloat(arrRow.vessel.beamM) : null,
                    userName: arrRow.user?.name || null,
                    scheduledStart: arrRow.reservation.scheduledStart!,
                    scheduledEnd: arrRow.reservation.scheduledEnd!,
                    status: arrRow.reservation.status,
                    allocationStatus: "confirmed",
                } : undefined,
                turnaroundLink: {
                    id: link.id,
                    status: link.status as any,
                    bufferMinutes: bufferMin,
                    minimumBufferMinutes: link.minimumBufferMinutes,
                },
                conflict,
            });

            if (depRow) handledDepartureIds.add(depRow.reservation.id);
            if (arrRow) handledArrivalIds.add(arrRow.reservation.id);
        }

        // 2. Preostala spuštanja
        for (const depRow of departures) {
            if (handledDepartureIds.has(depRow.reservation.id)) continue;
            const alloc = allocByResId.get(depRow.reservation.id);
            const spot = alloc ? spotMap.get(alloc.spotId) : undefined;
            const zone = spot ? zoneMap.get(spot.zoneId) : undefined;
            const sortTime = depRow.reservation.scheduledStart!;
            const timeSlot = sortTime.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });

            items.push({
                id: `dep-${depRow.reservation.id}`,
                timeSlot,
                sortTime,
                craneId: depRow.crane?.id,
                craneName: depRow.crane?.name,
                spotId: alloc?.spotId,
                spotCode: spot?.code,
                zoneId: spot?.zoneId,
                zoneCode: zone?.code,
                departure: {
                    reservationId: depRow.reservation.id,
                    vesselId: depRow.vessel!.id,
                    vesselName: depRow.vessel!.name,
                    vesselLengthM: depRow.vessel?.lengthM ? parseFloat(depRow.vessel.lengthM) : null,
                    vesselBeamM: depRow.vessel?.beamM ? parseFloat(depRow.vessel.beamM) : null,
                    userName: depRow.user?.name || null,
                    scheduledStart: depRow.reservation.scheduledStart!,
                    scheduledEnd: depRow.reservation.scheduledEnd!,
                    status: depRow.reservation.status,
                },
            });
        }

        // 3. Preostali dolasci
        for (const arrRow of arrivals) {
            if (handledArrivalIds.has(arrRow.reservation.id)) continue;
            const alloc = allocByResId.get(arrRow.reservation.id);
            const spot = alloc ? spotMap.get(alloc.spotId) : undefined;
            const zone = spot ? zoneMap.get(spot.zoneId) : undefined;
            const sortTime = arrRow.reservation.scheduledStart!;
            const timeSlot = sortTime.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });

            let conflict: { severity: "blocking" | "warning"; code: string; message: string } | undefined = undefined;
            if (!alloc || alloc.status !== "confirmed") {
                conflict = { severity: "warning", code: "UNASSIGNED", message: "Mjesto još nije potvrđeno." };
            }

            items.push({
                id: `arr-${arrRow.reservation.id}`,
                timeSlot,
                sortTime,
                craneId: arrRow.crane?.id,
                craneName: arrRow.crane?.name,
                spotId: alloc?.spotId,
                spotCode: spot?.code,
                zoneId: spot?.zoneId,
                zoneCode: zone?.code,
                arrival: {
                    reservationId: arrRow.reservation.id,
                    vesselId: arrRow.vessel!.id,
                    vesselName: arrRow.vessel!.name,
                    vesselLengthM: arrRow.vessel?.lengthM ? parseFloat(arrRow.vessel.lengthM) : null,
                    vesselBeamM: arrRow.vessel?.beamM ? parseFloat(arrRow.vessel.beamM) : null,
                    userName: arrRow.user?.name || null,
                    scheduledStart: arrRow.reservation.scheduledStart!,
                    scheduledEnd: arrRow.reservation.scheduledEnd!,
                    status: arrRow.reservation.status,
                    allocationStatus: alloc?.status === "confirmed" ? "confirmed" : alloc ? "proposed" : "unassigned",
                },
                conflict,
            });
        }

        // Sortiraj sve po vremenu
        items.sort((a, b) => a.sortTime.getTime() - b.sortTime.getTime());

        // Filtriraj po dizalici ili zoni ako je zadano
        let filteredItems = items;
        if (craneFilterId) {
            filteredItems = filteredItems.filter(i => i.craneId === craneFilterId);
        }
        if (zoneFilterId) {
            filteredItems = filteredItems.filter(i => i.zoneId === zoneFilterId);
        }

        return { date: dateStr, items: filteredItems };
    }

    /**
     * Dohvat mjesta po zoni sa statusom
     */
    async getSpotsByZone(zoneId: string) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const spots = await db.select().from(landSpots).where(eq(landSpots.zoneId, zoneId)).orderBy(asc(landSpots.spotNumber));
        const activeOccupancies = await db.select({
            occupancy: landOccupancies,
            vessel: vessels,
        })
            .from(landOccupancies)
            .leftJoin(vessels, eq(landOccupancies.vesselId, vessels.id))
            .where(
                and(
                    eq(landOccupancies.zoneId, zoneId),
                    isNull(landOccupancies.returnedAt)
                )
            );

        const occBySpotId = new Map(activeOccupancies.filter(o => o.occupancy.spotId).map(o => [o.occupancy.spotId!, o]));
        const occBySpotNum = new Map(activeOccupancies.filter(o => o.occupancy.spotNumber != null).map(o => [o.occupancy.spotNumber!, o]));

        return spots.map(s => {
            const occ = occBySpotId.get(s.id) || occBySpotNum.get(s.spotNumber);
            const daysOnLand = occ?.occupancy.liftedAt
                ? Math.max(1, Math.ceil((Date.now() - new Date(occ.occupancy.liftedAt).getTime()) / (1000 * 60 * 60 * 24)))
                : null;
            return {
                ...s,
                isOccupied: !!occ,
                currentVesselName: occ?.vessel?.name,
                currentVesselReg: occ?.vessel?.registration,
                liftedAt: occ?.occupancy.liftedAt,
                occupancyId: occ?.occupancy.id,
                daysOnLand,
                isTruckDelivery: occ ? (!occ.occupancy.reservationId || !!occ.occupancy.note?.toLowerCase().includes("kamion")) : false,
                occupancyNote: occ?.occupancy.note || null,
            };
        });
    }

    /**
     * Dohvat svih afiniteta dizalica i zona
     */
    async getAllAffinities() {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        return await db.select({
            id: craneZoneAffinities.id,
            craneId: craneZoneAffinities.craneId,
            craneName: cranes.name,
            craneType: cranes.type,
            zoneId: craneZoneAffinities.zoneId,
            zoneName: landZones.name,
            zoneCode: landZones.code,
            affinityScore: craneZoneAffinities.affinityScore,
            extraTransportMinutes: craneZoneAffinities.extraTransportMinutes,
            isPrimary: craneZoneAffinities.isPrimary,
            isBlocked: craneZoneAffinities.isBlocked,
            notes: craneZoneAffinities.notes,
        })
            .from(craneZoneAffinities)
            .innerJoin(cranes, eq(craneZoneAffinities.craneId, cranes.id))
            .innerJoin(landZones, eq(craneZoneAffinities.zoneId, landZones.id))
            .orderBy(asc(cranes.name), desc(craneZoneAffinities.affinityScore));
    }

    /**
     * Postavljanje/ažuriranje afiniteta
     */
    async upsertAffinity(input: {
        craneId: string;
        zoneId: string;
        affinityScore: number;
        extraTransportMinutes: number;
        isPrimary: boolean;
        isBlocked: boolean;
        notes?: string;
    }) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        // Ako se postavlja isPrimary = true, makni isPrimary s bilo koje druge dizalice za tu zonu
        if (input.isPrimary) {
            await db.update(craneZoneAffinities)
                .set({ isPrimary: false })
                .where(and(eq(craneZoneAffinities.zoneId, input.zoneId), sql`crane_id != ${input.craneId}`));
        }

        const [res] = await db.insert(craneZoneAffinities)
            .values({
                craneId: input.craneId,
                zoneId: input.zoneId,
                affinityScore: input.affinityScore,
                extraTransportMinutes: input.extraTransportMinutes,
                isPrimary: input.isPrimary,
                isBlocked: input.isBlocked,
                notes: input.notes,
            })
            .onConflictDoUpdate({
                target: [craneZoneAffinities.craneId, craneZoneAffinities.zoneId],
                set: {
                    affinityScore: input.affinityScore,
                    extraTransportMinutes: input.extraTransportMinutes,
                    isPrimary: input.isPrimary,
                    isBlocked: input.isBlocked,
                    notes: input.notes,
                    updatedAt: new Date(),
                }
            })
            .returning();

        return res;
    }

    /**
     * Pametno rangiranje dostupnih mjesta za plovilo i operaciju
     */
    async recommendSpots(reservationId: string, dateStr: string) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const [resRow] = await db.select({
            reservation: reservations,
            vessel: vessels,
        })
            .from(reservations)
            .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
            .where(eq(reservations.id, reservationId));

        if (!resRow) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });

        const craneId = resRow.reservation.craneId;
        const vessel = resRow.vessel;
        const vLength = vessel?.lengthM ? parseFloat(vessel.lengthM) : 0;
        const vBeam = vessel?.beamM ? parseFloat(vessel.beamM) : 0;
        const vWeight = vessel?.weightTons ? parseFloat(vessel.weightTons) : 0;

        // Dohvati sva aktivna neblokirana mjesta
        const spots = await db.select({
            spot: landSpots,
            zone: landZones,
        })
            .from(landSpots)
            .innerJoin(landZones, eq(landSpots.zoneId, landZones.id))
            .where(and(eq(landSpots.isActive, true), eq(landSpots.isBlocked, false)));

        // Dohvati afinitete za dizalicu
        const affinities = craneId
            ? await db.select().from(craneZoneAffinities).where(eq(craneZoneAffinities.craneId, craneId))
            : [];
        const affByZoneId = new Map(affinities.map(a => [a.zoneId, a]));

        // Rangiraj mjesta
        return spots.map(({ spot, zone }: { spot: typeof landSpots.$inferSelect; zone: typeof landZones.$inferSelect }) => {
            const aff = affByZoneId.get(zone.id);
            const maxL = spot.maxLengthM ? parseFloat(spot.maxLengthM) : 999;
            const maxB = spot.maxBeamM ? parseFloat(spot.maxBeamM) : 999;
            const maxW = spot.maxWeightTons ? parseFloat(spot.maxWeightTons) : 999;

            const fitsDimensions = (vLength <= maxL) && (vBeam <= maxB) && (vWeight <= maxW);
            const isBlockedByCrane = aff?.isBlocked ?? false;
            const score = isBlockedByCrane ? 0 : (aff?.affinityScore ?? 50);

            return {
                spotId: spot.id,
                spotCode: spot.code,
                spotNumber: spot.spotNumber,
                zoneId: zone.id,
                zoneName: zone.name,
                zoneCode: zone.code,
                affinityScore: score,
                isPrimary: aff?.isPrimary ?? false,
                extraTransportMinutes: aff?.extraTransportMinutes ?? 0,
                fitsDimensions,
                isBlockedByCrane,
            };
        }).sort((a: any, b: any) => {
            if (a.fitsDimensions !== b.fitsDimensions) return a.fitsDimensions ? -1 : 1;
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
            return b.affinityScore - a.affinityScore;
        });
    }

    /**
     * Transakcijska alokacija mjesta uz pesimističko zaključavanje
     */
    async allocateSpot(input: {
        spotId: string;
        reservationId: string;
        userId: string;
        overrideReason?: string;
    }) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        return await db.transaction(async (tx) => {
            // 1. Zaključaj red mjesta za provjeru
            const [spot] = await tx.select().from(landSpots).where(eq(landSpots.id, input.spotId)).for("update");
            if (!spot || !spot.isActive) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Mjesto nije aktivno." });
            }
            if (spot.isBlocked && !input.overrideReason) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Mjesto je blokirano. Za dodjelu je potreban override razlog." });
            }

            // 2. Dohvati rezervaciju
            const [res] = await tx.select().from(reservations).where(eq(reservations.id, input.reservationId));
            if (!res || !res.scheduledStart) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Rezervacija nema definiran termin." });
            }

            const plannedFrom = res.scheduledStart;
            const plannedUntil = res.scheduledEnd || new Date(plannedFrom.getTime() + (res.durationMin || 60) * 60000);

            // 3. Provjeri preklapanja s postojećim potvrđenim alokacijama
            const existingOverlaps = await tx.select().from(landSpotAllocations).where(
                and(
                    eq(landSpotAllocations.spotId, input.spotId),
                    inArray(landSpotAllocations.status, ["confirmed", "reserved"]),
                    sql`reservation_id != ${input.reservationId}`,
                    sql`${landSpotAllocations.plannedFrom} < ${plannedUntil.toISOString()}`,
                    sql`COALESCE(${landSpotAllocations.plannedUntil}, ${plannedUntil.toISOString()}) > ${plannedFrom.toISOString()}`
                )
            );

            if (existingOverlaps.length > 0 && !input.overrideReason) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Mjesto je već rezervirano u traženom terminu. Za nastavak je potreban override razlog."
                });
            }

            // 4. Umetni ili ažuriraj alokaciju
            const [allocation] = await tx.insert(landSpotAllocations)
                .values({
                    spotId: input.spotId,
                    vesselId: res.vesselId!,
                    reservationId: input.reservationId,
                    status: "confirmed",
                    plannedFrom,
                    plannedUntil,
                    createdBy: input.userId,
                    overrideReason: input.overrideReason,
                })
                .onConflictDoUpdate({
                    target: [landSpotAllocations.id],
                    set: {
                        spotId: input.spotId,
                        status: "confirmed",
                        plannedFrom,
                        plannedUntil,
                        overrideReason: input.overrideReason,
                        updatedAt: new Date(),
                    }
                })
                .returning();

            await createAuditEntry({
                actorId: input.userId,
                action: "land_spot_allocated",
                entityType: "land_spots",
                entityId: input.spotId,
                payload: { reservationId: input.reservationId, spotCode: spot.code, override: !!input.overrideReason },
            });

            return allocation;
        });
    }

    /**
     * Trajno povezivanje rotacije (spuštanje ⟷ vađenje na istom mjestu)
     */
    async linkTurnaround(input: {
        spotId: string;
        releaseReservationId: string;
        arrivalReservationId: string;
        bufferMinutes: number;
        confirmImmediately: boolean;
        userId: string;
    }) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        return await db.transaction(async (tx) => {
            const [relRes] = await tx.select().from(reservations).where(eq(reservations.id, input.releaseReservationId));
            const [arrRes] = await tx.select().from(reservations).where(eq(reservations.id, input.arrivalReservationId));

            if (!relRes?.scheduledStart || !arrRes?.scheduledStart) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Obje rezervacije moraju imati postavljen termin." });
            }

            const plannedReleaseAt = relRes.scheduledEnd || new Date(relRes.scheduledStart.getTime() + 3600000);
            const plannedOccupyAt = arrRes.scheduledStart;

            const [link] = await tx.insert(landTurnaroundLinks)
                .values({
                    spotId: input.spotId,
                    releaseReservationId: input.releaseReservationId,
                    arrivalReservationId: input.arrivalReservationId,
                    plannedReleaseAt,
                    plannedOccupyAt,
                    minimumBufferMinutes: input.bufferMinutes,
                    status: input.confirmImmediately ? "confirmed" : "proposed",
                    createdBy: input.userId,
                })
                .returning();

            // Ako se odmah potvrđuje, alociraj mjesto i za dolazak
            if (input.confirmImmediately && arrRes.vesselId) {
                await tx.insert(landSpotAllocations).values({
                    spotId: input.spotId,
                    vesselId: arrRes.vesselId,
                    reservationId: input.arrivalReservationId,
                    status: "confirmed",
                    plannedFrom: plannedOccupyAt,
                    plannedUntil: arrRes.scheduledEnd || new Date(plannedOccupyAt.getTime() + 3600000),
                    createdBy: input.userId,
                });
            }

            await createAuditEntry({
                actorId: input.userId,
                action: "land_turnaround_linked",
                entityType: "land_turnaround_links",
                entityId: link.id,
                payload: { spotId: input.spotId, releaseId: input.releaseReservationId, arrivalId: input.arrivalReservationId },
            });

            return link;
        });
    }

    /**
     * Potvrda turnaround linka
     */
    async confirmTurnaround(linkId: string, userId: string) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const [link] = await db.update(landTurnaroundLinks)
            .set({ status: "confirmed" })
            .where(eq(landTurnaroundLinks.id, linkId))
            .returning();

        return link;
    }

    /**
     * Prekid / otkazivanje turnaround linka
     */
    async cancelTurnaround(linkId: string, reason: string, userId: string) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const [link] = await db.update(landTurnaroundLinks)
            .set({
                status: "cancelled",
                cancelledAt: new Date(),
                cancelReason: reason,
            })
            .where(eq(landTurnaroundLinks.id, linkId))
            .returning();

        await createAuditEntry({
            actorId: userId,
            action: "land_turnaround_cancelled",
            entityType: "land_turnaround_links",
            entityId: linkId,
            payload: { reason },
        });

        return link;
    }
}

export const landFlowService = new LandFlowService();
