import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DatePicker } from "@/components/ui/date-picker";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Loader2,
  User,
  X,
  MessageSquare,
  Plus,
  LayoutGrid,
  List,
  Anchor,
  Clock,
  Lock,
  RotateCcw,
  Construction,
  MapPin,
  Pencil,
  FileText,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ReservationChat } from "@/components/ReservationChat";
import { AdminReservationForm } from "@/components/AdminReservationForm";
import { WorkOrderExecutionDialog } from "@/components/WorkOrderExecutionDialog";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function AdminReservations() {
  const { lang } = useLang();

  // View mode & filters
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedUser, setSelectedUser] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Approve dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveCraneId, setApproveCraneId] = useState("");
  const [approveDate, setApproveDate] = useState<Date | undefined>(undefined);
  const [approveTime, setApproveTime] = useState("");
  const [approveDuration, setApproveDuration] = useState("60");
  const [adminNote, setAdminNote] = useState("");
  const [approveVesselRegistration, setApproveVesselRegistration] = useState("");
  const [approveContactPhone, setApproveContactPhone] = useState("");

  // Edit details dialog state
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editDetailsId, setEditDetailsId] = useState<string | null>(null);
  const [editVesselRegistration, setEditVesselRegistration] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editAdminNote, setEditAdminNote] = useState("");

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  // Chat dialog state
  const [chatReservationId, setChatReservationId] = useState<string | null>(null);

  // Work order execution dialog state
  const [selectedWorkOrderRes, setSelectedWorkOrderRes] = useState<any | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status && ["pending", "approved", "waitlisted", "rejected", "cancelled", "completed", "all"].includes(status)) {
      setStatusFilter(status);
      // If URL specifically specifies a status other than board defaults, open list view
      if (["rejected", "cancelled", "completed", "all"].includes(status)) {
        setViewMode("list");
      }
    }
  }, []);

  // Board query fetches all active statuses (pending, waitlisted, approved)
  const boardStatusFilter = ["pending", "waitlisted", "approved"];

  const reservationsQuery = trpc.reservation.listAll.useQuery(
    {
      status: viewMode === "board" ? boardStatusFilter : (statusFilter !== "all" ? [statusFilter] : undefined),
      userId: selectedUser !== "all" ? selectedUser : undefined,
      page: viewMode === "board" ? 1 : page,
      pageSize: viewMode === "board" ? 200 : pageSize,
    }
  );

  const reservationsList = reservationsQuery.data?.data || [];
  const totalReservations = reservationsQuery.data?.total || 0;
  const totalPages = Math.ceil(totalReservations / pageSize);

  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const usersQuery = trpc.user.list.useQuery();
  const usersList = usersQuery.data?.data || [];

  // Group reservations for Kanban board
  const pendingReservations = reservationsList.filter((r: any) => r.status === "pending");
  const waitlistedReservations = reservationsList.filter((r: any) => r.status === "waitlisted");
  const approvedReservations = reservationsList.filter((r: any) => r.status === "approved");

  const approveMutation = trpc.reservation.approve.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija odobrena.");
      utils.reservation.listAll.invalidate();
      setApproveOpen(false);
      resetApproveState();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateDetailsMutation = trpc.reservation.updateDetails.useMutation({
    onSuccess: () => {
      toast.success("Podaci rezervacije su ažurirani.");
      utils.reservation.listAll.invalidate();
      setEditDetailsOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.reservation.reject.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija odbijena.");
      utils.reservation.listAll.invalidate();
      setRejectOpen(false);
      setRejectNote("");
    },
    onError: (error) => toast.error(error.message),
  });

  const completeMutation = trpc.reservation.complete.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija označena kao završena.");
      utils.reservation.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const revertMutation = trpc.reservation.revertToPending.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je vraćena u obradu.");
      utils.reservation.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetApproveState = () => {
    setSelectedId(null);
    setApproveCraneId("");
    setApproveDate(new Date());
    setApproveTime("08:00");
    setApproveDuration("60");
    setAdminNote("");
    setApproveVesselRegistration("");
    setApproveContactPhone("");
  };

  const openApprove = (id: string) => {
    setSelectedId(id);
    const reservation = (reservationsList as any[]).find((r: any) => r.id === id);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (reservation) {
      setApproveVesselRegistration(reservation.vesselRegistration || "");
      setApproveContactPhone(reservation.contactPhone || reservation.user?.phone || "");
      if (reservation.craneId) {
        setApproveCraneId(reservation.craneId);
      }
      if (reservation.durationMin) {
        setApproveDuration(String(reservation.durationMin));
      }
      if (reservation.requestedDate) {
        const rDate = new Date(reservation.requestedDate);
        setApproveDate(rDate < startOfToday ? new Date() : rDate);
      } else {
        setApproveDate(new Date());
      }
      setApproveTime("08:00");
    } else {
      setApproveDate(new Date());
      setApproveTime("08:00");
      setApproveVesselRegistration("");
      setApproveContactPhone("");
    }
    setApproveOpen(true);
  };

  const openEditDetails = (reservation: any) => {
    setEditDetailsId(reservation.id);
    setEditVesselRegistration(reservation.vesselRegistration || "");
    setEditContactPhone(reservation.contactPhone || reservation.user?.phone || "");
    setEditAdminNote(reservation.adminNote || "");
    setEditDetailsOpen(true);
  };

  const handleEditDetailsSave = () => {
    if (!editDetailsId) return;
    updateDetailsMutation.mutate({
      id: editDetailsId,
      vesselRegistration: editVesselRegistration || undefined,
      contactPhone: editContactPhone || undefined,
      adminNote: editAdminNote || undefined,
    });
  };

  const openReject = (id: string) => {
    setSelectedId(id);
    setRejectNote("");
    setRejectOpen(true);
  };

  const handleApproveConfirm = () => {
    if (!selectedId || !approveCraneId || !approveDate || !approveTime) {
      toast.error("Molimo popunite sve obavezne podatke (dizalicu, datum i sat).");
      return;
    }
    const [hours, minutes] = approveTime.split(":").map(Number);
    const scheduledStart = new Date(approveDate);
    scheduledStart.setHours(hours, minutes, 0, 0);

    approveMutation.mutate({
      id: selectedId,
      craneId: approveCraneId,
      scheduledStart,
      durationMin: Number(approveDuration),
      adminNote: adminNote || undefined,
      vesselRegistration: approveVesselRegistration || undefined,
      contactPhone: approveContactPhone || undefined,
    });
  };

  const handleRejectConfirm = () => {
    if (!selectedId) return;
    rejectMutation.mutate({ id: selectedId, adminNote: rejectNote || undefined });
  };

  const selectedReservation = (reservationsList as any[]).find((r: any) => r.id === selectedId);

  const durationOptions = [
    { value: "30", label: "30 min" },
    { value: "60", label: "1 sat (60 min)" },
    { value: "90", label: "1,5 sat (90 min)" },
    { value: "120", label: "2 sata (120 min)" },
    { value: "180", label: "3 sata (180 min)" },
    { value: "240", label: "4 sata (240 min)" },
  ];

  // Helper renderer for compact card in board view
  const renderCompactCard = (reservation: any) => {
    const isWaitlisted = reservation.status === "waitlisted";
    const isPending = reservation.status === "pending";
    const isApproved = reservation.status === "approved";

    return (
      <Card
        key={reservation.id}
        className={cn(
          "relative overflow-hidden transition-all duration-200 hover:shadow-md border",
          isPending && "border-amber-200 bg-amber-50/10 dark:bg-amber-950/10",
          isWaitlisted && "border-blue-200 bg-blue-50/10 dark:bg-blue-950/10",
          isApproved && "border-emerald-200 bg-emerald-50/10 dark:bg-emerald-950/10"
        )}
      >
        <div className="p-3 sm:p-4 space-y-3">
          {/* Header row: Reservation ID + Operation Title + Chat button */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {reservation.reservationNumber || "REZ"}
                </span>
                <StatusBadge status={reservation.status} />
              </div>
              <h4 className="font-semibold text-sm truncate text-foreground pt-1">
                {reservation.serviceType?.name ?? reservation.vesselRegistration ?? "Rezervacija"}
              </h4>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 relative shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setChatReservationId(reservation.id)}
              title="Poruke"
            >
              <MessageSquare className="h-4 w-4" />
              {reservation.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-background">
                  {reservation.unreadCount}
                </span>
              )}
            </Button>
          </div>

          {/* User & Vessel details */}
          <div className="space-y-1.5 text-xs text-muted-foreground border-t pt-2.5">
            <div className="flex items-center gap-1.5 truncate">
              <User className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="font-medium text-foreground truncate">
                {reservation.user?.name ?? "Nepoznat korisnik"}
              </span>
              {reservation.user?.phone && (
                <span className="text-gray-400 text-[11px]">({reservation.user.phone})</span>
              )}
            </div>

            {reservation.vesselRegistration && (
              <div className="flex items-center gap-1.5 truncate">
                <Anchor className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="font-medium text-foreground truncate">
                  {reservation.vesselRegistration}
                </span>
                <span className="text-gray-500 truncate">
                  ({reservation.vesselType}
                  {reservation.vesselLengthM ? ` • ${reservation.vesselLengthM}m` : ""}
                  {reservation.vesselWeightTons ? ` • ${Number(reservation.vesselWeightTons)}t` : ""})
                </span>
              </div>
            )}

            {/* Crane & Land Zone */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
              {reservation.crane ? (
                <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                  <Construction className="h-3 w-3 text-blue-600" />
                  {reservation.crane.name}
                </span>
              ) : (
                <span className="text-amber-700 italic text-[10px]">Dizalica nije odabrana</span>
              )}

              {reservation.landZone && (
                <span className="flex items-center gap-1 font-semibold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                  <MapPin className="h-3 w-3 text-blue-600" />
                  {reservation.landZone.code || reservation.landZone.name}
                </span>
              )}
            </div>

            {/* Date / Schedule Info */}
            <div className="pt-1.5">
              {reservation.scheduledStart ? (
                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold">
                  <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{formatAppDate(reservation.scheduledStart, lang as any, true)}</span>
                  {reservation.durationMin && (
                    <span className="text-[10px] opacity-75 font-normal">({reservation.durationMin} min)</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200 dark:border-amber-800/50 text-xs">
                  <CalendarDays className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>
                    {reservation.requestedDate
                      ? `Okvirno: ${formatAppDate(reservation.requestedDate, lang as any)} (${reservation.requestedTimeSlot ?? "po dogovoru"})`
                      : "Termin nije zakazan"}
                  </span>
                </div>
              )}
            </div>

            {/* User Note */}
            {reservation.userNote && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 pt-1 italic bg-muted/30 p-1.5 rounded">
                "{reservation.userNote}"
              </p>
            )}

            {/* Admin Note */}
            {reservation.adminNote && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 rounded p-1.5">
                <Lock className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{reservation.adminNote}</span>
              </div>
            )}
          </div>

          {/* Card Footer Actions */}
          <div className="flex items-center justify-end gap-1.5 pt-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEditDetails(reservation)}
              className="h-7 text-xs px-2"
              title="Uredi registraciju, kontakt i bilješke"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Uredi
            </Button>
            {(isPending || isWaitlisted) && (
              <>
                <Button
                  size="sm"
                  onClick={() => openApprove(reservation.id)}
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {isWaitlisted ? "Zakaži termin" : "Odobri"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openReject(reservation.id)}
                  className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 px-2"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Odbij
                </Button>
              </>
            )}

            {isApproved && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedWorkOrderRes(reservation)}
                  className="h-7 text-xs text-primary border-primary/40 hover:bg-primary/5 font-semibold px-2"
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Radni nalog
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => completeMutation.mutate({ id: reservation.id })}
                  disabled={completeMutation.isPending}
                  className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/50 px-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Završi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revertMutation.mutate({ id: reservation.id })}
                  disabled={revertMutation.isPending}
                  className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/50 px-2"
                  title="Vrati u obradu"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rezervacije</h2>
          <p className="text-sm text-muted-foreground">
            Upravljanje operacijama i rasporedom dizalica
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-muted p-1 rounded-lg border">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "board"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-primary" />
              <span>Board (3 Kolone)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span>Lista / Arhiva</span>
            </button>
          </div>

          {/* List mode status filter dropdown */}
          {viewMode === "list" && (
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Na čekanju</SelectItem>
                <SelectItem value="waitlisted">Čeka suhi vez</SelectItem>
                <SelectItem value="approved">Odobreni</SelectItem>
                <SelectItem value="completed">Završeni</SelectItem>
                <SelectItem value="rejected">Odbijeni</SelectItem>
                <SelectItem value="cancelled">Otkazani</SelectItem>
                <SelectItem value="all">Svi statusi</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* User search filter */}
          <UserSearchCombobox
            users={usersList as any}
            value={selectedUser}
            onChange={(val) => { setSelectedUser(val); setPage(1); }}
          />

          {/* New reservation button */}
          <Button onClick={() => setCreateOpen(true)} className="h-9 px-3 text-xs font-semibold">
            <Plus className="h-4 w-4 mr-1" />
            Nova rezervacija
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {reservationsQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Učitavanje rezervacija...</p>
        </div>
      ) : viewMode === "board" ? (
        /* ─── 3-COLUMN KANBAN BOARD VIEW ─────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {/* COLUMN 1: Na čekanju (Pending) */}
          <div className="flex flex-col rounded-xl border bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden">
            <div className="p-3.5 border-b bg-amber-500/10 border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <h3 className="font-bold text-sm text-amber-900 dark:text-amber-300">Na čekanju</h3>
              </div>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 font-bold text-xs">
                {pendingReservations.length}
              </Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-250px)] min-h-[500px]">
              <div className="p-3 space-y-3">
                {pendingReservations.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed rounded-lg bg-background/50 text-xs text-muted-foreground space-y-1">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500/60 mb-2" />
                    <p className="font-semibold text-foreground">Nema novih zahtjeva</p>
                    <p>Svi zahtjevi na čekanju su obrađeni.</p>
                  </div>
                ) : (
                  pendingReservations.map(renderCompactCard)
                )}
              </div>
            </ScrollArea>
          </div>

          {/* COLUMN 2: Čeka suhi vez (Waitlisted) */}
          <div className="flex flex-col rounded-xl border bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden">
            <div className="p-3.5 border-b bg-blue-500/10 border-blue-200 dark:border-blue-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <h3 className="font-bold text-sm text-blue-900 dark:text-blue-300">Čeka suhi vez</h3>
              </div>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 font-bold text-xs">
                {waitlistedReservations.length}
              </Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-250px)] min-h-[500px]">
              <div className="p-3 space-y-3">
                {waitlistedReservations.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed rounded-lg bg-background/50 text-xs text-muted-foreground space-y-1">
                    <Anchor className="h-8 w-8 mx-auto text-blue-400/60 mb-2" />
                    <p className="font-semibold text-foreground">Lista čekanja je prazna</p>
                    <p>Nema rezervacija koje čekaju na slobodan suhi vez.</p>
                  </div>
                ) : (
                  waitlistedReservations.map(renderCompactCard)
                )}
              </div>
            </ScrollArea>
          </div>

          {/* COLUMN 3: Odobreni (Approved) */}
          <div className="flex flex-col rounded-xl border bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden">
            <div className="p-3.5 border-b bg-emerald-500/10 border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-300">Odobreni</h3>
              </div>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold text-xs">
                {approvedReservations.length}
              </Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-250px)] min-h-[500px]">
              <div className="p-3 space-y-3">
                {approvedReservations.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed rounded-lg bg-background/50 text-xs text-muted-foreground space-y-1">
                    <CalendarDays className="h-8 w-8 mx-auto text-emerald-400/60 mb-2" />
                    <p className="font-semibold text-foreground">Nema odobrenih rezervacija</p>
                    <p>Trenutno nema rezervacija s fiksno zakazanim terminom.</p>
                  </div>
                ) : (
                  approvedReservations.map(renderCompactCard)
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      ) : (
        /* ─── CLASSIC LIST VIEW ─────────────────────────────────────────────────── */
        <div>
          {reservationsList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">Nema rezultata</h3>
                <p className="text-muted-foreground text-sm">
                  {statusFilter === "pending"
                    ? "Nema zahtjeva koji čekaju odobrenje."
                    : `Nema rezervacija za odabrane filtre.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(reservationsList as any[]).map((reservation: any) => (
                <Card key={reservation.id}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-base">
                            {reservation.serviceType?.name ?? reservation.vesselRegistration ?? `Rezervacija #${reservation.reservationNumber}`}
                          </span>
                          <StatusBadge status={reservation.status} />
                          {reservation.reservationNumber && (
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              {reservation.reservationNumber}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <User className="h-3.5 w-3.5" />
                          {reservation.user?.name ?? "Nepoznat"}{" "}
                          {reservation.user?.phone ? `(${reservation.user.phone})` : ""}
                          {reservation.user?.email && (
                            <span className="text-xs">— {reservation.user.email}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {reservation.scheduledStart
                            ? formatAppDate(reservation.scheduledStart, lang as any, true)
                            : reservation.requestedDate
                              ? `Okvirno: ${formatAppDate(reservation.requestedDate, lang as any)} (${reservation.requestedTimeSlot ?? "po dogovoru"})`
                              : "Termin nije dodijeljen"}
                        </div>

                        {reservation.vesselRegistration && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Plovilo:</span>{" "}
                            {reservation.vesselRegistration} ({reservation.vesselType})
                            {reservation.vesselLengthM ? ` — D: ${reservation.vesselLengthM} m` : ""}
                            {reservation.vesselBeamM ? ` — Š: ${reservation.vesselBeamM} m` : ""}
                            {reservation.vesselWeightTons ? ` — ${Number(reservation.vesselWeightTons).toLocaleString(lang === 'hr' ? 'hr-HR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t` : ""}
                          </div>
                        )}

                        {reservation.crane && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Dizalica:</span> {reservation.crane.name}
                            {reservation.crane.location ? ` — ${reservation.crane.location}` : ""}
                          </div>
                        )}

                        {reservation.landZone && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <span className="font-medium text-foreground">Kopnena zona:</span>{" "}
                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                              {reservation.landZone.name} ({reservation.landZone.code})
                            </span>
                          </div>
                        )}

                        {reservation.userNote && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            <span className="font-medium text-foreground">Napomena korisnika:</span> {reservation.userNote}
                          </p>
                        )}

                        {reservation.adminNote && (
                          <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                            <span className="font-medium text-foreground">Admin bilješka: </span>
                            {reservation.adminNote}
                          </div>
                        )}

                        {reservation.approver && (
                          <div className="text-xs text-muted-foreground mt-2 bg-slate-50 border rounded py-1.5 px-2 inline-block shadow-sm">
                            <span className="font-medium text-foreground">Obradio:</span> {reservation.approver.name}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {(reservation.status === "pending" || reservation.status === "waitlisted") && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openApprove(reservation.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Odobri
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReject(reservation.id)}
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Odbij
                            </Button>
                          </>
                        )}
                        {reservation.status === "approved" && (
                          <>
                            {(() => {
                              const dt = reservation.scheduledStart || reservation.scheduledDate || reservation.requestedDate;
                              const target = dt ? new Date(dt) : null;
                              const now = new Date();
                              const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                              const isFuture = target ? target.getTime() > endOfToday.getTime() : false;

                              return (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedWorkOrderRes(reservation)}
                                    disabled={isFuture}
                                    title={isFuture ? "Radni nalog se može pokrenuti tek na dan termina ili nakon njega." : "Pokreni radni nalog"}
                                    className="text-primary border-primary/40 hover:bg-primary/5 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    Radni nalog
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => completeMutation.mutate({ id: reservation.id })}
                                    disabled={completeMutation.isPending || isFuture}
                                    title={isFuture ? "Završavanje je moguće tek na dan termina ili nakon njega." : "Označi rezervaciju kao izvršenu."}
                                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    Završeno
                                  </Button>
                                </>
                              );
                            })()}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => revertMutation.mutate({ id: reservation.id })}
                              disabled={revertMutation.isPending}
                              className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                              Vrati u obradu
                            </Button>
                          </>
                        )}
                        {(reservation.status === "cancelled" || reservation.status === "rejected") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revertMutation.mutate({ id: reservation.id })}
                            disabled={revertMutation.isPending}
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                          >
                            Vrati u obradu
                          </Button>
                        )}
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setChatReservationId(reservation.id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Poruke
                          </Button>
                          {reservation.unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background">
                              {reservation.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {totalPages > 1 && (
                <div className="flex justify-center py-6 border-t mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      <div className="flex items-center px-4 text-sm font-medium">
                        {page} / {totalPages} ({totalReservations} ukupno)
                      </div>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova rezervacija</DialogTitle>
            <DialogDescription>
              Kreirajte novu rezervaciju za postojećeg ili novog korisnika.
            </DialogDescription>
          </DialogHeader>
          <AdminReservationForm
            onSuccess={() => {
              setCreateOpen(false);
              utils.reservation.listAll.invalidate();
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={(v) => { if (!v) resetApproveState(); setApproveOpen(v); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Odobri / Zakaži rezervaciju</DialogTitle>
            <DialogDescription>
              Odaberite dizalicu i dodijelite termin. Korisnik će biti obaviješten e-mailom.
            </DialogDescription>
          </DialogHeader>

          {selectedReservation && (
            <div className="rounded-md bg-muted p-3 text-xs sm:text-sm space-y-1 mb-2">
              {selectedReservation.vesselRegistration && (
                <div>
                  <span className="font-medium">Plovilo:</span> {selectedReservation.vesselRegistration} ({selectedReservation.vesselType})
                  {selectedReservation.vesselLengthM ? ` — D: ${selectedReservation.vesselLengthM} m` : ""}
                  {selectedReservation.vesselBeamM ? ` — Š: ${selectedReservation.vesselBeamM} m` : ""}
                  {selectedReservation.vesselWeightTons ? ` — ${Number(selectedReservation.vesselWeightTons)} t` : ""}
                </div>
              )}
              {selectedReservation.requestedDate && (
                <div>
                  <span className="font-medium">Željeni termin:</span> {selectedReservation.requestedDate}
                  <span className="ml-1 opacity-70">
                    ({selectedReservation.requestedTimeSlot === "jutro" ? "08:00–12:00" :
                      selectedReservation.requestedTimeSlot === "poslijepodne" ? "12:00–16:00" : "Po dogovoru"})
                  </span>
                </div>
              )}
              {selectedReservation.userNote && (
                <div><span className="font-medium">Napomena:</span> {selectedReservation.userNote}</div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dizalica *</Label>
              <Select value={approveCraneId} onValueChange={setApproveCraneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Odaberite dizalicu" />
                </SelectTrigger>
                <SelectContent>
                  {(cranesList as any[]).filter((c: any) => c.craneStatus === "active").map((crane: any) => (
                    <SelectItem key={crane.id} value={String(crane.id)}>
                      {crane.name} (max {crane.maxCapacityKN} kN)
                      {crane.location ? ` — ${crane.location}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum *</Label>
                <DatePicker
                  date={approveDate}
                  onChange={setApproveDate}
                  placeholder="Odaberi datum"
                  disablePastDates
                />
              </div>
              <div className="space-y-2">
                <Label>Sat *</Label>
                <Select value={approveTime} onValueChange={setApproveTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="08:00" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {Array.from({ length: 15 * 2 }).map((_, i) => {
                      const h = Math.floor(i / 2) + 6; // 06:00 to 20:00
                      const hour = h.toString().padStart(2, '0');
                      const min = (i % 2 === 0 ? "00" : "30");
                      const time = `${hour}:${min}`;
                      return (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Registracija plovila</Label>
                <Input
                  placeholder="npr. ST-1234"
                  value={approveVesselRegistration}
                  onChange={(e) => setApproveVesselRegistration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Kontakt telefon / mobitel</Label>
                <Input
                  placeholder="npr. 0912345678"
                  value={approveContactPhone}
                  onChange={(e) => setApproveContactPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Trajanje</Label>
              <Select value={approveDuration} onValueChange={setApproveDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {durationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Admin bilješka (opcionalno)</Label>
              <Textarea
                placeholder="Interna napomena..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveOpen(false); resetApproveState(); }}>
              Odustani
            </Button>
            <Button
              onClick={handleApproveConfirm}
              disabled={approveMutation.isPending || !approveCraneId || !approveDate || !approveTime}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Odobri rezervaciju
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={editDetailsOpen} onOpenChange={setEditDetailsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Uredi podatke rezervacije</DialogTitle>
            <DialogDescription>
              Izmijenite registraciju plovila, kontakt telefon i internu bilješku operatera.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Registracija plovila</Label>
              <Input
                placeholder="npr. ST-1234"
                value={editVesselRegistration}
                onChange={(e) => setEditVesselRegistration(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Kontakt telefon / mobitel</Label>
              <Input
                placeholder="npr. 0912345678"
                value={editContactPhone}
                onChange={(e) => setEditContactPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Interna bilješka operatera</Label>
              <Textarea
                placeholder="Interna napomena vidljiva samo osoblju..."
                value={editAdminNote}
                onChange={(e) => setEditAdminNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDetailsOpen(false)}>
              Odustani
            </Button>
            <Button
              onClick={handleEditDetailsSave}
              disabled={updateDetailsMutation.isPending}
              className="bg-primary text-white"
            >
              {updateDetailsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Spremi promjene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odbij rezervaciju</DialogTitle>
            <DialogDescription>
              Rezervacija će biti odbijena i korisnik će biti obaviješten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Razlog odbijanja (opcionalno)</Label>
            <Textarea
              placeholder="Razlog..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Odustani</Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              variant="destructive"
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Odbij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Order Execution Dialog */}
      {selectedWorkOrderRes && (
        <WorkOrderExecutionDialog
          open={!!selectedWorkOrderRes}
          onOpenChange={(open) => !open && setSelectedWorkOrderRes(null)}
          reservationId={selectedWorkOrderRes.id}
          craneId={selectedWorkOrderRes.craneId || selectedWorkOrderRes.crane?.id || ""}
          craneName={selectedWorkOrderRes.crane?.name || selectedWorkOrderRes.craneName}
          userName={selectedWorkOrderRes.user?.name || (selectedWorkOrderRes.user?.firstName ? `${selectedWorkOrderRes.user.firstName} ${selectedWorkOrderRes.user.lastName || ''}`.trim() : null) || selectedWorkOrderRes.userName}
          userOib={selectedWorkOrderRes.user?.oib || selectedWorkOrderRes.userOib}
          isMember={selectedWorkOrderRes.user ? (!selectedWorkOrderRes.user.isLegalEntity && selectedWorkOrderRes.user.role === "user") : !selectedWorkOrderRes.isLegalEntity}
          vesselName={selectedWorkOrderRes.vesselName}
          vesselLengthM={selectedWorkOrderRes.vesselLengthM}
          onSuccess={() => {
            reservationsQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
