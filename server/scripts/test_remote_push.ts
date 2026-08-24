import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import axios from "axios";

async function testPush() {
  const apiKey = process.env.SYNC_API_KEY || process.env.BILLING_API_KEY;
  console.log("Testing POST /api/v1/member-sync/push with apiKey:", apiKey ? "EXISTS" : "MISSING");
  try {
    const res = await axios.post(
      "https://dizalica.imagomatrix.com/api/v1/member-sync/push",
      { members: [] },
      {
        headers: {
          "Content-Type": "application/json",
          "x-sync-api-key": apiKey,
        },
      }
    );
    console.log("Push response:", res.data);
  } catch (err: any) {
    console.error("Push error:", err.response?.status, err.response?.data || err.message);
  }
}
testPush();
