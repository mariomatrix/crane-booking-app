import "dotenv/config";
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { like, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { checkTeamCapacity, isVesselCurrentlyOnLand } from "./db";
import {
  cranes,
  reservations,
  landZones,
  landOccupancies,
  vessels,
  serviceTypes,
  users,
  workOrders,
  userCardEntries,
  craneOperationLog,
} from "../drizzle/schema";
import {
  requireTestDb,
  ensureBaseTestFixtures,
  TEST_USER_IDS,
  TEST_CRANE_IDS,
} from "./testUtils/dbTestHarness";
import {
  issueMobileOperatorToken,
  verifyMobileOperatorSession,
  resolveActiveUserById,
} from "./services/authPolicyService";
import {
  startReservationWorkOrder,
  completeReservationOperation,
} from "./services/workOrderService";

beforeAll(async () => {
  await ensureBaseTestFixtures();
});

// ─── Test Helpers ────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: TEST_USER_IDS.user,
    email: "user@example.com",
    passwordHash: null,
    googleId: null,
    firstName: "Test",
    lastName: "User",
    name: "Test User",
    phone: null,
    oib: null,
    jmbgHash: null,
    isLegalEntity: false,
    companyName: null,
    contactPerson: null,
    address: null,
    city: "Split",
    postalCode: "21000",
    clientCategory: "member",
    role: "user",
    userStatus: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    image: null,
    anonymizedAt: null,
    mustChangePassword: false,
    loginMethod: "manus",
    pinCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createMockAdmin(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createMockUser({
    id: TEST_USER_IDS.admin,
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    ...overrides,
  });
}

function createMockOperator(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createMockUser({
    id: TEST_USER_IDS.operator,
    email: "operator@example.com",
    name: "Operator User",
    role: "operator",
    ...overrides,
  });
}

type CookieCall = { name: string; options: Record<string, unknown> };

function createContext(user: AuthenticatedUser | null): TrpcContext {
  const clearedCookies: CookieCall[] = [];
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
}

// ─── Auth Tests ──────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user when authenticated", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.email).toBe("user@example.com");
    expect(result?.role).toBe("user");
  });
});

// ─── Crane Procedures Tests ─────────────────────────────────────────

describe("crane.list", () => {
  it("returns an array (public procedure)", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.crane.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("crane.create", () => {
  it("rejects non-admin/operator users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.create({
        name: "Test Crane",
        type: "portalna",
        maxCapacityKN: 100,
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.create({
        name: "Test Crane",
        type: "portalna",
        maxCapacityKN: 100,
      })
    ).rejects.toThrow();
  });

  it("allows admin/operator to create a crane", async () => {
    const admin = createMockAdmin();
    const ctx = createContext(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.crane.create({
      name: "Liebherr LTM 1300",
      type: "mobilna",
      maxCapacityKN: 300,
      description: "Heavy mobile crane",
      location: "Zagreb",
    });
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
    // Clean up created test crane immediately so DB is not polluted
    const db = await requireTestDb();
    await db.delete(cranes).where(eq(cranes.id, result.id));
  });
});

describe("crane.update", () => {
  it("rejects non-admin/operator users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.update({ id: "0c2a8f94-912b-45b6-bc25-2efc188b64e0", name: "Updated" })
    ).rejects.toThrow();
  });
});

describe("crane.delete", () => {
  it("rejects non-admin/operator users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.crane.delete({ id: "0c2a8f94-912b-45b6-bc25-2efc188b64e0" })).rejects.toThrow();
  });
});

// ─── Reservation Procedures Tests ────────────────────────────────────

describe("reservation.create", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reservation.create({
        serviceTypeId: "b21e8e50-9d0d-45db-9c3f-c6b2b736b043",
        requestedDate: "2026-03-01",
        vesselType: "jedrilica",
        contactPhone: "123456",
      })
    ).rejects.toThrow();
  });

  it("validates contactPhone length", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reservation.create({
        serviceTypeId: "b21e8e50-9d0d-45db-9c3f-c6b2b736b043",
        requestedDate: "2026-03-05",
        vesselType: "jedrilica",
        contactPhone: "123", // too short!
      })
    ).rejects.toThrow();
  });
});

