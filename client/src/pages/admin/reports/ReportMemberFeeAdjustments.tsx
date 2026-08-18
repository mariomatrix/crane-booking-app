import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Download, FileSpreadsheet, Printer, Users, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { formatAppDate } from "@/lib/date-utils";
import { useLang } from "@/contexts/LangContext";

export default function ReportMemberFeeAdjustments() {
    const { lang } = useLang();
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);

    const { data, isLoading, refetch } = trpc.reports.memberFeeAdjustments.useQuery({
        year: selectedYear,
    });

    const entries = data?.entries || [];

    const handleExportExcel = () => {
        const rows = entries.map((e) => ({
            "Godina članarine": selectedYear,
            "Član": e.userName,
            "OIB": e.userOib,
            "Telefon": e.userPhone,
            "Email": e.userEmail,
            "Šifra stavke zaduženja": e.serviceItemCode,
            "Naziv zadužene usluge": e.serviceItemName,
            "Plovilo": e.vesselName,
            "Registracija": e.vesselRegistration,
            "Datum operacije": formatAppDate(e.eventDate, lang),
            "Napomena": e.note,
            "Status knjiženja u ERP-u": e.erpStatus === "processed_in_membership_renewal" ? "Proknjiženo" : "Čeka obnovu članarine",
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Zaduženja_${selectedYear}`);
        XLSX.writeFile(wb, `Zaduzenja_Clanarina_${selectedYear}.xlsx`);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ShieldAlert className="h-7 w-7 text-amber-600" />
                        Izvještaj zaduženja članarina za sljedeću godinu
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Službena lista članova s prekoračenjem statutarnih prava za povećanje članarine za {selectedYear + 1}. godinu.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Godina" />
                        </SelectTrigger>
                        <SelectContent>
                            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                    {y}. god
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button variant="outline" onClick={handleExportExcel} className="gap-1.5">
                        <Download className="h-4 w-4" />
                        Izvoz za Desktop ERP (Excel)
                    </Button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-amber-500 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs">Ukupno zaduženih stavki</CardDescription>
                        <CardTitle className="text-3xl font-bold text-amber-600">{entries.length}</CardTitle>
                    </CardHeader>
                </Card>

                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs">Članova s prekoračenjem</CardDescription>
                        <CardTitle className="text-3xl font-bold">
                            {new Set(entries.map((e) => e.userId)).size}
                        </CardTitle>
                    </CardHeader>
                </Card>

                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs">Spremno za prijenos u članarinu</CardDescription>
                        <CardTitle className="text-3xl font-bold text-emerald-600">
                            {entries.filter((e) => e.erpStatus === "pending").length}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        Popis zaduženja članarina za godinu {selectedYear}.
                    </CardTitle>
                    <CardDescription>
                        Tajništvo i računovodstvo preuzimaju ove stavke i pridružuju ih uplatnicama članarine pri godišnjoj obnovi.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead>Član / Ime i prezime</TableHead>
                                <TableHead>OIB</TableHead>
                                <TableHead>Plovilo</TableHead>
                                <TableHead>Zadužena stavka</TableHead>
                                <TableHead>Datum radnje</TableHead>
                                <TableHead className="text-right">ERP Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Učitavanje zaduženja...
                                    </TableCell>
                                </TableRow>
                            ) : entries.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Nema zaduženih stavki za članarine u {selectedYear}. godini. Svi članovi su unutar svojih statutarnih prava.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                entries.map((e) => (
                                    <TableRow key={e.id} className="hover:bg-muted/30">
                                        <TableCell>
                                            <div className="font-semibold text-sm">{e.userName || `${e.userFirstName || ''} ${e.userLastName || ''}`}</div>
                                            <div className="text-xs text-muted-foreground">{e.userEmail || e.userPhone}</div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{e.userOib || "—"}</TableCell>
                                        <TableCell className="text-xs">
                                            <div className="font-medium">{e.vesselName || "—"}</div>
                                            <div className="text-muted-foreground">{e.vesselRegistration || ""}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs font-semibold">
                                                {e.serviceItemCode}: {e.serviceItemName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {formatAppDate(e.eventDate, lang)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {e.erpStatus === "processed_in_membership_renewal" ? (
                                                <Badge className="bg-emerald-600 text-xs">Proknjiženo u ERP</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-xs">Čeka obnovu ({selectedYear + 1})</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
