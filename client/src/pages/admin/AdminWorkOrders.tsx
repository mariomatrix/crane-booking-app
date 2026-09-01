import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    FileText,
    Download,
    Play,
    CheckCircle2,
    XCircle,
    Clock,
    Search,
    Filter,
    ShieldCheck,
    AlertCircle,
    Eye,
    Printer,
    Receipt,
    Calculator,
    Ship,
    Calendar,
    Loader2,
} from "lucide-react";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { WorkOrderPdf } from "@/components/WorkOrderPdfTemplate";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export default function AdminWorkOrders() {
    const [clientTypeFilter, setClientTypeFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [search, setSearch] = useState<string>("");
    const [selectedOrderForPdf, setSelectedOrderForPdf] = useState<any | null>(null);

    // Unified Quote Modal State
    const [quoteWorkOrderId, setQuoteWorkOrderId] = useState<string | null>(null);
    const [quoteDocumentType, setQuoteDocumentType] = useState<"proforma" | "invoice">("proforma");
    const [quotePaymentMethod, setQuotePaymentMethod] = useState<"bank_transfer" | "cash" | "card" | "compensation">("bank_transfer");

    const utils = trpc.useUtils();

    const { data: orders = [], isLoading } = trpc.workOrders.list.useQuery({
        clientType: clientTypeFilter === "all" ? undefined : (clientTypeFilter as any),
        status: statusFilter === "all" ? undefined : (statusFilter as any),
    });

    const { data: cycleSummary, isLoading: isLoadingCycle } = trpc.workOrders.getUnifiedCycleSummary.useQuery(
        { workOrderId: quoteWorkOrderId! },
        { enabled: !!quoteWorkOrderId }
    );

    const generateQuoteMutation = trpc.workOrders.generateUnifiedQuote.useMutation({
        onSuccess: (inv) => {
            toast.success(`Jedinstvena ponuda ${inv.invoiceNumber} uspješno kreirana!`);
            setQuoteWorkOrderId(null);
            utils.invoices.list.invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Greška pri kreiranju ponude."),
    });

    const filteredOrders = orders.filter((o: any) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            o.orderNumber?.toLowerCase().includes(q) ||
            o.userName?.toLowerCase().includes(q) ||
            o.userOib?.includes(q) ||
            o.vesselName?.toLowerCase().includes(q) ||
            o.vesselRegistration?.toLowerCase().includes(q)
        );
    });

    // Metrics
    const totalCount = filteredOrders.length;
    const completedCount = filteredOrders.filter((o: any) => o.status === "completed").length;
    const statutoryCoveredCount = filteredOrders.filter((o: any) => o.isStatutoryCovered).length;
    const memberAdjustmentsCount = filteredOrders.filter((o: any) => o.chargeItemCode !== null).length;
    const externalCommercialCount = filteredOrders.filter((o: any) => o.clientType === "external").length;

    const handleExportExcel = () => {
        const rows = filteredOrders.map((o: any) => ({
            "Broj radnog naloga": o.orderNumber,
            "Datum": o.startedAt ? new Date(o.startedAt).toLocaleDateString("hr-HR") : "",
            "Korisnik": o.userName,
            "OIB": o.userOib,
            "Tip korisnika": o.clientType === "member" ? "Član PŠD" : "Vanjski",
            "Plovilo": o.vesselName,
            "Registracija": o.vesselRegistration,
            "Duljina (m)": o.vesselLengthM,
            "Dizalica": o.craneName,
            "Status naloga": o.status,
            "Statutarno pokriveno": o.isStatutoryCovered ? "DA (0,00 €)" : "NE",
            "Zaduženje u kartonu (ERP)": o.chargeItemCode || "",
            "Komercijalni iznos (EUR)": o.commercialTotal || "",
            "Trajanje (min)": o.actualDurationMin || "",
            "ERP status": o.erpSyncStatus,
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Radni nalozi");
        XLSX.writeFile(wb, `Radni_Nalozi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleCreateQuote = () => {
        if (!cycleSummary?.vessel?.id || !cycleSummary?.user?.id) return;
        generateQuoteMutation.mutate({
            vesselId: cycleSummary.vessel.id,
            userId: cycleSummary.user.id,
            documentType: quoteDocumentType,
            paymentMethod: quotePaymentMethod,
            dueDateDays: 14,
        });
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <FileText className="h-7 w-7 text-primary" />
                        Dnevnik Radnih Naloga & Obračun
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Službena evidencija radnih naloga dizalica (RN-YYYY-XXXXX), resursa i izrada jedinstvenih ponuda za cjelokupni ciklus.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportExcel} className="gap-1.5 rounded-xl">
                        <Download className="h-4 w-4" />
                        Izvoz u Excel (ERP)
                    </Button>
                </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card className="bg-card/50 shadow-sm border-l-4 border-l-primary rounded-2xl">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Ukupno naloga</CardDescription>
                        <CardTitle className="text-2xl font-bold">{totalCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-emerald-500 rounded-2xl">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">U članskoj kvoti</CardDescription>
                        <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{statutoryCoveredCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-amber-500 rounded-2xl">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Doplata članarine</CardDescription>
                        <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">{memberAdjustmentsCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-blue-500 rounded-2xl">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Vanjski komercijalni</CardDescription>
                        <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">{externalCommercialCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-green-600 rounded-2xl">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Zaključeno</CardDescription>
                        <CardTitle className="text-2xl font-bold text-green-700 dark:text-green-300">{completedCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filter bar */}
            <Card className="rounded-2xl">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-3 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pretraži po broju naloga, imenu člana, OIB-u ili nazivu plovila..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
                                <SelectTrigger className="w-[160px] rounded-xl">
                                    <SelectValue placeholder="Tip korisnika" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    <SelectItem value="all">Svi korisnici</SelectItem>
                                    <SelectItem value="member">Samo članovi PŠD</SelectItem>
                                    <SelectItem value="external">Samo vanjski</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[150px] rounded-xl">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    <SelectItem value="all">Svi statusi</SelectItem>
                                    <SelectItem value="in_progress">U tijeku</SelectItem>
                                    <SelectItem value="completed">Zaključeno</SelectItem>
                                    <SelectItem value="cancelled">Stornirano</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="rounded-2xl shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[130px]">Broj naloga</TableHead>
                                <TableHead>Datum & Vrijeme</TableHead>
                                <TableHead>Korisnik / OIB</TableHead>
                                <TableHead>Plovilo</TableHead>
                                <TableHead>Dizalica</TableHead>
                                <TableHead>Status & Obračun</TableHead>
                                <TableHead className="text-right">Radnje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Učitavanje radnih naloga...
                                    </TableCell>
                                </TableRow>
                            ) : filteredOrders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Nema pronađenih radnih naloga za zadane filtere.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredOrders.map((o: any) => (
                                    <TableRow key={o.id} className="hover:bg-muted/30">
                                        <TableCell className="font-mono font-bold text-sm">
                                            {o.orderNumber}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div>{o.startedAt ? new Date(o.startedAt).toLocaleDateString("hr-HR") : "—"}</div>
                                            <div className="text-muted-foreground">{o.startedAt ? new Date(o.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""} h</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm">{o.userName || "Korisnik"}</div>
                                            <div className="text-xs text-muted-foreground">
                                                OIB: {o.userOib || "—"} • {o.clientType === "member" ? (
                                                    <span className="text-emerald-600 font-semibold">Član</span>
                                                ) : (
                                                    <span className="text-blue-600 font-semibold">Vanjski</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div className="font-medium">{o.vesselName || "Plovilo"}</div>
                                            <div className="text-muted-foreground">{o.vesselRegistration || "—"} ({o.vesselLengthM ? `${o.vesselLengthM} m` : "—"})</div>
                                        </TableCell>
                                        <TableCell className="text-xs font-medium">
                                            {o.craneName || "Dizalica"}
                                        </TableCell>
                                        <TableCell>
                                            {o.isStatutoryCovered ? (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-xs">
                                                    <ShieldCheck className="h-3 w-3 mr-1" /> Članarina (0 €)
                                                </Badge>
                                            ) : o.clientType === "member" ? (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">
                                                    <AlertCircle className="h-3 w-3 mr-1" /> Doplata {o.chargeItemCode}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 text-xs">
                                                    {o.commercialTotal ? `${o.commercialTotal} €` : "Po metru"}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold rounded-lg"
                                                    onClick={() => setQuoteWorkOrderId(o.id)}
                                                >
                                                    <Receipt className="h-3.5 w-3.5" />
                                                    Jedinstvena Ponuda
                                                </Button>
                                                <Link href={`/admin/users/${o.userId}`}>
                                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-primary hover:bg-primary/10 rounded-lg">
                                                        Karton
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-xs gap-1 rounded-lg"
                                                    onClick={() => setSelectedOrderForPdf(o)}
                                                >
                                                    <Printer className="h-3.5 w-3.5" />
                                                    A4
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Unified Cycle Quote Modal */}
            {quoteWorkOrderId && (
                <Dialog open={!!quoteWorkOrderId} onOpenChange={() => setQuoteWorkOrderId(null)}>
                    <DialogContent className="max-w-2xl rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
                        <DialogHeader className="border-b pb-3">
                            <div className="flex items-center gap-2">
                                <Receipt className="h-5 w-5 text-indigo-600" />
                                <DialogTitle className="text-lg font-bold">
                                    Jedinstvena Ponuda / Obračun Ciklusa
                                </DialogTitle>
                            </div>
                            <DialogDescription>
                                Objedinjeni obračun: Vađenje + Suhi vez (dani) + Spuštanje + Dodatni resursi.
                            </DialogDescription>
                        </DialogHeader>

                        {isLoadingCycle ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                            </div>
                        ) : cycleSummary ? (
                            <div className="space-y-4 py-2 text-xs">
                                {/* User & Vessel summary */}
                                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                                    <div>
                                        <span className="font-bold text-[10px] uppercase text-slate-400 block">Klijent / Vlasnik</span>
                                        <span className="font-bold text-slate-900 text-sm">{cycleSummary.user.name}</span>
                                        <div className="text-slate-500">OIB: {cycleSummary.user.oib || "—"}</div>
                                        <Badge className={cycleSummary.user.isMember ? "bg-emerald-100 text-emerald-800 border-0 mt-1 text-[10px]" : "bg-blue-100 text-blue-800 border-0 mt-1 text-[10px]"}>
                                            {cycleSummary.user.isMember ? "Stalni član (30 dana uključeno)" : "Privremeni korisnik (15 €/dan)"}
                                        </Badge>
                                    </div>
                                    <div>
                                        <span className="font-bold text-[10px] uppercase text-slate-400 block">Plovilo</span>
                                        <span className="font-bold text-slate-900 text-sm">{cycleSummary.vessel.name}</span>
                                        <div className="text-slate-500">Reg: {cycleSummary.vessel.registration || "—"} • Duljina: {cycleSummary.vessel.lengthM} m</div>
                                        {cycleSummary.occupancy && (
                                            <div className="text-indigo-700 font-semibold mt-1">
                                                Zona: {cycleSummary.occupancy.zoneName} ({cycleSummary.occupancy.zoneCode})
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Items Breakdown */}
                                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead>Stavka usluge</TableHead>
                                                <TableHead>Količina</TableHead>
                                                <TableHead>Jed. cijena</TableHead>
                                                <TableHead className="text-right">Iznos (Neto)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {/* Vađenje */}
                                            <TableRow>
                                                <TableCell className="font-semibold">
                                                    Vađenje plovila iz mora ({cycleSummary.vessel.lengthM} m)
                                                </TableCell>
                                                <TableCell>1 usl</TableCell>
                                                <TableCell>{cycleSummary.user.isMember ? "0,00 €" : "12,00 €/m"}</TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {cycleSummary.totals.liftCostNet.toFixed(2)} €
                                                </TableCell>
                                            </TableRow>

                                            {/* Suhi vez */}
                                            {cycleSummary.occupancy && (
                                                <TableRow>
                                                    <TableCell>
                                                        <div className="font-semibold">Korištenje suhog veza (Ležarina)</div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            Ukupno: {cycleSummary.occupancy.totalDays} dana ({cycleSummary.user.isMember ? `${cycleSummary.occupancy.freeDaysAllowed} d free` : "fiksno po danu"})
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{cycleSummary.occupancy.billableDays} dana</TableCell>
                                                    <TableCell>{cycleSummary.occupancy.dailyBerthRate.toFixed(2)} €/dan</TableCell>
                                                    <TableCell className="text-right font-bold">
                                                        {cycleSummary.totals.berthCostNet.toFixed(2)} €
                                                    </TableCell>
                                                </TableRow>
                                            )}

                                            {/* Spuštanje */}
                                            <TableRow>
                                                <TableCell className="font-semibold">
                                                    Spuštanje plovila u more ({cycleSummary.vessel.lengthM} m)
                                                </TableCell>
                                                <TableCell>1 usl</TableCell>
                                                <TableCell>{cycleSummary.user.isMember ? "0,00 €" : "12,00 €/m"}</TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {cycleSummary.totals.lowerCostNet.toFixed(2)} €
                                                </TableCell>
                                            </TableRow>

                                            {/* Dodatni resursi */}
                                            {[...(cycleSummary.lift.resources || []), ...(cycleSummary.lower.resources || [])].map((r, i) => (
                                                <TableRow key={i}>
                                                    <TableCell>
                                                        <div className="font-medium text-emerald-800">Dodatni resurs: {r.name}</div>
                                                        <div className="text-[10px] text-muted-foreground">{r.code}</div>
                                                    </TableCell>
                                                    <TableCell>{r.quantity} {r.unit}</TableCell>
                                                    <TableCell>{Number(r.unitPriceEur).toFixed(2)} €</TableCell>
                                                    <TableCell className="text-right font-bold">
                                                        {Number(r.totalPriceEur).toFixed(2)} €
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Totals calculation */}
                                <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 space-y-1.5">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Osnovica (Neto):</span>
                                        <span className="font-semibold">{cycleSummary.totals.grandTotalNet.toFixed(2)} EUR</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>PDV (25%):</span>
                                        <span className="font-semibold">{cycleSummary.totals.grandTotalVat.toFixed(2)} EUR</span>
                                    </div>
                                    <div className="flex justify-between text-base font-black text-indigo-950 pt-1 border-t border-indigo-200">
                                        <span>UKUPNO ZA NAPLATU (Bruto):</span>
                                        <span>{cycleSummary.totals.grandTotalGross.toFixed(2)} EUR</span>
                                    </div>
                                </div>

                                {/* Settings */}
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Vrsta dokumenta</Label>
                                        <Select value={quoteDocumentType} onValueChange={(val: any) => setQuoteDocumentType(val)}>
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl">
                                                <SelectItem value="proforma">Ponuda / Predračun (PON-)</SelectItem>
                                                <SelectItem value="invoice">Konačni Račun (RAC-)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Način plaćanja</Label>
                                        <Select value={quotePaymentMethod} onValueChange={(val: any) => setQuotePaymentMethod(val)}>
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl">
                                                <SelectItem value="bank_transfer">Transakcijski račun (Virman)</SelectItem>
                                                <SelectItem value="cash">Gotovina</SelectItem>
                                                <SelectItem value="card">Kartica</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setQuoteWorkOrderId(null)} className="rounded-xl">
                                Odustani
                            </Button>
                            <Button
                                disabled={generateQuoteMutation.isPending || !cycleSummary}
                                onClick={handleCreateQuote}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md gap-1.5"
                            >
                                {generateQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                                <span>Izdaj Jedinstvenu Ponudu</span>
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* PDF Viewer Dialog */}
            {selectedOrderForPdf && (
                <Dialog open={!!selectedOrderForPdf} onOpenChange={() => setSelectedOrderForPdf(null)}>
                    <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4 rounded-3xl">
                        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
                            <DialogTitle className="text-lg font-bold">
                                Radni nalog {selectedOrderForPdf.orderNumber} (A4 Memorandum)
                            </DialogTitle>
                            <PDFDownloadLink
                                document={<WorkOrderPdf order={selectedOrderForPdf} />}
                                fileName={`${selectedOrderForPdf.orderNumber}.pdf`}
                            >
                                {({ loading }) => (
                                    <Button size="sm" className="gap-1.5 rounded-xl" disabled={loading}>
                                        <Download className="h-4 w-4" />
                                        Preuzmi PDF
                                    </Button>
                                )}
                            </PDFDownloadLink>
                        </DialogHeader>
                        <div className="flex-1 w-full h-full pt-2">
                            <PDFViewer width="100%" height="100%" className="rounded-2xl border">
                                <WorkOrderPdf order={selectedOrderForPdf} />
                            </PDFViewer>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
