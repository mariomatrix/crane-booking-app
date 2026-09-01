import { Router, Request, Response } from "express";
import { getUserByPin, getOperatorCranes, getDb, getUserById, getReservationById, createLandOccupancy, completeLandOccupancy, logCraneOperation, createAuditEntry } from "../db";
import {
    users,
    reservations,
    cranes,
    vessels,
    serviceTypes,
    landZones,
    landOccupancies,
    messages,
    workOrders,
    memberStatutoryRights,
    userCardEntries,
    priceListItems,
    resources,
    workOrderResources,
} from "../../drizzle/schema";
import { eq, and, inArray, gte, lte, isNull, desc, asc, count, sql, ne } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "../_core/context";
import { sendNewMessageNotification } from "../_core/email";
import { sendSms } from "../_core/sms";

const router = Router();

interface AuthenticatedRequest extends Request {
    operatorUser?: {
        id: string;
        email: string;
        name: string | null;
        role: string;
    };
}

async function requireMobileAuth(req: AuthenticatedRequest, res: Response, next: () => void) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.substring(7);
    try {
        const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
        req.operatorUser = {
            id: payload.sub as string,
            email: payload.email as string,
            name: (payload.name as string) || null,
            role: (payload.role as string) || "operator",
        };
        next();
    } catch (e: any) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

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

// 1. PIN Login: POST /api/mobile/v1/auth/pin-login
router.post("/auth/pin-login", async (req: Request, res: Response) => {
    const { pin } = req.body;
    if (!pin || typeof pin !== "string") {
        return res.status(400).json({ error: "PIN code is required" });
    }
    try {
        const user = await getUserByPin(pin.trim());
        if (!user) {
            return res.status(401).json({ error: "Neispravan PIN ili neaktivan račun" });
        }
        if (user.role !== "operator" && user.role !== "admin") {
            return res.status(403).json({ error: "Pristup dopušten samo operaterima i administratorima" });
        }

        const token = await new SignJWT({
            sub: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        })
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(getJwtSecret());

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phone: user.phone,
            },
        });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Internal server error" });
    }
});

// 2. Operator Profile & Assigned Cranes: GET /api/mobile/v1/profile
router.get("/profile", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const assignedCraneIds = await getOperatorCranes(user.id);
    const db = await getDb();
    let assignedCranesList: any[] = [];
    if (db && assignedCraneIds.length > 0) {
        assignedCranesList = await db.select().from(cranes).where(inArray(cranes.id, assignedCraneIds));
    } else if (db && user.role === "admin") {
        assignedCranesList = await db.select().from(cranes);
    }
    return res.json({
        user,
        assignedCranes: assignedCranesList,
    });
});

