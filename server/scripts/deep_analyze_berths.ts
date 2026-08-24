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

    console.log("==================================================");
    console.log("1. USPOREDBA FILTERA U CLAN03");
    console.log("==================================================");

    // Total rows in CLAN03
    const totalClan03 = await pool.request().query(`SELECT COUNT(*) as c FROM CLAN03`);
    console.log(`Ukupno redaka u CLAN03: ${totalClan03.recordset[0].c}`);

    // Members with Berth (GAT or VEZ_BROJ or OPISVEZA or KOPNO)
    const berthFilter = await pool.request().query(`
        SELECT 
            COUNT(*) as total_with_any_berth,
            COUNT(CASE WHEN GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '' THEN 1 END) as has_gat,
            COUNT(CASE WHEN VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '' THEN 1 END) as has_vez_broj,
            COUNT(CASE WHEN OPISVEZA IS NOT NULL AND RTRIM(LTRIM(OPISVEZA)) <> '' THEN 1 END) as has_opisveza,
            COUNT(CASE WHEN KOPNO IS NOT NULL AND RTRIM(LTRIM(KOPNO)) <> '' THEN 1 END) as has_kopno,
            COUNT(CASE WHEN UGOVOR IS NOT NULL AND RTRIM(LTRIM(UGOVOR)) <> '' THEN 1 END) as has_ugovor
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '')
           OR (VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '')
           OR (OPISVEZA IS NOT NULL AND RTRIM(LTRIM(OPISVEZA)) <> '')
           OR (KOPNO IS NOT NULL AND RTRIM(LTRIM(KOPNO)) <> '')
    `);
    console.log("Članovi s podacima o vezu/kopnu:", berthFilter.recordset[0]);

    // Check if there are rows with VEZ_BROJ or OPISVEZA or KOPNO where GAT is empty
    const vezNoGat = await pool.request().query(`
        SELECT COUNT(*) as cnt
        FROM CLAN03
        WHERE (GAT IS NULL OR RTRIM(LTRIM(GAT)) = '')
          AND ((VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '')
            OR (OPISVEZA IS NOT NULL AND RTRIM(LTRIM(OPISVEZA)) <> '')
            OR (KOPNO IS NOT NULL AND RTRIM(LTRIM(KOPNO)) <> ''))
    `);
    console.log(`Redaka s vezom/kopnom ali praznim GAT: ${vezNoGat.recordset[0].cnt}`);

    // Check what our CURRENT query returns
    const currentQueryRes = await pool.request().query(`
        SELECT COUNT(*) as current_sync_count
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND GAT <> '')
           OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
           OR VRSTA_C IN ('U','B','P','K','L')
    `);
    console.log(`Trenutni upit u mssqlQueries.ts vraća: ${currentQueryRes.recordset[0].current_sync_count}`);

    // Check if ANY row with GAT/VEZ is missed by current query
    const missedBerthRows = await pool.request().query(`
        SELECT COUNT(*) as missed_count
        FROM CLAN03
        WHERE ((GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '')
            OR (VEZ_BROJ IS NOT NULL AND RTRIM(LTRIM(VEZ_BROJ)) <> '')
            OR (OPISVEZA IS NOT NULL AND RTRIM(LTRIM(OPISVEZA)) <> ''))
          AND NOT (
            (GAT IS NOT NULL AND GAT <> '')
            OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
            OR VRSTA_C IN ('U','B','P','K','L')
          )
    `);
    console.log(`Propušteno članova s vezom u trenutnom upitu: ${missedBerthRows.recordset[0].missed_count}`);

    console.log("\n==================================================");
    console.log("2. VEZOVI TABLICA VS CLAN03");
    console.log("==================================================");

    const vezoviRows = await pool.request().query(`
        SELECT COUNT(*) as total_vezovi,
               COUNT(BROD_BR) as with_brod_br
        FROM Vezovi
    `);
    console.log("Tablica Vezovi:", vezoviRows.recordset[0]);

    // Sample from Vezovi where BROD_BR is not null
    const vezoviSample = await pool.request().query(`
        SELECT TOP 10 * FROM Vezovi WHERE BROD_BR IS NOT NULL AND RTRIM(LTRIM(BROD_BR)) <> ''
    `);
    console.log("Sample iz Vezovi s brodom:", vezoviSample.recordset);

    console.log("\n==================================================");
    console.log("3. STATUS I AKTIVNOST ČLANOVA S VEZOM");
    console.log("==================================================");
    const statusBreakdown = await pool.request().query(`
        SELECT 
            ISNULL(Status, 'NULL') as Status,
            ISNULL(CLAN, 'NULL') as CLAN,
            VRSTA_C,
            COUNT(*) as count
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND RTRIM(LTRIM(GAT)) <> '')
        GROUP BY Status, CLAN, VRSTA_C
        ORDER BY count DESC
    `);
    console.log("Distribucija Status / CLAN / VRSTA_C za članove s vezom:");
    console.table(statusBreakdown.recordset);

    console.log("\n==================================================");
    console.log("4. DOHVAĆAJU LI SE I KOPNO / SUHI VEZ?");
    console.log("==================================================");
    const kopnoStats = await pool.request().query(`
        SELECT 
            COUNT(CASE WHEN KOPNO IS NOT NULL AND KOPNO <> '' THEN 1 END) as has_kopno,
            COUNT(CASE WHEN KOPNOPIS IS NOT NULL AND KOPNOPIS <> '' THEN 1 END) as has_kopnopis,
            COUNT(CASE WHEN (KOPNO IS NOT NULL AND KOPNO <> '') AND (GAT IS NULL OR GAT = '') THEN 1 END) as kopno_only
        FROM CLAN03
    `);
    console.log("Kopno / Suhi vez stats:", kopnoStats.recordset[0]);

    await pool.close();
}

main().catch(console.error);
