import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function sample() {
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

    let pool = await sql.connect(config);
    const res = await pool.request().query(`
        SELECT TOP 10 
            MAT_BROJ, PREZIME, IME, OIB, BROD_BR, IME_BR,
            GAT, VEZ_BROJ, VEZ_TIP, OPISVEZA, UGOVOR, DUG, PLAC_DO, KOPNO, KOPNOPIS
        FROM CLAN03
        WHERE GAT IS NOT NULL AND GAT <> ''
    `);
    console.log("=== SAMPLE GAT & VEZ IN CLAN03 ===");
    console.log(JSON.stringify(res.recordset, null, 2));

    const gatCounts = await pool.request().query(`
        SELECT GAT, COUNT(*) as cnt 
        FROM CLAN03 
        WHERE GAT IS NOT NULL AND GAT <> ''
        GROUP BY GAT
        ORDER BY GAT
    `);
    console.log("\n=== GAT COUNTS IN CLAN03 ===");
    console.log(gatCounts.recordset);

    await pool.close();
}
sample();
