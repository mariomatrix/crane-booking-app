import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Truck,
  Ship,
  MapPin,
  Calendar,
  Loader2,
  Info,
  Anchor,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface TruckDispatchFromLandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spot: any;
  onSuccess?: () => void;
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TruckDispatchFromLandDialog({
  open,
  onOpenChange,
  spot,
  onSuccess,
}: TruckDispatchFromLandDialogProps) {
  const utils = trpc.useUtils();

  // Crane usage mode: kamion ima vlastitu dizalicu vs angažman klupske dizalice
  const [craneUsageMode, setCraneUsageMode] = useState<"truck_crane" | "club_crane">("truck_crane");
  const [selectedCraneId, setSelectedCraneId] = useState<string>("");
  const [dispatchedAtStr, setDispatchedAtStr] = useState<string>(() =>
    toLocalDatetimeInputValue(new Date())
  );
  const [note, setNote] = useState<string>(
    "Otprema plovila kamionom iz lučice na servis"
  );

  const { data: cranes = [], isLoading: cranesLoading } =
    trpc.crane.list.useQuery(undefined, { enabled: open });

  const activeCranes = useMemo(
    () => (cranes as any[]).filter((c: any) => c.craneStatus === "active"),
    [cranes]
  );

  // Auto-select crane when switching to club_crane
  useEffect(() => {
    if (craneUsageMode === "club_crane" && !selectedCraneId && activeCranes.length > 0) {
      setSelectedCraneId(activeCranes[0].id);
    }
  }, [craneUsageMode, selectedCraneId, activeCranes]);

  useEffect(() => {
    if (open) {
      setDispatchedAtStr(toLocalDatetimeInputValue(new Date()));
      setCraneUsageMode("truck_crane");
      setNote("Otprema plovila kamionom iz lučice na servis");
    }
  }, [open]);

  const dispatchMutation = trpc.landOccupancy.dispatchByTruck.useMutation({
    onSuccess: (data) => {
      toast.success(
        craneUsageMode === "club_crane"
          ? `Plovilo je uspješno ukrcano na kamion klupskom dizalicom. Mjesto je oslobođeno (boravak: ${data.totalDays} dana).`
          : `Plovilo je uspješno otpremljeno kamionom (vlastita dizalica). Mjesto je oslobođeno (boravak: ${data.totalDays} dana).`
      );
      utils.landOccupancy.listActive.invalidate();
      utils.landOccupancy.history.invalidate();
      utils.landZone.list.invalidate();
      utils.landFlow.getSpotsByZone.invalidate();
      utils.landFlow.getDailyBalance.invalidate();
      utils.reservation.listAll.invalidate();
      utils.workOrders.list.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message || "Greška pri otpremi kamionom.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!spot?.occupancyId) {
      toast.error("Nema aktivnog boravka na kopnu za ovo mjesto.");
      return;
    }

    if (craneUsageMode === "club_crane" && !selectedCraneId) {
      toast.error("Odaberite klupsku dizalicu za ukrcaj.");
      return;
    }

    const parsedDispatchedAt = dispatchedAtStr ? new Date(dispatchedAtStr) : new Date();

    dispatchMutation.mutate({
      occupancyId: spot.occupancyId,
      craneUsageMode,
      craneId: craneUsageMode === "club_crane" ? selectedCraneId : undefined,
      dispatchedAt: !isNaN(parsedDispatchedAt.getTime()) ? parsedDispatchedAt : new Date(),
      note: note.trim() || undefined,
    });
  };

  if (!spot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Truck className="w-5 h-5 text-amber-600" />
              Otprema plovila kamionom sa suhog veza
            </DialogTitle>
            <Badge
              variant="outline"
              className={
                craneUsageMode === "truck_crane"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px]"
                  : "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 text-[11px]"
              }
            >
              {craneUsageMode === "truck_crane"
                ? "🚚 Vlastita dizalica kamiona (0,00 € dizalica)"
                : "🏗️ Angažman klupske dizalice (manipulacija)"}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Evidentirajte odlazak plovila sa suhog veza kamionom (npr. odvoz na servis). Završava se boravak na kopnu i mjesto se odmah oslobađa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Info o trenutnom plovilu i mjestu */}
          <div className="p-3 rounded-xl border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                <Ship className="w-3.5 h-3.5" />
                Podaci o plovilu na suhom vezu
              </span>
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                Mjesto #{spot.spotNumber} ({spot.code})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
              <div>
                <span className="text-muted-foreground block text-[11px]">Naziv plovila:</span>
                <span className="font-semibold text-foreground">{spot.currentVesselName || "Nepoznato"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Registracija:</span>
                <span className="font-semibold text-foreground">{spot.currentVesselReg || "Bez registracije"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Provedeno na kopnu:</span>
                <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {spot.daysOnLand ?? 1} {spot.daysOnLand === 1 ? "dan" : "dana"}
                </span>
              </div>
            </div>
          </div>

          {/* Info Banner ovisno o odabranom načinu */}
          <div
            className={`p-2.5 rounded-lg border flex items-start gap-2.5 text-xs transition-colors ${
              craneUsageMode === "truck_crane"
                ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                : "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200"
            }`}
          >
            <Info
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                craneUsageMode === "truck_crane" ? "text-emerald-600" : "text-blue-600"
              }`}
            />
            <div className="space-y-0.5">
              <strong>
                {craneUsageMode === "truck_crane"
                  ? "Kamion s vlastitom dizalicom (bez klupske dizalice):"
                  : "Ukrcaj klupskom dizalicom (manipulacija):"}
              </strong>{" "}
              {craneUsageMode === "truck_crane" ? (
                <span>
                  Kamion samostalno diže plovilo s mjesta na kamion. Klupska dizalica <strong>nije angažirana</strong> te se{" "}
                  <strong>usluga dizalice ne zaračunava (0,00 €)</strong>. Ne troši se statutarna kvota. Obračunava se isključivo ležarina za protekle dane.
                </span>
              ) : (
                <span>
                  Klupska dizalica <strong>obavlja ukrcaj na kamion</strong>. Ova operacija <strong>ne troši statutarno pravo na vađenje ni spuštanje</strong>. Obračunava se zasebna usluga manipulacije/ukrcaja prema cjeniku te ležarina za dane na kopnu.
                </span>
              )}
            </div>
          </div>

          {/* Način ukrcaja na kamion */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-primary" />
              Način ukrcaja na kamion i angažman dizalice *
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Opcija 1: Kamion ima vlastitu dizalicu */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setCraneUsageMode("truck_crane")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setCraneUsageMode("truck_crane");
                  }
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between text-left ${
                  craneUsageMode === "truck_crane"
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500 shadow-2xs"
                    : "border-border hover:border-muted-foreground/40 bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    Kamion ima svoju dizalicu
                  </div>
                  {craneUsageMode === "truck_crane" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Kamion samostalno ukrcava brod. Klupska dizalica <strong>nije potrebna</strong>.
                </p>
                <Badge
                  variant="outline"
                  className="w-fit text-[10px] font-semibold bg-emerald-100/70 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  Dizalica: 0,00 € • Ne troši kvotu
                </Badge>
              </div>

              {/* Opcija 2: Angažira se klupska dizalica */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setCraneUsageMode("club_crane")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setCraneUsageMode("club_crane");
                  }
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between text-left ${
                  craneUsageMode === "club_crane"
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500 shadow-2xs"
                    : "border-border hover:border-muted-foreground/40 bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Anchor className="w-4 h-4 text-blue-600" />
                    Klupska dizalica (manipulacija)
                  </div>
                  {craneUsageMode === "club_crane" && (
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Naša dizalica prebacuje brod na kamion. <strong>Ne troši pravo vađenja/spuštanja</strong>.
                </p>
                <Badge
                  variant="outline"
                  className="w-fit text-[10px] font-semibold bg-blue-100/70 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300"
                >
                  Tarifa manipulacije prema cjeniku
                </Badge>
              </div>
            </div>

            {craneUsageMode === "club_crane" && (
              <div className="pt-1.5 space-y-1.5 animate-in fade-in duration-200">
                <Label className="text-[11px] font-semibold flex items-center gap-1 text-blue-900 dark:text-blue-300">
                  <Anchor className="w-3.5 h-3.5" />
                  Odaberite klupsku dizalicu za ukrcaj *
                </Label>
                <Select value={selectedCraneId} onValueChange={setSelectedCraneId}>
                  <SelectTrigger className="h-8 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate border-blue-300">
                    <SelectValue
                      placeholder={
                        cranesLoading
                          ? "Učitavanje dizalica..."
                          : "Odaberite klupsku dizalicu"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {activeCranes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name} ({c.type}) — Nosivost: do {c.capacityTons} t
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Datum, vrijeme i napomena */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <div className="space-y-1 min-w-0">
              <Label className="text-[11px] font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Datum i vrijeme otpreme / ukrcaja na kamion *
              </Label>
              <Input
                type="datetime-local"
                value={dispatchedAtStr}
                onChange={(e) => setDispatchedAtStr(e.target.value)}
                className="h-8 text-xs bg-background w-full"
                required
              />
            </div>

            <div className="space-y-1 min-w-0">
              <Label className="text-[11px] font-medium">
                Napomena operatera (prijevoznik / odredište servisa)
              </Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Unesite napomenu o prijevozniku, servisu ili razlogu otpreme..."
                className="text-xs bg-background w-full"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Odustani
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={dispatchMutation.isPending}
              className={`gap-1.5 text-white ${
                craneUsageMode === "truck_crane"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {dispatchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Truck className="w-4 h-4" />
              )}
              {craneUsageMode === "truck_crane"
                ? "Potvrdi otpremu (vlastita dizalica kamiona)"
                : "Potvrdi ukrcaj klupskom dizalicom"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
