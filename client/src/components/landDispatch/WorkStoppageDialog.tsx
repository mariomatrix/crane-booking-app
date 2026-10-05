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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Wind, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface WorkStoppageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateStr: string;
  cranes: Array<{ id: string; name: string }>;
  zones: Array<{ zoneId: string; zoneCode: string; zoneName: string }>;
  onSuccess?: () => void;
}

export function WorkStoppageDialog({
  open,
  onOpenChange,
  dateStr,
  cranes,
  zones,
  onSuccess,
}: WorkStoppageDialogProps) {
  const [scope, setScope] = useState<"all_cranes" | "single_crane" | "single_zone">("all_cranes");
  const [craneId, setCraneId] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("15:00");
  const [untilFurtherNotice, setUntilFurtherNotice] = useState<boolean>(false);
  const [reason, setReason] = useState<string>("Olujna bura / jak vjetar");
  const [note, setNote] = useState<string>("");

  const utils = trpc.useUtils();

  const createStoppageMutation = trpc.landDispatch.createWorkStoppage.useMutation({
    onSuccess: () => {
      toast.success("Obustava rada je uspješno evidentirana.");
      utils.landDispatch.getDailyOverview.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const startsAtIso = new Date(`${dateStr}T${startTime}:00Z`).toISOString();
    const endsAtIso = untilFurtherNotice
      ? null
      : new Date(`${dateStr}T${endTime}:00Z`).toISOString();

    createStoppageMutation.mutate({
      scope,
      craneId: scope === "single_crane" && craneId ? craneId : null,
      zoneId: scope === "single_zone" && zoneId ? zoneId : null,
      startsAtIso,
      endsAtIso,
      reason,
      note: note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Wind className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Izvanredna obustava rada</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Aktivirajte obustavu rada zbog vremenskih nepogoda (bura, jugo) ili tehničkih kvarova.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Opseg */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Opseg obustave</Label>
            <Select
              value={scope}
              onValueChange={(val: "all_cranes" | "single_crane" | "single_zone") => setScope(val)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Odaberite opseg" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_cranes">Sve dizalice (cijelu marinu)</SelectItem>
                <SelectItem value="single_crane">Pojedinačna dizalica</SelectItem>
                <SelectItem value="single_zone">Pojedinačna zona na kopnu</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "single_crane" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Dizalica</Label>
              <Select value={craneId} onValueChange={setCraneId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Odaberite dizalicu" />
                </SelectTrigger>
                <SelectContent>
                  {cranes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === "single_zone" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Zona</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
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
            </div>
          )}

          {/* Vrijeme trajanja */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Početak obustave</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Završetak</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9 text-xs"
                disabled={untilFurtherNotice}
                required={!untilFurtherNotice}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="untilFurtherNotice"
              checked={untilFurtherNotice}
              onChange={(e) => setUntilFurtherNotice(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary w-4 h-4 cursor-pointer"
            />
            <label htmlFor="untilFurtherNotice" className="text-xs text-muted-foreground cursor-pointer">
              Do daljnjega (bez zadanog završetka)
            </label>
          </div>

          {/* Razlog */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Razlog obustave</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="npr. Olujna bura, Kvar hidraulike..."
              className="h-9 text-xs"
              required
            />
          </div>

          {/* Napomena */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Dodatna napomena za dispečera</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Upute osoblju ili napomene o obavještavanju korisnika..."
              className="text-xs min-h-[60px]"
            />
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Aktivacija obustave automatski blokira zakazivanje novih operacija i označava pogođene termine u dispečerskom pregledu.
            </span>
          </div>

          <DialogFooter className="pt-2">
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
              variant="destructive"
              size="sm"
              disabled={createStoppageMutation.isPending}
            >
              {createStoppageMutation.isPending ? "Aktiviranje..." : "Aktiviraj obustavu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
