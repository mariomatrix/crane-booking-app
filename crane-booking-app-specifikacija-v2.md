
⚓
MARINA CRANE
BOOKING APP
Napredna tehnička specifikacija
Verzija 2.0

Datum	Veljača 2026
Status	Radna verzija
Namijenjen	Jedna marina, jedna instanca
Naplata u aplikaciji	Ne
 
1. Pregled i svrha sustava

Marina Crane Booking App (v2.0) je centralizirano web-rješenje za upravljanje rezervacijama dizalica unutar jedne marine. Aplikacija korisnicima (vlasnicima plovila) omogućuje podnošenje zahtjeva za operaciju dizanja, dok administrator i operater upravljaju rasporedom, dodjeljuju dizalice i potvrđuju termine.

Ključna razlika napredne verzije u odnosu na v1.0: korisnik više ne bira dizalicu — korisnik podnosi zahtjev koji opisuje plovilo i vrstu zahvata, a stručni djelatnik marine dodjeljuje odgovarajuću dizalicu temeljem stvarnih tehničkih parametara.

Temeljna poslovna logika
Korisnik → podnosi zahtjev (plovilo + tip operacije + željeni termin) → Admin/Operater → dodjeljuje dizalicu + potvrđuje termin → Sustav → šalje obavijest korisniku

2. Tehnološki stog (Tech Stack)

2.1 Frontend

Tehnologija	Verzija	Uloga
React	19	Glavna UI biblioteka
Vite	Latest	Build tool i dev server
Tailwind CSS + Shadcn UI	Latest	Responzivan dizajn, dark mode, glass efekti
tRPC Client	v11	Type-safe API komunikacija s backendom
FullCalendar	v6	Interaktivni admin kalendar (drag-and-drop)
Recharts	v2	Vizualizacija analitičkih podataka
Wouter	v3	Lagano klijentsko rutiranje
React Query (TanStack)	v5	Server state management i polling

2.2 Backend

Tehnologija	Verzija	Uloga
Node.js + Express	22 LTS	Poslužiteljsko okruženje i web framework
tRPC Server	v11	Type-safe API s TypeScript podrškom
Drizzle ORM	Latest	Type-safe SQL builder i migracije
PostgreSQL	16	Primarna relacijska baza podataka
node-cron	Latest	Zakazivanje podsjetnika i cron zadataka
José	Latest	JWT sesije i token validacija
bcryptjs	Latest	Sigurno hashiranje lozinki
Zod	v3	Validacija svih API ulaznih podataka

2.3 Autentifikacija

Metoda	Opis
Email + lozinka	Klasična autentifikacija s bcrypt hashiranjem, JWT sesijama
Google OAuth 2.0	OpenID Connect integracija; korisnik se prijavljuje Google računom
JWT (José)	Kratkotrajna pristupna tokena + refresh token strategija
Admin registracija	Administrator može ručno kreirati korisnika ili operatera iz panela

2.4 Integracije i usluge

Usluga	Svrha
Infobip API	Slanje SMS obavijesti — potvrde, podsjetnici, hitne izmjene
Nodemailer (SMTP)	Slanje emailova — potvrde, podsjetnici, GDPR zahtjevi
REST API (izlazni)	Izlaganje podataka o rezervacijama sustavu za naplatu (SQLite)
Drizzle-kit	Automatizirane migracije baze podataka
Render.com	Cloud deployment platforma
 
3. Uloge korisnika i prava pristupa

Sustav definira tri uloge s hijerarhijskim pravima pristupa:

Uloga	Naziv	Opis
admin	Administrator	Puna kontrola: upravljanje korisnicima, operaterima, dizalicama, servisnim tipovima, globalnim postavkama, analitika, odobravanje i odbijanje svih zahtjeva
operator	Operater	Operativni pristup: pregled i upravljanje kalendarom, odobravanje zahtjeva, dodjela dizalice, izmjena trajanja operacije, slanje poruka korisnicima — bez upravljanja korisnicima i postavkama
user	Korisnik	Podnošenje zahtjeva za operaciju, upravljanje vlastitim plovilima, pregled vlastitih rezervacija, lista čekanja, razmjena poruka s osobljem marine

