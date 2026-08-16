import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testProductCreate() {
    console.log("Kreiram artikle s retailPrice i grossPrice...");
    try {
        const p1 = await eRacuniService.callApi("ProductCreate", {
            product: {
                productCode: "USL-DIZ",
                name: "Dizanje plovila iz mora",
                description: "Dizanje plovila iz mora",
                unit: "usluga",
                grossPrice: 100.00,
                retailPrice: 125.00,
                vatRate: 25,
            }
        });
        console.log("Artikl 1 rezultat:", p1);

        const p2 = await eRacuniService.callApi("ProductCreate", {
            product: {
                productCode: "USL-PRANJE",
                name: "Pranje podvodnog dijela trupa",
                description: "Pranje podvodnog dijela trupa",
                unit: "usluga",
                grossPrice: 32.00,
                retailPrice: 40.00,
                vatRate: 25,
            }
        });
        console.log("Artikl 2 rezultat:", p2);

        const p3 = await eRacuniService.callApi("ProductCreate", {
            product: {
                productCode: "USL-VEZ",
                name: "Godišnja naknada za vez",
                description: "Godišnja naknada za vez",
                unit: "godina",
                grossPrice: 400.00,
                retailPrice: 500.00,
                vatRate: 25,
            }
        });
        console.log("Artikl 3 rezultat:", p3);

        const list = await eRacuniService.callApi("ProductList", {});
        console.log("\nPopis artikala u e-računima nakon kreiranja:", JSON.stringify(list, null, 2));

    } catch (e: any) {
        console.error("Greška:", e.message);
    }
}

testProductCreate();
