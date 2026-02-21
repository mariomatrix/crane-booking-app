CREATE TABLE "vessels" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "vessel_type" NOT NULL,
	"length" numeric(7, 2),
	"width" numeric(6, 2),
	"draft" numeric(5, 2),
	"weight" numeric(8, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reservationNumber" varchar(20);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "vesselId" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "isMaintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reminderSent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_reservationNumber_unique" UNIQUE("reservationNumber");