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
    index,
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
export const operationCategoryEnum = pgEnum("operation_category", [
    "lift_from_sea",   // Dizanje iz mora → brod ide na kopno
    "lower_to_sea",    // Spuštanje u more → brod napušta kopno
    "move",            // Premještanje
    "maintenance",     // Tehničko održavanje
    "other",           // Ostale operacije
]);
export const invoiceTypeEnum = pgEnum("invoice_type", [
    "crane_operation",
    "annual_berth_fee",
    "transit_berth",
    "membership_fee",
    "other",
]);
export const documentTypeEnum = pgEnum("document_type", [
    "invoice",
    "proforma",
]);
export const invoicePaymentMethodEnum = pgEnum("invoice_payment_method", [
    "bank_transfer",
    "cash",
    "card",
    "compensation",
]);
export const invoicePaymentStatusEnum = pgEnum("invoice_payment_status", [
    "unpaid",
    "partially_paid",
    "paid",
    "cancelled",
]);

// ─── Users ───────────────────────────────────────────────────────────
export const users = pgTable("users", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 320 }).unique(),             // nullable: synced members may not have email
    passwordHash: varchar("password_hash", { length: 255 }),        // NULL for OAuth users
    googleId: varchar("google_id", { length: 255 }).unique(),       // Google OAuth ID
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    name: text("name"),                                              // display name (full name)
    phone: varchar("phone", { length: 50 }),
    oib: varchar("oib", { length: 11 }).unique(),                    // Osobni identifikacijski broj (HR)
    jmbgHash: varchar("jmbg_hash", { length: 64 }),                   // SHA-256 hash JMBG-a (nikad se ne prikazuje)
    isLegalEntity: boolean("is_legal_entity").default(false).notNull(),
    companyName: varchar("company_name", { length: 255 }),
    contactPerson: varchar("contact_person", { length: 255 }),
    address: text("address"),
    city: varchar("city", { length: 100 }).default("Split").notNull(),
    postalCode: varchar("postal_code", { length: 20 }).default("21000").notNull(),
    role: roleEnum("role").default("user").notNull(),
    userStatus: userStatusEnum("user_status").default("active").notNull(),
    emailVerifiedAt: timestamp("email_verified_at"),
    anonymizedAt: timestamp("anonymized_at"),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    loginMethod: varchar("login_method", { length: 64 }),
    pinCode: varchar("pin_code", { length: 10 }),                     // 4-digit PIN for mobile app login
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
}, (table) => {
    return {
        roleIdx: index("users_role_idx").on(table.role),
        statusIdx: index("users_status_idx").on(table.userStatus),
        createdAtIdx: index("users_created_at_idx").on(table.createdAt),
        emailVerifiedAtIdx: index("users_email_verified_at_idx").on(table.emailVerifiedAt),
        anonymizedAtIdx: index("users_anonymized_at_idx").on(table.anonymizedAt),
        pinCodeStatusIdx: index("users_pin_code_status_idx").on(table.pinCode, table.userStatus),
    };
});

// ─── Service Types (tip operacije) ───────────────────────────────────
export const serviceTypes = pgTable("service_types", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    defaultDurationMin: integer("default_duration_min").default(60).notNull(),
    operationCategory: operationCategoryEnum("operation_category").default("other").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        isActiveIdx: index("service_types_is_active_idx").on(table.isActive),
        operationCategoryIdx: index("service_types_operation_category_idx").on(table.operationCategory),
        sortOrderIdx: index("service_types_sort_order_idx").on(table.sortOrder),
    };
});

// ─── Cranes ───────────────────────────────────────────────────────────
export const cranes = pgTable("cranes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    type: craneTypeEnum("type").default("travelift").notNull(),
    maxCapacityKN: integer("max_capacity_kn").notNull(),
    maxPoolWidth: decimal("max_pool_width", { precision: 6, scale: 2 }),
    location: varchar("location", { length: 255 }),
    craneStatus: craneStatusEnum("crane_status").default("active").notNull(),
    description: text("description"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        craneStatusIdx: index("cranes_status_idx").on(table.craneStatus),
    };
});

