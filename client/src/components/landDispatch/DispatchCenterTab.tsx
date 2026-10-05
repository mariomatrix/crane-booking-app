import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Wind,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Anchor,
  Users,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Link as LinkIcon,
  RefreshCw,
  CheckCheck,
  Check,
  X,
  FileCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { WorkStoppageDialog } from "./WorkStoppageDialog";
import { SlotRecommendationDialog } from "./SlotRecommendationDialog";
import { ConcludeOperationDialog } from "./ConcludeOperationDialog";
import {
  DispatchOverviewResponse,
  DispatchReservationItem,
  UnassignedRequestItem,
  ZoneCapacitySnapshot,
} from "../../../../server/landDispatch/types";

interface DispatchCenterTabProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

export function DispatchCenterTab({ selectedDate, onDateChange }: DispatchCenterTabProps) {
  const [stoppageDialogOpen, setStoppageDialogOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<UnassignedRequestItem | null>(null);
  const [recommendationDialogOpen, setRecommendationDialogOpen] = useState<boolean>(false);
  const [selectedOperation, setSelectedOperation] = useState<DispatchReservationItem | null>(null);
  const [concludeDialogOpen, setConcludeDialogOpen] = useState<boolean>(false);
  const [zoneFilterId, setZoneFilterId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Fetch overview
  const { data: overview, isLoading, refetch } = trpc.landDispatch.getDailyOverview.useQuery(
    { dateStr: selectedDate },
    { refetchInterval: 30000 }
  );

  // Batch conclude mutation
  const batchConcludeMutation = trpc.landDispatch.batchConcludeDay.useMutation({
    onSuccess: (data) => {
      toast.success(`Uspješno zaključeno ${data.concludedCount} operacija!`);
      utils.landDispatch.getDailyOverview.invalidate();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    onDateChange(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    onDateChange(d.toISOString().split("T")[0]);
  };

  const handleToday = () => {
    onDateChange(new Date().toISOString().split("T")[0]);
  };

  const kpi = overview?.kpi;
  const cranes = overview?.cranes || [];
  const zones = overview?.zones || [];
  const timeSlots = overview?.timeSlots || [];
  const scheduledOps = overview?.scheduledOperations || [];
  const unassigned = overview?.unassignedRequests || [];
  const activeStoppages = overview?.activeStoppages || [];

  // Filter scheduled ops if zone filter is active
  const filteredOps = zoneFilterId
    ? scheduledOps.filter((o) => o.landZoneId === zoneFilterId)
    : scheduledOps;

  // Find operations ready to conclude today
  const pendingConclusionOps = scheduledOps.filter((o) => o.status === "approved");

  return (
    <div className="space-y-4">
      {/* ─── Top Control & KPI Header Bar ───────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border shadow-sm">
        {/* Date Selector & Season Working Hours */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border bg-muted/30 p-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handlePrevDay}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold px-2.5" onClick={handleToday}>
              Danas
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleNextDay}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent font-medium border-0 focus:outline-none text-foreground cursor-pointer text-xs"
            />
          </div>

          <Badge variant="outline" className="h-8 px-2.5 text-xs gap-1.5 border-primary/20 bg-primary/5 text-primary">
            <Clock className="w-3.5 h-3.5" />
            <span>Radno vrijeme: {overview?.workingHours.from || "07:00"} – {overview?.workingHours.to || "15:00"}</span>
          </Badge>

          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => refetch()}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* KPI Badges & Emergency Stoppage Action */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Operations KPI */}
          <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1.5">
            <span className="text-muted-foreground">Operacije:</span>
            <span className="font-bold text-foreground">{kpi?.totalScheduled || 0}</span>
            <span className="text-[10px] text-muted-foreground">
              ({kpi?.liftsCount || 0} ↑ / {kpi?.lowersCount || 0} ↓)
            </span>
          </div>

          {/* Teams Concurrency KPI */}
          <div
            className={`px-2.5 py-1 rounded-xl border text-xs flex items-center gap-1.5 ${
              (kpi?.peakConcurrentTeams || 0) >= 2
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                : "bg-muted/40 text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="text-muted-foreground">Vrh posade:</span>
            <span className="font-bold">
              {kpi?.peakConcurrentTeams || 0}/{kpi?.maxTeams || 2} tima
            </span>
          </div>

          {/* Land Free KPI */}
          <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Slobodno kopno:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {kpi?.totalLandFree || 0} mjesta
            </span>
          </div>

          {/* Deficit Alert if any */}
          {(kpi?.zonesInDeficitCount || 0) > 0 && (
            <Badge variant="destructive" className="h-7 text-xs gap-1 font-semibold animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span>{kpi?.zonesInDeficitCount} zona u deficitu</span>
            </Badge>
          )}

          {/* Work Stoppage Trigger Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStoppageDialogOpen(true)}
            className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
          >
            <Wind className="w-3.5 h-3.5 text-amber-500" />
            <span>Obustava rada (Vjetar)</span>
          </Button>
        </div>
      </div>

      {/* Active Stoppage Banner if any */}
      {activeStoppages.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">
              Aktivna izvanredna obustava rada: {activeStoppages[0].reason} ({activeStoppages[0].scope === "all_cranes" ? "Sve dizalice" : activeStoppages[0].craneName || "Pojedinačno"})
            </span>
            {activeStoppages[0].note && <span className="text-muted-foreground">— {activeStoppages[0].note}</span>}
          </div>
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 text-[10px]">
            Rad blokiran
          </Badge>
        </div>
      )}

      {/* ─── 3-COLUMN DISPATCH CENTER ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ─── LEFT COLUMN: Requests & Unassigned (Col 1-3) ──────────────── */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-foreground">Zahtjevi za raspored</h2>
              <Badge variant="secondary" className="text-xs h-5 px-1.5 font-bold">
                {unassigned.length}
              </Badge>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {unassigned.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed text-center text-xs text-muted-foreground bg-muted/10">
                Nema neraspoređenih zahtjeva za ovaj datum.
              </div>
            ) : (
              unassigned.map((req) => (
                <Card
                  key={req.id}
                  className="rounded-xl border shadow-none hover:border-primary/40 transition-all bg-card"
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <span className="font-bold text-xs text-foreground block">
                          {req.vesselName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {req.userName} {req.userPhone ? `• ${req.userPhone}` : ""}
                        </span>
                      </div>
                      <Badge
                        variant={req.operationCategory === "lift_from_sea" ? "default" : "secondary"}
                        className="text-[10px] h-4.5 px-1.5 font-semibold"
                      >
                        {req.operationCategory === "lift_from_sea" ? "↑ Vađenje" : "↓ Spuštanje"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                      <span>
                        {req.vesselLengthM ? `${req.vesselLengthM} m` : "—"} /{" "}
                        {req.vesselWeightTons ? `${req.vesselWeightTons} t` : "—"}
                      </span>
                      {req.requestedZoneCode && (
                        <span className="font-medium text-primary">Zona {req.requestedZoneCode}</span>
                      )}
                    </div>

                    {/* 3 Verification Checks */}
                    <div className="grid grid-cols-3 gap-1 pt-1.5 border-t text-[10px]">
                      <div
                        className={`flex items-center gap-1 ${
                          req.quickChecks.hasAllowedCrane
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-500"
                        }`}
                      >
                        {req.quickChecks.hasAllowedCrane ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        <span>Dizalica</span>
                      </div>

                      <div
                        className={`flex items-center gap-1 ${
                          req.quickChecks.hasFreeSlot
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-500"
                        }`}
                      >
                        {req.quickChecks.hasFreeSlot ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        <span>Termin</span>
                      </div>

                      <div
                        className={`flex items-center gap-1 ${
                          req.quickChecks.hasZoneCapacity
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-500"
                        }`}
                      >
                        {req.quickChecks.hasZoneCapacity ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        <span>Kopno</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(req);
                        setRecommendationDialogOpen(true);
                      }}
                      className="w-full h-7 text-xs gap-1.5 mt-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Pronađi kombinaciju</span>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* ─── CENTER COLUMN: 3 Cranes Timeline (Col 4-9) ────────────────── */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-foreground">Timeline dizalica</h2>
              <span className="text-xs text-muted-foreground">(Slotovi od 30 min)</span>
            </div>
            {zoneFilterId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoneFilterId(null)}
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Ukloni filter zone ({zones.find((z) => z.zoneId === zoneFilterId)?.zoneCode}) ✕
              </Button>
            )}
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            {/* 3 Crane Header Columns */}
            <div className="grid grid-cols-12 bg-muted/40 border-b text-xs font-bold divide-x">
              <div className="col-span-2 p-2.5 text-center text-muted-foreground">Vrijeme</div>
              {cranes.map((crane) => (
                <div key={crane.id} className="col-span-3 p-2.5 text-center truncate">
                  <span className="text-foreground block truncate">{crane.name}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {Math.round(crane.maxCapacityKN / 9.80665)} t
                  </span>
                </div>
              ))}
              {cranes.length < 3 &&
                Array.from({ length: 3 - cranes.length }).map((_, i) => (
                  <div key={i} className="col-span-3 p-2.5 text-center text-muted-foreground">
                    —
                  </div>
                ))}
            </div>

            {/* Time Slot Rows */}
            <div className="max-h-[640px] overflow-y-auto divide-y">
              {timeSlots.map((slot) => {
                const [hStr, mStr] = slot.split(":");
                const slotMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
                const slotEndMins = slotMins + 30;

                // Count active operations across ALL cranes in this slot for team badge
                const allActiveInSlot = scheduledOps.filter((op) => {
                  const start = new Date(op.scheduledStart);
                  const end = new Date(op.scheduledEnd);
                  const opStartMins = start.getHours() * 60 + start.getMinutes();
                  const opEndMins = end.getHours() * 60 + end.getMinutes();
                  return slotMins < opEndMins && slotEndMins > opStartMins;
                });

                const teamsCount = allActiveInSlot.length;
                const isTeamFull = teamsCount >= 2;

                return (
                  <div
                    key={slot}
                    className={`grid grid-cols-12 divide-x hover:bg-muted/15 transition-colors ${
                      isTeamFull ? "bg-amber-500/5" : ""
                    }`}
                  >
                    {/* Time Label & Team Concurrency indicator */}
                    <div className="col-span-2 p-2 flex flex-col items-center justify-center text-xs font-semibold text-muted-foreground bg-muted/20">
                      <span>{slot}</span>
                      {teamsCount > 0 && (
                        <span
                          className={`text-[9px] px-1 rounded font-bold mt-0.5 ${
                            isTeamFull
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          {teamsCount}/2 tim
                        </span>
                      )}
                    </div>

                    {/* Columns for the 3 cranes */}
                    {cranes.map((crane) => {
                      // Find operation for this crane in this slot
                      const opInSlot = filteredOps.find((op) => {
                        if (op.craneId !== crane.id) return false;
                        const start = new Date(op.scheduledStart);
                        const end = new Date(op.scheduledEnd);
                        const opStartMins = start.getHours() * 60 + start.getMinutes();
                        const opEndMins = end.getHours() * 60 + end.getMinutes();
                        return slotMins >= opStartMins && slotMins < opEndMins;
                      });

                      return (
                        <div
                          key={crane.id}
                          className="col-span-3 p-1 min-h-[52px] flex items-center justify-center relative"
                        >
                          {opInSlot ? (
                            <div
                              onClick={() => {
                                setSelectedOperation(opInSlot);
                                setConcludeDialogOpen(true);
                              }}
                              className={`w-full h-full p-1.5 rounded-lg border text-left cursor-pointer transition-all hover:shadow-md ${
                                opInSlot.operationCategory === "lift_from_sea"
                                  ? "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-100"
                                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[11px] truncate block">
                                  {opInSlot.operationCategory === "lift_from_sea" ? "↑" : "↓"}{" "}
                                  {opInSlot.vesselName}
                                </span>
                                {opInSlot.landZoneCode && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1 py-0 h-3.5 font-bold border-foreground/20"
                                  >
                                    {opInSlot.landZoneCode}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                                <span className="truncate">{opInSlot.userName}</span>
                                {opInSlot.teamOverride && (
                                  <span className="text-amber-600 font-bold" title="Override posade">
                                    ★ Ovrd
                                  </span>
                                )}
                                {opInSlot.dependencies.length > 0 && (
                                  <span title="Rotacijska ovisnost">
                                    <LinkIcon className="w-2.5 h-2.5 text-primary" />
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30 font-mono">—</span>
                          )}
                        </div>
                      );
                    })}

                    {cranes.length < 3 &&
                      Array.from({ length: 3 - cranes.length }).map((_, i) => (
                        <div key={i} className="col-span-3 p-1 min-h-[52px]" />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: 6 Zones Capacity Projection (Col 10-12) ──────── */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-foreground">Projekcija zona</h2>
              <span className="text-xs text-muted-foreground">(6 zona)</span>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {zones.map((zone) => {
              const isSelected = zoneFilterId === zone.zoneId;
              const fillPercent = Math.min(
                100,
                Math.round(((zone.totalSpots - zone.currentFree) / (zone.totalSpots || 1)) * 100)
              );

              return (
                <Card
                  key={zone.zoneId}
                  onClick={() => setZoneFilterId(isSelected ? null : zone.zoneId)}
                  className={`rounded-xl border shadow-none cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                      : "hover:border-border/80 bg-card"
                  } ${zone.hasDeficit ? "border-destructive/60 bg-destructive/5" : ""}`}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-foreground">
                          {zone.zoneCode} — {zone.zoneName}
                        </span>
                      </div>
                      <Badge
                        variant={zone.hasDeficit ? "destructive" : "outline"}
                        className="text-[10px] h-4.5 px-1.5"
                      >
                        {zone.totalSpots} mj.
                      </Badge>
                    </div>

                    {/* Capacity numbers */}
                    <div className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground pt-1 border-t">
                      <div>
                        <span className="text-[10px] block">Trenutno:</span>
                        <span className="font-bold text-foreground">{zone.currentFree} sl.</span>
                      </div>
                      <div>
                        <span className="text-[10px] block">Kretanje:</span>
                        <span className="font-medium text-foreground">
                          +{zone.plannedLiftsToday} / -{zone.plannedLowersToday}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] block">Kraj dana:</span>
                        <span className="font-bold text-primary">{zone.endOfDayFree} sl.</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all rounded-full ${
                            zone.hasDeficit
                              ? "bg-rose-500"
                              : fillPercent > 80
                              ? "bg-amber-500"
                              : "bg-primary"
                          }`}
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Zauzetost: {fillPercent}%</span>
                        <span
                          className={`font-semibold ${
                            zone.hasDeficit ? "text-rose-600 font-bold" : "text-muted-foreground"
                          }`}
                        >
                          Min: {zone.minFreeToday} sl. {zone.deficitTime ? `(${zone.deficitTime})` : ""}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── BOTTOM BAR: End-of-day Operations Conclusion ──────────────── */}
      <div className="p-4 rounded-2xl bg-card border shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Zaključivanje operacija na kraju dana
              </h3>
              <p className="text-xs text-muted-foreground">
                Jednim klikom zaključite današnje odrađene termine, ažurirajte suhi vez i zatvorite radne naloge.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => batchConcludeMutation.mutate({ dateStr: selectedDate })}
            disabled={batchConcludeMutation.isPending || pendingConclusionOps.length === 0}
            className="h-8 text-xs gap-1.5"
          >
            <CheckCheck className="w-4 h-4" />
            <span>
              {batchConcludeMutation.isPending
                ? "Zaključivanje..."
                : `Zaključi sve današnje operacije (${pendingConclusionOps.length})`}
            </span>
          </Button>
        </div>

        {/* Quick individual actions table */}
        {scheduledOps.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Nema zakazanih operacija za zaključivanje na današnji datum.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 font-medium">Termin</th>
                  <th className="pb-2 font-medium">Operacija</th>
                  <th className="pb-2 font-medium">Plovilo</th>
                  <th className="pb-2 font-medium">Korisnik</th>
                  <th className="pb-2 font-medium">Dizalica</th>
                  <th className="pb-2 font-medium">Zona</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Akcija</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scheduledOps.map((op) => (
                  <tr key={op.id} className="hover:bg-muted/30">
                    <td className="py-2.5 font-semibold text-foreground">
                      {new Date(op.scheduledStart).toLocaleTimeString("hr-HR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5">
                      <Badge
                        variant={op.operationCategory === "lift_from_sea" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {op.operationCategory === "lift_from_sea" ? "↑ Podizanje" : "↓ Spuštanje"}
                      </Badge>
                    </td>
                    <td className="py-2.5 font-medium text-foreground">{op.vesselName}</td>
                    <td className="py-2.5 text-muted-foreground">{op.userName}</td>
                    <td className="py-2.5 text-muted-foreground">{op.craneName}</td>
                    <td className="py-2.5 font-medium text-primary">Zona {op.landZoneCode || "—"}</td>
                    <td className="py-2.5">
                      <Badge
                        variant={
                          op.status === "completed"
                            ? "default"
                            : op.status === "not_performed"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {op.status === "completed"
                          ? "Odrađeno"
                          : op.status === "not_performed"
                          ? "Nije izvedeno"
                          : "Zakazano"}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedOperation(op);
                          setConcludeDialogOpen(true);
                        }}
                        className="h-6 text-[11px] px-2 gap-1"
                      >
                        <FileCheck className="w-3 h-3" />
                        <span>Zaključi</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modals ──────────────────────────────────────────────────────── */}
      <WorkStoppageDialog
        open={stoppageDialogOpen}
        onOpenChange={setStoppageDialogOpen}
        dateStr={selectedDate}
        cranes={cranes}
        zones={zones}
      />

      <SlotRecommendationDialog
        open={recommendationDialogOpen}
        onOpenChange={setRecommendationDialogOpen}
        request={selectedRequest}
        dateStr={selectedDate}
        zones={zones}
      />

      <ConcludeOperationDialog
        open={concludeDialogOpen}
        onOpenChange={setConcludeDialogOpen}
        operation={selectedOperation}
        zones={zones}
      />
    </div>
  );
}
