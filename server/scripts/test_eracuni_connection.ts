import "dotenv/config";

async function testERacuni() {
    const endpoints = [
        "https://eurofaktura.com/WebServicesHR/API",
        "https://e-racuni.com/WebServicesHR/API",
    ];

    const username = process.env.ERACUNI_USERNAME || "MATRIXKIKO";
    const secretKey = process.env.ERACUNI_MD5PASS || "c68b660b7f8cd92f154403cfb92a9569";
    const token = process.env.ERACUNI_TOKEN || "158468358A150E00B49123A709B66C2C";

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