// ─── Operator Cranes (dodjela dizalica operaterima) ────────────────────
export const operatorCranes = pgTable("operator_cranes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    craneId: uuid("crane_id").notNull().references(() => cranes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("operator_cranes_user_id_idx").on(table.userId),
        craneIdIdx: index("operator_cranes_crane_id_idx").on(table.craneId),
    };
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
    weightTons: decimal("weight_tons", { precision: 8, scale: 2 }),
    registration: varchar("registration", { length: 100 }).unique(),  // globalno jedinstvena registracija plovila
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        ownerIdIdx: index("vessels_owner_id_idx").on(table.ownerId),
        registrationIdx: index("vessels_registration_idx").on(table.registration),
        createdAtIdx: index("vessels_created_at_idx").on(table.createdAt),
    };
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
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
    durationMin: integer("duration_min").default(60).notNull(),

    // Status
    status: reservationStatusEnum("status").default("pending").notNull(),

    // User snapshot (for historical accuracy)
    userOib: varchar("user_oib", { length: 11 }),                   // OIB snapshot at time of reservation

    // Vessel snapshot (for safety reference, even if vessel profile changes)
    vesselName: varchar("vessel_name", { length: 255 }),
    vesselType: vesselTypeEnum("vessel_type"),
    vesselLengthM: decimal("vessel_length_m", { precision: 7, scale: 2 }),
    vesselBeamM: decimal("vessel_beam_m", { precision: 6, scale: 2 }),
    vesselDraftM: decimal("vessel_draft_m", { precision: 5, scale: 2 }),
    vesselWeightTons: decimal("vessel_weight_tons", { precision: 8, scale: 2 }),
    vesselRegistration: varchar("vessel_registration", { length: 100 }),

    // Notes
    userNote: text("user_note"),
    adminNote: text("admin_note"),       // internal, not shown to user
    rejectionReason: text("rejection_reason"),
    cancelReason: text("cancel_reason"),
    cancelledByType: varchar("cancelled_by_type", { length: 20 }), // 'user' | 'admin'

    // Land zone (Kopno) — zona na kopnu za operacije Dizanje/Spuštanje
    landZoneId: uuid("land_zone_id"),  // forward-ref resolved at runtime

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
}, (table) => {
    return {
        scheduledStartIdx: index("res_scheduled_start_idx").on(table.scheduledStart),
        scheduledEndIdx: index("res_scheduled_end_idx").on(table.scheduledEnd),
        statusIdx: index("res_status_idx").on(table.status),
        userIdIdx: index("res_user_id_idx").on(table.userId),
        craneIdIdx: index("res_crane_id_idx").on(table.craneId),
        requestedDateIdx: index("res_requested_date_idx").on(table.requestedDate),
        isMaintenanceIdx: index("res_is_maintenance_idx").on(table.isMaintenance),
        landZoneIdIdx: index("res_land_zone_id_idx").on(table.landZoneId),
        vesselIdIdx: index("res_vessel_id_idx").on(table.vesselId),
        serviceTypeIdIdx: index("res_service_type_id_idx").on(table.serviceTypeId),
        approvedByIdx: index("res_approved_by_idx").on(table.approvedBy),
        overlapCheckIdx: index("res_overlap_check_idx").on(table.craneId, table.status, table.scheduledStart, table.scheduledEnd),
    };
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
}, (table) => {
    return {
        userIdIdx: index("waiting_list_user_id_idx").on(table.userId),
        craneIdIdx: index("waiting_list_crane_id_idx").on(table.craneId),
        statusIdx: index("waiting_list_status_idx").on(table.status),
    };
});

// ─── Messages (dvosmjerna komunikacija) ───────────────────────────────
export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reservationId: uuid("reservation_id").notNull().references(() => reservations.id),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        reservationIdIdx: index("messages_reservation_id_idx").on(table.reservationId),
        senderIdIdx: index("messages_sender_id_idx").on(table.senderId),
        resIsReadIdx: index("messages_res_is_read_idx").on(table.reservationId, table.isRead),
        isReadIdx: index("messages_is_read_idx").on(table.isRead),
    };
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
}, (table) => {
    return {
        activeDatesIdx: index("seasons_active_dates_idx").on(table.isActive, table.startDate, table.endDate),
    };
});

// ─── Holidays (praznici i neradni dani) ───────────────────────────────
export const holidays = pgTable("holidays", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    date: date("date").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isRecurring: boolean("is_recurring").default(true).notNull(), // yearly recurring
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        dateIdx: index("holidays_date_idx").on(table.date),
        isRecurringIdx: index("holidays_is_recurring_idx").on(table.isRecurring),
    };
});

