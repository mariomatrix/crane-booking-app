import {
    pgTable,
    text,
    timestamp,
    varchar,
    decimal,
    boolean,
    integer,
    pgEnum,
    date,
    jsonb,
    uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "operator", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "pending_verification"]);
export const reservationStatusEnum = pgEnum("reservation_status", [
    "pending",
    "approved",
    "rejected",
    "cancelled",
    "completed",
    "waitlisted",
]);
export const craneStatusEnum = pgEnum("crane_status", ["active", "inactive", "maintenance"]);
export const craneTypeEnum = pgEnum("crane_type", ["travelift", "portalna", "mobilna", "ostalo"]);
export const vesselTypeEnum = pgEnum("vessel_type", ["jedrilica", "motorni", "katamaran", "ostalo"]);
export const waitingListStatusEnum = pgEnum("waiting_list_status", ["waiting", "notified", "accepted", "expired", "cancelled"]);

// ─── Users ───────────────────────────────────────────────────────────
export const users = pgTable("users", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 320 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),        // NULL for OAuth users
    googleId: varchar("google_id", { length: 255 }).unique(),       // Google OAuth ID
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    name: text("name"),                                              // display name (full name)
    phone: varchar("phone", { length: 50 }),
    role: roleEnum("role").default("user").notNull(),
    userStatus: userStatusEnum("user_status").default("active").notNull(),
    emailVerifiedAt: timestamp("email_verified_at"),
    anonymizedAt: timestamp("anonymized_at"),
    loginMethod: varchar("login_method", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

// ─── Service Types (tip operacije) ───────────────────────────────────
export const serviceTypes = pgTable("service_types", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    defaultDurationMin: integer("default_duration_min").default(60).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Cranes ───────────────────────────────────────────────────────────
export const cranes = pgTable("cranes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    type: craneTypeEnum("type").default("travelift").notNull(),
    maxCapacityKg: integer("max_capacity_kg").notNull(),
    maxPoolWidth: decimal("max_pool_width", { precision: 6, scale: 2 }),
    location: varchar("location", { length: 255 }),
    craneStatus: craneStatusEnum("crane_status").default("active").notNull(),
    description: text("description"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Vessels ──────────────────────────────────────────────────────────
export const vessels = pgTable("vessels", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    type: vesselTypeEnum("type").notNull(),
    lengthM: decimal("length_m", { precision: 7, scale: 2 }),
    beamM: decimal("beam_m", { precision: 6, scale: 2 }),
    draftM: decimal("draft_m", { precision: 5, scale: 2 }),
    weightKg: integer("weight_kg"),
    registration: varchar("registration", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Reservations (zahtjevi za operacije) ─────────────────────────────
export const reservations = pgTable("reservations", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reservationNumber: varchar("reservation_number", { length: 20 }).unique(),
    userId: uuid("user_id").notNull().references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    serviceTypeId: uuid("service_type_id").references(() => serviceTypes.id),
    craneId: uuid("crane_id").references(() => cranes.id), // NULL until approved

    // User request info
    requestedDate: date("requested_date"),
    requestedTimeSlot: varchar("requested_time_slot", { length: 50 }), // jutro/poslijepodne/po dogovoru

    // Confirmed schedule (set by operator on approval)
    scheduledStart: timestamp("scheduled_start"),
    scheduledEnd: timestamp("scheduled_end"),
    durationMin: integer("duration_min").default(60).notNull(),

    // Status
    status: reservationStatusEnum("status").default("pending").notNull(),

    // Vessel snapshot (for safety reference, even if vessel profile changes)
    vesselName: varchar("vessel_name", { length: 255 }),
    vesselType: vesselTypeEnum("vessel_type"),
    vesselLengthM: decimal("vessel_length_m", { precision: 7, scale: 2 }),
    vesselBeamM: decimal("vessel_beam_m", { precision: 6, scale: 2 }),
    vesselDraftM: decimal("vessel_draft_m", { precision: 5, scale: 2 }),
    vesselWeightKg: integer("vessel_weight_kg"),

    // Notes
    userNote: text("user_note"),
    adminNote: text("admin_note"),       // internal, not shown to user
    rejectionReason: text("rejection_reason"),
    cancelReason: text("cancel_reason"),
    cancelledByType: varchar("cancelled_by_type", { length: 20 }), // 'user' | 'admin'

    // Admin actions
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    completedAt: timestamp("completed_at"),

    // Legacy / compat fields
    isMaintenance: boolean("is_maintenance").default(false).notNull(),
    reminderSent: boolean("reminder_sent").default(false).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }),
    liftPurpose: text("lift_purpose"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Waiting List ──────────────────────────────────────────────────────
export const waitingList = pgTable("waiting_list", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    serviceTypeId: uuid("service_type_id").references(() => serviceTypes.id),
    craneId: uuid("crane_id").references(() => cranes.id), // optional preference
    requestedDate: date("requested_date").notNull(),
    position: integer("position").default(0).notNull(),
    status: waitingListStatusEnum("status").default("waiting").notNull(),
    vesselData: jsonb("vessel_data"),
    notified: boolean("notified").default(false).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Messages (dvosmjerna komunikacija) ───────────────────────────────
export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reservationId: uuid("reservation_id").notNull().references(() => reservations.id),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Seasons (sezonski rasporedi) ─────────────────────────────────────
export const seasons = pgTable("seasons", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    workingHours: jsonb("working_hours").notNull(), // { mon: {from: "08:00", to: "17:00"}, ... }
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Holidays (praznici i neradni dani) ───────────────────────────────
export const holidays = pgTable("holidays", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    date: date("date").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isRecurring: boolean("is_recurring").default(true).notNull(), // yearly recurring
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Maintenance Blocks (blokada dizalice) ────────────────────────────
export const maintenanceBlocks = pgTable("maintenance_blocks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    craneId: uuid("crane_id").notNull().references(() => cranes.id),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── System Settings ──────────────────────────────────────────────────
export const settings = pgTable("settings", {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Audit Log ────────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid("actor_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Password Resets ──────────────────────────────────────────────────
export const passwordResets = pgTable("password_resets", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Email Verification Tokens ────────────────────────────────────────
export const emailVerificationTokens = pgTable("email_verification_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Types ────────────────────────────────────────────────────────────
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type User = SelectUser;

export type InsertServiceType = typeof serviceTypes.$inferInsert;
export type SelectServiceType = typeof serviceTypes.$inferSelect;
export type ServiceType = SelectServiceType;

export type InsertCrane = typeof cranes.$inferInsert;
export type SelectCrane = typeof cranes.$inferSelect;
export type Crane = SelectCrane;

export type InsertVessel = typeof vessels.$inferInsert;
export type SelectVessel = typeof vessels.$inferSelect;
export type Vessel = SelectVessel;

export type InsertReservation = typeof reservations.$inferInsert;
export type SelectReservation = typeof reservations.$inferSelect;
export type Reservation = SelectReservation;

export type InsertWaitingList = typeof waitingList.$inferInsert;
export type SelectWaitingList = typeof waitingList.$inferSelect;

export type InsertMessage = typeof messages.$inferInsert;
export type SelectMessage = typeof messages.$inferSelect;
export type Message = SelectMessage;

export type InsertMaintenanceBlock = typeof maintenanceBlocks.$inferInsert;
export type SelectMaintenanceBlock = typeof maintenanceBlocks.$inferSelect;

export type InsertAuditLog = typeof auditLog.$inferInsert;
export type SelectAuditLog = typeof auditLog.$inferSelect;

export type InsertPasswordReset = typeof passwordResets.$inferInsert;
export type SelectPasswordReset = typeof passwordResets.$inferSelect;
