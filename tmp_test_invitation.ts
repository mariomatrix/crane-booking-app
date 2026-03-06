import "dotenv/config";
import { sendUserInvitation } from "./server/_core/email";

async function testInvitation() {
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
        console.error("FAILED: sendUserInvitation returned false");
    }
}

testInvitation();
