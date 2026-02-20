DO $$ BEGIN
 CREATE TYPE "public"."role" AS ENUM('user', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."vessel_type" AS ENUM('sailboat', 'motorboat', 'catamaran');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"action" varchar(100) NOT NULL,
	"entityType" varchar(50) NOT NULL,
	"entityId" integer,
	"details" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cranes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"capacity" numeric(10, 2) NOT NULL,
	"maxPoolWidth" numeric(6, 2),
	"description" text,
	"location" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"craneId" integer NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"status" "status" DEFAULT 'pending' NOT NULL,
	"vesselType" "vessel_type",
	"vesselLength" numeric(7, 2),
	"vesselWidth" numeric(6, 2),
	"vesselDraft" numeric(5, 2),
	"vesselWeight" numeric(8, 2),
	"vesselName" varchar(255),
	"liftPurpose" text,
	"contactPhone" varchar(50),
	"adminNotes" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64),
	"passwordHash" varchar(255),
	"firstName" varchar(100),
	"lastName" varchar(100),
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"phone" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiting_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"craneId" integer NOT NULL,
	"requestedDate" date NOT NULL,
	"slotCount" integer DEFAULT 1 NOT NULL,
	"vesselData" jsonb,
	"notified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
