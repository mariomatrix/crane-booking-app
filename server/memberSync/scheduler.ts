/**
 * Member Sync — Scheduler
 * Periodički pokretač sinkronizacije pomoću Node.js setInterval (Windows 11 kompatibilno)
 */
import { runFullSync } from "./syncEngine";
import { isMssqlConfigured } from "./mssqlClient";
import type { FullSyncResult } from "./types";

let syncIntervalTimer: NodeJS.Timeout | null = null;
let warmupTimer: NodeJS.Timeout | null = null;
let isSyncRunning = false;

/**
 * Pokreće sinkronizaciju s mutex zaštitom
 */
export async function triggerScheduledSync(triggeredBy: string = "cron"): Promise<FullSyncResult | null> {
    if (isSyncRunning) {
        console.warn(`[MemberSync] Sync already in progress, skipping triggered run (${triggeredBy})`);
        return null;
    }

    if (!isMssqlConfigured()) {
        console.log(`[MemberSync] MSSQL credentials not configured in .env (MSSQL_HOST/MSSQL_PASSWORD missing), skipping sync`);
        return null;
    }

    isSyncRunning = true;
    try {
        const result = await runFullSync(triggeredBy);
        return result;
    } catch (err) {
        console.error(`[MemberSync] Error during sync (${triggeredBy}):`, (err as Error).message);
        throw err;
    } finally {
        isSyncRunning = false;
    }
}

/**
 * Inicijalizira i pokreće pozadinski scheduler
 */
export function startMemberSyncCron(): void {
    const isEnabled = process.env.MEMBER_SYNC_ENABLED !== "false";
    if (!isEnabled) {
        console.log("[MemberSync] Member Sync is disabled by configuration (MEMBER_SYNC_ENABLED=false)");
        return;
    }

    const intervalMinutes = parseInt(process.env.MEMBER_SYNC_INTERVAL_MIN || "60", 10);
    const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000; // minimalno 5 min

    console.log(`[MemberSync] Member Sync scheduler initialized: interval = ${intervalMinutes} min`);

    // Warmup: pokreni prvi sync 30 sekundi nakon starta servera
    warmupTimer = setTimeout(() => {
        console.log("[MemberSync] Running initial post-startup sync...");
        triggerScheduledSync("startup").catch((err) => {
            console.error("[MemberSync] Initial sync error:", err.message);
        });
    }, 30_000);

    // Periodički timer
    syncIntervalTimer = setInterval(() => {
        console.log(`[MemberSync] Running scheduled periodic sync (${intervalMinutes} min interval)...`);
        triggerScheduledSync("cron").catch((err) => {
            console.error("[MemberSync] Scheduled sync error:", err.message);
        });
    }, intervalMs);
}

/**
 * Zaustavlja scheduler (za testove ili shutdown)
 */
export function stopMemberSyncCron(): void {
    if (warmupTimer) {
        clearTimeout(warmupTimer);
        warmupTimer = null;
    }
    if (syncIntervalTimer) {
        clearInterval(syncIntervalTimer);
        syncIntervalTimer = null;
    }
    console.log("[MemberSync] Member Sync scheduler stopped");
}

/**
 * Vraća status schedulera
 */
export function getMemberSyncStatus(): { isRunning: boolean; isConfigured: boolean } {
    return {
        isRunning: isSyncRunning,
        isConfigured: isMssqlConfigured(),
    };
}
