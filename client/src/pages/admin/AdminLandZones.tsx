import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Anchor, Loader2, Pencil, Plus, Trash2, Ship, Info, Calendar, ListOrdered } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";

type ZoneForm = {
  name: string;
  code: string;
  totalSpots: string;
  description: string;
  sortOrder: string;
};

const emptyForm: ZoneForm = {
  name: "",
  code: "",
  totalSpots: "",
  description: "",
  sortOrder: "0",
};

export default function AdminLandZones() {
  const { lang } = useLang();
  const isHr = lang === "hr";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneForm>(emptyForm);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "waiting">("active");

  const utils = trpc.useUtils();

  const { data: zones = [], isLoading: zonesLoading } = trpc.landZone.list.useQuery();
  const { data: occupancies = [], isLoading: occupanciesLoading } = trpc.landOccupancy.listActive.useQuery(
    selectedZoneId ? { zoneId: selectedZoneId } : undefined
  );
  const { data: zoneWaiting = [], isLoading: zoneWaitingLoading } = trpc.landWaiting.listByZone.useQuery(
    { zoneId: selectedZoneId! },
    { enabled: !!selectedZoneId && activeTab === "waiting" }
  );

  const createMutation = trpc.landZone.create.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Kopnena zona je uspješno dodana." : "Land zone successfully added.");
      utils.landZone.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.landZone.update.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Kopnena zona je uspješno ažurirana." : "Land zone successfully updated.");
      utils.landZone.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.landZone.delete.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Kopnena zona je deaktivirana." : "Land zone deactivated.");
      utils.landZone.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const launchMutation = trpc.landOccupancy.complete.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Plovilo je uspješno vraćeno u more (boravak završen)." : "Vessel successfully launched.");
      utils.landOccupancy.listActive.invalidate();
      utils.landZone.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (zone: any) => {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      code: zone.code,
      totalSpots: String(zone.totalSpots),
      description: zone.description || "",
      sortOrder: String(zone.sortOrder),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.totalSpots) {
      toast.error(isHr ? "Naziv, kod i broj mjesta su obavezni." : "Name, code and capacity are required.");
      return;
    }
    const payload = {
      name: form.name,
      code: form.code,
      totalSpots: Number(form.totalSpots),
      description: form.description || undefined,
      sortOrder: Number(form.sortOrder),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activeZone = zones.find(z => z.id === selectedZoneId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isHr ? "Mjesta na kopnu (Suhi vez)" : "Dry Berths"}</h2>
          <p className="text-sm text-muted-foreground">
            {isHr ? "Upravljajte zonama na kopnu i pratite aktivna plovila na suhom vezu." : "Manage dry berth zones and track vessels currently stored on land."}
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/95 text-white rounded-xl shadow-md">
          <Plus className="h-4 w-4 mr-2" />
          {isHr ? "Dodaj zonu" : "Add Zone"}
        </Button>
      </div>

      {zonesLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.filter(z => z.isActive).map((zone) => {
            const utilization = zone.totalSpots > 0 ? (zone.activeSpots / zone.totalSpots) * 100 : 0;
            const isSelected = selectedZoneId === zone.id;

            return (
              <Card
                key={zone.id}
                className={`relative overflow-hidden cursor-pointer border transition-all hover:shadow-md rounded-2xl ${isSelected ? "border-primary ring-1 ring-primary" : "border-muted"
                  }`}
                onClick={() => setSelectedZoneId(zone.id === selectedZoneId ? null : zone.id)}
              >
                <div className="absolute top-0 right-0 p-3 flex gap-1 z-10" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent" onClick={() => openEdit(zone)}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => {
                    if (confirm(isHr ? "Deaktivirati ovu zonu?" : "Deactivate this zone?")) deleteMutation.mutate({ id: zone.id });
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-semibold text-xs py-0.5 px-2 bg-primary/10 border-primary/20 text-primary">
                      {zone.code}
                    </Badge>
                    <CardTitle className="text-lg font-bold">{zone.name}</CardTitle>
                  </div>
                  <CardDescription className="line-clamp-2 text-xs pt-1">{zone.description || (isHr ? "Nema opisa" : "No description")}</CardDescription>
                </CardHeader>

                <CardContent className="pt-0 pb-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{isHr ? "Popunjenost" : "Occupancy"}</span>
                      <span>{zone.activeSpots} / {zone.totalSpots} {isHr ? "mjesta" : "spots"}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${utilization >= 90 ? "bg-red-500" : utilization >= 70 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                        style={{ width: `${Math.min(100, utilization)}%` }}
                      />
                    </div>
                    {zone.waitingCount > 0 && (
                      <div className="flex items-center justify-between text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-900/40 my-1">
                        <span className="flex items-center gap-1">📋 {isHr ? "Na listi čekanja:" : "Waitlist:"}</span>
                        <span>{zone.waitingCount} {isHr ? "plovila" : "vessels"}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground text-right italic">
                      {isHr ? `Redoslijed: ${zone.sortOrder}` : `Sort Order: ${zone.sortOrder}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedZoneId && activeZone && (
        <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-0">
            <div className="flex items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg font-bold">
                  {activeZone.name} ({activeZone.code})
                </CardTitle>
                <CardDescription>
                  {activeZone.description || (isHr ? "Nema opisa" : "No description")}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex border-t border-muted pt-1 mt-1">
              <button
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all mr-4 ${
                  activeTab === "active" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("active")}
              >
                {isHr ? "Aktivna plovila" : "Active Vessels"} ({occupancies.length})
              </button>
              <button
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "waiting" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab("waiting")}
              >
                {isHr ? "Lista čekanja" : "Waiting List"}
                {activeZone.waitingCount > 0 && (
                  <Badge className="bg-amber-600 hover:bg-amber-600 text-white border-0 py-0 px-1 text-[9px] h-4">
                    {activeZone.waitingCount}
                  </Badge>
                )}
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activeTab === "active" ? (
              occupanciesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : occupancies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Ship className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {isHr ? "Nema aktivnih plovila u ovoj zoni." : "No active vessels in this zone."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isHr ? "Plovilo" : "Vessel"}</TableHead>
                      <TableHead>{isHr ? "Registracija" : "Registration"}</TableHead>
                      <TableHead>{isHr ? "Vlasnik" : "Owner"}</TableHead>
                      <TableHead>{isHr ? "Mjesto br." : "Spot No."}</TableHead>
                      <TableHead>{isHr ? "Podignut" : "Lifted At"}</TableHead>
                      <TableHead className="text-right">{isHr ? "Akcija" : "Action"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occupancies.map((occ) => (
                      <TableRow key={occ.id}>
                        <TableCell className="font-semibold flex items-center gap-2">
                          <Ship className="h-4 w-4 text-primary" />
                          {occ.vessel.name}
                          <span className="text-xs text-muted-foreground font-normal">
                            ({occ.vessel.lengthM}m × {occ.vessel.beamM}m)
                          </span>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{occ.vessel.registration}</Badge></TableCell>
                        <TableCell>{occ.user.name || occ.user.email}</TableCell>
                        <TableCell className="font-medium">{occ.spotNumber || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatAppDate(occ.liftedAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => {
                              if (confirm(isHr ? "Potvrdite spuštanje plovila u more?" : "Confirm vessel launch?")) {
                                launchMutation.mutate({ id: occ.id });
                              }
                            }}
                          >
                            {isHr ? "Spusti u more" : "Launch"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              zoneWaitingLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : zoneWaiting.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ListOrdered className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {isHr ? "Nema klijenata na listi čekanja za ovu zonu." : "No waitlist entries for this zone."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>{isHr ? "Korisnik" : "User"}</TableHead>
                      <TableHead>{isHr ? "Plovilo" : "Vessel"}</TableHead>
                      <TableHead>{isHr ? "Status" : "Status"}</TableHead>
                      <TableHead>{isHr ? "Dodano" : "Added At"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zoneWaiting.map((entry, idx) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-semibold text-center text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-sm">{entry.user.name || "Korisnik"}</div>
                          <div className="text-xs text-muted-foreground">{entry.user.email}</div>
                        </TableCell>
                        <TableCell>
                          {entry.vessel ? (
                            <div>
                              <div className="font-medium text-xs">{entry.vessel.name}</div>
                              <Badge variant="secondary" className="text-[10px] py-0 px-1">{entry.vessel.registration}</Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.status === "waiting" && <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{isHr ? "Čeka" : "Waiting"}</Badge>}
                          {entry.status === "offered" && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">{isHr ? "Ponuda poslana" : "Offered"}</Badge>}
                          {entry.status === "declined" && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{isHr ? "Odbio" : "Declined"}</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatAppDate(entry.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingId ? (isHr ? "Uredi kopnenu zonu" : "Edit Land Zone") : (isHr ? "Dodaj kopnenu zonu" : "Add Land Zone")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>{isHr ? "Naziv" : "Name"} *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>{isHr ? "Kod" : "Code"} *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="npr. A1" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isHr ? "Ukupno mjesta" : "Total spots"} *</Label>
                <Input type="number" value={form.totalSpots} onChange={e => setForm({ ...form, totalSpots: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>{isHr ? "Poredak sortiranja" : "Sort order"}</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{isHr ? "Opis" : "Description"}</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Spremi" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
