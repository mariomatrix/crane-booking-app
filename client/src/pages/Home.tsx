import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import Calendar from "./Calendar";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatAppDate } from "@/lib/date-utils";
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  Plus,
  Settings,
  Construction,
  Ship,
  IdCard,
  ChevronRight,
  Clock,
  Anchor,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLang } from "@/contexts/LangContext";
import { Users } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useEffect } from "react";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";

export default function Home() {
  const { t, lang } = useLang();
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect admin/operator to their dashboard by default
  useEffect(() => {
    if (!loading && user && (user.role === "admin" || user.role === "operator")) {
      setLocation("/admin");
    }
  }, [loading, user, setLocation]);

  const { data: reservationsList = [] } = trpc.reservation.myReservations.useQuery(
    undefined,
    { enabled: !!user && user.role === "user" }
  );

  const upcomingReservation = reservationsList.find(r => r.status === "approved" && r.scheduledStart && new Date(r.scheduledStart) > new Date());
  const pendingRequests = reservationsList.filter(r => r.status === "pending");

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-14 items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setLocation("/")}
          >
            <img src="/logo.png" alt="PŠD Špinut Logo" className="h-8 w-auto object-contain max-w-[150px]" />
            <span className="font-semibold text-lg tracking-tight hidden sm:inline">
              Crane Booking
            </span>
          </div>

          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="text-sm"
            >
              <CalendarDays className="h-4 w-4 mr-1.5" />
              Calendar
            </Button>

            {user && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/my-reservations")}
                  className="text-sm"
                >
                  <ClipboardList className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.nav.myReservations}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/my-vessels")}
                  className="text-sm"
                >
                  <Ship className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.nav.vessels}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLocation("/new-reservation")}
                  className="text-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.nav.newReservation}</span>
                </Button>
              </>
            )}

            {loading ? (
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse ml-2" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="ml-1 p-1">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground">{user.email ?? ""}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/my-reservations")}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {t.nav.myReservations}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/my-vessels")}>
                    <Ship className="h-4 w-4 mr-2" />
                    {t.nav.vessels}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/my-card")}>
                    <IdCard className="h-4 w-4 mr-2" />
                    Moj karton
                  </DropdownMenuItem>
                  {user.role === "admin" || user.role === "operator" ? (
                    <>
                      <DropdownMenuItem onClick={() => setLocation("/admin")}>
                        <Settings className="h-4 w-4 mr-2" />
                        {user.role === "admin" ? t.nav.adminPanel : "Operator Panel"}
                      </DropdownMenuItem>

                      {user.role === "admin" && (
                        <DropdownMenuItem onClick={() => setLocation("/admin/users")}>
                          <Users className="h-4 w-4 mr-2" />
                          {t.admin.users}
                        </DropdownMenuItem>
                      )}
                    </>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    {t.nav.signOut}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="ml-2"
              >
                Sign In
              </Button>
            )}

            <div className="ml-2 border-l pl-2 flex items-center gap-2">
              <LanguageSelector />
            </div>
          </nav>
        </div>
      </header>

      {/* Dashboard or Calendar Content */}
      <main className="container py-8 pb-24 sm:pb-8">
        {user && user.role === "user" ? (
          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-1">
                {(t as any).dashboard.welcome}, {user.name?.split(' ')[0]}!
              </h2>
              <p className="text-muted-foreground">
                {(t as any).dashboard.overview}
              </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Upcoming Appointment */}
              <Card className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {(t as any).dashboard.nextReservation}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingReservation ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-2xl font-bold">
                          {formatAppDate(upcomingReservation.scheduledStart!, lang as any, true)}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Anchor className="h-3.5 w-3.5" />
                          {upcomingReservation.crane?.name}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setLocation("/my-reservations")} className="w-full">
                        {(t as any).dashboard.details}
                      </Button>
                    </div>
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-sm text-muted-foreground">{(t as any).dashboard.noUpcoming}</p>
                      <Button variant="link" size="sm" onClick={() => setLocation("/new-reservation")} className="mt-2">
                        {t.nav.newReservation}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Active Requests Summary */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {(t as any).dashboard.activeRequests}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setLocation("/my-reservations")}>
                    {(t as any).dashboard.viewAll}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingRequests.length > 0 ? (
                      pendingRequests.slice(0, 3).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                          <span className="truncate max-w-[150px] font-medium">
                            {r.vessel?.name || (t as any).myReservations.stepper.request}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {(t as any).dashboard.noActive}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <section className="space-y-4">
              <h3 className="text-lg font-semibold">{(t as any).dashboard.quickActions}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  onClick={() => setLocation("/new-reservation")}
                >
                  <Plus className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">{t.nav.newReservation}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  onClick={() => setLocation("/my-vessels")}
                >
                  <Ship className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">{t.nav.vessels}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  onClick={() => setLocation("/my-reservations")}
                >
                  <ClipboardList className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">{t.nav.myReservations}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  onClick={() => setLocation("/my-card")}
                >
                  <IdCard className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">{(t as any).dashboard.myCard}</span>
                </Button>
              </div>
            </section>

            {/* Show calendar as secondary on dashboard */}
            <section className="pt-8 border-t">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">{t.calendar.title}</h3>
                <Button variant="ghost" size="sm" onClick={() => {
                  const el = document.getElementById('full-calendar');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  {(t as any).dashboard.viewFullCalendar}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div id="full-calendar" className="rounded-xl border bg-card p-4">
                <Calendar />
              </div>
            </section>
          </div>
        ) : (
          <Calendar />
        )}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
