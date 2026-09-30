# Konačni prijedlog implementacije modula „Kopno i operacije”

**Predložena ruta:** `/admin/land-hub`  
**Radni naziv modula:** **Kopno i operacije**  
**Opseg stvarnog sustava:** **3 dizalice i 6 kopnenih zona**  
**Status dokumenta:** Konačni funkcionalni i tehnički prijedlog za implementaciju  

---

## 1. Sažetak odluke

Postojeće poglede **Lista čekanja za suhi vez** i **Mjesta na kopnu** treba objediniti u jedan operativni modul koji ne prikazuje samo trenutačno stanje, nego i promjenu stanja kroz vrijeme.

Središnji koncept novog modula nije klasična lista ni statična matrica, nego **dnevna operativna ploča protoka** koja istodobno povezuje:

1. zahtjeve i listu čekanja za dolazak na kopno;
2. planirana vađenja brodova iz mora;
3. planirana spuštanja brodova u more;
4. raspored rada triju dizalica;
5. trenutačnu i predviđenu zauzetost šest kopnenih zona;
6. pojedinačna mjesta na kopnu, ako su numerirana;
7. fizičku podobnost i udaljenost svake dizalice od svake zone.

Operater mora s jednog ekrana moći odgovoriti na četiri pitanja:

- Ima li dovoljno mjesta na kopnu u trenutku kada brod treba biti izvađen?
- Koje se mjesto prethodno mora osloboditi spuštanjem drugog broda?
- Koja je dizalica operativno najbolja za odabranu zonu?
- Kojim slijedom treba izvršiti operacije kako ne bi nastao privremeni deficit kapaciteta ili konflikt dizalice?

Temeljna poslovna formula ostaje jednostavna:

```text
predviđena slobodna mjesta
= početno slobodna mjesta
+ izvršena ili planirana spuštanja u more
- izvršena ili planirana vađenja iz mora
```

Međutim, formula se ne smije računati samo na razini cijelog dana. Mora se ponovno izračunati **nakon svake operacije kronološkim redom**, zasebno za svaku zonu i za kopno u cjelini.

---

## 2. Poslovni problem

### 2.1. Razlomljeno sučelje

Operater trenutačno koristi odvojene poglede:

- `/admin/land-zones`
- `/admin/land-waiting`
- povezane poglede rezervacija i dnevnih operacija dizalica

Zbog toga mora ručno povezivati zahtjev, termin dizalice, zonu, slobodno mjesto i buduće spuštanje u more.

### 2.2. Statični kapacitet daje pogrešan zaključak

Primjer za 5.10.:

- 4 slobodna mjesta na početku dana;
- 6 planiranih spuštanja u more;
- 8 planiranih vađenja iz mora;
- 2 slobodna mjesta na kraju dana.

Dnevni rezultat izgleda izvedivo, ali raspored može biti neizvediv ako se većina vađenja odvija prije spuštanja. Zato treba razlikovati:

- **završni dnevni saldo**;
- **najnižu točku kapaciteta tijekom dana**;
- **vrijeme nastanka deficita**;
- **zonu u kojoj deficit nastaje**.

### 2.3. Fizička geometrija nije dio raspoređivanja

Tri dizalice nisu jednako prikladne za svih šest zona. Dizalica može biti fizički blizu jednoj zoni, udaljena od druge ili potpuno neprikladna za određeni pristup.

Primjer:

- Travel lift primarno opslužuje zonu Lukobran;
- transport do zone Lukobran traje približno 2 minute;
- transport do udaljenije zone može trajati približno 15 minuta.

Sustav zato ne smije tretirati odabir zone samo kao pitanje slobodnog kapaciteta.

---

## 3. Konačni koncept: operativni Flow Board

Novi modul treba biti organiziran kao jedinstveni radni prostor sa šest logičkih područja.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ KOPNO I OPERACIJE    Datum: 05.10.2026.   Dan | 3 dana | Tjedan            │
│ Filtri: sve dizalice | sve zone | status | vrsta operacije   [Predloži plan]│
├──────────────────────────────────────────────────────────────────────────────┤
│ DNEVNA BILANCA                                                           │
│ Početno 4 | Spuštanja +6 | Vađenja -8 | Kraj dana 2 | Minimum 0 u 11:30 │
├──────────────────────────────────────────────────────────────────────────────┤
│ VREMENSKI PLAN PO DIZALICAMA                                               │
│ Travel lift  │ ↓ Brod A │ transport │ ↑ Brod B │ transport │ ...           │
│ Dizalica 2   │          │ ↑ Brod C   │           │ ↓ Brod D │ ...           │
│ Dizalica 3   │ ↓ Brod E │            │ ↑ Brod F  │          │ ...           │
├──────────────────────────────────────────────────────────────────────────────┤
│ PROJEKCIJA ŠEST ZONA KROZ DAN                                               │
│ Lukobran │ Zona 2 │ Zona 3 │ Zona 4 │ Zona 5 │ Zona 6                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ZAHTJEVI I ČEKANJE                  │ STANJE NA KOPNU                       │
│ neraspoređeno / ponuđeno / blokirano│ stvarno / rezervirano / odlazi danas │
├──────────────────────────────────────────────────────────────────────────────┤
│ UPOZORENJA I PREPORUKE                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Zašto ovo nije samo matrica

