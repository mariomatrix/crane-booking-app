import "dotenv/config";
import postgres from "postgres";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("No DATABASE_URL found in .env");
    return;
  }
  const sql = postgres(dbUrl);
  console.log("Altering users table...");
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pin_code" varchar(10);`;
  console.log("Creating operator_cranes table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "operator_cranes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "crane_id" uuid NOT NULL REFERENCES "cranes"("id") ON DELETE CASCADE,
        "created_at" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("Database schema updated successfully!");
  await sql.end();
}

main().catch(console.error);
