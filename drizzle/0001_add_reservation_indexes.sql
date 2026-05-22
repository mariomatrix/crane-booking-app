CREATE INDEX IF NOT EXISTS "res_scheduled_start_idx" ON "reservations" ("scheduled_start");
CREATE INDEX IF NOT EXISTS "res_scheduled_end_idx" ON "reservations" ("scheduled_end");
CREATE INDEX IF NOT EXISTS "res_status_idx" ON "reservations" ("status");
CREATE INDEX IF NOT EXISTS "res_user_id_idx" ON "reservations" ("user_id");
CREATE INDEX IF NOT EXISTS "res_crane_id_idx" ON "reservations" ("crane_id");
CREATE INDEX IF NOT EXISTS "res_requested_date_idx" ON "reservations" ("requested_date");
CREATE INDEX IF NOT EXISTS "res_is_maintenance_idx" ON "reservations" ("is_maintenance");
