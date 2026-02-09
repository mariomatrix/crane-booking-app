import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-1",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createMockAdmin(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createMockUser({
    id: 99,
    openId: "admin-1",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
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
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.create({
        name: "Test Crane",
        type: "tower",
        capacity: "100",
      })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.create({
        name: "Test Crane",
        type: "tower",
        capacity: "100",
      })
    ).rejects.toThrow();
  });

  it("allows admin to create a crane", async () => {
    const admin = createMockAdmin();
    const ctx = createContext(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.crane.create({
      name: "Liebherr LTM 1300",
      type: "mobile",
      capacity: "300",
      capacityUnit: "tons",
      description: "Heavy mobile crane",
      location: "Zagreb",
    });
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });
});

describe("crane.update", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.crane.update({ id: 1, name: "Updated" })
    ).rejects.toThrow();
  });
});

describe("crane.delete", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.crane.delete({ id: 1 })).rejects.toThrow();
  });
});

// ─── Reservation Procedures Tests ────────────────────────────────────

describe("reservation.create", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reservation.create({
        craneId: 1,
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-05"),
      })
    ).rejects.toThrow();
  });

  it("validates that end date is after start date", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reservation.create({
        craneId: 1,
        startDate: new Date("2026-03-05"),
        endDate: new Date("2026-03-01"),
      })
    ).rejects.toThrow(/End date must be after start date/);
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

  it("returns array for admin users", async () => {
    const admin = createMockAdmin();
    const ctx = createContext(admin);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reservation.listAll({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("reservation.approve", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.approve({ id: 1 })).rejects.toThrow();
  });
});

describe("reservation.reject", () => {
  it("rejects non-admin users", async () => {
    const user = createMockUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.reservation.reject({ id: 1 })).rejects.toThrow();
  });
});

// ─── Calendar Procedures Tests ───────────────────────────────────────

describe("calendar.events", () => {
  it("returns an array (public procedure)", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.events();
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts optional crane type filter", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.events({ craneType: "tower" });
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
