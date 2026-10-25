import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";

const BASE_URL = process.env.PRODUCTION_URL || "https://dizalica.imagomatrix.com";
const ENDPOINT = `${BASE_URL}/api/v1/member-sync/reset-operational-data`;

async function run() {
    const apiKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;
    if (!apiKey) {
        console.error("❌ SYNC_API_KEY nije pronađen u .env!");
        process.exit(1);
    }

    const isExecute = process.argv.includes("--execute");

    console.log(`=== 1. DRY RUN PROVJERA NA ${ENDPOINT} ===`);
    try {
        const dryRes = await axios.post(
            ENDPOINT,
            { dryRun: true },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "x-sync-api-key": apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 30000,
            }
        );

        console.log("\n📊 STANJE PRIJE ČIŠĆENJA:");
        console.log("Zaštićene tablice (ostaju):", JSON.stringify(dryRes.data.snapshot?.preserved, null, 2));
        console.log("Radne tablice (brišu se):", JSON.stringify(dryRes.data.snapshot?.operational, null, 2));
        console.log("Brojači i zastavice:", JSON.stringify(dryRes.data.snapshot?.countersAndFlags, null, 2));

        if (!isExecute) {
            console.log("\nℹ️ Dry run završen. Za stvarno izvršavanje pokrenite s argumentom --execute");
            return;
        }

        console.log("\n=== 2. IZVRŠAVANJE PRODUKCIJSKOG RESETA RADNIH PODATAKA ===");
        const execRes = await axios.post(
            ENDPOINT,
            { confirm: "RESET_PRODUCTION_OPERATIONAL_DATA" },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "x-sync-api-key": apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 60000,
            }
        );

        console.log("\n✅ REZULTAT ČIŠĆENJA:", execRes.data.message);
        console.log("\n📊 STANJE NAKON ČIŠĆENJA:");
        console.log("Zaštićene tablice (sačuvane):", JSON.stringify(execRes.data.after?.preserved, null, 2));
        console.log("Radne tablice (očišćene):", JSON.stringify(execRes.data.after?.operational, null, 2));
        console.log("Brojači i zastavice (resetirani):", JSON.stringify(execRes.data.after?.countersAndFlags, null, 2));
    } catch (err: any) {
        console.error("❌ Greška:", err.response?.status, err.response?.data || err.message);
        process.exit(1);
    }
}

run();
