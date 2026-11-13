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
import { sql, eq, and, isNull } from "drizzle-orm";
import {
    landZones,
    landSpots,
    landOccupancies,
    vessels,
    users,
    auditLog,
    cranes,
    craneZoneAffinities,
    reservations,
    workOrders,
    userCardEntries,
    memberStatutoryRights,
    craneOperationLog,
} from "../../drizzle/schema";

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

/**
 * @route POST /api/v1/member-sync/import-land-state
 * Uvoz početnog stanja na kopnu (RASPORED NA KOPNU.xlsx)
 * Sinkronizira 90 plovila na kopnu, njihova mjesta, zone, vlasnike i napomene
 */
router.post("/import-land-state", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) {
            return res.status(500).json({ success: false, error: "Database not available" });
        }

        const items = req.body?.items;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Tijelo zahtjeva mora sadržavati polje 'items' s popisom plovila.",
            });
        }

        console.log(`[MemberSync API] Primljen zahtjev za uvoz početnog stanja kopna (${items.length} stavki) od ${req.ip}`);

        const normalizeReg = (reg: string): string => {
            return reg.toUpperCase().replace(/\s+/g, "").replace(/[-_]/g, "");
        };

        // 1. Osiguraj postojanje zone 'MD' (Mala dizalica)
        let [mdZone] = await db.select().from(landZones).where(eq(landZones.code, "MD")).limit(1);
        if (!mdZone) {
            console.log("[MemberSync API] Dodavanje zone 'MD'...");
            const [inserted] = await db
                .insert(landZones)
                .values({
                    name: "Mala dizalica",
                    code: "MD",
                    totalSpots: 5,
                    manualOccupiedSpots: 0,
                    description: "Plato i prostor uz malu dizalicu",
                    sortOrder: 6,
                    isActive: true,
                })
                .returning();
            mdZone = inserted;
        }

        // 2. Osiguraj mjesta MD-01 do MD-05
        const existingMdSpots = await db.select().from(landSpots).where(eq(landSpots.zoneId, mdZone.id));
        if (existingMdSpots.length === 0) {
            console.log("[MemberSync API] Kreiranje mjesta MD-01 do MD-05...");
            const mdSpotsToInsert = [];
            for (let i = 1; i <= 5; i++) {
                mdSpotsToInsert.push({
                    zoneId: mdZone.id,
                    spotNumber: i,
                    code: `MD-${String(i).padStart(2, "0")}`,
                    maxLengthM: "10.00",
                    maxBeamM: "3.50",
                    maxWeightTons: "5.00",
                    isActive: true,
                    isBlocked: false,
                    sortOrder: i,
                });
            }
            await db.insert(landSpots).values(mdSpotsToInsert);
        }

        // 3. Osiguraj sistemskog korisnika za nepoznate vlasnike / goste
        let [placeholderUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, "gost-kopno@spinut.hr"))
            .limit(1);

        if (!placeholderUser) {
            const [inserted] = await db
                .insert(users)
                .values({
                    email: "gost-kopno@spinut.hr",
                    name: "Nepoznati vlasnik / Gost",
                    firstName: "Gost",
                    lastName: "Kopno",
                    clientCategory: "commercial",
                    role: "user",
                    userStatus: "active",
                    city: "Split",
                    postalCode: "21000",
                })
                .returning();
            placeholderUser = inserted;
        }

        // 4. Dohvati administratora za audit / createdBy
        const [adminUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, "admin"))
            .limit(1);
        const adminId = adminUser?.id || null;

        // 5. Brisanje prethodnih aktivnih zauzeća ako je zatraženo (default true)
        if (req.body?.resetOccupancies !== false) {
            console.log("[MemberSync API] Brisanje prethodnih zapisa u land_occupancies...");
            await db.delete(landOccupancies);
        }

        // 6. Učitaj sve zone, mjesta, plovila i korisnike
        const allZones = await db.select().from(landZones);
        const allSpots = await db.select().from(landSpots);
        const allVessels = await db.select().from(vessels);
        const allUsers = await db.select().from(users);

        const localVessels = [...allVessels];
        const localUsers = [...allUsers];

        let vesselsCreatedCount = 0;
        let usersCreatedCount = 0;
        const occupanciesToInsert: any[] = [];

        for (const item of items) {
            const zone = allZones.find((z) => z.code === item.zoneCode);
            if (!zone) {
                console.warn(`[MemberSync API] Zona s kodom ${item.zoneCode} nije pronađena!`);
                continue;
            }

            const spot = allSpots.find(
                (s) => s.zoneId === zone.id && s.spotNumber === Number(item.spotNumber)
            );

            // Match vessel
            let targetVessel = localVessels.find(
                (v) => v.registration && normalizeReg(v.registration) === normalizeReg(item.reg)
            );

            if (!targetVessel && item.altReg) {
                targetVessel = localVessels.find(
                    (v) => v.registration && normalizeReg(v.registration) === normalizeReg(item.altReg)
                );
            }

            if (!targetVessel) {
                targetVessel = localVessels.find(
                    (v) => v.name && v.name.trim().toLowerCase() === item.reg.trim().toLowerCase()
                );
            }

            // Match owner
            let targetUser = targetVessel ? localUsers.find((u) => u.id === targetVessel!.ownerId) : null;

            const ownerStr = (item.owner || "").trim();
            if (!targetUser && ownerStr) {
                if (ownerStr.toLowerCase().startsWith("radina")) {
                    let uRadina = localUsers.find((u) => u.name?.toLowerCase().includes("radina b"));
                    if (!uRadina) {
                        const [newU] = await db
                            .insert(users)
                            .values({
                                name: "Radina B.",
                                lastName: "Radina",
                                firstName: "B.",
                                phone: item.phone || "098634128",
                                role: "user",
                                clientCategory: "commercial",
                                city: "Split",
                                postalCode: "21000",
                            })
                            .returning();
                        uRadina = newU;
                        localUsers.push(newU);
                        usersCreatedCount++;
                    }
                    targetUser = uRadina;
                } else if (ownerStr.toLowerCase().startsWith("ivančević n")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("nikola ivančević")) || null;
                } else if (ownerStr.toLowerCase().startsWith("mladinić m")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("mario mladinić")) || null;
                } else if (ownerStr.toLowerCase().startsWith("dujmović m")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("marin dujmović")) || null;
                } else if (ownerStr.toLowerCase().startsWith("šakić")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("branko šakić")) || null;
                } else if (ownerStr.toLowerCase().startsWith("sekulić")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("nikola sekulić")) || null;
                } else if (ownerStr.toLowerCase().startsWith("barić f")) {
                    targetUser = localUsers.find((u) => u.name?.toLowerCase().includes("filip barišić")) || null;
                    if (!targetUser) {
                        const [newU] = await db
                            .insert(users)
                            .values({
                                name: "Barić F.",
                                lastName: "Barić",
                                firstName: "F.",
                                role: "user",
                                clientCategory: "commercial",
                                city: "Split",
                                postalCode: "21000",
                            })
                            .returning();
                        targetUser = newU;
                        localUsers.push(newU);
                        usersCreatedCount++;
                    }
                } else {
                    const parts = ownerStr.split(/[\s.]+/).filter((p: string) => p.length > 2);
                    targetUser = localUsers.find((u) => {
                        const uFull = `${u.firstName || ""} ${u.lastName || ""} ${u.name || ""}`.toLowerCase();
                        return parts.some((p: string) => uFull.includes(p.toLowerCase()));
                    }) || null;
                }
            }

            if (!targetUser) {
                targetUser = placeholderUser;
            }

            // Create vessel if needed
            if (!targetVessel) {
                let vType: "jedrilica" | "motorni" | "katamaran" | "ostalo" = "motorni";
                const lowerDesc = `${item.reg} ${item.fullNote || ""}`.toLowerCase();
                if (lowerDesc.includes("jedrilic") || lowerDesc.includes("jed.") || lowerDesc.includes("dufour")) {
                    vType = "jedrilica";
                } else if (lowerDesc.includes("katamaran") || lowerDesc.includes("pajot")) {
                    vType = "katamaran";
                }

                const isFormalReg = /^[A-ZŠĐČĆŽ]{2}[-_ ]?[0-9]+/i.test(item.reg) || /^[0-9]+[-_ ][A-ZŠĐČĆŽ]{2}/i.test(item.reg);
                const vesselReg = isFormalReg ? item.reg : null;
                const vesselName = !isFormalReg ? item.reg : (ownerStr ? `${item.reg} (${ownerStr})` : item.reg);

                const [newVessel] = await db
                    .insert(vessels)
                    .values({
                        ownerId: targetUser.id,
                        name: vesselName,
                        type: vType,
                        registration: vesselReg,
                    })
                    .returning();

                targetVessel = newVessel;
                localVessels.push(newVessel);
                vesselsCreatedCount++;
            }

            const liftedAtDate = item.liftedAt ? new Date(item.liftedAt) : new Date("2026-01-01T08:00:00Z");

            occupanciesToInsert.push({
                vesselId: targetVessel.id,
                userId: targetUser.id,
                zoneId: zone.id,
                spotId: spot?.id || null,
                spotNumber: Number(item.spotNumber),
                liftedAt: liftedAtDate,
                returnedAt: null,
                note: item.fullNote || item.note || null,
                createdBy: adminId,
            });
        }

        // 7. Bulk insert all occupancies
        for (let i = 0; i < occupanciesToInsert.length; i += 25) {
            await db.insert(landOccupancies).values(occupanciesToInsert.slice(i, i + 25));
        }

        // 8. Reset manualOccupiedSpots to 0 across all land zones
        await db.update(landZones).set({ manualOccupiedSpots: 0, updatedAt: new Date() });

        // 9. Write audit log entry
        if (adminId) {
            await db.insert(auditLog).values({
                actorId: adminId,
                action: "initial_land_occupancy_import",
                entityType: "land_occupancy",
                entityId: adminId,
                payload: {
                    totalBoats: occupanciesToInsert.length,
                    vesselsCreatedCount,
                    usersCreatedCount,
                    importedAt: new Date().toISOString(),
                    source: "remote_api_import",
                },
            });
        }

        // 10. Generate zone breakdown summary
        const finalZones = await db.select().from(landZones);
        const breakdown = [];
        for (const z of finalZones.sort((a, b) => a.sortOrder - b.sortOrder)) {
            const occs = await db
                .select({ count: sql<number>`count(*)` })
                .from(landOccupancies)
                .where(and(eq(landOccupancies.zoneId, z.id), isNull(landOccupancies.returnedAt)));
            const occupied = Number(occs[0]?.count || 0);
            breakdown.push({
                code: z.code,
                name: z.name,
                totalSpots: z.totalSpots,
                occupied,
                free: z.totalSpots - occupied,
                occupancyPct: `${((occupied / z.totalSpots) * 100).toFixed(1)}%`,
            });
        }

        console.log(`[MemberSync API] Uvoz početnog stanja kopna uspješno dovršen: ${occupanciesToInsert.length} zauzeća.`);

        res.json({
            success: true,
            totalImported: occupanciesToInsert.length,
            vesselsCreatedCount,
            usersCreatedCount,
            breakdown,
            message: `Uspješno uvezeno ${occupanciesToInsert.length} plovila u početno stanje kopna na poslužitelju.`,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Greška pri uvozu početnog stanja kopna:", err);
        res.status(500).json({
            success: false,
            error: `Greška pri uvozu početnog stanja kopna: ${err?.message || err}`,
        });
    }
});

