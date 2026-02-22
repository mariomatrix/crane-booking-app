# Marina Crane Booking App — Plan razvoja v2.0

> **Polazna točka:** Ovo je plan nadogradnje, ne greenfield projekt. Postojeći kod (v1.0) služi kao temelj.  
> **Metodologija:** Svaka faza završava sa deployablom verzijom koja dodaje vrijednost bez rušenja postojeće funkcionalnosti.

---

## Pregled faza

| Faza | Naziv | Trajanje (est.) | Prioritet |
|------|-------|-----------------|-----------|
| **0** | Priprema i infrastruktura | 1–2 tjedna | Must |
| **1** | Temeljne promjene poslovne logike | 2–3 tjedna | Must |
| **2** | Uloga Operatera + Autentifikacija | 1–2 tjedna | Must |
| **3** | Sustav poruka (Messaging) | 1–2 tjedna | Must |
| **4** | Napredne postavke i sezonalnost | 1–2 tjedna | Should |
| **5** | Analitika v2 + Billing API | 1–2 tjedna | Should |
| **6** | GDPR i sigurnost | 1 tjedan | Must |
| **7** | Polish i testiranje | 1 tjedan | Must |

**Ukupna procjena: 9–15 tjedana**

---

## Faza 0 — Priprema i infrastruktura

**Cilj:** Postaviti stabilnu bazu za sve promjene. Ova faza ne mijenja korisničko sučelje, samo unutarnje mehanizme.

### 0.1 Migracija baze i sheme
- Prebaciti primarne ključeve s `serial (INT)` na `UUID`
- Dodati nove tablice: `service_types`, `messages`, `seasons`, `holidays`, `maintenance_blocks`
- Dodati nove kolone na `reservations`: `service_type_id`, `requested_time_slot`, `scheduled_start`, `scheduled_end`, `duration_min`, `completed_at`
- Dodati nove kolone na `users`: `google_id`, `status (enum)`, `email_verified_at`, `anonymized_at`
- Dodati `status` na `cranes`: `active | inactive | maintenance`
- Seeding: HR praznici, inicijalni tipovi operacija

### 0.2 Auth infrastruktura
- Implementirati **refresh token** strategiju (15 min pristupni + 7 dana refresh u httpOnly kolačiću)
- Dodati **email verifikacija** flow (token, expiry, callback endpoint)
- Pripremiti **Google OAuth 2.0** callback handler (bez UI za sada)

### 0.3 Konfiguracija okruženja
- Ažurirati `.env.example` s novim varijablama: `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BILLING_API_KEY`
- Rate limiting middleware na auth endpointima
- ✅ **Definirani kriteriji završetka:** Migracije prolaze, server se diže, nema regresija u testovima

---

## Faza 1 — Temeljne promjene poslovne logike

**Cilj:** Ključna promjena v2.0 — korisnik **ne bira dizalicu**. Korisnik opisuje zahvat, operater dodjeljuje dizalicu.

### 1.1 Tipovi operacija (service_types)
- **Backend:** tRPC procedura `serviceTypes.list (public)`, `serviceTypes.create/update/delete (admin)`
- **Admin UI:** Nova stranica `AdminServiceTypes.tsx` — CRUD tablice s drag-and-drop sortiranjem
- Seeding inicijalnih tipova: Spuštanje, Vađenje, Premještanje, Zimovanje, Ostalo

### 1.2 Nova forma za podnošenje zahtjeva
- **Ukloniti odabir dizalice iz forme!**
- Nova polja u `ReservationForm.tsx`: tip operacije (odabir iz `service_types`), okvirni termin (jutro/poslijepodne/po dogovoru), napomena korisniku
- Ažurirati tRPC `reservation.create` — prima `service_type_id`, `requested_date`, `requested_time_slot`, `user_note`; više ne prima `crane_id` (postaje nullable)

### 1.3 Odobravanje s dodjelom dizalice
- **Admin panel — odobravanje:** Dijalog prikazuje plovilo + tip operacije → operater bira dizalicu iz kompatibilnih (filtrirano po nosivosti) + unosi `scheduled_start` i `duration_min`
- **Backend:** `reservation.approve` prihvaća `crane_id`, `scheduled_start`, `duration_min`
- Ažurirati mail template — dodati info o dodijeljenoj dizalici, potvrđenom terminu

