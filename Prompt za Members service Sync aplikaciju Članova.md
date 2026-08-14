## **Kontekst**

Trenutno postoje dva sustava:

### **1\. Legacy desktop aplikacija**

* koristi Microsoft SQL Server  
* glavna tablica članova je `CLAN03`  
* identifikator `MAT_BROJ` je `nvarchar(10)`  
* `MAT_BROJ` NIJE identity niti auto-increment  
* ne postoje procedure za generiranje članova  
* generiranje `MAT_BROJ` najvjerojatnije se odvija u desktop aplikaciji  
* postoje vrijednosti poput:

077  
222  
L077  
K0043  
N025

što potvrđuje da `MAT_BROJ` nije običan numerički ključ

### **2\. Nova web aplikacija**

---

# **Analiza legacy baze**

Utvrđeno je:

* ista osoba može imati više `MAT_BROJ` vrijednosti  
* primjer:

ŠOŠO IVICA

077  
222  
L077

* ista osoba može imati više povijesnih zapisa  
* `MAT_BROJ` nije pouzdan identifikator osobe

OIB nije dovoljno popunjen.

JMBG je djelomično nekonzistentan:

primjeri:

1303960  
1303960380041

za istu osobu.

Najpouzdanija deduplikacija trenutno je:

1\. OIB  
2\. puni JMBG  
3\. PREZIME \+ IME  
---

# **Trenutna definicija člana**

Najtočniji rezultat dobiven je upitom:

WHERE VRSTA\_C IN ('U','B')  
AND ISNULL(KLUB,0) \> 0  
\`\`

Nakon deduplikacije po imenu i prezimenu dobiveno je:

1189 stvarnih članova  
---

# **PostgreSQL model**

Postoji produkcijska tablica:

users

s UUID primarnim ključem.

Postoji i:

vessels

koja predstavlja plovila korisnika.

UUID mora postati jedini identitet korisnika.

Nikada ne koristiti `MAT_BROJ` kao primarni ključ.

---

# **Cilj faze 1**

Napraviti zaseban backend modul:

Member Service

koji sinkronizira:

MS SQL Server  
→  
PostgreSQL  
\`\`

isključivo u jednom smjeru.

U ovoj fazi:

PostgreSQL \= read model  
MS SQL \= source of truth

NEMA sinkronizacije prema MSSQL-u.

---

# **Funkcionalni zahtjevi**

## **Sinkronizacija članova**

Iz MSSQL `CLAN03` sinkronizirati:

IME  
PREZIME  
OIB  
JMBG  
ADRESA  
PTT  
GRAD  
DRZAVA  
MOBITEL  
TELEFON  
EMAIL  
\`\`

u PostgreSQL tablicu:

users  
---

## **Sinkronizacija brodova**

Iz:

IME\_BR  
BROD\_BR  
TIP\_BROD  
DUZINA\_BR  
SIRINA\_BR

u PostgreSQL tablicu:

vessels  
---

# **Novi PostgreSQL model**

Predloži Drizzle ORM shemu za:

## **member\_links**

Mapiranje između PostgreSQL korisnika i legacy sustava.

Primjer:

user\_id (UUID)

legacy\_mat\_broj

legacy\_oib

legacy\_jmbg

Jedan korisnik može imati više legacy zapisa.

Primjer:

UUID X

077  
222  
L077  
---

## **sync\_runs**

Audit i praćenje sinkronizacija.

Polja:

id  
started\_at  
completed\_at  
members\_created  
members\_updated  
vessels\_created  
vessels\_updated  
status  
error\_message  
---

# **Tehnički zahtjevi**

Rješenje mora biti usklađeno s postojećim stackom:

* Node.js  
* TypeScript  
* Drizzle ORM  
* PostgreSQL  
* Express  
* tRPC

Ne koristiti Prisma.

---

# **Arhitektura**

Predložiti:

1. strukturu direktorija  
2. Drizzle shemu  
3. servisni sloj  
4. MSSQL pristupni sloj  
5. sync engine  
6. scheduler  
7. idempotentnu sinkronizaciju  
8. strategiju deduplikacije članova  
9. strategiju deduplikacije plovila  
10. logging  
11. retry mehanizam

---

# **Očekivani rezultat**

Generirati:

* kompletnu arhitekturu Member Service modula  
* Drizzle modele  
* sinkronizacijski workflow  
* ER dijagram  
* TypeScript strukturu projekta  
* plan implementacije po fazama

bez implementacije sinkronizacije PostgreSQL → MSSQL, jer će se to analizirati u drugoj fazi nakon što se utvrdi kako desktop aplikacija generira `MAT_BROJ`.