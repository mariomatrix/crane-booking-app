import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function inspectProducts() {
    console.log("=== Dohvat popisa artikala iz e-racuni.com ===");
    try {
        const products = await eRacuniService.callApi("ProductList", {});
        console.log("Artikli u e-računima:", JSON.stringify(products, null, 2));
    } catch (e: any) {
        console.error("Greška pri ProductList:", e.message);
    }
}

inspectProducts();
