CREATE TYPE "public"."operation_category" AS ENUM('lift_from_sea', 'lower_to_sea', 'move', 'maintenance', 'other');--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "land_zone_id" uuid;--> statement-breakpoint
ALTER TABLE "service_types" ADD COLUMN "operation_category" "operation_category" DEFAULT 'other' NOT NULL;