import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Anchor,
  Clock,
  Link as LinkIcon,
  AlertTriangle,
  AlertOctagon,
  Wind,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toZagreb } from "@shared/timezone";
import {
  DispatchReservationItem,
  ActiveWorkStoppage,
} from "../../../../server/landDispatch/types";

interface CraneItem {
  id: string;
  name: string;
  type: string;
  maxCapacityKN: number;
  maxPoolWidth: number | null;
  status: string;
}

interface DispatchGanttTimelineProps {
  selectedDate: string;
  timeSlots: string[];
  cranes: CraneItem[];
  scheduledOps: DispatchReservationItem[];
  activeStoppages?: ActiveWorkStoppage[];
  maxTeams?: number;
  zoneFilterId: string | null;
  onClearZoneFilter: () => void;
  zoneFilterCode?: string | null;
  onSelectOperation: (op: DispatchReservationItem) => void;
}

function parseSlotMinutes(slotStr: string): number {
  if (!slotStr) return 0;
  const [h, m] = slotStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getOpMinutes(iso: string): number {
  try {
    const z = toZagreb(new Date(iso));
    return z.hours * 60 + z.minutes;
  } catch {
    return 0;
  }
}

export function DispatchGanttTimeline({
  selectedDate,
  timeSlots = [],
  cranes = [],
  scheduledOps = [],
  activeStoppages = [],
  maxTeams = 2,
  zoneFilterId,
  onClearZoneFilter,
  zoneFilterCode,
  onSelectOperation,
}: DispatchGanttTimelineProps) {
  // Fallback to standard 07:00–15:00 if timeSlots is empty
  const slots = useMemo(() => {
    if (timeSlots.length > 0) return timeSlots;
    const res: string[] = [];
    for (let h = 7; h < 15; h++) {
      res.push(`${String(h).padStart(2, "0")}:00`);
      res.push(`${String(h).padStart(2, "0")}:30`);
    }
    return res;
  }, [timeSlots]);

  const baseMinutes = useMemo(() => parseSlotMinutes(slots[0] || "07:00"), [slots]);
  const endMinutes = useMemo(() => {
    const last = parseSlotMinutes(slots[slots.length - 1] || "14:30");
    return last + 30;
  }, [slots]);
  const totalMinutes = Math.max(30, endMinutes - baseMinutes);

  // Check if today is selected and determine "Now" indicator line
  const nowIndicator = useMemo(() => {
    try {
      const todayZ = toZagreb(new Date());
      if (todayZ.dateStr !== selectedDate) return null;
      const nowMins = todayZ.hours * 60 + todayZ.minutes;
      if (nowMins < baseMinutes || nowMins > endMinutes) return null;
      const pct = ((nowMins - baseMinutes) / totalMinutes) * 100;
      return {
        pct: Math.min(100, Math.max(0, pct)),
        timeStr: todayZ.timeStr,
      };
    } catch {
      return null;
    }
  }, [selectedDate, baseMinutes, endMinutes, totalMinutes]);

  // Calculate teams usage per slot across all cranes
  const teamUsageBySlot = useMemo(() => {
    return slots.map((slot) => {
      const slotStart = parseSlotMinutes(slot);
      const slotEnd = slotStart + 30;

      const opsInSlot = scheduledOps.filter((op) => {
        if (op.status === "cancelled" || op.status === "not_performed") return false;
        const opStart = getOpMinutes(op.scheduledStart);
        const opEnd = getOpMinutes(op.scheduledEnd);
        return slotStart < opEnd && slotEnd > opStart;
      });

      const count = opsInSlot.length;
      return {
        slot,
        count,
        isOver: count > maxTeams,
        isPeak: count === maxTeams,
      };
    });
  }, [slots, scheduledOps, maxTeams]);

  // Check if stoppage covers crane
  const getStoppageCoverage = (craneId: string) => {
    return activeStoppages.find((st) => {
      if (st.scope === "all_cranes") return true;
      if (st.craneId === craneId) return true;
      return false;
    });
  };

  return (
    <div className="rounded-2xl border bg-card flex flex-col overflow-hidden shadow-xs h-full">
      {/* Header bar of Timeline */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight text-foreground uppercase">
            Raspored dizalica
          </span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            ({slots.length} slotova po 30 min · 07:00–15:00)
          </span>
        </div>

        {zoneFilterId && (
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg">
            <span className="text-[11px] font-semibold text-primary">
              Filter zone: {zoneFilterCode || "Odabrano"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 text-primary hover:bg-primary/20 rounded"
              onClick={onClearZoneFilter}
              title="Ukloni filter zone"
            >
              ✕
            </Button>
          </div>
        )}
      </div>

      {/* Horizontally scrollable Gantt Area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto relative min-h-[320px]">
        <div
          className="min-w-[820px] select-none text-xs relative"
          style={{ width: "100%" }}
        >
          {/* ─── TIME SLOTS HEADER ROW ────────────────────────────────────── */}
          <div className="grid grid-cols-[130px_1fr] border-b bg-muted/30 sticky top-0 z-20">
            <div className="p-2 font-bold text-muted-foreground text-center border-r bg-muted/40 flex items-center justify-center sticky left-0 z-30">
              Dizalica
            </div>
            <div
              className="grid divide-x border-r"
              style={{
                gridTemplateColumns: `repeat(${slots.length}, minmax(46px, 1fr))`,
              }}
            >
              {slots.map((slot) => {
                const isHour = slot.endsWith(":00");
                return (
                  <div
                    key={slot}
                    className={`py-1.5 px-0.5 text-center text-[10px] font-mono ${
                      isHour
                        ? "font-bold text-foreground bg-muted/20"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isHour ? slot.substring(0, 2) : slot.substring(3)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── ROW: TIMOVI (CAPACITY INDICATOR PER SLOT) ──────────────── */}
          <div className="grid grid-cols-[130px_1fr] border-b bg-muted/15 items-stretch">
            <div className="p-2 border-r bg-muted/30 flex items-center justify-between text-[11px] font-bold text-muted-foreground sticky left-0 z-10">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span>Timovi</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-normal">
                (max {maxTeams})
              </span>
            </div>

            <div
              className="grid divide-x border-r"
              style={{
                gridTemplateColumns: `repeat(${slots.length}, minmax(46px, 1fr))`,
              }}
            >
              {teamUsageBySlot.map((item) => (
                <div
                  key={item.slot}
                  className={`h-7 px-1 flex flex-col justify-end items-center pb-1 gap-0.5 transition-colors ${
                    item.isOver
                      ? "bg-rose-500/15"
                      : item.isPeak
                      ? "bg-amber-500/10"
                      : ""
                  }`}
                  title={`Slot ${item.slot}: ${item.count}/${maxTeams} timova zauzeto`}
                >
                  {/* Two stack blocks for teams */}
                  <div className="w-full max-w-[28px] flex flex-col gap-0.5">
                    <div
                      className={`h-1.5 rounded-xs w-full transition-all ${
                        item.count >= 2
                          ? item.isOver
                            ? "bg-rose-500"
                            : "bg-primary"
                          : "bg-muted/40"
                      }`}
                    />
                    <div
                      className={`h-1.5 rounded-xs w-full transition-all ${
                        item.count >= 1
                          ? item.isOver
                            ? "bg-rose-500"
                            : "bg-primary"
                          : "bg-muted/40"
                      }`}
                    />
                  </div>
                  {item.isOver && (
                    <span className="text-[8px] font-black text-rose-600 dark:text-rose-400 leading-none">
                      !
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─── CRANE TRACK ROWS ────────────────────────────────────────── */}
          <div className="divide-y relative">
            {cranes.map((crane) => {
              const stoppage = getStoppageCoverage(crane.id);
              const craneOps = scheduledOps.filter(
                (op) =>
                  op.craneId === crane.id &&
                  op.status !== "cancelled" &&
                  op.status !== "not_performed"
              );

              return (
                <div
                  key={crane.id}
                  className="grid grid-cols-[130px_1fr] items-stretch min-h-[74px] relative hover:bg-muted/5 transition-colors"
                >
                  {/* Left Sticky Label */}
                  <div className="p-2.5 border-r bg-card/95 backdrop-blur-xs flex flex-col justify-center sticky left-0 z-10 shadow-xs">
                    <span className="font-bold text-xs text-foreground block truncate">
                      {crane.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block truncate">
                      {Math.round(crane.maxCapacityKN / 9.80665)} t nosivost
                    </span>
                  </div>

                  {/* Horizontal Timeline Track */}
                  <div
                    className="grid relative border-r divide-x h-full py-1.5"
                    style={{
                      gridTemplateColumns: `repeat(${slots.length}, minmax(46px, 1fr))`,
                    }}
                  >
                    {/* Background grid vertical lines */}
                    {slots.map((s) => (
                      <div key={s} className="h-full pointer-events-none" />
                    ))}

                    {/* Stoppage shaded overlay if active */}
                    {stoppage && (
                      <div
                        className="absolute inset-y-0 right-0 z-5 flex items-center justify-center pointer-events-none border-l-2 border-rose-500/80 px-2"
                        style={{
                          left: `${Math.max(
                            0,
                            ((parseSlotMinutes(toZagreb(new Date(stoppage.startsAt)).timeStr) -
                              baseMinutes) /
                              totalMinutes) *
                              100
                          )}%`,
                          background:
                            "repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.12) 10px, transparent 10px, transparent 20px)",
                        }}
                      >
                        <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-background/90 px-2 py-0.5 rounded border border-rose-500/40 shadow-xs">
                          ⛔ Obustava ({stoppage.reason})
                        </span>
                      </div>
                    )}

                    {/* Operations Blocks */}
                    {craneOps.map((op) => {
                      const opStart = getOpMinutes(op.scheduledStart);
                      const opEnd = getOpMinutes(op.scheduledEnd);

                      const startIdx = Math.max(
                        0,
                        Math.floor((opStart - baseMinutes) / 30)
                      );
                      const span = Math.max(
                        1,
                        Math.round((opEnd - opStart) / 30)
                      );

                      const isLift = op.operationCategory === "lift_from_sea";
                      const isMaintenance = op.operationCategory === "maintenance";
                      const isConflict = op.isAtRiskOrBroken;
                      const isDimmed =
                        zoneFilterId !== null && op.landZoneId !== zoneFilterId;

                      return (
                        <div
                          key={op.id}
                          onClick={() => onSelectOperation(op)}
                          className={`absolute inset-y-1.5 z-10 mx-0.5 rounded-lg border p-1.5 cursor-pointer flex flex-col justify-between transition-all hover:scale-[1.01] hover:shadow-md ${
                            isDimmed
                              ? "opacity-20 grayscale-[50%]"
                              : isConflict
                              ? "bg-rose-500/20 border-rose-500 ring-2 ring-rose-500/50 text-rose-950 dark:text-rose-100"
                              : isLift
                              ? "bg-blue-500/15 border-blue-500/60 text-blue-950 dark:text-blue-100 hover:bg-blue-500/25"
                              : isMaintenance
                              ? "bg-zinc-500/20 border-zinc-500/60 text-zinc-900 dark:text-zinc-200 border-dashed"
                              : "bg-emerald-500/15 border-emerald-500/60 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/25"
                          }`}
                          style={{
                            left: `${(startIdx / slots.length) * 100}%`,
                            width: `${(span / slots.length) * 100}%`,
                          }}
                        >
                          {/* Top: Direction icon + Vessel name + Zone */}
                          <div className="flex items-center justify-between gap-1 overflow-hidden">
                            <div className="flex items-center gap-1 overflow-hidden">
                              <span
                                className={`text-[11px] font-black ${
                                  isLift ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {isLift ? "↑" : "↓"}
                              </span>
                              <span className="font-bold text-[11px] truncate block leading-tight">
                                {op.vesselName}
                              </span>
                            </div>
                            {op.landZoneCode && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 font-mono font-bold shrink-0 border-current bg-background/50"
                              >
                                {op.landZoneCode}
                              </Badge>
                            )}
                          </div>

                          {/* Bottom: Owner & icons */}
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5 leading-none">
                            <span className="truncate max-w-[85px] block">
                              {op.userName}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {op.teamOverride && (
                                <span
                                  className="text-amber-600 dark:text-amber-400 font-bold"
                                  title="Ručni override posade"
                                >
                                  ★ Ovrd
                                </span>
                              )}
                              {op.dependencies.length > 0 && (
                                <span title="Rotacijska ovisnost (oslobađanje mjesta)">
                                  <LinkIcon className="w-2.5 h-2.5 text-primary" />
                                </span>
                              )}
                              {isConflict && (
                                <span title={op.conflictReason || "Konflikt operacije"}>
                                  <AlertOctagon className="w-2.5 h-2.5 text-rose-600" />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── VERTICAL "NOW" INDICATOR LINE ───────────────────────────── */}
          {nowIndicator && (
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{
                left: `calc(130px + (100% - 130px) * ${nowIndicator.pct / 100})`,
              }}
            >
              <div className="w-0.5 h-full bg-rose-500 shadow-sm relative">
                <div className="absolute -top-1 -left-3 bg-rose-600 text-white text-[8px] font-bold px-1 rounded-xs uppercase leading-tight shadow-xs">
                  ▲ SADA
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
