# Crane Booking App — API Specifikacija za Marina ERP integraciju

> **Verzija:** 1.0 (draft)  
> **Datum:** Ožujak 2026  
> **Namjena:** Ovaj dokument služi kao referenca za programera Marina ERP aplikacije.

---

## 1. Pregled

Crane Booking App izlaže REST API na ruti `/api/v1/` koji omogućuje **read-only** pristup podacima o operacijama dizalicom. Marina ERP koristi ovaj API za provjeru obavljenih servisa (dizanje/spuštanje brodova) za svoje članove.

### Zajednički identifikator
**Registracija plovila** (`registration`) — jedinstven podatak u oba sustava. Svi upiti za specifični brod koriste registraciju kao ključ.

---

## 2. Autentifikacija

Svaki zahtjev mora sadržavati API ključ u HTTP headeru:

```
X-API-Key: <api-key>
```

API ključeve generira administrator Crane aplikacije u Admin panelu → Postavke → API ključevi.

**Rate limiting:** 100 zahtjeva/min po ključu. Pri prekoračenju vraća se `429 Too Many Requests`.

---

## 3. Endpointi

### 3.1 Rezervacije za brod (po registraciji)

```
GET /api/v1/vessels/{registration}/reservations
```

Vraća sve rezervacije za brod identificiran registracijom. **Ovo je primarni endpoint za Marina app.**

#### Parametri (query string)

| Parametar | Tip | Obavezno | Opis |
|-----------|-----|----------|------|
| `status` | string | Ne | Filter po statusu: `pending`, `approved`, `completed`, `cancelled`, `rejected` |
| `from` | string (ISO date) | Ne | Početni datum raspona (uključivo). Format: `YYYY-MM-DD` |
| `to` | string (ISO date) | Ne | Krajnji datum raspona (uključivo). Format: `YYYY-MM-DD` |

#### Primjer zahtjeva

```http
GET /api/v1/vessels/ST-1234/reservations?status=completed&from=2025-01-01&to=2025-12-31
X-API-Key: ck_live_abc123def456
```

#### Primjer odgovora (200 OK)

```json
{
  "vessel": {
    "registration": "ST-1234",
    "name": "Sea Breeze",
    "type": "jedrilica",
    "lengthM": 12.5,
    "weightKg": 8500
  },
  "reservations": [
    {
      "id": "a1b2c3d4-...",
      "reservationNumber": "R-2025-0042",
      "status": "completed",
      "serviceType": "Vađenje",
      "craneName": "Travel Lift 1",
      "scheduledStart": "2025-06-15T08:00:00Z",
      "scheduledEnd": "2025-06-15T10:00:00Z",
      "completedAt": "2025-06-15T09:45:00Z",
      "requestedDate": "2025-06-14",
      "userNote": "Godišnji servis - vađenje za pranje i antifouling"
    },
    {
      "id": "e5f6g7h8-...",
      "reservationNumber": "R-2025-0067",
      "status": "completed",
      "serviceType": "Spuštanje",
      "craneName": "Travel Lift 1",
      "scheduledStart": "2025-06-20T14:00:00Z",
      "scheduledEnd": "2025-06-20T16:00:00Z",
      "completedAt": "2025-06-20T15:30:00Z",
      "requestedDate": "2025-06-19",
      "userNote": "Povratak u more nakon servisa"
    }
  ],
  "total": 2
}
```

#### Odgovor kad brod nije pronađen (404)

```json
{
  "error": "VESSEL_NOT_FOUND",
  "message": "No vessel found with registration: ST-9999"
}
```

---

### 3.2 Završene operacije (bulk)

```
GET /api/v1/reservations/completed
```

Vraća listu svih završenih operacija. Podržava paginaciju i filtriranje.

#### Parametri

| Parametar | Tip | Obavezno | Opis |
|-----------|-----|----------|------|
| `registration` | string | Ne | Filter po registraciji broda |
| `from` | string (ISO date) | Ne | Početni datum |
| `to` | string (ISO date) | Ne | Krajnji datum |
| `limit` | integer | Ne | Broj rezultata po stranici (default: 50, max: 200) |
| `offset` | integer | Ne | Pomak za paginaciju (default: 0) |

#### Primjer zahtjeva

```http
GET /api/v1/reservations/completed?from=2025-01-01&to=2025-12-31&limit=10
X-API-Key: ck_live_abc123def456
```

#### Primjer odgovora (200 OK)

```json
{
  "reservations": [
    {
      "id": "a1b2c3d4-...",
      "reservationNumber": "R-2025-0042",
      "serviceType": "Vađenje",
      "craneName": "Travel Lift 1",
      "scheduledStart": "2025-06-15T08:00:00Z",
      "completedAt": "2025-06-15T09:45:00Z",
      "vessel": {
        "name": "Sea Breeze",
        "registration": "ST-1234",
        "type": "jedrilica"
      }
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

### 3.3 Tipovi operacija (referenca)

```
GET /api/v1/service-types
```

Vraća listu aktivnih tipova operacija. Korisno za mapiranje tipova između dva sustava.

#### Primjer odgovora (200 OK)

```json
{
  "serviceTypes": [
    { "id": "uuid-1", "name": "Vađenje", "description": "Vađenje broda iz mora", "defaultDurationMin": 60 },
    { "id": "uuid-2", "name": "Spuštanje", "description": "Porinuće broda u more", "defaultDurationMin": 60 },
    { "id": "uuid-3", "name": "Premještanje", "description": "Premještanje broda unutar marine", "defaultDurationMin": 120 },
    { "id": "uuid-4", "name": "Zimovanje", "description": "Vađenje za zimski period", "defaultDurationMin": 90 }
  ]
}
```

---

## 4. HTTP Status kodovi

| Kod | Značenje |
|-----|----------|
| `200` | Uspješan zahtjev |
| `401` | Nedostaje ili nevažeći API ključ |
| `404` | Resurs nije pronađen (npr. nepostojeća registracija) |
| `429` | Prekoračen rate limit |
| `500` | Interna greška servera |

---

## 5. Tipični use-case za Marina ERP

### Provjera godišnjeg servisa člana

Marina ERP želi provjeriti je li član marina (vlasnik broda "ST-1234") obavio godišnji servis dizalicom u tekućoj godini:

```http
GET /api/v1/vessels/ST-1234/reservations?status=completed&from=2026-01-01&to=2026-12-31
```

Ako odgovor sadrži barem jednu completed rezervaciju tipa "Vađenje" i jednu tipa "Spuštanje", godišnji servis je obavljen.

---

## 6. Buduće proširenje (izvan trenutnog scope-a)

Sljedeće mogućnosti **nisu** dio prve verzije API-ja, ali su planirane za buduće faze:
- **Write endpointi** — kreiranje rezervacija iz Marina app-a
- **Webhooks** — push notifikacije pri promjeni statusa rezervacije
- **SSO integracija** — zajedničko logiranje korisnika
- **Bulk upiti** — dohvat podataka za više brodova u jednom zahtjevu