Matrica je korisna za prikaz odnosa dizalica i zona, ali nije dovoljna za operativno planiranje. Konačno rješenje zato kombinira:

- vremensku matricu dizalica;
- bilancu kapaciteta;
- projekciju zona;
- red zahtjeva;
- prikaz stvarnih zauzeća;
- preporuke i upozorenja.

---

## 4. Struktura korisničkog sučelja

## 4.1. Zaglavlje i kontrole

Zaglavlje sadrži:

- odabir datuma;
- prethodni i sljedeći dan;
- brzi povratak na današnji datum;
- prikaze **Dan**, **3 dana** i **Tjedan**;
- filtre po dizalici, zoni, statusu i vrsti operacije;
- prekidač `Prikaži samo probleme`;
- akciju `Predloži raspored`;
- akciju `Nova operacija`;
- indikator vremena posljednjeg osvježavanja.

### Preporuka za početnu verziju

Primarni prikaz treba biti **jedan dan**. Trodnevni i tjedni prikaz mogu u prvoj fazi biti sažetiji i služiti za pregled kapaciteta, a ne za detaljan drag-and-drop rad.

---

## 4.2. Dnevna bilanca

Na vrhu se prikazuju kartice:

1. **Slobodno na početku dana**
2. **Planirana spuštanja**
3. **Planirana vađenja**
4. **Predviđeno slobodno na kraju dana**
5. **Najniža točka dana**
6. **Broj konflikata**

Primjer:

```text
Početno slobodno: 4
Spuštanja: +6
Vađenja: -8
Kraj dana: 2
Minimum: 0 u 11:30
Konflikti: 1
```

Boje se ne smiju temeljiti samo na završnom stanju:

- zeleno: cijeli je plan izvediv;
- žuto: kapacitet pada na sigurnosni minimum;
- crveno: u nekom trenutku nastaje deficit;
- sivo: projekcija nije pouzdana zbog nepotpunih podataka.

Klik na karticu otvara objašnjenje izračuna i popis događaja koji utječu na rezultat.

---

## 4.3. Vremenski plan po trima dizalicama

Središnji dio ekrana koristi tri fiksna retka, po jedan za svaku dizalicu. Vodoravna os prikazuje radno vrijeme dana.

Svaka operacija prikazuje se kao kartica:

```text
09:30–10:05
↑ Vađenje
Brod ADRIA
Travel lift
→ Lukobran / L-12
```

Vrste kartica:

- `↓` spuštanje u more;
- `↑` vađenje iz mora;
- `↔` premještanje po kopnu;
- `M` održavanje ili nedostupnost dizalice;
- `?` nepotvrđena ili nepotpuna operacija.

Vizualne razlike:

- puna boja: potvrđena operacija;
- obrub ili šrafura: predložena operacija;
- crveni obrub: konflikt;
- isprekidana veza: operativna ovisnost;
- mala oznaka zone: odredišna ili polazna zona.

### Drag-and-drop

Operater može:

- povući zahtjev iz lijevog panela u slobodan termin dizalice;
- premjestiti operaciju na drugo vrijeme;
- premjestiti operaciju na drugu kompatibilnu dizalicu;
- promijeniti predloženu zonu;
- povezati spuštanje i vađenje s istim oslobođenim mjestom.

Prije spremanja sustav ponovno provjerava:

- preklapanje dizalice;
- kapacitet zone u točnom trenutku;
- redoslijed ovisnih operacija;
- nosivost i druga tvrda ograničenja;
- izračunano trajanje s transportom;
- dostupnost konkretnog mjesta, ako se mjesta numeriraju.

---

## 4.4. Projekcija šest zona

Svaka od šest zona ima sažetu karticu:

```text
LUKOBRAN
Kapacitet: 20
Trenutno zauzeto: 18
Rezervirano za dolazak: 3
Odlazi danas: 4
Kraj dana: 17 / 20
Minimum slobodno: 1 u 10:45
```

Kartica sadrži vremensku traku slobodnog kapaciteta:

```text
07:00    09:00    11:00    13:00    15:00
  2   →    3   →    1   →    0   →    3
```

Odabirom zone prikazuju se:

- sva aktivna zauzeća;
- planirana spuštanja;
- planirana vađenja;
- rezervirana mjesta;
- nenumerirana ručna zauzeća;
- brodovi bez planiranog povratka u more;
- upozorenja vezana uz zonu.

### Prikaz šest zona

Za šest zona preporučuju se dva reda po tri kartice na standardnom desktop ekranu. Na širokom operaterskom monitoru može se koristiti jedan red od šest sažetih kartica, uz detaljni prikaz odabrane zone ispod.

---

## 4.5. Zahtjevi i lista čekanja

Lista čekanja postaje **ulazni operativni red**, a ne zasebna stranica.

Statusi:

- `waiting_review` – čeka pregled;
- `waiting_capacity` – čeka kapacitet;
- `ready_to_schedule` – spremno za raspoređivanje;
- `proposed` – sustav je predložio termin, dizalicu i zonu;
- `offered` – termin je ponuđen korisniku;
- `scheduled` – potvrđeno i raspoređeno;
- `blocked` – nije moguće rasporediti;
- `declined` – ponuđeni termin odbijen;
- `cancelled` – zahtjev otkazan.

Kartica zahtjeva prikazuje:

- korisnika i brod;
- duljinu, širinu i masu broda;
- traženi datum ili razdoblje;
- preferiranu zonu;
- potrebnu vrstu operacije;
- postojeću rezervaciju, ako postoji;
- prioritet i vrijeme čekanja;
- razlog blokade;
- najbolji prijedlog sustava.

Primjer preporuke:

```text
Preporučeno:
Travel lift → Lukobran → mjesto L-12
Termin: 10:30
Procijenjeno trajanje: 34 min
Mjesto se oslobađa u 09:50
Ocjena prijedloga: 92/100
```

Lista se može filtrirati i sortirati prema:

- starosti zahtjeva;
- prioritetu;
- traženom datumu;
- preferiranoj zoni;
- kompatibilnoj dizalici;
- razlogu blokade.

Pozicija na listi čekanja ne smije biti jedini kriterij raspoređivanja. Starost zahtjeva treba ostati važna, ali sustav mora jasno prikazati kada stariji zahtjev nije moguće rasporediti zbog fizičkih ili vremenskih ograničenja.

---

## 4.6. Stanje na kopnu

Desni panel prikazuje stvarna aktivna zauzeća iz `land_occupancies`.

Za svaki brod prikazuju se:

- zona i broj mjesta;
- datum i vrijeme dolaska na kopno;
- planirano spuštanje u more;
- dizalica za povratak;
- broj dana na kopnu;
- status naplate ili drugi poslovni indikator, ako postoji;
- upozorenje ako nema planiranog spuštanja.

Prikaz mora jasno razlikovati:

- stvarno zauzeto;
- planirano za dolazak;
- planirano za odlazak;
- ručno evidentirano zauzeće;
- blokirano mjesto.

---

## 5. Izmjena mjesta kao poslovna veza

Najvažnija operativna funkcija jest povezivanje spuštanja jednog broda s vađenjem drugog broda koje koristi oslobođeni kapacitet.

Primjer:

```text
IZMJENA #14

09:00–09:30  Brod A: Lukobran L-12 → more
09:30–09:40  priprema i sigurnosni razmak
09:40–10:15  Brod B: more → Lukobran L-12
```

Sustav mora moći evidentirati da je vađenje broda B ovisno o prethodnom spuštanju broda A.

Ako se Brod A pomakne na kasnije vrijeme, sustav automatski označava Brod B kao konfliktan i nudi:

- pomicanje vađenja;
- drugo mjesto u istoj zoni;
- drugu kompatibilnu zonu;
- drugu dizalicu, ako time nastaje bolji plan.

Za MVP ova veza može biti izvedena računski i prikazana vizualno, bez zasebnog trajnog entiteta. Za naprednu verziju preporučuje se trajno spremanje ovisnosti zbog auditiranja i stabilnosti plana.

---

## 6. Model dizalica i zona

## 6.1. Ne koristiti samo jedan težinski faktor

Jedinstveni postotak 0–100 nije dovoljan jer miješa različite pojmove. Potrebno je odvojiti:

1. **tvrdu dopuštenost** kombinacije;
2. **stvarno vrijeme transporta**;
3. **vrijeme rukovanja**;
4. **poslovni afinitet**;
5. **prioritet primarne zone**.

### Predloženi entitet

```text
crane_zone_profiles
- id
- crane_id
- zone_id
- is_allowed
- is_preferred
- affinity_score
- transport_minutes
- additional_handling_minutes
- minimum_buffer_minutes
- note
- valid_from
- valid_to
- created_at
- updated_at
```

Za tri dizalice i šest zona postoji najviše 18 aktivnih kombinacija. To je dovoljno malo da ih administrator može pregledno uređivati u matrici 3 × 6.

