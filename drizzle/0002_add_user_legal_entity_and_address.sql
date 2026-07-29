-- Add legal entity and address columns to users table if not exists
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_legal_entity" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_name" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contact_person" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city" varchar(100) DEFAULT 'Split' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postal_code" varchar(20) DEFAULT '21000' NOT NULL;
