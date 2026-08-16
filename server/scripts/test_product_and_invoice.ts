import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testProductAndInvoice() {
    console.log("1. Kreiram artikle u e-racuni.com...");
    try {
        const p1 = await eRacuniService.callApi("ProductCreate", {
            Product: {
                code: "USL-DIZ",
                name: "Dizanje plovila iz mora",
                unit: "usluga",
                netPrice: 100.00,
                vatRate: 25,
            }
        });
        console.log("Artikl 1 kreiran:", p1);

        const p2 = await eRacuniService.callApi("ProductCreate", {
            Product: {
                code: "USL-PRANJE",
                name: "Pranje podvodnog dijela trupa",
                unit: "usluga",
                netPrice: 35.00,
                vatRate: 25,
            }
        });
        console.log("Artikl 2 kreiran:", p2);
    } catch (e: any) {
        console.log("ProductCreate:", e.message);
    }

    console.log("\n2. Pokušavam kreirati račun s WireTransfer i kreiranim productCode-ovima...");
    try {
        // Koristimo partnera koji je tvrtka (Mario Lipovac / Test Imago matrix)
        const invoiceRes = await eRacuniService.callApi("SalesInvoiceCreate", {
            SalesInvoice: {
                buyerPartnerID: "34:958279", // Test Imago matrix Ltd
                date: "2026-08-16",
                dateDue: "2026-08-31",
                dateOfSupplyFrom: "2026-08-16",
                dateOfSupplyTo: "2026-08-16",
                paymentMethod: "WireTransfer",
                currency: "EUR",
                remarks: "Testni račun PŠD Špinut za dizalicu",
                Items: [
                    {
                        productCode: "USL-DIZ",
                        description: "Dizanje plovila iz mora (LOA 10.5m)",
                        quantity: 1,
                        unit: "usluga",
                        netPrice: 120.00,
                        vatRate: 25,
                    },
                    {
                        productCode: "USL-PRANJE",
                        description: "Pranje podvodnog dijela trupa",
                        quantity: 1,
                        unit: "usluga",
                        netPrice: 40.00,
                        vatRate: 25,
                    }
                ]
            }
        });

        console.log("\n=== RAČUN USPJEŠNO KREIRAN! ===");
        console.log("Rezultat:", JSON.stringify(invoiceRes, null, 2));

        if (invoiceRes?.documentID) {
            console.log("\n3. Dohvaćam detalje računa...");
            const details = await eRacuniService.callApi("SalesInvoiceGet", { documentID: invoiceRes.documentID });
            console.log("Detalji računa:", JSON.stringify(details, null, 2));
        }

    } catch (e: any) {
        console.error("Greška pri SalesInvoiceCreate:", e.message);
    }
}

testProductAndInvoice();
