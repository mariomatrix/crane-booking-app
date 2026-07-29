import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { formatToSqlDate } from "@/lib/date-utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Send, UserPlus, XCircle } from "lucide-react";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { cn } from "@/lib/utils";

interface AdminReservationFormProps {
    initialData?: {
        landWaitingId?: string;
        userId?: string;
        vesselId?: string;
        landZoneId?: string;
        requestedDate?: Date;
        craneId?: string;
        serviceTypeId?: string;
        scheduledTime?: string;
        durationMin?: string;
        adminNote?: string;
    };
    onSuccess?: () => void;
    onCancel?: () => void;
    onRejectWaitlist?: () => void;
    isRejectPending?: boolean;
    submitButtonText?: string;
}

export function AdminReservationForm({
    initialData,
    onSuccess,
    onCancel,
    onRejectWaitlist,
    isRejectPending,
    submitButtonText
}: AdminReservationFormProps) {
    const { t, lang } = useLang();

    // ── Form state ───────────────────────────────────────────────────────
    const [userId, setUserId] = useState(initialData?.userId || "");
    const [serviceTypeId, setServiceTypeId] = useState(initialData?.serviceTypeId || "");
    const [requestedDate, setRequestedDate] = useState<Date | undefined>(initialData?.requestedDate || new Date());
    const [scheduledTime, setScheduledTime] = useState(initialData?.scheduledTime || "08:00");
    const [durationMin, setDurationMin] = useState<string>(initialData?.durationMin || "30");
    const [craneId, setCraneId] = useState(initialData?.craneId || "");
    const [userNote, setUserNote] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
    const [landZoneId, setLandZoneId] = useState(initialData?.landZoneId || "");
    const [overrideCapacityCheck, setOverrideCapacityCheck] = useState(false);
    const [isWaitlisted, setIsWaitlisted] = useState(false);
    const [adminNote, setAdminNote] = useState(initialData?.adminNote || "");

    useEffect(() => {
        if (initialData) {
            if (initialData.userId) setUserId(initialData.userId);
            if (initialData.landZoneId) setLandZoneId(initialData.landZoneId);
            if (initialData.serviceTypeId) setServiceTypeId(initialData.serviceTypeId);
            if (initialData.craneId) setCraneId(initialData.craneId);
            if (initialData.requestedDate) setRequestedDate(initialData.requestedDate);
            if (initialData.scheduledTime) setScheduledTime(initialData.scheduledTime);
            if (initialData.durationMin) setDurationMin(initialData.durationMin);
            if (initialData.adminNote) setAdminNote(initialData.adminNote);
        }
    }, [initialData]);

    const utils = trpc.useUtils();

    // Vessel state
    const [selectedVesselId, setSelectedVesselId] = useState<string>(initialData?.vesselId || "new");
    const [saveToProfile, setSaveToProfile] = useState(true);
    const [vesselType, setVesselType] = useState("jedrilica");
    const [vesselLength, setVesselLength] = useState("");
    const [vesselWidth, setVesselWidth] = useState("");
    const [vesselDraft, setVesselDraft] = useState("");
    const [vesselWeight, setVesselWeight] = useState("");
    const [vesselRegistration, setVesselRegistration] = useState("");

    // ── Queries ──────────────────────────────────────────────────────────
    const { data: serviceTypes = [], isLoading: serviceTypesLoading } =
        trpc.serviceType.list.useQuery({ onlyActive: true });

    const selectedServiceType = (serviceTypes as any[]).find(st => st.id === serviceTypeId);
    const isLiftFromSea = selectedServiceType?.operationCategory === "lift_from_sea";
    const isLowerToSea = selectedServiceType?.operationCategory === "lower_to_sea";

    const { data: landZones = [] } = trpc.landZone.list.useQuery();

    const { data: zoneCapacity } = trpc.landZone.checkCapacity.useQuery(
        { zoneId: landZoneId },
        { enabled: !!landZoneId && landZoneId !== "none" && isLiftFromSea }
    );

    const { data: activeOccupancy } = trpc.landZone.getActiveOccupancy.useQuery(
        { vesselId: selectedVesselId },
        { enabled: !!selectedVesselId && selectedVesselId !== "new" && isLowerToSea }
    );


    const usersQuery = trpc.user.list.useQuery({ pageSize: 1000 });
    const usersList = usersQuery.data?.data || [];
    const { data: cranes = [] } = trpc.crane.list.useQuery();

    const { data: userVessels = [], isLoading: userVesselsLoading } =
        trpc.vessel.listByUser.useQuery({ userId }, { enabled: !!userId });

    // Handle user changes / auto-selection
    const [lastLoadedUserId, setLastLoadedUserId] = useState("");
    if (userId !== lastLoadedUserId) {
        setLastLoadedUserId(userId);
        if (!initialData?.vesselId) {
            setSelectedVesselId("new");
            setVesselType("jedrilica");
            setVesselLength("");
            setVesselWidth("");
            setVesselDraft("");
            setVesselWeight("");
            setVesselRegistration("");
        }
    }

    if (userVessels.length > 0 && selectedVesselId === "new" && !vesselRegistration && !userVesselsLoading && !initialData?.vesselId) {
        const v = userVessels[0];
        setSelectedVesselId(v.id);
        setVesselType(v.type || "jedrilica");
        setVesselLength(v.lengthM ? String(v.lengthM) : "");
        setVesselWidth(v.beamM ? String(v.beamM) : "");
        setVesselDraft(v.draftM ? String(v.draftM) : "");
        setVesselWeight(v.weightTons ? String(v.weightTons) : "");
        setVesselRegistration(v.registration || "");
    }

    const handleVesselSelect = (vesselId: string) => {
        setSelectedVesselId(vesselId);
        if (vesselId === "new") {
            setVesselType("jedrilica");
            setVesselLength("");
            setVesselWidth("");
            setVesselDraft("");
            setVesselWeight("");
            setVesselRegistration("");
        } else {
            const v = userVessels.find(x => x.id === vesselId);
            if (v) {
                setVesselType(v.type || "");
                setVesselLength(v.lengthM ? String(v.lengthM) : "");
                setVesselWidth(v.beamM ? String(v.beamM) : "");
                setVesselDraft(v.draftM ? String(v.draftM) : "");
                setVesselWeight(v.weightTons ? String(v.weightTons) : "");
                setVesselRegistration(v.registration || "");
            }
        }
    };

    // ── Mutations ────────────────────────────────────────────────────────
    const createMutation = trpc.reservation.create.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija uspješno kreirana.");
            utils.reservation.listAll.invalidate();
            utils.landWaiting.listAll.invalidate();
            utils.calendar.events.invalidate();
            onSuccess?.();
        },
        onError: (error: any) => toast.error(error.message),
    });

    const vesselCreateMutation = trpc.vessel.create.useMutation();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isWaitlisted) {
            if (!userId || !serviceTypeId || !requestedDate || !craneId || !durationMin || !vesselType) {
                toast.error("Molimo popunite sva obavezna polja (vlasnik, tip operacije, datum, dizalicu, trajanje i tip plovila).");
                return;
            }
        } else {
            if (!userId || !serviceTypeId || !requestedDate || !scheduledTime || !craneId || !durationMin || !vesselType) {
                toast.error("Molimo popunite sva obavezna polja (uključujući datum, vrijeme, dizalicu i trajanje).");
                return;
            }
        }

        let scheduledStartDate: Date | undefined = undefined;
        if (!isWaitlisted && requestedDate) {
            const [hours, minutes] = scheduledTime.split(":").map(Number);
            scheduledStartDate = new Date(requestedDate);
            scheduledStartDate.setHours(hours, minutes, 0, 0);
        }

        const commonPayload = {
            userId,
            serviceTypeId,
            requestedDate: requestedDate ? formatToSqlDate(requestedDate) : "",
            requestedTimeSlot: "po_dogovoru" as any,
            userNote: userNote || undefined,
            adminNote: adminNote || undefined,
            vesselType: vesselType as any,
            vesselRegistration: vesselRegistration || undefined,
            vesselLengthM: vesselLength ? Number(vesselLength) : undefined,
            vesselBeamM: vesselWidth ? Number(vesselWidth) : undefined,
            vesselDraftM: vesselDraft ? Number(vesselDraft) : undefined,
            vesselWeightTons: vesselWeight ? Number(vesselWeight) : undefined,
            contactPhone,
            landZoneId: (landZoneId && landZoneId !== "none") ? landZoneId : undefined,
            landWaitingId: initialData?.landWaitingId || undefined,
            overrideCapacityCheck: overrideCapacityCheck || undefined,
            status: isWaitlisted ? ("waitlisted" as const) : undefined,
            isAutoApprove: !isWaitlisted ? true : undefined,
            craneId: craneId || undefined,
            scheduledStart: !isWaitlisted ? scheduledStartDate : undefined,
            durationMin: durationMin ? Number(durationMin) : undefined,
        };

        if (selectedVesselId === "new" && saveToProfile) {
            // Save vessel to profile first
            vesselCreateMutation.mutate({
                name: vesselRegistration || "Plovilo",
                type: vesselType as any,
                lengthM: vesselLength ? Number(vesselLength) : undefined,
                beamM: vesselWidth ? Number(vesselWidth) : undefined,
                draftM: vesselDraft ? Number(vesselDraft) : undefined,
                weightTons: vesselWeight ? Number(vesselWeight) : undefined,
                registration: vesselRegistration || undefined,
                ownerId: userId,
            }, {
                onSuccess: (newVessel) => {
                    createMutation.mutate({
                        ...commonPayload,
                        vesselId: newVessel.id,
                    });
                },
                onError: (err) => {
                    toast.error("Greška pri kreiranju plovila: " + err.message);
                }
            });
        } else {
            createMutation.mutate({
                ...commonPayload,
                vesselId: selectedVesselId !== "new" ? selectedVesselId : undefined,
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Korisnik (Vlasnik rezervacije) *</Label>
                    <div className="flex items-center gap-2">
                        <UserSearchCombobox
                            users={usersList as any}
                            value={userId}
                            onChange={setUserId}
                            placeholder="Odaberite korisnika..."
                            className="flex-1"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setIsCreateUserOpen(true)}
                            title="Novi korisnik"
                            className="h-9 w-9 shrink-0"
                        >
                            <UserPlus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <CreateUserDialog
                    open={isCreateUserOpen}
                    onOpenChange={setIsCreateUserOpen}
                    onSuccess={(newUser) => {
                        // Invalidate users list to fetch the newly created user
                        utils.user.list.invalidate().then(() => {
                            setUserId(newUser.id);
                            if (newUser.phone) {
                                setContactPhone(newUser.phone);
                            }
                        });
                    }}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Service + Time Preference */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">
                            {lang === "hr" ? "Tip operacije i termin" : "Service Type & Time"}
                        </h3>
                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Tip operacije" : "Service type"} *</Label>
                            <Select value={serviceTypeId} onValueChange={(val) => {
                                setServiceTypeId(val);
                                const st = (serviceTypes as any[]).find((s: any) => s.id === val);
                                if (st?.defaultDurationMin) {
                                    setDurationMin(String(st.defaultDurationMin));
                                }
                            }}>
                                <SelectTrigger>
                                    <SelectValue placeholder={
                                        serviceTypesLoading
                                            ? "..."
                                            : lang === "hr" ? "Odaberite tip operacije" : "Select service type"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {(serviceTypes as any[]).map((st: any) => (
                                        <SelectItem key={st.id} value={st.id}>
                                            {st.name}
                                            {st.defaultDurationMin && ` (~${st.defaultDurationMin} min)`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Land zone display and selection */}
                        {isLiftFromSea && (
                            <div className="space-y-4 pt-2 pb-2 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">{lang === "hr" ? "Popunjenost kopnenih zona" : "Dry Berth Occupancy"}</Label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {(landZones as any[]).map((lz: any) => {
                                            const activeCount = lz.activeSpots || 0;
                                            const reservedCount = lz.reservedSpots || 0;
                                            const total = lz.totalSpots || 0;
                                            const avail = lz.availableSpots ?? Math.max(0, total - activeCount - reservedCount);
                                            const percent = total > 0 ? Math.round(((activeCount + reservedCount) / total) * 100) : 0;
                                            const isOver80 = percent >= 80;
                                            return (
                                                <div
                                                    key={lz.id}
                                                    className={cn(
                                                        "p-1.5 rounded border text-[10px] flex flex-col justify-between bg-white",
                                                        isOver80 ? "border-amber-300 bg-amber-50/20" : "border-gray-200"
                                                    )}
                                                >
                                                    <span className="font-semibold truncate text-gray-700">{lz.name} ({lz.code})</span>
                                                    <div className="flex flex-col text-muted-foreground text-[9px] mt-0.5">
                                                        <span>Ukupno {total}: {activeCount} zauzeto, {reservedCount} rezervirano</span>
                                                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Slobodno: {avail}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs">{lang === "hr" ? "Odredišna zona na kopnu" : "Destination Land Zone"}</Label>
                                    <Select value={landZoneId} onValueChange={(val) => {
                                        setLandZoneId(val);
                                        setOverrideCapacityCheck(false);
                                    }}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder={lang === "hr" ? "Odaberite zonu (opcionalno)" : "Select zone (optional)"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">{lang === "hr" ? "Nije odabrano" : "Not selected"}</SelectItem>
                                            {(landZones as any[]).map((lz: any) => {
                                                const activeCount = lz.activeSpots || 0;
                                                const reservedCount = lz.reservedSpots || 0;
                                                const total = lz.totalSpots || 0;
                                                const avail = lz.availableSpots ?? Math.max(0, total - activeCount - reservedCount);
                                                return (
                                                    <SelectItem key={lz.id} value={lz.id} className="text-xs">
                                                        {lz.name} ({lz.code}) — Ukupno {total}: {activeCount} zauzeto, {reservedCount} rezervirano, {avail} slobodno
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {zoneCapacity?.isOver80 && !isWaitlisted && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-md p-2.5 space-y-2">
                                        <p className="text-amber-800 font-semibold text-[11px] flex items-center gap-1.5">
                                            ⚠ {lang === "hr"
                                                ? `Upozorenje o popunjenosti kopnene zone (${zoneCapacity.name}): ${zoneCapacity.activeSpots || 0} zauzeto, ${zoneCapacity.reservedSpots || 0} rezervirano (Ukupno ${zoneCapacity.percentFull}% popunjeno). Preostalo slobodno: ${zoneCapacity.availableSpots || 0} mjesta.`
                                                : `Zone capacity warning (${zoneCapacity.name}): ${zoneCapacity.activeSpots || 0} occupied, ${zoneCapacity.reservedSpots || 0} reserved (${zoneCapacity.percentFull}% full). Available: ${zoneCapacity.availableSpots || 0} spots.`
                                            }
                                        </p>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-center gap-2 text-[10px] text-amber-900 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={overrideCapacityCheck}
                                                    onChange={(e) => setOverrideCapacityCheck(e.target.checked)}
                                                    className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                                />
                                                <span>
                                                    {lang === "hr"
                                                        ? "Dopusti kreiranje rezervacije (ručni override)"
                                                        : "Allow creating reservation (manual override)"
                                                    }
                                                </span>
                                            </label>
                                            <div className="border-t border-amber-200/60 my-0.5" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsWaitlisted(true);
                                                    setOverrideCapacityCheck(false);
                                                }}
                                                className="text-left text-[10px] text-amber-700 font-semibold hover:underline flex items-center gap-1 focus:outline-none"
                                            >
                                                📋 {lang === "hr"
                                                    ? "Umjesto toga, stavi klijenta na listu čekanja za suhi vez"
                                                    : "Instead, place client on dry berth waiting list"
                                                }
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Current land placement for launch (lower_to_sea) */}
                        {isLowerToSea && selectedVesselId !== "new" && (
                            <div className="pt-2 pb-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100 space-y-2">
                                <Label className="text-xs text-blue-800 font-semibold flex items-center gap-1.5">
                                    📍 {lang === "hr" ? "Lokacija plovila na kopnu" : "Vessel Land Location"}
                                </Label>
                                {activeOccupancy ? (
                                    <p className="text-xs text-blue-900">
                                        {lang === "hr"
                                            ? `Brod se trenutno nalazi u zoni: ${activeOccupancy.zone?.name || "Nepoznato"} (${activeOccupancy.zone?.code || "N/A"})`
                                            : `Vessel is currently placed in zone: ${activeOccupancy.zone?.name || "Unknown"} (${activeOccupancy.zone?.code || "N/A"})`
                                        }
                                    </p>
                                ) : (
                                    <p className="text-xs text-amber-800">
                                        ⚠ {lang === "hr"
                                            ? "Plovilo trenutno nije registrirano na kopnu u sustavu."
                                            : "Vessel is currently not registered on land in the system."
                                        }
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={isWaitlisted}
                                    onChange={(e) => {
                                        setIsWaitlisted(e.target.checked);
                                        if (e.target.checked) {
                                            setOverrideCapacityCheck(false);
                                        }
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span>
                                    {lang === "hr"
                                        ? "Stavi klijenta na listu čekanja za suhi vez (termin dizalice će se odrediti naknadno)"
                                        : "Place client on dry berth waiting list (crane schedule to be determined)"
                                    }
                                </span>
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>
                                    {isWaitlisted
                                        ? (lang === "hr" ? "Početak čekanja" : "Start of Wait")
                                        : (lang === "hr" ? "Datum odobrenja" : "Approved Date")
                                    } *
                                </Label>
                                <DatePicker
                                    date={requestedDate}
                                    onChange={setRequestedDate}
                                    placeholder={lang === "hr" ? "Datum" : "Date"}
                                    disablePastDates
                                />
                            </div>
                            {!isWaitlisted && (
                                <div className="space-y-2">
                                    <Label>{lang === "hr" ? "Točno vrijeme" : "Exact Time"} *</Label>
                                    <Input
                                        type="time"
                                        step="1800"
                                        value={scheduledTime}
                                        onChange={(e) => setScheduledTime(e.target.value)}
                                        required
                                    />
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{lang === "hr" ? "Dizalica" : "Crane"} *</Label>
                                <Select value={craneId} onValueChange={setCraneId}>
                                    <SelectTrigger><SelectValue placeholder="Odaberite dizalicu" /></SelectTrigger>
                                    <SelectContent>
                                        {(cranes as any[]).filter((c: any) => c.craneStatus === "active").map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{lang === "hr" ? "Trajanje (min)" : "Duration (min)"} *</Label>
                                <Input
                                    type="number"
                                    min="30"
                                    step="30"
                                    placeholder="30, 60, 90..."
                                    value={durationMin}
                                    onChange={(e) => setDurationMin(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Napomena" : "Note"}</Label>
                            <Textarea
                                value={userNote}
                                onChange={(e) => setUserNote(e.target.value)}
                                placeholder={lang === "hr"
                                    ? "Opišite zahvat, posebne zahtjeve i sl..."
                                    : "Describe the operation, special requirements..."}
                                rows={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5">
                                🔒 {lang === "hr" ? "Interna napomena operatera" : "Internal operator note"}
                            </Label>
                            <Textarea
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                placeholder={lang === "hr"
                                    ? "Napomena vidljiva samo operaterima (npr. obavezan karet, posebni uvjeti...)"
                                    : "Note visible only to operators (e.g. mandatory cradle, special conditions...)"}
                                rows={2}
                                className="border-amber-200 bg-amber-50/30 focus:border-amber-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Vessel & Contact */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.vesselSection}</h3>

                        {userId && (
                            <div className="space-y-2 mb-4">
                                <Label>{lang === "hr" ? "Odabir plovila" : "Select Vessel"}</Label>
                                <Select value={selectedVesselId} onValueChange={handleVesselSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={lang === "hr" ? "Odaberite plovilo" : "Select vessel"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">
                                            🌟 {lang === "hr" ? "Novo plovilo (Unesi podatke)" : "New Vessel (Enter data)"}
                                        </SelectItem>
                                        {userVessels.map((v: any) => (
                                            <SelectItem key={v.id} value={v.id}>
                                                ⛵ {v.registration ? `[${v.registration}] ` : ""}{v.name || "Plovilo"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {selectedVesselId === "new" && (
                            <div className="flex items-center gap-2 py-1 mb-2">
                                <input
                                    type="checkbox"
                                    id="saveToProfile"
                                    checked={saveToProfile}
                                    onChange={(e) => setSaveToProfile(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <Label htmlFor="saveToProfile" className="text-xs text-muted-foreground cursor-pointer select-none">
                                    {lang === "hr" ? "Spremi plovilo u profil korisnika" : "Save vessel to user profile"}
                                </Label>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t.form.vesselType} *</Label>
                                <Select value={vesselType} onValueChange={setVesselType} disabled={selectedVesselId !== "new"}>
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="jedrilica">{t.form.vesselTypeSailboat}</SelectItem>
                                        <SelectItem value="motorni">{t.form.vesselTypeMotorboat}</SelectItem>
                                        <SelectItem value="katamaran">{t.form.vesselTypeCatamaran}</SelectItem>
                                        <SelectItem value="ostalo">{t.form.vesselTypeOther}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{t.form.vesselWeight}</Label>
                                <Input
                                    type="number"
                                    value={vesselWeight}
                                    onChange={(e) => setVesselWeight(e.target.value)}
                                    placeholder="t"
                                    disabled={selectedVesselId !== "new"}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Registracija plovila" : "Vessel Registration"} *</Label>
                            <Input
                                value={vesselRegistration}
                                onChange={(e) => setVesselRegistration(e.target.value)}
                                placeholder={lang === "hr" ? "npr. ST-1234" : "e.g. ST-1234"}
                                required
                                disabled={selectedVesselId !== "new"}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselLength} (m)</Label>
                                <Input type="number" step="0.1" value={vesselLength} onChange={(e) => setVesselLength(e.target.value)} disabled={selectedVesselId !== "new"} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselWidth} (m)</Label>
                                <Input type="number" step="0.1" value={vesselWidth} onChange={(e) => setVesselWidth(e.target.value)} disabled={selectedVesselId !== "new"} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselDraft} (m)</Label>
                                <Input type="number" step="0.1" value={vesselDraft} onChange={(e) => setVesselDraft(e.target.value)} disabled={selectedVesselId !== "new"} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t.form.contactPhone}</Label>
                            <Input
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t">
                <div>
                    {onRejectWaitlist && (
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={isRejectPending || createMutation.isPending}
                            onClick={onRejectWaitlist}
                            className="gap-1.5"
                        >
                            {isRejectPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <XCircle className="h-4 w-4" />
                            )}
                            Odbij zahtjev
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel}>
                            {t.admin.cancel}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        disabled={
                            createMutation.isPending || 
                            !userId || 
                            !serviceTypeId || 
                            !requestedDate || 
                            !vesselType || 
                            !craneId ||
                            !durationMin ||
                            (!isWaitlisted && (
                                !scheduledTime || 
                                (isLiftFromSea && zoneCapacity?.isOver80 && !overrideCapacityCheck)
                            ))
                        }
                        className="min-w-[140px]"
                    >
                        {createMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.form.submitting}</>
                        ) : (
                            <><Send className="h-4 w-4 mr-2" />{submitButtonText || (initialData?.landWaitingId ? "Spremi i potvrdi rezervaciju" : "Kreiraj")}</>
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
}
