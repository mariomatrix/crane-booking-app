import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Loader2, Send, AlertTriangle, ListPlus } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function NewReservation() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t, lang } = useLang();

  // Form state
  const [craneId, setCraneId] = useState("");
  const [vesselId, setVesselId] = useState("");
  const [vesselType, setVesselType] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [vesselLength, setVesselLength] = useState("");
  const [vesselWidth, setVesselWidth] = useState("");
  const [vesselDraft, setVesselDraft] = useState("");
  const [vesselWeight, setVesselWeight] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [slotCount, setSlotCount] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [liftPurpose, setLiftPurpose] = useState("");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");

  // Validation warning
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  const { data: cranesList = [], isLoading: cranesLoading } = trpc.crane.list.useQuery();
  const { data: sysSettings } = trpc.settings.get.useQuery();
  const { data: myVessels = [] } = trpc.vessel.listMine.useQuery(undefined, { enabled: !!user });
  const slotDuration = 60; // Strictly 60 min now

  // Fetch available slots when date, crane, slotCount change
  const canFetchSlots = !!craneId && !!selectedDate && !!slotCount;
  const { data: slotsData, isFetching: slotsFetching } = trpc.calendar.availableSlots.useQuery(
    { craneId: Number(craneId), date: selectedDate, slotCount: Number(slotCount) },
    { enabled: canFetchSlots }
  );

  const selectedCrane = useMemo(
    () => cranesList.find((c: any) => String(c.id) === craneId),
    [craneId, cranesList]
  );

  // Validate vessel dimensions against selected crane live
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

  // Reset start time when slots change
  useEffect(() => { setStartTime(""); }, [craneId, selectedDate, slotCount]);

  const createMutation = trpc.reservation.create.useMutation({
    onSuccess: () => {
      toast.success(t.form.successMessage);
      setLocation("/my-reservations");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const joinWaitingMutation = trpc.waitingList.join.useMutation({
    onSuccess: () => {
      toast.success(lang === "hr" ? "Uspješno ste upisani na listu čekanja." : "You joined the waiting list.");
      setLocation("/my-reservations");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CardTitle>{t.auth.signInRequired}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { window.location.href = getLoginUrl(); }}>
              {t.auth.signInButton}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const noSlots = canFetchSlots && !slotsFetching && (slotsData?.availableStarts.length === 0);

  const durationOptions = [
    { value: "1", label: `1 ${lang === 'hr' ? 'sat' : 'hour'}` },
    { value: "2", label: `2 ${lang === 'hr' ? 'sata' : 'hours'}` },
    { value: "3", label: `3 ${lang === 'hr' ? 'sata' : 'hours'}` },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container py-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t.nav.calendar}
          </Button>
          <h1 className="text-xl font-semibold">{t.form.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.form.subtitle}</p>
        </div>
      </div>

      <div className="container py-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t.form.selectCrane}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Crane Selection */}
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
                        {crane.maxPoolWidth ? ` / ${crane.maxPoolWidth}m` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Vessel Details */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">{t.form.vesselSection}</h3>
                <div className="space-y-2">
                  <Label>{t.nav.vessels}</Label>
                  <Select value={vesselId} onValueChange={handleVesselSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.vessels.noVessels} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">— {t.vessels.addVessel} / {t.admin.cancel} —</SelectItem>
                      {myVessels.map((v: any) => (
                        <SelectItem key={v.id} value={String(v.id)}>{v.name} ({v.weight}t)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.form.vesselType} *</Label>
                  <Select value={vesselType} onValueChange={setVesselType} disabled={!!vesselId}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sailboat">{t.form.vesselTypeSailboat}</SelectItem>
                      <SelectItem value="motorboat">{t.form.vesselTypeMotorboat}</SelectItem>
                      <SelectItem value="catamaran">{t.form.vesselTypeCatamaran}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.form.vesselName}</Label>
                  <Input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="npr. Adriatic Dream" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t.form.vesselLength} *</Label>
                    <Input type="number" step="0.1" min="0" value={vesselLength} onChange={(e) => setVesselLength(e.target.value)} required disabled={!!vesselId} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.form.vesselWidth} *</Label>
                    <Input type="number" step="0.1" min="0" value={vesselWidth} onChange={(e) => setVesselWidth(e.target.value)} required disabled={!!vesselId} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.form.vesselDraft} *</Label>
                    <Input type="number" step="0.1" min="0" value={vesselDraft} onChange={(e) => setVesselDraft(e.target.value)} required disabled={!!vesselId} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.form.vesselWeight} *</Label>
                    <Input type="number" step="0.1" min="0" value={vesselWeight} onChange={(e) => setVesselWeight(e.target.value)} required disabled={!!vesselId} />
                  </div>
                </div>
                {validationWarning && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{validationWarning}</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Slot Picker */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">{t.form.slotSection}</h3>
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
                  {!canFetchSlots ? (
                    <p className="text-sm text-muted-foreground">{t.form.startTimePlaceholder}</p>
                  ) : slotsFetching ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Učitavanje...</div>
                  ) : noSlots ? (
                    <div className="space-y-3">
                      <p className="text-sm text-amber-600">{t.form.noSlotsAvailable}</p>
                      <Button type="button" variant="outline" onClick={handleJoinWaiting} disabled={joinWaitingMutation.isPending}>
                        <ListPlus className="h-4 w-4 mr-2" />
                        {t.form.joinWaitingList}
                      </Button>
                    </div>
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

              {/* Operational */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">{t.form.operationalSection}</h3>
                <div className="space-y-2">
                  <Label>{t.form.liftPurpose} *</Label>
                  <Textarea value={liftPurpose} onChange={(e) => setLiftPurpose(e.target.value)} placeholder={t.form.liftPurposePlaceholder} rows={3} required />
                </div>
                <div className="space-y-2">
                  <Label>{t.form.contactPhone} *</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={t.form.contactPhonePlaceholder} required />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createMutation.isPending || !!validationWarning || !startTime}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.form.submitting}</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />{t.form.submitButton}</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
