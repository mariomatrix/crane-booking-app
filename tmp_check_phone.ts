import "dotenv/config";
import { getDb } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function checkUserPhone() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed");
        return;
    }

    const result = await db.select({
        email: users.email,
        phone: users.phone
    })
        .from(users)
        .where(eq(users.email, "mario@imagomatrix.hr"));

    console.log("User DB result:", JSON.stringify(result, null, 2));
}

checkUserPhone();
