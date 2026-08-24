/**
 * Member Sync — Local Windows Agent (CLI)
 * 
 * Pokreće se na lokalnom Windows 11 PC-u u uredu lučice Špinut:
 * 1. Spaja se na lokalni MS SQL Server (localhost:1433, baza 'brod')
 * 2. Čita aktivne članove i plovila iz tablice CLAN03
 * 3. Šalje podatke preko sigurne HTTPS veze na udaljeni Coolify poslužitelj
 * 
 * Pokretanje:
 *   pnpm sync:push
 */
import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";
import { fetchAllClan03Members } from "../mssqlQueries";
import { closeMssqlPool, isMssqlConfigured } from "../mssqlClient";

export async function executePushSync(): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log("================================================================================");
    console.log("  PŠD ŠPINUT — LOKALNI MEMBER SYNC AGENT (MSSQL → UDALJENI POSLUŽITELJ)");
    console.log(`  Vrijeme pokretanja: ${new Date().toLocaleString("hr-HR")}`);
    console.log("================================================================================");

    // 1. Provjera konfiguracije
    const remoteUrl = process.env.REMOTE_SYNC_URL || "https://dizalica.imagomatrix.com/api/v1/member-sync/push";
    const apiKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;

    if (!apiKey) {
        const msg = "POGREŠKA: SYNC_API_KEY nije postavljen u lokalnoj .env datoteci.";
        console.error(`❌ ${msg}`);
        return { success: false, error: msg };
    }

    if (!isMssqlConfigured()) {
        const msg = "POGREŠKA: MSSQL parametri (MSSQL_HOST, MSSQL_PASSWORD) nisu konfigurirani u .env.";
        console.error(`❌ ${msg}`);
        return { success: false, error: msg };
    }

    console.log(`📡 Udaljeni poslužitelj: ${remoteUrl}`);
    console.log(`🗄️  Lokalni MSSQL poslužitelj: ${process.env.MSSQL_HOST || "localhost"}:${process.env.MSSQL_PORT || "1433"} (baza: ${process.env.MSSQL_DATABASE || "brod"})`);
    console.log("");

    try {
        // 2. Dohvat podataka iz lokalnog MSSQL-a
        console.log("⏳ [1/2] Čitanje podataka iz lokalne CLAN03 tablice...");
        const startTime = Date.now();
        const rows = await fetchAllClan03Members();
        const readDuration = Date.now() - startTime;
        console.log(`✅ Uspješno pročitano ${rows.length} zapisa članova iz lokalne baze (${readDuration} ms).`);

        if (rows.length === 0) {
            console.warn("⚠️  Nema pronađenih članova koji zadovoljavaju filter (VRSTA_C IN ('U','B') AND KLUB > 0).");
        }

        // Ako je zadan --reset flag, prvo očisti stare članove na produkcijskom poslužitelju
        const shouldReset = process.argv.includes("--reset");
        if (shouldReset) {
            const resetUrl = remoteUrl.replace(/\/push$/, "/reset-members");
            console.log(`🧹 [RESET] Čistim stare članove na udaljenom poslužitelju (${resetUrl})...`);
            try {
                const resetRes = await axios.post(
                    resetUrl,
                    {},
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": apiKey,
                            "x-sync-api-key": apiKey,
                            "Authorization": `Bearer ${apiKey}`,
                        },
                        timeout: 30_000,
                    }
                );
                console.log(`✅ [RESET] ${resetRes.data?.message || "Korisnici su uspješno očišćeni."}`);
            } catch (resetErr: any) {
                console.error(`❌ [RESET] Greška pri resetiranju: ${resetErr.response?.data?.error || resetErr.message}`);
                return { success: false, error: resetErr.message };
            }
        }

        // 3. Slanje paketa na udaljeni Coolify poslužitelj u chunkovima
        const CHUNK_SIZE = 500;
        const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
        console.log(`⏳ [2/2] Šaljem ${rows.length} zapisa u ${totalChunks} paketa (po ${CHUNK_SIZE}) na ${remoteUrl}...`);

        const totalCounters = {
            membersCreated: 0,
            membersUpdated: 0,
            membersDeactivated: 0,
            vesselsCreated: 0,
            vesselsUpdated: 0,
            membershipsCreated: 0,
            membershipsUpdated: 0,
            conflictsDetected: 0,
        };
        const allErrors: string[] = [];
        let overallStatus = "completed";
        let lastSyncRunId = "";
        const pushStartTime = Date.now();

        for (let c = 0; c < totalChunks; c++) {
            const startIdx = c * CHUNK_SIZE;
            const endIdx = Math.min(startIdx + CHUNK_SIZE, rows.length);
            const chunkRows = rows.slice(startIdx, endIdx);
            const percent = Math.round(((c + 1) / totalChunks) * 100);

            process.stdout.write(`   [Paket ${c + 1}/${totalChunks}] Šaljem retke ${startIdx + 1} - ${endIdx} (${percent}%)... `);
            const chunkStart = Date.now();

            const response = await axios.post(
                remoteUrl,
                { members: chunkRows },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "x-sync-api-key": apiKey,
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    timeout: 60_000,
                }
            );

            const chunkDuration = Date.now() - chunkStart;
            const resData = response.data;
            lastSyncRunId = resData.syncRunId || lastSyncRunId;

            if (resData.counters) {
                totalCounters.membersCreated += resData.counters.membersCreated || 0;
                totalCounters.membersUpdated += resData.counters.membersUpdated || 0;
                totalCounters.membersDeactivated += resData.counters.membersDeactivated || 0;
                totalCounters.vesselsCreated += resData.counters.vesselsCreated || 0;
                totalCounters.vesselsUpdated += resData.counters.vesselsUpdated || 0;
                totalCounters.membershipsCreated += resData.counters.membershipsCreated || 0;
                totalCounters.membershipsUpdated += resData.counters.membershipsUpdated || 0;
                totalCounters.conflictsDetected += resData.counters.conflictsDetected || 0;
            }

            if (resData.errors && resData.errors.length > 0) {
                allErrors.push(...resData.errors);
            }
            if (resData.status !== "completed") {
                overallStatus = resData.status || "partial";
            }

            console.log(`OK (${chunkDuration} ms)`);
        }

        const pushDuration = Date.now() - pushStartTime;

        console.log("");
        console.log("================================================================================");
        console.log("  REZULTAT SINKRONIZACIJE NA POSLUŽITELJU");
        console.log("================================================================================");
        console.log(`  Status:             ${overallStatus === "completed" ? "✅ COMPLETED" : "⚠️ " + overallStatus}`);
        console.log(`  Zadnji Sync Run ID: ${lastSyncRunId}`);
        console.log(`  Ukupno vrijeme:     ${pushDuration} ms (${Math.round(pushDuration / 1000)}s)`);
        console.log("--------------------------------------------------------------------------------");
        console.log(`  Članovi novi (+):   ${totalCounters.membersCreated}`);
        console.log(`  Članovi ažurirani:  ${totalCounters.membersUpdated}`);
        console.log(`  Članovi neaktivni:  ${totalCounters.membersDeactivated}`);
        console.log(`  Plovila nova (+):   ${totalCounters.vesselsCreated}`);
        console.log(`  Plovila ažurirana:  ${totalCounters.vesselsUpdated}`);
        console.log(`  Članstva u klubu:   +${totalCounters.membershipsCreated} / ~${totalCounters.membershipsUpdated}`);
        console.log(`  Konflikti (pregled): ${totalCounters.conflictsDetected}`);
        if (allErrors.length > 0) {
            console.log("--------------------------------------------------------------------------------");
            console.log(`  Uočene greške (${allErrors.length}):`);
            allErrors.slice(0, 5).forEach((e: string, i: number) => console.log(`   ${i + 1}. ${e}`));
            if (allErrors.length > 5) {
                console.log(`   ... i još ${allErrors.length - 5} grešaka.`);
            }
        }
        console.log("================================================================================");
        console.log("✅ Sinkronizacija uspješno završena.");

        return { success: true, data: { status: overallStatus, counters: totalCounters } };
    } catch (err: any) {
        console.error("");
        console.error("❌ POGREŠKA TIJEKOM SINKRONIZACIJE:");
        if (err.response) {
            console.error(`  Poslužitelj je vratio status ${err.response.status}: ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
            console.error(`  Nema odgovora od poslužitelja na ${remoteUrl}. Provjerite internetsku vezu i URL.`);
        } else {
            console.error(`  ${err.message}`);
        }
        return { success: false, error: err.message };
    } finally {
        await closeMssqlPool();
    }
}

// Izvrši odmah ako je pozvano direktno iz CLI-ja
if (process.argv[1]?.includes("cli.ts") || process.argv[1]?.endsWith("cli")) {
    executePushSync()
        .then((res) => {
            process.exit(res.success ? 0 : 1);
        })
        .catch((err) => {
            console.error("Kritična pogreška:", err);
            process.exit(1);
        });
}
