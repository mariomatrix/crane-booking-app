# Upute za uvoz korisnika i plovila iz CSV datoteke

Ovaj dokument služi kao priručnik za pripremu i uvoz CSV datoteka u sustav za rezervaciju dizalica (**crane-app**).

---

## 1. Priprema CSV datoteke

Prilikom izvoza ili uređivanja članova u programima poput Excela, LibreOfficea ili Google Sheetsa, potrebno je osigurati ispravan redoslijed i format stupaca.

### Podržane strukture stupaca

Uvoznik je pametan i dinamički prepoznaje tri formata datoteka:

#### Format A: Potpuni format (7 stupaca) — PREPORUČENO
Koristite ovaj format ako imate sve podatke o članovima, uključujući OIB i registraciju plovila:
1. `"id"` (ID člana / broj iskaznice)
2. `"ime i prezime"` (Puno ime člana)
3. `"email"` (Korisnikov e-mail)
4. `"broj mobitela"` (Broj telefona)
5. `"oib"` (Osobni identifikacijski broj člana)
6. `"naziv broda"` (Ime plovila)
7. `"registracija broda"` (Registarska oznaka plovila)

**Primjer retka:**
`"1012","LJUBOMIR ALFIREVIĆ","ljubomir.alfirevic@yahoo.com","0996851772","12345678901","STELLA MARIS","ST-1234"`

#### Format B: Sa 6 stupaca
Sustav automatski detektira ima li datoteka OIB ili registraciju broda u 5. stupcu:
- **Ako je 5. stupac OIB (11 znamenki):** Sustav ga tumači kao OIB, a 6. stupac kao naziv broda (registracija broda će se postaviti jednaka nazivu).
- **Ako 5. stupac nije OIB:** Sustav ga tumači kao naziv broda, a 6. stupac kao registraciju broda (OIB ostaje prazan).

#### Format C: Osnovni format (5 stupaca)
Koristi se ako nemate OIB niti zasebnu registraciju plovila:
1. `"id"`, 2. `"ime i prezime"`, 3. `"email"`, 4. `"broj mobitela"`, 5. `"naziv broda"`
*(U ovom slučaju, OIB ostaje prazan, a registracija broda se postavlja jednaka nazivu).*

---

## 2. Važna pravila za pojedina polja

> [!IMPORTANT]
> - **OIB**: Mora sadržavati točno 11 znamenki i prolaziti službenu ISO 7064 matematičku kontrolu. Ako OIB nije ispravan, uvoznik će korisnika uvesti, ali će polje za OIB ostaviti praznim (`NULL`) kako bi ga se moglo naknadno unijeti u aplikaciji.
> - **Email**: Ako je e-mail prazan ili neispravan, sustav će automatski generirati placeholder e-mail u formatu `clan_<id>@psd-spinut.hr`. Ako član naknadno prijavi e-mail, možete ga izmijeniti na njegovom profilu.
> - **Više adresa**: Ako u polju za e-mail imate više adresa odvojenih točka-zarezom (npr. `mail1@gmail.com; mail2@net.hr`), uvoznik će automatski uzeti samo **prvu** adresu.
> - **Lozinka**: Svaki novostvoreni član dobit će privremenu lozinku **`Spinut1234!`** i pri prvoj prijavi sustav će od njega tražiti da postavi svoju privatnu lozinku.

---

## 3. Kako sustav spaja podatke (Pravila sinkronizacije)

Uvoznik je dizajniran tako da se može pokretati više puta bez straha od gubitka podataka ili stvaranja duplih korisnika:

* **Spajanje po OIB-u**: Ako u CSV datoteci postoji ispravan OIB, sustav prvo traži člana s tim OIB-om u bazi. Ako ga pronađe, **ažurirat će** njegovo ime, e-mail i mobitel.
* **Spajanje po Emailu**: Ako OIB nije upisan, sustav će pokušati pronaći člana po e-mailu te ažurirati njegove podatke.
* **Više plovila po članu**: Ako isti član (isti OIB ili e-mail) ima više brodova (bilo u istoj datoteci u više redaka, ili prilikom naknadnog uvoza), sustav će mu **dodati svako novo plovilo** na popis. Već postojeća plovila s istim imenom ili registracijom neće se duplicirati.
* **Sigurnost ručnih izmjena**: Ako ste nekom članu ručno unijeli OIB u aplikaciji, ponovni uvoz CSV datoteke bez OIB-a **neće obrisati** taj OIB.

---

## 4. Koraci za pokretanje uvoza

1. Prijavite se u aplikaciju kao **Administrator**.
2. U izborniku otvorite **Korisnici** (User Management).
3. Kliknite na gumb **Uvezi CSV** na vrhu stranice (pored gumba *Novi Korisnik*).
4. Odaberite pripremljenu `.csv` datoteku na svom računalu.
5. Pričekajte nekoliko sekundi. Nakon dovršetka, na ekranu će se pojaviti obavijest s rezultatima:
   - Broj uspješno uvezenih/ažuriranih članova.
   - Broj dodanih plovila.
   - Broj preskočenih redaka (npr. prazni redovi).
   - Broj grešaka pri uvozu.
