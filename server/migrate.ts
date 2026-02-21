
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
