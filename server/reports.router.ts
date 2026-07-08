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
    maintenanceBlocks
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
                    userOib: reservations.userOib,
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
                    userOib: reservations.userOib,
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
                    userOib: reservations.userOib,
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

    // 🏗️ REP-05: Plovila na kopnu (Suhovezan) (Admin only)
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
});
