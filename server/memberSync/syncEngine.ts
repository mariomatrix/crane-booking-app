/**
 * Member Sync — Sync Engine
 * Glavni orchestrator za jednosmjernu sinkronizaciju MSSQL → PostgreSQL
 * Idempotentna operacija: sigurno se može pokretati neograničen broj puta
 */
import { eq, and, ilike, sql, notInArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
    users,
    vessels,
    memberLinks,
    memberMemberships,
    syncRuns,
    syncConflicts,
    piers,
    berths,
    berthAssignments,
} from "../../drizzle/schema";
import { fetchAllClan03Members } from "./mssqlQueries";
import {
    normalizeOIB,
    validateOIB,
    hashJMBG,
    normalizePhone,
    selectEmail,
    mapVesselType,
    normalizeName,
} from "./utils";
import type { LegacyClan03Row, SyncCounters, FullSyncResult } from "./types";

/**
 * Pokreće sinkronizaciju izravno s MSSQL poslužitelja (ako je konfiguriran)
 * @param triggeredBy - 'cron' | 'manual' | 'startup'
 */
export async function runFullSync(triggeredBy: string = "cron"): Promise<FullSyncResult> {
    console.log("[MemberSync] Fetching CLAN03 rows from local MSSQL...");
    const clan03Rows = await fetchAllClan03Members();
    return processClan03Rows(clan03Rows, triggeredBy);
}

/**
 * Glavna funkcija za obradu CLAN03 zapisa (iz API push payload-a ili lokalnog upita)
 * @param clan03Rows - Polje zapisa iz CLAN03 tablice
 * @param triggeredBy - 'push_api' | 'manual' | 'cron'
 */
export async function processClan03Rows(
    clan03Rows: LegacyClan03Row[],
    triggeredBy: string = "push_api",
): Promise<FullSyncResult> {
    const db = await getDb();
    if (!db) throw new Error("PostgreSQL database not available");

    const startTime = Date.now();
    const counters: SyncCounters = {
        sourceRowsTotal: clan03Rows.length,
        membersCreated: 0,
        membersUpdated: 0,
        membersSkipped: 0,
        membersDeactivated: 0,
        vesselsCreated: 0,
        vesselsUpdated: 0,
        vesselsSkipped: 0,
        linksCreated: 0,
        membershipsCreated: 0,
        membershipsUpdated: 0,
        conflictsDetected: 0,
    };
    const errors: string[] = [];

    // 1. Kreiraj sync_runs zapis
    const [syncRun] = await db
        .insert(syncRuns)
        .values({
            startedAt: new Date(),
            status: "running",
            triggeredBy,
            sourceRowsTotal: clan03Rows.length,
        })
        .returning();

    const syncRunId = syncRun.id;
    console.log(`[MemberSync] Sync run ${syncRunId} started (rows: ${clan03Rows.length}, triggered by: ${triggeredBy})`);

    try {
        // 2. Set za praćenje viđenih MAT_BROJ (za soft-delete deaktivaciju)
        const seenMatBrojSet = new Set<string>();

        // 3. Procesiraj svaki red kroz deduplikacijski lanac
        for (const row of clan03Rows) {
            try {
                await processRow(db, syncRunId, row, counters, seenMatBrojSet);
            } catch (err) {
                const errMsg = `Error processing MAT_BROJ=${row.MAT_BROJ}: ${(err as Error).message}`;
                errors.push(errMsg);
                console.error(`[MemberSync] ${errMsg}`);
                counters.membersSkipped++;
            }
        }

        // 4. DEAKTIVACIJA: članovi koji nisu u tekućem sync setu
        if (seenMatBrojSet.size > 0) {
            const deactivated = await deactivateMissingMembers(db, seenMatBrojSet);
            counters.membersDeactivated = deactivated;
            if (deactivated > 0) {
                console.log(`[MemberSync] Deactivated ${deactivated} members not in current CLAN03 set`);
            }
        }

        // 5. Ažuriraj sync_runs zapis
        const status = errors.length > 0 ? "partial" : "completed";
        await db
            .update(syncRuns)
            .set({
                completedAt: new Date(),
                status,
                sourceRowsTotal: counters.sourceRowsTotal,
                membersCreated: counters.membersCreated,
                membersUpdated: counters.membersUpdated,
                membersSkipped: counters.membersSkipped,
                membersDeactivated: counters.membersDeactivated,
                vesselsCreated: counters.vesselsCreated,
                vesselsUpdated: counters.vesselsUpdated,
                vesselsSkipped: counters.vesselsSkipped,
                linksCreated: counters.linksCreated,
                membershipsCreated: counters.membershipsCreated,
                membershipsUpdated: counters.membershipsUpdated,
                conflictsDetected: counters.conflictsDetected,
                errorMessage: errors.length > 0 ? errors.join("\n") : null,
            })
            .where(eq(syncRuns.id, syncRunId));

        const duration = Date.now() - startTime;
        console.log(
            `[MemberSync] Sync run ${syncRunId} ${status} in ${duration}ms: ` +
            `members(+${counters.membersCreated} ~${counters.membersUpdated} -${counters.membersDeactivated}) ` +
            `vessels(+${counters.vesselsCreated} ~${counters.vesselsUpdated}) ` +
            `links(+${counters.linksCreated}) memberships(+${counters.membershipsCreated} ~${counters.membershipsUpdated}) ` +
            `conflicts(${counters.conflictsDetected}) errors(${errors.length})`,
        );

        return { syncRunId, status, counters, duration, errors };
    } catch (err) {
        // Fatal error
        const errorMessage = (err as Error).message;
        console.error(`[MemberSync] FATAL sync error:`, errorMessage);

        await db
            .update(syncRuns)
            .set({
                completedAt: new Date(),
                status: "failed",
                errorMessage,
                errorDetails: { stack: (err as Error).stack },
            })
            .where(eq(syncRuns.id, syncRunId));

        return {
            syncRunId,
            status: "failed",
            counters,
            duration: Date.now() - startTime,
            errors: [errorMessage],
        };
    }
}

