import "dotenv/config";
import { getDb } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function updatePassword() {
    const email = "mario@imagomatrix.hr";
    const newPassword = "jasamkiko";

    console.log(`Updating password for user: ${email}`);

    try {
        const db = await getDb();
        if (!db) {
            console.error("DB not available - check DATABASE_URL");
            process.exit(1);
        }

        // Handle potential CJS/ESM default export differences
        const hashFn = (bcrypt as any).hash || (bcrypt as any).default?.hash;
        if (!hashFn) {
            console.error("Could not find hash function in bcryptjs");
            process.exit(1);
        }

        const passwordHash = await hashFn(newPassword, 12);

        const result = await db.update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.email, email))
            .returning();

        if (result.length > 0) {
            console.log("Password updated successfully for:", result[0].email);
        } else {
            console.error("User not found or no changes made.");
        }
    } catch (err) {
        console.error("Error updating password:", err);
        process.exit(1);
    }
}

updatePassword();
