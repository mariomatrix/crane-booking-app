import "dotenv/config";
import { describe, expect, it } from "vitest";
import { LandFlowService } from "./services/landFlow.service";
import { getDb } from "./db";
import { landZones, landSpots, craneZoneAffinities, cranes, reservations } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("LandFlowService & Dispečerski centar", () => {
    const service = new LandFlowService();

    it("should fetch daily balance for today with valid structure", async () => {
        const todayStr = new Date().toISOString().split("T")[0];
        const balance = await service.getDailyBalance(todayStr);

        expect(balance).toBeDefined();
        expect(balance.date).toBe(todayStr);
        expect(typeof balance.openingFreeSpots).toBe("number");
        expect(typeof balance.minimumProjectedFreeSpots).toBe("number");
        expect(typeof balance.closingProjectedFreeSpots).toBe("number");
        expect(Array.isArray(balance.conflicts)).toBe(true);
        expect(Array.isArray(balance.hubBreakdown)).toBe(true);
        expect(balance.summary).toBeDefined();
        expect(balance.summary.totalSpots).toBeGreaterThan(0);
    });

    it("should fetch flow matrix for today", async () => {
        const todayStr = new Date().toISOString().split("T")[0];
        const matrix = await service.getFlowMatrix(todayStr);

        expect(matrix).toBeDefined();
        expect(matrix.date).toBe(todayStr);
        expect(Array.isArray(matrix.items)).toBe(true);
    });

    it("should return spots by zone with dimensions and occupancy status", async () => {
        const db = await getDb();
        if (!db) return;

        const zones = await db.select().from(landZones).limit(1);
        if (zones.length === 0) return;

        const zoneId = zones[0].id;
        const spots = await service.getSpotsByZone(zoneId);

        expect(Array.isArray(spots)).toBe(true);
        expect(spots.length).toBeGreaterThan(0);
        const firstSpot = spots[0];
        expect(firstSpot.code).toBeDefined();
        expect(typeof firstSpot.isOccupied).toBe("boolean");
        expect(firstSpot.maxLengthM).toBeDefined();
        expect(firstSpot.maxBeamM).toBeDefined();
    });

    it("should return crane zone affinities matrix with all 18 rules", async () => {
        const affinities = await service.getAllAffinities();

        expect(Array.isArray(affinities)).toBe(true);
        expect(affinities.length).toBe(18); // 3 cranes × 6 zones

        const firstAff = affinities[0];
        expect(firstAff.craneName).toBeDefined();
        expect(firstAff.zoneCode).toBeDefined();
        expect(typeof firstAff.affinityScore).toBe("number");
        expect(typeof firstAff.extraTransportMinutes).toBe("number");
    });

    it("should update crane affinity and enforce single primary crane per zone", async () => {
        const affinities = await service.getAllAffinities();
        expect(affinities.length).toBeGreaterThan(0);

        const target = affinities[0];
        const updated = await service.upsertAffinity({
            craneId: target.craneId,
            zoneId: target.zoneId,
            affinityScore: 92,
            extraTransportMinutes: 5,
            isPrimary: true,
            isBlocked: false,
            notes: "Test automated update",
        });

        expect(updated).toBeDefined();
        expect(updated.affinityScore).toBe(92);
        expect(updated.isPrimary).toBe(true);

        // Verify other cranes in same zone are not primary
        const zoneAffinities = (await service.getAllAffinities()).filter(a => a.zoneId === target.zoneId);
        const primaryCount = zoneAffinities.filter(a => a.isPrimary).length;
        expect(primaryCount).toBe(1);
    });

    it("should recommend spots based on reservation if reservations exist", async () => {
        const db = await getDb();
        if (!db) return;

        const resList = await db.select().from(reservations).limit(1);
        if (resList.length > 0) {
            const todayStr = new Date().toISOString().split("T")[0];
            const recs = await service.recommendSpots(resList[0].id, todayStr);
            expect(Array.isArray(recs)).toBe(true);
            if (recs.length > 0) {
                expect(recs[0].spotId).toBeDefined();
                expect(typeof recs[0].affinityScore).toBe("number");
            }
        }
    });
});
