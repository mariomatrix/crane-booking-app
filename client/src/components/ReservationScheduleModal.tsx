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
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Ban,
  Weight,
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
  onOpenWorkOrder?: (reservation: any) => void;
  onCancelReservation?: (reservation: any) => void;
  isCancelling?: boolean;
}

const QUICK_OVERRIDE_REASONS = [
  "Retroaktivno evidentiranje izvršenog dizanja",
  "Preraspodjela osoblja na terenu",
  "Privremeni smještaj uz nadzor",
  "Tolerancija nosivosti (+10%) uz nadzor",
  "Dogovor s voditeljem lučice",
];

export function ReservationScheduleModal({
  open,
  onOpenChange,
  mode,
  reservation,
  initialData,
  onSuccess,
  onOpenWorkOrder,
  onCancelReservation,
  isCancelling,
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
  const [vesselWeightTons, setVesselWeightTons] = useState<string>("");
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

  // Conscious Override states
  const [overrideConfirmed, setOverrideConfirmed] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>("");

  // Queries
  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const { data: landZones = [] } = trpc.landZone.list.useQuery();
  const { data: seasonsList = [] } = trpc.season.list.useQuery();
  const { data: serviceTypes = [] } = trpc.serviceType.list.useQuery({ onlyActive: true });
  const { data: affinitiesMatrix = [] } = trpc.landDispatch.getAffinitiesMatrix.useQuery(undefined, {
    enabled: open,
  });
  const { data: usersListRes } = trpc.user.list.useQuery({ pageSize: 1000 }, { enabled: isCreate && open });
  const usersList = usersListRes?.data || [];

  const { data: userVessels = [], isLoading: vesselsLoading } = trpc.vessel.listByUser.useQuery(
    { userId: selectedUserId },
    { enabled: isCreate && !!selectedUserId && open }
  );

  const dateStr = selectedDate ? formatToSqlDate(selectedDate) : "";

  // Fetch daily dispatch overview for the selected date (zone ATP timeline, active stoppages, scheduled ops)
  const { data: dailyOverview } = trpc.landDispatch.getDailyOverview.useQuery(
    { dateStr },
    { enabled: open && !!dateStr, refetchOnWindowFocus: false }
  );

  // Active crane list & largest crane identification (for PŠD Špinut 9-15m rule)
  const activeCranes = useMemo(() => {
    return (cranesList as any[]).filter((c: any) => c.craneStatus === "active");
  }, [cranesList]);

  const largestCrane = useMemo(() => {
    return [...activeCranes].sort((a, b) => (Number(b.maxCapacityKN) || 0) - (Number(a.maxCapacityKN) || 0))[0];
  }, [activeCranes]);

  // Normalized vessel dimensions & weight (supports both top-level and nested reservation.vessel)
  const currentLength = useMemo(() => {
    if (reservation?.vesselLengthM) return Number(reservation.vesselLengthM);
    if (reservation?.vessel?.lengthM) return Number(reservation.vessel.lengthM);
    if (vesselLengthM) return Number(vesselLengthM);
    if (selectedVesselId && userVessels.length > 0) {
      const v = userVessels.find((item) => item.id === selectedVesselId);
      if (v?.lengthM) return Number(v.lengthM);
    }
    return 0;
  }, [reservation, vesselLengthM, selectedVesselId, userVessels]);

  const currentBeam = useMemo(() => {
    if (reservation?.vesselBeamM) return Number(reservation.vesselBeamM);
    if (reservation?.vessel?.beamM) return Number(reservation.vessel.beamM);
    if (vesselBeamM) return Number(vesselBeamM);
    if (selectedVesselId && userVessels.length > 0) {
      const v = userVessels.find((item) => item.id === selectedVesselId);
      if (v?.beamM) return Number(v.beamM);
    }
    return 0;
  }, [reservation, vesselBeamM, selectedVesselId, userVessels]);

  const currentWeightTons = useMemo(() => {
    if (reservation?.vesselWeightTons) return Number(reservation.vesselWeightTons);
    if (reservation?.vessel?.weightTons) return Number(reservation.vessel.weightTons);
    if (vesselWeightTons) return Number(vesselWeightTons);
    if (selectedVesselId && userVessels.length > 0) {
      const v = userVessels.find((item) => item.id === selectedVesselId);
      if (v?.weightTons) return Number(v.weightTons);
    }
    return 0;
  }, [reservation, vesselWeightTons, selectedVesselId, userVessels]);

  const currentOperationCategory = useMemo(() => {
    if (reservation?.serviceType?.operationCategory) return reservation.serviceType.operationCategory;
    if (reservation?.operationCategory) return reservation.operationCategory;
    if (serviceTypeId && serviceTypes.length > 0) {
      const st = (serviceTypes as any[]).find((s: any) => s.id === serviceTypeId);
      return st?.operationCategory || "general";
    }
    return "general";
  }, [reservation, serviceTypeId, serviceTypes]);

  const isLiftFromSea = currentOperationCategory === "lift_from_sea";

  const effectiveVesselId =
    reservation?.vesselId ||
    reservation?.vessel?.id ||
    (selectedVesselId && selectedVesselId !== "new" ? selectedVesselId : undefined);
  const effectiveRegistration =
    reservation?.vesselRegistration || reservation?.vessel?.registration || vesselRegistration;

  const { data: activeOccupancy } = trpc.landZone.getActiveOccupancy.useQuery(
    {
      vesselId: effectiveVesselId || undefined,
      registration: effectiveRegistration ? effectiveRegistration.trim() : undefined,
    },
    {
      enabled: open && (!!effectiveVesselId || (!!effectiveRegistration && effectiveRegistration.trim().length > 1)),
    }
  );
  const isVesselOnLand = !!activeOccupancy;
  const todayStr = toZagreb(new Date()).dateStr;
  const isPastDate = !!dateStr && dateStr < todayStr;
  const isRetroactiveEntry = isPastDate || (isLiftFromSea && isVesselOnLand);

  // Available slots query for crane, date, duration
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
    const activeSeason = (seasonsList as any[]).find(
      (s: any) => s.isActive && s.startDate <= dStr && s.endDate >= dStr
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

  // Auto-select first free slot when freeSlots changes if needed (only in create/approve or if invalid)
  useEffect(() => {
    if (open && !isEdit) {
      const isValid = allSlots.some((s: any) => s.time === selectedTime && (s.available || s.canOverride));
      if (!selectedTime || !isValid) {
        if (freeSlots.length > 0) {
          setSelectedTime(freeSlots[0]);
        }
      }
    }
  }, [open, isEdit, freeSlots, allSlots, selectedTime]);

  // Initialize form from reservation or initialData
  useEffect(() => {
    if (!open) return;

    if (reservation) {
      setVesselRegistration(reservation.vesselRegistration || reservation.vessel?.registration || "");
      setContactPhone(reservation.contactPhone || reservation.user?.phone || "");
      setAdminNote(reservation.adminNote || "");
      setDurationMin(String(reservation.durationMin || "30"));
      setCraneId(reservation.craneId || reservation.crane?.id || "");
      setLandZoneId(reservation.landZoneId || reservation.landZone?.id || "none");
      setOverrideConfirmed(!!reservation.teamOverride);
      setOverrideReason(reservation.teamOverrideReason || "");

      if (reservation.scheduledStart) {
        const d = new Date(reservation.scheduledStart);
        setSelectedDate(d);
        const z = toZagreb(d);
        setSelectedTime(z.timeStr);
      } else if (reservation.requestedDate) {
        const reqD =
          typeof reservation.requestedDate === "string"
            ? parseISO(reservation.requestedDate)
            : new Date(reservation.requestedDate);
        setSelectedDate(reqD);
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
      setOverrideConfirmed(false);
      setOverrideReason("");
    } else {
      setSelectedUserId("");
      setSelectedVesselId("");
      setVesselName("");
      setVesselRegistration("");
      setVesselLengthM("");
      setVesselBeamM("");
      setVesselWeightTons("");
      setContactPhone("");
      setServiceTypeId("");
      setCraneId("");
      setLandZoneId("none");
      setSpotNumber("");
      setSelectedDate(new Date());
      setSelectedTime("08:00");
      setDurationMin("30");
      setAdminNote("");
      setOverrideConfirmed(false);
      setOverrideReason("");
    }
  }, [open, reservation, initialData]);

  // Helper: evaluate crane weight & beam compatibility (including length-based safeguard when weight is missing)
  const craneCompatibilityMap = useMemo(() => {
    const map = new Map<
      string,
      {
        nominalTons: number;
        maxToleranceTons: number;
        exceedsHardLimit: boolean;
        exceedsNominalInTolerance: boolean;
        exceedsLengthEstimatedWeight: boolean;
        exceedPct: number;
        exceedsPoolWidth: boolean;
        maxPoolWidth: number | null;
      }
    >();

    for (const c of activeCranes) {
      const maxCapKN = Number(c.maxCapacityKN) || 0;
      const nominalTons = maxCapKN / 9.80665;
      const maxToleranceTons = nominalTons * 1.1; // +10% tolerance
      const maxPoolWidth = c.maxPoolWidth ? Number(c.maxPoolWidth) : null;

      let exceedsHardLimit = false;
      let exceedsNominalInTolerance = false;
      let exceedsLengthEstimatedWeight = false;
      let exceedPct = 0;

      if (currentWeightTons > 0 && nominalTons > 0) {
        if (currentWeightTons > maxToleranceTons) {
          exceedsHardLimit = true;
          exceedPct = ((currentWeightTons - nominalTons) / nominalTons) * 100;
        } else if (currentWeightTons > nominalTons) {
          exceedsNominalInTolerance = true;
          exceedPct = ((currentWeightTons - nominalTons) / nominalTons) * 100;
        }
      } else if (currentWeightTons <= 0 && currentLength >= 5.5 && nominalTons > 0 && nominalTons <= 2.0) {
        // Vessel >= 5.5m without explicit weight should not default to <= 2t crane (e.g. DIZALICA 1,5 T)
        exceedsLengthEstimatedWeight = true;
      }

      const exceedsPoolWidth = !!(maxPoolWidth && currentBeam > 0 && currentBeam > maxPoolWidth);

      map.set(c.id, {
        nominalTons,
        maxToleranceTons,
        exceedsHardLimit,
        exceedsNominalInTolerance,
        exceedsLengthEstimatedWeight,
        exceedPct,
        exceedsPoolWidth,
        maxPoolWidth,
      });
    }
    return map;
  }, [activeCranes, currentWeightTons, currentBeam, currentLength]);

  // Helper: zone compatibility & free spots for the currently selected crane & time
  const zoneInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        affinityScore: number;
        isPrimary: boolean;
        isAllowed: boolean;
        isBlocked: boolean;
        penaltySlots: number;
        freeSpotsAtSlot: number;
        totalSpots: number;
      }
    >();

    for (const z of landZones as any[]) {
      const aff = (affinitiesMatrix as any[]).find(
        (a: any) => a.craneId === craneId && a.zoneId === z.id
      );
      const overviewZone = dailyOverview?.zones.find((oz) => oz.zoneId === z.id);
      const timelineSlot = overviewZone?.hourlyTimeline.find((t) => t.time === selectedTime);
      const freeSpotsAtSlot =
        timelineSlot != null
          ? timelineSlot.free
          : overviewZone != null
            ? overviewZone.currentFree
            : z.totalSpots - (z.activeSpots || 0);

      map.set(z.id, {
        affinityScore: aff?.affinityScore ?? 70,
        isPrimary: aff?.isPrimary ?? false,
        isAllowed: aff ? aff.isAllowed && !aff.isBlocked : true,
        isBlocked: aff ? !aff.isAllowed || aff.isBlocked : false,
        penaltySlots: aff?.penaltySlots ?? 0,
        freeSpotsAtSlot,
        totalSpots: z.totalSpots,
      });
    }
    return map;
  }, [landZones, affinitiesMatrix, craneId, dailyOverview, selectedTime]);

  // Smart Top Recommendations (disabled during retroactive entry; computed from dailyOverview + affinitiesMatrix)
  const topRecommendations = useMemo(() => {
    if (isRetroactiveEntry) return [];
    if (!dailyOverview || !dateStr || activeCranes.length === 0) return [];

    const durNum = Number(durationMin) || 30;
    const otherOps = (dailyOverview.scheduledOperations || []).filter(
      (o) => o.id !== reservation?.id && o.status !== "cancelled" && o.status !== "not_performed"
    );

    const candidates: Array<{
      craneId: string;
      craneName: string;
      zoneId: string;
      zoneCode: string;
      zoneName: string;
      time: string;
      score: number;
      isPrimary: boolean;
      requiresOverride: boolean;
      badgeText: string;
    }> = [];

    const targetZones =
      landZoneId && landZoneId !== "none"
        ? dailyOverview.zones.filter((z) => z.zoneId === landZoneId)
        : dailyOverview.zones;

    const zonesToEval = targetZones.length > 0 ? targetZones : dailyOverview.zones;

    for (const crane of activeCranes) {
      const compat = craneCompatibilityMap.get(crane.id);
      if (
        compat?.exceedsHardLimit ||
        compat?.exceedsPoolWidth ||
        compat?.exceedsLengthEstimatedWeight
      ) {
        continue;
      }

      for (const slot of dailyOverview.timeSlots) {
        const slotStart = fromZagreb(dateStr, slot);
        const slotEnd = new Date(slotStart.getTime() + durNum * 60000);
        const sMs = slotStart.getTime();
        const eMs = slotEnd.getTime();

        // Check stoppage
        const hasStoppage = (dailyOverview.activeStoppages || []).some((st) => {
          const stS = new Date(st.startsAt).getTime();
          const stE = st.endsAt ? new Date(st.endsAt).getTime() : Infinity;
          if (!(sMs < stE && eMs > stS)) return false;
          return (
            st.scope === "all_cranes" ||
            (st.scope === "single_crane" && st.craneId === crane.id)
          );
        });
        if (hasStoppage) continue;

        // Check crane overlap
        const hasCraneOverlap = otherOps.some((op) => {
          if (op.craneId !== crane.id) return false;
          const oS = new Date(op.scheduledStart).getTime();
          const oE = new Date(op.scheduledEnd).getTime();
          return sMs < oE && eMs > oS;
        });
        if (hasCraneOverlap) continue;

        // Check concurrent teams
        const concurrentOps = otherOps.filter((op) => {
          const oS = new Date(op.scheduledStart).getTime();
          const oE = new Date(op.scheduledEnd).getTime();
          return sMs < oE && eMs > oS;
        });
        const busyTeams = concurrentOps.length;

        // Pick best zone for this crane + slot
        for (const z of zonesToEval) {
          const aff = (affinitiesMatrix as any[]).find(
            (a: any) => a.craneId === crane.id && a.zoneId === z.zoneId
          );
          if (aff && (!aff.isAllowed || aff.isBlocked)) continue;

          const zStoppage = (dailyOverview.activeStoppages || []).some((st) => {
            const stS = new Date(st.startsAt).getTime();
            const stE = st.endsAt ? new Date(st.endsAt).getTime() : Infinity;
            return sMs < stE && eMs > stS && st.scope === "single_zone" && st.zoneId === z.zoneId;
          });
          if (zStoppage) continue;

          const tl = z.hourlyTimeline.find((t) => t.time === slot);
          const freeAtSlot = tl ? tl.free : z.currentFree;
          if (isLiftFromSea && freeAtSlot <= 0) continue;

          let score = aff?.affinityScore ?? 70;
          if (aff?.isPrimary) score += 10;
          if (aff?.penaltySlots) score -= aff.penaltySlots * 5;
          if (busyTeams === 0) score += 8;
          else if (busyTeams === 1) score += 3;
          else score -= 25;

          if ( compat?.exceedsNominalInTolerance ) {
            score -= 20;
          }

          // Length recommendation bonus/penalty (9-15m -> largest crane / Travelift)
          if (currentLength >= 9 && largestCrane) {
            if (crane.id === largestCrane.id) {
              score += 15;
            } else {
              score -= 20;
            }
          } else if (currentLength > 0 && currentLength < 9 && largestCrane && crane.id !== largestCrane.id) {
            score += 5;
          }

          score = Math.max(10, Math.min(100, Math.round(score)));
          const requiresOverride = busyTeams >= 2 || !!compat?.exceedsNominalInTolerance;

          candidates.push({
            craneId: crane.id,
            craneName: crane.name,
            zoneId: z.zoneId,
            zoneCode: z.zoneCode,
            zoneName: z.zoneName,
            time: slot,
            score,
            isPrimary: !!aff?.isPrimary,
            requiresOverride,
            badgeText: aff?.isPrimary ? "Primarna zona" : `Afinitet ${aff?.affinityScore ?? 70}`,
          });
        }
      }
    }

    candidates.sort((a, b) => {
      if (a.requiresOverride !== b.requiresOverride) return a.requiresOverride ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker at equal score (e.g. 100 vs 100): prefer largestCrane for >= 9m vessels
      if (currentLength >= 9 && largestCrane) {
        if (a.craneId === largestCrane.id && b.craneId !== largestCrane.id) return -1;
        if (b.craneId === largestCrane.id && a.craneId !== largestCrane.id) return 1;
      } else if (currentLength > 0 && currentLength < 9 && largestCrane) {
        if (a.craneId !== largestCrane.id && b.craneId === largestCrane.id) return -1;
        if (b.craneId !== largestCrane.id && a.craneId === largestCrane.id) return 1;
      }
      return 0;
    });

    // Deduplicate to show diverse crane/zone/time options (up to 4)
    const distinctFeasibleCranes = new Set(candidates.map((c) => c.craneId)).size;
    const picked: typeof candidates = [];
    const seenKeys = new Set<string>();
    for (const c of candidates) {
      const key = `${c.craneId}-${c.zoneId}-${c.time}`;
      if (seenKeys.has(key)) continue;
      // Avoid a single crane monopolizing all 4 recommendation cards when multiple cranes are feasible
      const sameCraneCount = picked.filter((p) => p.craneId === c.craneId).length;
      if (distinctFeasibleCranes > 1 && sameCraneCount >= 2) continue;
      seenKeys.add(key);
      picked.push(c);
      if (picked.length >= 4) break;
    }

    return picked;
  }, [
    isRetroactiveEntry,
    dailyOverview,
    dateStr,
    activeCranes,
    durationMin,
    reservation?.id,
    landZoneId,
    craneCompatibilityMap,
    affinitiesMatrix,
    isLiftFromSea,
    currentLength,
    largestCrane,
  ]);

  // Live Feasibility & Collision Diagnostics for current selection
  const liveDiagnostics = useMemo(() => {
    const hardBlocks: string[] = [];
    const overrideReasons: string[] = [];
    const infoNotes: string[] = [];

    if (!craneId || !selectedDate || !selectedTime) {
      return { hardBlocks, overrideReasons, infoNotes, status: "incomplete" as const };
    }

    const selectedCrane = activeCranes.find((c: any) => c.id === craneId);
    const craneCompat = craneCompatibilityMap.get(craneId);

    // 1. Vessel already on land check
    if (isLiftFromSea && isVesselOnLand) {
      if (isEdit) {
        infoNotes.push(
          `Plovilo je trenutno evidentirano na kopnu (${activeOccupancy?.zone?.name || "Suhi vez"}) — uređujete postojeću operaciju.`
        );
      } else {
        overrideReasons.push(
          `Plovilo se već nalazi na kopnu (${activeOccupancy?.zone?.name || "Suhi vez"}). Potvrdite svjesni override ako naknadno (retroaktivno) evidentirate operaciju vađenja iz mora.`
        );
      }
    }

    // 2. Non-working day
    if (!isWorkingDay) {
      hardBlocks.push("Odabrani datum je neradni dan.");
    }

    // 3. Crane Weight & Beam checks
    if (selectedCrane && craneCompat) {
      if (craneCompat.exceedsHardLimit) {
        hardBlocks.push(
          `Masa plovila (${currentWeightTons.toFixed(1)} t) prelazi maksimalnu nosivost dizalice ${selectedCrane.name} čak i uz +10% toleranciju (max ${craneCompat.maxToleranceTons.toFixed(1)} t, nominalno ${craneCompat.nominalTons.toFixed(1)} t).`
        );
      } else if (craneCompat.exceedsNominalInTolerance) {
        overrideReasons.push(
          `Prekoračenje nosivosti dizalice ${selectedCrane.name} za +${craneCompat.exceedPct.toFixed(1)}% (${currentWeightTons.toFixed(1)} t > nominalno ${craneCompat.nominalTons.toFixed(1)} t, unutar +10% tolerancije).`
        );
      } else if (craneCompat.exceedsLengthEstimatedWeight) {
        overrideReasons.push(
          `Za plovilo dužine ${currentLength}m bez upisane mase procjenjuje se masa veća od nosivosti dizalice ${selectedCrane.name} (${craneCompat.nominalTons.toFixed(1)} t). Preporučena je veća dizalica.`
        );
      }

      if (craneCompat.exceedsPoolWidth) {
        hardBlocks.push(
          `Širina plovila (${currentBeam.toFixed(2)} m) prelazi širinu bazena dizalice ${selectedCrane.name} (${craneCompat.maxPoolWidth?.toFixed(2)} m).`
        );
      }
    }

    // 4. Crane length guideline (9-15m rule)
    if (
      currentLength >= 9 &&
      currentLength <= 15 &&
      largestCrane &&
      selectedCrane &&
      selectedCrane.id !== largestCrane.id
    ) {
      infoNotes.push(
        `Smjernica lučice: Za plovilo dužine ${currentLength}m (9–15m) preporučena je ${largestCrane.name}.`
      );
    }

    // 5. Slot overlap & team capacity
    if (selectedSlotObj) {
      if (!selectedSlotObj.available && !selectedSlotObj.canOverride && !selectedSlotObj.teamCapacityWarning) {
        hardBlocks.push(
          `Termin ${selectedTime} na dizalici ${selectedCrane?.name || ""} je zauzet (${selectedSlotObj.occupiedBy || "preklapanje termina"}).`
        );
      } else if (selectedSlotObj.teamCapacityWarning || selectedSlotObj.canOverride) {
        overrideReasons.push(
          `Kapacitet posade je popunjen: u terminu ${selectedTime} već rade 2 dizalice (${selectedSlotObj.busyCranesNames?.join(" i ") || "2 aktivna tima"}).`
        );
      }
    }

    // 6. Active Work Stoppages (Hard Block)
    if (dailyOverview?.activeStoppages && dateStr) {
      const durNum = Number(durationMin) || 30;
      const sStart = fromZagreb(dateStr, selectedTime).getTime();
      const sEnd = sStart + durNum * 60000;

      for (const st of dailyOverview.activeStoppages) {
        const stS = new Date(st.startsAt).getTime();
        const stE = st.endsAt ? new Date(st.endsAt).getTime() : Infinity;
        if (sStart < stE && sEnd > stS) {
          if (st.scope === "all_cranes") {
            hardBlocks.push(`Aktivna obustava rada svih dizalica u tom terminu (${st.reason}).`);
          } else if (st.scope === "single_crane" && st.craneId === craneId) {
            hardBlocks.push(`Dizalica ${selectedCrane?.name || ""} ima aktivnu obustavu rada (${st.reason}).`);
          } else if (st.scope === "single_zone" && landZoneId !== "none" && st.zoneId === landZoneId) {
            hardBlocks.push(`Odabrana zona na kopnu ima aktivnu obustavu rada (${st.reason}).`);
          }
        }
      }
    }

    // 7. Crane-Zone Affinity & Zone Free Spots
    if (landZoneId && landZoneId !== "none") {
      const selectedZone = (landZones as any[]).find((z: any) => z.id === landZoneId);
      const zInfo = zoneInfoMap.get(landZoneId);

      if (zInfo && selectedZone) {
        if (zInfo.isBlocked) {
          overrideReasons.push(
            `Blokiran tehnički afinitet: ${selectedCrane?.name || "Odabrana dizalica"} nema standardni tehnički pristup zoni ${selectedZone.code} (${selectedZone.name}).`
          );
        } else if (zInfo.penaltySlots > 0) {
          infoNotes.push(
            `Sekundarna zona ${selectedZone.code} (afinitet ${zInfo.affinityScore}/100, dodatni transport +${zInfo.penaltySlots * 5} min).`
          );
        } else if (zInfo.isPrimary) {
          infoNotes.push(
            `Optimalan par: ${selectedZone.name} (${selectedZone.code}) je primarna zona za ovu dizalicu (${zInfo.affinityScore}/100).`
          );
        }

        if (isLiftFromSea && zInfo.freeSpotsAtSlot <= 0) {
          overrideReasons.push(
            `Zona ${selectedZone.code} (${selectedZone.name}) je popunjena u ovom terminu (0 slobodnih mjesta).`
          );
        }
      }
    } else if (isLiftFromSea) {
      infoNotes.push("Za operaciju dizanja iz mora preporučuje se odabrati zonu na kopnu (suhi vez).");
    }

    const status =
      hardBlocks.length > 0
        ? ("blocked" as const)
        : overrideReasons.length > 0
          ? ("override_required" as const)
          : ("optimal" as const);

    return { hardBlocks, overrideReasons, infoNotes, status };
  }, [
    craneId,
    selectedDate,
    selectedTime,
    activeCranes,
    craneCompatibilityMap,
    isLiftFromSea,
    isVesselOnLand,
    isEdit,
    activeOccupancy,
    isWorkingDay,
    currentWeightTons,
    currentBeam,
    currentLength,
    largestCrane,
    selectedSlotObj,
    dailyOverview,
    dateStr,
    durationMin,
    landZoneId,
    landZones,
    zoneInfoMap,
  ]);

  // Mutations
  const invalidateAll = () => {
    utils.reservation.listAll.invalidate();
    utils.reservation.listDailyOperations.invalidate();
    utils.calendar.events.invalidate();
    utils.landWaiting.listAll.invalidate();
    utils.landDispatch.getDailyOverview.invalidate();
    utils.landDispatch.getSlotRecommendations.invalidate();
  };

  const approveMutation = trpc.reservation.approve.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je uspješno odobrena.");
      invalidateAll();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDetailsMutation = trpc.reservation.updateDetails.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je uspješno ažurirana.");
      invalidateAll();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.reservation.create.useMutation({
    onSuccess: () => {
      toast.success("Nova rezervacija je uspješno kreirana.");
      invalidateAll();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const isSubmitting =
    approveMutation.isPending || updateDetailsMutation.isPending || createMutation.isPending;

  const requiresConsciousOverride = liveDiagnostics.status === "override_required";
  const isHardBlocked = liveDiagnostics.status === "blocked";
  const isOverrideValid =
    !requiresConsciousOverride || (overrideConfirmed && overrideReason.trim().length >= 3);

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || !selectedTime || !craneId) {
      toast.error("Molimo odaberite dizalicu, datum i vrijeme termina.");
      return;
    }

    if (isHardBlocked) {
      toast.error(liveDiagnostics.hardBlocks[0] || "Odabrana kombinacija krši tvrda ograničenja.");
      return;
    }

    if (requiresConsciousOverride) {
      if (!overrideConfirmed) {
        toast.error("Molimo označite potvrdni okvir za svjesni dispečerski override ograničenja.");
        return;
      }
      if (overrideReason.trim().length < 3) {
        toast.error("Molimo unesite razlog za dispečerski override (najmanje 3 znaka).");
        return;
      }
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
        ignoreNoSpace: requiresConsciousOverride && overrideConfirmed,
        overrideTeamCapacity: (requiresConsciousOverride && overrideConfirmed) || undefined,
        overrideReason: requiresConsciousOverride ? overrideReason.trim() : undefined,
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
        overrideTeamCapacity: (requiresConsciousOverride && overrideConfirmed) || undefined,
        overrideReason: requiresConsciousOverride ? overrideReason.trim() : undefined,
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
        vesselWeightTons: vesselWeightTons ? Number(vesselWeightTons) : undefined,
        contactPhone: contactPhone || undefined,
        craneId,
        scheduledStart,
        durationMin: durNum,
        landZoneId: finalZoneId || undefined,
        isAutoApprove: true,
        adminNote: adminNote || undefined,
        overrideTeamCapacity: (requiresConsciousOverride && overrideConfirmed) || undefined,
        overrideReason: requiresConsciousOverride ? overrideReason.trim() : undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[93vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-600 shrink-0" />
            {isApprove && "Odobri / Zakaži termin rezervacije"}
            {isEdit && "Uredi / Premjesti operaciju i termin"}
            {isCreate && "Nova rezervacija s terminom"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isApprove && "Dodijelite optimalnu dizalicu, termin i zonu na kopnu uz provjeru svih ograničenja."}
            {isEdit && "Promijenite dizalicu, termin ili zonu na kopnu uz prikaz preporuka i provjeru kolizija."}
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
                  <span>{reservation.user?.name || reservation.userName || "Korisnik"}</span>
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

              {(reservation.serviceType?.name || reservation.serviceTypeName) && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold">
                  {reservation.serviceType?.name || reservation.serviceTypeName}
                </Badge>
              )}
            </div>

            {/* Vessel row with normalized dimensions & weight */}
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground pt-1.5 border-t border-slate-200/80 dark:border-slate-800">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Ship className="h-3.5 w-3.5 text-blue-600" />
                {reservation.vesselName ||
                  reservation.vessel?.name ||
                  reservation.vesselRegistration ||
                  "Plovilo"}
              </span>

              {(reservation.vesselRegistration || reservation.vessel?.registration) && (
                <Badge variant="secondary" className="font-mono text-[10px] py-0 px-1.5">
                  {reservation.vesselRegistration || reservation.vessel?.registration}
                </Badge>
              )}

              {(currentLength > 0 || currentBeam > 0 || currentWeightTons > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  {currentLength > 0 && (
                    <Badge variant="outline" className="bg-white dark:bg-slate-800 font-semibold py-0 px-1.5">
                      L: {currentLength}m
                    </Badge>
                  )}
                  {currentBeam > 0 && (
                    <Badge variant="outline" className="bg-white dark:bg-slate-800 font-semibold py-0 px-1.5">
                      B: {currentBeam}m
                    </Badge>
                  )}
                  {currentWeightTons > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 font-bold py-0 px-1.5 flex items-center gap-1"
                    >
                      <Weight className="h-2.5 w-2.5" />
                      {currentWeightTons}t
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Requested date / user note if present */}
            {reservation.requestedDate && !reservation.scheduledStart && (
              <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200 dark:border-amber-900 flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span>
                  Željeni datum: <strong>{formatAppDate(reservation.requestedDate)}</strong> (
                  {reservation.requestedTimeSlot || "po dogovoru"})
                </span>
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
                    const v = userVessels.find((item) => item.id === val);
                    if (v) {
                      setVesselName(v.name || "");
                      setVesselRegistration(v.registration || "");
                      setVesselLengthM(v.lengthM ? String(v.lengthM) : "");
                      setVesselBeamM(v.beamM ? String(v.beamM) : "");
                      setVesselWeightTons(v.weightTons ? String(v.weightTons) : "");
                    }
                  }}
                  disabled={!selectedUserId || vesselsLoading}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={vesselsLoading ? "Učitavanje..." : "Odaberite plovilo"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ Unesi novo plovilo</SelectItem>
                    {userVessels.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        ⛵ {v.registration ? `[${v.registration}] ` : ""}
                        {v.name}
                        {v.lengthM || v.beamM || v.weightTons
                          ? ` (${v.lengthM ? `L:${v.lengthM}m` : ""}${v.beamM ? ` B:${v.beamM}m` : ""}${v.weightTons ? ` ${v.weightTons}t` : ""})`
                          : ""}
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
                    {(serviceTypes as any[]).map((st: any) => {
                      const isLift = st.operationCategory === "lift_from_sea";
                      const requiresLandOverride = isVesselOnLand && isLift;
                      return (
                        <SelectItem key={st.id} value={st.id}>
                          {st.name}{" "}
                          {st.operationCategory === "lift_from_sea"
                            ? "⬆️ (Dizanje)"
                            : st.operationCategory === "lower_to_sea"
                              ? "⬇️ (Spuštanje)"
                              : ""}
                          {requiresLandOverride ? " ⚠️ (Na kopnu - uz override)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        {/* Smart Top Recommendations Quick-Pick Bar */}
        {topRecommendations.length > 0 && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/25 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Preporučene optimalne opcije za {selectedDate ? formatAppDate(selectedDate) : "odabrani dan"}:
              </span>
              <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium">
                Kliknite za automatski odabir
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {topRecommendations.map((rec, idx) => {
                const isCurrentPick =
                  craneId === rec.craneId &&
                  (landZoneId === rec.zoneId || (landZoneId === "none" && idx === -1)) &&
                  selectedTime === rec.time;
                return (
                  <button
                    key={`${rec.craneId}-${rec.zoneId}-${rec.time}`}
                    type="button"
                    onClick={() => {
                      setCraneId(rec.craneId);
                      setLandZoneId(rec.zoneId);
                      setSelectedTime(rec.time);
                      toast.info(
                        `Odabrana preporuka: ${rec.craneName} + ${rec.zoneCode} u ${rec.time}h (${rec.score} bodova)`
                      );
                    }}
                    className={cn(
                      "flex items-center justify-between gap-2 p-2 rounded-lg border text-left transition-all text-xs",
                      isCurrentPick
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-xs font-semibold"
                        : "bg-white dark:bg-slate-900 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60 border-indigo-200/80 dark:border-indigo-800 text-slate-800 dark:text-slate-200"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate font-semibold">
                        <span className="font-mono font-bold">{rec.time}h</span>
                        <span>·</span>
                        <span className="truncate">{rec.craneName}</span>
                      </div>
                      <div
                        className={cn(
                          "text-[10px] truncate flex items-center gap-1",
                          isCurrentPick ? "text-indigo-100" : "text-muted-foreground"
                        )}
                      >
                        <span>Zona {rec.zoneCode} ({rec.zoneName})</span>
                        <span>·</span>
                        <span>{rec.badgeText}</span>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 font-mono text-[10px] px-1.5 py-0",
                        isCurrentPick
                          ? "bg-white/20 text-white"
                          : rec.score >= 85
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {rec.score} bod
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* 3. Coupled Crane & Dry Berth Section with Smart Constraints */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Crane Selection */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Construction className="h-3.5 w-3.5 text-blue-600" />
                  Dizalica *
                </Label>
                {currentWeightTons > 0 ? (
                  <span className="text-[10px] text-indigo-600 font-semibold">
                    Masa plovila: {currentWeightTons}t
                  </span>
                ) : !isRetroactiveEntry && topRecommendations.length > 0 ? (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Preporuka: {topRecommendations[0].craneName}
                  </span>
                ) : !isRetroactiveEntry && currentLength >= 5.5 ? (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Bez upisane mase (L:{currentLength}m)
                  </span>
                ) : null}
              </div>
              <Select value={craneId} onValueChange={setCraneId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Odaberite dizalicu" />
                </SelectTrigger>
                <SelectContent>
                  {activeCranes.map((c: any) => {
                    const compat = craneCompatibilityMap.get(c.id);
                    const isTop = largestCrane && c.id === largestCrane.id;
                    const isHardExceeded = compat?.exceedsHardLimit || compat?.exceedsPoolWidth;
                    const isSoftTolerance =
                      compat?.exceedsNominalInTolerance || compat?.exceedsLengthEstimatedWeight;

                    let statusSuffix = "";
                    if (compat) {
                      if (compat.exceedsHardLimit) {
                        statusSuffix = ` ⛔ Preteško (max ${compat.maxToleranceTons.toFixed(1)}t s +10%)`;
                      } else if (compat.exceedsPoolWidth) {
                        statusSuffix = ` ⛔ Preširoko (bazen ${compat.maxPoolWidth}m)`;
                      } else if (compat.exceedsNominalInTolerance) {
                        statusSuffix = ` ⚠️ +${compat.exceedPct.toFixed(1)}% (u 10% toleranciji - override)`;
                      } else if (compat.exceedsLengthEstimatedWeight) {
                        statusSuffix = ` ⚠️ Procjena L:${currentLength}m > ${compat.nominalTons.toFixed(1)}t (override)`;
                      } else {
                        statusSuffix = ` (do ${compat.nominalTons.toFixed(1)}t)${isTop ? " ⭐" : ""}`;
                      }
                    }

                    return (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        disabled={isHardExceeded && c.id !== craneId}
                        className={cn(
                          isHardExceeded && "text-rose-600 line-through opacity-60",
                          isSoftTolerance && "text-amber-700 font-semibold"
                        )}
                      >
                        {c.name}
                        {statusSuffix}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Dry Berth Zone Placement with Crane-Zone Affinity */}
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
                  {(landZones as any[]).map((z: any) => {
                    const zInfo = zoneInfoMap.get(z.id);
                    const free = zInfo ? zInfo.freeSpotsAtSlot : z.totalSpots - (z.activeSpots || 0);

                    let affinityLabel = "";
                    if (craneId && zInfo) {
                      if (zInfo.isBlocked) {
                        affinityLabel = "⛔ Blokiran pristup (override) · ";
                      } else if (zInfo.isPrimary) {
                        affinityLabel = `⭐ Primarna (${zInfo.affinityScore}/100) · `;
                      } else if (zInfo.penaltySlots > 0) {
                        affinityLabel = `⚠️ Sekundarna (+${zInfo.penaltySlots * 5}m) · `;
                      } else {
                        affinityLabel = `Afinitet ${zInfo.affinityScore}/100 · `;
                      }
                    }

                    return (
                      <SelectItem
                        key={z.id}
                        value={z.id}
                        className={cn(
                          zInfo?.isBlocked && "text-amber-700 font-medium",
                          zInfo?.isPrimary && !zInfo?.isBlocked && "text-emerald-800 font-semibold"
                        )}
                      >
                        {z.name} ({z.code}) — {affinityLabel}
                        {free > 0 ? `${free} slobodno` : "⚠️ Popunjeno (override)"}
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
                disablePastDates={false}
              />
              {dateStr && dateStr < toZagreb(new Date()).dateStr && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                  ⏪ Retroaktivni unos (datum u prošlosti)
                </p>
              )}
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
                    <SelectItem value="none" disabled>
                      Neradni dan
                    </SelectItem>
                  ) : allSlots.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nema termina
                    </SelectItem>
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
              🕒 Radno vrijeme ({activeSeasonNotice.seasonName}): {activeSeasonNotice.from} —{" "}
              {activeSeasonNotice.to}h
            </p>
          )}

          {/* LIVE FEASIBILITY & CONSCIOUS OVERRIDE DIAGNOSTIC CARD */}
          {liveDiagnostics.status === "blocked" && (
            <div className="rounded-xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3.5 space-y-2">
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-950 dark:text-rose-200 space-y-1">
                  <p className="font-bold">
                    Tvrda zabrana (Neizvediva kombinacija — spremanje nije dozvoljeno):
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-900 dark:text-rose-300">
                    {liveDiagnostics.hardBlocks.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {liveDiagnostics.status === "override_required" && (
            <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 p-3.5 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 dark:text-amber-200 space-y-1 flex-1">
                  <p className="font-bold">
                    Detektirana ograničenja / kolizije — zahtijeva svjesni dispečerski override:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-900 dark:text-amber-300 font-medium">
                    {liveDiagnostics.overrideReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {liveDiagnostics.infoNotes.length > 0 && (
                    <div className="pt-1 text-[11px] text-amber-800 dark:text-amber-300/80">
                      {liveDiagnostics.infoNotes.map((n, i) => (
                        <div key={i}>ℹ️ {n}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 bg-amber-100/90 dark:bg-amber-900/50 p-2.5 rounded-lg border border-amber-300 dark:border-amber-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={overrideConfirmed}
                  onChange={(e) => setOverrideConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  Svjesno potvrđujem dispečerski override navedenih ograničenja
                </span>
              </label>

              {overrideConfirmed && (
                <div className="space-y-1.5 pt-0.5">
                  <Label className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Obvezan razlog dispečerskog overridea *
                  </Label>
                  <Input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Unesite razlog (npr. Preraspodjela osoblja na terenu)..."
                    className="rounded-lg bg-white dark:bg-slate-900 border-amber-300 text-xs"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {QUICK_OVERRIDE_REASONS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setOverrideReason(preset)}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300/80 transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {liveDiagnostics.status === "optimal" && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 p-2.5 flex items-start gap-2 text-xs text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  Izvedivo bez kolizija — sva ograničenja nosivosti, timova i zona su zadovoljena.
                </p>
                {liveDiagnostics.infoNotes.map((note, idx) => (
                  <p key={idx} className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Quick pick slot chips */}
          {isWorkingDay &&
            (freeSlots.length > 0 ||
              allSlots.filter((s: any) => s.teamCapacityWarning || s.canOverride).length > 0) && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  ⚡ Brzi odabir slobodnih termina na odabranoj dizalici:
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
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/50">
                    <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 mr-1 flex items-center gap-1">
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
                                : "bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-300 border border-amber-300 hover:bg-amber-100"
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

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {onOpenWorkOrder &&
                reservation &&
                (reservation.status === "approved" || reservation.status === "in_progress") && (
                  <Button
                    type="button"
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenWorkOrder(reservation);
                    }}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Radni nalog
                  </Button>
                )}
              {onCancelReservation &&
                reservation &&
                (reservation.status === "approved" || reservation.status === "pending") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5 text-xs"
                    onClick={() => onCancelReservation(reservation)}
                    disabled={isCancelling || isSubmitting}
                  >
                    {isCancelling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    Otkaži termin
                  </Button>
                )}
            </div>

            <div className="flex gap-2 justify-end">
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
                className={cn(
                  "rounded-xl text-white font-semibold",
                  requiresConsciousOverride
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                )}
                disabled={
                  isSubmitting ||
                  !craneId ||
                  !selectedDate ||
                  !selectedTime ||
                  isHardBlocked ||
                  !isOverrideValid
                }
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isApprove && <Check className="h-4 w-4 mr-1.5" />}
                {requiresConsciousOverride
                  ? isApprove
                    ? "Odobri uz svjesni override"
                    : "Spremi uz svjesni override"
                  : isApprove
                    ? "Odobri i zakaži"
                    : isEdit
                      ? "Spremi promjene"
                      : "Kreiraj rezervaciju"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
