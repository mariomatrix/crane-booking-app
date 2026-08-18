/**
 * PŠD Špinut — Invoices & e-racuni.com tRPC Router
 * Upravljanje računima, automatsko izdavanje računa za dizalicu i vezove, te sinkronizacija uplata
 */
import { z } from "zod";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
    invoices,
    invoiceItems,
    users,
    vessels,
    reservations,
    berthAssignments,
    berths,
    serviceTypes,
} from "../drizzle/schema";
import {
    router,
    operatorProcedure,
    adminProcedure,
    protectedProcedure,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { eRacuniService } from "./services/eRacuniService";

export const invoicesRouter = router({
    /**
     * Popis svih računa s filtriranjem i pretragom
     */
    list: operatorProcedure
        .input(
            z.object({
                paymentStatus: z.enum(["unpaid", "partially_paid", "paid", "cancelled", "ALL"]).optional().default("ALL"),
                invoiceType: z.enum(["crane_operation", "annual_berth_fee", "transit_berth", "membership_fee", "other", "ALL"]).optional().default("ALL"),
                searchQuery: z.string().optional(),
                limit: z.number().min(1).max(100).default(50),
                offset: z.number().min(0).default(0),
            }).optional()
        )
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const conditions = [];

            if (input?.paymentStatus && input.paymentStatus !== "ALL") {
                conditions.push(eq(invoices.paymentStatus, input.paymentStatus));
            }

            if (input?.invoiceType && input.invoiceType !== "ALL") {
                conditions.push(eq(invoices.invoiceType, input.invoiceType));
            }

            if (input?.searchQuery?.trim()) {
                const q = `%${input.searchQuery.trim()}%`;
                conditions.push(
                    or(
                        ilike(invoices.invoiceNumber, q),
                        ilike(users.name, q),
                        ilike(users.firstName, q),
                        ilike(users.lastName, q),
                        ilike(users.oib, q),
                        ilike(vessels.registration, q),
                        ilike(vessels.name, q)
                    )
                );
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            const baseQuery = db
                .select({
                    id: invoices.id,
                    invoiceNumber: invoices.invoiceNumber,
                    documentId: invoices.documentId,
                    invoiceType: invoices.invoiceType,
                    issueDate: invoices.issueDate,
                    dueDate: invoices.dueDate,
                    totalNetAmount: invoices.totalNetAmount,
                    totalVatAmount: invoices.totalVatAmount,
                    totalGrossAmount: invoices.totalGrossAmount,
                    currency: invoices.currency,
                    paymentMethod: invoices.paymentMethod,
                    paymentStatus: invoices.paymentStatus,
                    paidAmount: invoices.paidAmount,
                    paidAt: invoices.paidAt,
                    pdfUrl: invoices.pdfUrl,
                    notes: invoices.notes,
                    createdAt: invoices.createdAt,
                    // Podaci o korisniku / kupcu
                    userId: users.id,
                    userName: users.name,
                    userFirstName: users.firstName,
                    userLastName: users.lastName,
                    userOib: users.oib,
                    userEmail: users.email,
                    userPhone: users.phone,
                    // Podaci o plovilu
                    vesselId: vessels.id,
                    vesselName: vessels.name,
                    vesselRegistration: vessels.registration,
                })
                .from(invoices)
                .innerJoin(users, eq(invoices.userId, users.id))
                .leftJoin(vessels, eq(invoices.vesselId, vessels.id));

            const filteredInvoices = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
                .orderBy(desc(invoices.issueDate))
                .limit(input?.limit || 50)
                .offset(input?.offset || 0);

            // Agregatne statistike
            const stats = {
                totalCount: filteredInvoices.length,
                totalGrossSum: filteredInvoices.reduce((acc, inv) => acc + Number(inv.totalGrossAmount || 0), 0),
                totalPaidSum: filteredInvoices.reduce((acc, inv) => acc + Number(inv.paidAmount || 0), 0),
                unpaidCount: filteredInvoices.filter((inv) => inv.paymentStatus === "unpaid").length,
                paidCount: filteredInvoices.filter((inv) => inv.paymentStatus === "paid").length,
            };

            return {
                invoices: filteredInvoices,
                stats,
            };
        }),

    /**
     * Dohvat detalja pojedinog računa sa stavkama
     */
    getById: operatorProcedure
        .input(z.object({ invoiceId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [invoice] = await db
                .select()
                .from(invoices)
                .where(eq(invoices.id, input.invoiceId))
                .limit(1);

            if (!invoice) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Račun nije pronađen" });
            }

            const items = await db
                .select()
                .from(invoiceItems)
                .where(eq(invoiceItems.invoiceId, input.invoiceId));

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, invoice.userId))
                .limit(1);

            let vessel = null;
            if (invoice.vesselId) {
                const [v] = await db.select().from(vessels).where(eq(vessels.id, invoice.vesselId)).limit(1);
                vessel = v;
            }

            return {
                invoice,
                items,
                user,
                vessel,
            };
        }),

    /**
     * Ručno izdavanje računa (Direct Invoicing)
     */
    createManual: operatorProcedure
        .input(
            z.object({
                userId: z.string().uuid(),
                vesselId: z.string().uuid().optional(),
                invoiceType: z.enum(["crane_operation", "annual_berth_fee", "transit_berth", "membership_fee", "other"]).default("crane_operation"),
                paymentMethod: z.enum(["bank_transfer", "cash", "card", "compensation"]).default("bank_transfer"),
                items: z.array(
                    z.object({
                        productCode: z.string().optional().default("USL-DIZ"),
                        description: z.string(),
                        quantity: z.number().default(1),
                        unit: z.string().default("kom"),
                        netPrice: z.number(),
                        vatRate: z.number().default(25),
                    })
                ).min(1),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen" });
            }

            let vessel = null;
            if (input.vesselId) {
                const [v] = await db.select().from(vessels).where(eq(vessels.id, input.vesselId)).limit(1);
                vessel = v;
            }

            const invoiceNotes = input.notes || "PŠD Špinut lučke usluge";

            let eRacuniResult;
            try {
                eRacuniResult = await eRacuniService.createSalesInvoice({
                    userId: user.id,
                    userName: user.name || `${user.firstName || ""} ${user.lastName || ""}`,
                    userFirstName: user.firstName || undefined,
                    userLastName: user.lastName || undefined,
                    userOib: user.oib || undefined,
                    userEmail: user.email || undefined,
                    userPhone: user.phone || undefined,
                    userAddress: user.address || undefined,
                    userCity: user.city || "Split",
                    userPostalCode: user.postalCode || "21000",
                    isLegalEntity: user.isLegalEntity,
                    companyName: user.companyName || undefined,
                    invoiceType: input.invoiceType,
                    paymentMethod: input.paymentMethod,
                    notes: invoiceNotes,
                    items: input.items.map((i) => ({
                        productCode: i.productCode,
                        description: i.description,
                        quantity: i.quantity,
                        unit: i.unit,
                        netPrice: i.netPrice,
                        vatRate: i.vatRate,
                    })),
                });
            } catch (apiErr: any) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Greška e-računi servisa: ${apiErr.message}`,
                });
            }

            const [createdInvoice] = await db
                .insert(invoices)
                .values({
                    invoiceNumber: eRacuniResult.invoiceNumber,
                    documentId: eRacuniResult.documentId,
                    userId: user.id,
                    vesselId: vessel?.id || null,
                    invoiceType: input.invoiceType,
                    issueDate: new Date(),
                    dueDate: new Date(eRacuniResult.dueDate),
                    dateOfSupply: new Date(),
                    totalNetAmount: eRacuniResult.totalNetAmount.toFixed(2),
                    totalVatAmount: eRacuniResult.totalVatAmount.toFixed(2),
                    totalGrossAmount: eRacuniResult.totalGrossAmount.toFixed(2),
                    currency: "EUR",
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "unpaid",
                    notes: invoiceNotes,
                })
                .returning();

            for (const item of input.items) {
                const net = Number((item.quantity * item.netPrice).toFixed(2));
                const vat = Number((net * (item.vatRate / 100)).toFixed(2));
                const gross = Number((net + vat).toFixed(2));

                await db.insert(invoiceItems).values({
                    invoiceId: createdInvoice.id,
                    productCode: item.productCode,
                    description: item.description,
                    quantity: item.quantity.toString(),
                    unit: item.unit,
                    unitPrice: item.netPrice.toFixed(2),
                    vatRate: item.vatRate.toFixed(2),
                    netAmount: net.toFixed(2),
                    vatAmount: vat.toFixed(2),
                    grossAmount: gross.toFixed(2),
                });
            }

            return createdInvoice;
        }),

    /**
     * Izdavanje računa za operaciju dizalice (Povezano s rezervacijom i e-racuni.com)
     */
    createForReservation: operatorProcedure
        .input(
            z.object({
                reservationId: z.string().uuid(),
                paymentMethod: z.enum(["bank_transfer", "cash", "card", "compensation"]).default("bank_transfer"),
                items: z.array(
                    z.object({
                        productCode: z.string().optional().default("USL-DIZ"),
                        description: z.string(),
                        quantity: z.number().default(1),
                        unit: z.string().default("usluga"),
                        netPrice: z.number(),
                        vatRate: z.number().default(25),
                    })
                ),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            // 1. Dohvati podatke rezervacije
            const [res] = await db
                .select({
                    id: reservations.id,
                    userId: reservations.userId,
                    vesselId: reservations.vesselId,
                    serviceTypeId: reservations.serviceTypeId,
                    scheduledStart: reservations.scheduledStart,
                    status: reservations.status,
                    userNote: reservations.userNote,
                })
                .from(reservations)
                .where(eq(reservations.id, input.reservationId))
                .limit(1);

            if (!res) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Rezervacija dizalice nije pronađena" });
            }

            // 2. Dohvati korisnika i plovilo
            const [user] = await db.select().from(users).where(eq(users.id, res.userId)).limit(1);
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Korisnik nije pronađen" });
            }

            let vessel = null;
            if (res.vesselId) {
                const [v] = await db.select().from(vessels).where(eq(vessels.id, res.vesselId)).limit(1);
                vessel = v;
            }

            // 3. Pošalji na e-racuni.com API
            const invoiceNotes = input.notes || `Operacija dizalice PŠD Špinut — Plovilo: ${vessel?.name || ""} (${vessel?.registration || ""})`;
            
            let eRacuniResult;
            try {
                eRacuniResult = await eRacuniService.createSalesInvoice({
                    userId: user.id,
                    userName: user.name || `${user.firstName || ""} ${user.lastName || ""}`,
                    userFirstName: user.firstName || undefined,
                    userLastName: user.lastName || undefined,
                    userOib: user.oib || undefined,
                    userEmail: user.email || undefined,
                    userPhone: user.phone || undefined,
                    userAddress: user.address || undefined,
                    userCity: user.city || "Split",
                    userPostalCode: user.postalCode || "21000",
                    isLegalEntity: user.isLegalEntity,
                    companyName: user.companyName || undefined,
                    invoiceType: "crane_operation",
                    paymentMethod: input.paymentMethod,
                    notes: invoiceNotes,
                    items: input.items.map((i) => ({
                        productCode: i.productCode,
                        description: i.description,
                        quantity: i.quantity,
                        unit: i.unit,
                        netPrice: i.netPrice,
                        vatRate: i.vatRate,
                    })),
                });
            } catch (apiErr: any) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Greška e-računi servisa: ${apiErr.message}`,
                });
            }

            // 4. Spremi račun u lokalnu PostgreSQL bazu
            const [createdInvoice] = await db
                .insert(invoices)
                .values({
                    invoiceNumber: eRacuniResult.invoiceNumber,
                    documentId: eRacuniResult.documentId,
                    userId: user.id,
                    vesselId: vessel?.id || null,
                    reservationId: res.id,
                    invoiceType: "crane_operation",
                    issueDate: new Date(),
                    dueDate: new Date(eRacuniResult.dueDate),
                    dateOfSupply: new Date(),
                    totalNetAmount: eRacuniResult.totalNetAmount.toFixed(2),
                    totalVatAmount: eRacuniResult.totalVatAmount.toFixed(2),
                    totalGrossAmount: eRacuniResult.totalGrossAmount.toFixed(2),
                    currency: "EUR",
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "unpaid",
                    notes: invoiceNotes,
                })
                .returning();

            // 5. Spremi stavke računa
            for (const item of input.items) {
                const net = Number((item.quantity * item.netPrice).toFixed(2));
                const vat = Number((net * (item.vatRate / 100)).toFixed(2));
                const gross = Number((net + vat).toFixed(2));

                await db.insert(invoiceItems).values({
                    invoiceId: createdInvoice.id,
                    productCode: item.productCode,
                    description: item.description,
                    quantity: item.quantity.toString(),
                    unit: item.unit,
                    unitPrice: item.netPrice.toFixed(2),
                    vatRate: item.vatRate.toFixed(2),
                    netAmount: net.toFixed(2),
                    vatAmount: vat.toFixed(2),
                    grossAmount: gross.toFixed(2),
                });
            }

            return createdInvoice;
        }),

    /**
     * Izdavanje računa za vez (Godišnji ili tranzitni vez)
     */
    createForBerth: operatorProcedure
        .input(
            z.object({
                berthAssignmentId: z.string().uuid(),
                paymentMethod: z.enum(["bank_transfer", "cash", "card", "compensation"]).default("bank_transfer"),
                netPrice: z.number(),
                description: z.string().optional(),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            // 1. Dohvati podatke dodjele veza
            const [assignment] = await db
                .select({
                    id: berthAssignments.id,
                    berthId: berthAssignments.berthId,
                    vesselId: berthAssignments.vesselId,
                    userId: berthAssignments.userId,
                    contractNumber: berthAssignments.contractNumber,
                    berthCode: berths.code,
                })
                .from(berthAssignments)
                .innerJoin(berths, eq(berthAssignments.berthId, berths.id))
                .where(eq(berthAssignments.id, input.berthAssignmentId))
                .limit(1);

            if (!assignment) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Dodjela veza nije pronađena" });
            }

            // 2. Dohvati korisnika i plovilo
            const [user] = await db.select().from(users).where(eq(users.id, assignment.userId)).limit(1);
            const [vessel] = await db.select().from(vessels).where(eq(vessels.id, assignment.vesselId)).limit(1);

            const desc = input.description || `Godišnja naknada za korištenje morskog veza ${assignment.berthCode} (Ugovor: ${assignment.contractNumber || "—"})`;
            const notes = input.notes || `PŠD Špinut — Vez ${assignment.berthCode}, Plovilo: ${vessel?.name || ""} (${vessel?.registration || ""})`;

            // 3. Pošalji na e-racuni.com
            let eRacuniResult;
            try {
                eRacuniResult = await eRacuniService.createSalesInvoice({
                    userId: user.id,
                    userName: user.name || `${user.firstName || ""} ${user.lastName || ""}`,
                    userFirstName: user.firstName || undefined,
                    userLastName: user.lastName || undefined,
                    userOib: user.oib || undefined,
                    userEmail: user.email || undefined,
                    userPhone: user.phone || undefined,
                    userAddress: user.address || undefined,
                    userCity: user.city || "Split",
                    userPostalCode: user.postalCode || "21000",
                    isLegalEntity: user.isLegalEntity,
                    companyName: user.companyName || undefined,
                    invoiceType: "annual_berth_fee",
                    paymentMethod: input.paymentMethod,
                    notes: notes,
                    items: [
                        {
                            productCode: "USL-VEZ",
                            description: desc,
                            quantity: 1,
                            unit: "kom",
                            netPrice: input.netPrice,
                            vatRate: 25,
                        }
                    ],
                });
            } catch (apiErr: any) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Greška e-računi servisa: ${apiErr.message}`,
                });
            }

            // 4. Spremi račun
            const [createdInvoice] = await db
                .insert(invoices)
                .values({
                    invoiceNumber: eRacuniResult.invoiceNumber,
                    documentId: eRacuniResult.documentId,
                    userId: user.id,
                    vesselId: vessel?.id || null,
                    berthAssignmentId: assignment.id,
                    invoiceType: "annual_berth_fee",
                    issueDate: new Date(),
                    dueDate: new Date(eRacuniResult.dueDate),
                    dateOfSupply: new Date(),
                    totalNetAmount: eRacuniResult.totalNetAmount.toFixed(2),
                    totalVatAmount: eRacuniResult.totalVatAmount.toFixed(2),
                    totalGrossAmount: eRacuniResult.totalGrossAmount.toFixed(2),
                    currency: "EUR",
                    paymentMethod: input.paymentMethod,
                    paymentStatus: "unpaid",
                    notes: notes,
                })
                .returning();

            // 5. Spremi stavku
            const net = input.netPrice;
            const vat = Number((net * 0.25).toFixed(2));
            const gross = Number((net + vat).toFixed(2));

            await db.insert(invoiceItems).values({
                invoiceId: createdInvoice.id,
                productCode: "USL-VEZ",
                description: desc,
                quantity: "1",
                unit: "kom",
                unitPrice: input.netPrice.toFixed(2),
                vatRate: "25.00",
                netAmount: net.toFixed(2),
                vatAmount: vat.toFixed(2),
                grossAmount: gross.toFixed(2),
            });

            return createdInvoice;
        }),

    /**
     * Dohvat PDF računa iz e-računa
     */
    getPdf: operatorProcedure
        .input(z.object({ invoiceId: z.string().uuid() }))
        .query(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [invoice] = await db
                .select()
                .from(invoices)
                .where(eq(invoices.id, input.invoiceId))
                .limit(1);

            if (!invoice) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Račun nije pronađen" });
            }

            if (!invoice.documentId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Račun nema povezani ID u e-računima" });
            }

            const pdfData = await eRacuniService.getSalesInvoicePdf(invoice.documentId);
            return pdfData;
        }),

    /**
     * Sinkronizacija stanja uplate iz e-racuni.com
     */
    syncPaymentStatus: operatorProcedure
        .input(z.object({ invoiceId: z.string().uuid() }))
        .mutation(async ({ input }) => {
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Baza nije dostupna" });

            const [invoice] = await db
                .select()
                .from(invoices)
                .where(eq(invoices.id, input.invoiceId))
                .limit(1);

            if (!invoice?.documentId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Račun nije pronađen" });
            }

            const details = await eRacuniService.getSalesInvoice(invoice.documentId);

            // Ažuriraj status plaćanja na temelju podataka iz e-računa
            let newStatus: "unpaid" | "partially_paid" | "paid" | "cancelled" = "unpaid";
            const paidAmount = Number(details.paidAmount || 0);
            const totalGross = Number(details.totalGrossAmount || invoice.totalGrossAmount);

            if (paidAmount >= totalGross && totalGross > 0) {
                newStatus = "paid";
            } else if (paidAmount > 0) {
                newStatus = "partially_paid";
            }

            const [updated] = await db
                .update(invoices)
                .set({
                    paymentStatus: newStatus,
                    paidAmount: paidAmount.toFixed(2),
                    paidAt: details.datePaid ? new Date(details.datePaid) : null,
                    updatedAt: new Date(),
                })
                .where(eq(invoices.id, invoice.id))
                .returning();

            return updated;
        }),
});
