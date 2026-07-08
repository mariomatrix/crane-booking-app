-- ============================================================
-- OIB migracija — Marina Crane Booking App
-- Datum: 2026-07-08
-- Opis: Dodaje OIB polje korisnicima i userOib snapshot u rezervacije
-- ============================================================

-- 1. Dodaj oib kolonu u users tablicu (nullable, unique)
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS oib VARCHAR(11);

-- 2. Kreiraj unique indeks na oib (parcijalni — samo kad nije NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oib 
    ON users(oib) 
    WHERE oib IS NOT NULL;

-- 3. Dodaj userOib snapshot kolonu u reservations tablicu
ALTER TABLE reservations 
    ADD COLUMN IF NOT EXISTS user_oib VARCHAR(11);

-- ============================================================
-- Provjera (opcionalno — pokreni da vidiš rezultat):
-- SELECT column_name, data_type, character_maximum_length, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('users', 'reservations')
--   AND column_name IN ('oib', 'user_oib');
-- ============================================================
