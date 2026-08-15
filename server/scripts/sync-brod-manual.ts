/**
 * PŠD Špinut — Samostalna skripta za kontroliranu sinkronizaciju MSSQL (Brod) → PostgreSQL
 * 
 * Pokretanje:
 *   pnpm sync:brod
 *   pnpm sync:brod --limit=500
 *   pnpm sync:brod --batch=50 --break=50
 */
import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import { getMssqlPool, closeMssqlPool } from "../memberSync/mssqlClient";
import { getDb } from "../db";
import {
    users,
    vessels,
    memberLinks,
    memberMemberships,
    berths,
    berthAssignments,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import {
    normalizeOIB,
    validateOIB,
    hashJMBG,
    normalizePhone,
    selectEmail,
    mapVesselType,
    normalizeName,
} from "../memberSync/utils";
import type { LegacyClan03Row } from "../memberSync/types";

// Parsiranje argumenata iz komandne linije
const args = process.argv.slice(2);
function getArg(name: string, defaultVal: number): number {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    if (found) {
        const val = parseInt(found.split("=")[1], 10);
        return isNaN(val) ? defaultVal : val;
    }
    return defaultVal;
}

const LIMIT = getArg("limit", 0); // 0 = sve
const BATCH_SIZE = getArg("batch", 100);
const TIME_BREAK_MS = getArg("break", 30);

async function runManualSync() {
    console.log("================================================================================");
    console.log("  PŠD ŠPINUT — KONTROLIRANA SINKRONIZACIJA ČLANOVA, PLOVILA I VEZOVA");
    console.log(`  Vrijeme: ${new Date().toLocaleString("hr-HR")}`);
    console.log(`  Postavke: Batch size = ${BATCH_SIZE}, Time break = ${TIME_BREAK_MS}ms, Limit = ${LIMIT || "SVE"}`);
    console.log("================================================================================\n");

    const pool = await getMssqlPool();
    const db = await getDb();
    if (!db) throw new Error("PostgreSQL baza nije dostupna");

    console.log("⏳ [1/4] Čitanje članova i vezova iz MSSQL CLAN03 tablice...");
    const limitClause = LIMIT > 0 ? `TOP ${LIMIT}` : "";
    const mssqlRes = await pool.request().query<LegacyClan03Row>(`
        SELECT ${limitClause}
            MAT_BROJ, VRSTA_C, PREZIME, IME, OIB, JMBG, ADRESA, Ptt, Grad, DRZAVA,
            MOBITEL, TELEFON, Email, Emial, IME_BR, BROD_BR, TIP_BROD, DUZINA_BR, SIRINA_BR,
            firma, CLAN, KLUB, Klub2, NAPOMENA, GAT, VEZ_BROJ, VEZ_TIP, UGOVOR, DUG, PLAC_DO, KOPNO, KOPNOPIS
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND GAT <> '')
           OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
           OR VRSTA_C IN ('U','B','P','K','L')
        ORDER BY MAT_BROJ
    `);

    const rows = mssqlRes.recordset;
    console.log(`✅ Uspješno pročitano ${rows.length} zapisa iz MSSQL baze.\n`);

    console.log("⚡ [2/4] Učitavanje keša iz PostgreSQL baze (vezovi, postojeći članovi)...");
    const [allBerths, allLinks, allUsers] = await Promise.all([
        db.select({ id: berths.id, code: berths.code }).from(berths),
        db.select({ legacyMatBroj: memberLinks.legacyMatBroj, userId: memberLinks.userId }).from(memberLinks),
        db.select({ id: users.id, oib: users.oib, email: users.email }).from(users),
    ]);

    const berthMap = new Map<string, string>();
    allBerths.forEach((b) => berthMap.set(b.code, b.id));

    const linkMap = new Map<string, string>();
    allLinks.forEach((l) => linkMap.set(l.legacyMatBroj, l.userId));

    const userOibMap = new Map<string, string>();
    allUsers.forEach((u) => { if (u.oib) userOibMap.set(u.oib, u.id); });

    const userEmailMap = new Map<string, string>();
    allUsers.forEach((u) => { if (u.email) userEmailMap.set(u.email.toLowerCase(), u.id); });

    console.log(`  - Keširano: ${berthMap.size} vezova, ${linkMap.size} postojećih linkova, ${userOibMap.size} OIB-ova.\n`);

    console.log("🚀 [3/4] Pokrećem obradu zapisa po blokovima...");
    const startTime = Date.now();
    let membersCreated = 0;
    let membersUpdated = 0;
    let vesselsSynced = 0;
    let berthsAssigned = 0;
    let errorsCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const matBroj = row.MAT_BROJ?.trim();
        if (!matBroj) continue;

        // Pauza svakih BATCH_SIZE
        if (i > 0 && i % BATCH_SIZE === 0) {
            const percent = Math.round((i / rows.length) * 100);
            const elapsedSec = Math.round((Date.now() - startTime) / 1000);
            console.log(`  ⏳ Progres: ${i}/${rows.length} (${percent}%) [${elapsedSec}s] — pauza ${TIME_BREAK_MS}ms...`);
            await new Promise((r) => setTimeout(r, TIME_BREAK_MS));
        }

        try {
            // 1. Korisnik
            let userId: string | null = linkMap.get(matBroj) || null;
            const oib = normalizeOIB(row.OIB);
            const validOib = oib && validateOIB(oib) ? oib : null;
            const rawEmail = selectEmail(row.Email, row.Emial)?.toLowerCase();
            const phone = normalizePhone(row.MOBITEL);
            const firstName = normalizeName(row.IME);
            const lastName = normalizeName(row.PREZIME);
            const fullName = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName;
            const jmbgHash = hashJMBG(row.JMBG);

            if (!userId && validOib) {
                userId = userOibMap.get(validOib) || null;
            }

            // Sigurni email (samo ako nitko drugi nema taj email)
            let safeEmail: string | null = null;
            if (rawEmail) {
                const ownerOfEmail = userEmailMap.get(rawEmail);
                if (!ownerOfEmail || ownerOfEmail === userId) {
                    safeEmail = rawEmail;
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
                    .returning({ id: users.id });

                userId = newUser.id;
                linkMap.set(matBroj, userId);
                if (validOib) userOibMap.set(validOib, userId);
                if (safeEmail) userEmailMap.set(safeEmail, userId);
                membersCreated++;
            } else {
                const updateData: Record<string, unknown> = { updatedAt: new Date() };
                if (firstName) updateData.firstName = firstName;
                if (lastName) updateData.lastName = lastName;
                if (fullName) updateData.name = fullName;
                if (phone) updateData.phone = phone;
                if (safeEmail) updateData.email = safeEmail;
                if (row.ADRESA?.trim()) updateData.address = row.ADRESA.trim();
                if (row.Grad?.trim()) updateData.city = row.Grad.trim();
                if (row.Ptt?.trim()) updateData.postalCode = row.Ptt.trim();
                if (row.firma !== null && row.firma !== undefined) updateData.isLegalEntity = row.firma === true;

                await db.update(users).set(updateData).where(eq(users.id, userId));
                membersUpdated++;
            }

            // 2. Link
            if (!linkMap.has(matBroj)) {
                await db.insert(memberLinks).values({
                    userId,
                    legacyMatBroj: matBroj,
                    legacyOib: validOib,
                    legacyJmbg: row.JMBG?.trim() || null,
                    legacyRawData: row as unknown as Record<string, unknown>,
                    isPrimary: true,
                    lastSyncedAt: new Date(),
                }).onConflictDoNothing();
                linkMap.set(matBroj, userId);
            }

            // 3. Plovilo
            const brodBr = row.BROD_BR?.trim();
            const imeBr = row.IME_BR?.trim();
            let vesselId: string | null = null;

            if (brodBr || imeBr) {
                const vesselType = mapVesselType(row.TIP_BROD);
                const lengthM = row.DUZINA_BR ? String(row.DUZINA_BR) : null;
                const beamM = row.SIRINA_BR ? String(row.SIRINA_BR) : null;

                if (brodBr) {
                    const existingVessel = await db
                        .select({ id: vessels.id })
                        .from(vessels)
                        .where(eq(vessels.registration, brodBr))
                        .limit(1);

                    if (existingVessel.length > 0) {
                        vesselId = existingVessel[0].id;
                        await db.update(vessels).set({
                            ownerId: userId,
                            name: imeBr || brodBr,
                            type: vesselType,
                            lengthM,
                            beamM,
                            updatedAt: new Date(),
                        }).where(eq(vessels.id, vesselId));
                    } else {
                        const [newV] = await db.insert(vessels).values({
                            ownerId: userId,
                            name: imeBr || brodBr,
                            type: vesselType,
                            registration: brodBr,
                            lengthM,
                            beamM,
                        }).returning({ id: vessels.id });
                        vesselId = newV.id;
                    }
                    vesselsSynced++;
                }
            }

            // 4. Vez u akvatoriju
            if (vesselId && row.GAT && row.VEZ_BROJ) {
                const rawGat = row.GAT.trim().toUpperCase();
                const rawVez = row.VEZ_BROJ.trim();
                const vezNum = parseInt(rawVez, 10);

                if (!isNaN(vezNum) && vezNum > 0) {
                    let prefix = "";
                    if (rawGat === "L" || rawGat === "LB") prefix = "LUK-";
                    else if (rawGat === "ZO") prefix = "ZO-";
                    else {
                        const gNum = parseInt(rawGat, 10);
                        if (!isNaN(gNum) && gNum >= 1 && gNum <= 12) {
                            prefix = `G${gNum.toString().padStart(2, "0")}-`;
                        }
                    }

                    if (prefix) {
                        const berthCode = `${prefix}${vezNum.toString().padStart(2, "0")}`;
                        const berthId = berthMap.get(berthCode);

                        if (berthId) {
                            // Deaktiviraj stare dodjele
                            await db.update(berthAssignments)
                                .set({ isActive: false, endDate: new Date(), updatedAt: new Date() })
                                .where(and(eq(berthAssignments.berthId, berthId), eq(berthAssignments.isActive, true)));

                            // Nova dodjela
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

                            // Status veza
                            const hasDebt = row.DUG !== null && row.DUG !== undefined && row.DUG > 0;
                            await db.update(berths).set({
                                status: hasDebt ? "debt_block" : "occupied",
                                notes: hasDebt ? `Dug: ${row.DUG} €` : undefined,
                                updatedAt: new Date(),
                            }).where(eq(berths.id, berthId));

                            berthsAssigned++;
                        }
                    }
                }
            }
        } catch (err) {
            errorsCount++;
            if (errorsCount <= 5) {
                console.error(`  ⚠️ Greška na ${matBroj}:`, (err as Error).message);
            }
        }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    console.log("\n================================================================================");
    console.log(`🎉 [4/4] SINKRONIZACIJA USPJEŠNO ZAVRŠENA u ${totalDuration} sekundi!`);
    console.log(`  - Članovi: +${membersCreated} kreiranih, ~${membersUpdated} ažuriranih`);
    console.log(`  - Plovila: ${vesselsSynced} sinkroniziranih`);
    console.log(`  - Dodijeljeni vezovi: ${berthsAssigned} vezova postavljeno u akvatoriju`);
    console.log(`  - Zabilježene greške: ${errorsCount}`);
    console.log("================================================================================");

    await closeMssqlPool();
}

runManualSync().catch((err) => {
    console.error("Fatalna greška:", err);
    process.exit(1);
});
