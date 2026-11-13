# Recenzija plana modula „Dokumenti, OCR i usklađenost”

Datum: 13. 11. 2026.  
Analizirani kod: 9ffb1f4a9e797950a621fba576403927a708e7eb.  
Ulaz: tehnički prijedlog naručitelja iz razgovora, točke 1–4, označen kao [P].  
Povezana analiza: [Gemini funkcionalnosti](GEMINI_FEATURE_ASSESSMENT.md).

## 1. Zaključak

Prijedlog je izvediv i slijedi preporučeno razdvajanje očitanja, poslovnih pravila i ljudske potvrde. Zadržao bih zasebne sheme, privatnu pohranu, izvornik uz formu i zabranu automatske promjene članskih prava. Za produkcijsku specifikaciju nedostaju precizne ovlasti potvrde, odvojeno stanje prihvaćanja i primjene, kontrola ponavljanja i konkurentnih izmjena te povijest osiguranja. Predloženi sinkroni upload do 10 MB može biti prihvatljiv za ograničeni pilot; nije dokaz da zahtjev neće prijeći 20 sekundi niti razlog da se obrada mora obavljati unutar jedne HTTP veze.

Ovaj dokument ocjenjuje plan, a ne tvrdi da je modul implementiran ili da su opisani rizici već nastali u produkciji. U nastavku su postojeće činjenice iz koda odvojene od nedostataka specifikacije.

| Dio prijedloga | Ocjena prijedloga |
| --- | --- |
| Odvojene JSON sheme i null za nečitko | Zadržati; dopuniti validacijom značenja, jedinica i dokaza |
| enginePowerKw na plovilu | Prihvatljivo uz preciznost, jedinicu i definirano značenje za više motora |
| insuranceExpiresAt / insurancePolicyNumber | Prihvatljivo kao projekcija odabrane potvrđene police, uz izvor i povijest |
| Jedna tablica vessel_documents | Dovoljan početak za MVP uz dopune; ime documents jasnije pokriva i potvrdu člana bez plovila |
| targetYear | Korisno za obnovu članstva; ne zamjenjuje period valjanosti i konkretni datum provjere police |
| uploadAndExtract | Izvedivo, ali razdvojiti spremanje dokumenta od pokušaja obrade i omogućiti ponovni pokušaj |
| confirmAndApply | Ključna točka: ovlasti po polju, kontrola verzije, idempotentnost i atomski audit |
| Usporedni prikaz | Zadržati; pokazati i postojeću vrijednost te točno koja se polja mijenjaju |

## 2. Dokazi iz aktualne aplikacije

