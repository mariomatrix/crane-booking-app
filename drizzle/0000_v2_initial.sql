-- ─────────────────────────────────────────────────────────────────────────
-- Marina Crane Booking App v2.0 — Initial Schema Migration
-- Replaces all previous migrations (data reset accepted by user)
-- ─────────────────────────────────────────────────────────────────────────

-- Enable uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "role" AS ENUM ('user', 'operator', 'admin');
EXCEPTION WHEN duplicate_object THEN
    -- Add operator if missing
    ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'operator';
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'pending_verification');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "reservation_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'waitlisted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Drop old status enum if it exists and is incompatible
DO $$ BEGIN
    -- rename old status to status_old if it exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status') THEN
        DROP TYPE "status" CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "crane_status" AS ENUM ('active', 'inactive', 'maintenance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "crane_type" AS ENUM ('travelift', 'portalna', 'mobilna', 'ostalo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "vessel_type" AS ENUM ('jedrilica', 'motorni', 'katamaran', 'ostalo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    -- Drop old vessel_type if incompatible
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vessel_type') THEN
        DROP TYPE "vessel_type" CASCADE;
    END IF;
    CREATE TYPE "vessel_type" AS ENUM ('jedrilica', 'motorni', 'katamaran', 'ostalo');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "waiting_list_status" AS ENUM ('waiting', 'notified', 'accepted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── Drop old tables ──────────────────────────────────────────────────
DROP TABLE IF EXISTS "audit_log" CASCADE;
DROP TABLE IF EXISTS "password_resets" CASCADE;
DROP TABLE IF EXISTS "waiting_list" CASCADE;
DROP TABLE IF EXISTS "reservations" CASCADE;
DROP TABLE IF EXISTS "vessels" CASCADE;
DROP TABLE IF EXISTS "cranes" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "service_types" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "seasons" CASCADE;
DROP TABLE IF EXISTS "holidays" CASCADE;
DROP TABLE IF EXISTS "maintenance_blocks" CASCADE;
DROP TABLE IF EXISTS "email_verification_tokens" CASCADE;
--> statement-breakpoint

-- ─── Users ────────────────────────────────────────────────────────────
CREATE TABLE "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" varchar(320) NOT NULL UNIQUE,
    "password_hash" varchar(255),
    "google_id" varchar(255) UNIQUE,
    "first_name" varchar(100),
    "last_name" varchar(100),
    "name" text,
    "phone" varchar(50),
    "role" "role" NOT NULL DEFAULT 'user',
    "user_status" "user_status" NOT NULL DEFAULT 'active',
    "email_verified_at" timestamp,
    "anonymized_at" timestamp,
    "login_method" varchar(64),
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    "last_signed_in" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Service Types ────────────────────────────────────────────────────
CREATE TABLE "service_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "default_duration_min" integer NOT NULL DEFAULT 60,
    "is_active" boolean NOT NULL DEFAULT true,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Cranes ───────────────────────────────────────────────────────────
CREATE TABLE "cranes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "type" "crane_type" NOT NULL DEFAULT 'travelift',
    "max_capacity_kg" integer NOT NULL,
    "max_pool_width" decimal(6,2),
    "location" varchar(255),
    "crane_status" "crane_status" NOT NULL DEFAULT 'active',
    "description" text,
    "notes" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Vessels ──────────────────────────────────────────────────────────
CREATE TABLE "vessels" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "owner_id" uuid NOT NULL REFERENCES "users"("id"),
    "name" varchar(255) NOT NULL,
    "type" "vessel_type" NOT NULL,
    "length_m" decimal(7,2),
    "beam_m" decimal(6,2),
    "draft_m" decimal(5,2),
    "weight_kg" integer,
    "registration" varchar(100),
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Reservations ─────────────────────────────────────────────────────
CREATE TABLE "reservations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "reservation_number" varchar(20) UNIQUE,
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "service_type_id" uuid REFERENCES "service_types"("id"),
    "crane_id" uuid REFERENCES "cranes"("id"),
    "requested_date" date,
    "requested_time_slot" varchar(50),
    "scheduled_start" timestamp,
    "scheduled_end" timestamp,
    "duration_min" integer NOT NULL DEFAULT 60,
    "status" "reservation_status" NOT NULL DEFAULT 'pending',
    -- Vessel snapshot
    "vessel_name" varchar(255),
    "vessel_type" "vessel_type",
    "vessel_length_m" decimal(7,2),
    "vessel_beam_m" decimal(6,2),
    "vessel_draft_m" decimal(5,2),
    "vessel_weight_kg" integer,
    -- Notes
    "user_note" text,
    "admin_note" text,
    "rejection_reason" text,
    "cancel_reason" text,
    "cancelled_by_type" varchar(20),
    -- Admin
    "approved_by" uuid REFERENCES "users"("id"),
    "approved_at" timestamp,
    "completed_at" timestamp,
    -- Legacy compat
    "is_maintenance" boolean NOT NULL DEFAULT false,
    "reminder_sent" boolean NOT NULL DEFAULT false,
    "contact_phone" varchar(50),
    "lift_purpose" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Waiting List ─────────────────────────────────────────────────────
CREATE TABLE "waiting_list" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "vessel_id" uuid REFERENCES "vessels"("id"),
    "service_type_id" uuid REFERENCES "service_types"("id"),
    "crane_id" uuid REFERENCES "cranes"("id"),
    "requested_date" date NOT NULL,
    "position" integer NOT NULL DEFAULT 0,
    "status" "waiting_list_status" NOT NULL DEFAULT 'waiting',
    "vessel_data" jsonb,
    "notified" boolean NOT NULL DEFAULT false,
    "expires_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Messages ──────────────────────────────────────────────────────────
CREATE TABLE "messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "reservation_id" uuid NOT NULL REFERENCES "reservations"("id"),
    "sender_id" uuid NOT NULL REFERENCES "users"("id"),
    "body" text NOT NULL,
    "is_read" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Seasons ──────────────────────────────────────────────────────────
CREATE TABLE "seasons" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(100) NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "working_hours" jsonb NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Holidays ─────────────────────────────────────────────────────────
CREATE TABLE "holidays" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "date" date NOT NULL,
    "name" varchar(255) NOT NULL,
    "is_recurring" boolean NOT NULL DEFAULT true,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Maintenance Blocks ───────────────────────────────────────────────
CREATE TABLE "maintenance_blocks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
    "start_at" timestamp NOT NULL,
    "end_at" timestamp NOT NULL,
    "reason" text,
    "created_by" uuid REFERENCES "users"("id"),
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Settings ─────────────────────────────────────────────────────────
CREATE TABLE "settings" (
    "key" varchar(100) PRIMARY KEY,
    "value" jsonb NOT NULL,
    "updated_by" uuid REFERENCES "users"("id"),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Audit Log ────────────────────────────────────────────────────────
CREATE TABLE "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "actor_id" uuid REFERENCES "users"("id"),
    "action" varchar(100) NOT NULL,
    "entity_type" varchar(50) NOT NULL,
    "entity_id" text,
    "payload" jsonb,
    "ip_address" varchar(45),
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Password Resets ──────────────────────────────────────────────────
CREATE TABLE "password_resets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "token" varchar(255) NOT NULL UNIQUE,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Email Verification Tokens ────────────────────────────────────────
CREATE TABLE "email_verification_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id"),
    "token" varchar(255) NOT NULL UNIQUE,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
);
