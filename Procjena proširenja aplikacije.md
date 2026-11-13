# Procjena proširenja aplikacije funkcionalnostima Gemini API-ja

Datum: 13. 11. 2026.  
Analizirani commit: 31b5640ca137c7a527e93b293a8b742192761d4a.  
Vrsta rada: analiza izvornog koda i službene dokumentacije; bez izmjena aplikacije i bez pozivanja modela stvarnim dokumentima.

## 1. Mišljenje i prioriteti

Najveću neposrednu vrijednost imaju zajednički sustav očitanja i evidencije dokumenata (točke 1 i 5), a zatim priprema višejezičnih obavijesti (točka 2). Upite prirodnim jezikom treba uvesti preko unaprijed definiranih pretraga, umjesto izvršavanja proizvoljnog SQL-a koji napiše model. Točku 4 prihvaćamo kao implementiranu prema informaciji naručitelja; njezin stvarni produkcijski tok nije potvrđen u dostupnoj verziji koda.

Temeljna granica odgovornosti: Gemini predlaže podatke, tekst ili namjeru radnje; backend provjerava ovlasti, činjenice, poslovna pravila i provodi radnju. Model ne odlučuje o novcu, stečenim pravima niti vjerodostojnosti dokumenta.

| Funkcionalnost | Procjena vrijednosti | Preporučeni oblik | Prioritet |
| --- | --- | --- | --- |
| 1. Očitanje dokumenata | Visoka: smanjuje prepisivanje i ubrzava registraciju | Prijedlog unosa uz izvornik i potvrdu djelatnika | Prvo |
| 2. Višejezične obavijesti | Visoka: standardizira komunikaciju | Jezični nacrt iz provjerenih činjenica; iznosi i računi iz backend sustava | Drugo |
| 3. Pitaj bazu | Korisno nakon uređenja podataka | Model bira dopuštenu pretragu i filtre; backend sastavlja upit | Treće |
| 4. Terenski zapisnik | Visoka operativna vrijednost | Provjeriti potvrđivanje financijskih radnji, ovlasti i ponavljanje zahtjeva | Prije širenja automatizacije |
| 5. Provjera dokumenata | Visoka uz točku 1 | Odvojiti očitanje, provjeru pravila i potvrdu vjerodostojnosti | Zajedno s točkom 1 |

Ovo su procjene potencijala, a ne izmjereni poslovni učinci. Nisu potvrđene tvrdnje o unosu u tri sekunde, uklanjanju svih pogrešaka niti točnosti modela na dokumentima lučice.

## 2. Što je utvrđeno u dostupnom kodu

