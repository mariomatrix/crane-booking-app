ALTER TABLE "reservations" ALTER COLUMN "scheduled_start" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "scheduled_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ALTER COLUMN "start_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maintenance_blocks" ALTER COLUMN "end_at" SET DATA TYPE timestamp with time zone;
