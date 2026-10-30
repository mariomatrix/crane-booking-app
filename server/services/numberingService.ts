import { sql } from "drizzle-orm";
import crypto from "crypto";
import { workOrders, invoices } from "../../drizzle/schema";

/**
 * Generates sequential work order number: RN-YYYY-XXXXX
 */
export async function generateWorkOrderNumber(db: any, year: number = new Date().getFullYear()): Promise<string> {
  const prefix = `RN-${year}-`;
  const rows = await db
    .select({ orderNumber: workOrders.orderNumber })
    .from(workOrders)
    .where(sql`${workOrders.orderNumber} LIKE ${prefix + "%"}`);

  let maxSeq = 0;
  for (const row of rows) {
    const suffix = String(row.orderNumber || "").slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

/**
 * Generates sequential proforma / invoice number: PON-YYYY-XXXXX or RAC-YYYY-XXXXX
 */
export async function generateInvoiceNumber(
  db: any,
  year: number = new Date().getFullYear(),
  isProforma: boolean = true
): Promise<string> {
  const prefix = isProforma ? `PON-${year}-` : `RAC-${year}-`;
  const rows = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix + "%"}`);

  let maxSeq = 0;
  for (const row of rows) {
    const suffix = String(row.invoiceNumber || "").slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

/**
 * Generates unique reservation number: REZ-YYYY-XXXXXX
 */
export function generateReservationNumber(year: number = new Date().getFullYear()): string {
  const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REZ-${year}-${randomStr}`;
}
