# Upute za prijenos koda (Transfer GPT)

Ovaj direktorij sadrži cjelokupni minimalni i čisti izvorni kod aplikacije **crane-booking-app / marina-erp**, podijeljen u logičke pakete (batch-eve) za jednostavan prijenos u ChatGPT ili na drugi PC.

## Format datoteka u svakom batchu:
```text
relative/file/path.tsx
// file contents...
```

## Popis paketa (Batches):

- **[`batch_01_config_and_schema.txt`](./batch_01_config_and_schema.txt)** (67.9 KB) — *Konfiguracija projekta, Baza podataka & Drizzle Schema* (9 datoteka)
- **[`batch_02_server_core_and_services.txt`](./batch_02_server_core_and_services.txt)** (119.3 KB) — *Server Core, Autentikacija, DB konekcija, Migracije & e-računi servis* (9 datoteka)
- **[`batch_03_server_routers.txt`](./batch_03_server_routers.txt)** (269.7 KB) — *Glavni tRPC Ruteri i Poslovna logika* (7 datoteka)
- **[`batch_04_client_core_and_layout.txt`](./batch_04_client_core_and_layout.txt)** (50.3 KB) — *Client Core, Routing, Layout, Konteksti i Pomoćne komponente* (15 datoteka)
- **[`batch_05_client_user_pages.txt`](./batch_05_client_user_pages.txt)** (138.3 KB) — *Korisničke stranice & Mobilna aplikacija za operatere* (10 datoteka)
- **[`batch_06_admin_pages_part1.txt`](./batch_06_admin_pages_part1.txt)** (170.4 KB) — *Admin Panel 1: Akvatorij & Mapa vezova, Računi & e-Računi, Radni nalozi, Karton člana* (6 datoteka)
- **[`batch_07_admin_pages_part2.txt`](./batch_07_admin_pages_part2.txt)** (377.0 KB) — *Admin Panel 2: Kalendar, Korisnici, Dnevnik dizalice, Suhi vezovi, Cjenici i Postavke* (15 datoteka)
- **[`batch_08_reports.txt`](./batch_08_reports.txt)** (76.7 KB) — *Izvještaji i Analitika* (5 datoteka)
- **[`batch_09_ui_primitives.txt`](./batch_09_ui_primitives.txt)** (74.0 KB) — *UI Primitives (Radix UI / shadcn komponente)* (17 datoteka)

## Kako pokrenuti projekt na novom PC-ju:
1. Klonirajte ili rekreirajte datoteke iz ovih 9 paketa u prazan direktorij.
2. Instalirajte Node.js (v20+) i pnpm.
3. Pokrenite:
   ```bash
   pnpm install
   ```
4. Kopirajte `.env.example` u `.env` i postavite vaš PostgreSQL connection string.
5. Pokrenite bazu i dev server:
   ```bash
   pnpm dev
   ```