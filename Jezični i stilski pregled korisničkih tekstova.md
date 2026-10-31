# Jezični i stilski pregled korisničkih tekstova

**Aplikacija:** crane-booking-app, proprietary komercijalni proizvod. **Datum:** 30. listopada 2026. **Commit:** 31b5640ca137c7a527e93b293a8b742192761d4a.

## 1. Zaključak

Tekstovi uglavnom omogućuju razumijevanje osnovnih radnji, ali **nisu jezično, terminološki ni značenjski usklađeni kroz cijeli program**. Veći problem od sitnih pravopisnih odstupanja predstavljaju poruke koje pogrešno opisuju uvjet ili rezultat radnje, djelomična lokalizacija, različiti nazivi istih stanja i neobjašnjen stručni žargon. Prioritet su upute za lozinku, vrijeme čekanja, tvrdnje o slanju obavijesti, aktivnoj integraciji i učinku brisanja/anonimizacije.

Dokument sadrži **35 nalaza J01–J35**, lokacije, konkretne zamjene, rječnik i plan provjere. **Stilski prijedlog nije tvrdnja da je svaka druga jezična varijanta nepravilna.** Neke poruke nije moguće pošteno popraviti samo novom formulacijom: potreban je stvarni status operacije ili potvrđeno poslovno pravilo.

Aplikacija nije mijenjana. Kreirana je samo ova datoteka; nisu korišteni produkcijska baza, stvarne .env vrijednosti, osobni komentari niti slanje stvarnih obavijesti.

## 2. Opseg i metodologija

Pregled obuhvaća naslove, labele, gumbove, tabove, placeholdere, tooltipove, statuse, poruke uspjeha i pogreške, pristupačne nazive kontrola, e-poštu, SMS, kalendarske tekstove i reprezentativne PDF predloške. Pod „komentarima” pregledane su **korisnicima vidljive napomene, njihove upute, nazivi i automatski prefiksi**. Izvorni komentari koji se ne prikazuju nisu korisnički copy; slobodno unesene stvarne bilješke osoblja/članova nisu dostupne ni lektorirane.

Pročitani su oba prijevodna rječnika, javni/auth tokovi, rezervacije, mobilni operater, administracija, dispečer, izvještaji i backend putovi povezani sa spornim porukama. Nalazi su statički provjereni u kodu, bez browser snimaka, testne dostave ili vizualne provjere PDF-a.

Automatizirani inventar TypeScript AST-om:

- HR i EN rječnik imaju **po 197 tekstualnih ključeva**, bez različitih skupova ključeva. To ne dokazuje cjelovitu lokalizaciju.
- U **141 TSX datoteci** postoje **2.458 nepraznih JSX tekstualnih čvorova** te **270 literalnih atributa** title, placeholder, aria-label ili alt. To nisu brojevi jedinstvenih ni sigurno dostupnih poruka; uključuju i razvojne/showcase komponente.
- Dodatni tekstovi postoje u toastovima, uvjetnim izrazima, template literalima i backendu. Odsutnost useLang korištena je samo za pronalazak kandidata, ne kao samostalan dokaz.
- Postoje dinamični pristupi prijevodima i pristupi preko t as any. Ključevi nisu proglašeni mrtvima samo zato što nemaju izravan tekstualni poziv.

**Prioriteti:** P1 — pogrešno očekivanje ili osjetljiva odluka; P2 — značajna razumljivost/lokalizacija; P3 — urednička dorada. Putanje i linije odnose se na navedeni commit. „Provjereno u kodu” ne znači da je poruka snimljena u produkciji.

## 3. Točnost značenja i poslovnih poruka

### J01 — P1 — Lozinka: uputa kaže šest, pravilo traži osam znakova

**Dokaz:** client/src/pages/admin/AdminStaff.tsx:471 prikazuje **„Minimalno 6 znakova”**, a :477 omogućava spremanje sa šest znakova. server/routers.ts:1619 koristi min(8). client/src/i18n/hr.ts:182 već ima „Min. 8 znakova”.

**Zamjena:** **„Najmanje 8 znakova” / “At least 8 characters”.** Uskladiti i frontend validaciju i poruku pogreške. Sama promjena placeholdera ne rješava aktivan gumb za nevaljan unos.

### J02 — P1 — „Za minutu” ne odgovara ograničenju zahtjeva

**Dokaz:** server/_core/index.ts:70–72: prozor 900.000 ms, odnosno 15 minuta, uz **„Previše zahtjeva za reset lozinke. Pokušajte ponovo za minutu.”** Limiter ima podatak o preostalim sekundama (server/_core/rateLimit.ts:75–82).

**Zamjena:** **„Poslali ste previše zahtjeva za promjenu lozinke. Pokušajte ponovno za {preostaloVrijeme}.”** Prikazati stvarno preostalo vrijeme, ne samo zamijeniti jednu minutu s fiksnih 15 minuta. Pravilno oblikovati množinu iz J25.

### J03 — P1 — Reset lozinke: uspjeh zahtjeva ne dokazuje slanje e-pošte

