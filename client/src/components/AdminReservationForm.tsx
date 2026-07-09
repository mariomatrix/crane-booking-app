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
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, UserPlus } from "lucide-react";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { cn } from "@/lib/utils";

interface AdminReservationFormProps {
    onSuccess?: () => void;
    onCancel?: () => void;
}

export function AdminReservationForm({ onSuccess, onCancel }: AdminReservationFormProps) {
    const { t, lang } = useLang();

    // ── Form state ───────────────────────────────────────────────────────
    const [userId, setUserId] = useState("");
    const [serviceTypeId, setServiceTypeId] = useState("");
    const [requestedDate, setRequestedDate] = useState<Date | undefined>(undefined);
    const [scheduledTime, setScheduledTime] = useState("08:00");
    const [durationMin, setDurationMin] = useState<string>("");
    const [craneId, setCraneId] = useState("");
    const [userNote, setUserNote] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
    const [landZoneId, setLandZoneId] = useState("");
    const [overrideCapacityCheck, setOverrideCapacityCheck] = useState(false);

    const utils = trpc.useUtils();

    // Vessel state
    const [selectedVesselId, setSelectedVesselId] = useState<string>("new");
    const [saveToProfile, setSaveToProfile] = useState(true);
    const [vesselType, setVesselType] = useState("");
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
        setSelectedVesselId("new");
        setVesselType("");
        setVesselLength("");
        setVesselWidth("");
        setVesselDraft("");
        setVesselWeight("");
        setVesselRegistration("");
    }

    if (userVessels.length > 0 && selectedVesselId === "new" && !vesselRegistration && !userVesselsLoading) {
        const v = userVessels[0];
        setSelectedVesselId(v.id);
        setVesselType(v.type || "");
        setVesselLength(v.lengthM ? String(v.lengthM) : "");
        setVesselWidth(v.beamM ? String(v.beamM) : "");
        setVesselDraft(v.draftM ? String(v.draftM) : "");
        setVesselWeight(v.weightTons ? String(v.weightTons) : "");
        setVesselRegistration(v.registration || "");
    }

    const handleVesselSelect = (vesselId: string) => {
        setSelectedVesselId(vesselId);
        if (vesselId === "new") {
            setVesselType("");
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
            onSuccess?.();
        },
        onError: (error: any) => toast.error(error.message),
    });

    const vesselCreateMutation = trpc.vessel.create.useMutation();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !serviceTypeId || !requestedDate || !scheduledTime || !craneId || !durationMin || !vesselType || !contactPhone || !vesselRegistration) {
            toast.error("Molimo popunite sva obavezna polja (uključujući vrijeme, dizalicu, trajanje i registraciju).");
            return;
        }

        const [hours, minutes] = scheduledTime.split(":").map(Number);
        const scheduledStartDate = new Date(requestedDate);
        scheduledStartDate.setHours(hours, minutes, 0, 0);

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
                        userId,
                        isAutoApprove: true,
                        craneId,
                        scheduledStart: scheduledStartDate,
                        durationMin: Number(durationMin),
                        serviceTypeId,
                        requestedDate: formatToSqlDate(requestedDate),
                        requestedTimeSlot: "po_dogovoru",
                        userNote: userNote || undefined,
                        vesselId: newVessel.id,
                        vesselType: vesselType as any,
                        vesselRegistration: vesselRegistration || undefined,
                        vesselLengthM: vesselLength ? Number(vesselLength) : undefined,
                        vesselBeamM: vesselWidth ? Number(vesselWidth) : undefined,
                        vesselDraftM: vesselDraft ? Number(vesselDraft) : undefined,
                        vesselWeightTons: vesselWeight ? Number(vesselWeight) : undefined,
                        contactPhone,
                        landZoneId: (landZoneId && landZoneId !== "none") ? landZoneId : undefined,
                        overrideCapacityCheck: overrideCapacityCheck || undefined,
                    });
                },
                onError: (err) => {
                    toast.error("Greška pri kreiranju plovila: " + err.message);
                }
            });
        } else {
            createMutation.mutate({
                userId,
                isAutoApprove: true,
                craneId,
                scheduledStart: scheduledStartDate,
                durationMin: Number(durationMin),
                serviceTypeId,
                requestedDate: formatToSqlDate(requestedDate),
                requestedTimeSlot: "po_dogovoru",
                userNote: userNote || undefined,
                vesselId: selectedVesselId !== "new" ? selectedVesselId : undefined,
                vesselType: vesselType as any,
                vesselRegistration: vesselRegistration || undefined,
                vesselLengthM: vesselLength ? Number(vesselLength) : undefined,
                vesselBeamM: vesselWidth ? Number(vesselWidth) : undefined,
                vesselDraftM: vesselDraft ? Number(vesselDraft) : undefined,
                vesselWeightTons: vesselWeight ? Number(vesselWeight) : undefined,
                contactPhone,
                landZoneId: (landZoneId && landZoneId !== "none") ? landZoneId : undefined,
                overrideCapacityCheck: overrideCapacityCheck || undefined,
            });
        }
    };

    const timeSlotOptions = [
        { value: "jutro", label: lang === "hr" ? "Jutro (08:00–12:00)" : "Morning (08:00–12:00)" },
        { value: "poslijepodne", label: lang === "hr" ? "Poslijepodne (12:00–16:00)" : "Afternoon (12:00–16:00)" },
        { value: "po_dogovoru", label: lang === "hr" ? "Po dogovoru" : "By arrangement" },
    ];

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
                                            const percent = lz.totalSpots > 0 ? Math.round((lz.activeSpots / lz.totalSpots) * 100) : 0;
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
                                                    <div className="flex justify-between items-center mt-0.5 text-muted-foreground text-[9px]">
                                                        <span>{lz.activeSpots}/{lz.totalSpots}</span>
                                                        <span className={cn(isOver80 && "text-amber-700 font-medium")}>{percent}%</span>
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
                                                const percent = lz.totalSpots > 0 ? Math.round((lz.activeSpots / lz.totalSpots) * 100) : 0;
                                                return (
                                                    <SelectItem key={lz.id} value={lz.id} className="text-xs">
                                                        {lz.name} ({lz.code}) — {lz.activeSpots}/{lz.totalSpots} ({percent}%)
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {zoneCapacity?.isOver80 && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-md p-2.5 space-y-1.5">
                                        <p className="text-amber-800 font-semibold text-[11px] flex items-center gap-1.5">
                                            ⚠ {lang === "hr"
                                                ? `Zona je popunjena preko 80% (${zoneCapacity.percentFull}%)`
                                                : `Zone is over 80% full (${zoneCapacity.percentFull}%)`
                                            }
                                        </p>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{lang === "hr" ? "Datum odobrenja" : "Approved Date"} *</Label>
                                <DatePicker
                                    date={requestedDate}
                                    onChange={setRequestedDate}
                                    placeholder={lang === "hr" ? "Datum" : "Date"}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{lang === "hr" ? "Točno vrijeme" : "Exact Time"} *</Label>
                                <Input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    required
                                />
                            </div>
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
                            <Label>{t.form.contactPhone} *</Label>
                            <Input
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
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
                        !craneId || 
                        !scheduledTime || 
                        !durationMin || 
                        !vesselType || 
                        !contactPhone || 
                        !vesselRegistration ||
                        (isLiftFromSea && zoneCapacity?.isOver80 && !overrideCapacityCheck)
                    }
                    className="min-w-[120px]"
                >
                    {createMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.form.submitting}</>
                    ) : (
                        <><Send className="h-4 w-4 mr-2" />Kreiraj</>
                    )}
                </Button>
            </div>
        </form>
    );
}
