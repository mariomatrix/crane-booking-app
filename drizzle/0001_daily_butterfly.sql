CREATE TYPE "public"."crane_type" AS ENUM('travelift', 'portalna', 'mobilna', 'ostalo');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'pending_verification');--> statement-breakpoint
CREATE TYPE "public"."waiting_list_status" AS ENUM('waiting', 'notified', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."status" RENAME TO "crane_status";--> statement-breakpoint
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
ALTER TABLE "audit_log" RENAME COLUMN "entityId" TO "entity_id";--> statement-breakpoint
ALTER TABLE "audit_log" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "cranes" RENAME COLUMN "capacity" TO "max_capacity_kn";--> statement-breakpoint
ALTER TABLE "cranes" RENAME COLUMN "maxPoolWidth" TO "max_pool_width";--> statement-breakpoint
ALTER TABLE "cranes" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "password_resets" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "password_resets" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "password_resets" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "reservationNumber" TO "reservation_number";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselId" TO "vessel_id";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "craneId" TO "crane_id";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselName" TO "vessel_name";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselType" TO "vessel_type";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselLength" TO "vessel_length_m";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselDraft" TO "vessel_draft_m";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "vesselWeight" TO "vessel_weight_tons";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "adminNotes" TO "admin_note";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "cancelReason" TO "rejection_reason";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "cancelledByType" TO "cancelled_by_type";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "isMaintenance" TO "is_maintenance";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "reminderSent" TO "reminder_sent";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "contactPhone" TO "contact_phone";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "liftPurpose" TO "lift_purpose";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "reservations" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "settings" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "password_hash";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "firstName" TO "first_name";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "lastName" TO "last_name";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "loginMethod" TO "login_method";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "lastSignedIn" TO "last_signed_in";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "ownerId" TO "owner_id";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "length" TO "length_m";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "draft" TO "draft_m";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "weight" TO "weight_tons";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "vessels" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "waiting_list" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "waiting_list" RENAME COLUMN "vesselData" TO "vessel_id";--> statement-breakpoint
ALTER TABLE "waiting_list" RENAME COLUMN "craneId" TO "crane_id";--> statement-breakpoint
ALTER TABLE "waiting_list" RENAME COLUMN "requestedDate" TO "requested_date";--> statement-breakpoint
ALTER TABLE "waiting_list" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_reservationNumber_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_openId_unique";--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "crane_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "crane_status" SET DEFAULT 'active'::text;--> statement-breakpoint
DROP TYPE "public"."crane_status";--> statement-breakpoint
CREATE TYPE "public"."crane_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "crane_status" SET DEFAULT 'active'::"public"."crane_status";--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "crane_status" SET DATA TYPE "public"."crane_status" USING "crane_status"::"public"."crane_status";--> statement-breakpoint
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
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."reservation_status";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DATA TYPE "public"."reservation_status" USING "status"::"public"."reservation_status";--> statement-breakpoint
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
ALTER TABLE "audit_log" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_address" varchar(45);--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "type" "crane_type" DEFAULT 'travelift' NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "crane_status" "crane_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "service_type_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "requested_date" date;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "requested_time_slot" varchar(50);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "scheduled_start" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "scheduled_end" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "duration_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_beam_m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vessel_registration" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "user_note" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "beam_m" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "registration" varchar(100);--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "service_type_id" uuid;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "status" "waiting_list_status" DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "vessel_data" jsonb;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "audit_log" DROP COLUMN "details";--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "isActive";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "startDate";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "endDate";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "vesselWidth";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reviewedBy";--> statement-breakpoint
ALTER TABLE "reservations" DROP COLUMN "reviewedAt";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "openId";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "deletedAt";--> statement-breakpoint
ALTER TABLE "vessels" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "waiting_list" DROP COLUMN "slotCount";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_reservation_number_unique" UNIQUE("reservation_number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");