// ─── Maintenance Blocks (blokada dizalice) ────────────────────────────
export const maintenanceBlocks = pgTable("maintenance_blocks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    craneId: uuid("crane_id").notNull().references(() => cranes.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        craneStartIdx: index("maint_blocks_crane_start_idx").on(table.craneId, table.startAt),
    };
});

// ─── System Settings ──────────────────────────────────────────────────
export const settings = pgTable("settings", {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── API Keys (REST API integracija) ──────────────────────────────────
export const apiKeys = pgTable("api_keys", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    isActive: boolean("is_active").default(true).notNull(),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
}, (table) => {
    return {
        actorIdIdx: index("audit_log_actor_id_idx").on(table.actorId),
        createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
    };
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
export type OperationCategory = typeof operationCategoryEnum.enumValues[number];

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

// ─── Dry Berths (Mjesta na kopnu) ───────────────────────────────────────
export const landZoneStatusEnum = pgEnum("land_zone_status", ["active", "inactive"]);

export const landZones = pgTable("land_zones", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 10 }).unique().notNull(),
    totalSpots: integer("total_spots").notNull(),
    manualOccupiedSpots: integer("manual_occupied_spots").default(0).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const landOccupancies = pgTable("land_occupancies", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    vesselId: uuid("vessel_id").notNull().references(() => vessels.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    zoneId: uuid("zone_id").notNull().references(() => landZones.id),
    spotNumber: integer("spot_number"),              // opcijski: konkretno mjesto 1–N
    reservationId: uuid("reservation_id").references(() => reservations.id),  // vađenje
    returnReservationId: uuid("return_reservation_id").references(() => reservations.id),  // spuštanje
    liftedAt: timestamp("lifted_at").notNull(),      // kad je brod podignut na kopno
    returnedAt: timestamp("returned_at"),             // kad je brod vraćen u more (NULL = još na kopnu)
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        vesselIdIdx: index("land_occ_vessel_id_idx").on(table.vesselId),
        userIdIdx: index("land_occ_user_id_idx").on(table.userId),
        zoneIdIdx: index("land_occ_zone_id_idx").on(table.zoneId),
        returnedAtIdx: index("land_occ_returned_at_idx").on(table.returnedAt),
        liftedAtIdx: index("land_occ_lifted_at_idx").on(table.liftedAt),
        zoneReturnedIdx: index("land_occ_zone_returned_idx").on(table.zoneId, table.returnedAt),
        vesselReturnedIdx: index("land_occ_vessel_returned_idx").on(table.vesselId, table.returnedAt),
    };
});

export const landWaitingStatusEnum = pgEnum("land_waiting_status", [
    "waiting",    // čeka slobodno mjesto
    "offered",    // ponuđeno mjesto, čeka odgovor korisnika
    "assigned",   // mjesto dodijeljeno
    "declined",   // korisnik odbio ponudu (ali ostaje na listi)
    "cancelled",  // obrisan s liste
]);

export const landWaitingList = pgTable("land_waiting_list", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    preferredZoneId: uuid("preferred_zone_id").references(() => landZones.id),
    position: integer("position").default(0).notNull(),
    status: landWaitingStatusEnum("status").default("waiting").notNull(),
    note: text("note"),             // napomena korisnika
    adminNote: text("admin_note"),  // interna napomena operatera
    assignedOccupancyId: uuid("assigned_occupancy_id").references(() => landOccupancies.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    offeredAt: timestamp("offered_at"),       // kad je ponuda poslana
    declinedAt: timestamp("declined_at"),     // kad je korisnik odbio
    declineCount: integer("decline_count").default(0).notNull(),  // koliko puta je odbio
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("land_wl_user_id_idx").on(table.userId),
        vesselIdIdx: index("land_wl_vessel_id_idx").on(table.vesselId),
        preferredZoneIdIdx: index("land_wl_preferred_zone_idx").on(table.preferredZoneId),
        statusIdx: index("land_wl_status_idx").on(table.status),
        positionIdx: index("land_wl_position_idx").on(table.position),
        zoneStatusIdx: index("land_wl_zone_status_idx").on(table.preferredZoneId, table.status),
    };
});

