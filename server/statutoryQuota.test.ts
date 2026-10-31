import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  requireTestDb,
  ensureBaseTestFixtures,
  TEST_USER_IDS,
  TEST_CRANE_IDS,
  TEST_VESSEL_ID,
} from "./testUtils/dbTestHarness";
import {
  users,
  vessels,
  reservations,
  workOrders,
  userCardEntries,
  memberStatutoryRights,
  serviceTypes,
  priceListItems,
  landOccupancies,
  craneOperationLog,
  cranes,
} from "../drizzle/schema";
import {
  ensureMemberStatutoryRights,
  determineMemberFeeAdjustmentItem,
  calculateCommercialPricing,
  evaluateQuotaOperationType,
} from "./services/statutoryQuotaService";
import {
  startReservationWorkOrder,
  completeReservationOperation,
} from "./services/workOrderService";

describe("Statutory Quota & Billing Domain Engine (PŠD Špinut)", () => {
  beforeAll(async () => {
    await ensureBaseTestFixtures();
  });

  describe("Unit Tests — Pure Business Logic & Algorithms", () => {
    it("determines fee adjustment item based on crane capacity and name", async () => {
      const mockDbTravelift = {
        select: () => ({
          from: (tbl: any) => ({
            where: () => ({
              limit: async () => {
                if (tbl === cranes) {
                  return [{
                    id: "c-travelift",
                    name: "Travelift 50T",
                    type: "travelift",
                    maxCapacityKN: 500,
                  }];
                }
                return [{
                  code: "USL-TR50",
                  name: "Korištenje Travelifta 50T (Doplata članarine)",
                }];
              },
            }),
          }),
        }),
      };

      const resTravelift = await determineMemberFeeAdjustmentItem(mockDbTravelift, "c-travelift");
      expect(resTravelift.code).toBe("USL-TR50");
      expect(resTravelift.name).toContain("Travelift");
      expect(resTravelift.name).toContain("50T");

      const mockDbStationary = {
        select: () => ({
          from: (tbl: any) => ({
            where: () => ({
              limit: async () => {
                if (tbl === cranes) {
                  return [{
                    id: "c-9t",
                    name: "Dizalica 9T",
                    type: "portalna",
                    maxCapacityKN: 90,
                  }];
                }
                return [{
                  code: "USL-D9T",
                  name: "Korištenje dizalice 9T (Doplata članarine)",
                }];
              },
            }),
          }),
        }),
      };

      const resStationary = await determineMemberFeeAdjustmentItem(mockDbStationary, "c-9t");
      expect(resStationary.code).toBe("USL-D9T");
      expect(resStationary.name).toContain("9T");
    });

    it("calculates commercial pricing accurately per meter + VAT (25%)", async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                code: "USL-VANJSKI-M",
                name: "Dizanje/spuštanje za vanjske korisnike (po metru duljine)",
                pricePerMeterEur: "12.00",
                vatRate: "25.00",
              }],
            }),
          }),
        }),
      };

      // 10.00 meters: 10 * 12 = 120.00 base, 120 * 1.25 = 150.00 EUR total
      const p10 = await calculateCommercialPricing(mockDb, "10.00");
      expect(p10.ratePerMeter).toBe("12.00");
      expect(p10.vesselLengthM).toBe("10.00");
      expect(p10.totalWithVat).toBe("150.00");

      // 8.50 meters: 8.5 * 12 = 102.00 base, 102 * 1.25 = 127.50 EUR total
      const p85 = await calculateCommercialPricing(mockDb, "8.50");
      expect(p85.totalWithVat).toBe("127.50");

      // Zero or missing length falls back safely
      const pDef = await calculateCommercialPricing(mockDb, null);
      expect(pDef.vesselLengthM).toBe("8.00");
      expect(pDef.totalWithVat).toBe("120.00");
    });

    it("evaluates quota operation type from service type and textual fallbacks", async () => {
      const mockDbLift = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                id: "st-lift",
                name: "Vađenje iz mora",
                operationCategory: "lift_from_sea",
              }],
            }),
          }),
        }),
      };

      const evalLift = await evaluateQuotaOperationType(mockDbLift, "st-lift");
      expect(evalLift.quotaOperationType).toBe("lift");
      expect(evalLift.opCategory).toBe("lift_from_sea");
      expect(evalLift.isTruckDelivery).toBe(false);

      const mockDbLower = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                id: "st-lower",
                name: "Spuštanje u more",
                operationCategory: "lower_to_sea",
              }],
            }),
          }),
        }),
      };

      const evalLower = await evaluateQuotaOperationType(mockDbLower, "st-lower");
      expect(evalLower.quotaOperationType).toBe("lower");
      expect(evalLower.opCategory).toBe("lower_to_sea");

      const mockDbKamion = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                id: "st-kamion",
                name: "Iskrcaj broda s kamiona",
                operationCategory: "other",
              }],
            }),
          }),
        }),
      };

      const evalKamion = await evaluateQuotaOperationType(mockDbKamion, "st-kamion");
      expect(evalKamion.quotaOperationType).toBe("none");
      expect(evalKamion.isTruckDelivery).toBe(true);

      // Fallback on liftPurpose when serviceTypeId is null
      const mockDbEmpty = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      };

      const evalTextFallback = await evaluateQuotaOperationType(mockDbEmpty, null, "Godišnje vađenje broda na suhi vez");
      expect(evalTextFallback.quotaOperationType).toBe("lift");

      const evalLowerFallback = await evaluateQuotaOperationType(mockDbEmpty, null, "Spuštanje u more nakon servisa");
      expect(evalLowerFallback.quotaOperationType).toBe("lower");
    });
  });

  describe("Integration Tests — Database Quota Execution & Accounting", () => {
    const uniqueMemberId = "a1111111-2222-3333-4444-555555555555";
    const uniqueCommercialId = "b1111111-2222-3333-4444-555555555555";
    const testVesselMemberId = "c1111111-2222-3333-4444-555555555555";
    const testVesselCommId = "d1111111-2222-3333-4444-555555555555";

    let stLiftId: string;
    let stLowerId: string;

    const cleanupTestData = async () => {
      const db = await requireTestDb();
      await db.delete(landOccupancies).where(eq(landOccupancies.userId, uniqueMemberId));
      await db.delete(landOccupancies).where(eq(landOccupancies.userId, uniqueCommercialId));
      await db.delete(craneOperationLog).where(eq(craneOperationLog.operatorId, TEST_USER_IDS.operator));
      await db.delete(userCardEntries).where(eq(userCardEntries.userId, uniqueMemberId));
      await db.delete(userCardEntries).where(eq(userCardEntries.userId, uniqueCommercialId));
      await db.delete(memberStatutoryRights).where(eq(memberStatutoryRights.userId, uniqueMemberId));
      await db.delete(workOrders).where(eq(workOrders.userId, uniqueMemberId));
      await db.delete(workOrders).where(eq(workOrders.userId, uniqueCommercialId));
      await db.delete(reservations).where(eq(reservations.userId, uniqueMemberId));
      await db.delete(reservations).where(eq(reservations.userId, uniqueCommercialId));
      await db.delete(vessels).where(eq(vessels.id, testVesselMemberId));
      await db.delete(vessels).where(eq(vessels.id, testVesselCommId));
      await db.delete(users).where(eq(users.id, uniqueMemberId));
      await db.delete(users).where(eq(users.id, uniqueCommercialId));
    };

    beforeAll(async () => {
      const db = await requireTestDb();

      // Ensure price list items exist
      await db
        .insert(priceListItems)
        .values([
          {
            code: "USL-D9T",
            name: "Korištenje dizalice 9T (Doplata članarine)",
            targetType: "member_adjustment",
            fixedPriceEur: "50.00",
            vatRate: "25.00",
            isActive: true,
          },
          {
            code: "USL-TR50",
            name: "Korištenje Travelifta 50T (Doplata članarine)",
            targetType: "member_adjustment",
            fixedPriceEur: "80.00",
            vatRate: "25.00",
            isActive: true,
          },
          {
            code: "USL-VANJSKI-M",
            name: "Dizanje/spuštanje za vanjske korisnike (po metru duljine)",
            targetType: "external_commercial",
            pricePerMeterEur: "12.00",
            vatRate: "25.00",
            isActive: true,
          },
        ])
        .onConflictDoNothing();

      // Ensure service types exist
      let [stLift] = await db
        .select()
        .from(serviceTypes)
        .where(eq(serviceTypes.operationCategory, "lift_from_sea"))
        .limit(1);

      if (!stLift) {
        [stLift] = await db
          .insert(serviceTypes)
          .values({
            name: "Vađenje iz mora (Test)",
            operationCategory: "lift_from_sea",
            defaultDurationMin: 60,
          })
          .returning();
      }
      stLiftId = stLift.id;

      let [stLower] = await db
        .select()
        .from(serviceTypes)
        .where(eq(serviceTypes.operationCategory, "lower_to_sea"))
        .limit(1);

      if (!stLower) {
        [stLower] = await db
          .insert(serviceTypes)
          .values({
            name: "Spuštanje u more (Test)",
            operationCategory: "lower_to_sea",
            defaultDurationMin: 60,
          })
          .returning();
      }
      stLowerId = stLower.id;

      // Clean test data before creating fresh entities
      await cleanupTestData();

      // Create test member user
      await db.insert(users).values({
        id: uniqueMemberId,
        email: "test.member.quota@spinut.hr",
        name: "Testni Član Špinut",
        role: "user",
        clientCategory: "member",
        loginMethod: "manus",
        userStatus: "active",
      });

      // Create test commercial user
      await db.insert(users).values({
        id: uniqueCommercialId,
        email: "test.commercial@spinut.hr",
        name: "Testni Komercijalni Klijent",
        role: "user",
        clientCategory: "commercial",
        loginMethod: "manus",
        userStatus: "active",
      });

      // Create test vessels
      await db.insert(vessels).values([
        {
          id: testVesselMemberId,
          ownerId: uniqueMemberId,
          name: "Morski Vuk (Član)",
          registration: "ST-1234-CL",
          lengthM: "9.50",
          beamM: "3.20",
          weightTons: "4.50",
          type: "jedrilica",
        },
        {
          id: testVesselCommId,
          ownerId: uniqueCommercialId,
          name: "Adria Star (Vanjski)",
          registration: "ZG-9999-VK",
          lengthM: "11.00",
          beamM: "3.60",
          weightTons: "7.00",
          type: "motorni",
        },
      ]);
    });

    it("initializes member statutory rights correctly (1 lift + 1 lower, 2-year validity)", async () => {
      const db = await requireTestDb();
      const currentYear = new Date().getFullYear();

      const rights = await ensureMemberStatutoryRights(db, uniqueMemberId, currentYear);

      expect(rights.userId).toBe(uniqueMemberId);
      expect(rights.liftAvailable).toBe(true);
      expect(rights.liftAcquiredYear).toBe(currentYear);
      expect(String(rights.liftExpiresAt)).toBe(`${currentYear + 1}-12-31`);
      expect(rights.lowerAvailable).toBe(true);
      expect(rights.lowerAcquiredYear).toBe(currentYear);
      expect(String(rights.lowerExpiresAt)).toBe(`${currentYear + 1}-12-31`);
      expect(rights.pendingFeeAdjustmentsCount).toBe(0);
    });

    it("First Lift: executes successfully under statutory quota (0,00 €, marks liftAvailable=false)", async () => {
      const db = await requireTestDb();

      // Create approved reservation for 1st lift on stationary crane 9t
      const [res] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      // Complete operation
      const completionResult = await completeReservationOperation({
        reservationId: res.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 45,
        operatorNotes: "Prvo redovno vađenje u sezoni",
        allowFutureDate: true,
      });

      expect(completionResult.success).toBe(true);
      expect(completionResult.workOrder?.isStatutoryCovered).toBe(true);
      expect(completionResult.workOrder?.clientType).toBe("member");
      expect(completionResult.workOrder?.quotaOperationType).toBe("lift");

      // Verify rights state in DB
      const [updatedRights] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      expect(updatedRights.liftAvailable).toBe(false);
      expect(updatedRights.lowerAvailable).toBe(true);
      expect(updatedRights.pendingFeeAdjustmentsCount).toBe(0);

      // Verify user card entry
      const cardEntries = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, completionResult.workOrder!.id));

      expect(cardEntries).toHaveLength(1);
      expect(cardEntries[0].entryType).toBe("statutory_quota_used");
      expect(cardEntries[0].serviceItemCode).toBe("STAT-LIFT");
      expect(cardEntries[0].serviceItemName).toContain("0,00 €");
      expect(cardEntries[0].note).toContain("Pokriveno godišnjom članarinom");
    });

    it("Second Lift: detects quota exceeded, charges fee adjustment USL-D9T and increments count", async () => {
      const db = await requireTestDb();

      // Create second lift reservation on crane 2 (Stacionarna dizalica 9t)
      const [res2] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      const completionResult = await completeReservationOperation({
        reservationId: res2.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 50,
        operatorNotes: "Izvanredno drugo vađenje (prekoračenje kvote)",
        allowFutureDate: true,
      });

      expect(completionResult.success).toBe(true);
      expect(completionResult.workOrder?.isStatutoryCovered).toBe(false);
      expect(completionResult.workOrder?.chargeItemCode).toBe("USL-D9T");

      // Verify pending fee adjustment counter incremented
      const [rightsAfter2nd] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      expect(rightsAfter2nd.pendingFeeAdjustmentsCount).toBe(1);

      // Verify user card entry has fee_adjustment_charge
      const cardEntries = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, completionResult.workOrder!.id));

      expect(cardEntries).toHaveLength(1);
      expect(cardEntries[0].entryType).toBe("fee_adjustment_charge");
      expect(cardEntries[0].serviceItemCode).toBe("USL-D9T");
      expect(cardEntries[0].note).toContain("Prekoračenje statutarne kvote");
    });

    it("Third Lift with Travelift 50T: accurately selects USL-TR50 instead of USL-D9T", async () => {
      const db = await requireTestDb();

      // crane1 in fixtures is Travelift 50t
      const [resTravelift] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane1,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 90,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      const completionResult = await completeReservationOperation({
        reservationId: resTravelift.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane1,
        actualDurationMin: 80,
        operatorNotes: "Dizanje teškog plovila Traveliftom 50T",
        allowFutureDate: true,
      });

      expect(completionResult.success).toBe(true);
      expect(completionResult.workOrder?.isStatutoryCovered).toBe(false);
      expect(completionResult.workOrder?.chargeItemCode).toBe("USL-TR50");
      expect(completionResult.workOrder?.chargeItemName).toContain("Travelift");

      const [rightsAfter3rd] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      expect(rightsAfter3rd.pendingFeeAdjustmentsCount).toBe(2);
    });

    it("First Lower: executes successfully under remaining lower quota (0,00 €, marks lowerAvailable=false)", async () => {
      const db = await requireTestDb();

      const [resLower] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLowerId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      const completionResult = await completeReservationOperation({
        reservationId: resLower.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 40,
        operatorNotes: "Spuštanje u more nakon remonta",
        allowFutureDate: true,
      });

      expect(completionResult.success).toBe(true);
      expect(completionResult.workOrder?.isStatutoryCovered).toBe(true);
      expect(completionResult.workOrder?.quotaOperationType).toBe("lower");

      const [rightsAfterLower] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      expect(rightsAfterLower.lowerAvailable).toBe(false);

      const cardEntries = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, completionResult.workOrder!.id));

      expect(cardEntries).toHaveLength(1);
      expect(cardEntries[0].entryType).toBe("statutory_quota_used");
      expect(cardEntries[0].serviceItemCode).toBe("STAT-LOWER");
    });

    it("Idempotency: Re-executing completeReservationOperation returns alreadyCompleted and does not double-charge", async () => {
      const db = await requireTestDb();

      const [existingCompletedOrder] = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.userId, uniqueMemberId))
        .limit(1);

      const [rightsBefore] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Call completion again for same reservation
      const secondCall = await completeReservationOperation({
        reservationId: existingCompletedOrder.reservationId!,
        operatorId: TEST_USER_IDS.operator,
        allowFutureDate: true,
      });

      expect(secondCall.alreadyCompleted).toBe(true);

      const [rightsAfter] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Counters MUST NOT change!
      expect(rightsAfter.pendingFeeAdjustmentsCount).toBe(rightsBefore.pendingFeeAdjustmentsCount);
      expect(rightsAfter.liftAvailable).toBe(rightsBefore.liftAvailable);
      expect(rightsAfter.lowerAvailable).toBe(rightsBefore.lowerAvailable);
    });

    it("External Commercial Client: calculates length * rate + 25% VAT and records commercial_service", async () => {
      const db = await requireTestDb();

      // Vessel is 11.00m. 11.00 * 12.00 = 132.00 EUR base. 132.00 * 1.25 = 165.00 EUR total.
      const [resComm] = await db
        .insert(reservations)
        .values({
          userId: uniqueCommercialId,
          vesselId: testVesselCommId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 60,
          vesselName: "Adria Star (Vanjski)",
          vesselRegistration: "ZG-9999-VK",
          vesselLengthM: "11.00",
        })
        .returning();

      const completionResult = await completeReservationOperation({
        reservationId: resComm.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 60,
        operatorNotes: "Komercijalno vađenje za stranog gosta",
        allowFutureDate: true,
      });

      expect(completionResult.success).toBe(true);
      expect(completionResult.workOrder?.clientType).toBe("external");
      expect(completionResult.workOrder?.isStatutoryCovered).toBe(false);
      expect(completionResult.workOrder?.commercialPricePerMeter).toBe("12.00");
      expect(completionResult.workOrder?.commercialTotal).toBe("165.00");

      const cardEntries = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, completionResult.workOrder!.id));

      expect(cardEntries).toHaveLength(1);
      expect(cardEntries[0].entryType).toBe("commercial_service");
      expect(cardEntries[0].serviceItemCode).toBe("USL-VANJSKI-M");
      expect(cardEntries[0].note).toContain("165.00 EUR");
    });

    it("Year Rollover: member who used quota in year N-1 automatically acquires year N quota", async () => {
      const db = await requireTestDb();

      // Simulate a member whose lift was used in past year (2025)
      const pastYear = 2025;
      const currentYear = 2026;

      await db
        .update(memberStatutoryRights)
        .set({
          liftAvailable: false,
          liftAcquiredYear: pastYear,
          liftExpiresAt: `${pastYear + 1}-12-31`, // 2026-12-31
          lowerAvailable: false,
          lowerAcquiredYear: pastYear,
          lowerExpiresAt: `${pastYear + 1}-12-31`,
        })
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Call ensureMemberStatutoryRights for 2026
      const refreshed = await ensureMemberStatutoryRights(db, uniqueMemberId, currentYear);

      // Rights MUST be refreshed for the new 2026 membership cycle!
      expect(refreshed.liftAvailable).toBe(true);
      expect(refreshed.liftAcquiredYear).toBe(currentYear);
      expect(String(refreshed.liftExpiresAt)).toBe(`${currentYear + 1}-12-31`);

      expect(refreshed.lowerAvailable).toBe(true);
      expect(refreshed.lowerAcquiredYear).toBe(currentYear);
      expect(String(refreshed.lowerExpiresAt)).toBe(`${currentYear + 1}-12-31`);
    });

    afterAll(async () => {
      await cleanupTestData();
    });
  });
});
