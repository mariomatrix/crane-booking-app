import "dotenv/config";
import { getDb, getUserByEmail, createLocalUser, updateUser, updateUserRole } from "./server/db";
import bcrypt from "bcryptjs";
import { users } from "./drizzle/schema";

async function fixAdmin() {
    const db = await getDb();
    if (!db) { console.error("No DB context"); return; }

    let mario = await getUserByEmail("mario@imagomatrix.hr");
    const passwordHash = await bcrypt.hash("lozinka123", 12);

    let userId: string | undefined;

    if (mario) {
        console.log("Mario found, updating...");
        userId = mario.id;
        await updateUser(mario.id, {
            passwordHash,
            emailVerifiedAt: new Date(),
            anonymizedAt: null,
        });
    } else {
        console.log("Mario not found, creating...");
        userId = await createLocalUser({
            email: "mario@imagomatrix.hr",
            firstName: "Mario",
            lastName: "Admin",
            passwordHash
        });
        if (userId) {
            await updateUser(userId, {
                emailVerifiedAt: new Date()
            });
        }
    }

    if (userId) {
        await updateUserRole(userId, "admin");
        console.log("Mario role set to admin.");
    }

    // Auto verify all users
    await db.update(users).set({ emailVerifiedAt: new Date() });
    console.log("All users verified.");
    process.exit(0);
}

fixAdmin().catch(console.error);