export const craneOperationLog = pgTable("crane_operation_log", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    craneId: uuid("crane_id").notNull().references(() => cranes.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    operationType: varchar("operation_type", { length: 50 }).notNull(), // 'lift' | 'lower' | 'move' | 'maintenance'
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    operatorId: uuid("operator_id").references(() => users.id),    // tko je upravljao
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        craneIdIdx: index("crane_op_log_crane_id_idx").on(table.craneId),
        operatorIdIdx: index("crane_op_log_operator_id_idx").on(table.operatorId),
        startTimeIdx: index("crane_op_log_start_time_idx").on(table.startTime),
        reservationIdIdx: index("crane_op_log_reservation_id_idx").on(table.reservationId),
    };
});

export const workOrderStatusEnum = pgEnum("work_order_status", ["in_progress", "completed", "cancelled"]);
export const workOrderClientTypeEnum = pgEnum("work_order_client_type", ["member", "external"]);
export const cardEntryTypeEnum = pgEnum("card_entry_type", ["statutory_quota_used", "fee_adjustment_charge", "commercial_service"]);
export const pricelistTargetTypeEnum = pgEnum("pricelist_target_type", ["member_adjustment", "external_commercial"]);

// ─── Price List Items (Cjenik po metrima & šifrarnik zaduženja) ────────
export const priceListItems = pgTable("price_list_items", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 50 }).notNull().unique(), // npr. 'USL-D9T', 'USL-TR50', 'USL-VANJSKI-M'
    name: varchar("name", { length: 255 }).notNull(),
    targetType: pricelistTargetTypeEnum("target_type").default("external_commercial").notNull(),
    minLengthM: decimal("min_length_m", { precision: 5, scale: 2 }),
    maxLengthM: decimal("max_length_m", { precision: 5, scale: 2 }),
    pricePerMeterEur: decimal("price_per_meter_eur", { precision: 8, scale: 2 }),
    fixedPriceEur: decimal("fixed_price_eur", { precision: 8, scale: 2 }),
    vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("25.00").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Member Statutory Rights (1 vađenje + 1 spuštanje s rokom 2 god) ───
