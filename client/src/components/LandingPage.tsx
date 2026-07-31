import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLang } from "@/contexts/LangContext";
import { Ship, Clock, Phone, Mail, MapPin, Calendar, HelpCircle, Shield, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { formatAppDate } from "@/lib/date-utils";

function isSeasonActiveNow(startDateStr?: string, endDateStr?: string): boolean {
  if (!startDateStr || !endDateStr) return false;
  const now = new Date();
  const currentMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const startMMDD = startDateStr.length >= 10 ? startDateStr.slice(5, 10) : startDateStr;
  const endMMDD = endDateStr.length >= 10 ? endDateStr.slice(5, 10) : endDateStr;

  if (startMMDD <= endMMDD) {
    return currentMonthDay >= startMMDD && currentMonthDay <= endMMDD;
  } else {
    return currentMonthDay >= startMMDD || currentMonthDay <= endMMDD;
  }
}

function formatSeasonHours(workingHours: any, isHr: boolean): string[] {
  if (!workingHours || typeof workingHours !== "object") return [];

  const dayNames: Record<string, { hr: string; en: string }> = {
    mon: { hr: "Pon", en: "Mon" },
    tue: { hr: "Uto", en: "Tue" },
    wed: { hr: "Sri", en: "Wed" },
    thu: { hr: "Čet", en: "Thu" },
    fri: { hr: "Pet", en: "Fri" },
    sat: { hr: "Sub", en: "Sat" },
    sun: { hr: "Ned", en: "Sun" },
  };

  const daysOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const groups: Array<{ days: string[]; timeStr: string }> = [];

  for (const dayKey of daysOrder) {
    const hours = workingHours[dayKey];
    let timeStr = "";
    if (hours && hours.from && hours.to) {
      timeStr = `${hours.from} - ${hours.to}`;
    } else {
      timeStr = isHr ? "Zatvoreno" : "Closed";
    }

    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.timeStr === timeStr) {
      lastGroup.days.push(dayKey);
    } else {
      groups.push({ days: [dayKey], timeStr });
    }
  }

  return groups.map((g) => {
    const startDay = dayNames[g.days[0]][isHr ? "hr" : "en"];
    const endDay = dayNames[g.days[g.days.length - 1]][isHr ? "hr" : "en"];
    const daysLabel = g.days.length === 1 ? startDay : `${startDay} - ${endDay}`;
    return `${daysLabel}: ${g.timeStr}`;
  });
}

export default function LandingPage() {
  const { lang } = useLang();
  const isHr = lang === "hr";

  const { data: seasons = [], isLoading: isLoadingSeasons } = trpc.season.list.useQuery();

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden min-h-[480px] flex items-center justify-center text-white p-6 sm:p-12 shadow-2xl">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: "url('/psd-spinut-panorama-3.png')" }}
        />
        {/* Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/70 to-transparent" />

        {/* Hero Content */}
        <div className="relative z-10 max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 backdrop-blur border border-primary/30 text-primary-foreground text-xs font-semibold uppercase tracking-wider mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            {isHr ? "Sustav Rezervacija Dizalice" : "Crane Booking System"}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight drop-shadow-md text-white font-sans">
            {isHr ? "PŠD Špinut — Split" : "PSD Spinut — Split"}
          </h1>
          <p className="text-lg sm:text-xl text-slate-200 drop-shadow max-w-2xl mx-auto leading-relaxed">
            {isHr
              ? "Jednostavno, brzo i transparentno upravljanje rezervacijama dizalica za članove društva. Prijavite se kako biste podnijeli zahtjev."
              : "Simple, fast, and transparent crane booking management for club members. Sign in to submit your reservation request."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              className="w-full sm:w-auto font-semibold px-8 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5"
              onClick={() => { window.location.href = getLoginUrl(); }}
            >
              {isHr ? "Prijavi se" : "Sign In"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto font-semibold px-8 border-white/20 bg-white/10 backdrop-blur hover:bg-white/20 text-white rounded-xl transition-all hover:-translate-y-0.5"
              onClick={() => { window.location.href = "/auth?mode=register"; }}
            >
              {isHr ? "Registracija" : "Register"}
            </Button>
          </div>
        </div>
      </section>

      {/* Info: Radno Vrijeme & Kontakt */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radno vrijeme */}
        <div className="p-8 rounded-3xl border bg-card flex flex-col justify-between shadow-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">{isHr ? "Radno vrijeme dizalice" : "Crane Working Hours"}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isHr
                ? "Radno vrijeme definirano je aktivnom sezonom u lučici. Praznicima dizalica ne radi."
                : "Working hours are defined by the active season in the marina. Closed on public holidays."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {isLoadingSeasons ? (
              <div className="col-span-2 text-center py-6 text-sm text-muted-foreground">
                {isHr ? "Učitavanje radnog vremena..." : "Loading working hours..."}
              </div>
            ) : seasons.length === 0 ? (
              <div className="col-span-2 space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border text-center text-sm text-muted-foreground">
                {isHr ? "Redovno radno vrijeme: 08:00 - 16:00 (Pon - Pet)" : "Regular working hours: 08:00 - 16:00 (Mon - Fri)"}
              </div>
            ) : (
              seasons.filter((s: any) => s.isActive !== false).map((season: any) => {
                const isActiveNow = isSeasonActiveNow(season.startDate, season.endDate);
                const formattedLines = formatSeasonHours(season.workingHours, isHr);

                return (
                  <div
                    key={season.id}
                    className={`space-y-3 p-4.5 rounded-2xl border transition-all ${
                      isActiveNow
                        ? "bg-primary/5 border-primary/40 ring-2 ring-primary/20 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          {season.name}
                        </h4>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                          📅 {formatAppDate(season.startDate)} — {formatAppDate(season.endDate)}
                        </p>
                      </div>
                      {isActiveNow && (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider shrink-0 shadow-2xs">
                          {isHr ? "Aktivna sezona" : "Active Season"}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs font-semibold space-y-1.5 pt-1 text-slate-700 dark:text-slate-300">
                      {formattedLines.map((line, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Kontakt Podaci */}
        <div className="p-8 rounded-3xl border bg-card flex flex-col justify-between shadow-sm space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Phone className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">{isHr ? "Kontaktirajte nas" : "Contact Information"}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isHr
                ? "Za sve upite i dogovore oko termina obratite se kapetanu lučice."
                : "For urgent inquiries and scheduling slots outside normal working hours, contact the harbor master."}
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Pomorsko športsko društvo “Špinut”</div>
                <div className="text-muted-foreground">Lučica 7, 21000 Split</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Tel</div>
                  <div className="font-medium">021/ 386 813</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Mob. kapetan</div>
                  <div className="font-medium">091/ 505 59 86</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">E-mail</div>
                  <a href="mailto:lucica@psd-spinut.hr" className="font-medium text-primary hover:underline">
                    lucica@psd-spinut.hr
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Fax</div>
                  <div className="font-medium">021/ 323 002</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
