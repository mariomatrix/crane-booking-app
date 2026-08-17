import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testCompanyInvoice() {
    console.log("=== Testiranje kreiranja računa za tvrtku (B2B) s transakcijskim računom ===");

    // 1. Kreiramo ili dohvaćamo B2B partnera
    try {
        const partnerRes = await eRacuniService.syncPartner({
            id: "00000000-0000-0000-0000-000000000099",
            name: "Imago Matrix d.o.o.",
            isLegalEntity: true,
            companyName: "Imago Matrix d.o.o.",
            oib: "46372455133",
            email: "info@imagomatrix.com",
            phone: "0912000872",
            address: "Put Špinuta 1",
            city: "Split",
            postalCode: "21000",
        });

        console.log("Partner sinkroniziran:", partnerRes);

        // 2. Kreiramo račun s tim partnerom
        const payload = {
            SalesInvoice: {
                buyerPartnerID: partnerRes.partnerDocumentId,
                date: "2026-08-17",
                dateDue: "2026-08-31",
                dateOfSupplyFrom: "2026-08-17",
                dateOfSupplyTo: "2026-08-17",
                paymentMethod: "WireTransfer",
                currency: "EUR",
                remarks: "Testni B2B račun PŠD Špinut - transakcijsko plaćanje",
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

        const invoiceRes = await eRacuniService.callApi("SalesInvoiceCreate", payload);
        console.log("\n=== RAČUN USPJEŠNO KREIRAN U E-RAČUNI.COM! ===");
        console.log("Rezultat:", invoiceRes);

    } catch (e: any) {
        console.error("Greška pri kreiranju B2B računa:", e.message);
    }
}

testCompanyInvoice();
