import { router, adminProcedure, operatorProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
    reservations,
    users,
    vessels,
    cranes,
    serviceTypes,
    landOccupancies,
    landZones,
    waitingList,
    maintenanceBlocks,
    craneOperationLog
} from "../drizzle/schema";
import { eq, and, gte, lte, or, isNull, ne, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const reportsRouter = router({
    // 📋 REP-01: Plan rada dizalica (Operator & Admin)
    craneSchedule: operatorProcedure
        .input(z.object({
            from: z.string(), // ISO date string (YYYY-MM-DD)
            to: z.string(),   // ISO date string (YYYY-MM-DD)
            craneId: z.string().uuid().optional(),
            status: z.string().optional(), // 'all' or reservation status
            includeMaintenance: z.boolean().default(true),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            const startDate = new Date(input.from);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(input.to);
            endDate.setHours(23, 59, 59, 999);

            // Fetch reservations
            let whereClause = and(
                gte(reservations.scheduledStart, startDate),
                lte(reservations.scheduledStart, endDate)
            );

            if (input.craneId) {
                whereClause = and(whereClause, eq(reservations.craneId, input.craneId));
            }

            if (input.status && input.status !== "all") {
                whereClause = and(whereClause, eq(reservations.status, input.status as any));
            } else {
                // By default, exclude rejected or cancelled if not explicitly requested
                whereClause = and(whereClause, ne(reservations.status, "rejected"), ne(reservations.status, "cancelled"));
            }

            const scheduleData = await db
                .select({
                    id: reservations.id,
                    reservationNumber: reservations.reservationNumber,
                    status: reservations.status,
                    scheduledStart: reservations.scheduledStart,
                    scheduledEnd: reservations.scheduledEnd,
                    durationMin: reservations.durationMin,
                    userOib: sql<string | null>`coalesce(${reservations.userOib}, ${users.oib})`,
                    vesselName: reservations.vesselName,
                    vesselRegistration: reservations.vesselRegistration,
                    userNote: reservations.userNote,
                    adminNote: reservations.adminNote,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    clientEmail: users.email,
                    clientPhone: reservations.contactPhone,
                    craneId: reservations.craneId,
                    craneName: cranes.name,
                    craneType: cranes.type,
                    serviceTypeName: serviceTypes.name,
                })
                .from(reservations)
                .leftJoin(users, eq(reservations.userId, users.id))
                .leftJoin(cranes, eq(reservations.craneId, cranes.id))
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(whereClause)
                .orderBy(asc(reservations.scheduledStart));

            // Fetch maintenance blocks if requested
            let maintenanceData: any[] = [];
            if (input.includeMaintenance) {
                let maintWhere = and(
                    gte(maintenanceBlocks.startAt, startDate),
                    lte(maintenanceBlocks.startAt, endDate)
                );
                if (input.craneId) {
                    maintWhere = and(maintWhere, eq(maintenanceBlocks.craneId, input.craneId));
                }

                maintenanceData = await db
                    .select({
                        id: maintenanceBlocks.id,
                        craneId: maintenanceBlocks.craneId,
                        craneName: cranes.name,
                        startAt: maintenanceBlocks.startAt,
                        endAt: maintenanceBlocks.endAt,
                        reason: maintenanceBlocks.reason,
                    })
                    .from(maintenanceBlocks)
                    .leftJoin(cranes, eq(maintenanceBlocks.craneId, cranes.id))
                    .where(maintWhere)
                    .orderBy(asc(maintenanceBlocks.startAt));
            }

            return {
                reservations: scheduleData,
                maintenance: maintenanceData,
            };
        }),

    // 📊 REP-02: Korištenje dizalica (Admin only)
    craneUtilization: adminProcedure
        .input(z.object({
            from: z.string(),
            to: z.string(),
            craneId: z.string().uuid().optional(),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            const startDate = new Date(input.from);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(input.to);
            endDate.setHours(23, 59, 59, 999);

            let whereClause = and(
                eq(reservations.status, "completed"),
                gte(reservations.scheduledStart, startDate),
                lte(reservations.scheduledStart, endDate)
            );

            if (input.craneId) {
                whereClause = and(whereClause, eq(reservations.craneId, input.craneId));
            }

            const data = await db
                .select({
                    id: reservations.id,
                    reservationNumber: reservations.reservationNumber,
                    scheduledStart: reservations.scheduledStart,
                    durationMin: reservations.durationMin,
                    userOib: sql<string | null>`coalesce(${reservations.userOib}, ${users.oib})`,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    vesselRegistration: reservations.vesselRegistration,
                    serviceTypeName: serviceTypes.name,
                    craneId: reservations.craneId,
                    craneName: cranes.name,
                })
                .from(reservations)
                .leftJoin(users, eq(reservations.userId, users.id))
                .leftJoin(cranes, eq(reservations.craneId, cranes.id))
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(whereClause)
                .orderBy(asc(reservations.scheduledStart));

            // Agregacija po dizalici za summary
            const summaries = await db
                .select({
                    craneId: reservations.craneId,
                    craneName: cranes.name,
                    totalOperations: sql<number>`count(${reservations.id})::int`,
                    totalMinutes: sql<number>`sum(${reservations.durationMin})::int`,
                    avgMinutes: sql<number>`round(avg(${reservations.durationMin}))::int`,
                })
                .from(reservations)
                .leftJoin(cranes, eq(reservations.craneId, cranes.id))
                .where(whereClause)
                .groupBy(reservations.craneId, cranes.name);

            return {
                details: data,
                summaries,
            };
        }),

    // 👥 REP-03: Analitika po korisnicima (Admin only)
    userActivity: adminProcedure
        .input(z.object({
            from: z.string(),
            to: z.string(),
            oib: z.string().optional(),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            const startDate = new Date(input.from);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(input.to);
            endDate.setHours(23, 59, 59, 999);

            let whereClause = and(
                gte(reservations.createdAt, startDate),
                lte(reservations.createdAt, endDate)
            );

            if (input.oib && input.oib.trim() !== "") {
                whereClause = and(whereClause, eq(users.oib, input.oib.trim()));
            }

            // Agregatni podaci za klijente
            const userSummaries = await db
                .select({
                    userId: users.id,
                    oib: users.oib,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    email: users.email,
                    totalRequests: sql<number>`count(${reservations.id})::int`,
                    approvedRequests: sql<number>`sum(case when ${reservations.status} = 'approved' then 1 else 0 end)::int`,
                    completedRequests: sql<number>`sum(case when ${reservations.status} = 'completed' then 1 else 0 end)::int`,
                    cancelledRequests: sql<number>`sum(case when ${reservations.status} = 'cancelled' then 1 else 0 end)::int`,
                    totalMinutes: sql<number>`sum(case when ${reservations.status} = 'completed' then ${reservations.durationMin} else 0 end)::int`,
                })
                .from(reservations)
                .innerJoin(users, eq(reservations.userId, users.id))
                .where(whereClause)
                .groupBy(users.id, users.oib, users.firstName, users.lastName, users.email)
                .orderBy(asc(users.lastName), asc(users.firstName));

            // Detaljne rezervacije u periodu za odabrane klijente
            const details = await db
                .select({
                    id: reservations.id,
                    userId: reservations.userId,
                    reservationNumber: reservations.reservationNumber,
                    status: reservations.status,
                    vesselRegistration: reservations.vesselRegistration,
                    vesselName: reservations.vesselName,
                    serviceTypeName: serviceTypes.name,
                    craneName: cranes.name,
                    scheduledStart: reservations.scheduledStart,
                    durationMin: reservations.durationMin,
                })
                .from(reservations)
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .leftJoin(cranes, eq(reservations.craneId, cranes.id))
                .where(whereClause)
                .orderBy(desc(reservations.scheduledStart));

            return {
                summaries: userSummaries,
                details,
            };
        }),

    // 🔧 REP-04: Analitika po tipovima operacija (Admin only)
    operationTypes: adminProcedure
        .input(z.object({
            from: z.string(),
            to: z.string(),
            serviceTypeId: z.string().uuid().optional(),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            const startDate = new Date(input.from);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(input.to);
            endDate.setHours(23, 59, 59, 999);

            let whereClause = and(
                gte(reservations.scheduledStart, startDate),
                lte(reservations.scheduledStart, endDate),
                eq(reservations.status, "completed")
            );

            if (input.serviceTypeId) {
                whereClause = and(whereClause, eq(reservations.serviceTypeId, input.serviceTypeId));
            }

            const details = await db
                .select({
                    id: reservations.id,
                    reservationNumber: reservations.reservationNumber,
                    scheduledStart: reservations.scheduledStart,
                    durationMin: reservations.durationMin,
                    userOib: sql<string | null>`coalesce(${reservations.userOib}, ${users.oib})`,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    vesselRegistration: reservations.vesselRegistration,
                    serviceTypeName: serviceTypes.name,
                    craneName: cranes.name,
                })
                .from(reservations)
                .leftJoin(users, eq(reservations.userId, users.id))
                .leftJoin(cranes, eq(reservations.craneId, cranes.id))
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(whereClause)
                .orderBy(asc(reservations.scheduledStart));

            const summaries = await db
                .select({
                    serviceTypeId: reservations.serviceTypeId,
                    serviceTypeName: serviceTypes.name,
                    count: sql<number>`count(${reservations.id})::int`,
                    totalMinutes: sql<number>`sum(${reservations.durationMin})::int`,
                    avgMinutes: sql<number>`round(avg(${reservations.durationMin}))::int`,
                })
                .from(reservations)
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(whereClause)
                .groupBy(reservations.serviceTypeId, serviceTypes.name);

            return {
                details,
                summaries,
            };
        }),

    // 🏗️ REP-05: Plovila na kopnu (Admin only)
    landOccupancy: adminProcedure
        .input(z.object({
            status: z.enum(["active", "history", "all"]).default("all"),
            from: z.string().optional(),
            to: z.string().optional(),
            zoneId: z.string().uuid().optional(),
            oib: z.string().optional(),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            let whereClause: any = undefined;

            if (input.status === "active") {
                whereClause = isNull(landOccupancies.returnedAt);
            } else if (input.status === "history") {
                whereClause = sql`${landOccupancies.returnedAt} IS NOT NULL`;
            }

            if (input.from && input.to) {
                const startDate = new Date(input.from);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(input.to);
                endDate.setHours(23, 59, 59, 999);

                const dateFilter = or(
                    and(gte(landOccupancies.liftedAt, startDate), lte(landOccupancies.liftedAt, endDate)),
                    and(gte(landOccupancies.returnedAt, startDate), lte(landOccupancies.returnedAt, endDate))
                );
                whereClause = whereClause ? and(whereClause, dateFilter) : dateFilter;
            }

            if (input.zoneId) {
                whereClause = whereClause ? and(whereClause, eq(landOccupancies.zoneId, input.zoneId)) : eq(landOccupancies.zoneId, input.zoneId);
            }

            if (input.oib && input.oib.trim() !== "") {
                whereClause = whereClause ? and(whereClause, eq(users.oib, input.oib.trim())) : eq(users.oib, input.oib.trim());
            }

            const data = await db
                .select({
                    id: landOccupancies.id,
                    liftedAt: landOccupancies.liftedAt,
                    returnedAt: landOccupancies.returnedAt,
                    spotNumber: landOccupancies.spotNumber,
                    note: landOccupancies.note,
                    clientOib: users.oib,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselType: vessels.type,
                    zoneName: landZones.name,
                    hasLaunchReservation: sql<boolean>`EXISTS (
                        SELECT 1 FROM ${reservations} r 
                        JOIN ${serviceTypes} st ON r.service_type_id = st.id
                        WHERE r.vessel_id = ${landOccupancies.vesselId} 
                          AND st.operation_category = 'lower_to_sea'
                          AND r.status IN ('pending', 'approved')
                    )`,
                })
                .from(landOccupancies)
                .leftJoin(vessels, eq(landOccupancies.vesselId, vessels.id))
                .leftJoin(users, eq(landOccupancies.userId, users.id))
                .leftJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
                .where(whereClause)
                .orderBy(desc(landOccupancies.liftedAt));

            return data;
        }),

    // 📑 REP-06: Pregled liste čekanja (Admin only)
    waitingList: adminProcedure
        .input(z.object({
            status: z.string().optional(),
            craneId: z.string().uuid().optional(),
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            let whereClause: any = undefined;

            if (input.status && input.status !== "all") {
                whereClause = eq(waitingList.status, input.status as any);
            }

            if (input.craneId) {
                whereClause = whereClause ? and(whereClause, eq(waitingList.craneId, input.craneId)) : eq(waitingList.craneId, input.craneId);
            }

            const data = await db
                .select({
                    id: waitingList.id,
                    position: waitingList.position,
                    status: waitingList.status,
                    requestedDate: waitingList.requestedDate,
                    createdAt: waitingList.createdAt,
                    clientOib: users.oib,
                    clientName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    serviceTypeName: serviceTypes.name,
                    craneName: cranes.name,
                })
                .from(waitingList)
                .leftJoin(users, eq(waitingList.userId, users.id))
                .leftJoin(vessels, eq(waitingList.vesselId, vessels.id))
                .leftJoin(serviceTypes, eq(waitingList.serviceTypeId, serviceTypes.id))
                .leftJoin(cranes, eq(waitingList.craneId, cranes.id))
                .where(whereClause)
                .orderBy(asc(waitingList.position), desc(waitingList.createdAt));

            return data;
        }),

    // 📑 REP-07: Mjesečni Dnevnik rada pojedinačne dizalice (Operator & Admin)
    craneLog: operatorProcedure
        .input(z.object({
            craneId: z.string().uuid(),
            from: z.string(), // ISO date string YYYY-MM-DD
            to: z.string(),   // ISO date string YYYY-MM-DD
        }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza podataka nije dostupna." });

            const startDate = new Date(input.from);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(input.to);
            endDate.setHours(23, 59, 59, 999);

            // Fetch crane info
            const craneRes = await db.select().from(cranes).where(eq(cranes.id, input.craneId)).limit(1);
            if (!craneRes[0]) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Dizalica nije pronađena." });
            }
            const craneInfo = craneRes[0];

            // Fetch crane operation log entries for this crane in timeframe
            const opLogs = await db
                .select({
                    id: craneOperationLog.id,
                    operationType: craneOperationLog.operationType,
                    startTime: craneOperationLog.startTime,
                    endTime: craneOperationLog.endTime,
                    durationMinutes: craneOperationLog.durationMinutes,
                    note: craneOperationLog.note,
                    reservationId: craneOperationLog.reservationId,
                    operatorId: craneOperationLog.operatorId,
                    operatorName: users.name,
                    vesselName: reservations.vesselName,
                    vesselRegistration: reservations.vesselRegistration,
                    clientName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.name})`,
                    clientOib: sql<string | null>`coalesce(${reservations.userOib}, ${users.oib})`,
                    serviceTypeName: serviceTypes.name,
                })
                .from(craneOperationLog)
                .leftJoin(users, eq(craneOperationLog.operatorId, users.id))
                .leftJoin(reservations, eq(craneOperationLog.reservationId, reservations.id))
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(and(
                    eq(craneOperationLog.craneId, input.craneId),
                    gte(craneOperationLog.startTime, startDate),
                    lte(craneOperationLog.startTime, endDate)
                ))
                .orderBy(asc(craneOperationLog.startTime));

            // Also fetch completed/approved reservations for this crane in timeframe that might not have a manual op log
            const resData = await db
                .select({
                    id: reservations.id,
                    scheduledStart: reservations.scheduledStart,
                    scheduledEnd: reservations.scheduledEnd,
                    durationMin: reservations.durationMin,
                    vesselName: reservations.vesselName,
                    vesselRegistration: reservations.vesselRegistration,
                    userOib: sql<string | null>`coalesce(${reservations.userOib}, ${users.oib})`,
                    clientName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.name})`,
                    serviceTypeName: serviceTypes.name,
                    serviceCategory: serviceTypes.operationCategory,
                    userNote: reservations.userNote,
                    adminNote: reservations.adminNote,
                    isMaintenance: reservations.isMaintenance,
                    contactPhone: reservations.contactPhone,
                    status: reservations.status,
                })
                .from(reservations)
                .leftJoin(users, eq(reservations.userId, users.id))
                .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
                .where(and(
                    eq(reservations.craneId, input.craneId),
                    gte(reservations.scheduledStart, startDate),
                    lte(reservations.scheduledStart, endDate),
                    ne(reservations.status, "rejected"),
                    ne(reservations.status, "cancelled")
                ))
                .orderBy(asc(reservations.scheduledStart));

            // Combine and format entries seamlessly
            const existingLogResIds = new Set(opLogs.map(l => l.reservationId).filter(Boolean));

            const formattedEntries: Array<{
                id: string;
                startTime: Date;
                endTime: Date;
                durationMinutes: number;
                operationType: string;
                operationCategory?: string;
                vesselName: string;
                vesselRegistration: string;
                clientName: string;
                clientOib: string;
                operatorName: string;
                note: string;
                isMaintenance?: boolean;
            }> = [];

            for (const log of opLogs) {
                formattedEntries.push({
                    id: log.id,
                    startTime: log.startTime,
                    endTime: log.endTime,
                    durationMinutes: log.durationMinutes || Math.max(1, Math.round((log.endTime.getTime() - log.startTime.getTime()) / 60000)),
                    operationType: log.serviceTypeName || (log.operationType === "lift" ? "Dizanje iz mora" : log.operationType === "lower" ? "Spuštanje u more" : log.operationType === "move" ? "Premještanje" : "Održavanje"),
                    vesselName: log.vesselName || "—",
                    vesselRegistration: log.vesselRegistration || "—",
                    clientName: log.clientName || "Nepoznato",
                    clientOib: log.clientOib || "—",
                    operatorName: log.operatorName || "Operater",
                    note: log.note || "",
                });
            }

            for (const res of resData) {
                if (res.id && !existingLogResIds.has(res.id)) {
                    const start = res.scheduledStart ? new Date(res.scheduledStart) : startDate;
                    const end = res.scheduledEnd ? new Date(res.scheduledEnd) : new Date(start.getTime() + (res.durationMin || 60) * 60000);
                    formattedEntries.push({
                        id: res.id,
                        startTime: start,
                        endTime: end,
                        durationMinutes: res.durationMin || Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
                        operationType: res.isMaintenance ? "Održavanje dizalice" : (res.serviceTypeName || "Operacija dizalice"),
                        operationCategory: res.serviceCategory || undefined,
                        vesselName: res.vesselName || "—",
                        vesselRegistration: res.vesselRegistration || "—",
                        clientName: res.clientName || "—",
                        clientOib: res.userOib || "—",
                        operatorName: "Operater dizalice",
                        note: res.adminNote || res.userNote || "",
                        isMaintenance: res.isMaintenance || false,
                    });
                }
            }

            // Sort chronologically
            formattedEntries.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

            // Summary metrics
            const totalOperations = formattedEntries.length;
            const totalDurationMinutes = formattedEntries.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
            const totalHours = Number((totalDurationMinutes / 60).toFixed(1));

            const liftsCount = formattedEntries.filter(e => e.operationType.toLowerCase().includes("dizanje") || e.operationType.toLowerCase().includes("vađenje") || e.operationCategory === "lift_from_sea").length;
            const lowersCount = formattedEntries.filter(e => e.operationType.toLowerCase().includes("spuštanje") || e.operationCategory === "lower_to_sea").length;
            const movesCount = formattedEntries.filter(e => e.operationType.toLowerCase().includes("premještanje") || e.operationCategory === "move").length;
            const maintenanceCount = formattedEntries.filter(e => e.isMaintenance || e.operationType.toLowerCase().includes("održavanje") || e.operationCategory === "maintenance").length;

            return {
                craneInfo,
                period: { from: input.from, to: input.to },
                entries: formattedEntries,
                summary: {
                    totalOperations,
                    totalDurationMinutes,
                    totalHours,
                    liftsCount,
                    lowersCount,
                    movesCount,
                    maintenanceCount,
                }
            };
        }),

    // ─── Dnevnik Radnih Naloga (Work Orders Ledger) ─────────────────────
    workOrdersLedger: operatorProcedure
        .input(
            z.object({
                from: z.string().optional(),
                to: z.string().optional(),
                clientType: z.enum(["member", "external"]).optional(),
                status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
                craneId: z.string().uuid().optional(),
            })
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const { workOrders, users, vessels, cranes } = await import("../drizzle/schema");

            let query = db
                .select({
                    id: workOrders.id,
                    orderNumber: workOrders.orderNumber,
                    startedAt: workOrders.startedAt,
                    completedAt: workOrders.completedAt,
                    status: workOrders.status,
                    clientType: workOrders.clientType,
                    isStatutoryCovered: workOrders.isStatutoryCovered,
                    chargeItemCode: workOrders.chargeItemCode,
                    chargeItemName: workOrders.chargeItemName,
                    vesselLengthM: workOrders.vesselLengthM,
                    commercialTotal: workOrders.commercialTotal,
                    actualDurationMin: workOrders.actualDurationMin,
                    operatorNotes: workOrders.operatorNotes,
                    erpSyncStatus: workOrders.erpSyncStatus,
                    userName: users.name,
                    userOib: users.oib,
                    userEmail: users.email,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    craneName: cranes.name,
                })
                .from(workOrders)
                .leftJoin(users, eq(workOrders.userId, users.id))
                .leftJoin(vessels, eq(workOrders.vesselId, vessels.id))
                .leftJoin(cranes, eq(workOrders.craneId, cranes.id))
                .orderBy(desc(workOrders.startedAt));

            const conditions = [];
            if (input.from) conditions.push(gte(workOrders.startedAt, new Date(input.from)));
            if (input.to) conditions.push(lte(workOrders.startedAt, new Date(input.to)));
            if (input.clientType) conditions.push(eq(workOrders.clientType, input.clientType));
            if (input.status) conditions.push(eq(workOrders.status, input.status));
            if (input.craneId) conditions.push(eq(workOrders.craneId, input.craneId));

            const results = conditions.length > 0 ? await query.where(and(...conditions)) : await query;

            const totalOrders = results.length;
            const completedCount = results.filter(r => r.status === "completed").length;
            const statutoryCount = results.filter(r => r.isStatutoryCovered).length;
            const feeAdjustmentsCount = results.filter(r => r.chargeItemCode !== null).length;
            const commercialCount = results.filter(r => r.clientType === "external").length;
            const totalCommercialBilledEur = results
                .filter(r => r.commercialTotal)
                .reduce((acc, curr) => acc + Number(curr.commercialTotal || 0), 0);

            return {
                period: { from: input.from || null, to: input.to || null },
                orders: results,
                summary: {
                    totalOrders,
                    completedCount,
                    statutoryCount,
                    feeAdjustmentsCount,
                    commercialCount,
                    totalCommercialBilledEur: Number(totalCommercialBilledEur.toFixed(2)),
                },
            };
        }),

    // ─── Godišnji Izvještaj Zaduženja Članarina za Desktop ERP ─────────
    memberFeeAdjustments: operatorProcedure
        .input(
            z.object({
                year: z.number().int().default(new Date().getFullYear()),
            })
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const { userCardEntries, users, workOrders } = await import("../drizzle/schema");

            const fromDate = new Date(input.year, 0, 1, 0, 0, 0);
            const toDate = new Date(input.year, 11, 31, 23, 59, 59);

            const entries = await db
                .select({
                    id: userCardEntries.id,
                    userId: userCardEntries.userId,
                    userName: users.name,
                    userFirstName: users.firstName,
                    userLastName: users.lastName,
                    userOib: users.oib,
                    userEmail: users.email,
                    userPhone: users.phone,
                    serviceItemCode: userCardEntries.serviceItemCode,
                    serviceItemName: userCardEntries.serviceItemName,
                    vesselName: userCardEntries.vesselName,
                    vesselRegistration: userCardEntries.vesselRegistration,
                    eventDate: userCardEntries.eventDate,
                    note: userCardEntries.note,
                    erpStatus: userCardEntries.erpStatus,
                    workOrderId: userCardEntries.workOrderId,
                })
                .from(userCardEntries)
                .innerJoin(users, eq(userCardEntries.userId, users.id))
                .where(
                    and(
                        eq(userCardEntries.entryType, "fee_adjustment_charge"),
                        gte(userCardEntries.eventDate, fromDate),
                        lte(userCardEntries.eventDate, toDate)
                    )
                )
                .orderBy(asc(users.name), desc(userCardEntries.eventDate));

            return {
                year: input.year,
                totalAdjustments: entries.length,
                entries,
            };
        }),
});
