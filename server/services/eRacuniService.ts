/**
 * PŠD Špinut — e-racuni.com / Eurofaktura Web Services API Client
 * 
 * Integracija s e-racuni.com za:
 * 1. Automatsku sinkronizaciju kupaca / članova (PartnerCreate / PartnerUpdate / PartnerList)
 * 2. Automatsko izdavanje računa za dizalicu, ugovore o vezu i članarine (SalesInvoiceCreate)
 * 3. Dohvat PDF računa (SalesInvoicePdf / SalesInvoiceGet)
 * 4. Provjeru statusa plaćanja (SalesInvoiceGet)
 */

export interface ERacuniConfig {
    apiUrl: string;
    username: string;
    secretKey: string;
    token: string;
}

export interface ERacuniItem {
    description: string;
    quantity: number;
    unit?: string; // npr. "kom", "m", "dan", "sat"
    netPrice: number;
    vatRate?: number; // npr. 25 ili 0
    discount?: number; // postotak popusta
    itemCode?: string;
    productCode?: string;
}

export interface CreateInvoiceParams {
    userId: string;
    userName: string;
    userFirstName?: string;
    userLastName?: string;
    userOib?: string;
    userEmail?: string;
    userPhone?: string;
    userAddress?: string;
    userCity?: string;
    userPostalCode?: string;
    isLegalEntity?: boolean;
    companyName?: string;
    
    // Podaci o računu
    invoiceType?: "crane_operation" | "annual_berth_fee" | "transit_berth" | "membership_fee" | "other";
    date?: Date;
    dateDue?: Date;
    dateOfSupply?: Date;
    paymentMethod?: "bank_transfer" | "cash" | "card" | "compensation";
    currency?: string;
    notes?: string;
    items: ERacuniItem[];
}

export class ERacuniService {
    private config: ERacuniConfig;

    constructor(config?: Partial<ERacuniConfig>) {
        this.config = {
            apiUrl: config?.apiUrl || process.env.ERACUNI_API_URL || "https://eurofaktura.com/WebServicesHR/API",
            username: config?.username || process.env.ERACUNI_USERNAME || "MATRIXKIKO",
            secretKey: config?.secretKey || process.env.ERACUNI_MD5PASS || "c68b660b7f8cd92f154403cfb92a9569",
            token: config?.token || process.env.ERACUNI_TOKEN || "158468358A150E00B49123A709B66C2C",
        };
    }

    /**
     * Izvršavanje generičkog JSON API poziva prema e-racuni.com
     */
    async callApi<T = any>(method: string, parameters: any = {}): Promise<T> {
        const payload = {
            username: this.config.username,
            secretKey: this.config.secretKey,
            token: this.config.token,
            method,
            parameters,
        };

        const response = await fetch(this.config.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`e-racuni API HTTP ${response.status}: ${errorText}`);
        }

        const json = await response.json();

        if (json.response?.status === "error") {
            const msg = json.response?.error?.message || json.response?.error || JSON.stringify(json.response);
            throw new Error(`e-racuni API greška: ${msg}`);
        }

