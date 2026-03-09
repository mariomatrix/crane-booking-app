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
import { Loader2, Send } from "lucide-react";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";

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
    const [requestedTimeSlot, setRequestedTimeSlot] = useState("po_dogovoru");
    const [userNote, setUserNote] = useState("");
    const [contactPhone, setContactPhone] = useState("");

    // Vessel state
    const [vesselType, setVesselType] = useState("");
    const [vesselLength, setVesselLength] = useState("");
    const [vesselWidth, setVesselWidth] = useState("");
    const [vesselDraft, setVesselDraft] = useState("");
    const [vesselWeight, setVesselWeight] = useState("");
    const [vesselRegistration, setVesselRegistration] = useState("");

    // ── Queries ──────────────────────────────────────────────────────────
    const { data: serviceTypes = [], isLoading: serviceTypesLoading } =
        trpc.serviceType.list.useQuery({ onlyActive: true });

    const { data: usersList = [] } = trpc.user.list.useQuery();

    // ── Mutation ─────────────────────────────────────────────────────────
    const createMutation = trpc.reservation.create.useMutation({
        onSuccess: () => {
            toast.success("Rezervacija uspješno kreirana.");
            onSuccess?.();
        },
        onError: (error: any) => toast.error(error.message),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !serviceTypeId || !requestedDate || !vesselType || !contactPhone) {
            toast.error("Molimo popunite sva obavezna polja.");
            return;
        }
        createMutation.mutate({
            userId,
            serviceTypeId,
            requestedDate: formatToSqlDate(requestedDate),
            requestedTimeSlot: requestedTimeSlot as "jutro" | "poslijepodne" | "po_dogovoru",
            userNote: userNote || undefined,
            vesselType: vesselType as any,
            vesselRegistration: vesselRegistration || undefined,
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
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Korisnik (Vlasnik rezervacije) *</Label>
                    <UserSearchCombobox
                        users={usersList as any}
                        value={userId}
                        onChange={setUserId}
                        placeholder="Odaberite korisnika..."
                    />
                </div>
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

                        <div className="space-y-2">
                            <Label>{lang === "hr" ? "Okvirni datum" : "Preferred date"} *</Label>
                            <DatePicker
                                date={requestedDate}
                                onChange={setRequestedDate}
                                placeholder={lang === "hr" ? "Odaberite datum" : "Select date"}
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
                    </div>
                </div>

                {/* Right Column: Vessel & Contact */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm border-b pb-2">{t.form.vesselSection}</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t.form.vesselType} *</Label>
                                <Select value={vesselType} onValueChange={setVesselType}>
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
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselLength} (m)</Label>
                                <Input type="number" step="0.1" value={vesselLength} onChange={(e) => setVesselLength(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselWidth} (m)</Label>
                                <Input type="number" step="0.1" value={vesselWidth} onChange={(e) => setVesselWidth(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.form.vesselDraft} (m)</Label>
                                <Input type="number" step="0.1" value={vesselDraft} onChange={(e) => setVesselDraft(e.target.value)} />
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
                    disabled={createMutation.isPending || !userId || !serviceTypeId || !requestedDate || !vesselType || !contactPhone || !vesselRegistration}
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
