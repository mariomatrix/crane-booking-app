import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { WaitingListPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListOrdered, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ReportWaitingList() {
    const [status, setStatus] = useState("all");
    const [craneId, setCraneId] = useState("all");

    // Fetch cranes for dropdown filter
    const { data: cranes = [] } = trpc.crane.list.useQuery();

    const { data: reportData = [], isLoading } = trpc.reports.waitingList.useQuery({
        status: status === "all" ? undefined : status,
        craneId: craneId === "all" ? undefined : craneId,
    });

    const excelExportData = reportData.map(item => {
        const days = Math.ceil((new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return {
            "Pozicija": item.position || 0,
            "OIB": item.clientOib || "",
            "Klijent": item.clientName || "",
            "Plovilo": item.vesselName || "",
            "Registracija": item.vesselRegistration || "",
            "Radnja": item.serviceTypeName || "",
            "Dizalica (pref)": item.craneName || "Svejedno",
            "Željeni datum": item.requestedDate ? format(new Date(item.requestedDate), "dd.MM.yyyy") : "",
            "Datum prijave": format(new Date(item.createdAt), "dd.MM.yyyy"),
            "Status": item.status || "",
            "Dana čekanja": days,
        };
    });

    const statusLabel = status === "waiting" ? "Aktivno čekanje" : status === "all" ? "Svi u evidenciji" : status;

    return (
        <div className="space-y-6">
            <ReportPageNav title="Pregled liste čekanja" />

            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <ListOrdered className="h-4 w-4" /> Filteri
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Status prijave</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi statusi</SelectItem>
                                    <SelectItem value="waiting">U redu čekanja (Aktivno)</SelectItem>
                                    <SelectItem value="notified">Obaviješteni</SelectItem>
                                    <SelectItem value="accepted">Prihvaćeni</SelectItem>
                                    <SelectItem value="expired">Istekli</SelectItem>
                                    <SelectItem value="cancelled">Otkazani</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Preferirana dizalica</Label>
                            <Select value={craneId} onValueChange={setCraneId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Sve dizalice</SelectItem>
                                    {cranes.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-4">
                    <ExportActions 
                        excelData={excelExportData}
                        excelFileName="Pregled_liste_cekanja"
                        pdfDocument={<WaitingListPdf data={reportData} statusLabel={statusLabel} marinaName="PŠD Špinut Marina" />}
                        pdfFileName="Pregled_liste_cekanja"
                    />

                    {/* Printable Preview */}
                    <div className="border rounded-lg bg-card p-8 shadow-sm max-w-[21cm] mx-auto report-print-container">
                        <ReportHeader title={`Pregled liste čekanja (${statusLabel})`} />

                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[8%]">Pozicija</TableHead>
                                        <TableHead className="w-[14%]">OIB</TableHead>
                                        <TableHead className="w-[22%]">Klijent</TableHead>
                                        <TableHead className="w-[22%]">Plovilo (Registracija)</TableHead>
                                        <TableHead className="w-[18%]">Radnja</TableHead>
                                        <TableHead className="w-[16%]">Željeni datum</TableHead>
                                        <TableHead className="text-right w-[10%]">Čeka</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.map((item, idx) => {
                                        const days = Math.ceil((new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                                        return (
                                            <TableRow key={idx}>
                                                <TableCell className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                                                    #{item.position}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{item.clientOib || "—"}</TableCell>
                                                <TableCell className="font-semibold">{item.clientName}</TableCell>
                                                <TableCell>
                                                    <span className="font-semibold">{item.vesselName}</span>
                                                    {item.vesselRegistration && <span className="block text-xs font-mono text-muted-foreground">Reg: {item.vesselRegistration}</span>}
                                                </TableCell>
                                                <TableCell className="font-semibold text-primary">{item.serviceTypeName}</TableCell>
                                                <TableCell className="font-mono">
                                                    {item.requestedDate ? format(new Date(item.requestedDate), "dd.MM.yyyy") : "—"}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">{days} dana</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {reportData.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                                                Nema klijenata na listi čekanja za odabrane filtere.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <ReportFooter 
                            summaryItems={[
                                { label: "Ukupno na listi", value: reportData.length }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
