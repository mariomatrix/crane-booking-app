# Ugovor o razvoju softvera (SW_Contract) - Marina Crane Booking

Ovaj dokument definira tehnički opseg (scope), značajke (features) i poslovna pravila za razvoj "Mobile-First" aplikacije za rezervaciju dizalice. Služi kao obvezujući plan za programere i specifikacija za naručitelja.

## 1. OPSEG PROJEKTA (Scope)
Aplikacija je isključivo namijenjena upravljanju operacijama **dizalica/travel lifta**. Aplikacija **neće** sadržavati financijske module (cjenike, ponude, generiranje računa) niti hardverske integracije sa senzorima (anemometar).

Cilj je optimizirati komunikaciju i raspoređivanje (scheduling) između vlasnika plovila i operatera u marini korištenjem mobilno-prilagođenog sučelja.

---

## 2. KORISNIČKE ULOGE I PRISTUP (RBAC)

Sustav podržava 4 razine pristupa:

1. **Gost (Neregistrirani):**
   - Vidi osnovne landing stranice i javni kalendar (read-only, anonimizirani prikaz zauzetosti).
2. **Korisnik (Vlasnik plovila):**
   - Može dodavati plovila u svoj profil.
   - Podnosi zahtjeve za termin dizanja/spuštanja.
   - Vidi status svojih zahtjeva.
   - Može slati i primati poruke (Asinkroni Chat) vezane uz svoje rezervacije.
3. **Operater (Dizaličar):**
   - Vidi kalendar svih operacija i listu zahtjeva na čekanju.
   - **Odobrava zahteve** dodjeljivanjem točnog datuma, vremena i dizalice.
   - Upravlja izvanrednim stanjima (npr. otkazivanje zbog vjetra, pomicanje termina zbog kašnjenja).
   - "Započinje" i "Završava" operacije na terenu (tablet/mobitel).
4. **Administrator:**
   - Sve ovlasti operatera plus upravljanje bazom korisnika (CRM).
   - Definiranje sistemskih parametara (radno vrijeme, vremenski intervali kalendara).

---

## 3. KLJUČNI KORISNIČKI TOKOVI (User Flows)

### A. Tok rezervacije (Standardni)
1. Klijent podnosi zahtjev (bira raspon/okvirni datum i tip operacije). Status: `pending`.
2. Operater pregledava zahtjev na mobitelu/PC-u i **određuje točan termin** (datum i vrijeme). Status postaje `approved`.
3. Sustav automatski šalje obavijest (Email/SMS) klijentu da je termin potvrđen.
4. *Ako operater zbog nekog razloga otkaže (ili klijent ne potvrdi dogovor ako postoji asinkrona komunikacija), rezervacija dobiva status `cancelled`. Klijent mora izraditi novi zahtjev.*

### B. Izvanredne situacije (Kašnjenje i Vjetar)
- **Kašnjenje operacije:** Sustav **ne pomiče** termine automatski. Operater ili administrator mora ručno ažurirati vremena za ostale klijente u tom danu. Prilikom izmjene vremena, sustav automatski obavještava pogođene klijente o novom terminu.
- **Vjetar (Vremenska blokada):** Operater u kalendaru ručno aktivira prekid rada ("Vjetar"). Pogođene operacije se otkazuju ili stavljaju na čekanje. Operater ručno dogovara ili unosi nove termine za te klijente, a sustav ih o tome obavještava.

### C. Komunikacija (Asinkroni Chat)
- Unutar svake rezervacije postoji modul za razmjenu poruka.
- Komunikacija je **asinkrona** (poput foruma ili e-mail ticketa unutar aplikacije).
- *Bilješka za programere: Koristiti obično osvježavanje (npr. React Query polling na 10-15 sekundi kada je ekran chata otvoren) umjesto kompleksnih WebSocketsa.*

---

## 4. SISTEMSKI PARAMETRI (Postavke)
Administratori će moći konfigurirati sljedeće parametre kroz UI:
- **Radno vrijeme:** Početak i kraj radnog dana.
- **Praznici:** Blokiranje kalendara za odabrane neradne dane.
- **Time-grid interval:** Prikaz kalendara (npr. koraci od 15 ili 30 min).

---

## 5. DVOJEZIČNOST I LOKALIZACIJA
Aplikacija je od prvog dana razvijana s podrškom za **HR** (Hrvatski) i **EN** (Engleski) jezik. 

---

## 7. INTEGRACIJA S MARINA APLIKACIJOM (API)

Crane Booking App izlaže REST API koji omogućuje postojećoj Marina ERP aplikaciji dohvaćanje podataka o operacijama dizalicom.

### Smjer komunikacije
- **Jednosmjerno (read-only):** Marina app → Crane API.
- Crane app **NE** poziva Marina API.

### Autentifikacija
- API Key sustav — administrator generira ključ u Postavkama, Marina app šalje ključ u `X-API-Key` headeru.
- Rate limiting: 100 zahtjeva/min po ključu.

### Zajednički identifikator
- **Registracija plovila** (`registration`) koristi se kao zajednički ključ za povezivanje podataka između dva sustava.

### Dostupni endpointi

| Endpoint | Opis |
|----------|------|
| `GET /api/v1/vessels/:registration/reservations` | Sve rezervacije za brod (po registraciji), s filterima po statusu i datumskom rasponu |
| `GET /api/v1/reservations/completed` | Lista svih završenih operacija s filterima |
| `GET /api/v1/service-types` | Lista tipova operacija (referentni podatak) |

### Podaci koji se vraćaju
Za svaku završenu operaciju:
- Datum i vrijeme operacije (`scheduledStart`, `completedAt`)
- Tip operacije (service type name)
- Registracija i naziv broda
- Naziv dizalice koja je korištena
- Status rezervacije

### Izvan opsega integracije (za buduće faze)
- Sinkronizacija članova Marine u Crane app (SSO / provisioning)
- Kreiranje rezervacija iz Marina app-a (write pristup)
- Real-time webhooks / push notifikacije

---

## 8. IZVAN OPSEGA (Out of Scope za ovu fazu)
Sljedeće stavke **nisu** dio ovog ugovora i ostavljaju se za buduće nadogradnje (V2/V3):
- Izračun cijena, cjenici i financijske ponude.
- Praćenje pranja broda na kopnu (aplikacija je samo za dizalice).
- Automatsko (lančano) pomicanje termina u kalendaru zbog kašnjenja.
- "Real-time" chat (tipkanje uživo putem WebSockets tehnologije).
- Integracija sa senzorima (anemometar, senzori težine s dizalice).
- Automatska sinkronizacija korisnika između Crane i Marina sustava (SSO).
- Write pristup za vanjsku Marina aplikaciju (kreiranje/ažuriranje rezervacija putem API-ja).
