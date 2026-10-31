import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Users,
  ShieldAlert,
  ArrowRight,
  Info,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SlotRecommendation, UnassignedRequestItem } from "../../../../server/landDispatch/types";

function formatCroatianDateOnly(dateStr?: string | null): string {
  if (!dateStr) return "Po dogovoru";
  try {
    const raw = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = raw.split("-");
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}.`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatCroatianFullDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const raw = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = raw.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("hr-HR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

interface SlotRecommendationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: UnassignedRequestItem | null;
  dateStr: string;
  zones: Array<{ zoneId: string; zoneCode: string; zoneName: string }>;
  onSuccess?: () => void;
}

export function SlotRecommendationDialog({
  open,
  onOpenChange,
  request,
  dateStr,
  zones,
  onSuccess,
}: SlotRecommendationDialogProps) {
  const [activeDate, setActiveDate] = useState<string>(
    request?.requestedDate || dateStr
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [teamOverride, setTeamOverride] = useState<boolean>(false);
  const [teamOverrideReason, setTeamOverrideReason] = useState<string>("Osigurana dodatna ekipa na terenu");

  const utils = trpc.useUtils();

  // Reset state when request changes
  React.useEffect(() => {
    if (request) {
      setSelectedZoneId(request.requestedZoneId || zones[0]?.zoneId || "");
      setSelectedSlotIndex(0);
      setTeamOverride(false);
      setActiveDate(request.requestedDate || dateStr);
    }
  }, [request, zones, dateStr]);

  const handlePrevDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() - 1);
    setActiveDate(d.toISOString().split("T")[0]);
    setSelectedSlotIndex(0);
  };

  const handleNextDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() + 1);
    setActiveDate(d.toISOString().split("T")[0]);
    setSelectedSlotIndex(0);
  };

  const handleToday = () => {
    setActiveDate(new Date().toISOString().split("T")[0]);
    setSelectedSlotIndex(0);
  };

  const { data: recommendations = [], isLoading } = trpc.landDispatch.getSlotRecommendations.useQuery(
    {
      reservationId: request?.id || "",
      dateStr: activeDate,
      preferredZoneId: selectedZoneId || undefined,
    },
    {
      enabled: open && !!request?.id && !!activeDate,
    }
  );

  const assignMutation = trpc.landDispatch.assignReservation.useMutation({
    onSuccess: () => {
      toast.success("Zahtjev je raspoređen i potvrđen.");
      utils.landDispatch.getDailyOverview.invalidate();
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      utils.calendar.events.invalidate();
      utils.landWaiting.listAll.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  if (!request) return null;

  const currentOption = recommendations[selectedSlotIndex];

  const handleAssign = () => {
    if (!currentOption) return;

    if (currentOption.requiresTeamOverride && !teamOverride) {
      toast.error("Kapacitet ekipa je popunjen. Potrebno je odobriti iznimku uz dodatnu ekipu.");
      return;
    }

    if (teamOverride && teamOverrideReason.trim().length < 3) {
      toast.error("Molimo unesite razlog odobravanja iznimke (najmanje 3 znaka).");
      return;
    }

    assignMutation.mutate({
      reservationId: request.id,
      craneId: currentOption.craneId,
      landZoneId: currentOption.zoneId,
      scheduledStartIso: currentOption.scheduledStartIso,
      scheduledEndIso: currentOption.scheduledEndIso,
      teamOverride: currentOption.requiresTeamOverride || teamOverride,
      teamOverrideReason: teamOverride ? teamOverrideReason : undefined,
      rotationalPredecessorId: currentOption.rotationalCandidateReservationId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Preporuka termina i dizalice
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Automatizirana preporuka prema nosivosti, afinitetu zona i raspoloživosti ekipa.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Vessel & Request Summary Card */}
        <div className="p-3 rounded-xl bg-muted/40 border text-xs grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
          <div>
            <span className="text-muted-foreground block text-[11px]">Plovilo:</span>
            <span className="font-semibold text-foreground truncate block">{request.vesselName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Gabariti:</span>
            <span className="font-semibold text-foreground">
              {request.vesselLengthM ? `${request.vesselLengthM} m` : "—"} /{" "}
              {request.vesselWeightTons ? `${request.vesselWeightTons} t` : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Korisnik:</span>
            <span className="font-semibold text-foreground truncate block">{request.userName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Operacija:</span>
            <Badge
              variant={request.operationCategory === "lift_from_sea" ? "default" : "secondary"}
              className="text-[10px] h-4.5 font-medium"
            >
              {request.operationCategory === "lift_from_sea" ? "↑ Podizanje" : "↓ Spuštanje"}
            </Badge>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Traženi termin:</span>
            <span className="font-semibold text-primary truncate block">
              {formatCroatianDateOnly(request.requestedDate)}
              {request.requestedTimeSlot ? ` (${request.requestedTimeSlot})` : ""}
            </span>
          </div>
        </div>

        {/* Kontrole: Datum preporuke & Odredišna zona */}
        <div className="p-2.5 rounded-xl bg-card border shadow-xs space-y-2 mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Datum preporuke s brzim kontrolama */}
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 text-foreground">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Datum preporuke:</span>
              </Label>

              <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded"
                  onClick={handlePrevDay}
                  title="Dan ranije"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="px-1.5 flex items-center">
                  <input
                    type="date"
                    value={activeDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setActiveDate(e.target.value);
                        setSelectedSlotIndex(0);
                      }
                    }}
                    className="bg-transparent font-medium border-0 focus:outline-none text-foreground cursor-pointer text-xs h-7"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded"
                  onClick={handleNextDay}
                  title="Dan kasnije"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleToday}
                className="h-7 text-xs px-2 font-medium"
              >
                Danas
              </Button>

              {request.requestedDate && request.requestedDate !== activeDate && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveDate(request.requestedDate);
                    setSelectedSlotIndex(0);
                  }}
                  className="h-7 text-xs px-2 font-medium text-primary bg-primary/10 hover:bg-primary/20"
                  title="Vrati na željeni datum korisnika"
                >
                  Vrati na željeni ({formatCroatianDateOnly(request.requestedDate)})
                </Button>
              )}
            </div>

            {/* Zona */}
            <div className="flex items-center gap-2 sm:justify-end">
              <Label className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                Zona:
              </Label>
              <Select
                value={selectedZoneId}
                onValueChange={(val) => {
                  setSelectedZoneId(val);
                  setSelectedSlotIndex(0);
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[180px]">
                  <SelectValue placeholder="Odaberite zonu" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.zoneId} value={z.zoneId}>
                      {z.zoneCode} — {z.zoneName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Informativna traka o trenutnom datumu analize */}
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span>Prikazuju se opcije za:</span>
              <Badge variant="outline" className="text-[11px] font-bold text-primary border-primary/30 bg-primary/5 py-0 h-5">
                {formatCroatianFullDate(activeDate)}
              </Badge>
              {request.requestedDate === activeDate && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  (Željeni datum korisnika)
                </span>
              )}
            </div>
            {request.requestedDate && request.requestedDate !== activeDate && (
              <span className="text-muted-foreground text-[10px]">
                Korisnik je tražio: <strong className="text-foreground">{formatCroatianDateOnly(request.requestedDate)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Candidates List & Details */}
        <div className="flex-1 overflow-y-auto min-h-[280px] space-y-3 pt-2 pr-1">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              Analiziranje raspoloživosti dizalica, zona i timova...
            </div>
          ) : recommendations.length === 0 ? (
            <div className="py-12 text-center text-xs text-destructive">
              Nema raspoloživih kombinacija za odabrani datum i zonu.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left: Recommended Options */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Rangirane opcije ({recommendations.filter((r) => r.isFeasible).length} izvedivo)
                </span>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {recommendations.slice(0, 8).map((opt, idx) => {
                    const isSelected = selectedSlotIndex === idx;
                    const scoreColor =
                      opt.score >= 80
                        ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
                        : opt.score >= 50
                        ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
                        : "text-rose-600 bg-rose-500/10 border-rose-500/20";

                    return (
                      <div
                        key={`${opt.craneId}-${opt.startTime}`}
                        onClick={() => setSelectedSlotIndex(idx)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                            : "hover:border-border/80 bg-card"
                        } ${!opt.isFeasible ? "opacity-60 bg-muted/30" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>
                              {opt.startTime} – {opt.endTime}
                            </span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${scoreColor}`}>
                            {opt.score}/100
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">{opt.craneName}</span>
                          <span className="font-medium text-primary">Zona {opt.zoneCode}</span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {opt.isPrimary && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary">
                              Primarna
                            </Badge>
                          )}
                          {opt.teamCapacityExceeded && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] px-1 py-0 h-4 font-normal"
                            >
                              Zauzete ekipe: {opt.concurrentTeamsInSlot} od {opt.maxConcurrentTeams ?? 2}
                            </Badge>
                          )}
                          {opt.rotationalCandidateReservationId && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                              Rotacija
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Option Details */}
              {currentOption && (
                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="border-b pb-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Odabrana kombinacija
                      </span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm font-bold text-foreground">
                          {formatCroatianFullDate(activeDate)}, {currentOption.startTime} – {currentOption.endTime}
                        </span>
                        <Badge
                          variant={currentOption.isFeasible ? "default" : "destructive"}
                          className="text-[10px]"
                        >
                          {currentOption.isFeasible ? "Tehnički izvedivo" : "Odbijeno"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {currentOption.craneName} • Zona {currentOption.zoneCode}
                      </div>
                    </div>

                    {/* Explanations */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Obrazloženje bodovanja:
                      </span>
                      <ul className="space-y-1 text-[11px] text-muted-foreground">
                        {currentOption.explanations.map((exp, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <Info className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                            <span>{exp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Hard Blocks if any */}
                    {currentOption.hardBlockReasons.length > 0 && (
                      <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] space-y-0.5">
                        <div className="font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Fizička ograničenja:
                        </div>
                        {currentOption.hardBlockReasons.map((r, i) => (
                          <div key={i}>• {r}</div>
                        ))}
                      </div>
                    )}

                    {/* Team Concurrency Override Box */}
                    {currentOption.requiresTeamOverride && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                            <Users className="w-4 h-4 shrink-0" />
                            <span>Zauzete ekipe: {currentOption.concurrentTeamsInSlot} od {currentOption.maxConcurrentTeams ?? 2}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30 font-medium">
                            Potrebno odobrenje iznimke
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Standardni kapacitet raspoloživih operativnih ekipa u ovom terminu je popunjen. Odobravanje ove iznimke omogućuje angažman dodatne ekipe na terenu uz vašu dispečersku potvrdu i obrazloženje.
                        </p>
                        <div className="text-[10px] text-amber-800/80 dark:text-amber-300/80 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                          <strong>Napomena o ograničenjima:</strong> Ova iznimka mijenja isključivo kapacitet osoblja. Fizička i tehnička ograničenja dizalice (maksimalna nosivost, širina bazena i obustave rada) ne mogu se zaobići iznimkom.
                        </div>
                        <div className="pt-2 space-y-2 border-t border-amber-500/20">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="dialogTeamOverride"
                              checked={teamOverride}
                              onChange={(e) => setTeamOverride(e.target.checked)}
                              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                            />
                            <label htmlFor="dialogTeamOverride" className="text-xs font-semibold cursor-pointer">
                              Odobri iznimku uz dodatnu ekipu
                            </label>
                          </div>
                          {teamOverride && (
                            <div className="space-y-1">
                              <label htmlFor="teamOverrideReasonInput" className="text-[11px] font-medium text-muted-foreground">
                                Razlog odobravanja iznimke *
                              </label>
                              <Input
                                id="teamOverrideReasonInput"
                                value={teamOverrideReason}
                                onChange={(e) => setTeamOverrideReason(e.target.value)}
                                placeholder="Npr. osigurana dodatna ekipa na terenu, preraspodjela posade..."
                                className="h-8 text-xs bg-background"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleAssign}
                    size="sm"
                    className="w-full gap-1.5 mt-2"
                    disabled={
                      assignMutation.isPending ||
                      (!currentOption.isFeasible && (!currentOption.requiresTeamOverride || !teamOverride))
                    }
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {assignMutation.isPending
                      ? "Spremanje..."
                      : `Dodijeli i potvrdi termin za ${formatCroatianDateOnly(activeDate)}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Zatvori
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
