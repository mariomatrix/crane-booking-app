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
  Ship,
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
            className="grid border-b bg-muted/30 sticky top-0 z-20 shadow-2xs divide-x"
            style={{
              gridTemplateColumns: `95px repeat(${cranes.length || 3}, 1fr)`,
            }}
          >
            {/* Kolona 1: Vrijeme & Timovi */}
            <div className="p-2.5 text-center font-bold text-muted-foreground flex flex-col items-center justify-center bg-muted/40">
              <span className="text-[11px] uppercase tracking-wider block">Vrijeme</span>
              <span className="text-[9px] text-muted-foreground font-normal flex items-center gap-0.5 mt-0.5">
                <Users className="w-2.5 h-2.5" /> Timovi (2 max)
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
          <div className="divide-y relative">
            {slots.map((slot, slotIdx) => {
              const slotMins = parseSlotMinutes(slot);
              const slotEndMins = slotMins + 30;

              // Prebroj operacije koje se odvijaju u ovom slotu preko svih dizalica (kapacitet timova)
              const allActiveInSlot = scheduledOps.filter((op) => {
                if (op.status === "cancelled" || op.status === "not_performed") return false;
                const opStart = getOpMinutes(op.scheduledStart);
                const opEnd = getOpMinutes(op.scheduledEnd);
                return slotMins < opEnd && slotEndMins > opStart;
              });

              const teamsUsed = allActiveInSlot.length;
              const isOverTeams = teamsUsed > maxTeams;
              const isPeakTeams = teamsUsed === maxTeams;
              const isCurrentHour = nowIndicator?.slotIndex === slotIdx;

              return (
                <div
                  key={slot}
                  className={`grid divide-x transition-colors relative min-h-[58px] ${
                    isOverTeams
                      ? "bg-rose-500/5 hover:bg-rose-500/10"
                      : isPeakTeams
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-muted/15"
                  }`}
                  style={{
                    gridTemplateColumns: `95px repeat(${cranes.length || 3}, 1fr)`,
                  }}
                >
                  {/* Kolona 1: Vrijeme & Broj timova */}
                  <div className="p-1.5 flex flex-col items-center justify-center bg-muted/20 text-center select-none">
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
                    const opInSlot = scheduledOps.find((op) => {
                      if (op.craneId !== crane.id) return false;
                      if (op.status === "cancelled" || op.status === "not_performed") return false;
                      const opStart = getOpMinutes(op.scheduledStart);
                      const opEnd = getOpMinutes(op.scheduledEnd);
                      return slotMins >= opStart && slotMins < opEnd;
                    });

                    // Je li ovo početni slot operacije?
                    const isStartSlot =
                      opInSlot &&
                      slotMins === getOpMinutes(opInSlot.scheduledStart);

                    const isDimmed =
                      zoneFilterId !== null &&
                      opInSlot &&
                      opInSlot.landZoneId !== zoneFilterId;

                    return (
                      <div
                        key={crane.id}
                        className="p-1 relative flex items-center justify-center min-h-[58px]"
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
                        ) : opInSlot ? (
                          /* Kartica operacije */
                          <div
                            onClick={() => onSelectOperation(opInSlot)}
                            className={`w-full h-full p-1.5 rounded-lg border text-left cursor-pointer transition-all hover:shadow-md flex flex-col justify-between ${
                              isDimmed
                                ? "opacity-20 grayscale-[50%]"
                                : opInSlot.isAtRiskOrBroken
                                ? "bg-rose-500/20 border-rose-500 text-rose-950 dark:text-rose-100 ring-1 ring-rose-500"
                                : opInSlot.operationCategory === "lift_from_sea"
                                ? "bg-blue-500/15 border-blue-500/50 text-blue-950 dark:text-blue-100 hover:bg-blue-500/25"
                                : opInSlot.operationCategory === "maintenance"
                                ? "bg-zinc-500/20 border-zinc-500/50 text-zinc-900 dark:text-zinc-200 border-dashed"
                                : "bg-emerald-500/15 border-emerald-500/50 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/25"
                            }`}
                          >
                            {/* Gornji red: Smjer + Registracija / Naziv plovila + Zona */}
                            <div className="flex items-center justify-between gap-1 overflow-hidden">
                              <div className="flex items-center gap-1 overflow-hidden">
                                <span
                                  className={`text-xs font-black shrink-0 ${
                                    opInSlot.operationCategory === "lift_from_sea"
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {opInSlot.operationCategory === "lift_from_sea" ? "↑" : "↓"}
                                </span>
                                {opInSlot.vesselRegistration ? (
                                  <span className="font-mono font-bold text-[10px] px-1 py-0 rounded bg-background/80 border border-foreground/15 shrink-0">
                                    {opInSlot.vesselRegistration}
                                  </span>
                                ) : null}
                                <span className="font-bold text-[11px] truncate block leading-tight">
                                  {opInSlot.vesselName && opInSlot.vesselName !== "Plovilo"
                                    ? opInSlot.vesselName
                                    : !opInSlot.vesselRegistration
                                    ? "Plovilo"
                                    : ""}
                                  {!isStartSlot && " (nastavak)"}
                                </span>
                              </div>

                              {opInSlot.landZoneCode && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 h-4 font-mono font-bold shrink-0 border-current bg-background/60"
                                >
                                  {opInSlot.landZoneCode}
                                </Badge>
                              )}
                            </div>

                            {/* Donji red: Vlasnik / dimenzije + Ikone ovisnosti */}
                            <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5 leading-none">
                              <span className="truncate max-w-[120px] block">
                                {opInSlot.userName}
                                {opInSlot.vesselLengthM ? ` (${opInSlot.vesselLengthM}m)` : ""}
                              </span>

                              <div className="flex items-center gap-1 shrink-0">
                                {opInSlot.teamOverride && (
                                  <span
                                    className="text-amber-600 dark:text-amber-400 font-bold"
                                    title="Ručni override posade"
                                  >
                                    ★ Ovrd
                                  </span>
                                )}
                                {opInSlot.dependencies.length > 0 && (
                                  <span title="Rotacijska ovisnost (oslobađanje mjesta)">
                                    <LinkIcon className="w-2.5 h-2.5 text-primary" />
                                  </span>
                                )}
                                {opInSlot.isAtRiskOrBroken && (
                                  <span title={opInSlot.conflictReason || "Konflikt operacije"}>
                                    <AlertOctagon className="w-2.5 h-2.5 text-rose-600" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
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
