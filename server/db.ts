import { eq, and, gte, lte, desc, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  cranes,
  reservations,
  auditLog,
  type InsertCrane,
  type InsertReservation,
  type InsertAuditLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User Queries ────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Crane Queries ───────────────────────────────────────────────────

export async function listCranes(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(cranes).where(eq(cranes.isActive, true)).orderBy(cranes.name);
  }
  return db.select().from(cranes).orderBy(cranes.name);
}

export async function getCraneById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cranes).where(eq(cranes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCrane(data: InsertCrane) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cranes).values(data);
  return result[0].insertId;
}

export async function updateCrane(id: number, data: Partial<InsertCrane>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cranes).set(data).where(eq(cranes.id, id));
}

export async function deleteCrane(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cranes).set({ isActive: false }).where(eq(cranes.id, id));
}

// ─── Reservation Queries ─────────────────────────────────────────────

export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reservations).values(data);
  return result[0].insertId;
}

export async function getReservationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listReservationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reservations)
    .where(eq(reservations.userId, userId))
    .orderBy(desc(reservations.createdAt));
}

export async function listAllReservations(statusFilter?: string) {
  const db = await getDb();
  if (!db) return [];
  if (statusFilter) {
    return db
      .select()
      .from(reservations)
      .where(eq(reservations.status, statusFilter as "pending" | "approved" | "rejected" | "cancelled"))
      .orderBy(desc(reservations.createdAt));
  }
  return db.select().from(reservations).orderBy(desc(reservations.createdAt));
}

export async function updateReservationStatus(
  id: number,
  status: "approved" | "rejected" | "cancelled",
  reviewedBy: number,
  adminNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(reservations)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
      adminNotes: adminNotes ?? null,
    })
    .where(eq(reservations.id, id));
}

export async function getApprovedReservationsForCalendar(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(reservations.status, "approved")];
  if (startDate) conditions.push(gte(reservations.endDate, startDate));
  if (endDate) conditions.push(lte(reservations.startDate, endDate));
  return db
    .select()
    .from(reservations)
    .where(and(...conditions))
    .orderBy(reservations.startDate);
}

export async function checkOverlap(craneId: number, startDate: Date, endDate: Date, excludeId?: number) {
  const db = await getDb();
  if (!db) return false;
  const conditions = [
    eq(reservations.craneId, craneId),
    or(eq(reservations.status, "approved"), eq(reservations.status, "pending")),
    lte(reservations.startDate, endDate),
    gte(reservations.endDate, startDate),
  ];
  if (excludeId) {
    conditions.push(sql`${reservations.id} != ${excludeId}`);
  }
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(and(...conditions));
  return (result[0]?.count ?? 0) > 0;
}

// ─── Audit Log Queries ───────────────────────────────────────────────

export async function createAuditEntry(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(data);
}

export async function listAuditLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
