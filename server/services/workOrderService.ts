import { TRPCError } from "@trpc/server";
import { eq, and, ne, sql, isNull } from "drizzle-orm";
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
  invoices,
} from "../../drizzle/schema";
import { generateWorkOrderNumber } from "./numberingService";
import {
  ensureMemberStatutoryRights,
  evaluateQuotaOperationType,
  determineMemberFeeAdjustmentItem,
  calculateCommercialPricing,
} from "./statutoryQuotaService";

export { ensureMemberStatutoryRights };

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
  currentYear: number,
  craneId?: string | null
) {
  const isMember = (user.clientCategory || "member") === "member";
  const clientType: "member" | "external" = isMember ? "member" : "external";

  const { quotaOperationType, opCategory, isTruckDelivery } = await evaluateQuotaOperationType(
    db,
    res.serviceTypeId,
    res.liftPurpose
  );

  let isStatutoryCovered = false;
  let chargeItemCode: string | null = null;
  let chargeItemName: string | null = null;
  let commercialPricePerMeter: string | null = null;
  let commercialTotal: string | null = null;
  let vatRate = "25.00";
  const rawVesselLengthM = res.vesselLengthM || vessel?.lengthM || null;
  let vesselLengthM = rawVesselLengthM ? String(rawVesselLengthM) : null;

  if (isMember) {
    const rights = await ensureMemberStatutoryRights(db, user.id, currentYear, { forUpdate: true });

    if (quotaOperationType === "lift" && rights?.liftAvailable) {
      isStatutoryCovered = true;
    } else if (quotaOperationType === "lower" && rights?.lowerAvailable) {
      isStatutoryCovered = true;
    } else {
      isStatutoryCovered = false;
      const feeItem = await determineMemberFeeAdjustmentItem(db, craneId || res.craneId);
      chargeItemCode = feeItem.code;
      chargeItemName = feeItem.name;
    }
  } else {
    // External commercial client: strict validation (no fallback to arbitrary 8m)
    const comm = await calculateCommercialPricing(db, rawVesselLengthM);
    commercialPricePerMeter = comm.ratePerMeter;
    commercialTotal = comm.totalWithVat;
    vesselLengthM = comm.vesselLengthM;
    chargeItemCode = comm.chargeItemCode;
    chargeItemName = comm.chargeItemName;
    vatRate = comm.vatRate;
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
    vatRate,
  };
}

/**
 * Unified domain service to start a Work Order (RN-YYYY-XXXXX) for a reservation.
 * Used by both tRPC (workOrders.startFromReservation) and Mobile REST API (/reservations/:id/start-work).
 */
