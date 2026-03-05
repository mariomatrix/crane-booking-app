1\. LOGIČKA NAVIGACIJA I KORISNIČKE ULOGE

Navigacija ("Mobile-first" izbornik, npr. _bottom tab bar_ na mobitelima i bočni _sidebar_ na desktopu) mora se dinamički mijenjati ovisno o ulozi prijavljenog korisnika:

* **Gost (Neregistrirani korisnik):**

  * _Početna:_ Osnovne informacije o uslugama dizalice i travel lifta.
  * _Javni kalendar:_ _Read-only_ prikaz zauzetosti (bez detalja o klijentima) kako bi gosti vidjeli okvirnu gužvu.
  * _Prijava/Registracija:_ Gumb za Google OAuth 2.0 ili standardnu prijavu.

* **Korisnik (Vlasnik plovila):**

  * _Nova rezervacija:_ Forma za podnošenje zahtjeva (odabir usluge: Vađenje, Porinuće, Pranje).
  * _Moje rezervacije:_ Popis aktivnih i prošlih zahtjeva s indikatorima statusa.
  * _In-App Chat:_ Poruke vezane uz specifičnu rezervaciju.
  * _Moja plovila:_ Profil s tehničkim podacima o brodovima (dužina, težina, gaz).

* **Operater (Osoblje marine / Dizaličar):**

  * _Inbox zahtjeva:_ Lista pristiglih zahtjeva koje treba odobriti i smjestiti u kalendar.
  * _Dnevni/Tjedni plan (Crane Planner):_ Interaktivni kalendar operacija za taj dan.
  * _Aktivne operacije:_ Brzi gumbi za radnike na terenu ("Započni operaciju", "Završi operaciju").

* **Administrator (Uprava marine):**

  * Sve što vidi Operater.
  * _Sistemske postavke (Settings):_ Upravljanje parametrima sustava.
  * _Baza korisnika i plovila:_ CRM pregled svih klijenata.
  * _Analitika:_ Financijski i operativni izvještaji (npr. popunjenost dizalice).

\--------------------------------------------------------------------------------

2\. SISTEMSKI PARAMETRI (Administratorski Panel)

Osim vaših navedenih zahtjeva, dodao sam ključne parametre koji su standard u industriji za ovakve aplikacije, a nužni su za automatizaciju i pravnu zaštitu marine:

**Osnovni parametri (Vaš zahtjev):**

* **Time-grid intervali:** Mogućnost definiranja prikaza kalendara u razmacima od 15, 30 ili 60 minuta.
* **Neradni dani i radno vrijeme:** Unos državnih praznika, zimskog/ljetnog radnog vremena te automatsko blokiranje kalendara izvan tih sati.
* **Maksimalan broj rezervacija:** Ograničenje broja aktivnih ("pending") zahtjeva koje jedan korisnik može imati istovremeno kako bi se spriječio _spam_.

**Dodatni parametri (Standardi industrije koje ste zaboravili):**

* **Pravila i rokovi ponude (Offer Expiration):** Parametar koji definira koliko sati korisnik ima za prihvaćanje ponuđenog termina (npr. 4, 12 ili 24 sata) prije nego se termin automatski oslobodi.
* **Dinamički cjenik prema dimenzijama:** Pravila za automatski izračun cijene temeljem dužine (LOA), širine ili težine plovila iz korisničkog profila (npr. do 10m = 100 EUR, do 15m = 180 EUR).
* **Sigurnosni vremenski parametri (Weather Blocks):** Ograničenje maksimalne dopuštene brzine vjetra. Ako je sustav povezan s anemometrom (ili ručnim unosom), admin može jednim klikom blokirati sve operacije dizalice zbog vjetra te automatski poslati obavijest korisnicima o odgodi.
* **Porezne stope i valute:** Definiranje lokalnih poreza (PDV) za automatsko generiranje ponuda i integraciju naplate.
* **Predlošci obavijesti (Notification Templates):** Tekstualni predlošci na oba jezika za SMS i Email poruke koje se šalju pri promjeni statusa (npr. "Vaš brod je u moru", "Termin odobren").

\--------------------------------------------------------------------------------

3\. LOKALIZACIJA (Dvojezičnost)

* Aplikacija mora biti lokalizirana na **hrvatski (HR)** i **engleski (EN)** jezik.
* Jezik se automatski prilagođava postavkama preglednika/mobitela korisnika, s mogućnošću ručnog prebacivanja (zastavice u glavnom izborniku).
* Baza podataka (npr. imena dizalica, tipovi usluga) mora podržavati unos na oba jezika kako bi se i dinamički sadržaj pravilno prevodio.

\--------------------------------------------------------------------------------

4\. DODATAK NA TODO LISTU ZA PROGRAMERE

Na postojeću TODO listu potrebno je dodati sljedeće tehničke zadatke:

🌐 Lokalizacija i Navigacija

* \[ ] Implementirati `i18next` ili `next-intl` (ovisno o frameworku) za dvojezičnost (HR/EN).
* \[ ] Ekstrahirati sve tekstove iz UI komponenti u JSON _translation_ datoteke (`hr.json`, `en.json`).
* \[ ] Izraditi dinamički sustav rute/navigacije koji provjerava `role` korisnika (guest, user, operator, admin) i renderira samo dopuštene stavke izbornika.

⚙️ Administratorske Postavke (Baza i UI)

* \[ ] Kreirati tablicu `system_settings` u bazi podataka u obliku _key-value_ parova za pohranu parametara (time\_grid, max\_user\_reservations, offer\_expiration\_hours, itd.).
* \[ ] Izraditi UI u Admin panelu: "Postavke radnog vremena" za definiranje _business hours_ i kalendar za blokadu datuma (praznici).
* \[ ] Izraditi UI u Admin panelu: "Cjenici" za unos formula za izračun cijena prema dužini plovila.
* \[ ] Implementirati logiku u backendu: Prilikom slanja zahtjeva validirati prolazi li korisnik pravilo `max_user_reservations`.
* \[ ] Implementirati gumb "Vremenska blokada (Vjetar)" u kalendaru koji jednim klikom poništava radni dan i generira obavijesti pogođenim klijentima.
