/**
 * Member Sync — Sync Engine (Optimiziran s Time-Break mehanizmom & In-Memory Cachingom)
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
import { ensureAkvatorijSeeded } from "./seedAkvatorijHelper";

const BATCH_SIZE = 100;       // Veličina bloka
const TIME_BREAK_MS = 20;     // Time-break (pauza između blokova za rasterećenje I/O i baze)

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
    console.log(`[MemberSync] Sync run ${syncRunId} započet (ukupno redova: ${clan03Rows.length}, pokrenuo: ${triggeredBy})`);

    try {
        // 2. Preload Cache u memoriju za instantno mapiranje bez nepotrebnih upita
        console.log("⚡ [MemberSync] Preloading cache (vezovi, linkovi, OIB-ovi)...");
        let allBerths = await db.select({ id: berths.id, code: berths.code }).from(berths);
        if (allBerths.length < 811) {
            console.log(`[MemberSync] Pronađeno samo ${allBerths.length} vezova. Pokrećem auto-seed 811 vezova...`);
            await ensureAkvatorijSeeded(db);
            allBerths = await db.select({ id: berths.id, code: berths.code }).from(berths);
        }

        const [allLinks, allUsersWithOib, allUsersWithEmail] = await Promise.all([
            db.select({ legacyMatBroj: memberLinks.legacyMatBroj, userId: memberLinks.userId }).from(memberLinks),
            db.select({ id: users.id, oib: users.oib }).from(users).where(sql`${users.oib} IS NOT NULL`),
            db.select({ id: users.id, email: users.email }).from(users).where(sql`${users.email} IS NOT NULL`),
        ]);

        const berthMap = new Map<string, string>();
        allBerths.forEach((b) => berthMap.set(b.code, b.id));

        const linkMap = new Map<string, string>();
        allLinks.forEach((l) => linkMap.set(l.legacyMatBroj, l.userId));

        const userOibMap = new Map<string, string>();
        allUsersWithOib.forEach((u) => { if (u.oib) userOibMap.set(u.oib, u.id); });

        const userEmailMap = new Map<string, string>();
        allUsersWithEmail.forEach((u) => { if (u.email) userEmailMap.set(u.email.toLowerCase(), u.id); });

        // Set za praćenje viđenih MAT_BROJ (za soft-delete)
        const seenMatBrojSet = new Set<string>();

        // 3. Procesiranje u blokovima (Chunking s Time Breakom)
        for (let i = 0; i < clan03Rows.length; i++) {
            const row = clan03Rows[i];

            // Time Break svakih BATCH_SIZE zapisa
            if (i > 0 && i % BATCH_SIZE === 0) {
                const percent = Math.round((i / clan03Rows.length) * 100);
                console.log(`⏳ [MemberSync] Progres: ${i}/${clan03Rows.length} (${percent}%) — kratki time-break ${TIME_BREAK_MS}ms...`);
                await new Promise((resolve) => setTimeout(resolve, TIME_BREAK_MS));
            }

            try {
                await processRowOptimized(
                    db,
                    syncRunId,
                    row,
                    counters,
                    seenMatBrojSet,
                    berthMap,
                    linkMap,
                    userOibMap,
                    userEmailMap,
                );
            } catch (err) {
                const errMsg = `Greška na MAT_BROJ=${row.MAT_BROJ}: ${(err as Error).message}`;
                errors.push(errMsg);
                if (errors.length <= 10) {
                    console.error(`[MemberSync] ${errMsg}`);
                }
                counters.membersSkipped++;
            }
        }

        // 4. Ažuriraj sync_runs zapis
        const status = errors.length > 50 ? "partial" : "completed";
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
                errorMessage: errors.length > 0 ? errors.slice(0, 30).join("\n") : null,
            })
            .where(eq(syncRuns.id, syncRunId));

        const duration = Date.now() - startTime;
        console.log(
            `\n🎉 [MemberSync] Sinkronizacija ${status} u ${duration}ms (${Math.round(duration / 1000)}s): \n` +
            `  - Članovi: +${counters.membersCreated} novih, ~${counters.membersUpdated} ažuriranih, preskočeno ${counters.membersSkipped}\n` +
            `  - Plovila: +${counters.vesselsCreated} novih, ~${counters.vesselsUpdated} ažuriranih\n` +
            `  - Članstva: +${counters.membershipsCreated} novih, ~${counters.membershipsUpdated} ažuriranih\n` +
            `  - Greške: ${errors.length}`,
        );

        return { syncRunId, status, counters, duration, errors };
    } catch (err) {
        const errorMessage = (err as Error).message;
        console.error(`[MemberSync] FATAL sync error:`, errorMessage);

        await db
            .update(syncRuns)
            .set({
                completedAt: new Date(),
                status: "failed",
                errorMessage,
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
 * Optimizirana obrada jednog CLAN03 reda s cacheom i sigurnom provjerom emaila
 */