// 3. Today's Chronological Schedule: GET /api/mobile/v1/schedule/today
router.get("/schedule/today", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const dateParam = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const assignedCraneIds = await getOperatorCranes(user.id);

    const dateCondition = sql`(
        ${reservations.requestedDate} = ${dateParam}
        OR to_char(${reservations.scheduledStart} AT TIME ZONE 'Europe/Zagreb', 'YYYY-MM-DD') = ${dateParam}
        OR to_char(${reservations.scheduledStart}, 'YYYY-MM-DD') = ${dateParam}
        OR DATE(${reservations.scheduledStart}) = ${dateParam}::date
    )`;

    const rows = await db.select({
        reservation: reservations,
        vessel: vessels,
        serviceType: serviceTypes,
        crane: cranes,
        owner: users,
        resLandZone: landZones,
    })
    .from(reservations)
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(users, eq(reservations.userId, users.id))
    .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
    .where(
        and(
            dateCondition,
            inArray(reservations.status, ["approved", "pending", "completed"])
        )
    )
    .orderBy(reservations.scheduledStart, reservations.requestedDate);

    let filteredRows = rows;
    if (assignedCraneIds.length > 0 && user.role !== "admin") {
        filteredRows = rows.filter(r => !r.reservation.craneId || assignedCraneIds.includes(r.reservation.craneId));
    }

    // Map active land occupancies for dry berth info
    const occupancies = await db.select({
        vesselId: landOccupancies.vesselId,
        zoneId: landOccupancies.zoneId,
        zoneCode: landZones.code,
        zoneName: landZones.name,
        spotNumber: landOccupancies.spotNumber,
    })
    .from(landOccupancies)
    .leftJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
    .where(isNull(landOccupancies.returnedAt));

    // Fetch active work orders for these reservations
    const resIds = filteredRows.map(r => r.reservation.id);
    let activeWorkOrders: any[] = [];
    if (resIds.length > 0) {
        activeWorkOrders = await db.select()
            .from(workOrders)
            .where(and(inArray(workOrders.reservationId, resIds), ne(workOrders.status, "cancelled")));
    }

    const result = filteredRows.map(r => {
        const occ = occupancies.find(o => o.vesselId === r.vessel?.id);
        const wOrder = activeWorkOrders.find(w => w.reservationId === r.reservation.id);

        // Effective status: if active work order is in_progress, status is in_progress
        const effectiveStatus = (wOrder && wOrder.status === "in_progress")
            ? "in_progress"
            : r.reservation.status;

        // Dry berth placement: check reservation direct zone assignment or active occupancy
        let dryBerth = null;
        if (r.resLandZone) {
            dryBerth = {
                zoneId: r.resLandZone.id,
                zoneCode: r.resLandZone.code,
                zoneName: r.resLandZone.name,
                spotNumber: occ?.spotNumber || null,
            };
        } else if (occ) {
            dryBerth = {
                zoneId: occ.zoneId,
                zoneCode: occ.zoneCode,
                zoneName: occ.zoneName,
                spotNumber: occ.spotNumber || null,
            };
        }

        return {
            id: r.reservation.id,
            reservationNumber: r.reservation.reservationNumber,
            status: effectiveStatus,
            scheduledStart: r.reservation.scheduledStart,
            scheduledEnd: r.reservation.scheduledEnd,
            durationMin: r.reservation.durationMin,
            requestedDate: r.reservation.requestedDate,
            requestedTimeSlot: r.reservation.requestedTimeSlot,
            workOrderId: wOrder?.id || null,
            workOrderNumber: wOrder?.orderNumber || null,
            workOrderStatus: wOrder?.status || null,
            vessel: r.vessel ? {
                id: r.vessel.id,
                name: r.vessel.name,
                type: r.vessel.type,
                registration: r.vessel.registration,
                lengthM: r.vessel.lengthM,
                beamM: r.vessel.beamM,
                weightTons: r.vessel.weightTons,
            } : null,
            owner: r.owner ? {
                id: r.owner.id,
                name: r.owner.name,
                phone: r.owner.phone,
                email: r.owner.email,
            } : null,
            serviceType: r.serviceType ? {
                id: r.serviceType.id,
                name: r.serviceType.name,
                category: r.serviceType.operationCategory,
            } : null,
            crane: r.crane ? {
                id: r.crane.id,
                name: r.crane.name,
            } : null,
            dryBerthPlacement: dryBerth,
        };
    });

    return res.json({ date: dateParam, tasks: result });
});

