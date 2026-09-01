import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";

async function runSeed() {
  const apiKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;
  console.log("Calling POST /api/v1/member-sync/seed-akvatorij...");
  try {
    const res = await axios.post(
      "https://dizalica.imagomatrix.com/api/v1/member-sync/seed-akvatorij",
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-sync-api-key": apiKey,
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    );
    console.log("Seed response:", res.data);
  } catch (err: any) {
    console.error("Seed error:", err.response?.status, err.response?.data || err.message);
  }
}
runSeed();