        return (json.response?.result ?? json.response) as T;
    }

    /**
     * Pronalaženje ili kreiranje Partnera (Kupca / Člana) u e-racuni.com
     */
    async syncPartner(user: {
        id: string;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        oib?: string | null;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
        city?: string | null;
        postalCode?: string | null;
        isLegalEntity?: boolean | null;
        companyName?: string | null;
    }): Promise<{ partnerDocumentId: string; partnerCode?: string }> {
        // 1. Ako imamo OIB ili email, prvo provjeri postoji li već partner
        const cleanOib = user.oib?.trim() || "";
        const cleanEmail = user.email?.trim() || "";

        try {
            const existingPartners = await this.callApi<any[]>("PartnerList", {});
            if (Array.isArray(existingPartners)) {
                const match = existingPartners.find((p) => {
                    if (cleanOib && (p.personalID === cleanOib || p.vatRegistration === cleanOib)) return true;
                    if (cleanEmail && p.eMail && p.eMail.toLowerCase() === cleanEmail.toLowerCase()) return true;
                    return false;
                });

                if (match?.documentID) {
                    console.log(`[eRacuni] Partner već postoji: ${match.documentID} (${match.firstName || ""} ${match.lastName || match.companyName || ""})`);
                    return {
                        partnerDocumentId: match.documentID,
                        partnerCode: match.code,
                    };
                }
            }
        } catch (e: any) {
            console.warn("[eRacuni] Greška pri dohvatu PartnerList:", e.message);
        }

        // 2. Ako ne postoji, kreiraj novog partnera
        const displayName = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.companyName || "Član PŠD Špinut";
        const partnerPayload: any = {
            partner: {
                firstName: user.firstName || displayName.split(" ")[0] || "Član",
                lastName: user.lastName || displayName.split(" ").slice(1).join(" ") || "Špinut",
                companyName: user.isLegalEntity ? (user.companyName || displayName) : undefined,
                companyType: user.isLegalEntity ? "Ltd" : undefined,
                personalID: cleanOib || undefined,
                vatRegistration: user.isLegalEntity && cleanOib ? cleanOib : undefined,
                eMail: cleanEmail || undefined,
                addresses: [
                    {
                        street: user.address || "Lučica Špinut bb",
                        postalCode: user.postalCode || "21000",
                        city: user.city || "Split",
                        country: "HR",
                        telephone: user.phone || undefined,
                        type: "Primary",
                    }
                ]
            }
        };

        const createRes = await this.callApi<{ documentID: string; code?: string }>("PartnerCreate", partnerPayload);
        console.log(`[eRacuni] Kreiran novi partner: ${createRes.documentID}`);

        return {
            partnerDocumentId: createRes.documentID,
            partnerCode: createRes.code,
        };
    }

    /**
     * Izdavanje izlaznog računa (SalesInvoiceCreate)
     */
    async createSalesInvoice(params: CreateInvoiceParams): Promise<{
        documentId: string;
        invoiceNumber: string;
        totalNetAmount: number;
        totalVatAmount: number;
        totalGrossAmount: number;
        issueDate: string;
        dueDate: string;
        pdfUrl?: string;
    }> {
        // 1. Sinkroniziraj kupca / partnera
        const { partnerDocumentId } = await this.syncPartner({
            id: params.userId,
            name: params.userName,
            firstName: params.userFirstName,
            lastName: params.userLastName,
            oib: params.userOib,
            email: params.userEmail,
            phone: params.userPhone,
            address: params.userAddress,
            city: params.userCity,
            postalCode: params.userPostalCode,
            isLegalEntity: params.isLegalEntity,
            companyName: params.companyName,
        });

        // 2. Formatiranje datuma (YYYY-MM-DD)
        const formatDate = (d?: Date) => {
            const dateObj = d || new Date();
            return dateObj.toISOString().split("T")[0];
        };

        const docDate = formatDate(params.date);
        const dateDue = formatDate(params.dateDue || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)); // 15 dana rok
        const dateSupply = formatDate(params.dateOfSupply);

        // 3. Mapiranje načina plaćanja
        const paymentMethodMap: Record<string, string> = {
            bank_transfer: "WireTransfer",
            cash: "Cash",
            card: "CreditCard",
            compensation: "Compensation",
        };
        const mappedPaymentMethod = paymentMethodMap[params.paymentMethod || "bank_transfer"] || "WireTransfer";

        // 4. Priprema stavki računa
        let calculatedNet = 0;
        let calculatedVat = 0;
        let calculatedGross = 0;

        const formattedItems = params.items.map((item) => {
            const vatRate = item.vatRate !== undefined ? item.vatRate : 25;
            const net = Number((item.quantity * item.netPrice * (1 - (item.discount || 0) / 100)).toFixed(2));
            const vat = Number((net * (vatRate / 100)).toFixed(2));
            const gross = Number((net + vat).toFixed(2));

            calculatedNet += net;
            calculatedVat += vat;
            calculatedGross += gross;

            return {
                productCode: item.productCode || item.itemCode || "USL-DIZ",
                description: item.description,
                quantity: item.quantity,
                unit: item.unit || "kom",
                netPrice: item.netPrice,
                vatRate: vatRate,
                discountPercent: item.discount || 0,
            };
        });

        // 5. Slanje na SalesInvoiceCreate
        const invoicePayload: any = {
            salesInvoice: {
                buyerPartnerID: partnerDocumentId,
                date: docDate,
                dateDue: dateDue,
                dateOfSupplyFrom: dateSupply,
                dateOfSupplyTo: dateSupply,
                paymentMethod: mappedPaymentMethod,
                currency: params.currency || "EUR",
                remarks: params.notes || "PŠD Špinut lučke usluge",
                items: formattedItems,
            }
        };

        const res = await this.callApi<{ documentID: string; number?: string }>("SalesInvoiceCreate", invoicePayload);
        const documentId = res.documentID;
        const invoiceNumber = res.number || `R-${documentId}`;

        console.log(`[eRacuni] Uspješno kreiran račun br. ${invoiceNumber} (ID: ${documentId})`);

        return {
            documentId,
            invoiceNumber,
            totalNetAmount: calculatedNet,
            totalVatAmount: calculatedVat,
            totalGrossAmount: calculatedGross,
            issueDate: docDate,
            dueDate: dateDue,
        };
    }

    /**
     * Dohvat detalja računa i provjera stanja plaćanja (SalesInvoiceGet)
     */
    async getSalesInvoice(documentId: string): Promise<any> {
        return this.callApi("SalesInvoiceGet", { documentID: documentId });
    }

    /**
     * Dohvat PDF-a računa (SalesInvoicePdf)
     */
    async getSalesInvoicePdf(documentId: string): Promise<{ pdfUrl?: string; pdfBase64?: string }> {
        try {
            const res = await this.callApi<any>("SalesInvoicePdf", { documentID: documentId });
            if (res.pdfBase64) {
                return { pdfBase64: res.pdfBase64 };
            }
            if (res.url) {
                return { pdfUrl: res.url };
            }
            return res;
        } catch (e: any) {
            console.warn(`[eRacuni] Nije uspio dohvat PDF-a za račun ${documentId}:`, e.message);
            return {};
        }
    }
}

// Singleton instanca servisa
export const eRacuniService = new ERacuniService();
