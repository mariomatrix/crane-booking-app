import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { BarChart3, Clock, CheckCircle, XCircle, Users } from "lucide-react";
import { useLang } from "@/contexts/LangContext";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { formatAppDate } from "@/lib/date-utils";

export default function AdminDashboard() {
  const { t, lang } = useLang();
  const isHr = lang === "hr";
  const [, setLocation] = useLocation();
  const reservationsQuery = trpc.reservation.listAll.useQuery({ pageSize: 100 });
  const allReservations = reservationsQuery.data?.data || [];
  const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false });
  const usersQuery = trpc.user.list.useQuery({ pageSize: 100 });
  const totalUsers = usersQuery.data?.total || 0;
  const totalReservations = reservationsQuery.data?.total || 0;

  const stats = useMemo(() => {
    const pending = allReservations.filter((r: any) => r.status === "pending").length;
    const approved = allReservations.filter((r: any) => r.status === "approved").length;
    const rejected = allReservations.filter((r: any) => r.status === "rejected").length;
    const activeCranes = cranesList.filter((c: any) => c.isActive).length;
    return { pending, approved, rejected, activeCranes, total: totalReservations };
  }, [allReservations, cranesList]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{isHr ? "Nadzorna ploča" : "Dashboard"}</h2>
          <p className="text-sm text-muted-foreground">{isHr ? "Pregled sustava rezervacija dizalica." : "Overview of crane reservation system."}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin/analytics")} className="gap-2">
          <BarChart3 className="h-4 w-4" />
          {isHr ? "Detaljna analitika" : "Detailed analytics"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setLocation("/admin/reservations?status=pending")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isHr ? "Zahtjevi na čekanju" : "Pending Requests"}
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isHr ? "Čeka pregled operatera" : "Awaiting review"}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setLocation("/admin/reservations?status=approved")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isHr ? "Odobreni zahtjevi" : "Approved"}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isHr ? "Aktivne rezervacije" : "Active reservations"}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setLocation("/admin/reservations?status=rejected")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isHr ? "Odbijeni zahtjevi" : "Rejected"}
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isHr ? "Odbijeni zahtjevi" : "Declined requests"}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setLocation("/admin/users")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.admin.users}
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {isHr ? "Registrirani korisnici" : "Registered accounts"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent pending reservations */}
      {stats.pending > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isHr ? "Nedavni zahtjevi na čekanju" : "Recent Pending Requests"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allReservations
                .filter((r) => r.status === "pending")
                .slice(0, 5)
                .map((r: any) => {
                  const title = r.serviceType?.name ?? (r.vesselRegistration ? `Plovilo ${r.vesselRegistration}` : (r.crane?.name ? `Dizalica: ${r.crane.name}` : (r.reservationNumber ? `Rezervacija ${r.reservationNumber}` : (isHr ? "Zahtjev za rezervaciju" : "Reservation Request"))));
                  const userName = r.user?.name ?? (isHr ? "Nepoznat korisnik" : "Unknown user");
                  const dateText = r.scheduledStart 
                    ? formatAppDate(r.scheduledStart, lang as any, true) 
                    : (r.requestedDate ? formatAppDate(r.requestedDate, lang as any) : "");
                  const craneText = r.crane?.name 
                    ? ` (${r.crane.name})` 
                    : (isHr ? " (Dizalica nije dodijeljena)" : " (No crane assigned)");

                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {userName} — {dateText}{craneText}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded border border-amber-200 dark:border-amber-900/50">
                        <Clock className="h-3 w-3" />
                        {isHr ? "Na čekanju" : "Pending"}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
