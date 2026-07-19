import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { CraneUtilizationPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { BarChart3, Loader2 } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";

export default function ReportUtilization() {
    const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
    const [craneId, setCraneId] = useState("all");

    // Fetch cranes for the filter dropdown
    const { data: cranes = [] } = trpc.crane.list.useQuery();

    const { data: reportData, isLoading } = trpc.reports.craneUtilization.useQuery({
        from,
        to,
        craneId: craneId === "all" ? undefined : craneId,
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

    // Recharts coloring
    const COLORS = ["#0284c7", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

    // Prep chart data
    const chartData = summaries.map(s => ({
        name: s.craneName,
        operacije: s.totalOperations,
        sati: Number((s.totalMinutes / 60).toFixed(1)),
    }));

    return (
        <div className="space-y-6">
            <ReportPageNav title="Korištenje dizalica" />

            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" /> Filteri
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
                            <Label>Dizalica</Label>
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
                        excelFileName="Korištenje_dizalica"
                        pdfDocument={<CraneUtilizationPdf data={details} summaries={summaries} dateFrom={from} dateTo={to} marinaName="PŠD Špinut" />}
                        pdfFileName="Koristenje_dizalica"
                    />

                    {/* Chart preview on screen (hidden on print) */}
                    {chartData.length > 0 && (
                        <Card className="no-print">
                            <CardHeader>
                                <CardTitle className="text-base">Grafički pregled (zauzetost u satima)</CardTitle>
                            </CardHeader>
                            <CardContent className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="sati" fill="#0284c7" name="Radni sati" />
                                        <Bar dataKey="operacije" fill="#f59e0b" name="Broj operacija" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Printable Preview */}
                    <div className="border rounded-lg bg-card p-8 shadow-sm max-w-[21cm] mx-auto report-print-container">
                        <ReportHeader title="Korištenje dizalica" dateFrom={from} dateTo={to} />

                        {/* Summary table */}
                        <div className="space-y-4 mb-6">
                            <h3 className="font-semibold text-lg border-b pb-2">Sažetak rada po dizalicama</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Naziv dizalice</TableHead>
                                        <TableHead>Broj operacija</TableHead>
                                        <TableHead>Ukupno sati rada</TableHead>
                                        <TableHead>Prosječno trajanje</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaries.map((s, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-semibold">{s.craneName || "—"}</TableCell>
                                            <TableCell>{s.totalOperations} operacija</TableCell>
                                            <TableCell className="font-mono">{(s.totalMinutes / 60).toFixed(1)} h</TableCell>
                                            <TableCell className="font-mono">{s.avgMinutes} min</TableCell>
                                        </TableRow>
                                    ))}
                                    {summaries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground italic">
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
                                        <TableHead>Dizalica</TableHead>
                                        <TableHead>Klijent (OIB)</TableHead>
                                        <TableHead>Plovilo (Registracija)</TableHead>
                                        <TableHead>Radnja</TableHead>
                                        <TableHead>Trajanje</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {details.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono">
                                                {item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy") : "-"}
                                            </TableCell>
                                            <TableCell>{item.craneName || "—"}</TableCell>
                                            <TableCell>
                                                <span className="font-medium">{item.clientName}</span>
                                                <span className="block text-xs font-mono text-muted-foreground">OIB: {item.userOib}</span>
                                            </TableCell>
                                            <TableCell className="font-mono">{item.vesselRegistration}</TableCell>
                                            <TableCell className="font-semibold text-primary">{item.serviceTypeName}</TableCell>
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
                                { label: "Ukupno dovršenih", value: details.length },
                                { label: "Sveukupno radnih sati", value: (details.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
