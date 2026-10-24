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
  Plus,
  User as UserIcon,
  MapPin,
  Calendar,
  Loader2,
  Info,
} from "lucide-react";

interface TruckDeliveryToLandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultZoneId?: string | null;
  defaultSpotId?: string | null;
  defaultSpotNumber?: number | null;
  onSuccess?: () => void;
}

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TruckDeliveryToLandDialog({
  open,
  onOpenChange,
  defaultZoneId,
  defaultSpotId,
  defaultSpotNumber,
  onSuccess,
}: TruckDeliveryToLandDialogProps) {
  const utils = trpc.useUtils();

  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [vesselMode, setVesselMode] = useState<"new" | "existing">("new");
  const [selectedVesselId, setSelectedVesselId] = useState<string>("");

  // New vessel form fields
  const [vesselName, setVesselName] = useState("");
  const [vesselType, setVesselType] = useState<
    "jedrilica" | "motorni" | "katamaran" | "ostalo"
  >("motorni");
  const [vesselRegistration, setVesselRegistration] = useState("");
  const [vesselLengthM, setVesselLengthM] = useState("");
  const [vesselBeamM, setVesselBeamM] = useState("");
  const [vesselDraftM, setVesselDraftM] = useState("");
  const [vesselWeightTons, setVesselWeightTons] = useState("");

  // Land placement fields
  const [zoneId, setZoneId] = useState<string>("");
  const [spotId, setSpotId] = useState<string>("none");
  const [manualSpotNumber, setManualSpotNumber] = useState<string>("");
  const [liftedAtStr, setLiftedAtStr] = useState<string>(() =>
    toLocalDatetimeInputValue(new Date())
  );
  const [note, setNote] = useState<string>(
    "Iskrcaj novog broda s kamiona — pripremni radovi prije spuštanja u more"
  );

  // Queries
  const { data: usersData, isLoading: usersLoading } =
    trpc.user.list.useQuery(
      {
        page: 1,
        pageSize: 100,
        search: userSearch.trim() || undefined,
      },
      { enabled: open }
    );

  const usersList = useMemo(() => {
    if (!usersData) return [];
    return Array.isArray(usersData) ? usersData : (usersData as any).data || [];
  }, [usersData]);

  const { data: userCardData } = trpc.user.getCard.useQuery(
    { userId: selectedUserId },
    { enabled: open && !!selectedUserId }
  );

  const userVessels = useMemo(() => {
    return userCardData?.vessels || [];
  }, [userCardData]);

  const { data: zones = [] } = trpc.landZone.list.useQuery(undefined, {
    enabled: open,
  });

  const activeZones = useMemo(
    () => zones.filter((z: any) => z.isActive !== false),
    [zones]
  );

  const { data: spots = [], isLoading: spotsLoading } =
    trpc.landFlow.getSpotsByZone.useQuery(
      { zoneId },
      { enabled: open && !!zoneId }
    );

  const availableSpots = useMemo(
    () => spots.filter((s: any) => !s.isOccupied && !s.isBlocked && s.isActive),
    [spots]
  );

  // Sync defaults when modal opens
  useEffect(() => {
    if (open) {
      setLiftedAtStr(toLocalDatetimeInputValue(new Date()));
      if (defaultZoneId) {
        setZoneId(defaultZoneId);
      } else if (activeZones.length > 0 && !zoneId) {
        setZoneId(activeZones[0].id);
      }
      if (defaultSpotId) {
        setSpotId(defaultSpotId);
      } else {
        setSpotId("none");
      }
      if (defaultSpotNumber) {
        setManualSpotNumber(String(defaultSpotNumber));
      } else {
        setManualSpotNumber("");
      }
    }
  }, [open, defaultZoneId, defaultSpotId, defaultSpotNumber, activeZones.length]);

  const placeMutation = trpc.landOccupancy.placeFromTruck.useMutation({
    onSuccess: () => {
      toast.success(
        "Brod s kamiona je uspješno smješten na kopno. Brojanje dana do spuštanja u more je započelo."
      );
      utils.landOccupancy.listActive.invalidate();
      utils.landOccupancy.history.invalidate();
      utils.landZone.list.invalidate();
      utils.landFlow.getSpotsByZone.invalidate();
      utils.landFlow.getDailyBalance.invalidate();
      if (selectedUserId) {
        utils.user.getCard.invalidate({ userId: selectedUserId });
      }
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserId) {
      toast.error("Odaberite vlasnika (korisnika) broda.");
      return;
    }
    if (!zoneId) {
      toast.error("Odaberite zonu na kopnu.");
      return;
    }

    if (vesselMode === "existing") {
      if (!selectedVesselId) {
        toast.error("Odaberite postojeće plovilo ili prebacite na '+ Novi brod'.");
        return;
      }
    } else {
      if (!vesselName.trim()) {
        toast.error("Unesite naziv novog broda.");
        return;
      }
    }

    const parsedLiftedAt = liftedAtStr ? new Date(liftedAtStr) : new Date();
    const chosenSpot =
      spotId && spotId !== "none"
        ? availableSpots.find((s: any) => s.id === spotId)
        : undefined;

    const spotNum = chosenSpot
      ? chosenSpot.spotNumber
      : manualSpotNumber.trim()
        ? parseInt(manualSpotNumber.trim(), 10)
        : undefined;

    placeMutation.mutate({
      userId: selectedUserId,
      vesselId: vesselMode === "existing" ? selectedVesselId : undefined,
      newVessel:
        vesselMode === "new"
          ? {
              name: vesselName.trim(),
              type: vesselType,
              registration: vesselRegistration.trim() || undefined,
              lengthM: vesselLengthM ? parseFloat(vesselLengthM) : undefined,
              beamM: vesselBeamM ? parseFloat(vesselBeamM) : undefined,
              draftM: vesselDraftM ? parseFloat(vesselDraftM) : undefined,
              weightTons: vesselWeightTons
                ? parseFloat(vesselWeightTons)
                : undefined,
            }
          : undefined,
      zoneId,
      spotId: spotId && spotId !== "none" ? spotId : undefined,
      spotNumber: spotNum && !isNaN(spotNum) ? spotNum : undefined,
      liftedAt: !isNaN(parsedLiftedAt.getTime()) ? parsedLiftedAt : new Date(),
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Truck className="w-5 h-5 text-amber-600" />
            Iskrcaj broda s kamiona na kopno (bez klupske dizalice)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Evidentirajte novi brod koji je kamion iskrcao vlastitom dizalicom na
            mjesto na kopnu. Mjesto odmah postaje zauzeto i broji dane provedene na
            kopnu sve do operacije spuštanja u more.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Info Banner */}
          <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>Napomena o pravima i obračunu:</strong> Klupska dizalica nije
              angažirana pri iskrcaju. Broj dana provedenih na kopnu vodi se{" "}
              <strong>informativno</strong> sve dok se brod ne spusti u more.
            </div>
          </div>

          {/* 1. Korisnik / Vlasnik */}
          <div className="space-y-2 p-3 rounded-xl border bg-muted/20">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-primary" />
              1. Vlasnik broda (Korisnik) *
            </Label>
            <Input
              placeholder="Pretraži korisnika po imenu, prezimenu, tvrtki ili OIB-u..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="h-8 text-xs bg-background"
            />
            <Select
              value={selectedUserId}
              onValueChange={(val) => {
                setSelectedUserId(val);
                setSelectedVesselId("");
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue
                  placeholder={
                    usersLoading
                      ? "Učitavanje korisnika..."
                      : "Odaberite korisnika s popisa"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {usersList.map((u: any) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.name || u.companyName || u.email}{" "}
                    {u.clientCategory === "member"
                      ? "(Član)"
                      : "(Vanjski korisnik)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Plovilo (Novi brod ili postojeće plovilo) */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Ship className="w-3.5 h-3.5 text-primary" />
                2. Podaci o brodu *
              </Label>
              <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border">
                <button
                  type="button"
                  onClick={() => setVesselMode("new")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                    vesselMode === "new"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Novi brod (tek kupljen)
                </button>
                <button
                  type="button"
                  onClick={() => setVesselMode("existing")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    vesselMode === "existing"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Postojeći brod ({userVessels.length})
                </button>
              </div>
            </div>

            {vesselMode === "new" ? (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px]">
                      Naziv / model novog broda *
                    </Label>
                    <Input
                      value={vesselName}
                      onChange={(e) => setVesselName(e.target.value)}
                      placeholder="npr. Novi brod - Merry Fisher 795"
                      className="h-8 text-xs bg-background"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tip plovila *</Label>
                    <Select
                      value={vesselType}
                      onValueChange={(v: any) => setVesselType(v)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="motorni">Motorni brod</SelectItem>
                        <SelectItem value="jedrilica">Jedrilica</SelectItem>
                        <SelectItem value="katamaran">Katamaran</SelectItem>
                        <SelectItem value="ostalo">Ostalo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">
                    Registracija (opcijski — može ostati prazno ako je brod tek kupljen)
                  </Label>
                  <Input
                    value={vesselRegistration}
                    onChange={(e) => setVesselRegistration(e.target.value)}
                    placeholder="Ostavite prazno ako brod još nema registraciju (npr. ST-1234)"
                    className="h-8 text-xs bg-background"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Dužina (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselLengthM}
                      onChange={(e) => setVesselLengthM(e.target.value)}
                      placeholder="8.50"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Širina (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselBeamM}
                      onChange={(e) => setVesselBeamM(e.target.value)}
                      placeholder="2.95"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Gaz (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselDraftM}
                      onChange={(e) => setVesselDraftM(e.target.value)}
                      placeholder="0.80"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Težina (t)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={vesselWeightTons}
                      onChange={(e) => setVesselWeightTons(e.target.value)}
                      placeholder="3.2"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {!selectedUserId ? (
                  <p className="text-xs text-muted-foreground">
                    Prvo odaberite korisnika iznad kako bi se prikazala njegova plovila.
                  </p>
                ) : userVessels.length === 0 ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                    <span>Odabrani korisnik nema upisanih plovila.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setVesselMode("new")}
                    >
                      + Unesi novi brod
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={selectedVesselId}
                    onValueChange={setSelectedVesselId}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Odaberite plovilo korisnika" />
                    </SelectTrigger>
                    <SelectContent>
                      {userVessels.map((v: any) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          {v.name}{" "}
                          {v.registration
                            ? `(${v.registration})`
                            : "(Bez registracije)"}{" "}
                          • {v.lengthM || "?"}m × {v.beamM || "?"}m
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {/* 3. Zona i mjesto na kopnu */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              3. Smještaj na kopnu i početak brojanja dana *
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">Zona na kopnu *</Label>
                <Select
                  value={zoneId}
                  onValueChange={(val) => {
                    setZoneId(val);
                    setSpotId("none");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Odaberite zonu" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeZones.map((z: any) => (
                      <SelectItem key={z.id} value={z.id} className="text-xs">
                        Zona {z.code} — {z.name} (Slobodno: {z.availableSpots ?? 0}/
                        {z.totalSpots})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">
                  Mjesto u zoni (odabir iz mreže mjesta)
                </Label>
                <Select value={spotId} onValueChange={setSpotId}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue
                      placeholder={
                        spotsLoading
                          ? "Učitavanje mjesta..."
                          : "Odaberite slobodno mjesto"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="none" className="text-xs">
                      — Bez odabira iz mreže (ili ručni broj mjesta) —
                    </SelectItem>
                    {availableSpots.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.code} (Mjesto #{s.spotNumber} • max {s.maxLengthM}m ×{" "}
                        {s.maxBeamM}m)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {spotId === "none" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">
                    Broj mjesta (opcijski ručni unos)
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={manualSpotNumber}
                    onChange={(e) => setManualSpotNumber(e.target.value)}
                    placeholder="npr. 12"
                    className="h-8 text-xs bg-background"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Datum i vrijeme iskrcaja s kamiona *
                </Label>
                <Input
                  type="datetime-local"
                  value={liftedAtStr}
                  onChange={(e) => setLiftedAtStr(e.target.value)}
                  className="h-8 text-xs bg-background"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">
                Napomena (pripremni radovi / prijevoznik)
              </Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Unesite napomenu o iskrcaju s kamiona i pripremnim radovima..."
                className="text-xs bg-background"
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
              disabled={placeMutation.isPending}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {placeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Truck className="w-4 h-4" />
              )}
              Evidentiraj iskrcaj i zauzmi mjesto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
