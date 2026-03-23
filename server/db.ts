import { eq, and, gte, lte, desc, lt, gt, or, isNull, ne, asc, sql } from "drizzle-orm";
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
  serviceTypes,
  emailVerificationTokens,
  messages,
  seasons,
  holidays,
  apiKeys,
  type InsertUser,
  type InsertCrane,
  type InsertReservation,
  type InsertVessel,
  type InsertWaitingList,
  type InsertAuditLog,
  type InsertServiceType,
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
  mustChangePassword?: boolean;
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
    mustChangePassword: data.mustChangePassword ?? false,
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

export async function listAllUsers(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  
  const [countRes] = await db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(isNull(users.anonymizedAt));
    
  const data = await db.select().from(users)
    .where(isNull(users.anonymizedAt))
    .orderBy(users.name, users.email)
    .limit(limit)
    .offset(offset);
    
  return { data, total: Number(countRes.count) };
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

export async function listAllReservations(status?: string, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(reservations);
  let dataQuery = db.select().from(reservations).orderBy(desc(reservations.createdAt)).limit(limit).offset(offset);
  
  if (status) {
    countQuery.where(eq(reservations.status, status as any));
    dataQuery.where(eq(reservations.status, status as any));
  }
  
  const [countRes] = await countQuery;
  const data = await dataQuery;
  
  return { data, total: Number(countRes.count) };
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

export async function listAllWaiting(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return { data: [], total: 0 };
  
  const [countRes] = await db.select({ count: sql<number>`count(*)` }).from(waitingList);
  const data = await db.select().from(waitingList).orderBy(desc(waitingList.createdAt)).limit(limit).offset(offset);
  
  return { data, total: Number(countRes.count) };
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
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      payload: auditLog.payload,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
      actor: {
        id: users.id,
        name: users.name,
      },
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ─── Service Types ────────────────────────────────────────────────────
export async function listServiceTypes(onlyActive = false) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(serviceTypes);
  if (onlyActive) query.where(eq(serviceTypes.isActive, true));
  return query.orderBy(asc(serviceTypes.sortOrder), asc(serviceTypes.name));
}

export async function getServiceTypeById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(serviceTypes).where(eq(serviceTypes.id, id)).limit(1);
  return res[0];
}

export async function createServiceType(data: Omit<InsertServiceType, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.insert(serviceTypes).values(data).returning();
  return res[0];
}

export async function updateServiceType(id: string, data: Partial<Omit<InsertServiceType, "id" | "createdAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const res = await db.update(serviceTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(serviceTypes.id, id))
    .returning();
  return res[0];
}

export async function deleteServiceType(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(serviceTypes).where(eq(serviceTypes.id, id));
}

export async function seedServiceTypes() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(serviceTypes).limit(1);
  if (existing.length > 0) return; // already seeded
  const defaults = [
    { name: "Spuštanje", description: "Spuštanje plovila u more", defaultDurationMin: 60, sortOrder: 0 },
    { name: "Vađenje", description: "Vađenje plovila iz mora", defaultDurationMin: 60, sortOrder: 1 },
    { name: "Premještanje", description: "Premještanje plovila unutar marine", defaultDurationMin: 90, sortOrder: 2 },
    { name: "Zimovanje", description: "Skladištenje plovila za zimu", defaultDurationMin: 120, sortOrder: 3 },
    { name: "Ostalo", description: "Ostale operacije dizalicom", defaultDurationMin: 60, sortOrder: 4 },
  ];
  await db.insert(serviceTypes).values(defaults);
}

// ─── Email Verification ───────────────────────────────────────────────
import crypto from "crypto";

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(emailVerificationTokens).values({
    userId,
    token,
    expiresAt,
  });
  return token;
}

export async function verifyEmailToken(token: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select()
    .from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.token, token),
      gte(emailVerificationTokens.expiresAt, new Date())
    ))
    .limit(1);
  if (!row) return null;

  // Mark user as verified
  await db.update(users)
    .set({ emailVerifiedAt: new Date(), userStatus: "active", updatedAt: new Date() })
    .where(eq(users.id, row.userId));

  // Cleanup used tokens
  await db.delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, row.userId));

  return row.userId;
}

export async function deleteExpiredVerificationTokens() {
  const db = await getDb();
  if (!db) return;
  await db.delete(emailVerificationTokens)
    .where(lt(emailVerificationTokens.expiresAt, new Date()));
}

// ─── Messages ─────────────────────────────────────────────────────────
import { sql as sqlTag } from "drizzle-orm";

export async function sendMessage(data: { reservationId: string; senderId: string; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [msg] = await db.insert(messages).values(data).returning();
  return msg;
}

export async function listMessages(reservationId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: messages.id,
    reservationId: messages.reservationId,
    senderId: messages.senderId,
    senderName: users.name,
    senderRole: users.role,
    body: messages.body,
    isRead: messages.isRead,
    createdAt: messages.createdAt,
  })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.reservationId, reservationId))
    .orderBy(asc(messages.createdAt));
}

export async function markMessagesRead(reservationId: string, readerId: string) {
  const db = await getDb();
  if (!db) return;
  // Mark as read all messages NOT sent by the reader
  await db.update(messages)
    .set({ isRead: true })
    .where(and(
      eq(messages.reservationId, reservationId),
      ne(messages.senderId, readerId),
      eq(messages.isRead, false)
    ));
}

