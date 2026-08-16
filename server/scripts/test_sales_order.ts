import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testSalesOrder() {
    console.log("=== Testiranje SalesOrderCreate (Ponuda / Narudžba) na e-racuni.com ===");

    try {
        const payload = {
            SalesOrder: {
                buyerPartnerID: "34:958279",
                date: "2026-08-16",
                dateDue: "2026-08-31",
                currency: "EUR",
                remarks: "Ponuda / Narudžba PŠD Špinut za dizalicu",
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

        const res = await eRacuniService.callApi("SalesOrderCreate", payload);
        console.log("=== SALES ORDER USPJEŠNO KREIRAN! ===");
        console.log("Rezultat:", JSON.stringify(res, null, 2));

        if (res?.documentID) {
            console.log("\n2. Dohvaćam detalje SalesOrderGet...");
            const details = await eRacuniService.callApi("SalesOrderGet", { documentID: res.documentID });
            console.log("Detalji:", JSON.stringify(details, null, 2));
        }

    } catch (e: any) {
        console.error("Greška pri SalesOrderCreate:", e.message);
    }
}

testSalesOrder();
