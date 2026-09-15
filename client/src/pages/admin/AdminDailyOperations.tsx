import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    CalendarCheck,
    Play,
    CheckCircle2,
    Clock,
    Filter,
    Printer,
    Download,
    RefreshCw,
    Ship,
    User,
    Anchor,
    AlertCircle,
    FileText,
    ChevronLeft,
    ChevronRight,
    Edit3,
    ClipboardList,
    Loader2,
    Check,
} from "lucide-react";
import { WorkOrderExecutionDialog } from "@/components/WorkOrderExecutionDialog";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CalendarSchedulePdf } from "@/components/ReportPdfTemplates";
import { formatAppDate, formatToSqlDate } from "@/lib/date-utils";
import { toZagreb, fromZagreb, formatZagrebDate } from "@shared/timezone";
import { addDays, subDays, format } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

export default function AdminDailyOperations() {
    const { lang } = useLang();
    const isHr = lang === "hr";

    // Date navigation: defaults to today in Europe/Zagreb
    const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
    const [selectedCrane, setSelectedCrane] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [search, setSearch] = useState<string>("");

    // Work order modal state
    const [activeWorkOrderRes, setActiveWorkOrderRes] = useState<any | null>(null);

    // Quick edit modal state
    const [editingRes, setEditingRes] = useState<any | null>(null);
    const [editAdminNote, setEditAdminNote] = useState<string>("");
    const [editDurationMin, setEditDurationMin] = useState<string>("30");

    const utils = trpc.useUtils();

    const selectedDateStr = useMemo(() => {
        return toZagreb(selectedDate).dateStr;
    }, [selectedDate]);

    // Query daily operations
    const { data: operations = [], isLoading, refetch, isRefetching } = trpc.reservation.listDailyOperations.useQuery({
        dateStr: selectedDateStr,
        craneId: selectedCrane === "all" ? undefined : selectedCrane,
        status: statusFilter === "all" ? undefined : (statusFilter as any),
    });

    // Query cranes list for filter
    const { data: cranesList = [] } = trpc.crane.list.useQuery();
    const { data: sysSettings } = trpc.settings.get.useQuery();

    // Quick edit mutation
    const updateResMutation = trpc.reservation.updateDetails.useMutation({
        onSuccess: () => {
            toast.success(isHr ? "Rezervacija je ažurirana." : "Reservation updated.");
            utils.reservation.listDailyOperations.invalidate();
            utils.reservation.listAll.invalidate();
            utils.calendar.events.invalidate();
            setEditingRes(null);
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleQuickEditSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRes) return;
        updateResMutation.mutate({
            id: editingRes.id,
            adminNote: editAdminNote,
            durationMin: Number(editDurationMin) || 30,
        });
    };

    // Filter by search
    const filteredOps = useMemo(() => {
        if (!search.trim()) return operations;
        const q = search.toLowerCase().trim();
        return operations.filter((op: any) => {
            const userStr = `${op.user?.name || ""} ${op.user?.oib || ""} ${op.user?.email || ""}`.toLowerCase();
            const vesselStr = `${op.vessel?.name || op.vesselName || ""} ${op.vessel?.registration || op.vesselRegistration || ""}`.toLowerCase();
            const serviceStr = (op.serviceType?.name || "").toLowerCase();
            const numStr = (op.reservationNumber || "").toLowerCase();
            const woStr = (op.workOrder?.orderNumber || "").toLowerCase();
            return userStr.includes(q) || vesselStr.includes(q) || serviceStr.includes(q) || numStr.includes(q) || woStr.includes(q);
        });
    }, [operations, search]);

    // Statistics / KPI metrics
    const metrics = useMemo(() => {
        const total = operations.length;
        const completedOrders = operations.filter((o: any) => o.workOrder?.status === "completed").length;
        const inProgressOrders = operations.filter((o: any) => o.workOrder?.status === "in_progress").length;
        const notStartedOrders = operations.filter((o: any) => !o.workOrder).length;
        const totalMinutes = operations.reduce((acc: number, curr: any) => {
            return acc + (Number(curr.workOrder?.actualDurationMin) || Number(curr.durationMin) || 30);
        }, 0);
        const totalHours = (totalMinutes / 60).toFixed(1);

        return {
            total,
            completedOrders,
            inProgressOrders,
            notStartedOrders,
            totalHours,
        };
    }, [operations]);

    // Excel export handler
    const handleExportExcel = () => {
        const rows = filteredOps.map((op: any) => {
            const startStr = op.scheduledStart ? toZagreb(op.scheduledStart).timeStr : "";
            const endStr = op.scheduledEnd ? toZagreb(op.scheduledEnd).timeStr : "";
            const clientName = op.user?.name || op.clientName || "—";
            const oib = op.user?.oib || op.userOib || "—";
            const clientType = op.user?.clientCategory === "external" ? "Vanjski" : "Član PŠD";
            const vesselName = op.vessel?.name || op.vesselName || "—";
            const vesselReg = op.vessel?.registration || op.vesselRegistration || "—";
            const craneName = op.crane?.name || "—";
            const service = op.isMaintenance ? "Održavanje" : (op.serviceType?.name || "—");
            const landZone = op.landZone?.code ? `${op.landZone.name} (${op.landZone.code})` : "—";
            const woNumber = op.workOrder?.orderNumber || "Nije pokrenut";
            const woStatus = op.workOrder?.status === "completed" ? "Dovršen" : (op.workOrder?.status === "in_progress" ? "U tijeku" : "Nije otvoren");
            const actualDur = op.workOrder?.actualDurationMin ? `${op.workOrder.actualDurationMin} min` : `${op.durationMin || 30} min`;

            return {
                "Termin": `${startStr} - ${endStr}`,
                "Dizalica": craneName,
                "Klijent": clientName,
                "OIB": oib,
                "Status klijenta": clientType,
                "Plovilo": vesselName,
                "Registracija": vesselReg,
                "Usluga / Radnja": service,
                "Suhi vez": landZone,
                "Radni nalog": woNumber,
                "Status radnog naloga": woStatus,
                "Trajanje": actualDur,
                "Napomena": op.workOrder?.operatorNotes || op.adminNote || "",
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Dnevne operacije");
        XLSX.writeFile(wb, `Dnevne_operacije_${selectedDateStr}.xlsx`);
        toast.success(isHr ? "Excel datoteka je uspješno preuzeta." : "Excel exported successfully.");
    };

    const isToday = toZagreb(new Date()).dateStr === selectedDateStr;

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
                        <CalendarCheck className="h-7 w-7 text-primary" />
                        {isHr ? "Dnevne operacije dizalica" : "Daily Crane Operations"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isHr
                            ? "Dnevni pregled odobrenih rezervacija, pokretanje i zaključenje radnih naloga te unos izmjena i dodataka."
                            : "Daily operational overview, work order execution, time logging, and extras tracking."}
                    </p>
                </div>

                {/* Main Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className="gap-1.5"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">{isHr ? "Osvježi" : "Refresh"}</span>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportExcel}
                        className="gap-1.5"
                        disabled={filteredOps.length === 0}
                    >
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">{isHr ? "Izvoz Excel" : "Export Excel"}</span>
                    </Button>

                    <PDFDownloadLink
                        key={`${selectedDateStr}-${selectedCrane}-${operations.length}`}
                        document={
                            <CalendarSchedulePdf
                                date={selectedDate}
                                cranes={selectedCrane === "all" ? cranesList : cranesList.filter(c => String(c.id) === selectedCrane)}
                                reservations={operations}
                                workStart={sysSettings?.workHoursStart || "08:00"}
                                workEnd={sysSettings?.workHoursEnd || "16:00"}
                                marinaName={sysSettings?.marinaName || "PŠD Špinut"}
                                marinaLogo={sysSettings?.marinaLogo || undefined}
                            />
                        }
                        fileName={`Plan_rada_dizalica_${selectedDateStr}.pdf`}
                    >
                        {({ loading }: { loading: boolean }) => (
                            <Button variant="default" size="sm" disabled={loading} className="gap-1.5 bg-primary text-white">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                                <span>{isHr ? "Ispiši plan (PDF)" : "Print PDF"}</span>
                            </Button>
                        )}
                    </PDFDownloadLink>
                </div>
            </div>

            {/* Date Navigation & Filter Bar */}
            <Card className="shadow-sm border-muted">
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Date Switcher */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setSelectedDate(prev => subDays(prev, 1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            <Button
                                variant={isToday ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedDate(new Date())}
                                className="text-xs h-9 px-3"
                            >
                                {isHr ? "Danas" : "Today"}
                            </Button>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setSelectedDate(prev => addDays(prev, 1))}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>

                            <div className="flex items-center gap-2 ml-1">
                                <Input
                                    type="date"
                                    value={selectedDateStr}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            setSelectedDate(fromZagreb(e.target.value, "12:00"));
                                        }
                                    }}
                                    className="w-40 h-9 font-medium text-xs sm:text-sm"
                                />
                                <span className="text-sm font-semibold text-slate-700 hidden md:inline">
                                    ({formatZagrebDate(selectedDate, { lang: isHr ? "hr" : "en" })})
                                </span>
                            </div>
                        </div>

                        {/* Filters & Search */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Crane Filter */}
                            <Select value={selectedCrane} onValueChange={setSelectedCrane}>
                                <SelectTrigger className="w-[160px] h-9 text-xs">
                                    <SelectValue placeholder={isHr ? "Sve dizalice" : "All cranes"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{isHr ? "Sve dizalice" : "All cranes"}</SelectItem>
                                    {cranesList.map((c: any) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Status Filter */}
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px] h-9 text-xs">
                                    <SelectValue placeholder={isHr ? "Svi statusi" : "All statuses"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{isHr ? "Svi statusi" : "All statuses"}</SelectItem>
                                    <SelectItem value="approved">{isHr ? "Odobreno" : "Approved"}</SelectItem>
                                    <SelectItem value="in_progress">{isHr ? "U tijeku" : "In Progress"}</SelectItem>
                                    <SelectItem value="completed">{isHr ? "Završeno" : "Completed"}</SelectItem>
                                    <SelectItem value="pending">{isHr ? "Na čekanju" : "Pending"}</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Search */}
                            <Input
                                placeholder={isHr ? "Traži klijenta, reg, nalog..." : "Search client, vessel..."}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-[180px] sm:w-[220px] h-9 text-xs"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                {isHr ? "Ukupno rezervacija" : "Total Bookings"}
                            </p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</h3>
                        </div>
                        <CalendarCheck className="h-8 w-8 text-slate-400 opacity-60" />
                    </CardContent>
                </Card>

                <Card className="bg-amber-50/70 border-amber-200">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">
                                {isHr ? "Čeka radni nalog" : "Pending Order"}
                            </p>
                            <h3 className="text-2xl font-bold text-amber-900 mt-1">{metrics.notStartedOrders}</h3>
                        </div>
                        <Clock className="h-8 w-8 text-amber-500 opacity-70" />
                    </CardContent>
                </Card>

                <Card className="bg-blue-50/70 border-blue-200">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">
                                {isHr ? "U radu / Izvršava se" : "In Progress"}
                            </p>
                            <h3 className="text-2xl font-bold text-blue-900 mt-1">{metrics.inProgressOrders}</h3>
                        </div>
                        <Play className="h-8 w-8 text-blue-500 opacity-70" />
                    </CardContent>
                </Card>

                <Card className="bg-emerald-50/70 border-emerald-200">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
                                {isHr ? "Dovršeni nalozi" : "Completed Orders"}
                            </p>
                            <h3 className="text-2xl font-bold text-emerald-900 mt-1">
                                {metrics.completedOrders}
                                <span className="text-xs font-normal text-slate-500 ml-1.5">
                                    ({metrics.totalHours} h rada)
                                </span>
                            </h3>
                        </div>
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-70" />
                    </CardContent>
                </Card>
            </div>

            {/* Operations Table */}
            <Card className="shadow-sm border-muted overflow-hidden">
                <CardHeader className="py-4 px-5 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">
                            {isHr ? "Raspored operacija za dan" : "Schedule of Operations for"} {formatZagrebDate(selectedDate, { lang: isHr ? "hr" : "en" })}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                            {filteredOps.length} {isHr ? "operacija" : "operations"}
                        </span>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm">{isHr ? "Učitavam dnevne operacije..." : "Loading daily operations..."}</p>
                        </div>
                    ) : filteredOps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                            <Ship className="h-10 w-10 text-slate-300 mb-1" />
                            <p className="text-base font-medium text-slate-700">
                                {isHr ? "Nema rezervacija za odabrani datum i filtre." : "No operations scheduled for selected date and filters."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {isHr ? "Promijenite datum ili filtar dizalice u gornjoj traci." : "Change date or crane filter above."}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="w-[120px] font-semibold">{isHr ? "Vrijeme" : "Time Slot"}</TableHead>
                                        <TableHead className="w-[130px] font-semibold">{isHr ? "Dizalica" : "Crane"}</TableHead>
                                        <TableHead className="min-w-[180px] font-semibold">{isHr ? "Klijent" : "Client"}</TableHead>
                                        <TableHead className="min-w-[180px] font-semibold">{isHr ? "Plovilo" : "Vessel"}</TableHead>
                                        <TableHead className="min-w-[150px] font-semibold">{isHr ? "Usluga / Kopno" : "Service / Land"}</TableHead>
                                        <TableHead className="w-[170px] font-semibold">{isHr ? "Radni nalog" : "Work Order"}</TableHead>
                                        <TableHead className="text-right w-[150px] font-semibold">{isHr ? "Akcija" : "Action"}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOps.map((op: any) => {
                                        const startZg = op.scheduledStart ? toZagreb(op.scheduledStart) : null;
                                        const endZg = op.scheduledEnd ? toZagreb(op.scheduledEnd) : null;
                                        const timeSlotStr = startZg && endZg ? `${startZg.timeStr} - ${endZg.timeStr}` : (startZg ? startZg.timeStr : "—");
                                        const duration = Number(op.durationMin) || 30;

                                        const clientName = op.user?.name || op.clientName || "Nepoznat klijent";
                                        const oib = op.user?.oib || op.userOib;
                                        const isMember = op.user?.clientCategory !== "external";
                                        const vesselName = op.vessel?.name || op.vesselName || "—";
                                        const vesselReg = op.vessel?.registration || op.vesselRegistration || "—";
                                        const vesselLen = op.vessel?.lengthM || op.vesselLengthM;

                                        const serviceName = op.isMaintenance ? "ODRŽAVANJE" : (op.serviceType?.name || "Operacija dizalicom");
                                        const landZoneLabel = op.landZone?.code
                                            ? `${op.landZone.name} (${op.landZone.code})`
                                            : (op.landZone?.name || null);

                                        const wo = op.workOrder;
                                        const woStatus = wo ? wo.status : "none";

                                        return (
                                            <TableRow key={op.id} className="hover:bg-muted/30 transition-colors">
                                                {/* Time slot */}
                                                <TableCell className="font-medium align-top py-3.5">
                                                    <div className="font-semibold text-slate-900 text-sm">{timeSlotStr}</div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">({duration} min)</div>
                                                </TableCell>

                                                {/* Crane */}
                                                <TableCell className="align-top py-3.5">
                                                    <Badge variant="outline" className="bg-slate-100 font-semibold border-slate-300 text-slate-800">
                                                        {op.crane?.name || "Dizalica"}
                                                    </Badge>
                                                </TableCell>

                                                {/* Client */}
                                                <TableCell className="align-top py-3.5">
                                                    <div className="font-semibold text-slate-900 text-sm">{clientName}</div>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        {oib && <span className="text-xs text-slate-500">OIB: {oib}</span>}
                                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                                            {isMember ? (isHr ? "Član" : "Member") : (isHr ? "Vanjski" : "External")}
                                                        </Badge>
                                                    </div>
                                                </TableCell>

                                                {/* Vessel */}
                                                <TableCell className="align-top py-3.5">
                                                    <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                                                        <Ship className="h-3.5 w-3.5 text-slate-500" />
                                                        {vesselName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        Reg: <span className="font-medium text-slate-700">{vesselReg}</span>
                                                        {vesselLen ? ` • ${vesselLen} m` : ""}
                                                    </div>
                                                </TableCell>

                                                {/* Service & Dry berth */}
                                                <TableCell className="align-top py-3.5">
                                                    <div className="font-semibold text-sm text-sky-700">
                                                        {serviceName}
                                                    </div>
                                                    {landZoneLabel ? (
                                                        <div className="flex items-center gap-1 text-xs text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 mt-1 border border-amber-200/80 w-fit">
                                                            <Anchor className="h-3 w-3" />
                                                            <span>{landZoneLabel}</span>
                                                        </div>
                                                    ) : op.serviceType?.operationCategory === "lift_from_sea" ? (
                                                        <div className="text-xs text-rose-600 font-medium mt-1">
                                                            ⚠️ {isHr ? "Kopno nije dodijeljeno" : "No land zone"}
                                                        </div>
                                                    ) : null}
                                                </TableCell>

                                                {/* Work Order Status */}
                                                <TableCell className="align-top py-3.5">
                                                    {!wo ? (
                                                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-300 text-xs">
                                                            {isHr ? "Nije pokrenut" : "Not started"}
                                                        </Badge>
                                                    ) : woStatus === "completed" ? (
                                                        <div className="space-y-1">
                                                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                {wo.orderNumber}
                                                            </Badge>
                                                            <div className="text-[11px] text-slate-500">
                                                                {isHr ? "Dovršeno" : "Completed"} ({wo.actualDurationMin || duration} min)
                                                            </div>
                                                            {wo.operatorNotes && (
                                                                <div className="text-[11px] text-amber-900 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200/80 rounded px-1.5 py-0.5 mt-1 text-left line-clamp-2 italic" title={`Napomena: ${wo.operatorNotes}`}>
                                                                    📝 {wo.operatorNotes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-white gap-1 animate-pulse text-xs">
                                                                <Play className="h-3 w-3" />
                                                                {wo.orderNumber}
                                                            </Badge>
                                                            <div className="text-[11px] text-blue-700 font-medium">
                                                                {isHr ? "U radu" : "In execution"}
                                                            </div>
                                                            {wo.operatorNotes && (
                                                                <div className="text-[11px] text-amber-900 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200/80 rounded px-1.5 py-0.5 mt-1 text-left line-clamp-2 italic" title={`Napomena: ${wo.operatorNotes}`}>
                                                                    📝 {wo.operatorNotes}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>

                                                {/* Actions */}
                                                <TableCell className="align-top text-right py-3.5 space-y-1.5">
                                                    {!wo ? (
                                                        <Button
                                                            size="sm"
                                                            className="w-full sm:w-auto bg-primary text-white hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-sm"
                                                            onClick={() => setActiveWorkOrderRes(op)}
                                                        >
                                                            <Play className="h-3.5 w-3.5" />
                                                            {isHr ? "Pokreni nalog" : "Start Order"}
                                                        </Button>
                                                    ) : woStatus === "in_progress" ? (
                                                        <Button
                                                            size="sm"
                                                            className="w-full sm:w-auto bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold gap-1.5 shadow-sm"
                                                            onClick={() => setActiveWorkOrderRes(op)}
                                                        >
                                                            <ClipboardList className="h-3.5 w-3.5" />
                                                            {isHr ? "Dovrši / Izmijeni" : "Complete / Edit"}
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="w-full sm:w-auto text-xs font-medium gap-1.5"
                                                            onClick={() => setActiveWorkOrderRes(op)}
                                                        >
                                                            <FileText className="h-3.5 w-3.5" />
                                                            {isHr ? "Pregled naloga" : "View Order"}
                                                        </Button>
                                                    )}

                                                    <div>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-xs text-muted-foreground hover:text-foreground h-6 px-1.5"
                                                            onClick={() => {
                                                                setEditingRes(op);
                                                                setEditAdminNote(op.adminNote || "");
                                                                setEditDurationMin(String(op.durationMin || 30));
                                                            }}
                                                        >
                                                            <Edit3 className="h-3 w-3 mr-1" />
                                                            {isHr ? "Uredi termin" : "Edit slot"}
                                                        </Button>
                                                    </div>
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

            {/* Work Order Execution Modal */}
            {activeWorkOrderRes && (
                <WorkOrderExecutionDialog
                    open={!!activeWorkOrderRes}
                    onOpenChange={(open) => {
                        if (!open) setActiveWorkOrderRes(null);
                    }}
                    reservationId={activeWorkOrderRes.id}
                    craneId={activeWorkOrderRes.craneId}
                    craneName={activeWorkOrderRes.crane?.name}
                    userName={activeWorkOrderRes.user?.name}
                    userOib={activeWorkOrderRes.user?.oib || activeWorkOrderRes.userOib}
                    isMember={activeWorkOrderRes.user?.clientCategory !== "external"}
                    vesselName={activeWorkOrderRes.vessel?.name || activeWorkOrderRes.vesselName}
                    vesselLengthM={activeWorkOrderRes.vessel?.lengthM || activeWorkOrderRes.vesselLengthM}
                    onSuccess={() => {
                        utils.reservation.listDailyOperations.invalidate();
                        utils.workOrders.list.invalidate();
                        utils.reservation.listAll.invalidate();
                        utils.calendar.events.invalidate();
                    }}
                />
            )}

            {/* Quick Edit Reservation Dialog */}
            <Dialog open={!!editingRes} onOpenChange={(open) => !open && setEditingRes(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isHr ? "Uredi detalje rezervacije" : "Edit Reservation Details"}</DialogTitle>
                        <DialogDescription>
                            {editingRes?.vessel?.registration || editingRes?.vesselRegistration || "Plovilo"} — {editingRes?.user?.name || "Korisnik"}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleQuickEditSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="durationInput">{isHr ? "Planirano trajanje (minuta)" : "Duration (minutes)"}</Label>
                            <Input
                                id="durationInput"
                                type="number"
                                step="15"
                                min="15"
                                max="240"
                                value={editDurationMin}
                                onChange={(e) => setEditDurationMin(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="adminNoteInput">{isHr ? "Interna napomena operatera" : "Operator internal note"}</Label>
                            <Textarea
                                id="adminNoteInput"
                                rows={3}
                                value={editAdminNote}
                                onChange={(e) => setEditAdminNote(e.target.value)}
                                placeholder={isHr ? "Zabilješke o vremenskim prilikama, posebnostima podizanja..." : "Notes..."}
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button variant="outline" type="button" onClick={() => setEditingRes(null)}>
                                {isHr ? "Odustani" : "Cancel"}
                            </Button>
                            <Button type="submit" disabled={updateResMutation.isPending}>
                                {updateResMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                                {isHr ? "Spremi promjene" : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