| ID | Provjereni dokaz | Značenje za prijedloge |
| --- | --- | --- |
| G-01 | [server/_core/llm.ts:212](../../server/_core/llm.ts#L212), retci 212–215 i 282–284: /v1/chat/completions preko konfiguriranog posrednika, zadano forge.manus.im; naziv modela gemini-2.5-flash | Postoji LLM helper, ali ovo nije dokaz izravnog povezivanja s Google Gemini API-jem. Treba provjeriti podršku posrednika za PDF, JSON sheme i alate te njegov ugovor o obradi podataka. |
| G-02 | [server/_core/llm.ts:304](../../server/_core/llm.ts#L304), retci 304–331: prosljeđivanje response_format, fetch i TypeScript cast odgovora | Helper nema provjeru poslovnih vrijednosti odgovora. U prikazanom fetch pozivu nije postavljen timeout. TypeScript cast ne validira rezultat u izvršavanju. |
| G-03 | [drizzle/schema.ts:164](../../drizzle/schema.ts#L164), retci 164–175: plovilo ima vlasnika, registraciju i dimenzije | Postoji dobar početak za očitanje. U pregledanoj shemi nisam našao evidenciju polica s datumom isteka, registra priloženih dokumenata ni snage motora. To zahtijeva zaseban dizajn, a ne samo AI obrazac. |
| G-04 | [shared/oib.ts:12](../../shared/oib.ts#L12), retci 12–23: provjera OIB kontrolne znamenke | Ponovno iskoristiti validator nakon očitanja. Matematički valjan OIB nije dokaz da pripada osobi s dokumenta. |
| G-05 | [drizzle/schema.ts:914](../../drizzle/schema.ts#L914), retci 914–932: activeMember i uvezeni klupski podaci; [drizzle/schema.ts:1154](../../drizzle/schema.ts#L1154), retci 1154–1165: vrsta i plaćenost računa | Aktivno članstvo i plaćenost računa nisu sami po sebi jednoznačna evidencija prava i uplate članarine za određenu kalendarsku godinu. U pregledanim strukturama nema eksplicitne veze članstvo–godina–uplata. |
| G-06 | [server/invoices.router.ts:202](../../server/invoices.router.ts#L202), retci 202–218: odabir i poziv eRacuni createSalesOrder / createSalesInvoice | Zadržati postojeći sustav izdavanja dokumenata. Jezični model ne smije postati paralelni izvor obračuna i brojeva računa. |
| G-07 | [client/src/contexts/LangContext.tsx:6](../../client/src/contexts/LangContext.tsx#L6), retci 6 i 21–28; [server/_core/email.ts:103](../../server/_core/email.ts#L103), retci 103–111 | Pregledani jezični kontekst i primjer poruke podržavaju HR/EN; izbor sučelja čuva se u pregledniku. Za DE/IT/SL komunikaciju potreban je trajni podatak o željenom jeziku primatelja i proširenje tokova slanja. |
| G-08 | [server/jobs/queue.ts:10](../../server/jobs/queue.ts#L10), retci 10–16: redovi e-pošte, SMS-a i podsjetnika preko pg-boss | Postoji infrastruktura na kojoj se može izgraditi obrada dokumenata i priprema obavijesti u pozadini. |
| G-09 | [server/routes/mobileApi.ts:37](../../server/routes/mobileApi.ts#L37), retci 37–51: provjera potpisa tokena, preuzimanje role iz payloada, zadana uloga operator | U prikazanom middlewareu nema provjere da je korisnik i dalje aktivan i ovlašten operator; nedostajuća uloga postaje operator. Ako AI radnje prolaze ovim putem, treba provjeriti i zatvoriti tu granicu prije automatskih financijskih radnji. Doseg iskorištavanja nije dinamički testiran. |
| G-10 | [drizzle/schema.ts:71](../../drizzle/schema.ts#L71), retci 71–100: korisnički podaci uključuju passwordHash, jmbgHash i pinCode | Modelu za pretraživanje dati uski poslovni rječnik dopuštenih polja, a ne cijelu fizičku shemu ili korisničke retke. Nisu čitane ni ispisivane stvarne vrijednosti. |

Pretragom izvoznika invokeLLM i transcribeAudio te njihovih referenci nisam pronašao produkcijski tok koji potvrđuje cijeli opis točke 4. Dostupan helper ili demonstracijska komponenta nisu dokaz da tok nije implementiran u drugoj grani ili objavljenoj verziji. Za ocjenu te implementacije potreban je odgovarajući commit.

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

Backend izračunava stavke, poreze, popuste, saldo i rokove te određuje vrstu poruke. Gemini priprema pozdrav, objašnjenje i prijevod. Završni prikaz iznosa, broja računa, datuma, IBAN-a i poveznice za plaćanje sastavlja aplikacija iz provjerenih podataka.

Preporučujem nekoliko odobrenih obitelji predložaka: obavijest, podsjetnik, opomena i sažetak usluge. Model može pomoći u izradi i prevođenju predložaka ili pripremiti pojedinačan nacrt. Nije potrebno za svaku standardnu poruku ponovno generirati cijeli tekst. Predlošci olakšavaju provjeru tona i pravnih formulacija te ostaju dostupni kada AI servis ne radi.

Primjer popusta od 15% iz prijedloga nije potvrđeno poslovno pravilo aplikacije. Model ne smije iz opisa članstva izvoditi taj popust. Izdavanje računa treba ostati u postojećoj integraciji eRacuni (G-06).

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

Ne predlaže se ponovna implementacija. Za postojeći tok preporučujem provjeriti sljedeće slučajeve:

- Registracija nije prepoznata, postoji više kandidata ili je diktat pogrešno prepisan: ponuditi izbor i ne vezati radnju automatski uz prvo plovilo.
- „Treba naplatiti” nije isto što i „naplaćeno”; „provjeriti treba li dva dana struje” nije nalog za naplatu.
- „Dva dana struje” mora proći postojeći cjenik i pravila usluge. Model ne računa cijenu niti pretpostavlja da postoji otvoreni račun koji se smije mijenjati.
- Ako je račun već izdan ili zaključen, ne mijenjati ga proizvoljno; radnja ide u odobreni postojeći računovodstveni postupak.
- Jedan zapisnik s tri radnje mora imati vidljiv status svake radnje. Ne prikazivati sve kao uspješno ako je incident spremljen, a slanje obavijesti nije uspjelo.
- Ponovljena sinkronizacija mobilnog uređaja, retry ili dvostruki klik ne smiju stvoriti dvije naplatne stavke.
- Korisnik mora imati stvarnu ovlast za svaku radnju; ovlast za zapis incidenta ne podrazumijeva ovlast za naplatu. Posebno provjeriti G-09.

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

Dokumenti sadrže osobne i financijske podatke. Prije produkcije razjasniti stvarni tok obrade: Coolify aplikacija → eventualni posrednik → Google, odgovornosti svakog obrađivača, lokacije obrade, ugovor i rokove čuvanja.

Aktualni Google uvjeti traže Paid Services za API klijente dostupne korisnicima u EGP-u, Švicarskoj i Ujedinjenom Kraljevstvu. Za Paid Services navode da se promptovi i odgovori ne koriste za poboljšanje proizvoda, ali opisuju ograničeno sigurnosno zapisivanje i moguću privremenu pohranu u zemljama u kojima Google ili njegovi agenti imaju kapacitete [S5]. Uvjeti sadrže i poseban režim uporabe podataka za korisnike iz EGP-a/Švicarske/UK-a; nije točno paušalno tvrditi da se svaki besplatni zahtjev koristi za treniranje.

To nije dokaz da je postojeći posrednik ugovorno pokriven istim uvjetima niti jamstvo pohrane samo u EU. Cloud varijantu treba usporediti prema stvarnim potrebama i uvjetima; ni ona ne znači automatski nultu retenciju [S6].

Files API navodi automatsko brisanje datoteka nakon 48 sati i mogućnost ranijeg brisanja [S4]. Taj podatak nije rok čuvanja svih promptova, logova, sigurnosnih kopija ili podataka kod posrednika. Pravila retencije trebaju pokriti svaki sloj.

Ne uvoditi novu biblioteku samo radi ovih prijedloga dok se ne provjere održavanje i uvjeti licence. Vlastiti kod aplikacije može ostati proprietary; to ne ukida obveze prema licencama odabranih ovisnosti.

## 9. Plan i kriteriji uspjeha

| Korak | Opseg | Relativni trud | Kriterij završetka |
| --- | --- | --- | --- |
| 0 | Provjera stvarno objavljene točke 4, ovlasti i pružatelja LLM usluge | S–M | Poznat commit i tok podataka; financijske akcije dostupne samo ovlaštenima |
| 1 | Pilot očitanja jedne vrste dokumenta, preporučeno police ili plovidbene dozvole | M | Označeni testni primjeri, usporedni pregled i potvrda; nema automatskog prepisivanja važnih podataka |
| 2 | Evidencija dokumenata i pravila valjanosti za definirano razdoblje | M–L | Rubni slučajevi dokumentirani, odluke objašnjive, prava članstva ostaju konzistentna |
| 3 | Višejezični nacrti za dvije postojeće vrste obavijesti | S–M | Činjenice i iznosi ostaju točni; odobren ton, evidentiran jezik i bez dvostrukog slanja |
| 4 | Tri do pet najčešćih pretraga prirodnim jezikom | M | Isti rezultat kao provjereni klasični filtri; nema pristupa nedopuštenim poljima |
| 5 | Postupno širenje prema izmjerenoj koristi | Ovisi o pilotu | Mjerljivo manje rada i prihvatljiva stopa pogrešaka uz kontroliran trošak |

Procjene su relativne: S = lokalizirana nadogradnja, M = više povezanih komponenti, L = značajniji podatkovni i poslovni zahvat. Nisu obećanje rokova bez uvida u noviju implementaciju.

Mjeriti točnost svakog ključnog polja, broj pogrešno prihvaćenih dokumenata, udio ručnih ispravaka, ukupno vrijeme unosa s pregledom, p50/p95 trajanje obrade i trošak po potvrđenom dokumentu. Za financijske radnje i komunikaciju provjeriti ponavljanje zahtjeva, djelomične pogreške i prekid AI servisa. Prije uvođenja AI-ja u postojeći postupak izmjeriti početno stanje.

## 10. Otvorena pitanja i ograničenja

1. Koji commit sadrži dovršenu točku 4 i prolazi li kroz prikazani mobilni middleware?
2. Koristi li produkcija Google izravno ili posrednika, s kojim ugovorom i podržanim mogućnostima API-ja?
3. Koji je autoritativni izvor uplate članarine po godini i kako se priznaju podaci iz starog sustava?
4. Kako se prava vađenja, boravka i spuštanja vode kada boravak prelazi 31. prosinca?
5. Koje vrste dokumenata, jezici i statusi vlasništva stvarno čine većinu unosa?
6. Koje dokaze lučica prihvaća za pravo na povlaštenu tarifu i tko smije odlučivati u dvojbenim slučajevima?
7. Koje komunikacijske kanale korisnici već koriste i postoji li dopuštenje za konkretne vrste poruka?

Nisu korištene stvarne .env vrijednosti, produkcijska ili udaljena baza niti osobni dokumenti. Nije proveden pokus točnosti/latencije Gemini modela niti end-to-end provjera točke 4. Build i testovi nisu pokretani jer nisu mijenjani aplikacija ni ovisnosti; ovaj dokument ne predstavlja potvrdu da oni prolaze. Raniji AUDIT_REPORT.md nije dostupan u ovom checkoutu, pa se zaključci oslanjaju izravno na gore navedeni kod i dokumentaciju.

## 11. Izvori

Svim vanjskim izvorima pristupljeno 13. 11. 2026. URL-ovi ai.google.dev pri pristupu preusmjereni su na službenu dokumentaciju aistudio.google.com.

- **[S1] Structured Outputs:** https://aistudio.google.com/docs/structured-output — strukturirani izlaz, podržani podskup shema i potreba za provjerom semantičke ispravnosti u aplikaciji.
- **[S2] Document processing:** https://aistudio.google.com/docs/document-processing — obrada dokumenata/PDF-a; podrška konkretne posredničke usluge mora se zasebno potvrditi.
- **[S3] Function calling:** https://aistudio.google.com/docs/function-calling — model predlaže poziv alata; izvršavanje i kontrola ostaju odgovornost aplikacije.
- **[S4] Files API:** https://aistudio.google.com/docs/files — pohrana datoteka, automatsko i ručno brisanje.
- **[S5] Gemini API Additional Terms:** https://aistudio.google.com/docs/terms — Paid Services, regionalna pravila i uporaba podataka. Izvorno provjereno preko https://ai.google.dev/gemini-api/terms.
- **[S6] Google Cloud, Zero data retention:** https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention — uvjeti i iznimke retencije; službena poveznica https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance preusmjerila je na ovu stranicu.
- **[S7] PostgreSQL, SET TRANSACTION:** https://www.postgresql.org/docs/current/sql-set-transaction.html — granice read-only transakcija.

Izvori potvrđuju mogućnosti i ograničenja tehnologije. Preporučeni poslovni tokovi i redoslijed uvođenja predstavljaju arhitektonsku procjenu za ovu aplikaciju, a ne jamstvo pružatelja modela.

