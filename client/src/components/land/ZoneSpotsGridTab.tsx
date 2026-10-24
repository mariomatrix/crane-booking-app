import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  Ship,
  CheckCircle2,
  Loader2,
  Truck,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TruckDeliveryToLandDialog } from "@/components/land/TruckDeliveryToLandDialog";

interface ZoneSpotsGridTabProps {
  onAssignFromWaitlist?: (spotId: string) => void;
}

export function ZoneSpotsGridTab({ onAssignFromWaitlist }: ZoneSpotsGridTabProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AVAILABLE" | "OCCUPIED">("ALL");
  const [selectedSpot, setSelectedSpot] = useState<any | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Truck delivery dialog state
  const [truckDialogOpen, setTruckDialogOpen] = useState(false);
  const [truckDefaultSpotId, setTruckDefaultSpotId] = useState<string | null>(null);
  const [truckDefaultSpotNumber, setTruckDefaultSpotNumber] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Load all zones
  const { data: zones = [] } = trpc.landZone.list.useQuery();

  // Default to first zone when zones load
  const activeZoneId = selectedZoneId || (zones.length > 0 ? zones[0].id : "");

  // Load spots for the selected zone
  const { data: spots = [], isLoading: spotsLoading } = trpc.landFlow.getSpotsByZone.useQuery(
    { zoneId: activeZoneId },
    { enabled: !!activeZoneId }
  );

  const currentZone = zones.find((z) => z.id === activeZoneId);

  // Complete occupancy mutation (launch vessel into sea)
  const completeOccupancyMutation = trpc.landOccupancy.complete.useMutation({
    onSuccess: () => {
      toast.success("Plovilo je uspješno spušteno u more (boravak završen). Mjesto je oslobođeno.");
      utils.landFlow.getSpotsByZone.invalidate();
      utils.landZone.list.invalidate();
      utils.landOccupancy.listActive.invalidate();
      setDetailModalOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // Filter spots
  const filteredSpots = spots.filter((s) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const codeMatches = s.code.toLowerCase().includes(q);
      const vesselMatches = s.currentVesselName?.toLowerCase().includes(q) || false;
      const regMatches = s.currentVesselReg?.toLowerCase().includes(q) || false;
      if (!codeMatches && !vesselMatches && !regMatches) return false;
    }

    // Status filter
    if (statusFilter === "AVAILABLE") return !s.isOccupied;
    if (statusFilter === "OCCUPIED") return s.isOccupied;

    return true;
  });

  const handleSpotClick = (spot: any) => {
    setSelectedSpot(spot);
    setDetailModalOpen(true);
  };

  const handleCompleteOccupancy = (occupancyId: string) => {
    if (confirm("Potvrđujete li da je plovilo napustilo suhi vez i spušteno u more?")) {
      completeOccupancyMutation.mutate({ id: occupancyId });
    }
  };

  const openTruckDeliveryForSpot = (spot?: any) => {
    if (spot) {
      setTruckDefaultSpotId(spot.id);
      setTruckDefaultSpotNumber(spot.spotNumber);
    } else {
      setTruckDefaultSpotId(null);
      setTruckDefaultSpotNumber(null);
    }
    setDetailModalOpen(false);
    setTruckDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Zone Selector Pills */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {zones.map((zone) => {
            const isSelected = zone.id === activeZoneId;
            return (
              <button
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                )}
              >
                <span className="font-bold">{zone.code}</span>
                <span>{zone.name}</span>
                <Badge
                  variant={isSelected ? "secondary" : "outline"}
                  className="text-[10px] px-1.5 py-0 rounded-full"
                >
                  {zone.totalSpots} mjesta
                </Badge>
              </button>
            );
          })}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => openTruckDeliveryForSpot()}
          className="h-8 text-xs font-semibold border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800 gap-1.5"
        >
          <Truck className="w-3.5 h-3.5 text-amber-600" />
          Iskrcaj s kamiona (Bez dizalice)
        </Button>
      </div>

      {/* Zone Overview & Filters */}
      {currentZone && (
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs font-bold bg-primary/10 border-primary/20 text-primary">
                    {currentZone.code}
                  </Badge>
                  <CardTitle className="text-base font-bold">{currentZone.name}</CardTitle>
                </div>
                <CardDescription className="text-xs mt-0.5">
                  {currentZone.description || "Suhi vez - zona operacija"}
                </CardDescription>
              </div>

              {/* Zone Capacity Stats */}
              <div className="flex items-center gap-2 text-xs font-medium">
                <div className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <span className="text-[11px] text-muted-foreground mr-1.5">Slobodno:</span>
                  <span className="font-bold">{currentZone.availableSpots ?? 0}</span>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                  <span className="text-[11px] text-muted-foreground mr-1.5">Zauzeto:</span>
                  <span className="font-bold">{currentZone.activeSpots ?? 0}</span>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-muted text-foreground border">
                  <span className="text-[11px] text-muted-foreground mr-1.5">Ukupno:</span>
                  <span className="font-bold">{currentZone.totalSpots}</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-3 pb-3">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Pretraži mjesto ili plovilo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant={statusFilter === "ALL" ? "default" : "outline"}
                  onClick={() => setStatusFilter("ALL")}
                  className="h-7 text-xs px-2.5"
                >
                  Sva ({spots.length})
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "AVAILABLE" ? "default" : "outline"}
                  onClick={() => setStatusFilter("AVAILABLE")}
                  className="h-7 text-xs px-2.5 text-emerald-700 dark:text-emerald-300"
                >
                  Slobodna
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "OCCUPIED" ? "default" : "outline"}
                  onClick={() => setStatusFilter("OCCUPIED")}
                  className="h-7 text-xs px-2.5 text-sky-700 dark:text-sky-300"
                >
                  Zauzeta
                </Button>
              </div>
            </div>

            {/* Spots Grid */}
            {spotsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs">Učitavanje mjesta za zonu...</p>
              </div>
            ) : filteredSpots.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground border rounded-xl bg-muted/10">
                Nema mjesta koja odgovaraju odabranim kriterijima.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
                {filteredSpots.map((spot: any) => {
                  const isOccupied = spot.isOccupied;

                  return (
                    <div
                      key={spot.id}
                      onClick={() => handleSpotClick(spot)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs cursor-pointer transition-all hover:scale-[1.02] shadow-2xs space-y-1.5 flex flex-col justify-between",
                        isOccupied
                          ? "bg-sky-50/60 border-sky-200/80 dark:bg-sky-950/20 dark:border-sky-800/40"
                          : "bg-background border-border/80 hover:border-emerald-400 hover:bg-emerald-50/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-xs text-foreground">
                          {spot.code}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1 py-0 font-medium",
                            isOccupied
                              ? "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"
                          )}
                        >
                          {isOccupied ? "Zauzeto" : "Slobodno"}
                        </Badge>
                      </div>

                      {/* Content inside card */}
                      {isOccupied ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-[11px] text-foreground truncate flex items-center gap-1">
                            <Ship className="w-3 h-3 text-sky-600 shrink-0" />
                            {spot.currentVesselName || "Plovilo"}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {spot.currentVesselReg || "Bez registracije"}
                          </p>
                          <div className="flex items-center justify-between gap-1 pt-0.5 flex-wrap">
                            {spot.daysOnLand != null && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 font-semibold bg-amber-100/80 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                              >
                                ⏱️ {spot.daysOnLand} {spot.daysOnLand === 1 ? "dan" : "dana"}
                              </Badge>
                            )}
                            {spot.isTruckDelivery && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 border-amber-300 text-amber-800 dark:text-amber-300"
                              >
                                🚚 Kamion
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="py-2 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Spremno za prijem</span>
                        </div>
                      )}

                      {/* Dimensions Footer */}
                      <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                        <span>Max: {spot.maxLengthM}m</span>
                        <span>{spot.maxBeamM}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Spot Detail & Allocation Modal */}
      {selectedSpot && (
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedSpot.code}
                </Badge>
                <DialogTitle className="text-base">Detalji mjesta na suhom vezu</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Zona {currentZone?.name} ({currentZone?.code}) • Mjesto #{selectedSpot.spotNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {/* Dimensions */}
              <div className="p-2.5 rounded-lg bg-muted/40 border space-y-1">
                <p className="font-semibold text-foreground">Fizička ograničenja mjesta:</p>
                <div className="grid grid-cols-3 gap-2 text-center font-mono pt-1">
                  <div>
                    <span className="block text-[10px] text-muted-foreground">Maks. dužina</span>
                    <span className="font-bold">{selectedSpot.maxLengthM} m</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-muted-foreground">Maks. širina</span>
                    <span className="font-bold">{selectedSpot.maxBeamM} m</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-muted-foreground">Maks. težina</span>
                    <span className="font-bold">{selectedSpot.maxWeightTons ?? "—"} t</span>
                  </div>
                </div>
              </div>

              {/* Occupancy Info */}
              {selectedSpot.isOccupied ? (
                <div className="p-3 rounded-lg border bg-sky-50/60 dark:bg-sky-950/20 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                      <Ship className="w-3.5 h-3.5" />
                      Trenutno plovilo na mjestu:
                    </span>
                    <div className="flex items-center gap-1">
                      {selectedSpot.isTruckDelivery && (
                        <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-800 border-amber-300">
                          🚚 Iskrcaj s kamiona
                        </Badge>
                      )}
                      <Badge className="text-[10px] py-0 bg-sky-600">Aktivno zauzeto</Badge>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <p>
                      <strong>Naziv:</strong> {selectedSpot.currentVesselName || "Plovilo"}
                    </p>
                    <p>
                      <strong>Registracija:</strong> {selectedSpot.currentVesselReg || "Bez registracije"}
                    </p>
                    {selectedSpot.liftedAt && (
                      <p>
                        <strong>Datum smještaja na kopno:</strong>{" "}
                        {new Date(selectedSpot.liftedAt).toLocaleString("hr-HR")}
                      </p>
                    )}
                    {selectedSpot.daysOnLand != null && (
                      <div className="pt-1 flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          Proteklo do spuštanja: {selectedSpot.daysOnLand}{" "}
                          {selectedSpot.daysOnLand === 1 ? "dan" : "dana"}
                        </span>
                      </div>
                    )}
                    {selectedSpot.occupancyNote && (
                      <p className="text-muted-foreground pt-1 italic">
                        Napomena: {selectedSpot.occupancyNote}
                      </p>
                    )}
                  </div>

                  {selectedSpot.occupancyId && (
                    <div className="pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => handleCompleteOccupancy(selectedSpot.occupancyId)}
                        disabled={completeOccupancyMutation.isPending}
                      >
                        {completeOccupancyMutation.isPending ? "Završavanje..." : "Spusti u more (Oslobodi mjesto)"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg border bg-emerald-50/60 dark:bg-emerald-950/20 text-center space-y-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Mjesto je slobodno i dostupno za dodjelu
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Možete smjestiti novi brod iskrcan s kamiona izravno na ovo mjesto (bez angažmana dizalice).
                  </p>
                  <Button
                    size="sm"
                    onClick={() => openTruckDeliveryForSpot(selectedSpot)}
                    className="w-full text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Smjesti brod s kamiona na ovo mjesto
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDetailModalOpen(false)}
                className="text-xs"
              >
                Zatvori
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Truck Delivery to Land Dialog */}
      <TruckDeliveryToLandDialog
        open={truckDialogOpen}
        onOpenChange={setTruckDialogOpen}
        defaultZoneId={activeZoneId}
        defaultSpotId={truckDefaultSpotId}
        defaultSpotNumber={truckDefaultSpotNumber}
      />
    </div>
  );
}
