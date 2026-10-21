# Dispečerski centar — Kopno i suhi vez

Specifikacija organizacije ekrana (UI) za dashboard dispečera dizalica.
Dokument opisuje **raspored, hijerarhiju i ponašanje** ekrana. Ne opisuje backend,
evidenciju ni proces rezervacije, nego samo kako ih dispečer vidi i s njima radi.

Ruta: `/admin/land-hub?tab=dispatch | zones | waiting | settings`

---

## 1. Načela organizacije

1. **Jedan radni ekran za jedan radni dan.** Dispečer sve odluke za dan donosi na kartici *Dispečer*, bez skakanja po ekranima.
2. **Tok s lijeva na desno = tok odluke.**
   *Što je stiglo* (zahtjevi) → *kada i kojom dizalicom* (raspored) → *ima li mjesta* (zone).
3. **Vrijeme je glavna os.** Središnji raspored dizalica zauzima najviše prostora; sve ostalo ga dopunjuje.
4. **Problem mora biti vidljiv bez klikanja.** Konflikti, deficit mjesta i preopterećenje timova prikazani su bojom i ikonom na mjestu gdje nastaju te zbrojeno u KPI traci.
5. **Rijetki zadaci idu u zasebne kartice.** Pregled zona, lista čekanja i postavke nisu dio dnevnog toka pa ne zauzimaju prostor glavnog ekrana.
6. **Fiksna visina na desktopu.** Ekran zauzima točno visinu prozora (`100dvh`). Stupci se skrolaju zasebno, a zaglavlje, alatna traka i traka za zaključenje uvijek su vidljivi.

---

## 2. Globalna struktura (shell)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [⚓] KOPNO I SUHI VEZ                                                        │  HEADER
│     Dispečerski centar                                                       │
│ ─────────────────────────────────────────────────────────────────────────── │
│  Dispečer │ Zone i zauzeće │ Lista čekanja (6) │                 ⚙ Postavke │  TABOVI
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       SADRŽAJ AKTIVNE KARTICE                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Sadržaj | Ponašanje |
|---|---|---|
| Header | Logo, naziv modula, naslov ekrana | Statičan |
| Tabovi | Dispečer · Zone i zauzeće · Lista čekanja (brojač) · Postavke (desno, ikona) | Aktivni tab se upisuje u URL `?tab=`, a osvježavanje stranice ga zadržava |

---

## 3. Kartica „Dispečer“ (glavni ekran)

### 3.1 Shema, desktop ≥ 1280 px (xl)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Sri, 10.10.2026 ›  07:00–15:00 │ Operacije 11 │ Timovi 2/2 │ Slobodno 21→20 │
│                                  │ Zahtjevi 4  │ Konflikti 2 │ [⚠ Obustava rada]│  ALATNA TRAKA + KPI
├──────────────────────────────────────────────────────────────────────────────┤
│ ⚠ OBUSTAVA od 12:00 · Bura · Sve dizalice · Pogođeno 4 operacije   [Ukloni ✕]│  BANNER (samo kad je aktivna)
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ ZAHTJEVI (4)  │ RASPORED DIZALICA            [Filter: A2 ✕]  │ ZONE          │
│               │       07  08  09  10  11  12  13  14  15     │               │
│ ┌───────────┐ │ Timovi ▮▮ ▮▮ ▮  ▮▮ ▮▮▮ ▮  ▮  ▮   (2 max)     │ ┌───────────┐ │
│ │↑ Vađenje  │ │ ─────────────────────────────────────────    │ │SZ Servisna│ │
│ │ Plovilo   │ │ Travelift  [Morska Vila][Adria🔗]  [Sirocco] │ │ 2/12  ▁▂▁ │ │
│ │ 12 m·8 t  │ │ 50 t       ───────────────────────────────   │ └───────────┘ │
│ │ ✓ ✓ ⚠     │ │ Stacion.        [Galeb][Neven][Luna][⛔Tram] │ ┌───────────┐ │
│ │ Preporuka │ │ 5 t        ───────────────────────────────   │ │A1 Arla 1  │ │
│ │ TL 09:00  │ │ Mala       [Brzi]   [M.Pero]      [▨Servis]  │ │ 0/20 PUNO │ │
│ │ [Potvrdi] │ │ 1,5 t                    │                   │ └───────────┘ │
│ └───────────┘ │                          ▲ linija „sada“      │  … A2 A3 ZO LB│
│   …           │                                              │               │
│  (skrol)      │                (horizontalni skrol)          │   (skrol)     │
├───────────────┴──────────────────────────────────────────────┴───────────────┤
│ ZAKLJUČIVANJE DANA  3/11 potvrđeno  [▸ Današnje operacije za zaključenje] [Zaključi]│  TRAKA (uvijek dolje)
└──────────────────────────────────────────────────────────────────────────────┘
      300 px                     fleksibilno (1fr)                   320 px
