import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Compass,
  Star,
  Clock,
  Ban,
  Pencil,
  Loader2,
  Info,
  CheckCircle2,
  Sliders,
  Anchor,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AffinitiesConfigTab() {
  const [editingAffinity, setEditingAffinity] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Form states
  const [score, setScore] = useState<number>(50);
  const [extraMinutes, setExtraMinutes] = useState<number>(0);
  const [isPrimary, setIsPrimary] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: affinities = [], isLoading, refetch } = trpc.landFlow.getAffinities.useQuery();

  const upsertMutation = trpc.landFlow.upsertAffinity.useMutation({
    onSuccess: () => {
      toast.success("Pravilo afiniteta dizalice i zone je uspješno ažurirano.");
      utils.landFlow.getAffinities.invalidate();
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const handleEditClick = (aff: any) => {
    setEditingAffinity(aff);
    setScore(aff.affinityScore ?? 50);
    setExtraMinutes(aff.extraMinutesTransport ?? aff.extraTransportMinutes ?? 0);
    setIsPrimary(!!aff.isPrimary);
    setIsBlocked(!!aff.isBlocked);
    setNotes(aff.notes ?? "");
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!editingAffinity) return;

    upsertMutation.mutate({
      craneId: editingAffinity.craneId,
      zoneId: editingAffinity.zoneId,
      affinityScore: score,
      extraTransportMinutes: extraMinutes,
      isPrimary,
      isBlocked,
      notes: notes || undefined,
    });
  };

  // Group affinities by zone for quick visual breakdown
  const zonesMap = new Map<string, any[]>();
  affinities.forEach((aff) => {
    const list = zonesMap.get(aff.zoneName) || [];
    list.push(aff);
    zonesMap.set(aff.zoneName, list);
  });

  return (
    <div className="space-y-4">
      {/* Intro info banner */}
      <div className="p-3.5 rounded-xl border bg-muted/40 flex items-start gap-3 text-xs leading-relaxed">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Matrica afiniteta dizalica i kopnenih zona (Transport & Routing)
          </p>
          <p className="text-muted-foreground">
            Sustav koristi afinitete pri automatskom predlaganju mjesta na suhom vezu. Primarna dizalica
            ima prioritet za dodijeljenu zonu, a dodatne minute uračunavaju se u vrijeme transporta od bazena do veza.
            Svaka zona može imati <strong>najviše jednu primarnu dizalicu</strong>.
          </p>
        </div>
      </div>

      {/* Main Table */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              Matrica veza dizalica i zona ({affinities.length} pravila)
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-8 text-xs"
            >
              Osvježi
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs">Učitavanje pravila afiniteta...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Zona</TableHead>
                    <TableHead className="text-xs font-semibold">Dizalica</TableHead>
                    <TableHead className="text-xs font-semibold">Status / Uloga</TableHead>
                    <TableHead className="text-xs font-semibold">Afinitet (0-100)</TableHead>
                    <TableHead className="text-xs font-semibold">Transport buffer</TableHead>
                    <TableHead className="text-xs font-semibold">Interna napomena</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Akcija</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affinities.map((aff) => {
                    return (
                      <TableRow key={aff.id} className="text-xs hover:bg-muted/40">
                        {/* Zone */}
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium">
                            <Badge variant="outline" className="font-mono text-[10px] py-0">
                              {aff.zoneCode}
                            </Badge>
                            <span>{aff.zoneName}</span>
                          </div>
                        </TableCell>

                        {/* Crane */}
                        <TableCell>
                          <span className="font-semibold text-foreground">
                            {aff.craneName}
                          </span>
                        </TableCell>

                        {/* Role / Status */}
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {aff.isPrimary && (
                              <Badge className="text-[10px] py-0 bg-amber-500 text-white gap-1">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                Primarna dizalica
                              </Badge>
                            )}
                            {aff.isBlocked ? (
                              <Badge variant="destructive" className="text-[10px] py-0 gap-1">
                                <Ban className="w-2.5 h-2.5" />
                                Blokirano
                              </Badge>
                            ) : !aff.isPrimary && (
                              <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground">
                                Sekundarna
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Score */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  aff.affinityScore >= 80
                                    ? "bg-emerald-500"
                                    : aff.affinityScore >= 40
                                    ? "bg-amber-500"
                                    : "bg-muted-foreground"
                                )}
                                style={{ width: `${aff.affinityScore}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[11px]">
                              {aff.affinityScore}
                            </span>
                          </div>
                        </TableCell>

                        {/* Extra transport time */}
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground font-mono">
                            <Clock className="w-3 h-3 text-primary" />
                            <span>+{aff.extraTransportMinutes} min</span>
                          </div>
                        </TableCell>

                        {/* Notes */}
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-[11px]">
                          {aff.notes || "—"}
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2 gap-1"
                            onClick={() => handleEditClick(aff)}
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Uredi</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      {editingAffinity && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Uređivanje pravila afiniteta
              </DialogTitle>
              <DialogDescription className="text-xs">
                Dizalica: <strong>{editingAffinity.craneName}</strong> ⟷ Zona:{" "}
                <strong>{editingAffinity.zoneName} ({editingAffinity.zoneCode})</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Primary Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    Primarna dizalica za ovu zonu
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Ako označite, ova dizalica imat će prioritet za sve manipulacije u zoni.
                  </p>
                </div>
                <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
              </div>

              {/* Blocked Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-destructive">
                    <Ban className="w-3.5 h-3.5" />
                    Blokiraj operacije dizalice u ovoj zoni
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Zabrana rada dizalice u ovoj zoni zbog fizičkih/tehničkih barijera.
                  </p>
                </div>
                <Switch checked={isBlocked} onCheckedChange={setIsBlocked} />
              </div>

              {/* Score Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Bodovi afiniteta (0 - 100)</Label>
                  <span className="font-mono font-bold text-primary">{score}</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* Extra Transport Minutes */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Dodatne minute manipulacije i transporta
                  </Label>
                  <span className="font-mono font-bold text-primary">+{extraMinutes} min</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Interna napomena za dispečera</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="npr. Potreban poseban oprez pri skretanju kod lukobrana..."
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="text-xs"
              >
                Odustani
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={upsertMutation.isPending}
                className="text-xs"
              >
                {upsertMutation.isPending ? "Spremanje..." : "Spremi promjene"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