3.1 Matrica prava pristupa

Funkcionalnost	Admin	Operater	Korisnik
Podnošenje zahtjeva za operaciju	✓	✓	✓
Pregled vlastitih rezervacija	✓	✓	✓
Upravljanje profilima plovila	✓	✓	✓
Dvosmjerne poruke s osobljem	✓	✓	✓
Odobravanje / odbijanje zahtjeva	✓	✓	—
Dodjela dizalice zahtjevu	✓	✓	—
Izmjena trajanja operacije	✓	✓	—
Drag-and-drop premještanje termina	✓	✓	—
Upravljanje održavanjem (blokiranje)	✓	✓	—
Slanje poruka korisnicima	✓	✓	—
Upravljanje tipovima operacija	✓	—	—
Upravljanje dizalicama	✓	—	—
Upravljanje korisnicima i ulogama	✓	—	—
Globalne postavke sustava	✓	—	—
Analitika i izvještaji	✓	—	—
CSV izvoz podataka	✓	—	—
GDPR anonimizacija korisnika	✓	—	—
 
4. Korisnički dio (Client Portal)

4.1 Registracija i prijava

●	Korisnik se može registrirati putem obrasca (email + lozinka) ili Google OAuth 2.0 računom
●	Nakon registracije, korisnik prima email za potvrdu adrese
●	Korisnik može rezervirati tek nakon aktivacije računa (email verifikacija)
●	Self-service registracija i admin-kreirana registracija (iz panela) su ravnopravne metode

4.2 Podnošenje zahtjeva za operaciju

Ključna promjena vs. v1.0
Korisnik NE bira dizalicu. Korisnik opisuje zahvat i plovilo — djelatnici marine dodjeljuju odgovarajuću dizalicu temeljem tehničkih parametara.

Obrazac za podnošenje zahtjeva sadržava sljedeća polja:

Polje	Obavezno	Opis
Plovilo	Da	Odabir iz profila plovila korisnika
Tip operacije	Da	Odabir iz konfigurabilnog popisa (npr. spuštanje, vađenje)
Željeni datum	Da	Odabir iz dostupnih radnih dana (isključeni praznici, van radnog vremena)
Željeni termin (okvirni)	Da	Odabir okvirnog termina — finalni termin dodjeljuje operater
Napomena korisniku	Ne	Slobodni tekst za dodatne informacije (npr. hitnost, posebni uvjeti)

4.3 Tipovi operacija

Administrator može putem panela dodavati, uređivati i brisati tipove operacija. Inicijalni popis:

●	Spuštanje u more
●	Vađenje iz mora
●	Premještanje unutar marine
●	Zimovanje (dugotrajna pohrana)
●	Ostalo (korisnik opisuje u napomeni)

4.4 Upravljanje plovilima

●	Korisnik može pohraniti jedan ili više profila plovila
●	Polja profila: naziv plovila, tip (jedrilica, motorni, katamarana, itd.), dužina (m), širina (m), gaz (m), masa (kg), registracija
●	Plovilo se odabire pri svakom novom zahtjevu za brzu rezervaciju bez ponovnog unosa podataka
●	Promjene profila plovila ne retroaktivno mijenjaju prošle rezervacije

4.5 Pregled rezervacija i statusi

Svaki zahtjev prolazi kroz definirani status tijek:

Status	Opis
PENDING	Zahtjev podnesen, čeka pregled osoblja marine
APPROVED	Osoblje odobrilo zahtjev i dodijelilo dizalicu i finalni termin
REJECTED	Zahtjev odbijen (uz razlog koji korisnik vidi u aplikaciji)
CANCELLED	Korisnik otkazao zahtjev (moguće do 24h prije termina)
COMPLETED	Operacija uspješno izvedena (operater označava)
WAITLISTED	Termin nije dostupan — zahtjev na listi čekanja

4.6 Lista čekanja