**Dokaz:** client/src/pages/AuthPage.tsx:147: **„Link za resetiranje je poslan na vaš email.”** Backend za nepoznatu adresu namjerno vraća uspjeh bez slanja (server/routers.ts:483–484), a za poznatu ne koristi boolean ishod slanja (:499–505). server/_core/email.ts:23–26,35–37 može vratiti false bez iznimke.

**Zamjena:** **„Ako postoji račun s tom adresom e-pošte, poslat ćemo upute za postavljanje nove lozinke.”** EN: **“If an account exists for that email address, we’ll send instructions to reset your password.”** Ne otkrivati postoji li račun samo radi preciznijeg toasta. Stvarni neuspjeh slanja treba operativni status.

### J04 — P1 — Poruka u aplikaciji i vanjska obavijest imaju različite ishode

**Dokaz:** client/src/pages/mobile/MobileOperatorApp.tsx:640: **„Poruka i obavijest poslane vlasniku!”** server/routes/mobileApi.ts:795–819 sprema poruku, pokreće e-poštu/SMS bez čekanja i samo ako kontakt postoji; odgovor ne dokazuje isporuku.

**Zamjena prema sadašnjem potvrđenom rezultatu:** **„Poruka je spremljena u razgovor.”** Kad postoji zaseban status, npr. **„Poruka je spremljena. E-pošta je predana na slanje.”** ili **„Poruka je spremljena, ali obavijest e-poštom nije poslana.”** „Predano na slanje”, „poslano” i „isporučeno” nisu sinonimi.

Slično vrijedi za OTP: client/src/pages/AuthPage.tsx:164 kaže da je kod poslan; server/_core/betterAuth.ts:421–426 ne koristi rezultat slanja. Stvaranje koda samo ne potvrđuje dostavu.

### J05 — P1 — „API Aktivan” nije prikaz stvarno provjerenog stanja

**Dokaz:** client/src/pages/admin/AdminInvoices.tsx:201–204 bezuvjetno prikazuje zelenu oznaku **„e-racuni.com API Aktivan”**. U tom renderiranju nema uvjeta vezanog uz rezultat provjere integracije.

**Zamjena bez health provjere:** **„Povezivanje s e-racuni.com”** kao naziv odjeljka ili **„Status veze nije provjeren”**. Uz stvarne podatke: „Veza provjerena {vrijeme}”, „Veza nije dostupna”, „Probni način rada”. Sama tipografska zamjena s „API aktivan” ne popravlja značenje.

### J06 — P1 — „Obriši” i „Anonimiziraj” obećavaju različite postupke

**Dokaz:** zasebni dijalozi u client/src/pages/admin/AdminUsers.tsx:798–838 koriste tekstove iz client/src/i18n/hr.ts:184–189 o brisanju računa, trajnoj anonimizaciji i anonimnoj statistici. server/routers.ts:1608,1706 za obje radnje poziva softDeleteUser. server/db.ts:245–255 mijenja dio identitetskih polja, ali tim zahvatom ne uklanja npr. OIB ni adresu i ne pretvara rezervacije u agregiranu statistiku.

**Preporuka:** prvo definirati stvarni opseg obje radnje. Primjer teksta za ograničen zahvat, ako implementacija potvrdi upravo to: **„Uklonit će se ime, adresa e-pošte i telefon iz ovog korisničkog zapisa. Povezane evidencije ostaju sačuvane.”** Takav zahvat ne nazvati potpunom anonimizacijom. Ne obećavati prestanak svih prijava bez provjere sesija. Tvrdnju „prema GDPR-u” ne koristiti kao zamjenu za dokaz stvarnog postupka; ovo nije pravno mišljenje o ukupnoj sukladnosti.

### J07 — P1 — Naziv poveznice obećava i uvjete korištenja

**Dokaz:** client/src/i18n/hr.ts:123–124: **„Prihvaćam Uvjete korištenja i Politiku privatnosti”**. client/src/pages/AuthPage.tsx:724–730 vodi samo na /privacy, a pregledani client/src/pages/PrivacyPolicy.tsx:11–12 naslovljen je **„Politika Privatnosti”** i govori o osobnim podacima.

**Preporuka:** naziv mora odgovarati dostupnom dokumentu: **„Politika privatnosti”** ako je samo to sadržaj. Za uvjete korištenja omogućiti stvaran dokument i odgovarajući naziv. Razliku između potvrde upoznatosti i privole treba potvrditi odgovorna osoba; ne rješavati pravnu osnovu obrade lektorskom zamjenom checkboksa.

### J08 — P1 — „Nije došlo” nije jednoznačan status ni razlog

**Dokaz:** client/src/pages/mobile/MobileOperatorApp.tsx:426,1096,1808 koristi **„Nije došlo”**; :1814–1825 uključuje i odustajanje, kvar motora te vremenske uvjete. server/routes/mobileApi.ts:968–970 rezultat sprema kao cancelled.

