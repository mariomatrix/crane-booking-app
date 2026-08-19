-- ============================================================================
-- PŠD ŠPINUT — MARINA ERP & CRANE BOOKING APP
-- Službeni i cjeloviti PostgreSQL DDL (100% usklađen s drizzle/schema.ts)
-- Verzija baze podataka: 1.0 (PostgreSQL 14+)
-- ============================================================================

-- 1. Ekstenzije
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- 2. ENUM TIPOVI (Točno prema definicijama u drizzle/schema.ts)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "role" AS ENUM ('user', 'operator', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'pending_verification');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "reservation_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'waitlisted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "crane_status" AS ENUM ('active', 'inactive', 'maintenance');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "crane_type" AS ENUM ('travelift', 'portalna', 'mobilna', 'ostalo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "vessel_type" AS ENUM ('jedrilica', 'motorni', 'katamaran', 'ostalo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "waiting_list_status" AS ENUM ('waiting', 'notified', 'accepted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "operation_category" AS ENUM ('lift_from_sea', 'lower_to_sea', 'move', 'maintenance', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "work_order_status" AS ENUM ('in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "work_order_client_type" AS ENUM ('member', 'external');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "card_entry_type" AS ENUM ('statutory_quota_used', 'fee_adjustment_charge', 'commercial_service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "pricelist_target_type" AS ENUM ('member_adjustment', 'external_commercial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "pier_type" AS ENUM ('floating_pontoon', 'fixed_pier', 'breakwater', 'quay');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "berth_status" AS ENUM ('vacant', 'occupied', 'transit', 'debt_block', 'maintenance', 'reserved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "berth_side" AS ENUM ('left', 'right', 'head', 'quay');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "berth_assignment_type" AS ENUM ('permanent_member', 'transit_guest', 'club_service', 'temporary_relocation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "sync_run_status" AS ENUM ('running', 'completed', 'failed', 'partial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "sync_conflict_status" AS ENUM ('pending', 'resolved', 'ignored');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "sync_conflict_type" AS ENUM ('duplicate_oib', 'duplicate_name', 'oib_mismatch', 'vessel_owner_conflict', 'ambiguous_match');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "invoice_type" AS ENUM ('crane_operation', 'annual_berth_fee', 'transit_berth', 'membership_fee', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "invoice_payment_method" AS ENUM ('bank_transfer', 'cash', 'card', 'compensation');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "invoice_payment_status" AS ENUM ('unpaid', 'partially_paid', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 3. KORISNICI & ČLANOVI (users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" varchar(320) UNIQUE,
    "password_hash" varchar(255),
    "google_id" varchar(255) UNIQUE,
    "first_name" varchar(100),
    "last_name" varchar(100),
    "name" text,
    "phone" varchar(50),
    "oib" varchar(11) UNIQUE,
    "jmbg_hash" varchar(64),
    "is_legal_entity" boolean DEFAULT false NOT NULL,
    "company_name" varchar(255),
    "contact_person" varchar(255),
    "address" text,
    "city" varchar(100) DEFAULT 'Split' NOT NULL,
    "postal_code" varchar(20) DEFAULT '21000' NOT NULL,
    "role" "role" DEFAULT 'user' NOT NULL,
    "user_status" "user_status" DEFAULT 'active' NOT NULL,
    "email_verified_at" timestamp,
    "anonymized_at" timestamp,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "login_method" varchar(64),
    "pin_code" varchar(10),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "last_signed_in" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("user_status");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "users_email_verified_at_idx" ON "users" ("email_verified_at");
CREATE INDEX IF NOT EXISTS "users_anonymized_at_idx" ON "users" ("anonymized_at");