// 4. Start Work Order / Change to in_progress: POST /api/mobile/v1/reservations/:id/start-work
router.post("/reservations/:id/start-work", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { operatorNotes } = req.body;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [resRow] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!resRow) return res.status(404).json({ error: "Rezervacija nije pronađena" });

    // Check future date restriction
    const targetDate = resRow.scheduledStart ? new Date(resRow.scheduledStart) : (resRow.requestedDate ? new Date(resRow.requestedDate) : null);
    if (targetDate) {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (targetDate.getTime() > endOfToday.getTime()) {
            return res.status(400).json({ error: `Nije moguće pokrenuti radni nalog za budući datum (${targetDate.toLocaleDateString("hr-HR")}).` });
        }
    }

    // Check if work order already active
    const [existing] = await db.select().from(workOrders).where(and(eq(workOrders.reservationId, id), ne(workOrders.status, "cancelled"))).limit(1);
    if (existing) {
        if (existing.status === "in_progress") {
            return res.json({ success: true, workOrder: existing, status: "in_progress" });
        }
        if (existing.status === "completed") {
            return res.status(400).json({ error: `Za ovu rezervaciju već postoji zaključeni radni nalog (${existing.orderNumber}).` });
        }
    }

    let craneId = resRow.craneId;
    if (!craneId) {
        const assignedCraneIds = await getOperatorCranes(user.id);
        if (assignedCraneIds.length > 0) {
            craneId = assignedCraneIds[0];
        } else {
            const [firstCrane] = await db.select().from(cranes).where(eq(cranes.craneStatus, "active")).limit(1);
            if (!firstCrane) return res.status(400).json({ error: "Nema dostupne dizalice za rezervaciju." });
            craneId = firstCrane.id;
        }
        await db.update(reservations).set({ craneId, updatedAt: new Date() }).where(eq(reservations.id, id));
    }

    const [vessel] = resRow.vesselId ? await db.select().from(vessels).where(eq(vessels.id, resRow.vesselId)).limit(1) : [null];
    const [clientUser] = await db.select().from(users).where(eq(users.id, resRow.userId)).limit(1);

    const currentYear = new Date().getFullYear();
    const orderNumber = await generateWorkOrderNumber(db, currentYear);
    const isMember = (clientUser?.clientCategory || "member") === "member";
    const clientType: "member" | "external" = isMember ? "member" : "external";

    let quotaOperationType: "lift" | "lower" | "none" = "none";
    if (resRow.serviceTypeId) {
        const [st] = await db.select().from(serviceTypes).where(eq(serviceTypes.id, resRow.serviceTypeId)).limit(1);
        if (st?.operationCategory === "lift_from_sea") quotaOperationType = "lift";
        else if (st?.operationCategory === "lower_to_sea") quotaOperationType = "lower";
    }

    let isStatutoryCovered = false;
    let chargeItemCode: string | null = null;
    let chargeItemName: string | null = null;
    let commercialPricePerMeter: string | null = null;
    let commercialTotal: string | null = null;
    const vesselLengthM = resRow.vesselLengthM || (vessel?.lengthM ? String(vessel.lengthM) : "8.00");

    if (isMember && clientUser) {
        let [rights] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, clientUser.id)).limit(1);
        if (!rights) {
            const expiresAt = `${currentYear + 1}-12-31`;
            [rights] = await db.insert(memberStatutoryRights).values({
                userId: clientUser.id,
                liftAvailable: true,
                liftAcquiredYear: currentYear,
                liftExpiresAt: expiresAt,
                lowerAvailable: true,
                lowerAcquiredYear: currentYear,
                lowerExpiresAt: expiresAt,
                pendingFeeAdjustmentsCount: 0,
            }).returning();
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
        const [priceItem] = await db.select().from(priceListItems).where(and(eq(priceListItems.code, "USL-VANJSKI-M"), eq(priceListItems.isActive, true))).limit(1);
        const ratePerMeter = priceItem?.pricePerMeterEur ? Number(priceItem.pricePerMeterEur) : 12.00;
        const length = Number(vesselLengthM) || 8.0;
        const baseAmount = length * ratePerMeter;
        const totalWithVat = baseAmount * 1.25;
        commercialPricePerMeter = ratePerMeter.toFixed(2);
        commercialTotal = totalWithVat.toFixed(2);
        isStatutoryCovered = false;
    }

    const [newOrder] = await db.insert(workOrders).values({
        orderNumber,
        reservationId: resRow.id,
        userId: resRow.userId,
        vesselId: resRow.vesselId || null,
        craneId,
        operatorId: user.id,
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
        operatorNotes: operatorNotes || null,
        erpSyncStatus: "pending",
    }).returning();

    await createAuditEntry({
        actorId: user.id,
        action: "mobile_work_order_started",
        entityType: "work_orders",
        entityId: newOrder.id,
        payload: { orderNumber, reservationId: id },
    });

    return res.json({ success: true, workOrder: newOrder, status: "in_progress" });
});