**Preporuka:** za zajednički tok **„Otkaži termin na terenu”**, uz jasno objašnjenu posljedicu i razlog. Za čisti izostanak **„Korisnik nije došao na termin” / “Customer did not attend”.** Dok backend sprema otkazivanje, uspjeh neka glasi **„Rezervacija je otkazana. Razlog: {razlog}.”** Ne stvarati samo tekstom dojam novog statusa. Odustajanje, kvar i izostanak nisu isti događaj.

### J09 — P1 — Iznimka fiksira dvije ekipe i koristi neobjašnjeni „override”

**Dokaz:** client/src/components/landDispatch/SlotRecommendationDialog.tsx:322–337: **„Kapacitet posade je popunjen (2/2)”**, **„Dvije dizalice već istovremeno rade…”**, **„Aktiviraj dispečerski override posade”**. Broj ekipa je postavka (server/db.ts:687; server/routers.ts:4772). Backend koristi **„svjesni dispečerski override”** (server/landDispatch/feasibility.ts:434,445).

**Zamjena:** **„Zauzete ekipe: {zauzeto} od {dostupno}”**, **„Odobri iznimku uz dodatnu ekipu”**, **„Razlog odobravanja iznimke”**. Objasniti koje ograničenje iznimka mijenja, a koje ne može zaobići. Ne izjednačavati broj dizalica i ekipa bez potvrde pravila.

### J10 — P2 — Statusi nemaju jedinstven ugovor prikaza

**Dokaz:** client/src/i18n/hr.ts:87–97 prikazuje approved kao **„Odobreno”**, a u koracima kao **„Potvrđeno”**. client/src/pages/admin/AdminCalendar.tsx:56–63 ima zasebne nazive. client/src/pages/MyReservations.tsx:70–87 posebno obrađuje rejected/cancelled, a ostala neprepoznata stanja svodi na prvi korak. Schema ima i waitlisted/not_performed (drizzle/schema.ts:24–32).

**Preporuka:** primijeniti mapu iz odjeljka 6. „Odobren zahtjev” i „potvrđen termin” mogu biti opravdani kontekstualni izrazi ako označavaju dokumentirano stanje. Neprepoznati status ne prikazivati kao početni „Zahtjev”. To zahtijeva i obradu stanja, ne samo novi prijevod.

## 4. Lokalizacija i razumljivost

### J11 — P2 — EN odabir ne prevodi kompletne tokove

**Dokaz:** client/src/contexts/LangContext.tsx:21–33 mijenja rječnik hr/en, ali mnogi tekstovi ostaju literali: client/src/pages/AuthPage.tsx:139–164, client/src/pages/mobile/MobileOperatorApp.tsx:385–426, client/src/pages/admin/AdminInvoices.tsx:198–207 i client/src/components/landDispatch/SlotRecommendationDialog.tsx:322–337. Rječnici imaju jednake skupove ključeva.

**Preporuka:** prevesti cijeli tok: naslov, polja, validaciju, pogrešku, uspjeh, status i potvrdu. Ako je administracija namjerno samo HR, to ograničenje treba uskladiti s prikazom preklopnika jezika. Obvezni opseg EN nije specificiran; nepotpuno ponašanje je provjereno, a ciljni opseg treba potvrditi.

### J12 — P2 — Backend i tehničke poruke prodiru u korisnički jezik

**Dokaz:** shared/const.ts:8–9: **“Please login (10001)”**, **“You do not have required permission (10002)”**. client/src/pages/AuthPage.tsx:134,150,159 i client/src/components/ReservationForm.tsx:152 prikazuju err.message. server/routes/mobileApi.ts:787,790 vraća **“reservationId and content are required”** i **“DB unavailable”**. client/src/components/landDispatch/SlotRecommendationDialog.tsx:92 dodaje „Greška:”.

**Zamjene:** **„Za nastavak se prijavite.” / “Sign in to continue.”**; **„Nemate ovlasti za ovu radnju.” / “You don’t have permission to perform this action.”**; **„Usluga trenutačno nije dostupna. Pokušajte ponovno.”**; **„Odaberite rezervaciju i unesite poruku.”**

Za pogreške koristiti stabilan kod i lokaliziran opis, a ne sirovi DB/API tekst. “Please login” ima i gramatički problem: glagolski je **“Please log in”**. Klijent uspoređuje tekst pogreške (client/src/main.tsx:17), pa zamjenu konstante treba uskladiti s tom logikom.

### J13 — P2 — 404 i globalna pogreška ostaju engleski

**Dokaz:** client/src/pages/NotFound.tsx:27–45: **“Page Not Found”**, **“Go Home”**. client/src/components/ErrorBoundary.tsx:34–51: **“An unexpected error occurred.”**, **“Reload Page”**, uz stack (:38).

**Zamjene:** **„Stranica nije pronađena” / “Page not found”**, **„Na početnu” / “Go to home page”**; **„Došlo je do neočekivane pogreške.”**, **„Ponovno učitaj stranicu” / “Reload page”.** Pomoć: „Pokušajte ponovno učitati stranicu. Ako se pogreška ponovi, javite se podršci.” Dodati samo stvarni kontakt. Tehnički stack nije korisnička uputa.