describe("reservation.myReservations", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.myReservations()).rejects.toThrow();
  });

  it("returns array for authenticated users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reservation.myReservations();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("reservation.listAll (admin)", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.listAll({})).rejects.toThrow();
  });

  it("returns paginated object with data array for admin users", async () => {
    const admin = createMockAdmin();
    const ctx = createContext(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reservation.listAll({});
    expect(result).toHaveProperty("data");
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("reservation.approve", () => {
  it("rejects non-operator/admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.approve({ id: "e34360e2-65a4-4a4a-a035-7f38df0b62e4", craneId: "0c2a8f94-912b-45b6-bc25-2efc188b64e0", scheduledStart: new Date() })).rejects.toThrow();
  });
});

describe("reservation.reject", () => {
  it("rejects non-operator/admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.reject({ id: "e34360e2-65a4-4a4a-a035-7f38df0b62e4" })).rejects.toThrow();
  });
});

// ─── Calendar Procedures Tests ───────────────────────────────────────

describe("calendar.events", () => {
  it("rejects unauthenticated/public users (operatorProcedure)", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.calendar.events()).rejects.toThrow();
  });

  it("returns an array for operator", async () => {
    const operator = createMockOperator();
    const ctx = createContext(operator);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.events();
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts optional crane type filter for operator", async () => {
    const operator = createMockOperator();
    const ctx = createContext(operator);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.events({ craneId: "0c2a8f94-912b-45b6-bc25-2efc188b64e0" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Audit Log Tests ─────────────────────────────────────────────────

describe("audit.list", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.audit.list()).rejects.toThrow();
  });

  it("returns array for admin users", async () => {
    const admin = createMockAdmin();
    const ctx = createContext(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.audit.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Team Capacity & Crane Moving (3 Cranes - 2 Teams) ───────────────

describe("Team Capacity & Crane Moving (3 cranes - 2 teams)", () => {
  beforeEach(async () => {
    const db = await requireTestDb();
    await db.delete(reservations).where(like(reservations.vesselRegistration, "BOAT-%"));
  });

  it("allows moving a reservation from Crane 1 to Crane 3 when 2 cranes are booked at the same time", async () => {
    const db = await requireTestDb();

    // Use the 3 controlled test cranes
    const crane1Id = TEST_CRANE_IDS.crane1;
    const crane2Id = TEST_CRANE_IDS.crane2;
    const crane3Id = TEST_CRANE_IDS.crane3;

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");

    const [resA] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane1Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-A",
    }).returning();

    const [resB] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane2Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-B",
    }).returning();

    // Check capacity when moving resA to crane3 (excluding resA)
    const cap = await checkTeamCapacity(start, end, crane3Id, resA.id, 2);
    expect(cap.hasCapacity).toBe(true);
    expect(cap.busyCranesCount).toBe(1);

    // Now test through trpc reschedule mutation
    const operator = createMockOperator();
    const ctx = createContext(operator);
    const caller = appRouter.createCaller(ctx);

    const rescheduleResult = await caller.reservation.reschedule({
      id: resA.id,
      scheduledStart: start,
      scheduledEnd: end,
      craneId: crane3Id,
    });
    expect(rescheduleResult).toHaveProperty("success", true);

    // Verify in db that resA is now on crane3
    const updatedResA = await caller.reservation.getById({ id: resA.id });
    expect(updatedResA.craneId).toBe(crane3Id);

    // Clean up
    await db.delete(reservations).where(like(reservations.vesselRegistration, "BOAT-%"));
  });

  it("does not let next-slot appointment bleed into current slot capacity", async () => {
    const db = await requireTestDb();

    // Use the 3 controlled test cranes
    const crane1Id = TEST_CRANE_IDS.crane1;
    const crane2Id = TEST_CRANE_IDS.crane2;
    const crane3Id = TEST_CRANE_IDS.crane3;

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");
    const nextStart = new Date("2026-11-10T09:30:00Z");
    const nextEnd = new Date("2026-11-10T10:00:00Z");

    const [resA] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane1Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-A",
    }).returning();

    const [resB] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane2Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-B",
    }).returning();

    // Next boat on crane 1 starting at 09:30
    const [resC] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane1Id,
      scheduledStart: nextStart,
      scheduledEnd: nextEnd,
      status: "approved",
      vesselRegistration: "BOAT-C",
    }).returning();

    // Moving resA (09:00-09:30) to crane 3 should NOT see resC as overlapping capacity
    const cap = await checkTeamCapacity(start, end, crane3Id, resA.id, 2);
    expect(cap.hasCapacity).toBe(true);
    expect(cap.busyCranesCount).toBe(1);

    const operator = createMockOperator();
    const ctx = createContext(operator);
    const caller = appRouter.createCaller(ctx);

    const res = await caller.reservation.reschedule({
      id: resA.id,
      scheduledStart: start,
      scheduledEnd: end,
      craneId: crane3Id,
    });
    expect(res).toHaveProperty("success", true);

    await db.delete(reservations).where(like(reservations.vesselRegistration, "BOAT-%"));
  });

  it("blocks booking a 3rd concurrent crane without override and allows it with override", async () => {
    const db = await requireTestDb();

    // Use the 3 controlled test cranes
    const crane1Id = TEST_CRANE_IDS.crane1;
    const crane2Id = TEST_CRANE_IDS.crane2;
    const crane3Id = TEST_CRANE_IDS.crane3;

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");

    await db.insert(reservations).values([
      {
        userId: TEST_USER_IDS.user,
        craneId: crane1Id,
        scheduledStart: start,
        scheduledEnd: end,
        status: "approved",
        vesselRegistration: "BOAT-1",
      },
      {
        userId: TEST_USER_IDS.user,
        craneId: crane2Id,
        scheduledStart: start,
        scheduledEnd: end,
        status: "approved",
        vesselRegistration: "BOAT-2",
      },
    ]);

    // Reserving 3rd crane at 09:00-09:30 without excludeReservationId:
    const cap = await checkTeamCapacity(start, end, crane3Id, undefined, 2);
    expect(cap.hasCapacity).toBe(false);
    expect(cap.busyCranesCount).toBe(2);

    // Create a 3rd reservation at an earlier time
    const [res3] = await db.insert(reservations).values({
      userId: TEST_USER_IDS.user,
      craneId: crane3Id,
      scheduledStart: new Date("2026-11-10T08:00:00Z"),
      scheduledEnd: new Date("2026-11-10T08:30:00Z"),
      status: "approved",
      vesselRegistration: "BOAT-3",
    }).returning();

    const operator = createMockOperator();
    const ctx = createContext(operator);
    const caller = appRouter.createCaller(ctx);

    // Rescheduling res3 into 09:00-09:30 (when c1 and c2 are both active) without override must fail
    await expect(
      caller.reservation.reschedule({
        id: res3.id,
        scheduledStart: start,
        scheduledEnd: end,
        craneId: crane3Id,
      })
    ).rejects.toThrow("override");

    // Rescheduling with override must succeed
    const overrideResult = await caller.reservation.reschedule({
      id: res3.id,
      scheduledStart: start,
      scheduledEnd: end,
      craneId: crane3Id,
      overrideTeamCapacity: true,
    });
    expect(overrideResult).toHaveProperty("success", true);

    await db.delete(reservations).where(like(reservations.vesselRegistration, "BOAT-%"));
  });

  describe("Vessel on land restriction (lift_from_sea)", () => {
    it("correctly detects if a vessel is on land via ID or registration", async () => {
      const db = await requireTestDb();

      const uid = Date.now();
      const shortUid = String(uid).slice(-6);
      const reg = `TLAND-A-${uid}`;

      const [zone] = await db.insert(landZones).values({
        name: `Zona Test ${uid}`,
        code: `ZA-${shortUid}`,
        totalSpots: 10,
        manualOccupiedSpots: 1,
        isActive: true,
      }).returning();

      const [vessel] = await db.insert(vessels).values({
        name: "Brod Na Kopnu",
        registration: reg,
        ownerId: TEST_USER_IDS.user,
        type: "jedrilica",
      }).returning();

      let occId: string | null = null;
      try {
        const [occ] = await db.insert(landOccupancies).values({
          vesselId: vessel.id,
          userId: vessel.ownerId,
          zoneId: zone.id,
          spotNumber: 1,
          liftedAt: new Date(),
        }).returning();
        occId = occ.id;

        // Check by ID
        const resById = await isVesselCurrentlyOnLand(vessel.id);
        expect(resById.onLand).toBe(true);
        expect(resById.zoneName).toBe(`Zona Test ${uid}`);
        expect(resById.spotNumber).toBe(1);

        // Check by registration
        const resByReg = await isVesselCurrentlyOnLand(undefined, reg.toLowerCase());
        expect(resByReg.onLand).toBe(true);

        // After return (returnedAt is set), should not be on land
        await db.update(landOccupancies).set({ returnedAt: new Date() }).where(eq(landOccupancies.id, occ.id));
        const resAfterReturn = await isVesselCurrentlyOnLand(vessel.id);
        expect(resAfterReturn.onLand).toBe(false);
      } finally {
        if (occId) await db.delete(landOccupancies).where(eq(landOccupancies.id, occId)).catch(() => {});
        await db.delete(vessels).where(eq(vessels.id, vessel.id)).catch(() => {});
        await db.delete(landZones).where(eq(landZones.id, zone.id)).catch(() => {});
      }
    });

    it("blocks reservation creation for lift_from_sea if vessel is on land, but allows lower_to_sea", async () => {
      const db = await requireTestDb();

      const uid = Date.now();
      const shortUid = String(uid).slice(-6);
      const reg = `TLAND-B-${uid}`;

      const [zone] = await db.insert(landZones).values({
        name: `Zona Test B ${uid}`,
        code: `ZB-${shortUid}`,
        totalSpots: 10,
        manualOccupiedSpots: 1,
        isActive: true,
      }).returning();

      const [vessel] = await db.insert(vessels).values({
        name: "Brod Na Kopnu 2",
        registration: reg,
        ownerId: TEST_USER_IDS.user,
        type: "jedrilica",
      }).returning();

      let occId: string | null = null;
      let liftId: string | null = null;
      let lowerId: string | null = null;
      let lowerResId: string | null = null;

      try {
        const [occ] = await db.insert(landOccupancies).values({
          vesselId: vessel.id,
          userId: vessel.ownerId,
          zoneId: zone.id,
          spotNumber: 2,
          liftedAt: new Date(),
        }).returning();
        occId = occ.id;

        const [liftService] = await db.insert(serviceTypes).values({
          name: `Vađenje iz mora (${uid})`,
          operationCategory: "lift_from_sea",
          defaultDurationMin: 60,
          isActive: true,
        }).returning();
        liftId = liftService.id;

        const [lowerService] = await db.insert(serviceTypes).values({
          name: `Spuštanje u more (${uid})`,
          operationCategory: "lower_to_sea",
          defaultDurationMin: 60,
          isActive: true,
        }).returning();
        lowerId = lowerService.id;

        const user = createMockUser();
        const ctx = createContext(user);
        const caller = appRouter.createCaller(ctx);

        // Attempting lift_from_sea on vessel that is on land must fail
        await expect(
          caller.reservation.create({
            serviceTypeId: liftService.id,
            requestedDate: "2026-11-15",
            requestedTimeSlot: "jutro",
            vesselId: vessel.id,
            vesselRegistration: reg,
            vesselType: "jedrilica",
          })
        ).rejects.toThrow("Plovilo se već nalazi na kopnu");

        // Attempting waitlist on lower_to_sea must fail
        await expect(
          caller.reservation.create({
            serviceTypeId: lowerService.id,
            requestedDate: "2026-11-15",
            requestedTimeSlot: "jutro",
            vesselId: vessel.id,
            vesselRegistration: reg,
            vesselType: "jedrilica",
            status: "waitlisted",
          })
        ).rejects.toThrow("Nije moguće staviti klijenta na listu čekanja za suhi vez kod operacije spuštanja u more");

        // lower_to_sea should succeed
        const lowerRes = await caller.reservation.create({
          serviceTypeId: lowerService.id,
          requestedDate: "2026-11-15",
          requestedTimeSlot: "jutro",
          vesselId: vessel.id,
          vesselRegistration: reg,
          vesselType: "jedrilica",
        });
        expect(lowerRes).toBeDefined();
        expect(lowerRes).toHaveProperty("id");
        expect(lowerRes).toHaveProperty("reservationNumber");
        lowerResId = lowerRes.id;
      } finally {
        if (lowerResId) await db.delete(reservations).where(eq(reservations.id, lowerResId)).catch(() => {});
        if (liftId || lowerId) {
          const ids = [liftId, lowerId].filter(Boolean) as string[];
          await db.delete(serviceTypes).where(inArray(serviceTypes.id, ids)).catch(() => {});
        }
        if (occId) await db.delete(landOccupancies).where(eq(landOccupancies.id, occId)).catch(() => {});
        await db.delete(vessels).where(eq(vessels.id, vessel.id)).catch(() => {});
        await db.delete(landZones).where(eq(landZones.id, zone.id)).catch(() => {});
      }
    });
  });

  describe("Negative Auth & End-to-End Work Order Domain Flow", () => {
    it("rejects regular member on operator/admin procedures (calendar.events, workOrders, landDispatch)", async () => {
      const member = createMockUser();
      const caller = appRouter.createCaller(createContext(member));

      await expect(caller.calendar.events()).rejects.toThrow();
      await expect(
        caller.workOrders.startFromReservation({
          reservationId: "00000000-0000-0000-0000-000000000001",
          craneId: TEST_CRANE_IDS.crane1,
        })
      ).rejects.toThrow();
      await expect(
        caller.landDispatch.getDailyOverview({ dateStr: "2026-11-10" })
      ).rejects.toThrow();
    });

    it("rejects anonymized or downgraded operator in live mobile auth policy check", async () => {
      const db = await requireTestDb();
      const tempUserId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

      await db
        .insert(users)
        .values({
          id: tempUserId,
          email: "temp-op@example.com",
          name: "Temp Operator",
          role: "operator",
          userStatus: "active",
        })
        .onConflictDoNothing();

      try {
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-key-for-unit-tests-12345";
        const token = await issueMobileOperatorToken({
          id: tempUserId,
          email: "temp-op@example.com",
          name: "Temp Operator",
          role: "operator",
        });

        // Initially valid
        const validSession = await verifyMobileOperatorSession(`Bearer ${token}`);
        expect(validSession).not.toBeNull();
        expect(validSession?.id).toBe(tempUserId);

        // Downgrade role to regular user -> mobile session must be rejected immediately
        await db.update(users).set({ role: "user" }).where(eq(users.id, tempUserId));
        const afterDowngrade = await verifyMobileOperatorSession(`Bearer ${token}`);
        expect(afterDowngrade).toBeNull();

        // Anonymize user -> resolveActiveUserById & mobile session must return null
        await db
          .update(users)
          .set({ role: "operator", anonymizedAt: new Date() })
          .where(eq(users.id, tempUserId));
        const activeCheck = await resolveActiveUserById(tempUserId);
        expect(activeCheck).toBeNull();
        const afterAnonymize = await verifyMobileOperatorSession(`Bearer ${token}`);
        expect(afterAnonymize).toBeNull();
      } finally {
        await db.delete(users).where(eq(users.id, tempUserId)).catch(() => {});
      }
    });

    it("executes full E2E work order start -> complete lifecycle and records card entry", async () => {
      const db = await requireTestDb();
      const uid = Date.now();
      let resId: string | null = null;
      let woId: string | null = null;

      // Schedule on an unbooked past date (2024-03-15) so work order can be started immediately without colliding with 2026 schedule
      const startSlot = new Date("2024-03-15T10:00:00Z");
      const endSlot = new Date("2024-03-15T11:00:00Z");

      try {
        const [res] = await db
          .insert(reservations)
          .values({
            reservationNumber: `E2E-${String(uid).slice(-8)}`,
            userId: TEST_USER_IDS.user,
            craneId: TEST_CRANE_IDS.crane1,
            scheduledStart: startSlot,
            scheduledEnd: endSlot,
            durationMin: 60,
            status: "approved",
            vesselRegistration: `BOAT-E2E-${uid}`,
            vesselLengthM: "10.00",
          })
          .returning();
        resId = res.id;

        const started = await startReservationWorkOrder({
          reservationId: res.id,
          craneId: TEST_CRANE_IDS.crane1,
          operatorId: TEST_USER_IDS.operator,
          operatorNotes: "E2E Start",
        });
        expect(started.workOrder.orderNumber).toMatch(/^RN-\d{4}-\d{5}$/);
        woId = started.workOrder.id;

        const completed = await completeReservationOperation({
          reservationId: res.id,
          operatorId: TEST_USER_IDS.operator,
          actualDurationMin: 45,
          operatorNotes: "E2E Complete",
        });
        expect(completed.workOrder?.id).toBe(woId);
        expect(completed.workOrder?.orderNumber).toBe(started.workOrder.orderNumber);

        const [updatedRes] = await db
          .select()
          .from(reservations)
          .where(eq(reservations.id, res.id));
        expect(updatedRes.status).toBe("completed");
      } finally {
        if (woId) {
          await db.delete(userCardEntries).where(eq(userCardEntries.workOrderId, woId)).catch(() => {});
          await db.delete(workOrders).where(eq(workOrders.id, woId)).catch(() => {});
        }
        if (resId) {
          await db.delete(craneOperationLog).where(eq(craneOperationLog.reservationId, resId)).catch(() => {});
          await db.delete(reservations).where(eq(reservations.id, resId)).catch(() => {});
        }
      }
    });
  });
});
