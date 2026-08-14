
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is missing");
    }

    console.log("Running migrations...");

    const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
    const db = drizzle(migrationClient);

    // ─── Pre-migration check ───────────────────────────────────────────
    // If __drizzle_migrations exists but key tables are missing, the DB was
    // reset without clearing migration history. Drop the tracking table to
    // force Drizzle to re-run all migrations from scratch.
    // Ensure new user columns exist prior to ORM queries
    try {
        await migrationClient`
            ALTER TABLE "users" 
            ADD COLUMN IF NOT EXISTS "is_legal_entity" boolean DEFAULT false NOT NULL,
            ADD COLUMN IF NOT EXISTS "company_name" varchar(255),
            ADD COLUMN IF NOT EXISTS "contact_person" varchar(255),
            ADD COLUMN IF NOT EXISTS "address" text,
            ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT 'Split' NOT NULL,
            ADD COLUMN IF NOT EXISTS "postal_code" varchar(20) DEFAULT '21000' NOT NULL,
            ADD COLUMN IF NOT EXISTS "pin_code" varchar(10)
        `;
        console.log("User table columns verified.");
    } catch (e: any) {
        console.warn("User column verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "operator_cranes" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
                "crane_id" uuid NOT NULL REFERENCES "cranes"("id") ON DELETE CASCADE,
                "created_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("operator_cranes table verified.");
    } catch (e: any) {
        console.warn("operator_cranes table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_zones" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" varchar(100) NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "total_spots" integer DEFAULT 10 NOT NULL,
                "manual_occupied_spots" integer DEFAULT 0 NOT NULL,
                "description" text,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "is_active" boolean DEFAULT true NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`ALTER TABLE "land_zones" ADD COLUMN IF NOT EXISTS "manual_occupied_spots" integer DEFAULT 0 NOT NULL`;
        console.log("land_zones table verified.");
    } catch (e: any) {
        console.warn("land_zones table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_occupancies" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "vessel_id" uuid NOT NULL REFERENCES "vessels"("id"),
                "user_id" uuid REFERENCES "users"("id"),
                "zone_id" uuid NOT NULL REFERENCES "land_zones"("id"),
                "spot_number" integer,
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "return_reservation_id" uuid REFERENCES "reservations"("id"),
                "lifted_at" timestamp DEFAULT now() NOT NULL,
                "returned_at" timestamp,
                "note" text,
                "created_by" uuid REFERENCES "users"("id"),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id")`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "spot_number" integer`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "return_reservation_id" uuid REFERENCES "reservations"("id")`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "lifted_at" timestamp DEFAULT now()`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "returned_at" timestamp`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "note" text`;
        await migrationClient`ALTER TABLE "land_occupancies" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id")`;
        console.log("land_occupancies table verified.");
    } catch (e: any) {
        console.warn("land_occupancies table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            CREATE TABLE IF NOT EXISTS "land_waiting_list" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "vessel_id" uuid REFERENCES "vessels"("id"),
                "vessel_name" varchar(255),
                "vessel_registration" varchar(100),
                "preferred_zone_id" uuid REFERENCES "land_zones"("id"),
                "status" varchar(50) DEFAULT 'waiting' NOT NULL,
                "contact_phone" varchar(50),
                "requested_date" date,
                "note" text,
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("land_waiting_list table verified.");
    } catch (e: any) {
        console.warn("land_waiting_list table verification warning:", e?.message || e);
    }

    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."work_order_status" AS ENUM('in_progress', 'completed', 'cancelled');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."work_order_client_type" AS ENUM('member', 'external');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."card_entry_type" AS ENUM('statutory_quota_used', 'fee_adjustment_charge', 'commercial_service');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."pricelist_target_type" AS ENUM('member_adjustment', 'external_commercial');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "price_list_items" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(50) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "target_type" varchar(50) DEFAULT 'external_commercial' NOT NULL,
                "min_length_m" numeric(5, 2),
                "max_length_m" numeric(5, 2),
                "price_per_meter_eur" numeric(8, 2),
                "fixed_price_eur" numeric(8, 2),
                "vat_rate" numeric(5, 2) DEFAULT 25.00 NOT NULL,
                "is_active" boolean DEFAULT true NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("price_list_items table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_statutory_rights" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id"),
                "lift_available" boolean DEFAULT true NOT NULL,
                "lift_acquired_year" integer NOT NULL,
                "lift_expires_at" date NOT NULL,
                "lower_available" boolean DEFAULT true NOT NULL,
                "lower_acquired_year" integer NOT NULL,
                "lower_expires_at" date NOT NULL,
                "pending_fee_adjustments_count" integer DEFAULT 0 NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("member_statutory_rights table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "work_orders" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "order_number" varchar(30) NOT NULL UNIQUE,
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "vessel_id" uuid REFERENCES "vessels"("id"),
                "crane_id" uuid NOT NULL REFERENCES "cranes"("id"),
                "operator_id" uuid REFERENCES "users"("id"),
                "status" varchar(50) DEFAULT 'in_progress' NOT NULL,
                "client_type" varchar(50) DEFAULT 'member' NOT NULL,
                "is_statutory_covered" boolean DEFAULT false NOT NULL,
                "quota_operation_type" varchar(20),
                "charge_item_code" varchar(50),
                "charge_item_name" varchar(255),
                "vessel_length_m" numeric(7, 2),
                "commercial_price_per_meter" numeric(8, 2),
                "commercial_total" numeric(10, 2),
                "vat_rate" numeric(5, 2) DEFAULT 25.00,
                "started_at" timestamp DEFAULT now() NOT NULL,
                "completed_at" timestamp,
                "actual_duration_min" integer,
                "operator_notes" text,
                "erp_sync_status" varchar(30) DEFAULT 'pending' NOT NULL,
                "erp_document_id" varchar(100),
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("work_orders table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "user_card_entries" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "work_order_id" uuid REFERENCES "work_orders"("id"),
                "entry_type" varchar(50) NOT NULL,
                "service_item_code" varchar(50),
                "service_item_name" varchar(255) NOT NULL,
                "vessel_name" varchar(255),
                "vessel_registration" varchar(100),
                "event_date" timestamp DEFAULT now() NOT NULL,
                "note" text,
                "erp_status" varchar(50) DEFAULT 'pending' NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        console.log("user_card_entries table verified.");
    } catch (e: any) {
        console.warn("Work orders tables verification warning:", e?.message || e);
    }

    // ─── Member Sync Tables & Alterations ─────────────────────────────
    try {
        await migrationClient`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`;
        await migrationClient`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jmbg_hash" varchar(64)`;
        console.log("users table updated for member sync (nullable email, jmbg_hash).");
    } catch (e: any) {
        console.warn("users alter warning:", e?.message || e);
    }

    try {
        // Ensure vessels registration is unique where not null
        await migrationClient`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'vessels_registration_unique'
                ) THEN
                    ALTER TABLE "vessels" ADD CONSTRAINT "vessels_registration_unique" UNIQUE ("registration");
                END IF;
            EXCEPTION WHEN others THEN null;
            END $$;
        `;
        console.log("vessels registration uniqueness verified.");
    } catch (e: any) {
        console.warn("vessels uniqueness warning:", e?.message || e);
    }

    try {
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed', 'partial');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_conflict_status" AS ENUM('pending', 'resolved', 'ignored');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await migrationClient`
            DO $$ BEGIN
                CREATE TYPE "public"."sync_conflict_type" AS ENUM('duplicate_oib', 'duplicate_name', 'oib_mismatch', 'vessel_owner_conflict', 'ambiguous_match');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_links" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "legacy_mat_broj" varchar(10) NOT NULL UNIQUE,
                "legacy_oib" varchar(11),
                "legacy_jmbg" varchar(13),
                "legacy_raw_data" jsonb,
                "is_primary" boolean DEFAULT false NOT NULL,
                "last_synced_at" timestamp DEFAULT now() NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "member_links_user_id_idx" ON "member_links" ("user_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "member_links_legacy_oib_idx" ON "member_links" ("legacy_oib")`;
        console.log("member_links table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "member_memberships" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
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
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "member_memberships" ("user_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_mat_broj_idx" ON "member_memberships" ("legacy_mat_broj")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_active_member_idx" ON "member_memberships" ("active_member")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "memberships_klub_idx" ON "member_memberships" ("klub")`;
        console.log("member_memberships table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "sync_runs" (
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
            )
        `;
        console.log("sync_runs table verified.");

        await migrationClient`
            CREATE TABLE IF NOT EXISTS "sync_conflicts" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "sync_run_id" uuid NOT NULL REFERENCES "sync_runs"("id"),
                "conflict_type" "sync_conflict_type" NOT NULL,
                "status" "sync_conflict_status" DEFAULT 'pending' NOT NULL,
                "legacy_mat_broj" varchar(10),
                "legacy_data" jsonb NOT NULL,
                "matched_user_ids" jsonb,
                "description" text NOT NULL,
                "resolution" text,
                "resolved_by" uuid REFERENCES "users"("id"),
                "resolved_at" timestamp,
                "created_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_sync_run_id_idx" ON "sync_conflicts" ("sync_run_id")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_status_idx" ON "sync_conflicts" ("status")`;
        await migrationClient`CREATE INDEX IF NOT EXISTS "sync_conflicts_type_idx" ON "sync_conflicts" ("conflict_type")`;
        console.log("sync_conflicts table verified.");
    } catch (e: any) {
        console.warn("Member sync tables verification warning:", e?.message || e);
    }

    try {
        await migrate(db, { migrationsFolder: "drizzle" });
        console.log("Migrations completed.");
    } catch (migErr: any) {
        console.log("Drizzle folder migration skipped or already applied:", migErr?.message || migErr);
    }

    // ─── Import schema and helpers ────────────────────────────────────
    const { cranes, users, serviceTypes, holidays, landZones, priceListItems, memberStatutoryRights } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

    // ─── Seed: Price List Items ───────────────────────────────────────
    const existingPriceItems = await db.select().from(priceListItems);
    if (existingPriceItems.length === 0) {
        console.log("Seeding price list items...");
        await db.insert(priceListItems).values([
            {
                code: "USL-D9T",
                name: "Korištenje dizalice 9T (Doplata članarine)",
                targetType: "member_adjustment",
                fixedPriceEur: "50.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 1,
            },
            {
                code: "USL-TR50",
                name: "Korištenje Travelifta 50T (Doplata članarine)",
                targetType: "member_adjustment",
                fixedPriceEur: "80.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 2,
            },
            {
                code: "USL-VANJSKI-M",
                name: "Dizanje/spuštanje za vanjske korisnike (po metru duljine)",
                targetType: "external_commercial",
                pricePerMeterEur: "12.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 3,
            },
            {
                code: "USL-PRANJE",
                name: "Pranje trupa visokotlačnim peračem",
                targetType: "external_commercial",
                fixedPriceEur: "30.00",
                vatRate: "25.00",
                isActive: true,
                sortOrder: 4,
            },
        ]);
        console.log("Price list items seeded.");
    }

    // ─── Seed: Member Statutory Rights for active users ───────────────
    const allUsers = await db.select().from(users);
    const currentYear = new Date().getFullYear();
    const expiresAt = `${currentYear + 1}-12-31`;

    for (const u of allUsers) {
        const [existingRight] = await db.select().from(memberStatutoryRights).where(eq(memberStatutoryRights.userId, u.id));
        if (!existingRight) {
            await db.insert(memberStatutoryRights).values({
                userId: u.id,
                liftAvailable: true,
                liftAcquiredYear: currentYear,
                liftExpiresAt: expiresAt,
                lowerAvailable: true,
                lowerAcquiredYear: currentYear,
                lowerExpiresAt: expiresAt,
                pendingFeeAdjustmentsCount: 0,
            });
        }
    }
    console.log("Member statutory rights verified.");

    // ─── Seed: Service Types (tipovi operacija) ───────────────────────
    const existingServiceTypes = await db.select().from(serviceTypes);
    if (existingServiceTypes.length === 0) {
        console.log("Seeding service types...");
        await db.insert(serviceTypes).values([
            { name: "Spuštanje u more", description: "Spuštanje plovila s kopna ili brodogradilišta u more", defaultDurationMin: 60, sortOrder: 1, operationCategory: "lower_to_sea" },
            { name: "Vađenje iz mora", description: "Vađenje plovila iz mora na kopno ili brodogradilište", defaultDurationMin: 60, sortOrder: 2, operationCategory: "lift_from_sea" },
            { name: "Premještanje unutar marine", description: "Premještanje plovila unutar prostora marine", defaultDurationMin: 45, sortOrder: 3, operationCategory: "move" },
            { name: "Zimovanje (dugotrajna pohrana)", description: "Izvlačenje plovila za zimsko odlaganje", defaultDurationMin: 90, sortOrder: 4, operationCategory: "lift_from_sea" },
            { name: "Ostalo", description: "Ostale operacije — opis u napomeni", defaultDurationMin: 60, sortOrder: 5, operationCategory: "other" },
        ]);
        console.log("Service types seeded.");
    } else {
        // Upgrade existing ones
        console.log("Updating existing service types with operation categories...");
        for (const st of existingServiceTypes) {
            let cat: "lift_from_sea" | "lower_to_sea" | "move" | "maintenance" | "other" = "other";
            const nameLower = st.name.toLowerCase();
            if (nameLower.includes("vađenje") || nameLower.includes("vadenje") || nameLower.includes("zimovanje")) {
                cat = "lift_from_sea";
            } else if (nameLower.includes("spuštanje") || nameLower.includes("spustanje")) {
                cat = "lower_to_sea";
            } else if (nameLower.includes("premještanje") || nameLower.includes("premjestanje")) {
                cat = "move";
            } else if (nameLower.includes("održavanje") || nameLower.includes("odrzavanje") || nameLower.includes("servis")) {
                cat = "maintenance";
            }
            await db.update(serviceTypes).set({ operationCategory: cat }).where(eq(serviceTypes.id, st.id));
        }
        console.log("Service types updated.");
    }

    // ─── Seed: Cranes ────────────────────────────────────────────────
    const existingCranes = await db.select().from(cranes);
    if (existingCranes.length === 0) {
        console.log("Seeding cranes...");
        await db.insert(cranes).values([
            {
                name: "Mala dizalica",
                type: "travelift",
                maxCapacityKN: 50,
                description: "Za manja plovila do 50 kN (cca 5 tona)",
                location: "Bazen A",
                craneStatus: "active",
            },
            {
                name: "Srednja dizalica",
                type: "travelift",
                maxCapacityKN: 200,
                description: "Standardna dizalica do 200 kN (cca 20 tona)",
                location: "Bazen B",
                craneStatus: "active",
            },
            {
                name: "Velika dizalica",
                type: "travelift",
                maxCapacityKN: 500,
                description: "Travel lift do 500 kN (cca 50 tona)",
                location: "Bazen C",
                craneStatus: "active",
            },
        ]);
        console.log("Cranes seeded.");
    }

    // ─── Seed: HR Holidays ───────────────────────────────────────────
    const existingHolidays = await db.select().from(holidays);
    if (existingHolidays.length === 0) {
        console.log("Seeding HR holidays...");
        await db.insert(holidays).values([
            { date: "2026-01-01", name: "Nova godina", isRecurring: true },
            { date: "2026-01-06", name: "Bogojavljenje (Sveta tri kralja)", isRecurring: true },
            { date: "2026-04-05", name: "Uskrs", isRecurring: false },
            { date: "2026-04-06", name: "Uskrsni ponedjeljak", isRecurring: false },
            { date: "2026-05-01", name: "Praznik rada", isRecurring: true },
            { date: "2026-05-30", name: "Dan državnosti", isRecurring: true },
            { date: "2026-06-04", name: "Tijelovo", isRecurring: false },
            { date: "2026-06-22", name: "Dan antifašističke borbe", isRecurring: true },
            { date: "2026-08-05", name: "Dan domovinske zahvalnosti", isRecurring: true },
            { date: "2026-08-15", name: "Velika Gospa", isRecurring: true },
            { date: "2026-10-08", name: "Dan neovisnosti", isRecurring: true },
            { date: "2026-11-01", name: "Svi sveti", isRecurring: true },
            { date: "2026-12-25", name: "Božić", isRecurring: true },
            { date: "2026-12-26", name: "Sveti Stjepan (Štefanje)", isRecurring: true },
        ]);
        console.log("HR holidays seeded.");
    }

    // ─── Seed: Land Zones ────────────────────────────────────────────
    const existingLandZones = await db.select().from(landZones);
    if (existingLandZones.length === 0) {
        console.log("Seeding land zones...");
        await db.insert(landZones).values([
            { name: "Servisna zona", code: "SZ", totalSpots: 28, sortOrder: 0 },
            { name: "Arla 1",        code: "A1", totalSpots: 18, sortOrder: 1 },
            { name: "Arla 2",        code: "A2", totalSpots: 30, sortOrder: 2 },
            { name: "Arla 3",        code: "A3", totalSpots: 50, sortOrder: 3 },
            { name: "Zapadna obala",  code: "ZO", totalSpots: 16, sortOrder: 4 },
            { name: "Lukobran",       code: "LB", totalSpots: 50, sortOrder: 5 },
        ]);
        console.log("Land zones seeded.");
    }

    // ─── Seed: Admin Users ───────────────────────────────────────────
    console.log("Checking administrator accounts...");
    const admins = [
        { email: "admin@lucicaspinut.hr", password: "$pinut89823" },
        { email: "admin@spinut.hr", password: "Spinut" },
        { email: "mario@imagomatrix.hr", password: "Spinut" },
    ];

    for (const admin of admins) {
        const passwordHash = await bcrypt.default.hash(admin.password, 12);
        const existing = await db.select().from(users).where(eq(users.email, admin.email));

        if (existing.length === 0) {
            console.log(`Creating admin: ${admin.email}`);
            await db.insert(users).values({
                email: admin.email,
                passwordHash,
                firstName: admin.email.split("@")[0],
                lastName: "Admin",
                name: admin.email.split("@")[0],
                role: "admin",
                loginMethod: "email",
                userStatus: "active",
                emailVerifiedAt: new Date(),
            });
        } else {
            console.log(`Ensuring admin role and updating password: ${admin.email}`);
            await db.update(users).set({
                role: "admin",
                passwordHash,
                emailVerifiedAt: new Date(),
                updatedAt: new Date()
            }).where(eq(users.email, admin.email));
        }
    }
    console.log("Admin check completed.");

    await migrationClient.end();
}

runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
