import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sliders, Check, Users, Save, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function AffinitySettingsTab() {
  const { data: matrix = [], isLoading, refetch } = trpc.landDispatch.getAffinitiesMatrix.useQuery();

  const updateMutation = trpc.landDispatch.updateAffinity.useMutation({
    onSuccess: () => {
      toast.success("Postavka afiniteta uspješno spremljena!");
      refetch();
    },
    onError: (err) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Postavke resursa i afiniteta</h2>
          <p className="text-xs text-muted-foreground">
            Matrica afiniteta dizalica i zona te ograničenja istovremenog rada timova.
          </p>
        </div>
      </div>

      {/* Global Team Limit Card */}
      <Card className="rounded-2xl border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold">Model timova — Kapacitet istovremenog rada</CardTitle>
              <p className="text-xs text-muted-foreground">
                Zadani broj istovremeno aktivnih dizalica u jednom 30-minutnom slotu.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex items-center justify-between max-w-sm p-3 rounded-xl bg-muted/30 border">
            <div>
              <span className="text-xs font-bold text-foreground block">Maksimalno timova (posada):</span>
              <span className="text-[11px] text-muted-foreground">Zadana vrijednost u sustavu = 2</span>
            </div>
            <Badge variant="outline" className="text-sm font-bold px-3 py-1 bg-background text-primary border-primary/30">
              2 tima
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table */}
      <Card className="rounded-2xl border bg-card overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">Matrica afiniteta dizalica i kopnenih zona</CardTitle>
          <p className="text-xs text-muted-foreground">
            Bodovi afiniteta (0–100) određuju preporuku sustava. Kazneni slotovi smanjuju prioritet udaljenijih zona.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-left border-y text-muted-foreground">
                  <th className="p-3 font-semibold">Dizalica</th>
                  <th className="p-3 font-semibold">Zona</th>
                  <th className="p-3 font-semibold">Bodovi afiniteta (0-100)</th>
                  <th className="p-3 font-semibold">Kazneni slotovi</th>
                  <th className="p-3 font-semibold">Primarna dizalica</th>
                  <th className="p-3 font-semibold">Dopušten pristup</th>
                  <th className="p-3 font-semibold text-right">Akcija</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Učitavanje matrice...
                    </td>
                  </tr>
                ) : matrix.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Nema definiranih veza.
                    </td>
                  </tr>
                ) : (
                  matrix.map((row) => (
                    <MatrixRowItem
                      key={`${row.craneId}-${row.zoneId}`}
                      row={row}
                      onSave={(val) => updateMutation.mutate(val)}
                      isSaving={updateMutation.isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MatrixRowItem({
  row,
  onSave,
  isSaving,
}: {
  row: any;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [score, setScore] = useState(row.affinityScore || 50);
  const [penalty, setPenalty] = useState(row.penaltySlots || 0);
  const [isPrimary, setIsPrimary] = useState(row.isPrimary || false);
  const [isAllowed, setIsAllowed] = useState(row.isAllowed !== false && !row.isBlocked);

  const handleSave = () => {
    onSave({
      craneId: row.craneId,
      zoneId: row.zoneId,
      affinityScore: Number(score),
      penaltySlots: Number(penalty),
      isPrimary,
      isAllowed,
      isBlocked: !isAllowed,
      notes: row.notes,
    });
  };

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="p-3 font-bold text-foreground">{row.craneName}</td>
      <td className="p-3 font-medium text-primary">
        {row.zoneCode} — {row.zoneName}
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2 max-w-[120px]">
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="h-7 text-xs w-16"
          />
          <span className="text-[11px] text-muted-foreground">/100</span>
        </div>
      </td>
      <td className="p-3">
        <Input
          type="number"
          min={0}
          max={5}
          value={penalty}
          onChange={(e) => setPenalty(Number(e.target.value))}
          className="h-7 text-xs w-14"
        />
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
          />
          <span className="text-[11px] text-muted-foreground">{isPrimary ? "Da" : "Ne"}</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isAllowed}
            onChange={(e) => setIsAllowed(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-600 cursor-pointer"
          />
          <span className={`text-[11px] font-medium ${isAllowed ? "text-emerald-600" : "text-rose-500"}`}>
            {isAllowed ? "Dopušteno" : "Zabranjeno"}
          </span>
        </div>
      </td>
      <td className="p-3 text-right">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isSaving}
          className="h-7 text-xs gap-1"
        >
          <Save className="w-3 h-3" />
          <span>Spremi</span>
        </Button>
      </td>
    </tr>
  );
}
