import "dotenv/config";
import { getUserByEmail } from "./server/db";

async function check() {
    const email = "mario@imagomatrix.hr";
    console.log(`Checking for user: ${email}`);
    try {
        const user = await getUserByEmail(email);
        if (user) {
            console.log(`User found: ${user.id} (${user.name})`);
        } else {
            console.log("User not found.");
        }
    } catch (err) {
        console.error("Error connecting to DB:", err);
    }
}

check();