// 5. Complete Work Order / Finish Job: POST /api/mobile/v1/reservations/:id/complete-work
router.post("/reservations/:id/complete-work", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { durationMin = 30, operatorNotes, zoneId, spotNumber } = req.body;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [resRow] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!resRow) return res.status(404).json({ error: "Rezervacija nije pronađena" });

    // Check future date restriction
    const targetDate = resRow.scheduledStart ? new Date(resRow.scheduledStart) : (resRow.requestedDate ? new Date(resRow.requestedDate) : null);
    if (targetDate) {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (targetDate.getTime() > endOfToday.getTime()) {
            return res.status(400).json({ error: `Nije moguće završiti rezervaciju zakazanu za budući datum (${targetDate.toLocaleDateString("hr-HR")}).` });
        }
    }

    const completedAt = new Date();

    // Check service type category
    let isLiftFromSea = false;
    let isLowerToSea = false;
    if (resRow.serviceTypeId) {
        const [st] = await db.select().from(serviceTypes).where(eq(serviceTypes.id, resRow.serviceTypeId)).limit(1);
        isLiftFromSea = st?.operationCategory === "lift_from_sea";
        isLowerToSea = st?.operationCategory === "lower_to_sea";
    }

    // Dry berth placement logic on complete
    if (isLiftFromSea && resRow.vesselId && resRow.userId) {
        const targetZoneId = zoneId || resRow.landZoneId;
        if (targetZoneId) {
            await createLandOccupancy({
                vesselId: resRow.vesselId,
                userId: resRow.userId,
                zoneId: targetZoneId,
                spotNumber: spotNumber ? Number(spotNumber) : undefined,
                reservationId: resRow.id,
                liftedAt: completedAt,
                createdBy: user.id,
                note: operatorNotes || "Smješteno putem mobilne aplikacije",
            });
        }
    } else if (isLowerToSea && resRow.vesselId) {
        const activeOcc = await db.select().from(landOccupancies)
            .where(and(eq(landOccupancies.vesselId, resRow.vesselId), isNull(landOccupancies.returnedAt))).limit(1);
        if (activeOcc[0]) {
            await completeLandOccupancy(activeOcc[0].id, resRow.id, completedAt);
        }
    }

    // Log crane operation
    if (resRow.craneId) {
        const startTime = resRow.scheduledStart ? new Date(resRow.scheduledStart) : completedAt;
        await logCraneOperation({
            craneId: resRow.craneId,
            reservationId: resRow.id,
            operationType: isLiftFromSea ? "lift" : isLowerToSea ? "lower" : "move",
            startTime,
            endTime: completedAt,
            durationMinutes: Number(durationMin) || 30,
            operatorId: user.id,
            note: operatorNotes,
        });
    }

    // Complete work order if active
    const [activeOrder] = await db.select().from(workOrders).where(and(eq(workOrders.reservationId, id), eq(workOrders.status, "in_progress"))).limit(1);
    if (activeOrder) {
        // Save any attached resources
        const { resources: reqResources } = req.body;
        if (reqResources && Array.isArray(reqResources) && reqResources.length > 0) {
            await db.delete(workOrderResources).where(eq(workOrderResources.workOrderId, activeOrder.id));
            for (const rItem of reqResources) {
                const [rDef] = await db.select().from(resources).where(eq(resources.id, rItem.resourceId)).limit(1);
                if (rDef) {
                    const unitPrice = Number(rDef.pricePerUnitEur) || 0;
                    const qty = Number(rItem.quantity) || 1;
                    const tot = Number((unitPrice * qty).toFixed(2));
                    await db.insert(workOrderResources).values({
                        workOrderId: activeOrder.id,
                        resourceId: rDef.id,
                        quantity: qty.toFixed(2),
                        unitPriceEur: unitPrice.toFixed(2),
                        totalPriceEur: tot.toFixed(2),
                        notes: rItem.notes || null,
                    });
                }
            }
        }

        await db.update(workOrders).set({
            status: "completed",
            completedAt,
            actualDurationMin: Number(durationMin) || 30,
            operatorNotes: operatorNotes || activeOrder.operatorNotes,
            updatedAt: completedAt,
        }).where(eq(workOrders.id, activeOrder.id));

        const [vessel] = activeOrder.vesselId ? await db.select().from(vessels).where(eq(vessels.id, activeOrder.vesselId)).limit(1) : [null];
        const vesselName = vessel?.name || "Plovilo";
        const vesselRegistration = vessel?.registration || "";

        if (activeOrder.clientType === "member") {
            if (activeOrder.isStatutoryCovered) {
                if (activeOrder.quotaOperationType === "lift") {
                    await db.update(memberStatutoryRights).set({ liftAvailable: false, updatedAt: completedAt }).where(eq(memberStatutoryRights.userId, activeOrder.userId));
                } else if (activeOrder.quotaOperationType === "lower") {
                    await db.update(memberStatutoryRights).set({ lowerAvailable: false, updatedAt: completedAt }).where(eq(memberStatutoryRights.userId, activeOrder.userId));
                }
                await db.insert(userCardEntries).values({
                    userId: activeOrder.userId,
                    workOrderId: activeOrder.id,
                    entryType: "statutory_quota_used",
                    serviceItemCode: activeOrder.quotaOperationType === "lift" ? "STAT-LIFT" : "STAT-LOWER",
                    serviceItemName: activeOrder.quotaOperationType === "lift" ? "Statutarno pravo: Vađenje iz mora (0,00 €)" : "Statutarno pravo: Spuštanje u more (0,00 €)",
                    vesselName,
                    vesselRegistration,
                    eventDate: completedAt,
                    note: `Radni nalog ${activeOrder.orderNumber} - Pokriveno godišnjom članarinom`,
                    erpStatus: "pending",
                });
            } else {
                await db.update(memberStatutoryRights).set({
                    pendingFeeAdjustmentsCount: sql`${memberStatutoryRights.pendingFeeAdjustmentsCount} + 1`,
                    updatedAt: completedAt,
                }).where(eq(memberStatutoryRights.userId, activeOrder.userId));

                await db.insert(userCardEntries).values({
                    userId: activeOrder.userId,
                    workOrderId: activeOrder.id,
                    entryType: "fee_adjustment_charge",
                    serviceItemCode: activeOrder.chargeItemCode || "USL-D9T",
                    serviceItemName: activeOrder.chargeItemName || "Korištenje dizalice 9T (Doplata)",
                    vesselName,
                    vesselRegistration,
                    eventDate: completedAt,
                    note: `Radni nalog ${activeOrder.orderNumber} - Doplata članarine u Desktop ERP`,
                    erpStatus: "pending",
                });
            }
        }
    }

    // Mark reservation completed
    await db.update(reservations).set({
        status: "completed",
        completedAt,
        updatedAt: completedAt,
    }).where(eq(reservations.id, id));

    await createAuditEntry({
        actorId: user.id,
        action: "mobile_reservation_completed",
        entityType: "reservation",
        entityId: id,
    });

    return res.json({ success: true, status: "completed" });
});