### J14 — P2 — Pristupačni nazivi kontrola nisu lokalizirani

**Dokaz:** client/src/components/ui/dialog.tsx:141 i client/src/components/ui/sheet.tsx:77: **“Close”**; client/src/components/ui/pagination.tsx:74,91,114: **“Go to previous page”**, **“Go to next page”**, **“More pages”**; client/src/components/ui/sidebar.tsx:284,296: **“Toggle Sidebar”**. Komponente se koriste, npr. u client/src/pages/admin/AdminUsers.tsx:17,33. client/src/components/ReservationChat.tsx:125–135 ima gumb slanja samo s ikonom, bez izričitog tekstualnog naziva.

**Zamjene:** **„Zatvori”**, **„Prethodna stranica”**, **„Sljedeća stranica”**, **„Više stranica”**, **„Prikaži ili sakrij navigaciju”**, **„Pošalji poruku”**, uz EN ekvivalente. Skriveni nazivi također su korisnički tekst.

### J15 — P2 — Jezik obavijesti i dokumenata nije jedinstven

**Dokaz:** helperi podržavaju lang (server/_core/email.ts:103–111), ali server/services/notifications.ts:78,86,96,103 i server/routes/mobileApi.ts:810 forsiraju HR. Google Calendar naslov i opis ostaju hrvatski i uz EN potvrdu (server/_core/email.ts:114–117). PDF rasporeda koristi samo HR locale (client/src/lib/reports/pdfmake-schedule.ts:3,57–64).

**Preporuka:** definirati jezik primatelja za obavijesti i odvojeno jezik službenih dokumenata. Ako PDF mora biti HR, označiti **„Preuzmi PDF na hrvatskom”**. Prevesti i kalendarski naslov/opis. Slobodne napomene ne prevoditi automatski bez dogovora.

### J16 — P2 — Jezik dokumenta ne prati jezik sučelja

**Dokaz:** client/index.html:2 fiksira lang=en. client/src/contexts/LangContext.tsx:25–28 mijenja stanje i localStorage bez ažuriranja jezika HTML dokumenta u tom kodu; zadana vrijednost sučelja je HR (:23).

**Preporuka:** aktivni HR → lang=hr, EN → lang=en. Time se usklađuje izgovor čitača ekrana s tekstom; to je zasebno od prijevoda gumba.

### J17 — P2 — Mjerne jedinice u obrascu ispisuju se dvaput

**Dokaz:** client/src/i18n/hr.ts:55–58 ima **„Dužina (m)”**, **„Širina (m)”**, **„Težina (t)”**, a client/src/components/ReservationForm.tsx:567,571,575 ponovno dodaje (m)/(t). Isto vrijedi za EN rječnik client/src/i18n/en.ts:53–56.

**Sastavljeni tekst:** **„Dužina (m) (m)”**, **„Širina (m) (m)”**, **„Težina (t) (t)”**. To je izvedeno iz koda, bez browser snimke.

**Zamjena:** jedan vlasnik jedinice i konačno **„Duljina plovila (m)”**, **„Širina plovila (m)”**, **„Masa plovila (t)”** / **“Vessel length (m)”**, **“Vessel beam (m)”**, **“Vessel mass (t)”**. „Masa” je preciznija za tone; promjena riječi nije promjena podatka.

### J18 — P2 — Masa, nosivost i širina traže jasnije nazive

**Dokaz:** client/src/i18n/hr.ts:75: **„Težina plovila premašuje kapacitet dizalice (kN).”** client/src/pages/admin/AdminCranes.tsx:191 ima **„Maks. kapacitet: … kN”**, a plovila se unose u tonama. client/src/i18n/en.ts:74,145 koristi doslovno **“pool width”**.

**Preporuka:** **„Najveće dopušteno opterećenje (kN)”** i **„Masa plovila (t)”**. Poruka: **„Odabrana dizalica nema dovoljnu nosivost za unesenu masu plovila.”** Jedinice/pretvorbu mora potvrditi kod; ne zamijeniti samo kN s t. S operaterom razjasniti opisuje li širina bazen ili prolaz: EN zatim **“Basin width”** ili **“Clearance width”**. Sporni weightExceeded pronađen je u rječniku; njegova aktualna izravna upotreba nije potvrđena, pa se ne tvrdi da je ta pogreška sigurno prikazana.

### J19 — P2 — Interni izrazi zaklanjaju radnju

**Dokaz:** client/src/i18n/hr.ts:153–154: **„Trajanje slota (min)”**, **„Tampon zona (min)”**; client/src/pages/admin/AdminSettings.tsx:113: **„Automatski tampon između rezervacija…”**; client/src/pages/admin/AdminStaff.tsx:116: **„Greška pri promjeni role.”** client/src/components/landDispatch/DispatchGanttTimeline.tsx:464: **„Ručni override posade”**.

