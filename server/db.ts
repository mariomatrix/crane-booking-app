import { eq, and, gte, lte, desc, lt, gt, or, sql, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  users,
  cranes,
  reservations,
  waitingList,
  settings,
  auditLog,
  type InsertUser,
  type InsertCrane,
  type InsertReservation,
  type InsertWaitingList,
  type InsertAuditLog,
} from "../drizzle/schema";

// ─── DB Connection ────────────────────────────────────────────────────
let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(postgres(process.env.DATABASE_URL));
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  if (!db || !user.openId) return;
  await db.insert(users).values({ ...user, lastSignedIn: new Date() })
    .onConflictDoUpdate({
      target: users.openId,
      set: { name: user.name, email: user.email, lastSignedIn: new Date() }
    });
}

export async function createLocalUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  username?: string;
  phone?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const name = data.username || `${data.firstName} ${data.lastName}`.trim();
  const res = await db.insert(users).values({
    email: data.email,
    passwordHash: data.passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    name,
    phone: data.phone,
    loginMethod: "email",
    lastSignedIn: new Date(),
  }).returning({ id: users.id });
  return res[0]?.id;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return res[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return res[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return res[0];
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name, users.email);
}

export async function updateUserRole(id: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

// ─── Cranes ───────────────────────────────────────────────────────────
export async function listCranes(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  return activeOnly
    ? db.select().from(cranes).where(eq(cranes.isActive, true))
    : db.select().from(cranes);
}

export async function getCraneById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(cranes).where(eq(cranes.id, id)).limit(1);
  return res[0];
}

export async function createCrane(data: InsertCrane) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(cranes).values(data).returning({ id: cranes.id });
  return res[0].id;
}

export async function updateCrane(id: number, data: Partial<InsertCrane>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cranes).set({ ...data, updatedAt: new Date() }).where(eq(cranes.id, id));
}

export async function deleteCrane(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cranes).set({ isActive: false, updatedAt: new Date() }).where(eq(cranes.id, id));
}

// ─── Reservations ─────────────────────────────────────────────────────
export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(reservations).values(data).returning({ id: reservations.id });
  return res[0].id;
}

export async function getReservationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return res[0];
}

export async function listReservationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reservations)
    .where(eq(reservations.userId, userId))
    .orderBy(desc(reservations.createdAt));
}

export async function listAllReservations(status?: string) {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(reservations)
      .where(eq(reservations.status, status as any))
      .orderBy(desc(reservations.createdAt));
  }
  return db.select().from(reservations).orderBy(desc(reservations.createdAt));
}

export async function updateReservationStatus(
  id: number,
  status: "approved" | "rejected" | "cancelled",
  reviewedBy?: number,
  adminNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(reservations)
    .set({ status, reviewedBy, reviewedAt: new Date(), adminNotes, updatedAt: new Date() })
    .where(eq(reservations.id, id));
}

/**
 * Check for time-slot overlap on a crane.
 * The effectiveEnd should include buffer time when checking.
 */
export async function checkOverlap(
  craneId: number,
  startDate: Date,
  effectiveEnd: Date,
  excludeId?: number
) {
  const db = await getDb();
  if (!db) return false;
  const conditions = [
    eq(reservations.craneId, craneId),
    or(
      eq(reservations.status, "pending"),
      eq(reservations.status, "approved")
    ),
    lt(reservations.startDate, effectiveEnd),
    gt(reservations.endDate, startDate),
  ];
  if (excludeId) conditions.push(ne(reservations.id, excludeId));
  const res = await db.select({ id: reservations.id })
    .from(reservations)
    .where(and(...conditions))
    .limit(1);
  return res.length > 0;
}

export async function getApprovedReservationsForCalendar(start?: Date, end?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(reservations.status, "approved")];
  if (start) conditions.push(gte(reservations.startDate, start));
  if (end) conditions.push(lte(reservations.endDate, end));
  return db.select().from(reservations).where(and(...conditions));
}

// ─── Waiting List ─────────────────────────────────────────────────────
export async function addToWaitingList(data: InsertWaitingList) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(waitingList).values(data).returning({ id: waitingList.id });
  return res[0].id;
}

export async function listWaitingListByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(waitingList)
    .where(eq(waitingList.userId, userId))
    .orderBy(desc(waitingList.createdAt));
}

export async function listAllWaiting() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(waitingList).orderBy(desc(waitingList.createdAt));
}

export async function removeFromWaitingList(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(waitingList)
    .where(and(eq(waitingList.id, id), eq(waitingList.userId, userId)));
}

// ─── Settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: Record<string, string> = {
  slotDurationMinutes: "60",
  bufferMinutes: "15",
  workdayStart: "08:00",
  workdayEnd: "16:00",
};

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return DEFAULT_SETTINGS;
  const rows = await db.select().from(settings);
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export async function updateSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

// ─── Audit Log ────────────────────────────────────────────────────────
export async function createAuditEntry(data: InsertAuditLog) {
  const db = await getDb();
  if (db) await db.insert(auditLog).values(data);
}

export async function listAuditLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}