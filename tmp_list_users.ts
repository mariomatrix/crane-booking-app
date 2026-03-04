import "dotenv/config";
import { listAllUsers } from "./server/db";

async function list() {
    console.log("Listing all users...");
    try {
        const users = await listAllUsers();
        console.log(`Found ${users.length} users:`);
        users.forEach(u => {
            console.log(`- ${u.email} (${u.name}, ID: ${u.id})`);
        });
    } catch (err) {
        console.error("Error connecting to DB:", err);
    }
}

list();
