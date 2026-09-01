import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Construction, Loader2, MapPin, Pencil, Plus, Trash2, Activity, Clock, Ship, CheckCircle2, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

type CraneForm = {
  name: string;
  maxCapacityKN: string;
  maxPoolWidth: string;
  description: string;
  location: string;
};

const emptyForm: CraneForm = {
  name: "",
  maxCapacityKN: "",
  maxPoolWidth: "",
  description: "",
  location: "",
};

export default function AdminCranes() {
  const { t } = useLang();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CraneForm>(emptyForm);

  // Crane Profile Dialog State
  const [profileCraneId, setProfileCraneId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: cranesList = [], isLoading } = trpc.crane.list.useQuery({ activeOnly: false });

  // Fetch crane profile & operation logs
  const { data: craneProfile, isLoading: isLoadingProfile } = trpc.crane.getProfile.useQuery(
    { id: profileCraneId! },
    { enabled: !!profileCraneId }
  );

  const createMutation = trpc.crane.create.useMutation({
    onSuccess: () => {
      toast.success("Dizalica je uspješno dodana.");
      utils.crane.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.crane.update.useMutation({
    onSuccess: () => {
      toast.success("Dizalica je uspješno ažurirana.");
      utils.crane.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.crane.delete.useMutation({
    onSuccess: () => {
      toast.success("Dizalica je deaktivirana.");
      utils.crane.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (crane: (typeof cranesList)[0]) => {
    setEditingId(crane.id);
    setForm({
      name: crane.name,
      maxCapacityKN: String(crane.maxCapacityKN),
      maxPoolWidth: crane.maxPoolWidth ?? "",
      description: crane.description ?? "",
      location: crane.location ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.maxCapacityKN) {
      toast.error("Naziv i kapacitet su obavezni.");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        maxCapacityKN: Number(form.maxCapacityKN),
        maxPoolWidth: form.maxPoolWidth || undefined,
        description: form.description || undefined,
        location: form.location || undefined,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        maxCapacityKN: Number(form.maxCapacityKN),
        maxPoolWidth: form.maxPoolWidth || undefined,
        description: form.description || undefined,
        location: form.location || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t.admin.craneFleet}</h2>
          <p className="text-sm text-muted-foreground">
            Upravljanje dizalicama, evidencija radnih sati i dnevnik operacija.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/95 text-white rounded-xl shadow-xs">
          <Plus className="h-4 w-4 mr-2" />
          {t.admin.addCrane}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cranesList.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Construction className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t.admin.noCranesYet}</h3>
            <p className="text-muted-foreground mb-4">
              {t.admin.addFirstCrane}
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t.admin.addCrane}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cranesList.map((crane) => (
            <Card key={crane.id} className={`rounded-2xl shadow-sm transition hover:shadow-md ${crane.craneStatus !== "active" ? "opacity-60" : ""}`}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-slate-900">{crane.name}</span>
                      {crane.craneStatus === "active" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                          Aktivan
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {t.admin.inactive}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-slate-700">Maks. kapacitet: {crane.maxCapacityKN} kN</span>
                      {crane.maxPoolWidth && (
                        <span className="ml-2 pl-2 border-l">Širina bazena: {crane.maxPoolWidth} m</span>
                      )}
                    </div>
                    {crane.location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {crane.location}
                      </div>
                    )}
                    {crane.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
                        {crane.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold"
                      onClick={() => setProfileCraneId(crane.id)}
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" />
                      Dnevnik & Statistika
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openEdit(crane)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Uredi
                    </Button>
                    {crane.craneStatus === "active" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Deaktiviraj
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.admin.deactivateCraneTitle}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.admin.deactivateCraneDesc}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.admin.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: crane.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t.admin.deactivate}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Crane Profile & Operation Log Dialog */}
      {profileCraneId && (
        <Dialog open={!!profileCraneId} onOpenChange={() => setProfileCraneId(null)}>
          <DialogContent className="max-w-3xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-600" />
                <DialogTitle className="text-lg font-bold">
                  Profil & Dnevnik rada: {craneProfile?.crane?.name || "Dizalica"}
                </DialogTitle>
              </div>
            </DialogHeader>

            {isLoadingProfile ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : craneProfile ? (
              <div className="space-y-5 py-2">
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-indigo-50 border border-indigo-100 p-3.5 rounded-2xl">
                    <div className="text-[11px] font-bold uppercase text-indigo-900 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-indigo-600" />
                      Radni sati
                    </div>
                    <div className="text-2xl font-black text-indigo-950 mt-1">
                      {craneProfile.stats.totalHours} <span className="text-xs font-normal">sati</span>
                    </div>
                    <div className="text-[10px] text-indigo-700 mt-0.5">
                      ({craneProfile.stats.totalMinutes} min rada)
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                    <div className="text-[11px] font-bold uppercase text-slate-600 flex items-center gap-1">
                      <History className="h-3.5 w-3.5 text-slate-500" />
                      Ukupno operacija
                    </div>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {craneProfile.stats.totalOperations}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Završenih naloga</div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 p-3.5 rounded-2xl">
                    <div className="text-[11px] font-bold uppercase text-emerald-900 flex items-center gap-1">
                      <Ship className="h-3.5 w-3.5 text-emerald-600" />
                      Vađenja iz mora
                    </div>
                    <div className="text-2xl font-black text-emerald-950 mt-1">
                      {craneProfile.stats.totalLifts}
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">Na suhi vez</div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl">
                    <div className="text-[11px] font-bold uppercase text-blue-900 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                      Spuštanja u more
                    </div>
                    <div className="text-2xl font-black text-blue-950 mt-1">
                      {craneProfile.stats.totalLowers}
                    </div>
                    <div className="text-[10px] text-blue-700 mt-0.5">U more</div>
                  </div>
                </div>

                {/* Operations History Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Kronološki Dnevnik Rada Dizalice
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="text-xs">Vrijeme</TableHead>
                          <TableHead className="text-xs">Operacija</TableHead>
                          <TableHead className="text-xs">Plovilo</TableHead>
                          <TableHead className="text-xs">Operater</TableHead>
                          <TableHead className="text-xs">Trajanje</TableHead>
                          <TableHead className="text-xs">Napomena</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {craneProfile.recentLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground italic">
                              Nema zabilježenih operacija za ovu dizalicu.
                            </TableCell>
                          </TableRow>
                        ) : (
                          craneProfile.recentLogs.map((log: any) => (
                            <TableRow key={log.id} className="text-xs">
                              <TableCell className="font-medium whitespace-nowrap">
                                {new Date(log.startTime).toLocaleDateString("hr-HR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </TableCell>
                              <TableCell>
                                <Badge className={
                                  log.operationType === "lift" || log.operationType === "lift_from_sea"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    : log.operationType === "lower" || log.operationType === "lower_to_sea"
                                    ? "bg-blue-100 text-blue-800 border-blue-200"
                                    : "bg-slate-100 text-slate-700"
                                }>
                                  {log.operationType === "lift" || log.operationType === "lift_from_sea" ? "Vađenje" : log.operationType === "lower" || log.operationType === "lower_to_sea" ? "Spuštanje" : log.operationType}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-semibold">
                                {log.vesselRegistration ? `[${log.vesselRegistration}] ` : ""}{log.vesselName || "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {log.operatorName || "Operater"}
                              </TableCell>
                              <TableCell className="font-bold">
                                {log.durationMinutes} min
                              </TableCell>
                              <TableCell className="text-muted-foreground italic max-w-[150px] truncate">
                                {log.note || "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setProfileCraneId(null)} className="rounded-xl">
                Zatvori
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create/Edit Crane Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t.admin.editCrane : t.admin.addCrane}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t.admin.craneName} *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="npr. Dizalica A - Travel Lift 500kN"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.admin.craneCapacity} *</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.maxCapacityKN}
                  onChange={(e) => setForm({ ...form, maxCapacityKN: e.target.value })}
                  placeholder="npr. 500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t.admin.cranePoolWidth}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.maxPoolWidth}
                  onChange={(e) => setForm({ ...form, maxPoolWidth: e.target.value })}
                  placeholder="npr. 8.5"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.admin.craneLocation}</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="npr. Bazen 1 - Operativna obala sjever"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.craneDescription}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opis tehničkih specifikacija dizalice..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t.admin.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? t.admin.saveChanges : t.admin.addCrane}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
