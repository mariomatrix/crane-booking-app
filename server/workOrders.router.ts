import { router, publicProcedure, operatorProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, createAuditEntry } from "./db";
import {
    workOrders,
    workOrderResources,
    resources,
    reservations,
    users,
    vessels,
    cranes,
    memberStatutoryRights,
    userCardEntries,
    priceListItems,
    craneOperationLog,
    serviceTypes,
    landOccupancies,
    landZones,
    invoices,
    invoiceItems,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql, count, ne, or } from "drizzle-orm";

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

// Helper for generating invoice number: PON-YYYY-XXXXX or RAC-YYYY-XXXXX
async function generateInvoiceNumber(db: any, year: number, isProforma: boolean = true): Promise<string> {
    const prefix = isProforma ? `PON-${year}-` : `RAC-${year}-`;
    const [result] = await db
        .select({ count: count() })
        .from(invoices)
        .where(sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`);
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

    // ─── Get Work Order Details with Attached Resources ──────────────────
    getDetails: operatorProcedure
        .input(z.object({ workOrderId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [order] = await db
                .select({
                    id: workOrders.id,
                    orderNumber: workOrders.orderNumber,
                    reservationId: workOrders.reservationId,
                    userId: workOrders.userId,
                    userName: users.name,
                    userEmail: users.email,
                    userPhone: users.phone,
                    userOib: users.oib,
                    userAddress: users.address,
                    userCity: users.city,
                    userPostalCode: users.postalCode,
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
                .where(eq(workOrders.id, input.workOrderId))
                .limit(1);

            if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Radni nalog nije pronađen." });

            const attachedResources = await db
                .select({
                    id: workOrderResources.id,
                    resourceId: workOrderResources.resourceId,
                    resourceName: resources.name,
                    resourceCode: resources.code,
                    unit: resources.unit,
                    quantity: workOrderResources.quantity,
                    unitPriceEur: workOrderResources.unitPriceEur,
                    totalPriceEur: workOrderResources.totalPriceEur,
                    notes: workOrderResources.notes,
                })
                .from(workOrderResources)
                .innerJoin(resources, eq(workOrderResources.resourceId, resources.id))
                .where(eq(workOrderResources.workOrderId, input.workOrderId));

            return {
                ...order,
                resources: attachedResources,
            };
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
                resources: z.array(
                    z.object({
                        resourceId: z.string().uuid(),
                        quantity: z.number().positive().default(1),
                        notes: z.string().optional(),
                    })
                ).optional().default([]),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            // Fetch reservation
            const [res] = await db.select().from(reservations).where(eq(reservations.id, input.reservationId)).limit(1);
            if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });

            if (res.status === "completed") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Rezervacija je već završena." });
            }
            if (res.status === "cancelled" || res.status === "rejected") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Rezervacija je otkazana ili odbijena." });
            }

            // Check that reservation is not scheduled for a future date
            const targetDate = res.scheduledStart
                ? new Date(res.scheduledStart)
                : res.requestedDate
                    ? new Date(res.requestedDate)
                    : null;

            if (targetDate) {
                const now = new Date();
                const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                if (targetDate.getTime() > endOfToday.getTime()) {
                    const dateStr = targetDate.toLocaleDateString("hr-HR");
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Nije moguće pokrenuti radni nalog za rezervaciju koja je zakazana za budući datum (${dateStr}). Radni nalog se može pokrenuti tek na dan termina ili nakon njega.`,
                    });
                }
            }

            // Check if active or completed work order already exists
            const [existing] = await db
                .select()
                .from(workOrders)
                .where(and(eq(workOrders.reservationId, input.reservationId), ne(workOrders.status, "cancelled")))
                .limit(1);

            if (existing) {
                if (existing.status === "in_progress") {
                    return { success: true, workOrder: existing, alreadyRunning: true };
                }
                if (existing.status === "completed") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Za ovu rezervaciju već postoji zaključeni radni nalog (${existing.orderNumber}).`,
                    });
                }
            }

            const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

            const [vessel] = res.vesselId
                ? await db.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
                : [null];

            const currentYear = new Date().getFullYear();
            const orderNumber = await generateWorkOrderNumber(db, currentYear);

            // Determine if user is regular club member or external commercial client
            const isMember = (user.clientCategory || "member") === "member";
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

            // Insert any attached resources if specified
            if (input.resources && input.resources.length > 0) {
                for (const resItem of input.resources) {
                    const [resDef] = await db.select().from(resources).where(eq(resources.id, resItem.resourceId)).limit(1);
                    if (resDef) {
                        const unitPrice = Number(resDef.pricePerUnitEur) || 0;
                        const totalPrice = Number((unitPrice * resItem.quantity).toFixed(2));
                        await db.insert(workOrderResources).values({
                            workOrderId: newOrder.id,
                            resourceId: resDef.id,
                            quantity: resItem.quantity.toFixed(2),
                            unitPriceEur: unitPrice.toFixed(2),
                            totalPriceEur: totalPrice.toFixed(2),
                            notes: resItem.notes || null,
                        });
                    }
                }
            }

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "work_order_started",
                entityType: "work_orders",
                entityId: newOrder.id,
                payload: { orderNumber, isStatutoryCovered, clientType, resourcesCount: input.resources?.length || 0 },
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
                resources: z.array(
                    z.object({
                        resourceId: z.string().uuid(),
                        quantity: z.number().positive().default(1),
                        notes: z.string().optional(),
                    })
                ).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [order] = await db.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).limit(1);
            if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Radni nalog nije pronađen." });

            if (order.status === "completed") {
                if (order.reservationId) {
                    await db
                        .update(reservations)
                        .set({ status: "completed", updatedAt: new Date() })
                        .where(eq(reservations.id, order.reservationId));
                }
                return { success: true, alreadyCompleted: true };
            }

            const completedAt = new Date();

            // Insert or update resources if provided on completion
            if (input.resources && input.resources.length > 0) {
                // Delete existing resources to avoid duplicate entry on re-submit
                await db.delete(workOrderResources).where(eq(workOrderResources.workOrderId, order.id));

                for (const resItem of input.resources) {
                    const [resDef] = await db.select().from(resources).where(eq(resources.id, resItem.resourceId)).limit(1);
                    if (resDef) {
                        const unitPrice = Number(resDef.pricePerUnitEur) || 0;
                        const totalPrice = Number((unitPrice * resItem.quantity).toFixed(2));
                        await db.insert(workOrderResources).values({
                            workOrderId: order.id,
                            resourceId: resDef.id,
                            quantity: resItem.quantity.toFixed(2),
                            unitPriceEur: unitPrice.toFixed(2),
                            totalPriceEur: totalPrice.toFixed(2),
                            notes: resItem.notes || null,
                        });
                    }
                }
            }

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
            const opType = order.quotaOperationType && order.quotaOperationType !== "none"
                ? order.quotaOperationType
                : "lift";

            await db.insert(craneOperationLog).values({
                craneId: order.craneId,
                reservationId: order.reservationId,
                operationType: opType,
                startTime: order.startedAt,
                endTime: completedAt,
                durationMinutes: input.actualDurationMin,
                operatorId: ctx.user.id,
                note: `Radni nalog ${order.orderNumber} završen.`,
            });

            // Mark reservation as completed (Changes calendar color to blue!)
            if (order.reservationId) {
                await db
                    .update(reservations)
                    .set({ status: "completed", completedAt, updatedAt: completedAt })
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

    // ─── Get Unified Cycle Summary (Sažetak ciklusa: Vađenje + Suhi vez + Spuštanje) ─────
    getUnifiedCycleSummary: operatorProcedure
        .input(
            z.object({
                vesselId: z.string().uuid().optional(),
                reservationId: z.string().uuid().optional(),
                workOrderId: z.string().uuid().optional(),
            })
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            let targetVesselId = input.vesselId;
            let targetUserId: string | null = null;

            if (!targetVesselId && input.workOrderId) {
                const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).limit(1);
                if (wo) {
                    targetVesselId = wo.vesselId || undefined;
                    targetUserId = wo.userId;
                }
            }

            if (!targetVesselId && input.reservationId) {
                const [res] = await db.select().from(reservations).where(eq(reservations.id, input.reservationId)).limit(1);
                if (res) {
                    targetVesselId = res.vesselId || undefined;
                    targetUserId = res.userId;
                }
            }

            if (!targetVesselId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Nije specificirano plovilo za dohvat ciklusa." });
            }

            // Fetch Vessel & User
            const [vessel] = await db.select().from(vessels).where(eq(vessels.id, targetVesselId)).limit(1);
            if (!vessel) throw new TRPCError({ code: "NOT_FOUND", message: "Plovilo nije pronađeno." });

            const [user] = await db.select().from(users).where(eq(users.id, targetUserId || vessel.ownerId)).limit(1);
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

            const isMember = (user.clientCategory || "member") === "member";
            const lengthM = Number(vessel.lengthM) || 8.0;

            // Fetch Land Occupancy for this vessel (active or latest completed)
            const [occupancy] = await db
                .select({
                    id: landOccupancies.id,
                    zoneId: landOccupancies.zoneId,
                    zoneName: landZones.name,
                    zoneCode: landZones.code,
                    spotNumber: landOccupancies.spotNumber,
                    reservationId: landOccupancies.reservationId,
                    returnReservationId: landOccupancies.returnReservationId,
                    liftedAt: landOccupancies.liftedAt,
                    returnedAt: landOccupancies.returnedAt,
                })
                .from(landOccupancies)
                .leftJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
                .where(eq(landOccupancies.vesselId, targetVesselId))
                .orderBy(desc(landOccupancies.liftedAt))
                .limit(1);

            // Fetch Lift Work Order (RN vađenja)
            let liftWorkOrder = null;
            let liftResources: any[] = [];
            if (occupancy?.reservationId) {
                const [wo] = await db.select().from(workOrders).where(eq(workOrders.reservationId, occupancy.reservationId)).limit(1);
                liftWorkOrder = wo || null;
                if (wo) {
                    liftResources = await db
                        .select({
                            name: resources.name,
                            code: resources.code,
                            unit: resources.unit,
                            quantity: workOrderResources.quantity,
                            unitPriceEur: workOrderResources.unitPriceEur,
                            totalPriceEur: workOrderResources.totalPriceEur,
                        })
                        .from(workOrderResources)
                        .innerJoin(resources, eq(workOrderResources.resourceId, resources.id))
                        .where(eq(workOrderResources.workOrderId, wo.id));
                }
            }

            // Fetch Lower Work Order (RN spuštanja)
            let lowerWorkOrder = null;
            let lowerResources: any[] = [];
            if (occupancy?.returnReservationId) {
                const [wo] = await db.select().from(workOrders).where(eq(workOrders.reservationId, occupancy.returnReservationId)).limit(1);
                lowerWorkOrder = wo || null;
                if (wo) {
                    lowerResources = await db
                        .select({
                            name: resources.name,
                            code: resources.code,
                            unit: resources.unit,
                            quantity: workOrderResources.quantity,
                            unitPriceEur: workOrderResources.unitPriceEur,
                            totalPriceEur: workOrderResources.totalPriceEur,
                        })
                        .from(workOrderResources)
                        .innerJoin(resources, eq(workOrderResources.resourceId, resources.id))
                        .where(eq(workOrderResources.workOrderId, wo.id));
                }
            }

            // Calculate dry berth days
            let totalDays = 0;
            let billableDays = 0;
            const freeDaysAllowed = 30; // Stalni član ima 30 dana uključeno u članarinu
            const liftedDate = occupancy?.liftedAt ? new Date(occupancy.liftedAt) : new Date();
            const returnedDate = occupancy?.returnedAt ? new Date(occupancy.returnedAt) : new Date();

            if (occupancy?.liftedAt) {
                const diffMs = returnedDate.getTime() - liftedDate.getTime();
                totalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            }

            if (isMember) {
                billableDays = Math.max(0, totalDays - freeDaysAllowed);
            } else {
                billableDays = totalDays; // Privremeni član plaća sve dane fiksno po danu
            }

            // Fetch price list items
            const [cranePriceItem] = await db.select().from(priceListItems).where(eq(priceListItems.code, "USL-VANJSKI-M")).limit(1);
            const [berthPriceItem] = await db.select().from(priceListItems).where(eq(priceListItems.code, "USL-LEZARINA-DAN")).limit(1);

            const craneRatePerMeter = cranePriceItem?.pricePerMeterEur ? Number(cranePriceItem.pricePerMeterEur) : 12.00;
            const dailyBerthRate = berthPriceItem?.fixedPriceEur ? Number(berthPriceItem.fixedPriceEur) : 15.00;

            const liftCostNet = isMember ? 0 : Number((lengthM * craneRatePerMeter).toFixed(2));
            const lowerCostNet = isMember ? 0 : Number((lengthM * craneRatePerMeter).toFixed(2));
            const berthCostNet = isMember ? 0 : Number((billableDays * dailyBerthRate).toFixed(2));

            const totalResourcesNet = [...liftResources, ...lowerResources].reduce(
                (sum, r) => sum + Number(r.totalPriceEur || 0),
                0
            );

            const grandTotalNet = liftCostNet + lowerCostNet + berthCostNet + totalResourcesNet;
            const vatRate = 25.00;
            const grandTotalVat = Number((grandTotalNet * (vatRate / 100)).toFixed(2));
            const grandTotalGross = Number((grandTotalNet + grandTotalVat).toFixed(2));

            // Check if invoice/quote is already generated for this cycle
            const [existingInvoice] = await db
                .select()
                .from(invoices)
                .where(and(eq(invoices.userId, user.id), eq(invoices.vesselId, vessel.id)))
                .orderBy(desc(invoices.createdAt))
                .limit(1);

            return {
                user: {
                    id: user.id,
                    name: user.name || `${user.firstName || ""} ${user.lastName || ""}`,
                    email: user.email,
                    phone: user.phone,
                    oib: user.oib,
                    address: user.address,
                    city: user.city,
                    postalCode: user.postalCode,
                    clientCategory: user.clientCategory,
                    isMember,
                },
                vessel: {
                    id: vessel.id,
                    name: vessel.name,
                    registration: vessel.registration,
                    lengthM: String(lengthM),
                    type: vessel.type,
                },
                occupancy: occupancy ? {
                    id: occupancy.id,
                    zoneName: occupancy.zoneName,
                    zoneCode: occupancy.zoneCode,
                    spotNumber: occupancy.spotNumber,
                    liftedAt: occupancy.liftedAt,
                    returnedAt: occupancy.returnedAt,
                    totalDays,
                    freeDaysAllowed,
                    billableDays,
                    dailyBerthRate,
                    berthCostNet,
                } : null,
                lift: {
                    workOrder: liftWorkOrder,
                    costNet: liftCostNet,
                    resources: liftResources,
                },
                lower: {
                    workOrder: lowerWorkOrder,
                    costNet: lowerCostNet,
                    resources: lowerResources,
                },
                totals: {
                    liftCostNet,
                    lowerCostNet,
                    berthCostNet,
                    resourcesCostNet: totalResourcesNet,
                    grandTotalNet,
                    vatRate,
                    grandTotalVat,
                    grandTotalGross,
                },
                existingInvoice: existingInvoice || null,
            };
        }),

    // ─── Generate Unified Quote / Invoice (Kreiraj Jedinstvenu Ponudu) ───────────
    generateUnifiedQuote: operatorProcedure
        .input(
            z.object({
                vesselId: z.string().uuid(),
                userId: z.string().uuid(),
                paymentMethod: z.enum(["bank_transfer", "cash", "card", "compensation"]).default("bank_transfer"),
                documentType: z.enum(["proforma", "invoice"]).default("proforma"),
                dueDateDays: z.number().int().positive().default(14),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

            const [vessel] = await db.select().from(vessels).where(eq(vessels.id, input.vesselId)).limit(1);
            if (!vessel) throw new TRPCError({ code: "NOT_FOUND", message: "Plovilo nije pronađeno." });

            const isMember = (user.clientCategory || "member") === "member";
            const lengthM = Number(vessel.lengthM) || 8.0;

            // Fetch Land Occupancy
            const [occupancy] = await db
                .select()
                .from(landOccupancies)
                .where(eq(landOccupancies.vesselId, vessel.id))
                .orderBy(desc(landOccupancies.liftedAt))
                .limit(1);

            let totalDays = 1;
            if (occupancy?.liftedAt) {
                const returned = occupancy.returnedAt ? new Date(occupancy.returnedAt) : new Date();
                const lifted = new Date(occupancy.liftedAt);
                totalDays = Math.max(1, Math.ceil((returned.getTime() - lifted.getTime()) / (1000 * 60 * 60 * 24)));
            }

            const billableDays = isMember ? Math.max(0, totalDays - 30) : totalDays;

            // Price rates
            const [cranePriceItem] = await db.select().from(priceListItems).where(eq(priceListItems.code, "USL-VANJSKI-M")).limit(1);
            const [berthPriceItem] = await db.select().from(priceListItems).where(eq(priceListItems.code, "USL-LEZARINA-DAN")).limit(1);

            const craneRatePerMeter = cranePriceItem?.pricePerMeterEur ? Number(cranePriceItem.pricePerMeterEur) : 12.00;
            const dailyBerthRate = berthPriceItem?.fixedPriceEur ? Number(berthPriceItem.fixedPriceEur) : 15.00;

            const itemsToInsert: Array<{
                productCode: string;
                description: string;
                quantity: string;
                unit: string;
                unitPrice: string;
                vatRate: string;
                netAmount: string;
                vatAmount: string;
                grossAmount: string;
            }> = [];

            let totalNet = 0;

            // 1. Vađenje plovila
            if (!isMember) {
                const liftNet = Number((lengthM * craneRatePerMeter).toFixed(2));
                const liftVat = Number((liftNet * 0.25).toFixed(2));
                itemsToInsert.push({
                    productCode: "USL-DIZ-VAD",
                    description: `Vađenje plovila iz mora (${lengthM.toFixed(2)} m)`,
                    quantity: "1",
                    unit: "usl",
                    unitPrice: liftNet.toFixed(2),
                    vatRate: "25.00",
                    netAmount: liftNet.toFixed(2),
                    vatAmount: liftVat.toFixed(2),
                    grossAmount: (liftNet + liftVat).toFixed(2),
                });
                totalNet += liftNet;
            }

            // 2. Korištenje suhog veza (Ležarina)
            if (billableDays > 0) {
                const berthNet = Number((billableDays * dailyBerthRate).toFixed(2));
                const berthVat = Number((berthNet * 0.25).toFixed(2));
                itemsToInsert.push({
                    productCode: "USL-LEZARINA-DAN",
                    description: `Korištenje suhog veza na platou (${billableDays} dana)`,
                    quantity: String(billableDays),
                    unit: "dan",
                    unitPrice: dailyBerthRate.toFixed(2),
                    vatRate: "25.00",
                    netAmount: berthNet.toFixed(2),
                    vatAmount: berthVat.toFixed(2),
                    grossAmount: (berthNet + berthVat).toFixed(2),
                });
                totalNet += berthNet;
            }

            // 3. Spuštanje plovila
            if (!isMember) {
                const lowerNet = Number((lengthM * craneRatePerMeter).toFixed(2));
                const lowerVat = Number((lowerNet * 0.25).toFixed(2));
                itemsToInsert.push({
                    productCode: "USL-DIZ-SPU",
                    description: `Spuštanje plovila u more (${lengthM.toFixed(2)} m)`,
                    quantity: "1",
                    unit: "usl",
                    unitPrice: lowerNet.toFixed(2),
                    vatRate: "25.00",
                    netAmount: lowerNet.toFixed(2),
                    vatAmount: lowerVat.toFixed(2),
                    grossAmount: (lowerNet + lowerVat).toFixed(2),
                });
                totalNet += lowerNet;
            }

            // 4. Fetch attached resources for lift and lower
            const woIds = [];
            if (occupancy?.reservationId) {
                const [woLift] = await db.select().from(workOrders).where(eq(workOrders.reservationId, occupancy.reservationId)).limit(1);
                if (woLift) woIds.push(woLift.id);
            }
            if (occupancy?.returnReservationId) {
                const [woLower] = await db.select().from(workOrders).where(eq(workOrders.reservationId, occupancy.returnReservationId)).limit(1);
                if (woLower) woIds.push(woLower.id);
            }

            if (woIds.length > 0) {
                const resRows = await db
                    .select({
                        code: resources.code,
                        name: resources.name,
                        unit: resources.unit,
                        quantity: workOrderResources.quantity,
                        unitPriceEur: workOrderResources.unitPriceEur,
                        totalPriceEur: workOrderResources.totalPriceEur,
                    })
                    .from(workOrderResources)
                    .innerJoin(resources, eq(workOrderResources.resourceId, resources.id))
                    .where(or(...woIds.map(id => eq(workOrderResources.workOrderId, id))));

                for (const r of resRows) {
                    const rNet = Number(r.totalPriceEur) || 0;
                    const rVat = Number((rNet * 0.25).toFixed(2));
                    itemsToInsert.push({
                        productCode: r.code,
                        description: `Dodatni resurs: ${r.name}`,
                        quantity: r.quantity,
                        unit: r.unit,
                        unitPrice: r.unitPriceEur,
                        vatRate: "25.00",
                        netAmount: rNet.toFixed(2),
                        vatAmount: rVat.toFixed(2),
                        grossAmount: (rNet + rVat).toFixed(2),
                    });
                    totalNet += rNet;
                }
            }

            const totalVat = Number((totalNet * 0.25).toFixed(2));
            const totalGross = Number((totalNet + totalVat).toFixed(2));

            const currentYear = new Date().getFullYear();
            const invoiceNumber = await generateInvoiceNumber(db, currentYear, input.documentType === "proforma");
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + input.dueDateDays);

            const [createdInvoice] = await db
                .insert(invoices)
                .values({
                    invoiceNumber,
                    userId: user.id,
                    vesselId: vessel.id,
                    reservationId: occupancy?.returnReservationId || occupancy?.reservationId || null,
                    documentType: input.documentType,
                    invoiceType: "crane_operation",
                    issueDate: new Date(),
                    dueDate,
                    dateOfSupply: new Date(),
                    totalNetAmount: totalNet.toFixed(2),
                    totalVatAmount: totalVat.toFixed(2),
                    totalGrossAmount: totalGross.toFixed(2),
                    currency: "EUR",
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "unpaid",
                    notes: input.notes || `Jedinstvena ponuda za plovilo ${vessel.name} (${vessel.registration || ''}) — Boravak na kopnu: ${totalDays} dana.`,
                })
                .returning();

            for (const item of itemsToInsert) {
                await db.insert(invoiceItems).values({
                    invoiceId: createdInvoice.id,
                    productCode: item.productCode,
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitPrice: item.unitPrice,
                    vatRate: item.vatRate,
                    netAmount: item.netAmount,
                    vatAmount: item.vatAmount,
                    grossAmount: item.grossAmount,
                });
            }

            await createAuditEntry({
                actorId: ctx.user.id,
                action: "unified_quote_generated",
                entityType: "invoices",
                entityId: createdInvoice.id,
                payload: {
                    invoiceNumber,
                    totalGross,
                    documentType: input.documentType,
                    vesselName: vessel.name,
                    totalDays,
                },
            });

            return createdInvoice;
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