export async function startReservationWorkOrder(params: StartWorkOrderParams) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

  const result = await db.transaction(async (tx) => {
    const [res] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, params.reservationId))
      .for("update")
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

    // Check if active or completed work order already exists (locked)
    const [existing] = await tx
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.reservationId, params.reservationId), ne(workOrders.status, "cancelled")))
      .for("update")
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
        const [firstCrane] = await tx
          .select({ id: cranes.id })
          .from(cranes)
          .where(eq(cranes.craneStatus, "active"))
          .limit(1);
        chosenCraneId = firstCrane?.id || null;
      }
      if (chosenCraneId && !res.craneId) {
        await tx
          .update(reservations)
          .set({ craneId: chosenCraneId, updatedAt: new Date() })
          .where(eq(reservations.id, res.id));
      }
    }

    if (!chosenCraneId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nema dostupne dizalice za rezervaciju." });
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, res.userId))
      .for("update")
      .limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

    const [vessel] = res.vesselId
      ? await tx.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
      : [null];

    const currentYear = new Date().getFullYear();
    const orderNumber = await generateWorkOrderNumber(tx, currentYear);

    const fin = await evaluateWorkOrderFinancials(tx, res, user, vessel, currentYear, chosenCraneId);

    const [newOrder] = await tx
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
        vatRate: fin.vatRate || "25.00",
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
        const [resDef] = await tx
          .select()
          .from(resources)
          .where(eq(resources.id, resItem.resourceId))
          .limit(1);
        if (resDef) {
          const unitPrice = Number(resDef.pricePerUnitEur) || 0;
          const qty = Number(resItem.quantity) || 1;
          const totalPrice = Number((unitPrice * qty).toFixed(2));
          await tx.insert(workOrderResources).values({
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

    return {
      success: true,
      workOrder: newOrder,
      alreadyRunning: false,
      fin,
      resourcesCount: resourcesToApply?.length || 0,
    };
  });

  if (result.workOrder && !result.alreadyRunning) {
    await createAuditEntry({
      actorId: params.operatorId,
      action: params.auditAction || "work_order_started",
      entityType: "work_orders",
      entityId: result.workOrder.id,
      payload: {
        orderNumber: result.workOrder.orderNumber,
        reservationId: params.reservationId,
        isStatutoryCovered: result.fin?.isStatutoryCovered,
        clientType: result.fin?.clientType,
        resourcesCount: result.resourcesCount,
      },
    });
  }

  return { success: result.success, workOrder: result.workOrder, alreadyRunning: result.alreadyRunning };
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

  const result = await db.transaction(async (tx) => {
    // 1. Pessimistic row locking on reservation to prevent concurrent double-completion
    const [res] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, params.reservationId))
      .for("update");

    if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });

    if (res.status === "completed") {
      const [existingWo] = await tx
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

    // Also lock existing work orders for this reservation
    const [existing] = await tx
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.reservationId, params.reservationId), ne(workOrders.status, "cancelled")))
      .for("update");

    let order = existing;

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, res.userId))
      .for("update")
      .limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen." });

    const [vessel] = res.vesselId
      ? await tx.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1)
      : [null];

    let chosenCraneId = params.craneId || res.craneId;
    if (!chosenCraneId) {
      const [firstActiveCrane] = await tx
        .select({ id: cranes.id })
        .from(cranes)
        .where(eq(cranes.craneStatus, "active"))
        .limit(1);
      chosenCraneId = firstActiveCrane?.id || null;
    }
    if (!chosenCraneId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Dizalica mora biti odabrana za zaključenje operacije." });
    }

    const currentYear = new Date().getFullYear();
    const fin = await evaluateWorkOrderFinancials(tx, res, user, vessel, currentYear, chosenCraneId);

    const alreadyHadCompletedOrder = !!(existing && existing.status === "completed");

    if (existing && existing.status === "in_progress") {
      // Update with full financial fields to ensure work order and user card match 100%!
      await tx
        .update(workOrders)
        .set({
          status: "completed",
          clientType: fin.clientType,
          isStatutoryCovered: fin.isStatutoryCovered,
          quotaOperationType: fin.quotaOperationType,
          chargeItemCode: fin.chargeItemCode,
          chargeItemName: fin.chargeItemName,
          vesselLengthM: fin.vesselLengthM,
          commercialPricePerMeter: fin.commercialPricePerMeter,
          commercialTotal: fin.commercialTotal,
          vatRate: fin.vatRate || "25.00",
          startedAt: effectiveStartTime,
          completedAt: effectiveCompletedAt,
          actualDurationMin,
          operatorNotes: params.operatorNotes || existing.operatorNotes,
          craneId: chosenCraneId,
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, existing.id));

      const [freshOrder] = await tx.select().from(workOrders).where(eq(workOrders.id, existing.id)).limit(1);
      order = freshOrder;
    } else if (!existing) {
      const orderNumber = await generateWorkOrderNumber(tx, currentYear);
      const [created] = await tx
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
          vatRate: fin.vatRate || "25.00",
          startedAt: effectiveStartTime,
          completedAt: effectiveCompletedAt,
          actualDurationMin,
          operatorNotes: params.operatorNotes || null,
          erpSyncStatus: "pending",
        })
        .returning();
      order = created;
    }

    // Resources handling inside tx
    if (order && params.resources && params.resources.length > 0) {
      await tx.delete(workOrderResources).where(eq(workOrderResources.workOrderId, order.id));
      for (const resItem of params.resources) {
        const [resDef] = await tx
          .select()
          .from(resources)
          .where(eq(resources.id, resItem.resourceId))
          .limit(1);
        if (resDef) {
          const unitPrice = Number(resDef.pricePerUnitEur) || 0;
          const totalPrice = Number((unitPrice * resItem.quantity).toFixed(2));
          await tx.insert(workOrderResources).values({
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

    // Land occupancy management inside tx
    const finalZoneId =
      params.zoneId !== undefined
        ? (params.zoneId === "none" ? null : params.zoneId)
        : res.landZoneId;

    if (res.vesselId) {
      const isLift = fin.opCategory === "lift_from_sea";
      const isLower = fin.opCategory === "lower_to_sea";
      const isMove = fin.opCategory === "move";
      const isTruckDelivery = fin.isTruckDelivery;
      const isLandPlacement = isLift || isMove || isTruckDelivery;

      const isDirectToTruck =
        res.liftPurpose?.toLowerCase().includes("more -> kamion") ||
        res.liftPurpose?.toLowerCase().includes("direktan ukrcaj") ||
        res.liftPurpose?.toLowerCase().includes("direktno na kamion") ||
        params.operatorNotes?.toLowerCase().includes("direktan ukrcaj") ||
        params.operatorNotes?.toLowerCase().includes("direktno na kamion") ||
        res.adminNote?.toLowerCase().includes("direktan ukrcaj");

      // Only manage land occupancy if this is a land placement (lift/move/truck arrival) AND a land zone is actually designated
      // If finalZoneId is null or isDirectToTruck, it is "Samo dizalica (bez mjesta na kopnu)" and must NOT occupy dry berth!
      if (isLandPlacement && res.userId && !isDirectToTruck && finalZoneId) {
        const targetZoneId = finalZoneId;
        const [activeOcc] = await tx
          .select()
          .from(landOccupancies)
          .where(and(eq(landOccupancies.vesselId, res.vesselId), isNull(landOccupancies.returnedAt)))
          .limit(1);

        if (activeOcc) {
          if (activeOcc.zoneId !== targetZoneId) {
            await tx
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
          await tx.insert(landOccupancies).values({
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
        await tx.update(reservations).set({ landZoneId: targetZoneId }).where(eq(reservations.id, res.id));
      } else if (isLandPlacement && (!finalZoneId || isDirectToTruck)) {
        // Samo dizalica (bez mjesta na kopnu) or Direct to truck:
        // Ensure reservation landZoneId is null and no land spot is occupied
        if (res.landZoneId) {
          await tx.update(reservations).set({ landZoneId: null }).where(eq(reservations.id, res.id));
        }
      } else if (isLower) {
        const [activeOcc] = await tx
          .select()
          .from(landOccupancies)
          .where(and(eq(landOccupancies.vesselId, res.vesselId), isNull(landOccupancies.returnedAt)))
          .limit(1);

        if (activeOcc) {
          await tx
            .update(landOccupancies)
            .set({
              returnedAt: effectiveCompletedAt,
              returnReservationId: res.id,
              updatedAt: new Date(),
            })
            .where(eq(landOccupancies.id, activeOcc.id));
        }
      }
    }

    // Apply statutory rights and card entry inside tx
    if (order && !alreadyHadCompletedOrder) {
      const vesselName = vessel?.name || res.vesselName || "Plovilo";
      const vesselRegistration = vessel?.registration || res.vesselRegistration || "";

      if (fin.clientType === "member") {
        if (fin.isStatutoryCovered) {
          if (fin.quotaOperationType === "lift") {
            await tx
              .update(memberStatutoryRights)
              .set({
                liftAvailable: false,
                liftAcquiredYear: currentYear,
                updatedAt: new Date(),
              })
              .where(eq(memberStatutoryRights.userId, user.id));
          } else if (fin.quotaOperationType === "lower") {
            await tx
              .update(memberStatutoryRights)
              .set({
                lowerAvailable: false,
                lowerAcquiredYear: currentYear,
                updatedAt: new Date(),
              })
              .where(eq(memberStatutoryRights.userId, user.id));
          }

          await tx.insert(userCardEntries).values({
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
          await tx
            .update(memberStatutoryRights)
            .set({
              pendingFeeAdjustmentsCount: sql`${memberStatutoryRights.pendingFeeAdjustmentsCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(memberStatutoryRights.userId, user.id));

          await tx.insert(userCardEntries).values({
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
        await tx.insert(userCardEntries).values({
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
      await tx.insert(craneOperationLog).values({
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
    await tx
      .update(reservations)
      .set({
        status: "completed",
        completedAt: effectiveCompletedAt,
        adminNote: params.operatorNotes ? params.operatorNotes : res.adminNote,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, res.id));

    // Mark predecessor dependencies as fulfilled
    await tx
      .update(operationDependencies)
      .set({
        status: "fulfilled",
        updatedAt: new Date(),
      })
      .where(eq(operationDependencies.predecessorReservationId, res.id));

    return { success: true, workOrder: order, alreadyCompleted: false };
  });

  if (params.operatorId && result.workOrder && !result.alreadyCompleted) {
    await createAuditEntry({
      actorId: params.operatorId,
      action: "work_order_completed_retroactive",
      entityType: "work_orders",
      entityId: result.workOrder.id,
      payload: {
        orderNumber: result.workOrder.orderNumber,
        actualDurationMin: params.actualDurationMin,
        effectiveStartTime: params.startTime,
        completedAt: new Date(),
      },
    });
  }

  return result;
}

/**
 * Shared transaction helper to verify no invoice/ERP sync blocks modification,
 * delete pending userCardEntries for the work order, and restore memberStatutoryRights.
 */
async function reverseWorkOrderFinancialEffectsTx(
  tx: any,
  order: typeof workOrders.$inferSelect,
  reservationId?: string | null
) {
  if (reservationId) {
    const existingInvoices = await tx
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.reservationId, reservationId))
      .limit(1);
    if (existingInvoices.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Za ovu rezervaciju već je izdan dokument/račun (${existingInvoices[0].invoiceNumber}). Prvo ga uklonite ili stornirajte prije ispravka naloga.`,
      });
    }
  }

  const syncedEntries = await tx
    .select({ id: userCardEntries.id })
    .from(userCardEntries)
    .where(and(eq(userCardEntries.workOrderId, order.id), eq(userCardEntries.erpStatus, "synced")))
    .limit(1);
  if (syncedEntries.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Stavka na kartonu korisnika je već sinkronizirana s e-Računima i ne može se automatski poništiti.",
    });
  }

  await tx.delete(userCardEntries).where(eq(userCardEntries.workOrderId, order.id));

  if (order.clientType === "member" && order.userId) {
    if (order.isStatutoryCovered) {
      if (order.quotaOperationType === "lift") {
        await tx
          .update(memberStatutoryRights)
          .set({ liftAvailable: true, updatedAt: new Date() })
          .where(eq(memberStatutoryRights.userId, order.userId));
      } else if (order.quotaOperationType === "lower") {
        await tx
          .update(memberStatutoryRights)
          .set({ lowerAvailable: true, updatedAt: new Date() })
          .where(eq(memberStatutoryRights.userId, order.userId));
      }
    } else {
      await tx
        .update(memberStatutoryRights)
        .set({
          pendingFeeAdjustmentsCount: sql`GREATEST(0, ${memberStatutoryRights.pendingFeeAdjustmentsCount} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(memberStatutoryRights.userId, order.userId));
    }
  }
}

export interface AdminRevertCompletionParams {
  reservationId: string;
  adminId: string;
  reason: string;
  targetStatus?: "approved" | "pending";
}

/**
 * Atomically reverts a completed reservation / work order back to approved or pending:
 * restores statutory rights, deletes pending card entries, reverses land occupancy changes,
 * cancels the work order, and logs full before/after audit trail.
 */
export async function adminRevertReservationCompletion(params: AdminRevertCompletionParams) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

  const targetStatus = params.targetStatus || "approved";

  const result = await db.transaction(async (tx) => {
    const [res] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, params.reservationId))
      .for("update");

    if (!res) throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija nije pronađena." });
    if (res.status !== "completed") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Samo završene rezervacije mogu se poništiti ovim alatom.",
      });
    }

    const activeOrders = await tx
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.reservationId, res.id), ne(workOrders.status, "cancelled")))
      .for("update");

    for (const order of activeOrders) {
      await reverseWorkOrderFinancialEffectsTx(tx, order, res.id);
      await tx
        .update(workOrders)
        .set({
          status: "cancelled",
          operatorNotes: order.operatorNotes
            ? `${order.operatorNotes}\n[ADMIN PONIŠTENJE]: ${params.reason}`
            : `[ADMIN PONIŠTENJE]: ${params.reason}`,
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, order.id));
    }

    // Reverse land occupancies created or closed by this reservation
    const createdOccs = await tx
      .select()
      .from(landOccupancies)
      .where(eq(landOccupancies.reservationId, res.id))
      .for("update");

    for (const occ of createdOccs) {
      if (occ.returnedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Plovilo je nakon ovog vađenja već spušteno u more kasnijim nalogom. Prvo poništite nalog spuštanja.",
        });
      }
      await tx.delete(landOccupancies).where(eq(landOccupancies.id, occ.id));
    }

    const closedOccs = await tx
      .select()
      .from(landOccupancies)
      .where(eq(landOccupancies.returnReservationId, res.id))
      .for("update");

    for (const occ of closedOccs) {
      await tx
        .update(landOccupancies)
        .set({
          returnedAt: null,
          returnReservationId: null,
          updatedAt: new Date(),
        })
        .where(eq(landOccupancies.id, occ.id));
    }

    await tx.delete(craneOperationLog).where(eq(craneOperationLog.reservationId, res.id));

    const updatedAdminNote = res.adminNote
      ? `${res.adminNote}\n[ADMIN PONIŠTENJE]: ${params.reason}`
      : `[ADMIN PONIŠTENJE]: ${params.reason}`;

    await tx
      .update(reservations)
      .set({
        status: targetStatus,
        completedAt: null,
        landZoneId: targetStatus === "pending" ? null : res.landZoneId,
        craneId: targetStatus === "pending" ? null : res.craneId,
        scheduledStart: targetStatus === "pending" ? null : res.scheduledStart,
        scheduledEnd: targetStatus === "pending" ? null : res.scheduledEnd,
        adminNote: updatedAdminNote,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, res.id));

    return {
      reservationId: res.id,
      reservationNumber: res.reservationNumber,
      cancelledWorkOrders: activeOrders.map((o) => o.orderNumber),
      deletedOccupancies: createdOccs.length,
      reopenedOccupancies: closedOccs.length,
      targetStatus,
    };
  });

  await createAuditEntry({
    actorId: params.adminId,
    action: "admin_reverted_completion",
    entityType: "reservation",
    entityId: params.reservationId,
    payload: { ...result, reason: params.reason },
  });

  return { success: true, ...result };
}

export interface AdminCorrectWorkOrderParams {
  workOrderId: string;
  adminId: string;
  reason: string;
  userId?: string;
  vesselId?: string;
  craneId?: string;
  startedAt?: Date;
  actualDurationMin?: number;
  craneOnly?: boolean;
  zoneId?: string | null;
  spotNumber?: number | null;
  operatorNotes?: string;
}

/**
 * Allows an admin to correct a completed (or in-progress) work order in place:
 * swap owner/vessel (recomputing statutory rights & card entries), change crane,
 * adjust start/completion time & duration, or toggle land zone / "Samo dizalica".
 */
export async function adminCorrectCompletedWorkOrder(params: AdminCorrectWorkOrderParams) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna." });

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, params.workOrderId))
      .for("update");

    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Radni nalog nije pronađen." });
    if (order.status === "cancelled") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Stornirani radni nalog nije moguće uređivati." });
    }

    const res = order.reservationId
      ? (await tx.select().from(reservations).where(eq(reservations.id, order.reservationId)).for("update"))[0]
      : null;

    const targetUserId = params.userId || order.userId;
    const targetVesselId = params.vesselId !== undefined ? params.vesselId : order.vesselId;
    const targetCraneId = params.craneId || order.craneId;
    const targetStartedAt = params.startedAt || order.startedAt || new Date();
    const targetDurationMin = params.actualDurationMin ?? order.actualDurationMin ?? 30;
    const targetCompletedAt =
      order.status === "completed"
        ? new Date(targetStartedAt.getTime() + targetDurationMin * 60 * 1000)
        : order.completedAt;

    const [newUser] = await tx.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!newUser) throw new TRPCError({ code: "NOT_FOUND", message: "Odabrani korisnik nije pronađen." });

    const [newVessel] = targetVesselId
      ? await tx.select().from(vessels).where(eq(vessels.id, targetVesselId)).limit(1)
      : [null];
    if (targetVesselId && !newVessel) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Odabrano plovilo nije pronađeno." });
    }

    const ownerOrVesselChanged =
      targetUserId !== order.userId ||
      targetVesselId !== order.vesselId ||
      targetCraneId !== order.craneId;

    let finUpdates: Partial<typeof workOrders.$inferInsert> = {};

    if (order.status === "completed" && ownerOrVesselChanged && res) {
      await reverseWorkOrderFinancialEffectsTx(tx, order, res.id);

      const resSnapshot = {
        ...res,
        userId: targetUserId,
        vesselId: targetVesselId,
        vesselLengthM: newVessel?.lengthM || res.vesselLengthM,
        craneId: targetCraneId,
      };
      const effectiveYear = targetCompletedAt ? targetCompletedAt.getFullYear() : new Date().getFullYear();
      const fin = await evaluateWorkOrderFinancials(tx, resSnapshot, newUser, newVessel, effectiveYear, targetCraneId);

      finUpdates = {
        clientType: fin.clientType,
        isStatutoryCovered: fin.isStatutoryCovered,
        quotaOperationType: fin.quotaOperationType,
        chargeItemCode: fin.chargeItemCode,
        chargeItemName: fin.chargeItemName,
        commercialPricePerMeter: fin.commercialPricePerMeter,
        commercialTotal: fin.commercialTotal,
        vesselLengthM: fin.vesselLengthM,
      };

      const vName = newVessel?.name || res.vesselName || "Plovilo";
      const vReg = newVessel?.registration || res.vesselRegistration || "";
      const eventDt = targetCompletedAt || new Date();

      if (fin.clientType === "member") {
        if (fin.isStatutoryCovered) {
          if (fin.quotaOperationType === "lift") {
            await tx
              .update(memberStatutoryRights)
              .set({ liftAvailable: false, liftAcquiredYear: effectiveYear, updatedAt: new Date() })
              .where(eq(memberStatutoryRights.userId, newUser.id));
          } else if (fin.quotaOperationType === "lower") {
            await tx
              .update(memberStatutoryRights)
              .set({ lowerAvailable: false, lowerAcquiredYear: effectiveYear, updatedAt: new Date() })
              .where(eq(memberStatutoryRights.userId, newUser.id));
          }
          await tx.insert(userCardEntries).values({
            userId: newUser.id,
            workOrderId: order.id,
            entryType: "statutory_quota_used",
            serviceItemCode: fin.quotaOperationType === "lift" ? "STAT-LIFT" : "STAT-LOWER",
            serviceItemName:
              fin.quotaOperationType === "lift"
                ? "Statutarno pravo: Vađenje iz mora (0,00 €)"
                : "Statutarno pravo: Spuštanje u more (0,00 €)",
            vesselName: vName,
            vesselRegistration: vReg,
            eventDate: eventDt,
            note: `Radni nalog ${order.orderNumber} (Ispravak admina) - Pokriveno godišnjom članarinom`,
            erpStatus: "pending",
          });
        } else {
          await tx
            .update(memberStatutoryRights)
            .set({
              pendingFeeAdjustmentsCount: sql`${memberStatutoryRights.pendingFeeAdjustmentsCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(memberStatutoryRights.userId, newUser.id));

          await tx.insert(userCardEntries).values({
            userId: newUser.id,
            workOrderId: order.id,
            entryType: "fee_adjustment_charge",
            serviceItemCode: fin.chargeItemCode || "USL-D9T",
            serviceItemName: fin.chargeItemName || "Korištenje dizalice (Doplata članarine)",
            vesselName: vName,
            vesselRegistration: vReg,
            eventDate: eventDt,
            note: `Radni nalog ${order.orderNumber} (Ispravak admina) - Prekoračenje statutarne kvote`,
            erpStatus: "pending",
          });
        }
      } else {
        await tx.insert(userCardEntries).values({
          userId: newUser.id,
          workOrderId: order.id,
          entryType: "commercial_service",
          serviceItemCode: "USL-VANJSKI-M",
          serviceItemName: `Komercijalno korištenje dizalice (${fin.vesselLengthM}m)`,
          vesselName: vName,
          vesselRegistration: vReg,
          eventDate: eventDt,
          note: `Radni nalog ${order.orderNumber} (Ispravak admina) - Iznos: ${fin.commercialTotal || "0.00"} EUR`,
          erpStatus: "pending",
        });
      }
    } else if (params.startedAt && order.status === "completed") {
      await tx
        .update(userCardEntries)
        .set({ eventDate: targetCompletedAt || targetStartedAt })
        .where(eq(userCardEntries.workOrderId, order.id));
    }

    const updatedNotes =
      params.operatorNotes !== undefined
        ? params.operatorNotes
        : order.operatorNotes
          ? `${order.operatorNotes}\n[ADMIN ISPRAVAK]: ${params.reason}`
          : `[ADMIN ISPRAVAK]: ${params.reason}`;

    await tx
      .update(workOrders)
      .set({
        userId: targetUserId,
        vesselId: targetVesselId,
        craneId: targetCraneId,
        startedAt: targetStartedAt,
        completedAt: targetCompletedAt,
        actualDurationMin: targetDurationMin,
        operatorNotes: updatedNotes,
        updatedAt: new Date(),
        ...finUpdates,
      })
      .where(eq(workOrders.id, order.id));

    // Sync reservation fields if linked
    const finalLandZoneId = params.craneOnly
      ? null
      : params.zoneId !== undefined
        ? params.zoneId
        : res?.landZoneId ?? null;

    if (res) {
      await tx
        .update(reservations)
        .set({
          userId: targetUserId,
          vesselId: targetVesselId,
          vesselName: newVessel?.name || res.vesselName,
          vesselRegistration: newVessel?.registration || res.vesselRegistration,
          vesselLengthM: newVessel?.lengthM || res.vesselLengthM,
          contactPhone: newUser.phone || res.contactPhone,
          craneId: targetCraneId,
          landZoneId: finalLandZoneId,
          scheduledStart: targetStartedAt,
          scheduledEnd: targetCompletedAt || new Date(targetStartedAt.getTime() + targetDurationMin * 60 * 1000),
          durationMin: targetDurationMin,
          completedAt: order.status === "completed" ? targetCompletedAt : res.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, res.id));

      await tx
        .update(craneOperationLog)
        .set({
          craneId: targetCraneId || undefined,
          startTime: targetStartedAt,
          endTime: targetCompletedAt || targetStartedAt,
          durationMinutes: targetDurationMin,
        })
        .where(eq(craneOperationLog.reservationId, res.id));
    }

    // Sync landOccupancies created by this reservation
    if (res) {
      const [occ] = await tx
        .select()
        .from(landOccupancies)
        .where(eq(landOccupancies.reservationId, res.id))
        .for("update")
        .limit(1);

      if (params.craneOnly) {
        if (occ && !occ.returnedAt) {
          await tx.delete(landOccupancies).where(eq(landOccupancies.id, occ.id));
        }
      } else if (occ) {
        await tx
          .update(landOccupancies)
          .set({
            userId: targetUserId,
            vesselId: targetVesselId || occ.vesselId,
            zoneId: finalLandZoneId || occ.zoneId,
            spotNumber: params.spotNumber !== undefined ? params.spotNumber : occ.spotNumber,
            liftedAt: targetCompletedAt || targetStartedAt,
            updatedAt: new Date(),
          })
          .where(eq(landOccupancies.id, occ.id));
      } else if (finalLandZoneId && targetVesselId && order.status === "completed") {
        await tx.insert(landOccupancies).values({
          vesselId: targetVesselId,
          userId: targetUserId,
          zoneId: finalLandZoneId,
          spotNumber: params.spotNumber ?? undefined,
          reservationId: res.id,
          liftedAt: targetCompletedAt || targetStartedAt,
          createdBy: params.adminId,
          note: `Ispravak radnog naloga ${order.orderNumber}: ${params.reason}`,
        });
      }
    }

    return {
      workOrderId: order.id,
      orderNumber: order.orderNumber,
      before: {
        userId: order.userId,
        vesselId: order.vesselId,
        craneId: order.craneId,
        startedAt: order.startedAt,
        actualDurationMin: order.actualDurationMin,
        landZoneId: res?.landZoneId ?? null,
      },
      after: {
        userId: targetUserId,
        vesselId: targetVesselId,
        craneId: targetCraneId,
        startedAt: targetStartedAt,
        actualDurationMin: targetDurationMin,
        landZoneId: finalLandZoneId,
        craneOnly: !!params.craneOnly,
      },
    };
  });

  await createAuditEntry({
    actorId: params.adminId,
    action: "admin_work_order_corrected",
    entityType: "work_orders",
    entityId: params.workOrderId,
    payload: { ...result, reason: params.reason },
  });

  return { success: true, ...result };
}
