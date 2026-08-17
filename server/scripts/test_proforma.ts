import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testProformaOrOrder() {
    console.log("=== Testiranje kreiranja Ponude / Predračuna na e-racuni.com ===");

    // Test 1: ProformaInvoiceCreate (Ponuda / Predračun)
    try {
        console.log("\n1. Pokušavam ProformaInvoiceCreate...");
        const res1 = await eRacuniService.callApi("ProformaInvoiceCreate", {
            ProformaInvoice: {
                buyerPartnerID: "34:958279",
                date: "2026-08-17",
                dateDue: "2026-08-31",
                paymentMethod: "WireTransfer",
                currency: "EUR",
                remarks: "Ponuda / Predračun za operacije dizalice PŠD Špinut",
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
        });
        console.log("ProformaInvoiceCreate USPJEH!", JSON.stringify(res1, null, 2));
    } catch (e: any) {
        console.log("ProformaInvoiceCreate greška:", e.message);
    }
}

testProformaOrOrder();