export const memberStatutoryRights = pgTable("member_statutory_rights", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    liftAvailable: boolean("lift_available").default(true).notNull(),
    liftAcquiredYear: integer("lift_acquired_year").notNull(),
    liftExpiresAt: date("lift_expires_at").notNull(), // 31.12. N+1
    lowerAvailable: boolean("lower_available").default(true).notNull(),
    lowerAcquiredYear: integer("lower_acquired_year").notNull(),
    lowerExpiresAt: date("lower_expires_at").notNull(), // 31.12. N+1
    pendingFeeAdjustmentsCount: integer("pending_fee_adjustments_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Work Orders (Radni nalozi: aktivacija i zaključenje) ──────────────
export const workOrders = pgTable("work_orders", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orderNumber: varchar("order_number", { length: 30 }).notNull().unique(), // RN-2026-00042
    reservationId: uuid("reservation_id").references(() => reservations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    craneId: uuid("crane_id").notNull().references(() => cranes.id),
    operatorId: uuid("operator_id").references(() => users.id),
    status: workOrderStatusEnum("status").default("in_progress").notNull(),
    clientType: workOrderClientTypeEnum("client_type").default("member").notNull(),
    isStatutoryCovered: boolean("is_statutory_covered").default(false).notNull(),
    quotaOperationType: varchar("quota_operation_type", { length: 20 }), // 'lift' | 'lower' | 'none'
    chargeItemCode: varchar("charge_item_code", { length: 50 }), // šifra stavke za doplatu članarine
    chargeItemName: varchar("charge_item_name", { length: 255 }),
    vesselLengthM: decimal("vessel_length_m", { precision: 7, scale: 2 }),
    commercialPricePerMeter: decimal("commercial_price_per_meter", { precision: 8, scale: 2 }),
    commercialTotal: decimal("commercial_total", { precision: 10, scale: 2 }),
    vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("25.00"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    actualDurationMin: integer("actual_duration_min"),
    operatorNotes: text("operator_notes"),
    erpSyncStatus: varchar("erp_sync_status", { length: 30 }).default("pending").notNull(), // 'pending' | 'synced'
    erpDocumentId: varchar("erp_document_id", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        orderNumberIdx: index("work_orders_order_number_idx").on(table.orderNumber),
        userIdIdx: index("work_orders_user_id_idx").on(table.userId),
        craneIdIdx: index("work_orders_crane_id_idx").on(table.craneId),
        statusIdx: index("work_orders_status_idx").on(table.status),
        startedAtIdx: index("work_orders_started_at_idx").on(table.startedAt),
        reservationIdIdx: index("work_orders_reservation_id_idx").on(table.reservationId),
        vesselIdIdx: index("work_orders_vessel_id_idx").on(table.vesselId),
    };
});

// ─── User Card Entries (Univerzalni Karton: Članovi & Vanjski) ─────────
export const userCardEntries = pgTable("user_card_entries", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    entryType: cardEntryTypeEnum("entry_type").notNull(),
    serviceItemCode: varchar("service_item_code", { length: 50 }),
    serviceItemName: varchar("service_item_name", { length: 255 }).notNull(),
    vesselName: varchar("vessel_name", { length: 255 }),
    vesselRegistration: varchar("vessel_registration", { length: 100 }),
    eventDate: timestamp("event_date").defaultNow().notNull(),
    note: text("note"),
    erpStatus: varchar("erp_status", { length: 50 }).default("pending").notNull(), // 'pending' | 'processed_in_membership_renewal' | 'invoiced'
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        userCardUserIdIdx: index("user_card_user_id_idx").on(table.userId),
        userCardEventDateIdx: index("user_card_event_date_idx").on(table.eventDate),
        entryTypeEventDateIdx: index("user_card_entry_type_event_date_idx").on(table.entryType, table.eventDate),
    };
});

export type InsertLandZone = typeof landZones.$inferInsert;
export type SelectLandZone = typeof landZones.$inferSelect;
export type LandZone = SelectLandZone;

export type InsertLandOccupancy = typeof landOccupancies.$inferInsert;
export type SelectLandOccupancy = typeof landOccupancies.$inferSelect;
export type LandOccupancy = SelectLandOccupancy;

export type InsertLandWaitingList = typeof landWaitingList.$inferInsert;
export type SelectLandWaitingList = typeof landWaitingList.$inferSelect;
export type LandWaitingList = SelectLandWaitingList;

export type InsertCraneOperationLog = typeof craneOperationLog.$inferInsert;
export type SelectCraneOperationLog = typeof craneOperationLog.$inferSelect;
export type CraneOperationLog = SelectCraneOperationLog;

export type InsertWorkOrder = typeof workOrders.$inferInsert;
export type SelectWorkOrder = typeof workOrders.$inferSelect;
export type WorkOrder = SelectWorkOrder;

export type InsertPriceListItem = typeof priceListItems.$inferInsert;
export type SelectPriceListItem = typeof priceListItems.$inferSelect;
export type PriceListItem = SelectPriceListItem;

export type InsertMemberStatutoryRights = typeof memberStatutoryRights.$inferInsert;
export type SelectMemberStatutoryRights = typeof memberStatutoryRights.$inferSelect;
export type MemberStatutoryRights = SelectMemberStatutoryRights;

export type InsertUserCardEntry = typeof userCardEntries.$inferInsert;
export type SelectUserCardEntry = typeof userCardEntries.$inferSelect;
export type UserCardEntry = SelectUserCardEntry;

// ─── Member Links (Legacy MAT_BROJ → UUID mapiranje) ───────────────────
export const memberLinks = pgTable("member_links", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    legacyMatBroj: varchar("legacy_mat_broj", { length: 10 }).notNull().unique(),
    legacyOib: varchar("legacy_oib", { length: 11 }),
    legacyJmbg: varchar("legacy_jmbg", { length: 13 }),
    legacyRawData: jsonb("legacy_raw_data"),              // kompletni CLAN03 red za reviziju
    isPrimary: boolean("is_primary").default(false).notNull(),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("member_links_user_id_idx").on(table.userId),
        legacyOibIdx: index("member_links_legacy_oib_idx").on(table.legacyOib),
    };
});

