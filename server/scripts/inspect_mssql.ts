import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function inspect() {
    const config = {
        server: process.env.MSSQL_HOST || "localhost",
        port: parseInt(process.env.MSSQL_PORT || "1433", 10),
        database: process.env.MSSQL_DATABASE || "Brod",
        user: process.env.MSSQL_USER || "sa",
        password: process.env.MSSQL_PASSWORD || "",
        options: {
            encrypt: false,
            trustServerCertificate: true,
        },
    };

    let pool: sql.ConnectionPool | null = null;
    try {
        console.log("Connecting to MSSQL...");
        pool = await sql.connect(config);
        console.log("Connected successfully!");

        // 1. All Tables
        const tablesRes = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);
        console.log("\n=== ALL MSSQL TABLES ===");
        tablesRes.recordset.forEach(r => console.log("- " + r.TABLE_NAME));

        // 2. All Columns of CLAN03 and other relevant tables
        const colsRes = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE COLUMN_NAME LIKE '%VEZ%' 
               OR COLUMN_NAME LIKE '%GAT%' 
               OR COLUMN_NAME LIKE '%DUG%' 
               OR COLUMN_NAME LIKE '%SALDO%'
               OR COLUMN_NAME LIKE '%UPLAT%'
               OR COLUMN_NAME LIKE '%ZADUZ%'
               OR COLUMN_NAME LIKE '%RACUN%'
               OR TABLE_NAME = 'CLAN03'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        console.log("\n=== RELEVANT COLUMNS ACROSS ALL TABLES ===");
        colsRes.recordset.forEach(r => console.log(`${r.TABLE_NAME}.${r.COLUMN_NAME} (${r.DATA_TYPE})`));

        // 3. Top 3 rows from CLAN03 with all column keys
        const sampleRes = await pool.request().query(`
            SELECT TOP 1 * FROM CLAN03
        `);
        console.log("\n=== CLAN03 ALL KEYS ===");
        if (sampleRes.recordset[0]) {
            console.log(Object.keys(sampleRes.recordset[0]));
        }

    } catch (e: any) {
        console.error("Inspection error:", e.message);
    } finally {
        if (pool) await pool.close();
    }
}

inspect();
