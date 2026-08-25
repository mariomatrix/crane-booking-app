import { router, publicProcedure, operatorProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users, vessels, memberStatutoryRights, userCardEntries, workOrders } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const userCardRouter = router({
    // ─── Get User Card (Za admina / operatera ili vlastiti karton) ───────
    getCard: publicProcedure
        .input(z.object({ userId: z.string().uuid() }))
        .query(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            // Allow if admin, operator, or user requesting own card
            if (ctx.user?.role !== "admin" && ctx.user?.role !== "operator" && ctx.user?.id !== input.userId) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }

            const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

            const userVessels = await db.select().from(vessels).where(eq(vessels.ownerId, user.id));

            // Fetch or create statutory rights only for members
            const isMember = (user.clientCategory || "member") === "member";
            const currentYear = new Date().getFullYear();
            let [rights] = isMember
                ? await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, user.id)).limit(1)
                : [null];

            if (!rights && isMember) {
                const expiresAt = `${currentYear + 1}-12-31`;
                [rights] = await db.insert(memberStatutoryRights).values({
                    userId: user.id,
                    liftAvailable: true,
                    liftAcquiredYear: currentYear,
                    liftExpiresAt: expiresAt,
                    lowerAvailable: true,
                    lowerAcquiredYear: currentYear,
                    lowerExpiresAt: expiresAt,
                    pendingFeeAdjustmentsCount: 0,
                }).returning();
            }

            // Fetch all entries in user card
            const entries = await db
                .select({
                    id: userCardEntries.id,
                    workOrderId: userCardEntries.workOrderId,
                    entryType: userCardEntries.entryType,
                    serviceItemCode: userCardEntries.serviceItemCode,
                    serviceItemName: userCardEntries.serviceItemName,
                    vesselName: userCardEntries.vesselName,
                    vesselRegistration: userCardEntries.vesselRegistration,
                    eventDate: userCardEntries.eventDate,
                    note: userCardEntries.note,
                    erpStatus: userCardEntries.erpStatus,
                    createdAt: userCardEntries.createdAt,
                })
                .from(userCardEntries)
                .where(eq(userCardEntries.userId, user.id))
                .orderBy(desc(userCardEntries.eventDate));

            return {
                user: {
                    id: user.id,
                    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                    email: user.email,
                    phone: user.phone,
                    oib: user.oib,
                    isLegalEntity: user.isLegalEntity,
                    clientCategory: user.clientCategory || "member",
                    companyName: user.companyName,
                    address: user.address,
                    city: user.city,
                    postalCode: user.postalCode,
                    role: user.role,
                    userStatus: user.userStatus,
                    createdAt: user.createdAt,
                },
                rights: isMember ? (rights || null) : null,
                vessels: userVessels,
                entries,
            };
        }),
});