### Administrativna matrica

```text
                 Zona 1   Zona 2   Zona 3   Zona 4   Zona 5   Zona 6
Travel lift       100       70       40        0        0       20
Dizalica 2         60       95       85       50       20       40
Dizalica 3         20       40       70       95       90       80
```

Vrijednost `0` ne treba automatski značiti zabranu. Zabrana se vodi zasebnim poljem `is_allowed`, kako se ne bi miješala neprikladnost s nedopuštenošću.

---

## 6.2. Tvrda ograničenja

Prije rangiranja sustav eliminira sve kombinacije koje nisu dopuštene zbog:

- nedovoljne nosivosti dizalice;
- nedovoljne širine ili neprikladne konstrukcije;
- nedopuštenog pristupa zoni;
- zone koja ne može primiti dimenzije broda;
- neaktivne dizalice ili zone;
- nedostupnog konkretnog mjesta;
- radova, blokiranog prolaza ili drugog privremenog ograničenja;
- preklapanja termina dizalice;
- kapaciteta zone u trenutku planiranog dolaska.

Tvrda ograničenja uvijek imaju prednost pred ocjenom afiniteta.

---

## 6.3. Izračun trajanja

Predloženo trajanje operacije:

```text
ukupno trajanje
= osnovno trajanje usluge
+ transport_minutes
+ additional_handling_minutes
+ minimum_buffer_minutes
```

Trajanje se može dodatno korigirati prema:

- duljini i masi broda;
- vrsti broda;
- potrebnoj dodatnoj opremi;
- iskustvenim podacima iz `crane_operation_log`;
- posebnim napomenama operatera.

U prvoj fazi preporučuje se deterministički izračun iz konfiguracijskih vrijednosti. Automatsko učenje iz povijesnih podataka treba odgoditi dok se ne prikupi dovoljno kvalitetnih zapisa.

---

## 7. Rangiranje preporuka

Nakon eliminacije nedopuštenih opcija, sustav rangira preostale kombinacije.

Predložena početna formula:

```text
ukupna_ocjena =
    0.35 × afinitet_dizalice_i_zone
  + 0.25 × ocjena_kapaciteta_zone
  + 0.20 × ocjena_ukupnog_trajanja
  + 0.10 × podudaranje_preferirane_zone
  + 0.10 × smanjenje_praznog_hoda_dizalice
```

Sve komponente normaliziraju se na raspon 0–100.

### Pravila

- algoritam daje najviše tri prijedloga;
- sustav ne smije automatski potvrditi plan bez odluke operatera;
- svaki prijedlog mora imati objašnjenje;
- ručni odabir slabije rangirane opcije je dopušten;
- za override tvrdog upozorenja potreban je razlog i odgovarajuća ovlast;
- zabranjena kombinacija ne smije se omogućiti običnim overrideom.

### Primjer rezultata

```text
1. Travel lift → Lukobran L-12
   Ocjena: 92/100
   Trajanje: 34 min
   Dostupno od: 09:50
   Razlog: primarna zona, najkraći transport, siguran kapacitet

2. Dizalica 2 → Zona 2 / mjesto Z2-04
   Ocjena: 76/100
   Trajanje: 43 min
   Dostupno odmah
   Razlog: veća udaljenost, ali bez vremenske ovisnosti

3. Travel lift → Zona 3 / mjesto Z3-07
   Ocjena: 58/100
   Trajanje: 49 min
   Razlog: dug transport i nizak afinitet
```

---

## 8. Projekcija kapaciteta

## 8.1. Početno stanje

Za svaku zonu početno zauzeće čine:

- aktivni zapisi u `land_occupancies` za koje `returned_at` nije postavljen;
- `manual_occupied_spots`;
- eventualno trajno blokirana mjesta.

Početno slobodno:

```text
početno_slobodno =
ukupni_kapacitet
- aktivna_stvarna_zauzeća
- ručna_zauzeća
- blokirana_mjesta
```

## 8.2. Događaji tijekom dana

Kronološki se primjenjuju:

- završeno spuštanje u more: `+1` slobodno mjesto u izvornoj zoni;
- završeno vađenje iz mora: `-1` slobodno mjesto u odredišnoj zoni;
- planirano spuštanje: budući `+1`;
- planirano vađenje: budući `-1`;
- premještanje između zona: `+1` u izvornoj i `-1` u odredišnoj zoni;
- blokiranje mjesta: `-1`;
- uklanjanje blokade: `+1`.

## 8.3. Redoslijed događaja

Ako dvije operacije imaju isto vrijeme, prednost ne smije implicitno dobiti spuštanje samo zato što povećava kapacitet. Koristi se stvarni kraj jedne i početak druge operacije, uz sigurnosni razmak.

