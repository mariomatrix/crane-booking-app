import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Ship,
  Anchor,
  Link2,
  Unlink,
  Calendar,
  Loader2,
} from "lucide-react";
import { TurnaroundLinkModal } from "./TurnaroundLinkModal";
import { cn } from "@/lib/utils";

interface FlowMatrixTabProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onNavigateToWaitlist?: () => void;
}

export function FlowMatrixTab({
  selectedDate,
  onDateChange,
  onNavigateToWaitlist,
}: FlowMatrixTabProps) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [modalDepartureId, setModalDepartureId] = useState<string | undefined>();
  const [modalArrivalId, setModalArrivalId] = useState<string | undefined>();

  const utils = trpc.useUtils();

  const { data: matrixData, isLoading, refetch } = trpc.landFlow.getFlowMatrix.useQuery({
    dateStr: selectedDate,
  });

  const { data: balanceData } = trpc.landFlow.getDailyBalance.useQuery({
    dateStr: selectedDate,
  });

  const confirmMutation = trpc.landFlow.confirmTurnaround.useMutation({
    onSuccess: () => {
      toast.success("Izmjena na vezu je potvrđena i zaključana.");
      utils.landFlow.getFlowMatrix.invalidate();
      utils.landFlow.getDailyBalance.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.landFlow.cancelTurnaround.useMutation({
    onSuccess: () => {
      toast.success("Poveznica izmjene na vezu je uklonjena.");
      utils.landFlow.getFlowMatrix.invalidate();
      utils.landFlow.getDailyBalance.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const items = matrixData?.items || [];

  const departures = items
    .filter((i) => !!i.departure)
    .map((i) => ({
      id: i.departure!.reservationId,
      vesselName: i.departure!.vesselName,
      time: i.timeSlot,
      craneName: i.craneName || "Dizalica",
      spotId: i.spotId,
      spotCode: i.spotCode,
      zoneId: i.zoneId,
      status: i.departure!.status,
      lengthM: i.departure!.vesselLengthM,
      beamM: i.departure!.vesselBeamM,
      ownerName: i.departure!.userName,
      turnaroundLink: i.turnaroundLink
        ? {
            id: i.turnaroundLink.id,
            status: i.turnaroundLink.status,
            bufferMinutes: i.turnaroundLink.bufferMinutes,
            partnerVesselName: i.arrival?.vesselName || "Vađenje na kopno",
            partnerTime: i.arrival?.scheduledStart
              ? new Date(i.arrival.scheduledStart).toLocaleTimeString("hr-HR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : i.timeSlot,
          }
        : null,
    }));

  const arrivals = items
    .filter((i) => !!i.arrival)
    .map((i) => ({
      id: i.arrival!.reservationId,
      vesselName: i.arrival!.vesselName,
      time: i.timeSlot,
      craneName: i.craneName || "Dizalica",
      spotId: i.spotId,
      spotCode: i.spotCode,
      zoneId: i.zoneId,
      status: i.arrival!.status,
      lengthM: i.arrival!.vesselLengthM,
      beamM: i.arrival!.vesselBeamM,
      ownerName: i.arrival!.userName,
      turnaroundLink: i.turnaroundLink
        ? {
            id: i.turnaroundLink.id,
            status: i.turnaroundLink.status,
            bufferMinutes: i.turnaroundLink.bufferMinutes,
            partnerVesselName: i.departure?.vesselName || "Spuštanje u more",
            partnerTime: i.departure?.scheduledEnd
              ? new Date(i.departure.scheduledEnd).toLocaleTimeString("hr-HR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : i.timeSlot,
          }
        : null,
    }));

  const turnaroundsCount = items.filter((i) => !!i.turnaroundLink).length;

  const handleOpenLink = (depId?: string, arrId?: string) => {
    setModalDepartureId(depId);
    setModalArrivalId(arrId);
    setLinkModalOpen(true);
  };

  const handleConfirmLink = (linkId: string) => {
    confirmMutation.mutate({ turnaroundLinkId: linkId });
  };

  const handleCancelLink = (linkId: string) => {
    if (confirm("Jeste li sigurni da želite odvezati ovu izmjenu plovila?")) {
      cancelMutation.mutate({ turnaroundLinkId: linkId, reason: "Operator cancelled turnaround link" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-3.5 rounded-xl border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">Radni dan dispečera:</span>
          </div>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-40 h-8 text-xs font-mono"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDateChange(new Date().toISOString().split("T")[0])}
            className="h-8 text-xs"
          >
            Danas
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleOpenLink()}
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Nova izmjena na vezu (Turnaround)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Daily Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Spuštanja u more</p>
                <p className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                  {departures.length}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Vađenja na kopno</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {arrivals.length}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Povezane izmjene</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {turnaroundsCount}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <RefreshCw className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "border shadow-xs",
            (balanceData?.minimumProjectedFreeSpots ?? 0) < 0 &&
              "border-destructive/40 bg-destructive/5"
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Min. slobodno danas</p>
                <p
                  className={cn(
                    "text-lg font-bold mt-0.5",
                    (balanceData?.minimumProjectedFreeSpots ?? 0) < 0
                      ? "text-destructive"
                      : "text-foreground"
                  )}
                >
                  {balanceData?.minimumProjectedFreeSpots ?? 0}
                </p>
              </div>
              <div
                className={cn(
                  "p-2 rounded-lg",
                  (balanceData?.minimumProjectedFreeSpots ?? 0) < 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Anchor className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Flow Grid: Departures on Left, Arrivals on Right */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs">Učitavanje matrice kretanja...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Departures Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-sky-500/15 text-sky-600">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  Spuštanja u more ({departures.length})
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">Oslobađanje suhog veza</span>
            </div>

            {departures.length === 0 ? (
              <div className="p-6 text-center border rounded-xl bg-muted/20 text-xs text-muted-foreground">
                Nema zakazanih spuštanja u more za odabrani datum.
              </div>
            ) : (
              departures.map((dep) => {
                const link = dep.turnaroundLink;
                return (
                  <Card
                    key={dep.id}
                    className={cn(
                      "border shadow-xs transition-colors",
                      link ? "border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10" : "hover:border-border"
                    )}
                  >
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded">
                              {dep.time}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {dep.craneName}
                            </Badge>
                            {dep.spotCode ? (
                              <Badge className="text-[10px] py-0 bg-primary/15 text-primary border-primary/20">
                                Mjesto: {dep.spotCode}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground">
                                Nepoznato mjesto
                              </Badge>
                            )}
                          </div>
                          <p className="font-semibold text-sm text-foreground mt-1 flex items-center gap-1.5">
                            <Ship className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            {dep.vesselName}
                          </p>
                          {(dep.lengthM || dep.beamM) && (
                            <p className="text-[11px] text-muted-foreground">
                              Dimenzije: {dep.lengthM ?? "?"}m × {dep.beamM ?? "?"}m
                              {dep.ownerName && ` • Vlasnik: ${dep.ownerName}`}
                            </p>
                          )}
                        </div>

                        <Badge
                          variant={dep.status === "confirmed" ? "default" : "outline"}
                          className="text-[10px] py-0 shrink-0"
                        >
                          {dep.status}
                        </Badge>
                      </div>

                      {/* Turnaround Link Section */}
                      {link ? (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Povezana izmjena na istom mjestu</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {link.status === "confirmed" ? (
                                <Badge className="text-[9px] py-0 bg-emerald-600 text-white">
                                  Potvrđeno
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] py-0 border-amber-400 text-amber-700">
                                  Predloženo
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              Preuzima: <strong>{link.partnerVesselName}</strong> ({link.partnerTime})
                            </span>
                            <span className="font-mono font-medium">
                              Buffer: +{link.bufferMinutes} min
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            {link.status !== "confirmed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:text-emerald-300"
                                onClick={() => handleConfirmLink(link.id)}
                              >
                                Potvrdi
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px] px-2 text-destructive hover:bg-destructive/10"
                              onClick={() => handleCancelLink(link.id)}
                            >
                              <Unlink className="w-3 h-3 mr-1" />
                              Odveži
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-dashed hover:border-primary hover:text-primary"
                            onClick={() => handleOpenLink(dep.id, undefined)}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Poveži s vađenjem (Turnaround)
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Arrivals Column */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-indigo-500/15 text-indigo-600">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  Vađenja na kopno ({arrivals.length})
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">Zauzimanje suhog veza</span>
            </div>

            {arrivals.length === 0 ? (
              <div className="p-6 text-center border rounded-xl bg-muted/20 text-xs text-muted-foreground">
                Nema zakazanih vađenja na kopno za odabrani datum.
              </div>
            ) : (
              arrivals.map((arr) => {
                const link = arr.turnaroundLink;
                return (
                  <Card
                    key={arr.id}
                    className={cn(
                      "border shadow-xs transition-colors",
                      link ? "border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10" : "hover:border-border"
                    )}
                  >
                    <CardContent className="p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded">
                              {arr.time}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {arr.craneName}
                            </Badge>
                            {arr.spotCode ? (
                              <Badge className="text-[10px] py-0 bg-primary/15 text-primary border-primary/20">
                                Mjesto: {arr.spotCode}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 text-amber-600 border-amber-300">
                                Čeka dodjelu mjesta
                              </Badge>
                            )}
                          </div>
                          <p className="font-semibold text-sm text-foreground mt-1 flex items-center gap-1.5">
                            <Ship className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            {arr.vesselName}
                          </p>
                          {(arr.lengthM || arr.beamM) && (
                            <p className="text-[11px] text-muted-foreground">
                              Dimenzije: {arr.lengthM ?? "?"}m × {arr.beamM ?? "?"}m
                              {arr.ownerName && ` • Vlasnik: ${arr.ownerName}`}
                            </p>
                          )}
                        </div>

                        <Badge
                          variant={arr.status === "confirmed" ? "default" : "outline"}
                          className="text-[10px] py-0 shrink-0"
                        >
                          {arr.status}
                        </Badge>
                      </div>

                      {/* Turnaround Link Section */}
                      {link ? (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Izmjena: Preuzima mjesto od</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {link.status === "confirmed" ? (
                                <Badge className="text-[9px] py-0 bg-emerald-600 text-white">
                                  Potvrđeno
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] py-0 border-amber-400 text-amber-700">
                                  Predloženo
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              Oslobađa: <strong>{link.partnerVesselName}</strong> ({link.partnerTime})
                            </span>
                            <span className="font-mono font-medium">
                              Buffer: +{link.bufferMinutes} min
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            {link.status !== "confirmed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:text-emerald-300"
                                onClick={() => handleConfirmLink(link.id)}
                              >
                                Potvrdi
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px] px-2 text-destructive hover:bg-destructive/10"
                              onClick={() => handleCancelLink(link.id)}
                            >
                              <Unlink className="w-3 h-3 mr-1" />
                              Odveži
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-dashed hover:border-primary hover:text-primary"
                            onClick={() => handleOpenLink(undefined, arr.id)}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Poveži s odlaskom (Turnaround)
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Turnaround Link Modal */}
      <TurnaroundLinkModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        dateStr={selectedDate}
        initialDepartureId={modalDepartureId}
        initialArrivalId={modalArrivalId}
        onSuccess={() => {
          refetch();
          utils.landFlow.getDailyBalance.invalidate();
        }}
      />
    </div>
  );
}
