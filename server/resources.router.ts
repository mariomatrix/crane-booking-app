import { router, publicProcedure, operatorProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, createAuditEntry } from "./db";
import { resources } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

export const resourcesRouter = router({
    // ─── List Resources ────────────────────────────────────────────────
    list: operatorProcedure
        .input(
            z.object({
                activeOnly: z.boolean().optional().default(true),
            }).optional()
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            let query = db.select().from(resources).orderBy(asc(resources.sortOrder), asc(resources.name));
            if (input?.activeOnly) {
                return await query.where(eq(resources.isActive, true));
            }
            return await query;
        }),

    // ─── Get Resource by ID ───────────────────────────────────────────
    getById: operatorProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [res] = await db.select().from(resources).where(eq(resources.id, input.id)).limit(1);
            if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Resurs nije pronađen." });
            return res;
        }),

    // ─── Create Resource (Admin only) ─────────────────────────────────
    create: adminProcedure
        .input(
            z.object({
                name: z.string().min(1, "Naziv je obavezan"),
                code: z.string().min(1, "Šifra je obavezna"),
                unit: z.string().default("sat"),
                pricePerUnitEur: z.number().nonnegative().default(0),
                vatRate: z.number().nonnegative().default(25),
                description: z.string().optional(),
                sortOrder: z.number().int().default(0),
                isActive: z.boolean().default(true),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [existing] = await db.select().from(resources).where(eq(resources.code, input.code.toUpperCase().trim())).limit(1);
            if (existing) {
                throw new TRPCError({ code: "BAD_REQUEST", message: `Resurs sa šifrom ${input.code} već postoji.` });
            }

            const [created] = await db
                .insert(resources)
                .values({
                    name: input.name.trim(),
                    code: input.code.toUpperCase().trim(),
                    unit: input.unit.trim(),
                    pricePerUnitEur: input.pricePerUnitEur.toFixed(2),
                    vatRate: input.vatRate.toFixed(2),
                    description: input.description?.trim() || null,
                    sortOrder: input.sortOrder,
                    isActive: input.isActive,
                })
                .returning();

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "resource_created",
                entityType: "resources",
                entityId: created.id,
                payload: { name: created.name, code: created.code },
            });

            return created;
        }),

    // ─── Update Resource (Admin only) ─────────────────────────────────
    update: adminProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                name: z.string().min(1).optional(),
                code: z.string().min(1).optional(),
                unit: z.string().optional(),
                pricePerUnitEur: z.number().nonnegative().optional(),
                vatRate: z.number().nonnegative().optional(),
                description: z.string().optional(),
                sortOrder: z.number().int().optional(),
                isActive: z.boolean().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [existing] = await db.select().from(resources).where(eq(resources.id, input.id)).limit(1);
            if (!existing) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Resurs nije pronađen." });
            }

            const updateData: any = { updatedAt: new Date() };
            if (input.name !== undefined) updateData.name = input.name.trim();
            if (input.code !== undefined) updateData.code = input.code.toUpperCase().trim();
            if (input.unit !== undefined) updateData.unit = input.unit.trim();
            if (input.pricePerUnitEur !== undefined) updateData.pricePerUnitEur = input.pricePerUnitEur.toFixed(2);
            if (input.vatRate !== undefined) updateData.vatRate = input.vatRate.toFixed(2);
            if (input.description !== undefined) updateData.description = input.description.trim();
            if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
            if (input.isActive !== undefined) updateData.isActive = input.isActive;

            const [updated] = await db
                .update(resources)
                .set(updateData)
                .where(eq(resources.id, input.id))
                .returning();

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "resource_updated",
                entityType: "resources",
                entityId: updated.id,
                payload: updateData,
            });

            return updated;
        }),

    // ─── Delete / Toggle Resource (Admin only) ────────────────────────
    delete: adminProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [updated] = await db
                .update(resources)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(resources.id, input.id))
                .returning();

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "resource_deactivated",
                entityType: "resources",
                entityId: input.id,
            });

            return updated;
        }),
});
