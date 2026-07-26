import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { hr } from "date-fns/locale";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { exportSchedulePdf } from "@/lib/reports/pdfmake-schedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CalendarDays, Loader2, Calendar as CalendarIcon, Clock, Filter, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";

type ReportType = "daily" | "weekly" | "monthly";

export default function ReportSchedule() {
    // 1. Report Type (Default: "daily")
    const [reportType, setReportType] = useState<ReportType>("daily");
    
    // 2. Selected Date (Default: today)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    
    // Additional filters
    const [craneId, setCraneId] = useState("all");
    const [status, setStatus] = useState("all");
    const [includeMaintenance, setIncludeMaintenance] = useState(true);

    // Fetch cranes & settings
    const { data: cranes = [] } = trpc.crane.list.useQuery();
    const { data: sysSettings } = trpc.settings.get.useQuery();

    // Calculate effective date range based on reportType & selectedDate
    let effectiveFromDate = selectedDate;
    let effectiveToDate = selectedDate;

    if (reportType === "weekly") {
        effectiveFromDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
        effectiveToDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
    } else if (reportType === "monthly") {
        effectiveFromDate = startOfMonth(selectedDate);
        effectiveToDate = endOfMonth(selectedDate);
    }

    const effectiveFrom = format(effectiveFromDate, "yyyy-MM-dd");
    const effectiveTo = format(effectiveToDate, "yyyy-MM-dd");

    // Fetch schedule data
    const { data: reportData, isLoading } = trpc.reports.craneSchedule.useQuery({
        from: effectiveFrom,
        to: effectiveTo,
        craneId: craneId === "all" ? undefined : craneId,
        status: status === "all" ? undefined : status,
        includeMaintenance,
    });

    const reservationsList = reportData?.reservations || [];
    const maintenanceList = reportData?.maintenance || [];

    const mergedList = [
        ...reservationsList.map(r => ({ ...r, isMaintenance: false })),
        ...(includeMaintenance ? maintenanceList.map(m => ({
            id: m.id,
            isMaintenance: true,
            scheduledStart: m.startAt,
            scheduledEnd: m.endAt,
            durationMin: Math.max(1, Math.round((new Date(m.endAt).getTime() - new Date(m.startAt).getTime()) / 60000)),
            craneId: m.craneId,
            craneName: m.craneName,
            clientName: "BLOKADA / ODRŽAVANJE",
            userOib: null as string | null,
            vesselName: "—",
            vesselRegistration: "ODRŽAVANJE",
            serviceTypeName: m.reason || "Planirano održavanje",
            status: "maintenance" as any,
        })) : [])
    ];

    // Excel export mapping
    const excelExportData = reservationsList.map(item => ({
        "Br. Rezervacije": item.reservationNumber || "",
        "OIB Klijenta": item.userOib || "",
        "Klijent": item.clientName || "",
        "Plovilo": item.vesselName || "",
        "Registracija": item.vesselRegistration || "",
        "Radnja": item.serviceTypeName || "",
        "Dizalica": item.craneName || "",
        "Trajanje (min)": item.durationMin || 0,
        "Početak": item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy HH:mm") : "",
        "Kraj": item.scheduledEnd ? format(new Date(item.scheduledEnd), "dd.MM.yyyy HH:mm") : "",
        "Status": item.status || "",
    }));

    // Period Display Label
    const periodLabel = reportType === "daily"
        ? `Dan: ${format(selectedDate, "dd.MM.yyyy. (EEEE)", { locale: hr })}`
        : reportType === "weekly"
        ? `Tjedan: ${format(effectiveFromDate, "dd.MM.yyyy.")} – ${format(effectiveToDate, "dd.MM.yyyy.")}`
        : `Mjesec: ${format(selectedDate, "LLLL yyyy.", { locale: hr })} (${format(effectiveFromDate, "dd.MM.yyyy.")} – ${format(effectiveToDate, "dd.MM.yyyy.")})`;

    // Helper to switch quick date shortcuts
    const handleQuickShortcut = (shortcut: "today" | "thisWeek" | "thisMonth") => {
        const today = new Date();
        setSelectedDate(today);
        if (shortcut === "today") {
            setReportType("daily");
        } else if (shortcut === "thisWeek") {
            setReportType("weekly");
        } else if (shortcut === "thisMonth") {
            setReportType("monthly");
        }
    };

    // Render Weekly Table
    const renderWeeklyTable = () => {
        const days = eachDayOfInterval({
            start: effectiveFromDate,
            end: effectiveToDate,
        });

        return (
            <Table className="border">
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead className="w-[15%] font-bold">Dizalica</TableHead>
                        {days.map((day, idx) => (
                            <TableHead key={idx} className="text-center font-semibold text-xs border-l">
                                <span className="capitalize">{format(day, "EEEE", { locale: hr })}</span>
                                <span className="block text-[11px] text-muted-foreground font-mono">{format(day, "dd.MM.")}</span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {cranes.map(crane => (
                        <TableRow key={crane.id}>
                            <TableCell className="font-bold text-sm bg-muted/20 border-r">{crane.name}</TableCell>
                            {days.map((day, dIdx) => {
                                const dayStr = format(day, "yyyy-MM-dd");
                                const dayItems = mergedList.filter(r =>
                                    r.craneId === crane.id &&
                                    r.scheduledStart &&
                                    format(new Date(r.scheduledStart), "yyyy-MM-dd") === dayStr
                                );
                                return (
                                    <TableCell key={dIdx} className="align-top border-l p-2">
                                        <div className="space-y-1.5 min-h-[60px]">
                                            {dayItems.map((r, rIdx) => (
                                                <div
                                                    key={rIdx}
                                                    className={`text-[11px] p-2 border rounded-md leading-tight ${
                                                        r.isMaintenance
                                                            ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                                            : "bg-card border-slate-200 dark:border-slate-800"
                                                    }`}
                                                >
                                                    <span className="font-bold text-foreground">
                                                        {r.scheduledStart ? format(new Date(r.scheduledStart), "HH:mm") : ""}
                                                    </span>{" "}
                                                    — {r.clientName}<br />
                                                    <span className="text-muted-foreground text-[10px]">{r.vesselName} ({r.vesselRegistration})</span><br />
                                                    <span className="text-[10px] text-primary font-semibold">{r.serviceTypeName}</span>
                                                </div>
                                            ))}
                                            {dayItems.length === 0 && (
                                                <span className="text-[10px] text-muted-foreground/60 italic block pt-2 text-center">—</span>
                                            )}
                                        </div>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    return (
        <div className="space-y-6">
            <ReportPageNav title="Plan rada dizalica" />

            {/* Filter Panel */}
            <Card className="no-print report-filters-card border shadow-sm">
                <CardHeader className="py-3 px-5 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-primary" /> Filteri i Postavke Izvještaja
                        </span>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickShortcut("today")}>Danas</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickShortcut("thisWeek")}>Ovaj tjedan</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickShortcut("thisMonth")}>Ovaj mjesec</Button>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        {/* 1. Report Type */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">1. Tip izvještaja</Label>
                            <Select value={reportType} onValueChange={(val: ReportType) => setReportType(val)}>
                                <SelectTrigger className="h-9 text-xs font-semibold">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">📅 Dnevni izvještaj (1 dan)</SelectItem>
                                    <SelectItem value="weekly">🗓️ Tjedni izvještaj (Ponedjeljak – Nedjelja)</SelectItem>
                                    <SelectItem value="monthly">📊 Mjesečni izvještaj (Puni mjesec)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 2. Date Selection (Adapts according to report type) */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">
                                {reportType === "daily" ? "2. Odaberi dan" : reportType === "weekly" ? "2. Početni datum (ili dan u tjednu)" : "2. Odaberi mjesec"}
                            </Label>
                            <DatePicker
                                date={selectedDate}
                                onChange={(d) => d && setSelectedDate(d)}
                                placeholder="Odaberi datum"
                            />
                        </div>

                        {/* 3. Crane Selection */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Dizalica</Label>
                            <Select value={craneId} onValueChange={setCraneId}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Sve dizalice (sve 3)</SelectItem>
                                    {cranes.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 4. Status Selection */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Status operacija</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi aktivni statusi</SelectItem>
                                    <SelectItem value="approved">Odobreno</SelectItem>
                                    <SelectItem value="completed">Dovršeno</SelectItem>
                                    <SelectItem value="cancelled">Otkazano</SelectItem>
                                    <SelectItem value="rejected">Odbijeno</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="maint-checkbox"
                                checked={includeMaintenance}
                                onCheckedChange={(v) => setIncludeMaintenance(!!v)}
                            />
                            <Label htmlFor="maint-checkbox" className="text-xs cursor-pointer select-none">
                                Prikaži planirana održavanja i blokade
                            </Label>
                        </div>

                        <Badge variant="outline" className="text-xs font-semibold bg-primary/5 text-primary border-primary/20">
                            {periodLabel}
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Export and Preview Section */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-4">
                    <ExportActions
                        excelData={excelExportData}
                        excelFileName={`Plan_rada_dizalica_${effectiveFrom}`}
                        onPdfExport={() => {
                            exportSchedulePdf({
                                reportType,
                                selectedDate,
                                effectiveFrom,
                                effectiveTo,
                                cranes,
                                reservations: mergedList,
                                workStart: sysSettings?.workdayStart || "08:00",
                                workEnd: sysSettings?.workdayEnd || "16:00",
                                marinaName: sysSettings?.marinaName || "PŠD Špinut",
                            });
                        }}
                    />

                    {/* Preview Page */}
                    <div className="border rounded-xl bg-card p-6 sm:p-8 shadow-sm max-w-[29cm] mx-auto report-print-container">
                        <ReportHeader title="Plan rada dizalica" dateFrom={effectiveFrom} dateTo={effectiveTo} />

                        {/* Active Period Banner */}
                        <div className="my-4 p-3 bg-slate-50 dark:bg-slate-900 border rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-primary" />
                                <span className="font-bold text-sm text-foreground">{periodLabel}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                Ukupno zahvata u razdoblju: <strong className="text-foreground">{mergedList.length}</strong>
                            </span>
                        </div>

                        {/* DAILY VIEW: 3 Parallel Columns for Cranes */}
                        {reportType === "daily" && (
                            <div className="space-y-4">
                                <Table className="border">
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="w-[14%] font-bold text-center border-r">Termin</TableHead>
                                            {cranes.slice(0, 3).map((crane) => (
                                                <TableHead key={crane.id} className="font-bold text-center border-r">
                                                    {crane.name}
                                                </TableHead>
                                            ))}
                                            {cranes.length < 3 && Array.from({ length: 3 - cranes.length }).map((_, idx) => (
                                                <TableHead key={idx} className="font-bold text-center border-r text-muted-foreground">
                                                    Dizalica {cranes.length + idx + 1}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(() => {
                                            const startHour = parseInt(sysSettings?.workdayStart?.split(":")[0] || "8") || 8;
                                            const endHour = parseInt(sysSettings?.workdayEnd?.split(":")[0] || "16") || 16;
                                            const slots: { h: number; m: number }[] = [];
                                            for (let h = startHour; h < endHour; h++) {
                                                slots.push({ h, m: 0 });
                                                slots.push({ h, m: 30 });
                                            }

                                            return slots.map(({ h, m }) => {
                                                const nextM = m === 30 ? 0 : 30;
                                                const nextH = m === 30 ? h + 1 : h;
                                                const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} - ${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
                                                
                                                return (
                                                    <TableRow key={`${h}-${m}`} className="hover:bg-transparent">
                                                        <TableCell className="font-bold font-mono text-center text-xs bg-muted/20 border-r py-2">
                                                            {timeStr}
                                                        </TableCell>
                                                        {Array.from({ length: 3 }).map((_, colIdx) => {
                                                            const crane = cranes[colIdx];
                                                            if (!crane) {
                                                                return <TableCell key={colIdx} className="border-r" />;
                                                            }

                                                            const slotItems = mergedList.filter(r => {
                                                                if (r.craneId !== crane.id || !r.scheduledStart) return false;
                                                                const dt = new Date(r.scheduledStart);
                                                                const sH = dt.getHours();
                                                                const sM = dt.getMinutes();
                                                                return sH === h && Math.floor(sM / 30) * 30 === m;
                                                            });

                                                            return (
                                                                <TableCell key={crane.id} className="border-r align-top p-2">
                                                                    {slotItems.length > 0 ? (
                                                                        <div className="space-y-1.5">
                                                                            {slotItems.map((item, iIdx) => (
                                                                                <div
                                                                                    key={iIdx}
                                                                                    className={`p-2 border rounded-md text-xs leading-tight ${
                                                                                        item.isMaintenance
                                                                                            ? "bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
                                                                                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                                                                    }`}
                                                                                >
                                                                                    <div className="font-bold text-foreground">
                                                                                        {item.clientName}
                                                                                    </div>
                                                                                    <div className="text-[11px] text-muted-foreground">
                                                                                        Plovilo: {item.vesselName} ({item.vesselRegistration || "—"})
                                                                                    </div>
                                                                                    <div className={`font-semibold text-[11px] mt-0.5 ${item.isMaintenance ? "text-amber-700" : "text-primary"}`}>
                                                                                        {item.serviceTypeName}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[11px] text-muted-foreground/40 italic block text-center py-1">
                                                                            Slobodno
                                                                        </span>
                                                                    )}
                                                                </TableCell>
                                                            );
                                                        })}
                                                    </TableRow>
                                                );
                                            });
                                        })()}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {/* WEEKLY VIEW */}
                        {reportType === "weekly" && (
                            <div className="space-y-4">
                                {renderWeeklyTable()}
                            </div>
                        )}

                        {/* MONTHLY VIEW */}
                        {reportType === "monthly" && (
                            <div className="space-y-4">
                                <Table className="border">
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="w-[12%]">Datum</TableHead>
                                            <TableHead className="w-[10%]">Vrijeme</TableHead>
                                            <TableHead className="w-[20%]">Klijent (OIB)</TableHead>
                                            <TableHead className="w-[22%]">Plovilo (Registracija)</TableHead>
                                            <TableHead className="w-[18%]">Operacija</TableHead>
                                            <TableHead className="w-[18%]">Dizalica</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {mergedList.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="font-mono text-xs">
                                                    {item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy.") : "—"}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs font-bold">
                                                    {item.scheduledStart ? format(new Date(item.scheduledStart), "HH:mm") : "—"}
                                                </TableCell>
                                                <TableCell className="text-xs font-medium">
                                                    {item.clientName}
                                                    {item.userOib && <span className="block text-[10px] text-muted-foreground">OIB: {item.userOib}</span>}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <span className="font-semibold">{item.vesselName}</span>
                                                    {item.vesselRegistration && <span className="block text-[10px] text-muted-foreground font-mono">Reg: {item.vesselRegistration}</span>}
                                                </TableCell>
                                                <TableCell className="text-xs font-bold text-primary">
                                                    {item.serviceTypeName}
                                                </TableCell>
                                                <TableCell className="text-xs font-medium text-muted-foreground">
                                                    {item.craneName || "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {mergedList.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                                                    Nema zabilježenih operacija za odabrani mjesec.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        <ReportFooter
                            summaryItems={[
                                { label: "Ukupno operacija", value: mergedList.filter(r => !r.isMaintenance).length },
                                { label: "Planirano održavanje", value: mergedList.filter(r => r.isMaintenance).length },
                                { label: "Ukupno sati", value: (mergedList.reduce((acc, curr) => acc + (curr.durationMin || 60), 0) / 60).toFixed(1) + " h" }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
