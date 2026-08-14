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
import "dotenv/config";
import axios from "axios";
import { fetchAllClan03Members } from "../mssqlQueries";
import { closeMssqlPool, isMssqlConfigured } from "../mssqlClient";

export async function executePushSync(): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log("================================================================================");
    console.log("  PŠD ŠPINUT — LOKALNI MEMBER SYNC AGENT (MSSQL → UDALJENI POSLUŽITELJ)");
    console.log(`  Vrijeme pokretanja: ${new Date().toLocaleString("hr-HR")}`);
    console.log("================================================================================");

    // 1. Provjera konfiguracije
    const remoteUrl = process.env.REMOTE_SYNC_URL || "http://localhost:3000/api/v1/member-sync/push";
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

        // 3. Slanje paketa na udaljeni Coolify poslužitelj
        console.log(`⏳ [2/2] Šaljem paket od ${rows.length} zapisa na ${remoteUrl}...`);
        const pushStartTime = Date.now();

        const response = await axios.post(
            remoteUrl,
            { members: rows },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-sync-api-key": apiKey,
                },
                timeout: 120_000, // 2 minute timeout za veći paket
                maxContentLength: 100 * 1024 * 1024,
                maxBodyLength: 100 * 1024 * 1024,
            }
        );

        const pushDuration = Date.now() - pushStartTime;
        const result = response.data;

        console.log("");
        console.log("================================================================================");
        console.log("  REZULTAT SINKRONIZACIJE NA POSLUŽITELJU");
        console.log("================================================================================");
        console.log(`  Status:             ${result.status === "completed" ? "✅ COMPLETED" : "⚠️ " + result.status}`);
        console.log(`  Sync Run ID:        ${result.syncRunId}`);
        console.log(`  Vrijeme obrade:     ${result.durationMs} ms (mreža: ${pushDuration} ms)`);
        console.log("--------------------------------------------------------------------------------");
        if (result.counters) {
            console.log(`  Članovi novi (+):   ${result.counters.membersCreated}`);
            console.log(`  Članovi ažurirani:  ${result.counters.membersUpdated}`);
            console.log(`  Članovi neaktivni:  ${result.counters.membersDeactivated}`);
            console.log(`  Plovila nova (+):   ${result.counters.vesselsCreated}`);
            console.log(`  Plovila ažurirana:  ${result.counters.vesselsUpdated}`);
            console.log(`  Članstva u klubu:   +${result.counters.membershipsCreated} / ~${result.counters.membershipsUpdated}`);
            console.log(`  Konflikti (za pregled): ${result.counters.conflictsDetected}`);
        }
        if (result.errors && result.errors.length > 0) {
            console.log("--------------------------------------------------------------------------------");
            console.log(`  Uočene greške (${result.errors.length}):`);
            result.errors.slice(0, 5).forEach((e: string, i: number) => console.log(`   ${i + 1}. ${e}`));
            if (result.errors.length > 5) {
                console.log(`   ... i još ${result.errors.length - 5} grešaka.`);
            }
        }
        console.log("================================================================================");
        console.log("✅ Sinkronizacija uspješno završena.");

        return { success: true, data: result };
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
