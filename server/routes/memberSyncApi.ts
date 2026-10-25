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
import { getDb } from "../db";
import { sql } from "drizzle-orm";

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

async function collectDatabaseSnapshot(executor: any) {
    const preservedTables = [
        "users",
        "vessels",
        "member_links",
        "member_memberships",
        "clubs",
        "piers",
        "berths",
        "berth_assignments",
        "cranes",
        "operator_cranes",
        "land_zones",
        "land_spots",
        "crane_zone_affinities",
        "service_types",
        "seasons",
        "holidays",
        "settings",
        "price_list_items",
        "resources",
        "api_keys",
    ];

    const operationalTables = [
        "work_order_resources",
        "user_card_entries",
        "work_orders",
        "crane_operation_log",
        "invoice_items",
        "invoices",
        "waiting_offers",
        "land_waiting_list",
        "land_spot_allocations",
        "land_turnaround_links",
        "land_occupancies",
        "operation_dependencies",
        "messages",
        "waiting_list",
        "reservations",
        "maintenance_blocks",
        "work_stoppages",
        "audit_log",
    ];

    const preserved: Record<string, number> = {};
    for (const t of preservedTables) {
        const res = await executor.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM "${t}"`));
        const row = Array.isArray(res) ? res[0] : (res as any)?.rows?.[0];
        preserved[t] = Number(row?.c ?? 0);
    }

    const operational: Record<string, number> = {};
    for (const t of operationalTables) {
        const res = await executor.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM "${t}"`));
        const row = Array.isArray(res) ? res[0] : (res as any)?.rows?.[0];
        operational[t] = Number(row?.c ?? 0);
    }

    const manualOccRes = await executor.execute(
        sql`SELECT COALESCE(SUM(manual_occupied_spots), 0)::int AS s FROM land_zones`
    );
    const manualOccRow = Array.isArray(manualOccRes) ? manualOccRes[0] : (manualOccRes as any)?.rows?.[0];

    const blockedSpotsRes = await executor.execute(
        sql`SELECT COUNT(*)::int AS c FROM land_spots WHERE is_blocked = true`
    );
    const blockedSpotsRow = Array.isArray(blockedSpotsRes) ? blockedSpotsRes[0] : (blockedSpotsRes as any)?.rows?.[0];

    const usedRightsRes = await executor.execute(
        sql`SELECT COUNT(*)::int AS c FROM member_statutory_rights WHERE lift_available = false OR lower_available = false OR pending_fee_adjustments_count > 0`
    );
    const usedRightsRow = Array.isArray(usedRightsRes) ? usedRightsRes[0] : (usedRightsRes as any)?.rows?.[0];

    const totalRightsRes = await executor.execute(
        sql`SELECT COUNT(*)::int AS c FROM member_statutory_rights`
    );
    const totalRightsRow = Array.isArray(totalRightsRes) ? totalRightsRes[0] : (totalRightsRes as any)?.rows?.[0];

    return {
        preserved,
        operational,
        countersAndFlags: {
            manualOccupiedSpotsSum: Number(manualOccRow?.s ?? 0),
            blockedLandSpotsCount: Number(blockedSpotsRow?.c ?? 0),
            memberStatutoryRightsTotal: Number(totalRightsRow?.c ?? 0),
            memberStatutoryRightsUsedOrPending: Number(usedRightsRow?.c ?? 0),
        },
    };
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
 * @route POST /api/v1/member-sync/reset-operational-data
 * Sigurno briše sve radne/testne podatke (radni nalozi, rezervacije, zauzeća kopna, liste čekanja, računi, logovi)
 * i resetira brojače i statutarna prava članova, dok 100% čuva korisnike, plovila, vezove u akvatoriju i postavke.
 */
