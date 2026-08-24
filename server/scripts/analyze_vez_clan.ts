import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function main() {
    const config = {
        server: process.env.MSSQL_HOST || "localhost",
        port: parseInt(process.env.MSSQL_PORT || "1433", 10),
        database: process.env.MSSQL_DATABASE || "Brod",
        user: process.env.MSSQL_USER || "sa",
        password: process.env.MSSQL_PASSWORD || "",
        options: { encrypt: false, trustServerCertificate: true },
    };
    const pool = await sql.connect(config);

    console.log("=== 1. ALL TABLES WITH 'VEZ' OR 'CLAN' ===");
    const tables = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        ORDER BY TABLE_NAME
    `);
    console.log(tables.recordset.map(t => t.TABLE_NAME));

    console.log("\n=== 2. VEZOVI TABLE SCHEMA & SAMPLE ===");
    try {
        const vezoviCols = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Vezovi'
        `);
        console.log("Vezovi columns:", vezoviCols.recordset);
        const vezoviSample = await pool.request().query(`SELECT TOP 10 * FROM Vezovi`);
        console.log("Vezovi sample:", vezoviSample.recordset);
        const vezoviCount = await pool.request().query(`SELECT COUNT(*) as cnt FROM Vezovi`);
        console.log("Vezovi count:", vezoviCount.recordset[0].cnt);
    } catch (e: any) {
        console.log("Vezovi table error:", e.message);
    }

    console.log("\n=== 3. VIEWS DEFINITION ===");
    const views = await pool.request().query(`
        SELECT TABLE_NAME, VIEW_DEFINITION 
        FROM INFORMATION_SCHEMA.VIEWS
    `);
    for (const v of views.recordset) {
        console.log(`\n--- View: ${v.TABLE_NAME} ---`);
        console.log(v.VIEW_DEFINITION);
    }

    console.log("\n=== 4. CLAN03 GAT & VEZ STATS ===");
    const clanVezStats = await pool.request().query(`
        SELECT 
            COUNT(*) as total_rows,
            COUNT(CASE WHEN GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '' THEN 1 END) as has_gat,
            COUNT(CASE WHEN VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '' THEN 1 END) as has_vez_broj,
            COUNT(CASE WHEN (GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '') AND (VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '') THEN 1 END) as has_both_gat_and_vez,
            COUNT(CASE WHEN (BROD_BR IS NOT NULL AND RTRIM(LTRIM(BROD_BR)) <> '') THEN 1 END) as has_brod,
            COUNT(CASE WHEN VRSTA_C IN ('U','B') THEN 1 END) as vrsta_u_b,
            COUNT(CASE WHEN VRSTA_C IN ('U','B','P','K','L') THEN 1 END) as vrsta_ubpkl
        FROM CLAN03
    `);
    console.log("CLAN03 Stats:", clanVezStats.recordset[0]);

    console.log("\n=== 5. HOW MANY CLAN03 ROWS PER VRSTA_C HAVE GAT/VEZ? ===");
    const breakdown = await pool.request().query(`
        SELECT 
            VRSTA_C,
            KLUB,
            COUNT(*) as total,
            COUNT(CASE WHEN GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '' THEN 1 END) as with_gat,
            COUNT(CASE WHEN BROD_BR IS NOT NULL AND RTRIM(LTRIM(BROD_BR)) <> '' THEN 1 END) as with_brod
        FROM CLAN03
        GROUP BY VRSTA_C, KLUB
        ORDER BY VRSTA_C, KLUB
    `);
    console.log(breakdown.recordset);

    console.log("\n=== 6. ARE THERE MEMBERS WITH VEZ BUT NO GAT OR OTHER COMBINATIONS? ===");
    const weirdVez = await pool.request().query(`
        SELECT TOP 10 MAT_BROJ, PREZIME, IME, VRSTA_C, KLUB, GAT, VEZ_BROJ, BROD_BR, IME_BR
        FROM CLAN03
        WHERE (VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '')
          AND (GAT IS NULL OR RTRIM(LTRIM(GAT)) = '')
    `);
    console.log("Vez without gat:", weirdVez.recordset);

    console.log("\n=== 7. ARE THERE MEMBERS IN 'Vezovi' TABLE LINKED TO CLAN03? ===");
    // check if Vezovi has member ID or name
    try {
        const vezoviForeign = await pool.request().query(`
            SELECT TOP 5 * FROM Vezovi
        `);
        console.log("Vezovi all fields sample:", vezoviForeign.recordset);
    } catch(e: any) {}

    await pool.close();
}

main().catch(console.error);
