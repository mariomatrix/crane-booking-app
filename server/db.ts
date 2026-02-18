import { eq, and, gte, lte, desc, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, cranes, reservations, auditLog, type InsertUser, type InsertCrane, type InsertReservation, type InsertAuditLog } from "../drizzle/schema";

let _db: any = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(postgres(process.env.DATABASE_URL));
  }
  return _db;
}

export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  if (!db || !user.openId) return;
  await db.insert(users).values({ ...user, lastSignedIn: new Date() })
    .onConflictDoUpdate({ target: users.openId, set: { name: user.name, email: user.email, lastSignedIn: new Date() } });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return res[0];
}

export async function listCranes(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  return activeOnly ? db.select().from(cranes).where(eq(cranes.isActive, true)) : db.select().from(cranes);
}

export async function getCraneById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(cranes).where(eq(cranes.id, id)).limit(1);
  return res[0];
}

export async function createCrane(data: InsertCrane) {
  const db = await getDb();
  const res = await db.insert(cranes).values(data).returning({ id: cranes.id });
  return res[0].id;
}

export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  const res = await db.insert(reservations).values(data).returning({ id: reservations.id });
  return res[0].id;
}

export async function listAllReservations() {
  const db = await getDb();
  return db ? db.select().from(reservations).orderBy(desc(reservations.createdAt)) : [];
}

export async function createAuditEntry(data: InsertAuditLog) {
  const db = await getDb();
  if (db) await db.insert(auditLog).values(data);
}