/**
 * @route POST /api/v1/member-sync/inspect-work-order
 * Pregled radnog naloga, rezervacije, plovila i zauzeća kopna
 */
router.post("/inspect-work-order", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ success: false, error: "Baza nije dostupna" });

        const { orderNumber, vesselReg } = req.body;

        let matchedOrders: any[] = [];
        if (orderNumber) {
            matchedOrders = await db.select().from(workOrders).where(eq(workOrders.orderNumber, orderNumber));
        }

        let matchedVessels: any[] = [];
        if (vesselReg) {
            matchedVessels = await db.select().from(vessels).where(
                sql`UPPER(REPLACE(REPLACE(COALESCE(registration, ''), ' ', ''), '-', '')) = UPPER(REPLACE(REPLACE(${vesselReg}, ' ', ''), '-', ''))`
            );
        }

        const matchedReservations: any[] = [];
        const matchedOccupancies: any[] = [];

        for (const order of matchedOrders) {
            if (order.reservationId) {
                const [r] = await db.select().from(reservations).where(eq(reservations.id, order.reservationId));
                if (r) matchedReservations.push(r);
            }
            if (order.vesselId) {
                const occs = await db.select().from(landOccupancies).where(eq(landOccupancies.vesselId, order.vesselId));
                matchedOccupancies.push(...occs);
            }
        }

        for (const v of matchedVessels) {
            const vRes = await db.select().from(reservations).where(eq(reservations.vesselId, v.id));
            matchedReservations.push(...vRes);
            const occs = await db.select().from(landOccupancies).where(eq(landOccupancies.vesselId, v.id));
            matchedOccupancies.push(...occs);
        }

        const allZones = await db.select().from(landZones);

        res.json({
            success: true,
            workOrders: matchedOrders,
            vessels: matchedVessels,
            reservations: matchedReservations,
            occupancies: matchedOccupancies,
            zones: allZones,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Greška pri pregledu radnog naloga:", err);
        res.status(500).json({ success: false, error: err.message || err });
    }
});

