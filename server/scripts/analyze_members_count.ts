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

  const total = await pool.request().query("SELECT count(*) as c FROM CLAN03");
  console.log("Total in CLAN03:", total.recordset[0].c);

  const vrstac = await pool.request().query("SELECT VRSTA_C, count(*) as cnt FROM CLAN03 GROUP BY VRSTA_C ORDER BY cnt DESC");
  console.log("VRSTA_C breakdown:", vrstac.recordset);

  const withGat = await pool.request().query("SELECT count(*) as c FROM CLAN03 WHERE GAT IS NOT NULL AND GAT <> ''");
  console.log("With GAT (assigned berth):", withGat.recordset[0].c);

  const withBrod = await pool.request().query("SELECT count(*) as c FROM CLAN03 WHERE BROD_BR IS NOT NULL AND BROD_BR <> ''");
  console.log("With BROD_BR:", withBrod.recordset[0].c);

  try {
    const activeView = await pool.request().query("SELECT count(*) as c FROM vw_AktivniClanoviIBrodovi");
    console.log("In vw_AktivniClanoviIBrodovi:", activeView.recordset[0].c);
  } catch (e: any) {
    console.log("vw_AktivniClanoviIBrodovi error:", e.message);
  }

  try {
    const clanIBrodovi = await pool.request().query("SELECT count(*) as c FROM vw_ClanoviIBrodovi");
    console.log("In vw_ClanoviIBrodovi:", clanIBrodovi.recordset[0].c);
  } catch (e: any) {
    console.log("vw_ClanoviIBrodovi error:", e.message);
  }

  const columns = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CLAN03'");
  console.log("CLAN03 Columns:", columns.recordset.map(r => r.COLUMN_NAME));
  
  process.exit(0);
}
run().catch(console.error);
