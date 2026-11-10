import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";

const BASE_URL = process.env.PRODUCTION_URL || "https://dizalica.imagomatrix.com";
const INSPECT_ENDPOINT = `${BASE_URL}/api/v1/member-sync/inspect-work-order`;
const FIX_ENDPOINT = `${BASE_URL}/api/v1/member-sync/fix-crane-only-order`;

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

    console.log("=== 1. PREGLED STANJA NALOGA RN-2026-00017 I PLOVILA ST-297269 NA PRODUKCIJI ===");
    try {
        const inspectRes = await axios.post(
            INSPECT_ENDPOINT,
            { orderNumber: "RN-2026-00017", vesselReg: "ST-297269" },
            { headers, timeout: 30000 }
        );

        console.log("Rezultati inspekcije:");
        console.log("Radni nalozi:", JSON.stringify(inspectRes.data.workOrders, null, 2));
        console.log("Rezervacije:", JSON.stringify(inspectRes.data.reservations, null, 2));
        console.log("Plovila:", JSON.stringify(inspectRes.data.vessels, null, 2));
        console.log("Zauzeća kopna:", JSON.stringify(inspectRes.data.occupancies, null, 2));

        const shouldFix = process.argv.includes("--fix");
        if (!shouldFix) {
            console.log("\nℹ️ Pokrenite skriptu s argumentom '--fix' za automatski ispravak radnog naloga i brisanje zauzeća kopna.");
            return;
        }

        console.log("\n=== 2. POKRETANJE ISPRAVKA RADNOG NALOGA RN-2026-00017 ===");
        const fixRes = await axios.post(
            FIX_ENDPOINT,
            { orderNumber: "RN-2026-00017", expectedReg: "ST-297269" },
            { headers, timeout: 30000 }
        );

        console.log("Odgovor poslužitelja:", JSON.stringify(fixRes.data, null, 2));

        console.log("\n=== 3. KONTROLNA PROVJERA NAKON ISPRAVKA ===");
        const verifyRes = await axios.post(
            INSPECT_ENDPOINT,
            { orderNumber: "RN-2026-00017", vesselReg: "ST-297269" },
            { headers, timeout: 30000 }
        );

        console.log("Rezervacija nakon ispravka (landZoneId mora biti null):",
            verifyRes.data.reservations.map((r: any) => ({
                id: r.id,
                reservationNumber: r.reservationNumber,
                landZoneId: r.landZoneId,
                adminNote: r.adminNote,
                status: r.status,
            }))
        );
        console.log("Zauzeća kopna nakon ispravka (ne smije biti aktivnog zauzeća):",
            verifyRes.data.occupancies.filter((o: any) => !o.returnedAt)
        );

        console.log("\n✅ ISPRAVAK USPJEŠNO ZAVRŠEN!");
    } catch (err: any) {
        console.error("Greška pri komunikaciji s produkcijskim poslužiteljem:", err.response?.status, err.response?.data || err.message);
        process.exit(1);
    }
}

main();