// 6. Generic Status PATCH endpoint (supporting in_progress & completed via the workflows above)
router.patch("/reservations/:id/status", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, operatorNotes, durationMin, zoneId, spotNumber } = req.body;

    if (status === "in_progress") {
        req.body.operatorNotes = operatorNotes;
        // Delegate to start-work
        return (router as any).handle({ ...req, method: "POST", url: `/reservations/${id}/start-work` }, res);
    }
    if (status === "completed") {
        req.body.durationMin = durationMin;
        req.body.operatorNotes = operatorNotes;
        req.body.zoneId = zoneId;
        req.body.spotNumber = spotNumber;
        // Delegate to complete-work
        return (router as any).handle({ ...req, method: "POST", url: `/reservations/${id}/complete-work` }, res);
    }

    if (!["approved", "completed", "cancelled", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Nevažeći status" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    await db.update(reservations).set({ status: status as any, updatedAt: new Date() }).where(eq(reservations.id, id));
    return res.json({ success: true, id, status });
});

// 6b. Get Active Resources: GET /api/mobile/v1/resources
router.get("/resources", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const activeResources = await db
        .select()
        .from(resources)
        .where(eq(resources.isActive, true))
        .orderBy(asc(resources.sortOrder), asc(resources.name));

    return res.json(activeResources);
});

