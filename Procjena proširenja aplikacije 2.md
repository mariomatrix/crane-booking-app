# Procjena proširenja aplikacije funkcionalnostima Gemini API-ja

Datum: 13. 11. 2026.  
Analizirani commit nakon sinkronizacije: 9ffb1f4a9e797950a621fba576403927a708e7eb.  
Prethodna verzija analize odnosila se na 31b5640; zaključci u nastavku zamijenjeni su ili dopunjeni prema novom kodu.  
Vrsta rada: analiza izvornog koda, službene dokumentacije, postojeći ciljani testovi i izolirane reprodukcije sa sintetičkim podacima; bez izmjena aplikacije i bez pozivanja modela stvarnim dokumentima.

## 1. Mišljenje i prioriteti

Najveću neposrednu vrijednost imaju zajednički sustav očitanja i evidencije dokumenata (točke 1 i 5), a zatim priprema višejezičnih obavijesti (točka 2). Upite prirodnim jezikom treba uvesti preko unaprijed definiranih pretraga, umjesto izvršavanja proizvoljnog SQL-a koji napiše model. Novi kod potvrđuje implementaciju točke 4: mobilno sučelje, interpretaciju, pregled predloženih akcija i njihovo izvršavanje. Potvrđeni su i administratorski ispravci naloga i zauzeća kopna. Prije širenja AI automatizacije prioritet imaju konzistentnost mjesta, razdoblja boravka, financijskih učinaka i ponovljenih zahtjeva; konkretni nalazi G-11 do G-25 nalaze se u odjeljku 9.

Temeljna granica odgovornosti: Gemini predlaže podatke, tekst ili namjeru radnje; backend provjerava ovlasti, činjenice, poslovna pravila i provodi radnju. Model ne odlučuje o novcu, stečenim pravima niti vjerodostojnosti dokumenta.

| Funkcionalnost | Procjena vrijednosti | Preporučeni oblik | Prioritet |
| --- | --- | --- | --- |
| 1. Očitanje dokumenata | Visoka: smanjuje prepisivanje i ubrzava registraciju | Prijedlog unosa uz izvornik i potvrdu djelatnika | Prvo |
| 2. Višejezične obavijesti | Visoka: standardizira komunikaciju | Jezični nacrt iz provjerenih činjenica; iznosi i računi iz backend sustava | Drugo |
| 3. Pitaj bazu | Korisno nakon uređenja podataka | Model bira dopuštenu pretragu i filtre; backend sastavlja upit | Treće |
| 4. Terenski zapisnik | Implementiran; visoka operativna vrijednost | Doraditi postojeći tok, posebno izvršavanje, ponavljanje zahtjeva i premještaj | Prije širenja automatizacije |
| 5. Provjera dokumenata | Visoka uz točku 1 | Odvojiti očitanje, provjeru pravila i potvrdu vjerodostojnosti | Zajedno s točkom 1 |

Ovo su procjene potencijala, a ne izmjereni poslovni učinci. Nisu potvrđene tvrdnje o unosu u tri sekunde, uklanjanju svih pogrešaka niti točnosti modela na dokumentima lučice.

## 2. Što je utvrđeno u dostupnom kodu

