import { Router, Request, Response } from "express";
import { getUserByPin, getOperatorCranes, getDb } from "../db";
import { users, reservations, cranes, vessels, serviceTypes, landZones, landOccupancies, messages } from "../../drizzle/schema";
import { eq, and, inArray, gte, lte, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "../_core/context";

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

    // Get operator assigned cranes
    const assignedCraneIds = await getOperatorCranes(user.id);

    // Fetch all active reservations for the date
    const startOfDay = new Date(`${dateParam}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateParam}T23:59:59.999Z`);

    const rows = await db.select({
        reservation: reservations,
        vessel: vessels,
        serviceType: serviceTypes,
        crane: cranes,
        owner: users,
    })
    .from(reservations)
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(users, eq(reservations.userId, users.id))
    .where(
        and(
            gte(reservations.scheduledStart, startOfDay),
            lte(reservations.scheduledStart, endOfDay),
            inArray(reservations.status, ["approved", "completed"])
        )
    )
    .orderBy(reservations.scheduledStart);

    // Filter by assigned cranes if operator has specific crane assignments
    let filteredRows = rows;
    if (assignedCraneIds.length > 0 && user.role !== "admin") {
        filteredRows = rows.filter(r => r.reservation.craneId && assignedCraneIds.includes(r.reservation.craneId));
    }

    // Map land occupancies for dry berth info
    const occupancies = await db.select({
        vesselId: landOccupancies.vesselId,
        zoneCode: landZones.code,
        zoneName: landZones.name,
    })
    .from(landOccupancies)
    .leftJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
    .where(isNull(landOccupancies.returnedAt));

    const result = filteredRows.map(r => {
        const occ = occupancies.find(o => o.vesselId === r.vessel?.id);
        return {
            id: r.reservation.id,
            reservationNumber: r.reservation.reservationNumber,
            status: r.reservation.status,
            scheduledStart: r.reservation.scheduledStart,
            scheduledEnd: r.reservation.scheduledEnd,
            durationMin: r.reservation.durationMin,
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
            dryBerthPlacement: occ ? {
                zoneCode: occ.zoneCode,
                zoneName: occ.zoneName,
            } : null,
        };
    });

    return res.json({ date: dateParam, tasks: result });
});

// 4. Update Reservation Status: PATCH /api/mobile/v1/reservations/:id/status
router.patch("/reservations/:id/status", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["approved", "completed", "cancelled", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    await db.update(reservations).set({ status: status as any, updatedAt: new Date() }).where(eq(reservations.id, id));
    return res.json({ success: true, id, status });
});

// 5. Get Land Zones & Capacity: GET /api/mobile/v1/land-zones
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

// 6. Assign Vessel to Land Zone: POST /api/mobile/v1/land-occupancies
router.post("/land-occupancies", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { vesselId, zoneId, notes } = req.body;
    if (!vesselId || !zoneId) {
        return res.status(400).json({ error: "vesselId and zoneId are required" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Fetch vessel to get ownerId
    const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vesselId));
    if (!vessel) return res.status(404).json({ error: "Vessel not found" });

    // Mark previous occupancies as returned
    await db.update(landOccupancies)
        .set({ returnedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(landOccupancies.vesselId, vesselId), isNull(landOccupancies.returnedAt)));

    // Create new active occupancy
    const [newOcc] = await db.insert(landOccupancies).values({
        vesselId,
        userId: vessel.ownerId,
        zoneId,
        liftedAt: new Date(),
        note: notes || "Smješteno putem mobilne aplikacije",
        createdBy: user.id,
    }).returning();

    return res.json({ success: true, occupancy: newOcc });
});

// 7. Send Message / Notification to Vessel Owner: POST /api/mobile/v1/messages/send
router.post("/messages/send", requireMobileAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.operatorUser!;
    const { reservationId, content } = req.body;
    if (!reservationId || !content) {
        return res.status(400).json({ error: "reservationId and content are required" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [msg] = await db.insert(messages).values({
        reservationId,
        senderId: user.id,
        body: content.trim(),
        isRead: false,
    }).returning();

    return res.json({ success: true, message: msg });
});

export default router;