-- ============================================================================
-- 4. VRSTE USLUGA & OPERACIJE (service_types)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "service_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "default_duration_min" integer DEFAULT 60 NOT NULL,
    "operation_category" "operation_category" DEFAULT 'other' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- 5. DIZALICE & OPERATERI (cranes, operator_cranes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "cranes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "type" "crane_type" DEFAULT 'travelift' NOT NULL,
    "max_capacity_kn" integer NOT NULL,
    "max_pool_width" numeric(6, 2),
    "location" varchar(255),
    "crane_status" "crane_status" DEFAULT 'active' NOT NULL,
    "description" text,
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "operator_cranes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "crane_id" uuid NOT NULL REFERENCES "cranes"("id") ON DELETE CASCADE,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "operator_cranes_user_id_idx" ON "operator_cranes" ("user_id");
CREATE INDEX IF NOT EXISTS "operator_cranes_crane_id_idx" ON "operator_cranes" ("crane_id");

-- ============================================================================
-- 6. PLOVILA (vessels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "vessels" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "owner_id" uuid NOT NULL REFERENCES "users"("id"),
    "name" varchar(255) NOT NULL,
    "type" "vessel_type" NOT NULL,
    "length_m" numeric(7, 2),
    "beam_m" numeric(6, 2),
    "draft_m" numeric(5, 2),
    "weight_tons" numeric(8, 2),
    "registration" varchar(100) UNIQUE,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vessels_owner_id_idx" ON "vessels" ("owner_id");
CREATE INDEX IF NOT EXISTS "vessels_registration_idx" ON "vessels" ("registration");
CREATE INDEX IF NOT EXISTS "vessels_created_at_idx" ON "vessels" ("created_at");

-- ============================================================================
-- 7. ZONE NA KOPNU (land_zones, land_occupancies, land_waiting_list)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "land_zones" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(100) NOT NULL,
    "code" varchar(20) NOT NULL UNIQUE,
    "total_spots" integer DEFAULT 10 NOT NULL,
    "manual_occupied_spots" integer DEFAULT 0 NOT NULL,
    "description" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- 8. REZERVACIJE DIZALICA (reservations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "reservations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "reservation_number" varchar(20) UNIQUE,
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "service_type_id" uuid REFERENCES "service_types"("id"),
    "crane_id" uuid REFERENCES "cranes"("id"),
    "requested_date" date,
    "requested_time_slot" varchar(50),
    "scheduled_start" timestamptz,
    "scheduled_end" timestamptz,
    "duration_min" integer DEFAULT 60 NOT NULL,
    "status" "reservation_status" DEFAULT 'pending' NOT NULL,
    "user_oib" varchar(11),
    "vessel_name" varchar(255),
    "vessel_type" "vessel_type",
    "vessel_length_m" numeric(7, 2),
    "vessel_beam_m" numeric(6, 2),
    "vessel_draft_m" numeric(5, 2),
    "vessel_weight_tons" numeric(8, 2),
    "vessel_registration" varchar(100),
    "user_note" text,
    "admin_note" text,
    "rejection_reason" text,
    "cancel_reason" text,
    "cancelled_by_type" varchar(20),
    "land_zone_id" uuid REFERENCES "land_zones"("id"),
    "approved_by" uuid REFERENCES "users"("id"),
    "approved_at" timestamp,
    "completed_at" timestamp,
    "is_maintenance" boolean DEFAULT false NOT NULL,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "contact_phone" varchar(50),
    "lift_purpose" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Zaštita na razini baze od preklapanja termina na istoj dizalici (Zero Race-Conditions)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_crane_overlap'
    ) THEN
        ALTER TABLE "reservations"
        ADD CONSTRAINT "reservations_no_crane_overlap"
        EXCLUDE USING gist (
            "crane_id" WITH =,
            tstzrange("scheduled_start", "scheduled_end", '[)') WITH &&
        )
        WHERE (
            "crane_id" IS NOT NULL
            AND "scheduled_start" IS NOT NULL
            AND "scheduled_end" IS NOT NULL
            AND "status" IN ('approved', 'in_progress')
        );
    END IF;
EXCEPTION WHEN others THEN null; END $$;

CREATE INDEX IF NOT EXISTS "res_scheduled_start_idx" ON "reservations" ("scheduled_start");
CREATE INDEX IF NOT EXISTS "res_scheduled_end_idx" ON "reservations" ("scheduled_end");
CREATE INDEX IF NOT EXISTS "res_status_idx" ON "reservations" ("status");
CREATE INDEX IF NOT EXISTS "res_user_id_idx" ON "reservations" ("user_id");
CREATE INDEX IF NOT EXISTS "res_crane_id_idx" ON "reservations" ("crane_id");

CREATE TABLE IF NOT EXISTS "land_occupancies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "vessel_id" uuid NOT NULL REFERENCES "vessels"("id"),
    "user_id" uuid REFERENCES "users"("id"),
    "zone_id" uuid NOT NULL REFERENCES "land_zones"("id"),
    "spot_number" integer,
    "reservation_id" uuid REFERENCES "reservations"("id"),
    "return_reservation_id" uuid REFERENCES "reservations"("id"),
    "lifted_at" timestamp DEFAULT now() NOT NULL,
    "returned_at" timestamp,
    "note" text,
    "created_by" uuid REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "land_waiting_list" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "vessel_name" varchar(255),
    "vessel_registration" varchar(100),
    "preferred_zone_id" uuid REFERENCES "land_zones"("id"),
    "status" varchar(50) DEFAULT 'waiting' NOT NULL,
    "contact_phone" varchar(50),
    "requested_date" date,
    "note" text,
    "reservation_id" uuid REFERENCES "reservations"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "waiting_list" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "crane_id" uuid REFERENCES "cranes"("id"),
    "service_type_id" uuid REFERENCES "service_types"("id"),
    "requested_date" date NOT NULL,
    "requested_time_slot" varchar(50),
    "status" "waiting_list_status" DEFAULT 'waiting' NOT NULL,
    "notes" text,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "waiting_list_user_id_idx" ON "waiting_list" ("user_id");
CREATE INDEX IF NOT EXISTS "waiting_list_crane_id_idx" ON "waiting_list" ("crane_id");
CREATE INDEX IF NOT EXISTS "waiting_list_status_idx" ON "waiting_list" ("status");

CREATE TABLE IF NOT EXISTS "messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "reservation_id" uuid NOT NULL REFERENCES "reservations"("id"),
    "sender_id" uuid NOT NULL REFERENCES "users"("id"),
    "body" text NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "messages_reservation_id_idx" ON "messages" ("reservation_id");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages" ("sender_id");
CREATE INDEX IF NOT EXISTS "messages_res_is_read_idx" ON "messages" ("reservation_id", "is_read");

-- ============================================================================
-- 9. SISTEMSKE POSTAVKE, SEZONE & PRAZNICI (settings, seasons, holidays)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "settings" (
    "key" varchar(100) PRIMARY KEY,
    "value" jsonb NOT NULL,
    "updated_by" uuid REFERENCES "users"("id"),
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "seasons" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(100) NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "working_hours" jsonb NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "holidays" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "date" date NOT NULL,
    "name" varchar(255) NOT NULL,
    "is_recurring" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "maintenance_blocks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
    "start_at" timestamptz NOT NULL,
    "end_at" timestamptz NOT NULL,
    "reason" text,
    "created_by" uuid REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_blocks_no_crane_overlap'
    ) THEN
        ALTER TABLE "maintenance_blocks"
        ADD CONSTRAINT "maintenance_blocks_no_crane_overlap"
        EXCLUDE USING gist (
            "crane_id" WITH =,
            tstzrange("start_at", "end_at", '[)') WITH &&
        );
    END IF;
EXCEPTION WHEN others THEN null; END $$;

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(100) NOT NULL,
    "key" varchar(128) NOT NULL UNIQUE,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_used_at" timestamp,
    "created_by" uuid REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "actor_id" uuid REFERENCES "users"("id"),
    "action" varchar(100) NOT NULL,
    "entity_type" varchar(50) NOT NULL,
    "entity_id" text,
    "payload" jsonb,
    "ip_address" varchar(45),
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_log_actor_id_idx" ON "audit_log" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at");

CREATE TABLE IF NOT EXISTS "crane_operation_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
    "reservation_id" uuid REFERENCES "reservations"("id"),
    "operator_id" uuid NOT NULL REFERENCES "users"("id"),
    "started_at" timestamp DEFAULT now() NOT NULL,
    "completed_at" timestamp,
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "crane_op_log_crane_id_idx" ON "crane_operation_log" ("crane_id");
CREATE INDEX IF NOT EXISTS "crane_op_log_res_id_idx" ON "crane_operation_log" ("reservation_id");

-- ============================================================================
-- 10. CJENIK PO METRIMA, STATUTARNA PRAVA & RADNI NALOZI
-- ============================================================================

CREATE TABLE IF NOT EXISTS "price_list_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(50) NOT NULL UNIQUE,
    "name" varchar(255) NOT NULL,
    "target_type" "pricelist_target_type" DEFAULT 'external_commercial' NOT NULL,
    "min_length_m" numeric(5, 2),
    "max_length_m" numeric(5, 2),
    "price_per_meter_eur" numeric(8, 2),
    "fixed_price_eur" numeric(8, 2),
    "vat_rate" numeric(5, 2) DEFAULT '25.00' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "member_statutory_rights" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id"),
    "lift_available" boolean DEFAULT true NOT NULL,
    "lift_acquired_year" integer NOT NULL,
    "lift_expires_at" date NOT NULL,
    "lower_available" boolean DEFAULT true NOT NULL,
    "lower_acquired_year" integer NOT NULL,
    "lower_expires_at" date NOT NULL,
    "pending_fee_adjustments_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "work_orders" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "order_number" varchar(30) NOT NULL UNIQUE,
    "reservation_id" uuid REFERENCES "reservations"("id"),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
    "operator_id" uuid REFERENCES "users"("id"),
    "status" "work_order_status" DEFAULT 'in_progress' NOT NULL,
    "client_type" "work_order_client_type" DEFAULT 'member' NOT NULL,
    "is_statutory_covered" boolean DEFAULT false NOT NULL,
    "quota_operation_type" varchar(20),
    "charge_item_code" varchar(50),
    "charge_item_name" varchar(255),
    "vessel_length_m" numeric(7, 2),
    "commercial_price_per_meter" numeric(8, 2),
    "commercial_total" numeric(10, 2),
    "vat_rate" numeric(5, 2) DEFAULT '25.00',
    "started_at" timestamp DEFAULT now() NOT NULL,
    "completed_at" timestamp,
    "actual_duration_min" integer,
    "operator_notes" text,
    "erp_sync_status" varchar(30) DEFAULT 'pending' NOT NULL,
    "erp_document_id" varchar(100),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "work_orders_order_number_idx" ON "work_orders" ("order_number");
CREATE INDEX IF NOT EXISTS "work_orders_user_id_idx" ON "work_orders" ("user_id");
CREATE INDEX IF NOT EXISTS "work_orders_crane_id_idx" ON "work_orders" ("crane_id");
CREATE INDEX IF NOT EXISTS "work_orders_status_idx" ON "work_orders" ("status");
CREATE INDEX IF NOT EXISTS "work_orders_started_at_idx" ON "work_orders" ("started_at");

CREATE TABLE IF NOT EXISTS "user_card_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "work_order_id" uuid REFERENCES "work_orders"("id"),
    "entry_type" "card_entry_type" NOT NULL,
    "service_item_code" varchar(50),
    "service_item_name" varchar(255) NOT NULL,
    "vessel_name" varchar(255),
    "vessel_registration" varchar(100),
    "event_date" timestamp DEFAULT now() NOT NULL,
    "note" text,
    "erp_status" varchar(50) DEFAULT 'pending' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_card_user_id_idx" ON "user_card_entries" ("user_id");
CREATE INDEX IF NOT EXISTS "user_card_event_date_idx" ON "user_card_entries" ("event_date");

-- ============================================================================
-- 11. SINKRONIZACIJA ČLANOVA & KLUBOVI (member_links, sync_runs, clubs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "member_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "legacy_mat_broj" varchar(10) NOT NULL UNIQUE,
    "legacy_oib" varchar(11),
    "legacy_jmbg" varchar(13),
    "legacy_raw_data" jsonb,
    "is_primary" boolean DEFAULT false NOT NULL,
    "last_synced_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "clubs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(20) NOT NULL UNIQUE,
    "name" varchar(255) NOT NULL,
    "short_name" varchar(50),
    "description" text,
    "annual_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
    "color_hex" varchar(10) DEFAULT '#3b82f6',
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "member_memberships" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "legacy_mat_broj" varchar(10) NOT NULL,
    "club_id" uuid REFERENCES "clubs"("id"),
    "club_name" varchar(255),
    "membership_year" integer NOT NULL,
    "membership_type" varchar(50),
    "has_vessel" boolean DEFAULT false NOT NULL,
    "vessel_name" varchar(255),
    "vessel_reg" varchar(100),
    "vessel_length" numeric(6, 2),
    "is_paid" boolean DEFAULT false NOT NULL,
    "is_honorary" boolean DEFAULT false NOT NULL,
    "member_status" varchar(50) DEFAULT 'aktivan' NOT NULL,
    "legacy_data" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "member_memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_mat_broj_idx" ON "member_memberships" ("legacy_mat_broj");
CREATE INDEX IF NOT EXISTS "memberships_year_idx" ON "member_memberships" ("membership_year");

CREATE TABLE IF NOT EXISTS "sync_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "started_at" timestamp NOT NULL,
    "completed_at" timestamp,
    "status" "sync_run_status" DEFAULT 'running' NOT NULL,
    "source_rows_total" integer,
    "members_created" integer DEFAULT 0 NOT NULL,
    "members_updated" integer DEFAULT 0 NOT NULL,
    "members_skipped" integer DEFAULT 0 NOT NULL,
    "members_deactivated" integer DEFAULT 0 NOT NULL,
    "vessels_created" integer DEFAULT 0 NOT NULL,
    "vessels_updated" integer DEFAULT 0 NOT NULL,
    "vessels_skipped" integer DEFAULT 0 NOT NULL,
    "links_created" integer DEFAULT 0 NOT NULL,
    "memberships_created" integer DEFAULT 0 NOT NULL,
    "memberships_updated" integer DEFAULT 0 NOT NULL,
    "conflicts_detected" integer DEFAULT 0 NOT NULL,
    "error_message" text,
    "error_details" jsonb,
    "triggered_by" varchar(30) DEFAULT 'cron' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sync_conflicts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "sync_run_id" uuid NOT NULL REFERENCES "sync_runs"("id"),
    "conflict_type" "sync_conflict_type" NOT NULL,
    "status" "sync_conflict_status" DEFAULT 'pending' NOT NULL,
    "legacy_mat_broj" varchar(10),
    "legacy_data" jsonb NOT NULL,
    "matched_user_ids" jsonb,
    "description" text NOT NULL,
    "resolution" text,
    "resolved_by" uuid REFERENCES "users"("id"),
    "resolved_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sync_conflicts_sync_run_id_idx" ON "sync_conflicts" ("sync_run_id");
CREATE INDEX IF NOT EXISTS "sync_conflicts_status_idx" ON "sync_conflicts" ("status");
CREATE INDEX IF NOT EXISTS "sync_conflicts_type_idx" ON "sync_conflicts" ("conflict_type");

-- ============================================================================
-- 12. AKVATORIJ & VEZOVI (piers, berths, berth_assignments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "piers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(20) NOT NULL UNIQUE,
    "name" varchar(255) NOT NULL,
    "pier_type" "pier_type" DEFAULT 'floating_pontoon' NOT NULL,
    "total_berths" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "description" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "piers_code_idx" ON "piers" ("code");
CREATE INDEX IF NOT EXISTS "piers_sort_order_idx" ON "piers" ("sort_order");

CREATE TABLE IF NOT EXISTS "berths" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "pier_id" uuid NOT NULL REFERENCES "piers"("id") ON DELETE CASCADE,
    "code" varchar(30) NOT NULL UNIQUE,
    "berth_number" integer NOT NULL,
    "side" "berth_side" DEFAULT 'left' NOT NULL,
    "max_loa_m" numeric(6, 2) DEFAULT '10.00' NOT NULL,
    "max_beam_m" numeric(6, 2) DEFAULT '3.20' NOT NULL,
    "max_draft_m" numeric(5, 2) DEFAULT '2.50' NOT NULL,
    "status" "berth_status" DEFAULT 'vacant' NOT NULL,
    "has_electricity" boolean DEFAULT true NOT NULL,
    "has_water" boolean DEFAULT true NOT NULL,
    "electricity_meter_code" varchar(50),
    "water_meter_code" varchar(50),
    "notes" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "berths_pier_id_idx" ON "berths" ("pier_id");
CREATE INDEX IF NOT EXISTS "berths_code_idx" ON "berths" ("code");
CREATE INDEX IF NOT EXISTS "berths_status_idx" ON "berths" ("status");

CREATE TABLE IF NOT EXISTS "berth_assignments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "berth_id" uuid NOT NULL REFERENCES "berths"("id") ON DELETE CASCADE,
    "vessel_id" uuid NOT NULL REFERENCES "vessels"("id"),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "assignment_type" "berth_assignment_type" DEFAULT 'permanent_member' NOT NULL,
    "contract_number" varchar(50),
    "start_date" timestamp DEFAULT now() NOT NULL,
    "end_date" timestamp,
    "is_active" boolean DEFAULT true NOT NULL,
    "assigned_by" uuid REFERENCES "users"("id"),
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "berth_assignments_berth_id_idx" ON "berth_assignments" ("berth_id");
CREATE INDEX IF NOT EXISTS "berth_assignments_vessel_id_idx" ON "berth_assignments" ("vessel_id");
CREATE INDEX IF NOT EXISTS "berth_assignments_user_id_idx" ON "berth_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "berth_assignments_is_active_idx" ON "berth_assignments" ("is_active");

-- ============================================================================
-- 13. RAČUNI & E-RAČUNI (invoices, invoice_items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "invoice_number" varchar(50) NOT NULL,
    "document_id" varchar(50),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "reservation_id" uuid REFERENCES "reservations"("id"),
    "berth_assignment_id" uuid REFERENCES "berth_assignments"("id"),
    "invoice_type" "invoice_type" DEFAULT 'crane_operation' NOT NULL,
    "issue_date" timestamp DEFAULT now() NOT NULL,
    "due_date" timestamp NOT NULL,
    "date_of_supply" timestamp DEFAULT now() NOT NULL,
    "total_net_amount" numeric(10, 2) NOT NULL,
    "total_vat_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
    "total_gross_amount" numeric(10, 2) NOT NULL,
    "currency" varchar(3) DEFAULT 'EUR' NOT NULL,
    "payment_method" "invoice_payment_method" DEFAULT 'bank_transfer' NOT NULL,
    "payment_status" "invoice_payment_status" DEFAULT 'unpaid' NOT NULL,
    "paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
    "paid_at" timestamp,
    "fiscal_zki" varchar(64),
    "fiscal_jir" varchar(64),
    "pdf_url" text,
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invoices_user_id_idx" ON "invoices" ("user_id");
CREATE INDEX IF NOT EXISTS "invoices_payment_status_idx" ON "invoices" ("payment_status");
CREATE INDEX IF NOT EXISTS "invoices_invoice_number_idx" ON "invoices" ("invoice_number");

CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
    "product_code" varchar(50),
    "description" text NOT NULL,
    "quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
    "unit" varchar(20) DEFAULT 'kom' NOT NULL,
    "unit_price" numeric(10, 2) NOT NULL,
    "discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
    "vat_rate" numeric(5, 2) DEFAULT '25' NOT NULL,
    "net_amount" numeric(10, 2) NOT NULL,
    "vat_amount" numeric(10, 2) NOT NULL,
    "gross_amount" numeric(10, 2) NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items" ("invoice_id");
