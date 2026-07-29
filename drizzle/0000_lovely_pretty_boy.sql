CREATE TYPE "public"."crane_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."crane_type" AS ENUM('travelift', 'portalna', 'mobilna', 'ostalo');--> statement-breakpoint
CREATE TYPE "public"."land_waiting_status" AS ENUM('waiting', 'offered', 'assigned', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."land_zone_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'operator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."vessel_type" AS ENUM('jedrilica', 'motorni', 'katamaran', 'ostalo');--> statement-breakpoint
CREATE TYPE "public"."waiting_list_status" AS ENUM('waiting', 'notified', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"key" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" text,
	"payload" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crane_operation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crane_id" uuid NOT NULL,
	"reservation_id" uuid,
	"operation_type" varchar(50) NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"duration_minutes" integer NOT NULL,
	"operator_id" uuid,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cranes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_occupancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"spot_number" integer,
	"reservation_id" uuid,
	"return_reservation_id" uuid,
	"lifted_at" timestamp NOT NULL,
	"returned_at" timestamp,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_waiting_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vessel_id" uuid,
	"preferred_zone_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "land_waiting_status" DEFAULT 'waiting' NOT NULL,
	"note" text,
	"admin_note" text,
	"assigned_occupancy_id" uuid,
	"offered_at" timestamp,
	"declined_at" timestamp,
	"decline_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "land_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(10) NOT NULL,
	"total_spots" integer NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "land_zones_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "maintenance_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crane_id" uuid NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_number" varchar(20),
	"user_id" uuid NOT NULL,
	"vessel_id" uuid,
	"service_type_id" uuid,
	"crane_id" uuid,
	"requested_date" date,
	"requested_time_slot" varchar(50),
	"scheduled_start" timestamp,
	"scheduled_end" timestamp,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
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
	"approved_by" uuid,
	"approved_at" timestamp,
	"completed_at" timestamp,
	"is_maintenance" boolean DEFAULT false NOT NULL,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"contact_phone" varchar(50),
	"lift_purpose" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_reservation_number_unique" UNIQUE("reservation_number")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"working_hours" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"default_duration_min" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(255),
	"google_id" varchar(255),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"name" text,
	"phone" varchar(50),
	"role" "role" DEFAULT 'user' NOT NULL,
	"user_status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp,
	"anonymized_at" timestamp,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"login_method" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "vessel_type" NOT NULL,
	"length_m" numeric(7, 2),
	"beam_m" numeric(6, 2),
	"draft_m" numeric(5, 2),
	"weight_tons" numeric(8, 2),
	"registration" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiting_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vessel_id" uuid,
	"service_type_id" uuid,
	"crane_id" uuid,
	"requested_date" date NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "waiting_list_status" DEFAULT 'waiting' NOT NULL,
	"vessel_data" jsonb,
	"notified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crane_operation_log" ADD CONSTRAINT "crane_operation_log_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crane_operation_log" ADD CONSTRAINT "crane_operation_log_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crane_operation_log" ADD CONSTRAINT "crane_operation_log_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_zone_id_land_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."land_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_return_reservation_id_reservations_id_fk" FOREIGN KEY ("return_reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_occupancies" ADD CONSTRAINT "land_occupancies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD CONSTRAINT "land_waiting_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD CONSTRAINT "land_waiting_list_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD CONSTRAINT "land_waiting_list_preferred_zone_id_land_zones_id_fk" FOREIGN KEY ("preferred_zone_id") REFERENCES "public"."land_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_waiting_list" ADD CONSTRAINT "land_waiting_list_assigned_occupancy_id_land_occupancies_id_fk" FOREIGN KEY ("assigned_occupancy_id") REFERENCES "public"."land_occupancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "res_scheduled_start_idx" ON "reservations" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "res_scheduled_end_idx" ON "reservations" USING btree ("scheduled_end");--> statement-breakpoint
CREATE INDEX "res_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "res_user_id_idx" ON "reservations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "res_crane_id_idx" ON "reservations" USING btree ("crane_id");--> statement-breakpoint
CREATE INDEX "res_requested_date_idx" ON "reservations" USING btree ("requested_date");--> statement-breakpoint
CREATE INDEX "res_is_maintenance_idx" ON "reservations" USING btree ("is_maintenance");