```

### 3.2 Responzivno ponašanje

```
Desktop xl (≥1280)          Laptop lg (1024–1279)        Tablet / mobitel (<1024)
┌────┬──────────┬────┐       ┌────┬───────────────┐       ┌──────────────────┐
│Zah.│ Raspored │Zone│       │Zah.│   Raspored    │       │ KPI (prelama se) │
│    │          │    │       │    │               │       ├──────────────────┤
│    │          │    │       ├────┴───────────────┤       │ Zahtjevi         │
│    │          │    │       │ Zone (vodoravno,   │       ├──────────────────┤
│    │          │    │       │ kartice u retku)   │       │ Raspored (h-skrol│
└────┴──────────┴────┘       └────────────────────┘       │ min. 32rem visine│
  3 stupca, fiksna visina      2 stupca + zone ispod      ├──────────────────┤
                                                          │ Zone             │
                                                          ├──────────────────┤
                                                          │ Zaključivanje    │
                                                          └──────────────────┘
                                                            stranica se skrola
```

Grid: `grid-cols-1` → `lg:grid-cols-[300px_1fr]` + `lg:grid-rows-[1fr_auto]` → `xl:grid-cols-[300px_1fr_320px]`.

### 3.3 Zone ekrana (detaljno)

#### A) Alatna traka + KPI
- **Navigacija datumom:** ‹ datum › i radno vrijeme (07:00–15:00).
- **KPI pločice** (svaka je broj i kratka oznaka):
  | KPI | Izračun | Upozorenje |
  |---|---|---|
  | Operacije | broj operacija bez servisa | — |
  | Timovi | najveće zauzeće timova / `MAX_TEAMS` | crveno ako je vrh veći od maksimuma |
  | Slobodno | slobodno na početku → na kraju dana (zbroj svih zona) | narančasto ako je pad |
  | Zahtjevi | zahtjevi koji čekaju odluku | — |
  | Konflikti | konflikti operacija + zone s deficitom | crveno ako je > 0 |
- **Gumb „Obustava rada“** (destruktivni stil) pali ili gasi obustavu.

#### B) Banner obustave (uvjetan)
- Prikazuje se samo dok je obustava aktivna, ispod alatne trake.
- Sadrži: od kojeg termina vrijedi, razlog, opseg (dizalice), **broj i popis pogođenih operacija** te akcije *Obavijesti vlasnike* i *Ukloni*.
- Na rasporedu se zahvaćeno vrijeme šrafira.

#### C) Lijevi stupac: Zahtjevi (300 px)
Kartica zahtjeva, odozgo prema dolje:
1. Tip (↑ Vađenje / ↓ Spuštanje, boja tipa) i vrijeme predaje
2. Plovilo, dimenzije i masa, vlasnik
3. Želja vlasnika (termin) i ciljna zona
4. **Provjere dizalica**: ikona statusa (✓ ok · ⚠ upozorenje · ✕ ne može) i kratko obrazloženje
5. **Preporuka sustava**: dizalica, termin, zona, ocjena i razlozi
6. ili **blokada**: crveni okvir s porukom (npr. „Nema mjesta u LB“)
7. Akcije: *Potvrdi termin* · *Drugi termin* · *Na listu čekanja*

#### D) Središte: Raspored dizalica (fleksibilno)
- **Vremenska os:** 16 slotova po 30 min (07:00–15:00) i oznake sati.
- **Red „Timovi“** na vrhu: stupić zauzeća po slotu. Ako zauzeće prijeđe `MAX_TEAMS`, stupić je crven.
- **Jedan red po dizalici** (naziv i nosivost lijevo, ljepljivo pri vodoravnom skrolu).
- **Blok operacije:** širina = trajanje. Prikazuje plovilo, zonu i smjer.
  | Stanje | Prikaz |
  |---|---|
  | Vađenje | plava ispuna, ikona ↑ |
  | Spuštanje | zelena ispuna, ikona ↓ |
  | Servis | šrafura, siva |
  | Konflikt | crveni rub i ikona ⛔, poruka u tooltipu |
  | Rotacijska ovisnost | ikona 🔗 (spuštanje oslobađa mjesto za vađenje) |
  | Zamjenski tim | oznaka tima |
  | Filtrirano po zoni | ostale operacije su prigušene |
- **Linija „sada“:** okomita linija preko svih redova.
- **Filter zone:** klik na zonu u desnom stupcu, uklanja se oznakom „✕“ u zaglavlju rasporeda.

#### E) Desni stupac: Zone (320 px)
Jedna kartica po zoni (SZ, A1, A2, A3, ZO, LB):
- Kod i naziv, **slobodno / ukupno** i traka popunjenosti
- **Mini-graf slobodnih mjesta kroz dan** (17 točaka, granice slotova)
- Promet: ↑ ulazi · ↓ izlazi, stanje na kraju dana, najniže stanje i u koliko sati
- Oznaka **PUNO** (0 slobodnih) ili **DEFICIT od HH:MM** (pada ispod 0)
- Klik na karticu filtrira raspored i označava je kao odabranu (`aria-pressed`)

Projekcija (ATP): *vađenje* zauzima mjesto **na početku** operacije, a *spuštanje* oslobađa mjesto **na kraju** operacije.

#### F) Donja traka: Zaključivanje dana
- Sklopljeno: napredak (npr. 3/11 potvrđeno) i gumb *Zaključi dan* (aktivan tek kad je sve potvrđeno).
- Rasklopljeno: popis današnjih operacija sa statusom *Izvršeno / Nije izvršeno*. Ako operacija nije izvršena, upisuje se razlog.

---

## 4. Kartica „Zone i zauzeće“

```
┌──────┬──────┬──────┬──────┬──────┬──────┐
│  SZ  │  A1  │  A2  │  A3  │  ZO  │  LB  │   6 kartica: slobodno/ukupno, traka, broj plovila
└──────┴──────┴──────┴──────┴──────┴──────┘   (2 → 3 → 6 stupaca)
┌──────────────────────────────────────────────────────────────┐
│ PLOVILA NA KOPNU (12)        [🔍 Pretraži]  [Sve│SZ│A1│…]     │
├──────────────────────────────────────────────────────────────┤
│ Plovilo │ Dimenzije │ Vlasnik │ Zona │ Na kopnu od │ Dana │ ⋯│
│ Bura    │ 10,2 · 5,6│ G. Ivić │ A1   │ 15.08.2026  │ 56   │ ⋯│  ⋯ = Premjesti u zonu…
│ (ručno) │ …         │ —       │ LB   │ —           │ —    │ ⋯│  oznaka „ručno uneseno“
└──────────────────────────────────────────────────────────────┘
```
- Klik na karticu zone postavlja filter tablice.
- Premještanje: izbornik zona. Pune zone su onemogućene i imaju tooltip „Zona je puna“.

## 5. Kartica „Lista čekanja“

```
┌────────── A1 · Arla 1 (2) ─────────┐ ┌────────── LB · Lukobran (2) ───────┐
│ ① Sv. Nikola  10,4 m · 5,9 t       │ │ ① Orca        ODBIJENO             │
│   J. Lončar · od 02.10.            │ │ ② Leut Mare   ISTEKLO              │
│   [PONUDA AKTIVNA · ističe za 18 h]│ │                                    │
│ ② Vjetar                [↕] [✕]    │ │                                    │
└────────────────────────────────────┘ └────────────────────────────────────┘
```
- Grupirano po zoni, unutar grupe poredano po prioritetu.
- Gore stoji obavijest „Oslobađa se mjesto…“ kada spuštanje u rasporedu oslobodi mjesto u zoni s čekanjem.
- Statusi ponude: *aktivna · prihvaćena · odbijena · istekla* (boja i tekst).

## 6. Kartica „Postavke“ (⚙)
- **Matrica afiniteta dizalica × zona:** dozvoljeno ili ne, ocjena (0–100) i penal premještanja.
- Radno vrijeme, trajanje slota, broj timova.

---

## 7. Vizualni jezik

| Token | Namjena |
|---|---|
| `primary` (tamnoplava, pomorska) | navigacija, primarne akcije |
| `lift` (plava) | vađenje iz mora |
| `lower` (zelena) | spuštanje u more |
| `warning` (jantar) | upozorenja, gotovo puno |
| `destructive` (crvena) | konflikt, deficit, obustava |
| `muted` | servis, neaktivno, pomoćni tekst |

- Font: jedan sans (Geist), brojke `tabular-nums`, oznake sitne i velikim slovima.
- Gustoća: kompaktna (dispečerski alat, ne marketing), tekst 11–14 px, razmaci 1–4 jedinice.
- Status se nikad ne prikazuje samo bojom: uvijek ima i ikonu ili tekst.
- Pristupačnost: semantički `header / nav / section / table`, `role="tablist"`, `aria-pressed` na filterima, `aria-label` na ikonama, `sr-only` oznake.

## 8. Model podataka koji UI očekuje

```ts
Crane         { id, name, capacity, note }
Zone          { code, name, total, occupiedAtStart }
Operation     { id, type: 'lift_from_sea'|'lower_to_sea'|'maintenance', craneId,
                startSlot, slots, vessel?, vesselMeta?, owner?, zone?,
                dependsOn?, teamOverride?, conflict?: { level, message }, note? }
PendingRequest{ id, type, vessel, vesselMeta, owner, wish, zone, submitted,
                checks: { label, status: 'ok'|'warn'|'fail', detail }[],
                suggestion?: { crane, time, zone, score, reasons[] }, blocker? }
WaitingEntry  { id, priority, vessel, vesselMeta, owner, zone, registered,
                offer?: { status: 'active'|'accepted'|'declined'|'expired', slot, expires? } }
LandVessel    { id, vessel, length, mass, owner, zone, since, days, manual? }
Affinity      Record<CraneId, Record<ZoneCode, { allowed, score, penalty }>>
```
Izvedene vrijednosti: `projectZone()` (slobodno po slotu, minimum, deficit) i `teamUsageBySlot()`.

---

## 9. Prompt za generiranje (copy/paste)

> Napravi u Next.js (App Router) + Tailwind + shadcn/ui **UI dispečerskog dashboarda** za marinu, modul „Kopno i suhi vez“, na hrvatskom jeziku. Bez backenda: koristi tipizirane mock podatke iz `lib/dispatch-data.ts`. Ruta je `/admin/land-hub`, a aktivni tab se čuva u `?tab=`.
>
> **Shell:** header s logom (sidro) i naslovom „Dispečerski centar“. Ispod su tabovi *Dispečer*, *Zone i zauzeće*, *Lista čekanja* (s brojačem) i desno ikona *Postavke*. Na desktopu ekran ima fiksnu visinu `100dvh`, a stupci se skrolaju zasebno.
>
> **Tab Dispečer**, odozgo prema dolje:
> 1. Alatna traka: navigacija datumom (‹ datum ›), radno vrijeme 07:00–15:00, KPI pločice (Operacije, Timovi vrh/max, Slobodno početak→kraj, Zahtjevi, Konflikti; crveno kad postoji problem) i destruktivni gumb „Obustava rada“.
> 2. Uvjetni banner obustave: od kada, razlog, opseg, broj pogođenih operacija, akcije „Obavijesti vlasnike“ i „Ukloni“. Zahvaćeno vrijeme na rasporedu se šrafira.
> 3. Grid s tri stupca `[300px | 1fr | 320px]` (lg: dva stupca, a zone idu u red ispod; mobitel: jedan stupac):
>    - **Zahtjevi:** kartice s tipom (↑ vađenje plavo / ↓ spuštanje zeleno), plovilom, dimenzijama, vlasnikom, željenim terminom i zonom, provjerama po dizalici (✓/⚠/✕ s obrazloženjem), preporukom sustava (dizalica, termin, zona, ocjena, razlozi) ili crvenom blokadom te akcijama Potvrdi / Drugi termin / Na listu čekanja.
>    - **Raspored dizalica:** vodoravni timeline sa 16 slotova po 30 min. Na vrhu je red „Timovi“ sa stupićima zauzeća (crveno iznad maksimuma 2), zatim po jedan red za Travelift 50T, Stacionarnu 5T i Malu dizalicu (ljepljiva lijeva oznaka). Blokovi operacija: vađenje plavo, spuštanje zeleno, servis šrafiran, konflikt s crvenim rubom i porukom, ikona 🔗 za rotacijsku ovisnost, oznaka zamjenskog tima. Linija „sada“. Filter po zoni prigušuje ostale operacije.
>    - **Zone:** kartica po zoni (SZ, A1, A2, A3, ZO, LB) sa slobodno/ukupno, trakom popunjenosti, mini-grafom slobodnih mjesta kroz dan, ulazima/izlazima, stanjem na kraju dana, najnižim stanjem i oznakama PUNO / DEFICIT od HH:MM. Klik filtrira raspored. Projekcija: vađenje zauzima mjesto na početku, a spuštanje ga oslobađa na kraju operacije.
> 4. Donja traka „Zaključivanje dana“: napredak potvrda. Rasklapa se u popis operacija s Izvršeno/Nije izvršeno i poljem za razlog. Gumb „Zaključi dan“ aktivan je tek kad je sve potvrđeno.
>
> **Tab Zone i zauzeće:** 6 kartica zona (filter) i tablica „Plovila na kopnu“ (pretraga, filter zone, stupci Plovilo, Dimenzije, Vlasnik, Zona, Na kopnu od, Dana) s akcijom „Premjesti u zonu“ (pune zone onemogućene) i oznakom ručno unesenih plovila.
>
> **Tab Lista čekanja:** grupirano po zoni, sortirano po prioritetu, statusi ponude (aktivna s rokom, prihvaćena, odbijena, istekla) i obavijest kada spuštanje oslobodi mjesto u zoni s čekanjem.
>
> **Tab Postavke:** matrica afiniteta dizalica × zona (dozvoljeno, ocjena 0–100, penal), radno vrijeme i broj timova.
>
> **Stil:** u skladu s ostatkom aplikacije kompaktan profesionalni operativni alat.
