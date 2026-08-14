# Walkthrough: Implementacija Member Service Sync modula (PŠD Špinut)

Uspješno je implementiran i testiran **Member Service Sync** modul za jednosmjernu sinkronizaciju članova i plovila iz legacy Microsoft SQL Server baze (`CLAN03`) u PostgreSQL (`users` + `vessels`).

---

## 1. Što je napravljeno

### A. Drizzle Schema & PostgreSQL Baza
1. **`users.email`** postavljen na `nullable` (članovi bez emaila u staroj bazi evidentiraju se bez lažnih adresa).
2. **`users.jmbg_hash`** dodan za siguran SHA-256 hash 13-znamenkastog JMBG-a (nikad se ne prikazuje u korisničkom sučelju).
3. **`vessels.registration`** dobio `UNIQUE` constraint za globalnu jedinstvenost registarske oznake plovila.
4. **4 nove PostgreSQL tablice**:
   - **`member_links`**: Mapiranje `user_id` (UUID) ↔ `legacy_mat_broj` (podržava više MAT_BROJ zapisa za istu osobu).
   - **`member_memberships`**: Evidencija pripadnosti klubovima (`klub`, `klub2`, `klub3`, `vrsta_c`, `clan`) i status `active_member` (true/false).
   - **`sync_runs`**: Audit trail i statistika svakog pokretanja sinkronizacije (status, brojači, trajanje, greške).
   - **`sync_conflicts`**: Evidencija konfliktnih situacija (višestruka imena, pogrešan OIB, konflikt vlasnika plovila) za ručni pregled i rješavanje od strane administratora.

---

### B. Arhitektura Member Service modula (`server/memberSync/`)

```
server/memberSync/
├── types.ts              ← Tipovi za CLAN03 zapise, brojače, sync rezultate
├── utils.ts              ← Validacija OIB (ISO 7064), JMBG SHA-256 hash, normalizacija telefona/imena, odabir Email/Emial
├── mssqlClient.ts        ← Connection pool prema MSSQL (tedious), 3x retry s exponential backoff, graceful shutdown
├── mssqlQueries.ts       ← SQL upiti za dohvat članova (WHERE VRSTA_C IN ('U','B') AND ISNULL(KLUB,0) > 0) i test konekcije
├── syncEngine.ts         ← Glavna jezgra sinkronizacije:
│                            • Razina 0: lookup po member_links.legacy_mat_broj (ekstremno brzo)
│                            • Razina 1: OIB provjera (ISO 7064)
│                            • Razina 2: Ime + Prezime deduplikacija
│                            • Plovila: BROD_BR (jedinstvena registracija) / IME_BR fallback
│                            • Soft-delete: MAT_BROJ koji više nije u CLAN03 dobiva active_member = false (users/vessels se NIKAD ne brišu)
├── scheduler.ts          ← Periodički pokretač svakih 60 min (setInterval, Windows 11 kompatibilan) s mutex lockom
├── memberSync.router.ts  ← tRPC Admin API (getStatus, testConnection, triggerSync, getHistory, getConflicts, resolveConflict, getMembersByClub)
└── memberSync.test.ts    ← 19 automatiziranih jediničnih testova
```

---

### C. tRPC API integracija & Server Startup
- `memberSyncRouter` montiran u glavni `appRouter` pod `trpc.memberSync.*`.
- U [server/_core/index.ts](file:///c:/Users/Administrator/GITHUB/crane-booking-app/server/_core/index.ts) pokrenut pozadinski scheduler `startMemberSyncCron()`.
- U [server/migrate.ts](file:///c:/Users/Administrator/GITHUB/crane-booking-app/server/migrate.ts) ugrađene automatske DDL migracije za sve nove tablice i indekse.

---

## 2. Rezultati verifikacije

### Automatski testovi
```bash
pnpm test
```
- **`server/memberSync/memberSync.test.ts`**: 19/19 testova prošlo (OIB ISO 7064, JMBG hash, Email selekcija, normalizacije, statusi).
- **`server/auth.logout.test.ts`**: 1/1 test prošao.
- **`server/crane-booking.test.ts`**: 21/21 testova prošlo.
- **Ukupno**: **41/41 testova zeleno**.

### TypeScript Typecheck
```bash
pnpm check (tsc --noEmit)
```
- **0 grešaka**. Svi frontend i backend tipovi su usklađeni.

---

## 3. Konfiguracija za pokretanje (`.env`)

U `.env` datoteci (ili prema `.env.example`) konfigurisati pristup MSSQL bazi:

```env
# ─── Legacy MSSQL Server (Member Sync) ─────────────────────────────────
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=brod
MSSQL_USER=sa
MSSQL_PASSWORD=vasa_lozinka
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERT=true

# ─── Member Sync Schedule ──────────────────────────────────────────────
MEMBER_SYNC_ENABLED=true
MEMBER_SYNC_INTERVAL_MIN=60
```
