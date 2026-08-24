/**
 * Member Sync — tRPC Router
 * Admin API za upravljanje i pregled sinkronizacije članova
 */
import { router, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
    users,
    vessels,
    memberLinks,
    memberMemberships,
    syncRuns,
    syncConflicts,
    berthAssignments,
    landOccupancies,
    landWaitingList,
    waitingList,
    workOrders,
    reservations,
    userCardEntries,
    memberStatutoryRights,
} from "../../drizzle/schema";
import { eq, desc, and, sql, ne } from "drizzle-orm";
import { triggerScheduledSync, getMemberSyncStatus } from "./scheduler";
import { testMssqlConnection } from "./mssqlQueries";

export const memberSyncRouter = router({
    // ─── Status & Test konekcije ──────────────────────────────────────────
    getStatus: adminProcedure.query(async () => {
        const schedulerStatus = getMemberSyncStatus();
        return schedulerStatus;
    }),

    testConnection: adminProcedure.mutation(async () => {
        const result = await testMssqlConnection();
        return result;
    }),

    // ─── Reset članova ───────────────────────────────────────────────────
    resetMembers: adminProcedure.mutation(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.delete(berthAssignments);
        await db.delete(landOccupancies);
        await db.delete(landWaitingList);
        await db.delete(waitingList);
        await db.delete(workOrders);
        await db.delete(reservations);
        await db.delete(userCardEntries);
        await db.delete(memberStatutoryRights);
        await db.delete(memberMemberships);
        await db.delete(memberLinks);
        await db.delete(syncConflicts);
        await db.delete(syncRuns);
        await db.delete(vessels);

        const deletedUsers = await db.delete(users)
            .where(ne(users.role, "admin"))
            .returning({ id: users.id });

        return {
            success: true,
            deletedCount: deletedUsers.length,
        };
    }),

    // ─── Ručno pokretanje sinkronizacije ──────────────────────────────────
    triggerSync: adminProcedure.mutation(async () => {
        const status = getMemberSyncStatus();
        if (status.isRunning) {
            throw new TRPCError({
                code: "CONFLICT",
                message: "Sinkronizacija je već u tijeku. Pričekajte završetak.",
            });
        }
        if (!status.isConfigured) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "MSSQL poslužitelj nije konfiguriran u postavkama (.env).",
            });
        }

        try {
            const result = await triggerScheduledSync("manual");
            return result;
        } catch (err: any) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Greška pri sinkronizaciji: ${err?.message || err}`,
            });
        }
    }),

    // ─── Povijest sinkronizacija (sync_runs) ───────────────────────────────
    getHistory: adminProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(100).default(20),
                offset: z.number().min(0).default(0),
            }),
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const runs = await db
                .select()
                .from(syncRuns)
                .orderBy(desc(syncRuns.startedAt))
                .limit(input.limit)
                .offset(input.offset);

            const [countResult] = await db
                .select({ total: sql<number>`count(*)::int` })
                .from(syncRuns);

            return {
                items: runs,
                total: countResult?.total ?? 0,
            };
        }),

    // ─── Detalji jednog sync runa ─────────────────────────────────────────
    getRunById: adminProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [run] = await db
                .select()
                .from(syncRuns)
                .where(eq(syncRuns.id, input.id))
                .limit(1);

            if (!run) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Sync zapis nije pronađen." });
            }

            const conflicts = await db
                .select()
                .from(syncConflicts)
                .where(eq(syncConflicts.syncRunId, input.id))
                .orderBy(desc(syncConflicts.createdAt));

            return {
                run,
                conflicts,
            };
        }),

    // ─── Popis konflikata (sync_conflicts) ─────────────────────────────────
    getConflicts: adminProcedure
        .input(
            z.object({
                status: z.enum(["pending", "resolved", "ignored"]).optional(),
                limit: z.number().min(1).max(100).default(50),
                offset: z.number().min(0).default(0),
            }),
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const whereClause = input.status ? eq(syncConflicts.status, input.status) : undefined;

            const conflicts = await db
                .select()
                .from(syncConflicts)
                .where(whereClause)
                .orderBy(desc(syncConflicts.createdAt))
                .limit(input.limit)
                .offset(input.offset);

            return conflicts;
        }),

    // ─── Rješavanje konflikta ─────────────────────────────────────────────
    resolveConflict: adminProcedure
        .input(
            z.object({
                conflictId: z.string().uuid(),
                status: z.enum(["resolved", "ignored"]),
                resolution: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [updated] = await db
                .update(syncConflicts)
                .set({
                    status: input.status,
                    resolution: input.resolution,
                    resolvedBy: ctx.user?.id,
                    resolvedAt: new Date(),
                })
                .where(eq(syncConflicts.id, input.conflictId))
                .returning();

            return updated;
        }),

    // ─── Članstva po klubu (za slanje obavijesti / filtre) ────────────────
    getMembersByClub: adminProcedure
        .input(
            z.object({
                klub: z.string().optional(),
                activeOnly: z.boolean().default(true),
            }),
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const conditions = [];
            if (input.activeOnly) {
                conditions.push(eq(memberMemberships.activeMember, true));
            }
            if (input.klub) {
                conditions.push(eq(memberMemberships.klub, input.klub));
            }

            const members = await db
                .select({
                    userId: memberMemberships.userId,
                    matBroj: memberMemberships.legacyMatBroj,
                    klub: memberMemberships.klub,
                    klub2: memberMemberships.klub2,
                    vrstaC: memberMemberships.vrstaC,
                    activeMember: memberMemberships.activeMember,
                    name: users.name,
                    email: users.email,
                    phone: users.phone,
                    oib: users.oib,
                })
                .from(memberMemberships)
                .innerJoin(users, eq(memberMemberships.userId, users.id))
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(users.name);

            return members;
        }),

    // ─── Linkovi i članstva za pojedinog korisnika ────────────────────────
    getUserSyncDetails: adminProcedure
        .input(z.object({ userId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const links = await db
                .select()
                .from(memberLinks)
                .where(eq(memberLinks.userId, input.userId));

            const memberships = await db
                .select()
                .from(memberMemberships)
                .where(eq(memberMemberships.userId, input.userId));

            return { links, memberships };
        }),
});
