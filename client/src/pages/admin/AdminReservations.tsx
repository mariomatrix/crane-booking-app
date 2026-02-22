import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { CraneTypeBadge } from "@/components/CraneTypeBadge";
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
import { Label } from "@/components/ui/label";
import { CalendarDays, Check, Loader2, MapPin, User, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminReservations() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"approve" | "reject">("approve");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Handle status filter from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status && ["pending", "approved", "rejected", "cancelled", "all"].includes(status)) {
      setStatusFilter(status);
    }
  }, []);

  const { data: reservationsList = [], isLoading } = trpc.reservation.listAll.useQuery(
    { status: statusFilter !== "all" ? [statusFilter] : undefined }
  );

  const approveMutation = trpc.reservation.approve.useMutation({
    onSuccess: () => {
      toast.success("Reservation approved.");
      utils.reservation.listAll.invalidate();
      setDialogOpen(false);
      setAdminNotes("");
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.reservation.reject.useMutation({
    onSuccess: () => {
      toast.success("Reservation rejected.");
      utils.reservation.listAll.invalidate();
      setDialogOpen(false);
      setAdminNotes("");
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (id: string, action: "approve" | "reject") => {
    setSelectedId(id);
    setDialogAction(action);
    setAdminNotes("");
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    const mutation = dialogAction === "approve" ? approveMutation : rejectMutation;
    mutation.mutate({ id: selectedId, adminNote: adminNotes || undefined });
  };

  const pendingCount = reservationsList.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Reservations</h2>
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending"
              ? `${pendingCount} pending request${pendingCount !== 1 ? "s" : ""} awaiting review`
              : "Manage all crane reservation requests"}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reservationsList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No reservations found</h3>
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "No pending reservation requests at the moment."
                : `No ${statusFilter} reservations found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reservationsList.map((reservation) => (
            <Card key={reservation.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {reservation.crane?.name ?? `Crane #${reservation.craneId}`}
                      </span>
                      {reservation.crane?.location && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{reservation.crane.location}</span>
                      )}
                      <StatusBadge status={reservation.status} />
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {reservation.user?.name ?? "Unknown"} {reservation.user?.phone ? `(${reservation.user.phone})` : ""}
                      {reservation.user?.email && (
                        <span className="text-xs">— {reservation.user.email}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {reservation.scheduledStart ? formatDate(reservation.scheduledStart) : (reservation.requestedDate ?? "TBD")} — {reservation.scheduledEnd ? formatDate(reservation.scheduledEnd) : ""}
                    </div>

                    {reservation.vesselName && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="font-medium">Brod:</span> {reservation.vesselName} ({reservation.vesselType})
                      </div>
                    )}

                    {reservation.liftPurpose && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        <span className="font-medium">Svrha:</span> {reservation.liftPurpose}
                      </p>
                    )}

                    {reservation.adminNote && (
                      <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                        <span className="font-medium">Admin note: </span>
                        {reservation.adminNote}
                      </div>
                    )}
                  </div>

                  {reservation.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => openDialog(reservation.id, "approve")}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDialog(reservation.id, "reject")}
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve/Reject Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "approve" ? "Approve Reservation" : "Reject Reservation"}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === "approve"
                ? "This reservation will be confirmed and appear on the public calendar."
                : "This reservation will be rejected and the user will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Admin Notes (optional)</Label>
            <Textarea
              placeholder={
                dialogAction === "approve"
                  ? "Any notes for the user..."
                  : "Reason for rejection..."
              }
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className={
                dialogAction === "approve"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }
            >
              {(approveMutation.isPending || rejectMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {dialogAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
