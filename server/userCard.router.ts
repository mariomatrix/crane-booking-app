import { router, publicProcedure, operatorProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users, vessels, userCardEntries, workOrders } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { ensureMemberStatutoryRights } from "./services/statutoryQuotaService";

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

            // Fetch, initialize, or rollover statutory rights only for members
            const isMember = (user.clientCategory || "member") === "member";
            const currentYear = new Date().getFullYear();
            const rights = isMember
                ? await ensureMemberStatutoryRights(db, user.id, currentYear)
                : null;

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
                rights,
                vessels: userVessels,
                entries,
            };
        }),
});
