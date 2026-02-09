import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CalendarDays, CheckCircle, Clock, Construction, XCircle } from "lucide-react";
import { useMemo } from "react";

export default function AdminDashboard() {
  const { data: allReservations = [] } = trpc.reservation.listAll.useQuery({});
  const { data: cranesList = [] } = trpc.crane.list.useQuery({ activeOnly: false });

  const stats = useMemo(() => {
    const pending = allReservations.filter((r) => r.status === "pending").length;
    const approved = allReservations.filter((r) => r.status === "approved").length;
    const rejected = allReservations.filter((r) => r.status === "rejected").length;
    const activeCranes = cranesList.filter((c) => c.isActive).length;
    return { pending, approved, rejected, activeCranes, total: allReservations.length };
  }, [allReservations, cranesList]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your crane booking system.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Requests
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">Active reservations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground mt-1">Declined requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Cranes
            </CardTitle>
            <Construction className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCranes}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {cranesList.length} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent pending reservations */}
      {stats.pending > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allReservations
                .filter((r) => r.status === "pending")
                .slice(0, 5)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {r.crane?.name ?? `Crane #${r.craneId}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.user?.name ?? "Unknown"} — {new Date(r.startDate).toLocaleDateString()} to{" "}
                        {new Date(r.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Clock className="h-3 w-3" />
                      Pending
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
