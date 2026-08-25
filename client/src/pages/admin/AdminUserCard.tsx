import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ReservationChat } from "@/components/ReservationChat";
import { AdminReservationForm } from "@/components/AdminReservationForm";
import {
    Loader2, ArrowLeft, CalendarDays, Mail, Phone, Shield, Clock,
    CheckCircle2, XCircle, Hourglass, Ban, Anchor, MessageSquare, Ship,
    Plus, Trash2, Edit2, AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";

const STAT_CARDS = [
    { key: "total", label: "Ukupno", icon: CalendarDays, color: "text-foreground" },
    { key: "pending", label: "Na čekanju", icon: Hourglass, color: "text-amber-500" },
    { key: "approved", label: "Odobreno", icon: CheckCircle2, color: "text-blue-500" },
    { key: "completed", label: "Izvršeno", icon: CheckCircle2, color: "text-green-600" },
    { key: "rejected", label: "Odbijeno", icon: XCircle, color: "text-red-500" },
    { key: "cancelled", label: "Otkazano", icon: Ban, color: "text-gray-500" },
];

export default function AdminUserCard() {
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const { lang } = useLang();
    const [chatResId, setChatResId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [isCreateResOpen, setIsCreateResOpen] = useState(false);

    const { data, isLoading } = trpc.user.getCard.useQuery(
        { userId: id },
        { enabled: !!id }
    );

    const { data: userCardData } = trpc.userCard.getCard.useQuery(
        { userId: id },
        { enabled: !!id }
    );

    const utils = trpc.useUtils();

    const completeMutation = trpc.reservation.complete.useMutation({
        onSuccess: () => {
            utils.user.getCard.invalidate();
        },
    });

    const [showVesselDialog, setShowVesselDialog] = useState(false);
    const [editingVessel, setEditingVessel] = useState<any>(null);
    const [vesselForm, setVesselForm] = useState({
        name: "",
        type: "jedrilica" as "jedrilica" | "motorni" | "katamaran" | "ostalo",
        registration: "",
        lengthM: "",
        beamM: "",
        draftM: "",
        weightTons: "",
    });

    const createVesselMutation = trpc.vessel.create.useMutation({
        onSuccess: () => {
            toast.success("Plovilo je uspješno dodano.");
            setShowVesselDialog(false);
            utils.user.getCard.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri spremanju plovila.");
        }
    });

    const updateVesselMutation = trpc.vessel.update.useMutation({
        onSuccess: () => {
            toast.success("Plovilo je uspješno ažurirano.");
            setShowVesselDialog(false);
            utils.user.getCard.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri ažuriranju plovila.");
        }
    });

    const deleteVesselMutation = trpc.vessel.delete.useMutation({
        onSuccess: () => {
            toast.success("Plovilo je uspješno obrisano.");
            utils.user.getCard.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri brisanju plovila.");
        }
    });

    const openAddVessel = () => {
        setEditingVessel(null);
        setVesselForm({
            name: "",
            type: "jedrilica",
            registration: "",
            lengthM: "",
            beamM: "",
            draftM: "",
            weightTons: "",
        });
        setShowVesselDialog(true);
    };

    const openEditVessel = (vessel: any) => {
        setEditingVessel(vessel);
        setVesselForm({
            name: vessel.name || "",
            type: (vessel.type || "ostalo") as any,
            registration: vessel.registration || "",
            lengthM: vessel.lengthM ? String(vessel.lengthM) : "",
            beamM: vessel.beamM ? String(vessel.beamM) : "",
            draftM: vessel.draftM ? String(vessel.draftM) : "",
            weightTons: vessel.weightTons ? String(vessel.weightTons) : "",
        });
        setShowVesselDialog(true);
    };

    const handleSaveVessel = () => {
        if (!vesselForm.name.trim()) {
            toast.error("Naziv plovila je obavezan.");
            return;
        }

        const payload = {
            name: vesselForm.name.trim(),
            type: vesselForm.type,
            registration: vesselForm.registration.trim() || undefined,
            lengthM: vesselForm.lengthM ? Number(vesselForm.lengthM) : undefined,
            beamM: vesselForm.beamM ? Number(vesselForm.beamM) : undefined,
            draftM: vesselForm.draftM ? Number(vesselForm.draftM) : undefined,
            weightTons: vesselForm.weightTons ? Number(vesselForm.weightTons) : undefined,
        };

        if (editingVessel) {
            updateVesselMutation.mutate({
                id: editingVessel.id,
                ...payload,
            });
        } else {
            createVesselMutation.mutate({
                ownerId: id,
                ...payload,
            });
        }
    };

    const handleDeleteVessel = (vesselId: string) => {
        if (confirm("Jeste li sigurni da želite obrisati ovo plovilo?")) {
            deleteVesselMutation.mutate({ id: vesselId });
        }
    };

    if (isLoading || !data) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { user, stats, reservations, vessels } = data;
    const filteredReservations = statusFilter === "all"
        ? reservations
        : reservations.filter((r: any) => r.status === statusFilter);

    return (
        <div className="space-y-6">
            {/* Back button + Header */}
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/users")}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold">{user.name || `${user.firstName} ${user.lastName}`}</h2>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />{user.email}
                        </span>
                        {user.phone && (
                            <span className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5" />{user.phone}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" />
                            <Badge variant="secondary">{user.role}</Badge>
                        </span>
                        <span className="flex items-center gap-1.5">
                            {((user as any).clientCategory || userCardData?.user?.clientCategory) === "commercial" ? (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300">
                                    💼 Komercijalni korisnik
                                </Badge>
                            ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    ⚓ Član društva
                                </Badge>
                            )}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            Registriran: {user.createdAt ? new Date(user.createdAt).toLocaleDateString("hr-HR") : "—"}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => setIsCreateResOpen(true)} className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Nova rezervacija
                    </Button>
                    <Button variant="outline" onClick={() => setLocation(`/admin/calendar?userId=${user.id}`)}>
                        <CalendarDays className="h-4 w-4 mr-2" />Kalendar
                    </Button>
                </div>
            </div>

            {/* Statutarni Semafor Prava (za članove društva) */}
            {((user as any).clientCategory || userCardData?.user?.clientCategory || "member") === "member" && userCardData?.rights && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-l-4 border-l-emerald-500 bg-emerald-500/5">
                        <CardHeader className="p-4 pb-2">
                            <CardDescription className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                Statutarno pravo: Vađenje iz mora
                            </CardDescription>
                            <CardTitle className="text-lg font-bold flex items-center justify-between">
                                {userCardData.rights.liftAvailable ? (
                                    <span className="text-emerald-600 flex items-center gap-1.5 text-base">
                                        <CheckCircle2 className="h-5 w-5" /> Raspoloživo (1/1)
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground text-sm">Iskorišteno</span>
                                )}
                                <span className="text-xs font-normal text-muted-foreground">
                                    Vrijedi do {new Date(userCardData.rights.liftExpiresAt).toLocaleDateString("hr-HR")}
                                </span>
                            </CardTitle>
                        </CardHeader>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500 bg-emerald-500/5">
                        <CardHeader className="p-4 pb-2">
                            <CardDescription className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                Statutarno pravo: Spuštanje u more
                            </CardDescription>
                            <CardTitle className="text-lg font-bold flex items-center justify-between">
                                {userCardData.rights.lowerAvailable ? (
                                    <span className="text-emerald-600 flex items-center gap-1.5 text-base">
                                        <CheckCircle2 className="h-5 w-5" /> Raspoloživo (1/1)
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground text-sm">Iskorišteno</span>
                                )}
                                <span className="text-xs font-normal text-muted-foreground">
                                    Vrijedi do {new Date(userCardData.rights.lowerExpiresAt).toLocaleDateString("hr-HR")}
                                </span>
                            </CardTitle>
                        </CardHeader>
                    </Card>

                    <Card className={`border-l-4 ${userCardData.rights.pendingFeeAdjustmentsCount > 0 ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-muted'}`}>
                        <CardHeader className="p-4 pb-2">
                            <CardDescription className="text-xs font-semibold">
                                Zaduženje za sljedeću godinu
                            </CardDescription>
                            <CardTitle className="text-lg font-bold flex items-center justify-between">
                                {userCardData.rights.pendingFeeAdjustmentsCount > 0 ? (
                                    <span className="text-amber-600 flex items-center gap-1.5 text-base">
                                        <AlertCircle className="h-5 w-5" /> {userCardData.rights.pendingFeeAdjustmentsCount} stavka zaduženja
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground text-sm font-normal">Nema zaduženja</span>
                                )}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                </div>
            )}

            {/* Komercijalni status banner */}
            {((user as any).clientCategory || userCardData?.user?.clientCategory) === "commercial" && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-700 dark:text-amber-300 font-bold text-lg">
                            💼
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-200">Komercijalni / Vanjski klijent</h4>
                            <p className="text-xs text-muted-foreground">Korisnik nema pravo na besplatne dizaličke operacije kroz članarinu. Svaka dizalička operacija automatski se obračunava i naplaćuje prema komercijalnom cjeniku u radnom nalogu.</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Kronološki Karton Radnji i Zaduženja */}
            {userCardData?.entries && userCardData.entries.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Anchor className="h-4 w-4 text-primary" />
                            Karton radnji i zaduženja korisnika ({userCardData.entries.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead>Datum radnje</TableHead>
                                    <TableHead>Vrsta evidencije</TableHead>
                                    <TableHead>Naziv operacije / Stavka cjenika</TableHead>
                                    <TableHead>Plovilo</TableHead>
                                    <TableHead>Napomena / Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {userCardData.entries.map((entry: any) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="text-xs font-medium">
                                            {new Date(entry.eventDate).toLocaleDateString("hr-HR")}
                                        </TableCell>
                                        <TableCell>
                                            {entry.entryType === "statutory_quota_used" ? (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-xs">
                                                    Statutarna kvota (0 €)
                                                </Badge>
                                            ) : entry.entryType === "fee_adjustment_charge" ? (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">
                                                    Doplata članarine ({entry.serviceItemCode})
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30 text-xs">
                                                    Komercijalni račun
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-semibold text-xs">
                                            {entry.serviceItemName}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {entry.vesselRegistration || "—"}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {entry.description || "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
                    <Card
                        key={key}
                        className={`cursor-pointer transition hover:shadow-md ${statusFilter === key ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${color}`} />
                            <div>
                                <p className="text-2xl font-bold">{(stats as any)[key]}</p>
                                <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Reservations Table */}
            <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Rezervacije ({filteredReservations.length})
                        {statusFilter !== "all" && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setStatusFilter("all")}>
                                Prikaži sve
                            </Button>
                        )}
                    </CardTitle>
                    <Button size="sm" onClick={() => setIsCreateResOpen(true)} className="flex items-center gap-1.5 h-8">
                        <Plus className="h-4 w-4" />
                        Nova rezervacija
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredReservations.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">Nema rezervacija.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Datum</TableHead>
                                    <TableHead>Operacija</TableHead>
                                    <TableHead>Mjesto na kopnu</TableHead>
                                    <TableHead>Plovilo</TableHead>
                                    <TableHead>Dizalica</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Akcije</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReservations.map((r: any) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-medium text-xs">
                                            {formatAppDate(r.scheduledDate, lang as any, true)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold">{r.serviceTypeName || "Operacija"}</span>
                                                {r.serviceTypeCategory && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {r.serviceTypeCategory === "lift_from_sea" ? "Vađenje iz mora" :
                                                         r.serviceTypeCategory === "lower_to_sea" ? "Spuštanje u more" :
                                                         r.serviceTypeCategory === "move" ? "Premještanje" :
                                                         r.serviceTypeCategory === "maintenance" ? "Održavanje" : "Ostalo"}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {r.landZoneCode || r.landZoneName ? (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[11px] font-semibold whitespace-nowrap">
                                                    {r.landZoneCode ? `${r.landZoneName || "Kopno"} (${r.landZoneCode})` : r.landZoneName}
                                                </Badge>
                                            ) : r.serviceTypeCategory === "lift_from_sea" ? (
                                                <span className="text-xs text-amber-600 font-medium italic">Nije dodijeljeno</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold">{r.vesselRegistration || "—"}</span>
                                                {r.vesselName && r.vesselName !== r.vesselRegistration && (
                                                    <span className="text-[10px] text-muted-foreground">{r.vesselName}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{r.craneName || "—"}</TableCell>
                                        <TableCell><StatusBadge status={r.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                {r.status === "approved" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={() => completeMutation.mutate({ id: r.id })}
                                                        disabled={
                                                            completeMutation.isPending ||
                                                            (() => {
                                                                const dt = r.scheduledDate || r.scheduledStart || r.requestedDate;
                                                                if (!dt) return false;
                                                                const target = new Date(dt);
                                                                const now = new Date();
                                                                const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                                                                return target.getTime() > endOfToday.getTime();
                                                            })()
                                                        }
                                                        title={
                                                            (() => {
                                                                const dt = r.scheduledDate || r.scheduledStart || r.requestedDate;
                                                                if (!dt) return "";
                                                                const target = new Date(dt);
                                                                const now = new Date();
                                                                const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                                                                return target.getTime() > endOfToday.getTime()
                                                                    ? "Završavanje je moguće tek na dan termina ili nakon njega."
                                                                    : "Označi rezervaciju kao izvršenu.";
                                                            })()
                                                        }
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />Završi
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs"
                                                    onClick={() => setChatResId(r.id)}
                                                >
                                                    <MessageSquare className="h-3 w-3 mr-1" />Poruke
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Vessels */}
            <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Ship className="h-4 w-4" />Plovila ({vessels.length})
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={openAddVessel} className="flex items-center gap-1.5 h-8">
                        <Plus className="h-4 w-4" />Dodaj plovilo
                    </Button>
                </CardHeader>
                <CardContent className={vessels.length === 0 ? "p-6 text-center text-muted-foreground text-sm" : "p-0"}>
                    {vessels.length === 0 ? (
                        "Korisnik nema prijavljenih plovila."
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Naziv</TableHead>
                                    <TableHead>Tip</TableHead>
                                    <TableHead>Dužina</TableHead>
                                    <TableHead>Registracija</TableHead>
                                    <TableHead className="text-right">Akcije</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(vessels as any[]).map((v: any) => (
                                    <TableRow key={v.id}>
                                        <TableCell className="font-medium">{v.name}</TableCell>
                                        <TableCell>{v.type}</TableCell>
                                        <TableCell>{v.lengthM ? `${Number(v.lengthM).toFixed(1)} m` : "—"}</TableCell>
                                        <TableCell>{v.registration || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button size="sm" variant="ghost" onClick={() => openEditVessel(v)} className="h-7 w-7 p-0">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0" onClick={() => handleDeleteVessel(v.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create Reservation Dialog */}
            <Dialog open={isCreateResOpen} onOpenChange={setIsCreateResOpen}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Nova rezervacija</DialogTitle>
                        <DialogDescription>
                            Kreirajte novu rezervaciju za člana {user.name || `${user.firstName} ${user.lastName}`}.
                        </DialogDescription>
                    </DialogHeader>
                    <AdminReservationForm
                        initialData={{
                            userId: user.id,
                            userObj: user,
                            contactPhone: user.phone || "",
                        }}
                        onSuccess={() => {
                            setIsCreateResOpen(false);
                            utils.user.getCard.invalidate();
                            utils.userCard.getCard.invalidate();
                        }}
                        onCancel={() => setIsCreateResOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Chat Modal */}
            <Dialog open={!!chatResId} onOpenChange={(open) => !open && setChatResId(null)}>
                <DialogContent className="max-w-lg p-0">
                    <DialogHeader className="p-4 pb-0">
                        <DialogTitle>Poruke</DialogTitle>
                        <DialogDescription>Razgovarajte s korisnikom u vezi ove rezervacije.</DialogDescription>
                    </DialogHeader>
                    {chatResId && <ReservationChat reservationId={chatResId} pollInterval={15000} />}
                </DialogContent>
            </Dialog>

            {/* Vessel Modal */}
            <Dialog open={showVesselDialog} onOpenChange={setShowVesselDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingVessel ? "Uredi plovilo" : "Dodaj plovilo"}</DialogTitle>
                        <DialogDescription>
                            {editingVessel ? "Uredite podatke o plovilu." : "Unesite podatke o novom plovilu."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="vessel-name">Naziv plovila *</Label>
                            <Input
                                id="vessel-name"
                                value={vesselForm.name}
                                onChange={(e) => setVesselForm({ ...vesselForm, name: e.target.value })}
                                placeholder="npr. Stella Maris"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="vessel-type">Tip plovila</Label>
                            <Select
                                value={vesselForm.type}
                                onValueChange={(val: any) => setVesselForm({ ...vesselForm, type: val })}
                            >
                                <SelectTrigger id="vessel-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="jedrilica">Jedrilica</SelectItem>
                                    <SelectItem value="motorni">Motorni brod</SelectItem>
                                    <SelectItem value="katamaran">Katamaran</SelectItem>
                                    <SelectItem value="ostalo">Ostalo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="vessel-registration">Registarska oznaka</Label>
                            <Input
                                id="vessel-registration"
                                value={vesselForm.registration}
                                onChange={(e) => setVesselForm({ ...vesselForm, registration: e.target.value })}
                                placeholder="npr. ST-1234"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2">
                                <Label htmlFor="vessel-length">Dužina (m)</Label>
                                <Input
                                    id="vessel-length"
                                    type="number"
                                    step="0.01"
                                    value={vesselForm.lengthM}
                                    onChange={(e) => setVesselForm({ ...vesselForm, lengthM: e.target.value })}
                                    placeholder="npr. 8.5"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="vessel-beam">Širina (m)</Label>
                                <Input
                                    id="vessel-beam"
                                    type="number"
                                    step="0.01"
                                    value={vesselForm.beamM}
                                    onChange={(e) => setVesselForm({ ...vesselForm, beamM: e.target.value })}
                                    placeholder="npr. 2.8"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="vessel-weight">Težina (t)</Label>
                                <Input
                                    id="vessel-weight"
                                    type="number"
                                    step="0.01"
                                    value={vesselForm.weightTons}
                                    onChange={(e) => setVesselForm({ ...vesselForm, weightTons: e.target.value })}
                                    placeholder="npr. 3.5"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVesselDialog(false)}>
                            Odustani
                        </Button>
                        <Button 
                            onClick={handleSaveVessel}
                            disabled={createVesselMutation.isPending || updateVesselMutation.isPending}
                        >
                            {(createVesselMutation.isPending || updateVesselMutation.isPending) && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Spremi
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