Mjesto je na raspolaganju tek kada je prethodna operacija završena i protekao konfigurirani buffer.

## 8.4. Globalni i zonski kapacitet

Treba računati oba pokazatelja:

- ukupni kapacitet svih šest zona;
- kapacitet svake pojedine zone.

Ukupno kopno može imati slobodna mjesta, ali plan može biti neizvediv jer kompatibilna ili fizički dostupna zona nema mjesta.

## 8.5. Numerirana i nenumerirana mjesta

Ako zone imaju numerirana mjesta, provjera se provodi na dvije razine:

1. postoji li dovoljan kapacitet zone;
2. postoji li konkretno kompatibilno mjesto.

Ako mjesto još nije dodijeljeno, rezervacija može privremeno teretiti kapacitet zone bez broja mjesta, ali prije završetka vađenja mora biti dodijeljeno konkretno mjesto ili evidentiran dopušteni izuzetak.

---

## 9. Razdvajanje planiranog i stvarnog stanja

Ovo je obvezna modelna korekcija.

### Planirano stanje

Planirano vađenje ili spuštanje vodi se kroz rezervaciju i njezin status.

### Stvarno stanje

`land_occupancies` predstavlja stvarni boravak broda na kopnu i treba nastati tek kada je vađenje stvarno izvršeno.

### Poslovno pravilo

```text
Rezervacija budućeg vađenja ne smije odmah kreirati stvarno land_occupancy zauzeće.
```

Preporučeni tijek:

```text
rezervacija odobrena
→ operacija planirana
→ operacija započeta
→ operacija završena
→ kreira se land_occupancy
```

Za spuštanje:

```text
rezervacija odobrena
→ operacija planirana
→ operacija završena
→ postojeći land_occupancy dobiva returned_at
```

Tako sustav razlikuje:

- fizičku stvarnost;
- operativni plan;
- projekciju budućeg kapaciteta.

---

## 10. Predložene promjene modela podataka

## 10.1. Nova tablica `crane_zone_profiles`

Svrha je spremanje odnosa triju dizalica i šest zona.

```sql
CREATE TABLE crane_zone_profiles (
    id uuid PRIMARY KEY,
    crane_id uuid NOT NULL REFERENCES cranes(id),
    zone_id uuid NOT NULL REFERENCES land_zones(id),
    is_allowed boolean NOT NULL DEFAULT true,
    is_preferred boolean NOT NULL DEFAULT false,
    affinity_score integer NOT NULL DEFAULT 50,
    transport_minutes integer NOT NULL DEFAULT 0,
    additional_handling_minutes integer NOT NULL DEFAULT 0,
    minimum_buffer_minutes integer NOT NULL DEFAULT 0,
    note text,
    valid_from timestamptz,
    valid_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT crane_zone_profiles_affinity_chk
        CHECK (affinity_score BETWEEN 0 AND 100),
    CONSTRAINT crane_zone_profiles_time_chk
        CHECK (
            transport_minutes >= 0
            AND additional_handling_minutes >= 0
            AND minimum_buffer_minutes >= 0
        ),
    CONSTRAINT crane_zone_profiles_unique
        UNIQUE (crane_id, zone_id)
);
```

Nazive stupaca treba prilagoditi postojećoj konvenciji projekta ako koristi camelCase u Drizzle shemi.

## 10.2. Preporučena tablica `land_spots`

Ako se mjesta u svih šest zona vode pojedinačno:

```text
land_spots
- id
- zone_id
- code
- sort_order
- max_length_m
- max_beam_m
- max_weight_tons
- is_active
- is_blocked
- blocked_reason
- note
```

Ako mjesta nisu stvarno numerirana ili se fizički raspored često mijenja, ovu tablicu ne treba uvoditi samo radi formalne preciznosti. U tom slučaju zona ostaje kapacitetni spremnik, a `spot_number` je opcionalna operativna oznaka.

## 10.3. Ovisnosti operacija

Za naprednu fazu:

```text
operation_dependencies
- id
- predecessor_reservation_id
- successor_reservation_id
- dependency_type
- minimum_gap_minutes
- land_zone_id
- land_spot_id
- created_by
- created_at
```

`dependency_type` može imati vrijednosti:

- `frees_capacity_for`;
- `same_spot_turnover`;
- `same_crane_sequence`;
- `manual_dependency`.

## 10.4. Privremena ograničenja

Preporučeno za kasniju fazu:

```text
operational_blocks
- id
- resource_type
- resource_id
- starts_at
- ends_at
- capacity_reduction
- reason
- note
```

Time se mogu evidentirati kvar dizalice, blokirana zona, radovi ili privremeno smanjen kapacitet.

---

## 11. API i servisni sloj

