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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { CalendarDays, Check, CheckCircle2, Loader2, User, X, MessageSquare } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ReservationChat } from "@/components/ReservationChat";
import { AdminReservationForm } from "@/components/AdminReservationForm";
import { Plus } from "lucide-react";

import { useLang } from "@/contexts/LangContext";
import { formatAppDate, formatToSqlDate } from "@/lib/date-utils";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";

export default function AdminReservations() {
  const { lang } = useLang();
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

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [chatReservationId, setChatReservationId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status && ["pending", "approved", "rejected", "cancelled", "completed", "all"].includes(status)) {
      setStatusFilter(status);
    }
  }, []);

  const reservationsQuery = trpc.reservation.listAll.useQuery(
    {
      status: statusFilter !== "all" ? [statusFilter] : undefined,
      userId: selectedUser !== "all" ? selectedUser : undefined,
      page,
      pageSize,
    }
  );
  
  const reservationsList = reservationsQuery.data?.data || [];
  const totalReservations = reservationsQuery.data?.total || 0;
  const totalPages = Math.ceil(totalReservations / pageSize);

  const { data: cranesList = [] } = trpc.crane.list.useQuery();
  const { data: usersList = [] } = trpc.user.list.useQuery();

  const approveMutation = trpc.reservation.approve.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija odobrena.");
      utils.reservation.listAll.invalidate();
      setApproveOpen(false);
      resetApproveState();
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
    setApproveDate(undefined);
    setApproveTime("");
    setApproveDuration("60");
    setAdminNote("");
  };

  const openApprove = (id: string) => {
    setSelectedId(id);
    const reservation = (reservationsList as any[]).find((r: any) => r.id === id);
    if (reservation && reservation.requestedDate) {
      setApproveDate(new Date(reservation.requestedDate));
    } else {
      setApproveDate(undefined);
    }
    setApproveOpen(true);
  };

  const openReject = (id: string) => {
    setSelectedId(id);
    setRejectNote("");
    setRejectOpen(true);
  };

  const handleApproveConfirm = () => {
    if (!selectedId || !approveCraneId || !approveDate || !approveTime) {
      toast.error("Molimo popunite sve obavezne podatke.");
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
    });
  };

  const handleRejectConfirm = () => {
    if (!selectedId) return;
    rejectMutation.mutate({ id: selectedId, adminNote: rejectNote || undefined });
  };

  // Get the selected reservation details for the approve dialog
  const selectedReservation = (reservationsList as any[]).find((r: any) => r.id === selectedId);

  const pendingCount = (reservationsList as any[]).filter((r: any) => r.status === "pending").length;

  const durationOptions = [
    { value: "60", label: "1 sat" },
    { value: "90", label: "1,5 sat" },
    { value: "120", label: "2 sata" },
    { value: "180", label: "3 sata" },
    { value: "240", label: "4 sata" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Rezervacije</h2>
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending"
              ? `${pendingCount} zahtjeva čeka odobrenje`
              : "Upravljanje zahtjevima za operacije dizalicom"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Na čekanju</SelectItem>
              <SelectItem value="approved">Odobreni</SelectItem>
              <SelectItem value="completed">Završeni</SelectItem>
              <SelectItem value="rejected">Odbijeni</SelectItem>
              <SelectItem value="cancelled">Otkazani</SelectItem>
              <SelectItem value="all">Svi</SelectItem>
            </SelectContent>
          </Select>
          <UserSearchCombobox
            users={usersList as any}
            value={selectedUser}
            onChange={(val) => { setSelectedUser(val); setPage(1); }}
          />
          <Button onClick={() => setCreateOpen(true)} className="ml-2">
            <Plus className="h-4 w-4 mr-1" />
            Nova rezervacija
          </Button>
        </div>
      </div>

      {reservationsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reservationsList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nema rezultata</h3>
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "Nema zahtjeva koji čekaju odobrenje."
                : `Nema ${statusFilter} rezervacija.`}
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
                      <span className="font-medium">
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
                        <span className="font-medium">Plovilo:</span>{" "}
                        {reservation.vesselRegistration} ({reservation.vesselType})
                        {reservation.vesselLengthM ? ` — D: ${reservation.vesselLengthM} m` : ""}
                        {reservation.vesselBeamM ? ` — Š: ${reservation.vesselBeamM} m` : ""}
                        {reservation.vesselWeightTons ? ` — ${Number(reservation.vesselWeightTons).toLocaleString(lang === 'hr' ? 'hr-HR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t` : ""}
                      </div>
                    )}

                    {reservation.crane && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Dizalica:</span> {reservation.crane.name}
                        {reservation.crane.location ? ` — ${reservation.crane.location}` : ""}
                      </div>
                    )}

                    {reservation.userNote && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        <span className="font-medium">Napomena korisnika:</span> {reservation.userNote}
                      </p>
                    )}

                    {reservation.adminNote && (
                      <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                        <span className="font-medium">Admin bilješka: </span>
                        {reservation.adminNote}
                      </div>
                    )}

                    {reservation.approver && (
                      <div className="text-xs text-muted-foreground mt-2 bg-slate-50 border rounded py-1.5 px-2 inline-block shadow-sm">
                        <span className="font-medium">Obradio:</span> {reservation.approver.name}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {reservation.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => openApprove(reservation.id)}
                          className="bg-green-600 hover:bg-green-700 text-white"
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeMutation.mutate({ id: reservation.id })}
                          disabled={completeMutation.isPending}
                          className="text-green-700 border-green-300 hover:bg-green-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Završeno
                        </Button>
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova rezervacija</DialogTitle>
            <DialogDescription>
              Kreirajte novu rezervaciju za postojećeg korisnika.
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
            <DialogTitle>Odobri rezervaciju</DialogTitle>
            <DialogDescription>
              Odaberite dizalicu i dodijelite termin. Korisnik će biti obaviješten e-mailom.
            </DialogDescription>
          </DialogHeader>

          {selectedReservation && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1 mb-2">
              {selectedReservation.vesselRegistration && (
                <div><span className="font-medium">Plovilo:</span> {selectedReservation.vesselRegistration} ({selectedReservation.vesselType}){selectedReservation.vesselLengthM ? ` — D: ${selectedReservation.vesselLengthM} m` : ""}{selectedReservation.vesselBeamM ? ` — Š: ${selectedReservation.vesselBeamM} m` : ""}{selectedReservation.vesselWeightTons ? ` — ${Number(selectedReservation.vesselWeightTons).toLocaleString(lang === 'hr' ? 'hr-HR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t` : ""}</div>
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
                />
              </div>
              <div className="space-y-2">
                <Label>Sat *</Label>
                <Select value={approveTime} onValueChange={setApproveTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="--:--" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {Array.from({ length: 24 * 4 }).map((_, i) => {
                      const hour = Math.floor(i / 4).toString().padStart(2, '0');
                      const min = ((i % 4) * 15).toString().padStart(2, '0');
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
                placeholder="Poruka za korisnika..."
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
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Odobri rezervaciju
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

      {/* Chat Dialog */}
      <Dialog open={!!chatReservationId} onOpenChange={(open) => !open && setChatReservationId(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Poruke</DialogTitle>
            <DialogDescription>
              Razgovarajte s korisnikom u vezi ove rezervacije.
            </DialogDescription>
          </DialogHeader>
          {chatReservationId && (
            <ReservationChat reservationId={chatReservationId} pollInterval={15000} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { DatePicker } from "@/components/ui/date-picker";
