import "dotenv/config";
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { like, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, checkTeamCapacity, isVesselCurrentlyOnLand } from "./db";
import {
  users,
  cranes,
  reservations,
  auditLog,
  landZones,
  landOccupancies,
  landWaitingList,
  craneOperationLog,
  memberLinks,
  memberMemberships,
  userCardEntries,
  workOrders,
  memberStatutoryRights,
  syncConflicts,
  operatorCranes,
  vessels,
  seasons,
  serviceTypes,
} from "../drizzle/schema";

beforeAll(async () => {
  const db = await getDb();
  if (db) {
    // Clean up referencing tables first to avoid foreign key violations
    await db.delete(auditLog).catch(() => {});
    await db.delete(syncConflicts).catch(() => {});
    await db.delete(userCardEntries).catch(() => {});
    await db.delete(workOrders).catch(() => {});
    await db.delete(memberLinks).catch(() => {});
    await db.delete(memberMemberships).catch(() => {});
    await db.delete(memberStatutoryRights).catch(() => {});
    await db.delete(landWaitingList).catch(() => {});
    await db.delete(landOccupancies).catch(() => {});
    await db.delete(landZones).catch(() => {});
    await db.delete(craneOperationLog).catch(() => {});
    await db.delete(reservations).catch(() => {});
    await db.delete(operatorCranes).catch(() => {});
    await db.delete(vessels).catch(() => {});
    await db.delete(cranes).catch(() => {});
    await db.delete(users).catch(() => {});

    // Seed mock users (use onConflictDoNothing if already present in DB)
    await db.insert(users).values([
      {
        id: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
        email: "user@example.com",
        name: "Test User",
        role: "user",
        loginMethod: "manus",
        userStatus: "active",
      },
      {
        id: "8a6042db-bb2b-42b7-a3f2-8924b130cf61",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        loginMethod: "manus",
        userStatus: "active",
      },
      {
        id: "785df6a2-cf29-4700-a54c-5cb1f181be92",
        email: "operator@example.com",
        name: "Operator User",
        role: "operator",
        loginMethod: "manus",
        userStatus: "active",
      }
    ]).onConflictDoNothing();

    // Seed an active season for tests
    await db.insert(seasons).values({
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
    }).onConflictDoNothing();
  }
});

// ─── Test Helpers ────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
    openId: "test-user-1",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createMockAdmin(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createMockUser({
    id: "8a6042db-bb2b-42b7-a3f2-8924b130cf61",
    openId: "admin-1",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    ...overrides,
  });
}

function createMockOperator(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createMockUser({
    id: "785df6a2-cf29-4700-a54c-5cb1f181be92",
    openId: "operator-1",
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
    const db = await getDb();
    if (db) {
      await db.delete(reservations).where(like(reservations.vesselRegistration, "BOAT-%"));
    }
  });

  it("allows moving a reservation from Crane 1 to Crane 3 when 2 cranes are booked at the same time", async () => {
    const db = await getDb();
    if (!db) return;

    // Seed 3 active cranes if needed
    const crane1Id = "11111111-1111-4111-8111-111111111111";
    const crane2Id = "22222222-2222-4222-8222-222222222222";
    const crane3Id = "33333333-3333-4333-8333-333333333333";

    await db.insert(cranes).values([
      { id: crane1Id, name: "Dizalica 1", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane2Id, name: "Dizalica 2", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane3Id, name: "Dizalica 3", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
    ]).onConflictDoNothing();

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");

    const [resA] = await db.insert(reservations).values({
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
      craneId: crane1Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-A",
    }).returning();

    const [resB] = await db.insert(reservations).values({
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
    const db = await getDb();
    if (!db) return;

    const crane1Id = "11111111-1111-4111-8111-111111111111";
    const crane2Id = "22222222-2222-4222-8222-222222222222";
    const crane3Id = "33333333-3333-4333-8333-333333333333";

    await db.insert(cranes).values([
      { id: crane1Id, name: "Dizalica 1", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane2Id, name: "Dizalica 2", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane3Id, name: "Dizalica 3", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
    ]).onConflictDoNothing();

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");
    const nextStart = new Date("2026-11-10T09:30:00Z");
    const nextEnd = new Date("2026-11-10T10:00:00Z");

    const [resA] = await db.insert(reservations).values({
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
      craneId: crane1Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-A",
    }).returning();

    const [resB] = await db.insert(reservations).values({
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
      craneId: crane2Id,
      scheduledStart: start,
      scheduledEnd: end,
      status: "approved",
      vesselRegistration: "BOAT-B",
    }).returning();

    // Next boat on crane 1 starting at 09:30
    const [resC] = await db.insert(reservations).values({
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
    const db = await getDb();
    if (!db) return;

    const crane1Id = "11111111-1111-4111-8111-111111111111";
    const crane2Id = "22222222-2222-4222-8222-222222222222";
    const crane3Id = "33333333-3333-4333-8333-333333333333";

    await db.insert(cranes).values([
      { id: crane1Id, name: "Dizalica 1", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane2Id, name: "Dizalica 2", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
      { id: crane3Id, name: "Dizalica 3", craneType: "portalna", maxCapacityKN: 50, craneStatus: "active" },
    ]).onConflictDoNothing();

    const start = new Date("2026-11-10T09:00:00Z");
    const end = new Date("2026-11-10T09:30:00Z");

    await db.insert(reservations).values([
      {
        userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
        craneId: crane1Id,
        scheduledStart: start,
        scheduledEnd: end,
        status: "approved",
        vesselRegistration: "BOAT-1",
      },
      {
        userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
      userId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
      const db = await getDb();
      if (!db) return;

      const uid = Date.now();
      const reg = `TLAND-A-${uid}`;

      const [zone] = await db.insert(landZones).values({
        name: `Zona Test ${uid}`,
        code: `Z-${uid}`.slice(0, 20),
        capacity: 10,
        occupiedSpots: 1,
        isActive: true,
      }).returning();

      const [vessel] = await db.insert(vessels).values({
        name: "Brod Na Kopnu",
        registration: reg,
        ownerId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
      const db = await getDb();
      if (!db) return;

      const uid = Date.now();
      const reg = `TLAND-B-${uid}`;

      const [zone] = await db.insert(landZones).values({
        name: `Zona Test B ${uid}`,
        code: `ZB-${uid}`.slice(0, 20),
        capacity: 10,
        occupiedSpots: 1,
        isActive: true,
      }).returning();

      const [vessel] = await db.insert(vessels).values({
        name: "Brod Na Kopnu 2",
        registration: reg,
        ownerId: "1e29e924-4f05-4c60-a010-e7f53a479ff1",
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
});


