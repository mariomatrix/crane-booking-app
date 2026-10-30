import { getDb } from "../db";
import {
  users,
  cranes,
  seasons,
  landZones,
  landSpots,
  craneZoneAffinities,
  vessels,
} from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

export const TEST_USER_IDS = {
  user: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
  admin: "8a6042db-bb2b-42b7-a3f2-8924b130cf61",
  operator: "785df6a2-cf29-4700-a54c-5cb1f181be92",
} as const;

export const TEST_CRANE_IDS = {
  crane1: "7ad0d658-71a1-49cf-a96d-e38e914fbaa1",
  crane2: "e487c8cc-b5a5-4c21-a201-68b79212d3ba",
  crane3: "ee85e94d-8490-4d61-9c42-a4375f6382e6",
} as const;

export const TEST_VESSEL_ID = "c9f1a2b3-4d5e-4f6a-8b9c-0d1e2f3a4b5c";

/**
 * Fail-fast database getter for integration tests.
 * Never returns null silently — throws an explicit error if DATABASE_URL is missing or unreachable.
 */
export async function requireTestDb() {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "FAIL-FAST: Database connection (DATABASE_URL) is required for integration tests, but getDb() returned null."
    );
  }
  return db;
}

/**
 * Idempotently ensures controlled test fixtures exist in the database
 * WITHOUT deleting any shared or production data.
 */
export async function ensureBaseTestFixtures() {
  const db = await requireTestDb();

  // 1. Ensure controlled test users exist
  await db
    .insert(users)
    .values([
      {
        id: TEST_USER_IDS.user,
        email: "user@example.com",
        name: "Test User",
        role: "user",
        loginMethod: "manus",
        userStatus: "active",
      },
      {
        id: TEST_USER_IDS.admin,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        loginMethod: "manus",
        userStatus: "active",
      },
      {
        id: TEST_USER_IDS.operator,
        email: "operator@example.com",
        name: "Operator User",
        role: "operator",
        loginMethod: "manus",
        userStatus: "active",
      },
    ])
    .onConflictDoNothing();

  // 2. Ensure controlled 3 test cranes exist (never delete existing cranes)
  await db
    .insert(cranes)
    .values([
      {
        id: TEST_CRANE_IDS.crane1,
        name: "Travelift 50t",
        type: "travelift",
        maxCapacityKN: 500,
        maxPoolWidth: "5.20",
        location: "Bazen Špinut",
        craneStatus: "active",
      },
      {
        id: TEST_CRANE_IDS.crane2,
        name: "Stacionarna dizalica 9t",
        type: "portalna",
        maxCapacityKN: 90,
        location: "Riva Istok",
        craneStatus: "active",
      },
      {
        id: TEST_CRANE_IDS.crane3,
        name: "Stacionarna dizalica 5t",
        type: "portalna",
        maxCapacityKN: 50,
        location: "Riva Zapad",
        craneStatus: "active",
      },
    ])
    .onConflictDoNothing();

  // 3. Ensure a controlled test vessel exists
  await db
    .insert(vessels)
    .values({
      id: TEST_VESSEL_ID,
      ownerId: TEST_USER_IDS.user,
      name: "Test Plovilo Špinut",
      type: "jedrilica",
      lengthM: "9.50",
      beamM: "3.10",
      draftM: "1.80",
      weightTons: "4.50",
      registration: "ST-TEST-001",
    })
    .onConflictDoNothing();

  // 4. Ensure an active season covering 2026 exists
  const activeSeasons = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true));
  const has2026Season = activeSeasons.some(
    (s) => s.startDate <= "2026-01-01" && s.endDate >= "2026-12-31"
  );
  if (!has2026Season) {
    await db
      .insert(seasons)
      .values({
        name: "Test Season 2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        workingHours: {
          mon: { from: "07:00", to: "17:00" },
          tue: { from: "07:00", to: "17:00" },
          wed: { from: "07:00", to: "17:00" },
          thu: { from: "07:00", to: "17:00" },
          fri: { from: "07:00", to: "17:00" },
          sat: { from: "07:00", to: "14:00" },
          sun: { from: "08:00", to: "12:00" },
        },
        isActive: true,
      })
      .onConflictDoNothing();
  }

  // 5. Ensure standard 6 land zones, sample spots, and 18 crane-zone affinities exist
  const standardZones = [
    { code: "LB", name: "Lukobran", totalSpots: 18, sortOrder: 1 },
    { code: "SZ", name: "Servisna zona", totalSpots: 14, sortOrder: 2 },
    { code: "Z1", name: "Zona 1 — Istok", totalSpots: 12, sortOrder: 3 },
    { code: "Z2", name: "Zona 2 — Sredina", totalSpots: 12, sortOrder: 4 },
    { code: "Z3", name: "Zona 3 — Zapad", totalSpots: 10, sortOrder: 5 },
    { code: "PK", name: "Plato Kopno", totalSpots: 8, sortOrder: 6 },
  ];

  const existingZones = await db.select().from(landZones);
  if (existingZones.length < 6) {
    for (const z of standardZones) {
      await db
        .insert(landZones)
        .values({
          code: z.code,
          name: z.name,
          totalSpots: z.totalSpots,
          manualOccupiedSpots: 0,
          sortOrder: z.sortOrder,
          isActive: true,
        })
        .onConflictDoNothing();
    }
  }

  const allZones = await db.select().from(landZones);
  for (const z of allZones.slice(0, 6)) {
    const spotsInZone = await db
      .select()
      .from(landSpots)
      .where(eq(landSpots.zoneId, z.id))
      .limit(1);
    if (spotsInZone.length === 0) {
      await db
        .insert(landSpots)
        .values({
          zoneId: z.id,
          spotNumber: 1,
          code: `${z.code}-01`,
          maxLengthM: "14.00",
          maxBeamM: "4.50",
          maxWeightTons: "20.00",
          isActive: true,
          isBlocked: false,
          sortOrder: 1,
        })
        .onConflictDoNothing();
    }
  }

  const allAffinities = await db.select().from(craneZoneAffinities);
  if (allAffinities.length < 18) {
    const craneList = [
      TEST_CRANE_IDS.crane1,
      TEST_CRANE_IDS.crane2,
      TEST_CRANE_IDS.crane3,
    ];
    for (const z of allZones.slice(0, 6)) {
      const existingPrimary = allAffinities.find(
        (a) => a.zoneId === z.id && a.isPrimary
      );
      for (let idx = 0; idx < craneList.length; idx++) {
        const cId = craneList[idx];
        const isPrimary = !existingPrimary && idx === 0;
        await db
          .insert(craneZoneAffinities)
          .values({
            craneId: cId,
            zoneId: z.id,
            affinityScore: idx === 0 ? 90 : idx === 1 ? 70 : 50,
            extraTransportMinutes: idx * 5,
            penaltySlots: 0,
            priority: idx + 1,
            isPrimary,
            isAllowed: true,
            isBlocked: false,
            isActive: true,
          })
          .onConflictDoNothing();
      }
    }
  }

  return db;
}