**Zamjene:** **„Trajanje termina (min)”**, **„Razmak između rezervacija (min)”**, **„Vrijeme za pripremu i moguća kašnjenja između rezervacija.”**, **„Nije moguće promijeniti ulogu korisnika.”** Za override vidjeti J09. Interne programske identifikatore nije potrebno prevoditi.

### J20 — P2 — „Napomena” ne određuje publiku

**Dokaz:** client/src/components/WorkOrderExecutionDialog.tsx:622: **„Napomena operatera / zapažanja na trupu”**; client/src/pages/mobile/MobileOperatorApp.tsx:1501,1566,1654: **„Napomena operatera”**, **„Napomena (opcionalno)”**. E-mail uključuje adminNotes (server/_core/email.ts:143), server/services/notifications.ts:77 šalje res.adminNote, a PDF izvještaj ispisuje isto polje (client/src/components/ReportPdfTemplates.tsx:664–666).

**Preporuka:** razlikovati **„Poruka vlasniku”**, **„Interna napomena osoblja”**, **„Napomena na radnom nalogu”**, **„Napomena o smještaju plovila”**. Uputa mora opisivati stvarni put: „Ovaj tekst prikazuje se u potvrdi rezervacije.” ili „Prikazuje se na radnom nalogu.” **Ne nazvati adminNote internim dok se šalje korisniku.** Razdvajanje publike prvo je pitanje modela i ovlasti, tek zatim naziva polja.

### J21 — P2 — Formati brojeva, valuta i vremena razlikuju se

**Dokaz:** client/src/components/ReservationForm.tsx:476 koristi toFixed(2) pa ručno dodaje € i jedinicu. client/src/lib/reports/pdfmake-schedule.ts:50,99 koristi toFixed(1) i **„Planirano sati: … h”**; datumi imaju dd.MM.yyyy. (:58–64). E-mail koristi en-GB za datum, en-US za broj (server/_core/email.ts:110–111,139). client/src/components/ReservationChat.tsx:100 fiksira hr-HR.

**Preporuka:** HR hr-HR, EN npr. en-GB, uz jedinstveno lokalizirano formatiranje. Provjera u postojećem runtimeu daje HR cijenu **„1.234,50 €”** s nerastavljivim razmakom. Predloženi HR opisni datum: **„30. 10. 2026.”**, vrijeme **„14:30”**, raspon **„14:30–15:00”**. Zbijeni tablični datum može ostati bez razmaka ako je to namjeran i dosljedan izbor. Za strane korisnike jasno označiti vremensku zonu termina kad je moguća zabuna. Šifre i registracije ne formatirati kao brojeve.

## 5. Gramatika, stil i kratke zamjene

