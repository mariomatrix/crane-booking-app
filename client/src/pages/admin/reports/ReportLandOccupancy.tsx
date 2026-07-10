import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { LandOccupancyPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Anchor, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ReportLandOccupancy() {
    const [status, setStatus] = useState<"all" | "active" | "history">("all");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [zoneId, setZoneId] = useState("all");
    const [oib, setOib] = useState("");

    // Fetch land zones for dropdown filter
    const { data: landZones = [] } = trpc.landZone.list.useQuery();

    const { data: reportData = [], isLoading } = trpc.reports.landOccupancy.useQuery({
        status,
        from: from ? from : undefined,
        to: to ? to : undefined,
        zoneId: zoneId === "all" ? undefined : zoneId,
        oib: oib.trim() !== "" ? oib : undefined,
    });

    const selectedZone = landZones.find(lz => lz.id === zoneId);
    const zoneSuffix = selectedZone ? ` — ${selectedZone.name}` : "";
    const statusLabel = status === "active" ? "Aktivno na kopnu" : status === "history" ? "Vraćeni u more" : "Sve evidencije";
    const reportTitle = `Plovila na kopnu (${statusLabel})${zoneSuffix}`;

    const excelExportData = reportData.map(item => {
        const days = item.returnedAt
            ? Math.ceil((new Date(item.returnedAt).getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24))
            : Math.ceil((new Date().getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24));
        return {
            "OIB": item.clientOib || "",
            "Klijent": item.clientName || "",
            "Plovilo": item.vesselName || "",
            "Registracija": item.vesselRegistration || "",
            "Zona": item.zoneName || "",
            "Mjesto": item.spotNumber || "",
            "Datum dizanja": format(new Date(item.liftedAt), "dd.MM.yyyy"),
            "Datum povratka": item.returnedAt
                ? format(new Date(item.returnedAt), "dd.MM.yyyy")
                : (item as any).hasLaunchReservation
                    ? "Najava spuštanja u more"
                    : "Na kopnu",
            "Broj dana boravka": days,
        };
    });

    return (
        <div className="space-y-6">
            <ReportPageNav title="Plovila na kopnu" />

            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Anchor className="h-4 w-4" /> Filteri
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-2">
                            <Label>Status boravka</Label>
                            <Select value={status} onValueChange={(val) => setStatus(val as any)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Sva plovila</SelectItem>
                                    <SelectItem value="active">Trenutno na kopnu</SelectItem>
                                    <SelectItem value="history">Vraćeni u more</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Duljina / datum od</Label>
                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Duljina / datum do</Label>
                            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Kopnena zona</Label>
                            <Select value={zoneId} onValueChange={setZoneId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Sve zone</SelectItem>
                                    {landZones.map(lz => (
                                        <SelectItem key={lz.id} value={lz.id}>{lz.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Pretraga po OIB-u</Label>
                            <Input
                                type="text"
                                placeholder="Upišite OIB..."
                                value={oib}
                                onChange={(e) => setOib(e.target.value.replace(/\D/g, "").slice(0, 11))}
                                maxLength={11}
                            />
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
                        excelFileName="Plovila_na_kopnu"
                        pdfDocument={<LandOccupancyPdf data={reportData} statusLabel={`${statusLabel}${zoneSuffix}`} marinaName="PŠD Špinut" />}
                        pdfFileName="Plovila_na_kopnu"
                    />

                    {/* Printable Preview */}
                    <div className="border rounded-lg bg-card p-6 shadow-sm w-full report-print-container">
                        <ReportHeader title={reportTitle} />

                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[12%]">OIB</TableHead>
                                        <TableHead className="w-[20%]">Klijent</TableHead>
                                        <TableHead className="w-[22%]">Plovilo (Registracija)</TableHead>
                                        <TableHead className="w-[12%]">Zona (Mjestо)</TableHead>
                                        <TableHead className="w-[12%]">Datum dizanja</TableHead>
                                        <TableHead className="w-[12%]">Datum povratka</TableHead>
                                        <TableHead className="text-right w-[10%]">Boravak</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.map((item, idx) => {
                                        const days = item.returnedAt
                                            ? Math.ceil((new Date(item.returnedAt).getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24))
                                            : Math.ceil((new Date().getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24));
                                        return (
                                            <TableRow key={idx}>
                                                <TableCell className="font-mono text-xs">{item.clientOib || "—"}</TableCell>
                                                <TableCell className="font-semibold">{item.clientName}</TableCell>
                                                <TableCell>
                                                    <span className="font-semibold">{item.vesselName}</span>
                                                    {item.vesselRegistration && <span className="block text-xs font-mono text-muted-foreground">Reg: {item.vesselRegistration}</span>}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-semibold">{item.zoneName || "—"}</span>
                                                    {item.spotNumber && <span className="block text-xs text-muted-foreground">Mjesto: {item.spotNumber}</span>}
                                                </TableCell>
                                                <TableCell className="font-mono">{format(new Date(item.liftedAt), "dd.MM.yyyy")}</TableCell>
                                                <TableCell className="font-mono">
                                                    {item.returnedAt ? (
                                                        format(new Date(item.returnedAt), "dd.MM.yyyy")
                                                    ) : (item as any).hasLaunchReservation ? (
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] uppercase font-bold">
                                                            Najava spuštanja
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] uppercase font-bold">
                                                            Na kopnu
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold">{days} dana</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {reportData.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                                                Nema aktivnih zapisa o suhom vezu.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <ReportFooter
                            summaryItems={[
                                { label: "Ukupno plovila na popisu", value: reportData.length }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
