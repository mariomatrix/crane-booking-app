/**
 * PŠD Špinut — Upravljanje računima & e-racuni.com integracija
 * 
 * Pregled izdanih računa, automatsko izdavanje računa za dizalicu i vezove,
 * preuzimanje PDF računa s 2D barkodom i sinkronizacija uplata iz e-racuni.com.
 */
import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Search,
    Receipt,
    FileText,
    Download,
    RefreshCw,
    Plus,
    CheckCircle2,
    Clock,
    AlertCircle,
    X,
    ExternalLink,
    Building2,
    Ship,
    User,
    CreditCard,
    DollarSign,
    QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Statusi plaćanja
const PAYMENT_STATUS_CONFIG: Record<
    string,
    { label: string; bg: string; text: string; dot: string }
> = {
    paid: {
        label: "Plaćeno",
        bg: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
        text: "text-emerald-700",
        dot: "bg-emerald-500",
    },
    unpaid: {
        label: "Nenaplaćeno",
        bg: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800",
        text: "text-amber-700",
        dot: "bg-amber-500",
    },
    partially_paid: {
        label: "Djelomično plaćeno",
        bg: "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800",
        text: "text-blue-700",
        dot: "bg-blue-500",
    },
    cancelled: {
        label: "Stornirano",
        bg: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
        text: "text-slate-600",
        dot: "bg-slate-500",
    },
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
    crane_operation: "Dizalica (Operacija)",
    annual_berth_fee: "Godišnji vez",
    transit_berth: "Tranzitni vez",
    membership_fee: "Članarina",
    other: "Ostale usluge",
};

