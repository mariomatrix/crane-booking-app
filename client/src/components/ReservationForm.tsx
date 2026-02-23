
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
import { Loader2, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

interface ReservationFormProps {
    onSuccess?: () => void;
    onCancel?: () => void;
}

export function ReservationForm({ onSuccess, onCancel }: ReservationFormProps) {
    const { user } = useAuth();
    const { t, lang } = useLang();

    // ── Form state ───────────────────────────────────────────────────────
    const [serviceTypeId, setServiceTypeId] = useState("");
    const [requestedDate, setRequestedDate] = useState("");
    const [requestedTimeSlot, setRequestedTimeSlot] = useState("po_dogovoru");
    const [userNote, setUserNote] = useState("");
    const [contactPhone, setContactPhone] = useState(user?.phone || "");

    // Vessel state
    const [vesselId, setVesselId] = useState("");
    const [vesselType, setVesselType] = useState("");
    const [vesselName, setVesselName] = useState("");
    const [vesselLength, setVesselLength] = useState("");
    const [vesselWidth, setVesselWidth] = useState("");
    const [vesselDraft, setVesselDraft] = useState("");
    const [vesselWeight, setVesselWeight] = useState("");

    const [hasAttemptedVesselAutoFill, setHasAttemptedVesselAutoFill] = useState(false);
    const [hasSyncedProfile, setHasSyncedProfile] = useState(false);

    // ── Queries ──────────────────────────────────────────────────────────
    const { data: serviceTypes = [], isLoading: serviceTypesLoading } =
        trpc.serviceType.list.useQuery({ onlyActive: true });

    const { data: myVessels = [], isLoading: vesselsLoading } =
        trpc.vessel.listMine.useQuery(undefined, { enabled: !!user });

    // ── Effects ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (user && !hasSyncedProfile) {
            if (user.phone && !contactPhone) setContactPhone(user.phone);
            setHasSyncedProfile(true);
        }
    }, [user, hasSyncedProfile, contactPhone]);

    // Auto-select first vessel
    useEffect(() => {
        if (!vesselsLoading && myVessels.length > 0 && !vesselId && !hasAttemptedVesselAutoFill) {
            const first = myVessels[0] as any;
            setVesselId(String(first.id));
            setVesselType(first.type);
            setVesselName(first.name);
            setVesselLength(first.lengthM ? String(first.lengthM) : "");
            setVesselWidth(first.beamM ? String(first.beamM) : "");
            setVesselDraft(first.draftM ? String(first.draftM) : "");
            setVesselWeight(first.weightKg ? String(first.weightKg) : "");
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
            setVesselType(""); setVesselName(""); setVesselLength("");
            setVesselWidth(""); setVesselDraft(""); setVesselWeight("");
            return;
        }
        setVesselId(id);
        const vessel = (myVessels as any[]).find(v => String(v.id) === id);
        if (vessel) {
            setVesselType(vessel.type);
            setVesselName(vessel.name);
            setVesselLength(vessel.lengthM ? String(vessel.lengthM) : "");
            setVesselWidth(vessel.beamM ? String(vessel.beamM) : "");
            setVesselDraft(vessel.draftM ? String(vessel.draftM) : "");
            setVesselWeight(vessel.weightKg ? String(vessel.weightKg) : "");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!serviceTypeId || !requestedDate || !vesselType || !contactPhone) {
            toast.error(t.form.errors.required);
            return;
        }
        createMutation.mutate({
            serviceTypeId,
            requestedDate,
            requestedTimeSlot: requestedTimeSlot as "jutro" | "poslijepodne" | "po_dogovoru",
            userNote: userNote || undefined,
            vesselId: vesselId && vesselId !== "new" ? vesselId : undefined,
            vesselType: vesselType as any,
            vesselName: vesselName || undefined,
            vesselLengthM: vesselLength ? Number(vesselLength) : undefined,
            vesselBeamM: vesselWidth ? Number(vesselWidth) : undefined,
            vesselDraftM: vesselDraft ? Number(vesselDraft) : undefined,
            vesselWeightKg: vesselWeight ? Number(vesselWeight) : undefined,
            contactPhone,
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
                            <Input
                                type="date"
                                value={requestedDate}
                                min={new Date().toISOString().split("T")[0]}
                                onChange={(e) => setRequestedDate(e.target.value)}
                                required
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
                                rows={3}
                            />
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

                        <div className="space-y-2">
                            <Label>{t.form.vesselName}</Label>
                            <Input
                                value={vesselName}
                                onChange={(e) => setVesselName(e.target.value)}
                                disabled={!!vesselId && vesselId !== "new"}
                            />
                        </div>

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
                            <div className="space-y-2">
                                <Label>{t.form.vesselWeight} (kg)</Label>
                                <Input
                                    type="number"
                                    value={vesselWeight}
                                    onChange={(e) => setVesselWeight(e.target.value)}
                                    disabled={!!vesselId && vesselId !== "new"}
                                />
                            </div>
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
                                <Label className="text-xs">{t.form.vesselDraft} (m)</Label>
                                <Input type="number" step="0.1" value={vesselDraft} onChange={(e) => setVesselDraft(e.target.value)} disabled={!!vesselId && vesselId !== "new"} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">
                            {lang === "hr" ? "Kontakt" : "Contact"}
                        </h3>
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
                    disabled={createMutation.isPending || !serviceTypeId || !requestedDate || !vesselType || !contactPhone}
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