Preporučuje se novi `landHub` router ili servisni modul koji orkestrira postojeće domene bez dupliciranja poslovne logike.

## 11.1. Upiti

```text
landHub.getDayOverview(date)
landHub.getFlowTimeline(date, craneIds?, zoneIds?)
landHub.getZoneProjection(date, zoneIds?)
landHub.getUnscheduledRequests(dateRange?, filters?)
landHub.getSchedulingOptions(waitingEntryId | reservationId)
landHub.validatePlan(draftOperations)
landHub.getConflicts(date)
```

### `getDayOverview`

Vraća:

- početno stanje;
- broj spuštanja;
- broj vađenja;
- završno stanje;
- najnižu točku;
- broj konflikata;
- sažetak za svih šest zona;
- sažetak iskorištenosti triju dizalica.

### `getFlowTimeline`

Vraća kronološke operacije grupirane po dizalicama, uključujući izračunato trajanje, transport, zonu, mjesto i konflikte.

### `getZoneProjection`

Vraća niz vremenskih točaka:

```text
- occurredAt
- eventType
- reservationId
- zoneId
- delta
- occupiedAfter
- availableAfter
- isProjected
- conflictCode
```

### `getSchedulingOptions`

Vraća najviše tri rangirana prijedloga, plus razloge zbog kojih su druge kombinacije eliminirane.

## 11.2. Mutacije

```text
landHub.createDraftAssignment(...)
landHub.confirmAssignment(...)
landHub.moveOperation(...)
landHub.changeCrane(...)
landHub.changeZone(...)
landHub.linkTurnover(...)
landHub.overrideWarning(...)
landHub.completeOperation(...)
```

Sve mutacije trebaju provesti validaciju neposredno prije transakcijskog spremanja.

---

## 12. Konflikti i upozorenja

Sustav mora razlikovati blokirajuće pogreške i upozorenja.

### 12.1. Blokirajući konflikti

- dizalica ima preklapajuće operacije;
- nedovoljna nosivost;
- kombinacija dizalice i zone nije dopuštena;
- nema kapaciteta zone u trenutku dolaska;
- konkretno mjesto nije slobodno;
- prethodna ovisna operacija završava prekasno;
- dizalica, zona ili mjesto nisu aktivni;
- brod već ima nespojivu aktivnu operaciju.

### 12.2. Upozorenja

- odabrana zona nije preferirana;
- afinitet je nizak;
- transport je znatno dulji od najbolje opcije;
- kapacitet pada na sigurnosni minimum;
- operacija nema dodijeljeno konkretno mjesto;
- brod na kopnu nema planirano spuštanje;
- ručno zauzeće smanjuje pouzdanost projekcije;
- operater bira niže rangiranu opciju.

### 12.3. Objašnjivost

Svaka poruka mora reći:

1. što je problem;
2. na koju operaciju i resurs se odnosi;
3. kada problem nastaje;
4. što sustav predlaže.

Primjer:

```text
Nema mjesta u zoni Lukobran u 10:20.
Mjesto L-12 oslobađa se tek u 10:45.
Predloženo: pomaknuti vađenje na 11:00 ili odabrati Zonu 2.
```

---

## 13. Transakcijska i audit pravila

Potvrda rasporeda mora biti atomska:

1. ponovno učitati stanje relevantne dizalice, zone i mjesta;
2. provjeriti vremensko preklapanje;
3. izračunati projekciju kapaciteta;
4. provjeriti tvrda ograničenja;
5. spremiti rezervaciju i povezane promjene;
6. zapisati audit događaj;
7. potvrditi transakciju.

Ako se bilo koji korak ne može izvršiti, ne smije ostati djelomično spremljen plan.

Audit treba bilježiti:

- automatski prijedlog;
- konačni odabir;
- promjenu dizalice, zone ili termina;
- override upozorenja;
- razlog overridea;
- stvarni početak i završetak operacije;
- nastanak i zatvaranje `land_occupancy` zapisa.

---

## 14. Uloga operatera i automatizacije

Sustav treba biti **decision-support**, a ne potpuno autonoman planer.

### Sustav radi

- izračun kapaciteta;
- otkrivanje konflikata;
- eliminaciju nedopuštenih opcija;
- rangiranje kombinacija;
- prijedlog redoslijeda;
- korekciju procijenjenog trajanja;
- prikaz posljedica promjene.

### Operater radi

- potvrđuje raspored;
- odlučuje između valjanih prijedloga;
- unosi terenska ograničenja koja sustav ne zna;
- provodi dopušteni override;
- potvrđuje stvarni završetak operacije;
- ispravlja stvarno stanje ako se razlikuje od plana.

---

## 15. Implementacijske faze

## Faza 0: korekcija modela planirano/stvarno

