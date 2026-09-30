import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { ArrowRight, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface TurnaroundLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateStr: string; // YYYY-MM-DD
  initialDepartureId?: string;
  initialArrivalId?: string;
  onSuccess?: () => void;
}

export function TurnaroundLinkModal({
  open,
  onOpenChange,
  dateStr,
  initialDepartureId,
  initialArrivalId,
  onSuccess,
}: TurnaroundLinkModalProps) {
  const [departureId, setDepartureId] = useState<string>(initialDepartureId || "");
  const [arrivalId, setArrivalId] = useState<string>(initialArrivalId || "");
  const [targetSpotId, setTargetSpotId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (initialDepartureId) setDepartureId(initialDepartureId);
    if (initialArrivalId) setArrivalId(initialArrivalId);
  }, [initialDepartureId, initialArrivalId]);

  // Query matrix movements for the day
  const { data: matrixData } = trpc.landFlow.getFlowMatrix.useQuery(
    { dateStr },
    { enabled: open }
  );

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
      endTime: i.departure!.scheduledEnd,
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
      startTime: i.arrival!.scheduledStart,
    }));

  const selectedDeparture = departures.find((d) => d.id === departureId);
  const selectedArrival = arrivals.find((a) => a.id === arrivalId);

  // Auto-fill target spot from departure if departure has an allocated spot
  useEffect(() => {
    if (selectedDeparture?.spotId && !targetSpotId) {
      setTargetSpotId(selectedDeparture.spotId);
    }
  }, [selectedDeparture, targetSpotId]);

  // Query available spots for the active zone
  const activeZoneId = selectedDeparture?.zoneId || selectedArrival?.zoneId;
  const { data: zoneSpotsData = [] } = trpc.landFlow.getSpotsByZone.useQuery(
    { zoneId: activeZoneId! },
    { enabled: open && !!activeZoneId }
  );

  // Calculate buffer minutes
  let bufferMinutes = 0;
  let isBufferValid = true;
  let bufferWarning = "";

  if (selectedDeparture?.endTime && selectedArrival?.startTime) {
    const depEnd = new Date(selectedDeparture.endTime).getTime();
    const arrStart = new Date(selectedArrival.startTime).getTime();
    bufferMinutes = Math.round((arrStart - depEnd) / (60 * 1000));

    if (bufferMinutes < 0) {
      isBufferValid = false;
      bufferWarning = `Negativan buffer (${bufferMinutes} min): Dolazak počinje prije završetka spuštanja!`;
    } else if (bufferMinutes < 15) {
      bufferWarning = `Buffer je samo ${bufferMinutes} min. Preporučeni minimalni buffer za manipulaciju plovilom je 15 min.`;
    }
  }

  const linkMutation = trpc.landFlow.linkTurnaround.useMutation({
    onSuccess: () => {
      toast.success("Izmjena na suhom vezu je uspješno povezana i spremljena.");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Greška pri povezivanju izmjene: ${err.message}`);
    },
  });

  const handleSave = () => {
    if (!departureId || !arrivalId) {
      toast.error("Morate odabrati i spuštanje i vađenje.");
      return;
    }
    if (!targetSpotId) {
      toast.error("Morate odabrati mjesto na kopnu koje se preuzima.");
      return;
    }

    linkMutation.mutate({
      spotId: targetSpotId,
      releaseReservationId: departureId,
      arrivalReservationId: arrivalId,
      bufferMinutes: bufferMinutes > 0 ? bufferMinutes : 15,
      confirmImmediately: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="w-5 h-5 text-primary" />
            Povezivanje izmjene na vezu (Turnaround Link)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Povežite plovilo koje se spušta u more s plovilom koje se vadi na kopno na isto mjesto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Departure Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">1. Spuštanje u more (Oslobađa mjesto)</Label>
            <Select value={departureId} onValueChange={setDepartureId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Odaberite rezervaciju spuštanja..." />
              </SelectTrigger>
              <SelectContent>
                {departures.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    <span className="font-semibold">{d.time}</span> - {d.vesselName} - {d.craneName}{" "}
                    {d.spotCode ? `[Mjesto: ${d.spotCode}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Arrow visual */}
          <div className="flex items-center justify-center my-1 text-muted-foreground">
            <div className="h-px bg-border flex-1" />
            <span className="px-3 text-[11px] font-mono flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-primary" /> Izmjena plovila na istom mjestu
            </span>
            <div className="h-px bg-border flex-1" />
          </div>

          {/* Arrival Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">2. Vađenje na kopno (Preuzima mjesto)</Label>
            <Select value={arrivalId} onValueChange={setArrivalId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Odaberite rezervaciju vađenja..." />
              </SelectTrigger>
              <SelectContent>
                {arrivals.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <span className="font-semibold">{a.time}</span> - {a.vesselName} - {a.craneName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Spot Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Mjesto na suhom vezu koje se preuzima
              {selectedDeparture?.spotCode && ` (Trenutno: ${selectedDeparture.spotCode})`}
            </Label>
            <Select value={targetSpotId} onValueChange={setTargetSpotId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Odaberite točno mjesto na kopnu..." />
              </SelectTrigger>
              <SelectContent>
                {zoneSpotsData.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.code} - max {s.maxLengthM}m × {s.maxBeamM}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Buffer calculation banner */}
          {selectedDeparture && selectedArrival && (
            <div
              className={cn(
                "p-3 rounded-lg border text-xs space-y-1",
                !isBufferValid
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : bufferMinutes < 15
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              )}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Vremenski buffer između operacija:
                </span>
                <span className="text-sm font-bold font-mono">
                  {bufferMinutes >= 0 ? `+${bufferMinutes} min` : `${bufferMinutes} min`}
                </span>
              </div>
              <p className="text-[11px] opacity-90">
                Spuštanje završava:{" "}
                {new Date(selectedDeparture.endTime).toLocaleTimeString("hr-HR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ⟼ Vađenje počinje:{" "}
                {new Date(selectedArrival.startTime).toLocaleTimeString("hr-HR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {bufferWarning && (
                <div className="flex items-center gap-1 text-[11px] font-medium pt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{bufferWarning}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Interna napomena za dispečera</Label>
            <Textarea
              placeholder="npr. Plovilo A se spušta na vanjski vez, Plovilo B odmah na postolje..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Odustani
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={linkMutation.isPending || !departureId || !arrivalId || !targetSpotId}
            className="text-xs"
          >
            {linkMutation.isPending ? "Povezivanje..." : "Poveži i potvrdi izmjenu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
