import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { CraneTypeBadge } from "@/components/CraneTypeBadge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarDays, Loader2, MapPin, Plus, X } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

  const { data: reservationsList = [], isLoading } = trpc.reservation.myReservations.useQuery(
    undefined,
    { enabled: !!user }
  );

  const cancelMutation = trpc.reservation.cancel.useMutation({
    onSuccess: () => {
      toast.success("Reservation cancelled.");
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
                        {reservation.crane?.type && (
                          <CraneTypeBadge type={reservation.crane.type} />
                        )}
                        <StatusBadge status={reservation.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(reservation.startDate)} — {formatDate(reservation.endDate)}
                      </div>
                      {reservation.projectLocation && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {reservation.projectLocation}
                        </div>
                      )}
                      {reservation.adminNotes && (
                        <div className="mt-2 p-3 bg-muted rounded-md text-sm">
                          <span className="font-medium">Admin note: </span>
                          {reservation.adminNotes}
                        </div>
                      )}
                    </div>
                    {reservation.status === "pending" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive shrink-0">
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Reservation?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will cancel your reservation request. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Reservation</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => cancelMutation.mutate({ id: reservation.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Cancel Reservation
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
