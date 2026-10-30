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
import { parseHHMM } from "./services/reservationSchedulingService";

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
});
