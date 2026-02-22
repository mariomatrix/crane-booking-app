# Tehnička Specifikacija i Opis Sustava - Crane Booking App

Ovaj dokument pruža detaljan pregled arhitekture, tehnološkog stoga i funkcionalnosti aplikacije za upravljanje rezervacijama dizalica u marini.

## 1. Pregled sustava
Aplikacija je dizajnirana kao centralizirano rješenje za korisnike marine i administratore. Omogućuje vlasnicima plovila online rezervaciju termina za dizalicu, dok administratorima pruža napredne alate za planiranje, upravljanje resursima i analitiku.

## 2. Tehnološki stog (Tech Stack)

### Frontend
- **React 19**: Glavna biblioteka za razvoj sučelja.
- **Vite**: Alat za izgradnju (build tool) i razvojno okruženje.
- **Tailwind CSS & Shadcn UI**: Korišteni za moderan, responzivan dizajn i komponente (vibrantne boje, dark mode, stakleni efekti).
- **tRPC Client**: Osigurava type-safe komunikaciju s backendom.
- **FullCalendar**: Koristi se za administratorski interaktivni kalendar (drag-and-drop).
- **Recharts**: Biblioteka za vizualizaciju podataka i analitičke grafove.
- **Wouter**: Lagano rješenje za rutiranje (routing).

### Backend
- **Node.js & Express**: Poslužiteljsko okruženje i web framework.
- **tRPC Server**: Omogućuje definiciju API procedura s potpunom TypeScript podrškom.
- **Drizzle ORM**: Alat za rad s bazom podataka (type-safe SQL builder).
- **PostgreSQL**: Relacijska baza podataka za pohranu svih podataka.

### Integracije i usluge
- **Infobip API**: Slanje SMS obavijesti korisnicima.
- **Nodemailer (SMTP)**: Slanje e-mail potvrda i podsjetnika.
- **OAuth / OpenID Connect**: Opcija za vanjsku autentifikaciju (pripremljena arhitektura).
- **José**: Upravljanje JWT tokenima za sesije.

## 3. Ključne funkcionalnosti

### Korisnički dio (Client)
- **Rezervacija termina**: Intuitivno sučelje koje sprječava preklapanja i provjerava kapacitet dizalica prema težini plovila.
- **Upravljanje plovilima**: Korisnici mogu spremiti profile svojih plovila (dužina, težina, tip) za brzu rezervaciju.
- **Moje rezervacije**: Pregled povijesti i trenutnih zahtjeva s mogućnošću otkazivanja uz navođenje razloga.
- **Lista čekanja**: Automatska prijava na listu čekanja ako su željeni termini zauzeti.

### Administratorski dio (Admin Panel)
- **Nadzorna ploča (Dashboard)**: Brzi uvid u ključne statistike (broj aktivnih korisnika, danasnji termini).
- **Master Kalendar**: Napredni pregled svih dizalica na jednoj stranici. Administratori mogu pomicati termine povlačenjem (drag-and-drop).
- **Upravljanje održavanjem**: Blokiranje termina za servise i popravke dizalica.
- **Analitika i izvještaji**: Vizualni prikazi iskorištenosti dizalica, razloga otkazivanja i najaktivnijih korisnika. Mogućnost izvoza podataka u CSV format.
- **Upravljanje korisnicima**: Administracija uloga (korisnik/admin) i podataka o korisnicima.

## 4. Arhitektura baze podataka
Baza se sastoji od sljedećih ključnih entiteta:
- **Users**: Pohrana profila korisnika, uloga i podataka za kontakt.
- **Cranes**: Definicija kapaciteta, lokacija i statusa (aktivna/neaktivna).
- **Reservations**: Središnji entitet koji povezuje korisnika, plovilo i dizalicu s vremenskim slotom.
- **Vessels**: Profili brodova povezani s vlasnicima.
- **Waiting List**: Zahtjevi koji čekaju oslobađanje termina.
- **Settings**: Globalni parametri (radno vrijeme, trajanje slota, sigurnosni razmaci).
- **Audit Log**: Zapis svih važnih radnji u sustavu radi sigurnosti i revizije.

## 5. Sigurnost i validacija
- **Validacija (Zod)**: Svi ulazni podaci na API-ju su strogo validirani.
- **Autorizacija**: tRPC middleware provjerava uloge (admin procedure su dostupne isključivo administratorima).
- **Password Hashing**: Korištenje `bcryptjs` za sigurno pohranjivanje lozinki.

## 6. Deployment i održavanje
Sustav je optimiziran za deployment na platforme poput **Render.com**. Uključuje skripte za automatsku migraciju baze podataka (`drizzle-kit`) i seeding početnih podataka.

---
*Dokument izradio: Antigravity AI*