| ID / prioritet / vrsta | Dokaz i sadašnji tekst | Precizna preporuka |
|---|---|---|
| **J22 / P2 / konstrukcija** | server/_core/email.ts:360,366: **„Nova poruka u vezi rezervacije”**, **„u vezi vaše rezervacije”** | **„Nova poruka o rezervaciji”**; **„Imate novu poruku osoblja lučice o rezervaciji {broj}.”** Alternativa: „u vezi s vašom rezervacijom”. |
| **J23 / P2 / institucija i prijevod** | server/_core/email.ts:393–394: **„kontaktirajte lučku kapetaniju”** / **“contact the harbor master”** | Lučka kapetanija nije automatski ista institucija kao osoblje marine/lučki kapetan društva. Potvrditi primatelja. Ako je to osoblje: **„Za potvrdu ponude javite se osoblju lučice ili otvorite ponudu u aplikaciji.”** EN **“Contact the marina team or open the offer in the app to confirm.”** Samo uz stvarno postojeći put potvrde. |
| **J24 / P3 / obraćanje** | client/src/i18n/hr.ts:110–113: **„Registriraj se”**, zatim **„Prijavite se.”**; server/_core/email.ts:127 ima **„Molimo Vas”**, :338 **„Molimo vas”** | Predloženi kućni stil: gumbi kratko u jednini („Spremi”), upute uljudno u množini („Unesite”), **vaš/vas** malim slovom. Ta podjela je namjerna, ne zabrana drugog stila. |
| **J25 / P2 / množina** | server/_core/rateLimit.ts:81 uvijek dodaje **„sekundi”** | U konkretnom izrazu „za…”: **„1 sekundu”**, **„2 sekunde”**, **„5 sekundi”**, uz 11–14 i složene brojeve. Lokalni Intl.PluralRules za HR daje 1/21 → one, 2 → few, 5/11 → other. Kategorija sama ne određuje padež. |
| **J26 / P3 / velika slova** | client/src/i18n/hr.ts:190–191: **„Potvrdi Anonimizaciju”**, **„Potvrdi Brisanje”**; client/src/pages/PrivacyPolicy.tsx:12: **„Politika Privatnosti”**; client/src/pages/mobile/MobileOperatorApp.tsx:726: **„Operater Dizalica”** | **„Potvrdi anonimizaciju”**, **„Potvrdi brisanje”**, **„Politika privatnosti”**, **„Operater dizalice”** ili **„Rad operatera”**, prema svrsi ekrana. HR sentence case osim vlastitih imena i kratica. |
| **J27 / P3 / terminološki stil** | client/src/i18n/hr.ts:11,18,45,104,118: **„Admin panel”**, **„Nazad na web”**, **„Ispunite formu…”**, **„Email”**, **„Pošalji link”** | **„Administracija”**, **„Natrag na web-stranicu”**, **„Ispunite obrazac za rezervaciju dizalice.”**, **„Adresa e-pošte”**, **„Pošalji poveznicu”**. To je dosljedniji stil, ne tvrdnja da su sve postojeće varijante pravopisno nedopuštene. |
| **J28 / P3 / ponavljanje i uzvici** | client/src/i18n/hr.ts:80: **„Zahtjev je uspješno poslan! Administrator će pregledati vaš zahtjev.”**; client/src/pages/mobile/MobileOperatorApp.tsx:532,569 slični uspjesi | **„Zahtjev je poslan i čeka odobrenje.”**, **„Napomena je spremljena.”**, **„Operacija je završena.”** Rutinsko „uspješno” i uzvici nisu potrebni. Bolje navesti što slijedi. |
| **J29 / P2 / opis bojom** | client/src/pages/mobile/MobileOperatorApp.tsx:569: **„Operacija uspješno završena! Kalendar je ažuriran (plavo).”** | **„Operacija je završena. Status u kalendaru je ažuriran.”** Boja je dodatni signal, ne poslovni opis stanja. |
| **J30 / P3 / nejasna pogreška** | client/src/pages/mobile/MobileOperatorApp.tsx:392: **„Greška pri mreži.”**; :459: **„Greška pri mreži ili poslužitelju”**; :496: **„Mrežna greška”** | **„Nije moguće povezati se s uslugom. Provjerite vezu i pokušajte ponovno.”** Ako ishod upisa nije poznat: **„Spremanje nije potvrđeno. Osvježite prikaz prije ponovnog pokušaja.”** Ne tvrditi da promjena nije spremljena ako je samo odgovor izgubljen. |
| **J31 / P2 / identitet i broj dokumenta** | client/src/components/Footer.tsx:6: **„PŠD Špinut Crane Booking App”**; server/_core/email.ts:214,360: **„Marina Crane Booking”**; client/src/pages/PrivacyPolicy.tsx:23: **„Marina app”**; server/routes/mobileApi.ts:815: **„MARINA SPINUT (Nalog …)”** uz reservationNumber | Dogovoriti naziv proizvoda i instalacije. Primjer HR prikaza, uz odobrenje vlasnika: **„Rezervacije dizalica — PŠD Špinut”**. Ako SMS koristi broj rezervacije, nazvati ga **„Rezervacija {broj}”**, ne „Nalog”. Ne mijenjati službeni naziv proizvoljno. |
| **J32 / P2 / predug opis i žargon** | client/src/pages/admin/AdminLandHub.tsx:95: **„Središnji dnevni operativni centar dizalica, zone suhog veza (SZ, A1-A3, ZO, LB), operativni raspored i lista čekanja”**; client/src/pages/admin/reports/ReportHub.tsx:21 opis s kvotom, RN i ERP-om | Sažetak: **„Raspored dizalica, mjesta na kopnu i lista čekanja.”** Za izvještaj: **„Pregled radnih naloga i obračuna usluga.”** Šifre zona uz legendu, stručne pojedinosti u pomoćni tekst za odgovarajuću publiku. |
| **J33 / P2 / EN dosljednost** | client/src/i18n/en.ts:8,99,107,118,171 miješa **“Sign In”**, **“Login”**, **“Log In”**, **“Last Sign In”**; :225 ima **“My Card”** za „Moj karton” | Odabrati **“Sign in”**, **“Sign out”**, **“Last sign-in”**. Login kao imenica nije sam po sebi pogrešan. „Moj karton” prevesti prema sadržaju, npr. **“My service history”** ako prikazuje povijest usluga; za financijski karton potreban je drugi naziv. EN sentence case i en-GB su predloženi izbor, ne jedina ispravna varijanta. |
| **J34 / P3 / e-pošta i SMS** | server/_core/email.ts:224: **„Za postavljanje nove lozinke, kliknite…”**; :389: **„Slobodno mjesto … je sada dostupno”**; server/_core/sms.ts:84: **„Vase plovilo”** uz druge riječi poruke | **„Za postavljanje nove lozinke odaberite gumb u nastavku.”**, **„U zoni {zona} dostupno je mjesto za vaše plovilo.”** Za SMS definirati dosljedne dijakritike ili transliteraciju i provjeriti kodiranje/segmente/cijenu. EN server/_core/sms.ts:60: **“Your reservation for {crane} is confirmed. Please arrive at {location} at {time}.”** umjesto izravnog “Come…”. |
| **J35 / P3 / izvještaji i obračun** | client/src/lib/reports/pdfmake-schedule.ts:98–99: **„Održavanje / Blokade”**, **„Planirano sati”**; client/src/components/WorkOrderPdfTemplate.tsx:275,289: **„Stavke i statutarni/financijski status”**, **„0,00 € (Članarina)”** | **„Održavanje i blokirani termini”**, **„Planirano trajanje: {trajanje} h”**, **„Usluge i obračun”**. Za pokrivenu kvotu, ako poslovno točno: **„Bez dodatne naplate — pokriveno članskim pravom”**. Postojeće „0,00 € (Članarina)” može se shvatiti kao iznos članarine, umjesto cijene ove operacije. Potvrditi s osobom za naplatu. |

