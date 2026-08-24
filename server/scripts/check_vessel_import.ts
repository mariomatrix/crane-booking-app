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
    const stats = await pool.request().query(`
        SELECT 
            COUNT(*) as total_rows,
            COUNT(CASE WHEN BROD_BR IS NOT NULL AND LTRIM(RTRIM(BROD_BR)) <> '' THEN 1 END) as has_reg,
            COUNT(CASE WHEN IME_BR IS NOT NULL AND LTRIM(RTRIM(IME_BR)) <> '' THEN 1 END) as has_ime,
            COUNT(CASE WHEN DUZINA_BR IS NOT NULL AND DUZINA_BR > 0 THEN 1 END) as has_duzina,
            COUNT(CASE WHEN SIRINA_BR IS NOT NULL AND SIRINA_BR > 0 THEN 1 END) as has_sirina,
            COUNT(CASE WHEN TIP_BROD IS NOT NULL AND LTRIM(RTRIM(TIP_BROD)) <> '' THEN 1 END) as has_tip
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND GAT <> '')
           OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
           OR VRSTA_C IN ('U','B','P','K','L')
    `);
    console.log("Stats u sync obuhvatu:", stats.recordset[0]);

    const sample = await pool.request().query(`
        SELECT TOP 5 MAT_BROJ, IME, PREZIME, BROD_BR, IME_BR, TIP_BROD, DUZINA_BR, SIRINA_BR
        FROM CLAN03
        WHERE BROD_BR IS NOT NULL AND DUZINA_BR > 0
    `);
    console.log("Sample zapisa plovila:", sample.recordset);

    const tipovi = await pool.request().query(`
        SELECT TIP_BROD, COUNT(*) as cnt
        FROM CLAN03
        WHERE TIP_BROD IS NOT NULL AND TIP_BROD <> ''
        GROUP BY TIP_BROD
        ORDER BY cnt DESC
    `);
    console.log("Tipovi plovila u CLAN03 (top 10):", tipovi.recordset.slice(0, 10));

    await pool.close();
}
main().catch(console.error);
