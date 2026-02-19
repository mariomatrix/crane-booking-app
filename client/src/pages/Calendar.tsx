import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
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
import { CalendarDays, Filter } from "lucide-react";
import { useLang } from "@/contexts/LangContext";

const CRANE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function Calendar() {
  const { t, lang } = useLang();
  const [craneIdFilter, setCraneIdFilter] = useState("all");

  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const { data: events = [], isLoading } = trpc.calendar.events.useQuery(
    { craneId: craneIdFilter !== "all" ? Number(craneIdFilter) : undefined },
    { refetchInterval: 30000 }
  );
  const { data: sysSettings } = trpc.settings.get.useQuery();
  const workStart = sysSettings?.workdayStart ?? "08:00";
  const workEnd = sysSettings?.workdayEnd ?? "16:00";

  const craneColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    cranesList.forEach((c, i) => { map[c.id] = CRANE_COLORS[i % CRANE_COLORS.length]; });
    return map;
  }, [cranesList]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: String(event.id),
        title: `${event.craneName}${event.vesselType ? ` (${event.vesselType})` : ""}`,
        start: new Date(event.startDate),
        end: new Date(event.endDate),
        backgroundColor: craneColorMap[event.craneId] ?? CRANE_COLORS[0],
        borderColor: "transparent",
        extendedProps: {
          craneId: event.craneId,
          craneName: event.craneName,
          liftPurpose: event.liftPurpose,
        },
      })),
    [events, craneColorMap]
  );

  return (
    <div className="min-h-screen bg-background">
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
                  {cranesList.map((crane) => (
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
                eventContent={(arg) => (
                  <div className="px-1.5 py-0.5 text-white text-xs font-medium truncate">
                    {arg.event.title}
                  </div>
                )}
                eventClick={(info) => {
                  const props = info.event.extendedProps;
                  // Simple tooltip via toast — a future PR could open a popover
                  import("sonner").then(({ toast }) =>
                    toast.info(`${props.craneName}: ${props.liftPurpose || ""}`)
                  );
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {cranesList.map((crane) => (
            <div key={crane.id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: craneColorMap[crane.id] }} />
              <span>{crane.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