export default function AdminInvoices() {
    const [, setLocation] = useLocation();

    // Filtri i pretraga
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [typeFilter, setTypeFilter] = useState<string>("ALL");

    // Odabrani račun za modal detalja
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

    // Modal za izdavanje novog računa
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [invoiceType, setInvoiceType] = useState<string>("crane_operation");
    const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash" | "card">("bank_transfer");
    const [itemDescription, setItemDescription] = useState("Dizanje plovila iz mora");
    const [itemNetPrice, setItemNetPrice] = useState("100.00");
    const [itemQuantity, setItemQuantity] = useState("1");
    const [invoiceNotes, setInvoiceNotes] = useState("");

    // tRPC Queryji
    const { data, isLoading, refetch } = trpc.invoices.list.useQuery({
        paymentStatus: statusFilter as any,
        invoiceType: typeFilter as any,
        searchQuery: searchQuery || undefined,
    });

    const { data: invoiceDetails } = trpc.invoices.getById.useQuery(
        { invoiceId: selectedInvoiceId! },
        { enabled: !!selectedInvoiceId }
    );

    const { data: usersData } = trpc.user.list.useQuery(
        { search: userSearchQuery || undefined, page: 1, pageSize: 50 },
        { enabled: isCreateModalOpen }
    );
    const allUsers = usersData?.data || [];

    // tRPC Mutacije
    const syncPaymentMutation = trpc.invoices.syncPaymentStatus.useMutation({
        onSuccess: () => {
            toast.success("Status uplate uspješno osvježen iz e-računa");
            refetch();
        },
        onError: (err) => toast.error(`Greška pri sinkronizaciji: ${err.message}`),
    });

    const createReservationInvoiceMutation = trpc.invoices.createForReservation.useMutation({
        onSuccess: (inv) => {
            toast.success(`Račun ${inv.invoiceNumber} uspješno izdan u e-racuni.com!`);
            setIsCreateModalOpen(false);
            refetch();
        },
        onError: (err) => toast.error(`Greška: ${err.message}`),
    });

    const handleDownloadPdf = async (invoiceId: string, invoiceNumber: string) => {
        toast.info(`Preuzimanje PDF računa ${invoiceNumber}...`);
        try {
            // Poziv PDF endpointa
            window.open(`/api/invoices/${invoiceId}/pdf`, "_blank");
        } catch {
            toast.error("Nije uspjelo preuzimanje PDF-a.");
        }
    };

    const stats = data?.stats || {
        totalCount: 0,
        totalGrossSum: 0,
        totalPaidSum: 0,
        unpaidCount: 0,
        paidCount: 0,
    };

    return (
        <div className="flex flex-col gap-5 p-6 max-w-[1600px] mx-auto">
            {/* ─── Zaglavlje & Status integracije ──────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                        <Receipt className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                Računi & e-Računi (Eurofaktura)
                            </h1>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                e-racuni.com API Aktivan
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Automatizirano izdavanje računa za dizalicu, ugovore o vezu, članarine i fiskalizacija
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        className="text-xs"
                    >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Osvježi
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    >
                        <Plus className="w-4 h-4 mr-1.5" /> Izdaj novi račun
                    </Button>
                </div>
            </div>

            {/* ─── KPI Kartice s financijskim pokazateljima ────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm border-l-4 border-l-blue-600">
                    <CardHeader className="p-4 pb-1">
                        <CardDescription className="text-xs font-semibold">Ukupno fakturirano (Bruto)</CardDescription>
                        <CardTitle className="text-2xl font-bold text-foreground">
                            {stats.totalGrossSum.toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                        Iz {stats.totalCount} izdanih računa
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-emerald-600">
                    <CardHeader className="p-4 pb-1">
                        <CardDescription className="text-xs font-semibold">Naplaćeno</CardDescription>
                        <CardTitle className="text-2xl font-bold text-emerald-600">
                            {stats.totalPaidSum.toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{stats.paidCount} plaćenih računa</span>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="p-4 pb-1">
                        <CardDescription className="text-xs font-semibold">Nenaplaćeno / Dospjelo</CardDescription>
                        <CardTitle className="text-2xl font-bold text-amber-600">
                            {(stats.totalGrossSum - stats.totalPaidSum).toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>{stats.unpaidCount} otvorenih računa</span>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-l-4 border-l-slate-600">
                    <CardHeader className="p-4 pb-1">
                        <CardDescription className="text-xs font-semibold">Povezana organizacija</CardDescription>
                        <CardTitle className="text-base font-bold text-foreground truncate">
                            Test Imago matrix
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                        OIB: <strong>46372455133</strong> (e-racuni.com)
                    </CardContent>
                </Card>
            </div>

            {/* ─── Kontrolna traka za pretraživanje i filtriranje ──────────────── */}
            <Card className="shadow-sm">
                <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                        {/* Tražilica */}
                        <div className="relative w-72">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Traži br. računa, člana, OIB, reg..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 text-xs"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Status plaćanja */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-44 h-9 text-xs">
                                <SelectValue placeholder="Status plaćanja" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Svi statusi plaćanja</SelectItem>
                                <SelectItem value="paid">🟩 Plaćeno</SelectItem>
                                <SelectItem value="unpaid">🟨 Nenaplaćeno</SelectItem>
                                <SelectItem value="partially_paid">🟦 Djelomično plaćeno</SelectItem>
                                <SelectItem value="cancelled">⬛ Stornirano</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Tip računa */}
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-48 h-9 text-xs">
                                <SelectValue placeholder="Tip usluge" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Sve usluge</SelectItem>
                                <SelectItem value="crane_operation">🏗️ Dizalica (Operacije)</SelectItem>
                                <SelectItem value="annual_berth_fee">⚓ Godišnji vez</SelectItem>
                                <SelectItem value="transit_berth">⛵ Tranzitni vez</SelectItem>
                                <SelectItem value="membership_fee">🎫 Članarina</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="text-xs text-muted-foreground font-medium">
                        Prikazano: <strong>{data?.invoices.length || 0}</strong> računa
                    </div>
                </CardContent>
            </Card>

            {/* ─── Glavna tablica računa ───────────────────────────────────────── */}
            <Card className="shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/60 text-muted-foreground font-semibold">
                                <th className="p-3.5">Broj računa</th>
                                <th className="p-3.5">Datum / Dospijeće</th>
                                <th className="p-3.5">Kupac / Član</th>
                                <th className="p-3.5">Plovilo</th>
                                <th className="p-3.5">Tip usluge</th>
                                <th className="p-3.5">Plaćanje</th>
                                <th className="p-3.5 text-right">Iznos (Bruto)</th>
                                <th className="p-3.5 text-center">Status</th>
                                <th className="p-3.5 text-right">Akcije</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                                        Učitavanje računa...
                                    </td>
                                </tr>
                            ) : !data?.invoices || data.invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-12 text-center text-muted-foreground">
                                        <Receipt className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                                        <p className="font-semibold text-sm">Nema izdanih računa</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Izdajte prvi račun klikom na gumb "+ Izdaj novi račun"
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                data.invoices.map((inv) => {
                                    const statusCfg = PAYMENT_STATUS_CONFIG[inv.paymentStatus] || PAYMENT_STATUS_CONFIG.unpaid;
                                    return (
                                        <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                                            {/* Broj računa */}
                                            <td className="p-3.5">
                                                <div className="flex flex-col">
                                                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                                        {inv.invoiceNumber}
                                                    </span>
                                                    {inv.documentId && (
                                                        <span className="text-[10px] text-muted-foreground font-mono">
                                                            ID: {inv.documentId}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Datum / Dospijeće */}
                                            <td className="p-3.5">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">
                                                        {new Date(inv.issueDate).toLocaleDateString("hr-HR")}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Dosp: {new Date(inv.dueDate).toLocaleDateString("hr-HR")}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Kupac / Član */}
                                            <td className="p-3.5">
                                                <div className="flex flex-col">
                                                    <strong className="text-foreground">
                                                        {inv.userName || `${inv.userFirstName || ""} ${inv.userLastName || ""}`}
                                                    </strong>
                                                    {inv.userOib && (
                                                        <span className="text-[10px] text-muted-foreground font-mono">
                                                            OIB: {inv.userOib}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Plovilo */}
                                            <td className="p-3.5">
                                                {inv.vesselRegistration || inv.vesselName ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Ship className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                        <span className="font-mono font-semibold text-xs">
                                                            {inv.vesselRegistration || inv.vesselName}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>

                                            {/* Tip usluge */}
                                            <td className="p-3.5">
                                                <Badge variant="outline" className="text-[11px] font-normal">
                                                    {INVOICE_TYPE_LABELS[inv.invoiceType] || inv.invoiceType}
                                                </Badge>
                                            </td>

                                            {/* Način plaćanja */}
                                            <td className="p-3.5 capitalize text-muted-foreground">
                                                {inv.paymentMethod === "bank_transfer" ? "Virman / IBAN" : inv.paymentMethod}
                                            </td>

                                            {/* Iznos */}
                                            <td className="p-3.5 text-right font-mono font-bold text-sm text-foreground">
                                                {Number(inv.totalGrossAmount).toFixed(2)} €
                                            </td>

                                            {/* Status */}
                                            <td className="p-3.5 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                                                    {statusCfg.label}
                                                </span>
                                            </td>

                                            {/* Akcije */}
                                            <td className="p-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => setSelectedInvoiceId(inv.id)}
                                                    >
                                                        Detalji
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 px-2 text-xs border-blue-300 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50"
                                                        onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                                        title="Preuzmi PDF račun"
                                                    >
                                                        <Download className="w-3 h-3 mr-1" /> PDF
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* ─── Modal za detalje računa ─────────────────────────────────────── */}
            <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
                <DialogContent className="sm:max-w-[620px]">
                    <DialogHeader>
                        <div className="flex items-center justify-between border-b pb-3">
                            <div>
                                <DialogTitle className="text-lg font-bold">
                                    Račun {invoiceDetails?.invoice.invoiceNumber}
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    Interni e-racuni ID: <strong>{invoiceDetails?.invoice.documentId || "—"}</strong>
                                </DialogDescription>
                            </div>
                            {invoiceDetails && (
                                <Badge className="text-xs">
                                    {PAYMENT_STATUS_CONFIG[invoiceDetails.invoice.paymentStatus]?.label}
                                </Badge>
                            )}
                        </div>
                    </DialogHeader>

                    {invoiceDetails && (
                        <div className="flex flex-col gap-4 py-2 text-xs">
                            {/* Kupac & Plovilo */}
                            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg border">
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">Kupac (Član):</span>
                                    <strong className="text-sm">{invoiceDetails.user?.name || `${invoiceDetails.user?.firstName} ${invoiceDetails.user?.lastName}`}</strong>
                                    {invoiceDetails.user?.oib && (
                                        <p className="font-mono text-muted-foreground">OIB: {invoiceDetails.user.oib}</p>
                                    )}
                                    <p className="text-muted-foreground">{invoiceDetails.user?.address}, {invoiceDetails.user?.city}</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">Plovilo:</span>
                                    <strong>{invoiceDetails.vessel?.name || "—"}</strong>
                                    {invoiceDetails.vessel?.registration && (
                                        <p className="font-mono text-blue-600 font-bold">{invoiceDetails.vessel.registration}</p>
                                    )}
                                    <p className="text-muted-foreground">
                                        LOA: {invoiceDetails.vessel?.lengthM ? `${invoiceDetails.vessel.lengthM}m` : "—"}
                                    </p>
                                </div>
                            </div>

                            {/* Stavke računa */}
                            <div className="flex flex-col gap-1.5">
                                <label className="font-semibold">Stavke računa:</label>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-muted/60 text-muted-foreground font-semibold border-b">
                                                <th className="p-2">Opis</th>
                                                <th className="p-2 text-center">Kol.</th>
                                                <th className="p-2 text-right">Cijena (Neto)</th>
                                                <th className="p-2 text-center">PDV</th>
                                                <th className="p-2 text-right">Ukupno</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {invoiceDetails.items.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="p-2 font-medium">{item.description}</td>
                                                    <td className="p-2 text-center">{item.quantity} {item.unit}</td>
                                                    <td className="p-2 text-right font-mono">{Number(item.unitPrice).toFixed(2)} €</td>
                                                    <td className="p-2 text-center">{item.vatRate}%</td>
                                                    <td className="p-2 text-right font-mono font-bold">{Number(item.grossAmount).toFixed(2)} €</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Rekapitulacija */}
                            <div className="flex justify-end pt-2 border-t">
                                <div className="w-64 flex flex-col gap-1 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Osnovica (Neto):</span>
                                        <span className="font-mono">{Number(invoiceDetails.invoice.totalNetAmount).toFixed(2)} €</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">PDV (25%):</span>
                                        <span className="font-mono">{Number(invoiceDetails.invoice.totalVatAmount).toFixed(2)} €</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold border-t pt-1">
                                        <span>UKUPNO ZA UPLATU:</span>
                                        <span className="text-blue-600 font-mono">{Number(invoiceDetails.invoice.totalGrossAmount).toFixed(2)} €</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (selectedInvoiceId) {
                                    syncPaymentMutation.mutate({ invoiceId: selectedInvoiceId });
                                }
                            }}
                            disabled={syncPaymentMutation.isPending}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncPaymentMutation.isPending ? "animate-spin" : ""}`} />
                            Osvježi uplatu iz e-računa
                        </Button>
                        <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => {
                                if (selectedInvoiceId && invoiceDetails) {
                                    handleDownloadPdf(selectedInvoiceId, invoiceDetails.invoice.invoiceNumber);
                                }
                            }}
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Preuzmi PDF
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
