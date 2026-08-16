import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function updateProducts() {
    console.log("Ažuriram artikle u e-racuni...");
    try {
        await eRacuniService.callApi("ProductUpdate", {
            product: {
                productCode: "USL-DIZ",
                name: "Dizanje plovila iz mora",
                description: "Dizanje plovila iz mora",
                allowChangeOfProductDescriptionOnTheInvoice: true,
                allowChangeOfPriceOnTheInvoice: true,
                grossPrice: 100.00,
                retailPrice: 125.00,
                vatRate: 25,
            }
        });
        console.log("USL-DIZ ažuriran.");

        await eRacuniService.callApi("ProductUpdate", {
            product: {
                productCode: "USL-PRANJE",
                name: "Pranje podvodnog dijela trupa",
                description: "Pranje podvodnog dijela trupa",
                allowChangeOfProductDescriptionOnTheInvoice: true,
                allowChangeOfPriceOnTheInvoice: true,
                grossPrice: 32.00,
                retailPrice: 40.00,
                vatRate: 25,
            }
        });
        console.log("USL-PRANJE ažuriran.");

        await eRacuniService.callApi("ProductCreate", {
            product: {
                productCode: "USL-VEZ",
                name: "Godišnja naknada za vez",
                description: "Godišnja naknada za vez",
                allowChangeOfProductDescriptionOnTheInvoice: true,
                allowChangeOfPriceOnTheInvoice: true,
                unit: "kom",
                grossPrice: 400.00,
                retailPrice: 500.00,
                vatRate: 25,
            }
        });
        console.log("USL-VEZ kreiran.");
    } catch (e: any) {
        console.error("Greška:", e.message);
    }
}

updateProducts();
