
import {
    pgTable,
    serial,
    text,
    timestamp,
    varchar,
    decimal,
    boolean,
    integer,
    pgEnum,
    date,
    jsonb,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["pending", "approved", "rejected", "cancelled"]);
export const vesselTypeEnum = pgEnum("vessel_type", ["sailboat", "motorboat", "catamaran"]);

// ─── Users ───────────────────────────────────────────────────────────
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).unique(),          // OAuth users
    passwordHash: varchar("passwordHash", { length: 255 }),      // email/password users
    firstName: varchar("firstName", { length: 100 }),
    lastName: varchar("lastName", { length: 100 }),
    name: text("name"),                                          // display name (kept for compat)
    email: varchar("email", { length: 320 }).unique(),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: roleEnum("role").default("user").notNull(),
    phone: varchar("phone", { length: 50 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Cranes (Marina lift equipment) ──────────────────────────────────
export const cranes = pgTable("cranes", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),           // e.g. "Dizalica A - Travel Lift 50t"
    capacity: decimal("capacity", { precision: 10, scale: 2 }).notNull(), // max weight in tonnes
    maxPoolWidth: decimal("maxPoolWidth", { precision: 6, scale: 2 }),    // max basin width in metres
    description: text("description"),
    location: varchar("location", { length: 255 }),             // basin / berth identifier
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Reservations ─────────────────────────────────────────────────────
export const reservations = pgTable("reservations", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    craneId: integer("craneId").notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    status: statusEnum("status").default("pending").notNull(),

    // Vessel info (required for safety validation)
    vesselType: vesselTypeEnum("vesselType"),
    vesselLength: decimal("vesselLength", { precision: 7, scale: 2 }),  // metres
    vesselWidth: decimal("vesselWidth", { precision: 6, scale: 2 }),    // metres
    vesselDraft: decimal("vesselDraft", { precision: 5, scale: 2 }),    // metres
    vesselWeight: decimal("vesselWeight", { precision: 8, scale: 2 }),  // tonnes
    vesselName: varchar("vesselName", { length: 255 }),

    // Operational
    liftPurpose: text("liftPurpose"),                           // reason for lift
    contactPhone: varchar("contactPhone", { length: 50 }),      // operative crew contact

    // Admin
    adminNotes: text("adminNotes"),
    reviewedBy: integer("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Waiting List ────────────────────────────────────────────────────
export const waitingList = pgTable("waiting_list", {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    craneId: integer("craneId").notNull(),
    requestedDate: date("requestedDate").notNull(),
    slotCount: integer("slotCount").default(1).notNull(),        // number of 60-min slots requested
    vesselData: jsonb("vesselData"),                             // snapshot of vessel info
    notified: boolean("notified").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── System Settings (admin-configurable) ────────────────────────────
export const settings = pgTable("settings", {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ─── Audit Log ───────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
    id: serial("id").primaryKey(),
    userId: integer("userId"),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entityType", { length: 50 }).notNull(),
    entityId: integer("entityId"),
    details: text("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Types ───────────────────────────────────────────────────────────
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type User = SelectUser;   // backward-compat alias
export type InsertCrane = typeof cranes.$inferInsert;
export type SelectCrane = typeof cranes.$inferSelect;
export type Crane = SelectCrane;
export type InsertReservation = typeof reservations.$inferInsert;
export type SelectReservation = typeof reservations.$inferSelect;
export type Reservation = SelectReservation;
export type InsertWaitingList = typeof waitingList.$inferInsert;
export type SelectWaitingList = typeof waitingList.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;
