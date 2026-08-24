import { getDb } from "../db";
import { clubs, piers, berths } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const PIERS_CONFIG = [
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

export const CLUBS_CONFIG = [
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

export async function ensureAkvatorijSeeded(customDb?: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
    const db = customDb || (await getDb());
    if (!db) return;

    // 1. Seed Clubs
    for (const club of CLUBS_CONFIG) {
        const existing = await db.select().from(clubs).where(eq(clubs.code, club.code)).limit(1);
        if (existing.length === 0) {
            await db.insert(clubs).values(club).onConflictDoNothing();
        }
    }

    // 2. Seed Piers
    const pierMap = new Map<string, string>();
    for (const p of PIERS_CONFIG) {
        const existing = await db.select().from(piers).where(eq(piers.code, p.code)).limit(1);
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
        } else {
            pierId = existing[0].id;
        }
        pierMap.set(p.code, pierId);
    }

    // 3. Seed Berths (811)
    let createdCount = 0;
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

            await db.insert(berths).values(berthsToInsert).onConflictDoNothing();
            createdCount += berthsToInsert.length;
        }
    }

    if (createdCount > 0) {
        console.log(`[AkvatorijSeed] Inicijalizirano ${createdCount} vezova.`);
    }
}