// ─── Member Memberships (Članstvo u klubovima + aktivni status) ─────────
export const memberMemberships = pgTable("member_memberships", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id),
    legacyMatBroj: varchar("legacy_mat_broj", { length: 10 }).notNull(),
    vrstaC: varchar("vrsta_c", { length: 1 }),              // VRSTA_C iz CLAN03 ('U', 'B', ...)
    clan: varchar("clan", { length: 1 }),                    // CLAN flag
    klub: varchar("klub", { length: 3 }),                    // primarni klub
    klub2: varchar("klub2", { length: 3 }),                  // sekundarni klub
    klub3: varchar("klub3", { length: 3 }),                  // tercijarni (za buduću upotrebu)
    activeMember: boolean("active_member").default(true).notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("memberships_user_id_idx").on(table.userId),
        matBrojIdx: index("memberships_mat_broj_idx").on(table.legacyMatBroj),
        activeMemberIdx: index("memberships_active_member_idx").on(table.activeMember),
        klubIdx: index("memberships_klub_idx").on(table.klub),
    };
});

// ─── Sync Runs (Audit trail sinkronizacija) ─────────────────────────────
export const syncRunStatusEnum = pgEnum("sync_run_status", [
    "running", "completed", "failed", "partial"
]);

export const syncRuns = pgTable("sync_runs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    status: syncRunStatusEnum("status").default("running").notNull(),
    sourceRowsTotal: integer("source_rows_total"),
    membersCreated: integer("members_created").default(0).notNull(),
    membersUpdated: integer("members_updated").default(0).notNull(),
    membersSkipped: integer("members_skipped").default(0).notNull(),
    membersDeactivated: integer("members_deactivated").default(0).notNull(),
    vesselsCreated: integer("vessels_created").default(0).notNull(),
    vesselsUpdated: integer("vessels_updated").default(0).notNull(),
    vesselsSkipped: integer("vessels_skipped").default(0).notNull(),
    linksCreated: integer("links_created").default(0).notNull(),
    membershipsCreated: integer("memberships_created").default(0).notNull(),
    membershipsUpdated: integer("memberships_updated").default(0).notNull(),
    conflictsDetected: integer("conflicts_detected").default(0).notNull(),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),
    triggeredBy: varchar("triggered_by", { length: 30 }).default("cron").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Sync Conflicts (Konfliktni zapisi za ručno rješavanje) ──────────────
export const syncConflictStatusEnum = pgEnum("sync_conflict_status", [
    "pending", "resolved", "ignored"
]);

export const syncConflictTypeEnum = pgEnum("sync_conflict_type", [
    "duplicate_oib",
    "duplicate_name",
    "oib_mismatch",
    "vessel_owner_conflict",
    "ambiguous_match",
]);

export const syncConflicts = pgTable("sync_conflicts", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    syncRunId: uuid("sync_run_id").notNull().references(() => syncRuns.id),
    conflictType: syncConflictTypeEnum("conflict_type").notNull(),
    status: syncConflictStatusEnum("status").default("pending").notNull(),
    legacyMatBroj: varchar("legacy_mat_broj", { length: 10 }),
    legacyData: jsonb("legacy_data").notNull(),
    matchedUserIds: jsonb("matched_user_ids"),           // UUID[] korisnika koji su matchali
    description: text("description").notNull(),           // ljudski čitljiv opis
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        syncRunIdIdx: index("sync_conflicts_sync_run_id_idx").on(table.syncRunId),
        statusIdx: index("sync_conflicts_status_idx").on(table.status),
        conflictTypeIdx: index("sync_conflicts_type_idx").on(table.conflictType),
    };
});

// ─── Member Sync Types ──────────────────────────────────────────────────
export type InsertMemberLink = typeof memberLinks.$inferInsert;
export type SelectMemberLink = typeof memberLinks.$inferSelect;
export type MemberLink = SelectMemberLink;

export type InsertMemberMembership = typeof memberMemberships.$inferInsert;
export type SelectMemberMembership = typeof memberMemberships.$inferSelect;
export type MemberMembership = SelectMemberMembership;

export type InsertSyncRun = typeof syncRuns.$inferInsert;
export type SelectSyncRun = typeof syncRuns.$inferSelect;
export type SyncRun = SelectSyncRun;

export type InsertSyncConflict = typeof syncConflicts.$inferInsert;
export type SelectSyncConflict = typeof syncConflicts.$inferSelect;
export type SyncConflict = SelectSyncConflict;

