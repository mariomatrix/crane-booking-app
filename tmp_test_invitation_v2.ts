import "dotenv/config";
import { sendUserInvitation } from "./server/_core/email";

async function testInvitation() {
    console.log("DEBUG: SMTP_HOST =", process.env.SMTP_HOST);
    console.log("DEBUG: SMTP_PORT =", process.env.SMTP_PORT);
    console.log("DEBUG: SMTP_USER =", process.env.SMTP_USER);
    console.log("DEBUG: SMTP_FROM =", process.env.SMTP_FROM);

    try {
        console.log("Testing sendUserInvitation for lipovac.mario@gmail.com...");
        const success = await sendUserInvitation({
            to: "lipovac.mario@gmail.com",
            userName: "Mario Test",
            tempPassword: "test-password-123",
            loginUrl: "http://localhost:5173/auth/login"
        });

        if (success) {
            console.log("SUCCESS: sendUserInvitation returned true");
        } else {
            console.log("FAILED: sendUserInvitation returned false");
        }
    } catch (e: any) {
        console.error("ERROR in testInvitation:", e.message);
        if (e.stack) console.error(e.stack);
    }
}

testInvitation();
