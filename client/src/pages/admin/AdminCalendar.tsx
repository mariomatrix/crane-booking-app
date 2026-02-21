import { useState, useMemo, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg, DatesSetArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Hammer, Loader2, Filter, Users, Anchor, ChevronLeft, ChevronRight, ListTodo, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { addDays, startOfDay, format, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#10b981",
    rejected: "#ef4444",
    cancelled: "#6b7280",
};

const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function AdminCalendar() {
    const { lang } = useLang();
    const [viewDate, setViewDate] = useState<Date>(startOfDay(new Date()));
    const [statusFilters, setStatusFilters] = useState<string[]>(["pending", "approved"]);
    const [selectedUser, setSelectedUser] = useState<string>("all");
    const [selectedCrane, setSelectedCrane] = useState<string>("all");
    const [isMaintOpen, setIsMaintOpen] = useState(false);

    // Filters and Data
    const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false });
    const { data: usersList = [] } = trpc.user.list.useQuery();
    const { data: allReservations = [], isLoading: isResLoading } = trpc.reservation.listAll.useQuery({
        status: statusFilters.length > 0 ? statusFilters : undefined,
        userId: selectedUser !== "all" ? Number(selectedUser) : undefined,
        startDate: viewDate,
        endDate: addDays(viewDate, 1),
    });
    const { data: waitingList = [] } = trpc.waitingList.listAll.useQuery();
    const { data: sysSettings } = trpc.settings.get.useQuery();
    const utils = trpc.useUtils();

    const workStart = sysSettings?.workdayStart ?? "08:00";
    const workEnd = sysSettings?.workdayEnd ?? "16:00";

    // Maintenance Form State
    const [maintCraneId, setMaintCraneId] = useState("");
    const [maintDate, setMaintDate] = useState(new Date().toISOString().split("T")[0]);
    const [maintStart, setMaintStart] = useState("08:00");
    const [maintEnd, setMaintEnd] = useState("09:00");
    const [maintDesc, setMaintDesc] = useState("");

    // Mutations
    const rescheduleMutation = trpc.reservation.reschedule.useMutation({
        onSuccess: () => {
            toast.success("Termin je premješten.");
            utils.reservation.listAll.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate();
        },
    });

    const maintenanceMutation = trpc.maintenance.create.useMutation({
        onSuccess: () => {
            toast.success("Održavanje je zabilježeno.");
            utils.reservation.listAll.invalidate();
            setIsMaintOpen(false);
            setMaintDesc("");
        },
        onError: (err: any) => toast.error(err.message),
    });

    const updateStatusMutation = trpc.reservation.approve.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija je odobrena.");
            utils.reservation.listAll.invalidate();
            utils.waitingList.listAll.invalidate();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleApproveWaiting = (w: any) => {
        // Find best slot or just open a dialog? 
        // For simplicity, we just approve it and the admin can move it on the calendar.
        // Wait, approval needs an ID of a reservation. Waiting list entries are NOT reservations yet.
        // In this app, a reservation is created when it's moved to the calendar.
        // For now, let's just toast that they should Drag-and-drop (if implemented) or we create a mutation.
        toast.info("Povucite zahtjev na kalendar ili koristite formu za ručni unos.");
    };

    const rejectMutation = trpc.reservation.reject.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija je odbijena.");
            utils.reservation.listAll.invalidate();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleCreateMaintenance = (e: React.FormEvent) => {
        e.preventDefault();
        const start = new Date(`${maintDate}T${maintStart}:00`);
        const end = new Date(`${maintDate}T${maintEnd}:00`);
        maintenanceMutation.mutate({
            craneId: Number(maintCraneId),
            startDate: start,
            endDate: end,
            description: maintDesc,
        });
    };

    // --- Master View Logic: Resource-as-Day Hack ---
    // We map each crane to a "day" index.
    const activeCranes = useMemo(() =>
        cranesList.filter(c => selectedCrane === "all" || String(c.id) === selectedCrane),
        [cranesList, selectedCrane]
    );

    const calendarEvents = useMemo(() => {
        return allReservations.map((r: any) => {
            const craneIdx = activeCranes.findIndex(c => c.id === r.craneId);
            if (craneIdx === -1) return null;

            // Offset the date by crane index to show in correct column
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            const offsetStart = addDays(viewDate, craneIdx);
            offsetStart.setHours(start.getHours(), start.getMinutes(), 0);
            const offsetEnd = addDays(viewDate, craneIdx);
            offsetEnd.setHours(end.getHours(), end.getMinutes(), 0);

            return {
                id: String(r.id),
                title: r.isMaintenance
                    ? (lang === 'hr' ? "ODRŽAVANJE" : "MAINTENANCE")
                    : `${r.vesselName || "Plovilo"} - ${r.vesselWeight}t`,
                start: offsetStart,
                end: offsetEnd,
                backgroundColor: r.isMaintenance ? "#f97316" : (STATUS_COLORS[r.status] ?? "#6b7280"),
                borderColor: "transparent",
                editable: !r.isMaintenance,
                extendedProps: {
                    reservationId: r.id,
                    status: r.status,
                    isMaintenance: r.isMaintenance,
                    user: r.user?.name || r.user?.email || "Nepoznat",
                    craneId: r.craneId,
                    originalStart: r.startDate,
                },
            };
        }).filter(Boolean);
    }, [allReservations, activeCranes, viewDate, lang]);

    const handleEventDrop = (info: EventDropArg) => {
        const id = Number(info.event.extendedProps.reservationId);

        // Calculate new date and time
        const newOffsetDate = info.event.start!;
        const diffDays = Math.round((newOffsetDate.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));

        // Ensure within range of cranes
        if (diffDays < 0 || diffDays >= activeCranes.length) {
            info.revert();
            return;
        }

        const newTargetCrane = activeCranes[diffDays];
        const newStart = new Date(viewDate);
        newStart.setHours(newOffsetDate.getHours(), newOffsetDate.getMinutes(), 0);

        const duration = info.event.end ? (info.event.end.getTime() - info.event.start!.getTime()) : 3600000;
        const newEnd = new Date(newStart.getTime() + duration);

        rescheduleMutation.mutate({
            id,
            startDate: newStart,
            endDate: newEnd,
            craneId: newTargetCrane.id
        });
    };

    const toggleStatus = (status: string) => {
        setStatusFilters(prev =>
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };

    return (
        <div className="flex flex-col h-full space-y-4 pb-8">
            {/* Header & Main Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Administratorski Master Kalendar</h1>
                    <p className="text-muted-foreground">Pregled svih dizalica i upravljanje terminima na jednom mjestu.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog open={isMaintOpen} onOpenChange={setIsMaintOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2">
                                <Hammer className="h-4 w-4" />
                                <span className="hidden sm:inline">Zabilježi održavanje</span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <form onSubmit={handleCreateMaintenance}>
                                <DialogHeader>
                                    <DialogTitle>Zabilježi održavanje / Blokada</DialogTitle>
                                    <DialogDescription>Odredite vrijeme kada dizalica neće biti dostupna korisnicima.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label>Dizalica</Label>
                                        <Select value={maintCraneId} onValueChange={setMaintCraneId} required>
                                            <SelectTrigger><SelectValue placeholder="Odaberi dizalicu" /></SelectTrigger>
                                            <SelectContent>
                                                {cranesList.map((c: any) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Datum</Label>
                                        <Input type="date" value={maintDate} onChange={(e) => setMaintDate(e.target.value)} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Početak</Label>
                                            <Input type="time" step="3600" value={maintStart} onChange={(e) => setMaintStart(e.target.value)} required />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Kraj</Label>
                                            <Input type="time" step="3600" value={maintEnd} onChange={(e) => setMaintEnd(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Opis (opcionalno)</Label>
                                        <Input value={maintDesc} onChange={(e) => setMaintDesc(e.target.value)} placeholder="Zabilješka o radovima..." />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={maintenanceMutation.isPending}>
                                        {maintenanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Spremi blokadu
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Button variant="secondary" onClick={() => window.print()} className="gap-2">
                        <Printer className="h-4 w-4" />
                        <span className="hidden sm:inline">Ispiši dnevni plan</span>
                    </Button>
                </div>
            </div>

            {/* Filters Bar */}
            <Card className="bg-muted/30 border-none shadow-none">
                <CardContent className="p-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground mr-1" />
                        <span className="text-sm font-medium">Statusi:</span>
                        <div className="flex bg-background border rounded-md p-1">
                            {["pending", "approved", "rejected", "cancelled"].map(s => (
                                <Button
                                    key={s}
                                    variant={statusFilters.includes(s) ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => toggleStatus(s)}
                                    className="px-2 py-0 h-7 text-[10px] uppercase font-bold"
                                >
                                    <span
                                        className="h-2 w-2 rounded-full mr-1.5"
                                        style={{ backgroundColor: STATUS_COLORS[s] }}
                                    />
                                    {s === "pending" ? "Na čekanju" : s === "approved" ? "Odobreno" : s === "rejected" ? "Odbijeno" : "Otkazano"}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground mr-1" />
                        <Select value={selectedUser} onValueChange={setSelectedUser}>
                            <SelectTrigger className="w-[180px] h-9 bg-background"><SelectValue placeholder="Korisnik" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Svi korisnici</SelectItem>
                                {usersList.map((u: any) => (
                                    <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Anchor className="h-4 w-4 text-muted-foreground mr-1" />
                        <Select value={selectedCrane} onValueChange={setSelectedCrane}>
                            <SelectTrigger className="w-[180px] h-9 bg-background"><SelectValue placeholder="Dizalica" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Sve dizalice</SelectItem>
                                {cranesList.map((c: any) => (
                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="ml-auto flex items-center bg-background border rounded-md p-1 overflow-hidden shadow-sm">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => addDays(d, -1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="px-3 text-sm font-semibold tabular-nums min-w-[140px] text-center">
                            {format(viewDate, "dd.MM.yyyy.")}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDate(d => addDays(d, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
                {/* Calendar View */}
                <div className="lg:col-span-3 h-[700px] bg-background border rounded-lg overflow-hidden shadow-sm relative">
                    {isResLoading && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    )}
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        .fc .fc-timegrid-axis-cushion { font-size: 0.75rem; color: #666; }
                        .fc .fc-col-header-cell-cushion { 
                            padding: 10px; font-weight: 700; color: #333; 
                            text-transform: uppercase; font-size: 0.85rem;
                        }
                        .fc-theme-standard td, .fc-theme-standard th { border: 1px solid #e5e7eb !important; }
                        .fc-timegrid-event { border-radius: 4px; border: none !important; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .fc-v-event .fc-event-main { padding: 4px; }
                    `}} />
                    <FullCalendar
                        plugins={[timeGridPlugin, interactionPlugin]}
                        initialView="timeGrid"
                        visibleRange={{
                            start: viewDate,
                            end: addDays(viewDate, activeCranes.length || 1)
                        }}
                        headerToolbar={false}
                        allDaySlot={false}
                        slotMinTime={workStart + ":00"}
                        slotMaxTime={workEnd + ":00"}
                        height="100%"
                        editable={true}
                        eventDrop={handleEventDrop}
                        events={calendarEvents}
                        dayHeaderContent={(arg) => {
                            const diff = Math.round((arg.date.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
                            const crane = activeCranes[diff];
                            return crane ? crane.name : "";
                        }}
                        eventContent={(arg) => {
                            const p = arg.event.extendedProps;
                            return (
                                <div className="flex flex-col h-full overflow-hidden p-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-black uppercase opacity-90 truncate">{arg.event.title}</span>
                                        {p.status === 'pending' && <Clock className="h-3 w-3 animate-pulse" />}
                                    </div>
                                    <div className="text-[10px] font-bold opacity-80 leading-tight truncate">{p.user}</div>
                                    {!p.isMaintenance && p.status === 'pending' && (
                                        <div className="mt-auto flex gap-1 pt-1 border-t border-white/20">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: p.reservationId }); }}
                                                className="hover:bg-green-600/50 rounded p-0.5"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); rejectMutation.mutate({ id: p.reservationId, adminNotes: "Preko kalendara" }); }}
                                                className="hover:bg-red-600/50 rounded p-0.5"
                                            >
                                                <XCircle className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        }}
                        dayMaxEvents={true}
                        locale={lang === "hr" ? "hr" : "en"}
                    />
                </div>

                {/* Sidebar: Waiting List & Info */}
                <div className="space-y-4 h-[700px] flex flex-col">
                    <Card className="flex-1 flex flex-col overflow-hidden">
                        <CardHeader className="py-4 px-5 border-b bg-muted/20">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <ListTodo className="h-4 w-4 text-blue-500" />
                                    Lista čekanja
                                </CardTitle>
                                <Badge variant="outline" className="bg-background">{waitingList.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-hidden">
                            <ScrollArea className="h-full">
                                <div className="p-4 space-y-3">
                                    {waitingList.length === 0 ? (
                                        <div className="text-center py-8 text-sm text-muted-foreground italic">
                                            Nema aktivnih zahtjeva u listi čekanja.
                                        </div>
                                    ) : (
                                        waitingList.map((w: any) => (
                                            <div key={w.id} className="p-3 border rounded-lg bg-background hover:border-primary/50 transition-colors shadow-sm group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{w.crane?.name}</span>
                                                    <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{format(parseISO(w.requestedDate), "dd.MM.")}</span>
                                                </div>
                                                <div className="font-semibold text-sm mb-1">{w.user?.name || "Korisnik"}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                                                    <Clock className="h-3 w-3" />
                                                    {w.slotCount}x 60 min slots
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] w-full border-green-200 text-green-700 hover:bg-green-50"
                                                        onClick={() => handleApproveWaiting(w)}
                                                    >
                                                        Detalji zahtjeva
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="py-4 px-5 border-b bg-muted/20">
                            <CardTitle className="text-sm font-bold">Legenda</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2">
                            {Object.entries(STATUS_COLORS).map(([s, color]) => (
                                <div key={s} className="flex items-center gap-2 text-xs">
                                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="capitalize">{s === 'pending' ? 'Na čekanju' : s === 'approved' ? 'Odobreno' : s === 'rejected' ? 'Odbijeno' : 'Otkazano'}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 text-xs mt-2 border-t pt-2">
                                <div className="h-3 w-3 rounded-full bg-[#f97316]" />
                                <span>Blokada / Održavanje</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
