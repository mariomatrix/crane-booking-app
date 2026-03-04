import "dotenv/config";
import nodemailer from "nodemailer";

async function testEmail(port: number) {
    console.log(`Testing SMTP2GO connection on port ${port}...`);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "mail-eu.smtp2go.com",
        port: port,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
    });

    try {
        const info = await transporter.sendMail({
            from: `"Test" <${process.env.SMTP_FROM}>`,
            to: process.env.SMTP_FROM,
            subject: `Test Email (Port ${port})`,
            text: "Test body",
        });
        console.log(`SUCCESS on port ${port}:`, info.messageId);
        return true;
    } catch (error: any) {
        console.error(`FAILED on port ${port}:`, error.message);
        return false;
    }
}

async function runTests() {
    const ports = [2525, 587, 80, 25];
    for (const port of ports) {
        if (await testEmail(port)) break;
    }
}

runTests();
