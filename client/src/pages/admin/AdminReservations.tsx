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
import { CalendarDays, Check, CheckCircle2, Loader2, User, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("hr-HR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminReservations() {
  const [statusFilter, setStatusFilter] = useState("pending");

  // Approve dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveCraneId, setApproveCraneId] = useState("");
  const [approveDate, setApproveDate] = useState("");
  const [approveTime, setApproveTime] = useState("");
  const [approveDuration, setApproveDuration] = useState("60");
  const [adminNote, setAdminNote] = useState("");

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const utils = trpc.useUtils();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status && ["pending", "approved", "rejected", "cancelled", "completed", "all"].includes(status)) {
      setStatusFilter(status);
    }
  }, []);

  const { data: reservationsList = [], isLoading } = trpc.reservation.listAll.useQuery(
    { status: statusFilter !== "all" ? [statusFilter] : undefined }
  );

  const { data: cranesList = [] } = trpc.crane.list.useQuery();

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

  const resetApproveState = () => {
    setSelectedId(null);
    setApproveCraneId("");
    setApproveDate("");
    setApproveTime("");
    setApproveDuration("60");
    setAdminNote("");
  };

  const openApprove = (id: string) => {
    setSelectedId(id);
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
    const scheduledStart = new Date(`${approveDate}T${approveTime}:00`);
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (reservationsList as any[]).length === 0 ? (
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
                        {reservation.serviceType?.name ?? reservation.vesselName ?? `Rezervacija #${reservation.reservationNumber}`}
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
                        ? formatDate(reservation.scheduledStart)
                        : reservation.requestedDate
                          ? `Okvirno: ${reservation.requestedDate} (${reservation.requestedTimeSlot ?? "po dogovoru"})`
                          : "Termin nije dodijeljen"}
                    </div>

                    {reservation.vesselName && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Plovilo:</span>{" "}
                        {reservation.vesselName} ({reservation.vesselType})
                        {reservation.vesselWeightKg ? ` — ${reservation.vesselWeightKg}kg` : ""}
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
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              {selectedReservation.vesselName && (
                <div><span className="font-medium">Plovilo:</span> {selectedReservation.vesselName} ({selectedReservation.vesselType}){selectedReservation.vesselWeightKg ? ` — ${selectedReservation.vesselWeightKg}kg` : ""}</div>
              )}
              {selectedReservation.requestedDate && (
                <div><span className="font-medium">Željeni datum:</span> {selectedReservation.requestedDate} ({selectedReservation.requestedTimeSlot})</div>
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
                      {crane.name} (max {crane.maxCapacityKg}kg)
                      {crane.location ? ` — ${crane.location}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum *</Label>
                <Input
                  type="date"
                  value={approveDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setApproveDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Vrijeme *</Label>
                <Input
                  type="time"
                  value={approveTime}
                  onChange={(e) => setApproveTime(e.target.value)}
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
    </div>
  );
}