Putanje i brojevi redaka odnose se na navedeni commit i izvore tekstova.

## 6. Predloženi jedinstveni rječnik i urednički ugovor

### 6.1. Statusi

Neutralna oznaka odgovara bedžu; cijela rečenica slaže se s imenicom. Prijedlog ne mijenja backend enum vrijednosti.

| Stanje | Oznaka HR | Rečenica korisniku | Oznaka EN |
|---|---|---|---|
| pending | Čeka odobrenje | Zahtjev čeka odobrenje. | Pending approval |
| approved | Odobreno | Rezervacija je odobrena. Termin je potvrđen. | Approved |
| in_progress radnog naloga | U tijeku | Operacija je započela. | In progress |
| completed | Završeno | Operacija je završena. | Completed |
| rejected | Odbijeno | Zahtjev je odbijen. | Rejected |
| cancelled | Otkazano | Rezervacija je otkazana. | Cancelled |
| waitlisted | Na listi čekanja | Zahtjev je na listi čekanja. | Waitlisted |
| not_performed | Nije izvršeno | Operacija nije izvršena. Razlog: {razlog}. | Not performed |

in_progress nije zaseban reservation enum u pregledanoj shemi; prikaz ga može izvoditi iz radnog naloga. No-show ne postaje novi status samo prijevodom. „Na čekanju” treba razjasniti: čeka li se odobrenje, slobodan termin, mjesto na kopnu ili dostava poruke.

### 6.2. Terminologija

| Pojam | Predloženi HR | EN / ograda |
|---|---|---|
| Request prije potvrde | Zahtjev za rezervaciju | Booking request; odabrati booking/reservation kao obitelj naziva, bez proizvoljnog izmjenjivanja |
| Dodijeljeni interval | Termin | Time slot |
| Radni dokument | Radni nalog | Work order; nije isto što i rezervacija |
| Pomoćna informacija | Napomena + publika/svrha | Note, uz internal/customer/work-order prema vidljivosti |
| Razgovor s vlasnikom | Poruka vlasniku | Message to the owner |
| Skupine koje rade s dizalicama | Ekipe | Teams; posada plovila može biti druga skupina osoba |
| Kapacitet kopna | Mjesta na kopnu / kapacitet suhog veza | Dry berth spaces / capacity; zona nije isto što i jedno mjesto |
| Kategorija radnje | Vrsta operacije | Operation type; „tip” nije svugdje pogrešan, ali treba jedinstven izbor |
| Osoba | Korisnik / član / vlasnik / operater | Razlikovati uloge; korisnik računa nije nužno vlasnik plovila |
| E-mail unos | Adresa e-pošte | Email address |
| Izvještajno razdoblje | Razdoblje | Period; HR ne izmjenjivati bez razloga s „period” |

„Suhi vez”, „statutarno pravo”, „doplata članarine”, „bazen”, „nosivost” i nadležna služba stručni su pojmovi. Njihovo pojednostavljenje mora sačuvati poslovni smisao; potvrđuje ga vlasnik/operater. Naziv e-racuni.com tretirati kao vlastito ime, zasebno od općeg pojma „e-račun”.

### 6.3. Ton i mikrocopy

1. **Gumb je konkretna radnja:** „Spremi napomenu”, „Pošalji poruku”, „Otkaži rezervaciju”. „Odustani” napušta dijalog bez primjene. EN Cancel po potrebi razjasniti s Close ili Cancel reservation.
2. **Naslov određuje predmet/odluku:** „Nova rezervacija”, „Promjena termina”, „Otkazivanje rezervacije”. Jedna kratka rečenica ispod opisuje posljedicu.
3. **Pogreška objašnjava što se dogodilo i što dalje.** Bez stacka, JSON-a, tehničkih kodova i ponavljanja „Greška: Error: …”. Nepoznat ishod ne predstavljati kao siguran neuspjeh.
4. **Uspjeh znači ono što je potvrđeno.** „Zahtjev je spremljen” nije „Termin je potvrđen”; slanje nije isporuka.
5. **Miran ton i kratke rečenice:** izbaciti rutinske uzvike i „uspješno”; dodati sljedeći korak kad je koristan.
6. **Kućni izbor, bez lažne jezične strogoće:** predloženo „pogreška”, „ponovno”, „obvezno”. Varijante „greška”, „ponovo”, „obavezno” nisu ovdje sve proglašene nepravilnima.
7. **Placeholder nije jedina uputa:** naziv i ograničenje moraju ostati vidljivi nakon upisa. Jedinica jednom. Ako se koristi zvjezdica: „Polja označena zvjezdicom su obvezna.”
8. **Detalji/OK nisu dovoljni za osjetljivu radnju.** Brisanje, otkazivanje i slanje imaju konkretan naziv i opis posljedice.
9. **Terminologija prema publici:** ERP šifra može trebati naplati, ali ne svakom članu. Skraćenice i oznake zona objasniti pri prvom korištenju kada nisu očite ciljnoj publici.
10. **HR/EN imaju istu poslovnu poruku:** isto stanje, posljedicu i sljedeći korak. Ne samo sličan naslov.

