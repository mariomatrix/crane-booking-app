import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function inspectMembers() {
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

    // Filter 1: Svi koji imaju GAT ili registriran brod
    const withBerthOrBoat = await pool.request().query(`
        SELECT COUNT(*) as cnt
        FROM CLAN03
        WHERE (GAT IS NOT NULL AND GAT <> '') 
           OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
    `);
    console.log("CLAN03 with GAT or BROD_BR:", withBerthOrBoat.recordset[0].cnt);

    // Filter 2: Svi aktivni članovi / udruženici
    const activeMembers = await pool.request().query(`
        SELECT COUNT(*) as cnt
        FROM CLAN03
        WHERE VRSTA_C IN ('U', 'B', 'P', 'K', 'L')
           OR (GAT IS NOT NULL AND GAT <> '')
    `);
    console.log("Active members/berths (U,B,P,K,L or GAT):", activeMembers.recordset[0].cnt);

    // Filter 3: Distribucija Status polja
    const statuses = await pool.request().query(`
        SELECT Status, COUNT(*) as cnt FROM CLAN03 GROUP BY Status
    `);
    console.log("Status column distribution:", statuses.recordset);

    await pool.close();
}

inspectMembers();