| Oznaka | Dokaz | Implikacija |
| --- | --- | --- |
| K1 | [server/_core/index.ts:45](../../server/_core/index.ts#L45), retci 45–47: JSON i urlencoded limit 50mb | Datoteka od 10 MB nije sama po sebi blokirana ovim limitom. Limiti reverse proxyja i memorijska potrošnja nisu provjereni. |
| K2 | [client/src/main.tsx:40](../../client/src/main.tsx#L40), retci 40–49: httpBatchLink i credentials: include | Učitavanje treba imati vlastiti transport/budžet; batch ne smije množiti prihvatljiv upload. Autorizacija i zaštita zahtjeva trebaju vrijediti i za upload. |
| K3 | [server/storage.ts:8](../../server/storage.ts#L8), retci 8–18 i 70–101: storage proxy vraća URL; ključu se samo uklanjaju početne kose crte | Postojeći helper ne daje dokaz da je objekt privatan, URL vremenski ograničen ili da postoji pouzdano brisanje. Stvarne ACL postavke nisu provjerene. |
| K4 | [server/routers.ts:1393](../../server/routers.ts#L1393), retci 1393–1453: izmjene osobnih podataka/OIB-a preko adminProcedure | Predloženi operatorProcedure za update users proširuje operatorske ovlasti ako se bez dodatnih pravila dopuste ista polja. |
| K5 | [server/routers.ts:687](../../server/routers.ts#L687), retci 687–712: postojeća registracija može rezultirati updateom i promjenom ownerId-a za operatora/admina | Ne preuzeti taj upsert kao automatsko ponašanje potvrde „novog plovila”. Podudaranje mora otvoriti odluku, a ne tiho prenijeti plovilo. |
| K6 | [server/db.ts:316](../../server/db.ts#L316), retci 316–328 i 712–728 | createVessel, updateVessel i createAuditEntry koriste getDb, ne primaju tx. Poziv iz transakcije novog routera ne čini ih automatski dijelom te transakcije. |
| K7 | [drizzle/schema.ts:80](../../drizzle/schema.ts#L80), redak 80; [drizzle/schema.ts:173](../../drizzle/schema.ts#L173), redak 173 | OIB i registracija imaju unique constraint; race uvjete i konflikte treba obraditi i nakon prethodne provjere. |
| K8 | [server/memberSync/syncEngine.ts:288](../../server/memberSync/syncEngine.ts#L288), retci 288–303 | Sinkronizacija može ponovno pisati ime, OIB, kontakte i adresu. Treba definirati izvor istine nakon ručne potvrde dokumenta. |
| K9 | [server/jobs/queue.ts:16](../../server/jobs/queue.ts#L16), retci 16–23 i 38–44 | Postoji pg-boss infrastruktura i eksplicitno stanje degradiranog rada. Novi dokumentni posao treba imati definirano ponašanje kada red nije dostupan. |
| K10 | [server/services/voiceCommandService.ts:452](../../server/services/voiceCommandService.ts#L452), retci 452–469; [server/_core/env.ts:21](../../server/_core/env.ts#L21), retci 21–25 | Postoji izravni Gemini Interactions obrazac s store: false i konfiguriranim modelom. Dokumentima treba vlastiti multimodalni ulaz i shema; audio adapter nije dokumentni adapter. |
| K11 | [server/db.ts:241](../../server/db.ts#L241), retci 241–251; [server/db.ts:331](../../server/db.ts#L331), retci 331–352 | Anonimizacija korisnika i brisanje plovila zasad nemaju postupak za novu tablicu/datoteke. Potrebno je dogovoriti retenciju i ponašanje FK veza. |
| K12 | [package.json:9](../../package.json#L9); [server/migrate.ts:999](../../server/migrate.ts#L999) | Start pokreće migracijski skript, koji primjenjuje Drizzle migracije. Sama izmjena schema.ts nije dovršena isporuka promjene baze. |

## 3. Nedostaci koje treba razriješiti prije implementacije

### D-01 — Ovlast očitanja nije ovlast izmjene identiteta

**Prioritet:** visoko. **Dokaz:** [P], „confirmAndApply (operatorProcedure) … ažurira vessels / users”; K4.

Za učitavanje i prijedlog operatorProcedure ima smisla. Ne dopustiti generičan update korisnika iz JSON-a. Uvesti eksplicitnu listu polja koja operator smije potvrditi; promjenu OIB-a, identiteta ili druge osjetljive promjene provesti istom ili strožom politikom od postojećeg API-ja, odnosno izričito odobriti promjenu politike. role, clientCategory, activeMember i statutarna prava nisu dio OCR payloada za primjenu.

Svaki pregled, dohvat datoteke, ponovna obrada i potvrda treba provjeriti konkretan dokument i njegovu vezu s korisnikom/plovilom. UUID i storageKey nisu ovlast. Za potvrdu klupskog dokumenta posebno odrediti smije li djelatnik odobriti dokaz, povlaštenu tarifu ili samo spremiti podatke.

### D-02 — Jedan status ne opisuje očitanje, odluku i primjenu

**Prioritet:** visoko. **Dokaz:** [P], complianceStatus s vrijednošću verified te reviewedBy/reviewedAt, bez zasebnog stanja primjene.

Odvojiti:

- extractionStatus: npr. pending, processing, extracted, failed;
- complianceChecks: rezultat svake poslovne provjere s razlogom i dokazom;
- reviewStatus: npr. pending, accepted, rejected;
- applicationStatus: npr. not_applied, applied, superseded, uz appliedAt/appliedBy.

To su predloženi statusi, ne postojeći kod. verified ne smije neodređeno značiti i „model je očitao”, i „pravila su prošla”, i „djelatnik je prihvatio”, i „podaci su spremljeni”. Polica s datumom 2025. može biti savršeno očitana, ali neprihvatljiva za obnovu 2027. Ručna potvrda pogrešnog perioda ne pretvara provjeru u passed; iznimka, ako je dopuštena, ima vlastitu odluku i razlog.

### D-03 — Polica je povijesni zapis; kolona na plovilu je trenutačni sažetak

**Prioritet:** visoko. **Dokaz:** [P], jedna insuranceExpiresAt i insurancePolicyNumber uz mogućnost više vessel_documents.

Pohraniti i početak pokrića, izdavatelja, nositelje i vezu s potvrđenim dokumentom. Više polica, buduća obnova, dopuna i zamijenjeni dokument ne smiju se svesti na „zadnji upload pobjeđuje”. Stariji dokument učitan kasnije ne smije prepisati trenutačnu policu; buduća polica ne znači da je plovilo osigurano danas.

Za MVP podaci potvrđene police mogu ostati u verzioniranom strukturiranom zapisu dokumenta, a polja na vessels biti projekcija eksplicitno odabrane police s insuranceSourceDocumentId. Ako se trebaju pratiti paralelne police/pokrića, opravdana je posebna tablica polica. Ne treba odmah uvoditi pun osiguravateljski podsustav.

### D-04 — Potvrda može biti ponovljena ili primijenjena na zastarjelo stanje

**Prioritet:** visoko. **Dokaz:** [P], confirmAndApply bez ugovora o verziji i ponovljenom zahtjevu; K5–K8.

Potvrda treba primiti documentId, verziju ekstrakcije/pregleda, očekivanu verziju korisnika/plovila i odabrane ručne vrijednosti. Backend ponovno računa provjere i uspoređuje trenutačno stanje; rezultat provjera iz klijenta nije autoritativan. Ponovljena potvrda vraća isti rezultat i isti novostvoreni vesselId.

Kod postojeće registracije ponuditi povezivanje s postojećim plovilom ili prijaviti konflikt. Prijenos vlasništva mora biti izričita administrativna radnja. Zaključavanje i unique constraint moraju pokriti i dva paralelna zahtjeva za stvaranje plovila. Odrediti tko pobjeđuje kada legacy sinkronizacija kasnije donese drukčiji OIB ili ime.

### D-05 — Transakcija mora uključivati podatke, dokument i audit

**Prioritet:** visoko. **Dokaz:** [P], obećanje transakcijskog ažuriranja i audit loga; K6.

U istoj transakciji potvrditi verziju dokumenta, izmijeniti odabrana polja, povezati novo plovilo, zapisati konačni payload i odluku te audit prije/poslije s izvorom. Postojeće DB helpere prilagoditi da prihvaćaju tx ili izvršiti upise izravno kroz njega; ne pozivati globalni createAuditEntry uz pretpostavku da sudjeluje u transakciji.

Upload, Google poziv i čekanje radnika ostaju izvan transakcije potvrde. Vanjska pohrana i PostgreSQL nisu jedna atomska transakcija: unaprijed definirati čišćenje objekta kojem nije uspješno spremljen DB zapis i postupak kada datoteka nedostaje.

### D-06 — Privatna pohrana mora biti provjerena, ne samo deklarirana

**Prioritet:** visoko. **Dokaz:** [P], „privatna pohrana … bez izravnih javnih URL-ova”; K3; [S4].

Generirati nasumičan objektni ključ na backendu. OriginalFileName je samo ograničena metapodatkovna vrijednost za prikaz, ne putanja. Potvrditi da neautentificirani GET ne može dohvatiti objekt i da je brisanje podržano.

getFile prima documentId, backend provjerava pravo i dohvaća točno storageKey iz baze. Može poslužiti binarni sadržaj kroz autorizirani endpoint ili izdati kratkotrajni potpisani URL ako ugovor to dopušta. Potpisani URL je privremena pristupna vjerodajnica i ne smije završiti u trajnim logovima niti se prikazivati kao obična javna poveznica.

Za ovu specifikaciju najjasniji je autorizirani endpoint s privatnim cache pravilima i provjerenim Content-Typeom; za pregled PDF-a uzeti u obzir rasponske zahtjeve i kompatibilnost preglednika. Ne vraćati cijeli PDF kao JSON/base64 na svaki prikaz.

### D-07 — 10 MB i 20 sekundi trebaju precizan ugovor

**Prioritet:** srednje. **Dokaz:** [P], „base64 do 10 MB” i AbortSignal.timeout(20000); K1, K2.

Odrediti je li limit 10 MB ili 10 MiB i odnosi li se na dekodirane bajtove. Izmjeren račun: 10 MiB = 10.485.760 bajtova, odnosno 13.981.016 base64 znakova prije JSON omotača. To je ispod trenutačnih 50mb aplikacijskog parsera, pa nije točno da je prijedlog zbog toga neizvediv. Ipak, parser, string i dekodirani buffer stvaraju dodatne kopije u memoriji.

Ograničiti ukupni zahtjev, broj datoteka, PDF stranice, dimenzije/dekodirane piksele slike i broj paralelnih poslova. Zasebno provjeriti Coolify/reverse-proxy timeout i body limit; ovdje nisu testirani. AbortSignal.timeout je dostupan u pregledanom runtimeu Node v24.19.0, ali 20 s je rok jednog poziva, ne jamstvo ukupnog trajanja uploada, čitanja i obrade.

Base64 tRPC upload prihvatljiv je za ograničeni pilot. Za trajnu uporabu razmotriti zaseban streaming/multipart upload ili privatni izravni upload uz provjeru dovršetka. Ne uvoditi novu biblioteku bez potrebe i provjere licence.

### D-08 — Posao obrade treba preživjeti prekid veze

**Prioritet:** srednje. **Dokaz:** [P], „poziva Gemini … i odmah vraća”; K9.

Predloženi trajniji tok: upload → documentId i pending → posao ekstrakcije → status/rezultat → ručni pregled. Postojeći UI može odmah otvoriti dokument i prikazivati napredak; ne mora čekati završetak OCR-a da bi odgovorio na upload.

Minimalni API ugovor: upload, getById/getStatus, retryExtraction, confirmAndApply, list i getFile. Ako se zadrži uploadAndExtract, najprije trajno spremiti dokument i omogućiti dohvat rezultata nakon timeouta. Ponovljeni pokušaj koristi isti dokument i novu verziju ekstrakcije; nikada ne prepisuje već donesenu odluku. Definirati ishod kada queue ne radi, limit pokušaja i razliku između trajne greške formata te privremene 429/5xx greške servisa.

### D-09 — „Pokriva godinu” nije isto pravilo za sva tri dokumenta

**Prioritet:** visoko. **Dokaz:** [P], targetYear i provjera godine / važenja police; [S1, S2].

Za potvrdu kluba provjerava se pravo za traženu godinu ili priznato razdoblje, prema pravilima kluba. Za policu treba validationDate ili konkretno razdoblje pokrića: važenje 1. srpnja ne znači važenje cijele 2027. Plovidbena dozvola ne mora biti godišnji dokument. targetYear stoga može biti obvezan u kontekstu godišnje obnove, bez umjetnog pripisivanja jednogodišnje valjanosti svim dokumentima.

ISO format nije dovoljan: provjeriti stvarni kalendarski datum, početak prije isteka i pravilo uključivosti zadnjeg dana. Datum „danas” određuje backend u Europe/Zagreb; datumi dokumenata su kalendarske vrijednosti, ne trenutci koje preglednik proizvoljno pomiče vremenskom zonom.

„Status ovjere” model smije opisati kao vidljiva oznaka/pečat/potpis ili nepoznato. Ne smije ga označiti kao dokaz autentičnosti. Backend ne može provjeriti izdavatelja ili uplatu samo usporedbom imena i godine.

### D-10 — Sirovi odgovor, ispravak i primijenjena vrijednost moraju ostati odvojeni

**Prioritet:** srednje. **Dokaz:** [P], extractedPayload i ručno korigiranje; [S1].

Uz sirovi odgovor čuvati validirani prijedlog, ručne izmjene i konačno primijenjeni skup polja. Zapisati model, verziju prompta/sheme, vrijeme pokušaja i klasificiranu grešku. Dokaz može sadržavati stranicu i kratak citat, ali modelov citat nije neovisna potvrda da je tako napisano: djelatnik mora moći provjeriti izvornik.

Null iz ekstrakcije znači „nije očitano”, ne „obriši postojeću vrijednost”. Brisanje već potvrđenog podatka mora biti zasebna, izričita odluka. Promjena targetYear, nositelja ili rukom prepisanog datuma zahtijeva novu provjeru. Za null OIB UI treba prikazati „Nije naveden / nije očitan”, a ne automatsko crveno ✗.

Ne kopirati naziv osiguranika u ime ERP korisnika niti izjednačiti LOA i postojeći lengthM bez odabira djelatnika. Za snagu čuvati izvornu jedinicu i jasno definirati je li podatak po motoru ili ukupno. Pretvorbu jedinica obavlja backend prema definiranoj konvenciji.

### D-11 — Nedostaju minimalni metapodaci i pravila čuvanja

**Prioritet:** srednje. **Dokaz:** [P], predložena tablica; K11.

Dodati createdAt/updatedAt, uploadedBy, fileSizeBytes, contentHash, verziju obrade, appliedAt/appliedBy, izvor primijenjenih polja i stanje brisanja/zamjene. StorageKey treba biti jedinstven. Indeksirati tipične dohvatne putove po userId/vesselId i vremenu te statusu obrade; oblik indeksa potvrditi stvarnim upitima, bez nasumičnog indeksiranja cijelog JSON-a.

UserId treba značiti nositelja/predmet dokumenta; uploadedBy je djelatnik. Veza dokument–plovilo mora se provjeriti na backendu. Dokument člana može postojati bez plovila; već predloženi nullable vesselId to podržava.

Definirati retenciju za datoteku, sirovi payload, dokazne citate i audit, uključujući kopije. Postojeća anonimizacija ne uklanja podatke iz novog JSON-a ili datoteke. Definirati ponašanje pri brisanju plovila: restrict, set null uz snapshot ili kontrolirani postupak; ne prepustiti poslovnu odluku zadanom FK ponašanju.

### D-12 — Sigurnost dokumenta ne završava MIME provjerom

**Prioritet:** visoko za produkcijski upload. **Dokaz:** [P], provjera stvarnog MIME tipa; [S4].

Potrebna je dopuštena lista formata, provjera potpisa i uspješnog parsiranja, ograničenja resursa i postupak za šifriran, oštećen ili prazan PDF. Izolirati parsiranje i pregled nepouzdanog sadržaja; provjeriti potrebu za skeniranjem, bez pretpostavke da je sam „magic bytes” dovoljan. Ne prihvaćati proizvoljne URL-ove koje bi backend preuzimao umjesto datoteke.

Dokumentni servis nema alate za izvršavanje uputa iz dokumenta. Izvučeni tekst je podatak, nikada ovlast za izmjenu korisnika, slanje poruka ili promjenu prava. U sučelju se citati prikazuju kao tekst, bez izvršavanja HTML-a.

Uvesti budžet i ograničenje učestalosti po korisniku te ograničenje paralelnih AI obrada; autentificirani operator i dalje može slučajno poslati mnogo velikih dokumenata. Sirovi dokumenti, puni odgovori i vjerodajnice ne idu u obične aplikacijske logove.

## 4. Preporučeni opseg prve verzije

Zadržati jedan dokumentni modul i ne uvoditi tri međusobno nepovezana OCR rješenja. Početi jednom vrstom dokumenta, primjerice policom osiguranja ili plovidbenom dozvolom, a uvesti ove granice od prvog dana:

1. Privatni upload i autorizirani pregled izvornika.
2. Trajni documentId i ponovljiva ekstrakcija s verzijom.
3. Prijedlog odvojen od postojećih poslovnih podataka.
4. Pregled promjena i provjere uz postojeću vrijednost.
5. Ograničena, idempotentna potvrda s auditom u istoj transakciji.
6. Bez automatske izmjene kvota, povlaštene tarife, radnih naloga ili boravka na kopnu.

Potvrda dokumenta može dopuniti podatke plovila za buduće provjere. Ako nova duljina ili promjena identiteta utječe na već odobren termin, nosivost, račun ili radni nalog, prikazati povezane posljedice i koristiti postojeći administrativni postupak ispravka. Ne mijenjati povijesne snapshotove niti prepravljati zauzeće kopna kao nuspojavu OCR-a.

### Usporedni prikaz

Lijevo ostaje izvornik, desno tri jasno označene vrijednosti: postojeća, očitana i odabrana za spremanje. Djelatnik može prihvatiti samo dio polja; polja koja nisu očitana ne prepisuju postojeće podatke.

Odvojiti akcije „Spremi odabrane podatke” i odluku o prihvatljivosti dokumenta. Gumb može objediniti posao samo kada UI izričito pokazuje da se potvrđuju oba ishoda i kada pravila to dopuštaju. Ne prikazivati „Provjereno” samo zato što je djelatnik spremio ručno ispravljenu registraciju.

Za više nalaza prikazati sve razloge, npr. nepodudaranje nositelja i pogrešno razdoblje, umjesto skrivanja jednoga iza drugog. Djelatniku treba biti jasno što blokira spremanje, što blokira prihvaćanje i što je upozorenje. Osigurati tipkovnički pristup, tekstualne oznake uz boje i mogućnost zasebnog otvaranja izvornika.

## 5. Uvjeti provjere prije produkcije

| Scenarij | Očekivani rezultat |
| --- | --- |
| Pogrešan MIME, neispravan base64 ili prevelik dekodirani sadržaj | Odbijanje prije AI obrade, bez javne datoteke i bez neriješenih objekata |
| Mali PDF s previše stranica / slika s previše piksela | Kontrolirano odbijanje prema resursnim granicama |
| Google timeout ili 429 | Dokument ostaje dohvatljiv; kontroliran retry bez duplog unosa |
| Polica vrijedi tek od 2027. | Ne označava plovilo osiguranim danas i ne zamjenjuje važeću policu bez pravila |
| Kasniji upload stare police | Ne prepisuje potvrđenu aktualnu policu samo zbog vremena uploada |
| Dva operatora istodobno potvrđuju isti dokument | Jedan poslovni učinak i deterministički rezultat drugog zahtjeva |
| Dokument se ručno promijeni nakon pregleda | Potrebna nova verzija/pregled; stari prijedlog se ne primjenjuje |
| Prazno ili nečitko polje | Ostaje nepoznato; potvrđeni ERP podatak se ne briše |
| Registracija već postoji kod drugog vlasnika | Jasna odluka/konflikt, bez tihog prijenosa |
| Operator pokušava promijeniti nedopušten osobni podatak | Odbijanje prema politici ovlasti, i kada zaobiđe UI |
| Audit insert ne uspije | Nijedna poslovna promjena potvrde nije commitana |
| Neovlašteni dokumentId / izravan pokušaj preuzimanja objekta | Nema pristupa datoteci ni osjetljivim metapodacima |
| Spremanje podataka iz klupske potvrde | Nema resetiranja member_statutory_rights niti novog besplatnog boravka |
| Legacy sync donese drukčiji identitet | Definirani konflikt/prioritet izvora, bez tihog poništavanja pregleda |
| Brisanje/anonimizacija | Izvršena dogovorena retencija za objekt, payload i veze |

To su budući kriteriji prihvata, ne testovi već provedeni nad modulom koji još ne postoji.

## 6. Migracije i postojeći sigurnosni preduvjet

Proširenje schema.ts isporučiti kroz verzioniranu migraciju, s nullable poljima za postojeća plovila, FK politikom i odabranim indeksima. Provjeriti migraciju na praznoj i sintetički popunjenoj lokalnoj bazi te jasno obraditi neuspjeh obvezne migracije. U ovom zadatku migracije nisu pokretane.

U postojećem migracijskom skriptu nalaze se ugrađene početne administratorske lozinke: **server/migrate.ts:1353–1355**, vrsta tajne: inicijalne administratorske vjerodajnice u izvornom kodu. Vrijednosti se ovdje ne navode. To je postojeći sigurnosni nalaz, ne nedostatak samog OCR prijedloga. Nije provjereno koriste li se te vrijednosti u objavljenoj instanci. Prije širenja pristupa privatnim dokumentima treba ukloniti oslanjanje na poznate početne vjerodajnice i provjeriti jesu li računi koji su ih koristili osigurani.

## 7. Provjere, izvori i ograničenja

Provjereni su navedeni kod, postavke aplikacijskog body parsera, postojeći transport tRPC-a, dostupnost AbortSignal.timeout u lokalnom Node runtimeu i veličina base64 kodiranja. Nisu korištene stvarne .env vrijednosti, privatna pohrana, produkcijska/udaljena baza niti osobni dokumenti. Nisu slani Gemini zahtjevi s dokumentima i nije mjereno trajanje OCR-a. Nisu pokretani install, build ili novi aplikacijski testovi jer je ovo recenzija specifikacije bez implementacijskih izmjena. Rezultati testova prethodne analize ne predstavljaju test ovog predloženog modula.

Svim vanjskim izvorima pristupljeno **13. 11. 2026.**:

- **[S1] Google Structured outputs:** https://aistudio.google.com/docs/structured-output — podrška JSON shemama i Zodu; semantičku ispravnost i neprovedena ograničenja mora provjeriti aplikacija. Provjereno preko https://ai.google.dev/gemini-api/docs/structured-output.
- **[S2] Google Document understanding:** https://aistudio.google.com/docs/document-processing — PDF kao document ulaz s podacima i MIME tipom, obrada sadržaja i resursne granice. Provjereno preko https://ai.google.dev/gemini-api/docs/document-processing. Dokumentacija nije dokaz da svaki model/pružatelj prihvaća svaki planirani format; podršku provjeriti za odabrani model i adapter.
- **[S3] Google Interactions API overview:** https://aistudio.google.com/docs/interactions-overview — Interactions API i store: false. Provjereno preko https://ai.google.dev/gemini-api/docs/interactions. Store: false ne zamjenjuje ugovor o obradi i provjeru ostalih rokova retencije.
- **[S4] OWASP File Upload Cheat Sheet:** https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/File_Upload_Cheat_Sheet.md — autorizacija, dopušteni formati, ograničenja, privatna pohrana i provjera sadržaja. Čitana službena izvorna verzija jer je https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html vratio HTTP 403.

Nije preuziman tuđi kod niti su odabrane nove ovisnosti. Arhitektonske dopune i predloženi nazivi/statusi u ovom dokumentu nisu tvrdnja da se tako već ponašaju Google ili postojeća aplikacija.

