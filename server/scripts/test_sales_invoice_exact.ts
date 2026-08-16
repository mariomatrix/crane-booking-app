import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testSalesInvoiceExact() {
    console.log("=== Test SalesInvoiceCreate s SalesInvoice (PascalCase) ===");
    try {
        const payload = {
            SalesInvoice: {
                buyerPartnerID: "34:958279", // Test Imago matrix
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
                        description: "Dizanje plovila iz mora",
                        quantity: 1,
                        unit: "usluga",
                        netPrice: 120.00,
                        vatRate: 25,
                    }
                ]
            }
        };

        const res = await eRacuniService.callApi("SalesInvoiceCreate", payload);
        console.log("Rezultat:", res);
    } catch (e: any) {
        console.error("Greška:", e.message);
    }
}

testSalesInvoiceExact();
