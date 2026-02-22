import { eq, and, gte, lte, desc, lt, gt, or, isNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  users,
  cranes,
  reservations,
  vessels,
  waitingList,
  settings,
  auditLog,
  type InsertUser,
  type InsertCrane,
  type InsertReservation,
  type InsertVessel,
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
  const res = await db.select().from(users)
    .where(eq(users.email, email))
    .limit(1);
  return res[0];
}

export async function getUserByGoogleId(googleId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users)
    .where(eq(users.googleId, googleId))
    .limit(1);
  return res[0];
}

export async function getUserById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return res[0];
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users)
    .where(isNull(users.anonymizedAt))
    .orderBy(users.name, users.email);
}

export async function updateUserRole(id: string, role: "user" | "operator" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function softDeleteUser(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Anonymize instead of hard delete for GDPR compliance
  await db.update(users).set({
    anonymizedAt: new Date(),
    updatedAt: new Date(),
    email: `deleted-${Date.now()}@deleted.invalid`,
    firstName: "Obrisani",
    lastName: "Korisnik",
    name: "Obrisani Korisnik",
    phone: null,
    googleId: null,
    passwordHash: null,
  }).where(eq(users.id, id));
}

export async function updateUser(id: string, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { id: _, role: __, ...updateData } = data as Record<string, unknown>;
  await db.update(users).set({ ...updateData as Partial<InsertUser>, updatedAt: new Date() }).where(eq(users.id, id));
}

// ─── Cranes ───────────────────────────────────────────────────────────
export async function listCranes(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  return activeOnly
    ? db.select().from(cranes).where(eq(cranes.craneStatus, "active"))
    : db.select().from(cranes);
}

export async function getCraneById(id: string) {
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

export async function updateCrane(id: string, data: Partial<InsertCrane>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cranes).set({ ...data, updatedAt: new Date() }).where(eq(cranes.id, id));
}

export async function deleteCrane(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(cranes).set({ craneStatus: "inactive", updatedAt: new Date() }).where(eq(cranes.id, id));
}

// ─── Vessels ──────────────────────────────────────────────────────────
export async function listVesselsByUser(userId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vessels)
    .where(eq(vessels.ownerId, userId))
    .orderBy(desc(vessels.createdAt));
}

export async function getVesselById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(vessels).where(eq(vessels.id, id)).limit(1);
  return res[0];
}

export async function createVessel(data: InsertVessel) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(vessels).values(data).returning({ id: vessels.id });
  return res[0].id;
}

export async function updateVessel(id: string, ownerId: string, data: Partial<InsertVessel>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(vessels)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(vessels.id, id), eq(vessels.ownerId, ownerId)));
}

export async function deleteVessel(id: string, ownerId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(vessels).where(and(eq(vessels.id, id), eq(vessels.ownerId, ownerId)));
}

// ─── Reservations ─────────────────────────────────────────────────────
export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(reservations).values(data).returning({ id: reservations.id });
  return res[0].id;
}

export async function getReservationById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return res[0];
}

export async function listReservationsByUser(userId: string) {
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
  id: string,
  status: "approved" | "rejected" | "cancelled" | "completed",
  approvedBy?: string,
  adminNote?: string,
  cancelReason?: string,
  cancelledByType?: "user" | "admin"
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(reservations)
    .set({
      status,
      approvedBy,
      approvedAt: status === "approved" ? new Date() : undefined,
      completedAt: status === "completed" ? new Date() : undefined,
      adminNote,
      cancelReason,
      cancelledByType,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, id));
}

/**
 * Check for time-slot overlap on a crane using scheduledStart/scheduledEnd.
 */
export async function checkOverlap(
  craneId: string,
  startDate: Date,
  effectiveEnd: Date,
  excludeId?: string
) {
  const db = await getDb();
  if (!db) return false;
  const conditions = [
    eq(reservations.craneId, craneId),
    or(
      eq(reservations.status, "pending"),
      eq(reservations.status, "approved")
    ),
    lt(reservations.scheduledStart, effectiveEnd),
    gt(reservations.scheduledEnd, startDate),
  ];
  if (excludeId) conditions.push(ne(reservations.id, excludeId));
  const res = await db.select({ id: reservations.id })
    .from(reservations)
    .where(and(...conditions))
    .limit(1);
  return res.length > 0;
}

export async function getReservationsForCalendar(start?: Date, end?: Date, includePending = true) {
  const db = await getDb();
  if (!db) return [];
  const statusConditions = includePending
    ? [or(eq(reservations.status, "approved"), eq(reservations.status, "pending"))]
    : [eq(reservations.status, "approved")];

  const conditions = [...statusConditions];
  if (start) conditions.push(gte(reservations.scheduledStart, start));
  if (end) conditions.push(lte(reservations.scheduledEnd, end));
  return db.select().from(reservations).where(and(...conditions));
}

// ─── Waiting List ─────────────────────────────────────────────────────
export async function addToWaitingList(data: InsertWaitingList) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(waitingList).values(data).returning({ id: waitingList.id });
  return res[0].id;
}

export async function listWaitingListByUser(userId: string) {
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

export async function getWaitingListById(id: string) {
  const db = await getDb();
  if (!db) return null;
  const res = await db.select().from(waitingList).where(eq(waitingList.id, id));
  return res[0] ?? null;
}

export async function updateWaitingList(id: string, data: Partial<InsertWaitingList>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(waitingList).set({ ...data, updatedAt: new Date() }).where(eq(waitingList.id, id));
}

export async function adminRemoveFromWaitingList(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(waitingList).where(eq(waitingList.id, id));
}

export async function removeFromWaitingList(id: string, userId: string) {
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
  for (const row of rows) {
    // value is JSONB - cast it to string for backwards compat
    const val = row.value;
    result[row.key] = typeof val === "string" ? val : String(val);
  }
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
export async function createAuditEntry(data: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  payload?: unknown;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (db) await db.insert(auditLog).values({
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    payload: data.payload,
    ipAddress: data.ipAddress,
  });
}

export async function listAuditLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}

// ─── Legacy SDK compatibility ──────────────────────────────────────────
// These functions support the existing oauth sdk.ts until v2 auth is implemented

export async function getUserByOpenId(openId: string) {
  return getUserByGoogleId(openId);
}

export async function upsertUser(data: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await getUserByGoogleId(data.openId);
  if (existing) {
    await db.update(users)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(typeof data.email === "string" ? { email: data.email } : {}),
        ...(data.loginMethod !== undefined ? { loginMethod: data.loginMethod } : {}),
        ...(data.lastSignedIn ? { lastSignedIn: data.lastSignedIn } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.googleId, data.openId));
  } else {
    await db.insert(users).values({
      googleId: data.openId,
      email: data.email ?? `${data.openId}@oauth.placeholder`,
      name: data.name,
      loginMethod: data.loginMethod,
      lastSignedIn: data.lastSignedIn ?? new Date(),
    });
  }
}