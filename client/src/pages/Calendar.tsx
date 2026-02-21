import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Filter, Info } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import { ReservationForm } from "@/components/ReservationForm";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/_core/hooks/useMediaQuery";
const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

interface CalendarEvent {
  id: number;
  startDate: string | Date;
  endDate: string | Date;
  craneId: number;
  craneName: string;
  liftPurpose?: string;
  vesselType?: string;
  status: string;
}

export default function Calendar() {
  const { t, lang } = useLang();
  const [craneIdFilter, setCraneIdFilter] = useState("all");
  const calendarRef = useRef<FullCalendar>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Modal/Form state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);

  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const { data: events = [], isLoading, refetch } = trpc.calendar.events.useQuery(
    { craneId: craneIdFilter !== "all" ? Number(craneIdFilter) : undefined },
    { refetchInterval: 30000 }
  );
  const { data: sysSettings } = trpc.settings.get.useQuery();
  const workStart = sysSettings?.workdayStart ?? "08:00";
  const workEnd = sysSettings?.workdayEnd ?? "16:00";

  const craneColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    cranesList.forEach((c: { id: number }, i: number) => {
      map[c.id] = CRANE_COLORS[i % CRANE_COLORS.length];
    });
    return map;
  }, [cranesList]);

  const calendarEvents = useMemo(
    () =>
      events.map((event: CalendarEvent) => ({
        id: String(event.id),
        title: `${event.craneName}${event.vesselType ? ` (${event.vesselType})` : ""}${event.status === "pending" ? " (ČEKANJE)" : ""}`,
        start: new Date(event.startDate),
        end: new Date(event.endDate),
        backgroundColor: craneColorMap[event.craneId] ?? CRANE_COLORS[0],
        borderColor: event.status === "pending" ? "#94a3b8" : "transparent",
        className: event.status === "pending" ? "event-pending" : "",
        extendedProps: {
          craneId: event.craneId,
          craneName: event.craneName,
          liftPurpose: event.liftPurpose,
          status: event.status,
        },
      })),
    [events, craneColorMap]
  );

  const handleDateClick = (arg: { view: { type: string }, dateStr: string, date: Date }) => {
    // Bullet-proof: prevent booking in the past
    if (arg.date < new Date()) {
      toast.error(lang === 'hr' ? 'Ne možete rezervirati termin koji je već prošao.' : 'You cannot book a slot in the past.');
      return;
    }

    const view = arg.view.type;
    const dateStr = arg.dateStr.split("T")[0];

    let formData: any = { date: dateStr };

    if (view === "timeGridDay") {
      if (craneIdFilter !== "all") {
        formData.craneId = Number(craneIdFilter);
      }
      formData.startTime = arg.date.toISOString();
    }

    setInitialFormData(formData);
    setBookingOpen(true);
  };

  const handleEventClick = (info: any) => {
    info.jsEvent.stopPropagation();
    const props = info.event.extendedProps;

    // Open booking modal for waiting list
    setInitialFormData({
      date: info.event.start?.toISOString().split("T")[0],
      craneId: props.craneId,
      startTime: info.event.start?.toISOString(),
    });
    setBookingOpen(true);
  };

  const closeBooking = () => {
    setBookingOpen(false);
    setInitialFormData(null);
    refetch();
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <style>
        {`
          .fc-timegrid-slot:hover {
            background-color: rgba(59, 130, 246, 0.05) !important;
            cursor: pointer;
          }
          .fc-daygrid-day:hover {
            background-color: rgba(59, 130, 246, 0.05) !important;
            cursor: pointer;
          }
          .fc-event {
            cursor: help !important;
          }
          .event-pending {
            background-image: repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(255, 255, 255, 0.15) 10px,
              rgba(255, 255, 255, 0.15) 20px
            ) !important;
            opacity: 0.85;
          }
        `}
      </style>

      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">{t.calendar.title}</h1>
                <p className="text-sm text-muted-foreground">{t.calendar.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={craneIdFilter} onValueChange={setCraneIdFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.calendar.allCranes}</SelectItem>
                  {cranesList.map((crane: { id: number, name: string }) => (
                    <SelectItem key={crane.id} value={String(crane.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: craneColorMap[crane.id] }}
                        />
                        {crane.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 bg-blue-50 border border-blue-100 p-2.5 rounded-md text-blue-800 text-sm">
            <Info className="h-4 w-4 shrink-0" />
            <span>{lang === 'hr' ? 'Kliknite na slobodan termin ili zauzeti termin za upis na listu čekanja.' : 'Click on a free slot or an occupied one to join the waiting list.'}</span>
          </div>
        </div>
      </div>

      <div className="container py-6">
        <Card>
          <CardContent className="p-2 sm:p-4">
            {isLoading ? (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-muted-foreground">{t.calendar.loading}</div>
              </div>
            ) : (
              <FullCalendar
                ref={calendarRef}
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
                slotDuration="00:30:00"
                selectAllow={(selectInfo: { start: Date }) => {
                  return selectInfo.start >= new Date();
                }}
                dateClick={handleDateClick}
                eventContent={(arg: { event: { title: string } }) => (
                  <div className="px-1.5 py-0.5 text-white text-xs font-medium truncate">
                    {arg.event.title}
                  </div>
                )}
                eventClick={handleEventClick}
              />
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {cranesList.map((crane: { id: number, name: string }) => (
            <div key={crane.id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: craneColorMap[crane.id] }} />
              <span>{crane.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-2 px-2 border-l">
            <div className="h-3 w-3 rounded-sm bg-gray-400 event-pending border border-gray-500" />
            <span>{lang === 'hr' ? 'Zahtjev na čekanju (termin zauzet)' : 'Pending request (slot occupied)'}</span>
          </div>
        </div>
      </div>

      {isDesktop ? (
        <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t.form.title}</DialogTitle>
            </DialogHeader>
            <div className="p-1 sm:p-0">
              <ReservationForm
                initialData={initialFormData}
                onSuccess={closeBooking}
                onCancel={() => setBookingOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={bookingOpen} onOpenChange={setBookingOpen}>
          <DrawerContent className="max-h-[95vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>{t.form.title}</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-8 overflow-y-auto">
              <ReservationForm
                initialData={initialFormData}
                onSuccess={closeBooking}
                onCancel={() => setBookingOpen(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
