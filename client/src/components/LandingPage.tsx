import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLang } from "@/contexts/LangContext";
import { Ship, Clock, Phone, Mail, MapPin, Calendar, HelpCircle, Shield } from "lucide-react";

export default function LandingPage() {
  const { lang } = useLang();

  const isHr = lang === "hr";

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

      {/* Features Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {isHr ? "Kako funkcionira sustav?" : "How does it work?"}
          </h2>
          <p className="text-muted-foreground">
            {isHr
              ? "Sve što vam je potrebno za dizanje i spuštanje vašeg plovila na jednom mjestu."
              : "Everything you need for hauling out and launching your vessel in one place."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          <div className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Ship className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{isHr ? "1. Registrirajte plovila" : "1. Add Vessels"}</h3>
            <p className="text-sm text-muted-foreground">
              {isHr 
                ? "Unesite dimenzije i težinu plovila u svoj karton kako biste ubrzali proces odobravanja rezervacije." 
                : "Add vessel details (dimensions and weight) to your profile to speed up reservation approval."}
            </p>
          </div>

          <div className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{isHr ? "2. Pošaljite zahtjev" : "2. Submit Request"}</h3>
            <p className="text-sm text-muted-foreground">
              {isHr
                ? "Odaberite željeni datum i tip operacije. Administrator će pregledati podatke i potvrditi slobodan termin."
                : "Choose your preferred date and operation type. The administrator will review and schedule your slot."}
            </p>
          </div>

          <div className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{isHr ? "3. Lista čekanja i kopno" : "3. Waiting List & Land"}</h3>
            <p className="text-sm text-muted-foreground">
              {isHr
                ? "Ako nema mjesta na kopnu ili slobodnih termina, sustav vas automatski vodi na listu čekanja po FIFO redoslijedu."
                : "If dry berths are full or slots are taken, the system automatically waitlists you using the FIFO sequence."}
            </p>
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
                ? "Radno vrijeme podložno je sezonskim promjenama i vremenskim uvjetima. Praznicima dizalica ne radi."
                : "Working hours are subject to seasonal changes and weather conditions. Closed on public holidays."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border">
              <h4 className="font-semibold text-sm text-primary">{isHr ? "Ljetno razdoblje" : "Summer Season"}</h4>
              <p className="text-xs text-muted-foreground">{isHr ? "1. travnja — 31. listopada" : "April 1 — October 31"}</p>
              <div className="text-sm font-medium space-y-1 mt-2">
                <div>{isHr ? "Pon - Sub: 07:00 - 21:00" : "Mon - Sat: 07:00 - 21:00"}</div>
                <div>{isHr ? "Ned: 08:00 - 14:00" : "Sun: 08:00 - 14:00"}</div>
              </div>
            </div>

            <div className="space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border">
              <h4 className="font-semibold text-sm text-primary">{isHr ? "Zimsko razdoblje" : "Winter Season"}</h4>
              <p className="text-xs text-muted-foreground">{isHr ? "1. studenog — 31. ožujka" : "November 1 — March 31"}</p>
              <div className="text-sm font-medium space-y-1 mt-2">
                <div>{isHr ? "Pon - Pet: 08:00 - 16:00" : "Mon - Fri: 08:00 - 16:00"}</div>
                <div>{isHr ? "Sub: 08:00 - 13:00" : "Sat: 08:00 - 13:00"}</div>
                <div>{isHr ? "Ned: Zatvoreno" : "Sun: Closed"}</div>
              </div>
            </div>
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
                ? "Za hitne upite i dogovore oko termina izvan radnog vremena obratite se kapetanu lučice."
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