// ─── Clubs (Matični klubovi: Jedriličarski, Ronilački, Ribolovni) ────────
export const clubs = pgTable("clubs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 20 }).unique().notNull(), // 'JK', 'RK', 'KSR'
    name: varchar("name", { length: 255 }).notNull(), // 'Jedriličarski klub Špinut', 'Ronilački klub Špinut', 'Klub športskog ribolova Špinut'
    shortName: varchar("short_name", { length: 50 }),
    description: text("description"),
    annualFee: decimal("annual_fee", { precision: 10, scale: 2 }).default("0.00").notNull(),
    colorHex: varchar("color_hex", { length: 10 }).default("#3b82f6"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Piers (Gatovi i cjeline akvatorija: 1-12, Lukobran, Zapadna obala) ───
export const pierTypeEnum = pgEnum("pier_type", [
    "floating_pontoon", // Pomični / plutajući ponton
    "fixed_pier",        // Fiksni gat
    "breakwater",        // Lukobran
    "quay",              // Obalni zid
]);

export const piers = pgTable("piers", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 20 }).unique().notNull(), // 'G1'..'G12', 'L', 'ZO'
    name: varchar("name", { length: 255 }).notNull(), // 'Gat 1'..'Gat 12', 'Lukobran', 'Zapadna obala'
    pierType: pierTypeEnum("pier_type").default("floating_pontoon").notNull(),
    totalBerths: integer("total_berths").notNull(), // 62, 70, 69, 68, 70, 65, 66, 66, 66, 62, 51, 16, 46, 34
    sortOrder: integer("sort_order").default(0).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        codeIdx: index("piers_code_idx").on(table.code),
        sortOrderIdx: index("piers_sort_order_idx").on(table.sortOrder),
    };
});

// ─── Berths (Morski vezovi u akvatoriju) ──────────────────────────────────
export const berthStatusEnum = pgEnum("berth_status", [
    "vacant",        // Slobodan vez (spreman za dodjelu/tranzit)
    "occupied",      // Zauzet od strane člana (redovno)
    "transit",       // Privremeni / tranzitni gost
    "debt_block",    // Dugovanje / blokada
    "maintenance",   // Popravak muringa / izvan funkcije
    "reserved",      // Rezervirano
]);

export const berthSideEnum = pgEnum("berth_side", ["left", "right", "head", "quay"]);

export const berths = pgTable("berths", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pierId: uuid("pier_id").notNull().references(() => piers.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 30 }).unique().notNull(), // npr. 'G01-01', 'G02-15', 'LUK-01', 'ZO-01'
    berthNumber: integer("berth_number").notNull(), // 1..N
    side: berthSideEnum("side").default("left").notNull(),
    maxLoaM: decimal("max_loa_m", { precision: 6, scale: 2 }).default("10.00").notNull(), // max dužina
    maxBeamM: decimal("max_beam_m", { precision: 6, scale: 2 }).default("3.20").notNull(), // max širina
    maxDraftM: decimal("max_draft_m", { precision: 5, scale: 2 }).default("2.50").notNull(), // max gaz
    status: berthStatusEnum("status").default("vacant").notNull(),
    hasElectricity: boolean("has_electricity").default(true).notNull(),
    hasWater: boolean("has_water").default(true).notNull(),
    electricityMeterCode: varchar("electricity_meter_code", { length: 50 }),
    waterMeterCode: varchar("water_meter_code", { length: 50 }),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        pierIdIdx: index("berths_pier_id_idx").on(table.pierId),
        codeIdx: index("berths_code_idx").on(table.code),
        statusIdx: index("berths_status_idx").on(table.status),
    };
});

// ─── Berth Assignments (Ugovori i dodjele vezova) ─────────────────────────
export const berthAssignmentTypeEnum = pgEnum("berth_assignment_type", [
    "permanent_member",      // Stalni vez za udruženika / člana
    "transit_guest",         // Tranzitni gost
    "club_service",          // Službeno plovilo kluba / spašavanje
    "temporary_relocation",  // Privremeno premještanje
]);

