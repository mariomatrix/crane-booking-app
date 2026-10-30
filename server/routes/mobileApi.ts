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
    workStoppages,
} from "../../drizzle/schema";
import { eq, and, inArray, gte, lte, isNull, desc, asc, count, sql, ne } from "drizzle-orm";
import { sendNewMessageNotification } from "../_core/email";
import { sendSms } from "../_core/sms";
import { verifyMobileOperatorSession, issueMobileOperatorToken } from "../services/authPolicyService";
import { startReservationWorkOrder, completeReservationOperation } from "../services/workOrderService";
import { landDispatchService } from "../landDispatch/landDispatch.service";

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
    const operatorUser = await verifyMobileOperatorSession(req.headers.authorization);
    if (!operatorUser) {
        return res.status(401).json({ error: "Invalid, expired, or unauthorized session token" });
    }
    req.operatorUser = operatorUser;
    next();
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

        const token = await issueMobileOperatorToken({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        });

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
            .where(and(inArray(workOrders.reservationId, resIds), ne(workOrders.status, "cancelled")))
            .orderBy(desc(workOrders.createdAt));
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
            operatorNotes: wOrder?.operatorNotes || null,
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
    try {
        const result = await startReservationWorkOrder({
            reservationId: id,
            operatorId: user.id,
            operatorNotes: operatorNotes || undefined,
            auditAction: "mobile_work_order_started",
        });
        return res.json({ success: true, workOrder: result.workOrder, status: "in_progress" });
    } catch (err: any) {
        const status = err?.code === "NOT_FOUND" ? 404 : err?.code === "BAD_REQUEST" ? 400 : 500;
        return res.status(status).json({ error: err?.message || "Greška pri pokretanju radnog naloga." });
    }
});

// 5. Complete Work Order / Finish Job: POST /api/mobile/v1/reservations/:id/complete-work
router.post("/reservations/:id/complete-work", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { durationMin = 30, operatorNotes, zoneId, spotNumber, resources: reqResources } = req.body;
    try {
        const result = await completeReservationOperation({
            reservationId: id,
            operatorId: user.id,
            actualDurationMin: Number(durationMin) || 30,
            operatorNotes: operatorNotes || undefined,
            zoneId: zoneId || undefined,
            spotNumber: spotNumber ? Number(spotNumber) : undefined,
            resources: Array.isArray(reqResources) ? reqResources : undefined,
        });
        return res.json({ success: true, status: "completed", workOrder: result.workOrder });
    } catch (err: any) {
        const status = err?.code === "NOT_FOUND" ? 404 : err?.code === "BAD_REQUEST" ? 400 : 500;
        return res.status(status).json({ error: err?.message || "Greška pri zaključivanju operacije." });
    }
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

    const [currRes] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!currRes) return res.status(404).json({ error: "Rezervacija nije pronađena" });

    if (currRes.status === "completed" && status !== "completed") {
        return res.status(400).json({ error: "Nije moguće mijenjati status već završene operacije." });
    }

    await db.update(reservations).set({ status: status as any, updatedAt: new Date() }).where(eq(reservations.id, id));
    return res.json({ success: true, id, status });
});

// 6b. Update Operator Notes on Work Order: PATCH /api/mobile/v1/work-orders/:id/notes
router.patch("/work-orders/:id/notes", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { operatorNotes } = req.body;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: "Radni nalog nije pronađen" });

    const updatedNotes = typeof operatorNotes === "string" ? operatorNotes.trim() : null;
    await db.update(workOrders)
        .set({ operatorNotes: updatedNotes, updatedAt: new Date() })
        .where(eq(workOrders.id, id));

    await createAuditEntry({
        actorId: user.id,
        action: "work_order_notes_updated_mobile",
        entityType: "work_order",
        entityId: id,
        payload: { operatorNotes: updatedNotes, orderNumber: wo.orderNumber },
    });

    return res.json({ success: true, id, operatorNotes: updatedNotes });
});

