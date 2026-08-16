import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testPartnerCreate() {
    console.log("=== Testiranje PartnerCreate s 'partner' (lowercase) ===");
    try {
        const payload = {
            partner: {
                firstName: "Ivan",
                lastName: "Horvat",
                personalID: "12345678901",
                eMail: "ivan.horvat.test@spinut.hr",
                addresses: [
                    {
                        street: "Gundulićeva 12",
                        postalCode: "21000",
                        city: "Split",
                        country: "HR",
                        telephone: "0911234567",
                        type: "Primary",
                    }
                ]
            }
        };

        const res = await eRacuniService.callApi("PartnerCreate", payload);
        console.log("Rezultat PartnerCreate:", res);
    } catch (e: any) {
        console.error("Greška:", e.message);
    }
}

testPartnerCreate();
