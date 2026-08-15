import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import { runFullSync } from "../memberSync/syncEngine";

async function main() {
    console.log("🚀 Pokrećem lokalnu sinkronizaciju MSSQL (Brod) → PostgreSQL (akvatorij & vezovi)...");
    const result = await runFullSync("manual");
    console.log("\n=== REZULTAT SINKRONIZACIJE ===");
    console.log("Status:", result.status);
    console.log("Trajanje:", result.duration, "ms");
    console.log("Statistika:", result.counters);
    if (result.errors.length > 0) {
        console.log("Greške:", result.errors);
    }
}

main().catch(err => {
    console.error("Greška pri sinkronizaciji:", err);
    process.exit(1);
});
