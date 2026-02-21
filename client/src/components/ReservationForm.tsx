
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
import { Loader2, Send, AlertTriangle, ListPlus, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/_core/hooks/useAuth";

interface ReservationFormProps {
    initialData?: {
        craneId?: number;
        date?: string;
        startTime?: string;
        slotCount?: string;
        isMaintenance?: boolean;
    };
    onSuccess?: () => void;
    onCancel?: () => void;
}

export function ReservationForm({ initialData, onSuccess, onCancel }: ReservationFormProps) {
    const { user } = useAuth();
    const { t, lang } = useLang();

    // Form state
    const [craneId, setCraneId] = useState(initialData?.craneId ? String(initialData.craneId) : "");
    const [vesselId, setVesselId] = useState("");
    const [vesselType, setVesselType] = useState("");
    const [vesselName, setVesselName] = useState("");
    const [vesselLength, setVesselLength] = useState("");
    const [vesselWidth, setVesselWidth] = useState("");
    const [vesselDraft, setVesselDraft] = useState("");
    const [vesselWeight, setVesselWeight] = useState("");
    const [selectedDate, setSelectedDate] = useState(initialData?.date || "");
    const [slotCount, setSlotCount] = useState(initialData?.slotCount || "1");
    const [startTime, setStartTime] = useState(initialData?.startTime || "");
    const [liftPurpose, setLiftPurpose] = useState(initialData?.isMaintenance ? "ODRŽAVANJE" : "");
    const [contactPhone, setContactPhone] = useState(user?.phone || "");

    const [validationWarning, setValidationWarning] = useState<string | null>(null);
    const [hasAttemptedVesselAutoFill, setHasAttemptedVesselAutoFill] = useState(false);

    const { data: cranesList = [], isLoading: cranesLoading } = trpc.crane.list.useQuery();
    const { data: myVessels = [], isLoading: vesselsLoading } = trpc.vessel.listMine.useQuery(undefined, { enabled: !!user });
    const slotDuration = 60;

    const canFetchSlots = !!craneId && !!selectedDate && !!slotCount;
    const { data: slotsData, isFetching: slotsFetching } = trpc.calendar.availableSlots.useQuery(
        {
            craneId: Number(craneId),
            date: selectedDate,
            slotCount: Number(slotCount),
            tzOffset: new Date().getTimezoneOffset()
        },
        { enabled: canFetchSlots }
    );

    const selectedCrane = useMemo(
        () => cranesList.find((c: any) => String(c.id) === craneId),
        [craneId, cranesList]
    );

    useEffect(() => {
        if (!selectedCrane || !vesselWeight) { setValidationWarning(null); return; }
        const weight = Number(vesselWeight);
        const capacity = Number(selectedCrane.capacity);
        if (weight > capacity) {
            setValidationWarning(t.form.errors.weightExceeded + ` (max ${capacity}t)`);
            return;
        }
        if (selectedCrane.maxPoolWidth && vesselWidth) {
            const width = Number(vesselWidth);
            if (width > Number(selectedCrane.maxPoolWidth)) {
                setValidationWarning(t.form.errors.widthExceeded + ` (max ${selectedCrane.maxPoolWidth}m)`);
                return;
            }
        }
        setValidationWarning(null);
    }, [vesselWeight, vesselWidth, selectedCrane, t]);

    // Sync phone from user profile
    useEffect(() => {
        if (user?.phone && !contactPhone) {
            setContactPhone(user.phone);
        }
    }, [user?.phone]);

    // Set first vessel as default if available
    useEffect(() => {
        if (!vesselsLoading && myVessels.length > 0 && !vesselId && !hasAttemptedVesselAutoFill) {
            handleVesselSelect(String(myVessels[0].id));
            setHasAttemptedVesselAutoFill(true);
        }
    }, [myVessels, vesselsLoading, vesselId, hasAttemptedVesselAutoFill]);

    // Handle case where initial startTime is provided but might not be in slotsData 
    // (e.g. if it's already busy, we want it to be selected so we can show the "waiting list" UI)
    // Initialize startTime from initialData only once per set of initialData
    useEffect(() => {
        if (initialData?.startTime) {
            setStartTime(initialData.startTime);
        }
    }, [initialData]);

    // Default to Small Crane if nothing selected
    useEffect(() => {
        if (!cranesLoading && cranesList.length > 0 && !craneId) {
            // Find the one with smallest capacity (Mala dizalica)
            const smallest = [...cranesList].sort((a, b) => Number(a.capacity) - Number(b.capacity))[0];
            if (smallest) setCraneId(String(smallest.id));
        }
    }, [cranesList, cranesLoading, craneId]);

    const createMutation = trpc.reservation.create.useMutation({
        onSuccess: () => {
            toast.success(t.form.successMessage);
            onSuccess?.();
        },
        onError: (error: any) => {
            toast.error(error.message);
        },
    });

    const joinWaitingMutation = trpc.waitingList.join.useMutation({
        onSuccess: () => {
            toast.success(lang === "hr" ? "Uspješno ste upisani na listu čekanja." : "You joined the waiting list.");
            onSuccess?.();
        },
        onError: (err: any) => toast.error(err.message),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!craneId || !vesselType || !vesselLength || !vesselWidth || !vesselDraft || !vesselWeight || !selectedDate || !startTime || !liftPurpose || !contactPhone) {
            toast.error(t.form.errors.required);
            return;
        }
        if (validationWarning) { toast.error(validationWarning); return; }

        const startMs = new Date(startTime).getTime();
        const endMs = startMs + Number(slotCount) * slotDuration * 60000;

        createMutation.mutate({
            craneId: Number(craneId),
            startDate: new Date(startMs),
            endDate: new Date(endMs),
            vesselId: vesselId ? Number(vesselId) : undefined,
            vesselType: vesselType as any,
            vesselName: vesselName || undefined,
            vesselLength: Number(vesselLength),
            vesselWidth: Number(vesselWidth),
            vesselDraft: Number(vesselDraft),
            vesselWeight: Number(vesselWeight),
            liftPurpose,
            contactPhone,
            isMaintenance: initialData?.isMaintenance || false,
        });
    };

    const handleVesselSelect = (id: string) => {
        setVesselId(id);
        const vessel = myVessels.find((v: any) => String(v.id) === id);
        if (vessel) {
            setVesselType(vessel.type);
            setVesselName(vessel.name);
            setVesselLength(vessel.length || "");
            setVesselWidth(vessel.width || "");
            setVesselDraft(vessel.draft || "");
            setVesselWeight(vessel.weight || "");
        } else {
            setVesselId("");
        }
    };

    const handleJoinWaiting = () => {
        if (!craneId || !selectedDate) { toast.error(t.form.errors.required); return; }
        joinWaitingMutation.mutate({
            craneId: Number(craneId),
            requestedDate: selectedDate,
            slotCount: Number(slotCount),
            vesselData: { vesselType, vesselWeight, vesselWidth, vesselLength },
        });
    };

    const isStartTimeAvailable = useMemo(() => {
        if (!startTime || !slotsData?.availableStarts) return true;
        const startTs = new Date(startTime).getTime();
        return slotsData.availableStarts.some((s: string | Date) => new Date(s).getTime() === startTs);
    }, [startTime, slotsData]);

    const noSlots = canFetchSlots && !slotsFetching && (slotsData?.availableStarts.length === 0);
    const showWaitingListOption = noSlots || (startTime && !isStartTimeAvailable);

    const durationOptions = [
        { value: "1", label: `1 ${lang === 'hr' ? 'sat' : 'hour'}` },
        { value: "2", label: `2 ${lang === 'hr' ? 'sata' : 'hours'}` },
        { value: "3", label: `3 ${lang === 'hr' ? 'sata' : 'hours'}` },
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Crane & Vessel */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.selectCrane}</h3>
                        <div className="space-y-2">
                            <Label>{t.form.selectCrane} *</Label>
                            <Select value={craneId} onValueChange={setCraneId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={cranesLoading ? "..." : t.form.selectCranePlaceholder} />
                                </SelectTrigger>
                                <SelectContent>
                                    {cranesList.map((crane: any) => (
                                        <SelectItem key={crane.id} value={String(crane.id)}>
                                            {crane.name} — {crane.capacity}t
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {!initialData?.isMaintenance && (
                        <div className="space-y-4">
                            <h3 className="font-medium text-sm border-b pb-2">{t.form.vesselSection}</h3>

                            {myVessels.length > 0 && (
                                <div className="space-y-2">
                                    <Label>{t.nav.vessels}</Label>
                                    <Select value={vesselId} onValueChange={handleVesselSelect}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t.vessels.noVessels} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">— {t.vessels.addVessel} —</SelectItem>
                                            {myVessels.map((v: any) => (
                                                <SelectItem key={v.id} value={String(v.id)}>{v.name} ({v.weight}t)</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t.form.vesselType} *</Label>
                                    <Select value={vesselType} onValueChange={setVesselType} disabled={!!vesselId}>
                                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sailboat">{t.form.vesselTypeSailboat}</SelectItem>
                                            <SelectItem value="motorboat">{t.form.vesselTypeMotorboat}</SelectItem>
                                            <SelectItem value="catamaran">{t.form.vesselTypeCatamaran}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t.form.vesselWeight} (t) *</Label>
                                    <Input type="number" step="0.1" value={vesselWeight} onChange={(e) => setVesselWeight(e.target.value)} required disabled={!!vesselId} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">{t.form.vesselLength} (m)</Label>
                                    <Input type="number" step="0.1" value={vesselLength} onChange={(e) => setVesselLength(e.target.value)} required disabled={!!vesselId} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">{t.form.vesselWidth} (m)</Label>
                                    <Input type="number" step="0.1" value={vesselWidth} onChange={(e) => setVesselWidth(e.target.value)} required disabled={!!vesselId} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">{t.form.vesselDraft} (m)</Label>
                                    <Input type="number" step="0.1" value={vesselDraft} onChange={(e) => setVesselDraft(e.target.value)} required disabled={!!vesselId} />
                                </div>
                            </div>
                            {validationWarning && (
                                <Alert variant="destructive" className="py-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">{validationWarning}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column: Time Slot & Contact */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.slotSection}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t.form.date} *</Label>
                                <Input type="date" value={selectedDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setSelectedDate(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label>{t.form.duration} *</Label>
                                <Select value={slotCount} onValueChange={setSlotCount}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {durationOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t.form.startTime} *</Label>
                            {slotsFetching ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> {lang === 'hr' ? 'Provjera termina...' : 'Checking slots...'}
                                </div>
                            ) : showWaitingListOption ? (
                                <Alert variant="warning" className="bg-amber-50 border-amber-200">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <AlertDescription className="text-xs text-amber-800">
                                        {lang === 'hr'
                                            ? "Odabrani termin je zauzet. Možete se upisati na listu čekanja."
                                            : "Selected slot is busy. You can join the waiting list."}
                                    </AlertDescription>
                                    <Button type="button" variant="outline" size="sm" className="mt-2 w-full text-xs" onClick={handleJoinWaiting} disabled={joinWaitingMutation.isPending}>
                                        <ListPlus className="h-3 w-3 mr-1" /> {t.form.joinWaitingList}
                                    </Button>
                                </Alert>
                            ) : (
                                <Select value={startTime} onValueChange={setStartTime}>
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>
                                        {(slotsData?.availableStarts || []).map((s: string) => {
                                            const d = new Date(s);
                                            return (
                                                <SelectItem key={d.toISOString()} value={d.toISOString()}>
                                                    {d.toLocaleTimeString(lang === "hr" ? "hr-HR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.operationalSection}</h3>
                        <div className="space-y-2">
                            <Label>{t.form.liftPurpose} *</Label>
                            <Textarea value={liftPurpose} onChange={(e) => setLiftPurpose(e.target.value)} placeholder={t.form.liftPurposePlaceholder} rows={2} required />
                        </div>
                        {!initialData?.isMaintenance && (
                            <div className="space-y-2">
                                <Label>{t.form.contactPhone} *</Label>
                                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
                            </div>
                        )}
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
                    disabled={createMutation.isPending || !!validationWarning || !startTime || showWaitingListOption}
                    className="min-w-[120px]"
                >
                    {createMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.form.submitting}</>
                    ) : (
                        <><Send className="h-4 w-4 mr-2" />{initialData?.isMaintenance ? t.admin.save : t.form.submitButton}</>
                    )}
                </Button>
            </div>
        </form>
    );
}
