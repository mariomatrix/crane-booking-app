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

  console.log("=== 1. PHYSICAL BERTHS IN TABLE 'Vezovi' ===");
  const totalVezovi = await pool.request().query("SELECT count(*) as cnt FROM Vezovi");
  console.log("Physical berths in Vezovi:", totalVezovi.recordset[0].cnt);

  console.log("\n=== 2. GAT BREAKDOWN IN ACTIVE CLAN03 ROWS ===");
  const gatBreakdown = await pool.request().query(`
    SELECT GAT, count(*) as row_count, count(distinct VEZ_BROJ) as distinct_vez_broj
    FROM CLAN03
    WHERE (Status IS NULL OR Status <> 'O')
      AND GAT IS NOT NULL AND GAT <> ''
    GROUP BY GAT
    ORDER BY count(*) DESC
  `);
  console.log(gatBreakdown.recordset);

  console.log("\n=== 3. DISTINCT BERTH CODES (GAT + VEZ_BROJ) IN CLAN03 ===");
  const distinctBerths = await pool.request().query(`
    SELECT count(distinct RTRIM(LTRIM(GAT)) + '-' + RTRIM(LTRIM(VEZ_BROJ))) as distinct_gat_vez
    FROM CLAN03
    WHERE (Status IS NULL OR Status <> 'O')
      AND GAT IS NOT NULL AND GAT <> ''
  `);
  console.log("Distinct (GAT + VEZ_BROJ) in active CLAN03:", distinctBerths.recordset[0]);

  console.log("\n=== 4. HOW MANY MEMBERS SHARE THE SAME (GAT + VEZ_BROJ)? ===");
  const duplicateBerths = await pool.request().query(`
    SELECT TOP 10 GAT, VEZ_BROJ, count(*) as member_count
    FROM CLAN03
    WHERE (Status IS NULL OR Status <> 'O')
      AND GAT IS NOT NULL AND GAT <> ''
    GROUP BY GAT, VEZ_BROJ
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `);
  console.log("Top shared/duplicate berths in CLAN03:", duplicateBerths.recordset);

  console.log("\n=== 5. SAMPLE MEMBERS ON THE SAME BERTH ===");
  if (duplicateBerths.recordset.length > 0) {
    const topGat = duplicateBerths.recordset[0].GAT;
    const topVez = duplicateBerths.recordset[0].VEZ_BROJ;
    const sampleMembers = await pool.request().query(`
      SELECT MAT_BROJ, IME, PREZIME, OIB, GAT, VEZ_BROJ, BROD_BR, IME_BR, UGOVOR, Status, CLAN
      FROM CLAN03
      WHERE GAT = '${topGat}' AND VEZ_BROJ = '${topVez}'
    `);
    console.log(`Sample members on Gat ${topGat}, Vez ${topVez}:`, sampleMembers.recordset);
  }

  process.exit(0);
}
run().catch(console.error);
