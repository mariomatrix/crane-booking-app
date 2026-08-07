import { router, publicProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, createAuditEntry } from "./db";
import { priceListItems } from "../drizzle/schema";
import { eq, desc, asc } from "drizzle-orm";

export const priceListRouter = router({
    list: publicProcedure.query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        return await db
            .select()
            .from(priceListItems)
            .orderBy(asc(priceListItems.sortOrder), desc(priceListItems.createdAt));
    }),

    create: adminProcedure
        .input(
            z.object({
                code: z.string().min(1).max(50),
                name: z.string().min(1).max(255),
                targetType: z.enum(["member_adjustment", "external_commercial"]),
                minLengthM: z.number().optional(),
                maxLengthM: z.number().optional(),
                pricePerMeterEur: z.number().optional(),
                fixedPriceEur: z.number().optional(),
                vatRate: z.number().default(25.00),
                isActive: z.boolean().default(true),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [item] = await db
                .insert(priceListItems)
                .values({
                    code: input.code.trim().toUpperCase(),
                    name: input.name.trim(),
                    targetType: input.targetType,
                    minLengthM: input.minLengthM ? String(input.minLengthM) : null,
                    maxLengthM: input.maxLengthM ? String(input.maxLengthM) : null,
                    pricePerMeterEur: input.pricePerMeterEur ? String(input.pricePerMeterEur) : null,
                    fixedPriceEur: input.fixedPriceEur ? String(input.fixedPriceEur) : null,
                    vatRate: String(input.vatRate),
                    isActive: input.isActive,
                })
                .returning();

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "pricelist_item_created",
                entityType: "price_list_items",
                entityId: item.id,
                payload: { code: item.code, name: item.name },
            });

            return item;
        }),

    update: adminProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                name: z.string().optional(),
                pricePerMeterEur: z.number().nullable().optional(),
                fixedPriceEur: z.number().nullable().optional(),
                vatRate: z.number().optional(),
                isActive: z.boolean().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const updates: any = { updatedAt: new Date() };
            if (input.name !== undefined) updates.name = input.name;
            if (input.pricePerMeterEur !== undefined) updates.pricePerMeterEur = input.pricePerMeterEur !== null ? String(input.pricePerMeterEur) : null;
            if (input.fixedPriceEur !== undefined) updates.fixedPriceEur = input.fixedPriceEur !== null ? String(input.fixedPriceEur) : null;
            if (input.vatRate !== undefined) updates.vatRate = String(input.vatRate);
            if (input.isActive !== undefined) updates.isActive = input.isActive;

            await db.update(priceListItems).set(updates).where(eq(priceListItems.id, input.id));

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "pricelist_item_updated",
                entityType: "price_list_items",
                entityId: input.id,
                payload: updates,
            });

            return { success: true };
        }),
});
