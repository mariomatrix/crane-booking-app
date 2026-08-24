import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import sql from "mssql";

async function run() {
  const pool = await sql.connect({
    server: process.env.MSSQL_HOST || "localhost",
    port: parseInt(process.env.MSSQL_PORT || "1433", 10),
    database: process.env.MSSQL_DATABASE || "Brod",
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "",
    options: { encrypt: false, trustServerCertificate: true },
  });

  const res = await pool.request().query(`
    SELECT
      count(*) as total_rows,
      count(distinct OIB) as distinct_oib,
      count(distinct MAT_BROJ) as distinct_mat,
      count(case when GAT is not null and GAT <> '' then 1 end) as with_gat,
      count(case when BROD_BR is not null and BROD_BR <> '' then 1 end) as with_brod
    FROM CLAN03
    WHERE (Status IS NULL OR Status <> 'O')
      AND (
        (GAT IS NOT NULL AND GAT <> '')
        OR (BROD_BR IS NOT NULL AND BROD_BR <> '')
        OR (CLAN = 'D')
        OR VRSTA_C IN ('U','B','P','K','L')
      )
  `);

  console.log("Clean Active Members Query Result:", res.recordset[0]);
  process.exit(0);
}
run().catch(console.error);
