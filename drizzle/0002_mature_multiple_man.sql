CREATE TYPE "public"."crane_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."crane_type" AS ENUM('travelift', 'portalna', 'mobilna', 'ostalo');--> statement-breakpoint
CREATE TYPE "public"."land_waiting_status" AS ENUM('waiting', 'offered', 'assigned', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."land_zone_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."waiting_list_status" AS ENUM('waiting', 'notified', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'operator' BEFORE 'admin';--> statement-breakpoint
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
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_reservationNumber_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_openId_unique";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "vessel_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "vessels" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."vessel_type";--> statement-breakpoint
CREATE TYPE "public"."vessel_type" AS ENUM('jedrilica', 'motorni', 'katamaran', 'ostalo');--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "vessel_type" SET DATA TYPE "public"."vessel_type" USING "vessel_type"::"public"."vessel_type";--> statement-breakpoint
ALTER TABLE "vessels" ALTER COLUMN "type" SET DATA TYPE "public"."vessel_type" USING "type"::"public"."vessel_type";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "password_resets" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "password_resets" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DATA TYPE "public"."reservation_status" USING "status"::text::"public"."reservation_status";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "value" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "vessels" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "waiting_list" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "waiting_list" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_address" varchar(45);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "type" "crane_type" DEFAULT 'travelift' NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "max_capacity_kn" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "max_pool_width" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "crane_status" "crane_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "expires_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reservation_number" varchar(20);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "service_type_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "crane_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "requested_date" date;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "requested_time_slot" varchar(50);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "scheduled_start" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "scheduled_end" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "duration_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_name" varchar(255);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_type" "vessel_type";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_length_m" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_beam_m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_draft_m" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_weight_tons" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_registration" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "user_note" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancelled_by_type" varchar(20);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "is_maintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reminder_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "contact_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "lift_purpose" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_method" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_signed_in" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "length_m" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "beam_m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "draft_m" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "weight_tons" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "registration" varchar(100);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "vessel_id" uuid;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "service_type_id" uuid;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "crane_id" uuid;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "requested_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "status" "waiting_list_status" DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "vessel_data" jsonb;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "res_is_maintenance_idx" ON "reservations" USING btree ("is_maintenance");--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "entityType";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "entityId";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "details";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "capacity";--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "maxPoolWidth";--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "isActive";--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "password_resets" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "password_resets" DROP COLUMN "expiresAt";--> statement-breakpoint
ALTER TABLE "password_resets" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "craneId";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "startDate";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "endDate";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reservationNumber";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselId";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "isMaintenance";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reminderSent";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselType";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselLength";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselWidth";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselDraft";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselWeight";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselName";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "liftPurpose";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "contactPhone";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "adminNotes";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reviewedBy";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reviewedAt";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "cancelReason";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "cancelledByType";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "openId";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "passwordHash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "firstName";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "lastName";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "loginMethod";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "lastSignedIn";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "deletedAt";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "ownerId";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "length";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "draft";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "weight";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "craneId";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "requestedDate";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "slotCount";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "vesselData";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_reservation_number_unique" UNIQUE("reservation_number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
DROP TYPE "public"."status";