●	Ako željeni termin nije dostupan, korisnik se automatski može prijaviti na listu čekanja
●	Lista čekanja je FIFO (redosljed prijave)
●	Kod oslobađanja termina, sustav automatski obavještava prvog korisnika s liste — SMS i email
●	Korisnik ima definirani rok (npr. 2 sata) da potvrdi prihvaćanje termina ili ga preskočiti

4.7 Otkazivanje rezervacije

●	Korisnik može otkazati odobrenu rezervaciju do 24 sata prije termina
●	Otkazivanje zahtjeva obavezan unos razloga (slobodni tekst)
●	Nakon otkazivanja, sustav provjerava listu čekanja i nudi termin sljedećem čekatelju
●	Nema automatske penalizacije za otkazivanje — evidencija se vodi u audit logu

4.8 Sustav poruka

●	Dvosmjerna komunikacija: korisnik i osoblje marine mogu razmjenjivati poruke unutar konteksta rezervacije
●	Svaka poruka vezana je za konkretnu rezervaciju (thread per rezervacija)
●	Korisnik prima email obavijest o novoj poruci osoblja
●	Osoblje (admin/operater) prima notifikaciju u panelu o odgovoru korisnika
 
5. Administratorski i Operaterski panel

5.1 Nadzorna ploča (Dashboard)

●	Prikaz ključnih statistika za tekući dan: ukupni zahtjevi, odobreni, na čekanju, otkazani
●	Prikaz nadolazećih operacija za sljedećih 7 dana s brzi uvid u dizalice
●	Upozorenja: zahtjevi koji dugo čekaju odobrenje (configurable threshold)
●	Prikaz neprocijenjenih poruka od korisnika

5.2 Master kalendar

●	Prikaz svih rezervacija za sve dizalice na jednom kalendaru (tjedni i dnevni view)
●	Filtriranje po dizalici, tipu operacije, statusu
●	Drag-and-drop premještanje odobrenih termina uz automatsku SMS/email notifikaciju korisniku
●	Klik na rezervaciju otvara detalje: plovilo, korisnik, tip operacije, dodijeljena dizalica, poruke
●	Polling svake 30 sekundi za ažuriranje kalendara bez potrebe za ručnim osvježavanjem

5.3 Upravljanje zahtjevima

●	Lista svih zahtjeva s filterima: status, datum, korisnik, tip operacije, dizalica
●	Detalji zahtjeva: sve informacije o plovilu, korisniku, željenom terminu
●	Akcije: Odobri (+ dodjeli dizalicu + potvrdi finalni termin), Odbij (+ razlog), Premjesti, Označi kao završeno
●	Dodjela dizalice: operater bira iz popisa aktivnih dizalica kompatibilnih s plovilom (preporuka na temelju nosivosti)
●	Mogućnost izmjene trajanja operacije (default 60 min, slobodni unos u minutama)

5.4 Upravljanje tipovima operacija

●	Puni CRUD: dodavanje, uređivanje, brisanje tipova operacija
●	Svaki tip ima: naziv, opis, default trajanje (može biti drugačije od globalnog defaulta)
●	Soft delete — tipovi korišteni u prošlim rezervacijama se arhiviraju, ne brišu

5.5 Upravljanje dizalicama

●	Puni CRUD: dodavanje, uređivanje, deaktiviranje dizalica
●	Parametri dizalice: naziv, tip (travelift, portalna, mobilna), maksimalna nosivost (kg), lokacija unutar marine, status (aktivna/neaktivna/servis)
●	Blokiranje termina za servis i održavanje s opisom razloga i vremenskim rasponom
●	Pregled kalendara zauzetosti po pojedinoj dizalici

5.6 Upravljanje korisnicima (Admin only)

●	Pregled svih korisnika s filterima: uloga, status, datum registracije
●	Ručno kreiranje korisnika (admin upisuje podatke i šalje pozivnicu emailom)
●	Promjena uloge: user ↔ operator
●	Deaktivacija korisnika (soft delete — korisnik ne može se prijaviti, podaci ostaju)
●	GDPR anonimizacija: brisanje osobnih podataka uz zadržavanje anonimnih statističkih zapisa
●	Pregled svih rezervacija pojedinog korisnika