// 7. Get Land Zones & Capacity: GET /api/mobile/v1/land-zones
router.get("/land-zones", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const zones = await db.select().from(landZones).where(eq(landZones.isActive, true));
    const activeOcc = await db.select().from(landOccupancies).where(isNull(landOccupancies.returnedAt));

    const result = zones.map(z => {
        const occCount = activeOcc.filter(o => o.zoneId === z.id).length;
        const totalOcc = occCount + z.manualOccupiedSpots;
        return {
            id: z.id,
            name: z.name,
            code: z.code,
            totalSpots: z.totalSpots,
            occupiedSpots: totalOcc,
            availableSpots: Math.max(0, z.totalSpots - totalOcc),
        };
    });

    return res.json(result);
});

// 8. Assign Vessel to Land Zone: POST /api/mobile/v1/land-occupancies
router.post("/land-occupancies", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { vesselId, zoneId, reservationId, notes, spotNumber } = req.body;
    if (!vesselId || !zoneId) {
        return res.status(400).json({ error: "vesselId and zoneId are required" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vesselId));
    if (!vessel) return res.status(404).json({ error: "Plovilo nije pronađeno" });

    // Mark previous occupancies as returned
    await db.update(landOccupancies)
        .set({ returnedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(landOccupancies.vesselId, vesselId), isNull(landOccupancies.returnedAt)));

    // Create new active occupancy
    const [newOcc] = await db.insert(landOccupancies).values({
        vesselId,
        userId: vessel.ownerId,
        zoneId,
        spotNumber: spotNumber ? Number(spotNumber) : null,
        reservationId: reservationId || null,
        liftedAt: new Date(),
        note: notes || "Smješteno putem mobilne aplikacije",
        createdBy: user.id,
    }).returning();

    // Also update reservation's landZoneId if reservationId is given or active reservation for today exists
    if (reservationId) {
        await db.update(reservations)
            .set({ landZoneId: zoneId, updatedAt: new Date() })
            .where(eq(reservations.id, reservationId));
    } else {
        await db.update(reservations)
            .set({ landZoneId: zoneId, updatedAt: new Date() })
            .where(and(eq(reservations.vesselId, vesselId), eq(reservations.status, "approved")));
    }

    return res.json({ success: true, occupancy: newOcc });
});

// 9. Get Messages History for Reservation: GET /api/mobile/v1/messages/:reservationId
router.get("/messages/:reservationId", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { reservationId } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const rows = await db.select({
        id: messages.id,
        reservationId: messages.reservationId,
        senderId: messages.senderId,
        senderName: users.name,
        senderRole: users.role,
        body: messages.body,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.reservationId, reservationId))
    .orderBy(asc(messages.createdAt));

    return res.json({ messages: rows });
});

// 10. Send Message / Notification to Vessel Owner: POST /api/mobile/v1/messages/send
router.post("/messages/send", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { reservationId, content } = req.body;
    if (!reservationId || !content || !content.trim()) {
        return res.status(400).json({ error: "reservationId and content are required" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [resRow] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
    if (!resRow) return res.status(404).json({ error: "Rezervacija nije pronađena" });

    const [msg] = await db.insert(messages).values({
        reservationId,
        senderId: user.id,
        body: content.trim(),
        isRead: false,
    }).returning();

    // Notify user via Email and SMS
    const [owner] = await db.select().from(users).where(eq(users.id, resRow.userId)).limit(1);
    if (owner?.email) {
        sendNewMessageNotification({
            to: owner.email,
            userName: owner.name || owner.firstName || "Korisnik",
            reservationNumber: resRow.reservationNumber || "",
            messageBody: content.trim(),
            lang: "hr",
        }).catch(err => console.warn("[Mobile API Email] Failed:", err?.message || err));
    }

    if (owner?.phone) {
        const smsText = `MARINA SPINUT (Nalog ${resRow.reservationNumber || ""}): ${content.trim()}`;
        sendSms(owner.phone, smsText).catch(err => console.warn("[Mobile API SMS] Failed:", err?.message || err));
    }

    return res.json({ success: true, message: msg });
});

export default router;