export async function countUnreadMessages(userId: string, role: string) {
  const db = await getDb();
  if (!db) return 0;
  if (role === "admin" || role === "operator") {
    // Count unread messages sent by users (not by admin/operator)
    const result = await db.select({
      id: messages.id,
    })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(
        eq(messages.isRead, false),
        eq(users.role, "user")
      ));
    return result.length;
  } else {
    // Count unread messages on user's reservations sent by staff
    const result = await db.select({
      id: messages.id,
    })
      .from(messages)
      .innerJoin(reservations, eq(messages.reservationId, reservations.id))
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(
        eq(messages.isRead, false),
        eq(reservations.userId, userId),
        ne(users.role, "user")
      ));
    return result.length;
  }
}

export async function getUnreadCountForReservation(reservationId: string, userId: string, role: string) {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [
    eq(messages.reservationId, reservationId),
    eq(messages.isRead, false),
  ];

  if (role === "admin" || role === "operator") {
    // Staff sees unread messages from users
    const result = await db.select({ id: messages.id })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(...conditions, eq(users.role, "user")));
    return result.length;
  } else {
    // Users see unread messages from staff
    const result = await db.select({ id: messages.id })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(and(...conditions, ne(users.role, "user")));
    return result.length;
  }
}

// ─── Seasons ──────────────────────────────────────────────────────────────

export async function createSeason(data: { name: string; startDate: string; endDate: string; workingHours: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [s] = await db.insert(seasons).values(data).returning();
  return s;
}

export async function listSeasons() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seasons).orderBy(asc(seasons.startDate));
}

export async function updateSeason(id: string, data: Partial<{ name: string; startDate: string; endDate: string; workingHours: any; isActive: boolean }>) {
  const db = await getDb();
  if (!db) return;
  await db.update(seasons).set(data).where(eq(seasons.id, id));
}

export async function deleteSeason(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(seasons).where(eq(seasons.id, id));
}

export async function getActiveSeason(dateStr: string) {
  const db = await getDb();
  if (!db) return null;
  const [s] = await db.select().from(seasons)
    .where(and(
      eq(seasons.isActive, true),
      lte(seasons.startDate, dateStr),
      gte(seasons.endDate, dateStr)
    ));
  return s ?? null;
}

// ─── Holidays ─────────────────────────────────────────────────────────────

export async function createHoliday(data: { date: string; name: string; isRecurring?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [h] = await db.insert(holidays).values(data).returning();
  return h;
}

export async function listHolidays() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(holidays).orderBy(asc(holidays.date));
}

export async function deleteHoliday(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(holidays).where(eq(holidays.id, id));
}

export async function isHoliday(dateStr: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Check exact date match
  const [exact] = await db.select().from(holidays).where(eq(holidays.date, dateStr));
  if (exact) return true;
  // Check recurring: match month-day across years
  const md = dateStr.slice(5); // "MM-DD"
  const recurring = await db.select().from(holidays)
    .where(eq(holidays.isRecurring, true));
  return recurring.some(h => h.date.slice(5) === md);
}

export async function seedCroatianHolidays() {
  const db = await getDb();
  if (!db) return;
  const currentYear = new Date().getFullYear();
  const hrHolidays = [
    { date: `${currentYear}-01-01`, name: "Nova godina" },
    { date: `${currentYear}-01-06`, name: "Sveta tri kralja" },
    { date: `${currentYear}-05-01`, name: "Praznik rada" },
    { date: `${currentYear}-05-30`, name: "Dan državnosti" },
    { date: `${currentYear}-06-22`, name: "Dan antifašističke borbe" },
    { date: `${currentYear}-08-05`, name: "Dan pobjede" },
    { date: `${currentYear}-08-15`, name: "Velika Gospa" },
    { date: `${currentYear}-10-08`, name: "Dan neovisnosti" },
    { date: `${currentYear}-11-01`, name: "Svi sveti" },
    { date: `${currentYear}-11-18`, name: "Dan sjećanja na Vukovar" },
    { date: `${currentYear}-12-25`, name: "Božić" },
    { date: `${currentYear}-12-26`, name: "Sveti Stjepan" },
  ];
  for (const h of hrHolidays) {
    // Upsert: skip if already exists for that date
    const existing = await db.select().from(holidays).where(eq(holidays.date, h.date));
    if (existing.length === 0) {
      await db.insert(holidays).values({ ...h, isRecurring: true });
    }
  }
}

// ─── API Keys ─────────────────────────────────────────────────────────────

export async function createApiKey(data: { name: string; key: string; createdBy: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [k] = await db.insert(apiKeys).values(data).returning();
  return k;
}

export async function listApiKeys() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    key: apiKeys.key, // Only returning partial key or full key depending on security, let's return full for now since admin needs to see it once or we just show it. Actually, better return truncated or full. Let's return full.
    isActive: apiKeys.isActive,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, id));
}

export async function validateApiKeyAndUpdateLastUsed(key: string) {
  const db = await getDb();
  if (!db) return false;
  const [k] = await db.select().from(apiKeys).where(and(eq(apiKeys.key, key), eq(apiKeys.isActive, true)));
  if (k) {
    // Fire and forget update
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id)).execute();
    return true;
  }
  return false;
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