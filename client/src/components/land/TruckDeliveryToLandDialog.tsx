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
  Anchor,
  CheckCircle2,
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

  // Crane usage mode: kamion ima vlastitu dizalicu vs angažman klupske dizalice
  const [craneUsageMode, setCraneUsageMode] = useState<"truck_crane" | "club_crane">("truck_crane");
  const [selectedCraneId, setSelectedCraneId] = useState<string>("");

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
        craneUsageMode === "club_crane"
          ? "Brod s kamiona je uspješno iskrcan klupskom dizalicom i smješten na kopno."
          : "Brod s kamiona je uspješno smješten na kopno (vlastita dizalica kamiona, 0,00 € dizalica)."
      );
      utils.landOccupancy.listActive.invalidate();
      utils.landOccupancy.history.invalidate();
      utils.landZone.list.invalidate();
      utils.landFlow.getSpotsByZone.invalidate();
      utils.landFlow.getDailyBalance.invalidate();
      utils.reservation.listAll.invalidate();
      utils.workOrders.list.invalidate();
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

    if (craneUsageMode === "club_crane" && !selectedCraneId) {
      toast.error("Odaberite klupsku dizalicu za iskrcaj.");
      return;
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
      craneUsageMode,
      craneId: craneUsageMode === "club_crane" ? selectedCraneId : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Truck className="w-5 h-5 text-amber-600" />
              Iskrcaj broda s kamiona na kopno
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
                ? "🚚 Vlastita dizalica kamiona (0,00 €)"
                : "🏗️ Angažman klupske dizalice"}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Evidentirajte dolazak i smještaj broda s kamiona na suhi vez. Možete odabrati ima li kamion vlastitu dizalicu ili se angažira klupska dizalica.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Info Banner ovisno o odabranom načinu */}
          <div
            className={`p-2.5 rounded-lg border flex items-start gap-2.5 text-xs transition-colors ${craneUsageMode === "truck_crane"
                ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                : "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200"
              }`}
          >
            <Info
              className={`w-4 h-4 shrink-0 mt-0.5 ${craneUsageMode === "truck_crane" ? "text-emerald-600" : "text-blue-600"
                }`}
            />
            <div className="space-y-0.5">
              <strong>
                {craneUsageMode === "truck_crane"
                  ? "Kamion s vlastitom dizalicom (bez klupske dizalice):"
                  : "Iskrcaj klupskom dizalicom kluba:"}
              </strong>{" "}
              {craneUsageMode === "truck_crane" ? (
                <span>
                  Klupska dizalica <strong>nije angažirana</strong> pri iskrcaju te se{" "}
                  <strong>usluga dizalice ne zaračunava (0,00 €)</strong>. Mjesto na kopnu odmah postaje zauzeto, a dani ležarine broje se sve do operacije spuštanja u more.
                </span>
              ) : (
                <span>
                  Klupska dizalica <strong>obavlja iskrcaj s kamiona</strong>. Operacija se evidentira u radnom nalogu i zadužuje prema statutarnoj kvoti (za članove) ili po važećem cjeniku (za vanjske korisnike).
                </span>
              )}
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
              className="h-8 text-xs bg-background w-full"
            />
            <Select
              value={selectedUserId}
              onValueChange={(val) => {
                setSelectedUserId(val);
                setSelectedVesselId("");
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate">
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
                      ? "(Član kluba)"
                      : "(Vanjski korisnik)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Način iskrcaja i dizalica */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-primary" />
              2. Način iskrcaja s kamiona i angažman dizalice *
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
                className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between text-left ${craneUsageMode === "truck_crane"
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
                  Kamion samostalno iskrcava brod. Klupska dizalica <strong>nije potrebna</strong>.
                </p>
                <Badge
                  variant="outline"
                  className="w-fit text-[10px] font-semibold bg-emerald-100/70 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  Usluga dizalice: 0,00 € (ne naplaćuje se)
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
                className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between text-left ${craneUsageMode === "club_crane"
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500 shadow-2xs"
                    : "border-border hover:border-muted-foreground/40 bg-background"
                  }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Anchor className="w-4 h-4 text-blue-600" />
                    Angažman klupske dizalice
                  </div>
                  {craneUsageMode === "club_crane" && (
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Iskrcaj broda obavlja naša dizalica (Travelift / Stupna dizalica).
                </p>
                <Badge
                  variant="outline"
                  className="w-fit text-[10px] font-semibold bg-blue-100/70 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300"
                >
                  Zaračunava se usluga dizalice (kvota / cjenik)
                </Badge>
              </div>
            </div>

            {/* Ako je odabran angažman klupske dizalice, prikazujemo odabir dizalice */}
            {craneUsageMode === "club_crane" && (
              <div className="pt-1.5 space-y-1.5 animate-in fade-in duration-200">
                <Label className="text-[11px] font-semibold flex items-center gap-1 text-blue-900 dark:text-blue-300">
                  <Anchor className="w-3.5 h-3.5" />
                  Odaberite klupsku dizalicu za iskrcaj *
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

          {/* 3. Plovilo (Novi brod ili postojeće plovilo) */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Ship className="w-3.5 h-3.5 text-primary" />
                3. Podaci o brodu *
              </Label>
              <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border">
                <button
                  type="button"
                  onClick={() => setVesselMode("new")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${vesselMode === "new"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Plus className="w-3 h-3" />
                  Novi brod
                </button>
                <button
                  type="button"
                  onClick={() => setVesselMode("existing")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${vesselMode === "existing"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">
                      Naziv / model novog broda *
                    </Label>
                    <Input
                      value={vesselName}
                      onChange={(e) => setVesselName(e.target.value)}
                      placeholder="npr. Novi brod - Merry Fisher 795"
                      className="h-8 text-xs bg-background w-full"
                      required
                    />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">Tip plovila *</Label>
                    <Select
                      value={vesselType}
                      onValueChange={(v: any) => setVesselType(v)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate">
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
                    className="h-8 text-xs bg-background w-full"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">Dužina (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselLengthM}
                      onChange={(e) => setVesselLengthM(e.target.value)}
                      placeholder="8.50"
                      className="h-8 text-xs bg-background w-full"
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">Širina (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselBeamM}
                      onChange={(e) => setVesselBeamM(e.target.value)}
                      placeholder="2.95"
                      className="h-8 text-xs bg-background w-full"
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">Gaz (m)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vesselDraftM}
                      onChange={(e) => setVesselDraftM(e.target.value)}
                      placeholder="0.80"
                      className="h-8 text-xs bg-background w-full"
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[11px]">Težina (t)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={vesselWeightTons}
                      onChange={(e) => setVesselWeightTons(e.target.value)}
                      placeholder="3.2"
                      className="h-8 text-xs bg-background w-full"
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
                  <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between p-2 rounded-lg bg-amber-50/50 border border-amber-200">
                    <span>Odabrani korisnik nema ranije evidentiranih plovila.</span>
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
                    <SelectTrigger className="h-9 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate">
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

          {/* 4. Zona i mjesto na kopnu */}
          <div className="space-y-3 p-3 rounded-xl border bg-muted/20">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              4. Smještaj na kopnu i početak brojanja dana *
            </Label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
              <div className="space-y-1 min-w-0">
                <Label className="text-[11px] font-medium">Zona na kopnu *</Label>
                <Select
                  value={zoneId}
                  onValueChange={(val) => {
                    setZoneId(val);
                    setSpotId("none");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate">
                    <SelectValue placeholder="Odaberite zonu" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {activeZones.map((z: any) => (
                      <SelectItem key={z.id} value={z.id} className="text-xs">
                        Zona {z.code} — {z.name} (Slobodno: {z.availableSpots ?? 0}/
                        {z.totalSpots})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 min-w-0">
                <Label className="text-[11px] font-medium">
                  Mjesto u zoni (odabir iz mreže mjesta)
                </Label>
                <Select value={spotId} onValueChange={setSpotId}>
                  <SelectTrigger className="h-8 text-xs bg-background w-full min-w-0 overflow-hidden [&>span]:truncate">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
              {spotId === "none" && (
                <div className="space-y-1 min-w-0">
                  <Label className="text-[11px] font-medium">
                    Broj mjesta (opcijski ručni unos)
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={manualSpotNumber}
                    onChange={(e) => setManualSpotNumber(e.target.value)}
                    placeholder="npr. 12"
                    className="h-8 text-xs bg-background w-full"
                  />
                </div>
              )}

              <div className="space-y-1 min-w-0">
                <Label className="text-[11px] font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Datum i vrijeme iskrcaja s kamiona *
                </Label>
                <Input
                  type="datetime-local"
                  value={liftedAtStr}
                  onChange={(e) => setLiftedAtStr(e.target.value)}
                  className="h-8 text-xs bg-background w-full"
                  required
                />
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <Label className="text-[11px] font-medium">
                Napomena (pripremni radovi / prijevoznik / dizalica)
              </Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Unesite napomenu o iskrcaju s kamiona i pripremnim radovima..."
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
              disabled={placeMutation.isPending}
              className={`gap-1.5 text-white ${craneUsageMode === "truck_crane"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
              {placeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : craneUsageMode === "truck_crane" ? (
                <Truck className="w-4 h-4" />
              ) : (
                <Anchor className="w-4 h-4" />
              )}
              {craneUsageMode === "truck_crane"
                ? "Evidentiraj iskrcaj (bez klupske dizalice, 0,00 €)"
                : "Evidentiraj iskrcaj klupskom dizalicom"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
