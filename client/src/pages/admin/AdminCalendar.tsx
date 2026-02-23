import { useState, useMemo, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
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
import { addDays, startOfDay, format, parseISO, setHours, setMinutes } from "date-fns";
import { hr, enUS } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#10b981",
    rejected: "#ef4444",
    cancelled: "#6b7280",
};

const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function AdminCalendar() {
    const { lang } = useLang();
    // State
    const [viewDate, setViewDate] = useState<Date>(startOfDay(new Date()));
    const [statusFilters, setStatusFilters] = useState<string[]>(["pending", "approved"]);
    const [selectedUser, setSelectedUser] = useState<string>("all");
    const [selectedCrane, setSelectedCrane] = useState<string>("all");
    const [isMaintOpen, setIsMaintOpen] = useState(false);

    // Refs
    const draggableRef = useRef<HTMLDivElement>(null);

    // Filters and Data
    const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false });
    const { data: usersList = [] } = trpc.user.list.useQuery();
    const { data: allReservations = [], isLoading: isResLoading } = trpc.reservation.listAll.useQuery({
        status: statusFilters.length > 0 ? statusFilters : undefined,
        userId: selectedUser !== "all" ? selectedUser : undefined,
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

    // Edit Reservation Form State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRes, setEditingRes] = useState<any>(null);
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editStart, setEditStart] = useState("");
    const [editEnd, setEditEnd] = useState("");
    const [editCraneId, setEditCraneId] = useState("");

    // Edit Waiting List Form State
    const [isWaitingEditOpen, setIsWaitingEditOpen] = useState(false);
    const [editingWaiting, setEditingWaiting] = useState<any>(null);
    const [waitEditDate, setWaitEditDate] = useState<string>("");
    const [waitEditCraneId, setWaitEditCraneId] = useState("");
    const [waitEditSlots, setWaitEditSlots] = useState(1);

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

    const updateWaitingMutation = trpc.waitingList.update.useMutation({
        onSuccess: () => {
            toast.success("Zahtjev je ažuriran.");
            utils.waitingList.listAll.invalidate();
            setIsWaitingEditOpen(false);
        },
        onError: (err: any) => toast.error(err.message),
    });

    const toReservationMutation = trpc.waitingList.toReservation.useMutation({
        onSuccess: () => {
            toast.success("Zahtjev je pretvoren u rezervaciju.");
            utils.reservation.listAll.invalidate();
            utils.waitingList.listAll.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate();
        },
    });

    const handleEditWaiting = (w: any) => {
        setEditingWaiting(w);
        setWaitEditDate(w.requestedDate);
        setWaitEditCraneId(String(w.craneId));
        setWaitEditSlots(w.slotCount);
        setIsWaitingEditOpen(true);
    };

    const handleUpdateWaiting = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingWaiting) return;
        updateWaitingMutation.mutate({
            id: editingWaiting.id,
            requestedDate: waitEditDate,
            craneId: waitEditCraneId,
        });
    };

    const handleApproveWaiting = (w: any) => {
        toast.info("Povucite zahtjev na kalendar za brzu rezervaciju.");
    };

    // Initialize Draggable
    useEffect(() => {
        if (!draggableRef.current) return;
        let draggable = new Draggable(draggableRef.current, {
            itemSelector: ".waiting-list-item",
            eventData: function (eventEl) {
                const data = JSON.parse(eventEl.getAttribute("data-event") || "{}");
                return {
                    title: data.title,
                    duration: { hours: data.slotCount },
                    extendedProps: {
                        isFromWaitingList: true,
                        waitingId: data.id,
                    }
                };
            }
        });
        return () => draggable.destroy();
    }, [waitingList]);

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
            craneId: maintCraneId,
            scheduledStart: start,
            scheduledEnd: end,
            description: maintDesc,
        });
    };

    const handleEventClick = (info: any) => {
        const p = info.event.extendedProps;
        if (p.isMaintenance) return;

        const res = allReservations.find((r: any) => r.id === p.reservationId);
        if (res) {
            setEditingRes(res);
            setEditDate(new Date(String(res.scheduledStart)));
            setEditStart(format(new Date(String(res.scheduledStart)), "HH:mm"));
            setEditEnd(format(new Date(String(res.scheduledEnd)), "HH:mm"));
            setEditCraneId(String(res.craneId));
            setIsEditOpen(true);
        }
    };

    const handleUpdateRes = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRes || !editDate) return;

        const [hS, mS] = editStart.split(":").map(Number);
        const [hE, mE] = editEnd.split(":").map(Number);

        const startDate = setMinutes(setHours(startOfDay(editDate), hS), mS);
        const endDate = setMinutes(setHours(startOfDay(editDate), hE), mE);

        rescheduleMutation.mutate({
            id: editingRes.id,
            scheduledStart: startDate,
            scheduledEnd: endDate,
            craneId: editCraneId
        }, {
            onSuccess: () => setIsEditOpen(false)
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
                    originalStart: r.scheduledStart,
                    cancelReason: r.cancelReason,
                },
            };
        }).filter(Boolean);
    }, [allReservations, activeCranes, viewDate, lang]);

    const handleEventDrop = (info: EventDropArg) => {
        const id = String(info.event.extendedProps.reservationId);

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
            scheduledStart: newStart,
            scheduledEnd: newEnd,
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
                    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                        <DialogContent className="max-w-md">
                            <form onSubmit={handleUpdateRes}>
                                <DialogHeader>
                                    <DialogTitle>Uredi rezervaciju</DialogTitle>
                                    <DialogDescription>
                                        ID #{editingRes?.id} - {editingRes?.vesselName} ({editingRes?.user?.name})
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-5 py-6">
                                    <div className="grid gap-2">
                                        <Label>Datum</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal",
                                                        !editDate && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {editDate ? format(editDate, "PPP", { locale: lang === 'hr' ? hr : enUS }) : <span>Odaberi datum</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={editDate}
                                                    onSelect={setEditDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Vrijeme početka</Label>
                                            <Input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} required />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Vrijeme završetka</Label>
                                            <Input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Dizalica</Label>
                                        <Select value={editCraneId} onValueChange={setEditCraneId} required>
                                            <SelectTrigger><SelectValue placeholder="Odaberi dizalicu" /></SelectTrigger>
                                            <SelectContent>
                                                {cranesList.map((c: any) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" type="button" onClick={() => setIsEditOpen(false)}>Odustani</Button>
                                    <Button type="submit" disabled={rescheduleMutation.isPending}>
                                        {rescheduleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Spremi promjene
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isWaitingEditOpen} onOpenChange={setIsWaitingEditOpen}>
                        <DialogContent className="max-w-md">
                            <form onSubmit={handleUpdateWaiting}>
                                <DialogHeader>
                                    <DialogTitle>Uredi listu čekanja</DialogTitle>
                                    <DialogDescription>
                                        ID #{editingWaiting?.id} - {editingWaiting?.user?.name}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-5 py-6">
                                    <div className="grid gap-2">
                                        <Label>Željeni datum</Label>
                                        <Input type="date" value={waitEditDate} onChange={(e) => setWaitEditDate(e.target.value)} required />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Dizalica</Label>
                                        <Select value={waitEditCraneId} onValueChange={setWaitEditCraneId} required>
                                            <SelectTrigger><SelectValue placeholder="Odaberi dizalicu" /></SelectTrigger>
                                            <SelectContent>
                                                {cranesList.map((c: any) => (
                                                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Broj slotova (60 min)</Label>
                                        <Input type="number" min={1} max={8} value={waitEditSlots} onChange={(e) => setWaitEditSlots(Number(e.target.value))} required />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" type="button" onClick={() => setIsWaitingEditOpen(false)}>Odustani</Button>
                                    <Button type="submit" disabled={updateWaitingMutation.isPending}>
                                        {updateWaitingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Spremi promjene
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
                        droppable={true}
                        eventReceive={async (info: any) => {
                            const p = info.event.extendedProps;
                            if (p.isFromWaitingList) {
                                // Calculate crane and time
                                const dropDate = info.event.start!;
                                const diffDays = Math.round((dropDate.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));

                                if (diffDays < 0 || diffDays >= activeCranes.length) {
                                    info.revert();
                                    return;
                                }

                                const targetCrane = activeCranes[diffDays];
                                const startDate = new Date(viewDate);
                                startDate.setHours(dropDate.getHours(), dropDate.getMinutes(), 0);

                                const durationHours = info.event.end ? (info.event.end.getTime() - dropDate.getTime()) / 3600000 : 1;
                                const endDate = new Date(startDate.getTime() + durationHours * 3600000);

                                info.revert(); // Remove the temp event

                                toReservationMutation.mutate({
                                    id: String(p.waitingId),
                                    scheduledStart: startDate,
                                    scheduledEnd: endDate,
                                    craneId: targetCrane.id
                                });
                            }
                        }}
                        eventDrop={handleEventDrop}
                        eventClick={handleEventClick}
                        events={calendarEvents as any}
                        dayHeaderContent={(arg: any) => {
                            const diff = Math.round((arg.date.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
                            const crane = activeCranes[diff];
                            return crane ? (
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold">{crane.name}</span>
                                    <span className="text-[10px] opacity-60 font-normal normal-case">
                                        {format(arg.date, "eee dd.MM.")}
                                    </span>
                                </div>
                            ) : "";
                        }}
                        eventContent={(arg: any) => {
                            const p = arg.event.extendedProps;
                            return (
                                <div className="flex flex-col h-full overflow-hidden p-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-black uppercase opacity-90 truncate">{arg.event.title}</span>
                                        {p.status === 'pending' && <Clock className="h-3 w-3 animate-pulse" />}
                                    </div>
                                    <div className="text-[10px] font-bold opacity-80 leading-tight truncate">{p.user}</div>
                                    {p.status === 'cancelled' && p.cancelReason && (
                                        <div className="text-[9px] italic opacity-90 leading-tight mt-1 border-t border-white/20 pt-1">
                                            Razlog: {p.cancelReason}
                                        </div>
                                    )}
                                    {!p.isMaintenance && p.status === 'pending' && (
                                        <div className="mt-auto flex gap-1 pt-1 border-t border-white/20">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); window.location.href = `/admin/reservations?status=pending`; }}
                                                className="hover:bg-white/20 rounded p-0.5"
                                                title="Odobri u Rezervacijama"
                                            >
                                                <CheckCircle2 className="h-3 w-3 text-green-300" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); rejectMutation.mutate({ id: p.reservationId, adminNote: "Preko kalendara" }); }}
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
                                <div className="p-4 space-y-3" ref={draggableRef}>
                                    {waitingList.length === 0 ? (
                                        <div className="text-center py-8 text-sm text-muted-foreground italic">
                                            Nema aktivnih zahtjeva u listi čekanja.
                                        </div>
                                    ) : (
                                        waitingList.map((w: any) => (
                                            <div
                                                key={w.id}
                                                className="waiting-list-item p-3 border rounded-lg bg-background hover:border-primary/50 transition-colors shadow-sm group cursor-grab active:cursor-grabbing"
                                                data-event={JSON.stringify({
                                                    id: w.id,
                                                    title: `${w.user?.name || "Korisnik"} (${w.crane?.name})`,
                                                    slotCount: w.slotCount
                                                })}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{w.crane?.name}</span>
                                                    <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{format(parseISO(w.requestedDate), "dd.MM.")}</span>
                                                </div>
                                                <div className="font-semibold text-sm mb-1">{w.user?.name || "Korisnik"}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                                                    <Clock className="h-3 w-3" />
                                                    {w.slotCount}x 60 min slots
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleEditWaiting(w); }}
                                                    >
                                                        Uredi zahtjev
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
