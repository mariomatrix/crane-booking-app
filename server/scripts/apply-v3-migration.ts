import "dotenv/config";
import postgres from "postgres";

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  console.log("Applying v3.2 Dispatch migrations...");

  // 1. Enum updates
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'not_performed';
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_stoppage_scope') THEN
        CREATE TYPE work_stoppage_scope AS ENUM ('all_cranes', 'single_crane', 'single_zone');
      END IF;
    END $$;
  `);

  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waiting_offer_status') THEN
        CREATE TYPE waiting_offer_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');
      END IF;
    END $$;
  `);

  // 2. Reservations columns
  await sql.unsafe(`
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS requested_zone_id UUID REFERENCES land_zones(id);
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS space_units INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS team_override BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS team_override_reason TEXT;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS not_performed_reason TEXT;
  `);

  // 3. Crane zone affinities columns
  await sql.unsafe(`
    ALTER TABLE crane_zone_affinities ADD COLUMN IF NOT EXISTS penalty_slots INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE crane_zone_affinities ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE crane_zone_affinities ADD COLUMN IF NOT EXISTS is_allowed BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE crane_zone_affinities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  // 4. waiting_offers table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS waiting_offers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      waiting_list_id UUID NOT NULL REFERENCES land_waiting_list(id) ON DELETE CASCADE,
      vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
      zone_id UUID NOT NULL REFERENCES land_zones(id) ON DELETE RESTRICT,
      crane_id UUID NOT NULL REFERENCES cranes(id) ON DELETE RESTRICT,
      offered_start TIMESTAMPTZ NOT NULL,
      offered_end TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status waiting_offer_status NOT NULL DEFAULT 'pending',
      decline_reason TEXT,
      reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS waiting_offers_wl_idx ON waiting_offers(waiting_list_id);
    CREATE INDEX IF NOT EXISTS waiting_offers_status_idx ON waiting_offers(status);
    CREATE INDEX IF NOT EXISTS waiting_offers_expires_at_idx ON waiting_offers(expires_at);
  `);

  // 5. operation_dependencies table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS operation_dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      predecessor_reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      successor_reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      dependency_type VARCHAR(50) NOT NULL DEFAULT 'capacity_release',
      minimum_gap_minutes INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE operation_dependencies ADD COLUMN IF NOT EXISTS dependency_type VARCHAR(50) NOT NULL DEFAULT 'capacity_release';
    ALTER TABLE operation_dependencies ADD COLUMN IF NOT EXISTS minimum_gap_minutes INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE operation_dependencies ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
    ALTER TABLE operation_dependencies ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE operation_dependencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS op_dep_predecessor_idx ON operation_dependencies(predecessor_reservation_id);
    CREATE INDEX IF NOT EXISTS op_dep_successor_idx ON operation_dependencies(successor_reservation_id);
    CREATE INDEX IF NOT EXISTS op_dep_status_idx ON operation_dependencies(status);
  `);

  // 6. work_stoppages table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS work_stoppages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope work_stoppage_scope NOT NULL DEFAULT 'all_cranes',
      crane_id UUID REFERENCES cranes(id) ON DELETE CASCADE,
      zone_id UUID REFERENCES land_zones(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      reason VARCHAR(100) NOT NULL,
      note TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS work_stoppages_starts_at_idx ON work_stoppages(starts_at);
    CREATE INDEX IF NOT EXISTS work_stoppages_crane_id_idx ON work_stoppages(crane_id);
    CREATE INDEX IF NOT EXISTS work_stoppages_zone_id_idx ON work_stoppages(zone_id);
    CREATE INDEX IF NOT EXISTS work_stoppages_is_active_idx ON work_stoppages(is_active);
  `);

  console.log("Migration applied successfully!");
  await sql.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
