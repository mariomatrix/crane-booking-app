
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

    await migrate(db, { migrationsFolder: "drizzle" });

    console.log("Migrations check completed.");

    // Seed data
    const { cranes, users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = await import("bcryptjs");

    // Crane seeding
    const existingCranes = await db.select().from(cranes);
    if (existingCranes.length === 0) {
        console.log("Seeding cranes...");
        await db.insert(cranes).values([
            { name: "Mala dizalica", capacity: "5", description: "Za manja plovila do 5 tona" },
            { name: "Srednja dizalica", capacity: "20", description: "Standardna dizalica do 20 tona" },
            { name: "Velika dizalica", capacity: "50", description: "Travel lift do 50 tona" },
        ]);
        console.log("Cranes seeded successfully.");
    }

    // Admin seeding
    const existingAdmins = await db.select().from(users).where(eq(users.role, "admin"));
    if (existingAdmins.length === 0) {
        console.log("Seeding initial admin...");
        const passwordHash = await bcrypt.default.hash("Spinut", 12);
        await db.insert(users).values([
            {
                email: "admin@spinut.hr",
                passwordHash,
                firstName: "Admin",
                lastName: "Spinut",
                name: "Admin Spinut",
                role: "admin",
                loginMethod: "email",
            },
            {
                email: "mario@imagomatrix.hr",
                passwordHash,
                firstName: "Mario",
                lastName: "Matrix",
                name: "Mario Matrix",
                role: "admin",
                loginMethod: "email",
            },
        ]);
        console.log("Admins seeded (admin@spinut.hr, mario@imagomatrix.hr). Password: Spinut");
    }

    await migrationClient.end();
}

runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
