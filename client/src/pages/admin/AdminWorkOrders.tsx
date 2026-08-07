import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, Play, CheckCircle2, XCircle, Clock, Search, Filter, ShieldCheck, AlertCircle, Eye, Printer } from "lucide-react";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { WorkOrderPdf } from "@/components/WorkOrderPdfTemplate";
import { Link } from "wouter";
import * as XLSX from "xlsx";

export default function AdminWorkOrders() {
    const [clientTypeFilter, setClientTypeFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [search, setSearch] = useState<string>("");
    const [selectedOrderForPdf, setSelectedOrderForPdf] = useState<any | null>(null);

    const { data: orders = [], isLoading } = trpc.workOrders.list.useQuery({
        clientType: clientTypeFilter === "all" ? undefined : (clientTypeFilter as any),
        status: statusFilter === "all" ? undefined : (statusFilter as any),
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

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <FileText className="h-7 w-7 text-primary" />
                        Dnevnik Radnih Naloga
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Službena evidencija aktiviranih, završenih i obračunatih radnih naloga dizalica (RN-YYYY-XXXXX).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportExcel} className="gap-1.5">
                        <Download className="h-4 w-4" />
                        Izvoz u Excel (ERP)
                    </Button>
                </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card className="bg-card/50 shadow-sm border-l-4 border-l-primary">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Ukupno naloga</CardDescription>
                        <CardTitle className="text-2xl font-bold">{totalCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">U članskoj kvoti</CardDescription>
                        <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{statutoryCoveredCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Doplata članarine</CardDescription>
                        <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">{memberAdjustmentsCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Vanjski komercijalni</CardDescription>
                        <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">{externalCommercialCount}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="bg-card/50 shadow-sm border-l-4 border-l-green-600">
                    <CardHeader className="p-3 pb-1">
                        <CardDescription className="text-xs">Zaključeno</CardDescription>
                        <CardTitle className="text-2xl font-bold text-green-700 dark:text-green-300">{completedCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filter bar */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-3 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pretraži po broju naloga, imenu člana, OIB-u ili nazivu plovila..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Tip korisnika" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi korisnici</SelectItem>
                                    <SelectItem value="member">Samo članovi PŠD</SelectItem>
                                    <SelectItem value="external">Samo vanjski</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
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
            <Card>
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
                                                <Link href={`/admin/users/${o.userId}`}>
                                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-primary hover:bg-primary/10">
                                                        Karton
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-xs gap-1"
                                                    onClick={() => setSelectedOrderForPdf(o)}
                                                >
                                                    <Printer className="h-3.5 w-3.5" />
                                                    Ispis A4
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

            {/* PDF Viewer Dialog */}
            {selectedOrderForPdf && (
                <Dialog open={!!selectedOrderForPdf} onOpenChange={() => setSelectedOrderForPdf(null)}>
                    <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
                        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
                            <DialogTitle className="text-lg font-bold">
                                Radni nalog {selectedOrderForPdf.orderNumber} (A4 Memorandum)
                            </DialogTitle>
                            <PDFDownloadLink
                                document={<WorkOrderPdf order={selectedOrderForPdf} />}
                                fileName={`${selectedOrderForPdf.orderNumber}.pdf`}
                            >
                                {({ loading }) => (
                                    <Button size="sm" className="gap-1.5" disabled={loading}>
                                        <Download className="h-4 w-4" />
                                        Preuzmi PDF
                                    </Button>
                                )}
                            </PDFDownloadLink>
                        </DialogHeader>
                        <div className="flex-1 w-full h-full pt-2">
                            <PDFViewer width="100%" height="100%" className="rounded border">
                                <WorkOrderPdf order={selectedOrderForPdf} />
                            </PDFViewer>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
