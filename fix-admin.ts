import "dotenv/config";
import { getDb, getUserByEmail, createLocalUser, updateUser } from "./server/db";
import bcrypt from "bcryptjs";
import { users } from "./drizzle/schema";

async function fixAdmin() {
    const db = await getDb();
    if (!db) { console.error("No DB context"); return; }

    let mario = await getUserByEmail("mario@imagomatrix.hr");
    const passwordHash = await bcrypt.hash("lozinka123", 12);

    if (mario) {
        console.log("Mario found, updating...");
        await updateUser(mario.id, {
            passwordHash,
            role: "admin",
            emailVerifiedAt: new Date(),
            anonymizedAt: null, // just in case it was deleted
        });
        console.log("Mario updated.");
    } else {
        console.log("Mario not found, creating...");
        const id = await createLocalUser({
            email: "mario@imagomatrix.hr",
            firstName: "Mario",
            lastName: "Admin",
            passwordHash
        });
        if (id) {
            await updateUser(id, {
                role: "admin",
                emailVerifiedAt: new Date()
            });
            console.log("Mario created.");
        }
    }

    // Auto verify all users
    await db.update(users).set({ emailVerifiedAt: new Date() });
    console.log("All users verified.");
    process.exit(0);
}

fixAdmin().catch(console.error);
