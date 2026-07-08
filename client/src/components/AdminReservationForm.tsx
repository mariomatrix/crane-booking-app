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
                    disabled={createMutation.isPending || !userId || !serviceTypeId || !requestedDate || !craneId || !scheduledTime || !durationMin || !vesselType || !contactPhone || !vesselRegistration}
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
