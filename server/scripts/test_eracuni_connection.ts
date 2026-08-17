import "dotenv/config";

async function testERacuni() {
    const endpoints = [
        "https://eurofaktura.com/WebServicesHR/API",
        "https://e-racuni.com/WebServicesHR/API",
    ];

    const username = process.env.ERACUNI_USERNAME || "";
    const secretKey = process.env.ERACUNI_MD5PASS || "";
    const token = process.env.ERACUNI_TOKEN || "";

    if (!username || !secretKey || !token) {
        console.error("Molimo postavite ERACUNI_USERNAME, ERACUNI_MD5PASS i ERACUNI_TOKEN u .env datoteci.");
        return;
    }

    console.log("Testing Eurofaktura / e-racuni.com API...");
    console.log(`Username: ${username}`);
    console.log(`SecretKey: ${secretKey}`);
    console.log(`Token: ${token}`);

    for (const url of endpoints) {
        console.log(`\n--- Testing endpoint: ${url} ---`);
        
        // Pokušaj s formatom 1: secretKey
        const payload1 = {
            username,
            secretKey,
            token,
            method: "PartnerList",
            parameters: {}
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify(payload1),
            });

            console.log(`HTTP Status: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.log("Response (first 300 chars):", text.slice(0, 300));
            try {
                const parsed = JSON.parse(text);
                console.log("SUCCESS! Parsed JSON:", JSON.stringify(parsed, null, 2));
            } catch {
                // Not JSON
            }
        } catch (e: any) {
            console.error("Fetch error:", e.message);
        }
    }
}

testERacuni();
