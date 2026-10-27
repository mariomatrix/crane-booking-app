/**
 * Initial Land State Import Script (Početno stanje na kopnu)
 * 
 * Reads 'RASPORED NA KOPNU.xlsx' and populates the database:
 * 1. Ensures zone 'MD' (Mala dizalica) and spots MD-01..MD-05 exist.
 * 2. Matches boats to existing vessels/users in database or creates new entries where needed.
 * 3. Populates 'land_occupancies' with active occupancies (returnedAt = null).
 * 4. Resets 'manualOccupiedSpots' to 0 on all land zones.
 * 5. Logs audit entry.
 * 
 * Run with:
 *   pnpm tsx server/scripts/importInitialLandState.ts
 */

import "dotenv/config";
import { getDb } from "../db";
import {
  landZones,
  landSpots,
  landOccupancies,
  vessels,
  users,
  auditLog,
  craneZoneAffinities,
  cranes,
} from "../../drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/\s+/g, "").replace(/[-_]/g, "");
}

function parseDate(rawDate: any): { date: Date; raw: string } {
  if (!rawDate || String(rawDate).trim() === "" || String(rawDate).trim() === "undefined") {
    return { date: new Date("2026-01-01T08:00:00Z"), raw: "Nije navedeno" };
  }
  const str = String(rawDate).trim();

  // od YYYY.
  const odMatch = str.match(/od\s+(\d{4})\.?/i);
  if (odMatch) {
    return { date: new Date(Date.UTC(parseInt(odMatch[1], 10), 0, 1, 8, 0, 0)), raw: str };
  }

  // X mj. YY.
  const mjMatch = str.match(/(\d{1,2})\s*mj\.?\s*(\d{2})\.?/i);
  if (mjMatch) {
    const month = parseInt(mjMatch[1], 10) - 1;
    const year = 2000 + parseInt(mjMatch[2], 10);
    return { date: new Date(Date.UTC(year, month, 1, 8, 0, 0)), raw: str };
  }

  // DD.MM.YY. or D.M.YY.
  const dmyMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})\.?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return { date: new Date(Date.UTC(year, month, day, 8, 0, 0)), raw: str };
  }

  return { date: new Date("2026-01-01T08:00:00Z"), raw: str };
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("❌ DB connection failed. Check DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("================================================================================");
  console.log("  PŠD ŠPINUT — UVOZ POČETNOG STANJA NA KOPNU (RASPORED NA KOPNU.xlsx)");
  console.log("================================================================================");

  // 1. Find Admin user for createdBy / auditLog
  const [adminUser] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  const adminId = adminUser?.id || null;
  console.log(`👤 Izvršitelj uvoza (Admin): ${adminUser?.name || adminUser?.email || "Sustav"}`);

  // 2. Ensure Zone 'MD' (Mala dizalica) exists
  let [mdZone] = await db.select().from(landZones).where(eq(landZones.code, "MD")).limit(1);
  if (!mdZone) {
    console.log("➕ Dodavanje zone 'MD' (Mala dizalica)...");
    const [inserted] = await db
      .insert(landZones)
      .values({
        name: "Mala dizalica",
        code: "MD",
        totalSpots: 5,
        manualOccupiedSpots: 0,
        description: "Plato i prostor uz malu dizalicu",
        sortOrder: 6,
        isActive: true,
      })
      .returning();
    mdZone = inserted;
  }

  // 3. Ensure spots for Zone 'MD' exist (MD-01 .. MD-05)
  const existingMdSpots = await db.select().from(landSpots).where(eq(landSpots.zoneId, mdZone.id));
  if (existingMdSpots.length === 0) {
    console.log("➕ Kreiranje pojedinačnih mjesta za zonu MD (MD-01 do MD-05)...");
    const spotsToInsert = [];
    for (let i = 1; i <= 5; i++) {
      spotsToInsert.push({
        zoneId: mdZone.id,
        spotNumber: i,
        code: `MD-${String(i).padStart(2, "0")}`,
        maxLengthM: "10.00",
        maxBeamM: "3.50",
        maxWeightTons: "5.00",
        isActive: true,
        isBlocked: false,
        sortOrder: i,
      });
    }
    await db.insert(landSpots).values(spotsToInsert);
  }

  // 4. Ensure affinity for Mala dizalica crane to zone MD exists
  try {
    const activeCranes = await db.select().from(cranes);
    const malaDizalicaCrane = activeCranes.find(c => c.name.toLowerCase().includes("mala"));
    if (malaDizalicaCrane) {
      const [existingAff] = await db
        .select()
        .from(craneZoneAffinities)
        .where(and(eq(craneZoneAffinities.craneId, malaDizalicaCrane.id), eq(craneZoneAffinities.zoneId, mdZone.id)))
        .limit(1);
      if (!existingAff) {
        await db.insert(craneZoneAffinities).values({
          craneId: malaDizalicaCrane.id,
          zoneId: mdZone.id,
          affinityScore: 100,
          extraTransportMinutes: 0,
          isPrimary: true,
          isBlocked: false,
          penaltySlots: 0,
          priority: 1,
          isAllowed: true,
          isActive: true,
          notes: "Primarna zona za malu dizalicu",
        });
      }
    }
  } catch (err) {
    console.warn("Napomena o crane affinity:", err);
  }

  // 5. Ensure placeholder user for unknown / guest owners exists
  let [placeholderUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "gost-kopno@spinut.hr"))
    .limit(1);

  if (!placeholderUser) {
    console.log("➕ Kreiranje sistemskog korisnika za neregistrirane vlasnike / goste...");
    const [inserted] = await db
      .insert(users)
      .values({
        email: "gost-kopno@spinut.hr",
        name: "Nepoznati vlasnik / Gost",
        firstName: "Gost",
        lastName: "Kopno",
        clientCategory: "commercial",
        role: "user",
        userStatus: "active",
        city: "Split",
        postalCode: "21000",
      })
      .returning();
    placeholderUser = inserted;
  }

  // 6. Load all zones, spots, vessels, and users
  const allZones = await db.select().from(landZones);
  const allSpots = await db.select().from(landSpots);
  const allVessels = await db.select().from(vessels);
  const allUsers = await db.select().from(users);

  const zoneMap: Record<string, string> = {
    "ARLA 1": "A1",
    "ARLA 2": "A2",
    "ARLA 3": "A3",
    "ZO": "ZO",
    "MD": "MD",
    "LU": "LB",
    "SZ": "SZ",
  };

  const wb = XLSX.readFile("RASPORED NA KOPNU.xlsx");

  // 7. Clear pre-existing occupancies if any
  const existingOccCount = await db.select({ count: sql<number>`count(*)` }).from(landOccupancies);
  if (Number(existingOccCount[0]?.count || 0) > 0) {
    console.log(`🧹 Brisanje prethodnih zapisa zauzeća (${existingOccCount[0]?.count})...`);
    await db.delete(landOccupancies);
  }

  let totalBoats = 0;
  let vesselsCreatedCount = 0;
  let usersCreatedCount = 0;
  const occupanciesToInsert: any[] = [];

  // Memory caches for newly created items during the run
  const localVessels = [...allVessels];
  const localUsers = [...allUsers];

  for (const sheetName of wb.SheetNames) {
    const zoneCode = zoneMap[sheetName];
    if (!zoneCode) {
      console.warn(`⚠️ Nepoznati sheet: ${sheetName}, preskačem.`);
      continue;
    }

    const zone = allZones.find(z => z.code === zoneCode);
    if (!zone) {
      console.error(`❌ Zona s kodom ${zoneCode} nije pronađena u bazi!`);
      continue;
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const boatRows = rows.slice(1).filter((r: any) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== "");

    console.log(`\n🚢 Obrada sekcije: ${sheetName} (Zona [${zone.code}] "${zone.name}") — ${boatRows.length} plovila`);

    for (const r of boatRows) {
      totalBoats++;
      const spotNum = Number(r[0]);
      const reg = String(r[1]).trim();
      const rawDate = r[2];
      const owner = r[3] ? String(r[3]).trim() : "";
      const pos = r[4] ? String(r[4]).trim() : "";
      const hasOrder = r[5] ? String(r[5]).trim() : "";
      const berth = r[6] ? String(r[6]).trim() : "";
      const phone = r[7] ? String(r[7]).trim() : "";
      const note = r[8] ? String(r[8]).trim() : "";

      const { date: liftedAt, raw: dateRaw } = parseDate(rawDate);

      // Find spot in landSpots
      const spot = allSpots.find(s => s.zoneId === zone.id && s.spotNumber === spotNum);
      if (!spot) {
        console.warn(`⚠️ Mjesto broj ${spotNum} u zoni ${zone.code} nije pronađeno u land_spots!`);
      }

      // 1. Vessel resolution
      let targetVessel = localVessels.find(v => v.registration && normalizeReg(v.registration) === normalizeReg(reg));

      // 1b. Check note for alternate registration
      if (!targetVessel && note) {
        const altMatch = note.match(/stvarna registracija[:\s]+([A-Z0-9\-_]+)/i)
          || note.match(/stvarna reg\.?[:\s]+([A-Z0-9\-_]+)/i)
          || note.match(/([A-Z]{2}[-_ ]?[0-9]{3,6})/i);
        if (altMatch) {
          const altNorm = normalizeReg(altMatch[1]);
          targetVessel = localVessels.find(v => v.registration && normalizeReg(v.registration) === altNorm);
        }
      }

      // 1c. Check vessel by boat name
      if (!targetVessel) {
        targetVessel = localVessels.find(v => v.name && v.name.trim().toLowerCase() === reg.toLowerCase());
      }

      // 2. Owner user resolution
      let targetUser = targetVessel ? localUsers.find(u => u.id === targetVessel!.ownerId) : null;

      if (!targetUser && owner) {
        // Specific name matching
        if (owner.toLowerCase().startsWith("radina")) {
          let uRadina = localUsers.find(u => u.name?.toLowerCase().includes("radina b"));
          if (!uRadina) {
            const [newU] = await db
              .insert(users)
              .values({
                name: "Radina B.",
                lastName: "Radina",
                firstName: "B.",
                phone: phone || "098634128",
                role: "user",
                clientCategory: "commercial",
                city: "Split",
                postalCode: "21000",
              })
              .returning();
            uRadina = newU;
            localUsers.push(newU);
            usersCreatedCount++;
          }
          targetUser = uRadina;
        } else if (owner.toLowerCase().startsWith("ivančević n")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("nikola ivančević")) || null;
        } else if (owner.toLowerCase().startsWith("mladinić m")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("mario mladinić")) || null;
        } else if (owner.toLowerCase().startsWith("dujmović m")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("marin dujmović")) || null;
        } else if (owner.toLowerCase().startsWith("šakić")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("branko šakić")) || null;
        } else if (owner.toLowerCase().startsWith("sekulić")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("nikola sekulić")) || null;
        } else if (owner.toLowerCase().startsWith("barić f")) {
          targetUser = localUsers.find(u => u.name?.toLowerCase().includes("filip barišić")) || null;
          if (!targetUser) {
            const [newU] = await db
              .insert(users)
              .values({
                name: "Barić F.",
                lastName: "Barić",
                firstName: "F.",
                role: "user",
                clientCategory: "commercial",
                city: "Split",
                postalCode: "21000",
              })
              .returning();
            targetUser = newU;
            localUsers.push(newU);
            usersCreatedCount++;
          }
        } else {
          // General owner surname search
          const parts = owner.split(/[\s.]+/).filter(p => p.length > 2);
          targetUser = localUsers.find(u => {
            const uFull = `${u.firstName || ''} ${u.lastName || ''} ${u.name || ''}`.toLowerCase();
            return parts.some(p => uFull.includes(p.toLowerCase()));
          }) || null;
        }
      }

      if (!targetUser) {
        targetUser = placeholderUser;
      }

      // 3. Create vessel if not found
      if (!targetVessel) {
        let vType: "jedrilica" | "motorni" | "katamaran" | "ostalo" = "motorni";
        const lowerDesc = `${reg} ${note}`.toLowerCase();
        if (lowerDesc.includes("jedrilic") || lowerDesc.includes("jed.") || lowerDesc.includes("dufour")) {
          vType = "jedrilica";
        } else if (lowerDesc.includes("katamaran") || lowerDesc.includes("pajot")) {
          vType = "katamaran";
        }

        const isFormalReg = /^[A-ZŠĐČĆŽ]{2}[-_ ]?[0-9]+/i.test(reg) || /^[0-9]+[-_ ][A-ZŠĐČĆŽ]{2}/i.test(reg);
        const vesselReg = isFormalReg ? reg : null;
        const vesselName = !isFormalReg ? reg : (owner ? `${reg} (${owner})` : reg);

        console.log(`   ➕ Kreiranje novog plovila: "${vesselName}" (reg: ${vesselReg || 'N/A'}, tip: ${vType}) za korisnika: ${targetUser.name}`);

        const [newVessel] = await db
          .insert(vessels)
          .values({
            ownerId: targetUser.id,
            name: vesselName,
            type: vType,
            registration: vesselReg,
          })
          .returning();

        targetVessel = newVessel;
        localVessels.push(newVessel);
        vesselsCreatedCount++;
      }

      // 4. Build structured note preserving 100% of operator's data
      const noteSegments: string[] = [];
      if (pos) noteSegments.push(`Pozicija: ${pos}`);
      if (hasOrder) noteSegments.push(`Radni nalog: ${hasOrder}`);
      if (berth) noteSegments.push(`Morski vez: ${berth}`);
      if (phone) noteSegments.push(`Tel: ${phone}`);
      if (owner) noteSegments.push(`Vlasnik (evidencija): ${owner}`);
      if (dateRaw && dateRaw !== "Nije navedeno") noteSegments.push(`Izvorno vađenje: ${dateRaw}`);
      if (note) noteSegments.push(`Napomena operatera: ${note}`);

      const fullNote = noteSegments.join(" | ");

      occupanciesToInsert.push({
        vesselId: targetVessel.id,
        userId: targetUser.id,
        zoneId: zone.id,
        spotId: spot?.id || null,
        spotNumber: spotNum,
        liftedAt,
        returnedAt: null,
        note: fullNote,
        createdBy: adminId,
      });

      console.log(`   ✅ Mjesto ${zone.code}-${String(spotNum).padStart(2, "0")} ➔ Plovilo: "${targetVessel.name}" (${targetVessel.registration || "bez reg."}) | Vlasnik: ${targetUser.name} | Datum: ${liftedAt.toISOString().slice(0, 10)}`);
    }
  }

  // 8. Bulk insert all occupancies
  console.log(`\n💾 Spremanje ${occupanciesToInsert.length} zauzeća u tablicu 'land_occupancies'...`);
  for (let i = 0; i < occupanciesToInsert.length; i += 25) {
    await db.insert(landOccupancies).values(occupanciesToInsert.slice(i, i + 25));
  }

  // 9. Reset manualOccupiedSpots to 0 across all land zones
  console.log("🔄 Resetiranje 'manualOccupiedSpots' na 0 u svim zonama...");
  await db.update(landZones).set({ manualOccupiedSpots: 0, updatedAt: new Date() });

  // 10. Write Audit Log
  if (adminId) {
    await db.insert(auditLog).values({
      actorId: adminId,
      action: "initial_land_occupancy_import",
      entityType: "land_occupancy",
      entityId: adminId,
      payload: {
        totalBoats,
        vesselsCreatedCount,
        usersCreatedCount,
        importedAt: new Date().toISOString(),
        sourceFile: "RASPORED NA KOPNU.xlsx",
      },
    });
  }

  // 11. Final Report & Verification
  console.log("\n================================================================================");
  console.log("  REZULTATI UVOZA POČETNOG STANJA KOPNA");
  console.log("================================================================================");
  console.log(`Ukupno obrađeno plovila iz Excela: ${totalBoats}`);
  console.log(`Evidentirano zauzeća u bazi:       ${occupanciesToInsert.length}`);
  console.log(`Povezano postojećih plovila:       ${totalBoats - vesselsCreatedCount}`);
  console.log(`Novoizrađenih plovila:             ${vesselsCreatedCount}`);
  console.log(`Novoizrađenih korisnika:           ${usersCreatedCount}`);

  console.log("\n📊 STANJE POPUNJENOSTI PO ZONAMA NA KOPNU:");
  const finalZones = await db.select().from(landZones);
  const finalSummary = [];

  for (const z of finalZones.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const occs = await db
      .select({ count: sql<number>`count(*)` })
      .from(landOccupancies)
      .where(and(eq(landOccupancies.zoneId, z.id), isNull(landOccupancies.returnedAt)));
    const occupied = Number(occs[0]?.count || 0);
    const free = z.totalSpots - occupied;
    const pct = ((occupied / z.totalSpots) * 100).toFixed(1);
    finalSummary.push({
      Kod: z.code,
      Naziv: z.name,
      Kapacitet: z.totalSpots,
      Zauzeto: occupied,
      Slobodno: free,
      "Popunjenost (%)": `${pct}%`,
    });
  }

  console.table(finalSummary);
  console.log("================================================================================");
  console.log("  ✅ BAZA JE USPJEŠNO NAPUNJENA POČETNIM STANJEM NA KOPNU!");
  console.log("================================================================================\n");

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Greška prilikom uvoza:", err);
  process.exit(1);
});