/**
 * Procesira jedan CLAN03 red:
 * 1. Deduplikacija korisnika (Razina 0 → 1 → 2)
 * 2. Upsert member_links
 * 3. Upsert member_memberships
 * 4. Vessel deduplikacija i upsert
 */
async function processRow(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    syncRunId: string,
    row: LegacyClan03Row,
    counters: SyncCounters,
    seenMatBrojSet: Set<string>,
): Promise<void> {
    const matBroj = row.MAT_BROJ?.trim();
    if (!matBroj) {
        counters.membersSkipped++;
        return;
    }

    seenMatBrojSet.add(matBroj);

    // ─── Razina 0: member_links lookup (cache od prethodnih syncova) ───
    const existingLink = await db
        .select({ userId: memberLinks.userId })
        .from(memberLinks)
        .where(eq(memberLinks.legacyMatBroj, matBroj))
        .limit(1);

    let userId: string | null = existingLink[0]?.userId ?? null;
    let isNewUser = false;

    if (!userId) {
        // ─── Razina 1: OIB match ───────────────────────────────────────
        const oib = normalizeOIB(row.OIB);
        if (oib && validateOIB(oib)) {
            const oibMatch = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.oib, oib))
                .limit(1);

            if (oibMatch.length === 1) {
                userId = oibMatch[0].id;
            }
        } else if (oib && !validateOIB(oib)) {
            // OIB postoji ali je nevalidan — zapiši conflict
            await createConflict(db, syncRunId, "oib_mismatch", matBroj, row,
                `Nevalidan OIB "${row.OIB}" za ${row.PREZIME} ${row.IME} (MAT_BROJ: ${matBroj})`);
            counters.conflictsDetected++;
        }
    }

    if (!userId) {
        // ─── Razina 2: IME + PREZIME match ─────────────────────────────
        const firstName = row.IME?.trim();
        const lastName = row.PREZIME?.trim();

        if (firstName && lastName) {
            const nameMatches = await db
                .select({ id: users.id })
                .from(users)
                .where(
                    and(
                        ilike(users.firstName, firstName),
                        ilike(users.lastName, lastName),
                    ),
                );

            if (nameMatches.length === 1) {
                userId = nameMatches[0].id;
            } else if (nameMatches.length > 1) {
                // Višestruki match — conflict
                await createConflict(db, syncRunId, "duplicate_name", matBroj, row,
                    `Više korisnika s imenom "${firstName} ${lastName}" (${nameMatches.length} rezultata). MAT_BROJ: ${matBroj}`,
                    nameMatches.map((m) => m.id));
                counters.conflictsDetected++;
                counters.membersSkipped++;
                return; // preskoči ovaj red
            }
        }
    }

    // ─── Kreiraj ili ažuriraj korisnika ────────────────────────────────
    const oib = normalizeOIB(row.OIB);
    const validOib = oib && validateOIB(oib) ? oib : null;
    const email = selectEmail(row.Email, row.Emial);
    const phone = normalizePhone(row.MOBITEL);
    const firstName = normalizeName(row.IME);
    const lastName = normalizeName(row.PREZIME);
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName;
    const jmbgHash = hashJMBG(row.JMBG);

    if (!userId) {
        // INSERT novi korisnik
        // Provjeri da email nije NULL i da se ne duplicira
        let safeEmail = email;
        if (safeEmail) {
            const emailExists = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, safeEmail))
                .limit(1);
            if (emailExists.length > 0) {
                // Email već postoji — koristi tog korisnika
                userId = emailExists[0].id;
            }
        }

        if (!userId) {
            const [newUser] = await db
                .insert(users)
                .values({
                    email: safeEmail,
                    firstName,
                    lastName,
                    name: fullName,
                    oib: validOib,
                    jmbgHash,
                    phone,
                    address: row.ADRESA?.trim() || null,
                    city: row.Grad?.trim() || "Split",
                    postalCode: row.Ptt?.trim() || "21000",
                    isLegalEntity: row.firma === true,
                    role: "user",
                    userStatus: "active",
                    mustChangePassword: true,
                    loginMethod: "legacy_sync",
                })
                .returning();

            userId = newUser.id;
            isNewUser = true;
            counters.membersCreated++;
        }
    }

    if (!isNewUser && userId) {
        // UPDATE postojećeg korisnika — samo polja koja su neprazna u CLAN03
        const updateData: Record<string, unknown> = { updatedAt: new Date() };

        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (fullName) updateData.name = fullName;
        if (validOib) updateData.oib = validOib;
        if (jmbgHash) updateData.jmbgHash = jmbgHash;
        if (phone) updateData.phone = phone;
        if (row.ADRESA?.trim()) updateData.address = row.ADRESA.trim();
        if (row.Grad?.trim()) updateData.city = row.Grad.trim();
        if (row.Ptt?.trim()) updateData.postalCode = row.Ptt.trim();
        if (row.firma !== null && row.firma !== undefined) updateData.isLegalEntity = row.firma === true;
        // Email: samo ažuriraj ako je prazan u PG a postoji u MSSQL
        if (email) {
            const currentUser = await db
                .select({ email: users.email })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
            if (!currentUser[0]?.email) {
                updateData.email = email;
            }
        }

        await db.update(users).set(updateData).where(eq(users.id, userId));
        counters.membersUpdated++;
    }

    // ─── UPSERT member_links ───────────────────────────────────────────
    const existingLinkCheck = await db
        .select({ id: memberLinks.id })
        .from(memberLinks)
        .where(eq(memberLinks.legacyMatBroj, matBroj))
        .limit(1);

    if (existingLinkCheck.length === 0) {
        await db.insert(memberLinks).values({
            userId: userId!,
            legacyMatBroj: matBroj,
            legacyOib: row.OIB?.trim() || null,
            legacyJmbg: row.JMBG?.trim() || null,
            legacyRawData: row as unknown as Record<string, unknown>,
            isPrimary: false,
            lastSyncedAt: new Date(),
        });
        counters.linksCreated++;
    } else {
        await db
            .update(memberLinks)
            .set({
                userId: userId!,
                legacyOib: row.OIB?.trim() || null,
                legacyJmbg: row.JMBG?.trim() || null,
                legacyRawData: row as unknown as Record<string, unknown>,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(memberLinks.legacyMatBroj, matBroj));
    }

    // ─── UPSERT member_memberships ─────────────────────────────────────
    const existingMembership = await db
        .select({ id: memberMemberships.id })
        .from(memberMemberships)
        .where(eq(memberMemberships.legacyMatBroj, matBroj))
        .limit(1);

    if (existingMembership.length === 0) {
        await db.insert(memberMemberships).values({
            userId: userId!,
            legacyMatBroj: matBroj,
            vrstaC: row.VRSTA_C?.trim() || null,
            clan: row.CLAN?.trim() || null,
            klub: row.KLUB?.trim() || null,
            klub2: row.Klub2?.trim() || null,
            activeMember: true,
            syncedAt: new Date(),
        });
        counters.membershipsCreated++;
    } else {
        await db
            .update(memberMemberships)
            .set({
                userId: userId!,
                vrstaC: row.VRSTA_C?.trim() || null,
                clan: row.CLAN?.trim() || null,
                klub: row.KLUB?.trim() || null,
                klub2: row.Klub2?.trim() || null,
                activeMember: true,
                syncedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(memberMemberships.legacyMatBroj, matBroj));
        counters.membershipsUpdated++;
    }

    // ─── Vessel sync ───────────────────────────────────────────────────
    await syncVessel(db, syncRunId, row, userId!, counters);
}

/**
 * Sinkronizira plovilo iz CLAN03 reda
 */
async function syncVessel(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    syncRunId: string,
    row: LegacyClan03Row,
    userId: string,
    counters: SyncCounters,
): Promise<void> {
    const brodBr = row.BROD_BR?.trim();
    const imeBr = row.IME_BR?.trim();

    // Nema podataka o brodu → preskoči
    if (!brodBr && !imeBr) {
        counters.vesselsSkipped++;
        return;
    }

    const vesselType = mapVesselType(row.TIP_BROD);
    const lengthM = row.DUZINA_BR ? String(row.DUZINA_BR) : null;
    const beamM = row.SIRINA_BR ? String(row.SIRINA_BR) : null;

    let finalVesselId: string | null = null;

    // ─── Razina 1: BROD_BR (registracija) — GLOBALNO JEDINSTVENA ──────
    if (brodBr) {
        const existingVessel = await db
            .select({ id: vessels.id, ownerId: vessels.ownerId })
            .from(vessels)
            .where(eq(vessels.registration, brodBr))
            .limit(1);

        if (existingVessel.length === 1) {
            const vessel = existingVessel[0];
            if (vessel.ownerId !== userId) {
                // Različiti vlasnici — conflict
                await createConflict(db, syncRunId, "vessel_owner_conflict", row.MAT_BROJ?.trim() ?? null, row,
                    `Plovilo "${brodBr}" već pripada drugom korisniku (existing owner: ${vessel.ownerId}, new: ${userId})`);
                counters.conflictsDetected++;
                counters.vesselsSkipped++;
                return;
            }

            // Isti vlasnik → UPDATE
            await db
                .update(vessels)
                .set({
                    name: imeBr || brodBr,
                    type: vesselType,
                    lengthM,
                    beamM,
                    updatedAt: new Date(),
                })
                .where(eq(vessels.id, vessel.id));
            counters.vesselsUpdated++;
            finalVesselId = vessel.id;
        } else {
            // Ne postoji → INSERT
            const [newVessel] = await db.insert(vessels).values({
                ownerId: userId,
                name: imeBr || brodBr,
                type: vesselType,
                registration: brodBr,
                lengthM,
                beamM,
            }).returning({ id: vessels.id });
            counters.vesselsCreated++;
            finalVesselId = newVessel.id;
        }
    } else if (imeBr) {
        // ─── Razina 2: IME_BR fallback (bez registracije) ─────────────────
        const existingByName = await db
            .select({ id: vessels.id })
            .from(vessels)
            .where(
                and(
                    eq(vessels.ownerId, userId),
                    ilike(vessels.name, imeBr),
                ),
            )
            .limit(1);

        if (existingByName.length === 1) {
            await db
                .update(vessels)
                .set({
                    type: vesselType,
                    lengthM,
                    beamM,
                    updatedAt: new Date(),
                })
                .where(eq(vessels.id, existingByName[0].id));
            counters.vesselsUpdated++;
            finalVesselId = existingByName[0].id;
        } else {
            const [newVessel] = await db.insert(vessels).values({
                ownerId: userId,
                name: imeBr,
                type: vesselType,
                lengthM,
                beamM,
            }).returning({ id: vessels.id });
            counters.vesselsCreated++;
            finalVesselId = newVessel.id;
        }
    }

    // ─── Razina 3: Automatsko mapiranje na vez u akvatoriju ────────────
    if (finalVesselId && (row.GAT || row.VEZ_BROJ)) {
        await syncBerthAssignment(db, row, userId, finalVesselId);
    }
}

/**
 * Sinkronizira dodjelu veza iz CLAN03 podataka (GAT, VEZ_BROJ, UGOVOR, DUG)
 */
async function syncBerthAssignment(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    row: LegacyClan03Row,
    userId: string,
    vesselId: string
): Promise<void> {
    if (!row.GAT || !row.VEZ_BROJ) return;

    const rawGat = row.GAT.trim().toUpperCase();
    const rawVez = row.VEZ_BROJ.trim();
    const vezNum = parseInt(rawVez, 10);
    if (isNaN(vezNum) || vezNum <= 0) return;

    let prefix = "";

    if (rawGat === "L" || rawGat === "LB" || rawGat === "LUKOBRAN") {
        prefix = "LUK-";
    } else if (rawGat === "ZO" || rawGat === "ZAPADNA" || rawGat === "ZAPAD") {
        prefix = "ZO-";
    } else {
        const gatNum = parseInt(rawGat, 10);
        if (!isNaN(gatNum) && gatNum >= 1 && gatNum <= 12) {
            prefix = `G${gatNum.toString().padStart(2, "0")}-`;
        }
    }

    if (!prefix) return;

    const berthCode = `${prefix}${vezNum.toString().padStart(2, "0")}`;

    // 1. Pronađi vez po šifri
    const [berth] = await db
        .select({ id: berths.id })
        .from(berths)
        .where(eq(berths.code, berthCode))
        .limit(1);

    if (!berth) return;

    // 2. Deaktiviraj druge aktivne dodjele za ovaj vez
    await db
        .update(berthAssignments)
        .set({ isActive: false, endDate: new Date(), updatedAt: new Date() })
        .where(and(eq(berthAssignments.berthId, berth.id), eq(berthAssignments.isActive, true)));

    // 3. Kreiraj novu dodjelu
    await db.insert(berthAssignments).values({
        berthId: berth.id,
        vesselId,
        userId,
        assignmentType: "permanent_member",
        contractNumber: row.UGOVOR?.trim() || null,
        startDate: new Date(),
        isActive: true,
        notes: row.PLAC_DO ? `Plaćeno do: ${row.PLAC_DO}` : undefined,
    });

    // 4. Postavi status veza
    const hasDebt = row.DUG !== null && row.DUG !== undefined && row.DUG > 0;
    const newStatus = hasDebt ? "debt_block" : "occupied";

    await db
        .update(berths)
        .set({
            status: newStatus,
            notes: hasDebt ? `Dug: ${row.DUG} €` : undefined,
            updatedAt: new Date(),
        })
        .where(eq(berths.id, berth.id));
}

/**
 * Deaktivira članove čiji MAT_BROJ NIJE u tekućem sync setu
 */
async function deactivateMissingMembers(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    seenMatBrojSet: Set<string>,
): Promise<number> {
    const seenArray = Array.from(seenMatBrojSet);

    const result = await db
        .update(memberMemberships)
        .set({
            activeMember: false,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(memberMemberships.activeMember, true),
                notInArray(memberMemberships.legacyMatBroj, seenArray),
            ),
        )
        .returning({ id: memberMemberships.id });

    return result.length;
}

/**
 * Kreira sync_conflicts zapis
 */
async function createConflict(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    syncRunId: string,
    conflictType: "duplicate_oib" | "duplicate_name" | "oib_mismatch" | "vessel_owner_conflict" | "ambiguous_match",
    matBroj: string | null,
    row: LegacyClan03Row,
    description: string,
    matchedUserIds?: string[],
): Promise<void> {
    await db.insert(syncConflicts).values({
        syncRunId,
        conflictType,
        legacyMatBroj: matBroj,
        legacyData: row as unknown as Record<string, unknown>,
        matchedUserIds: matchedUserIds || null,
        description,
    });
}