5.7 Globalne postavke (Admin only)

Postavka	Opis
Radno vrijeme	Definirano po danima u tjednu; letnji/zimski raspored s datumima primjene
Državni praznici	HR kalendar praznika + ručno dodavanje izvanrednih neradnih dana
Default trajanje operacije	Globalni default (60 min); može biti overrideano po tipu operacije
Rok za otkazivanje	Minimalni broj sati prije termina za otkazivanje (default: 24h)
Rok odgovora s liste čekanja	Broj sati za prihvat ponuđenog termina (default: 2h)
Email / SMS predlošci	Uređivanje sadržaja svih automatskih obavijesti
SMTP postavke	Konfiguracija email servera
Infobip API ključ	SMS gateway konfiguracija
 
6. Sustav notifikacija

Sve notifikacije šalju se putem SMS (Infobip) i emaila (SMTP). Korisnik ne može isključiti notifikacije — sve su obavezne. Cron job (node-cron) pokreće se jednom dnevno za slanje podsjetnika.

Događaj	SMS	Email	Primatelj
Zahtjev uspješno podnesen	✓	✓	Korisnik
Novi zahtjev čeka odobrenje	—	✓	Admin + Operater
Zahtjev odobren (s terminom i dizalicom)	✓	✓	Korisnik
Zahtjev odbijen (s razlogom)	✓	✓	Korisnik
Termin premješten	✓	✓	Korisnik
Podsjetnik 24h prije termina	✓	✓	Korisnik
Korisnik otkazao rezervaciju	—	✓	Admin + Operater
Termin dostupan s liste čekanja	✓	✓	Korisnik (čekatelj)
Rok za odgovor s liste čekanja istekao	✓	✓	Korisnik (čekatelj)
Nova poruka od osoblja	—	✓	Korisnik
Nova poruka od korisnika	—	—	Notifikacija u panelu
GDPR zahtjev za brisanjem obrađen	—	✓	Korisnik
 
7. Arhitektura baze podataka

Baza podataka je PostgreSQL 16. Sve tablice koriste UUID kao primarni ključ. Drizzle ORM upravlja shemom i migracijama.

7.1 Popis tablica

users

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
email	TEXT UNIQUE	Email adresa (primarni login)
password_hash	TEXT NULL	bcrypt hash; NULL za OAuth korisnike
google_id	TEXT NULL	Google OAuth ID
full_name	TEXT	Puno ime i prezime
phone	TEXT NULL	Broj mobitela za SMS obavijesti
role	ENUM	admin | operator | user
status	ENUM	active | suspended | pending_verification
email_verified_at	TIMESTAMP NULL	Datum potvrde email adrese
created_at	TIMESTAMP	Datum kreiranja računa
anonymized_at	TIMESTAMP NULL	Datum GDPR anonimizacije

cranes

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
name	TEXT	Naziv dizalice (npr. Travelift 1)
type	TEXT	Tip: travelift | portalna | mobilna | ostalo
max_capacity_kg	INTEGER	Maksimalna nosivost u kilogramima
location	TEXT	Lokacija unutar marine (slobodni tekst)
status	ENUM	active | inactive | maintenance
notes	TEXT NULL	Interne napomene o dizalici
created_at	TIMESTAMP	Datum unosa

service_types

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
name	TEXT	Naziv operacije (npr. Spuštanje u more)
description	TEXT NULL	Opis za korisnike pri odabiru
default_duration_min	INTEGER	Podrazumijevano trajanje u minutama
is_active	BOOLEAN	false = arhivirano (soft delete)
sort_order	INTEGER	Redosljed prikaza u korisničkom sučelju
created_at	TIMESTAMP	Datum kreiranja

