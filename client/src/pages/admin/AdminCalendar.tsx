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

    const craneColorMap = useMemo(() => {
        const map: Record<number, string> = {};
        cranesList.forEach((c, i) => { map[c.id] = CRANE_COLORS[i % CRANE_COLORS.length]; });
        return map;
    }, [cranesList]);

    const rescheduleMutation = trpc.reservation.reschedule.useMutation({
        onSuccess: () => {
            toast.success("Termin je premješten.");
            utils.reservation.listAll.invalidate();
        },
        onError: (err) => {
            toast.error(err.message);
            utils.reservation.listAll.invalidate(); // revert
        },
    });

    const calendarEvents = useMemo(
        () =>
            allReservations
                .filter((r) => r.status === "approved" || r.status === "pending")
                .map((r) => ({
                    id: String(r.id),
                    title: `${r.crane?.name ?? "?"} — ${r.user?.name ?? ""}`,
                    start: new Date(r.startDate),
                    end: new Date(r.endDate),
                    backgroundColor: STATUS_COLORS[r.status] ?? "#6b7280",
                    borderColor: craneColorMap[r.craneId] ?? "transparent",
                    borderWidth: 2,
                    editable: r.status === "approved",
                    extendedProps: {
                        reservationId: r.id,
                        status: r.status,
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
            <div>
                <h2 className="text-xl font-semibold">Kalendar</h2>
                <p className="text-sm text-muted-foreground">
                    Drag-and-drop odobrenih rezervacija za preslaganje.
                </p>
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
                eventContent={(arg) => (
                    <div className="px-1.5 py-0.5 text-white text-xs font-medium truncate">
                        <span className={`inline-block h-2 w-2 rounded-full mr-1 ${arg.event.extendedProps.status === "pending" ? "bg-amber-300" : "bg-green-300"}`} />
                        {arg.event.title}
                    </div>
                )}
            />
        </div>
    );
}
