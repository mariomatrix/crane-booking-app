
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
    try {
        await migrationClient`SELECT 1 FROM "service_types" LIMIT 1`;
    } catch (e: any) {
        if (e?.code === "42P01") {
            console.log("Key tables missing — resetting migration tracking table...");
            await migrationClient`DROP TABLE IF EXISTS "__drizzle_migrations"`;
            console.log("Migration tracking reset done.");
        }
    }

    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("Migrations completed.");

    // ─── Import schema and helpers ────────────────────────────────────
    const { cranes, users, serviceTypes, holidays } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

    // ─── Seed: Service Types (tipovi operacija) ───────────────────────
    const existingServiceTypes = await db.select().from(serviceTypes);
    if (existingServiceTypes.length === 0) {
        console.log("Seeding service types...");
        await db.insert(serviceTypes).values([
            { name: "Spuštanje u more", description: "Spuštanje plovila s kopna ili brodogradilišta u more", defaultDurationMin: 60, sortOrder: 1 },
            { name: "Vađenje iz mora", description: "Vađenje plovila iz mora na kopno ili brodogradilište", defaultDurationMin: 60, sortOrder: 2 },
            { name: "Premještanje unutar marine", description: "Premještanje plovila unutar prostora marine", defaultDurationMin: 45, sortOrder: 3 },
            { name: "Zimovanje (dugotrajna pohrana)", description: "Izvlačenje plovila za zimsko odlaganje", defaultDurationMin: 90, sortOrder: 4 },
            { name: "Ostalo", description: "Ostale operacije — opis u napomeni", defaultDurationMin: 60, sortOrder: 5 },
        ]);
        console.log("Service types seeded.");
    }

    // ─── Seed: Cranes ────────────────────────────────────────────────
    const existingCranes = await db.select().from(cranes);
    if (existingCranes.length === 0) {
        console.log("Seeding cranes...");
        await db.insert(cranes).values([
            {
                name: "Mala dizalica",
                type: "travelift",
                maxCapacityKg: 5000,
                description: "Za manja plovila do 5 tona",
                location: "Bazen A",
                craneStatus: "active",
            },
            {
                name: "Srednja dizalica",
                type: "travelift",
                maxCapacityKg: 20000,
                description: "Standardna dizalica do 20 tona",
                location: "Bazen B",
                craneStatus: "active",
            },
            {
                name: "Velika dizalica",
                type: "travelift",
                maxCapacityKg: 50000,
                description: "Travel lift do 50 tona",
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

    // ─── Seed: Admin Users ───────────────────────────────────────────
    console.log("Checking administrator accounts...");
    const passwordHash = await bcrypt.default.hash("Spinut", 12);
    const adminEmails = ["admin@spinut.hr", "mario@imagomatrix.hr"];

    for (const email of adminEmails) {
        const existing = await db.select().from(users).where(eq(users.email, email));
        if (existing.length === 0) {
            console.log(`Creating admin: ${email}`);
            await db.insert(users).values({
                email,
                passwordHash,
                firstName: email.split("@")[0],
                lastName: "Admin",
                name: email.split("@")[0],
                role: "admin",
                loginMethod: "email",
                userStatus: "active",
            });
        } else if (existing[0].role !== "admin") {
            console.log(`Promoting to admin: ${email}`);
            await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
        }
    }
    console.log("Admin check completed.");

    await migrationClient.end();
}

runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
