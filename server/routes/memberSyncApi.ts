/**
 * Member Sync Ingestion API
 * REST endpoint za sigurni prijem podataka s lokalnog Windows PC-a na Coolify server
 * 
 * Endpoint: POST /api/v1/member-sync/push
 * Auth: Header `x-sync-api-key: <SYNC_API_KEY>` ili `Authorization: Bearer <SYNC_API_KEY>`
 */
import { Router, Request, Response, NextFunction } from "express";
import { processClan03Rows } from "../memberSync/syncEngine";
import type { LegacyClan03Row } from "../memberSync/types";

const router = Router();

/**
 * Middleware za provjeru API ključa
 */
function requireSyncApiKey(req: Request, res: Response, next: NextFunction) {
    const configuredKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;

    if (!configuredKey) {
        console.error("[MemberSync API] SYNC_API_KEY is not configured in server environment (.env)");
        return res.status(500).json({
            success: false,
            error: "SYNC_API_KEY nije konfiguriran na poslužitelju.",
        });
    }

    const providedKey =
        req.headers["x-sync-api-key"] ||
        req.headers["x-api-key"] ||
        (req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.substring(7)
            : null);

    if (!providedKey || providedKey !== configuredKey) {
        return res.status(401).json({
            success: false,
            error: "Neautoriziran pristup. Neispravan ili nedostajući x-sync-api-key.",
        });
    }

    next();
}

/**
 * @route GET /api/v1/member-sync/health
 * Provjera statusa API-ja
 */
router.get("/health", (req: Request, res: Response) => {
    res.json({
        status: "online",
        service: "Member Sync Ingestion API",
        timestamp: new Date().toISOString(),
    });
});

/**
 * @route POST /api/v1/member-sync/push
 * Prijem paketa CLAN03 redova s lokalnog računala i pokretanje sinkronizacije
 */
router.post("/push", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const rows: LegacyClan03Row[] = Array.isArray(body) ? body : body?.members || body?.rows;

        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({
                success: false,
                error: "Tijelo zahtjeva mora sadržavati polje zapisa (JSON array) ili objekt sa svojstvom 'members'.",
            });
        }

        console.log(`[MemberSync API] Received push payload with ${rows.length} CLAN03 rows from ${req.ip}`);

        const result = await processClan03Rows(rows, "push_api");

        res.json({
            success: result.status !== "failed",
            syncRunId: result.syncRunId,
            status: result.status,
            counters: result.counters,
            durationMs: result.duration,
            errors: result.errors,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Error processing push payload:", err);
        res.status(500).json({
            success: false,
            error: `Interna pogreška pri obradi sinkronizacije: ${err?.message || err}`,
        });
    }
});

export default router;