/**
 * @route POST /api/v1/member-sync/fix-crane-only-order
 * Ispravlja radni nalog i rezervaciju koji su trebali biti Samo dizalica (bez mjesta na kopnu),
 * a pogrešno su dobili mjesto u Servisnoj zoni:
 * 1. Postavlja reservations.land_zone_id = NULL
 * 2. Briše pogrešno kreirano aktivno zauzeće u land_occupancies za to plovilo/rezervaciju
 * 3. Zapisuje audit_log s punim tragom ispravka
 */
router.post("/fix-crane-only-order", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ success: false, error: "Baza nije dostupna" });

        const { orderNumber, expectedReg } = req.body;
        if (!orderNumber) {
            return res.status(400).json({ success: false, error: "Nedostaje parametar 'orderNumber'" });
        }

        const result = await db.transaction(async (tx) => {
            const [order] = await tx.select().from(workOrders).where(eq(workOrders.orderNumber, orderNumber)).for("update");
            if (!order) {
                throw new Error(`Radni nalog '${orderNumber}' nije pronađen.`);
            }

            let vessel: any = null;
            if (order.vesselId) {
                const [v] = await tx.select().from(vessels).where(eq(vessels.id, order.vesselId));
                vessel = v;
            }

            let reservation: any = null;
            if (order.reservationId) {
                const [r] = await tx.select().from(reservations).where(eq(reservations.id, order.reservationId)).for("update");
                reservation = r;
            }

            // Verify registration if provided
            if (expectedReg && vessel) {
                const normExpected = expectedReg.toUpperCase().replace(/[\s-_]/g, "");
                const normReg = (vessel.registration || vessel.name || "").toUpperCase().replace(/[\s-_]/g, "");
                if (!normReg.includes(normExpected) && !normExpected.includes(normReg)) {
                    throw new Error(`Plovilo naloga '${orderNumber}' (${normReg}) ne odgovara očekivanoj registraciji '${expectedReg}'.`);
                }
            }

            // Find erroneous active occupancies for this vessel / reservation
            let deletedOccupancies: any[] = [];
            if (order.vesselId) {
                const activeOccs = await tx
                    .select()
                    .from(landOccupancies)
                    .where(and(eq(landOccupancies.vesselId, order.vesselId), isNull(landOccupancies.returnedAt)));

                for (const occ of activeOccs) {
                    await tx.delete(landOccupancies).where(eq(landOccupancies.id, occ.id));
                    deletedOccupancies.push(occ);
                }
            }

            // Clear landZoneId on reservation
            if (reservation) {
                await tx
                    .update(reservations)
                    .set({
                        landZoneId: null,
                        adminNote: reservation.adminNote
                            ? `${reservation.adminNote} | Ispravak: Samo dizalica (uklonjena zona)`.trim()
                            : "Ispravak: Samo dizalica (uklonjena zona)",
                        updatedAt: new Date(),
                    })
                    .where(eq(reservations.id, reservation.id));
            }

            // Update work order notes to be clear
            const updatedNote = order.operatorNotes
                ? (order.operatorNotes.includes("Samo dizalica") ? order.operatorNotes : `${order.operatorNotes} | Samo dizalica (bez mjesta na kopnu)`).trim()
                : "Samo dizalica (bez mjesta na kopnu)";

            await tx
                .update(workOrders)
                .set({
                    operatorNotes: updatedNote,
                    updatedAt: new Date(),
                })
                .where(eq(workOrders.id, order.id));

            // Write audit log entry
            await tx.insert(auditLog).values({
                actorId: order.operatorId || order.userId,
                action: "admin_fix_crane_only_order",
                entityType: "work_orders",
                entityId: order.id,
                payload: {
                    orderNumber: order.orderNumber,
                    reservationId: reservation?.id,
                    vesselId: vessel?.id,
                    vesselRegistration: vessel?.registration || vessel?.name,
                    previousReservationLandZoneId: reservation?.landZoneId,
                    deletedOccupanciesCount: deletedOccupancies.length,
                    deletedOccupancies: deletedOccupancies.map((o) => ({
                        id: o.id,
                        zoneId: o.zoneId,
                        spotNumber: o.spotNumber,
                        liftedAt: o.liftedAt,
                    })),
                    correctedAt: new Date().toISOString(),
                    reason: "Ispravak pogreške: operacija je bila označena kao Samo dizalica (bez mjesta na kopnu), uklonjeno dodijeljeno mjesto u Servisnoj zoni.",
                },
            });

            return {
                orderNumber: order.orderNumber,
                vessel: vessel ? { id: vessel.id, name: vessel.name, registration: vessel.registration } : null,
                reservationId: reservation?.id,
                previousLandZoneId: reservation?.landZoneId,
                newLandZoneId: null,
                deletedOccupanciesCount: deletedOccupancies.length,
                deletedOccupancies,
            };
        });

        res.json({
            success: true,
            message: `Radni nalog ${orderNumber} i rezervacija su uspješno ispravljeni: uklonjena Servisna zona i obrisano ${result.deletedOccupanciesCount} zauzeće kopna.`,
            result,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Greška pri ispravku radnog naloga:", err);
        res.status(500).json({ success: false, error: err.message || err });
    }
});

