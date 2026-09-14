import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Anchor,
  Clock,
  CalendarDays,
  Check,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  Ship,
  User as UserIcon,
  MapPin,
  Construction,
  X,
  FileText,
  Pencil,
  Loader2,
  AlertTriangle,
  Info,
  CalendarClock,
  Phone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ReservationChat } from "@/components/ReservationChat";
import { ReservationScheduleModal } from "@/components/ReservationScheduleModal";
import { WorkOrderExecutionDialog } from "@/components/WorkOrderExecutionDialog";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";
import { toZagreb } from "@shared/timezone";
import { cn } from "@/lib/utils";

export default function AdminReservations() {
  const { lang } = useLang();
  const utils = trpc.useUtils();

  // Filters and view modes (default: table view and all reservations)
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCrane, setSelectedCrane] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Unified Schedule Modal state (for create, approve, edit)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState<"approve" | "edit" | "create">("create");
  const [selectedRes, setSelectedRes] = useState<any | null>(null);

  // Work order dialog state
  const [selectedWorkOrderRes, setSelectedWorkOrderRes] = useState<any | null>(null);

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Chat modal state
  const [chatReservationId, setChatReservationId] = useState<string | null>(null);

  // Read status filter from URL on mount if available
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (
      status &&
      ["pending", "approved", "waitlisted", "rejected", "cancelled", "completed", "all"].includes(status)
    ) {
      setStatusFilter(status);
    }
  }, []);

  // Main reservations query
  const reservationsQuery = trpc.reservation.listAll.useQuery({
    status: statusFilter !== "all" ? [statusFilter] : undefined,
    userId: selectedUser !== "all" ? selectedUser : undefined,
    page,
    pageSize,
  });

  const reservationsList = reservationsQuery.data?.data || [];
  const totalReservations = reservationsQuery.data?.total || 0;
  const totalPages = Math.ceil(totalReservations / pageSize);

  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const usersQuery = trpc.user.list.useQuery({ pageSize: 1000 });
  const usersList = usersQuery.data?.data || [];

  // Mutations
  const rejectMutation = trpc.reservation.reject.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je odbijena.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
      setRejectOpen(false);
      setRejectId(null);
      setRejectNote("");
    },
    onError: (error) => toast.error(error.message),
  });

  const completeMutation = trpc.reservation.complete.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je označena kao završena.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const revertMutation = trpc.reservation.revertToPending.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je vraćena u obradu.");
      utils.reservation.listAll.invalidate();
      utils.reservation.listDailyOperations.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Action handlers
  const handleOpenCreate = () => {
    setSelectedRes(null);
    setScheduleModalMode("create");
    setScheduleModalOpen(true);
  };

  const handleOpenApprove = (res: any) => {
    setSelectedRes(res);
    setScheduleModalMode("approve");
    setScheduleModalOpen(true);
  };

  const handleOpenEdit = (res: any) => {
    setSelectedRes(res);
    setScheduleModalMode("edit");
    setScheduleModalOpen(true);
  };

  const handleOpenReject = (id: string) => {
    setRejectId(id);
    setRejectNote("");
    setRejectOpen(true);
  };

  const handleRejectConfirm = () => {
    if (!rejectId) return;
    rejectMutation.mutate({ id: rejectId, adminNote: rejectNote || undefined });
  };

  // Filtered reservations by crane and search term
  const filteredReservations = useMemo(() => {
    return (reservationsList as any[]).filter((res: any) => {
      if (selectedCrane !== "all") {
        const resCraneId = res.craneId || res.crane?.id;
        if (resCraneId !== selectedCrane) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const userName = (res.user?.name || "").toLowerCase();
        const userEmail = (res.user?.email || "").toLowerCase();
        const userPhone = (res.user?.phone || res.contactPhone || "").toLowerCase();
        const vesselReg = (res.vesselRegistration || "").toLowerCase();
        const vesselName = (res.vesselName || "").toLowerCase();
        const resNumber = (res.reservationNumber || "").toLowerCase();
        const matches =
          userName.includes(q) ||
          userEmail.includes(q) ||
          userPhone.includes(q) ||
          vesselReg.includes(q) ||
          vesselName.includes(q) ||
          resNumber.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [reservationsList, selectedCrane, search]);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rezervacije</h2>
          <p className="text-sm text-muted-foreground">
            Pregled, odobravanje i raspoređivanje termina dizalica i suhog veza
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick link to dry berth waiting list screen */}
          <Link href="/admin/land-waiting">
            <Button variant="outline" className="h-9 rounded-xl text-xs font-semibold gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300">
              <Anchor className="h-3.5 w-3.5" />
              Nadzor suhog veza & čekanje
            </Button>
          </Link>

          {/* New reservation trigger */}
          <Button
            onClick={handleOpenCreate}
            className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nova rezervacija
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => reservationsQuery.refetch()}
            disabled={reservationsQuery.isFetching}
            className="h-9 w-9 rounded-xl"
            title="Osvježi listu"
          >
            <RefreshCw className={cn("h-4 w-4", reservationsQuery.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Toolbar & Filters ────────────────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-xs border">
        <CardContent className="p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Status tabs filter */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
              {[
                { id: "all", label: "Sve rezervacije" },
                { id: "pending", label: "Na čekanju" },
                { id: "approved", label: "Odobrene" },
                { id: "waitlisted", label: "Čeka suhi vez" },
                { id: "completed", label: "Završene" },
                { id: "rejected", label: "Odbijene" },
                { id: "cancelled", label: "Otkazane" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    statusFilter === tab.id
                      ? "bg-white dark:bg-slate-900 text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View mode toggle (Cards vs Table) */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl shrink-0 self-start lg:self-auto">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "cards"
                    ? "bg-white dark:bg-slate-900 text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Kartice</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-900 text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" />
                <span>Tablica</span>
              </button>
            </div>
          </div>

          {/* Secondary filter row (Search, Crane, User) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pretraži plovilo, registraciju, korisnika..."
                className="pl-9 h-9 rounded-xl text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={selectedCrane} onValueChange={setSelectedCrane}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Sve dizalice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve dizalice</SelectItem>
                {(cranesList as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    🏗️ {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <UserSearchCombobox
              users={usersList as any}
              value={selectedUser}
              onChange={(val) => {
                setSelectedUser(val);
                setPage(1);
              }}
              placeholder="Filtriraj po korisniku..."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Content View ─────────────────────────────────────────────────────── */}
      {reservationsQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm text-muted-foreground">Učitavanje rezervacija...</p>
        </div>
      ) : filteredReservations.length === 0 ? (
        <Card className="rounded-2xl border">
          <CardContent className="py-16 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold">Nema pronađenih rezervacija</h3>
            <p className="text-muted-foreground text-xs mt-1">
              Za odabrane kriterije i status nema evidentiranih zahtjeva.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        /* ── Modern Cards Grid ─────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReservations.map((reservation: any) => {
            const isPending = reservation.status === "pending";
            const isWaitlisted = reservation.status === "waitlisted";
            const isApproved = reservation.status === "approved";
            const isCompleted = reservation.status === "completed";

            const vLength = Number(reservation.vesselLengthM) || 0;
            const isOver15 = vLength > 15;
            const is9to15 = vLength >= 9 && vLength <= 15;

            return (
              <Card
                key={reservation.id}
                className={cn(
                  "rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between overflow-hidden",
                  isPending && "border-amber-200/80 bg-amber-50/20 dark:bg-amber-950/10",
                  isWaitlisted && "border-blue-200/80 bg-blue-50/20 dark:bg-blue-950/10",
                  isApproved && "border-emerald-200/80 bg-emerald-50/20 dark:bg-emerald-950/10",
                  isCompleted && "border-slate-200 bg-slate-50/30 dark:bg-slate-900/20"
                )}
              >
                <div className="p-4 space-y-3">
                  {/* Card Header: Res Number + Status + Chat */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                          {reservation.reservationNumber || "REZ"}
                        </span>
                        <StatusBadge status={reservation.status} />
                      </div>
                      <h4 className="font-bold text-sm text-foreground pt-1 line-clamp-1">
                        {reservation.serviceType?.name || reservation.vesselRegistration || "Rezervacija"}
                      </h4>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 relative shrink-0 rounded-xl hover:bg-accent text-muted-foreground"
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

                  {/* Client Info */}
                  <div className="space-y-1 text-xs text-muted-foreground border-t pt-2.5">
                    <div className="flex items-center gap-1.5 text-foreground font-medium truncate">
                      <UserIcon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{reservation.user?.name || "Korisnik"}</span>
                      {(reservation.contactPhone || reservation.user?.phone) && (
                        <span className="text-muted-foreground font-normal text-[11px] truncate">
                          ({reservation.contactPhone || reservation.user?.phone})
                        </span>
                      )}
                    </div>

                    {/* Vessel Info & Dimensions (L x B) */}
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <Ship className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="font-semibold text-foreground text-xs">
                        {reservation.vesselName || reservation.vesselRegistration || "Plovilo"}
                      </span>
                      {reservation.vesselRegistration && (
                        <Badge variant="secondary" className="font-mono text-[10px] py-0 px-1">
                          {reservation.vesselRegistration}
                        </Badge>
                      )}
                      {(reservation.vesselLengthM || reservation.vesselBeamM) && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ({reservation.vesselLengthM ? `L: ${reservation.vesselLengthM}m` : ""}
                          {reservation.vesselLengthM && reservation.vesselBeamM ? " × " : ""}
                          {reservation.vesselBeamM ? `B: ${reservation.vesselBeamM}m` : ""})
                        </span>
                      )}
                    </div>

                    {/* PŠD Špinut Guidelines badges */}
                    {isOver15 && (
                      <Badge variant="destructive" className="text-[10px] mt-1 py-0 px-1 font-semibold">
                        ⚠️ &gt;15m (Limit Špinut)
                      </Badge>
                    )}
                    {is9to15 && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] mt-1 py-0 px-1 font-semibold">
                        📐 9–15m (Velika dizalica)
                      </Badge>
                    )}
                  </div>

                  {/* Crane & Dry Berth Zone Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    {reservation.crane ? (
                      <Badge variant="outline" className="bg-indigo-50/70 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 text-[11px] font-semibold gap-1 py-0.5">
                        <Construction className="h-3 w-3 text-indigo-600" />
                        {reservation.crane.name}
                      </Badge>
                    ) : (
                      <span className="text-amber-700 italic text-[11px]">Čeka dodjelu dizalice</span>
                    )}

                    {reservation.landZone && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 text-[11px] font-semibold gap-1 py-0.5">
                        <MapPin className="h-3 w-3 text-blue-600" />
                        {reservation.landZone.name} ({reservation.landZone.code})
                      </Badge>
                    )}
                  </div>

                  {/* Date and Time Slot */}
                  <div className="pt-1">
                    {reservation.scheduledStart ? (
                      <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold font-mono">
                        <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {formatAppDate(reservation.scheduledStart)} {toZagreb(reservation.scheduledStart).timeStr}
                        </span>
                        {reservation.durationMin && (
                          <span className="text-[10px] font-normal opacity-80">({reservation.durationMin} min)</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200 dark:border-amber-800/50 text-xs">
                        <CalendarDays className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="line-clamp-1">
                          {reservation.requestedDate
                            ? `Željeno: ${formatAppDate(reservation.requestedDate)} (${reservation.requestedTimeSlot || "po dogovoru"})`
                            : "Termin nije zakazan"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Admin note */}
                  {reservation.adminNote && (
                    <p className="text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50/60 dark:bg-amber-950/30 p-1.5 rounded-lg border border-amber-200/60 line-clamp-2 italic">
                      Napomena: {reservation.adminNote}
                    </p>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="p-3 bg-slate-50/60 dark:bg-slate-900/40 border-t flex flex-wrap items-center justify-end gap-1.5">
                  {(isPending || isWaitlisted) && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleOpenApprove(reservation)}
                        className="h-7 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5"
                      >
                        <CalendarClock className="h-3.5 w-3.5 mr-1" />
                        Odobri i zakaži
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenReject(reservation.id)}
                        className="h-7 rounded-lg text-xs text-destructive border-destructive/30 hover:bg-destructive/10 px-2"
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
                        onClick={() => handleOpenEdit(reservation)}
                        className="h-7 rounded-lg text-xs px-2"
                        title="Prerasporedi termin ili izmijeni podatke"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Uredi termin
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedWorkOrderRes(reservation)}
                        className="h-7 rounded-lg text-xs text-primary border-primary/40 hover:bg-primary/5 font-semibold px-2"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Radni nalog
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => completeMutation.mutate({ id: reservation.id })}
                        disabled={completeMutation.isPending}
                        className="h-7 rounded-lg text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 px-2"
                        title="Završi rezervaciju"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                        Završi
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revertMutation.mutate({ id: reservation.id })}
                        disabled={revertMutation.isPending}
                        className="h-7 rounded-lg text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 px-2"
                        title="Vrati u obradu"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </>
                  )}

                  {(reservation.status === "rejected" || reservation.status === "cancelled") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revertMutation.mutate({ id: reservation.id })}
                      disabled={revertMutation.isPending}
                      className="h-7 rounded-lg text-xs text-amber-700 border-amber-300 hover:bg-amber-50 px-2"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Vrati u obradu
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── Modern Table View ─────────────────────────────────────────────── */
        <Card className="rounded-2xl border overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/60">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Rezervacija / Usluga</TableHead>
                <TableHead>Korisnik</TableHead>
                <TableHead>Plovilo (Dimenzije)</TableHead>
                <TableHead>Dizalica & Suhi vez</TableHead>
                <TableHead>Termin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map((reservation: any, idx: number) => {
                const isPending = reservation.status === "pending";
                const isWaitlisted = reservation.status === "waitlisted";
                const isApproved = reservation.status === "approved";
                const vLength = Number(reservation.vesselLengthM) || 0;
                const isOver15 = vLength > 15;
                const is9to15 = vLength >= 9 && vLength <= 15;

                return (
                  <TableRow key={reservation.id}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {(page - 1) * pageSize + idx + 1}
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-sm">
                        {reservation.serviceType?.name || "Rezervacija"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground mt-0.5">
                        {reservation.reservationNumber || "REZ"}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-xs text-foreground">
                        {reservation.user?.name || "Korisnik"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {reservation.contactPhone || reservation.user?.phone || reservation.user?.email || "—"}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Ship className="h-3.5 w-3.5 text-blue-600" />
                        <span>{reservation.vesselName || reservation.vesselRegistration || "Plovilo"}</span>
                        {reservation.vesselRegistration && (
                          <Badge variant="secondary" className="font-mono text-[10px] py-0 px-1">
                            {reservation.vesselRegistration}
                          </Badge>
                        )}
                      </div>
                      {(reservation.vesselLengthM || reservation.vesselBeamM) && (
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {reservation.vesselLengthM ? `L: ${reservation.vesselLengthM}m` : ""}
                          {reservation.vesselLengthM && reservation.vesselBeamM ? " × " : ""}
                          {reservation.vesselBeamM ? `B: ${reservation.vesselBeamM}m` : ""}
                        </div>
                      )}
                      {isOver15 && (
                        <Badge variant="destructive" className="text-[9px] mt-0.5 py-0 px-1 font-semibold">
                          ⚠️ &gt;15m (Špinut)
                        </Badge>
                      )}
                      {is9to15 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[9px] mt-0.5 py-0 px-1">
                          📐 9–15m
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {reservation.crane ? (
                          <Badge variant="outline" className="bg-indigo-50/70 text-indigo-800 border-indigo-200 text-[11px] font-semibold">
                            🏗️ {reservation.crane.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-amber-700 italic">Nije odabrana</span>
                        )}
                        {reservation.landZone && (
                          <div>
                            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 text-[10px]">
                              📍 {reservation.landZone.name} ({reservation.landZone.code})
                            </Badge>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {reservation.scheduledStart ? (
                        <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatAppDate(reservation.scheduledStart)} {toZagreb(reservation.scheduledStart).timeStr}
                          {reservation.durationMin && (
                            <span className="text-[10px] font-normal opacity-80 block">
                              ({reservation.durationMin} min)
                            </span>
                          )}
                        </div>
                      ) : reservation.requestedDate ? (
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          {formatAppDate(reservation.requestedDate)} ({reservation.requestedTimeSlot || "po dogovoru"})
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={reservation.status} />
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg relative"
                          onClick={() => setChatReservationId(reservation.id)}
                          title="Poruke"
                        >
                          <MessageSquare className="h-4 w-4" />
                          {reservation.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                              {reservation.unreadCount}
                            </span>
                          )}
                        </Button>

                        {(isPending || isWaitlisted) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleOpenApprove(reservation)}
                              className="h-7 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5"
                            >
                              <CalendarClock className="h-3.5 w-3.5 mr-1" />
                              Odobri
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenReject(reservation.id)}
                              className="h-7 rounded-lg text-xs text-destructive border-destructive/30 hover:bg-destructive/10 px-2"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}

                        {isApproved && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(reservation)}
                              className="h-7 rounded-lg text-xs px-2"
                              title="Uredi termin"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedWorkOrderRes(reservation)}
                              className="h-7 rounded-lg text-xs text-primary border-primary/40 hover:bg-primary/5 font-semibold px-2"
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              Nalog
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => completeMutation.mutate({ id: reservation.id })}
                              disabled={completeMutation.isPending}
                              className="h-7 rounded-lg text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 px-2"
                              title="Završi"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => revertMutation.mutate({ id: reservation.id })}
                              disabled={revertMutation.isPending}
                              className="h-7 rounded-lg text-xs text-amber-700 border-amber-300 hover:bg-amber-50 px-2"
                              title="Vrati u obradu"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-center py-4 border-t">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              <div className="flex items-center px-4 text-xs font-medium">
                Stranica {page} od {totalPages} ({totalReservations} ukupno)
              </div>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* ── Unified Reservation Scheduling Modal ────────────────────────────── */}
      <ReservationScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        mode={scheduleModalMode}
        reservation={selectedRes}
        onSuccess={() => {
          reservationsQuery.refetch();
        }}
      />

      {/* ── Work Order Execution Dialog ─────────────────────────────────────── */}
      {selectedWorkOrderRes && (
        <WorkOrderExecutionDialog
          open={!!selectedWorkOrderRes}
          onOpenChange={(open) => !open && setSelectedWorkOrderRes(null)}
          reservationId={selectedWorkOrderRes.id}
          craneId={selectedWorkOrderRes.craneId || selectedWorkOrderRes.crane?.id || ""}
          craneName={selectedWorkOrderRes.crane?.name || selectedWorkOrderRes.craneName}
          userName={
            selectedWorkOrderRes.user?.name ||
            (selectedWorkOrderRes.user?.firstName
              ? `${selectedWorkOrderRes.user.firstName} ${selectedWorkOrderRes.user.lastName || ""}`.trim()
              : null) ||
            selectedWorkOrderRes.userName
          }
          userOib={selectedWorkOrderRes.user?.oib || selectedWorkOrderRes.userOib}
          isMember={
            selectedWorkOrderRes.user
              ? !selectedWorkOrderRes.user.isLegalEntity && selectedWorkOrderRes.user.role === "user"
              : !selectedWorkOrderRes.isLegalEntity
          }
          vesselName={selectedWorkOrderRes.vesselName}
          vesselLengthM={selectedWorkOrderRes.vesselLengthM}
          onSuccess={() => {
            reservationsQuery.refetch();
          }}
        />
      )}

      {/* ── Reject Confirmation Dialog ──────────────────────────────────────── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Odbij rezervaciju</DialogTitle>
            <DialogDescription className="text-xs">
              Rezervacija će biti označena kao odbijena, a korisnik će primiti obavijest.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold">Razlog odbijanja (opcionalno)</Label>
            <Textarea
              className="rounded-xl text-xs"
              placeholder="Unesite razlog za korisnika..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setRejectOpen(false)}
              disabled={rejectMutation.isPending}
            >
              Odustani
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Odbij rezervaciju
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reservation Chat Dialog ─────────────────────────────────────────── */}
      {chatReservationId && (
        <Dialog open={!!chatReservationId} onOpenChange={(open) => !open && setChatReservationId(null)}>
          <DialogContent className="rounded-2xl sm:max-w-[600px] h-[650px] p-0 overflow-hidden flex flex-col">
            <ReservationChat reservationId={chatReservationId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
