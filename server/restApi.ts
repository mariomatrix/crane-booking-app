import { Router, Request, Response, NextFunction } from "express";
import {
    validateApiKeyAndUpdateLastUsed,
    getDb
} from "./db";
import {
    reservations, vessels, cranes, serviceTypes
} from "../drizzle/schema";
import { eq, and, gt, lt, gte, lte, desc, sql } from "drizzle-orm";
// @ts-ignore
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

const router = Router();

// ─── Rate Limiting ───────────────────────────────────────────────────
// 100 req/min limit for API keys
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100, // Limit each IP or Key to 100 requests per `window` (here, per 1 minute)
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.header("x-api-key") || req.ip || "unknown",
    message: { error: "Too many requests, please try again later." },
});

router.use(apiLimiter);

// ─── Swagger Documentation ───────────────────────────────────────────
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Crane Booking API",
            version: "1.0.0",
            description: "REST API for external integration (e.g. Marina ERP)",
        },
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "x-api-key",
                },
            },
        },
        security: [{ ApiKeyAuth: [] }],
    },
    apis: ["./server/restApi.ts"], // parse comments in this file
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
router.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Auth Middleware ─────────────────────────────────────────────────
async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.header("x-api-key");

    if (!apiKey) {
        return res.status(401).json({ error: "Missing x-api-key header" });
    }

    try {
        const isValid = await validateApiKeyAndUpdateLastUsed(apiKey);
        if (!isValid) {
            return res.status(403).json({ error: "Invalid or inactive API key" });
        }
        next();
    } catch (error) {
        console.error("API Key validation error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

router.use(apiKeyAuth);

// ─── Endpoints ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/vessels/{registration}/reservations:
 *   get:
 *     summary: Retrieve reservations for a specific vessel
 *     parameters:
 *       - in: path
 *         name: registration
 *         required: true
 *         schema:
 *           type: string
 *         description: Vessel registration (e.g. ST-1234)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (e.g. completed, pending)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filtering
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filtering
 *     responses:
 *       200:
 *         description: A list of reservations
 */
router.get("/vessels/:registration/reservations", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const { registration } = req.params;
        const { status, from, to } = req.query;

        let query = db.select({
            id: reservations.id,
            scheduledStart: reservations.scheduledStart,
            durationMin: reservations.durationMin,
            status: reservations.status,
            notes: reservations.userNote,
            serviceType: serviceTypes.name,
            crane: cranes.name,
        })
            .from(reservations)
            .innerJoin(vessels, eq(reservations.vesselId, vessels.id))
            .innerJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .innerJoin(cranes, eq(reservations.craneId, cranes.id))
            .where(eq(vessels.registration, registration));

        const results = await query.orderBy(desc(reservations.createdAt));

        // Manual filtering since Drizzle dynamic where is tricky here
        let filtered = results;
        if (status && typeof status === "string") {
            filtered = filtered.filter(r => r.status === status);
        }
        if (from && typeof from === "string") {
            const fromDate = new Date(from);
            filtered = filtered.filter(r => r.scheduledStart && new Date(r.scheduledStart) >= fromDate);
        }
        if (to && typeof to === "string") {
            const toDate = new Date(to);
            filtered = filtered.filter(r => r.scheduledStart && new Date(r.scheduledStart) <= toDate);
        }

        res.json(filtered);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/v1/reservations/completed:
 *   get:
 *     summary: Retrieve completed reservations (operations)
 *     parameters:
 *       - in: query
 *         name: registration
 *         schema:
 *           type: string
 *         description: Filter by vessel registration
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filtering
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filtering
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: A list of completed reservations
 */
router.get("/reservations/completed", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const { from, to, registration, limit = 50, offset = 0 } = req.query;

        const query = db.select({
            id: reservations.id,
            scheduledStart: reservations.scheduledStart,
            durationMin: reservations.durationMin,
            status: reservations.status,
            vesselName: vessels.name,
            vesselRegistration: vessels.registration,
            serviceType: serviceTypes.name,
            crane: cranes.name,
        })
            .from(reservations)
            .innerJoin(vessels, eq(reservations.vesselId, vessels.id))
            .innerJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .innerJoin(cranes, eq(reservations.craneId, cranes.id))
            .where(eq(reservations.status, "completed"))
            .orderBy(desc(reservations.createdAt))
            .limit(Number(limit))
            .offset(Number(offset));

        const results = await query;

        // Filter
        let filtered = results;
        if (registration && typeof registration === "string") {
            filtered = filtered.filter(r => r.vesselRegistration === registration);
        }
        if (from && typeof from === "string") {
            const fromDate = new Date(from);
            filtered = filtered.filter(r => r.scheduledStart && new Date(r.scheduledStart) >= fromDate);
        }
        if (to && typeof to === "string") {
            const toDate = new Date(to);
            filtered = filtered.filter(r => r.scheduledStart && new Date(r.scheduledStart) <= toDate);
        }

        res.json(filtered);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/v1/service-types:
 *   get:
 *     summary: Retrieve specific service types catalogue
 *     responses:
 *       200:
 *         description: A list of configured service types
 */
router.get("/service-types", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const results = await db.select({
            id: serviceTypes.id,
            name: serviceTypes.name,
            description: serviceTypes.description,
            duration: serviceTypes.defaultDurationMin,
        }).from(serviceTypes);

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/v1/cranes:
 *   get:
 *     summary: Retrieve active cranes
 *     responses:
 *       200:
 *         description: A list of active cranes
 */
router.get("/cranes", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const results = await db.select({
            id: cranes.id,
            name: cranes.name,
            maxWeightKg: cranes.maxCapacityKg,
            status: cranes.craneStatus,
        }).from(cranes);

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/v1/reservations:
 *   get:
 *     summary: Retrieve all reservations
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of all reservations
 */
router.get("/reservations", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const { status, limit = 50, offset = 0 } = req.query;

        const query = db.select({
            id: reservations.id,
            scheduledStart: reservations.scheduledStart,
            durationMin: reservations.durationMin,
            status: reservations.status,
            vesselName: vessels.name,
            vesselRegistration: vessels.registration,
            serviceType: serviceTypes.name,
            crane: cranes.name,
        })
            .from(reservations)
            .innerJoin(vessels, eq(reservations.vesselId, vessels.id))
            .innerJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .innerJoin(cranes, eq(reservations.craneId, cranes.id))
            .orderBy(desc(reservations.createdAt))
            .limit(Number(limit))
            .offset(Number(offset));

        const results = await query;

        let filtered = results;
        if (status && typeof status === "string") {
            filtered = filtered.filter(r => r.status === status);
        }

        res.json(filtered);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/v1/reservations/{id}:
 *   get:
 *     summary: Retrieve reservation details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reservation details
 *       404:
 *         description: Reservation not found
 */
router.get("/reservations/:id", async (req, res) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database not available" });

        const { id } = req.params;

        const [result] = await db.select({
            id: reservations.id,
            scheduledStart: reservations.scheduledStart,
            durationMin: reservations.durationMin,
            status: reservations.status,
            notes: reservations.userNote,
            vesselName: vessels.name,
            vesselRegistration: vessels.registration,
            serviceType: serviceTypes.name,
            crane: cranes.name,
            createdAt: reservations.createdAt,
        })
            .from(reservations)
            .innerJoin(vessels, eq(reservations.vesselId, vessels.id))
            .innerJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
            .innerJoin(cranes, eq(reservations.craneId, cranes.id))
            .where(eq(reservations.id, id));

        if (!result) {
            return res.status(404).json({ error: "Reservation not found" });
        }

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
