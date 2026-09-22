import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatAppDate, formatToSqlDate, fromZagreb } from "@/lib/date-utils";
import { toZagreb } from "@shared/timezone";
import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Check,
  Loader2,
  AlertTriangle,
  Info,
  Ship,
  User,
  MapPin,
  Construction,
  Clock,
  Phone,
  CalendarDays,
} from "lucide-react";

export interface ReservationScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "approve" | "edit" | "create";
  reservation?: any | null;
  initialData?: {
    userId?: string;
    vesselId?: string;
    craneId?: string;
    date?: Date;
  };
  onSuccess?: () => void;
}

export function ReservationScheduleModal({
  open,
  onOpenChange,
  mode,
  reservation,
  initialData,
  onSuccess,
}: ReservationScheduleModalProps) {
  const utils = trpc.useUtils();

  // Mode helpers
  const isApprove = mode === "approve";
  const isEdit = mode === "edit";
  const isCreate = mode === "create";

  // Form states
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedVesselId, setSelectedVesselId] = useState<string>("");
  const [vesselName, setVesselName] = useState<string>("");
  const [vesselRegistration, setVesselRegistration] = useState<string>("");
  const [vesselLengthM, setVesselLengthM] = useState<string>("");
  const [vesselBeamM, setVesselBeamM] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [serviceTypeId, setServiceTypeId] = useState<string>("");

  // Scheduling states
  const [craneId, setCraneId] = useState<string>("");
  const [landZoneId, setLandZoneId] = useState<string>("none");
  const [spotNumber, setSpotNumber] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("08:00");
  const [durationMin, setDurationMin] = useState<string>("30");
  const [adminNote, setAdminNote] = useState<string>("");
  const [overrideTeamCapacity, setOverrideTeamCapacity] = useState<boolean>(false);

  // Queries
  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const { data: landZones = [] } = trpc.landZone.list.useQuery();
  const { data: seasonsList = [] } = trpc.season.list.useQuery();
  const { data: serviceTypes = [] } = trpc.serviceType.list.useQuery({ onlyActive: true });
  const { data: usersListRes } = trpc.user.list.useQuery({ pageSize: 1000 }, { enabled: isCreate && open });
  const usersList = usersListRes?.data || [];

  const { data: userVessels = [], isLoading: vesselsLoading } = trpc.vessel.listByUser.useQuery(
    { userId: selectedUserId },
    { enabled: isCreate && !!selectedUserId && open }
  );

  // Active crane list & largest crane identification (for PŠD Špinut 9-15m rule)
  const activeCranes = useMemo(() => {
    return (cranesList as any[]).filter((c: any) => c.craneStatus === "active");
  }, [cranesList]);

  const largestCrane = useMemo(() => {
    return [...activeCranes].sort((a, b) => (Number(b.maxCapacityKN) || 0) - (Number(a.maxCapacityKN) || 0))[0];
  }, [activeCranes]);

  // Determine current vessel dimensions and operation
  const currentLength = useMemo(() => {
    if (reservation?.vesselLengthM) return Number(reservation.vesselLengthM);
    if (vesselLengthM) return Number(vesselLengthM);
    if (selectedVesselId && userVessels.length > 0) {
      const v = userVessels.find(item => item.id === selectedVesselId);
      if (v?.lengthM) return Number(v.lengthM);
    }
    return 0;
  }, [reservation, vesselLengthM, selectedVesselId, userVessels]);

  const currentOperationCategory = useMemo(() => {
    if (reservation?.serviceType?.operationCategory) return reservation.serviceType.operationCategory;
    if (serviceTypeId && serviceTypes.length > 0) {
      const st = (serviceTypes as any[]).find((s: any) => s.id === serviceTypeId);
      return st?.operationCategory || "general";
    }
    return "general";
  }, [reservation, serviceTypeId, serviceTypes]);

  const isLiftFromSea = currentOperationCategory === "lift_from_sea";

  // Available slots query for crane, date, duration
  const dateStr = selectedDate ? formatToSqlDate(selectedDate) : "";
  const slotsQuery = trpc.calendar.availableSlots.useQuery(
    {
      craneId: craneId || undefined,
      date: dateStr,
      durationMin: Number(durationMin) || 30,
      excludeReservationId: reservation?.id || undefined,
    },
    {
      enabled: open && !!selectedDate && !!craneId,
      refetchOnWindowFocus: false,
    }
  );

  const slotData = slotsQuery.data;
  const allSlots = slotData?.slots || [];
  const freeSlots = slotData?.availableSlots || [];
  const isWorkingDay = slotData?.isWorkingDay ?? true;
  const workingHours = slotData?.workingHours;

  // Season working hours notice
  const activeSeasonNotice = useMemo(() => {
    if (workingHours && slotData?.seasonName) {
      return { from: workingHours.from, to: workingHours.to, seasonName: slotData.seasonName };
    }
    if (!selectedDate) return null;
    const dStr = formatToSqlDate(selectedDate);
    const activeSeason = (seasonsList as any[]).find((s: any) =>
      s.isActive && s.startDate <= dStr && s.endDate >= dStr
    );
    if (activeSeason?.workingHours && typeof activeSeason.workingHours === "object") {
      const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const dayKey = dayKeys[selectedDate.getDay()];
      const dayHours = (activeSeason.workingHours as any)[dayKey];
      if (dayHours?.from && dayHours?.to) {
        return { from: dayHours.from, to: dayHours.to, seasonName: activeSeason.name };
      }
    }
    return null;
  }, [workingHours, slotData, seasonsList, selectedDate]);

  const selectedSlotObj = useMemo(() => {
    return allSlots.find((s: any) => s.time === selectedTime);
  }, [allSlots, selectedTime]);

  // Auto-select first free slot when freeSlots changes if needed
  useEffect(() => {
    if (open) {
      const isValid = allSlots.some((s: any) => s.time === selectedTime && (s.available || s.canOverride));
      if (!selectedTime || !isValid) {
        if (freeSlots.length > 0) {
          setSelectedTime(freeSlots[0]);
        }
      }
    }
  }, [open, freeSlots, allSlots, selectedTime]);

  // Initialize form from reservation or initialData
  useEffect(() => {
    if (!open) return;

    if (reservation) {
      setVesselRegistration(reservation.vesselRegistration || "");
      setContactPhone(reservation.contactPhone || reservation.user?.phone || "");
      setAdminNote(reservation.adminNote || "");
      setDurationMin(String(reservation.durationMin || "30"));
      setCraneId(reservation.craneId || reservation.crane?.id || "");
      setLandZoneId(reservation.landZoneId || reservation.landZone?.id || "none");

      // Date & time initialization
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      if (reservation.scheduledStart) {
        const d = new Date(reservation.scheduledStart);
        setSelectedDate(d);
        const z = toZagreb(d);
        setSelectedTime(z.timeStr);
      } else if (reservation.requestedDate) {
        const reqD = typeof reservation.requestedDate === "string" ? parseISO(reservation.requestedDate) : new Date(reservation.requestedDate);
        setSelectedDate(reqD < startOfToday ? new Date() : reqD);
        setSelectedTime("08:00");
      } else {
        setSelectedDate(new Date());
        setSelectedTime("08:00");
      }
    } else if (initialData) {
      if (initialData.userId) setSelectedUserId(initialData.userId);
      if (initialData.vesselId) setSelectedVesselId(initialData.vesselId);
      if (initialData.craneId) setCraneId(initialData.craneId);
      if (initialData.date) setSelectedDate(initialData.date);
      setSelectedTime("08:00");
      setDurationMin("30");
      setLandZoneId("none");
      setAdminNote("");
    } else {
      setSelectedUserId("");
      setSelectedVesselId("");
      setVesselName("");
      setVesselRegistration("");
      setVesselLengthM("");
      setVesselBeamM("");
      setContactPhone("");
      setServiceTypeId("");
      setCraneId("");
      setLandZoneId("none");
      setSpotNumber("");
      setSelectedDate(new Date());
      setSelectedTime("08:00");
      setDurationMin("30");
      setAdminNote("");
    }
  }, [open, reservation, initialData]);

  // Mutations
  const approveMutation = trpc.reservation.approve.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je uspješno odobrena.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      utils.calendar.events.invalidate();
      utils.landWaiting.listAll.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDetailsMutation = trpc.reservation.updateDetails.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je ažurirana.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      utils.calendar.events.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.reservation.create.useMutation({
    onSuccess: () => {
      toast.success("Nova rezervacija je uspješno kreirana.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      utils.calendar.events.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const isSubmitting =
    approveMutation.isPending || updateDetailsMutation.isPending || createMutation.isPending;

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || !selectedTime || !craneId) {
      toast.error("Molimo odaberite dizalicu, datum i vrijeme termina.");
      return;
    }

    if (selectedSlotObj?.teamCapacityWarning && !overrideTeamCapacity) {
      toast.error("U ovom terminu već rade 2 dizalice. Molimo označite potvrdni okvir za dopuštenje (override) zauzetosti timova.");
      return;
    }

    const dStr = formatToSqlDate(selectedDate);
    const scheduledStart = fromZagreb(dStr, selectedTime);
    const durNum = Number(durationMin) || 30;
    const finalZoneId = landZoneId !== "none" && landZoneId !== "" ? landZoneId : null;

    if (isApprove) {
      if (!reservation?.id) return;
      approveMutation.mutate({
        id: reservation.id,
        craneId,
        scheduledStart,
        durationMin: durNum,
        landZoneId: finalZoneId,
        vesselRegistration: vesselRegistration || undefined,
        contactPhone: contactPhone || undefined,
        adminNote: adminNote || undefined,
      });
    } else if (isEdit) {
      if (!reservation?.id) return;
      updateDetailsMutation.mutate({
        id: reservation.id,
        craneId,
        scheduledStart,
        durationMin: durNum,
        landZoneId: finalZoneId,
        vesselRegistration: vesselRegistration || undefined,
        contactPhone: contactPhone || undefined,
        adminNote: adminNote || undefined,
        overrideTeamCapacity: overrideTeamCapacity || undefined,
      });
    } else if (isCreate) {
      if (!selectedUserId) {
        toast.error("Molimo odaberite korisnika.");
        return;
      }
      if (!serviceTypeId) {
        toast.error("Molimo odaberite vrstu usluge.");
        return;
      }

      createMutation.mutate({
        userId: selectedUserId,
        vesselId: selectedVesselId && selectedVesselId !== "new" ? selectedVesselId : undefined,
        serviceTypeId,
        requestedDate: dStr,
        requestedTimeSlot: "po_dogovoru" as const,
        vesselType: "jedrilica" as const,
        vesselRegistration: vesselRegistration || undefined,
        vesselLengthM: vesselLengthM ? Number(vesselLengthM) : undefined,
        vesselBeamM: vesselBeamM ? Number(vesselBeamM) : undefined,
        contactPhone: contactPhone || undefined,
        craneId,
        scheduledStart,
        durationMin: durNum,
        landZoneId: finalZoneId || undefined,
        isAutoApprove: true,
        adminNote: adminNote || undefined,
        overrideTeamCapacity: overrideTeamCapacity || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-600 shrink-0" />
            {isApprove && "Odobri / Zakaži termin rezervacije"}
            {isEdit && "Uredi rezervaciju i termin"}
            {isCreate && "Nova rezervacija s terminom"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isApprove && "Dodijelite dizalicu, termin i zonu na kopnu za ovu rezervaciju."}
            {isEdit && "Promijenite dizalicu, termin, zonu na kopnu ili prateće podatke."}
            {isCreate && "Kreirajte rezervaciju s direktno odabranom dizalicom, suhim vezom i terminom."}
          </DialogDescription>
        </DialogHeader>

        {/* 1. Context Info Card (Reservation / User & Vessel) */}
        {reservation ? (
          <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border text-xs space-y-1.5 my-1">
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-sm text-foreground">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <span>{reservation.user?.name || "Korisnik"}</span>
                  <span className="text-muted-foreground font-normal text-xs font-mono">
                    ({reservation.reservationNumber || "REZ"})
                  </span>
                </div>
                {(reservation.user?.phone || reservation.contactPhone) && (
                  <div className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" />
                    <span>{reservation.contactPhone || reservation.user?.phone}</span>
                  </div>
                )}
              </div>

              {reservation.serviceType?.name && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold">
                  {reservation.serviceType.name}
                </Badge>
              )}
            </div>

            {/* Vessel row */}
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground pt-1 border-t border-slate-200/80 dark:border-slate-800">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Ship className="h-3.5 w-3.5 text-blue-600" />
                {reservation.vesselName || reservation.vesselRegistration || "Plovilo"}
              </span>

              {reservation.vesselRegistration && (
                <Badge variant="secondary" className="font-mono text-[10px] py-0 px-1">
                  {reservation.vesselRegistration}
                </Badge>
              )}

              {(reservation.vesselLengthM || reservation.vesselBeamM) && (
                <span className="font-mono text-foreground font-semibold">
                  ({reservation.vesselLengthM ? `L: ${reservation.vesselLengthM}m` : ""}
                  {reservation.vesselLengthM && reservation.vesselBeamM ? " × " : ""}
                  {reservation.vesselBeamM ? `B: ${reservation.vesselBeamM}m` : ""})
                </span>
              )}
            </div>

            {/* Requested date / user note if present */}
            {reservation.requestedDate && !reservation.scheduledStart && (
              <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200 dark:border-amber-900 flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span>Željeni datum: <strong>{formatAppDate(reservation.requestedDate)}</strong> ({reservation.requestedTimeSlot || "po dogovoru"})</span>
              </div>
            )}
            {reservation.userNote && (
              <p className="text-[11px] text-muted-foreground italic bg-white dark:bg-slate-800/80 p-1.5 rounded border">
                "{reservation.userNote}"
              </p>
            )}
          </div>
        ) : isCreate ? (
          <div className="space-y-3 pb-2 border-b">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Korisnik (Vlasnik plovila) *</Label>
              <UserSearchCombobox
                users={usersList as any}
                value={selectedUserId}
                onChange={(id, user) => {
                  setSelectedUserId(id);
                  if (user?.phone) setContactPhone(user.phone);
                }}
                placeholder="Pretraži i odaberi korisnika..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Plovilo</Label>
                <Select
                  value={selectedVesselId}
                  onValueChange={(val) => {
                    setSelectedVesselId(val);
                    const v = userVessels.find(item => item.id === val);
                    if (v) {
                      setVesselName(v.name || "");
                      setVesselRegistration(v.registration || "");
                      setVesselLengthM(v.lengthM ? String(v.lengthM) : "");
                      setVesselBeamM(v.beamM ? String(v.beamM) : "");
                    }
                  }}
                  disabled={!selectedUserId || vesselsLoading}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={vesselsLoading ? "Učitavanje..." : "Odaberite plovilo"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ Unesi novo plovilo</SelectItem>
                    {userVessels.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        ⛵ {v.registration ? `[${v.registration}] ` : ""}{v.name}
                        {(v.lengthM || v.beamM) ? ` (${v.lengthM ? `L:${v.lengthM}m` : ""} ${v.beamM ? `B:${v.beamM}m` : ""})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vrsta usluge *</Label>
                <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Odaberite uslugu" />
                  </SelectTrigger>
                  <SelectContent>
                    {(serviceTypes as any[]).map((st: any) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.name} {st.operationCategory === "lift_from_sea" ? "⬆️ (Dizanje)" : st.operationCategory === "lower_to_sea" ? "⬇️ (Spuštanje)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        {/* 2. PŠD Špinut Marina Rules Guidelines Alert */}
        {currentLength > 15 ? (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Upozorenje na limit lučice:</strong> Dužina plovila je <strong>{currentLength} m</strong>. Maksimalna dozvoljena dužina plovila za lučicu PŠD Špinut je <strong>15 metara</strong>.
            </div>
          </div>
        ) : currentLength >= 9 ? (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Preporuka dizalice (PŠD Špinut):</strong> Plovilo dužine <strong>{currentLength} m</strong> (kategorija 9–15 m) podiže se <strong>najvećom dizalicom</strong>.
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* 3. Coupled Crane & Dry Berth Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Crane Selection */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Construction className="h-3.5 w-3.5 text-blue-600" />
                  Dizalica *
                </Label>
                {currentLength >= 9 && currentLength <= 15 && largestCrane && (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Preporuka: {largestCrane.name}
                  </span>
                )}
              </div>
              <Select value={craneId} onValueChange={setCraneId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Odaberite dizalicu" />
                </SelectTrigger>
                <SelectContent>
                  {activeCranes.map((c: any) => {
                    const isTop = largestCrane && c.id === largestCrane.id;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {isTop ? "⭐ (Najveća - za 9-15m)" : (c.location ? `(${c.location})` : "")}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Dry Berth Zone Placement (mandatory/recommended for lift_from_sea) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                  Zona na kopnu (Suhi vez)
                  {isLiftFromSea && <span className="text-indigo-600 font-bold ml-0.5">*</span>}
                </Label>
                {isLiftFromSea && (
                  <span className="text-[10px] text-indigo-600 font-medium">Dizanje na kopno</span>
                )}
              </div>
              <Select value={landZoneId} onValueChange={setLandZoneId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Odaberite zonu na kopnu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez dodjele zone (samo dizalica)</SelectItem>
                  {landZones.map((z: any) => {
                    const free = z.totalSpots - (z.activeSpots || 0);
                    return (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name} ({z.code}) — {free > 0 ? `${free} slobodno` : "Popunjeno"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 4. Date and 30-min Slot Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                Datum termina *
              </Label>
              <DatePicker
                date={selectedDate}
                onChange={setSelectedDate}
                placeholder="Odaberi datum"
                disablePastDates={isApprove}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Vrijeme termina *
                </Label>
                {slotsQuery.isFetching && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Provjera...
                  </span>
                )}
              </div>
              <Select value={selectedTime} onValueChange={setSelectedTime} disabled={!craneId || !selectedDate}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Odaberite sat" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {!isWorkingDay ? (
                    <SelectItem value="none" disabled>Neradni dan</SelectItem>
                  ) : allSlots.length === 0 ? (
                    <SelectItem value="none" disabled>Nema termina</SelectItem>
                  ) : (
                    allSlots.map((slot: any) => {
                      if (slot.available) {
                        return (
                          <SelectItem
                            key={slot.time}
                            value={slot.time}
                            className="text-emerald-700 font-medium"
                          >
                            ✓ {slot.time} (Slobodno)
                          </SelectItem>
                        );
                      }
                      if (slot.canOverride || slot.teamCapacityWarning) {
                        return (
                          <SelectItem
                            key={slot.time}
                            value={slot.time}
                            className="text-amber-700 font-semibold bg-amber-50/70"
                          >
                            ⚠️ {slot.time} ({slot.occupiedBy || "Zauzeta 2 tima (uz override)"})
                          </SelectItem>
                        );
                      }
                      return (
                        <SelectItem
                          key={slot.time}
                          value={slot.time}
                          disabled
                          className="text-muted-foreground opacity-60 line-through"
                        >
                          ✗ {slot.time} ({slot.occupiedBy || "Zauzeto"})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Trajanje termina *</Label>
              <Select value={durationMin} onValueChange={setDurationMin}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min (Standard)</SelectItem>
                  <SelectItem value="60">60 min (1 sat)</SelectItem>
                  <SelectItem value="90">90 min (1,5 sat)</SelectItem>
                  <SelectItem value="120">120 min (2 sata)</SelectItem>
                  <SelectItem value="180">180 min (3 sata)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Season working hours notice */}
          {activeSeasonNotice && (
            <p className="text-[11px] text-primary/80 font-medium flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
              🕒 Radno vrijeme ({activeSeasonNotice.seasonName}): {activeSeasonNotice.from} — {activeSeasonNotice.to}h
            </p>
          )}

          {/* Team capacity warning & override checkbox */}
          {selectedSlotObj?.teamCapacityWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-bold text-sm leading-none mt-0.5">⚠️</span>
                <div className="text-xs text-amber-900 space-y-0.5">
                  <p className="font-semibold">
                    Upozorenje: U terminu {selectedTime} već rade 2 dizalice ({selectedSlotObj.busyCranesNames?.join(" i ") || "ostale dizalice"}).
                  </p>
                  <p className="text-amber-800 text-[11px]">
                    Dizalica je slobodna, ali su oba operativna tima zauzeta. Za dodjelu termina označite dopuštenje (override).
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 bg-amber-100/80 p-2 rounded-lg border border-amber-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={overrideTeamCapacity}
                  onChange={(e) => setOverrideTeamCapacity(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  Dopusti dodjelu termina unatoč zauzetosti timova (ručni override)
                </span>
              </label>
            </div>
          )}

          {/* Quick pick slot chips */}
          {isWorkingDay && (freeSlots.length > 0 || allSlots.filter((s: any) => s.teamCapacityWarning || s.canOverride).length > 0) && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                ⚡ Brzi odabir termina:
              </span>
              {freeSlots.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 max-h-24 overflow-y-auto">
                  {freeSlots.map((slot) => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedTime(slot)}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-xs font-mono font-medium transition-all shadow-xs",
                          isSelected
                            ? "bg-emerald-600 text-white shadow-emerald-200 font-bold"
                            : "bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}

              {allSlots.filter((s: any) => s.teamCapacityWarning || s.canOverride).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-amber-50/70 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-semibold text-amber-900 mr-1 flex items-center gap-1">
                    ⚠️ Zauzeta 2 tima (uz override):
                  </span>
                  {allSlots
                    .filter((s: any) => s.teamCapacityWarning || s.canOverride)
                    .map((s: any) => {
                      const isSelected = selectedTime === s.time;
                      return (
                        <button
                          key={s.time}
                          type="button"
                          onClick={() => setSelectedTime(s.time)}
                          className={cn(
                            "px-2 py-0.5 rounded-lg text-xs font-mono font-medium transition-all shadow-xs",
                            isSelected
                              ? "bg-amber-600 text-white shadow-amber-200 font-bold"
                              : "bg-white text-amber-900 border border-amber-300 hover:bg-amber-100"
                          )}
                        >
                          {s.time}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* 5. Contact & Vessel Registration update */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Registracija plovila</Label>
              <Input
                className="rounded-xl font-mono text-xs"
                placeholder="npr. ST-1234"
                value={vesselRegistration}
                onChange={(e) => setVesselRegistration(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Kontakt telefon / mobitel</Label>
              <Input
                className="rounded-xl text-xs"
                placeholder="npr. 091 234 5678"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          {/* 6. Operator admin note */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Interna bilješka operatera</Label>
            <Textarea
              className="rounded-xl text-xs"
              placeholder="Napomena vidljiva operateru i na radnom nalogu..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Odustani
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              disabled={isSubmitting || !craneId || !selectedDate || !selectedTime || (selectedSlotObj?.teamCapacityWarning && !overrideTeamCapacity)}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isApprove && <Check className="h-4 w-4 mr-1.5" />}
              {isApprove ? "Odobri i zakaži" : isEdit ? "Spremi promjene" : "Kreiraj rezervaciju"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