export const berthAssignments = pgTable("berth_assignments", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    berthId: uuid("berth_id").notNull().references(() => berths.id, { onDelete: "cascade" }),
    vesselId: uuid("vessel_id").notNull().references(() => vessels.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    assignmentType: berthAssignmentTypeEnum("assignment_type").default("permanent_member").notNull(),
    contractNumber: varchar("contract_number", { length: 50 }), // Broj ugovora o korištenju veza
    startDate: timestamp("start_date").defaultNow().notNull(),
    endDate: timestamp("end_date"), // NULL za stalne vezove
    isActive: boolean("is_active").default(true).notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        berthIdIdx: index("berth_assignments_berth_id_idx").on(table.berthId),
        vesselIdIdx: index("berth_assignments_vessel_id_idx").on(table.vesselId),
        userIdIdx: index("berth_assignments_user_id_idx").on(table.userId),
        isActiveIdx: index("berth_assignments_is_active_idx").on(table.isActive),
        berthIsActiveIdx: index("berth_assign_berth_is_active_idx").on(table.berthId, table.isActive),
        vesselIsActiveIdx: index("berth_assign_vessel_is_active_idx").on(table.vesselId, table.isActive),
    };
});

// ─── Inferred Types ─────────────────────────────────────────────────────
export type InsertClub = typeof clubs.$inferInsert;
export type SelectClub = typeof clubs.$inferSelect;
export type Club = SelectClub;

export type InsertPier = typeof piers.$inferInsert;
export type SelectPier = typeof piers.$inferSelect;
export type Pier = SelectPier;

export type InsertBerth = typeof berths.$inferInsert;
export type SelectBerth = typeof berths.$inferSelect;
export type Berth = SelectBerth;

export type InsertBerthAssignment = typeof berthAssignments.$inferInsert;
export type SelectBerthAssignment = typeof berthAssignments.$inferSelect;
export type BerthAssignment = SelectBerthAssignment;

// ─── Invoices (Računi & e-racuni.com) ──────────────────────────────────
export const invoices = pgTable("invoices", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(), // Broj računa iz e-racuni (npr. 1-POSL1-1/2026)
    documentId: varchar("document_id", { length: 50 }), // e-racuni interni ID (npr. 34:958280)
    userId: uuid("user_id").notNull().references(() => users.id),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    berthAssignmentId: uuid("berth_assignment_id").references(() => berthAssignments.id),
    documentType: documentTypeEnum("document_type").default("invoice").notNull(),
    invoiceType: invoiceTypeEnum("invoice_type").default("crane_operation").notNull(),
    issueDate: timestamp("issue_date").defaultNow().notNull(),
    dueDate: timestamp("due_date").notNull(),
    dateOfSupply: timestamp("date_of_supply").defaultNow().notNull(),
    totalNetAmount: decimal("total_net_amount", { precision: 10, scale: 2 }).notNull(),
    totalVatAmount: decimal("total_vat_amount", { precision: 10, scale: 2 }).default("0").notNull(),
    totalGrossAmount: decimal("total_gross_amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    paymentMethod: invoicePaymentMethodEnum("payment_method").default("bank_transfer").notNull(),
    paymentStatus: invoicePaymentStatusEnum("payment_status").default("unpaid").notNull(),
    paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0").notNull(),
    paidAt: timestamp("paid_at"),
    fiscalZki: varchar("fiscal_zki", { length: 64 }),
    fiscalJir: varchar("fiscal_jir", { length: 64 }),
    pdfUrl: text("pdf_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("invoices_user_id_idx").on(table.userId),
        invoiceNumberIdx: index("invoices_invoice_number_idx").on(table.invoiceNumber),
        paymentStatusIdx: index("invoices_payment_status_idx").on(table.paymentStatus),
        reservationIdIdx: index("invoices_reservation_id_idx").on(table.reservationId),
        issueDateIdx: index("invoices_issue_date_idx").on(table.issueDate),
    };
});

export const invoiceItems = pgTable("invoice_items", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    productCode: varchar("product_code", { length: 50 }),
    description: text("description").notNull(),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1").notNull(),
    unit: varchar("unit", { length: 20 }).default("kom").notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("25").notNull(),
    netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
    vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).notNull(),
    grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
    return {
        invoiceIdIdx: index("invoice_items_invoice_id_idx").on(table.invoiceId),
    };
});

export type InsertInvoice = typeof invoices.$inferInsert;
export type SelectInvoice = typeof invoices.$inferSelect;
export type Invoice = SelectInvoice;

export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;
export type SelectInvoiceItem = typeof invoiceItems.$inferSelect;
export type InvoiceItem = SelectInvoiceItem;