### 6.4. Napomene i komentari — naziv mora pratiti stvarnu publiku

| Namjena | Naslov | Predložena uputa, tek nakon potvrde vidljivosti |
|---|---|---|
| Razgovor | Poruka vlasniku plovila | Vlasnik će poruku vidjeti u razgovoru uz rezervaciju. Status e-pošte/SMS-a prikazuje se zasebno. |
| Potvrda rezervacije | Napomena za korisnika | Ovaj tekst prikazuje se u potvrdi rezervacije. |
| Interna bilješka | Interna napomena osoblja | Ovaj tekst vide samo ovlašteni članovi osoblja. **Ne koristiti za sadašnji adminNote bez promjene/provjere puta.** |
| Nalog/PDF | Napomena na radnom nalogu | Ovaj tekst ispisuje se na radnom nalogu. |
| Stanje plovila | Zapažanja o stanju plovila | Zabilježite provjerljiva zapažanja, bez nepotrebnih osobnih podataka. |
| Iznimka | Razlog odobravanja iznimke | Navedite kako je osigurana dodatna ekipa i tko je odobrio iznimku, ako to traži stvarni postupak. |

Postojeće komentare osoblja ne mijenjati niti automatski prevoditi/slati bez odobrenog postupka. Copy ne smije obećati privatnost koju model podataka ne osigurava.

## 7. Prioriteti i provjera prihvaćanja

**Prvi paket — točnost značenja:** J01–J09 i J20. Za svaki tekst o ishodu potvrditi izvor statusa. Opise brisanja, financijskih kategorija i pravnih dokumenata potvrđuje odgovorni vlasnik, ne samo lektor.

**Drugi paket — cijeli jezik po toku:** J10–J19, J21 i J33. Lokalizirati auth/error/404, mobilni tok, dispečer, skrivena imena kontrola, ispis i obavijesti. Backend po mogućnosti vraća stabilne kodove i parametre. Promjena jezika ne mijenja poslovne šifre ni sadržaj unesene napomene.

**Treći paket — urednički katalog:** J22–J35. Za svaku poruku voditi ključ/ekran, HR, EN, kontekst, publiku, podatak iz kojega nastaje i vlasnika sadržaja. Uključiti subject e-pošte, kalendarski naslov i PDF, ne samo i18n rječnike.

### Scenariji završne provjere

- HR/EN: prijava, registracija, pogrešna lozinka, reset za postojeću i nepostojeću adresu, limit pokušaja, istek sesije, 404 i neočekivana pogreška.
- Obrasci: prazno/nevaljano polje, lozinka 6/7/8 znakova, jedna jedinica, masa/nosivost, 0/1/2/5/11/21 stavka ili sekunda, velika cijena i nedostajuća vrijednost.
- Rezervacija: zahtjev, odobrenje, odbijanje, otkazivanje, lista čekanja, neizvršena operacija i nalog u tijeku; isti smisao u listi, kalendaru, poruci i PDF-u.
- Mobilni operater: izostanak/odustajanje/kvar/vrijeme, različit broj ekipa, nepoznat mrežni ishod, spremljena poruka uz neuspjelu vanjsku obavijest.
- Napomene: zaseban sintetički tekst za internu bilješku, vlasnika, potvrdu i nalog; potvrditi sva mjesta na kojima se pojavljuje.
- Pristupačnost: razlikovati zatvaranje, odustajanje, otkazivanje i slanje; HR nazivi kontrola i odgovarajući html.lang.
- E-pošta/SMS/PDF: jezik, naslov događaja, vremenska zona i promjena sata, brojevi i valute, duži nazivi i stvarne poveznice. Provjeravati testnim kanalima, bez slanja stvarnim korisnicima.

**Granice zaključka:** ovo nije potvrda da je svaka moguća poruka u svakom deploymentu viđena. Dinamični nazivi iz baze, stvarne korisničke napomene, vizualno prelamanje i kompletan ispis ostaju za završni prolazak. Nisu izmišljeni kontakti, rokovi odgovora, pravila otkazivanja ili jamstva pravne sukladnosti. Gdje je potrebna poslovna odluka, navedena je umjesto proizvoljnog obećanja.

