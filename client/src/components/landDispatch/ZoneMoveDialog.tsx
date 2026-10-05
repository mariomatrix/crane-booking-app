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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ZoneMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: {
    vesselId: string;
    vesselName: string;
    currentZoneId: string;
    currentZoneCode?: string;
  } | null;
  zones: Array<{ id: string; code: string; name: string; totalSpots?: number }>;
  onSuccess?: () => void;
}

export function ZoneMoveDialog({
  open,
  onOpenChange,
  vessel,
  zones,
  onSuccess,
}: ZoneMoveDialogProps) {
  const [newZoneId, setNewZoneId] = useState<string>("");
  const [reason, setReason] = useState<string>("Kopneno premještanje kolicima/traktorom");

  const utils = trpc.useUtils();

  React.useEffect(() => {
    if (vessel) {
      const otherZone = zones.find((z) => z.id !== vessel.currentZoneId);
      setNewZoneId(otherZone ? otherZone.id : "");
      setReason("Kopneno premještanje kolicima/traktorom");
    }
  }, [vessel, zones]);

  const moveMutation = trpc.landDispatch.changeLandZone.useMutation({
    onSuccess: (data) => {
      toast.success(`Plovilo premješteno u zonu ${data.zoneCode}.`);
      utils.landDispatch.getDailyOverview.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  if (!vessel) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneId) {
      toast.error("Odaberite ciljnu zonu");
      return;
    }

    moveMutation.mutate({
      vesselId: vessel.vesselId,
      newZoneId,
      reason,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Promijeni zonu na kopnu</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Kopneno premještanje plovila bez angažmana dizalice (traktor/kolica).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plovilo:</span>
              <span className="font-semibold text-foreground">{vessel.vesselName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trenutna zona:</span>
              <span className="font-semibold text-primary">{vessel.currentZoneCode || "Nepoznato"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nova odredišna zona</Label>
            <Select value={newZoneId} onValueChange={setNewZoneId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Odaberite zonu" />
              </SelectTrigger>
              <SelectContent>
                {zones
                  .filter((z) => z.id !== vessel.currentZoneId)
                  .map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.code} — {z.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Razlog premještanja</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="npr. Oslobađanje prolaza, radovi..."
              className="h-9 text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Odustani
            </Button>
            <Button type="submit" size="sm" disabled={moveMutation.isPending}>
              {moveMutation.isPending ? "Premještanje..." : "Potvrdi premještaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
