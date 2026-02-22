ALTER TABLE "reservations" ADD COLUMN "cancelReason" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cancelledByType" varchar(20);