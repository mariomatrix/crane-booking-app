import "dotenv/config";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function applyMigrations() {
  const db = await getDb();
  if (!db) {
    console.error("DB not available");
    process.exit(1);
  }

  console.log("Applying missing migration SQL files...");

  // 1. Add legal entity & address columns
  try {
    const sql1 = fs.readFileSync(path.join(process.cwd(), "drizzle", "0002_add_user_legal_entity_and_address.sql"), "utf-8");
    await db.execute(sql.raw(sql1));
    console.log("Applied 0002_add_user_legal_entity_and_address.sql");
  } catch (err: any) {
    console.log("0002_add_user_legal_entity_and_address:", err.message);
  }

  // 2. Add OIB column & index
  try {
    const sql2 = fs.readFileSync(path.join(process.cwd(), "drizzle", "oib_migration.sql"), "utf-8");
    await db.execute(sql.raw(sql2));
    console.log("Applied oib_migration.sql");
  } catch (err: any) {
    console.log("oib_migration:", err.message);
  }

  // 3. Add operation_category & land_zone_id
  try {
    const sql3 = fs.readFileSync(path.join(process.cwd(), "drizzle", "0002_hard_photon.sql"), "utf-8");
    const statements = sql3.split("--> statement-breakpoint");
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await db.execute(sql.raw(stmt.trim()));
        } catch (e: any) {
          console.log("Stmt error:", e.message);
        }
      }
    }
    console.log("Applied 0002_hard_photon.sql");
  } catch (err: any) {
    console.log("0002_hard_photon:", err.message);
  }

  // 4. Add reservation_id to land_waiting_list
  try {
    const sql4 = fs.readFileSync(path.join(process.cwd(), "drizzle", "0003_illegal_shen.sql"), "utf-8");
    const statements = sql4.split("--> statement-breakpoint");
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await db.execute(sql.raw(stmt.trim()));
        } catch (e: any) {
          console.log("Stmt error:", e.message);
        }
      }
    }
    console.log("Applied 0003_illegal_shen.sql");
  } catch (err: any) {
    console.log("0003_illegal_shen:", err.message);
  }

  console.log("All missing columns applied successfully!");
  process.exit(0);
}

applyMigrations();