Prije izrade novog ekrana:

- prestati kreirati stvarni `land_occupancy` za buduću operaciju;
- osigurati da završetak `lift_from_sea` kreira zauzeće;
- osigurati da završetak `lower_to_sea` zatvara zauzeće;
- provjeriti dvostruko brojanje odobrenih rezervacija i aktivnih zauzeća;
- definirati statusne prijelaze rezervacije i liste čekanja.

**Rezultat:** pouzdana osnova za projekciju.

## Faza 1: objedinjeni modul

Implementirati:

- rutu `/admin/land-hub`;
- dnevnu bilancu;
- paralelni prikaz spuštanja i vađenja;
- vremenski plan za tri dizalice;
- kartice šest zona;
- ugrađenu listu čekanja;
- stanje aktivnih zauzeća;
- osnovne filtre;
- prikaz konflikata bez drag-and-dropa.

**Rezultat:** operater više ne mora otvarati dva ili tri odvojena pogleda.

## Faza 2: dizalica–zona profili

Implementirati:

- tablicu `crane_zone_profiles`;
- administrativnu matricu 3 × 6;
- transportne i dodatne minute;
- preferirane i zabranjene kombinacije;
- izračun ukupnog trajanja;
- tri rangirana prijedloga.

**Rezultat:** sustav razumije fizičku geometriju marine.

## Faza 3: interaktivni planer

Implementirati:

- drag-and-drop;
- promjenu dizalice, vremena i zone;
- simulaciju posljedica prije spremanja;
- veze između spuštanja i ovisnog vađenja;
- sigurnosne buffere;
- potvrdu plana u jednoj transakciji.

**Rezultat:** operater može optimizirati slijed rada iz jednog ekrana.

## Faza 4: napredna optimizacija

Tek nakon stabilnog korištenja:

- uspoređivati procijenjeno i stvarno trajanje;
- analizirati `crane_operation_log`;
- predlagati kalibraciju transportnih vremena;
- optimizirati prazan hod dizalica;
- predlagati raspored cijelog dana;
- uvesti scenarije „što ako”.

**Rezultat:** podatkovno podržano unapređenje procesa bez prerane složenosti.

---

## 16. Kriteriji prihvata

### 16.1. Funkcionalni kriteriji

Implementacija je prihvatljiva kada operater može:

- u jednom modulu vidjeti sve tri dizalice;
- u jednom modulu vidjeti svih šest zona;
- paralelno vidjeti spuštanja i vađenja;
- vidjeti početno i završno stanje kapaciteta;
- vidjeti najnižu točku kapaciteta tijekom dana;
- otvoriti detalj svakog događaja koji mijenja kapacitet;
- razlikovati stvarno i planirano zauzeće;
- vidjeti neraspoređene zahtjeve;
- dobiti do tri valjana prijedloga;
- vidjeti razlog svake preporuke ili zabrane;
- ručno odabrati drugu valjanu opciju;
- dobiti upozorenje kada promjena jedne operacije ugrožava drugu.

### 16.2. Podatkovni kriteriji

- buduće vađenje ne stvara aktivno fizičko zauzeće;
- završeno vađenje stvara točno jedno aktivno zauzeće;
- završeno spuštanje zatvara točno jedno aktivno zauzeće;
- isto zauzeće ne smije se brojiti kao zauzeće i rezervacija;
- projekcija se računa zasebno za svaku zonu;
- ukupni prikaz mora odgovarati zbroju šest zona;
- ručna zauzeća moraju biti uključena u početno stanje;
- zabranjena kombinacija dizalice i zone ne ulazi u preporuke.

### 16.3. UX kriteriji

- ključni odgovor o izvedivosti dana vidljiv je bez otvaranja detalja;
- konflikt se može razumjeti iz poruke bez ručnog računanja;
- najvažnije akcije dostupne su u najviše dva klika;
- promjena termina odmah osvježava projekciju;
- boja nije jedini način razlikovanja statusa;
- prikaz je primarno optimiziran za desktop operaterski ekran.

---

## 17. Testni scenariji

## Scenarij A: dovoljan završni i trenutni kapacitet

- početno slobodno: 4;
- šest spuštanja prije odgovarajućih vađenja;
- osam vađenja;
- završno slobodno: 2;
- nijedna zona ne pada ispod nule.

**Očekivanje:** plan je zelen i izvediv.

## Scenarij B: dovoljan završni, ali nedovoljan trenutni kapacitet

- početno slobodno: 4;
- prvih pet događaja su vađenja;
- spuštanja počinju kasnije;
- završno slobodno: 2.

**Očekivanje:** završni saldo je pozitivan, ali plan je crven zbog privremenog deficita.

## Scenarij C: ukupno mjesto postoji, kompatibilna zona je puna

