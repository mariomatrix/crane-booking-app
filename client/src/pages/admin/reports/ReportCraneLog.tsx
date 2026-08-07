import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { CraneLogPdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FileText, Loader2, Calendar, Clock, Anchor, Activity, Wrench, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

export default function ReportCraneLog() {
    const [location] = useLocation();
    // Parse query params if available (e.g. ?craneId=...&from=...&to=...)
    const queryParams = new URLSearchParams(window.location.search);
    const initialCraneParam = queryParams.get("craneId") || "";

    const now = new Date();
    const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
    const [craneId, setCraneId] = useState(initialCraneParam);

    // Fetch list of active cranes
    const { data: cranes = [], isLoading: isLoadingCranes } = trpc.crane.list.useQuery();

    // Auto-select first crane if non selected
    useEffect(() => {
        if (cranes.length > 0 && (!craneId || !cranes.some(c => c.id === craneId))) {
            setCraneId(cranes[0].id);
        }
    }, [cranes, craneId]);

    // Query crane log report data
    const { data: reportData, isLoading: isLoadingReport } = trpc.reports.craneLog.useQuery(
        {
            craneId: craneId || "",
            from,
            to,
        },
        {
            enabled: Boolean(craneId),
        }
    );

    const entries = reportData?.entries || [];
    const summary = reportData?.summary || {
        totalOperations: 0,
        totalDurationMinutes: 0,
        totalHours: 0,
        liftsCount: 0,
        lowersCount: 0,
        movesCount: 0,
        maintenanceCount: 0,
    };
    const craneInfo = reportData?.craneInfo;

    // Preset helper functions
    const setThisMonth = () => {
        const curr = new Date();
        setFrom(format(startOfMonth(curr), "yyyy-MM-dd"));
        setTo(format(endOfMonth(curr), "yyyy-MM-dd"));
    };

    const setLastMonth = () => {
        const last = subMonths(new Date(), 1);
        setFrom(format(startOfMonth(last), "yyyy-MM-dd"));
        setTo(format(endOfMonth(last), "yyyy-MM-dd"));
    };

    const excelExportData = entries.map((item) => ({
        "Datum": item.startTime ? format(new Date(item.startTime), "dd.MM.yyyy.") : "",
        "Vrijeme Od": item.startTime ? format(new Date(item.startTime), "HH:mm") : "",
        "Vrijeme Do": item.endTime ? format(new Date(item.endTime), "HH:mm") : "",
        "Trajanje (min)": item.durationMinutes,
        "Vrsta Operacije": item.operationType,
        "Plovilo": item.vesselName,
        "Registracija": item.vesselRegistration,
        "Klijent": item.clientName,
        "OIB Klijenta": item.clientOib,
        "Operater": item.operatorName,
        "Napomena": item.note || "",
    }));

    return (
        <div className="space-y-6">
            <ReportPageNav title="Dnevnik rada dizalica" />

            {/* Filter controls */}
            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Filteri i odabir dizalice za mjesečni dnevnik
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4 items-end">
                        <div className="space-y-2">
                            <Label>Odaberite dizalicu</Label>
                            <Select value={craneId} onValueChange={setCraneId} disabled={isLoadingCranes}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Odaberite dizalicu" />
                                </SelectTrigger>
                                <SelectContent>
                                    {cranes.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name} {c.maxCapacityKN ? `(${Math.round(c.maxCapacityKN / 10)}t)` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

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

                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={setThisMonth} className="flex-1 text-xs">
                                Ovaj mjesec
                            </Button>
                            <Button variant="outline" size="sm" onClick={setLastMonth} className="flex-1 text-xs">
                                Prošli mjesec
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Print Header */}
            <ReportHeader
                title={`DNEVNIK RADA DIZALICE: ${craneInfo?.name || ""}`}
                dateFrom={from}
                dateTo={to}
            />

            {isLoadingReport ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : !craneInfo ? (
                <Card className="p-8 text-center text-muted-foreground">
                    Molimo odaberite dizalicu za prikaz dnevnika rada.
                </Card>
            ) : (
                <>
                    {/* Summary cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-xs font-medium text-muted-foreground">Ukupno operacija</CardTitle>
                                <Activity className="h-4 w-4 text-blue-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.totalOperations}</div>
                                <p className="text-xs text-muted-foreground mt-1">U odabranom mjesecu</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-xs font-medium text-muted-foreground">Ukupni sati rada</CardTitle>
                                <Clock className="h-4 w-4 text-emerald-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.totalHours} h</div>
                                <p className="text-xs text-muted-foreground mt-1">{summary.totalDurationMinutes} ukupnih minuta</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-xs font-medium text-muted-foreground">Vađenja / Spuštanja</CardTitle>
                                <ArrowUpRight className="h-4 w-4 text-indigo-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {summary.liftsCount} <span className="text-sm font-normal text-muted-foreground">vađenja</span> / {summary.lowersCount} <span className="text-sm font-normal text-muted-foreground">spuštanja</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Operacije na moru</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-xs font-medium text-muted-foreground">Servis i održavanje</CardTitle>
                                <Wrench className="h-4 w-4 text-amber-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.maintenanceCount}</div>
                                <p className="text-xs text-muted-foreground mt-1">Evidentiranih servisa</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Log Table */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between no-print">
                            <CardTitle className="text-base font-semibold">
                                Stavke dnevnika rada dizalice ({entries.length})
                            </CardTitle>
                            <ExportActions
                                excelFileName={`dnevnik-rada-${craneInfo.name.toLowerCase().replace(/\s+/g, "-")}`}
                                pdfFileName={`dnevnik-rada-${craneInfo.name.toLowerCase().replace(/\s+/g, "-")}`}
                                excelData={excelExportData}
                                pdfDocument={
                                    <CraneLogPdf
                                        craneInfo={craneInfo}
                                        dateFrom={from}
                                        dateTo={to}
                                        entries={entries}
                                        summary={summary}
                                    />
                                }
                            />
                        </CardHeader>
                        <CardContent className="p-0">
                            {entries.length === 0 ? (
                                <div className="py-12 text-center text-muted-foreground">
                                    Nema zabilježenih operacija za odabranu dizalicu u ovom razdoblju.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">#</TableHead>
                                                <TableHead>Datum</TableHead>
                                                <TableHead>Vrijeme (od-do)</TableHead>
                                                <TableHead>Plovilo (Reg)</TableHead>
                                                <TableHead>Klijent / Vlasnik (OIB)</TableHead>
                                                <TableHead>Vrsta operacije</TableHead>
                                                <TableHead>Trajanje</TableHead>
                                                <TableHead>Operater</TableHead>
                                                <TableHead>Napomena</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {entries.map((item, idx) => {
                                                const startStr = item.startTime ? format(new Date(item.startTime), "HH:mm") : "—";
                                                const endStr = item.endTime ? format(new Date(item.endTime), "HH:mm") : "—";
                                                const dateStr = item.startTime ? format(new Date(item.startTime), "dd.MM.yyyy.") : "—";

                                                const isLift = item.operationType.toLowerCase().includes("dizanje") || item.operationType.toLowerCase().includes("vađenje");
                                                const isLower = item.operationType.toLowerCase().includes("spuštanje");
                                                const isMaint = item.isMaintenance || item.operationType.toLowerCase().includes("održavanje");

                                                return (
                                                    <TableRow key={item.id || idx}>
                                                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                        <TableCell className="whitespace-nowrap font-medium">{dateStr}</TableCell>
                                                        <TableCell className="whitespace-nowrap font-mono text-xs">
                                                            {startStr} — {endStr}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-sm">{item.vesselName}</div>
                                                            <div className="text-xs text-muted-foreground">{item.vesselRegistration}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-sm font-medium">{item.clientName}</div>
                                                            <div className="text-xs text-muted-foreground">OIB: {item.clientOib}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    isMaint
                                                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                        : isLift
                                                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                                                        : isLower
                                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                        : "bg-slate-50 text-slate-700 border-slate-200"
                                                                }
                                                            >
                                                                {item.operationType}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="whitespace-nowrap font-mono text-xs">
                                                            {item.durationMinutes} min
                                                        </TableCell>
                                                        <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                                            {item.operatorName}
                                                        </TableCell>
                                                        <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                                                            {item.note || "—"}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            <ReportFooter />
        </div>
    );
}
