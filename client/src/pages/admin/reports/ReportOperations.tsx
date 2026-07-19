import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { OperationTypesPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, Loader2 } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";

export default function ReportOperations() {
    const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
    const [serviceTypeId, setServiceTypeId] = useState("all");

    // Fetch active service types for dropdown
    const { data: serviceTypes = [] } = trpc.serviceType.list.useQuery({ onlyActive: true });

    const { data: reportData, isLoading } = trpc.reports.operationTypes.useQuery({
        from,
        to,
        serviceTypeId: serviceTypeId === "all" ? undefined : serviceTypeId,
    });

    const summaries = reportData?.summaries || [];
    const details = reportData?.details || [];

    const excelExportData = details.map(item => ({
        "Br. Rezervacije": item.reservationNumber || "",
        "OIB Klijenta": item.userOib || "",
        "Klijent": item.clientName || "",
        "Registracija": item.vesselRegistration || "",
        "Radnja": item.serviceTypeName || "",
        "Dizalica": item.craneName || "",
        "Trajanje (min)": item.durationMin || 0,
        "Datum": item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy") : "",
    }));

    const grandTotalOperations = summaries.reduce((acc, curr) => acc + (curr.count || 0), 0);

    return (
        <div className="space-y-6">
            <ReportPageNav title="Analitika po tipovima operacija" />

            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Filteri
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2 flex flex-col justify-end">
                            <Label className="mb-1">Datum od</Label>
                            <DatePicker
                                date={from ? new Date(from) : undefined}
                                onChange={(d) => d && setFrom(format(d, "yyyy-MM-dd"))}
                                placeholder="Odaberi datum"
                            />
                        </div>
                        <div className="space-y-2 flex flex-col justify-end">
                            <Label className="mb-1">Datum do</Label>
                            <DatePicker
                                date={to ? new Date(to) : undefined}
                                onChange={(d) => d && setTo(format(d, "yyyy-MM-dd"))}
                                placeholder="Odaberi datum"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tip operacije</Label>
                            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi tipovi radnji</SelectItem>
                                    {serviceTypes.map(st => (
                                        <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
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
                        excelFileName="Analitika_tipova_operacija"
                        pdfDocument={<OperationTypesPdf data={details} summaries={summaries} dateFrom={from} dateTo={to} marinaName="PŠD Špinut" />}
                        pdfFileName="Analitika_tipova_operacija"
                    />

                    {/* Printable Preview */}
                    <div className="border rounded-lg bg-card p-8 shadow-sm max-w-[21cm] mx-auto report-print-container">
                        <ReportHeader title="Analitika po tipovima operacija" dateFrom={from} dateTo={to} />

                        {/* Summaries by Operation Type */}
                        <div className="space-y-4 mb-6">
                            <h3 className="font-semibold text-lg border-b pb-2">Sažetak po vrsti radnje</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tip operacije</TableHead>
                                        <TableHead className="text-center">Broj operacija</TableHead>
                                        <TableHead className="text-center">Ukupno sati</TableHead>
                                        <TableHead className="text-center">Prosj. trajanje</TableHead>
                                        <TableHead className="text-right">Udio (%)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaries.map((s, idx) => {
                                        const share = grandTotalOperations > 0 ? ((s.count / grandTotalOperations) * 100).toFixed(1) : "0";
                                        return (
                                            <TableRow key={idx}>
                                                <TableCell className="font-semibold">{s.serviceTypeName || "—"}</TableCell>
                                                <TableCell className="text-center">{s.count} operacija</TableCell>
                                                <TableCell className="text-center font-mono">{(s.totalMinutes / 60).toFixed(1)} h</TableCell>
                                                <TableCell className="text-center font-mono">{s.avgMinutes} min</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-blue-600 dark:text-blue-400">{share} %</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {summaries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-4 text-muted-foreground italic">
                                                Nema zapisa za odabrani period.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Detailed Table */}
                        <div className="space-y-4 page-break">
                            <h3 className="font-semibold text-lg border-b pb-2">Popis odrađenih operacija</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Datum</TableHead>
                                        <TableHead>Klijent (OIB)</TableHead>
                                        <TableHead>Plovilo (Registracija)</TableHead>
                                        <TableHead>Radnja</TableHead>
                                        <TableHead>Dizalica</TableHead>
                                        <TableHead>Trajanje</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {details.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono">
                                                {item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy") : "-"}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium">{item.clientName}</span>
                                                <span className="block text-xs font-mono text-muted-foreground">OIB: {item.userOib}</span>
                                            </TableCell>
                                            <TableCell className="font-mono">{item.vesselRegistration}</TableCell>
                                            <TableCell className="font-semibold text-primary">{item.serviceTypeName}</TableCell>
                                            <TableCell>{item.craneName || "—"}</TableCell>
                                            <TableCell className="font-mono">{item.durationMin} min</TableCell>
                                        </TableRow>
                                    ))}
                                    {details.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground italic">
                                                Nema detaljnih zapisa.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <ReportFooter
                            summaryItems={[
                                { label: "Ukupno odrađeno operacija", value: grandTotalOperations },
                                { label: "Sveukupno radnih sati", value: (details.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
