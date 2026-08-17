import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function inspectDocTypes() {
    console.log("=== Provjera postavki i vrsta dokumenata u e-racuni.com ===");

    const methodsToTry = [
        "SalesInvoiceTypeList",
        "DocumentTypeList",
        "DocumentSeriesList",
        "SalesInvoiceNumberingList",
        "CompanyGet",
        "PartnerList",
    ];

    for (const method of methodsToTry) {
        try {
            console.log(`\n--- Pozivam ${method} ---`);
            const res = await eRacuniService.callApi(method, {});
            console.log(`${method} rezultat:`, JSON.stringify(res, null, 2));
        } catch (e: any) {
            console.log(`${method} greška:`, e.message);
        }
    }
}

inspectDocTypes();