/**
 * @route POST /api/v1/member-sync/fix-drinkovic-and-polic
 * 
 * Siguran i kontroliran ispravak operaterskih pogrešaka:
 * 1. Zamjena plovila i vlasnika:
 *    - 11.11.2026. izvađen je JL-247206 (Ivan Drinković), a ne JL-240008 (Martin Drinković).
 *      Ažurira se: Radni nalog RN-2026-00019, rezervacija REZ-2026-DDAA18, zauzeće kopna, kartica člana i statutarna kvota.
 *    - 17.11.2026. rezerviran je termin za vađenje JL-240008 (Martin Drinković), koji je bio privremeno rezerviran na Ivana.
 *      Ažurira se: Rezervacija REZ-2026-E8AF8D.
 * 2. Ispravak datuma vađenja za Nikolu Polića (ST-5150) u servisnu zonu:
 *    - Umjesto 09.12.2026. (buduća godina upisana greškom) postavlja se stvarni datum 09.12.2025.
 * 
 * Podržava { dryRun: true } za prethodnu inspekciju bez izmjena.
 */
router.post("/fix-drinkovic-and-polic", requireSyncApiKey, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        if (!db) return res.status(500).json({ success: false, error: "Baza nije dostupna" });

        const isDryRun = req.body.dryRun !== false && req.body.confirm !== true;

        // 1. Dohvat plovila JL-240008 (Martin) i JL-247206 (Ivan)
        const [vessel240008] = await db
            .select()
            .from(vessels)
            .where(sql`UPPER(REPLACE(REPLACE(COALESCE(registration, ''), ' ', ''), '-', '')) = 'JL240008'`);
        if (!vessel240008) {
            return res.status(404).json({ success: false, error: "Plovilo JL-240008 nije pronađeno u bazi" });
        }

        const [vessel247206] = await db
            .select()
            .from(vessels)
            .where(sql`UPPER(REPLACE(REPLACE(COALESCE(registration, ''), ' ', ''), '-', '')) = 'JL247206'`);
        if (!vessel247206) {
            return res.status(404).json({ success: false, error: "Plovilo JL-247206 nije pronađeno u bazi" });
        }

        // Dohvat vlasnika
        const [ownerMartin] = await db.select().from(users).where(eq(users.id, vessel240008.ownerId));
        const [ownerIvan] = await db.select().from(users).where(eq(users.id, vessel247206.ownerId));

        // 2. Radni nalog RN-2026-00019 i rezervacija REZ-2026-DDAA18 (11.11.2026.)
        const [order19] = await db.select().from(workOrders).where(eq(workOrders.orderNumber, "RN-2026-00019"));
        if (!order19) {
            return res.status(404).json({ success: false, error: "Radni nalog RN-2026-00019 nije pronađen" });
        }

        const [res11] = await db.select().from(reservations).where(eq(reservations.reservationNumber, "REZ-2026-DDAA18"));
        if (!res11) {
            return res.status(404).json({ success: false, error: "Rezervacija REZ-2026-DDAA18 nije pronađena" });
        }

        // Zauzeće kopna za 11.11.
        const [occDrinkovic] = await db
            .select()
            .from(landOccupancies)
            .where(and(eq(landOccupancies.vesselId, vessel240008.id), isNull(landOccupancies.returnedAt)));

        // Kartica člana za RN-2026-00019
        const cardEntriesDrinkovic = await db
            .select()
            .from(userCardEntries)
            .where(eq(userCardEntries.workOrderId, order19.id));

        // Statutarna prava za Martina i Ivana
        const [rightsMartin] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, ownerMartin.id));
        const [rightsIvan] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, ownerIvan.id));

        // 3. Rezervacija REZ-2026-E8AF8D (17.11.2026.)
        const [res17] = await db.select().from(reservations).where(eq(reservations.reservationNumber, "REZ-2026-E8AF8D"));
        if (!res17) {
            return res.status(404).json({ success: false, error: "Rezervacija REZ-2026-E8AF8D nije pronađena" });
        }

        // 4. Plovilo ST-5150 i zauzeće u Servisnoj zoni (Nikola Polić)
        const [vessel5150] = await db
            .select()
            .from(vessels)
            .where(sql`UPPER(REPLACE(REPLACE(COALESCE(registration, ''), ' ', ''), '-', '')) = 'ST5150'`);
        if (!vessel5150) {
            return res.status(404).json({ success: false, error: "Plovilo ST-5150 nije pronađeno u bazi" });
        }

        const [occPolic] = await db
            .select()
            .from(landOccupancies)
            .where(and(eq(landOccupancies.vesselId, vessel5150.id), isNull(landOccupancies.returnedAt)));
        if (!occPolic) {
            return res.status(404).json({ success: false, error: "Aktivno zauzeće kopna za ST-5150 nije pronađeno" });
        }

        const preview = {
            drinkovic: {
                vesselCurrent11: { id: vessel240008.id, reg: vessel240008.registration, name: vessel240008.name, owner: ownerMartin?.name },
                vesselActual11: { id: vessel247206.id, reg: vessel247206.registration, name: vessel247206.name, owner: ownerIvan?.name },
                workOrder19: { id: order19.id, orderNumber: order19.orderNumber, currentUserId: order19.userId, currentVesselId: order19.vesselId },
                reservation11: { id: res11.id, resNumber: res11.reservationNumber, currentReg: res11.vesselRegistration },
                reservation17: { id: res17.id, resNumber: res17.reservationNumber, currentReg: res17.vesselRegistration },
                occupancy11: occDrinkovic ? { id: occDrinkovic.id, currentVesselId: occDrinkovic.vesselId, note: occDrinkovic.note } : null,
                cardEntriesCount: cardEntriesDrinkovic.length,
                rightsMartin: rightsMartin ? { userId: rightsMartin.userId, liftAvailable: rightsMartin.liftAvailable } : null,
                rightsIvan: rightsIvan ? { userId: rightsIvan.userId, liftAvailable: rightsIvan.liftAvailable } : null,
            },
            polic: {
                vessel: { id: vessel5150.id, reg: vessel5150.registration },
                occupancy: {
                    id: occPolic.id,
                    currentLiftedAt: occPolic.liftedAt,
                    newLiftedAt: "2025-12-09T08:00:00.000Z",
                    currentNote: occPolic.note,
                },
            },
        };

        if (isDryRun) {
            return res.json({
                success: true,
                dryRun: true,
                message: "Dry run: Prikaz stanja prije izmjena. Za primjenu pošaljite { confirm: true }.",
                preview,
            });
        }

        // Primjena izmjena unutar transakcije
        const result = await db.transaction(async (tx) => {
            const now = new Date();

            // 1. Radni nalog RN-2026-00019
            await tx
                .update(workOrders)
                .set({
                    userId: ownerIvan.id,
                    vesselId: vessel247206.id,
                    vesselLengthM: vessel247206.lengthM || "11.92",
                    operatorNotes: order19.operatorNotes
                        ? `${order19.operatorNotes} | Ispravak 13.11.2026: Zamijenjeno pogrešno plovilo JL-240008 stvarno izvađenim plovilom JL-247206 (Ivan Drinković)`.trim()
                        : "Ispravak 13.11.2026: Zamijenjeno pogrešno plovilo JL-240008 stvarno izvađenim plovilom JL-247206 (Ivan Drinković)",
                    updatedAt: now,
                })
                .where(eq(workOrders.id, order19.id));

            // 2. Rezervacija REZ-2026-DDAA18 (11.11.)
            await tx
                .update(reservations)
                .set({
                    userId: ownerIvan.id,
                    vesselId: vessel247206.id,
                    vesselRegistration: vessel247206.registration || "JL-247206",
                    vesselName: vessel247206.name || "MAREUS 2",
                    vesselLengthM: vessel247206.lengthM || "11.92",
                    vesselBeamM: vessel247206.beamM || "3.78",
                    adminNote: res11.adminNote
                        ? `${res11.adminNote} | Ispravak 13.11.2026: Plovilo ispravljeno na JL-247206 (Ivan Drinković)`.trim()
                        : "Ispravak 13.11.2026: Plovilo ispravljeno na JL-247206 (Ivan Drinković)",
                    updatedAt: now,
                })
                .where(eq(reservations.id, res11.id));

            // 3. Zauzeće kopna za 11.11.
            if (occDrinkovic) {
                await tx
                    .update(landOccupancies)
                    .set({
                        userId: ownerIvan.id,
                        vesselId: vessel247206.id,
                        note: occDrinkovic.note
                            ? `${occDrinkovic.note} | Ispravak 13.11.2026: JL-247206 Ivan Drinković`.trim()
                            : "Ispravak 13.11.2026: JL-247206 Ivan Drinković",
                        updatedAt: now,
                    })
                    .where(eq(landOccupancies.id, occDrinkovic.id));
            }

            // 4. Kartica člana (user_card_entries) za RN-2026-00019
            await tx
                .update(userCardEntries)
                .set({
                    userId: ownerIvan.id,
                    vesselName: vessel247206.name || "MAREUS 2",
                    vesselRegistration: vessel247206.registration || "JL-247206",
                    note: `Radni nalog RN-2026-00019 - Pokriveno godišnjom članarinom (Ispravak: JL-247206 Ivan Drinković)`,
                })
                .where(eq(userCardEntries.workOrderId, order19.id));

            // 5. Statutarna prava (member_statutory_rights)
            // Vraćamo kvotu Martinu Drinkoviću (jer njegov brod nije izvađen 11.11.)
            await tx
                .update(memberStatutoryRights)
                .set({
                    liftAvailable: true,
                    updatedAt: now,
                })
                .where(eq(memberStatutoryRights.userId, ownerMartin.id));

            // Skida se kvota Ivanu Drinkoviću (jer je njegov brod izvađen 11.11.)
            await tx
                .update(memberStatutoryRights)
                .set({
                    liftAvailable: false,
                    liftAcquiredYear: 2026,
                    updatedAt: now,
                })
                .where(eq(memberStatutoryRights.userId, ownerIvan.id));

            // 6. Rezervacija REZ-2026-E8AF8D (17.11.) - prebacujemo na Martina Drinkovića (JL-240008)
            await tx
                .update(reservations)
                .set({
                    userId: ownerMartin.id,
                    vesselId: vessel240008.id,
                    vesselRegistration: vessel240008.registration || "JL-240008",
                    vesselName: vessel240008.name || "MAREUS III",
                    vesselLengthM: vessel240008.lengthM || "11.00",
                    vesselBeamM: vessel240008.beamM || "3.75",
                    adminNote: res17.adminNote
                        ? `${res17.adminNote} | Ispravak 13.11.2026: Prebačeno na stvarno plovilo JL-240008 (Martin Drinković)`.trim()
                        : "Ispravak 13.11.2026: Prebačeno na stvarno plovilo JL-240008 (Martin Drinković)",
                    updatedAt: now,
                })
                .where(eq(reservations.id, res17.id));

            // 7. Nikola Polić (ST-5150) - ispravak godine vađenja 2026 -> 2025
            const correctedDate = new Date("2025-12-09T08:00:00.000Z");
            const correctedNote = occPolic.note
                ? occPolic.note.replace("09.12.26.", "09.12.25. (ispravljena pogrešna godina 2026->2025)")
                : "Izvorno vađenje: 09.12.25. (ispravljena pogrešna godina 2026->2025)";

            await tx
                .update(landOccupancies)
                .set({
                    liftedAt: correctedDate,
                    note: correctedNote,
                    updatedAt: now,
                })
                .where(eq(landOccupancies.id, occPolic.id));

            // 8. Audit log zapisi
            const actorId = order19.operatorId || ownerIvan.id;

            await tx.insert(auditLog).values({
                actorId,
                action: "admin_fix_drinkovic_swap",
                entityType: "work_orders",
                entityId: order19.id,
                payload: {
                    reason: "Operaterska greška: 11.11.2026. izvađen JL-247206 Ivan Drinković, a upisan JL-240008 Martin Drinković. 17.11. se vadi JL-240008.",
                    workOrder: order19.orderNumber,
                    previousVessel: vessel240008.registration,
                    newVessel: vessel247206.registration,
                    previousUser: ownerMartin.name,
                    newUser: ownerIvan.name,
                    swappedReservationNov17: res17.reservationNumber,
                    correctedAt: now.toISOString(),
                },
            });

            await tx.insert(auditLog).values({
                actorId,
                action: "admin_fix_polic_date",
                entityType: "land_occupancy",
                entityId: occPolic.id,
                payload: {
                    reason: "Operaterska greška u Excel tablici: ST-5150 Nikola Polić je izvađen 09.12.2025., a ne 2026.",
                    vesselRegistration: vessel5150.registration,
                    previousLiftedAt: occPolic.liftedAt,
                    newLiftedAt: correctedDate.toISOString(),
                    correctedAt: now.toISOString(),
                },
            });

            return {
                workOrder19: { id: order19.id, orderNumber: order19.orderNumber, updatedToVessel: vessel247206.registration, updatedToUser: ownerIvan.name },
                reservation11: { id: res11.id, resNumber: res11.reservationNumber, updatedToVessel: vessel247206.registration },
                reservation17: { id: res17.id, resNumber: res17.reservationNumber, updatedToVessel: vessel240008.registration, updatedToUser: ownerMartin.name },
                occupancy11: occDrinkovic ? { id: occDrinkovic.id, updatedToVessel: vessel247206.registration } : null,
                policOccupancy: { id: occPolic.id, updatedLiftedAt: correctedDate.toISOString() },
            };
        });

        console.log("[MemberSync API] Uspješno primijenjeni ispravci za Drinkovića i Polića.");

        res.json({
            success: true,
            dryRun: false,
            message: "Uspješno ispravljene operaterske greške za Drinkovića (zamjena 11.11. i 17.11.) i Polića (godina 2025.)",
            result,
        });
    } catch (err: any) {
        console.error("[MemberSync API] Greška pri ispravku operaterskih unosa:", err);
        res.status(500).json({ success: false, error: err.message || err });
    }
});

export default router;