- ukupno kopno ima tri slobodna mjesta;
- Lukobran nema slobodno mjesto;
- Travel lift smije ili realno može koristiti samo Lukobran za konkretni brod.

**Očekivanje:** zahtjev je blokiran ili se nudi drugi stvarno dopušten plan, bez oslanjanja na ukupan saldo.

## Scenarij D: udaljena zona povećava trajanje

- Travel lift → Lukobran: 2 minute transporta;
- Travel lift → udaljena zona: 15 minuta;
- oba izbora imaju kapacitet.

**Očekivanje:** Lukobran je bolje rangiran, a raspored dizalice koristi različita ukupna trajanja.

## Scenarij E: pomicanje ovisnog spuštanja

- Brod B koristi mjesto koje oslobađa Brod A;
- spuštanje Broda A pomiče se 45 minuta kasnije.

**Očekivanje:** Brod B dobiva konflikt i sustav nudi novo vrijeme ili drugo mjesto.

## Scenarij F: buduća rezervacija ne zauzima fizičko mjesto

- vađenje je potvrđeno za sutra;
- brod je još u moru.

**Očekivanje:** rezervacija sudjeluje u sutrašnjoj projekciji, ali ne povećava današnje aktivno zauzeće.

---

## 18. Migracija postojećih pogleda

Postojeće stranice ne treba odmah fizički izbrisati.

Preporučeni prijelaz:

1. izraditi `/admin/land-hub`;
2. ponovno koristiti postojeće upite i komponente gdje je to razumno;
3. označiti stare stranice kao sekundarne administrativne poglede;
4. operaterima postaviti novi modul kao primarni ulaz;
5. nakon stabilizacije ukloniti duplicirane operativne akcije;
6. zadržati zasebnu stranicu za konfiguraciju zona i administrativnu matricu dizalica–zona.

Predložena navigacija:

```text
Kopno i operacije
├── Operativna ploča
├── Povijest operacija
└── Postavke
    ├── Kopnene zone
    ├── Mjesta na kopnu
    └── Dizalice × zone
```

---

## 19. Preporučena komponentna struktura

```text
AdminLandHubPage
├── LandHubToolbar
├── DayCapacitySummary
├── CraneTimelineBoard
│   ├── CraneTimelineRow × 3
│   └── OperationCard
├── ZoneProjectionGrid
│   └── ZoneProjectionCard × 6
├── LandRequestQueue
│   └── LandRequestCard
├── ActiveLandOccupancyPanel
├── ConflictAndRecommendationPanel
├── SchedulingProposalDialog
├── OperationDetailsDrawer
└── OverrideReasonDialog
```

Servisna struktura:

```text
land-hub/
├── capacity-projection.service
├── crane-zone-ranking.service
├── scheduling-validation.service
├── operation-dependency.service
├── land-hub.mapper
└── land-hub.types
```

Poslovnu logiku projekcije i rangiranja ne treba smjestiti u React komponente.

---

## 20. Konačna preporuka

Treba implementirati **jedinstveni modul „Kopno i operacije”** čija je središnja funkcija vremenski Flow Board za tri dizalice i šest zona.

Najvažnije odluke su:

1. lista čekanja i stanje mjesta postaju paneli istog operativnog radnog prostora;
2. spuštanja i vađenja prikazuju se paralelno na vremenskoj osi po dizalicama;
3. kapacitet se računa nakon svake operacije, ne samo kao dnevni saldo;
4. prikazuje se najniža točka kapaciteta tijekom dana;
5. projekcija postoji ukupno i zasebno za svih šest zona;
6. dizalica–zona odnos sadrži dopuštenost, afinitet i stvarne minute transporta;
7. sustav prvo eliminira fizički nedopuštene kombinacije, a tek zatim rangira preostale;
8. spuštanje koje oslobađa mjesto može se povezati s vađenjem koje ga koristi;
9. planirano i stvarno zauzeće moraju biti strogo odvojeni;
10. sustav predlaže plan, ali operater donosi konačnu odluku.

Ovakvo rješenje nije samo vizualno objedinjavanje dviju postojećih stranica. Ono mijenja aplikaciju iz statičnog registra u **operativni sustav za upravljanje tokom brodova, kapacitetom kopna i radom dizalica**.

---

## 21. Izvorni kontekst implementacije

Prijedlog je izrađen na temelju pregledanog repozitorijskog izvještaja `repomix-output-mariomatrix-crane-booking-app.md`, posebno postojećih modela i funkcija vezanih uz:

- `reservations`;
- `service_types.operation_category`;
- `land_zones`;
- `land_occupancies`;
- `land_waiting_list`;
- `cranes`;
- `crane_operation_log`;
- postojeće administrativne stranice za zone, listu čekanja i dnevne operacije.
