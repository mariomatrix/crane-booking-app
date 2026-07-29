
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
            ADD COLUMN IF NOT EXISTS "postal_code" varchar(20) DEFAULT '21000' NOT NULL
        `;
        console.log("User table columns verified.");
    } catch (e: any) {
        console.warn("User column verification warning:", e?.message || e);
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
                "zone_id" uuid NOT NULL REFERENCES "land_zones"("id"),
                "reservation_id" uuid REFERENCES "reservations"("id"),
                "placed_at" timestamp DEFAULT now() NOT NULL,
                "removed_at" timestamp,
                "is_active" boolean DEFAULT true NOT NULL,
                "notes" text,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
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

    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Migrations completed.");

    // ─── Import schema and helpers ────────────────────────────────────
    const { cranes, users, serviceTypes, holidays, landZones } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

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