router.post("/reset-operational-data", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) {
            return res.status(500).json({ success: false, error: "Database not available" });
        }

        const isDryRun = req.body?.dryRun === true;
        const confirmToken = req.body?.confirm;

        if (isDryRun) {
            const snapshot = await collectDatabaseSnapshot(db);
            return res.json({
                success: true,
                dryRun: true,
                message: "Pregled stanja baze podataka prije brisanja radnih podataka (Dry Run).",
                snapshot,
            });
        }

        if (confirmToken !== "RESET_PRODUCTION_OPERATIONAL_DATA") {
            return res.status(400).json({
                success: false,
                error: "Nedostaje potvrdni token 'confirm: RESET_PRODUCTION_OPERATIONAL_DATA' ili 'dryRun: true'.",
            });
        }

        console.log(`[MemberSync API] Production operational data reset initiated by ${req.ip}`);

        const result = await db.transaction(async (tx) => {
            const before = await collectDatabaseSnapshot(tx);

            // 1. Brisanje radnih podataka po strogom redoslijedu stranih ključeva (bez diranja matičnih tablica)
            await tx.execute(sql`DELETE FROM work_order_resources`);
            await tx.execute(sql`DELETE FROM user_card_entries`);
            await tx.execute(sql`DELETE FROM work_orders`);
            await tx.execute(sql`DELETE FROM crane_operation_log`);
            await tx.execute(sql`DELETE FROM invoice_items`);
            await tx.execute(sql`DELETE FROM invoices`);
            await tx.execute(sql`DELETE FROM waiting_offers`);
            await tx.execute(sql`DELETE FROM land_waiting_list`);
            await tx.execute(sql`DELETE FROM land_spot_allocations`);
            await tx.execute(sql`DELETE FROM land_turnaround_links`);
            await tx.execute(sql`DELETE FROM land_occupancies`);
            await tx.execute(sql`DELETE FROM operation_dependencies`);
            await tx.execute(sql`DELETE FROM messages`);
            await tx.execute(sql`DELETE FROM waiting_list`);
            await tx.execute(sql`DELETE FROM reservations`);
            await tx.execute(sql`DELETE FROM maintenance_blocks`);
            await tx.execute(sql`DELETE FROM work_stoppages`);
            await tx.execute(sql`DELETE FROM audit_log`);

            // 2. Resetiranje ručnih zauzeća kopnenih zona i privremenih blokada mjesta na kopnu
            await tx.execute(sql`
                UPDATE land_zones
                SET manual_occupied_spots = 0,
                    updated_at = NOW()
            `);

            await tx.execute(sql`
                UPDATE land_spots
                SET is_blocked = false,
                    block_reason = NULL,
                    updated_at = NOW()
                WHERE is_blocked = true
            `);

            // 3. Resetiranje statutarnih prava svih članova na početno stanje (1 vađenje + 1 spuštanje, 0 doplata)
            await tx.execute(sql`
                UPDATE member_statutory_rights
                SET lift_available = true,
                    lift_acquired_year = EXTRACT(YEAR FROM CURRENT_DATE)::int,
                    lift_expires_at = ((EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-12-31')::date,
                    lower_available = true,
                    lower_acquired_year = EXTRACT(YEAR FROM CURRENT_DATE)::int,
                    lower_expires_at = ((EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-12-31')::date,
                    pending_fee_adjustments_count = 0,
                    updated_at = NOW()
            `);

            await tx.execute(sql`
                INSERT INTO member_statutory_rights (
                    user_id,
                    lift_available,
                    lift_acquired_year,
                    lift_expires_at,
                    lower_available,
                    lower_acquired_year,
                    lower_expires_at,
                    pending_fee_adjustments_count,
                    updated_at
                )
                SELECT
                    u.id,
                    true,
                    EXTRACT(YEAR FROM CURRENT_DATE)::int,
                    ((EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-12-31')::date,
                    true,
                    EXTRACT(YEAR FROM CURRENT_DATE)::int,
                    ((EXTRACT(YEAR FROM CURRENT_DATE)::int + 1) || '-12-31')::date,
                    0,
                    NOW()
                FROM users u
                WHERE u.client_category = 'member'
                  AND NOT EXISTS (
                      SELECT 1 FROM member_statutory_rights msr WHERE msr.user_id = u.id
                  )
            `);

            const after = await collectDatabaseSnapshot(tx);

            // 4. Sigurnosna provjera: sve matične tablice i postavke moraju imati identičan broj zapisa!
            for (const [tableName, beforeCount] of Object.entries(before.preserved)) {
                const afterCount = after.preserved[tableName];
                if (beforeCount !== afterCount) {
                    throw new Error(
                        `SIGURNOSNI PREKID (ROLLBACK): Broj zapisa u zaštićenoj tablici '${tableName}' promijenio se s ${beforeCount} na ${afterCount}!`
                    );
                }
            }

            // 5. Zapis početnog produkcijskog događaja u audit_log
            await tx.execute(sql`
                INSERT INTO audit_log (action, entity_type, payload, ip_address, created_at)
                VALUES (
                    'production_reset_completed',
                    'system',
                    ${JSON.stringify({
                        note: "Izbrisani radni podaci iz faze testiranja i resetirani brojači za početak produkcijskog rada",
                        deletedOperationalCounts: before.operational,
                    })}::jsonb,
                    ${req.ip || "admin"},
                    NOW()
                )
            `);

            const finalSnapshot = await collectDatabaseSnapshot(tx);
            return { before, after: finalSnapshot };
        });

        console.log(`[MemberSync API] Production operational data reset completed successfully.`);

        res.json({
            success: true,
            dryRun: false,
            message: "Uspješno izbrisani radni podaci i resetirani brojači. Svi korisnici, plovila, vezovi i postavke su sačuvani.",
            before: result.before,
            after: result.after,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Error resetting operational data:", err);
        res.status(500).json({
            success: false,
            error: `Greška pri brisanju radnih podataka: ${err?.message || err}`,
        });
    }
});

