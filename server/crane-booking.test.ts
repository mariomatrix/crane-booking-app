import "dotenv/config";
import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users, cranes, reservations, auditLog, landZones, landOccupancies, landWaitingList, craneOperationLog } from "../drizzle/schema";

beforeAll(async () => {
  const db = await getDb();
  if (db) {
    // Clean up referencing tables first to avoid foreign key violations
    await db.delete(auditLog).catch(() => {});
    await db.delete(landWaitingList).catch(() => {});
    await db.delete(landOccupancies).catch(() => {});
    await db.delete(landZones).catch(() => {});
    await db.delete(craneOperationLog).catch(() => {});
    await db.delete(reservations).catch(() => {});
    await db.delete(cranes).catch(() => {});
    await db.delete(users).catch(() => {});

    // Seed mock users
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
    ]);
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
