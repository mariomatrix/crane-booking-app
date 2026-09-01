import "dotenv/config";
import { getDb, getUserByEmail, createLocalUser, updateUser, updateUserRole } from "../db";
import bcrypt from "bcryptjs";
import { users, vessels, cranes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import postgres from "postgres";

async function prepareTestEnvironment() {
    console.log("Setting up test users and data...");
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed!");
        process.exit(1);
    }

    const testPasswordHash = await bcrypt.hash("TestLozinka123!", 12);

    const testUsers = [
        {
            email: "admin@test.local",
            firstName: "Admin",
            lastName: "Test",
            role: "admin" as const,
        },
        {
            email: "operater@test.local",
            firstName: "Operater",
            lastName: "Dizalice",
            role: "operator" as const,
        },
        {
            email: "clan@test.local",
            firstName: "Ivan",
            lastName: "Horvat",
            role: "user" as const,
        },
        {
            email: "mario@imagomatrix.hr",
            firstName: "Mario",
            lastName: "Admin",
            role: "admin" as const,
        }
    ];

    const createdUserIds: Record<string, string> = {};

    for (const u of testUsers) {
        let existing = await getUserByEmail(u.email);
        let id: string;
        if (existing) {
            console.log(`Updating existing user: ${u.email}`);
            id = existing.id;
            await updateUser(id, {
                passwordHash: testPasswordHash,
                emailVerifiedAt: new Date(),
                anonymizedAt: null,
                firstName: u.firstName,
                lastName: u.lastName,
            });
        } else {
            console.log(`Creating test user: ${u.email}`);
            id = await createLocalUser({
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
                passwordHash: testPasswordHash,
            });
            await updateUser(id, {
                emailVerifiedAt: new Date(),
                anonymizedAt: null,
            });
        }
        await updateUserRole(id, u.role);
        createdUserIds[u.email] = id;
    }

    // Auto verify all users
    await db.update(users).set({ emailVerifiedAt: new Date() });
    console.log("✅ All test users prepared and verified!");

    // Ensure member has a vessel
    const memberId = createdUserIds["clan@test.local"];
    if (memberId) {
        const existingVessels = await db.select().from(vessels).where(eq(vessels.ownerId, memberId));
        if (existingVessels.length === 0) {
            console.log("Creating test vessel for clan@test.local...");
            await db.insert(vessels).values({
                ownerId: memberId,
                name: "Morska Vila",
                registration: "ST-1234-MV",
                lengthM: "8.50",
                beamM: "2.80",
                draftM: "1.40",
                weightTons: "3.20",
                type: "jedrilica",
            });
            console.log("✅ Test vessel created.");
        }
    }

    // Ensure at least one crane exists
    const existingCranes = await db.select().from(cranes);
    if (existingCranes.length === 0) {
        console.log("Creating default crane...");
        await db.insert(cranes).values({
            name: "Gantry Dizalica 1 - Špinut",
            craneStatus: "active",
            type: "travelift",
            maxCapacityKN: 150,
            maxPoolWidth: "4.50",
            location: "Bazen A",
            description: "Glavna dizalica za izvlačenje i spuštanje brodova",
        });
        console.log("✅ Default crane created.");
    }

    console.log("=== TEST USERS READY ===");
    console.log("1. Admin:    admin@test.local    / TestLozinka123!");
    console.log("2. Operator: operater@test.local / TestLozinka123!");
    console.log("3. Member:   clan@test.local     / TestLozinka123!");
    console.log("4. Mario:    mario@imagomatrix.hr / TestLozinka123!");

    await client.end();
    process.exit(0);
}

prepareTestEnvironment().catch((err) => {
    console.error("Setup error:", err);
    process.exit(1);
});
