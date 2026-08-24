import dotenv from "dotenv";
dotenv.config();
import axios from "axios";

async function testHealth() {
    try {
        console.log("Checking health of https://dizalica.imagomatrix.com/api/v1/member-sync/health ...");
        const res = await axios.get("https://dizalica.imagomatrix.com/api/v1/member-sync/health", { timeout: 10000 });
        console.log("Health Status:", res.status, res.data);
    } catch (e: any) {
        console.error("Health check failed:", e.message);
        if (e.response) {
            console.error("Response status:", e.response.status, e.response.data);
        }
    }
}

testHealth();
