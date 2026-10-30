import { TRPCError } from "@trpc/server";
import { eq, and, ne, sql } from "drizzle-orm";
import {
  getDb,
  createAuditEntry,
  createLandOccupancy,
  completeLandOccupancy,
  getActiveOccupancyByVessel,
  getOperatorCranes,
} from "../db";
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
  operationDependencies,
} from "../../drizzle/schema";
import { generateWorkOrderNumber } from "./numberingService";

export interface StartWorkOrderParams {
  reservationId: string;
  operatorId: string;
  craneId?: string;
  startTime?: Date;
  operatorNotes?: string;
  resources?: Array<{
    resourceId: string;
    quantity: number;
    notes?: string;
  }>;
  auditAction?: string;
}

export interface CompleteOperationParams {
  reservationId: string;
  operatorId?: string;
  craneId?: string;
  startTime?: Date;
  actualDurationMin?: number;
  zoneId?: string | null;
  spotNumber?: number;
  operatorNotes?: string;
  resources?: Array<{
    resourceId: string;
    quantity: number;
    notes?: string;
  }>;
  allowFutureDate?: boolean;
}

/**
 * Helper to compute statutory rights coverage & commercial pricing for a reservation's work order.
 */
async function evaluateWorkOrderFinancials(
  db: any,
  res: any,
  user: any,
  vessel: any,
  currentYear: number
) {
  const isMember = (user.clientCategory || "member") === "member";
  const clientType: "member" | "external" = isMember ? "member" : "external";

  let quotaOperationType: "lift" | "lower" | "none" = "none";
  let opCategory: string | null = null;
  let isTruckDelivery = false;

  if (res.serviceTypeId) {
    const [st] = await db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.id, res.serviceTypeId))
      .limit(1);
    opCategory = st?.operationCategory || null;
    isTruckDelivery = !!st?.name?.toLowerCase().includes("kamion");
    if (isTruckDelivery) quotaOperationType = "none";
    else if (st?.operationCategory === "lift_from_sea") quotaOperationType = "lift";
    else if (st?.operationCategory === "lower_to_sea") quotaOperationType = "lower";
  }

  let isStatutoryCovered = false;
  let chargeItemCode: string | null = null;
  let chargeItemName: string | null = null;
  let commercialPricePerMeter: string | null = null;
  let commercialTotal: string | null = null;
  const vesselLengthM = res.vesselLengthM || (vessel?.lengthM ? String(vessel.lengthM) : "8.00");

  if (isMember) {
    let [rights] = await db
      .select()
      .from(memberStatutoryRights)
      .where(eq(memberStatutoryRights.userId, user.id))
      .limit(1);

    if (!rights) {
      const expiresAt = `${currentYear + 1}-12-31`;
      [rights] = await db
        .insert(memberStatutoryRights)
        .values({
          userId: user.id,
          liftAvailable: true,
          liftAcquiredYear: currentYear,
          liftExpiresAt: expiresAt,
          lowerAvailable: true,
          lowerAcquiredYear: currentYear,
          lowerExpiresAt: expiresAt,
          pendingFeeAdjustmentsCount: 0,
        })
        .returning();
    }

    if (quotaOperationType === "lift" && rights.liftAvailable) {
      isStatutoryCovered = true;
    } else if (quotaOperationType === "lower" && rights.lowerAvailable) {
      isStatutoryCovered = true;
    } else {
      isStatutoryCovered = false;
      chargeItemCode = "USL-D9T";
      chargeItemName = "Korištenje dizalice 9T (Doplata članarine)";
    }
  } else {
    const [priceItem] = await db
      .select()
      .from(priceListItems)
      .where(and(eq(priceListItems.code, "USL-VANJSKI-M"), eq(priceListItems.isActive, true)))
      .limit(1);

    const ratePerMeter = priceItem?.pricePerMeterEur ? Number(priceItem.pricePerMeterEur) : 12.0;
    const length = Number(vesselLengthM) || 8.0;
    const baseAmount = length * ratePerMeter;
    const totalWithVat = baseAmount * 1.25;

    commercialPricePerMeter = ratePerMeter.toFixed(2);
    commercialTotal = totalWithVat.toFixed(2);
    isStatutoryCovered = false;
  }

  return {
    clientType,
    quotaOperationType,
    opCategory,
    isTruckDelivery,
    isStatutoryCovered,
    chargeItemCode,
    chargeItemName,
    commercialPricePerMeter,
    commercialTotal,
    vesselLengthM,
  };
}

