import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testFiscalOptions() {
    const options = [
        { isFiscalized: false },
        { fiscalize: false },
        { fiscalStatus: "NotSubjectToFiscalization" },
        { isFiscalizationRequired: false },
        { sendToFiscalization: false },
    ];

    for (const opt of options) {
        console.log(`\n=== Test opcije: ${JSON.stringify(opt)} ===`);
        try {
            const payload = {
                SalesInvoice: {
                    buyerPartnerID: "34:958279",
                    date: "2026-08-16",
                    dateDue: "2026-08-31",
                    dateOfSupplyFrom: "2026-08-16",
                    dateOfSupplyTo: "2026-08-16",
                    paymentMethod: "WireTransfer",
                    currency: "EUR",
                    remarks: "Testni račun PŠD Špinut za dizalicu",
                    ...opt,
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
            console.log("USPJEH!", res);
            return;
        } catch (e: any) {
            console.log("Greška:", e.message);
        }
    }
}

testFiscalOptions();
