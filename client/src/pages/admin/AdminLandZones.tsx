import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Anchor,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Ship,
  Info,
  Calendar,
  ListOrdered,
  ArrowRightLeft,
  Truck,
  Eye,
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatAppDate } from "@/lib/date-utils";
import { ZoneMoveDialog } from "@/components/landDispatch/ZoneMoveDialog";
import { TruckDeliveryToLandDialog } from "@/components/land/TruckDeliveryToLandDialog";
import { TruckDispatchFromLandDialog } from "@/components/land/TruckDispatchFromLandDialog";

type ZoneForm = {
  name: string;
  code: string;
  totalSpots: string;
  manualOccupiedSpots: string;
  description: string;
  sortOrder: string;
};

const emptyForm: ZoneForm = {
  name: "",
  code: "",
  totalSpots: "",
  manualOccupiedSpots: "0",
  description: "",
  sortOrder: "0",
};

export default function AdminLandZones() {
  const { lang } = useLang();
  const isHr = lang === "hr";
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneForm>(emptyForm);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "reserved" | "waiting">("active");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [truckDialogOpen, setTruckDialogOpen] = useState(false);
  const [moveVessel, setMoveVessel] = useState<{
    vesselId: string;
    vesselName: string;
    currentZoneId: string;
    currentZoneCode?: string;
  } | null>(null);
  const [selectedOccupancy, setSelectedOccupancy] = useState<any | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchSpot, setDispatchSpot] = useState<any | null>(null);

  // Admin occupancy edit state
  const [occEditOpen, setOccEditOpen] = useState(false);
  const [occEditLiftedAt, setOccEditLiftedAt] = useState("");
  const [occEditZoneId, setOccEditZoneId] = useState("");
  const [occEditSpotNumber, setOccEditSpotNumber] = useState("");
  const [occEditNote, setOccEditNote] = useState("");
  const [occEditReason, setOccEditReason] = useState("");

  const handleOpenDetail = (occ: any) => {
    setSelectedOccupancy(occ);
    setOccEditOpen(false);
    if (occ.liftedAt) {
      const d = new Date(occ.liftedAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setOccEditLiftedAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    } else {
      setOccEditLiftedAt("");
    }
    setOccEditZoneId(occ.zoneId || "");
    setOccEditSpotNumber(occ.spotNumber ? String(occ.spotNumber) : "");
    setOccEditNote(occ.note || "");
    setOccEditReason("");
    setDetailDialogOpen(true);
  };

  const handleOpenDispatch = (occ: any) => {
    const liftedDate = occ.liftedAt ? new Date(occ.liftedAt) : new Date();
    const daysOnLand = Math.max(1, Math.ceil((Date.now() - liftedDate.getTime()) / (1000 * 60 * 60 * 24)));
    const zoneCode = (occ.zone as any)?.code || zones.find(z => z.id === occ.zoneId)?.code || "";

    setDispatchSpot({
      occupancyId: occ.id,
      spotNumber: occ.spotNumber || "—",
      code: zoneCode,
      currentVesselName: occ.vessel?.name,
      currentVesselReg: occ.vessel?.registration,
      daysOnLand,
    });
    setDispatchDialogOpen(true);
  };

  const utils = trpc.useUtils();

  const adminUpdateOccupancyMutation = trpc.landOccupancy.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success("Zauzeće na suhom vezu je uspješno ažurirano.");
      setOccEditOpen(false);
      setDetailDialogOpen(false);
      utils.landOccupancy.listActive.invalidate();
      utils.landZone.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Greška pri ažuriranju zauzeća."),
  });

  const adminDeleteOccupancyMutation = trpc.landOccupancy.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("Zauzeće je uklonjeno sa suhog veza.");
      setDetailDialogOpen(false);
      utils.landOccupancy.listActive.invalidate();
      utils.landZone.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Greška pri uklanjanju zauzeća."),
  });

  const { data: zones = [], isLoading: zonesLoading } = trpc.landZone.list.useQuery();
  const { data: occupancies = [], isLoading: occupanciesLoading } = trpc.landOccupancy.listActive.useQuery(
    selectedZoneId ? { zoneId: selectedZoneId } : undefined
  );
  const { data: reservedVessels = [], isLoading: reservedVesselsLoading } = trpc.landZone.getUpcomingReservedVessels.useQuery(
    { zoneId: selectedZoneId! },
    { enabled: !!selectedZoneId && activeTab === "reserved" }
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
      manualOccupiedSpots: String(zone.manualOccupiedSpots || 0),
      description: zone.description || "",
      sortOrder: String(zone.sortOrder),
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.totalSpots) {
      toast.error(isHr ? "Naziv, kod i ukupno mjesta su obavezni." : "Name, code and total spots are required.");
      return;
    }
    const payload = {
      name: form.name,
      code: form.code,
      totalSpots: Number(form.totalSpots),
      manualOccupiedSpots: Number(form.manualOccupiedSpots || 0),
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
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            onClick={() => setTruckDialogOpen(true)}
            variant="outline"
            className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800 rounded-xl shadow-xs font-semibold"
          >
            <Truck className="h-4 w-4 mr-2 text-amber-600" />
            {isHr ? "Iskrcaj s kamiona" : "Truck Delivery (No Crane)"}
          </Button>
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
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{isHr ? "Stanje kapaciteta" : "Capacity state"}</span>
                      <span>{zone.totalSpots} {isHr ? "ukupno mjesta" : "total spots"}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[11px] font-medium text-center py-1.5 bg-muted/40 rounded-xl">
                      <div className="text-emerald-700 dark:text-emerald-400">
                        <span className="block text-[10px] text-muted-foreground">{isHr ? "Zauzeto" : "Occupied"}</span>
                        <span className="font-bold text-sm">{zone.activeSpots || 0}</span>
                      </div>
                      <div className="text-amber-700 dark:text-amber-400 border-x border-muted-foreground/20">
                        <span className="block text-[10px] text-muted-foreground">{isHr ? "Rezervirano" : "Reserved"}</span>
                        <span className="font-bold text-sm">{zone.reservedSpots || 0}</span>
                      </div>
                      <div className="text-blue-700 dark:text-blue-400">
                        <span className="block text-[10px] text-muted-foreground">{isHr ? "Slobodno" : "Available"}</span>
                        <span className="font-bold text-sm">{zone.availableSpots ?? Math.max(0, zone.totalSpots - (zone.activeSpots || 0) - (zone.reservedSpots || 0))}</span>
                      </div>
                    </div>

                    <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, ((zone.activeSpots || 0) / zone.totalSpots) * 100)}%` }}
                        title={`Zauzeto: ${zone.activeSpots}`}
                      />
                      <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${Math.min(100 - ((zone.activeSpots || 0) / zone.totalSpots) * 100, ((zone.reservedSpots || 0) / zone.totalSpots) * 100)}%` }}
                        title={`Rezervirano: ${zone.reservedSpots}`}
                      />
                    </div>

                    {zone.waitingCount > 0 && (
                      <div className="flex items-center justify-between text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 my-1">
                        <span className="flex items-center gap-1">📋 {isHr ? "Na listi čekanja:" : "Waitlist:"}</span>
                        <span>{zone.waitingCount} {isHr ? "plovila" : "vessels"}</span>
                      </div>
                    )}
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
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all mr-4 ${activeTab === "active" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                onClick={() => setActiveTab("active")}
              >
                {isHr ? "Aktivna plovila na kopnu" : "Active Vessels"} ({occupancies.length})
              </button>
              <button
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 mr-4 ${activeTab === "reserved" ? "border-amber-500 text-amber-700 font-bold" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                onClick={() => setActiveTab("reserved")}
              >
                {isHr ? "Rezervirana plovila (Nadolazeće operacije)" : "Reserved Vessels"}
                {activeZone.reservedSpots > 0 && (
                  <Badge className="bg-amber-500 text-white border-0 py-0 px-1 text-[9px] h-4">
                    {activeZone.reservedSpots}
                  </Badge>
                )}
              </button>
              <button
                className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${activeTab === "waiting" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                onClick={() => setActiveTab("waiting")}
              >
                {isHr ? "Lista čekanja za suhi vez" : "Waiting List"}
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
                      <TableHead>{isHr ? "Trajanje boravka" : "Stay Duration"}</TableHead>
                      <TableHead className="text-right">{isHr ? "Akcije" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occupancies.map((occ) => {
                      const liftedDate = occ.liftedAt ? new Date(occ.liftedAt) : new Date();
                      const daysOnLand = Math.max(1, Math.ceil((Date.now() - liftedDate.getTime()) / (1000 * 60 * 60 * 24)));
                      const isMember = ((occ.user as any)?.clientCategory || "member") === "member";
                      const isOverLimit = isMember && daysOnLand > 30;
                      const isTruckDelivery = !(occ as any).reservationId || !!(occ as any).note?.toLowerCase().includes("kamion");

                      return (
                        <TableRow
                          key={occ.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors group"
                          onClick={() => handleOpenDetail(occ)}
                        >
                          <TableCell className="font-semibold flex items-center gap-2">
                            <Ship className="h-4 w-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="group-hover:text-primary transition-colors underline-offset-2 group-hover:underline">
                              {occ.vessel.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-normal">
                              ({occ.vessel.lengthM}m × {occ.vessel.beamM}m)
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="secondary">{occ.vessel.registration || (isHr ? "Bez registracije" : "No reg.")}</Badge>
                              {isTruckDelivery && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300">
                                  🚚 {isHr ? "Iskrcaj s kamiona" : "Truck delivery"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium text-xs">{occ.user.name || occ.user.email}</div>
                              <span className="text-[10px] text-muted-foreground">
                                {isMember ? "Stalni član" : "Privremeni korisnik"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{occ.spotNumber || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatAppDate(occ.liftedAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isTruckDelivery ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 font-bold text-[11px]">
                                  ⏱️ {daysOnLand} {daysOnLand === 1 ? "dan" : "dana"} na kopnu
                                </Badge>
                                <div className="text-[10px] text-muted-foreground">
                                  {isHr ? "Informativno (do spuštanja/otpreme)" : "Informative (until departure)"}
                                </div>
                              </div>
                            ) : isMember ? (
                              isOverLimit ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 font-bold text-[11px]">
                                  ⚠️ {daysOnLand} dana (+{daysOnLand - 30} d doplata)
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 font-semibold text-[11px]">
                                  ✓ {daysOnLand} / 30 dana (Uključeno)
                                </Badge>
                              )
                            ) : (
                              <Badge className="bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 font-bold text-[11px]">
                                💰 {daysOnLand} dana ({(daysOnLand * 15).toFixed(2)} €)
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-lg text-primary hover:bg-primary/10 text-xs font-semibold gap-1 h-8 px-2"
                                title={isHr ? "Prikaži detalje zapisa" : "View record details"}
                                onClick={() => handleOpenDetail(occ)}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {isHr ? "Detalji" : "Details"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-950/40 text-xs font-semibold gap-1 h-8 px-2"
                                title={isHr ? "Otprema plovila kamionom (odvoz iz lučice)" : "Dispatch by truck"}
                                onClick={() => handleOpenDispatch(occ)}
                              >
                                <Truck className="w-3.5 h-3.5" />
                                {isHr ? "Kamion" : "Truck"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg text-primary border-primary/20 hover:bg-primary/5 text-xs font-semibold gap-1 h-8 px-2"
                                onClick={() => {
                                  setMoveVessel({
                                    vesselId: occ.vessel.id,
                                    vesselName: occ.vessel.name,
                                    currentZoneId: occ.zoneId || selectedZoneId || "",
                                    currentZoneCode: (occ.zone as any)?.code,
                                  });
                                  setMoveDialogOpen(true);
                                }}
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                {isHr ? "Promijeni zonu" : "Change Zone"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950/40 text-xs font-semibold gap-1 h-8 px-2"
                                onClick={() => {
                                  if (confirm(isHr ? "Potvrdite spuštanje plovila u more?" : "Confirm vessel launch?")) {
                                    launchMutation.mutate({ id: occ.id });
                                  }
                                }}
                              >
                                <Anchor className="w-3.5 h-3.5" />
                                {isHr ? "Spusti u more" : "Launch"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )
            ) : activeTab === "reserved" ? (
              reservedVesselsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : reservedVessels.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {isHr ? "Nema nadolazećih rezerviranih plovila za ovu zonu." : "No upcoming reserved vessels for this zone."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isHr ? "Zakazano vađenje" : "Scheduled Lift"}</TableHead>
                      <TableHead>{isHr ? "Plovilo / Registracija" : "Vessel / Reg"}</TableHead>
                      <TableHead>{isHr ? "Vlasnik" : "Owner"}</TableHead>
                      <TableHead>{isHr ? "Vrsta operacije" : "Operation"}</TableHead>
                      <TableHead>{isHr ? "Broj rezervacije" : "Reservation No."}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservedVessels.map((res: any) => (
                      <TableRow key={res.reservationId}>
                        <TableCell className="font-semibold text-xs">
                          <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {res.scheduledStart ? formatAppDate(res.scheduledStart) : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-xs">
                          {res.vesselName || res.vesselRegistration || "—"}
                          {res.vesselRegistration && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {res.vesselRegistration}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{res.userName || res.userEmail}</TableCell>
                        <TableCell className="text-xs">
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                            {res.serviceTypeName || "Vađenje iz mora"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{res.reservationNumber}</TableCell>
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
                <Label>{isHr ? "Ukupno mjesta (Kapacitet)" : "Total spots (Capacity)"} *</Label>
                <Input type="number" min="1" value={form.totalSpots} onChange={e => setForm({ ...form, totalSpots: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>{isHr ? "Ručno zauzeta mjesta" : "Manually occupied"}</Label>
                <Input type="number" min="0" value={form.manualOccupiedSpots} onChange={e => setForm({ ...form, manualOccupiedSpots: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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

      <TruckDeliveryToLandDialog
        open={truckDialogOpen}
        onOpenChange={setTruckDialogOpen}
        defaultZoneId={selectedZoneId}
      />

      <ZoneMoveDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        vessel={moveVessel}
        zones={zones.map((z) => ({ id: z.id, code: z.code, name: z.name, totalSpots: z.totalSpots }))}
        onSuccess={() => {
          utils.landOccupancy.listActive.invalidate();
          utils.landZone.list.invalidate();
        }}
      />

      {/* Detail Dialog for Active Occupancy */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOccupancy && (() => {
            const liftedDate = selectedOccupancy.liftedAt ? new Date(selectedOccupancy.liftedAt) : new Date();
            const daysOnLand = Math.max(1, Math.ceil((Date.now() - liftedDate.getTime()) / (1000 * 60 * 60 * 24)));
            const isMember = ((selectedOccupancy.user as any)?.clientCategory || "member") === "member";
            const isOverLimit = isMember && daysOnLand > 30;
            const isTruckDelivery = !selectedOccupancy.reservationId || !!selectedOccupancy.note?.toLowerCase().includes("kamion");
            const zoneName = (selectedOccupancy.zone as any)?.name || zones.find(z => z.id === selectedOccupancy.zoneId)?.name || "—";
            const zoneCode = (selectedOccupancy.zone as any)?.code || zones.find(z => z.id === selectedOccupancy.zoneId)?.code || "—";

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between gap-2 pr-6">
                    <DialogTitle className="flex items-center gap-2 text-base font-bold">
                      <Ship className="w-5 h-5 text-primary" />
                      {selectedOccupancy.vessel.name}
                    </DialogTitle>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {selectedOccupancy.vessel.registration || (isHr ? "Bez registracije" : "No reg.")}
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs">
                    {isHr ? "Detaljni pregled zapisa o plovilu na suhom vezu" : "Detailed view of dry berth occupancy record"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2 text-xs">
                  {/* Plovilo i tehnički podaci */}
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <span className="font-bold flex items-center gap-1.5 text-primary">
                      <Ship className="w-3.5 h-3.5" />
                      {isHr ? "Tehnički podaci o plovilu" : "Vessel Specifications"}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Naziv:" : "Name:"}</span>
                        <span className="font-semibold text-foreground">{selectedOccupancy.vessel.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Registracija:" : "Registration:"}</span>
                        <span className="font-semibold text-foreground">{selectedOccupancy.vessel.registration || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Dimenzije (D × Š):" : "Dimensions (L × W):"}</span>
                        <span className="font-semibold text-foreground">{selectedOccupancy.vessel.lengthM}m × {selectedOccupancy.vessel.beamM}m</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Gaz / Težina:" : "Draft / Weight:"}</span>
                        <span className="font-semibold text-foreground">
                          {selectedOccupancy.vessel.draftM ? `${selectedOccupancy.vessel.draftM}m` : "—"} / {selectedOccupancy.vessel.weightTons ? `${selectedOccupancy.vessel.weightTons}t` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vlasnik / Korisnik */}
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <span className="font-bold flex items-center gap-1.5 text-primary">
                      <User className="w-3.5 h-3.5" />
                      {isHr ? "Vlasnik / Korisnik" : "Owner / Client"}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Ime i prezime:" : "Name:"}</span>
                        <span className="font-semibold text-foreground">{selectedOccupancy.user.name || selectedOccupancy.user.email}</span>
                        <Badge variant="outline" className="mt-1 text-[10px] block w-fit">
                          {isMember ? (isHr ? "Stalni član" : "Member") : (isHr ? "Privremeni korisnik" : "Commercial")}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Telefon:" : "Phone:"}</span>
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          {selectedOccupancy.user.phone || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Email:" : "Email:"}</span>
                        <span className="font-semibold text-foreground flex items-center gap-1 break-all">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          {selectedOccupancy.user.email || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lokacija na kopnu i boravak */}
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <span className="font-bold flex items-center gap-1.5 text-primary">
                      <MapPin className="w-3.5 h-3.5" />
                      {isHr ? "Lokacija na kopnu i boravak" : "Land Location & Stay"}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Zona:" : "Zone:"}</span>
                        <span className="font-semibold text-foreground">{zoneName} ({zoneCode})</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Mjesto br.:" : "Spot No.:"}</span>
                        <span className="font-semibold text-foreground">{selectedOccupancy.spotNumber || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Datum podizanja:" : "Lifted Date:"}</span>
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {formatAppDate(selectedOccupancy.liftedAt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">{isHr ? "Provedeno na kopnu:" : "Days on Land:"}</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysOnLand} {daysOnLand === 1 ? "dan" : "dana"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground mr-1">{isHr ? "Status tarife:" : "Tariff status:"}</span>
                        {isTruckDelivery ? (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300">
                            🚚 {isHr ? "Iskrcano s kamiona (obračun ležarine po danu)" : "Truck delivery"}
                          </Badge>
                        ) : isMember ? (
                          isOverLimit ? (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 font-bold">
                              ⚠️ {daysOnLand} dana (+{daysOnLand - 30} d doplata)
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 font-semibold">
                              ✓ {daysOnLand} / 30 dana (Uključeno u godišnju članarinu)
                            </Badge>
                          )
                        ) : (
                          <Badge className="bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 font-bold">
                            💰 {(daysOnLand * 15).toFixed(2)} € ({daysOnLand} dana × 15 €)
                          </Badge>
                        )}
                      </div>
                      {selectedOccupancy.reservationId && (
                        <div className="text-[11px] text-muted-foreground">
                          {isHr ? "Povezana rezervacija:" : "Linked reservation:"}{" "}
                          <span className="font-mono font-medium text-foreground">
                            {selectedOccupancy.reservationId.slice(0, 8)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Napomene i zabilješke (npr. iz uvoza Excela) */}
                  <div className="space-y-1.5">
                    <span className="font-bold flex items-center gap-1.5 text-muted-foreground text-xs">
                      <FileText className="w-3.5 h-3.5" />
                      {isHr ? "Zabilješke i podaci iz evidencije (npr. Excel uvoz / nalog):" : "Notes & import record:"}
                    </span>
                    {selectedOccupancy.note ? (
                      <div className="p-3 rounded-lg border bg-muted/40 text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">
                        {selectedOccupancy.note}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border bg-muted/10 text-xs text-muted-foreground italic">
                        {isHr ? "Nema dodatnih zabilješki za ovaj zapis." : "No additional notes for this record."}
                      </div>
                    )}
                  </div>

                  {/* Admin: Inline edit liftedAt / zone / spotNumber / note */}
                  {isAdmin && occEditOpen && (
                    <div className="p-3 rounded-lg border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                      <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                        Administratorski ispravak zauzeća
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">Datum podizanja (liftedAt)</Label>
                          <Input
                            type="date"
                            value={occEditLiftedAt}
                            onChange={(e) => setOccEditLiftedAt(e.target.value)}
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">Zona</Label>
                          <select
                            value={occEditZoneId}
                            onChange={(e) => setOccEditZoneId(e.target.value)}
                            className="w-full h-8 rounded-md border bg-white px-2 text-xs"
                          >
                            {zones.map((z: any) => (
                              <option key={z.id} value={z.id}>
                                {z.name} ({z.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">Mjesto br.</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Opcionalno"
                            value={occEditSpotNumber}
                            onChange={(e) => setOccEditSpotNumber(e.target.value)}
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">Napomena</Label>
                        <Textarea
                          value={occEditNote}
                          onChange={(e) => setOccEditNote(e.target.value)}
                          rows={2}
                          className="text-xs bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-amber-900">Razlog ispravka *</Label>
                        <Input
                          value={occEditReason}
                          onChange={(e) => setOccEditReason(e.target.value)}
                          placeholder="Npr. Ispravak godine iz Excel uvoza (09.12.2025.)"
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setOccEditOpen(false)}
                        >
                          Odustani
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                          disabled={adminUpdateOccupancyMutation.isPending || occEditReason.trim().length < 3}
                          onClick={() => {
                            adminUpdateOccupancyMutation.mutate({
                              id: selectedOccupancy.id,
                              liftedAt: occEditLiftedAt ? new Date(`${occEditLiftedAt}T08:00:00`) : undefined,
                              zoneId: occEditZoneId || undefined,
                              spotNumber: occEditSpotNumber ? Number(occEditSpotNumber) : null,
                              note: occEditNote,
                              reason: occEditReason.trim(),
                            });
                          }}
                        >
                          {adminUpdateOccupancyMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          Spremi ispravak
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t">
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-amber-700 border-amber-300 hover:bg-amber-50 text-xs font-semibold gap-1.5"
                          onClick={() => setOccEditOpen((v) => !v)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {isHr ? "Uredi datum / zauzeće" : "Edit Occupancy"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-rose-700 border-rose-300 hover:bg-rose-50 text-xs font-semibold gap-1.5"
                          disabled={adminDeleteOccupancyMutation.isPending}
                          onClick={() => {
                            const reason = window.prompt("Unesite razlog uklanjanja pogrešnog zauzeća:");
                            if (reason && reason.trim().length >= 3) {
                              adminDeleteOccupancyMutation.mutate({
                                id: selectedOccupancy.id,
                                reason: reason.trim(),
                              });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isHr ? "Ukloni zauzeće" : "Delete"}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-950/40 text-xs font-semibold gap-1.5"
                      onClick={() => {
                        setDetailDialogOpen(false);
                        handleOpenDispatch(selectedOccupancy);
                      }}
                    >
                      <Truck className="w-3.5 h-3.5" />
                      {isHr ? "Otpremi kamionom (Odvoz)" : "Dispatch by Truck"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-primary border-primary/20 hover:bg-primary/5 text-xs font-semibold gap-1.5"
                      onClick={() => {
                        setDetailDialogOpen(false);
                        setMoveVessel({
                          vesselId: selectedOccupancy.vessel.id,
                          vesselName: selectedOccupancy.vessel.name,
                          currentZoneId: selectedOccupancy.zoneId || selectedZoneId || "",
                          currentZoneCode: (selectedOccupancy.zone as any)?.code,
                        });
                        setMoveDialogOpen(true);
                      }}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      {isHr ? "Promijeni zonu" : "Change Zone"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950/40 text-xs font-semibold gap-1.5"
                      onClick={() => {
                        if (confirm(isHr ? "Potvrdite spuštanje plovila u more?" : "Confirm vessel launch?")) {
                          setDetailDialogOpen(false);
                          launchMutation.mutate({ id: selectedOccupancy.id });
                        }
                      }}
                    >
                      <Anchor className="w-3.5 h-3.5" />
                      {isHr ? "Spusti u more" : "Launch"}
                    </Button>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setDetailDialogOpen(false)}>
                    {isHr ? "Zatvori" : "Close"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Truck Dispatch Dialog */}
      <TruckDispatchFromLandDialog
        open={dispatchDialogOpen}
        onOpenChange={setDispatchDialogOpen}
        spot={dispatchSpot}
        onSuccess={() => {
          utils.landOccupancy.listActive.invalidate();
          utils.landZone.list.invalidate();
        }}
      />
    </div>
  );
}
