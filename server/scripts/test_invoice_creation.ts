import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testInvoice() {
    console.log("=== Testiranje kreiranja računa na e-racuni.com ===");

    try {
        const payload = {
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
        };

        const res = await eRacuniService.callApi("SalesInvoiceCreate", payload);
        console.log("\n=== RAČUN USPJEŠNO KREIRAN NA E-RAČUNI.COM! ===");
        console.log("Rezultat:", JSON.stringify(res, null, 2));

        if (res?.documentID) {
            console.log("\n2. Dohvaćam detalje računa preko SalesInvoiceGet...");
            const details = await eRacuniService.callApi("SalesInvoiceGet", { documentID: res.documentID });
            console.log("Detalji:", JSON.stringify(details, null, 2));

            console.log("\n3. Dohvaćam PDF računa preko SalesInvoicePdf...");
            const pdfRes = await eRacuniService.callApi("SalesInvoicePdf", { documentID: res.documentID });
            console.log("PDF rezultat:", pdfRes);
        }

    } catch (e: any) {
        console.error("Greška pri SalesInvoiceCreate:", e.message);
    }
}

testInvoice();