async function processRowOptimized(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    syncRunId: string,
    row: LegacyClan03Row,
    counters: SyncCounters,
    seenMatBrojSet: Set<string>,
    berthMap: Map<string, string>,
    linkMap: Map<string, string>,
    userOibMap: Map<string, string>,
    userEmailMap: Map<string, string>,
): Promise<void> {
    const matBroj = row.MAT_BROJ?.trim();
    if (!matBroj) {
        counters.membersSkipped++;
        return;
    }

    seenMatBrojSet.add(matBroj);

    // 1. Identifikacija korisnika (iz cachea)
    let userId: string | null = linkMap.get(matBroj) || null;
    let isNewUser = false;

    const oib = normalizeOIB(row.OIB);
    const validOib = oib && validateOIB(oib) ? oib : null;
    const rawEmail = selectEmail(row.Email, row.Emial)?.toLowerCase();
    const phone = normalizePhone(row.MOBITEL);
    const firstName = normalizeName(row.IME);
    const lastName = normalizeName(row.PREZIME);
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName;
    const jmbgHash = hashJMBG(row.JMBG);

    // Ako nemamo link, probaj preko OIB-a
    if (!userId && validOib) {
        userId = userOibMap.get(validOib) || null;
    }

    // Sigurna provjera emaila (ne dopusti konflikt ako drugi korisnik ima isti email)
    let safeEmail: string | null = null;
    if (rawEmail) {
        const ownerOfEmail = userEmailMap.get(rawEmail);
        if (!ownerOfEmail || ownerOfEmail === userId) {
            safeEmail = rawEmail;
        }
    }

    // 2. Kreiranje ili ažuriranje korisnika
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
            .returning({ id: users.id });

        userId = newUser.id;
        isNewUser = true;
        counters.membersCreated++;

        // Ažuriraj lokalni cache
        linkMap.set(matBroj, userId);
        if (validOib) userOibMap.set(validOib, userId);
        if (safeEmail) userEmailMap.set(safeEmail, userId);
    } else {
        // Ažuriraj postojećeg korisnika
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (fullName) updateData.name = fullName;
        if (validOib) updateData.oib = validOib;
        if (phone) updateData.phone = phone;
        if (safeEmail) updateData.email = safeEmail;
        if (row.ADRESA?.trim()) updateData.address = row.ADRESA.trim();
        if (row.Grad?.trim()) updateData.city = row.Grad.trim();
        if (row.Ptt?.trim()) updateData.postalCode = row.Ptt.trim();
        if (row.firma !== null && row.firma !== undefined) updateData.isLegalEntity = row.firma === true;

        await db.update(users).set(updateData).where(eq(users.id, userId));
        counters.membersUpdated++;
    }

    // 3. Upsert member_links
    if (isNewUser || !linkMap.has(matBroj)) {
        await db.insert(memberLinks).values({
            userId: userId!,
            legacyMatBroj: matBroj,
            legacyOib: validOib,
            legacyJmbg: row.JMBG?.trim() || null,
            legacyRawData: row as unknown as Record<string, unknown>,
            isPrimary: true,
            lastSyncedAt: new Date(),
        }).onConflictDoNothing();
        linkMap.set(matBroj, userId!);
        counters.linksCreated++;
    }

    // 4. Upsert member_memberships
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

    // 5. Plovilo i dodjela veza
    await syncVesselOptimized(db, syncRunId, row, userId!, counters, berthMap);
}

/**
 * Optimizirana obrada plovila i mapiranje na vez
 */