/**
 * @route POST /api/v1/member-sync/reset-members
 * Sigurno briše sve uvezene korisnike (uloga 'user') i pripadajuće podatke (plovila, vezove, članstva)
 * Zadržava administratore i operatere
 */
router.post("/reset-members", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) {
            return res.status(500).json({ success: false, error: "Database not available" });
        }

        console.log(`[MemberSync API] Reset members initiated by ${req.ip}`);

        await db.execute(sql`
            TRUNCATE TABLE 
                berth_assignments,
                land_waiting_list,
                land_occupancies,
                waiting_list,
                user_card_entries,
                work_orders,
                reservations,
                member_statutory_rights,
                member_memberships,
                member_links,
                sync_conflicts,
                sync_runs,
                messages,
                email_verification_tokens,
                vessels
            CASCADE;

            DELETE FROM operator_cranes WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');
            UPDATE audit_log SET actor_id = NULL WHERE actor_id NOT IN (SELECT id FROM users WHERE role = 'admin');
            UPDATE crane_operation_log SET operator_id = NULL WHERE operator_id NOT IN (SELECT id FROM users WHERE role = 'admin');
            DELETE FROM users WHERE role != 'admin';
        `);

        console.log(`[MemberSync API] Reset completed successfully.`);

        res.json({
            success: true,
            message: `Uspješno obrisani svi uvezani članovi i sva pridružena plovila/vezovi. Admin računi su sačuvani.`,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Error resetting members:", err);
        res.status(500).json({
            success: false,
            error: `Greška pri brisanju članova: ${err?.message || err}`,
        });
    }
});

/**
 * @route POST /api/v1/member-sync/seed-akvatorij
 * Inicijalizira klubove, gatove i svih 811 fizičkih vezova ako nedostaju
 */
router.post("/seed-akvatorij", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const { ensureAkvatorijSeeded } = await import("../memberSync/seedAkvatorijHelper");
        await ensureAkvatorijSeeded();
        res.json({
            success: true,
            message: "Akvatorij i svih 811 vezova uspješno inicijalizirani.",
        });
    } catch (err: any) {
        console.error("[MemberSync API] Error seeding akvatorij:", err);
        res.status(500).json({
            success: false,
            error: `Greška pri inicijalizaciji akvatorija: ${err?.message || err}`,
        });
    }
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

        if (body?.resetBeforeSync === true) {
            console.log(`[MemberSync API] resetBeforeSync requested by ${req.ip}. Cleaning existing members...`);
            const db = await getDb();
            if (db) {
                await db.execute(sql`
                    TRUNCATE TABLE 
                        berth_assignments,
                        land_waiting_list,
                        land_occupancies,
                        waiting_list,
                        user_card_entries,
                        work_orders,
                        reservations,
                        member_statutory_rights,
                        member_memberships,
                        member_links,
                        sync_conflicts,
                        sync_runs,
                        messages,
                        email_verification_tokens,
                        vessels
                    CASCADE;

                    DELETE FROM operator_cranes WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin');
                    UPDATE audit_log SET actor_id = NULL WHERE actor_id NOT IN (SELECT id FROM users WHERE role = 'admin');
                    UPDATE crane_operation_log SET operator_id = NULL WHERE operator_id NOT IN (SELECT id FROM users WHERE role = 'admin');
                    DELETE FROM users WHERE role != 'admin';
                `);
                console.log(`[MemberSync API] resetBeforeSync TRUNCATE CASCADE completed successfully.`);
            }
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
