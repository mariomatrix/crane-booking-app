import { describe, it, expect } from "vitest";
import { calculateZoneCapacitySnapshots } from "./capacity";
import { checkFeasibility } from "./feasibility";
import { computeRecommendationScore } from "./scoring";

describe("Land Dispatch Engine v3.2 Tests", () => {
  // ─── 1. ATP Capacity Calculation ───────────────────────────────────────
  describe("ATP Capacity Engine", () => {
    const mockZones = [
      { id: "zone-a1", code: "A1", name: "Arla 1", totalSpots: 10 },
      { id: "zone-a2", code: "A2", name: "Arla 2", totalSpots: 15 },
    ];
    const timeSlots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

    it("calculates baseline free spots when no operations scheduled", () => {
      const occupiedMap = new Map([
        ["zone-a1", 7], // 10 total - 7 occupied = 3 free
        ["zone-a2", 10], // 15 total - 10 occupied = 5 free
      ]);

      const snapshots = calculateZoneCapacitySnapshots({
        zones: mockZones,
        currentOccupiedMap: occupiedMap,
        scheduledReservations: [],
        timeSlots,
        dateStr: "2026-10-06",
      });

      const a1 = snapshots.find((s) => s.zoneCode === "A1")!;
      expect(a1.totalSpots).toBe(10);
      expect(a1.currentOccupied).toBe(7);
      expect(a1.currentFree).toBe(3);
      expect(a1.minFreeToday).toBe(3);
      expect(a1.hasDeficit).toBe(false);
    });

    it("reserves spot at scheduledStart for lift, and releases spot at scheduledEnd for lower", () => {
      const occupiedMap = new Map([["zone-a1", 9]]); // 1 free spot

      const reservations = [
        // Lift at 08:00 (reserves at start -> free becomes 0)
        {
          id: "res-lift-1",
          landZoneId: "zone-a1",
          operationCategory: "lift_from_sea",
          scheduledStart: new Date("2026-10-06T08:00:00+02:00"),
          scheduledEnd: new Date("2026-10-06T08:30:00+02:00"),
          status: "approved",
        },
        // Lower from 08:30 to 09:00 (releases at end 09:00 -> free becomes 1 again at 09:00)
        {
          id: "res-lower-1",
          landZoneId: "zone-a1",
          operationCategory: "lower_to_sea",
          scheduledStart: new Date("2026-10-06T08:30:00+02:00"),
          scheduledEnd: new Date("2026-10-06T09:00:00+02:00"),
          status: "approved",
        },
      ];

      const snapshots = calculateZoneCapacitySnapshots({
        zones: mockZones,
        currentOccupiedMap: occupiedMap,
        scheduledReservations: reservations,
        timeSlots,
        dateStr: "2026-10-06",
      });

      const a1 = snapshots.find((s) => s.zoneCode === "A1")!;
      expect(a1.currentFree).toBe(1);

      // At 07:30 -> free = 1
      const slot0730 = a1.hourlyTimeline.find((t) => t.time === "07:30")!;
      expect(slot0730.free).toBe(1);

      // At 08:00 (lift starts) -> free = 0
      const slot0800 = a1.hourlyTimeline.find((t) => t.time === "08:00")!;
      expect(slot0800.free).toBe(0);

      // At 08:30 (lower still ongoing) -> free = 0
      const slot0830 = a1.hourlyTimeline.find((t) => t.time === "08:30")!;
      expect(slot0830.free).toBe(0);

      // At 09:00 (lower completes, released) -> free = 1
      const slot0900 = a1.hourlyTimeline.find((t) => t.time === "09:00")!;
      expect(slot0900.free).toBe(1);

      expect(a1.minFreeToday).toBe(0);
      expect(a1.hasDeficit).toBe(false);
    });

    it("detects deficit when lifts exceed capacity", () => {
      const occupiedMap = new Map([["zone-a1", 10]]); // 0 free spots!

      const reservations = [
        {
          id: "res-lift-over",
          landZoneId: "zone-a1",
          operationCategory: "lift_from_sea",
          scheduledStart: new Date("2026-10-06T08:00:00+02:00"),
          scheduledEnd: new Date("2026-10-06T08:30:00+02:00"),
          status: "approved",
        },
      ];

      const snapshots = calculateZoneCapacitySnapshots({
        zones: mockZones,
        currentOccupiedMap: occupiedMap,
        scheduledReservations: reservations,
        timeSlots,
        dateStr: "2026-10-06",
      });

      const a1 = snapshots.find((s) => s.zoneCode === "A1")!;
      expect(a1.hasDeficit).toBe(true);
      expect(a1.minFreeToday).toBe(-1);
      expect(a1.deficitTime).toBe("08:00");
    });
  });

  // ─── 2. Feasibility Engine & Hard Rules ────────────────────────────────
  describe("Feasibility Engine", () => {
    const travelift = {
      id: "crane-travelift",
      name: "Travelift 50T",
      maxCapacityKN: 500, // ~50 tons
      maxPoolWidth: 6.5,
      craneStatus: "active",
    };

    const smallCrane = {
      id: "crane-small",
      name: "Mala dizalica",
      maxCapacityKN: 50, // ~5 tons
      maxPoolWidth: null,
      craneStatus: "active",
    };

    const mockZone = {
      id: "zone-sz",
      code: "SZ",
      name: "Servisna zona",
      totalSpots: 20,
    };

    it("blocks operation if vessel weight exceeds crane capacity", () => {
      const heavyVessel = {
        name: "Teška Jahta",
        weightTons: 12.0, // 12 tons > 5 tons
        beamM: 3.5,
        lengthM: 11.0,
      };

      const result = checkFeasibility({
        crane: smallCrane,
        zone: mockZone,
        vessel: heavyVessel,
        operationCategory: "lift_from_sea",
        slotStart: new Date("2026-10-06T08:00:00Z"),
        slotEnd: new Date("2026-10-06T08:30:00Z"),
        activeStoppages: [],
        existingReservations: [],
        currentZoneFreeAtSlot: 5,
      });

      expect(result.isFeasible).toBe(false);
      expect(result.hardBlockReasons.some((r) => r.includes("premašuje nosivost"))).toBe(true);
    });

    it("blocks operation if vessel beam exceeds crane pool width", () => {
      const wideCatamaran = {
        name: "Široki Katamaran",
        weightTons: 15.0,
        beamM: 7.2, // 7.2m > 6.5m
        lengthM: 12.0,
      };

      const result = checkFeasibility({
        crane: travelift,
        zone: mockZone,
        vessel: wideCatamaran,
        operationCategory: "lift_from_sea",
        slotStart: new Date("2026-10-06T08:00:00Z"),
        slotEnd: new Date("2026-10-06T08:30:00Z"),
        activeStoppages: [],
        existingReservations: [],
        currentZoneFreeAtSlot: 5,
      });

      expect(result.isFeasible).toBe(false);
      expect(result.hardBlockReasons.some((r) => r.includes("premašuje širinu bazena"))).toBe(true);
    });

    it("blocks operation if crane has an active work stoppage (bura/vjetar)", () => {
      const vessel = {
        name: "Standardno Plovilo",
        weightTons: 4.0,
        beamM: 2.5,
        lengthM: 8.0,
      };

      const result = checkFeasibility({
        crane: travelift,
        zone: mockZone,
        vessel,
        operationCategory: "lift_from_sea",
        slotStart: new Date("2026-10-06T08:00:00Z"),
        slotEnd: new Date("2026-10-06T08:30:00Z"),
        activeStoppages: [
          {
            scope: "all_cranes",
            craneId: null,
            zoneId: null,
            startsAt: new Date("2026-10-06T07:00:00Z"),
            endsAt: new Date("2026-10-06T12:00:00Z"),
            reason: "Olujna bura",
          },
        ],
        existingReservations: [],
        currentZoneFreeAtSlot: 5,
      });

      expect(result.isFeasible).toBe(false);
      expect(result.hardBlockReasons.some((r) => r.includes("Olujna bura"))).toBe(true);
    });
  });

  // ─── 3. Black Box Teams & Dispečer Override ───────────────────────────
  describe("Team Concurrency & Override Rule", () => {
    const crane1 = { id: "c1", name: "Travelift 50T", maxCapacityKN: 500, maxPoolWidth: null, craneStatus: "active" };
    const crane2 = { id: "c2", name: "Stacionarna 5T", maxCapacityKN: 50, maxPoolWidth: null, craneStatus: "active" };
    const crane3 = { id: "c3", name: "Mala dizalica", maxCapacityKN: 500, maxPoolWidth: null, craneStatus: "active" };

    const mockZone = { id: "z1", code: "A1", name: "Arla 1", totalSpots: 10 };
    const vessel = { name: "Plovilo 3", weightTons: 3.0, beamM: 2.2, lengthM: 7.0 };

    const slotStart = new Date("2026-10-06T09:00:00Z");
    const slotEnd = new Date("2026-10-06T09:30:00Z");

    const twoExistingOps = [
      {
        id: "op-1",
        craneId: "c1",
        landZoneId: "z1",
        operationCategory: "lift_from_sea",
        scheduledStart: slotStart,
        scheduledEnd: slotEnd,
        status: "approved",
      },
      {
        id: "op-2",
        craneId: "c2",
        landZoneId: "z1",
        operationCategory: "lower_to_sea",
        scheduledStart: slotStart,
        scheduledEnd: slotEnd,
        status: "approved",
      },
    ];

    it("flags team capacity exceeded when 2 cranes already running in slot and blocks without override", () => {
      const result = checkFeasibility({
        crane: crane3,
        zone: mockZone,
        vessel,
        operationCategory: "lift_from_sea",
        slotStart,
        slotEnd,
        activeStoppages: [],
        existingReservations: twoExistingOps,
        currentZoneFreeAtSlot: 5,
        maxConcurrentTeams: 2,
        teamOverride: false, // Dispečer nije uključio override
      });

      expect(result.teamCapacityExceeded).toBe(true);
      expect(result.concurrentTeamsInSlot).toBe(2);
      expect(result.requiresTeamOverride).toBe(true);
      expect(result.isFeasible).toBe(false);
      expect(result.warnings.some((w) => w.includes("Potreban je dispečerski override"))).toBe(true);
    });

    it("permits operation on 3rd crane when dispečer activates teamOverride", () => {
      const result = checkFeasibility({
        crane: crane3,
        zone: mockZone,
        vessel,
        operationCategory: "lift_from_sea",
        slotStart,
        slotEnd,
        activeStoppages: [],
        existingReservations: twoExistingOps,
        currentZoneFreeAtSlot: 5,
        maxConcurrentTeams: 2,
        teamOverride: true, // Dispečer ručno odobrava override
      });

      expect(result.teamCapacityExceeded).toBe(true);
      expect(result.requiresTeamOverride).toBe(true);
      expect(result.isFeasible).toBe(true); // Now feasible!
      expect(result.warnings.some((w) => w.includes("Aktiviran dispečerski override"))).toBe(true);
    });
  });

  // ─── 4. Same-Day Rotation (capacity_release) ──────────────────────────
  describe("Same-Day Rotation Detection", () => {
    const crane = { id: "c1", name: "Travelift 50T", maxCapacityKN: 500, maxPoolWidth: null, craneStatus: "active" };
    const zone = { id: "z1", code: "SZ", name: "Servisna", totalSpots: 10 };
    const vessel = { name: "Novi brod", weightTons: 4.0, beamM: 2.5, lengthM: 8.0 };

    it("detects rotational dependency when lower finishes right before lift in a full zone", () => {
      const lowerFinishingAt0900 = [
        {
          id: "op-lower-finishing",
          craneId: "c1",
          landZoneId: "z1",
          operationCategory: "lower_to_sea",
          scheduledStart: new Date("2026-10-06T08:30:00Z"),
          scheduledEnd: new Date("2026-10-06T09:00:00Z"),
          status: "approved",
          vesselName: "Brod Koji Odlazi",
        },
      ];

      const result = checkFeasibility({
        crane,
        zone,
        vessel,
        operationCategory: "lift_from_sea",
        slotStart: new Date("2026-10-06T09:00:00Z"),
        slotEnd: new Date("2026-10-06T09:30:00Z"),
        activeStoppages: [],
        existingReservations: lowerFinishingAt0900,
        currentZoneFreeAtSlot: 0, // Zone is physically full!
      });

      expect(result.isFeasible).toBe(true);
      expect(result.rotationalCandidateReservationId).toBe("op-lower-finishing");
      expect(result.rotationalCandidateVesselName).toBe("Brod Koji Odlazi");
      expect(result.warnings.some((w) => w.includes("oslobađa rotacijom"))).toBe(true);
    });
  });

  // ─── 5. Scoring & Explanations ────────────────────────────────────────
  describe("Scoring Engine", () => {
    it("computes bonus for primary crane and peaceful slots", () => {
      const res = computeRecommendationScore({
        affinityScore: 70,
        isPrimary: true,
        penaltySlots: 0,
        concurrentTeamsInSlot: 0,
        maxConcurrentTeams: 2,
        craneName: "Travelift 50T",
        zoneCode: "SZ",
        zoneName: "Servisna zona",
      });

      // 70 + 15 (primary) + 10 (peaceful) = 95
      expect(res.finalScore).toBe(95);
      expect(res.explanations.some((e) => e.includes("primarni izbor"))).toBe(true);
      expect(res.explanations.some((e) => e.includes("potpuno miran"))).toBe(true);
    });
  });
});
