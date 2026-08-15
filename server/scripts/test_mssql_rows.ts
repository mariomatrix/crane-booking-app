import dotenv from "dotenv";
dotenv.config({ path: "C:/Users/Administrator/Documents/brod/.env" });
import { fetchAllClan03Members } from "../memberSync/mssqlQueries";

async function test() {
    const rows = await fetchAllClan03Members();
    console.log("Total rows from fetchAllClan03Members:", rows.length);
    const withBrodBr = rows.filter(r => r.BROD_BR && r.BROD_BR.trim() !== "");
    const withImeBr = rows.filter(r => r.IME_BR && r.IME_BR.trim() !== "");
    const withGat = rows.filter(r => r.GAT && r.GAT.trim() !== "");
    const withVez = rows.filter(r => r.VEZ_BROJ && r.VEZ_BROJ.trim() !== "");

    console.log("With BROD_BR:", withBrodBr.length);
    console.log("With IME_BR:", withImeBr.length);
    console.log("With GAT:", withGat.length);
    console.log("With VEZ_BROJ:", withVez.length);

    console.log("Sample 5 rows with brod & gat:");
    console.log(withBrodBr.slice(0, 5).map(r => ({
        mat: r.MAT_BROJ,
        ime: r.IME,
        prezime: r.PREZIME,
        brod: r.BROD_BR,
        imeBr: r.IME_BR,
        gat: r.GAT,
        vez: r.VEZ_BROJ,
        dug: r.DUG
    })));
}

test();
