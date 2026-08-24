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

  const vDef = await pool.request().query("SELECT VIEW_DEFINITION FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'vw_AktivniClanoviIBrodovi'");
  console.log("vw_AktivniClanoviIBrodovi definition:\n", vDef.recordset[0]?.VIEW_DEFINITION);

  const statusVals = await pool.request().query("SELECT Status, count(*) as cnt FROM CLAN03 GROUP BY Status ORDER BY cnt DESC");
  console.log("Status values in CLAN03:", statusVals.recordset);

  const clanVals = await pool.request().query("SELECT CLAN, count(*) as cnt FROM CLAN03 GROUP BY CLAN ORDER BY cnt DESC");
  console.log("CLAN field values in CLAN03:", clanVals.recordset);

  const distinctOib = await pool.request().query("SELECT count(distinct OIB) as dist_oib, count(distinct MAT_BROJ) as dist_mat FROM CLAN03 WHERE OIB IS NOT NULL AND OIB <> ''");
  console.log("Distinct OIB & MAT_BROJ in CLAN03:", distinctOib.recordset[0]);

  const distinctOibActive = await pool.request().query("SELECT count(distinct OIB) as dist_oib, count(distinct MAT_BROJ) as dist_mat FROM vw_AktivniClanoviIBrodovi");
  console.log("Distinct in vw_AktivniClanoviIBrodovi:", distinctOibActive.recordset[0]);

  process.exit(0);
}
run().catch(console.error);
