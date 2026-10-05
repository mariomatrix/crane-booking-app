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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SlotRecommendation, UnassignedRequestItem } from "../../../../server/landDispatch/types";

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
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [teamOverride, setTeamOverride] = useState<boolean>(false);
  const [teamOverrideReason, setTeamOverrideReason] = useState<string>("Preraspodjela osoblja na terenu");

  const utils = trpc.useUtils();

  // Reset state when request changes
  React.useEffect(() => {
    if (request) {
      setSelectedZoneId(request.requestedZoneId || zones[0]?.zoneId || "");
      setSelectedSlotIndex(0);
      setTeamOverride(false);
    }
  }, [request, zones]);

  const { data: recommendations = [], isLoading } = trpc.landDispatch.getSlotRecommendations.useQuery(
    {
      reservationId: request?.id || "",
      dateStr,
      preferredZoneId: selectedZoneId || undefined,
    },
    {
      enabled: open && !!request?.id,
    }
  );

  const assignMutation = trpc.landDispatch.assignReservation.useMutation({
    onSuccess: () => {
      toast.success("Zahtjev je uspješno raspoređen i potvrđen!");
      utils.landDispatch.getDailyOverview.invalidate();
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
      toast.error("Kapacitet timova je popunjen. Potrebno je označiti dispečerski override posade.");
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
                  Automatizirana preporuka prema nosivosti, afinitetu zona i raspoloživosti 2 tima.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Vessel & Request Summary Card */}
        <div className="p-3 rounded-xl bg-muted/40 border text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <div>
            <span className="text-muted-foreground block">Plovilo:</span>
            <span className="font-semibold text-foreground">{request.vesselName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Gabariti:</span>
            <span className="font-semibold text-foreground">
              {request.vesselLengthM ? `${request.vesselLengthM} m` : "—"} /{" "}
              {request.vesselWeightTons ? `${request.vesselWeightTons} t` : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Korisnik:</span>
            <span className="font-semibold text-foreground">{request.userName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Operacija:</span>
            <Badge
              variant={request.operationCategory === "lift_from_sea" ? "default" : "secondary"}
              className="text-[10px] h-5 font-medium"
            >
              {request.operationCategory === "lift_from_sea" ? "↑ Podizanje" : "↓ Spuštanje"}
            </Badge>
          </div>
        </div>

        {/* Filter Zone */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Label className="text-xs font-semibold whitespace-nowrap">Odredišna zona:</Label>
          <Select value={selectedZoneId} onValueChange={setSelectedZoneId}>
            <SelectTrigger className="h-8 text-xs max-w-[260px]">
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
                              2/2 tima zauzeto
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
                          {currentOption.startTime} – {currentOption.endTime}
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
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 text-xs space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                          <Users className="w-4 h-4 shrink-0" />
                          <span>Kapacitet posade je popunjen (2/2)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Dvije dizalice već istovremeno rade u ovom terminu. Kao dispečer imate pravo ručno odobriti operaciju ako je osigurana ispomoć na terenu.
                        </p>
                        <div className="pt-1 space-y-1.5 border-t border-amber-500/20">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="dialogTeamOverride"
                              checked={teamOverride}
                              onChange={(e) => setTeamOverride(e.target.checked)}
                              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                            />
                            <label htmlFor="dialogTeamOverride" className="text-xs font-semibold cursor-pointer">
                              Aktiviraj dispečerski override posade
                            </label>
                          </div>
                          {teamOverride && (
                            <Input
                              value={teamOverrideReason}
                              onChange={(e) => setTeamOverrideReason(e.target.value)}
                              placeholder="Kratki razlog (npr. preraspodjela posade)..."
                              className="h-7 text-xs bg-background"
                            />
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
                    {assignMutation.isPending ? "Spremanje..." : "Dodijeli i potvrdi termin"}
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
