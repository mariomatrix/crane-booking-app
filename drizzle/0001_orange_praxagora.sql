ALTER TABLE "reservations" ADD COLUMN "user_oib" varchar(11);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oib" varchar(11);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oib_unique" UNIQUE("oib");