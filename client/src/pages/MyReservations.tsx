import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarDays, Loader2, Plus, X, Anchor, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
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
  return new Date(date).toLocaleDateString("hr-HR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("hr-HR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyReservations() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { lang } = useLang();
  const utils = trpc.useUtils();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const isHr = lang === "hr";

  const { data: reservationsList = [], isLoading } = trpc.reservation.myReservations.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: serviceTypes = [] } = trpc.serviceType.list.useQuery({ onlyActive: false });

  const cancelMutation = trpc.reservation.cancel.useMutation({
    onSuccess: () => {
      toast.success(isHr ? "Rezervacija je otkazana." : "Reservation cancelled.");
      setCancellingId(null);
      setCancelReason("");
      utils.reservation.myReservations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Helper: get service type name by ID
  const getServiceTypeName = (id: string | null | undefined) => {
    if (!id) return null;
    const st = (serviceTypes as any[]).find((s: any) => s.id === id);
    return st?.name ?? null;
  };

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
            <CardTitle>{isHr ? "Potrebna prijava" : "Sign In Required"}</CardTitle>
            <CardDescription>{isHr ? "Morate biti prijavljeni za pregled rezervacija." : "You need to be signed in to view your reservations."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setLocation("/auth")}>
              {isHr ? "Prijava" : "Sign In"}
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
                {isHr ? "Kalendar" : "Calendar"}
              </Button>
              <h1 className="text-xl font-semibold">{isHr ? "Moje rezervacije" : "My Reservations"}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isHr ? "Pratite status vaših zahtjeva za rezervaciju." : "Track the status of your reservation requests."}
              </p>
            </div>
            <Button onClick={() => setLocation("/new-reservation")}>
              <Plus className="h-4 w-4 mr-2" />
              {isHr ? "Nova rezervacija" : "New Reservation"}
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
              <h3 className="text-lg font-medium mb-2">{isHr ? "Nemate rezervacija" : "No reservations yet"}</h3>
              <p className="text-muted-foreground mb-4">
                {isHr ? "Još niste podnijeli zahtjev za rezervaciju." : "You haven't made any reservation requests."}
              </p>
              <Button onClick={() => setLocation("/new-reservation")}>
                <Plus className="h-4 w-4 mr-2" />
                {isHr ? "Zatraži rezervaciju" : "Request a Reservation"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reservationsList.map((reservation) => {
              const serviceTypeName = getServiceTypeName((reservation as any).serviceTypeId);
              return (
                <Card key={reservation.id}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Show service type name as primary label */}
                          <span className="font-medium">
                            {serviceTypeName || (reservation.crane?.name ?? (isHr ? "Čekanje na odobrenje" : "Awaiting approval"))}
                          </span>
                          <StatusBadge status={reservation.status} />
                        </div>

                        {/* For approved/completed: show assigned crane */}
                        {reservation.crane && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Anchor className="h-3.5 w-3.5" />
                            {reservation.crane.name}
                            {reservation.crane.location && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded ml-1">{reservation.crane.location}</span>
                            )}
                          </div>
                        )}

                        {/* Date info */}
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {reservation.scheduledStart
                            ? `${formatDateTime(reservation.scheduledStart)} — ${reservation.scheduledEnd ? formatDateTime(reservation.scheduledEnd) : ""}`
                            : `${isHr ? "Traženi datum" : "Requested"}: ${(reservation as any).requestedDate ?? "TBD"}`
                          }
                        </div>

                        {/* Time slot preference for pending */}
                        {reservation.status === "pending" && (reservation as any).requestedTimeSlot && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {(reservation as any).requestedTimeSlot === "jutro"
                              ? (isHr ? "Jutro (08-12h)" : "Morning")
                              : (reservation as any).requestedTimeSlot === "poslijepodne"
                                ? (isHr ? "Poslijepodne (12-16h)" : "Afternoon")
                                : (isHr ? "Po dogovoru" : "By arrangement")}
                          </div>
                        )}

                        {/* Completed date */}
                        {reservation.status === "completed" && (reservation as any).completedAt && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400">
                            {isHr ? "Završeno" : "Completed"}: {formatDate((reservation as any).completedAt)}
                          </div>
                        )}

                        {/* Admin note */}
                        {reservation.adminNote && (
                          <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                            <span className="font-medium">{isHr ? "Napomena administratora:" : "Admin note:"} </span>
                            {reservation.adminNote}
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
                          {isHr ? "Otkazivanje" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={!!cancellingId} onOpenChange={(open) => !open && setCancellingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isHr ? "Otkazivanje rezervacije" : "Cancel Reservation"}</DialogTitle>
              <DialogDescription>
                {isHr
                  ? "Molimo navedite razlog otkazivanja. Ovo nam pomaže u boljem planiranju termina."
                  : "Please provide a reason for cancellation. This helps us plan better."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="reason">{isHr ? "Razlog otkazivanja" : "Reason for cancellation"}</Label>
                <Textarea
                  id="reason"
                  placeholder={isHr ? "npr. Promjena plana, loše vrijeme, brod nije spreman..." : "e.g. Change of plans, bad weather..."}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancellingId(null)}>
                {isHr ? "Odustani" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                disabled={cancelReason.length < 3 || cancelMutation.isPending}
                onClick={() => cancellingId && cancelMutation.mutate({ id: cancellingId, reason: cancelReason })}
              >
                {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isHr ? "Potvrdi otkazivanje" : "Confirm Cancellation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
