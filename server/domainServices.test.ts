import { describe, it, expect, beforeAll } from "vitest";
import {
  generateReservationNumber,
  generateWorkOrderNumber,
  generateInvoiceNumber,
} from "./services/numberingService";
import {
  issueAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  issueMobileOperatorToken,
} from "./services/authPolicyService";
import {
  parseHHMM,
  estimateMinWeightTonsFromLength,
  validateSlotAgainstSettings,
} from "./services/reservationSchedulingService";
import { checkFeasibility } from "./landDispatch/feasibility";

describe("Domain Services — Numbering, Auth Policy & Scheduling Helpers", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-key-for-unit-tests-12345";
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-key-for-unit-tests-67890";
  });

  it("generates standardized reservation numbers", () => {
    const resNum = generateReservationNumber(2026);
    expect(resNum).toMatch(/^REZ-2026-[A-F0-9]{6}$/);
  });

  it("generates sequential work order numbers from mock DB result", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: async () => [{ orderNumber: "RN-2026-00014" }],
        }),
      }),
    };
    const woNum = await generateWorkOrderNumber(mockDb, 2026);
    expect(woNum).toBe("RN-2026-00015");
  });

  it("generates sequential invoice and proforma numbers from mock DB result", async () => {
    const mockDbInvoice = {
      select: () => ({
        from: () => ({
          where: async () => [{ invoiceNumber: "RAC-2026-00003" }],
        }),
      }),
    };
    const mockDbProforma = {
      select: () => ({
        from: () => ({
          where: async () => [{ invoiceNumber: "PON-2026-00007" }],
        }),
      }),
    };
    const invNum = await generateInvoiceNumber(mockDbInvoice, 2026, false);
    const profNum = await generateInvoiceNumber(mockDbProforma, 2026, true);
    expect(invNum).toBe("RAC-2026-00004");
    expect(profNum).toBe("PON-2026-00008");
  });

  it("issues and verifies access, refresh, and mobile operator JWT tokens", async () => {
    const access = await issueAccessToken("user-123", "admin");
    const verifiedAccess = await verifyAccessToken(access);
    expect(verifiedAccess).toBe("user-123");

    const refresh = await issueRefreshToken("user-123");
    const verifiedRefresh = await verifyRefreshToken(refresh);
    expect(verifiedRefresh).toBe("user-123");

    const mobileToken = await issueMobileOperatorToken({
      id: "op-1",
      email: "op@spinut.hr",
      name: "Operater 1",
      role: "operator",
    });
    const verifiedMobile = await verifyAccessToken(mobileToken);
    expect(verifiedMobile).toBe("op-1");
  });

  it("parses HH:MM working hours strings accurately", () => {
    expect(parseHHMM("08:30")).toEqual({ h: 8, m: 30 });
    expect(parseHHMM("16:00")).toEqual({ h: 16, m: 0 });
  });

  it("flags 1.5t crane as requiring override when vessel >= 5.5m has no weightTons (e.g. BALERINA 7.15m)", () => {
    expect(estimateMinWeightTonsFromLength(4.8)).toBe(0);
    expect(estimateMinWeightTonsFromLength(7.15)).toBeGreaterThan(1.5);
    expect(estimateMinWeightTonsFromLength(10.2)).toBeGreaterThanOrEqual(3.5);

    const slotStart = new Date("2026-10-30T06:00:00Z");
    const slotEnd = new Date("2026-10-30T07:30:00Z");

    const feas15t = checkFeasibility({
      crane: {
        id: "crane-15t",
        name: "DIZALICA 1,5 T",
        maxCapacityKN: 15, // ~1.53t
        maxPoolWidth: null,
        craneStatus: "active",
      },
      zone: { id: "z-a3", code: "A3", name: "Arla 3", totalSpots: 35 },
      vessel: { name: "BALERINA", weightTons: null, beamM: 2.5, lengthM: 7.15 },
      operationCategory: "lift_from_sea",
      slotStart,
      slotEnd,
      activeStoppages: [],
      existingReservations: [],
      currentZoneFreeAtSlot: 19,
    });

    expect(feas15t.requiresOverride).toBe(true);
    expect(feas15t.isFeasible).toBe(false);
    expect(feas15t.overrideReasons.some((r) => r.includes("7.15m"))).toBe(true);

    const feas9t = checkFeasibility({
      crane: {
        id: "crane-9t",
        name: "DIZALICA 9 T",
        maxCapacityKN: 90, // ~9.18t
        maxPoolWidth: null,
        craneStatus: "active",
      },
      zone: { id: "z-a3", code: "A3", name: "Arla 3", totalSpots: 35 },
      vessel: { name: "BALERINA", weightTons: null, beamM: 2.5, lengthM: 7.15 },
      operationCategory: "lift_from_sea",
      slotStart,
      slotEnd,
      activeStoppages: [],
      existingReservations: [],
      currentZoneFreeAtSlot: 19,
    });

    expect(feas9t.requiresOverride).toBe(false);
    expect(feas9t.isFeasible).toBe(true);
  });

  it("blocks past dates for regular users but allows past dates when allowPastDates is true", async () => {
    const pastStart = new Date("2025-05-12T08:00:00Z"); // 10:00 Europe/Zagreb
    const pastEnd = new Date("2025-05-12T09:00:00Z");
    const sysSettings = { workdayStart: "07:00", workdayEnd: "18:00" };

    await expect(
      validateSlotAgainstSettings(pastStart, pastEnd, sysSettings)
    ).rejects.toThrow(/prošlosti/);

    const allowed = await validateSlotAgainstSettings(pastStart, pastEnd, sysSettings, {
      allowPastDates: true,
    });
    expect(allowed).toEqual({ bufferMin: 0 });
  });
});
