import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { HighsMarinaOptimizer } from "./optimization/highsSolver";
import { SchedulerOptimizationService } from "./optimization/schedulerService";
import { appRouter } from "./routers";
import type { OptimizationProblemInput } from "./optimization/types";
import postgres from "postgres";

describe("Phase 2: HiGHS Mathematical Schedule Optimization", () => {
  const optimizer = new HighsMarinaOptimizer();
  const service = new SchedulerOptimizationService();
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  describe("HighsMarinaOptimizer (Core MILP Engine)", () => {
    it("handles empty requests gracefully", async () => {
      const result = await optimizer.solve({
        dateStr: "2026-05-15",
        timeSlots: ["08:00", "08:30", "09:00"],
        requests: [],
        cranes: [],
        zones: [],
        affinities: [],
        existingOccupations: [],
      });

      expect(result.success).toBe(true);
      expect(result.assignments.length).toBe(0);
      expect(result.unassignedRequests.length).toBe(0);
    });

    it("optimally assigns requests respecting crane capacities and affinities", async () => {
      const timeSlots = ["08:00", "08:30", "09:00", "09:30"];

      const input: OptimizationProblemInput = {
        dateStr: "2026-05-15",
        timeSlots,
        cranes: [
          { id: "crane-travelift", name: "Travelift 50t", maxCapacityTons: 50, isActive: true },
          { id: "crane-stationary", name: "Stacionarna 10t", maxCapacityTons: 10, isActive: true },
        ],
        zones: [
          { id: "zone-sz", code: "SZ", name: "Servisna zona", totalSpots: 10, freeSpots: 5 },
          { id: "zone-lb", code: "LB", name: "Lukobran", totalSpots: 20, freeSpots: 10 },
        ],
        affinities: [
          // Travelift cannot access Servisna zona (SZ)
          { craneId: "crane-travelift", zoneId: "zone-sz", affinityScore: 0, extraTransportMinutes: 0, isAllowed: false },
          // Travelift primary for Lukobran (LB)
          { craneId: "crane-travelift", zoneId: "zone-lb", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
          // Stationary primary for Servisna zona (SZ)
          { craneId: "crane-stationary", zoneId: "zone-sz", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
          // Stationary low affinity for Lukobran (LB)
          { craneId: "crane-stationary", zoneId: "zone-lb", affinityScore: 20, extraTransportMinutes: 20, isAllowed: true },
        ],
        requests: [
          // Heavy boat (25t) -> MUST be Travelift on Lukobran
          {
            id: "req-heavy",
            vessel: { name: "Velika Jedrilica", weightTons: 25, lengthM: 14, beamM: 4.2 },
            operationCategory: "lift_from_sea",
            durationMin: 30,
          },
          // Light boat (4t) going to Servisna zona -> Should be Stationary
          {
            id: "req-light",
            vessel: { name: "Mala Pasara", weightTons: 4, lengthM: 6, beamM: 2.1 },
            operationCategory: "lift_from_sea",
            durationMin: 30,
          },
        ],
        existingOccupations: [],
        maxConcurrentTeams: 2,
      };

      const result = await optimizer.solve(input);

      expect(result.success).toBe(true);
      expect(result.assignments.length).toBe(2);
      expect(result.unassignedRequests.length).toBe(0);

      const heavyAssign = result.assignments.find((a) => a.requestId === "req-heavy");
      expect(heavyAssign).toBeDefined();
      expect(heavyAssign?.craneId).toBe("crane-travelift");
      expect(heavyAssign?.zoneCode).toBe("LB");

      const lightAssign = result.assignments.find((a) => a.requestId === "req-light");
      expect(lightAssign).toBeDefined();
      expect(lightAssign?.craneId).toBe("crane-stationary");
      expect(lightAssign?.zoneCode).toBe("SZ");
    });

    it("enforces max concurrent team limit (at most 2 cranes in the same slot)", async () => {
      const timeSlots = ["08:00"]; // only 1 slot available!

      const input: OptimizationProblemInput = {
        dateStr: "2026-05-15",
        timeSlots,
        cranes: [
          { id: "c1", name: "Dizalica 1", maxCapacityTons: 20, isActive: true },
          { id: "c2", name: "Dizalica 2", maxCapacityTons: 20, isActive: true },
          { id: "c3", name: "Dizalica 3", maxCapacityTons: 20, isActive: true },
        ],
        zones: [
          { id: "z1", code: "Z1", name: "Zona 1", totalSpots: 10, freeSpots: 10 },
        ],
        affinities: [
          { craneId: "c1", zoneId: "z1", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
          { craneId: "c2", zoneId: "z1", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
          { craneId: "c3", zoneId: "z1", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
        ],
        requests: [
          { id: "r1", vessel: { name: "Brod 1", weightTons: 5, lengthM: 7, beamM: 2.5 }, operationCategory: "lift_from_sea", durationMin: 30 },
          { id: "r2", vessel: { name: "Brod 2", weightTons: 5, lengthM: 7, beamM: 2.5 }, operationCategory: "lift_from_sea", durationMin: 30 },
          { id: "r3", vessel: { name: "Brod 3", weightTons: 5, lengthM: 7, beamM: 2.5 }, operationCategory: "lift_from_sea", durationMin: 30 },
        ],
        existingOccupations: [],
        maxConcurrentTeams: 2, // only 2 teams allowed!
      };

      const result = await optimizer.solve(input);

      expect(result.success).toBe(true);
      // Because there is only 1 slot and max teams is 2, exactly 2 can be assigned, 1 must be unassigned
      expect(result.assignments.length).toBe(2);
      expect(result.unassignedRequests.length).toBe(1);
    });

    it("rejects vessels exceeding all crane capacities", async () => {
      const input: OptimizationProblemInput = {
        dateStr: "2026-05-15",
        timeSlots: ["08:00"],
        cranes: [
          { id: "c1", name: "Dizalica 10t", maxCapacityTons: 10, isActive: true },
        ],
        zones: [
          { id: "z1", code: "Z1", name: "Zona 1", totalSpots: 10, freeSpots: 10 },
        ],
        affinities: [
          { craneId: "c1", zoneId: "z1", affinityScore: 100, extraTransportMinutes: 0, isAllowed: true },
        ],
        requests: [
          { id: "r-heavy", vessel: { name: "Pretežak Brod", weightTons: 25, lengthM: 15, beamM: 4.5 }, operationCategory: "lift_from_sea", durationMin: 30 },
        ],
        existingOccupations: [],
        maxConcurrentTeams: 2,
      };

      const result = await optimizer.solve(input);

      expect(result.assignments.length).toBe(0);
      expect(result.unassignedRequests.length).toBe(1);
      expect(result.unassignedRequests[0].reason).toBeDefined();
    });
  });

  describe("SchedulerOptimizationService & tRPC Integration", () => {
    it("fetches working hours for date and generates valid slots", async () => {
      const wh = await service.getWorkingHoursForDate("2026-06-15");
      expect(wh.from).toBeDefined();
      expect(wh.to).toBeDefined();
    });

    it("exposes optimization procedures on appRouter", () => {
      const procedures = Object.keys(appRouter._def.procedures);
      expect(procedures).toContain("optimization.optimizeDailySchedule");
      expect(procedures).toContain("optimization.applyOptimizedSchedule");
      expect(procedures).toContain("optimization.recommendBestSlot");
    });

    it("runs optimizeDailySchedule query via tRPC caller", async () => {
      const caller = appRouter.createCaller({
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "admin@spinut.hr",
          role: "admin",
          userStatus: "active",
        } as any,
        req: {} as any,
        res: {} as any,
      });

      const result = await caller.optimization.optimizeDailySchedule({
        dateStr: "2026-10-15",
        maxConcurrentTeams: 2,
      });

      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.solveTimeMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.assignments)).toBe(true);
    });

    it("applies optimized schedule to a test reservation in database", async () => {
      const [crane] = await sql`SELECT id, name FROM cranes LIMIT 1`;
      const [user] = await sql`SELECT id FROM users LIMIT 1`;
      const [vessel] = await sql`SELECT id, name FROM vessels LIMIT 1`;
      const [zone] = await sql`SELECT id, code, name FROM land_zones LIMIT 1`;

      if (!crane || !user || !vessel || !zone) return;

      const testResNum = `OPT${Date.now().toString().slice(-8)}`;

      // Insert pending test reservation
      const [inserted] = await sql`
        INSERT INTO reservations (
          reservation_number, user_id, vessel_id, status, duration_min
        ) VALUES (
          ${testResNum}, ${user.id}, ${vessel.id}, 'pending', 30
        ) RETURNING id
      `;

      try {
        const caller = appRouter.createCaller({
          user: {
            id: user.id,
            email: "admin@spinut.hr",
            role: "admin",
            userStatus: "active",
          } as any,
          req: {} as any,
          res: {} as any,
        });

        // Apply schedule mutation
        const applyResult = await caller.optimization.applyOptimizedSchedule({
          dateStr: "2029-06-20",
          assignments: [
            {
              requestId: inserted.id,
              vesselName: vessel.name,
              craneId: crane.id,
              craneName: crane.name,
              zoneId: zone.id,
              zoneCode: zone.code,
              zoneName: zone.name,
              slotIndex: 0,
              startTime: "08:00",
              endTime: "08:30",
              durationMin: 30,
              affinityScore: 100,
              extraTransportMinutes: 0,
              matchQuality: "optimal",
              explanation: "Optimalno dodijeljeno u testu",
            },
          ],
        });

        expect(applyResult.updatedCount).toBe(1);

        // Verify status in DB became 'approved'
        const [updatedRow] = await sql`
          SELECT status, crane_id, land_zone_id, scheduled_start, scheduled_end
          FROM reservations WHERE id = ${inserted.id}
        `;
        expect(updatedRow.status).toBe("approved");
        expect(updatedRow.crane_id).toBe(crane.id);
        expect(updatedRow.land_zone_id).toBe(zone.id);
        expect(updatedRow.scheduled_start).toBeDefined();
        expect(updatedRow.scheduled_end).toBeDefined();
      } finally {
        await sql`DELETE FROM reservations WHERE id = ${inserted.id}`;
      }
    });
  });
});