vessels

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
owner_id	UUID FK→users	Vlasnik plovila
name	TEXT	Naziv plovila
type	TEXT	Tip: jedrilica | motorni | katamaran | ostalo
length_m	DECIMAL	Dužina u metrima
beam_m	DECIMAL NULL	Širina u metrima
draft_m	DECIMAL NULL	Gaz u metrima
weight_kg	INTEGER NULL	Masa u kilogramima
registration	TEXT NULL	Registarska oznaka plovila
created_at	TIMESTAMP	Datum unosa

reservations (zahtjevi za operacije)

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
user_id	UUID FK→users	Korisnik koji je podnio zahtjev
vessel_id	UUID FK→vessels	Plovilo za koje se traži operacija
service_type_id	UUID FK→service_types	Tip tražene operacije
crane_id	UUID FK→cranes NULL	Dodijeljena dizalica (null do odobrenja)
requested_date	DATE	Željeni datum operacije
requested_time_slot	TEXT NULL	Okvirni željeni termin (npr. jutro/popodne)
scheduled_start	TIMESTAMP NULL	Potvrđeni početak (postavlja operater)
scheduled_end	TIMESTAMP NULL	Potvrđeni kraj (postavlja operater)
duration_min	INTEGER	Trajanje u minutama (može mijenjati operater)
status	ENUM	pending|approved|rejected|cancelled|completed|waitlisted
user_note	TEXT NULL	Napomena korisnika pri podnošenju
admin_note	TEXT NULL	Interna napomena osoblja (nevidljivo korisniku)
rejection_reason	TEXT NULL	Razlog odbijanja (vidljivo korisniku)
cancellation_reason	TEXT NULL	Razlog otkazivanja od strane korisnika
approved_by	UUID FK→users NULL	Tko je odobrio zahtjev
approved_at	TIMESTAMP NULL	Kada je odobren
completed_at	TIMESTAMP NULL	Kada je operater označio kao završeno
created_at	TIMESTAMP	Datum podnošenja zahtjeva
updated_at	TIMESTAMP	Zadnje ažuriranje zapisa

messages

Kolona	Tip	Opis
id	UUID PK	Jedinstveni identifikator
reservation_id	UUID FK→reservations	Rezervacija na koju se poruka odnosi
sender_id	UUID FK→users	Pošiljatelj poruke
body	TEXT	Sadržaj poruke
is_read	BOOLEAN	Je li primatelj pročitao poruku
created_at	TIMESTAMP	Datum slanja

Ostale tablice — sažetak

Tablica	Ključne kolone i svrha
waiting_list	reservation_id, user_id, vessel_id, service_type_id, requested_date, position (int), status, expires_at — FIFO lista čekanja
maintenance_blocks	crane_id, start_at, end_at, reason, created_by — blokiranje dizalice za servis
settings	key (UNIQUE TEXT), value (JSONB), updated_by, updated_at — globalne postavke sustava (radno vrijeme, praznici, predlošci)
audit_log	id, actor_id, action, entity_type, entity_id, payload (JSONB), ip_address, created_at — zapis svih važnih radnji
seasons	name, start_date, end_date, working_hours (JSONB po danima) — sezonski rasporedi radnog vremena
holidays	date, name, is_recurring — HR državni praznici i dodatni neradni dani
 
8. API Arhitektura

8.1 Interni API (tRPC)

Sva komunikacija između frontend i backend unutar aplikacije odvija se putem tRPC-a (type-safe RPC). Middleware sloj provjerava JWT token i ulogu korisnika za svaku proceduru.

