/**
 * PŠD Špinut — Akvatorij & Berths tRPC Router
 * Upravljanje gatovima, morskim vezovima, dodjelama i statusima u akvatoriju lučice
 */
import { z } from "zod";
import { eq, sql, and, desc, or, ilike } from "drizzle-orm";
import { getDb } from "./db";
import {
    piers,
    berths,
    berthAssignments,
    vessels,
    users,
    clubs,
    landZones,
    landOccupancies,
} from "../drizzle/schema";
import {
    router,
    operatorProcedure,
    adminProcedure,
    protectedProcedure,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";

export const berthsRouter = router({
    /**
     * Dohvat svih gatova i cjelina s brojačima kapaciteta i popunjenosti
     */
    listPiers: operatorProcedure.query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

        const allPiers = await db
            .select()
            .from(piers)
            .where(eq(piers.isActive, true))
            .orderBy(piers.sortOrder);

        // Agregacija statusa vezova po gatovima
        const berthStats = await db
            .select({
                pierId: berths.pierId,
                status: berths.status,
                count: sql<number>`count(*)::int`,
            })
            .from(berths)
            .groupBy(berths.pierId, berths.status);

        const statsMap = new Map<string, Record<string, number>>();
        for (const stat of berthStats) {
            if (!statsMap.has(stat.pierId)) {
                statsMap.set(stat.pierId, {
                    vacant: 0,
                    occupied: 0,
                    transit: 0,
                    debt_block: 0,
                    maintenance: 0,
                    reserved: 0,
                    total: 0,
                });
            }
            const pStats = statsMap.get(stat.pierId)!;
            pStats[stat.status] = stat.count;
            pStats.total += stat.count;
        }

        return allPiers.map((pier) => {
            const stats = statsMap.get(pier.id) || {
                vacant: pier.totalBerths,
                occupied: 0,
                transit: 0,
                debt_block: 0,
                maintenance: 0,
                reserved: 0,
                total: pier.totalBerths,
            };
            return {
                ...pier,
                stats,
            };
        });
    }),

    /**
     * Dohvat kompletnih podataka akvatorija za interaktivni tlocrt (svi gatovi + svi vezovi s dodjelama)
     */
    getAkvatorijMapData: operatorProcedure
        .input(
            z.object({
                pierCode: z.string().optional(),
                statusFilter: z.string().optional(),
            }).optional()
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            // 1. Dohvati gatove
            let piersQuery = db.select().from(piers).where(eq(piers.isActive, true)).orderBy(piers.sortOrder);
            const allPiers = await piersQuery;

            // 2. Dohvati sve vezove s povezanim aktivnim dodjelama, plovilima i vlasnicima
            const allBerthsData = await db
                .select({
                    id: berths.id,
                    pierId: berths.pierId,
                    code: berths.code,
                    berthNumber: berths.berthNumber,
                    side: berths.side,
                    maxLoaM: berths.maxLoaM,
                    maxBeamM: berths.maxBeamM,
                    maxDraftM: berths.maxDraftM,
                    status: berths.status,
                    hasElectricity: berths.hasElectricity,
                    hasWater: berths.hasWater,
                    electricityMeterCode: berths.electricityMeterCode,
                    waterMeterCode: berths.waterMeterCode,
                    notes: berths.notes,
                    sortOrder: berths.sortOrder,
                    // Dodjela
                    assignmentId: berthAssignments.id,
                    assignmentType: berthAssignments.assignmentType,
                    contractNumber: berthAssignments.contractNumber,
                    assignmentStartDate: berthAssignments.startDate,
                    // Plovilo
                    vesselId: vessels.id,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselType: vessels.type,
                    vesselLengthM: vessels.lengthM,
                    vesselBeamM: vessels.beamM,
                    vesselDraftM: vessels.draftM,
                    // Vlasnik / Član
                    userId: users.id,
                    userName: users.name,
                    userFirstName: users.firstName,
                    userLastName: users.lastName,
                    userEmail: users.email,
                    userPhone: users.phone,
                    userOib: users.oib,
                })
                .from(berths)
                .leftJoin(
                    berthAssignments,
                    and(
                        eq(berthAssignments.berthId, berths.id),
                        eq(berthAssignments.isActive, true)
                    )
                )
                .leftJoin(vessels, eq(berthAssignments.vesselId, vessels.id))
                .leftJoin(users, eq(berthAssignments.userId, users.id))
                .orderBy(berths.sortOrder, berths.berthNumber);

            // Grupiraj vezove po pierId
            const berthsByPier = new Map<string, typeof allBerthsData>();
            for (const b of allBerthsData) {
                if (!berthsByPier.has(b.pierId)) {
                    berthsByPier.set(b.pierId, []);
                }
                berthsByPier.get(b.pierId)!.push(b);
            }

            // Izračunaj globalne statistike akvatorija
            const globalStats = {
                totalBerths: allBerthsData.length,
                vacant: allBerthsData.filter((b) => b.status === "vacant").length,
                occupied: allBerthsData.filter((b) => b.status === "occupied").length,
                transit: allBerthsData.filter((b) => b.status === "transit").length,
                debtBlock: allBerthsData.filter((b) => b.status === "debt_block").length,
                maintenance: allBerthsData.filter((b) => b.status === "maintenance").length,
                reserved: allBerthsData.filter((b) => b.status === "reserved").length,
            };

            return {
                piers: allPiers.map((p) => ({
                    ...p,
                    berths: berthsByPier.get(p.id) || [],
                })),
                stats: globalStats,
            };
        }),

    /**
     * Detaljan uvid u pojedini vez s poviješću dodjela
     */
    getBerthDetails: operatorProcedure
        .input(z.object({ berthId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [berth] = await db
                .select({
                    id: berths.id,
                    pierId: berths.pierId,
                    code: berths.code,
                    berthNumber: berths.berthNumber,
                    side: berths.side,
                    maxLoaM: berths.maxLoaM,
                    maxBeamM: berths.maxBeamM,
                    maxDraftM: berths.maxDraftM,
                    status: berths.status,
                    hasElectricity: berths.hasElectricity,
                    hasWater: berths.hasWater,
                    electricityMeterCode: berths.electricityMeterCode,
                    waterMeterCode: berths.waterMeterCode,
                    notes: berths.notes,
                    pierName: piers.name,
                    pierCode: piers.code,
                    pierType: piers.pierType,
                })
                .from(berths)
                .innerJoin(piers, eq(berths.pierId, piers.id))
                .where(eq(berths.id, input.berthId))
                .limit(1);

            if (!berth) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Vez nije pronađen" });
            }

            // Povijest dodjela za ovaj vez
            const assignmentsHistory = await db
                .select({
                    id: berthAssignments.id,
                    assignmentType: berthAssignments.assignmentType,
                    contractNumber: berthAssignments.contractNumber,
                    startDate: berthAssignments.startDate,
                    endDate: berthAssignments.endDate,
                    isActive: berthAssignments.isActive,
                    notes: berthAssignments.notes,
                    vesselId: vessels.id,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselLengthM: vessels.lengthM,
                    vesselBeamM: vessels.beamM,
                    vesselType: vessels.type,
                    userId: users.id,
                    userName: users.name,
                    userFirstName: users.firstName,
                    userLastName: users.lastName,
                    userEmail: users.email,
                    userPhone: users.phone,
                    userOib: users.oib,
                })
                .from(berthAssignments)
                .innerJoin(vessels, eq(berthAssignments.vesselId, vessels.id))
                .innerJoin(users, eq(berthAssignments.userId, users.id))
                .where(eq(berthAssignments.berthId, input.berthId))
                .orderBy(desc(berthAssignments.startDate));

            const activeAssignment = assignmentsHistory.find((a) => a.isActive) || null;

            return {
                berth,
                activeAssignment,
                history: assignmentsHistory,
            };
        }),

    /**
     * Promjena statusa veza (npr. u servis, dugovanje, slobodan)
     */
    updateStatus: operatorProcedure
        .input(
            z.object({
                berthId: z.string().uuid(),
                status: z.enum(["vacant", "occupied", "transit", "debt_block", "maintenance", "reserved"]),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [updated] = await db
                .update(berths)
                .set({
                    status: input.status,
                    ...(input.notes !== undefined ? { notes: input.notes } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(berths.id, input.berthId))
                .returning();

            return updated;
        }),

    /**
     * Provjera nalazi li se plovilo već na nekom vezu
     */
    checkVesselBerth: operatorProcedure
        .input(z.object({ vesselId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [existing] = await db
                .select({
                    assignmentId: berthAssignments.id,
                    berthId: berthAssignments.berthId,
                    berthCode: berths.code,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                })
                .from(berthAssignments)
                .innerJoin(berths, eq(berthAssignments.berthId, berths.id))
                .innerJoin(vessels, eq(berthAssignments.vesselId, vessels.id))
                .where(and(eq(berthAssignments.vesselId, input.vesselId), eq(berthAssignments.isActive, true)))
                .limit(1);

            return existing || null;
        }),

    /**
     * Dodjela plovila i člana na vez (s provjerom premještanja)
     */
    assignVessel: operatorProcedure
        .input(
            z.object({
                berthId: z.string().uuid(),
                vesselId: z.string().uuid(),
                userId: z.string().uuid(),
                assignmentType: z.enum(["permanent_member", "transit_guest", "club_service", "temporary_relocation"]).default("permanent_member"),
                contractNumber: z.string().optional(),
                startDate: z.date().optional(),
                notes: z.string().optional(),
                forceRelocate: z.boolean().optional().default(false),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            // 1. Provjeri nalazi li se plovilo već na nekom drugom vezu
            const existingVesselAssignment = await db
                .select({
                    assignmentId: berthAssignments.id,
                    berthId: berthAssignments.berthId,
                    berthCode: berths.code,
                })
                .from(berthAssignments)
                .innerJoin(berths, eq(berthAssignments.berthId, berths.id))
                .where(and(eq(berthAssignments.vesselId, input.vesselId), eq(berthAssignments.isActive, true)))
                .limit(1);

            if (existingVesselAssignment.length > 0 && existingVesselAssignment[0].berthId !== input.berthId) {
                if (!input.forceRelocate) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: `Plovilo se već nalazi na vezu ${existingVesselAssignment[0].berthCode}.`,
                    });
                }

                // Ako je potvrđeno premještanje: oslobodi stari vez
                await db
                    .update(berths)
                    .set({ status: "vacant", updatedAt: new Date() })
                    .where(eq(berths.id, existingVesselAssignment[0].berthId));

                await db
                    .update(berthAssignments)
                    .set({
                        isActive: false,
                        endDate: new Date(),
                        notes: `Automatski premješteno na novi vez (${input.notes || ""})`.trim(),
                        updatedAt: new Date(),
                    })
                    .where(eq(berthAssignments.id, existingVesselAssignment[0].assignmentId));
            }

            // 2. Deaktiviraj prethodne aktivne dodjele za ciljani novi vez
            await db
                .update(berthAssignments)
                .set({ isActive: false, endDate: new Date(), updatedAt: new Date() })
                .where(and(eq(berthAssignments.berthId, input.berthId), eq(berthAssignments.isActive, true)));

            // 3. Kreiraj novu aktivnu dodjelu
            const [assignment] = await db
                .insert(berthAssignments)
                .values({
                    berthId: input.berthId,
                    vesselId: input.vesselId,
                    userId: input.userId,
                    assignmentType: input.assignmentType,
                    contractNumber: input.contractNumber,
                    startDate: input.startDate || new Date(),
                    isActive: true,
                    assignedBy: ctx.user.id,
                    notes: input.notes,
                })
                .returning();

            // 4. Ažuriraj status novog veza
            const newStatus = input.assignmentType === "transit_guest" ? "transit" : "occupied";
            await db
                .update(berths)
                .set({ status: newStatus, updatedAt: new Date() })
                .where(eq(berths.id, input.berthId));

            return assignment;
        }),

    /**
     * Oslobađanje veza (završetak dodjele)
     */
    unassignVessel: operatorProcedure
        .input(
            z.object({
                berthId: z.string().uuid(),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            await db
                .update(berthAssignments)
                .set({
                    isActive: false,
                    endDate: new Date(),
                    notes: input.notes,
                    updatedAt: new Date(),
                })
                .where(and(eq(berthAssignments.berthId, input.berthId), eq(berthAssignments.isActive, true)));

            const [updatedBerth] = await db
                .update(berths)
                .set({ status: "vacant", updatedAt: new Date() })
                .where(eq(berths.id, input.berthId))
                .returning();

            return updatedBerth;
        }),

    /**
     * Brza pretraga vezova, brodova i članova u akvatoriju
     */
    searchAkvatorij: operatorProcedure
        .input(z.object({ query: z.string().min(1) }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const term = `%${input.query.trim()}%`;

            const results = await db
                .select({
                    berthId: berths.id,
                    berthCode: berths.code,
                    berthNumber: berths.berthNumber,
                    pierCode: piers.code,
                    pierName: piers.name,
                    status: berths.status,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselLengthM: vessels.lengthM,
                    userName: users.name,
                    userFirstName: users.firstName,
                    userLastName: users.lastName,
                    userOib: users.oib,
                })
                .from(berths)
                .innerJoin(piers, eq(berths.pierId, piers.id))
                .leftJoin(
                    berthAssignments,
                    and(eq(berthAssignments.berthId, berths.id), eq(berthAssignments.isActive, true))
                )
                .leftJoin(vessels, eq(berthAssignments.vesselId, vessels.id))
                .leftJoin(users, eq(berthAssignments.userId, users.id))
                .where(
                    or(
                        ilike(berths.code, term),
                        ilike(vessels.name, term),
                        ilike(vessels.registration, term),
                        ilike(users.name, term),
                        ilike(users.firstName, term),
                        ilike(users.lastName, term),
                        ilike(users.oib, term)
                    )
                )
                .limit(20);

            return results;
        }),

    /**
     * Popis dostupnih plovila i članova za dodjelu na vez
     */
    listAssignableVessels: operatorProcedure
        .input(z.object({ search: z.string().optional() }).optional())
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const searchTerm = input?.search ? `%${input.search.trim()}%` : null;

            const list = await db
                .select({
                    vesselId: vessels.id,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselType: vessels.type,
                    vesselLengthM: vessels.lengthM,
                    vesselBeamM: vessels.beamM,
                    vesselDraftM: vessels.draftM,
                    ownerId: users.id,
                    ownerName: users.name,
                    ownerFirstName: users.firstName,
                    ownerLastName: users.lastName,
                    ownerOib: users.oib,
                    ownerPhone: users.phone,
                })
                .from(vessels)
                .innerJoin(users, eq(vessels.ownerId, users.id))
                .where(
                    searchTerm
                        ? or(
                              ilike(vessels.name, searchTerm),
                              ilike(vessels.registration, searchTerm),
                              ilike(users.name, searchTerm),
                              ilike(users.oib, searchTerm)
                          )
                        : undefined
                )
                .limit(50);

            return list;
        }),
});
