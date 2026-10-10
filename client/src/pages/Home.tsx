import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import Calendar from "./Calendar";
import LandingPage from "../components/LandingPage";
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
  ListOrdered,
  Wind,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { toZagreb } from "@shared/timezone";

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

  const { data: waitlistStatus } = trpc.landWaiting.getMyStatus.useQuery(
    undefined,
    { enabled: !!user && user.role === "user" }
  );

  // Land Dispatch & Mobile Portal queries
  const utils = trpc.useUtils();

  const { data: activeStoppages = [] } = trpc.landDispatch.getActiveStoppagesToday.useQuery(
    undefined,
    { enabled: !!user && user.role === "user" }
  );

  const { data: activeOffer, refetch: refetchOffer } = trpc.landDispatch.getMyActiveOffer.useQuery(
    undefined,
    { enabled: !!user && user.role === "user" }
  );

  const { data: vesselsOnLand = [] } = trpc.landDispatch.getMyVesselsOnLand.useQuery(
    undefined,
    { enabled: !!user && user.role === "user" }
  );

  const respondOfferMutation = trpc.landDispatch.respondToWaitingOffer.useMutation({
    onSuccess: (_, variables) => {
      if (variables.accept) {
        toast.success(
          lang === "hr"
            ? "Čestitamo! Uspješno ste prihvatili ponuđeni termin za suhi vez."
            : "Congratulations! You accepted the dry berth slot offer."
        );
      } else {
        toast.info(
          lang === "hr"
            ? "Ponuđeni termin za suhi vez je odbijen."
            : "Slot offer declined."
        );
      }
      refetchOffer();
      utils.reservation.myReservations.invalidate();
      utils.landWaiting.getMyStatus.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Greška pri obradi odgovora na ponudu.");
    },
  });

  const formatHoldCountdown = (expiresAt: string | Date | null | undefined) => {
    if (!expiresAt) return "";
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return lang === "hr" ? "Isteklo" : "Expired";
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
      return lang === "hr" ? `Preostalo: ${hours}h ${mins}m` : `Remaining: ${hours}h ${mins}m`;
    }
    return lang === "hr" ? `Preostalo: ${mins} min` : `Remaining: ${mins} min`;
  };

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
          <div className="space-y-6">
            {/* Weather Stoppage Alert Banner */}
            {activeStoppages.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 shadow-sm text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-200/80 dark:bg-amber-900 text-amber-800 dark:text-amber-100 shrink-0">
                    <Wind className="h-5 w-5 animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">
                        {lang === "hr" ? "Privremena obustava rada dizalica (Vremenski uvjeti)" : "Crane Work Stoppage (Weather conditions)"}
                      </h4>
                      <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase">
                        {lang === "hr" ? "Aktivno" : "Active"}
                      </Badge>
                    </div>
                    <p className="text-xs mt-1 text-amber-800/90 dark:text-amber-300">
                      {lang === "hr"
                        ? "Zbog nepovoljnih vremenskih uvjeta (vjetar/bura), operacije na pojedinim dizalicama su privremeno obustavljene radi sigurnosti."
                        : "Due to unfavorable weather conditions (strong wind/gale), operations on certain cranes are temporarily suspended for safety."}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                      {activeStoppages.map((s: any) => (
                        <span key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/80 dark:bg-amber-900/60 border border-amber-200 dark:border-amber-800 font-medium text-foreground">
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          <span>{s.craneName || "Dizalica"}</span>
                          <span className="text-muted-foreground text-[11px]">({s.reason || "Vremenski uvjeti"})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive 24h Hold Offer Card */}
            {activeOffer && (
              <div className="rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 p-5 shadow-md relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {lang === "hr" ? "Ponuđen termin za suhi vez!" : "Dry berth slot offered!"}
                      </Badge>
                      <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                        {formatHoldCountdown(activeOffer.expiresAt)}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground mt-1">
                      {activeOffer.vesselName} <span className="font-mono text-sm font-normal text-muted-foreground">({activeOffer.vesselRegistration || "Bez reg."})</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {lang === "hr"
                        ? `Ponuđeno mjesto u zoni: ${activeOffer.zoneName} (${activeOffer.zoneCode}) na dizalici ${activeOffer.craneName}`
                        : `Offered spot in zone: ${activeOffer.zoneName} (${activeOffer.zoneCode}) on crane ${activeOffer.craneName}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lang === "hr" ? "Predviđeni termin operacije:" : "Scheduled slot:"}{" "}
                      <span className="font-semibold text-foreground">
                        {formatAppDate(activeOffer.offeredStart, lang as any, true)} – {formatAppDate(activeOffer.offeredEnd, lang as any, false).split(" ")[1] || ""}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={respondOfferMutation.isPending}
                      onClick={() => {
                        if (confirm(lang === "hr" ? "Jeste li sigurni da želite odbiti ponuđeni termin?" : "Are you sure you want to decline this slot offer?")) {
                          respondOfferMutation.mutate({ offerId: activeOffer.id, accept: false });
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      {lang === "hr" ? "Odbij" : "Decline"}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      disabled={respondOfferMutation.isPending}
                      onClick={() => respondOfferMutation.mutate({ offerId: activeOffer.id, accept: true })}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {respondOfferMutation.isPending ? (lang === "hr" ? "Prihvaćanje..." : "Accepting...") : (lang === "hr" ? "Prihvati ponudu" : "Accept Offer")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-1">
                {(t as any).dashboard.welcome}, {user.name?.split(' ')[0]}!
              </h2>
              <p className="text-muted-foreground">
                {(t as any).dashboard.overview}
              </p>
            </section>

            <div className={`grid grid-cols-1 gap-6 ${waitlistStatus ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
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
                            {(r as any).vesselName || (r as any).vessel?.name || (t as any).myReservations.stepper.request}
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

              {/* Dry Berth Waitlist Status */}
              {waitlistStatus && (
                <Card className="relative overflow-hidden border-blue-100 bg-blue-50/5">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <ListOrdered className="h-4 w-4 text-primary" />
                      {lang === "hr" ? "Čeka suhi vez" : "Waitlist"}
                    </CardTitle>
                    {waitlistStatus.status === "offered" ? (
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 animate-pulse text-white">
                        {lang === "hr" ? "Ponuđeno!" : "Offered!"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {lang === "hr" ? "Na listi" : "Queued"}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="space-y-4">
                      <div>
                        <div className="text-2xl font-bold flex items-baseline gap-1">
                          {waitlistStatus.position}
                          <span className="text-xs text-muted-foreground font-normal">
                            . {lang === "hr" ? "mjesto" : "position"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {lang === "hr"
                            ? `Preferirana zona: ${waitlistStatus.preferredZoneName || "Bilo koja"}`
                            : `Preferred zone: ${waitlistStatus.preferredZoneName || "Any"}`}
                        </p>
                      </div>
                      
                      {waitlistStatus.status === "offered" && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-emerald-800 space-y-1">
                          <p className="font-semibold">
                            {lang === "hr" 
                              ? "Lučka uprava Vam je ponudila slobodno mjesto!" 
                              : "The harbor office has offered you a free spot!"}
                          </p>
                          <p>
                            {lang === "hr"
                              ? "Molimo javite se kapetanu na 021/385-122 radi rasporeda."
                              : "Please contact the harbor captain at 021/385-122 to arrange allocation."}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Vessels currently on dry berth (Kopno) */}
            {vesselsOnLand.length > 0 && (
              <Card className="border-sky-200/80 bg-gradient-to-br from-sky-50/50 via-card to-card dark:bg-sky-950/10 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <Ship className="h-4 w-4 text-sky-600" />
                    {lang === "hr" ? "Moja plovila na suhom vezu" : "My Vessels on Dry Berth"}
                  </CardTitle>
                  <Badge variant="outline" className="border-sky-300 text-sky-700 dark:text-sky-300 text-xs font-medium">
                    {vesselsOnLand.length} {vesselsOnLand.length === 1 ? (lang === "hr" ? "plovilo" : "vessel") : (lang === "hr" ? "plovila" : "vessels")}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {vesselsOnLand.map((v) => {
                    const daysOnLand = v.liftedAt
                      ? Math.max(0, Math.floor((Date.now() - new Date(v.liftedAt).getTime()) / (1000 * 60 * 60 * 24)))
                      : 0;
                    return (
                      <div
                        key={v.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border bg-card/80 hover:bg-card transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{v.vesselName}</span>
                            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                              {v.vesselRegistration || "Bez reg."}
                            </span>
                            {v.vesselLengthM && (
                              <span className="text-xs text-muted-foreground">({v.vesselLengthM} m)</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Zona: <strong className="text-foreground">{v.zoneName} ({v.zoneCode})</strong></span>
                            {v.spotNumber && <span>• Mjesto: <strong className="text-foreground">#{v.spotNumber}</strong></span>}
                            <span>• Na kopnu: <strong className="text-sky-700 dark:text-sky-400">{daysOnLand} {daysOnLand === 1 ? "dan" : "dana"}</strong></span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950 hover:text-sky-800 text-xs gap-1.5 shrink-0"
                          onClick={() => setLocation(`/new-reservation?vesselId=${v.vesselId}&opCategory=lower_to_sea`)}
                        >
                          <ArrowDown className="h-3.5 w-3.5 text-sky-600" />
                          {lang === "hr" ? "Zakaži spuštanje u more" : "Schedule launch to sea"}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

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

          </div>
        ) : (
          <LandingPage />
        )}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
