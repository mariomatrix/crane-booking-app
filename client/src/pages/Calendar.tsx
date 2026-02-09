import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
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

const CRANE_TYPES = [
  { value: "all", label: "All Crane Types" },
  { value: "tower", label: "Tower Crane" },
  { value: "mobile", label: "Mobile Crane" },
  { value: "crawler", label: "Crawler Crane" },
  { value: "overhead", label: "Overhead Crane" },
  { value: "telescopic", label: "Telescopic Crane" },
  { value: "loader", label: "Loader Crane" },
  { value: "other", label: "Other" },
];

const EVENT_COLORS: Record<string, string> = {
  tower: "#3b82f6",
  mobile: "#10b981",
  crawler: "#f59e0b",
  overhead: "#8b5cf6",
  telescopic: "#ec4899",
  loader: "#06b6d4",
  other: "#6b7280",
};

export default function Calendar() {
  const [craneTypeFilter, setCraneTypeFilter] = useState("all");

  const { data: events = [], isLoading } = trpc.calendar.events.useQuery(
    { craneType: craneTypeFilter !== "all" ? craneTypeFilter : undefined },
    { refetchInterval: 30000 }
  );

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: String(event.id),
        title: `${event.craneName}`,
        start: new Date(event.startDate),
        end: new Date(event.endDate),
        backgroundColor: EVENT_COLORS[event.craneType] ?? EVENT_COLORS.other,
        borderColor: "transparent",
        extendedProps: {
          craneType: event.craneType,
          projectLocation: event.projectLocation,
        },
      })),
    [events]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Crane Availability Calendar
                </h1>
                <p className="text-sm text-muted-foreground">
                  View scheduled crane reservations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={craneTypeFilter} onValueChange={setCraneTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {CRANE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="container py-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            {isLoading ? (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-muted-foreground">Loading calendar...</div>
              </div>
            ) : (
              <FullCalendar
                plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,listWeek",
                }}
                events={calendarEvents}
                height="auto"
                eventDisplay="block"
                dayMaxEvents={3}
                eventContent={(arg) => (
                  <div className="px-1.5 py-0.5 text-white text-xs font-medium truncate">
                    {arg.event.title}
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {Object.entries(EVENT_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
