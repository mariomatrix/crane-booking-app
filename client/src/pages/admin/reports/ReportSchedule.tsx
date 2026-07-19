import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ReportPageNav, ReportHeader, ReportFooter, ExportActions } from "@/components/ReportLayout";
import { CraneSchedulePdf } from "@/components/ReportPdfTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CalendarDays, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type ViewMode = "daily-hours" | "daily-cranes" | "weekly" | "monthly";

export default function ReportSchedule() {
    const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
    const [craneId, setCraneId] = useState("all");
    const [status, setStatus] = useState("all");
    const [includeMaintenance, setIncludeMaintenance] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>("daily-hours");

    // Fetch cranes for the filter dropdown
    const { data: cranes = [] } = trpc.crane.list.useQuery();

    let effectiveFrom = from;
    let effectiveTo = to;
    try {
        if (from && !isNaN(Date.parse(from))) {
            if (viewMode === "weekly") {
                effectiveFrom = format(startOfWeek(new Date(from), { weekStartsOn: 1 }), "yyyy-MM-dd");
                effectiveTo = format(endOfWeek(new Date(from), { weekStartsOn: 1 }), "yyyy-MM-dd");
            } else if (viewMode === "monthly") {
                effectiveFrom = format(startOfMonth(new Date(from)), "yyyy-MM-dd");
                effectiveTo = format(endOfMonth(new Date(from)), "yyyy-MM-dd");
            }
        }
    } catch (e) {
        console.error(e);
    }

    const { data: reportData, isLoading, refetch } = trpc.reports.craneSchedule.useQuery({
        from: effectiveFrom,
        to: effectiveTo,
        craneId: craneId === "all" ? undefined : craneId,
        status: status === "all" ? undefined : status,
        includeMaintenance,
    });

    const handleQuickFilter = (type: "today" | "week" | "month") => {
        const today = new Date();
        if (type === "today") {
            const formatted = format(today, "yyyy-MM-dd");
            setFrom(formatted);
            setTo(formatted);
        } else if (type === "week") {
            setFrom(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
            setTo(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
        } else if (type === "month") {
            setFrom(format(startOfMonth(today), "yyyy-MM-dd"));
            setTo(format(endOfMonth(today), "yyyy-MM-dd"));
        }
    };

    const reservationsList = reportData?.reservations || [];
    const maintenanceList = reportData?.maintenance || [];

    // Map raw data for Excel download
    const excelExportData = reservationsList.map(item => ({
        "Br. Rezervacije": item.reservationNumber || "",
        "OIB Klijenta": item.userOib || "",
        "Klijent": item.clientName || "",
        "Plovilo": item.vesselName || "",
        "Registracija": item.vesselRegistration || "",
        "Radnja": item.serviceTypeName || item.serviceTypeName || "",
        "Dizalica": item.craneName || "",
        "Trajanje (min)": item.durationMin || 0,
        "Početak": item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy HH:mm") : "",
        "Kraj": item.scheduledEnd ? format(new Date(item.scheduledEnd), "dd.MM.yyyy HH:mm") : "",
        "Status": item.status || "",
    }));

    // Rendering weekly schedule helper
    const renderWeeklyTable = () => {
        const days = eachDayOfInterval({
            start: startOfWeek(new Date(from), { weekStartsOn: 1 }),
            end: endOfWeek(new Date(from), { weekStartsOn: 1 })
        });

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Dizalica</TableHead>
                        {days.map((day, idx) => (
                            <TableHead key={idx} className="text-center font-medium">
                                {format(day, "EEEE")}<br />
                                <span className="text-xs text-muted-foreground">{format(day, "dd.MM.yyyy")}</span>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {cranes.map(crane => (
                        <TableRow key={crane.id}>
                            <TableCell className="font-semibold">{crane.name}</TableCell>
                            {days.map((day, dIdx) => {
                                const dayStr = format(day, "yyyy-MM-dd");
                                const dayReservations = reservationsList.filter(r =>
                                    r.craneId === crane.id &&
                                    r.scheduledStart &&
                                    format(new Date(r.scheduledStart), "yyyy-MM-dd") === dayStr
                                );
                                return (
                                    <TableCell key={dIdx} className="align-top border">
                                        <div className="space-y-1">
                                            {dayReservations.map((r, rIdx) => (
                                                <div key={rIdx} className="text-[11px] p-1.5 border rounded bg-slate-50 dark:bg-slate-900 leading-tight">
                                                    <span className="font-bold">{format(new Date(r.scheduledStart!), "HH:mm")}</span> - {r.clientName}<br />
                                                    <span className="text-muted-foreground">{r.vesselName} ({r.vesselRegistration})</span><br />
                                                    <span className="text-[10px] text-blue-600 font-medium">{r.serviceTypeName}</span>
                                                </div>
                                            ))}
                                            {dayReservations.length === 0 && (
                                                <span className="text-[10px] text-muted-foreground italic">Nema operacija</span>
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
            <Card className="no-print report-filters-card">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" /> Filteri i Opcije Prikaza
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <Label>Datum od</Label>
                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Datum do</Label>
                            <Input 
                                type="date" 
                                value={to} 
                                onChange={(e) => setTo(e.target.value)} 
                                disabled={viewMode === "weekly" || viewMode === "monthly"}
                            />
                            {(viewMode === "weekly" || viewMode === "monthly") && (
                                <span className="text-[10px] text-muted-foreground block italic">Automatski izračunato prema 'Datum od'</span>
                            )}
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
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi aktivni</SelectItem>
                                    <SelectItem value="approved">Odobreno</SelectItem>
                                    <SelectItem value="completed">Dovršeno</SelectItem>
                                    <SelectItem value="cancelled">Otkazano</SelectItem>
                                    <SelectItem value="rejected">Odbijeno</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="maint-checkbox"
                                checked={includeMaintenance}
                                onCheckedChange={(v) => setIncludeMaintenance(!!v)}
                            />
                            <Label htmlFor="maint-checkbox" className="text-sm font-normal cursor-pointer">
                                Prikaži planirana održavanja/blokade
                            </Label>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleQuickFilter("today")}>Danas</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleQuickFilter("week")}>Ovaj tjedan</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleQuickFilter("month")}>Ovaj mjesec</Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t pt-4">
                        <Button
                            variant={viewMode === "daily-hours" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setViewMode("daily-hours")}
                        >
                            Dnevni (po satima)
                        </Button>
                        <Button
                            variant={viewMode === "daily-cranes" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setViewMode("daily-cranes")}
                        >
                            Dnevni (po dizalicama)
                        </Button>
                        <Button
                            variant={viewMode === "weekly" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setViewMode("weekly")}
                        >
                            Tjedni raspored
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Export and Preview Buttons */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="space-y-4">
                    <ExportActions
                        excelData={excelExportData}
                        excelFileName="Plan_rada_dizalica"
                        pdfDocument={<CraneSchedulePdf data={reservationsList} dateFrom={effectiveFrom} dateTo={effectiveTo} marinaName="PŠD Špinut" />}
                        pdfFileName="Plan_rada_dizalica"
                    />

                    {/* Preview Page */}
                    <div className="border rounded-lg bg-card p-8 shadow-sm max-w-[21cm] mx-auto report-print-container">
                        <ReportHeader title="Plan rada dizalica" dateFrom={effectiveFrom} dateTo={effectiveTo} />

                        {/* Rendering View Options */}
                        {viewMode === "daily-hours" && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Plan rada kronološki</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[12%]">Početak</TableHead>
                                            <TableHead className="w-[12%]">Trajanje</TableHead>
                                            <TableHead className="w-[20%]">OIB klijenta</TableHead>
                                            <TableHead className="w-[20%]">Klijent</TableHead>
                                            <TableHead className="w-[20%]">Plovilo (Registracija)</TableHead>
                                            <TableHead className="w-[16%]">Radnja (Dizalica)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reservationsList.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="font-semibold font-mono">
                                                    {item.scheduledStart ? format(new Date(item.scheduledStart), "HH:mm") : "-"}
                                                </TableCell>
                                                <TableCell className="font-mono">{item.durationMin} min</TableCell>
                                                <TableCell className="font-mono text-sm">{item.userOib || "—"}</TableCell>
                                                <TableCell className="font-medium">{item.clientName}</TableCell>
                                                <TableCell>
                                                    <span className="font-semibold">{item.vesselName}</span>
                                                    {item.vesselRegistration && <span className="block text-xs text-muted-foreground font-mono">Reg: {item.vesselRegistration}</span>}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-semibold text-blue-600 dark:text-blue-400">{item.serviceTypeName || "—"}</span>
                                                    <span className="block text-xs text-muted-foreground">{item.craneName}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {reservationsList.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                                                    Nema rezervacija za odabrani dan i dizalicu.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {viewMode === "daily-cranes" && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Plan rada po dizalicama</h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Termin</TableHead>
                                            {cranes.map(crane => (
                                                <TableHead key={crane.id}>{crane.name}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Array.from({ length: 9 }).map((_, hourIdx) => {
                                            const hour = 8 + hourIdx;
                                            const timeStr = `${String(hour).padStart(2, "0")}:00`;
                                            return (
                                                <TableRow key={hourIdx}>
                                                    <TableCell className="font-bold font-mono">{timeStr}</TableCell>
                                                    {cranes.map(crane => {
                                                        const activeR = reservationsList.find(r => {
                                                            if (!r.scheduledStart || r.craneId !== crane.id) return false;
                                                            const startH = new Date(r.scheduledStart).getHours();
                                                            return startH === hour;
                                                        });

                                                        return (
                                                            <TableCell key={crane.id} className="border">
                                                                {activeR ? (
                                                                    <div className="text-xs p-1.5 border rounded bg-slate-50 dark:bg-slate-900">
                                                                        <span className="font-bold">{activeR.clientName}</span>{"\n"}
                                                                        <span className="block text-muted-foreground font-mono text-[10px]">OIB: {activeR.userOib}</span>
                                                                        <span className="block text-primary font-semibold text-[10px]">{activeR.serviceTypeName}</span>
                                                                        <span className="block text-[10px]">Plovilo: {activeR.vesselName} ({activeR.vesselRegistration})</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] text-muted-foreground italic">— Slobodno —</span>
                                                                )}
                                                            </TableCell>
                                                        );
                                                    })}
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {viewMode === "weekly" && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Tjedni pregled rada</h3>
                                {renderWeeklyTable()}
                            </div>
                        )}

                        {viewMode === "monthly" && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Mjesečni pregled rada</h3>
                                <p className="text-sm text-muted-foreground">Preporučuje se tjedni ili dnevni ispis. Mjesečni ispis se preporučuje preuzeti kao Excel tablicu radi veće preglednosti podataka.</p>
                            </div>
                        )}

                        <ReportFooter
                            summaryItems={[
                                { label: "Ukupno zahtjeva", value: reservationsList.length },
                                { label: "Kumulativno vrijeme", value: (reservationsList.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
                            ]}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
