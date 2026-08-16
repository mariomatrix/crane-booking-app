import "dotenv/config";
import { eRacuniService } from "../services/eRacuniService";

async function testBankAccountCreate() {
    console.log("Pokušavam dodati bankovni račun (IBAN) u e-racuni...");
    try {
        const res = await eRacuniService.callApi("BankAccountCreate", {
            BankAccount: {
                iban: "HR1224070001123456789",
                bankName: "OTP Banka d.d.",
                currency: "EUR",
                isPrimary: true,
            }
        });
        console.log("BankAccountCreate rezultat:", res);
    } catch (e: any) {
        console.log("BankAccountCreate:", e.message);
    }

    try {
        const res2 = await eRacuniService.callApi("CompanyAccountCreate", {
            iban: "HR1224070001123456789",
        });
        console.log("CompanyAccountCreate rezultat:", res2);
    } catch (e: any) {
        console.log("CompanyAccountCreate:", e.message);
    }
}

testBankAccountCreate();
