import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Clock,
  Link as LinkIcon,
  AlertOctagon,
  CheckCircle2,
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

const SLOT_HEIGHT_PX = 60;

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",     // Amber (Na čekanju)
  approved: "#059669",    // Emerald 600 (Odobreno)
  in_progress: "#8b5cf6", // Violet 500 (U tijeku)
  completed: "#2563eb",   // Blue 600 (Završeno)
  rejected: "#dc2626",    // Red 600 (Odbijeno)
  cancelled: "#64748b",   // Slate 500 (Otkazano)
};

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

function getOpBounds(op: DispatchReservationItem): {
  startMins: number;
  endMins: number;
  durationMins: number;
  startTimeStr: string;
  endTimeStr: string;
} {
  const startDate = new Date(op.scheduledStart);
  const startZ = toZagreb(startDate);
  const startMins = startZ.hours * 60 + startZ.minutes;

  const rawEndMins = op.scheduledEnd ? getOpMinutes(op.scheduledEnd) : 0;
  const explicitDur = op.durationMin && op.durationMin > 0 ? op.durationMin : 0;
  const computedDur = rawEndMins > startMins ? rawEndMins - startMins : 30;
  const durationMins = Math.max(30, explicitDur, computedDur);
  const endMins = startMins + durationMins;

  const endDate = new Date(startDate.getTime() + durationMins * 60000);
  const endZ = toZagreb(endDate);

  return {
    startMins,
    endMins,
    durationMins,
    startTimeStr: startZ.timeStr,
    endTimeStr: endZ.timeStr,
  };
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
  // Standard 30-min slots across working day
  const slots = useMemo(() => {
    if (timeSlots.length > 0) return timeSlots;
    const res: string[] = [];
    for (let h = 7; h < 15; h++) {
      res.push(`${String(h).padStart(2, "0")}:00`);
      res.push(`${String(h).padStart(2, "0")}:30`);
    }
    return res;
  }, [timeSlots]);

  // Check if today is selected and determine "Now" indicator line
  const nowIndicator = useMemo(() => {
    try {
      const todayZ = toZagreb(new Date());
      if (todayZ.dateStr !== selectedDate) return null;
      const nowMins = todayZ.hours * 60 + todayZ.minutes;
      const firstMins = parseSlotMinutes(slots[0] || "07:00");
      const lastMins = parseSlotMinutes(slots[slots.length - 1] || "14:30") + 30;
      if (nowMins < firstMins || nowMins > lastMins) return null;
      return {
        slotIndex: slots.findIndex((s) => {
          const sMins = parseSlotMinutes(s);
          return nowMins >= sMins && nowMins < sMins + 30;
        }),
        timeStr: todayZ.timeStr,
      };
    } catch {
      return null;
    }
  }, [selectedDate, slots]);

  // Check if stoppage covers crane in a given slot
  const isStoppageInSlot = (craneId: string, slotStr: string) => {
    const slotMins = parseSlotMinutes(slotStr);
    return activeStoppages.find((st) => {
      if (st.scope !== "all_cranes" && st.craneId !== craneId) return false;
      const stMins = parseSlotMinutes(toZagreb(new Date(st.startsAt)).timeStr);
      return slotMins >= stMins;
    });
  };

  const activeOps = useMemo(
    () =>
      scheduledOps.filter(
        (op) =>
          op.status !== "cancelled" &&
          op.status !== "not_performed" &&
          op.status !== "rejected"
      ),
    [scheduledOps]
  );

  return (
    <div className="rounded-2xl border bg-card flex flex-col overflow-hidden shadow-xs h-full">
      {/* ─── Header: Naslov + Filter zone ─────────────────────────────── */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight text-foreground uppercase">
            Raspored dizalica
          </span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            ({slots.length} slotova po 30 min · {slots[0] || "07:00"}–{slots[slots.length - 1] || "15:00"})
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

      {/* ─── VODORAVNO FIKSNE KOLONE DIZALICA (BEZ H-SCROLLA), VERTIKALNO VRIJEME ─── */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="w-full text-xs">
          {/* ─── Table Header: Dizalice kao kolone ──────────────────────── */}
          <div
            className="grid border-b bg-muted/30 sticky top-0 z-30 shadow-2xs divide-x"
            style={{
              gridTemplateColumns: `95px repeat(${cranes.length || 3}, 1fr)`,
            }}
          >
            {/* Kolona 1: Vrijeme & Timovi */}
            <div className="p-2.5 text-center font-bold text-muted-foreground flex flex-col items-center justify-center bg-muted/40">
              <span className="text-[11px] uppercase tracking-wider block">Vrijeme</span>
              <span className="text-[9px] text-muted-foreground font-normal flex items-center gap-0.5 mt-0.5">
                <Users className="w-2.5 h-2.5" /> Timovi ({maxTeams} max)
              </span>
            </div>

            {/* Kolone dizalica */}
            {cranes.map((crane) => (
              <div
                key={crane.id}
                className="p-2 text-center bg-muted/30 truncate flex flex-col justify-center"
              >
                <span className="font-bold text-xs text-foreground block truncate">
                  {crane.name}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5 block truncate">
                  {Math.round(crane.maxCapacityKN / 9.80665)} t nosivost
                </span>
              </div>
            ))}

            {/* Fallback ako nema 3 dizalice u bazi */}
            {cranes.length < 3 &&
              Array.from({ length: 3 - cranes.length }).map((_, i) => (
                <div key={i} className="p-2 text-center text-muted-foreground">
                  —
                </div>
              ))}
          </div>

          {/* ─── Table Body: Redovi po vremenskim slotovima (07:00–15:00) ─── */}
          <div className="relative">
            {slots.map((slot, slotIdx) => {
              const slotMins = parseSlotMinutes(slot);
              const slotEndMins = slotMins + 30;

              // Prebroj operacije koje se odvijaju u ovom slotu preko svih dizalica (kapacitet timova)
              const allActiveInSlot = activeOps.filter((op) => {
                const { startMins, endMins } = getOpBounds(op);
                return slotMins < endMins && slotEndMins > startMins;
              });

              const teamsUsed = allActiveInSlot.length;
              const isOverTeams = teamsUsed > maxTeams;
              const isPeakTeams = teamsUsed === maxTeams;
              const isCurrentHour = nowIndicator?.slotIndex === slotIdx;

              return (
                <div
                  key={slot}
                  className={`grid divide-x transition-colors relative ${
                    isOverTeams
                      ? "bg-rose-500/5 hover:bg-rose-500/10"
                      : isPeakTeams
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-muted/15"
                  }`}
                  style={{
                    height: `${SLOT_HEIGHT_PX}px`,
                    gridTemplateColumns: `95px repeat(${cranes.length || 3}, 1fr)`,
                  }}
                >
                  {/* Kolona 1: Vrijeme & Broj timova */}
                  <div
                    className={`p-1.5 flex flex-col items-center justify-center bg-muted/20 text-center select-none border-b ${
                      isCurrentHour ? "ring-1 ring-inset ring-primary/40 bg-primary/5" : ""
                    }`}
                  >
                    <span
                      className={`font-mono text-xs ${
                        slot.endsWith(":00")
                          ? "font-bold text-foreground text-sm"
                          : "text-muted-foreground font-medium"
                      }`}
                    >
                      {slot}
                    </span>

                    {/* Bedž zauzeća tima za ovaj slot */}
                    {teamsUsed > 0 ? (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold mt-0.5 inline-flex items-center gap-0.5 ${
                          isOverTeams
                            ? "bg-rose-500 text-white"
                            : isPeakTeams
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            : "bg-primary/10 text-primary border border-primary/20"
                        }`}
                        title={`Slot ${slot}: Zauzeto ${teamsUsed} od maksimalno ${maxTeams} timova`}
                      >
                        {isOverTeams ? "! " : ""}
                        {teamsUsed}/{maxTeams} tim
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/40 mt-0.5 font-mono">
                        0/{maxTeams}
                      </span>
                    )}
                  </div>

                  {/* Kolone dizalica za ovaj slot */}
                  {cranes.map((crane) => {
                    const stoppage = isStoppageInSlot(crane.id, slot);

                    // Pronađi operaciju koja pokriva ovaj slot na ovoj dizalici
                    const opInSlot = activeOps.find((op) => {
                      if (op.craneId !== crane.id) return false;
                      const { startMins, endMins } = getOpBounds(op);
                      return slotMins < endMins && slotEndMins > startMins;
                    });

                    let isStartSlot = false;
                    let spanSlots = 1;
                    let continuesIntoNextSlot = false;
                    let opBounds: ReturnType<typeof getOpBounds> | null = null;

                    if (opInSlot) {
                      opBounds = getOpBounds(opInSlot);
                      const firstOverlappingSlotIdx = slots.findIndex((s) => {
                        const sMins = parseSlotMinutes(s);
                        return opBounds!.startMins < sMins + 30 && opBounds!.endMins > sMins;
                      });
                      isStartSlot = slotIdx === firstOverlappingSlotIdx;

                      if (isStartSlot) {
                        const coveredCount = slots.filter((s, idx) => {
                          if (idx < firstOverlappingSlotIdx) return false;
                          const sMins = parseSlotMinutes(s);
                          return opBounds!.startMins < sMins + 30 && opBounds!.endMins > sMins;
                        }).length;
                        spanSlots = Math.max(1, coveredCount);
                      }

                      const nextSlotStr = slots[slotIdx + 1];
                      if (nextSlotStr) {
                        const nextSlotMins = parseSlotMinutes(nextSlotStr);
                        continuesIntoNextSlot = opBounds.endMins > nextSlotMins;
                      }
                    }

                    const isDimmed =
                      zoneFilterId !== null &&
                      opInSlot &&
                      opInSlot.landZoneId !== zoneFilterId;

                    const isMaintenance = opInSlot?.operationCategory === "maintenance";
                    const statusColor = opInSlot
                      ? isMaintenance
                        ? "#f97316"
                        : STATUS_COLORS[opInSlot.status] ?? "#059669"
                      : "#059669";

                    // Formatiranje registracije i smjera zone kao u ekranu Kalendar (AdminCalendar.tsx)
                    const reg =
                      opInSlot?.vesselRegistration ||
                      (opInSlot?.vesselName && opInSlot.vesselName !== "Plovilo"
                        ? opInSlot.vesselName
                        : "Plovilo");
                    let zoneDirection = "";
                    if (opInSlot?.landZoneCode) {
                      if (opInSlot.operationCategory === "lift_from_sea") {
                        zoneDirection = `➡️ ${opInSlot.landZoneCode}`;
                      } else if (opInSlot.operationCategory === "lower_to_sea") {
                        zoneDirection = `⬅️ ${opInSlot.landZoneCode}`;
                      } else {
                        zoneDirection = opInSlot.landZoneCode;
                      }
                    }
                    const details = [
                      reg,
                      zoneDirection,
                      opInSlot?.vesselWeightTons ? `${opInSlot.vesselWeightTons} t` : "",
                    ]
                      .filter(Boolean)
                      .join(" • ");

                    return (
                      <div
                        key={crane.id}
                        className={`p-1 relative flex items-center justify-center ${
                          continuesIntoNextSlot ? "" : "border-b"
                        }`}
                        style={{ height: `${SLOT_HEIGHT_PX}px` }}
                      >
                        {/* Ako je obustava rada na ovoj dizalici */}
                        {stoppage ? (
                          <div
                            className="w-full h-full p-1.5 rounded-lg border border-rose-500/40 text-rose-700 dark:text-rose-300 flex items-center justify-center text-[10px] font-bold text-center"
                            style={{
                              background:
                                "repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.12) 8px, transparent 8px, transparent 16px)",
                            }}
                          >
                            <span>⛔ Obustava ({stoppage.reason})</span>
                          </div>
                        ) : opInSlot && isStartSlot && opBounds ? (
                          /* Jedinstvena kartica operacije koja se proteže kroz sve svoje 30-min slotove (kao u ekranu Kalendar) */
                          <div
                            onClick={() => onSelectOperation(opInSlot)}
                            style={{
                              backgroundColor: statusColor,
                              top: "3px",
                              left: "4px",
                              right: "4px",
                              height: `${spanSlots * SLOT_HEIGHT_PX - 6}px`,
                            }}
                            className={`absolute z-10 hover:z-20 py-1 px-2 rounded-md text-white text-left cursor-pointer transition-all shadow-sm hover:shadow-md hover:scale-[1.01] flex flex-col justify-between overflow-hidden leading-tight ${
                              isDimmed ? "opacity-25 grayscale-[50%]" : ""
                            } ${
                              opInSlot.isAtRiskOrBroken
                                ? "ring-2 ring-rose-500 ring-offset-1"
                                : ""
                            }`}
                          >
                            <div className="space-y-0.5 overflow-hidden">
                              {/* 1. Red: Korisnik + Vrijeme/Status (identično AdminCalendar + indikatori) */}
                              <div className="flex items-center justify-between gap-1 font-bold text-[11px] truncate">
                                <span className="truncate">{opInSlot.userName}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[9.5px] font-mono font-semibold bg-black/20 px-1 py-0.2 rounded">
                                    {opBounds.startTimeStr}–{opBounds.endTimeStr}
                                  </span>
                                  {opInSlot.status === "pending" && (
                                    <Clock className="h-3 w-3 animate-pulse shrink-0" />
                                  )}
                                  {opInSlot.status === "completed" && (
                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-white/95" />
                                  )}
                                </div>
                              </div>

                              {/* 2. Red: Vrsta usluge */}
                              {opInSlot.serviceTypeName && (
                                <div className="text-[10px] font-semibold opacity-95 truncate">
                                  {opInSlot.serviceTypeName?.toLowerCase().includes("kamion") ? `🚚 ${opInSlot.serviceTypeName}` : opInSlot.serviceTypeName}
                                </div>
                              )}

                              {/* 3. Red: Registracija • Smjer i zona • Tonaža */}
                              {details && (
                                <div className="text-[10px] font-medium opacity-90 truncate">
                                  {details}
                                </div>
                              )}

                              {/* 4. Red: Napomena (ako postoji i ima prostora) */}
                              {opInSlot.adminNote && (
                                <div className="text-[9.5px] italic opacity-85 truncate">
                                  📝 {opInSlot.adminNote}
                                </div>
                              )}
                            </div>

                            {/* Donji red: Indikatori dispečerskog centra (override, ovisnosti, konflikt) */}
                            {(opInSlot.teamOverride ||
                              opInSlot.dependencies.length > 0 ||
                              opInSlot.isAtRiskOrBroken) && (
                              <div className="flex items-center justify-end gap-1 pt-0.5 border-t border-white/20 text-[9px] shrink-0">
                                {opInSlot.teamOverride && (
                                  <span
                                    className="bg-amber-300 text-amber-950 px-1 rounded font-bold"
                                    title="Ručni override posade"
                                  >
                                    ★ Ovrd
                                  </span>
                                )}
                                {opInSlot.dependencies.length > 0 && (
                                  <span
                                    className="bg-white/20 p-0.5 rounded"
                                    title="Rotacijska ovisnost (oslobađanje mjesta)"
                                  >
                                    <LinkIcon className="w-2.5 h-2.5 text-white" />
                                  </span>
                                )}
                                {opInSlot.isAtRiskOrBroken && (
                                  <span
                                    className="bg-rose-600 p-0.5 rounded"
                                    title={opInSlot.conflictReason || "Konflikt operacije"}
                                  >
                                    <AlertOctagon className="w-2.5 h-2.5 text-white" />
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : opInSlot ? (
                          /* Nastavak višesatne/60-min operacije — pokriveno jedinstvenom karticom iz početnog slota */
                          null
                        ) : (
                          /* Prazan slot */
                          <span className="text-[10px] text-muted-foreground/25 font-mono select-none">
                            —
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
