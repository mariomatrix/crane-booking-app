import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
    validateOIB,
    normalizeOIB,
    hashJMBG,
    selectEmail,
    normalizePhone,
    mapVesselType,
    normalizeName,
} from "./utils";
import { getMemberSyncStatus } from "./scheduler";
import { isMssqlConfigured } from "./mssqlClient";

describe("MemberSync — Utils & Validators", () => {
    describe("validateOIB", () => {
        it("validates correct Croatian OIB according to ISO 7064", () => {
            // Valid test OIB examples
            expect(validateOIB("69435151530")).toBe(true);
            expect(validateOIB("10000000018")).toBe(true);
        });

        it("rejects invalid check digits", () => {
            expect(validateOIB("69435151531")).toBe(false);
            expect(validateOIB("10000000019")).toBe(false);
        });

        it("rejects non-11-digit inputs", () => {
            expect(validateOIB("")).toBe(false);
            expect(validateOIB("12345")).toBe(false);
            expect(validateOIB("123456789012")).toBe(false);
            expect(validateOIB("abcdefghijk")).toBe(false);
        });
    });

    describe("normalizeOIB", () => {
        it("trims whitespace and strips hyphens/dots", () => {
            expect(normalizeOIB("  69435151530  ")).toBe("69435151530");
            expect(normalizeOIB("694-351-515-30")).toBe("69435151530");
        });

        it("returns null for empty or null inputs", () => {
            expect(normalizeOIB(null)).toBeNull();
            expect(normalizeOIB(undefined)).toBeNull();
            expect(normalizeOIB("   ")).toBeNull();
        });
    });

    describe("hashJMBG", () => {
        it("computes SHA-256 hash for full 13-digit JMBG", () => {
            const hash = hashJMBG("1303960380041");
            expect(hash).toBeDefined();
            expect(hash).toHaveLength(64);
            // Deterministic check
            const hash2 = hashJMBG("1303960380041");
            expect(hash).toBe(hash2);
        });

        it("returns null for incomplete/short JMBGs (e.g. 7 digits)", () => {
            expect(hashJMBG("1303960")).toBeNull();
            expect(hashJMBG("")).toBeNull();
            expect(hashJMBG(null)).toBeNull();
            expect(hashJMBG(undefined)).toBeNull();
        });
    });

    describe("selectEmail", () => {
        it("prioritizes Email over legacy typo Emial", () => {
            expect(selectEmail("correct@test.com", "typo@test.com")).toBe("correct@test.com");
        });

        it("falls back to Emial if Email is empty or null", () => {
            expect(selectEmail(null, "fallback@test.com")).toBe("fallback@test.com");
            expect(selectEmail("", "fallback@test.com")).toBe("fallback@test.com");
        });

        it("takes first email if multiple separated by semicolon", () => {
            expect(selectEmail("first@test.com; second@test.com", null)).toBe("first@test.com");
        });

        it("returns null if both are invalid or empty", () => {
            expect(selectEmail(null, null)).toBeNull();
            expect(selectEmail("", "")).toBeNull();
            expect(selectEmail("invalid-email", "also-invalid")).toBeNull();
        });
    });

    describe("normalizePhone", () => {
        it("converts 091 format to +38591", () => {
            expect(normalizePhone("0912006744")).toBe("+385912006744");
            expect(normalizePhone("098 123 456")).toBe("+38598123456");
        });

        it("preserves +385 prefix", () => {
            expect(normalizePhone("+385912006744")).toBe("+385912006744");
        });

        it("handles short landlines gracefully", () => {
            expect(normalizePhone("383-174")).toBe("383174");
        });

        it("returns null for empty or null", () => {
            expect(normalizePhone(null)).toBeNull();
            expect(normalizePhone("")).toBeNull();
        });
    });

    describe("mapVesselType", () => {
        it("correctly categorizes vessel types", () => {
            expect(mapVesselType("Jedrilica")).toBe("jedrilica");
            expect(mapVesselType("SAILBOAT")).toBe("jedrilica");
            expect(mapVesselType("Motorni brod")).toBe("motorni");
            expect(mapVesselType("Gliser")).toBe("motorni");
            expect(mapVesselType("MB")).toBe("motorni");
            expect(mapVesselType("Katamaran")).toBe("katamaran");
            expect(mapVesselType("Gumenjak")).toBe("ostalo");
            expect(mapVesselType(null)).toBe("ostalo");
        });
    });

    describe("normalizeName", () => {
        it("capitalizes first letters of each word", () => {
            expect(normalizeName("IVICA")).toBe("Ivica");
            expect(normalizeName("MARIO MATIĆ")).toBe("Mario Matić");
            expect(normalizeName("  ante   perić  ")).toBe("Ante Perić");
        });

        it("returns null for empty input", () => {
            expect(normalizeName(null)).toBeNull();
            expect(normalizeName("   ")).toBeNull();
        });
    });

    describe("Scheduler & Status", () => {
        it("reports correct member sync status object", () => {
            const status = getMemberSyncStatus();
            expect(status).toHaveProperty("isRunning");
            expect(status).toHaveProperty("isConfigured");
            expect(typeof status.isRunning).toBe("boolean");
            expect(typeof status.isConfigured).toBe("boolean");
        });
    });

    describe("Sync Engine — processClan03Rows payload ingestion", () => {
        it("processes mock CLAN03 payload correctly", async () => {
            const { processClan03Rows } = await import("./syncEngine");
            const mockRows = [
                {
                    MAT_BROJ: "M-9991",
                    VRSTA_C: "U",
                    PREZIME: "HORVAT",
                    IME: "IVAN",
                    OIB: "69435151530",
                    JMBG: "1303960380041",
                    ADRESA: "Obala 1",
                    Ptt: "21000",
                    Grad: "Split",
                    DRZAVA: "HR",
                    MOBITEL: "0912345678",
                    TELEFON: null,
                    Email: "ivan.horvat@test.hr",
                    Emial: null,
                    IME_BR: "MORSKA VILA",
                    BROD_BR: "ST-9991",
                    TIP_BROD: "Jedrilica",
                    DUZINA_BR: 9.5,
                    SIRINA_BR: 3.2,
                    firma: false,
                    CLAN: "1",
                    KLUB: "1",
                    Klub2: "2",
                    NAPOMENA: "Test član",
                },
            ];

            const result = await processClan03Rows(mockRows, "test");
            expect(result).toBeDefined();
            expect(result.status).toBe("completed");
            expect(result.counters.sourceRowsTotal).toBe(1);
            expect(result.counters.membersCreated + result.counters.membersUpdated).toBeGreaterThanOrEqual(1);
            expect(result.counters.vesselsCreated + result.counters.vesselsUpdated).toBeGreaterThanOrEqual(1);
            expect(result.counters.linksCreated + result.counters.membershipsUpdated + result.counters.membershipsCreated).toBeGreaterThanOrEqual(1);
        });
    });
});
