import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function checkFilters() {
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

    const pool = await sql.connect(config);

    const total = await pool.request().query(`SELECT COUNT(*) as cnt FROM CLAN03`);
    console.log("Total CLAN03:", total.recordset[0].cnt);

    const vrstaC = await pool.request().query(`
        SELECT VRSTA_C, COUNT(*) as cnt FROM CLAN03 GROUP BY VRSTA_C
    `);
    console.log("VRSTA_C distribution:", vrstaC.recordset);

    const klubDist = await pool.request().query(`
        SELECT KLUB, COUNT(*) as cnt FROM CLAN03 GROUP BY KLUB
    `);
    console.log("KLUB distribution:", klubDist.recordset);

    const gatDist = await pool.request().query(`
        SELECT VRSTA_C, KLUB, COUNT(*) as cnt 
        FROM CLAN03 
        WHERE GAT IS NOT NULL AND GAT <> '' 
        GROUP BY VRSTA_C, KLUB
    `);
    console.log("GAT rows with VRSTA_C and KLUB:", gatDist.recordset);

    await pool.close();
}

checkFilters();
