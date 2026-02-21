import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
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
import { Printer, Hammer, Loader2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#10b981",
    rejected: "#ef4444",
    cancelled: "#6b7280",
};

const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function AdminCalendar() {
    const { lang } = useLang();
    const { data: allReservations = [] } = trpc.reservation.listAll.useQuery({});
    const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false });
    const { data: sysSettings } = trpc.settings.get.useQuery();
    const utils = trpc.useUtils();

    const workStart = sysSettings?.workdayStart ?? "08:00";
    const workEnd = sysSettings?.workdayEnd ?? "16:00";

    // Maintenance Form State
    const [isMaintOpen, setIsMaintOpen] = useState(false);
    const [maintCraneId, setMaintCraneId] = useState("");
    const [maintDate, setMaintDate] = useState(new Date().toISOString().split("T")[0]);
    const [maintStart, setMaintStart] = useState("08:00");
    const [maintEnd, setMaintEnd] = useState("09:00");
    const [maintDesc, setMaintDesc] = useState("");

    const craneColorMap = useMemo(() => {
        const map: Record<number, string> = {};
        cranesList.forEach((c: any, i: number) => { map[c.id] = CRANE_COLORS[i % CRANE_COLORS.length]; });
        return map;
    }, [cranesList]);

    const rescheduleMutation = trpc.reservation.reschedule.useMutation({
        onSuccess: () => {
            toast.success("Termin je premješten.");
            utils.reservation.listAll.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate(); // revert
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

    const calendarEvents = useMemo(
        () =>
            allReservations
                .map((r: any) => ({
                    id: String(r.id),
                    title: r.isMaintenance
                        ? (lang === 'hr' ? "ODRŽAVANJE" : "MAINTENANCE")
                        : `${r.crane?.name ?? "?"} — ${r.user?.name ?? ""}`,
                    start: new Date(r.startDate),
                    end: new Date(r.endDate),
                    backgroundColor: r.isMaintenance ? "#f97316" : (STATUS_COLORS[r.status] ?? "#6b7280"),
                    borderColor: craneColorMap[r.craneId] ?? "transparent",
                    borderWidth: 2,
                    editable: r.status === "approved" && !r.isMaintenance,
                    extendedProps: {
                        reservationId: r.id,
                        status: r.status,
                        isMaintenance: r.isMaintenance,
                        vesselWeight: r.vesselWeight,
                        liftPurpose: r.liftPurpose,
                    },
                })),
        [allReservations, craneColorMap]
    );

    const handleEventDrop = (info: EventDropArg) => {
        const id = Number(info.event.extendedProps.reservationId);
        const startDate = info.event.start!;
        const endDate = info.event.end ?? new Date(startDate.getTime() + 60 * 60000);
        rescheduleMutation.mutate({ id, startDate, endDate });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold">Kalendar</h2>
                    <p className="text-sm text-muted-foreground">
                        Drag-and-drop odobrenih rezervacija za preslaganje.
                    </p>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                    <Button variant="outline" onClick={() => window.print()}>
                        <Printer className="h-4 w-4 mr-2" />
                        Dnevni izvještaj
                    </Button>

                    <Dialog open={isMaintOpen} onOpenChange={setIsMaintOpen}>
                        <DialogTrigger asChild>
                            <Button variant="secondary">
                                <Hammer className="h-4 w-4 mr-2" />
                                Zabilježi održavanje
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <form onSubmit={handleCreateMaintenance}>
                                <DialogHeader>
                                    <DialogTitle>Zabilježi održavanje</DialogTitle>
                                    <DialogDescription>
                                        Odredite vrijeme kada dizalica neće biti dostupna korisnicima.
                                    </DialogDescription>
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
                                        <Input type="date" value={maintDate} onChange={(e: any) => setMaintDate(e.target.value)} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Početak</Label>
                                            <Input type="time" step="3600" value={maintStart} onChange={(e: any) => setMaintStart(e.target.value)} required />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Kraj</Label>
                                            <Input type="time" step="3600" value={maintEnd} onChange={(e: any) => setMaintEnd(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Opis (opcionalno)</Label>
                                        <Input value={maintDesc} onChange={(e: any) => setMaintDesc(e.target.value)} placeholder="Zabilješka o radovima..." />
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
                </div>
            </div>
            <FullCalendar
                plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
                initialView="timeGridDay"
                headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "timeGridDay,timeGridWeek,dayGridMonth",
                }}
                locale={lang === "hr" ? "hr" : "en"}
                slotMinTime={workStart + ":00"}
                slotMaxTime={workEnd + ":00"}
                businessHours={{
                    daysOfWeek: [1, 2, 3, 4, 5, 6],
                    startTime: workStart,
                    endTime: workEnd,
                }}
                events={calendarEvents}
                height="auto"
                editable
                eventDrop={handleEventDrop}
                eventContent={(arg: any) => (
                    <div className="px-1.5 py-0.5 text-white text-xs font-medium truncate">
                        {!arg.event.extendedProps.isMaintenance && (
                            <span className={`inline-block h-2 w-2 rounded-full mr-1 ${arg.event.extendedProps.status === "pending" ? "bg-amber-300" : "bg-green-300"}`} />
                        )}
                        {arg.event.title}
                    </div>
                )}
            />
        </div>
    );
}