Router / Procedura	Pristup	Opis
auth.register	public	Registracija korisnika (email+lozinka)
auth.login	public	Prijava, vraća JWT
auth.googleCallback	public	OAuth 2.0 callback
auth.refreshToken	user+	Obnova pristupnog tokena
reservations.create	user+	Podnošenje zahtjeva za operaciju
reservations.myList	user+	Vlastite rezervacije s paginacijom
reservations.cancel	user+	Otkazivanje vlastite rezervacije
reservations.list	operator+	Sve rezervacije s filterima
reservations.approve	operator+	Odobravanje + dodjela dizalice i termina
reservations.reject	operator+	Odbijanje s razlogom
reservations.reschedule	operator+	Drag-and-drop premještanje
reservations.complete	operator+	Označavanje kao završeno
vessels.create / update / delete	user+	CRUD profila plovila
serviceTypes.list / create / update / delete	admin (CRUD), user+ (list)	Upravljanje tipovima operacija
cranes.list / create / update / delete	admin (CRUD), operator+ (list)	Upravljanje dizalicama
messages.send / list	user+	Slanje i čitanje poruka na rezervaciji
users.list / updateRole / deactivate / anonymize	admin	Upravljanje korisnicima i GDPR
settings.get / update	admin	Čitanje i ažuriranje globalnih postavki
analytics.dashboard / utilization / cancellations	admin	Analitički upiti
waitingList.join / leave / list	user+ / admin	Lista čekanja operacije

8.2 Izlazni REST API (za billing sustav)

Integracija s membership/billing sustavom
Marina koristi vlastitu bazu (MS SQL Lite) za evidenciju članova i naplatu. Crane Booking App izlaže read-only REST API koji billing sustav može koristiti za čitanje podataka o rezervacijama i korisnicima.

Endpoint	Metoda	Opis
GET /api/v1/reservations	GET	Lista rezervacija s filterima: status, datum_od, datum_do, user_id, crane_id
GET /api/v1/reservations/:id	GET	Detalji pojedine rezervacije
GET /api/v1/users	GET	Lista aktivnih korisnika (anonimizirni isključeni)
GET /api/v1/users/:id	GET	Detalji pojedinog korisnika
GET /api/v1/service-types	GET	Lista svih tipova operacija
GET /api/v1/cranes	GET	Lista svih dizalica s kapacitetima

●	Autentifikacija: API key u zaglavlju Authorization: Bearer <API_KEY>
●	Format odgovora: JSON, UTF-8
●	Verzioniranje: /api/v1/ — buduće verzije ne kvare postojeće integracije
●	Rate limiting: 100 zahtjeva/minutu po API ključu
●	API ključevi se generiraju i upravljaju iz admin panela (Settings)
 
9. Analitika i izvještaji

Analitička ploča dostupna je isključivo administratorima. Vizualizacije su implementirane pomoću Recharts biblioteke.

Metrika / Graf	Tip vizualizacije	Opis
Iskorištenost dizalica	Bar chart	% iskorištenosti po dizalici u odabranom periodu
Zahtjevi po statusu	Pie chart	Distribucija: odobreno / odbijeno / otkazano / završeno
Razlozi otkazivanja	Bar chart	Najčešći razlozi otkazivanja rezervacija
Trendovi rezervacija	Line chart	Broj novih zahtjeva po tjednu/mjesecu
Peak sati i dani	Heatmap	Najprometnija vremenska razdoblja
Najaktivniji korisnici	Tablica	Top korisnici po broju rezervacija u periodu
Iskorištenost po tipu operacije	Bar chart	Distribucija po tipovima zahvata (spuštanje, vađenje...)
Sezonska usporedba	Line chart	Usporedba tekuće vs. prethodne sezone/godine
Prosječno čekanje na odobrenje	KPI kartica	Prosječno trajanje od podnošenja do odobrenja

●	Sve metrike filtrabilne su po vremenskom rasponu (dan, tjedan, mjesec, sezona, prilagođeni raspon)
●	CSV izvoz dostupan za sve tablične prikaze i sirove podatke o rezervacijama
 
10. Sigurnost i GDPR usklađenost

10.1 Sigurnosne mjere

●	Validacija svih ulaznih podataka putem Zod shema na API sloju
●	JWT pristupni tokeni s kratkim rokom (15 min) + refresh token (7 dana) u httpOnly kolačiću
●	bcryptjs hashiranje lozinki (cost factor 12)
●	tRPC middleware provjerava ulogu za svaku proceduru — admin i operator procedure nisu dostupne korisnicima
●	Rate limiting na login endpointu — zaštita od brute force napada
●	HTTPS obavezan na Render.com deploymentu
●	Parametrizirani SQL upiti (Drizzle ORM eliminira SQL injection)
●	Audit log bilježi sve kritične radnje: odobrenja, odbijanja, promjene uloga, brisanja