### 1.4 Status COMPLETED
- Dodati gumb "Označi kao završeno" u admin/operater prikazu
- Backend: `reservation.complete` procedure
- UI indikatator statusa u `MyReservations.tsx`

### 1.5 Lista čekanja s rokom prihvata
- Ažurirati `waiting_list` shemu — dodati `expires_at`
- Cron job (svakih 30 min): provjeriti istekle ponude, premjestiti na sljedećeg čekatelja
- Notifikacija o isteku roka (SMS + email)
- ✅ **Definirani kriteriji završetka:** Korisnik može podnijeti zahtjev bez biranja dizalice. Operater može odobriti i dodijeliti dizalicu + termin. Korisnik prima SMS i email s terminalom i dizalicom.

---

## Faza 2 — Uloga Operatera + Google OAuth

**Cilj:** Uvesti novu ulogu i autentifikacijski kanal.

### 2.1 Uloga Operatera
- Ažurirati `role` enum: `admin | operator | user`
- tRPC middleware: `operatorProcedure` — pristup za `admin` i `operator`
- Admin UI: Mogućnost dodjele role `operator` postojećim korisnicima
- Operater UI: Pristup kalendaru, listi zahtjeva, akcije (odobrenje, premještanje, završetak) — bez Postavki i Analitike

### 2.2 Google OAuth 2.0
- Implementirati Google OAuth flow: redirect → callback → upsert korisnika → JWT sesija
- Gumb "Prijavi se s Googleom" na `AuthPage.tsx`
- Backend: `auth.googleCallback` procedura
- Pohraniti `google_id` i `loginMethod: "google"` u bazu

### 2.3 Email verifikacija
- Aktivirati tok: registracija → email s linkom → klik → `email_verified_at = now()`
- Blokirati rezervacije dok email nije verificiran (error u `reservation.create`)
- ✅ **Definirani kriteriji završetka:** Operater se može prijaviti, ima djelomični pristup panelu. Korisnici se mogu prijaviti Googleom. Nova registracija zahtijeva verifikaciju emaila.

---

## Faza 3 — Dvosmjerni sustav poruka

**Cilj:** Korisnici i osoblje marine komuniciraju unutar konteksta rezervacije.

### 3.1 Backend
- Nova tablica `messages` (schema iz specifikacije)
- tRPC: `messages.send`, `messages.list`, `messages.markRead`
- Notifikacija emailom korisniku kada osoblje pošalje poruku

### 3.2 Frontend — Korisnik
- Na stranici `MyReservations.tsx`: gumb "Poruke" → otvara thread za tu rezervaciju
- Forma za slanje poruke + prikaz prijašnjih poruka (chat sučelje)
- Badge s brojem nepročitanih poruka

### 3.3 Frontend — Admin/Operater
- Na detalju zahtjeva/rezervacije: panel s porukama
- Notifikacija u admin navigaciji (badge) za nove poruke od korisnika
- Polling svakih 30 sekundi za nove poruke
- ✅ **Definirani kriteriji završetka:** Korisnik može napisati poruku na rezervaciji. Admin/Operater vidi poruku i može odgovoriti.

---

## Faza 4 — Napredne postavke i sezonalnost

**Cilj:** Sezonski rasporedi radnog vremena i upravljanje praznicima.

### 4.1 Sezonski rasporedi
- Nova tablica `seasons` (name, start_date, end_date, working_hours JSONB)
- Admin UI: Upravljanje sezonama — ljetni raspored (travanj–listopad), zimski raspored
- Logika dostupnosti termina u obrascu poštuje aktivnu sezonu

### 4.2 Praznici i neradni dani
- Nova tablica `holidays`
- Admin UI: Pregled HR praznika, dodavanje izvanrednih neradnih dana
- Seeding: HR državni praznici iz HR-spec kalendarom
- Forma rezervacije blokira nedostupne datume (praznici, van sezone)

