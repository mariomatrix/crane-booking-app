import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarDays, Loader2, MapPin, Plus, X } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MyReservations() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: reservationsList = [], isLoading } = trpc.reservation.myReservations.useQuery(
    undefined,
    { enabled: !!user }
  );

  const cancelMutation = trpc.reservation.cancel.useMutation({
    onSuccess: () => {
      toast.success("Rezervacija je otkazana.");
      setCancellingId(null);
      setCancelReason("");
      utils.reservation.myReservations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>You need to be signed in to view your reservations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { window.location.href = getLoginUrl(); }}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-2 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Calendar
              </Button>
              <h1 className="text-xl font-semibold">My Reservations</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track the status of your crane reservation requests.
              </p>
            </div>
            <Button onClick={() => setLocation("/new-reservation")}>
              <Plus className="h-4 w-4 mr-2" />
              New Reservation
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reservationsList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No reservations yet</h3>
              <p className="text-muted-foreground mb-4">
                You haven't made any crane reservation requests.
              </p>
              <Button onClick={() => setLocation("/new-reservation")}>
                <Plus className="h-4 w-4 mr-2" />
                Request a Reservation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reservationsList.map((reservation) => (
              <Card key={reservation.id}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {reservation.crane?.name ?? `Crane #${reservation.craneId}`}
                        </span>
                        {reservation.crane?.location && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded ml-1">{reservation.crane.location}</span>
                        )}
                        <StatusBadge status={reservation.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(reservation.startDate)} — {formatDate(reservation.endDate)}
                      </div>
                      {reservation.liftPurpose && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {reservation.liftPurpose}
                        </div>
                      )}
                      {reservation.adminNotes && (
                        <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                          <span className="font-medium">Admin note: </span>
                          {reservation.adminNotes}
                        </div>
                      )}
                    </div>
                    {(reservation.status === "pending" || reservation.status === "approved") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive shrink-0"
                        onClick={() => {
                          setCancellingId(reservation.id);
                          setCancelReason("");
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Otkazivanje
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!cancellingId} onOpenChange={(open) => !open && setCancellingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Otkazivanje rezervacije</DialogTitle>
              <DialogDescription>
                Molimo navedite razlog otkazivanja. Ovo nam pomaže u boljem planiranju termina.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="reason">Razlog otkazivanja</Label>
                <Textarea
                  id="reason"
                  placeholder="npr. Promjena plana, loše vrijeme, brod nije spreman..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancellingId(null)}>
                Odustani
              </Button>
              <Button
                destructive
                disabled={cancelReason.length < 3 || cancelMutation.isPending}
                onClick={() => cancellingId && cancelMutation.mutate({ id: cancellingId, reason: cancelReason })}
              >
                {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Potvrdi otkazivanje
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