/**
 * Unified domain service to start a Work Order (RN-YYYY-XXXXX) for a reservation.
 * Used by both tRPC (workOrders.startFromReservation) and Mobile REST API (/reservations/:id/start-work).
 */
export async function startReservationWorkOrder(params: StartWorkOrderParams) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

  const [res] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, params.reservationId))
    .limit(1);
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
    .where(and(eq(workOrders.reservationId, params.reservationId), ne(workOrders.status, "cancelled")))
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

  let chosenCraneId = params.craneId || res.craneId;
  if (!chosenCraneId) {
    const assignedCraneIds = await getOperatorCranes(params.operatorId);
    if (assignedCraneIds.length > 0) {
      chosenCraneId = assignedCraneIds[0];
    } else {
      const [firstCrane] = await db
        .select({ id: cranes.id })
        .from(cranes)
        .where(eq(cranes.craneStatus, "active"))
        .limit(1);
      chosenCraneId = firstCrane?.id || null;
    }
    if (chosenCraneId && !res.craneId) {
      await db
        .update(reservations)
        .set({ craneId: chosenCraneId, updatedAt: new Date() })
        .where(eq(reservations.id, res.id));
    }
  }

  if (!chosenCraneId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nema dostupne dizalice za rezervaciju." });
  }

  const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

  const [vessel] = res.vesselId
    ? await db.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
    : [null];

  const currentYear = new Date().getFullYear();
  const orderNumber = await generateWorkOrderNumber(db, currentYear);

  const fin = await evaluateWorkOrderFinancials(db, res, user, vessel, currentYear);

  const [newOrder] = await db
    .insert(workOrders)
    .values({
      orderNumber,
      reservationId: res.id,
      userId: user.id,
      vesselId: res.vesselId || null,
      craneId: chosenCraneId,
      operatorId: params.operatorId,
      status: "in_progress",
      clientType: fin.clientType,
      isStatutoryCovered: fin.isStatutoryCovered,
      quotaOperationType: fin.quotaOperationType,
      chargeItemCode: fin.chargeItemCode,
      chargeItemName: fin.chargeItemName,
      vesselLengthM: fin.vesselLengthM,
      commercialPricePerMeter: fin.commercialPricePerMeter,
      commercialTotal: fin.commercialTotal,
      vatRate: "25.00",
      startedAt: params.startTime || new Date(),
      operatorNotes: params.operatorNotes || null,
      erpSyncStatus: "pending",
    })
    .returning();

  let resourcesToApply = params.resources || [];
  if (resourcesToApply.length === 0 && res.selectedResources) {
    try {
      const parsed = JSON.parse(res.selectedResources);
      if (Array.isArray(parsed)) {
        resourcesToApply = parsed;
      }
    } catch {}
  }

  if (resourcesToApply && resourcesToApply.length > 0) {
    for (const resItem of resourcesToApply) {
      const [resDef] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resItem.resourceId))
        .limit(1);
      if (resDef) {
        const unitPrice = Number(resDef.pricePerUnitEur) || 0;
        const qty = Number(resItem.quantity) || 1;
        const totalPrice = Number((unitPrice * qty).toFixed(2));
        await db.insert(workOrderResources).values({
          workOrderId: newOrder.id,
          resourceId: resDef.id,
          quantity: qty.toFixed(2),
          unitPriceEur: unitPrice.toFixed(2),
          totalPriceEur: totalPrice.toFixed(2),
          notes: resItem.notes || null,
        });
      }
    }
  }

  await createAuditEntry({
    actorId: params.operatorId,
    action: params.auditAction || "work_order_started",
    entityType: "work_orders",
    entityId: newOrder.id,
    payload: {
      orderNumber,
      reservationId: res.id,
      isStatutoryCovered: fin.isStatutoryCovered,
      clientType: fin.clientType,
      resourcesCount: resourcesToApply?.length || 0,
    },
  });

  return { success: true, workOrder: newOrder, alreadyRunning: false };
}