### 4.3 Napredne globalne postavke
- UI za uređivanje: rok za otkazivanje, rok odgovora liste čekanja, email/SMS predlošci
- Backend: `settings.get/update` s JSONB formatom za složenije tipove (radno vrijeme, predlošci)
- ✅ **Definirani kriteriji završetka:** Admin može konfigurirati sezonske rasporede. Forma rezervacije ispravno blokira neradne datume.

---

## Faza 5 — Analitika v2 + Billing API

**Cilj:** Proširiti analitički modul i izložiti read-only REST API.

### 5.1 Analitika v2
- Novi grafovi: _trendovi rezervacija (line chart)_, _peak sati/dani (heatmap)_, _iskorištenost po tipu operacije_, _sezonska usporedba_, KPI kartica _prosječno čekanje na odobrenje_
- Vremenski filter: dan, tjedan, mjesec, sezona, prilagođeni raspon
- CSV izvoz za sve tablice i sirove podatke

### 5.2 Billing REST API
- Express router na `/api/v1/`
- API Key middleware (generiranje API ključeva iz Admin → Postavke)
- Rate limiting (100 req/min po API ključu)
- Endpointi: `GET reservations`, `GET reservations/:id`, `GET users`, `GET users/:id`, `GET service-types`, `GET cranes`
- Swagger/OpenAPI dokumentacija (auto-generirana)
- ✅ **Definirani kriteriji završetka:** Billing sustav može dohvatiti podatke. Admin može generirati i upravljati API ključevima.

---

## Faza 6 — GDPR i sigurnost

**Cilj:** Usklađenost s GDPR-om i pojačanje sigurnosti.

### 6.1 GDPR funkcionalnosti
- **Anonimizacija:** Admin gumb na korisničkom profilu — zamjena email/ime/tel hash vrijednostima, postavljanje `anonymized_at`
- **Izvoz podataka:** Korisnik može preuzeti sve svoje podatke u JSON formatu (`Moji podaci` gumb u profilu)
- Privacy Policy stranica + prihvaćanje uvjeta pri registraciji (checkbox)

### 6.2 Sigurnost
- Aktivirati rate limiting na login endpointu (npr. 10 pokušaja/min → 15 min blokada)
- Audit log: bilježiti anonimizaciju, promjenu uloga, brisanja, odobrenja/odbijanja s IP adresom
- HTTPS provjera na deploymentu
- ✅ **Definirani kriteriji završetka:** Admin može anonimizirati korisnika. Korisnik može skinuti svoje podatke. Audit log bilježi sve kritične radnje.

---

## Faza 7 — Polish, testiranje i dokumentacija

**Cilj:** Priprema za produkcijsko puštanje.

### 7.1 Testiranje
- Unit testovi za poslovnu logiku (rezervacije, dostupnost, lista čekanja)
- E2E testovi za ključne tokove: registracija, podnošenje zahtjeva, odobrenje, messaging
- Load testing za Render deployment

### 7.2 UI/UX završna obrada
- Responsive provjera na mobilnim uređajima
- Accessibility (a11y): labeli, ARIA atributi, keyboard navigation
- Loading stanja, error stanja, prazna stanja za sve ekrane

### 7.3 Dokumentacija
- Ažurirati `TEHNICKA_SPECIFIKACIJA.md` na v2.0
- `ADMIN_PRIRUCNIK.md` — upute za djelatnike marine
- `KORISNICKE_UPUTE.md` — kratki vodič za vlasnike plovila
- ✅ **Definirani kriteriji završetka:** Sve ključne funkcionalnosti testirane. Dokumentacija ažurirana.

---

## Prioritizacija u slučaju ograničenih resursa

Ako treba smanjiti opseg, preporučeni redosljed zadržavanja:

**Must-have (MVP v2.0):**
- Faze 0, 1, 2 (uloga operatera + Google auth + nova forma)
- Faza 6 (GDPR — zakonska obaveza)

**Should-have:**
- Faza 3 (messaging — ključan za operativnu komunikaciju)
- Faza 4 (sezonalnost — wichtig za marinu)

**Nice-to-have:**
- Faza 5 (billing API, napredna analitika)

---

*Plan izrađen na temelju dokumenta: `crane-booking-app-specifikacija-v2.md`*  
*Datum: Veljača 2026*
