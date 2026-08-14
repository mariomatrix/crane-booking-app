/**
 * Member Sync — Local Windows Daemon
 * 
 * Kontinuirani pozadinski servis koji na lokalnom Windows 11 PC-u
 * svakih N minuta (default: 60 min) pokreće slanje podataka na udaljeni server.
 * 
 * Pokretanje:
 *   pnpm sync:daemon
 */
import "dotenv/config";
import { executePushSync } from "./cli";

const intervalMinutes = parseInt(process.env.MEMBER_SYNC_INTERVAL_MIN || "60", 10);
const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;

console.log("================================================================================");
console.log(`  PŠD ŠPINUT — MEMBER SYNC DAEMON POKRENUT`);
console.log(`  Interval ponavljanja: svakih ${intervalMinutes} minuta`);
console.log("  Pritisnite Ctrl+C za zaustavljanje servisa.");
console.log("================================================================================");
console.log("");

// Pokreni odmah prvo slanje
executePushSync().catch(console.error);

// Postavi periodički timer
const timer = setInterval(() => {
    console.log(`\n[${new Date().toLocaleTimeString("hr-HR")}] Pokrećem periodičku sinkronizaciju...`);
    executePushSync().catch(console.error);
}, intervalMs);

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\nZaustavljanje Member Sync daemona...");
    clearInterval(timer);
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nZaustavljanje Member Sync daemona...");
    clearInterval(timer);
    process.exit(0);
});
