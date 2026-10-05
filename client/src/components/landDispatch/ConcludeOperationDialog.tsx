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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, Anchor, FileCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DispatchReservationItem } from "../../../../server/landDispatch/types";

interface ConcludeOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: DispatchReservationItem | null;
  zones: Array<{ zoneId: string; zoneCode: string; zoneName: string }>;
  onSuccess?: () => void;
}

export function ConcludeOperationDialog({
  open,
  onOpenChange,
  operation,
  zones,
  onSuccess,
}: ConcludeOperationDialogProps) {
  const [status, setStatus] = useState<"completed" | "not_performed">("completed");
  const [actualZoneId, setActualZoneId] = useState<string>("");
  const [notPerformedReason, setNotPerformedReason] = useState<string>("Korisnik se nije pojavio");
  const [notes, setNotes] = useState<string>("");

  const utils = trpc.useUtils();

  React.useEffect(() => {
    if (operation) {
      setStatus("completed");
      setActualZoneId(operation.landZoneId || zones[0]?.zoneId || "");
      setNotPerformedReason("Korisnik se nije pojavio");
      setNotes("");
    }
  }, [operation, zones]);

  const concludeMutation = trpc.landDispatch.concludeOperation.useMutation({
    onSuccess: () => {
      toast.success(
        status === "completed"
          ? "Operacija i radni nalog su uspješno zaključeni!"
          : "Operacija je označena kao neizvedena."
      );
      utils.landDispatch.getDailyOverview.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  if (!operation) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    concludeMutation.mutate({
      reservationId: operation.id,
      status,
      actualZoneId: status === "completed" ? actualZoneId : undefined,
      notPerformedReason: status === "not_performed" ? notPerformedReason : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Zaključenje operacije</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Zaključite operaciju na kraju dana i automatski ažurirajte stanje na kopnu i radni nalog.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Operation info */}
        <div className="p-3 rounded-xl bg-muted/40 border text-xs space-y-1 mt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plovilo:</span>
            <span className="font-semibold text-foreground">{operation.vesselName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Korisnik:</span>
            <span className="font-semibold text-foreground">{operation.userName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vrsta operacije:</span>
            <span className="font-semibold text-foreground">
              {operation.operationCategory === "lift_from_sea" ? "↑ Podizanje na kopno" : "↓ Spuštanje u more"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dizalica & Termin:</span>
            <span className="font-semibold text-foreground">
              {operation.craneName} ({new Date(operation.scheduledStart).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })} – {new Date(operation.scheduledEnd).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })})
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Status selector buttons */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Ishod operacije</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("completed")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  status === "completed"
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                Odrađeno (Zaključi)
              </button>
              <button
                type="button"
                onClick={() => setStatus("not_performed")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  status === "not_performed"
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <XCircle className="w-4 h-4" />
                Nije izvedeno
              </button>
            </div>
          </div>

          {status === "completed" && operation.operationCategory === "lift_from_sea" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Potvrda stvarne zone na kopnu</Label>
              <Select value={actualZoneId} onValueChange={setActualZoneId}>
                <SelectTrigger className="h-9 text-xs">
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
              <p className="text-[11px] text-muted-foreground">
                Ako je plovilo smješteno u drugu zonu od planirane, ovdje odaberite stvarnu zonu.
              </p>
            </div>
          )}

          {status === "not_performed" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Razlog neizvođenja</Label>
              <Select value={notPerformedReason} onValueChange={setNotPerformedReason}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Odaberite razlog" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Korisnik se nije pojavio">Korisnik se nije pojavio</SelectItem>
                  <SelectItem value="Vremenske nepogode / bura">Vremenske nepogode / bura</SelectItem>
                  <SelectItem value="Tehnički problem na plovilu">Tehnički problem na plovilu</SelectItem>
                  <SelectItem value="Kvar dizalice">Kvar dizalice</SelectItem>
                  <SelectItem value="Odgođeno na zahtjev korisnika">Odgođeno na zahtjev korisnika</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Napomena (opcionalno)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interna zabilješka dispečera..."
              className="text-xs min-h-[60px]"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Odustani
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={concludeMutation.isPending}
              className={status === "not_performed" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
            >
              {concludeMutation.isPending
                ? "Spremanje..."
                : status === "completed"
                ? "Potvrdi i zaključi"
                : "Spremi kao neizvedeno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
