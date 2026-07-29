import "dotenv/config";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function test() {
  const db = await getDb();
  if (!db) {
    console.error("DB not available");
    process.exit(1);
  }
  try {
    const res = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
    console.log("Columns in users table:", res.map((r: any) => r.column_name));
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

test();
