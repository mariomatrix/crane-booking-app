/**
 * Member Sync — MSSQL Client
 * Connection pool prema legacy MSSQL Server bazi (CLAN03)
 */
import sql from "mssql";
import type { MssqlConfig } from "./types";

let pool: sql.ConnectionPool | null = null;
let connecting = false;

/**
 * Čita MSSQL konfiguraciju iz environment varijabli
 */
function getMssqlConfig(): MssqlConfig {
    return {
        host: process.env.MSSQL_HOST || "localhost",
        port: parseInt(process.env.MSSQL_PORT || "1433", 10),
        database: process.env.MSSQL_DATABASE || "brod",
        user: process.env.MSSQL_USER || "sa",
        password: process.env.MSSQL_PASSWORD || "",
        encrypt: process.env.MSSQL_ENCRYPT === "true",
        trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERT !== "false",
    };
}

/**
 * Dohvaća ili kreira MSSQL connection pool
 * Retry logika: 3 pokušaja s exponential backoff
 */
export async function getMssqlPool(): Promise<sql.ConnectionPool> {
    if (pool?.connected) return pool;

    // Spriječi race condition kod paralelnih poziva
    if (connecting) {
        // Čekaj da se konekcija uspostavi
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 500));
            if (pool?.connected) return pool;
        }
        throw new Error("MSSQL connection timeout: pool is still connecting after 15s");
    }

    connecting = true;

    const config = getMssqlConfig();
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(
                `[MemberSync] MSSQL connecting to ${config.host}:${config.port}/${config.database} (attempt ${attempt}/${maxRetries})`,
            );

            pool = new sql.ConnectionPool({
                server: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                password: config.password,
                options: {
                    encrypt: config.encrypt,
                    trustServerCertificate: config.trustServerCertificate,
                },
                connectionTimeout: 15000,
                requestTimeout: 30000,
                pool: {
                    max: 5,
                    min: 1,
                    idleTimeoutMillis: 30000,
                },
            });

            await pool.connect();
            console.log(`[MemberSync] MSSQL connected successfully`);
            connecting = false;
            return pool;
        } catch (err) {
            lastError = err as Error;
            console.error(`[MemberSync] MSSQL connection attempt ${attempt} failed:`, (err as Error).message);

            if (attempt < maxRetries) {
                const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s
                console.log(`[MemberSync] Retrying in ${backoffMs}ms...`);
                await new Promise((r) => setTimeout(r, backoffMs));
            }
        }
    }

    connecting = false;
    throw new Error(`MSSQL connection failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Zatvara MSSQL connection pool (za graceful shutdown)
 */
export async function closeMssqlPool(): Promise<void> {
    if (pool) {
        try {
            await pool.close();
            console.log("[MemberSync] MSSQL pool closed");
        } catch (err) {
            console.error("[MemberSync] Error closing MSSQL pool:", (err as Error).message);
        }
        pool = null;
    }
}

/**
 * Provjerava je li MSSQL konfiguracija prisutna u .env
 */
export function isMssqlConfigured(): boolean {
    return !!(process.env.MSSQL_HOST && (process.env.MSSQL_DATABASE || process.env.MSSQL_USER));
}
