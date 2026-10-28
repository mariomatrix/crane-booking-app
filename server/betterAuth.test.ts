import { describe, expect, it } from "vitest";
import { normalizeMatBroj, getAuth } from "./_core/betterAuth";
import { appRouter } from "./routers";
import { fromZagreb, toZagreb } from "../shared/timezone";

describe("Better Auth & Member Claiming (Phase 0)", () => {
  it("normalizes legacyMatBroj by stripping leading zeros and whitespace", () => {
    expect(normalizeMatBroj("001245")).toBe("1245");
    expect(normalizeMatBroj(" 01245 ")).toBe("1245");
    expect(normalizeMatBroj("1245")).toBe("1245");
    expect(normalizeMatBroj("0000")).toBe("0");
  });

  it("initializes Better Auth instance with emailOTP and magicLink plugins", () => {
    const auth = getAuth();
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });

  it("exposes passwordless and member claim procedures on appRouter.auth", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("auth.sendEmailOtp");
    expect(procedures).toContain("auth.verifyEmailOtp");
    expect(procedures).toContain("auth.sendMagicLink");
    expect(procedures).toContain("auth.verifyMagicLink");
    expect(procedures).toContain("auth.claimMemberProfile");
    expect(procedures).toContain("auth.requestCommercialAccess");
  });

  it("validates OIB checksum before attempting claimMemberProfile", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        role: "user",
        userStatus: "pending_verification",
      } as any,
      req: { protocol: "https", headers: {} } as any,
      res: { cookie: () => {} } as any,
    });

    await expect(
      caller.auth.claimMemberProfile({
        oib: "12345678900", // invalid OIB checksum
        matBroj: "1245",
      })
    ).rejects.toThrow(/OIB nije ispravan/);
  });

  it("verifies that adjacent slots touching at 12:00 [11:00, 12:00) and [12:00, 13:00) do not overlap mathematically", () => {
    const dateStr = "2026-10-28";
    const slotA_start = fromZagreb(dateStr, "11:00");
    const slotA_end = fromZagreb(dateStr, "12:00");

    const slotB_start = fromZagreb(dateStr, "12:00");
    const slotB_end = fromZagreb(dateStr, "13:00");

    // Standard interval overlap condition: startA < endB AND endA > startB
    const overlaps = slotA_start < slotB_end && slotA_end > slotB_start;
    expect(overlaps).toBe(false);

    // Verify Zagreb local time roundtrip at boundary 12:00
    expect(toZagreb(slotA_end).timeStr).toBe("12:00");
    expect(toZagreb(slotB_start).timeStr).toBe("12:00");
  });
});