async function syncVesselOptimized(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    syncRunId: string,
    row: LegacyClan03Row,
    userId: string,
    counters: SyncCounters,
    berthMap: Map<string, string>,
): Promise<void> {
    const brodBr = row.BROD_BR?.trim();
    const imeBr = row.IME_BR?.trim();

    if (!brodBr && !imeBr) {
        counters.vesselsSkipped++;
        return;
    }

    const vesselType = mapVesselType(row.TIP_BROD);
    const lengthM = row.DUZINA_BR ? String(row.DUZINA_BR) : null;
    const beamM = row.SIRINA_BR ? String(row.SIRINA_BR) : null;

    let finalVesselId: string | null = null;

    if (brodBr) {
        const existing = await db
            .select({ id: vessels.id, ownerId: vessels.ownerId })
            .from(vessels)
            .where(eq(vessels.registration, brodBr))
            .limit(1);

        if (existing.length === 1) {
            finalVesselId = existing[0].id;
            await db
                .update(vessels)
                .set({
                    name: imeBr || brodBr,
                    type: vesselType,
                    lengthM,
                    beamM,
                    ownerId: userId, // ažuriraj vlasnika
                    updatedAt: new Date(),
                })
                .where(eq(vessels.id, finalVesselId));
            counters.vesselsUpdated++;
        } else {
            const [newVessel] = await db
                .insert(vessels)
                .values({
                    ownerId: userId,
                    name: imeBr || brodBr,
                    type: vesselType,
                    registration: brodBr,
                    lengthM,
                    beamM,
                })
                .returning({ id: vessels.id });
            finalVesselId = newVessel.id;
            counters.vesselsCreated++;
        }
    } else if (imeBr) {
        const existingByName = await db
            .select({ id: vessels.id })
            .from(vessels)
            .where(and(eq(vessels.ownerId, userId), ilike(vessels.name, imeBr)))
            .limit(1);

        if (existingByName.length === 1) {
            finalVesselId = existingByName[0].id;
            await db
                .update(vessels)
                .set({
                    type: vesselType,
                    lengthM,
                    beamM,
                    updatedAt: new Date(),
                })
                .where(eq(vessels.id, finalVesselId));
            counters.vesselsUpdated++;
        } else {
            const [newVessel] = await db
                .insert(vessels)
                .values({
                    ownerId: userId,
                    name: imeBr,
                    type: vesselType,
                    lengthM,
                    beamM,
                })
                .returning({ id: vessels.id });
            finalVesselId = newVessel.id;
            counters.vesselsCreated++;
        }
    }

    // 6. Mapiranje na vez u akvatoriju (iz cachea)
    if (finalVesselId && (row.GAT || row.VEZ_BROJ)) {
        await syncBerthFast(db, row, userId, finalVesselId, berthMap);
    }
}

/**
 * Brzo mapiranje na vez bez dodatnih SELECT-ova
 */
async function syncBerthFast(
    db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
    row: LegacyClan03Row,
    userId: string,
    vesselId: string,
    berthMap: Map<string, string>,
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
    const berthId = berthMap.get(berthCode);
    if (!berthId) return;

    // Deaktiviraj prethodne dodjele
    await db
        .update(berthAssignments)
        .set({ isActive: false, endDate: new Date(), updatedAt: new Date() })
        .where(and(eq(berthAssignments.berthId, berthId), eq(berthAssignments.isActive, true)));

    // Dodaj novu dodjelu
    await db.insert(berthAssignments).values({
        berthId,
        vesselId,
        userId,
        assignmentType: "permanent_member",
        contractNumber: row.UGOVOR?.trim() || null,
        startDate: new Date(),
        isActive: true,
        notes: row.PLAC_DO ? `Plaćeno do: ${row.PLAC_DO}` : undefined,
    });

    // Ažuriraj status veza
    const hasDebt = row.DUG !== null && row.DUG !== undefined && row.DUG > 0;
    await db
        .update(berths)
        .set({
            status: hasDebt ? "debt_block" : "occupied",
            notes: hasDebt ? `Dug: ${row.DUG} €` : undefined,
            updatedAt: new Date(),
        })
        .where(eq(berths.id, berthId));
}
