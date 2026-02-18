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
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const craneTypeEnum = pgEnum("crane_type", ["tower", "mobile", "crawler", "overhead", "telescopic", "loader", "other"]);
export const statusEnum = pgEnum("status", ["pending", "approved", "rejected", "cancelled"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  organization: varchar("organization", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const cranes = pgTable("cranes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: craneTypeEnum("type").notNull(),
  capacity: decimal("capacity", { precision: 10, scale: 2 }).notNull(),
  capacityUnit: varchar("capacityUnit", { length: 20 }).default("tons").notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  location: varchar("location", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  minDuration: integer("minDuration").default(1),
  maxDuration: integer("maxDuration"),
  dailyRate: decimal("dailyRate", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  craneId: integer("craneId").notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: statusEnum("status").default("pending").notNull(),
  projectLocation: varchar("projectLocation", { length: 500 }),
  projectDescription: text("projectDescription"),
  notes: text("notes"),
  adminNotes: text("adminNotes"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  entityId: integer("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InsertUser = typeof users.$inferInsert;
export type InsertCrane = typeof cranes.$inferInsert;
export type InsertReservation = typeof reservations.$inferInsert;
export type InsertAuditLog = typeof auditLog.$inferInsert;