/**
 * Unified domain operation completion:
 * Ensures that completing a reservation from ANY channel (Web WorkOrderExecutionDialog,
 * DispatchCenter / ConcludeOperationDialog / batchConcludeDay, AdminReservations, or Mobile Operator App)
 * consistently:
 * 1. Creates or completes the Work Order (RN-YYYY-XXXXX),
 * 2. Updates dry berth occupancy (land_occupancies),
 * 3. Deducts member statutory quota (1 lift / 1 lower) or records fee adjustment / commercial charge in user_card_entries,
 * 4. Writes to crane_operation_log,
 * 5. Marks operation_dependencies as fulfilled,
 * 6. Sets reservations.status = 'completed'.
 */
export async function completeReservationOperation(params: CompleteOperationParams) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

  const [res] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, params.reservationId))
    .limit(1);
  if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });

  if (res.status === "completed") {
    const [existingWo] = await db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.reservationId, params.reservationId), eq(workOrders.status, "completed")))
      .limit(1);
    return { success: true, workOrder: existingWo || null, alreadyCompleted: true };
  }
  if (res.status === "cancelled" || res.status === "rejected") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Rezervacija je otkazana ili odbijena." });
  }

  if (!params.allowFutureDate) {
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
          message: `Nije moguće zaključiti operaciju za rezervaciju koja je zakazana za budući datum (${dateStr}). Operacija se može zaključiti tek na dan termina ili nakon njega.`,
        });
      }
    }
  }

  const actualDurationMin = params.actualDurationMin || Number(res.durationMin) || 30;
  const effectiveStartTime = params.startTime || (res.scheduledStart ? new Date(res.scheduledStart) : new Date());
  const durationMs = actualDurationMin * 60 * 1000;
  const effectiveCompletedAt = new Date(effectiveStartTime.getTime() + durationMs);

  const [existing] = await db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.reservationId, params.reservationId), ne(workOrders.status, "cancelled")))
    .limit(1);

  let order = existing;

  const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

  const [vessel] = res.vesselId
    ? await db.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
    : [null];

  const currentYear = new Date().getFullYear();
  const fin = await evaluateWorkOrderFinancials(db, res, user, vessel, currentYear);

  let chosenCraneId = params.craneId || res.craneId;
  if (!chosenCraneId) {
    const [firstActiveCrane] = await db
      .select({ id: cranes.id })
      .from(cranes)
      .where(eq(cranes.craneStatus, "active"))
      .limit(1);
    chosenCraneId = firstActiveCrane?.id || null;
  }
  if (!chosenCraneId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dizalica mora biti odabrana za zaključenje operacije." });
  }

  const alreadyHadCompletedOrder = !!(existing && existing.status === "completed");

  if (existing && existing.status === "in_progress") {
    await db
      .update(workOrders)
      .set({
        status: "completed",
        startedAt: effectiveStartTime,
        completedAt: effectiveCompletedAt,
        actualDurationMin,
        operatorNotes: params.operatorNotes || existing.operatorNotes,
        craneId: chosenCraneId,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, existing.id));

    const [freshOrder] = await db.select().from(workOrders).where(eq(workOrders.id, existing.id)).limit(1);
    order = freshOrder;
  } else if (!existing) {
    const orderNumber = await generateWorkOrderNumber(db, currentYear);
    const [created] = await db
      .insert(workOrders)
      .values({
        orderNumber,
        reservationId: res.id,
        userId: user.id,
        vesselId: res.vesselId || null,
        craneId: chosenCraneId,
        operatorId: params.operatorId || res.approvedBy || user.id,
        status: "completed",
        clientType: fin.clientType,
        isStatutoryCovered: fin.isStatutoryCovered,
        quotaOperationType: fin.quotaOperationType,
        chargeItemCode: fin.chargeItemCode,
        chargeItemName: fin.chargeItemName,
        vesselLengthM: fin.vesselLengthM,
        commercialPricePerMeter: fin.commercialPricePerMeter,
        commercialTotal: fin.commercialTotal,
        vatRate: "25.00",
        startedAt: effectiveStartTime,
        completedAt: effectiveCompletedAt,
        actualDurationMin,
        operatorNotes: params.operatorNotes || null,
        erpSyncStatus: "pending",
      })
      .returning();
    order = created;
  }

  if (order && params.resources && params.resources.length > 0) {
    await db.delete(workOrderResources).where(eq(workOrderResources.workOrderId, order.id));
    for (const resItem of params.resources) {
      const [resDef] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resItem.resourceId))
        .limit(1);
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

  // Land occupancy management (Kopno)
  const finalZoneId = params.zoneId !== undefined ? params.zoneId || res.landZoneId : res.landZoneId;
  if (res.vesselId) {
    const isLift = fin.opCategory === "lift_from_sea";
    const isLower = fin.opCategory === "lower_to_sea";
    const isMove = fin.opCategory === "move";

    if ((isLift || isMove) && res.userId) {
      let targetZoneId = finalZoneId;
      if (!targetZoneId && isLift) {
        const allZones = await db.select().from(landZones).where(eq(landZones.isActive, true));
        if (allZones.length > 0) targetZoneId = allZones[0].id;
      }
      if (targetZoneId) {
        const activeOcc = await getActiveOccupancyByVessel(res.vesselId);
        if (activeOcc) {
          if (activeOcc.zoneId !== targetZoneId) {
            await db
              .update(landOccupancies)
              .set({
                zoneId: targetZoneId,
                updatedAt: new Date(),
                note: params.operatorNotes
                  ? `${activeOcc.note || ""} | Premješteno: ${params.operatorNotes}`.trim()
                  : activeOcc.note,
              })
              .where(eq(landOccupancies.id, activeOcc.id));
          }
        } else {
          await createLandOccupancy({
            vesselId: res.vesselId,
            userId: res.userId,
            zoneId: targetZoneId,
            spotNumber: params.spotNumber,
            reservationId: res.id,
            liftedAt: effectiveCompletedAt,
            createdBy: params.operatorId,
            note: fin.isTruckDelivery
              ? `[KAMION] ${params.operatorNotes || "Iskrcaj novog broda s kamiona na kopno"}`
              : params.operatorNotes || "Smješteno na kopno po izvršenju operacije",
          });
        }
        await db.update(reservations).set({ landZoneId: targetZoneId }).where(eq(reservations.id, res.id));
      }
    } else if (isLower) {
      const activeOcc = await getActiveOccupancyByVessel(res.vesselId);
      if (activeOcc) {
        await completeLandOccupancy(activeOcc.id, res.id, effectiveCompletedAt);
      }
    }
  }

  // Apply statutory rights and card entry only if not already applied
  if (order && !alreadyHadCompletedOrder) {
    const vesselName = vessel?.name || res.vesselName || "Plovilo";
    const vesselRegistration = vessel?.registration || res.vesselRegistration || "";

    if (fin.clientType === "member") {
      if (fin.isStatutoryCovered) {
        if (fin.quotaOperationType === "lift") {
          await db
            .update(memberStatutoryRights)
            .set({ liftAvailable: false, updatedAt: new Date() })
            .where(eq(memberStatutoryRights.userId, user.id));
        } else if (fin.quotaOperationType === "lower") {
          await db
            .update(memberStatutoryRights)
            .set({ lowerAvailable: false, updatedAt: new Date() })
            .where(eq(memberStatutoryRights.userId, user.id));
        }

        await db.insert(userCardEntries).values({
          userId: user.id,
          workOrderId: order.id,
          entryType: "statutory_quota_used",
          serviceItemCode: fin.quotaOperationType === "lift" ? "STAT-LIFT" : "STAT-LOWER",
          serviceItemName:
            fin.quotaOperationType === "lift"
              ? "Statutarno pravo: Vađenje iz mora (0,00 €)"
              : "Statutarno pravo: Spuštanje u more (0,00 €)",
          vesselName,
          vesselRegistration,
          eventDate: effectiveCompletedAt,
          note: `Radni nalog ${order.orderNumber} - Pokriveno godišnjom članarinom`,
          erpStatus: "pending",
        });
      } else {
        await db
          .update(memberStatutoryRights)
          .set({
            pendingFeeAdjustmentsCount: sql`${memberStatutoryRights.pendingFeeAdjustmentsCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(memberStatutoryRights.userId, user.id));

        await db.insert(userCardEntries).values({
          userId: user.id,
          workOrderId: order.id,
          entryType: "fee_adjustment_charge",
          serviceItemCode: fin.chargeItemCode || "USL-D9T",
          serviceItemName: fin.chargeItemName || "Korištenje dizalice 9T (Doplata članarine)",
          vesselName,
          vesselRegistration,
          eventDate: effectiveCompletedAt,
          note: `Radni nalog ${order.orderNumber} - Prekoračenje statutarne kvote (Evidentirano zaduženje za uvećanje članarine)`,
          erpStatus: "pending",
        });
      }
    } else {
      await db.insert(userCardEntries).values({
        userId: user.id,
        workOrderId: order.id,
        entryType: "commercial_service",
        serviceItemCode: "USL-VANJSKI-M",
        serviceItemName: `Komercijalno korištenje dizalice (${fin.vesselLengthM}m)`,
        vesselName,
        vesselRegistration,
        eventDate: effectiveCompletedAt,
        note: `Radni nalog ${order.orderNumber} - Iznos za fakturiranje: ${fin.commercialTotal || "0.00"} EUR`,
        erpStatus: "pending",
      });
    }

    const opType = fin.quotaOperationType && fin.quotaOperationType !== "none" ? fin.quotaOperationType : "lift";
    await db.insert(craneOperationLog).values({
      craneId: chosenCraneId,
      reservationId: res.id,
      operationType: opType,
      startTime: effectiveStartTime,
      endTime: effectiveCompletedAt,
      durationMinutes: actualDurationMin,
      operatorId: params.operatorId,
      note: `Radni nalog ${order.orderNumber} završen.`,
    });
  }

  // Update reservation status to completed
  await db
    .update(reservations)
    .set({
      status: "completed",
      completedAt: effectiveCompletedAt,
      adminNote: params.operatorNotes ? params.operatorNotes : res.adminNote,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, res.id));

  // Mark predecessor dependencies as fulfilled
  await db
    .update(operationDependencies)
    .set({
      status: "fulfilled",
      updatedAt: new Date(),
    })
    .where(eq(operationDependencies.predecessorReservationId, res.id));

  if (params.operatorId && order) {
    await createAuditEntry({
      actorId: params.operatorId,
      action: "work_order_completed_retroactive",
      entityType: "work_orders",
      entityId: order.id,
      payload: {
        orderNumber: order.orderNumber,
        actualDurationMin,
        effectiveStartTime,
        effectiveCompletedAt,
      },
    });
  }

  return { success: true, workOrder: order };
}
