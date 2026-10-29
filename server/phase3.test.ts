import { describe, it, expect } from "vitest";
import {
  generateCalendarToken,
  verifyCalendarToken,
  generateReservationToken,
  verifyReservationToken,
  generateFeedToken,
  verifyFeedToken,
  buildGoogleCalendarUrl,
  generateUserCalendarFeedIcs,
  generateOperatorCalendarFeedIcs,
} from "./services/icalService";

describe("Phase 3 — iCal (.ics) Calendar Service & HMAC Tokens", () => {
  it("generates and verifies HMAC-SHA256 reservation tokens in constant time", () => {
    const resId = "11111111-2222-3333-4444-555555555555";
    const token = generateReservationToken(resId);
    expect(token).toHaveLength(32);
    expect(verifyReservationToken(resId, token)).toBe(true);
    expect(verifyReservationToken(resId, "invalid-token")).toBe(false);
    expect(verifyReservationToken("99999999-2222-3333-4444-555555555555", token)).toBe(false);
  });

  it("generates and verifies scoped feed tokens and prevents scope escalation", () => {
    const userId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const userToken = generateFeedToken(userId, "user", "all");
    const opToken = generateFeedToken(userId, "operator", "all");

    expect(userToken).not.toBe(opToken);
    expect(verifyFeedToken(userId, "user", "all", userToken)).toBe(true);
    // Attempting to use a user token for operator scope must fail
    expect(verifyFeedToken(userId, "operator", "all", userToken)).toBe(false);
    // Attempting to use an all-cranes token for a specific crane must fail
    expect(verifyFeedToken(userId, "operator", "crane-1", opToken)).toBe(false);
  });

  it("builds a valid Google Calendar template URL with Europe/Zagreb timezone", () => {
    const start = new Date("2026-06-15T08:00:00.000Z");
    const end = new Date("2026-06-15T09:00:00.000Z");
    const url = buildGoogleCalendarUrl({
      title: "⚓ Vađenje plovila — ST-1234 (Dizalica 1)",
      start,
      end,
      details: "Broj rezervacije: R-2026-0001",
      location: "PŠD Špinut, Split",
    });

    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260615T080000Z%2F20260615T090000Z");
    expect(url).toContain("ctz=Europe%2FZagreb");
  });

  it("generates valid RFC 5545 VCALENDAR output for user and operator feeds", async () => {
    const userIcs = await generateUserCalendarFeedIcs("00000000-0000-0000-0000-000000000000");
    expect(userIcs).toContain("BEGIN:VCALENDAR");
    expect(userIcs).toContain("VERSION:2.0");
    expect(userIcs).toContain("PŠD Špinut — Moji termini dizalice");
    expect(userIcs).toContain("END:VCALENDAR");

    const opIcs = await generateOperatorCalendarFeedIcs({ craneId: "all", daysBack: 7, daysForward: 7 });
    expect(opIcs).toContain("BEGIN:VCALENDAR");
    expect(opIcs).toContain("PŠD Špinut — Operativni kalendar dizalica");
    expect(opIcs).toContain("END:VCALENDAR");
  });
});
