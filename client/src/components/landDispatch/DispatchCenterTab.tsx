import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  RefreshCw,
  CheckCheck,
  Check,
  X,
  FileCheck,
  Plus,
  Pencil,
  CalendarClock,
  User,
  AlertOctagon,
  ChevronUp,
  ChevronDown,
  Layers,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { WorkStoppageDialog } from "./WorkStoppageDialog";
import { SlotRecommendationDialog } from "./SlotRecommendationDialog";
import { ConcludeOperationDialog } from "./ConcludeOperationDialog";
import { AdminReservationForm } from "@/components/AdminReservationForm";
import { ReservationScheduleModal } from "@/components/ReservationScheduleModal";
import { DispatchGanttTimeline } from "./DispatchGanttTimeline";
import { ZoneSparkline } from "./ZoneSparkline";
import { toZagreb } from "@shared/timezone";
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

  // New action modal states
  const [createResOpen, setCreateResOpen] = useState<boolean>(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [scheduleModalMode, setScheduleModalMode] = useState<"approve" | "edit" | "create">("approve");
  const [scheduleResData, setScheduleResData] = useState<any | null>(null);
  const [opActionDialogOpen, setOpActionDialogOpen] = useState<boolean>(false);

  // Bottom drawer collapse/expand for conclusion
  const [concludeDrawerOpen, setConcludeDrawerOpen] = useState<boolean>(false);

  const utils = trpc.useUtils();

  const handleOpenScheduleForRequest = (req: UnassignedRequestItem) => {
    setScheduleResData({
      id: req.id,
      reservationNumber: req.reservationNumber,
      userId: req.userId,
      user: { id: req.userId, name: req.userName, phone: req.userPhone, email: req.userEmail },
      vesselId: req.vesselId,
      vessel: {
        id: req.vesselId,
        name: req.vesselName,
        registration: req.vesselRegistration,
        lengthM: req.vesselLengthM,
        beamM: req.vesselBeamM,
        weightTons: req.vesselWeightTons,
        type: req.vesselType,
      },
      craneId: req.craneId,
      landZoneId: req.requestedZoneId,
      scheduledStart: req.scheduledStart ? new Date(req.scheduledStart) : undefined,
      durationMin: req.durationMin || 30,
      adminNote: req.adminNote,
      userNote: req.userNote,
      status: req.status,
    });
    setScheduleModalMode("approve");
    setScheduleModalOpen(true);
  };

  const handleOpenEditOperation = (op: DispatchReservationItem) => {
    setScheduleResData({
      id: op.id,
      reservationNumber: op.reservationNumber,
      userId: op.userId,
      user: { id: op.userId, name: op.userName, phone: op.userPhone },
      vesselId: op.vesselId,
      vessel: {
        id: op.vesselId,
        name: op.vesselName,
        lengthM: op.vesselLengthM,
        beamM: op.vesselBeamM,
        weightTons: op.vesselWeightTons,
        type: op.vesselType,
      },
      craneId: op.craneId,
      landZoneId: op.landZoneId,
      scheduledStart: new Date(op.scheduledStart),
      scheduledEnd: new Date(op.scheduledEnd),
      vesselRegistration: op.vesselRegistration,
      adminNote: op.adminNote,
      serviceType: { id: op.serviceTypeId, name: op.serviceTypeName, operationCategory: op.operationCategory },
      durationMin: Math.max(
        op.durationMin || 30,
        Math.round((new Date(op.scheduledEnd).getTime() - new Date(op.scheduledStart).getTime()) / 60000)
      ),
      status: op.status,
    });
    setScheduleModalMode("edit");
    setScheduleModalOpen(true);
  };

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

  // Cancel work stoppage mutation
  const cancelStoppageMutation = trpc.landDispatch.cancelWorkStoppage.useMutation({
    onSuccess: () => {
      toast.success("Obustava rada je uspješno uklonjena.");
      utils.landDispatch.getDailyOverview.invalidate();
    },
    onError: (err) => {
      toast.error(`Greška pri uklanjanju obustave: ${err.message}`);
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

  // Selected zone code
  const selectedZoneCode = zoneFilterId
    ? zones.find((z) => z.zoneId === zoneFilterId)?.zoneCode || null
    : null;

  // Find operations ready to conclude today
  const pendingConclusionOps = scheduledOps.filter((o) => o.status === "approved");
  const concludedOps = scheduledOps.filter(
    (o) => o.status === "completed" || o.status === "not_performed"
  );

  // Total conflicts count
  const conflictsCount =
    (kpi?.zonesInDeficitCount || 0) +
    scheduledOps.filter((o) => o.isAtRiskOrBroken).length;

  return (
    <div className="flex flex-col space-y-3 pb-8">
      {/* ─── A) ALATNA TRAKA + KPI PLOČICE ──────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 p-3 rounded-2xl bg-card border shadow-xs">
        {/* Date Selector & Radno vrijeme */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={handlePrevDay}
              title="Prethodni dan"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-semibold px-2"
              onClick={handleToday}
            >
              Danas
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={handleNextDay}
              title="Sljedeći dan"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 bg-muted/40 border rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent font-medium border-0 focus:outline-none text-foreground cursor-pointer text-xs"
            />
          </div>

          <Badge
            variant="outline"
            className="h-7 px-2 text-xs gap-1 border-primary/20 bg-primary/5 text-primary"
          >
            <Clock className="w-3 h-3" />
            <span>
              {overview?.workingHours.from || "07:00"}–{overview?.workingHours.to || "15:00"}
            </span>
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => refetch()}
            title="Osvježi podatke"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* KPI Tiles & Primary Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* KPI: Operacije */}
          <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1.5">
            <span className="text-muted-foreground">Operacije:</span>
            <span className="font-bold text-foreground">{kpi?.totalScheduled || 0}</span>
            <span className="text-[10px] text-muted-foreground font-medium">
              ({kpi?.liftsCount || 0} ↑ / {kpi?.lowersCount || 0} ↓)
            </span>
          </div>

          {/* KPI: Timovi */}
          <div
            className={`px-2.5 py-1 rounded-xl border text-xs flex items-center gap-1.5 ${
              (kpi?.peakConcurrentTeams || 0) > (kpi?.maxTeams || 2)
                ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold"
                : (kpi?.peakConcurrentTeams || 0) === (kpi?.maxTeams || 2)
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                : "bg-muted/40 text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="text-muted-foreground">Timovi:</span>
            <span className="font-bold">
              {kpi?.peakConcurrentTeams || 0}/{kpi?.maxTeams || 2}
            </span>
          </div>

          {/* KPI: Slobodno kopno */}
          <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Slobodno:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {kpi?.totalLandFree || 0} mj.
            </span>
          </div>

          {/* KPI: Zahtjevi */}
          <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1.5">
            <span className="text-muted-foreground">Zahtjevi:</span>
            <span className="font-bold text-primary">{unassigned.length}</span>
          </div>

          {/* KPI: Konflikti */}
          {conflictsCount > 0 ? (
            <Badge variant="destructive" className="h-7 text-xs gap-1 font-semibold animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span>{conflictsCount} konflikt{conflictsCount > 1 ? "a" : ""}</span>
            </Badge>
          ) : (
            <div className="px-2.5 py-1 rounded-xl bg-muted/40 border text-xs flex items-center gap-1 text-muted-foreground">
              <span>Konflikti:</span>
              <span className="font-semibold text-foreground">0</span>
            </div>
          )}

          {/* Gumb + Nova rezervacija */}
          <Button
            size="sm"
            onClick={() => setCreateResOpen(true)}
            className="h-7 text-xs font-semibold gap-1 bg-primary text-white shadow-xs hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" />
            <span>Nova rezervacija</span>
          </Button>

          {/* Destruktivni gumb Obustava rada */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStoppageDialogOpen(true)}
            className="h-7 text-xs gap-1 border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 font-semibold"
          >
            <Wind className="w-3 h-3 text-rose-500" />
            <span>Obustava rada</span>
          </Button>
        </div>
      </div>

      {/* ─── B) UVJETNI BANNER OBUSTAVE RADA ────────────────────────────── */}
      {activeStoppages.length > 0 && (
        <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-900 dark:text-rose-100">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">
                ⚠ OBUSTAVA od {toZagreb(new Date(activeStoppages[0].startsAt)).timeStr}
              </span>
              <span className="mx-1.5">·</span>
              <span>Razlog: {activeStoppages[0].reason}</span>
              <span className="mx-1.5">·</span>
              <span>
                Opseg:{" "}
                {activeStoppages[0].scope === "all_cranes"
                  ? "Sve dizalice"
                  : activeStoppages[0].craneName || "Pojedinačno"}
              </span>
              {activeStoppages[0].note && (
                <span className="text-muted-foreground ml-1">({activeStoppages[0].note})</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 border-rose-500/40 hover:bg-rose-500/10"
              onClick={() => {
                toast.success("Vlasnicima pogođenih operacija poslane su automatske SMS i email obavijesti.");
              }}
            >
              Obavijesti vlasnike
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] px-2 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
              onClick={() => {
                cancelStoppageMutation.mutate({ stoppageId: activeStoppages[0].id });
              }}
              disabled={cancelStoppageMutation.isPending}
            >
              Ukloni ✕
            </Button>
          </div>
        </div>
      )}

      {/* ─── C + D + E) 3-STUPČANI DISPEČERSKI GRID ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr_300px] xl:grid-cols-[300px_1fr_320px] gap-3 items-start">
        {/* ─── C) LIJEVI STUPAC: ZAHTJEVI (290-300px) ────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-tight text-foreground uppercase">
                Zahtjevi
              </h2>
              <Badge variant="secondary" className="text-[11px] h-4.5 px-1.5 font-bold">
                {unassigned.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateResOpen(true)}
              className="h-6 text-[11px] gap-1 text-primary hover:bg-primary/10 px-1.5"
            >
              <Plus className="w-3 h-3" />
              <span>Novi zahtjev</span>
            </Button>
          </div>

          <div className="space-y-2 max-h-[660px] overflow-y-auto pr-1">
            {unassigned.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed text-center text-xs text-muted-foreground bg-muted/10 space-y-2">
                <p>Nema neraspoređenih zahtjeva za ovaj datum.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateResOpen(true)}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Kreiraj rezervaciju</span>
                </Button>
              </div>
            ) : (
              unassigned.map((req) => (
                <Card
                  key={req.id}
                  className="rounded-xl border shadow-xs hover:border-primary/40 transition-all bg-card"
                >
                  <CardContent className="p-2.5 space-y-2">
                    {/* 1. Tip i željeni termin */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-foreground block">
                            {req.vesselName}
                          </span>
                          {req.vesselRegistration && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">
                              {req.vesselRegistration}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-muted-foreground/70" />
                          <span>{req.userName}</span>
                          {req.userPhone && (
                            <span className="text-muted-foreground/80">({req.userPhone})</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-0.5">
                        <Badge
                          variant={req.operationCategory === "lift_from_sea" ? "default" : "secondary"}
                          className="text-[9px] h-4 px-1.5 font-bold"
                        >
                          {req.operationCategory === "lift_from_sea" ? "↑ Vađenje" : "↓ Spuštanje"}
                        </Badge>
                        {req.requestedTimeSlot && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {req.requestedTimeSlot}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 2. Dimenzije i željena zona */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                      <span>
                        {req.vesselLengthM ? `${req.vesselLengthM} m` : "—"}{" "}
                        {req.vesselBeamM ? `× ${req.vesselBeamM} m` : ""}{" "}
                        {req.vesselWeightTons ? `(${req.vesselWeightTons} t)` : ""}
                      </span>
                      {req.requestedZoneCode ? (
                        <span className="font-bold text-primary">Zona {req.requestedZoneCode}</span>
                      ) : (
                        <span className="text-muted-foreground/70 italic">Bilo koja zona</span>
                      )}
                    </div>

                    {/* 3. Provjere dizalica (Dizalica · Termin · Kopno) */}
                    <div className="grid grid-cols-3 gap-1 pt-1 border-t text-[10px]">
                      <div
                        className={`flex items-center gap-1 ${
                          req.quickChecks.hasAllowedCrane
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-500 font-semibold"
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
                            : "text-rose-500 font-semibold"
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
                            : "text-amber-600 dark:text-amber-400 font-semibold"
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

                    {/* 4. Blokada poruka ako nema mjesta na kopnu */}
                    {!req.quickChecks.hasZoneCapacity && req.requestedZoneCode && (
                      <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-700 dark:text-rose-300 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Nema mjesta u zoni {req.requestedZoneCode} na odabrani dan.</span>
                      </div>
                    )}

                    {/* 5. Akcije: Potvrdi / Drugi termin / Preporuka */}
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button
                        size="sm"
                        onClick={() => handleOpenScheduleForRequest(req)}
                        className="h-6.5 text-[11px] gap-1 bg-primary hover:bg-primary/90 text-white font-semibold flex-1 shadow-2xs"
                      >
                        <CalendarClock className="w-3 h-3" />
                        <span>Potvrdi termin</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRequest(req);
                          setRecommendationDialogOpen(true);
                        }}
                        className="h-6.5 text-[11px] gap-1 px-2"
                        title="Pronađi preporučenu kombinaciju dizalice i termina"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>Preporuka</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenScheduleForRequest(req)}
                        className="h-6.5 w-6.5 p-0 text-muted-foreground hover:text-foreground"
                        title="Uredi detalje"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* ─── D) SREDNJI STUPAC: RASPORED DIZALICA (1fr) ───────────────── */}
        <div className="h-[680px]">
          <DispatchGanttTimeline
            selectedDate={selectedDate}
            timeSlots={timeSlots}
            cranes={cranes}
            scheduledOps={scheduledOps}
            activeStoppages={activeStoppages}
            maxTeams={kpi?.maxTeams || 2}
            zoneFilterId={zoneFilterId}
            onClearZoneFilter={() => setZoneFilterId(null)}
            zoneFilterCode={selectedZoneCode}
            onSelectOperation={(op) => {
              setSelectedOperation(op);
              setOpActionDialogOpen(true);
            }}
          />
        </div>

        {/* ─── E) DESNI STUPAC: ZONE I ZAUZEĆE (300-320px) ────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-tight text-foreground uppercase">
                Zone i zauzeće
              </h2>
              <span className="text-[11px] text-muted-foreground">(6 zona)</span>
            </div>
            {zoneFilterId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoneFilterId(null)}
                className="h-5 text-[10px] text-muted-foreground hover:text-foreground px-1"
              >
                Poništi filter ✕
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 max-h-[660px] overflow-y-auto pr-1">
            {zones.map((zone) => {
              const isSelected = zoneFilterId === zone.zoneId;
              const fillPercent = Math.min(
                100,
                Math.round(((zone.totalSpots - zone.currentFree) / (zone.totalSpots || 1)) * 100)
              );
              const isFull = zone.currentFree === 0;

              return (
                <Card
                  key={zone.zoneId}
                  onClick={() => setZoneFilterId(isSelected ? null : zone.zoneId)}
                  className={`rounded-xl border shadow-2xs cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40"
                      : "hover:border-border/80 bg-card"
                  } ${zone.hasDeficit ? "border-rose-500/70 bg-rose-500/5" : ""}`}
                >
                  <CardContent className="p-2.5 space-y-1.5">
                    {/* Top Row: Zone name & Status Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-foreground">
                          {zone.zoneCode} · {zone.zoneName}
                        </span>
                      </div>

                      {zone.hasDeficit ? (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-bold animate-pulse">
                          DEFICIT {zone.deficitTime ? `od ${zone.deficitTime}` : ""}
                        </Badge>
                      ) : isFull ? (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold border-amber-500 text-amber-600 bg-amber-500/10">
                          PUNO
                        </Badge>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                          {zone.currentFree}/{zone.totalSpots} sl.
                        </span>
                      )}
                    </div>

                    {/* Progress Bar of Occupancy */}
                    <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all rounded-full ${
                          zone.hasDeficit
                            ? "bg-rose-500"
                            : fillPercent >= 90
                            ? "bg-amber-500"
                            : "bg-primary"
                        }`}
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>

                    {/* Mini Sparkline graph across the day */}
                    <div className="pt-0.5">
                      <ZoneSparkline
                        timeline={zone.hourlyTimeline}
                        totalSpots={zone.totalSpots}
                        hasDeficit={zone.hasDeficit}
                        minFree={zone.minFreeToday}
                      />
                    </div>

                    {/* Promet and Minimum of the Day */}
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground pt-1 border-t">
                      <div>
                        <span className="block text-[9px]">Trenutno:</span>
                        <span className="font-bold text-foreground">{zone.currentFree} sl.</span>
                      </div>
                      <div>
                        <span className="block text-[9px]">Promet:</span>
                        <span className="font-medium text-foreground">
                          +{zone.plannedLiftsToday} ↑ / -{zone.plannedLowersToday} ↓
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px]">Kraj dana:</span>
                        <span className="font-bold text-primary">{zone.endOfDayFree} sl.</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-0.5">
                      <span>Popunjenost: {fillPercent}%</span>
                      <span
                        className={`font-semibold ${
                          zone.hasDeficit ? "text-rose-600 font-bold" : "text-muted-foreground"
                        }`}
                      >
                        Min: {zone.minFreeToday} sl. {zone.deficitTime ? `(u ${zone.deficitTime})` : ""}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── F) DONJA USIDRENA TRAKA: ZAKLJUČIVANJE DANA ──────────────────── */}
      <div className="p-3 rounded-2xl bg-card border shadow-xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
              <CheckCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-tight">
                  Zaključivanje dana
                </span>
                <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-bold">
                  {concludedOps.length}/{scheduledOps.length} potvrđeno
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Potvrdom operacija ažurira se stanje suhog veza i zatvaraju radni nalozi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConcludeDrawerOpen(!concludeDrawerOpen)}
              className="h-7 text-xs gap-1"
            >
              <span>{concludeDrawerOpen ? "Sakrij popis" : "Današnje operacije"}</span>
              {concludeDrawerOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>

            <Button
              size="sm"
              onClick={() => batchConcludeMutation.mutate({ dateStr: selectedDate })}
              disabled={batchConcludeMutation.isPending || pendingConclusionOps.length === 0}
              className="h-7 text-xs gap-1 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>
                {batchConcludeMutation.isPending
                  ? "Zaključivanje..."
                  : `Zaključi preostalo (${pendingConclusionOps.length})`}
              </span>
            </Button>
          </div>
        </div>

        {/* Collapsible drawer with individual operations */}
        {concludeDrawerOpen && (
          <div className="pt-2 border-t overflow-x-auto">
            {scheduledOps.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">
                Nema zakazanih operacija za zaključivanje na današnji datum.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b text-[11px]">
                    <th className="pb-1.5 font-medium">Termin</th>
                    <th className="pb-1.5 font-medium">Operacija</th>
                    <th className="pb-1.5 font-medium">Registracija / Plovilo</th>
                    <th className="pb-1.5 font-medium">Vlasnik</th>
                    <th className="pb-1.5 font-medium">Dizalica</th>
                    <th className="pb-1.5 font-medium">Zona</th>
                    <th className="pb-1.5 font-medium">Status</th>
                    <th className="pb-1.5 font-medium text-right">Akcija</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scheduledOps.map((op) => (
                    <tr key={op.id} className="hover:bg-muted/20">
                      <td className="py-2 font-semibold text-foreground font-mono">
                        {toZagreb(new Date(op.scheduledStart)).timeStr}–{toZagreb(new Date(op.scheduledEnd)).timeStr}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={op.operationCategory === "lift_from_sea" ? "default" : "secondary"}
                          className="text-[9px] px-1 py-0 h-4 font-bold"
                        >
                          {op.operationCategory === "lift_from_sea" ? "↑ Vađenje" : "↓ Spuštanje"}
                        </Badge>
                      </td>
                      <td className="py-2 font-medium text-foreground">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {op.vesselRegistration ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 font-mono font-bold border border-foreground/20 bg-muted/80 text-foreground"
                            >
                              {op.vesselRegistration}
                            </Badge>
                          ) : null}
                          {op.vesselName && op.vesselName !== "Plovilo" && op.vesselName !== op.vesselRegistration ? (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {op.vesselName}
                            </span>
                          ) : !op.vesselRegistration ? (
                            <span>{op.vesselName || "—"}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground">{op.userName}</td>
                      <td className="py-2 text-muted-foreground">{op.craneName}</td>
                      <td className="py-2 font-bold text-primary">Zona {op.landZoneCode || "—"}</td>
                      <td className="py-2">
                        <Badge
                          variant={
                            op.status === "completed"
                              ? "default"
                              : op.status === "not_performed"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-[9px] px-1 py-0 h-4"
                        >
                          {op.status === "completed"
                            ? "Odrađeno"
                            : op.status === "not_performed"
                            ? "Nije izvedeno"
                            : "Zakazano"}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOperation(op);
                            setConcludeDialogOpen(true);
                          }}
                          className="h-5.5 text-[10px] px-2 gap-1"
                        >
                          <FileCheck className="w-3 h-3" />
                          <span>Zaključi</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ─── MODALS ──────────────────────────────────────────────────────── */}
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

      {/* Modal: Nova rezervacija */}
      <Dialog open={createResOpen} onOpenChange={setCreateResOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova rezervacija dizalice</DialogTitle>
            <DialogDescription>
              Kreirajte novu rezervaciju dizalice ili prijavite plovilo na listu čekanja za suhi vez.
            </DialogDescription>
          </DialogHeader>
          <AdminReservationForm
            onSuccess={() => {
              setCreateResOpen(false);
              toast.success("Rezervacija je uspješno kreirana!");
              utils.landDispatch.getDailyOverview.invalidate();
              utils.reservation.listAll.invalidate();
              utils.calendar.events.invalidate();
            }}
            onCancel={() => setCreateResOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal: Raspoređivanje / Uređivanje termina rezervacije */}
      <ReservationScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        mode={scheduleModalMode}
        reservation={scheduleResData}
        onSuccess={() => {
          setScheduleModalOpen(false);
          utils.landDispatch.getDailyOverview.invalidate();
          utils.reservation.listAll.invalidate();
          utils.calendar.events.invalidate();
        }}
      />

      {/* Modal: Akcije za kliknutu operaciju na timelineu */}
      <Dialog open={opActionDialogOpen} onOpenChange={setOpActionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="p-1 rounded bg-primary/10 text-primary">
                {selectedOperation?.operationCategory === "lift_from_sea" ? "↑" : "↓"}
              </span>
              <span>
                {selectedOperation?.operationCategory === "lift_from_sea"
                  ? "Vađenje na kopno"
                  : "Spuštanje u more"}
                : {selectedOperation?.vesselName}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Odaberite željenu operativnu radnju za ovu rezervaciju na dizalici.
            </DialogDescription>
          </DialogHeader>

          {selectedOperation && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vlasnik:</span>
                  <span className="font-semibold text-foreground">
                    {selectedOperation.userName} {selectedOperation.userPhone ? `(${selectedOperation.userPhone})` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plovilo:</span>
                  <span className="font-semibold text-foreground">
                    {selectedOperation.vesselName} ({selectedOperation.vesselLengthM || "—"}m / {selectedOperation.vesselWeightTons || "—"}t)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dizalica:</span>
                  <span className="font-semibold text-foreground">{selectedOperation.craneName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Termin:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {toZagreb(new Date(selectedOperation.scheduledStart)).timeStr} – {toZagreb(new Date(selectedOperation.scheduledEnd)).timeStr}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zona na kopnu:</span>
                  <span className="font-semibold text-primary">
                    {selectedOperation.landZoneCode ? `Zona ${selectedOperation.landZoneCode}` : "Nije dodijeljena"}
                  </span>
                </div>
                {selectedOperation.teamOverride && (
                  <div className="flex justify-between text-amber-600 font-semibold">
                    <span>Posada:</span>
                    <span>Ručni override timova</span>
                  </div>
                )}
                {selectedOperation.isAtRiskOrBroken && (
                  <div className="flex justify-between text-rose-600 font-semibold">
                    <span>Upozorenje:</span>
                    <span>{selectedOperation.conflictReason || "Konflikt operacije"}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              className="gap-1.5 text-xs h-8 flex-1"
              onClick={() => {
                if (selectedOperation) {
                  setOpActionDialogOpen(false);
                  handleOpenEditOperation(selectedOperation);
                }
              }}
            >
              <Pencil className="w-3.5 h-3.5 text-primary" />
              <span>Uredi / Premjesti</span>
            </Button>
            <Button
              className="gap-1.5 text-xs h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setOpActionDialogOpen(false);
                setConcludeDialogOpen(true);
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Zaključi operaciju</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