// 6c. Update Operator Notes by Reservation: PATCH /api/mobile/v1/reservations/:id/notes
router.patch("/reservations/:id/notes", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { operatorNotes } = req.body;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [wo] = await db.select()
        .from(workOrders)
        .where(and(eq(workOrders.reservationId, id), ne(workOrders.status, "cancelled")))
        .orderBy(desc(workOrders.createdAt))
        .limit(1);

    if (!wo) return res.status(404).json({ error: "Nije pronađen radni nalog za ovu rezervaciju" });

    const updatedNotes = typeof operatorNotes === "string" ? operatorNotes.trim() : null;
    await db.update(workOrders)
        .set({ operatorNotes: updatedNotes, updatedAt: new Date() })
        .where(eq(workOrders.id, wo.id));

    await createAuditEntry({
        actorId: user.id,
        action: "work_order_notes_updated_mobile",
        entityType: "work_order",
        entityId: wo.id,
        payload: { operatorNotes: updatedNotes, orderNumber: wo.orderNumber, reservationId: id },
    });

    return res.json({ success: true, workOrderId: wo.id, operatorNotes: updatedNotes });
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

// 11. Comprehensive Land Zones Overview: GET /api/mobile/v1/zones/overview
router.get("/zones/overview", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const zones = await db.select().from(landZones).where(eq(landZones.isActive, true)).orderBy(asc(landZones.name));
    const activeOccs = await db.select({
        id: landOccupancies.id,
        vesselId: landOccupancies.vesselId,
        vesselName: vessels.name,
        vesselRegistration: vessels.registration,
        vesselLengthM: vessels.lengthM,
        zoneId: landOccupancies.zoneId,
        spotNumber: landOccupancies.spotNumber,
        liftedAt: landOccupancies.liftedAt,
        note: landOccupancies.note,
        ownerName: users.name,
    })
    .from(landOccupancies)
    .innerJoin(vessels, eq(landOccupancies.vesselId, vessels.id))
    .innerJoin(users, eq(landOccupancies.userId, users.id))
    .where(isNull(landOccupancies.returnedAt))
    .orderBy(asc(landOccupancies.spotNumber));

    const result = zones.map(z => {
        const vesselsInZone = activeOccs.filter(o => o.zoneId === z.id).map(o => {
            const daysOnLand = o.liftedAt
                ? Math.max(0, Math.floor((Date.now() - new Date(o.liftedAt).getTime()) / (1000 * 60 * 60 * 24)))
                : 0;
            return {
                ...o,
                daysOnLand,
            };
        });
        const occupiedCount = vesselsInZone.length + (z.manualOccupiedSpots || 0);
        return {
            id: z.id,
            name: z.name,
            code: z.code,
            totalSpots: z.totalSpots,
            occupiedSpots: occupiedCount,
            availableSpots: Math.max(0, z.totalSpots - occupiedCount),
            vessels: vesselsInZone,
        };
    });

    return res.json(result);
});

// 12. Report Weather Stoppage or Defect: POST /api/mobile/v1/incidents/report
router.post("/incidents/report", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { scope = "all_cranes", craneId, zoneId, reason = "wind", note } = req.body;
    try {
        const stoppage = await landDispatchService.createWorkStoppage({
            scope: scope as any,
            craneId: craneId || null,
            zoneId: zoneId || null,
            startsAtIso: new Date().toISOString(),
            endsAtIso: null,
            reason,
            note: note || (reason === "wind" ? "Obustava rada zbog jakog vjetra/bure s rive" : "Kvar na dizalici"),
            createdBy: user.id,
        });
        await createAuditEntry({
            actorId: user.id,
            action: "mobile_incident_reported",
            entityType: "work_stoppages",
            entityId: stoppage.id,
            payload: { scope, craneId, reason, note },
        });
        return res.json({ success: true, stoppage });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Greška pri prijavi obustave rada." });
    }
});

// 13. Get Active Incidents/Stoppages: GET /api/mobile/v1/incidents/active
router.get("/incidents/active", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const stoppages = await db.select({
        id: workStoppages.id,
        scope: workStoppages.scope,
        craneId: workStoppages.craneId,
        craneName: cranes.name,
        reason: workStoppages.reason,
        note: workStoppages.note,
        startsAt: workStoppages.startsAt,
        endsAt: workStoppages.endsAt,
        isActive: workStoppages.isActive,
    })
    .from(workStoppages)
    .leftJoin(cranes, eq(workStoppages.craneId, cranes.id))
    .where(eq(workStoppages.isActive, true))
    .orderBy(desc(workStoppages.startsAt));

    return res.json(stoppages);
});

// 14. Resolve Incident/Stoppage: POST /api/mobile/v1/incidents/:id/resolve
router.post("/incidents/:id/resolve", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    try {
        await landDispatchService.cancelWorkStoppage(id);
        await createAuditEntry({
            actorId: user.id,
            action: "mobile_incident_resolved",
            entityType: "work_stoppages",
            entityId: id,
        });
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Greška pri uklanjanju obustave rada." });
    }
});

// 15. Mark Reservation as No-Show / Cancelled: POST /api/mobile/v1/reservations/:id/no-show
router.post("/reservations/:id/no-show", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { id } = req.params;
    const { reason = "Korisnik se nije pojavio na rivi" } = req.body;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [curr] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!curr) return res.status(404).json({ error: "Rezervacija nije pronađena" });

    if (curr.status === "completed") {
        return res.status(400).json({ error: "Nije moguće otkazati završenu operaciju." });
    }

    // Cancel active work order if any
    await db.update(workOrders).set({
        status: "cancelled",
        operatorNotes: `Otkazano na terenu: ${reason}`,
        updatedAt: new Date(),
    }).where(and(eq(workOrders.reservationId, id), eq(workOrders.status, "in_progress")));

    await db.update(reservations).set({
        status: "cancelled",
        adminNote: `Terenski operater: ${reason}`,
        updatedAt: new Date(),
    }).where(eq(reservations.id, id));

    await createAuditEntry({
        actorId: user.id,
        action: "mobile_reservation_no_show",
        entityType: "reservation",
        entityId: id,
        payload: { reason },
    });

    return res.json({ success: true, status: "cancelled" });
});

export default router;

