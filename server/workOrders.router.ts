import { router, publicProcedure, operatorProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, createAuditEntry } from "./db";
import {
    workOrders,
    reservations,
    users,
    vessels,
    cranes,
    memberStatutoryRights,
    userCardEntries,
    priceListItems,
    craneOperationLog,
    serviceTypes,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql, count } from "drizzle-orm";

// Helper for generating order number: RN-YYYY-XXXXX
async function generateWorkOrderNumber(db: any, year: number): Promise<string> {
    const prefix = `RN-${year}-`;
    const [result] = await db
        .select({ count: count() })
        .from(workOrders)
        .where(sql`${workOrders.orderNumber} LIKE ${prefix + '%'}`);
    const nextSeq = (result?.count || 0) + 1;
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

export const workOrdersRouter = router({
    // ─── List Work Orders ───────────────────────────────────────────────
    list: operatorProcedure
        .input(
            z.object({
                dateFrom: z.string().optional(),
                dateTo: z.string().optional(),
                craneId: z.string().uuid().optional(),
                clientType: z.enum(["member", "external"]).optional(),
                status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
            }).optional()
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            let query = db
                .select({
                    id: workOrders.id,
                    orderNumber: workOrders.orderNumber,
                    reservationId: workOrders.reservationId,
                    userId: workOrders.userId,
                    userName: users.name,
                    userEmail: users.email,
                    userPhone: users.phone,
                    userOib: users.oib,
                    vesselId: workOrders.vesselId,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                    vesselLengthM: workOrders.vesselLengthM,
                    craneId: workOrders.craneId,
                    craneName: cranes.name,
                    operatorId: workOrders.operatorId,
                    operatorName: sql<string>`op_user.name`,
                    status: workOrders.status,
                    clientType: workOrders.clientType,
                    isStatutoryCovered: workOrders.isStatutoryCovered,
                    quotaOperationType: workOrders.quotaOperationType,
                    chargeItemCode: workOrders.chargeItemCode,
                    chargeItemName: workOrders.chargeItemName,
                    commercialPricePerMeter: workOrders.commercialPricePerMeter,
                    commercialTotal: workOrders.commercialTotal,
                    startedAt: workOrders.startedAt,
                    completedAt: workOrders.completedAt,
                    actualDurationMin: workOrders.actualDurationMin,
                    operatorNotes: workOrders.operatorNotes,
                    erpSyncStatus: workOrders.erpSyncStatus,
                    erpDocumentId: workOrders.erpDocumentId,
                    createdAt: workOrders.createdAt,
                })
                .from(workOrders)
                .leftJoin(users, eq(workOrders.userId, users.id))
                .leftJoin(sql`users as op_user`, sql`work_orders.operator_id = op_user.id`)
                .leftJoin(vessels, eq(workOrders.vesselId, vessels.id))
                .leftJoin(cranes, eq(workOrders.craneId, cranes.id))
                .orderBy(desc(workOrders.startedAt));

            const conditions = [];
            if (input?.status) conditions.push(eq(workOrders.status, input.status));
            if (input?.clientType) conditions.push(eq(workOrders.clientType, input.clientType));
            if (input?.craneId) conditions.push(eq(workOrders.craneId, input.craneId));
            if (input?.dateFrom) conditions.push(gte(workOrders.startedAt, new Date(input.dateFrom)));
            if (input?.dateTo) conditions.push(lte(workOrders.startedAt, new Date(input.dateTo)));

            if (conditions.length > 0) {
                return await query.where(and(...conditions));
            }
            return await query;
        }),

    // ─── Get Active Order for Reservation ───────────────────────────────
    getActiveByReservation: operatorProcedure
        .input(z.object({ reservationId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [order] = await db
                .select()
                .from(workOrders)
                .where(and(eq(workOrders.reservationId, input.reservationId), eq(workOrders.status, "in_progress")))
                .limit(1);

            return order || null;
        }),

    // ─── Start Work Order (Pokreni radni nalog) ────────────────────────
    startFromReservation: operatorProcedure
        .input(
            z.object({
                reservationId: z.string().uuid(),
                craneId: z.string().uuid(),
                operatorNotes: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            // Check if active work order already exists
            const existing = await db
                .select()
                .from(workOrders)
                .where(and(eq(workOrders.reservationId, input.reservationId), eq(workOrders.status, "in_progress")))
                .limit(1);

            if (existing.length > 0) {
                return { success: true, workOrder: existing[0], alreadyRunning: true };
            }

            // Fetch reservation
            const [res] = await db.select().from(reservations).where(eq(reservations.id, input.reservationId)).limit(1);
            if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });

            const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

            const [vessel] = res.vesselId
                ? await db.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
                : [null];

            const currentYear = new Date().getFullYear();
            const orderNumber = await generateWorkOrderNumber(db, currentYear);

            // Determine if user is regular member or external
            const isMember = user.role === "user" && !user.isLegalEntity;
            const clientType: "member" | "external" = isMember ? "member" : "external";

            // Determine operation type (vađenje ili spuštanje)
            let quotaOperationType: "lift" | "lower" | "none" = "none";
            if (res.serviceTypeId) {
                const [st] = await db.select().from(serviceTypes).where(eq(serviceTypes.id, res.serviceTypeId)).limit(1);
                if (st?.operationCategory === "lift_from_sea") quotaOperationType = "lift";
                else if (st?.operationCategory === "lower_to_sea") quotaOperationType = "lower";
            }

            let isStatutoryCovered = false;
            let chargeItemCode: string | null = null;
            let chargeItemName: string | null = null;
            let commercialPricePerMeter: string | null = null;
            let commercialTotal: string | null = null;
            const vesselLengthM = res.vesselLengthM || (vessel?.lengthM ? String(vessel.lengthM) : "8.00");

            if (isMember) {
                // Fetch member statutory rights (or create if not yet existing)
                let [rights] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, user.id)).limit(1);
                if (!rights) {
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

                // Check statutory rights
                if (quotaOperationType === "lift" && rights.liftAvailable) {
                    isStatutoryCovered = true;
                } else if (quotaOperationType === "lower" && rights.lowerAvailable) {
                    isStatutoryCovered = true;
                } else {
                    // Right already used! Record pricelist item code for fee adjustment in Desktop ERP
                    isStatutoryCovered = false;
                    chargeItemCode = "USL-D9T";
                    chargeItemName = "Korištenje dizalice 9T (Doplata članarine)";
                }
            } else {
                // External commercial user: calculate by meters of vessel length
                const [priceItem] = await db
                    .select()
                    .from(priceListItems)
                    .where(and(eq(priceListItems.code, "USL-VANJSKI-M"), eq(priceListItems.isActive, true)))
                    .limit(1);

                const ratePerMeter = priceItem?.pricePerMeterEur ? Number(priceItem.pricePerMeterEur) : 12.00;
                const length = Number(vesselLengthM) || 8.0;
                const baseAmount = length * ratePerMeter;
                const totalWithVat = baseAmount * 1.25;

                commercialPricePerMeter = ratePerMeter.toFixed(2);
                commercialTotal = totalWithVat.toFixed(2);
                isStatutoryCovered = false;
            }

            const [newOrder] = await db
                .insert(workOrders)
                .values({
                    orderNumber,
                    reservationId: res.id,
                    userId: user.id,
                    vesselId: res.vesselId || null,
                    craneId: input.craneId,
                    operatorId: ctx.user.id,
                    status: "in_progress",
                    clientType,
                    isStatutoryCovered,
                    quotaOperationType,
                    chargeItemCode,
                    chargeItemName,
                    vesselLengthM,
                    commercialPricePerMeter,
                    commercialTotal,
                    vatRate: "25.00",
                    startedAt: new Date(),
                    operatorNotes: input.operatorNotes || null,
                    erpSyncStatus: "pending",
                })
                .returning();

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "work_order_started",
                entityType: "work_orders",
                entityId: newOrder.id,
                payload: { orderNumber, isStatutoryCovered, clientType },
            });

            return { success: true, workOrder: newOrder, alreadyRunning: false };
        }),

    // ─── Complete Work Order (Završi radni nalog) ──────────────────────
    complete: operatorProcedure
        .input(
            z.object({
                workOrderId: z.string().uuid(),
                actualDurationMin: z.number().int().positive().default(30),
                operatorNotes: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [order] = await db.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).limit(1);
            if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Radni nalog nije pronađen." });

            if (order.status === "completed") {
                return { success: true, alreadyCompleted: true };
            }

            const completedAt = new Date();

            // Update Work Order
            await db
                .update(workOrders)
                .set({
                    status: "completed",
                    completedAt,
                    actualDurationMin: input.actualDurationMin,
                    operatorNotes: input.operatorNotes || order.operatorNotes,
                    updatedAt: completedAt,
                })
                .where(eq(workOrders.id, order.id));

            // Fetch Vessel Details for Card Record
            const [vessel] = order.vesselId
                ? await db.select().from(vessels).where(eq(vessels.id, order.vesselId)).limit(1)
                : [null];

            const vesselName = vessel?.name || "Plovilo";
            const vesselRegistration = vessel?.registration || "";

            // Apply statutory rights or fee adjustments
            if (order.clientType === "member") {
                if (order.isStatutoryCovered) {
                    // Mark quota as used
                    if (order.quotaOperationType === "lift") {
                        await db
                            .update(memberStatutoryRights)
                            .set({ liftAvailable: false, updatedAt: new Date() })
                            .where(eq(memberStatutoryRights.userId, order.userId));
                    } else if (order.quotaOperationType === "lower") {
                        await db
                            .update(memberStatutoryRights)
                            .set({ lowerAvailable: false, updatedAt: new Date() })
                            .where(eq(memberStatutoryRights.userId, order.userId));
                    }

                    // Insert into User Card Entry
                    await db.insert(userCardEntries).values({
                        userId: order.userId,
                        workOrderId: order.id,
                        entryType: "statutory_quota_used",
                        serviceItemCode: order.quotaOperationType === "lift" ? "STAT-LIFT" : "STAT-LOWER",
                        serviceItemName: order.quotaOperationType === "lift" ? "Statutarno pravo: Vađenje iz mora (0,00 €)" : "Statutarno pravo: Spuštanje u more (0,00 €)",
                        vesselName,
                        vesselRegistration,
                        eventDate: completedAt,
                        note: `Radni nalog ${order.orderNumber} - Pokriveno godišnjom članarinom`,
                        erpStatus: "pending",
                    });
                } else {
                    // Quota exceeded: Increment pending fee adjustment
                    await db
                        .update(memberStatutoryRights)
                        .set({
                            pendingFeeAdjustmentsCount: sql`${memberStatutoryRights.pendingFeeAdjustmentsCount} + 1`,
                            updatedAt: new Date(),
                        })
                        .where(eq(memberStatutoryRights.userId, order.userId));

                    // Insert fee adjustment charge into User Card Entry for Desktop ERP
                    await db.insert(userCardEntries).values({
                        userId: order.userId,
                        workOrderId: order.id,
                        entryType: "fee_adjustment_charge",
                        serviceItemCode: order.chargeItemCode || "USL-D9T",
                        serviceItemName: order.chargeItemName || "Korištenje dizalice 9T (Doplata članarine)",
                        vesselName,
                        vesselRegistration,
                        eventDate: completedAt,
                        note: `Radni nalog ${order.orderNumber} - Prekoračenje statutarne kvote (Evidentirano zaduženje za uvećanje članarine)`,
                        erpStatus: "pending",
                    });
                }
            } else {
                // External Commercial User
                await db.insert(userCardEntries).values({
                    userId: order.userId,
                    workOrderId: order.id,
                    entryType: "commercial_service",
                    serviceItemCode: "USL-VANJSKI-M",
                    serviceItemName: `Komercijalno korištenje dizalice (${order.vesselLengthM || '8.0'}m)`,
                    vesselName,
                    vesselRegistration,
                    eventDate: completedAt,
                    note: `Radni nalog ${order.orderNumber} - Iznos za fakturiranje: ${order.commercialTotal || '0.00'} EUR`,
                    erpStatus: "pending",
                });
            }

            // Log to craneOperationLog
            await db.insert(craneOperationLog).values({
                craneId: order.craneId,
                reservationId: order.reservationId,
                operationType: order.quotaOperationType || "lift",
                startTime: order.startedAt,
                endTime: completedAt,
                durationMinutes: input.actualDurationMin,
                operatorId: ctx.user.id,
                note: `Radni nalog ${order.orderNumber} završen.`,
            });

            // Mark reservation as completed
            if (order.reservationId) {
                await db
                    .update(reservations)
                    .set({ status: "completed", updatedAt: new Date() })
                    .where(eq(reservations.id, order.reservationId));
            }

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "work_order_completed",
                entityType: "work_orders",
                entityId: order.id,
                payload: { orderNumber: order.orderNumber, actualDurationMin: input.actualDurationMin },
            });

            return { success: true, alreadyCompleted: false };
        }),

    // ─── Cancel Work Order (Storniraj nalog) ───────────────────────────
    cancel: operatorProcedure
        .input(
            z.object({
                workOrderId: z.string().uuid(),
                reason: z.string().min(1, "Navedite razlog storniranja"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [order] = await db.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).limit(1);
            if (!order) throw new TRPCError({ code: "NOT_FOUND" });

            await db
                .update(workOrders)
                .set({
                    status: "cancelled",
                    operatorNotes: order.operatorNotes ? `${order.operatorNotes}\n[STORNO]: ${input.reason}` : `[STORNO]: ${input.reason}`,
                    updatedAt: new Date(),
                })
                .where(eq(workOrders.id, order.id));

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "work_order_cancelled",
                entityType: "work_orders",
                entityId: order.id,
                payload: { reason: input.reason },
            });

            return { success: true };
        }),
});
