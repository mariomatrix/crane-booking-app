/**
 * Push Land State to Remote Server (dizalica.imagomatrix.com)
 * 
 * Reads 'RASPORED NA KOPNU.xlsx' and pushes the initial land state
 * to the remote production environment via MemberSync API.
 * 
 * Run with:
 *   pnpm tsx server/scripts/pushLandStateToRemote.ts
 */

import "dotenv/config";
import axios from "axios";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const REMOTE_URL = process.env.PRODUCTION_URL || "https://dizalica.imagomatrix.com";
const ENDPOINT = `${REMOTE_URL}/api/v1/member-sync/import-land-state`;

function parseDate(rawDate: any): { date: Date; raw: string } {
  if (!rawDate || String(rawDate).trim() === "" || String(rawDate).trim() === "undefined") {
    return { date: new Date("2026-01-01T08:00:00Z"), raw: "Nije navedeno" };
  }
  const str = String(rawDate).trim();

  const odMatch = str.match(/od\s+(\d{4})\.?/i);
  if (odMatch) {
    return { date: new Date(Date.UTC(parseInt(odMatch[1], 10), 0, 1, 8, 0, 0)), raw: str };
  }

  const mjMatch = str.match(/(\d{1,2})\s*mj\.?\s*(\d{2})\.?/i);
  if (mjMatch) {
    const month = parseInt(mjMatch[1], 10) - 1;
    const year = 2000 + parseInt(mjMatch[2], 10);
    return { date: new Date(Date.UTC(year, month, 1, 8, 0, 0)), raw: str };
  }

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
  const apiKey = process.env.SYNC_API_KEY || "6ab95669b2c44215bf6fe54d1a05357f0f65094c9d6915180121c0f2299f7adc";

  console.log("================================================================================");
  console.log(`  PŠD ŠPINUT — SLANJE POČETNOG STANJA KOPNA NA PRODUKCIJU (${REMOTE_URL})`);
  console.log("================================================================================");

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
  const items: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const zoneCode = zoneMap[sheetName];
    if (!zoneCode) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const boatRows = rows.slice(1).filter((r: any) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== "");

    for (const r of boatRows) {
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

      // Check note for alternate registration
      let altReg: string | null = null;
      if (note) {
        const altMatch = note.match(/stvarna registracija[:\s]+([A-Z0-9\-_]+)/i)
          || note.match(/stvarna reg\.?[:\s]+([A-Z0-9\-_]+)/i)
          || note.match(/([A-Z]{2}[-_ ]?[0-9]{3,6})/i);
        if (altMatch) {
          altReg = altMatch[1];
        }
      }

      // Build structured note
      const noteSegments: string[] = [];
      if (pos) noteSegments.push(`Pozicija: ${pos}`);
      if (hasOrder) noteSegments.push(`Radni nalog: ${hasOrder}`);
      if (berth) noteSegments.push(`Morski vez: ${berth}`);
      if (phone) noteSegments.push(`Tel: ${phone}`);
      if (owner) noteSegments.push(`Vlasnik (evidencija): ${owner}`);
      if (dateRaw && dateRaw !== "Nije navedeno") noteSegments.push(`Izvorno vađenje: ${dateRaw}`);
      if (note) noteSegments.push(`Napomena operatera: ${note}`);

      items.push({
        zoneCode,
        spotNumber: spotNum,
        reg,
        altReg,
        rawDate,
        liftedAt: liftedAt.toISOString(),
        owner,
        pos,
        hasOrder,
        berth,
        phone,
        note,
        fullNote: noteSegments.join(" | "),
      });
    }
  }

  console.log(`📦 Pripremljeno ${items.length} plovila za slanje na ${ENDPOINT}`);

  try {
    const res = await axios.post(
      ENDPOINT,
      {
        items,
        resetOccupancies: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-sync-api-key": apiKey,
          "Authorization": `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    console.log("\n================================================================================");
    console.log("  REZULTAT PRIJENOSA NA UDALJENU BAZU");
    console.log("================================================================================");
    console.log(`Poruka poslužitelja: ${res.data.message}`);
    console.log(`Ukupno uvezeno:     ${res.data.totalImported}`);
    console.log(`Novoizrađenih plovila:   ${res.data.vesselsCreatedCount}`);
    console.log(`Novoizrađenih korisnika: ${res.data.usersCreatedCount}`);

    console.log("\n📊 POPUNJENOST ZONA NA PRODUKCIJI:");
    console.table(res.data.breakdown);
    console.log("================================================================================\n");
  } catch (err: any) {
    console.error("❌ Greška pri slanju na poslužitelj:", err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }
}

main().catch(console.error);
