import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ListOrdered,
  Loader2,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  Send,
  Ban,
  RefreshCw,
  CalendarClock,
  Layers,
  Ship,
  Phone,
  Mail,
  ArrowDownCircle,
  SlidersHorizontal,
  AlertTriangle,
  Info,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate, formatToSqlDate, fromZagreb, toZagreb } from "@/lib/date-utils";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { cn } from "@/lib/utils";

export default function AdminLandWaiting() {
  const { lang } = useLang();
  const isHr = lang === "hr";

  // Assign berth only dialog states (when offer accepted)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignEntryId, setAssignEntryId] = useState<string | null>(null);
  const [assignZoneId, setAssignZoneId] = useState("");
  const [assignSpotNumber, setAssignSpotNumber] = useState("");

  // Unified Scheduling dialog states (Crane + Dry berth)
  const [directAssignDialogOpen, setDirectAssignDialogOpen] = useState(false);
  const [directAssignEntry, setDirectAssignEntry] = useState<any | null>(null);
  const [userId, setUserId] = useState("");
  const [vesselId, setVesselId] = useState("");
  const [directZoneId, setDirectZoneId] = useState("");
  const [directSpotNumber, setDirectSpotNumber] = useState("");
  const [directCraneId, setDirectCraneId] = useState("");
  const [directDate, setDirectDate] = useState<Date | undefined>(new Date());
  const [directTime, setDirectTime] = useState("08:00");
  const [directDuration, setDirectDuration] = useState("30");
  const [directAdminNote, setDirectAdminNote] = useState("");

  const utils = trpc.useUtils();

  const { data: waiting = [], isLoading: waitingLoading } = trpc.landWaiting.listAll.useQuery();
  const { data: overview, isLoading: overviewLoading } = trpc.landWaiting.getOverview.useQuery();
  const { data: zones = [] } = trpc.landZone.list.useQuery();
  const { data: cranes = [] } = trpc.crane.list.useQuery();
  const { data: usersListRes } = trpc.user.list.useQuery({ pageSize: 1000 });
  const usersList = usersListRes?.data || [];

  const { data: userVessels = [], isLoading: vesselsLoading } = trpc.vessel.listByUser.useQuery(
    { userId },
    { enabled: !!userId }
  );

  // Available slots query for direct assign dialog (mirrors ReservationScheduleModal)
  const directDateStr = directDate ? formatToSqlDate(directDate) : "";
  const directSlotsQuery = trpc.calendar.availableSlots.useQuery(
    {
      craneId: directCraneId || undefined,
      date: directDateStr,
      durationMin: Number(directDuration) || 30,
    },
    {
      enabled: directAssignDialogOpen && !!directDate && !!directCraneId,
      refetchOnWindowFocus: false,
    }
  );
  const directSlotData = directSlotsQuery.data;
  const directAllSlots = directSlotData?.slots || [];
  const directFreeSlots = directSlotData?.availableSlots || [];
  const directIsWorkingDay = directSlotData?.isWorkingDay ?? true;
  const directWorkingHours = directSlotData?.workingHours;
  const directSeasonName = directSlotData?.seasonName;

  // Identify the largest crane (highest capacity in kN) for PŠD Špinut 9-15m rule
  const largestCrane = [...cranes]
    .filter(c => c.craneStatus === "active")
    .sort((a, b) => (Number(b.maxCapacityKN) || 0) - (Number(a.maxCapacityKN) || 0))[0];

  const defaultCrane = cranes.find(c => c.craneStatus === "active");

  const offerMutation = trpc.landWaiting.offer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Ponuda je uspješno poslana korisniku." : "Offer successfully sent.");
      utils.landWaiting.listAll.invalidate();
      utils.landWaiting.getOverview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const declineMutation = trpc.landWaiting.declineOffer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Zabilježeno je odbijanje ponude." : "Vessel decline recorded.");
      utils.landWaiting.listAll.invalidate();
      utils.landWaiting.getOverview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeMutation = trpc.landWaiting.remove.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Zahtjev je uklonjen s liste." : "Waitlist entry cancelled.");
      utils.landWaiting.listAll.invalidate();
      utils.landWaiting.getOverview.invalidate();
      utils.reservation.listAll.invalidate();
      utils.calendar.events.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const assignMutation = trpc.landWaiting.assignFromOffer.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Mjesto je uspješno dodijeljeno." : "Dry berth spot successfully assigned.");
      utils.landWaiting.listAll.invalidate();
      utils.landWaiting.getOverview.invalidate();
      utils.reservation.listAll.invalidate();
      utils.landZone.list.invalidate();
      utils.calendar.events.invalidate();
      setAssignDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const directAssignMutation = trpc.landWaiting.directAssign.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Uspješno dodijeljena dizalica i suhi vez." : "Successfully scheduled crane and dry berth spot.");
      utils.landWaiting.listAll.invalidate();
      utils.landWaiting.getOverview.invalidate();
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      utils.landZone.list.invalidate();
      utils.calendar.events.invalidate();
      setDirectAssignDialogOpen(false);
      setDirectAssignEntry(null);
      setUserId("");
      setVesselId("");
      setDirectCraneId("");
      setDirectZoneId("");
      setDirectSpotNumber("");
      setDirectDate(new Date());
      setDirectTime("08:00");
      setDirectDuration("30");
      setDirectAdminNote("");
    },
    onError: (error) => toast.error(error.message),
  });

  const reorderMutation = trpc.landWaiting.reorder.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Redoslijed liste je uspješno spremljen." : "Waitlist reordered.");
      utils.landWaiting.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleMove = (index: number, direction: "up" | "down") => {
    const nextList = [...waiting];
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= nextList.length) return;

    const temp = nextList[index];
    nextList[index] = nextList[swapWith];
    nextList[swapWith] = temp;

    reorderMutation.mutate(nextList.map(item => item.id));
  };

  const openAssign = (entry: any) => {
    setAssignEntryId(entry.id);
    setAssignZoneId(entry.preferredZoneId || "");
    setAssignSpotNumber("");
    setAssignDialogOpen(true);
  };

  // Open modal from top button for a new assignment
  const openNewSchedule = () => {
    setDirectAssignEntry(null);
    setUserId("");
    setVesselId("");
    setDirectZoneId(overview?.zones?.[0]?.id || "");
    setDirectSpotNumber("");
    setDirectCraneId(defaultCrane?.id || "");
    setDirectDate(new Date());
    setDirectTime("08:00");
    setDirectDuration("30");
    setDirectAdminNote("");
    setDirectAssignDialogOpen(true);
  };

  // Open modal for an existing waitlist candidate
  const openDirectAssign = (entry: any) => {
    setDirectAssignEntry(entry);
    setUserId(entry.userId);
    setVesselId(entry.vesselId || "");
    setDirectZoneId(entry.preferredZoneId || (overview?.zones?.[0]?.id || ""));
    setDirectSpotNumber("");

    const vesselLength = Number(entry.vessel?.lengthM) || 0;
    const isLargeVessel = vesselLength >= 9 && vesselLength <= 15;

    // Feedback coupling: preselect crane from linked reservation or pick largest for 9-15m
    const preselectedCraneId =
      entry.crane?.id ||
      entry.reservation?.craneId ||
      (isLargeVessel && largestCrane ? largestCrane.id : (defaultCrane?.id || ""));

    setDirectCraneId(preselectedCraneId);

    if (entry.reservation?.scheduledStart) {
      const zDate = toZagreb(entry.reservation.scheduledStart);
      setDirectDate(new Date(entry.reservation.scheduledStart));
      setDirectTime(zDate.timeStr || "08:00");
    } else if (entry.reservation?.requestedDate) {
      setDirectDate(new Date(entry.reservation.requestedDate));
      setDirectTime("08:00");
    } else {
      setDirectDate(new Date());
      setDirectTime("08:00");
    }

    setDirectDuration(entry.reservation?.durationMin ? String(entry.reservation.durationMin) : "30");
    setDirectAdminNote(entry.note || entry.adminNote || "");
    setDirectAssignDialogOpen(true);
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignEntryId || !assignZoneId) {
      toast.error(isHr ? "Odaberite zonu." : "Select a zone.");
      return;
    }
    assignMutation.mutate({
      id: assignEntryId,
      zoneId: assignZoneId,
      spotNumber: assignSpotNumber ? Number(assignSpotNumber) : undefined,
    });
  };

  const handleDirectAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directAssignEntry && !userId) {
      toast.error(isHr ? "Molimo odaberite korisnika." : "Please select a user.");
      return;
    }
    if (!directCraneId || !directDate || !directTime) {
      toast.error(isHr ? "Molimo popunite sva obavezna polja (dizalica, datum, vrijeme)." : "Please fill in all required fields.");
      return;
    }
    const dateStr = formatToSqlDate(directDate);
    const scheduledStart = fromZagreb(dateStr, directTime);

    directAssignMutation.mutate({
      id: directAssignEntry ? directAssignEntry.id : undefined,
      userId: directAssignEntry ? undefined : userId,
      vesselId: directAssignEntry ? undefined : (vesselId || undefined),
      craneId: directCraneId,
      zoneId: directZoneId || undefined,
      spotNumber: directSpotNumber ? Number(directSpotNumber) : undefined,
      scheduledStart,
      durationMin: Number(directDuration),
      adminNote: directAdminNote || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">{isHr ? "Čeka" : "Waiting"}</Badge>;
      case "offered":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">{isHr ? "Ponuda poslana" : "Offered"}</Badge>;
      case "declined":
        return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">{isHr ? "Odbio ponudu" : "Declined"}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Compute overall capacity numbers
  const totalDrySpots = overview?.zones?.reduce((acc, z) => acc + (z.totalSpots || 0), 0) || 0;
  const totalDryFree = overview?.zones?.reduce((acc, z) => acc + (z.freeSpots || 0), 0) || 0;
  const totalDryOccupied = overview?.zones?.reduce((acc, z) => acc + (z.totalOccupied || 0), 0) || 0;
  const totalLaunches = overview?.zones?.reduce((acc, z) => acc + (z.upcomingLaunchesCount || 0), 0) || 0;

  // Active vessel in dialog (for length rules & guidance)
  const currentModalVessel = directAssignEntry
    ? directAssignEntry.vessel
    : userVessels.find(v => v.id === vesselId);
  const currentVesselLength = Number(currentModalVessel?.lengthM) || 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">
              {isHr ? "Lista čekanja za suhi vez i nadzor kapaciteta" : "Dry Berth Waitlist & Capacity Monitor"}
            </h2>
            <Badge variant="secondary" className="font-semibold text-xs">
              {waiting.length} {isHr ? "na listi" : "in queue"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isHr
              ? "Integrirani nadzor raspoloživosti kopna i dizalica (maks. dužina 15m • plovila 9-15m na najveću dizalicu)."
              : "Integrated monitoring of dry berth zones and crane loads (max vessel length 15m • 9-15m on largest crane)."}
          </p>
        </div>

        {/* Top button directly opens the unified scheduling form */}
        <Button
          onClick={openNewSchedule}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm gap-2 font-semibold"
        >
          <CalendarClock className="h-4 w-4" />
          {isHr ? "Rasporedi (Dizalica + Vez)" : "Schedule (Crane + Berth)"}
        </Button>
      </div>

      {/* Real-time Integrated Overview: Dry Berth Zones + Cranes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 cols: Dry Berth Zones Status */}
        <Card className="lg:col-span-7 rounded-2xl border-muted/80 shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    {isHr ? "Kapacitet zona na kopnu (Suhi vez)" : "Dry Berth Zones Status"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isHr
                      ? `Ukupno: ${totalDryOccupied}/${totalDrySpots} zauzeto • ${totalDryFree} slobodno`
                      : `Total: ${totalDryOccupied}/${totalDrySpots} occupied • ${totalDryFree} free`}
                  </CardDescription>
                </div>
              </div>

              {totalLaunches > 0 && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 text-xs gap-1">
                  <ArrowDownCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  {isHr ? `${totalLaunches} najavljenih spuštanja` : `${totalLaunches} launches planned`}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {overviewLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !overview?.zones || overview.zones.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {isHr ? "Nema konfiguriranih zona na kopnu." : "No dry berth zones configured."}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overview.zones.map((zone) => {
                  const pct = zone.totalSpots > 0 ? Math.round((zone.totalOccupied / zone.totalSpots) * 100) : 0;
                  const isFull = zone.freeSpots <= 0;
                  return (
                    <div
                      key={zone.id}
                      className="p-3 rounded-xl border border-muted bg-card hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm">{zone.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
                              {zone.code}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {zone.totalOccupied} / {zone.totalSpots} {isHr ? "mjesta" : "spots"}
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={
                            isFull
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-semibold"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-semibold"
                          }
                        >
                          {isFull
                            ? (isHr ? "Popunjeno" : "Full")
                            : (isHr ? `${zone.freeSpots} slobodno` : `${zone.freeSpots} free`)}
                        </Badge>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-muted/60 rounded-full h-1.5 mt-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 100
                              ? "bg-rose-500"
                              : pct >= 80
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>

                      {zone.upcomingLaunchesCount > 0 && (
                        <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                          <ArrowDownCircle className="h-3 w-3" />
                          {isHr
                            ? `${zone.upcomingLaunchesCount} plovilo u planu za spuštanje`
                            : `${zone.upcomingLaunchesCount} scheduled for launch`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right 5 cols: Crane Daily Load Status */}
        <Card className="lg:col-span-5 rounded-2xl border-muted/80 shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">
                  {isHr ? "Dizalice — Zauzetost danas" : "Cranes — Today's Load"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {isHr ? "Dizalice lučice i zakazane operacije" : "Scheduled operations for today"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {overviewLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !overview?.cranes || overview.cranes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {isHr ? "Nema aktivnih dizalica." : "No active cranes."}
              </p>
            ) : (
              <div className="space-y-3">
                {overview.cranes.map((crane) => {
                  const isTopCrane = largestCrane && crane.id === largestCrane.id;
                  return (
                    <div
                      key={crane.id}
                      className="p-3 rounded-xl border border-muted bg-card flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm">{crane.name}</span>
                          {isTopCrane && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300">
                              {isHr ? "Najveća (9-15m)" : "Largest (9-15m)"}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {crane.location || (isHr ? "Glavni dok" : "Main dock")} • {crane.maxCapacityKN} kN
                        </div>
                      </div>

                      <div className="text-right">
                        <Badge
                          variant="secondary"
                          className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 font-semibold text-xs"
                        >
                          {crane.bookingsCountForDate}{" "}
                          {isHr ? "operacija danas" : "operations today"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Waitlist Table Card */}
      <Card className="rounded-2xl border-muted shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold">
                {isHr ? "Kandidati na listi čekanja za suhi vez" : "Dry Berth Waitlist Candidates"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isHr
                  ? "Povezani status dizalice i mjesta na kopnu. Plovila od 9-15 m se u pravilu podižu najvećom dizalicom (maks. 15 m)."
                  : "Coupled crane & dry berth status. Vessels 9-15m are assigned to largest crane (max 15m)."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {waitingLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : waiting.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListOrdered className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {isHr ? "Trenutno nema korisnika na listi čekanja." : "No entries on the waitlist."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>{isHr ? "Korisnik" : "User"}</TableHead>
                    <TableHead>{isHr ? "Plovilo & Dimenzije" : "Vessel & Dimensions"}</TableHead>
                    <TableHead>{isHr ? "Dizalica i Termin" : "Crane & Slot"}</TableHead>
                    <TableHead>{isHr ? "Zona kopna" : "Dry Berth Zone"}</TableHead>
                    <TableHead>{isHr ? "Status" : "Status"}</TableHead>
                    <TableHead className="text-center">{isHr ? "Odbijanja" : "Declines"}</TableHead>
                    <TableHead>{isHr ? "Prijavljeno" : "Registered At"}</TableHead>
                    <TableHead className="text-right">{isHr ? "Akcije" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waiting.map((entry: any, idx: number) => {
                    const vessel = entry.vessel;
                    const hasDims = vessel?.lengthM || vessel?.beamM;
                    const vesselLength = Number(vessel?.lengthM) || 0;
                    const isOver15 = vesselLength > 15;
                    const is9to15 = vesselLength >= 9 && vesselLength <= 15;

                    return (
                      <TableRow
                        key={entry.id}
                        className={entry.status === "offered" ? "bg-blue-50/20 dark:bg-blue-950/20" : ""}
                      >
                        <TableCell className="font-semibold text-center text-muted-foreground text-xs">
                          {idx + 1}
                        </TableCell>

                        {/* User info */}
                        <TableCell>
                          <div className="font-semibold text-sm">{entry.user.name || "Korisnik"}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {entry.user.email && (
                              <span className="flex items-center gap-0.5">
                                <Mail className="h-3 w-3" /> {entry.user.email}
                              </span>
                            )}
                            {entry.user.phone && (
                              <span className="flex items-center gap-0.5 ml-1">
                                <Phone className="h-3 w-3" /> {entry.user.phone}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Vessel info & dimensions */}
                        <TableCell>
                          {vessel ? (
                            <div>
                              <div className="flex items-center gap-1.5 font-medium text-xs">
                                <Ship className="h-3.5 w-3.5 text-primary/70" />
                                <span>{vessel.name}</span>
                                {vessel.registration && (
                                  <Badge variant="secondary" className="text-[10px] py-0 px-1 font-mono">
                                    {vessel.registration}
                                  </Badge>
                                )}
                              </div>
                              {hasDims ? (
                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                                  {vessel.lengthM ? `L: ${vessel.lengthM}m` : ""}
                                  {vessel.lengthM && vessel.beamM ? " × " : ""}
                                  {vessel.beamM ? `B: ${vessel.beamM}m` : ""}
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {isHr ? "Dimenzije nisu unesene" : "No dimensions recorded"}
                                </div>
                              )}
                              {isOver15 && (
                                <Badge variant="destructive" className="text-[10px] mt-1 py-0 px-1 font-semibold">
                                  ⚠️ &gt;15m (Limit Špinut)
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Coupled Crane & Scheduled Slot */}
                        <TableCell>
                          {entry.crane?.name ? (
                            <div>
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 text-xs font-semibold">
                                  🏗️ {entry.crane.name}
                                </Badge>
                              </div>
                              {entry.reservation?.scheduledStart ? (
                                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                                  <CalendarClock className="h-3 w-3 text-indigo-500" />
                                  <span>{formatAppDate(entry.reservation.scheduledStart)} {toZagreb(entry.reservation.scheduledStart).timeStr}</span>
                                </div>
                              ) : entry.reservation?.requestedDate ? (
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  {isHr ? "Zatraženo:" : "Req:"} {formatAppDate(entry.reservation.requestedDate)} ({entry.reservation.requestedTimeSlot || "Jutro"})
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div>
                              {is9to15 ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 text-[11px]">
                                  📐 9–15m → Velika dizalica
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  {isHr ? "Čeka dodjelu dizalice" : "Crane pending"}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Preferred zone */}
                        <TableCell>
                          {entry.preferredZone ? (
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                              {entry.preferredZone.name} ({entry.preferredZone.code})
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{isHr ? "Bilo koja" : "Any"}</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>

                        {/* Declines */}
                        <TableCell className="text-center font-medium">
                          <span className={entry.declineCount >= 2 ? "text-destructive font-bold" : ""}>
                            {entry.declineCount}
                          </span>
                        </TableCell>

                        {/* Created At */}
                        <TableCell className="text-muted-foreground text-xs">
                          {formatAppDate(entry.createdAt)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reorder Buttons */}
                            <div className="flex flex-col gap-0.5 mr-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 rounded hover:bg-accent"
                                disabled={idx === 0 || reorderMutation.isPending}
                                onClick={() => handleMove(idx, "up")}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 rounded hover:bg-accent"
                                disabled={idx === waiting.length - 1 || reorderMutation.isPending}
                                onClick={() => handleMove(idx, "down")}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Primary Unified Action: Schedule Crane & Dry Berth */}
                            <Button
                              size="sm"
                              className="h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs text-xs font-semibold px-2.5"
                              onClick={() => openDirectAssign(entry)}
                            >
                              <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                              {isHr ? "Rasporedi (Dizalica + Vez)" : "Schedule (Crane + Berth)"}
                            </Button>

                            {/* Status-specific helpers */}
                            {entry.status === "waiting" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50 text-xs px-2"
                                onClick={() => offerMutation.mutate({ id: entry.id })}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                {isHr ? "Ponudi" : "Offer"}
                              </Button>
                            )}

                            {entry.status === "offered" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50 text-xs px-2"
                                  onClick={() => openAssign(entry)}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  {isHr ? "Dodijeli vez" : "Assign Berth"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg text-amber-600 border-amber-200 hover:bg-amber-50 text-xs px-2"
                                  onClick={() => {
                                    if (confirm(isHr ? "Označiti da je korisnik odbio ponudu?" : "Mark as declined by user?")) {
                                      declineMutation.mutate({ id: entry.id });
                                    }
                                  }}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  {isHr ? "Odbio" : "Decline"}
                                </Button>
                              </>
                            )}

                            {entry.status === "declined" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg text-blue-600 border-blue-200 hover:bg-blue-50 text-xs px-2"
                                onClick={() => offerMutation.mutate({ id: entry.id })}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                {isHr ? "Ponudi opet" : "Offer again"}
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm(isHr ? "Ukloniti s liste čekanja?" : "Remove from waitlist?")) {
                                  removeMutation.mutate({ id: entry.id });
                                }
                              }}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Scheduling Dialog: Crane + Dry Berth (used for both "+ Rasporedi" and row actions) */}
      <Dialog open={directAssignDialogOpen} onOpenChange={setDirectAssignDialogOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-indigo-600" />
              {directAssignEntry
                ? (isHr ? "Rasporedi termin dizalice i suhog veza" : "Schedule Crane & Dry Berth Spot")
                : (isHr ? "Nova dodjela: Dizalica i suhi vez" : "New Assignment: Crane & Dry Berth")}
            </DialogTitle>
          </DialogHeader>

          {/* 1. Candidate Info OR User & Vessel Selection */}
          {directAssignEntry ? (
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border text-xs space-y-1 my-1">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm text-foreground">
                  {directAssignEntry.user.name}
                </span>
                <span className="text-muted-foreground">{directAssignEntry.user.phone || directAssignEntry.user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground pt-1">
                <span>⛵ {directAssignEntry.vessel?.name || "—"}</span>
                {directAssignEntry.vessel?.registration && (
                  <Badge variant="outline" className="font-mono text-[10px] py-0 px-1">
                    {directAssignEntry.vessel.registration}
                  </Badge>
                )}
                {(directAssignEntry.vessel?.lengthM || directAssignEntry.vessel?.beamM) && (
                  <span className="font-mono font-medium text-foreground">
                    ({directAssignEntry.vessel?.lengthM ? `L: ${directAssignEntry.vessel.lengthM}m` : ""}
                    {directAssignEntry.vessel?.lengthM && directAssignEntry.vessel?.beamM ? ", " : ""}
                    {directAssignEntry.vessel?.beamM ? `B: ${directAssignEntry.vessel.beamM}m` : ""})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-1 border-b">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Korisnik (Vlasnik)" : "Owner"} *</Label>
                <UserSearchCombobox
                  users={usersList as any}
                  value={userId}
                  onChange={setUserId}
                  placeholder={isHr ? "Pretraži i odaberi korisnika..." : "Search and select user..."}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Plovilo" : "Vessel"}</Label>
                <Select value={vesselId} onValueChange={setVesselId} disabled={!userId || vesselsLoading}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={
                      vesselsLoading ? "..." : (isHr ? "Odaberite plovilo" : "Select vessel")
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {userVessels.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        ⛵ {v.registration ? `[${v.registration}] ` : ""}{v.name}
                        {(v.lengthM || v.beamM) ? ` (${v.lengthM ? `L:${v.lengthM}m` : ""} ${v.beamM ? `B:${v.beamM}m` : ""})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* PŠD Špinut Guidelines & Rules Alert */}
          {currentVesselLength > 15 ? (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>{isHr ? "Upozorenje na limit lučice:" : "Marina limit warning:"}</strong>{" "}
                {isHr
                  ? `Dužina plovila je ${currentVesselLength} m. Maksimalna dozvoljena dužina plovila za lučicu PŠD Špinut je 15 metara.`
                  : `Vessel length is ${currentVesselLength}m. Maximum allowed length in PŠD Špinut marina is 15 meters.`}
              </div>
            </div>
          ) : currentVesselLength >= 9 ? (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>{isHr ? "Preporuka dizalice (PŠD Špinut):" : "Crane recommendation:"}</strong>{" "}
                {isHr
                  ? `Plovilo dužine ${currentVesselLength} m (kategorija 9–15 m) podiže se najvećom dizalicom.`
                  : `Vessel length ${currentVesselLength}m (category 9-15m) is handled by the largest crane.`}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleDirectAssignSubmit} className="space-y-4 pt-1">
            {/* 2. Dry Berth Spot Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Zona na kopnu" : "Dry Berth Zone"}</Label>
                <Select value={directZoneId} onValueChange={setDirectZoneId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={isHr ? "Odaberite zonu" : "Select zone"} />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => {
                      const zoneOverview = overview?.zones?.find(oz => oz.id === z.id);
                      const free = zoneOverview ? zoneOverview.freeSpots : z.totalSpots - z.activeSpots;
                      return (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name} ({free > 0 ? `${free} slobodno` : "Popunjeno"})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Broj mjesta (opcijski)" : "Spot Number (Optional)"}</Label>
                <Input
                  className="rounded-xl"
                  placeholder="npr. 12"
                  value={directSpotNumber}
                  onChange={e => setDirectSpotNumber(e.target.value)}
                />
              </div>
            </div>

            {/* 3. Crane Selection */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">{isHr ? "Dizalica" : "Crane"} *</Label>
                {currentVesselLength >= 9 && currentVesselLength <= 15 && largestCrane && (
                  <span className="text-[11px] text-amber-600 font-medium">
                    {isHr ? `Preporučeno: ${largestCrane.name}` : `Recommended: ${largestCrane.name}`}
                  </span>
                )}
              </div>
              <Select value={directCraneId} onValueChange={setDirectCraneId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={isHr ? "Odaberite dizalicu" : "Select crane"} />
                </SelectTrigger>
                <SelectContent>
                  {cranes.filter(c => c.craneStatus === "active").map(c => {
                    const isTop = largestCrane && c.id === largestCrane.id;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {isTop ? `⭐ (${isHr ? "Najveća - za 9-15m" : "Largest - 9-15m"})` : (c.location ? `(${c.location})` : "")}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Date and 30-min Slot */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Datum dizanja" : "Date"} *</Label>
                <Input
                  className="rounded-xl"
                  type="date"
                  value={directDate ? formatToSqlDate(directDate) : ""}
                  onChange={e => setDirectDate(e.target.value ? new Date(e.target.value) : undefined)}
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    {isHr ? "Vrijeme termina" : "Slot Time"} *
                  </Label>
                  {directSlotsQuery.isFetching && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {isHr ? "Provjera..." : "Checking..."}
                    </span>
                  )}
                </div>
                <Select value={directTime} onValueChange={setDirectTime} disabled={!directCraneId || !directDate}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {!directIsWorkingDay ? (
                      <SelectItem value="none" disabled>{isHr ? "Neradni dan" : "Non-working day"}</SelectItem>
                    ) : directAllSlots.length === 0 ? (
                      <SelectItem value="none" disabled>{isHr ? "Nema termina" : "No slots available"}</SelectItem>
                    ) : (
                      directAllSlots.map((slot: any) => (
                        <SelectItem
                          key={slot.time}
                          value={slot.time}
                          disabled={!slot.available}
                          className={!slot.available ? "text-muted-foreground opacity-60 line-through" : "text-emerald-700 font-medium"}
                        >
                          {slot.available ? `✓ ${slot.time} (${isHr ? "Slobodno" : "Free"})` : `✗ ${slot.time} (${isHr ? "Zauzeto" : "Busy"})`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{isHr ? "Trajanje" : "Duration"} *</Label>
                <Select value={directDuration} onValueChange={setDirectDuration}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">60 min (1 h)</SelectItem>
                    <SelectItem value="90">90 min (1.5 h)</SelectItem>
                    <SelectItem value="120">120 min (2 h)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Season working hours notice */}
            {directWorkingHours && directSeasonName && (
              <p className="text-[11px] text-primary/80 font-medium flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
                🕒 {isHr ? "Radno vrijeme" : "Working hours"} ({directSeasonName}): {directWorkingHours.from} — {directWorkingHours.to}h
              </p>
            )}

            {/* Non-working day warning */}
            {!directIsWorkingDay && directCraneId && directDate && (
              <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
                ⚠️ {isHr ? "Odabrani datum je neradni dan prema aktivnoj sezoni." : "Selected date is a non-working day in the active season."}
              </p>
            )}

            {/* Quick-pick free slot chips */}
            {directIsWorkingDay && directFreeSlots.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                  ⚡ {isHr ? "Brzi odabir slobodnog 30-min termina:" : "Quick pick free slot:"}
                </span>
                <div className="flex flex-wrap gap-1.5 p-2 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 max-h-24 overflow-y-auto">
                  {directFreeSlots.map((slot: string) => {
                    const isSelected = directTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setDirectTime(slot)}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-xs font-mono font-medium transition-all shadow-xs",
                          isSelected
                            ? "bg-emerald-600 text-white font-bold ring-2 ring-emerald-400"
                            : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-slate-800 dark:text-emerald-300 dark:border-emerald-800"
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Operator note */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{isHr ? "Napomena operatera" : "Operator Note"}</Label>
              <Input
                className="rounded-xl"
                value={directAdminNote}
                onChange={e => setDirectAdminNote(e.target.value)}
                placeholder={isHr ? "Interna napomena za radni nalog..." : "Internal note for work order..."}
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setDirectAssignDialogOpen(false)}
              >
                {isHr ? "Odustani" : "Cancel"}
              </Button>
              <Button
                type="submit"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={directAssignMutation.isPending || (!directAssignEntry && !userId) || !directCraneId || !directDate}
              >
                {directAssignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Potvrdi i dodijeli termin" : "Confirm & Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign dry berth spot ONLY dialog (when offer was accepted) */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {isHr ? "Dodijeli mjesto na kopnu" : "Assign Land Spot"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>{isHr ? "Zona" : "Zone"} *</Label>
              <Select value={assignZoneId} onValueChange={setAssignZoneId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={isHr ? "Odaberite zonu" : "Select zone"} /></SelectTrigger>
                <SelectContent>
                  {zones.map(z => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name} ({z.activeSpots}/{z.totalSpots})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{isHr ? "Broj mjesta (Opcijski)" : "Spot Number (Optional)"}</Label>
              <Input
                className="rounded-xl"
                type="number"
                placeholder="npr. 12"
                value={assignSpotNumber}
                onChange={e => setAssignSpotNumber(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setAssignDialogOpen(false)}>{isHr ? "Odustani" : "Cancel"}</Button>
              <Button type="submit" className="rounded-xl" disabled={assignMutation.isPending || !assignZoneId}>
                {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isHr ? "Potvrdi i dodijeli" : "Confirm & Assign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
