
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is missing");
    }

    console.log("Running migrations...");

    const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
    const db = drizzle(migrationClient);

    // ─── Pre-migration check ───────────────────────────────────────────
    // If __drizzle_migrations exists but key tables are missing, the DB was
    // reset without clearing migration history. Drop the tracking table to
    // force Drizzle to re-run all migrations from scratch.
    // Ensure new user columns exist prior to ORM queries
    try {
        await migrationClient`
            ALTER TABLE "users" 
            ADD COLUMN IF NOT EXISTS "is_legal_entity" boolean DEFAULT false NOT NULL,
            ADD COLUMN IF NOT EXISTS "company_name" varchar(255),
            ADD COLUMN IF NOT EXISTS "contact_person" varchar(255),
            ADD COLUMN IF NOT EXISTS "address" text,
            ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT 'Split' NOT NULL,
            ADD COLUMN IF NOT EXISTS "postal_code" varchar(20) DEFAULT '21000' NOT NULL,
            ADD COLUMN IF NOT EXISTS "pin_code" varchar(10)
        `;
        console.log("User table columns verified.");
    } catch (e: any) {
        console.warn("User column verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "operator_cranes" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
                "crane_id" uuid NOT NULL REFERENCES "cranes"("id") ON DELETE CASCADE,
                "created_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("operator_cranes table verified.");
    } catch (e: any) {
        console.warn("operator_cranes table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_zones" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" varchar(100) NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "total_spots" integer DEFAULT 10 NOT NULL,
                "manual_occupied_spots" integer DEFAULT 0 NOT NULL,
                "description" text,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "is_active" boolean DEFAULT true NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`ALTER TABLE "land_zones" ADD COLUMN IF NOT EXISTS "manual_occupied_spots" integer DEFAULT 0 NOT NULL`;
        console.log("land_zones table verified.");
    } catch (e: any) {
        console.warn("land_zones table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_occupancies" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id")`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "spot_number" integer`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "return_reservation_id" uuid REFERENCES "reservations"("id")`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "lifted_at" timestamp DEFAULT now()`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "returned_at" timestamp`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "note" text`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id")`;
        console.log("land_occupancies table verified.");
    } catch (e: any) {
        console.warn("land_occupancies table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_waiting_list" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        console.log("land_waiting_list table verified.");
    } catch (e: any) {
        console.warn("land_waiting_list table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."invoice_type" AS ENUM('crane_operation', 'annual_berth_fee', 'transit_berth', 'membership_fee', 'other');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."invoice_payment_method" AS ENUM('bank_transfer', 'cash', 'card', 'compensation');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."invoice_payment_status" AS ENUM('unpaid', 'partially_paid', 'paid', 'cancelled');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "invoices" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "invoice_number" varchar(50) NOT NULL,
                "document_id" varchar(50),
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "vessel_id" uuid REFERENCES "vessels"("id"),
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "berth_assignment_id" uuid REFERENCES "berth_assignments"("id"),
                "invoice_type" "public"."invoice_type" DEFAULT 'crane_operation' NOT NULL,
                "issue_date" timestamp DEFAULT now() NOT NULL,
                "due_date" timestamp NOT NULL,
                "date_of_supply" timestamp DEFAULT now() NOT NULL,
                "total_net_amount" numeric(10, 2) NOT NULL,
                "total_vat_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
                "total_gross_amount" numeric(10, 2) NOT NULL,
                "currency" varchar(3) DEFAULT 'EUR' NOT NULL,
                "payment_method" "public"."invoice_payment_method" DEFAULT 'bank_transfer' NOT NULL,
                "payment_status" "public"."invoice_payment_status" DEFAULT 'unpaid' NOT NULL,
                "paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
                "paid_at" timestamp,
                "fiscal_zki" varchar(64),
                "fiscal_jir" varchar(64),
                "pdf_url" text,
                "notes" text,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "invoice_items" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        console.log("Invoices and invoice_items tables verified.");
    } catch (e: any) {
        console.warn("Invoices tables verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."work_order_status" AS ENUM('in_progress', 'completed', 'cancelled');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."work_order_client_type" AS ENUM('member', 'external');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."card_entry_type" AS ENUM('statutory_quota_used', 'fee_adjustment_charge', 'commercial_service');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."pricelist_target_type" AS ENUM('member_adjustment', 'external_commercial');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "price_list_items" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(50) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "target_type" varchar(50) DEFAULT 'external_commercial' NOT NULL,
                "min_length_m" numeric(5, 2),
                "max_length_m" numeric(5, 2),
                "price_per_meter_eur" numeric(8, 2),
                "fixed_price_eur" numeric(8, 2),
                "vat_rate" numeric(5, 2) DEFAULT 25.00 NOT NULL,
                "is_active" boolean DEFAULT true NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("price_list_items table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_statutory_rights" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id"),
                "lift_available" boolean DEFAULT true NOT NULL,
                "lift_acquired_year" integer NOT NULL,
                "lift_expires_at" date NOT NULL,
                "lower_available" boolean DEFAULT true NOT NULL,
                "lower_acquired_year" integer NOT NULL,
                "lower_expires_at" date NOT NULL,
                "pending_fee_adjustments_count" integer DEFAULT 0 NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("member_statutory_rights table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "work_orders" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "order_number" varchar(30) NOT NULL UNIQUE,
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "vessel_id" uuid REFERENCES "vessels"("id"),
                "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
                "operator_id" uuid REFERENCES "users"("id"),
                "status" varchar(50) DEFAULT 'in_progress' NOT NULL,
                "client_type" varchar(50) DEFAULT 'member' NOT NULL,
                "is_statutory_covered" boolean DEFAULT false NOT NULL,
                "quota_operation_type" varchar(20),
                "charge_item_code" varchar(50),
                "charge_item_name" varchar(255),
                "vessel_length_m" numeric(7, 2),
                "commercial_price_per_meter" numeric(8, 2),
                "commercial_total" numeric(10, 2),
                "vat_rate" numeric(5, 2) DEFAULT 25.00,
                "started_at" timestamp DEFAULT now() NOT NULL,
                "completed_at" timestamp,
                "actual_duration_min" integer,
                "operator_notes" text,
                "erp_sync_status" varchar(30) DEFAULT 'pending' NOT NULL,
                "erp_document_id" varchar(100),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("work_orders table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "user_card_entries" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "work_order_id" uuid REFERENCES "work_orders"("id"),
                "entry_type" varchar(50) NOT NULL,
                "service_item_code" varchar(50),
                "service_item_name" varchar(255) NOT NULL,
                "vessel_name" varchar(255),
                "vessel_registration" varchar(100),
                "event_date" timestamp DEFAULT now() NOT NULL,
                "note" text,
                "erp_status" varchar(50) DEFAULT 'pending' NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("user_card_entries table verified.");
    } catch (e: any) {
        console.warn("Work orders tables verification warning:", e?.message || e);
    }

    // ─── Member Sync Tables & Alterations ─────────────────────────────
    try {
        await migrationClient`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`;
        await migrationClient`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jmbg_hash" varchar(64)`;
        console.log("users table updated for member sync (nullable email, jmbg_hash).");
    } catch (e: any) {
        console.warn("users alter warning:", e?.message || e);
    }

    try {
        // Ensure vessels registration is unique where not null
        await migrationClient`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'vessels_registration_unique'
                ) THEN
                    ALTER TABLE "vessels" ADD CONSTRAINT "vessels_registration_unique" UNIQUE ("registration");
                END IF;
            EXCEPTION WHEN others THEN null;
            END $$;
        `;
        console.log("vessels registration uniqueness verified.");
    } catch (e: any) {
        console.warn("vessels uniqueness warning:", e?.message || e);
    }

    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed', 'partial');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_conflict_status" AS ENUM('pending', 'resolved', 'ignored');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_conflict_type" AS ENUM('duplicate_oib', 'duplicate_name', 'oib_mismatch', 'vessel_owner_conflict', 'ambiguous_match');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_links" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "legacy_mat_broj" varchar(10) NOT NULL UNIQUE,
                "legacy_oib" varchar(11),
                "legacy_jmbg" varchar(13),
                "legacy_raw_data" jsonb,
                "is_primary" boolean DEFAULT false NOT NULL,
                "last_synced_at" timestamp DEFAULT now() NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "member_links_user_id_idx" ON "member_links" ("user_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "member_links_legacy_oib_idx" ON "member_links" ("legacy_oib")`;
        console.log("member_links table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_memberships" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "legacy_mat_broj" varchar(10) NOT NULL,
                "vrsta_c" varchar(1),
                "clan" varchar(1),
                "klub" varchar(3),
                "klub2" varchar(3),
                "klub3" varchar(3),
                "active_member" boolean DEFAULT true NOT NULL,
                "synced_at" timestamp DEFAULT now() NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "member_memberships" ("user_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_mat_broj_idx" ON "member_memberships" ("legacy_mat_broj")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_active_member_idx" ON "member_memberships" ("active_member")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_klub_idx" ON "member_memberships" ("klub")`;
        console.log("member_memberships table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "sync_runs" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        console.log("sync_runs table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "sync_conflicts" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_sync_run_id_idx" ON "sync_conflicts" ("sync_run_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_status_idx" ON "sync_conflicts" ("status")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_type_idx" ON "sync_conflicts" ("conflict_type")`;
        console.log("sync_conflicts table verified.");
    } catch (e: any) {
        console.warn("Member sync tables verification warning:", e?.message || e);
    }

    // ─── PŠD Marina: Clubs, Piers & Berths Tables ─────────────────────
    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "pier_type" AS ENUM ('floating_pontoon', 'fixed_pier', 'breakwater', 'quay');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "berth_status" AS ENUM ('vacant', 'occupied', 'transit', 'debt_block', 'maintenance', 'reserved');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "berth_side" AS ENUM ('left', 'right', 'head', 'quay');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "berth_assignment_type" AS ENUM ('permanent_member', 'transit_guest', 'club_service', 'temporary_relocation');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "clubs" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "short_name" varchar(50),
                "description" text,
                "annual_fee" numeric(10, 2) DEFAULT 0.00 NOT NULL,
                "color_hex" varchar(10) DEFAULT '#3b82f6',
                "is_active" boolean DEFAULT true NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("clubs table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "piers" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "pier_type" "pier_type" DEFAULT 'floating_pontoon' NOT NULL,
                "total_berths" integer NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "description" text,
                "is_active" boolean DEFAULT true NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "piers_code_idx" ON "piers" ("code")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "piers_sort_order_idx" ON "piers" ("sort_order")`;
        console.log("piers table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "berths" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "pier_id" uuid NOT NULL REFERENCES "piers"("id") ON DELETE CASCADE,
                "code" varchar(30) NOT NULL UNIQUE,
                "berth_number" integer NOT NULL,
                "side" "berth_side" DEFAULT 'left' NOT NULL,
                "max_loa_m" numeric(6, 2) DEFAULT 10.00 NOT NULL,
                "max_beam_m" numeric(6, 2) DEFAULT 3.20 NOT NULL,
                "max_draft_m" numeric(5, 2) DEFAULT 2.50 NOT NULL,
                "status" "berth_status" DEFAULT 'vacant' NOT NULL,
                "has_electricity" boolean DEFAULT true NOT NULL,
                "has_water" boolean DEFAULT true NOT NULL,
                "electricity_meter_code" varchar(50),
                "water_meter_code" varchar(50),
                "notes" text,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berths_pier_id_idx" ON "berths" ("pier_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berths_code_idx" ON "berths" ("code")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berths_status_idx" ON "berths" ("status")`;
        console.log("berths table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "berth_assignments" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assignments_berth_id_idx" ON "berth_assignments" ("berth_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assignments_vessel_id_idx" ON "berth_assignments" ("vessel_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assignments_user_id_idx" ON "berth_assignments" ("user_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assignments_is_active_idx" ON "berth_assignments" ("is_active")`;
        console.log("berth_assignments table verified.");
    } catch (e: any) {
        console.warn("Piers & berths tables verification warning:", e?.message || e);
    }

    // ─── Additional Performance Indexes ──────────────────────────────
    try {
        await migrationClient`CREATE INDEX IF NOT EXISTS "users_pin_code_status_idx" ON "users" ("pin_code", "user_status")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "service_types_is_active_idx" ON "service_types" ("is_active")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "service_types_operation_category_idx" ON "service_types" ("operation_category")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "service_types_sort_order_idx" ON "service_types" ("sort_order")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "cranes_status_idx" ON "cranes" ("crane_status")`;

        await migrationClient`CREATE INDEX IF NOT EXISTS "res_land_zone_id_idx" ON "reservations" ("land_zone_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "res_vessel_id_idx" ON "reservations" ("vessel_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "res_service_type_id_idx" ON "reservations" ("service_type_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "res_approved_by_idx" ON "reservations" ("approved_by")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "res_overlap_check_idx" ON "reservations" ("crane_id", "status", "scheduled_start", "scheduled_end")`;

        await migrationClient`CREATE INDEX IF NOT EXISTS "messages_is_read_idx" ON "messages" ("is_read")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "seasons_active_dates_idx" ON "seasons" ("is_active", "start_date", "end_date")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "holidays_date_idx" ON "holidays" ("date")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "holidays_is_recurring_idx" ON "holidays" ("is_recurring")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "maint_blocks_crane_start_idx" ON "maintenance_blocks" ("crane_id", "start_at")`;

        await migrationClient`CREATE INDEX IF NOT EXISTS "land_occ_zone_returned_idx" ON "land_occupancies" ("zone_id", "returned_at")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "land_occ_vessel_returned_idx" ON "land_occupancies" ("vessel_id", "returned_at")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "land_wl_zone_status_idx" ON "land_waiting_list" ("preferred_zone_id", "status")`;

        await migrationClient`CREATE INDEX IF NOT EXISTS "crane_op_log_reservation_id_idx" ON "crane_operation_log" ("reservation_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "work_orders_reservation_id_idx" ON "work_orders" ("reservation_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "work_orders_vessel_id_idx" ON "work_orders" ("vessel_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "user_card_entry_type_event_date_idx" ON "user_card_entries" ("entry_type", "event_date")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "invoices_issue_date_idx" ON "invoices" ("issue_date")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assign_berth_is_active_idx" ON "berth_assignments" ("berth_id", "is_active")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "berth_assign_vessel_is_active_idx" ON "berth_assignments" ("vessel_id", "is_active")`;
        console.log("Performance indexes verified.");
    } catch (e: any) {
        console.warn("Performance indexes verification warning:", e?.message || e);
    }

    try {
        await migrate(db, { migrationsFolder: "drizzle" });
        console.log("Migrations completed.");
    } catch (migErr: any) {
        console.log("Drizzle folder migration skipped or already applied:", migErr?.message || migErr);
    }

    // ─── Import schema and helpers ────────────────────────────────────
    const { cranes, users, serviceTypes, holidays, landZones, priceListItems, memberStatutoryRights } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

    // ─── Seed: Price List Items ───────────────────────────────────────
    const existingPriceItems = await db.select().from(priceListItems);
    if (existingPriceItems.length === 0) {
        console.log("Seeding price list items...");
        await db.insert(priceListItems).values([
            {
                code: "USL-D9T",
                name: "Korištenje dizalice 9T (Doplata članarine)",
                targetType: "member_adjustment",
                fixedPriceEur: "50.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 1,
            },
            {
                code: "USL-TR50",
                name: "Korištenje Travelifta 50T (Doplata članarine)",
                targetType: "member_adjustment",
                fixedPriceEur: "80.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 2,
            },
            {
                code: "USL-VANJSKI-M",
                name: "Dizanje/spuštanje za vanjske korisnike (po metru duljine)",
                targetType: "external_commercial",
                pricePerMeterEur: "12.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 3,
            },
            {
                code: "USL-PRANJE",
                name: "Pranje trupa visokotlačnim peračem",
                targetType: "external_commercial",
                fixedPriceEur: "30.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 4,
            },
        ]);
        console.log("Price list items seeded.");
    }

    // ─── Seed: Member Statutory Rights for active users ───────────────
    const allUsers = await db.select().from(users);
    const currentYear = new Date().getFullYear();
    const expiresAt = `${currentYear + 1}-12-31`;

    for (const u of allUsers) {
        const [existingRight] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, u.id));
        if (!existingRight) {
            await db.insert(memberStatutoryRights).values({
                userId: u.id,
                liftAvailable: true,
                liftAcquiredYear: currentYear,
                liftExpiresAt: expiresAt,
                lowerAvailable: true,
                lowerAcquiredYear: currentYear,
                lowerExpiresAt: expiresAt,
                pendingFeeAdjustmentsCount: 0,
            });
        }
    }
    console.log("Member statutory rights verified.");

    // ─── Seed: Service Types (tipovi operacija) ───────────────────────
    const existingServiceTypes = await db.select().from(serviceTypes);
    if (existingServiceTypes.length === 0) {
        console.log("Seeding service types...");
        await db.insert(serviceTypes).values([
            { name: "Spuštanje u more", description: "Spuštanje plovila s kopna ili brodogradilišta u more", defaultDurationMin: 60, sortOrder: 1, operationCategory: "lower_to_sea" },
            { name: "Vađenje iz mora", description: "Vađenje plovila iz mora na kopno ili brodogradilište", defaultDurationMin: 60, sortOrder: 2, operationCategory: "lift_from_sea" },
            { name: "Premještanje unutar marine", description: "Premještanje plovila unutar prostora marine", defaultDurationMin: 45, sortOrder: 3, operationCategory: "move" },
            { name: "Zimovanje (dugotrajna pohrana)", description: "Izvlačenje plovila za zimsko odlaganje", defaultDurationMin: 90, sortOrder: 4, operationCategory: "lift_from_sea" },
            { name: "Ostalo", description: "Ostale operacije — opis u napomeni", defaultDurationMin: 60, sortOrder: 5, operationCategory: "other" },
        ]);
        console.log("Service types seeded.");
    } else {
        // Upgrade existing ones
        console.log("Updating existing service types with operation categories...");
        for (const st of existingServiceTypes) {
            let cat: "lift_from_sea" | "lower_to_sea" | "move" | "maintenance" | "other" = "other";
            const nameLower = st.name.toLowerCase();
            if (nameLower.includes("vađenje") || nameLower.includes("vadenje") || nameLower.includes("zimovanje")) {
                cat = "lift_from_sea";
            } else if (nameLower.includes("spuštanje") || nameLower.includes("spustanje")) {
                cat = "lower_to_sea";
            } else if (nameLower.includes("premještanje") || nameLower.includes("premjestanje")) {
                cat = "move";
            } else if (nameLower.includes("održavanje") || nameLower.includes("odrzavanje") || nameLower.includes("servis")) {
                cat = "maintenance";
            }
            await db.update(serviceTypes).set({ operationCategory: cat }).where(eq(serviceTypes.id, st.id));
        }
        console.log("Service types updated.");
    }

    // ─── Seed: Cranes ────────────────────────────────────────────────
    const existingCranes = await db.select().from(cranes);
    if (existingCranes.length === 0) {
        console.log("Seeding cranes...");
        await db.insert(cranes).values([
            {
                name: "Mala dizalica",
                type: "travelift",
                maxCapacityKN: 50,
                description: "Za manja plovila do 50 kN (cca 5 tona)",
                location: "Bazen A",
                craneStatus: "active",
            },
            {
                name: "Srednja dizalica",
                type: "travelift",
                maxCapacityKN: 200,
                description: "Standardna dizalica do 200 kN (cca 20 tona)",
                location: "Bazen B",
                craneStatus: "active",
            },
            {
                name: "Velika dizalica",
                type: "travelift",
                maxCapacityKN: 500,
                description: "Travel lift do 500 kN (cca 50 tona)",
                location: "Bazen C",
                craneStatus: "active",
            },
        ]);
        console.log("Cranes seeded.");
    }

    // ─── Seed: HR Holidays ───────────────────────────────────────────
    const existingHolidays = await db.select().from(holidays);
    if (existingHolidays.length === 0) {
        console.log("Seeding HR holidays...");
        await db.insert(holidays).values([
            { date: "2026-01-01", name: "Nova godina", isRecurring: true },
            { date: "2026-01-06", name: "Bogojavljenje (Sveta tri kralja)", isRecurring: true },
            { date: "2026-04-05", name: "Uskrs", isRecurring: false },
            { date: "2026-04-06", name: "Uskrsni ponedjeljak", isRecurring: false },
            { date: "2026-05-01", name: "Praznik rada", isRecurring: true },
            { date: "2026-05-30", name: "Dan državnosti", isRecurring: true },
            { date: "2026-06-04", name: "Tijelovo", isRecurring: false },
            { date: "2026-06-22", name: "Dan antifašističke borbe", isRecurring: true },
            { date: "2026-08-05", name: "Dan domovinske zahvalnosti", isRecurring: true },
            { date: "2026-08-15", name: "Velika Gospa", isRecurring: true },
            { date: "2026-10-08", name: "Dan neovisnosti", isRecurring: true },
            { date: "2026-11-01", name: "Svi sveti", isRecurring: true },
            { date: "2026-12-25", name: "Božić", isRecurring: true },
            { date: "2026-12-26", name: "Sveti Stjepan (Štefanje)", isRecurring: true },
        ]);
        console.log("HR holidays seeded.");
    }

    // ─── Seed: Land Zones ────────────────────────────────────────────
    const existingLandZones = await db.select().from(landZones);
    if (existingLandZones.length === 0) {
        console.log("Seeding land zones...");
        await db.insert(landZones).values([
            { name: "Servisna zona", code: "SZ", totalSpots: 28, sortOrder: 0 },
            { name: "Arla 1",        code: "A1", totalSpots: 18, sortOrder: 1 },
            { name: "Arla 2",        code: "A2", totalSpots: 30, sortOrder: 2 },
            { name: "Arla 3",        code: "A3", totalSpots: 50, sortOrder: 3 },
            { name: "Zapadna obala",  code: "ZO", totalSpots: 16, sortOrder: 4 },
            { name: "Lukobran",       code: "LB", totalSpots: 50, sortOrder: 5 },
        ]);
        console.log("Land zones seeded.");
    }

    // ─── Seed: Admin Users ───────────────────────────────────────────
    console.log("Checking administrator accounts...");
    const admins = [
        { email: "admin@lucicaspinut.hr", password: "$pinut89823" },
        { email: "admin@spinut.hr", password: "Spinut" },
        { email: "mario@imagomatrix.hr", password: "Spinut" },
    ];

    for (const admin of admins) {
        const passwordHash = await bcrypt.default.hash(admin.password, 12);
        const existing = await db.select().from(users).where(eq(users.email, admin.email));

        if (existing.length === 0) {
            console.log(`Creating admin: ${admin.email}`);
            await db.insert(users).values({
                email: admin.email,
                passwordHash,
                firstName: admin.email.split("@")[0],
                lastName: "Admin",
                name: admin.email.split("@")[0],
                role: "admin",
                loginMethod: "email",
                userStatus: "active",
                emailVerifiedAt: new Date(),
            });
        } else {
            console.log(`Ensuring admin role: ${admin.email}`);
            await db.update(users).set({
                role: "admin",
                emailVerifiedAt: existing[0].emailVerifiedAt || new Date(),
                updatedAt: new Date()
            }).where(eq(users.email, admin.email));
        }
    }
    console.log("Admin check completed.");

    await migrationClient.end();
}

runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