| ID | Provjereni dokaz | Značenje za prijedloge |
| --- | --- | --- |
| G-01 | [server/services/voiceCommandService.ts:436](../../server/services/voiceCommandService.ts#L436), retci 436–491 i 494–537; [server/_core/env.ts:21](../../server/_core/env.ts#L21), retci 21–25 | Glasovni tok prvo koristi izravni Google Interactions API ako postoji ključ; inače koristi posrednički helper. Raniji zaključak da je vidljiv samo posrednik više ne vrijedi. Konfiguracija zadano bira gemini-3.5-flash-lite, a helper prihvaća model kao argument. Nazivi 3.5 Flash-Lite i 3.1 Flash-Lite potvrđeni su u službenom katalogu [S9]; produkcijski pristup nije testiran. |
| G-02 | [server/services/voiceCommandService.ts:452](../../server/services/voiceCommandService.ts#L452), retci 452–491 i 1226–1230; [server/_core/llm.ts:317](../../server/_core/llm.ts#L317), retci 317–333 | Izravni poziv šalje shemu i store: false, ali odgovor prolazi JSON.parse bez runtime validacije cijelog ugovora. U pregledanim fetch pozivima nema timeouta. Struktura izlaza i dalje nije dokaz semantičke točnosti. |
| G-03 | [drizzle/schema.ts:164](../../drizzle/schema.ts#L164), retci 164–175: plovilo ima vlasnika, registraciju i dimenzije | Postoji dobar početak za očitanje. U pregledanoj shemi nisam našao evidenciju polica s datumom isteka, registra priloženih dokumenata ni snage motora. To zahtijeva zaseban dizajn, a ne samo AI obrazac. |
| G-04 | [shared/oib.ts:12](../../shared/oib.ts#L12), retci 12–23: provjera OIB kontrolne znamenke | Ponovno iskoristiti validator nakon očitanja. Matematički valjan OIB nije dokaz da pripada osobi s dokumenta. |
| G-05 | [drizzle/schema.ts:914](../../drizzle/schema.ts#L914), retci 914–932: activeMember i uvezeni klupski podaci; [drizzle/schema.ts:1154](../../drizzle/schema.ts#L1154), retci 1154–1165: vrsta i plaćenost računa | Aktivno članstvo i plaćenost računa nisu sami po sebi jednoznačna evidencija prava i uplate članarine za određenu kalendarsku godinu. U pregledanim strukturama nema eksplicitne veze članstvo–godina–uplata. |
| G-06 | [server/invoices.router.ts:202](../../server/invoices.router.ts#L202), retci 202–218; [server/workOrders.router.ts:844](../../server/workOrders.router.ts#L844), retci 844–881 | Postoje i eRacuni tok i lokalno stvaranje jedinstvene ponude/računa. AI treba koristiti poslovne servise; prije nadogradnje uskladiti koji je tok autoritativan i kako se svi uključeni nalozi povezuju s dokumentom. |
| G-07 | [client/src/contexts/LangContext.tsx:6](../../client/src/contexts/LangContext.tsx#L6), retci 6 i 21–28; [server/_core/email.ts:103](../../server/_core/email.ts#L103), retci 103–111 | Pregledani jezični kontekst i primjer poruke podržavaju HR/EN; izbor sučelja čuva se u pregledniku. Za DE/IT/SL komunikaciju potreban je trajni podatak o željenom jeziku primatelja i proširenje tokova slanja. |
| G-08 | [server/jobs/queue.ts:16](../../server/jobs/queue.ts#L16), retci 16–23: redovi e-pošte, SMS-a i podsjetnika preko pg-boss | Postoji infrastruktura na kojoj se može izgraditi obrada dokumenata i priprema obavijesti u pozadini. Glasovno slanje poruka zasad je zaobilazi (G-16). |
| G-09 | [server/routes/mobileApi.ts:39](../../server/routes/mobileApi.ts#L39), retci 39–45; [server/services/authPolicyService.ts:102](../../server/services/authPolicyService.ts#L102), retci 102–155 | Raniji nalaz o provjeri samo JWT-a povučen je za redovni tok s dostupnom bazom: sada se učitavaju aktivni korisnik i stvarna operatorska/admin uloga. Ostaje fallback kada getDb vrati null, koji nije izričito ograničen na testni NODE_ENV; ne treba ga poistovjećivati sa svakom greškom povezivanja na bazu. |
| G-10 | [drizzle/schema.ts:71](../../drizzle/schema.ts#L71), retci 71–100: korisnički podaci uključuju passwordHash, jmbgHash i pinCode | Modelu za pretraživanje dati uski poslovni rječnik dopuštenih polja, a ne cijelu fizičku shemu ili korisničke retke. Nisu čitane ni ispisivane stvarne vrijednosti. |

Točka 4 potvrđena je u novom kodu: [server/routes/mobileApi.ts:678](../../server/routes/mobileApi.ts#L678), retci 678–721, povezuju /voice/interpret i /voice/execute s domenskim servisom. [client/src/components/mobile/MobileVoiceAssistantModal.tsx:293](../../client/src/components/mobile/MobileVoiceAssistantModal.tsx#L293), retci 293–336 i 530–578, potvrđuju pregled, izbor akcija i prikaz pojedinačnih rezultata. To je provjera implementacije u repozitoriju, bez potvrde rada na objavljenoj instanci.

## 3. Točka 1 — očitanje dokumenata

### Što podržati

Zasebni obrasci ekstrakcije za plovidbenu dozvolu, policu osiguranja i potvrdu o članstvu. Osobnu iskaznicu uključiti samo kada postoji opravdana potreba za konkretnim podacima; ne prikupljati puni dokument samo zato što model to može obraditi.

JSON shema treba opisivati rezultat očitanja, a ne biti preslika tablice baze. Za svako polje predvidjeti izvornu vrijednost, normaliziranu vrijednost, stranicu i kratki dokaz iz dokumenta; nedostajuća vrijednost mora moći ostati prazna. Razlikovati vlasnika, ugovaratelja osiguranja, osiguranika i ovlaštenog korisnika.

Predloženi tok:

1. Autorizirani djelatnik učitava datoteku; backend provjerava veličinu, stvarni format i pristup dokumentu.
2. Dokument se sprema privatno i dobiva status obrade.
3. Gemini vraća podatke prema uskoj shemi za odabranu vrstu dokumenta.
4. Backend validira tipove, OIB, datume, jedinice i veze s postojećim zapisima.
5. Djelatnik vidi dokument i predložena polja usporedno; potvrđuje stvaranje ili izmjenu zapisa.
6. Spremaju se potvrđene vrijednosti i trag odluke: tko, kada, iz kojeg dokumenta i koju je ispravku napravio.

### Granice i rubni slučajevi

Structured Outputs pomaže u poštovanju strukture, ali ne jamči istinitost vrijednosti [S1]. Dobar JSON može sadržavati pogrešan OIB, vlasnika ili datum. Nečitko polje ne smije biti popunjeno nagađanjem.

LOA i druga deklarirana duljina plovila ne smiju se automatski izjednačiti s postojećim lengthM bez dogovora o značenju. Normalizirati metre/stope, kW/KS, decimalni zarez i dvosmislene datume. Predvidjeti više vlasnika, pravnu osobu, strano plovilo bez hrvatskog OIB-a, dokument s više plovila, staru registraciju i već postojeće plovilo.

Prikaz modelove samoprocjene pouzdanosti nije zamjena za provjeru; postotak ne treba predstavljati kao izmjerenu vjerojatnost točnosti. Mjeriti stvarne pogreške na označenim primjerima.

## 4. Točka 2 — obavijesti, opomene i računi

Razdvojiti poslovni sadržaj od jezičnog prikaza.

Backend izračunava stavke, poreze, popuste, saldo i rokove te određuje vrstu poruke. Gemini priprema pozdrav, objašnjenje i prijevod. Završni prikaz iznosa, broja računa, datuma, IBAN-a i poveznice za plaćanje sastavlja aplikacija iz provjerenih podataka. Novi lokalni tok jedinstvene ponude/računa i eRacuni integraciju treba obuhvatiti istim pravilima zaključavanja i ispravaka.

Preporučujem nekoliko odobrenih obitelji predložaka: obavijest, podsjetnik, opomena i sažetak usluge. Model može pomoći u izradi i prevođenju predložaka ili pripremiti pojedinačan nacrt. Nije potrebno za svaku standardnu poruku ponovno generirati cijeli tekst. Predlošci olakšavaju provjeru tona i pravnih formulacija te ostaju dostupni kada AI servis ne radi.

Primjer popusta od 15% iz prijedloga nije potvrđeno poslovno pravilo aplikacije. Model ne smije iz opisa članstva izvoditi taj popust. Izdavanje računa treba ostati u poslovnom sloju; potvrditi odnos lokalne jedinstvene ponude/računa i integracije eRacuni (G-06).

Potrebno je:

- evidentirati željeni jezik komunikacije primatelja, ne zaključivati ga iz imena ili države;
- razlikovati dug, nedospjelu obvezu i nepoznat status plaćanja;
- pregledati nacrte opomena i poruke koje mijenjaju prava ili obveze;
- spriječiti višestruko slanje iste obavijesti pri ponovljenoj obradi posla;
- definirati ponašanje kada nema e-pošte, broj je neispravan ili dostava ne uspije;
- zasebno provjeriti integraciju, privole i pravila slanja za WhatsApp; u ovoj analizi nije potvrđen postojeći WhatsApp kanal.

Automatski račun i jezično generirana popratna poruka dvije su različite funkcionalnosti.

## 5. Točka 3 — pretraga prirodnim jezikom

### Preporučeni početni oblik

Model prevodi pitanje u dopuštenu poslovnu pretragu s validiranim filtrima, primjerice: searchVessels, lengthGreaterThanMeters = 10, membershipYear = 2026, membershipPaymentStatus = unpaid, insuranceExpiryPeriod = this_month.

To je konceptualni ugovor, a ne postojeći API. Backend zatim:

1. Provjerava ovlasti djelatnika i dopuštena polja.
2. Razrješava relativni period u konkretne datume u vremenskoj zoni Europe/Zagreb.
3. Validira argumente i sastavlja parametrizirani SQL iz vlastitog koda.
4. Primjenjuje ograničenja opsega, vremena izvršavanja i broja rezultata.
5. Vraća tablicu s prikazom primijenjenih filtara i vremenom ažurnosti podataka.

Ako djelatnik pita za neplaćenu članarinu, a za taj zapis uplata nije poznata, rezultat mora ostati nepoznat. Nepostojanje računa ili zapisa ne znači automatski da članarina nije plaćena. Za navedeni primjer prvo treba dopuniti podatkovnu podlogu za osiguranje i godinu članarine (G-03, G-05).

Prednost ove izvedbe je ponovna uporaba istih pravila u klasičnim filtrima i AI pretrazi. Model ne može sam izabrati dodatnu tablicu s osobnim podacima.

### Zašto sam SELECT i read-only ovlasti nisu dovoljni

SELECT može dohvatiti podatke koje djelatnik ne smije vidjeti ili opteretiti bazu skupim upitom. PostgreSQL read-only transakcija ograničava određene promjene, ali nije sustav autorizacije niti potpuna zaštita od svih nuspojava [S7]. Provjera da tekst počinje riječju SELECT nije dovoljna.

Ako se kasnije uvede slobodniji SQL za analitičare, koristiti zasebnu ulogu, uske izvještajne poglede, dozvole nad dopuštenim objektima i funkcijama, analizu stabla SQL izraza, zabranu višestrukih naredbi i stroge resursne granice. To je osjetno složenije od uvođenja nekoliko dobro definiranih alata za pretragu.

Slanje samo sheme smanjuje količinu podataka poslanih modelu, ali upisano pitanje također može sadržavati osobne podatke. Rezultati se mogu prikazati izravno u aplikaciji; nije nužno vraćati ih modelu radi dodatnog prepričavanja [S3].

## 6. Točka 4 — nadogradnja postojećeg terenskog zapisnika

Implementacija je potvrđena u aktualnom kodu. Prisutne su pozitivne osnove: interpretacija je odvojena od izvršavanja, djelatnik vidi i bira akcije, backend povezuje nazive s podacima, a pokretanje i zaključenje pozivaju zajednički workOrderService. Za zaključenje postoji transakcija i zaštita od dvostrukog završavanja rezervacije ([server/services/workOrderService.ts:346](../../server/services/workOrderService.ts#L346), retci 346–362).

Postoji izravni Gemini poziv, posrednički tok kada izravni ključ nije konfiguriran te lokalni parser ako AI poziv ne uspije i dostupan je tekst (G-01, retci 1205–1222 u voiceCommandService). Pogreška izravnog poziva ne pokreće automatski drugi model 3.1 ili posrednika; s tekstom prelazi na lokalni parser. Ne treba iz komentara zaključiti da je implementiran automatski prijelaz između svih navedenih modela.

Ponašanje je šire od prvog prijedloga jer uključuje smještaj, početak/završetak operacije i obustave rada. Ipak, zaduženje trenutačno zapisuje karton, a ne stavku otvorenog računa; posebna strukturirana prijava incidenta nije među vrstama akcija (G-13, G-25).

Za postojeći tok provjereni su ili izdvojeni sljedeći slučajevi; detaljni dokazi, statusi i preporuke nalaze se u odjeljku 9:

- Registracija nije prepoznata, postoji više kandidata ili je diktat pogrešno prepisan: ponuditi izbor i ne vezati radnju automatski uz prvo plovilo.
- „Treba naplatiti” nije isto što i „naplaćeno”; „provjeriti treba li dva dana struje” nije nalog za naplatu.
- „Dva dana struje” mora proći postojeći cjenik i pravila usluge. Model ne računa cijenu niti pretpostavlja da postoji otvoreni račun koji se smije mijenjati.
- Ako je račun već izdan ili zaključen, ne mijenjati ga proizvoljno; radnja ide u odobreni postojeći računovodstveni postupak.
- Jedan zapisnik s tri radnje mora imati vidljiv status svake radnje. Ne prikazivati sve kao uspješno ako je incident spremljen, a slanje obavijesti nije uspjelo.
- Ponovljena sinkronizacija mobilnog uređaja, retry ili dvostruki klik ne smiju stvoriti dvije naplatne stavke.
- Korisnik mora imati stvarnu ovlast za svaku radnju; ovlast za zapis incidenta ne podrazumijeva ovlast za naplatu. Prijava sada provjerava aktivnog operatora/admina (ispravljen raniji G-09), ali izvršavanje dodatno treba vezati uz dopušten plan i objekte (G-11).

Praktičan obrazac je nacrt radnog naloga s odvojenim predloženim akcijama i potvrdom osjetljivih radnji. Potvrda se može organizirati skupno za ovlaštenog djelatnika, bez nepotrebnog ponavljanja za svako očitano polje.

## 7. Točka 5 — provjera valjanosti i usklađenosti

Ovo je logičan nastavak očitanja dokumenata, ali treba jasno razlikovati tri rezultata:

| Razina | Primjer provjere | Tko daje pouzdan rezultat |
| --- | --- | --- |
| Očitanje | Na dokumentu je navedena godina 2026. i ime osobe | Model predlaže; izvornik i provjera potvrđuju |
| Poslovna usklađenost | Dokument pokriva traženo razdoblje i pripada odgovarajućem ugovaratelju | Backend prema definiranim pravilima |
| Vjerodostojnost | Dokument je stvarno izdao klub; uplata je provedena | Pouzdan izvor izdavatelja, provjera potpisa gdje postoji ili ovlaštena provjera |

Slika pečata ili potpisa nije dokaz autentičnosti. Gemini može prepoznati da nešto nalikuje pečatu, ali na toj osnovi ne smije označiti dokument vjerodostojnim ili odobriti financijsko pravo.

„Tekuća godina” nije dovoljno precizno pravilo: u studenome 2026. može se obrađivati obnova za 2027. Backend treba poslati godinu/razdoblje na koje se zahtjev odnosi. Imena uspoređivati uz OIB ili drugi pouzdan identifikator, gdje je dostupan; promjena prezimena, dijakritika i pravne osobe zahtijevaju poseban postupak.

Uvesti vidljive ishode, primjerice: potrebno pregledati, nepotpun dokument, nečitljiv dokument, ne pokriva traženo razdoblje, nepodudaranje nositelja, provjeren prema pravilima. Prikazati razlog i dokaz, a ne samo zelenu oznaku „usklađeno”.

Prema ranije navedenom pravilu naručitelja, članarina se odnosi na kalendarsku godinu i uključuje jedno vađenje, jedan pripadajući boravak do 30 besplatnih dana te jedno spuštanje. Ta prava treba voditi u poslovnoj evidenciji neovisno o AI-ju. Nova potvrda o članstvu ne smije sama resetirati već iskorištene operacije ili boravak. Uvoz povijesnog plovila na kopnu također ne smije stvoriti novo pravo samo zato što prethodne operacije nisu unesene.

Prijenos boravka i operacija preko kraja godine te priznavanje ranije iskorištenih prava ostaju pitanja za izričito poslovno pravilo.

## 8. Zajednička tehnička podloga

### Predložene cjeline

- Privatna evidencija dokumenata: vlasnik/nositelj, plovilo, vrsta, razdoblje valjanosti, izvorna datoteka, prava pristupa i rok čuvanja.
- Posao ekstrakcije: status, verzija modela i sheme, rezultat i opis pogreške bez nepotrebnih osobnih podataka u logu.
- Potvrđeni podaci i odluke: razdvojeni od sirovog odgovora modela.
- Poslovni servisi: pretrage, pravo na uslugu, cjenik, računi i komunikacija.
- Red poslova: nadogradnja postojećeg pg-boss sustava, s timeoutom, ograničenim pokušajima, kontrolom troška i zaštitom od dvostrukih učinaka.
- Mjerenje kvalitete: skup reprezentativnih dopuštenih primjera i provjera prije promjene modela ili prompta.

Modelu se ne daju izravne ovlasti baze, ključevi ni mogućnost slanja poruka ili izdavanja računa mimo poslovnih servisa. Dokument, glasovni zapis i slobodan korisnički tekst tretiraju se kao nepouzdani ulaz: uputa ugrađena u dokument ne smije promijeniti ovlasti ili pravila rada.

Predložene nove tablice, API-ji i statusi u ovom dokumentu predstavljaju dizajn; nisu tvrdnja da već postoje.

### Osobni podaci i izbor pružatelja

Dokumenti sadrže osobne i financijske podatke. Razjasniti koji je produkcijski tok konfiguriran: Coolify aplikacija → Google izravno ili Coolify aplikacija → posrednik → pružatelj modela, odgovornosti svakog obrađivača, lokacije obrade, ugovor i rokove čuvanja. Kod potvrđuje mogućnost oba puta, a ne stvarnu produkcijsku konfiguraciju.

Aktualni Google uvjeti traže Paid Services za API klijente dostupne korisnicima u EGP-u, Švicarskoj i Ujedinjenom Kraljevstvu. Za Paid Services navode da se promptovi i odgovori ne koriste za poboljšanje proizvoda, ali opisuju ograničeno sigurnosno zapisivanje i moguću privremenu pohranu u zemljama u kojima Google ili njegovi agenti imaju kapacitete [S5]. Uvjeti sadrže i poseban režim uporabe podataka za korisnike iz EGP-a/Švicarske/UK-a; nije točno paušalno tvrditi da se svaki besplatni zahtjev koristi za treniranje.

To nije dokaz da je eventualno korišteni posrednik ugovorno pokriven istim uvjetima niti jamstvo pohrane samo u EU. Izravni glasovni zahtjev šalje store: false, što isključuje spremanje objekta interakcije prema [S8], ali nije univerzalno jamstvo nulte retencije svih sigurnosnih logova. Cloud varijantu treba usporediti prema stvarnim potrebama i uvjetima; ni ona ne znači automatski nultu retenciju [S6].

Files API navodi automatsko brisanje datoteka nakon 48 sati i mogućnost ranijeg brisanja [S4]. Taj podatak nije rok čuvanja svih promptova, logova, sigurnosnih kopija ili podataka kod posrednika. Pravila retencije trebaju pokriti svaki sloj.

Ne uvoditi novu biblioteku samo radi ovih prijedloga dok se ne provjere održavanje i uvjeti licence. Vlastiti kod aplikacije može ostati proprietary; to ne ukida obveze prema licencama odabranih ovisnosti.

## 9. Novi detaljni nalazi u aktualnom kodu

Status **reproducirano izolirano** znači da je izvršena stvarna servisna funkcija uz zamijenjen pristup bazi i sintetičke podatke. To potvrđuje grananje i poslane promjene, ali ne predstavlja test PostgreSQL constrainta, zaključavanja, HTTP autorizacije ili objavljene aplikacije. **Statički provjereno** označava zaključak iz navedenog koda.

### G-11 — Izvršavanje vjeruje akcijama vraćenim iz klijenta

**Ozbiljnost:** visoko. **Status:** statički provjereno; izravno pozivanje izvršitelja bez interpretacije reproducirano izolirano u G-12.

**Dokaz:** [server/routes/mobileApi.ts:704](../../server/routes/mobileApi.ts#L704), retci 704–717, provjerava samo neprazan niz actions i prosljeđuje ga izvršitelju. [server/services/voiceCommandService.ts:1251](../../server/services/voiceCommandService.ts#L1251), retci 1251–1269, prima puni payload akcija; grane 1338–1388 i 1409–1427 koriste dostavljene identifikatore i opise. Nema poslužiteljskog planId-a koji bi zahtjev vezao uz prethodnu interpretaciju i potvrđeni sadržaj.

**Utjecaj:** potvrda u korisničkom sučelju nije sigurnosna granica; prijavljeni operator može poslati preinačen zahtjev bez prolaska kroz interpretaciju. Backend u nekim granama provjerava postojanje objekta, ali time ne potvrđuje cijelu vezu operator–nalog–plovilo–vlasnik–usluga. Dopušten opseg rada operatora po dizalicama treba izričito definirati; ne tvrdi se da svaki operator nužno mora biti ograničen na jednu dizalicu.

**Preporuka:** spremiti kratkotrajni plan na poslužitelju, vezati ga uz korisnika i verzije objekata te prihvatiti samo planId i odabrane actionId-e. Pri izvršavanju ponovno provjeriti stanje, ovlasti i argumente prema strogoj diskriminiranoj shemi. Cijene, vlasnika, kontakte i kodove usluga dohvatiti iz baze.

### G-12 — Ponovljeni zahtjev ponovno stvara zaduženje

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/voiceCommandService.ts:1265](../../server/services/voiceCommandService.ts#L1265), retci 1265–1266 i 1376–1388: za svako add_card_charge izvršava se novi insert; action.id se ne koristi kao jedinstveni ključ obrade. Dva poziva s istom akcijom stvorila su dva inserta u user_card_entries.

**Utjecaj:** ponavljanje nakon prekida mreže ili ponovni odabir uspjele akcije nakon djelomične pogreške može dvaput zadužiti korisnika. Postojeća zaštita zaključenja rezervacije ne štiti sve ostale vrste akcija.

**Preporuka:** trajni zapis izvršenja i jedinstveni ključ za planId/actionId, u istoj transakciji s poslovnom promjenom. Vratiti prethodni rezultat već izvršene akcije. U UI-ju nakon djelomičnog uspjeha odvojiti dovršene akcije od onih dostupnih za ponavljanje.

### G-13 — „Dva dana struje” nije strukturirana naplatna stavka

**Ozbiljnost:** visoko. **Status:** statički provjereno i reproducirano izolirano.

**Dokaz:** [server/services/voiceCommandService.ts:1017](../../server/services/voiceCommandService.ts#L1017), retci 1017–1041, prepoznaje količinu i jedinicu te ih uključuje u naziv. Insert u retcima 1378–1388 ne sprema numeričku količinu, cijenu, iznos niti vezu s resursom/računom. Količina se pojavljuje u auditu 1395–1399. [drizzle/schema.ts:801](../../drizzle/schema.ts#L801), retci 801–819, potvrđuje da karton nema ta numerička polja. Pokus s quantity = 2 potvrdio je insert bez quantity.

**Utjecaj:** tvrdnja iz funkcionalnog prijedloga da se stavka dodaje na otvoreni račun nije potvrđena ovim tokom. Zapis kartona može služiti ručnoj obradi, ali tekst „(2 dan)” nije pouzdan ugovor za automatski obračun. Samo postojanje naziva usluge nije dokaz naplate.

**Preporuka:** model predlaže resurs i količinu, servis potvrđuje aktivni cjenik i jedinicu, a zatim sprema strukturiranu potrošnju povezanu s nalogom ili zasebnim terenskim događajem. Posebno razlikovati evidentiranu potrošnju, pripremljeno zaduženje i izdani račun.

### G-14 — Glasovni premještaj prekida kontinuitet boravka

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/voiceCommandService.ts:1349](../../server/services/voiceCommandService.ts#L1349), retci 1349–1368, zatvara sva aktivna zauzeća plovila i otvara novo s liftedAt = new Date(). Nema transakcije oko te grane niti povezivanja s izvornim ciklusom boravka; spotId se ne zapisuje. [server/workOrders.router.ts:667](../../server/workOrders.router.ts#L667), retci 667–682, za obračun uzima najnovije zauzeće i članovima oduzima 30 dana.

**Utjecaj:** premještaj nakon, primjerice, 25 dana može novom zapisu dati početak od danas. Navedeni obračun najnovijeg zauzeća tada ne uključuje prethodnih 25 dana. Ako insert ne uspije nakon zatvaranja starog zapisa, ostaje djelomična promjena. Cijeli lanac obračuna na PostgreSQL-u nije izvršen; gubitak kontinuiteta potvrđen je na razini servisnih upisa.

**Preporuka:** zadržati jedan identitet boravka s izvornim datumom dolaska, a promjene mjesta zapisivati kao njegove segmente. Premještaj provesti transakcijski, uz provjeru odredišta. Novi segment ne dodjeljuje novih 30 dana niti ponovno troši operaciju dizalice.

### G-15 — Nejednoznačno prepoznavanje bira prvi rezultat

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/voiceCommandService.ts:797](../../server/services/voiceCommandService.ts#L797), retci 797–829: pretrage zadataka i plovila koriste find, uključujući djelomičnu registraciju i ime vlasnika. U pokusu s dva plovila istog vlasnika vraćeno je prvo plovilo bez upozorenja. Retci 833–849 dopuštaju i prelazak na aktivnu rezervaciju ako upit nije razriješen. Lokalna lista plovila dodatno je ograničena na 600 bez determinističkog poretka, retci 352–364.

**Utjecaj:** generičko prezime ili dio registracije može vezati zaduženje/poruku uz pogrešno plovilo; plovilo izvan prvih 600 može izgledati kao nepostojeće. Prvi podudarni zadatak i prvi podudarni vlasnikov brod mogu predstavljati različite zapise.

**Preporuka:** prvo tražiti točnu registraciju/ID; za više kandidata tražiti izbor. Izričito imenovano, a neprepoznato plovilo ne zamijeniti aktivnim plovilom. Pretragu provoditi ciljano u bazi, ne nad proizvoljnih prvih 600 zapisa.

### G-16 — „Poslana obavijest” ne znači da je slanje uspjelo

**Ozbiljnost:** srednje. **Status:** statički provjereno i reproducirano izolirano za nepostojećeg primatelja.

**Dokaz:** [server/services/voiceCommandService.ts:1422](../../server/services/voiceCommandService.ts#L1422), retci 1422–1462: e-pošta i SMS pokreću se bez await, uz catch koji zapisuje upozorenje; nakon toga upisuju se owner_notified i uspješan rezultat. Pokus s nepostojećim userId-om također je vratio success = true.

**Utjecaj:** operater može vjerovati da je vlasnik obaviješten i kada nema primatelja ili servis slanja nije prihvatio poruku. To nije potvrda dostave čak ni kada poziv servisu uspije.

**Preporuka:** koristiti postojeći red poslova; prikazati odvojeno pripremljeno, u redu za slanje, prihvaćeno kod pružatelja, neuspješno i dostavljeno gdje kanal nudi povratni status. Audit mora opisivati stvarno izvršenu fazu.

### G-17 — Ispravak godine ne preračunava člansko pravo

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/workOrderService.ts:982](../../server/services/workOrderService.ts#L982), retci 982–1000: financijsko poništenje i novi izračun pokreću se samo kada se promijene korisnik, plovilo ili dizalica. Retci 1081–1085 kod promjene početka mijenjaju samo datum kartona. U pokusu je datum premješten iz 2026. u 2025. bez promjene member_statutory_rights.

**Utjecaj:** radni nalog i karton mogu prikazivati 2025., dok potrošnja ostaje pripisana stanju prava iz 2026. Sama promjena trajanja koja pomakne završetak preko kraja godine također nije obuhvaćena uvjetom. Redovno zaključenje dodatno koristi godinu sadašnjeg vremena, a ne godinu effectiveCompletedAt: retci 427–428 i 605–620.

**Preporuka:** razlikovati vrijeme unosa, vrijeme operacije i godinu prava. Promjena relevantnog datuma mora izračunati posljedice nad starom i novom godinom te povezanim ciklusom. Ispravak datuma početka boravka iz uvoza ne smije automatski stvarati ili poništavati povijesnu operaciju.

### G-18 — Obnova prava pri ispravku mijenja jedan aktualni saldo

**Ozbiljnost:** visoko. **Status:** statički provjereno.

**Dokaz:** [server/services/workOrderService.ts:768](../../server/services/workOrderService.ts#L768), retci 768–788: reverseWorkOrderFinancialEffectsTx vraća liftAvailable/lowerAvailable prema userId-u, bez godine ili identiteta konkretnog korištenja. [drizzle/schema.ts:748](../../drizzle/schema.ts#L748), retci 748–758: jedan red prava po korisniku.

**Utjecaj:** ispravak starog naloga može mijenjati aktualnu dostupnost prava bez rekonstruiranja kasnijih operacija. U jednostavnom ciklusu odmah nakon pogreške rezultat može biti očekivan, ali model ne pruža dovoljan dokaz konzistentnosti nakon više godina ili kasnijih operacija.

**Preporuka:** evidentirati dodjelu, korištenje i poništenje prava po godini i izvornom događaju; raspoloživost izračunavati iz te evidencije. Ispravak treba poništiti konkretnu potrošnju, a ne postaviti opći boolean. To ne zahtijeva uvođenje potpunog event-sourcing okvira.

### G-19 — Tri puta promjene mjesta nemaju isti ugovor

**Ozbiljnost:** visoko. **Status:** statički provjereno; neusklađenost spotId-a reproducirana izolirano.

**Dokaz:** [server/services/workOrderService.ts:1161](../../server/services/workOrderService.ts#L1161), retci 1161–1172, mijenja zoneId/spotNumber bez spotId-a. [server/routers.ts:5786](../../server/routers.ts#L5786), retci 5786–5818, u adminUpdate pokušava pronaći spotId, ali prihvaća nepostojeći broj mjesta s null identifikatorom i ne provjerava aktivnost, blokadu, zauzetost ili kapacitet. Glasovni put također ne zapisuje spotId (G-14). Za usporedbu, planirana alokacija ima vlastite provjere i zaključavanje: [server/services/landFlow.service.ts:826](../../server/services/landFlow.service.ts#L826), retci 826–860.

**Utjecaj:** isti boravak može pokazivati zonu B/mjesto 9, dok spotId upućuje na staru zonu A. Admin ispravak može upisati mjesto koje ne postoji ili je blokirano/zauzeto; izvršavanje takvog slučaja na bazi nije testirano. Pregledana shema land_occupancies sadrži obične indekse, bez jedinstvenosti aktivnog zauzeća po plovilu ili mjestu (retci 480–505); stanje produkcijskih dodatnih constrainta nije poznato.

**Preporuka:** jedinstven servis za fizički smještaj i ispravak; odrediti kanonski spotId, iz njega izvoditi zonu i broj. Nepoznato mjesto treba biti izričito „neraspoređeno”, a ne proizvoljan broj. Zaključati relevantno mjesto i provjeriti preklapanje u stvarnom razdoblju. Administratorska iznimka mora imati jasno ograničenje i zaseban razlog.

### G-20 — Ispravak spuštanja može ponovno zauzeti kopno

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/workOrderService.ts:1148](../../server/services/workOrderService.ts#L1148), retci 1148–1183: ispravak traži zauzeće preko reservationId, a bez rezultata može stvoriti novo aktivno zauzeće za svaki completed nalog s odabranom zonom. Ne razlikuje operaciju spuštanja niti obrađuje njezin returnReservationId. Normalno zaključenje spuštanja upravo tim drugim poljem zatvara postojeći boravak, retci 578–593.

**Utjecaj:** ispravak vremena naloga spuštanja može ostaviti stari datum završetka boravka. Ako taj nalog nosi zonu, može stvoriti i novi aktivni zapis kao da se plovilo vratilo na kopno. Izolirani pokus potvrdio je insert za nalog quotaOperationType = lower.

**Preporuka:** ispravak mora slijediti vrstu operacije i obje veze boravka. Vađenje mijenja dolazak, spuštanje završetak, premještaj segment lokacije, a „samo dizalica” ne stvara boravak. Provjeriti i sve kasnije povezane događaje.

### G-21 — Ispravak nepromijenjene napomene može promijeniti datum dolaska

**Ozbiljnost:** visoko. **Status:** reproducirano izolirano.

**Dokaz:** [server/services/workOrderService.ts:1169](../../server/services/workOrderService.ts#L1169), redak 1169, bezuvjetno postavlja liftedAt na završetak/početak naloga kad postoji povezano zauzeće. Pokus s izmjenom samo operatorNotes promijenio je postojeći dolazak iz studenoga 2025. u siječanj 2026.

**Utjecaj:** ranije ispravljen stvarni datum dolaska iz stare evidencije može biti prepisan kasnijom nepovezanom izmjenom naloga. To mijenja broj dana i podlogu naplate.

**Preporuka:** mijenjati samo izričito odabrane atribute. Ako postoje dva različita datuma s razlogom, prikazati konflikt i tražiti odluku treba li uskladiti nalog, stvarni dolazak ili oba. „Spremi napomenu” ne smije implicitno mijenjati boravak.

### G-22 — Zaštita izdanih dokumenata pokriva samo dio ispravaka

**Ozbiljnost:** visoko. **Status:** statički provjereno; preskakanje provjere pri promjeni datuma reproducirano izolirano.

**Dokaz:** [server/services/workOrderService.ts:740](../../server/services/workOrderService.ts#L740), retci 740–766: provjera računa postoji u reverse helperu, a adminCorrect ga poziva samo u uvjetu 989–990. [server/workOrders.router.ts:853](../../server/workOrders.router.ts#L853) povezuje jedinstveni račun samo s returnReservationId ili reservationId, iako stavke resursa mogu doći s oba naloga, retci 794–817. [server/routers.ts:5762](../../server/routers.ts#L5762), retci 5762–5837, mijenja dolazak bez provjere izdanih dokumenata.

**Utjecaj:** promjena datuma ili kopna može promijeniti podlogu obračuna nakon izdavanja dokumenta. Ispravak ulaznog naloga ciklusa ne mora naći račun vezan uz izlazni nalog. Zaštita nije potpuna samo zato što se jedan tip promjene zaustavlja. Helper provjerava erpStatus = synced, ali shema navodi i invoiced / processed_in_membership_renewal (retci 754–766 i schema.ts:812); uporabu svih tih statusa treba uskladiti.

**Preporuka:** eksplicitno povezati dokument sa svim uključenim nalozima, boravkom i potrošnjom. Svaka materijalna promjena najprije prikazuje financijski učinak. Za izdan dokument koristiti odobreni postupak storna/ispravka i novu verziju; ne oslanjati se na poruku koja sugerira brisanje računa.

### G-23 — Implementirana pravila prava i 30 dana razlikuju se od opisanog modela

**Ozbiljnost:** visoko. **Status:** statički provjereno; konačno pravilo zahtijeva potvrdu naručitelja.

**Dokaz:** [server/services/statutoryQuotaService.ts:81](../../server/services/statutoryQuotaService.ts#L81), retci 81–107 i 120–131, dodjeljuje prava s istekom 31. 12. sljedeće godine te nepostojeći zapis članstva tretira kao dopuštenje dodjele. Postojeći test [server/statutoryQuota.test.ts:400](../../server/statutoryQuota.test.ts#L400) izričito očekuje dvogodišnju valjanost. [server/workOrders.router.ts:682](../../server/workOrders.router.ts#L682) oduzima 30 dana prema kategoriji member, bez veze s godišnjim pravom ili konkretnim besplatnim ciklusom.

**Utjecaj:** činjenica da se članarina plaća po kalendarskoj godini još ne odgovara na pitanje smije li neiskorištena operacija vrijediti do kraja sljedeće godine. Kod trenutačno provodi upravo takav prijenos. Osim toga, samo member status nije dokaz prava na novi besplatni boravak nakon dolaska kamionom ili ponovnog otvaranja zauzeća.

**Preporuka:** potvrditi postoji li stvarno dvogodišnji prijenos prava i tko autoritativno potvrđuje uplatu po godini. Formalizirati jednu dodjelu prava i jedan pripadajući boravak; dokumenti i AI ne dodjeljuju pravo neovisno o toj evidenciji. Nepoznatu uplatu ne prikazivati kao provjereno plaćenu.

### G-24 — Revizijski zapis nije atomski s ispravkom i nije potpun

**Ozbiljnost:** srednje. **Status:** statički provjereno.

**Dokaz:** [server/services/workOrderService.ts:1208](../../server/services/workOrderService.ts#L1208), retci 1208–1216: audit se zapisuje nakon dovršene transakcije. Before/after u retcima 1190–1206 ne sadrži sve promjene mjesta, napomena i financijskih učinaka. [server/routers.ts:5777](../../server/routers.ts#L5777), retci 5777–5834: adminUpdate odvojeno čita, mijenja i zapisuje audit, bez transakcije/zaključavanja ili provjere verzije. AdminDelete fizički briše red prije audita, retci 5860–5875; snapshot ne sadrži npr. oba datuma i sve veze. [server/db.ts:720](../../server/db.ts#L720) potvrđuje da createAuditEntry koristi vlastiti pristup bazi.

**Utjecaj:** audit može izostati nakon već spremljene promjene; dvije administratorske izmjene mogu prepisati jedna drugu. Kod brisanja se gubi dio podloge ako se naknadno želi rekonstruirati stanje. FK može spriječiti neka brisanja, ali nije postupak storna niti revizijska evidencija.

**Preporuka:** poslovna promjena i prije/poslije audit u istoj transakciji; provjera očekivane verzije zapisa. Bilježiti sve promijenjene podatke, veze i financijske učinke. Za već korištene boravke preferirati označavanje pogrešnog zapisa i zamjenski zapis, uz očuvane veze.

### G-25 — „Incident” i „nema evidencije” trebaju preciznije značenje

**Ozbiljnost:** srednje. **Status:** statički provjereno.

**Dokaz:** [server/services/voiceCommandService.ts:31](../../server/services/voiceCommandService.ts#L31), retci 31–40, ne sadrži posebnu akciju stvaranja incidenta; update_work_order_notes traži postojeći zadatak, retci 963–981. Retci 1108–1110 iz nepostojanja currentZoneCode izvode poruku „U moru (nije evidentirano na suhom vezu)”.

**Utjecaj:** obavijest vlasniku i bilješka/zaduženje nisu zaseban incident sa statusom rješavanja. U fazi postupnog uvođenja evidencije plovilo bez zapisa o suhom vezu ne mora biti u moru.

**Preporuka:** podržati terenski događaj/incident i bez rezervacije, s plovilom, opisom, odgovornom osobom i statusom. Lokaciju prikazivati kao „Nema evidentiranog boravka na kopnu” kada nije potvrđena; ne pretvarati nedostatak podatka u fizičku činjenicu.

## 10. Kako oblikovati administratorske ispravke

Postojeća mogućnost je potrebna i korisna: ispravak pogrešno odabranog vlasnika/plovila, stvarnog datuma i mjesta treba ostati dostupan administratoru. Pozitivni su adminProcedure, obvezan razlog i postojeći rollback koji prije brisanja ulaznog zauzeća provjerava je li plovilo već spušteno ([server/workOrders.router.ts:940](../../server/workOrders.router.ts#L940), retci 940–978; [server/services/workOrderService.ts:846](../../server/services/workOrderService.ts#L846), retci 846–878). Ne treba uvoditi paralelan AI put za iste promjene.

Predlažem tri jasno odvojene namjere:

1. **Ispravak evidencije:** pogrešno upisan datum ili mjesto; fizički događaj se nije dogodio sada. Zadržava se identitet boravka.
2. **Stvarni premještaj:** plovilo se premješta danas; zapisuje se promjena lokacije, ali ostaje izvorni datum dolaska i isti paket prava.
3. **Poništenje operacije:** pogrešno je evidentirano da je operacija izvedena; poništava se konkretan događaj i njegovi učinci, uz provjeru kasnijih događaja i izdanih dokumenata.

### Predloženi postupak

- Administrator odabire namjeru i zapis, a sustav učitava očekivanu verziju.
- Prikazuje se pregled prije/poslije: nalog, plovilo i korisnik, vrsta operacije, stvarni datumi, boravak, zona/mjesto, godina i stanje prava, karton i povezani dokumenti.
- Servis računa posljedice i označava zapreke prije spremanja. Primjer: „Promjena datuma mijenja broj naplatnih dana s 8 na 12.”
- Administrator unosi razlog. Za promjenu ugovaratelja i plovila provjeriti dopušteni poslovni odnos; UI trenutačno resetira izbor plovila pri promjeni korisnika, a prazan odabir šalje kao undefined, što backend tumači kao zadržavanje starog plovila ([client/src/pages/admin/AdminWorkOrders.tsx:678](../../client/src/pages/admin/AdminWorkOrders.tsx#L678), retci 678–683 i 829–839; workOrderService.ts:962–979). To treba učiniti izričitim, a ne implicitnim.
- Jedna transakcija provjerava zaključavanja/verzije, provodi promjene i sprema audit. Vanjsko slanje ide naknadno kroz red poslova.
- Osvježavaju se svi povezani prikazi: karton i prava starog/novog korisnika, nalog, kalendar, detalj boravka, mjesta i sažetak obračuna.

Predložene servisne granice: previewCorrection, applyCorrection, relocateVessel i reverseOperation. To su nazivi arhitektonskog prijedloga, ne postojeći API-ji. Dio provjera može se izdvojiti iz postojećih workOrderService i landFlow servisa, ali ne treba pretpostaviti da postojeća planirana alokacija već rješava sve provjere fizičkog boravka.

Gemini može pripremiti nacrt: „Za RN-… ispravi godinu dolaska na 2025., zadrži boravak i mjesto.” Nakon toga vrijedi isti pregled posljedica i administratorska potvrda kao u klasičnom obrascu. Glasovni operator ne dobiva administratorske ispravke samo zato što je prepoznao takvu rečenicu.

## 11. Scenariji koje treba obuhvatiti prije širenja

| Scenarij | Očekivano ponašanje | Današnji dokaz / nalaz |
| --- | --- | --- |
| Unos plovila koje je već na kopnu od 2025. | Početno stanje s izvorom, poznatim/nepoznatim datumom i odvojeno poznatim/nepoznatim korištenjem prava | Sam admin ispravak datuma nije dokaz prethodnog korištenja dizalice; G-17, G-18, G-23 |
| Premještaj iz zone A u B nakon 25 dana | Isti boravak i ista potrošnja dana; nova lokacija | Glasovni tok otvara novi dolazak; G-14 |
| Ispravak pogrešne godine naloga | Usklađeni datum operacije, godina prava, karton i boravak | Datum se mijenja bez ponovnog izračuna prava; G-17 |
| Ispravak dolaska, pa kasnija dopuna napomene na nalogu | Ispravljeni dolazak ostaje sačuvan | Nalog može prepisati liftedAt; G-21 |
| Ispravak vremena spuštanja | Mijenja se kraj pripadajućeg boravka; plovilo ostaje izvan kopna | Nepotpuna obrada returnReservationId, moguće novo zauzeće; G-20 |
| Ispravak zone/mjesta | zoneId, spotNumber i spotId opisuju isto mjesto; provjerena dostupnost | Putevi imaju različito ponašanje; G-19 |
| Ispravak nakon već izdanog jedinstvenog računa | Kontrolirani računovodstveni ispravak svih uključenih događaja | Provjera samo dijela veza i vrsta promjene; G-22 |
| Ponavljanje nakon prekida mobilne mreže | Ranije izvršena akcija vraća isti rezultat bez novog učinka | Ponovno zaduženje reproducirano; G-12 |
| „Javi vlasniku”, ali nema kontakta ili servis ne radi | Jasna pogreška / čekanje dostave | Trenutačno moguć lažni uspjeh; G-16 |
| Dva administratora ispravljaju isti zapis | Drugi dobiva konflikt i osvježava stanje | Za adminUpdate nema provjere verzije; G-24 |

Za početno stanje preporučujem sačuvati razliku između **nepoznato**, **poznato nije iskorišteno** i **poznato iskorišteno**. Uvoz ili OCR ne smije pretvoriti nepoznato korištenje benefita u novo raspoloživo pravo. Potrebna je odluka na temelju stare evidencije, ne zaključak jezičnog modela.

## 12. Provedene provjere i praktična ograničenja

- Postojeći testovi pokrenuti su naredbom: node_modules/.bin/vitest run server/voiceCommand.test.ts server/domainServices.test.ts. Rezultat: **2 datoteke, 13/13 testova prolazi**; trajanje 2,01 s.
- Osam dodatnih izoliranih scenarija pokrenuto je privremenom Vitest konfiguracijom iz /tmp/crane-review-9ffb1f4/. Rezultat: **8/8 provjera prolazi**, 1,34 s. To znači da su potvrđeni opisani sadašnji problemi, a ne da su ispravljeni.
- Scenariji su pozivali stvarne adminCorrectCompletedWorkOrder, executeConfirmedVoiceActions i resolveVoiceActionsAgainstContext, uz mock pristupa bazi, slanja poruka i dispatch integracije. Provjereni su: promjena godine bez ponovnog izračuna i bez provjere postojećeg računa, stari spotId nakon ispravka, novo zauzeće nakon ispravka spuštanja, prepisivanje dolaska promjenom napomene, dvostruki insert zaduženja i gubitak numeričke količine, prvo podudaranje kod više plovila, restart boravka pri glasovnom premještaju bez transakcije te lažni uspjeh obavijesti bez primatelja.
- Procesi testova dobili su novi minimalni skup varijabli: prazni DATABASE_URL, DOTENV_CONFIG_PATH = /dev/null i sintetičke JWT ključeve. Nisu korištene stvarne .env vrijednosti niti su pokrenuti server, migracije, skripte za ispravak produkcijskih podataka ili pozivi Gemini API-ju.
- Lokalni psql i initdb nisu pronađeni pri provjeri naredbom command -v. PostgreSQL instanca nije podignuta za ovu dopunu. Integracijski paket statutoryQuota.test.ts nije pokretan: njegov beforeAll traži bazu i upisuje fixture podatke. SQL constrainti, stvarna zaključavanja i puni obračun ostaju neprovjereni.
- Nisu mijenjani izvorni testovi. Privremene reprodukcije su dijagnostički pokusi izvan repozitorija; njihove rezultate ne treba tumačiti kao trajno dodane regresijske testove.
- Nisu pokretani build, instalacija ovisnosti ni cjeloviti testni paket; ciljani prolaz ne potvrđuje njihovu ispravnost. Nije provjerena objavljena instanca, stvarna kvaliteta prepoznavanja glasa ni dostupnost modela s produkcijskim računom.
- Službena dokumentacija dodatno je provjerena za Interactions API i modele [S8, S9]. Kod slanja konteksta obuhvaća stvarna imena vlasnika i podatke o zadacima (voiceCommandService.ts:1175–1195), pa više ne vrijedi pretpostavka da se AI-ju šalje samo shema.


## 13. Plan i kriteriji uspjeha

| Korak | Opseg | Relativni trud | Kriterij završetka |
| --- | --- | --- | --- |
| 0 | Učvršćivanje postojeće točke 4 i administratorskih ispravaka: G-11 do G-24 | M–L | Jedinstvena pravila boravka/mjesta, financijske provjere, kontrola prava i zaštita ponavljanja; bez implicitnih promjena pri ispravku |
| 1 | Pilot očitanja jedne vrste dokumenta, preporučeno police ili plovidbene dozvole | M | Označeni testni primjeri, usporedni pregled i potvrda; nema automatskog prepisivanja važnih podataka |
| 2 | Evidencija dokumenata i pravila valjanosti za definirano razdoblje | M–L | Rubni slučajevi dokumentirani, odluke objašnjive, prava članstva ostaju konzistentna |
| 3 | Višejezični nacrti za dvije postojeće vrste obavijesti | S–M | Činjenice i iznosi ostaju točni; odobren ton, evidentiran jezik i bez dvostrukog slanja |
| 4 | Tri do pet najčešćih pretraga prirodnim jezikom | M | Isti rezultat kao provjereni klasični filtri; nema pristupa nedopuštenim poljima |
| 5 | Postupno širenje prema izmjerenoj koristi | Ovisi o pilotu | Mjerljivo manje rada i prihvatljiva stopa pogrešaka uz kontroliran trošak |

Procjene su relativne: S = lokalizirana nadogradnja, M = više povezanih komponenti, L = značajniji podatkovni i poslovni zahvat. Nisu obećanje rokova; procjena se odnosi na pregledani commit, bez potvrde stanja objavljene instance.

Unutar koraka 0 preporučeni je redoslijed:

1. **Konzistentnost boravka i mjesta:** G-14, G-19, G-20 i G-21. Zaštititi izvorni dolazak, ispravno razlikovati spuštanje/premještaj i uskladiti identitet mjesta.
2. **Financijska sigurnost i ponavljanje:** G-11, G-12, G-13 i G-22. Izvršavati provjerene planove, spriječiti dvostruke učinke, strukturirati potrošnju i provjeravati sve povezane dokumente.
3. **Godišnja evidencija prava:** G-17, G-18 i G-23. Prvo potvrditi pravilo prijenosa, zatim uvesti pouzdanu povijesnu evidenciju i obračun ispravaka.
4. **Operativna pouzdanost i sljedivost:** G-15, G-16, G-24 i G-25. Razriješiti više kandidata, status dostave, atomski audit i stvarni status lokacije/incidenta.

To su razvojne preporuke, ne izmjene provedene ovim zadatkom. Procjena dovršetka zahtijeva dogovor o opsegu, potvrdu poslovnih pravila i regresijske testove na izoliranoj lokalnoj bazi.

Mjeriti točnost svakog ključnog polja, broj pogrešno prihvaćenih dokumenata, udio ručnih ispravaka, ukupno vrijeme unosa s pregledom, p50/p95 trajanje obrade i trošak po potvrđenom dokumentu. Za financijske radnje i komunikaciju provjeriti ponavljanje zahtjeva, djelomične pogreške i prekid AI servisa. Prije uvođenja AI-ja u postojeći postupak izmjeriti početno stanje.

## 14. Otvorena pitanja i ograničenja

1. Treba li svaki operator smjeti zaduživati sve korisnike i mijenjati sve lokacije ili postoje ograničenja po dizalicama/područjima rada?
2. Koristi li produkcija potvrđeni izravni Google tok ili posrednika, s kojim ugovorom i podržanim mogućnostima API-ja?
3. Koji je autoritativni izvor uplate članarine po godini i kako se priznaju podaci iz starog sustava?
4. Je li dvogodišnja valjanost prava u kodu i testovima namjerna, iako se članarina plaća za kalendarsku godinu? Kako se boravak povezuje s pravom pri prijelazu godine?
5. Koje vrste dokumenata, jezici i statusi vlasništva stvarno čine većinu unosa?
6. Koje dokaze lučica prihvaća za pravo na povlaštenu tarifu i tko smije odlučivati u dvojbenim slučajevima?
7. Koje komunikacijske kanale korisnici već koriste i postoji li dopuštenje za konkretne vrste poruka?

Nisu korištene stvarne .env vrijednosti, produkcijska ili udaljena baza niti osobni dokumenti. Nije proveden pokus točnosti/latencije Gemini modela niti end-to-end provjera točke 4. Ciljani testovi i izolirane reprodukcije opisani su u odjeljku 12; ne predstavljaju prolaz cijelog sustava. Raniji AUDIT_REPORT.md nije dostupan u ovom checkoutu, pa se zaključci oslanjaju izravno na gore navedeni kod i dokumentaciju.

## 15. Izvori

Svim vanjskim izvorima pristupljeno 13. 11. 2026. URL-ovi ai.google.dev pri pristupu preusmjereni su na službenu dokumentaciju aistudio.google.com.

- **[S1] Structured Outputs:** https://aistudio.google.com/docs/structured-output — strukturirani izlaz, podržani podskup shema i potreba za provjerom semantičke ispravnosti u aplikaciji.
- **[S2] Document processing:** https://aistudio.google.com/docs/document-processing — obrada dokumenata/PDF-a; podrška konkretne posredničke usluge mora se zasebno potvrditi.
- **[S3] Function calling:** https://aistudio.google.com/docs/function-calling — model predlaže poziv alata; izvršavanje i kontrola ostaju odgovornost aplikacije.
- **[S4] Files API:** https://aistudio.google.com/docs/files — pohrana datoteka, automatsko i ručno brisanje.
- **[S5] Gemini API Additional Terms:** https://aistudio.google.com/docs/terms — Paid Services, regionalna pravila i uporaba podataka. Izvorno provjereno preko https://ai.google.dev/gemini-api/terms.
- **[S6] Google Cloud, Zero data retention:** https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention — uvjeti i iznimke retencije; službena poveznica https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance preusmjerila je na ovu stranicu.
- **[S7] PostgreSQL, SET TRANSACTION:** https://www.postgresql.org/docs/current/sql-set-transaction.html — granice read-only transakcija.
- **[S8] Interactions API overview:** https://aistudio.google.com/docs/interactions-overview — potvrđen API, store: false, kontekst i retencija. Pristupljeno 13. 11. 2026. preko https://ai.google.dev/gemini-api/docs/interactions.
- **[S9] Gemini models:** https://aistudio.google.com/docs/models — potvrđeni nazivi Gemini 3.5 Flash-Lite i Gemini 3.1 Flash-Lite u službenom katalogu. Pristupljeno 13. 11. 2026. preko https://ai.google.dev/gemini-api/docs/models. Katalog ne potvrđuje dozvole konkretnog produkcijskog računa ni podršku posrednika.

Izvori potvrđuju mogućnosti i ograničenja tehnologije. Preporučeni poslovni tokovi i redoslijed uvođenja predstavljaju arhitektonsku procjenu za ovu aplikaciju, a ne jamstvo pružatelja modela.

