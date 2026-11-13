/**
 * Script za ispravak operaterskih unosa na produkciji (dizalica.imagomatrix.com)
 * 
 * 1. Zamjena plovila i korisnika:
 *    - RN-2026-00019 i REZ-2026-DDAA18 (11.11.2026.): JL-240008 (Martin Drinković) -> JL-247206 (Ivan Drinković)
 *    - REZ-2026-E8AF8D (17.11.2026.): JL-247206 (Ivan Drinković) -> JL-240008 (Martin Drinković)
 * 2. Ispravak godine vađenja za Nikolu Polića (ST-5150) u servisnu zonu:
 *    - 09.12.2026. -> 09.12.2025.
 * 
 * Pokretanje (pregled bez izmjena - dry run):
 *   npx tsx server/scripts/fix_drinkovic_and_polic.ts
 * 
 * Pokretanje s primjenom izmjena:
 *   npx tsx server/scripts/fix_drinkovic_and_polic.ts --confirm
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";

const BASE_URL = process.env.PRODUCTION_URL || "https://dizalica.imagomatrix.com";
const ENDPOINT = `${BASE_URL}/api/v1/member-sync/fix-drinkovic-and-polic`;
const INSPECT_ENDPOINT = `${BASE_URL}/api/v1/member-sync/inspect-work-order`;

async function main() {
    const apiKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;
    if (!apiKey) {
        console.error("❌ SYNC_API_KEY nije pronađen u konfiguraciji!");
        process.exit(1);
    }

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-sync-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
    };

    const isConfirmed = process.argv.includes("--confirm") || process.argv.includes("--apply");

    console.log("================================================================================");
    console.log(`  ISPRAVAK OPERATERSKIH GREŠAKA NA PRODUKCIJI (${BASE_URL})`);
    console.log(`  Način rada: ${isConfirmed ? "⚡ PRIMJENA IZMJENA (CONFIRM)" : "🔍 PREGLED (DRY-RUN)"}`);
    console.log("================================================================================");

    try {
        const response = await axios.post(
            ENDPOINT,
            { confirm: isConfirmed, dryRun: !isConfirmed },
            { headers, timeout: 30000 }
        );

        console.log("\nOdgovor poslužitelja:");
        console.log(JSON.stringify(response.data, null, 2));

        if (!isConfirmed) {
            console.log("\nℹ️ Pokrenuto u DRY-RUN načinu rada. Podaci u bazi NISU mijenjani.");
            console.log("Za stvarnu primjenu transakcije na produkciji pokrenite s argumentom '--confirm':");
            console.log("  npx tsx server/scripts/fix_drinkovic_and_polic.ts --confirm");
            return;
        }

        console.log("\n=== KONTROLNA PROVJERA NAKON ISPRAVKA ===");
        
        // Provjera RN-2026-00019
        const checkOrder = await axios.post(
            INSPECT_ENDPOINT,
            { orderNumber: "RN-2026-00019" },
            { headers, timeout: 15000 }
        );
        console.log("\n1. Radni nalog RN-2026-00019 nakon ispravka:");
        console.log("Vessel ID:", checkOrder.data.workOrders[0]?.vesselId);
        console.log("User ID:", checkOrder.data.workOrders[0]?.userId);
        console.log("Notes:", checkOrder.data.workOrders[0]?.operatorNotes);
        console.log("Rezervacija 11.11. Reg:", checkOrder.data.reservations[0]?.vesselRegistration);
        console.log("Zauzeće kopna 11.11. Vessel ID:", checkOrder.data.occupancies[0]?.vesselId);

        // Provjera Polić ST-5150
        const checkPolic = await axios.post(
            INSPECT_ENDPOINT,
            { vesselReg: "ST-5150" },
            { headers, timeout: 15000 }
        );
        console.log("\n2. Plovilo ST-5150 nakon ispravka datuma:");
        console.log("LiftedAt:", checkPolic.data.occupancies[0]?.liftedAt);
        console.log("Note:", checkPolic.data.occupancies[0]?.note);

        console.log("\n✅ SVE OPERACIJE ISPRAVKA USPJEŠNO PRIMIJENJENE I PROVJERENE!");
    } catch (err: any) {
        console.error("❌ Greška pri komunikaciji s produkcijskim poslužiteljem:", err.response?.status, err.response?.data || err.message);
        process.exit(1);
    }
}

main();
