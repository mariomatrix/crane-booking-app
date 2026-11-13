import { describe, it, expect } from "vitest";
import {
  normalizeRegistrationToken,
  normalizeSearchText,
  scoreVesselSearchMatch,
} from "./services/vesselSearchService";

describe("Vessel Search Service", () => {
  it("normalizes Croatian diacritics and registration punctuation", () => {
    expect(normalizeSearchText("Čavlić Đuro Špinut")).toBe("cavlic duro spinut");
    expect(normalizeRegistrationToken("ST-240008")).toBe("st240008");
    expect(normalizeRegistrationToken("st 5150")).toBe("st5150");
  });

  it("matches partial registration without hyphen and prioritizes exact registration match", () => {
    const balerina = {
      name: "BALERINA",
      registration: "ST-4253",
      owner: {
        id: "u1",
        name: "Ivo Pelivan",
        phone: null,
        email: null,
      },
    };
    const st42530 = {
      name: "MORE",
      registration: "ST-42530",
      owner: {
        id: "u2",
        name: "Martin Drinković",
        phone: null,
        email: null,
      },
    };

    expect(scoreVesselSearchMatch(balerina, "st4253")).toBe(100);
    expect(scoreVesselSearchMatch(st42530, "st4253")).toBe(90);
    expect(scoreVesselSearchMatch(st42530, "drinkovic")).toBeGreaterThan(0);
    expect(scoreVesselSearchMatch(balerina, "nepostojeci")).toBe(0);
  });
});
