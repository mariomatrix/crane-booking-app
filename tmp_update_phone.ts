import "dotenv/config";
import { getDb } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function updateUserPhone() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed");
        return;
    }

    await db.update(users)
        .set({ phone: "+385 91 123 4567" })
        .where(eq(users.email, "mario@imagomatrix.hr"));

    console.log("Updated phone for mario@imagomatrix.hr");
}

updateUserPhone();
