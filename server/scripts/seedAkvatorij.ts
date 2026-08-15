/**
 * Seed skripta za inicijalizaciju klubova, gatova (14 cjelina) i svih 811 morskih vezova PŠD Špinut
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { clubs, piers, berths } from "../../drizzle/schema";

const PIERS_CONFIG = [
    { code: "G1", name: "Gat 1", pierType: "floating_pontoon" as const, totalBerths: 62, prefix: "G01-", sortOrder: 1 },
    { code: "G2", name: "Gat 2", pierType: "floating_pontoon" as const, totalBerths: 70, prefix: "G02-", sortOrder: 2 },
    { code: "G3", name: "Gat 3", pierType: "floating_pontoon" as const, totalBerths: 69, prefix: "G03-", sortOrder: 3 },
    { code: "G4", name: "Gat 4", pierType: "floating_pontoon" as const, totalBerths: 68, prefix: "G04-", sortOrder: 4 },
    { code: "G5", name: "Gat 5", pierType: "floating_pontoon" as const, totalBerths: 70, prefix: "G05-", sortOrder: 5 },
    { code: "G6", name: "Gat 6", pierType: "floating_pontoon" as const, totalBerths: 65, prefix: "G06-", sortOrder: 6 },
    { code: "G7", name: "Gat 7", pierType: "floating_pontoon" as const, totalBerths: 66, prefix: "G07-", sortOrder: 7 },
    { code: "G8", name: "Gat 8", pierType: "floating_pontoon" as const, totalBerths: 66, prefix: "G08-", sortOrder: 8 },
    { code: "G9", name: "Gat 9", pierType: "floating_pontoon" as const, totalBerths: 66, prefix: "G09-", sortOrder: 9 },
    { code: "G10", name: "Gat 10", pierType: "floating_pontoon" as const, totalBerths: 62, prefix: "G10-", sortOrder: 10 },
    { code: "G11", name: "Gat 11", pierType: "floating_pontoon" as const, totalBerths: 51, prefix: "G11-", sortOrder: 11 },
    { code: "G12", name: "Gat 12", pierType: "floating_pontoon" as const, totalBerths: 16, prefix: "G12-", sortOrder: 12 },
    { code: "L", name: "Lukobran", pierType: "breakwater" as const, totalBerths: 46, prefix: "LUK-", sortOrder: 13 },
    { code: "ZO", name: "Zapadna obala", pierType: "quay" as const, totalBerths: 34, prefix: "ZO-", sortOrder: 14 },
];

const CLUBS_CONFIG = [
    {
        code: "JK",
        name: "Jedriličarski klub Špinut",
        shortName: "JK Špinut",
        annualFee: "60.00",
        colorHex: "#2563eb",
        sortOrder: 1,
    },
    {
        code: "RK",
        name: "Ronilački klub Špinut",
        shortName: "RK Špinut",
        annualFee: "50.00",
        colorHex: "#0891b2",
        sortOrder: 2,
    },
    {
        code: "KSR",
        name: "Klub športskog ribolova Špinut",
        shortName: "KŠR Špinut",
        annualFee: "50.00",
        colorHex: "#059669",
        sortOrder: 3,
    },
];

export async function seedAkvatorij() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is missing");
    }

    console.log("🌊 Pokrećem inicijalizaciju akvatorija i klubova PŠD Špinut...");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });

    // 0. Provjera i kreiranje tablica i enuma (DDL)
    console.log("🛠️  [0/3] Provjera postojanja tablica u PostgreSQL bazi...");
    try {
        await client`
            DO $$ BEGIN
                CREATE TYPE "pier_type" AS ENUM ('floating_pontoon', 'fixed_pier', 'breakwater', 'quay');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await client`
            DO $$ BEGIN
                CREATE TYPE "berth_status" AS ENUM ('vacant', 'occupied', 'transit', 'debt_block', 'maintenance', 'reserved');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await client`
            DO $$ BEGIN
                CREATE TYPE "berth_side" AS ENUM ('left', 'right', 'head', 'quay');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;
        await client`
            DO $$ BEGIN
                CREATE TYPE "berth_assignment_type" AS ENUM ('permanent_member', 'transit_guest', 'club_service', 'temporary_relocation');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `;

        await client`
            CREATE TABLE IF NOT EXISTS "clubs" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "short_name" varchar(50),
                "description" text,
                "annual_fee" numeric(10, 2) DEFAULT 0.00 NOT NULL,
                "color_hex" varchar(10) DEFAULT '#3b82f6',
                "is_active" boolean DEFAULT true NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;

        await client`
            CREATE TABLE IF NOT EXISTS "piers" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "code" varchar(20) NOT NULL UNIQUE,
                "name" varchar(255) NOT NULL,
                "pier_type" "pier_type" DEFAULT 'floating_pontoon' NOT NULL,
                "total_berths" integer NOT NULL,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "description" text,
                "is_active" boolean DEFAULT true NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await client`CREATE INDEX IF NOT EXISTS "piers_code_idx" ON "piers" ("code")`;
        await client`CREATE INDEX IF NOT EXISTS "piers_sort_order_idx" ON "piers" ("sort_order")`;

        await client`
            CREATE TABLE IF NOT EXISTS "berths" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "pier_id" uuid NOT NULL REFERENCES "piers"("id") ON DELETE CASCADE,
                "code" varchar(30) NOT NULL UNIQUE,
                "berth_number" integer NOT NULL,
                "side" "berth_side" DEFAULT 'left' NOT NULL,
                "max_loa_m" numeric(6, 2) DEFAULT 10.00 NOT NULL,
                "max_beam_m" numeric(6, 2) DEFAULT 3.20 NOT NULL,
                "max_draft_m" numeric(5, 2) DEFAULT 2.50 NOT NULL,
                "status" "berth_status" DEFAULT 'vacant' NOT NULL,
                "has_electricity" boolean DEFAULT true NOT NULL,
                "has_water" boolean DEFAULT true NOT NULL,
                "electricity_meter_code" varchar(50),
                "water_meter_code" varchar(50),
                "notes" text,
                "sort_order" integer DEFAULT 0 NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await client`CREATE INDEX IF NOT EXISTS "berths_pier_id_idx" ON "berths" ("pier_id")`;
        await client`CREATE INDEX IF NOT EXISTS "berths_code_idx" ON "berths" ("code")`;
        await client`CREATE INDEX IF NOT EXISTS "berths_status_idx" ON "berths" ("status")`;

        await client`
            CREATE TABLE IF NOT EXISTS "berth_assignments" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "berth_id" uuid NOT NULL REFERENCES "berths"("id") ON DELETE CASCADE,
                "vessel_id" uuid NOT NULL REFERENCES "vessels"("id"),
                "user_id" uuid NOT NULL REFERENCES "users"("id"),
                "assignment_type" "berth_assignment_type" DEFAULT 'permanent_member' NOT NULL,
                "contract_number" varchar(50),
                "start_date" timestamp DEFAULT now() NOT NULL,
                "end_date" timestamp,
                "is_active" boolean DEFAULT true NOT NULL,
                "assigned_by" uuid REFERENCES "users"("id"),
                "notes" text,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL
            )
        `;
        await client`CREATE INDEX IF NOT EXISTS "berth_assignments_berth_id_idx" ON "berth_assignments" ("berth_id")`;
        await client`CREATE INDEX IF NOT EXISTS "berth_assignments_vessel_id_idx" ON "berth_assignments" ("vessel_id")`;
        await client`CREATE INDEX IF NOT EXISTS "berth_assignments_user_id_idx" ON "berth_assignments" ("user_id")`;
        await client`CREATE INDEX IF NOT EXISTS "berth_assignments_is_active_idx" ON "berth_assignments" ("is_active")`;

        console.log("  ✓ Sve tablice (clubs, piers, berths, berth_assignments) su spremne.");
    } catch (err: any) {
        console.warn("  ⚠️ Upozorenje pri provjeri tablica:", err?.message || err);
    }

    const db = drizzle(client);

    // 1. Seed Klubova
    console.log("📍 [1/3] Provjera i seed matičnih klubova...");
    for (const club of CLUBS_CONFIG) {
        const existing = await db.select().from(clubs).where(eq(clubs.code, club.code));
        if (existing.length === 0) {
            await db.insert(clubs).values(club);
            console.log(`  ➕ Kreiran klub: ${club.name} (${club.code})`);
        } else {
            console.log(`  ✓ Klub već postoji: ${club.name}`);
        }
    }

    // 2. Seed Gatova (Piers)
    console.log("📍 [2/3] Provjera i seed gatova i cjelina akvatorija (14 cjelina)...");
    const pierMap = new Map<string, string>(); // code -> id

    for (const p of PIERS_CONFIG) {
        const existing = await db.select().from(piers).where(eq(piers.code, p.code));
        let pierId: string;
        if (existing.length === 0) {
            const [inserted] = await db.insert(piers).values({
                code: p.code,
                name: p.name,
                pierType: p.pierType,
                totalBerths: p.totalBerths,
                sortOrder: p.sortOrder,
                isActive: true,
            }).returning({ id: piers.id });
            pierId = inserted.id;
            console.log(`  ➕ Kreiran gat: ${p.name} (${p.code}) — kapacitet: ${p.totalBerths} vezova`);
        } else {
            pierId = existing[0].id;
            console.log(`  ✓ Gat već postoji: ${p.name} (${p.code}) — kapacitet: ${existing[0].totalBerths} vezova`);
        }
        pierMap.set(p.code, pierId);
    }

    // 3. Seed pojedinačnih morskih vezova (811 vezova)
    console.log("📍 [3/3] Provjera i generiranje pojedinačnih vezova (cilj: 811 vezova)...");
    let totalCreatedBerths = 0;

    for (const p of PIERS_CONFIG) {
        const pierId = pierMap.get(p.code)!;
        const existingBerths = await db.select().from(berths).where(eq(berths.pierId, pierId));

        if (existingBerths.length === 0) {
            const berthsToInsert = [];
            for (let i = 1; i <= p.totalBerths; i++) {
                const numStr = i.toString().padStart(2, "0");
                const code = `${p.prefix}${numStr}`;
                const side = p.pierType === "quay" || p.pierType === "breakwater"
                    ? "quay" as const
                    : (i % 2 !== 0 ? "left" as const : "right" as const);

                berthsToInsert.push({
                    pierId,
                    code,
                    berthNumber: i,
                    side,
                    maxLoaM: "10.00",
                    maxBeamM: "3.20",
                    maxDraftM: "2.50",
                    status: "vacant" as const,
                    hasElectricity: true,
                    hasWater: true,
                    sortOrder: i,
                });
            }

            // Bulk insert po gatu
            await db.insert(berths).values(berthsToInsert);
            totalCreatedBerths += berthsToInsert.length;
            console.log(`  ➕ Za ${p.name} (${p.code}) generirano svih ${berthsToInsert.length} vezova (${berthsToInsert[0].code} - ${berthsToInsert[berthsToInsert.length - 1].code})`);
        } else {
            console.log(`  ✓ ${p.name} već ima ${existingBerths.length} definiranih vezova`);
        }
    }

    console.log(`\n🎉 Inicijalizacija završena! Ukupno novostvoreno: ${totalCreatedBerths} vezova.`);
    await client.end();
}

// Izvrši ako se pokreće direktno
if (process.argv[1]?.includes("seedAkvatorij")) {
    seedAkvatorij().catch((err) => {
        console.error("Greška pri seedingu akvatorija:", err);
        process.exit(1);
    });
}
