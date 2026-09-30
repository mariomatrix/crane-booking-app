CREATE TYPE "public"."berth_assignment_type" AS ENUM('permanent_member', 'transit_guest', 'club_service', 'temporary_relocation');--> statement-breakpoint
CREATE TYPE "public"."berth_side" AS ENUM('left', 'right', 'head', 'quay');--> statement-breakpoint
CREATE TYPE "public"."berth_status" AS ENUM('vacant', 'occupied', 'transit', 'debt_block', 'maintenance', 'reserved');--> statement-breakpoint
CREATE TYPE "public"."card_entry_type" AS ENUM('statutory_quota_used', 'fee_adjustment_charge', 'commercial_service');--> statement-breakpoint
CREATE TYPE "public"."client_category" AS ENUM('member', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('invoice', 'proforma');--> statement-breakpoint
CREATE TYPE "public"."invoice_payment_method" AS ENUM('bank_transfer', 'cash', 'card', 'compensation');--> statement-breakpoint
CREATE TYPE "public"."invoice_payment_status" AS ENUM('unpaid', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('crane_operation', 'annual_berth_fee', 'transit_berth', 'membership_fee', 'other');--> statement-breakpoint
CREATE TYPE "public"."land_spot_allocation_status" AS ENUM('proposed', 'reserved', 'confirmed', 'fulfilled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."land_turnaround_status" AS ENUM('proposed', 'confirmed', 'at_risk', 'broken', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pier_type" AS ENUM('floating_pontoon', 'fixed_pier', 'breakwater', 'quay');--> statement-breakpoint
CREATE TYPE "public"."pricelist_target_type" AS ENUM('member_adjustment', 'external_commercial');--> statement-breakpoint
CREATE TYPE "public"."sync_conflict_status" AS ENUM('pending', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."sync_conflict_type" AS ENUM('duplicate_oib', 'duplicate_name', 'oib_mismatch', 'vessel_owner_conflict', 'ambiguous_match');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."work_order_client_type" AS ENUM('member', 'external');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "berth_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"berth_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_type" "berth_assignment_type" DEFAULT 'permanent_member' NOT NULL,
	"contract_number" varchar(50),
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_by" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "berths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pier_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "berths_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"short_name" varchar(50),
	"description" text,
	"annual_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"color_hex" varchar(10) DEFAULT '#3b82f6',
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crane_zone_affinities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crane_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"affinity_score" integer DEFAULT 50 NOT NULL,
	"extra_transport_minutes" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cza_score_range" CHECK (affinity_score >= 0 AND affinity_score <= 100),
	CONSTRAINT "cza_extra_minutes_positive" CHECK (extra_transport_minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"document_id" varchar(50),
	"user_id" uuid NOT NULL,
	"vessel_id" uuid,
	"reservation_id" uuid,
	"berth_assignment_id" uuid,
	"document_type" "document_type" DEFAULT 'invoice' NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "land_spot_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"reservation_id" uuid,
	"status" "land_spot_allocation_status" DEFAULT 'proposed' NOT NULL,
	"planned_from" timestamp with time zone NOT NULL,
	"planned_until" timestamp with time zone,
	"created_by" uuid,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"spot_number" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"max_length_m" numeric(8, 2),
	"max_beam_m" numeric(8, 2),
	"max_weight_tons" numeric(8, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_turnaround_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"release_reservation_id" uuid NOT NULL,
	"arrival_reservation_id" uuid NOT NULL,
	"planned_release_at" timestamp with time zone NOT NULL,
	"planned_occupy_at" timestamp with time zone NOT NULL,
	"minimum_buffer_minutes" integer DEFAULT 15 NOT NULL,
	"status" "land_turnaround_status" DEFAULT 'proposed' NOT NULL,
	"created_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "member_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"legacy_mat_broj" varchar(10) NOT NULL,
	"legacy_oib" varchar(11),
	"legacy_jmbg" varchar(13),
	"legacy_raw_data" jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_links_legacy_mat_broj_unique" UNIQUE("legacy_mat_broj")
);
--> statement-breakpoint
CREATE TABLE "member_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "member_statutory_rights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lift_available" boolean DEFAULT true NOT NULL,
	"lift_acquired_year" integer NOT NULL,
	"lift_expires_at" date NOT NULL,
	"lower_available" boolean DEFAULT true NOT NULL,
	"lower_acquired_year" integer NOT NULL,
	"lower_expires_at" date NOT NULL,
	"pending_fee_adjustments_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_statutory_rights_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "operator_cranes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"crane_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"pier_type" "pier_type" DEFAULT 'floating_pontoon' NOT NULL,
	"total_berths" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "piers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"unit" varchar(30) DEFAULT 'sat' NOT NULL,
	"price_per_unit_eur" numeric(8, 2) DEFAULT '0.00' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '25.00' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"conflict_type" "sync_conflict_type" NOT NULL,
	"status" "sync_conflict_status" DEFAULT 'pending' NOT NULL,
	"legacy_mat_broj" varchar(10),
	"legacy_data" jsonb NOT NULL,
	"matched_user_ids" jsonb,
	"description" text NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
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
);
--> statement-breakpoint
CREATE TABLE "user_card_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_order_id" uuid,
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
--> statement-breakpoint
CREATE TABLE "work_order_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"quantity" numeric(8, 2) DEFAULT '1.00' NOT NULL,
	"unit_price_eur" numeric(8, 2) NOT NULL,
	"total_price_eur" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"reservation_id" uuid,
	"user_id" uuid NOT NULL,
	"vessel_id" uuid,
	"crane_id" uuid NOT NULL,
	"operator_id" uuid,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ALTER COLUMN "start_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ALTER COLUMN "end_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "scheduled_start" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "scheduled_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD COLUMN "spot_id" uuid;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD COLUMN "crane_id" uuid;--> statement-breakpoint
ALTER TABLE "land_zones" ADD COLUMN "manual_occupied_spots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "selected_resources" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jmbg_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_legal_entity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact_person" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" varchar(100) DEFAULT 'Split' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "postal_code" varchar(20) DEFAULT '21000' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "client_category" "client_category" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_code" varchar(10);--> statement-breakpoint
ALTER TABLE "berth_assignments" ADD CONSTRAINT "berth_assignments_berth_id_berths_id_fk" FOREIGN KEY ("berth_id") REFERENCES "public"."berths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "berth_assignments" ADD CONSTRAINT "berth_assignments_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "berth_assignments" ADD CONSTRAINT "berth_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "berth_assignments" ADD CONSTRAINT "berth_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "berths" ADD CONSTRAINT "berths_pier_id_piers_id_fk" FOREIGN KEY ("pier_id") REFERENCES "public"."piers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crane_zone_affinities" ADD CONSTRAINT "crane_zone_affinities_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crane_zone_affinities" ADD CONSTRAINT "crane_zone_affinities_zone_id_land_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."land_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_berth_assignment_id_berth_assignments_id_fk" FOREIGN KEY ("berth_assignment_id") REFERENCES "public"."berth_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_spot_allocations" ADD CONSTRAINT "land_spot_allocations_spot_id_land_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."land_spots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_spot_allocations" ADD CONSTRAINT "land_spot_allocations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_spot_allocations" ADD CONSTRAINT "land_spot_allocations_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_spot_allocations" ADD CONSTRAINT "land_spot_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_spots" ADD CONSTRAINT "land_spots_zone_id_land_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."land_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_turnaround_links" ADD CONSTRAINT "land_turnaround_links_spot_id_land_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."land_spots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_turnaround_links" ADD CONSTRAINT "land_turnaround_links_release_reservation_id_reservations_id_fk" FOREIGN KEY ("release_reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_turnaround_links" ADD CONSTRAINT "land_turnaround_links_arrival_reservation_id_reservations_id_fk" FOREIGN KEY ("arrival_reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_turnaround_links" ADD CONSTRAINT "land_turnaround_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_links" ADD CONSTRAINT "member_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_statutory_rights" ADD CONSTRAINT "member_statutory_rights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_cranes" ADD CONSTRAINT "operator_cranes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_cranes" ADD CONSTRAINT "operator_cranes_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_card_entries" ADD CONSTRAINT "user_card_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_card_entries" ADD CONSTRAINT "user_card_entries_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_resources" ADD CONSTRAINT "work_order_resources_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_resources" ADD CONSTRAINT "work_order_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "berth_assignments_berth_id_idx" ON "berth_assignments" USING btree ("berth_id");--> statement-breakpoint
CREATE INDEX "berth_assignments_vessel_id_idx" ON "berth_assignments" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "berth_assignments_user_id_idx" ON "berth_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "berth_assignments_is_active_idx" ON "berth_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "berth_assign_berth_is_active_idx" ON "berth_assignments" USING btree ("berth_id","is_active");--> statement-breakpoint
CREATE INDEX "berth_assign_vessel_is_active_idx" ON "berth_assignments" USING btree ("vessel_id","is_active");--> statement-breakpoint
CREATE INDEX "berths_pier_id_idx" ON "berths" USING btree ("pier_id");--> statement-breakpoint
CREATE INDEX "berths_code_idx" ON "berths" USING btree ("code");--> statement-breakpoint
CREATE INDEX "berths_status_idx" ON "berths" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cza_crane_zone_unique" ON "crane_zone_affinities" USING btree ("crane_id","zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cza_one_primary_crane_per_zone" ON "crane_zone_affinities" USING btree ("zone_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_payment_status_idx" ON "invoices" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "invoices_reservation_id_idx" ON "invoices" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "land_alloc_spot_status_idx" ON "land_spot_allocations" USING btree ("spot_id","status");--> statement-breakpoint
CREATE INDEX "land_alloc_reservation_idx" ON "land_spot_allocations" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "land_alloc_time_idx" ON "land_spot_allocations" USING btree ("planned_from","planned_until");--> statement-breakpoint
CREATE UNIQUE INDEX "land_spots_zone_number_unique" ON "land_spots" USING btree ("zone_id","spot_number");--> statement-breakpoint
CREATE UNIQUE INDEX "land_spots_code_unique" ON "land_spots" USING btree ("code");--> statement-breakpoint
CREATE INDEX "land_spots_zone_idx" ON "land_spots" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "land_spots_active_idx" ON "land_spots" USING btree ("is_active","is_blocked");--> statement-breakpoint
CREATE INDEX "turnaround_spot_idx" ON "land_turnaround_links" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "turnaround_release_res_idx" ON "land_turnaround_links" USING btree ("release_reservation_id");--> statement-breakpoint
CREATE INDEX "turnaround_arrival_res_idx" ON "land_turnaround_links" USING btree ("arrival_reservation_id");--> statement-breakpoint
CREATE INDEX "turnaround_status_idx" ON "land_turnaround_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "turnaround_arrival_unique_active" ON "land_turnaround_links" USING btree ("arrival_reservation_id") WHERE status IN ('proposed', 'confirmed');--> statement-breakpoint
CREATE INDEX "member_links_user_id_idx" ON "member_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_links_legacy_oib_idx" ON "member_links" USING btree ("legacy_oib");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "member_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_mat_broj_idx" ON "member_memberships" USING btree ("legacy_mat_broj");--> statement-breakpoint
CREATE INDEX "memberships_active_member_idx" ON "member_memberships" USING btree ("active_member");--> statement-breakpoint
CREATE INDEX "memberships_klub_idx" ON "member_memberships" USING btree ("klub");--> statement-breakpoint
CREATE INDEX "operator_cranes_user_id_idx" ON "operator_cranes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "operator_cranes_crane_id_idx" ON "operator_cranes" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "piers_code_idx" ON "piers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "piers_sort_order_idx" ON "piers" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "sync_conflicts_sync_run_id_idx" ON "sync_conflicts" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_status_idx" ON "sync_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_conflicts_type_idx" ON "sync_conflicts" USING btree ("conflict_type");--> statement-breakpoint
CREATE INDEX "user_card_user_id_idx" ON "user_card_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_card_event_date_idx" ON "user_card_entries" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "user_card_entry_type_event_date_idx" ON "user_card_entries" USING btree ("entry_type","event_date");--> statement-breakpoint
CREATE INDEX "work_order_resources_work_order_id_idx" ON "work_order_resources" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_resources_resource_id_idx" ON "work_order_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "work_orders_order_number_idx" ON "work_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "work_orders_user_id_idx" ON "work_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_orders_crane_id_idx" ON "work_orders" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_started_at_idx" ON "work_orders" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "work_orders_reservation_id_idx" ON "work_orders" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "work_orders_vessel_id_idx" ON "work_orders" USING btree ("vessel_id");--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_spot_id_land_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."land_spots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD CONSTRAINT "land_waiting_list_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crane_op_log_crane_id_idx" ON "crane_operation_log" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "crane_op_log_operator_id_idx" ON "crane_operation_log" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "crane_op_log_start_time_idx" ON "crane_operation_log" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "crane_op_log_reservation_id_idx" ON "crane_operation_log" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "cranes_status_idx" ON "cranes" USING btree ("crane_status");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "holidays_is_recurring_idx" ON "holidays" USING btree ("is_recurring");--> statement-breakpoint
CREATE INDEX "land_occ_vessel_id_idx" ON "land_occupancies" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "land_occ_user_id_idx" ON "land_occupancies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "land_occ_zone_id_idx" ON "land_occupancies" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "land_occ_spot_id_idx" ON "land_occupancies" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "land_occ_returned_at_idx" ON "land_occupancies" USING btree ("returned_at");--> statement-breakpoint
CREATE INDEX "land_occ_lifted_at_idx" ON "land_occupancies" USING btree ("lifted_at");--> statement-breakpoint
CREATE INDEX "land_occ_zone_returned_idx" ON "land_occupancies" USING btree ("zone_id","returned_at");--> statement-breakpoint
CREATE INDEX "land_occ_vessel_returned_idx" ON "land_occupancies" USING btree ("vessel_id","returned_at");--> statement-breakpoint
CREATE INDEX "land_wl_user_id_idx" ON "land_waiting_list" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "land_wl_vessel_id_idx" ON "land_waiting_list" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "land_wl_crane_id_idx" ON "land_waiting_list" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "land_wl_preferred_zone_idx" ON "land_waiting_list" USING btree ("preferred_zone_id");--> statement-breakpoint
CREATE INDEX "land_wl_status_idx" ON "land_waiting_list" USING btree ("status");--> statement-breakpoint
CREATE INDEX "land_wl_position_idx" ON "land_waiting_list" USING btree ("position");--> statement-breakpoint
CREATE INDEX "land_wl_zone_status_idx" ON "land_waiting_list" USING btree ("preferred_zone_id","status");--> statement-breakpoint
CREATE INDEX "maint_blocks_crane_start_idx" ON "maintenance_blocks" USING btree ("crane_id","start_at");--> statement-breakpoint
CREATE INDEX "messages_reservation_id_idx" ON "messages" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_res_is_read_idx" ON "messages" USING btree ("reservation_id","is_read");--> statement-breakpoint
CREATE INDEX "messages_is_read_idx" ON "messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "res_land_zone_id_idx" ON "reservations" USING btree ("land_zone_id");--> statement-breakpoint
CREATE INDEX "res_vessel_id_idx" ON "reservations" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "res_service_type_id_idx" ON "reservations" USING btree ("service_type_id");--> statement-breakpoint
CREATE INDEX "res_approved_by_idx" ON "reservations" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "res_overlap_check_idx" ON "reservations" USING btree ("crane_id","status","scheduled_start","scheduled_end");--> statement-breakpoint
CREATE INDEX "seasons_active_dates_idx" ON "seasons" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "service_types_is_active_idx" ON "service_types" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_types_operation_category_idx" ON "service_types" USING btree ("operation_category");--> statement-breakpoint
CREATE INDEX "service_types_sort_order_idx" ON "service_types" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("user_status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_email_verified_at_idx" ON "users" USING btree ("email_verified_at");--> statement-breakpoint
CREATE INDEX "users_anonymized_at_idx" ON "users" USING btree ("anonymized_at");--> statement-breakpoint
CREATE INDEX "users_pin_code_status_idx" ON "users" USING btree ("pin_code","user_status");--> statement-breakpoint
CREATE INDEX "vessels_owner_id_idx" ON "vessels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vessels_registration_idx" ON "vessels" USING btree ("registration");--> statement-breakpoint
CREATE INDEX "vessels_created_at_idx" ON "vessels" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "waiting_list_user_id_idx" ON "waiting_list" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "waiting_list_crane_id_idx" ON "waiting_list" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "waiting_list_status_idx" ON "waiting_list" USING btree ("status");--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_registration_unique" UNIQUE("registration");