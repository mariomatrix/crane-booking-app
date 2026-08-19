import { getDb } from "../db";
import { invoices } from "../../drizzle/schema";
import { desc } from "drizzle-orm";

async function main() {
    const db = await getDb();
    if (!db) {
        console.error("Database connection failed");
        process.exit(1);
    }
    const recent = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(5);
    console.log("Posljednjih 5 zapisa u bazi:");
    for (const inv of recent) {
        console.log(`- ID: ${inv.id}, Number: ${inv.invoiceNumber}, DocID: ${inv.documentId}, Type: ${inv.documentType}, Date: ${inv.createdAt}`);
    }
    process.exit(0);
}

main().catch(console.error);