10.2 GDPR usklađenost

GDPR zahtjev	Implementacija
Pravo na zaborav	Admin može pokrenuti anonimizaciju korisnika: email, ime i telefon zamjenjuju se hash vrijednostima; rezervacije ostaju u bazi s anonimnim user_id za statistiku
Pravo na pristup podacima	Korisnik može preuzeti sve svoje podatke u JSON formatu putem korisničkog sučelja
Obavještavanje o obradi	Privacy Policy i uvjeti korištenja dostupni na stranici; prihvaćanje obavezno pri registraciji
Sigurnost pohrane	Lozinke hashirane; osobni podaci ne izlažu se u logovima; JWT ne sadrži osobne podatke
Audit trail	Sve radnje na osobnim podacima bilježe se u audit_log (tko, kada, što)
 
11. Deployment i infrastruktura

Komponenta	Konfiguracija
Platforma	Render.com (Web Service + PostgreSQL managed baza)
Frontend	Buildano Viteom, servira se kao statički assets s Express poslužitelja
Backend	Node.js Express server na Render Web Service
Baza podataka	Render PostgreSQL 16 (managed, automatski backupi)
Migracije	drizzle-kit migrate — automatski pri pokretanju servisa
Seed podaci	HR praznici, početni tipovi operacija, admin korisnik
Environment varijable	DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID/SECRET, INFOBIP_API_KEY, SMTP_*, API_KEY_BILLING
Cron poslovi	node-cron unutar iste Node.js instance: podsjetnici (svaki dan u 9:00), provjera liste čekanja (svakih 30 min)
Polling (klijent)	React Query refetchInterval: 30 sekundi za kalendar i listu zahtjeva

11.1 Environment varijable (.env)

Varijabla	Opis
DATABASE_URL	PostgreSQL connection string
JWT_SECRET	Tajni ključ za potpisivanje JWT tokena
JWT_REFRESH_SECRET	Tajni ključ za refresh tokene
GOOGLE_CLIENT_ID	Google OAuth 2.0 Client ID
GOOGLE_CLIENT_SECRET	Google OAuth 2.0 Client Secret
GOOGLE_CALLBACK_URL	OAuth redirect URL (npr. https://marina.app/auth/google/callback)
INFOBIP_API_KEY	Infobip API ključ za SMS
INFOBIP_BASE_URL	Infobip API base URL
SMTP_HOST / PORT / USER / PASS	SMTP konfiguracija za email
SMTP_FROM	Adresa pošiljatelja emailova
BILLING_API_KEY	API ključ za billing sustav (read-only izlazni API)
NODE_ENV	production | development
 
12. Pregled razlika: v1.0 → v2.0

Područje	v1.0 (postojeće)	v2.0 (napredna verzija)
Odabir dizalice	Korisnik sam bira dizalicu	Operater dodjeljuje dizalicu — korisnik ne vidi niti bira
Tipovi operacija	Nije implementirano	Konfigurabilni CRUD tipovi operacija s default trajanjem
Uloge	Admin + User	Admin + Operator + User
Autentifikacija	Email + lozinka	Email/lozinka + Google OAuth 2.0
Komunikacija	Nije implementirano	Dvosmjerni messaging po rezervaciji
Sezonalnost	Statičko radno vrijeme	Sezonski rasporedi + HR praznici
Izlazni API	Nije implementirano	REST API za billing sustav (read-only)
GDPR	Nije implementirano	Anonimizacija + export osobnih podataka
Analitika	Osnovna statistika	9 metrika s grafikama, CSV izvoz, sezonska usporedba
Notifikacije	Email	Email + SMS (obavezni, ne mogu se isključiti)
Trajanje operacije	Fiksno po slotu	Default 60 min, operater može slobodno mijenjati

Marina Crane Booking App v2.0
Specifikacija je temelj za razvoj napredne verzije aplikacije.
Verzija dokumenta: 2.0 | Veljača 2026

