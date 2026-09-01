
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
import { useAuth } from "@/_core/hooks/useAuth";
import { formatAppDate, formatToSqlDate } from "@/lib/date-utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface ReservationFormProps {
    onSuccess?: () => void;
    onCancel?: () => void;
    initialData?: {
        date?: string;
        serviceTypeId?: string;
        requestedTimeSlot?: string;
    };
}

export function ReservationForm({ onSuccess, onCancel, initialData }: ReservationFormProps) {
    const { user } = useAuth();
    const { t, lang } = useLang();

    // ── Form state ───────────────────────────────────────────────────────
    const [serviceTypeId, setServiceTypeId] = useState(initialData?.serviceTypeId || "");
    const [requestedDate, setRequestedDate] = useState<Date | undefined>(
        initialData?.date ? new Date(initialData.date) : undefined
    );
    const [requestedTimeSlot, setRequestedTimeSlot] = useState(initialData?.requestedTimeSlot || "po_dogovoru");
    const [userNote, setUserNote] = useState("");
    const [contactPhone, setContactPhone] = useState(user?.phone || "");

    // Vessel state
    const [vesselId, setVesselId] = useState("");
    const [vesselType, setVesselType] = useState("");
    const [vesselLength, setVesselLength] = useState("");
    const [vesselWidth, setVesselWidth] = useState("");
    const [vesselWeight, setVesselWeight] = useState("");
    const [vesselRegistration, setVesselRegistration] = useState("");

    const [hasAttemptedVesselAutoFill, setHasAttemptedVesselAutoFill] = useState(false);
    const [hasSyncedProfile, setHasSyncedProfile] = useState(false);

    // ── Queries ──────────────────────────────────────────────────────────
    const { data: serviceTypes = [], isLoading: serviceTypesLoading } =
        trpc.serviceType.list.useQuery({ onlyActive: true });

    const { data: myVessels = [], isLoading: vesselsLoading } =
        trpc.vessel.listMine.useQuery(undefined, { enabled: !!user });

    const { data: availableResources = [] } =
        trpc.resources.list.useQuery({ onlyActive: true });
    const [selectedResources, setSelectedResources] = useState<Record<string, number>>({});

    // ── Effects ──────────────────────────────────────────────────────────
    useEffect(() => {
        // Sync phone from user profile if not already set by user or initialData
        if (user?.phone && !contactPhone) {
            setContactPhone(user.phone);
        }
    }, [user?.phone, contactPhone]);

    // Update date if initialData changes (e.g. user clicks different day on calendar)
    useEffect(() => {
        if (initialData?.date) {
            setRequestedDate(new Date(initialData.date));
        }
        if (initialData?.serviceTypeId) {
            setServiceTypeId(initialData.serviceTypeId);
        }
        if (initialData?.requestedTimeSlot) {
            setRequestedTimeSlot(initialData.requestedTimeSlot);
        }
    }, [initialData]);

    // Auto-select first vessel
    useEffect(() => {
        if (!vesselsLoading && myVessels.length > 0 && !vesselId && !hasAttemptedVesselAutoFill) {
            const first = myVessels[0] as any;
            setVesselId(String(first.id));
            setVesselType(first.type);
            setVesselLength(first.lengthM ? String(first.lengthM) : "");
            setVesselWidth(first.beamM ? String(first.beamM) : "");
            setVesselWeight(first.weightTons ? String(first.weightTons) : "");
            setVesselRegistration(first.registration || "");
            setHasAttemptedVesselAutoFill(true);
        }
    }, [myVessels, vesselsLoading, vesselId, hasAttemptedVesselAutoFill]);

    // ── Mutation ─────────────────────────────────────────────────────────
    const createMutation = trpc.reservation.create.useMutation({
        onSuccess: () => {
            toast.success(t.form.successMessage);
            onSuccess?.();
        },
        onError: (error: any) => toast.error(error.message),
    });

    // ── Handlers ─────────────────────────────────────────────────────────
    const handleVesselSelect = (id: string) => {
        if (id === "new") {
            setVesselId("new");
            setVesselType(""); setVesselLength("");
            setVesselWidth(""); setVesselWeight(""); setVesselRegistration("");
            return;
        }
        setVesselId(id);
        const vessel = (myVessels as any[]).find(v => String(v.id) === id);
        if (vessel) {
            setVesselType(vessel.type);
            setVesselLength(vessel.lengthM ? String(vessel.lengthM) : "");
            setVesselWidth(vessel.beamM ? String(vessel.beamM) : "");
            setVesselWeight(vessel.weightTons ? String(vessel.weightTons) : "");
            setVesselRegistration(vessel.registration || "");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!serviceTypeId || !requestedDate || !vesselType) {
            toast.error(t.form.errors.required);
            return;
        }
        createMutation.mutate({
            serviceTypeId,
            requestedDate: formatToSqlDate(requestedDate),
            requestedTimeSlot: requestedTimeSlot as "jutro" | "poslijepodne" | "po_dogovoru",
            userNote: userNote || undefined,
            vesselId: vesselId && vesselId !== "new" ? vesselId : undefined,
            vesselType: vesselType as any,
            vesselRegistration: vesselRegistration || undefined,
            vesselLengthM: vesselLength ? Number(vesselLength) : undefined,
            vesselBeamM: vesselWidth ? Number(vesselWidth) : undefined,
            vesselWeightTons: vesselWeight ? Number(vesselWeight) : undefined,
            contactPhone,
            resources: Object.entries(selectedResources)
                .filter(([_, qty]) => qty > 0)
                .map(([resourceId, quantity]) => ({ resourceId, quantity })),
        });
    };

    const timeSlotOptions = [
        { value: "jutro", label: lang === "hr" ? "Jutro (08:00–12:00)" : "Morning (08:00–12:00)" },
        { value: "poslijepodne", label: lang === "hr" ? "Poslijepodne (12:00–16:00)" : "Afternoon (12:00–16:00)" },
        { value: "po_dogovoru", label: lang === "hr" ? "Po dogovoru" : "By arrangement" },
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Service + Time Preference */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">
                            {lang === "hr" ? "Tip operacije" : "Service Type"}
                        </h3>
                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Tip operacije" : "Service type"} *</Label>
                            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
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
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">
                            {lang === "hr" ? "Željeni termin" : "Preferred Date & Time"}
                        </h3>
                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Okvirni datum" : "Preferred date"} *</Label>
                            <DatePicker
                                date={requestedDate}
                                onChange={setRequestedDate}
                                placeholder={lang === "hr" ? "Odaberite datum" : "Select date"}
                                disablePastDates
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Dio dana" : "Time of day"}</Label>
                            <Select value={requestedTimeSlot} onValueChange={setRequestedTimeSlot}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {timeSlotOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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

                        {/* Additional Resources Selection */}
                        <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-800">
                                    {lang === "hr" ? "Dodatni resursi lučice (opcionalno)" : "Additional marina resources (optional)"}
                                </Label>
                                <span className="text-[10px] text-muted-foreground">
                                    {lang === "hr" ? "Default: bez resursa" : "Default: none"}
                                </span>
                            </div>
                            <div className="space-y-1.5 pt-1">
                                {availableResources.length === 0 ? (
                                    <div className="text-[11px] text-muted-foreground italic py-1">
                                        {lang === "hr" ? "Nema dostupnih resursa." : "No available resources."}
                                    </div>
                                ) : (
                                    availableResources.map((res: any) => {
                                        const qty = selectedResources[res.id] || 0;
                                        return (
                                            <div
                                                key={res.id}
                                                className={`p-2 rounded-lg border text-xs flex items-center justify-between transition ${
                                                    qty > 0 ? "bg-indigo-50 border-indigo-300 font-semibold" : "bg-white border-slate-200"
                                                }`}
                                            >
                                                <div className="min-w-0 pr-1">
                                                    <div className="truncate font-medium text-slate-900">{res.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {Number(res.pricePerUnitEur).toFixed(2)} € / {res.unit}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedResources(prev => ({
                                                                ...prev,
                                                                [res.id]: Math.max(0, (prev[res.id] || 0) - 1)
                                                            }));
                                                        }}
                                                        className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-300 text-xs active:scale-95"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-4 text-center font-bold text-xs">{qty}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedResources(prev => ({
                                                                ...prev,
                                                                [res.id]: (prev[res.id] || 0) + 1
                                                            }));
                                                        }}
                                                        className="w-5 h-5 rounded bg-indigo-600 text-white font-bold flex items-center justify-center hover:bg-indigo-700 text-xs active:scale-95"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Vessel & Contact */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.vesselSection}</h3>

                        {(myVessels as any[]).length > 0 && (
                            <div className="space-y-2">
                                <Label>{t.nav.vessels}</Label>
                                <Select value={vesselId} onValueChange={handleVesselSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={lang === "hr" ? "Odaberite plovilo" : "Select a vessel"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">— {t.vessels.addVessel} —</SelectItem>
                                        {(myVessels as any[]).map((v: any) => (
                                            <SelectItem key={v.id} value={String(v.id)}>
                                                {v.name} ({v.type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}


                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t.form.vesselType} *</Label>
                                <Select value={vesselType} onValueChange={setVesselType} disabled={!!vesselId && vesselId !== "new"}>
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="jedrilica">{t.form.vesselTypeSailboat}</SelectItem>
                                        <SelectItem value="motorni">{t.form.vesselTypeMotorboat}</SelectItem>
                                        <SelectItem value="katamaran">{t.form.vesselTypeCatamaran}</SelectItem>
                                        <SelectItem value="ostalo">{t.form.vesselTypeOther}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Registarska oznaka plovila" : "Vessel Registration"}</Label>
                            <Input
                                value={vesselRegistration}
                                onChange={(e) => setVesselRegistration(e.target.value)}
                                placeholder={lang === "hr" ? "npr. ST-1234" : "e.g. ST-1234"}
                                disabled={!!vesselId && vesselId !== "new"}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselLength} (m)</Label>
                                <Input type="number" step="0.1" value={vesselLength} onChange={(e) => setVesselLength(e.target.value)} disabled={!!vesselId && vesselId !== "new"} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselWidth} (m)</Label>
                                <Input type="number" step="0.1" value={vesselWidth} onChange={(e) => setVesselWidth(e.target.value)} disabled={!!vesselId && vesselId !== "new"} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselWeight} (t)</Label>
                                <Input type="number" step="0.1" value={vesselWeight} onChange={(e) => setVesselWeight(e.target.value)} disabled={!!vesselId && vesselId !== "new"} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">
                            {lang === "hr" ? "Kontakt" : "Contact"}
                        </h3>
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

            <div className="flex justify-end gap-3 pt-4 border-t">
                {onCancel && (
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        {t.admin.cancel}
                    </Button>
                )}
                <Button
                    type="submit"
                    disabled={createMutation.isPending || !serviceTypeId || !requestedDate || !vesselType}
                    className="min-w-[120px]"
                >
                    {createMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.form.submitting}</>
                    ) : (
                        <><Send className="h-4 w-4 mr-2" />{t.form.submitButton}</>
                    )}
                </Button>
            </div>
        </form>
    );
}
