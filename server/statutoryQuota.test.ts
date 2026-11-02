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
  memberMemberships,
  invoices,
  invoiceItems,
  serviceTypes,
  priceListItems,
  landOccupancies,
  landZones,
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
import { resolveActiveUserById } from "./services/authPolicyService";
import { generateWorkOrderNumber, generateInvoiceNumber } from "./services/numberingService";
import { appRouter } from "./routers";

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

    it("calculates commercial pricing accurately per meter + VAT and strictly validates length", async () => {
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
      expect(p10.vatRate).toBe("25.00");

      // 8.50 meters: 8.5 * 12 = 102.00 base, 102 * 1.25 = 127.50 EUR total
      const p85 = await calculateCommercialPricing(mockDb, "8.50");
      expect(p85.totalWithVat).toBe("127.50");

      // Dynamic VAT rate (e.g. 13% rate)
      const mockDb13 = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                code: "USL-VANJSKI-M",
                name: "Dizanje/spuštanje za vanjske korisnike",
                pricePerMeterEur: "12.00",
                vatRate: "13.00",
              }],
            }),
          }),
        }),
      };
      const p13 = await calculateCommercialPricing(mockDb13, "10.00");
      expect(p13.vatRate).toBe("13.00");
      // 10 * 12 = 120; 120 * 1.13 = 135.60
      expect(p13.totalWithVat).toBe("135.60");

      // Zero, missing, negative, Infinity or invalid length (e.g. 10abc) MUST throw BAD_REQUEST
      await expect(calculateCommercialPricing(mockDb, null)).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, "")).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, "0")).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, -5)).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, "10abc")).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, Infinity)).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, "Infinity")).rejects.toThrow("Duljina plovila mora biti");
      await expect(calculateCommercialPricing(mockDb, "neispravno")).rejects.toThrow("Duljina plovila mora biti");
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
    const uniqueMemberId = "a1111111-2222-4333-a444-555555555555";
    const uniqueCommercialId = "b1111111-2222-4333-a444-555555555555";
    const uniqueSuspendedOperatorId = "e1111111-2222-4333-a444-555555555555";
    const uniqueDuesUnpaidMemberId = "f1111111-2222-4333-a444-555555555555";
    const testVesselMemberId = "c1111111-2222-4333-a444-555555555555";
    const testVesselCommId = "d1111111-2222-4333-a444-555555555555";

    let stLiftId: string;
    let stLowerId: string;

    const cleanupTestData = async () => {
      const db = await requireTestDb();
      await db.delete(invoices).where(eq(invoices.userId, uniqueMemberId));
      await db.delete(invoices).where(eq(invoices.userId, uniqueCommercialId));
      await db.delete(landOccupancies).where(eq(landOccupancies.userId, uniqueMemberId));
      await db.delete(landOccupancies).where(eq(landOccupancies.userId, uniqueCommercialId));
      await db.delete(craneOperationLog).where(eq(craneOperationLog.operatorId, TEST_USER_IDS.operator));
      await db.delete(userCardEntries).where(eq(userCardEntries.userId, uniqueMemberId));
      await db.delete(userCardEntries).where(eq(userCardEntries.userId, uniqueCommercialId));
      await db.delete(userCardEntries).where(eq(userCardEntries.userId, uniqueDuesUnpaidMemberId));
      await db.delete(memberStatutoryRights).where(eq(memberStatutoryRights.userId, uniqueMemberId));
      await db.delete(memberStatutoryRights).where(eq(memberStatutoryRights.userId, uniqueDuesUnpaidMemberId));
      await db.delete(memberMemberships).where(eq(memberMemberships.userId, uniqueMemberId));
      await db.delete(memberMemberships).where(eq(memberMemberships.userId, uniqueDuesUnpaidMemberId));
      await db.delete(workOrders).where(eq(workOrders.userId, uniqueMemberId));
      await db.delete(workOrders).where(eq(workOrders.userId, uniqueCommercialId));
      await db.delete(workOrders).where(eq(workOrders.userId, uniqueDuesUnpaidMemberId));
      await db.delete(reservations).where(eq(reservations.userId, uniqueMemberId));
      await db.delete(reservations).where(eq(reservations.userId, uniqueCommercialId));
      await db.delete(reservations).where(eq(reservations.userId, uniqueDuesUnpaidMemberId));
      await db.delete(vessels).where(eq(vessels.id, testVesselMemberId));
      await db.delete(vessels).where(eq(vessels.id, testVesselCommId));
      await db.delete(vessels).where(eq(vessels.ownerId, uniqueMemberId));
      await db.delete(vessels).where(eq(vessels.ownerId, uniqueCommercialId));
      await db.delete(users).where(eq(users.id, uniqueMemberId));
      await db.delete(users).where(eq(users.id, uniqueCommercialId));
      await db.delete(users).where(eq(users.id, uniqueSuspendedOperatorId));
      await db.delete(users).where(eq(users.id, uniqueDuesUnpaidMemberId));
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

    it("Point 3: Suspended operator is rejected by resolveActiveUserById", async () => {
      const db = await requireTestDb();
      await db.insert(users).values({
        id: uniqueSuspendedOperatorId,
        email: "suspended.operator@spinut.hr",
        name: "Suspendirani Operater",
        role: "operator",
        userStatus: "suspended",
        loginMethod: "manus",
      });

      // Suspended operator must return null
      const suspendedUser = await resolveActiveUserById(uniqueSuspendedOperatorId);
      expect(suspendedUser).toBeNull();

      // Active operator returns valid user
      const activeUser = await resolveActiveUserById(TEST_USER_IDS.operator);
      expect(activeUser).not.toBeNull();
      expect(activeUser?.id).toBe(TEST_USER_IDS.operator);
      expect(activeUser?.userStatus).toBe("active");
    });

    it("Point 4: Carried-over quota consumed in current year prevents second free lift in same year", async () => {
      const db = await requireTestDb();
      const currentYear = new Date().getFullYear();
      const pastYear = currentYear - 1;

      // Setup member with an unexpired carried-over right from past year (e.g. 2025 right carried into 2026)
      await db
        .update(memberStatutoryRights)
        .set({
          liftAvailable: true,
          liftAcquiredYear: pastYear,
          liftExpiresAt: `${currentYear}-12-31`,
          lowerAvailable: true,
          lowerAcquiredYear: pastYear,
          lowerExpiresAt: `${currentYear}-12-31`,
          pendingFeeAdjustmentsCount: 0,
        })
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Member uses this carried-over lift in current year
      const [carriedRes] = await db
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

      const completion = await completeReservationOperation({
        reservationId: carriedRes.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 45,
        operatorNotes: "Trošenje prenesenog prava iz prošle godine",
        allowFutureDate: true,
      });

      expect(completion.success).toBe(true);
      expect(completion.workOrder?.isStatutoryCovered).toBe(true);

      // Verify that liftAcquiredYear was stamped as currentYear to lock out duplicate free lift
      const [rightsAfterUsage] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      expect(rightsAfterUsage.liftAvailable).toBe(false);
      expect(rightsAfterUsage.liftAcquiredYear).toBe(currentYear);

      // Calling ensureMemberStatutoryRights in currentYear MUST NOT grant a second free lift in the same year!
      const rightsCheckedAgain = await ensureMemberStatutoryRights(db, uniqueMemberId, currentYear);
      expect(rightsCheckedAgain.liftAvailable).toBe(false);
    });

    it("Point 4b: Member with unpaid annual dues (activeMember: false) is blocked from statutory quota renewal", async () => {
      const db = await requireTestDb();
      const currentYear = new Date().getFullYear();

      // Create member with unpaid membership record
      await db.insert(users).values({
        id: uniqueDuesUnpaidMemberId,
        email: "neplacena.clanarina@spinut.hr",
        name: "Član Bez Uplaćene Članarine",
        role: "user",
        clientCategory: "member",
        loginMethod: "manus",
        userStatus: "active",
      });

      await db.insert(memberMemberships).values({
        userId: uniqueDuesUnpaidMemberId,
        legacyMatBroj: "998877",
        activeMember: false, // Dues unpaid!
      });

      // ensureMemberStatutoryRights should NOT grant available rights
      const rights = await ensureMemberStatutoryRights(db, uniqueDuesUnpaidMemberId, currentYear);
      expect(rights.liftAvailable).toBe(false);
      expect(rights.lowerAvailable).toBe(false);
    });

    it("Points 1 & 2: Concurrent completions on same reservation are locked; exactly one succeeds and one reports alreadyCompleted", async () => {
      const db = await requireTestDb();

      const [concurrentRes] = await db
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

      const [rightsBefore] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Trigger two simultaneous complete calls
      const [resA, resB] = await Promise.all([
        completeReservationOperation({
          reservationId: concurrentRes.id,
          operatorId: TEST_USER_IDS.operator,
          craneId: TEST_CRANE_IDS.crane2,
          actualDurationMin: 45,
          operatorNotes: "Istodobni poziv A",
          allowFutureDate: true,
        }),
        completeReservationOperation({
          reservationId: concurrentRes.id,
          operatorId: TEST_USER_IDS.operator,
          craneId: TEST_CRANE_IDS.crane2,
          actualDurationMin: 45,
          operatorNotes: "Istodobni poziv B",
          allowFutureDate: true,
        }),
      ]);

      // Exactly one should be freshly completed, and exactly one should be alreadyCompleted
      const alreadyCompletedCount = [resA.alreadyCompleted, resB.alreadyCompleted].filter(Boolean).length;
      expect(alreadyCompletedCount).toBe(1);

      // Verify DB state: exactly 1 work order exists
      const workOrdersList = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.reservationId, concurrentRes.id));
      expect(workOrdersList).toHaveLength(1);

      // Verify DB state: exactly 1 user card entry exists
      const cardEntriesList = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, workOrdersList[0].id));
      expect(cardEntriesList).toHaveLength(1);

      // Verify reservation is completed
      const [resDb] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, concurrentRes.id));
      expect(resDb.status).toBe("completed");

      // Verify counter changed at most once
      const [rightsAfter] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));
      expect(rightsAfter.pendingFeeAdjustmentsCount - rightsBefore.pendingFeeAdjustmentsCount).toBe(1);
    });

    it("Point 5: Existing work order is updated with fresh financial fields matching user card entry", async () => {
      const db = await requireTestDb();

      // Create reservation
      const [resPre] = await db
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

      // Pre-create work order in progress without final financial fields
      const started = await startReservationWorkOrder({
        reservationId: resPre.id,
        operatorId: TEST_USER_IDS.operator,
      });
      const initialWo = started.workOrder!;

      // Complete operation - quota exceeded so it must become fee adjustment USL-D9T
      const completion = await completeReservationOperation({
        reservationId: resPre.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 55,
        operatorNotes: "Zaključenje postojećeg radnog naloga",
        allowFutureDate: true,
      });

      expect(completion.success).toBe(true);

      // Verify DB work order now has fresh financial fields
      const [woInDb] = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, initialWo.id));

      expect(woInDb.status).toBe("completed");
      expect(woInDb.isStatutoryCovered).toBe(false);
      expect(woInDb.chargeItemCode).toBe("USL-D9T");
      expect(woInDb.chargeItemName).toContain("9T");

      // Verify user card entry matches work order exactly
      const [cardInDb] = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.workOrderId, initialWo.id));

      expect(cardInDb.serviceItemCode).toBe(woInDb.chargeItemCode);
      expect(cardInDb.entryType).toBe("fee_adjustment_charge");
    });

    it("Point 6: getUnifiedCycleSummary and generateUnifiedQuote calculate matching 281.25 € for member with 45-day stay", async () => {
      const db = await requireTestDb();

      // Ensure standard 25% rate on berth price item
      await db
        .update(priceListItems)
        .set({ vatRate: "25.00", fixedPriceEur: "15.00", isActive: true })
        .where(eq(priceListItems.code, "USL-LEZARINA-DAN"));

      // Clear previous occupancies for this test vessel so the 45-day occupancy is the latest
      await db.delete(landOccupancies).where(eq(landOccupancies.vesselId, testVesselMemberId));

      // Fetch a valid land zone
      const [zone] = await db.select().from(landZones).limit(1);

      // Lift 45 days ago, returned exactly 45 days later -> 45 total days, 30 free, 15 billable @ 15 € + 25% VAT = 281.25 €
      const fortyFiveDaysAgo = new Date();
      fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
      const returnedDate = new Date(fortyFiveDaysAgo.getTime() + 45 * 24 * 60 * 60 * 1000);

      const [resLift] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "completed",
          scheduledStart: fortyFiveDaysAgo,
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      const [resLower] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLowerId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "completed",
          scheduledStart: returnedDate,
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      const [occupancy] = await db
        .insert(landOccupancies)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          zoneId: zone.id,
          spotNumber: 12,
          reservationId: resLift.id,
          returnReservationId: resLower.id,
          liftedAt: fortyFiveDaysAgo,
          returnedAt: returnedDate,
        })
        .returning();

      // Create caller with operator privileges
      const [operatorUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, TEST_USER_IDS.operator))
        .limit(1);

      const caller = appRouter.createCaller({
        user: operatorUser,
        req: {} as any,
        res: {} as any,
      });

      // 1. Check getUnifiedCycleSummary
      const summary = await caller.workOrders.getUnifiedCycleSummary({
        vesselId: testVesselMemberId,
      });

      expect(summary.occupancy?.totalDays).toBe(45);
      expect(summary.occupancy?.freeDaysAllowed).toBe(30);
      expect(summary.occupancy?.billableDays).toBe(15);
      expect(summary.totals.berthCostNet).toBe(225.00); // 15 * 15.00
      expect(summary.totals.grandTotalNet).toBe(225.00);
      expect(summary.totals.grandTotalVat).toBe(56.25);  // 225 * 0.25
      expect(summary.totals.grandTotalGross).toBe(281.25);

      // 2. Check generateUnifiedQuote
      const quote = await caller.workOrders.generateUnifiedQuote({
        vesselId: testVesselMemberId,
        userId: uniqueMemberId,
        documentType: "proforma",
        dueDateDays: 15,
      });

      expect(Number(quote.totalNetAmount)).toBe(225.00);
      expect(Number(quote.totalVatAmount)).toBe(56.25);
      expect(Number(quote.totalGrossAmount)).toBe(281.25);

      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, quote.id));
      expect(items).toHaveLength(1);
      expect(items[0].productCode).toBe("USL-LEZARINA-DAN");
      expect(items[0].quantity).toBe("15.00");
    });

    it("Point 7: Commercial service respects custom VAT rate and ignores deactivated price items", async () => {
      const db = await requireTestDb();

      // Temporarily deactivate USL-VANJSKI-M and set an extreme price
      await db
        .update(priceListItems)
        .set({ isActive: false, pricePerMeterEur: "99.00" })
        .where(eq(priceListItems.code, "USL-VANJSKI-M"));

      // calculateCommercialPricing must IGNORE the deactivated item and fall back to default rate 12.00
      const inactiveRes = await calculateCommercialPricing(db, "10.00");
      expect(inactiveRes.ratePerMeter).toBe("12.00"); // default fallback, not 99.00!

      // Reactivate with custom 13% VAT and 10.00 EUR rate
      await db
        .update(priceListItems)
        .set({ isActive: true, vatRate: "13.00", pricePerMeterEur: "10.00" })
        .where(eq(priceListItems.code, "USL-VANJSKI-M"));

      // Commercial reservation with 10.00m vessel
      const [resComm13] = await db
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
          vesselLengthM: "10.00",
        })
        .returning();

      const completion = await completeReservationOperation({
        reservationId: resComm13.id,
        operatorId: TEST_USER_IDS.operator,
        craneId: TEST_CRANE_IDS.crane2,
        actualDurationMin: 60,
        allowFutureDate: true,
      });

      expect(completion.success).toBe(true);
      // Rate: 10.00 m * 10.00 EUR = 100.00 EUR net.
      // VAT 13% = 13.00 EUR -> Total = 113.00 EUR.
      expect(completion.workOrder?.commercialPricePerMeter).toBe("10.00");
      expect(completion.workOrder?.commercialTotal).toBe("113.00");
      expect(completion.workOrder?.vatRate).toBe("13.00"); // Not hardcoded 25.00!

      // Restore active price list item to standard defaults
      await db
        .update(priceListItems)
        .set({ vatRate: "25.00", pricePerMeterEur: "12.00" })
        .where(eq(priceListItems.code, "USL-VANJSKI-M"));
    });

    it("High Priority: Concurrent operations for SAME member on DIFFERENT reservations are locked and consume quota exactly once", async () => {
      const db = await requireTestDb();
      const currentYear = new Date().getFullYear();

      // Reset member quota so liftAvailable is true
      await db
        .update(memberStatutoryRights)
        .set({
          liftAvailable: true,
          liftAcquiredYear: currentYear,
          pendingFeeAdjustmentsCount: 0,
        })
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));

      // Create two distinct approved reservations for the same member
      const [resDiffA] = await db
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

      const [resDiffB] = await db
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

      // Complete both DIFFERENT reservations for the SAME member concurrently
      const [compA, compB] = await Promise.all([
        completeReservationOperation({
          reservationId: resDiffA.id,
          operatorId: TEST_USER_IDS.operator,
          craneId: TEST_CRANE_IDS.crane2,
          actualDurationMin: 40,
          operatorNotes: "Istodobno vađenje rezervacija A",
          allowFutureDate: true,
        }),
        completeReservationOperation({
          reservationId: resDiffB.id,
          operatorId: TEST_USER_IDS.operator,
          craneId: TEST_CRANE_IDS.crane2,
          actualDurationMin: 40,
          operatorNotes: "Istodobno vađenje rezervacija B",
          allowFutureDate: true,
        }),
      ]);

      expect(compA.success).toBe(true);
      expect(compB.success).toBe(true);

      // Exactly ONE must be statutory covered (free lift), and exactly ONE must be fee adjustment (exceeded quota)
      const coveredCount = [compA.workOrder?.isStatutoryCovered, compB.workOrder?.isStatutoryCovered].filter(Boolean).length;
      expect(coveredCount).toBe(1);

      const feeChargedCount = [compA.workOrder?.chargeItemCode, compB.workOrder?.chargeItemCode].filter(
        c => c === "USL-D9T"
      ).length;
      expect(feeChargedCount).toBe(1);

      // Check card entries in DB
      const cardEntries = await db
        .select()
        .from(userCardEntries)
        .where(eq(userCardEntries.userId, uniqueMemberId));

      const statutoryUsedEntries = cardEntries.filter(
        e => (e.workOrderId === compA.workOrder?.id || e.workOrderId === compB.workOrder?.id) && e.entryType === "statutory_quota_used"
      );
      const feeAdjustmentEntries = cardEntries.filter(
        e => (e.workOrderId === compA.workOrder?.id || e.workOrderId === compB.workOrder?.id) && e.entryType === "fee_adjustment_charge"
      );

      expect(statutoryUsedEntries).toHaveLength(1);
      expect(feeAdjustmentEntries).toHaveLength(1);

      // Check rights in DB
      const [rightsInDb] = await db
        .select()
        .from(memberStatutoryRights)
        .where(eq(memberStatutoryRights.userId, uniqueMemberId));
      expect(rightsInDb.liftAvailable).toBe(false);
      expect(rightsInDb.pendingFeeAdjustmentsCount).toBe(1);
    });

    it("High Priority: Missing vessel length is NOT replaced with 8m and throws BAD_REQUEST for commercial client", async () => {
      const db = await requireTestDb();

      // Create a commercial vessel without length
      const noLenVesselId = "c2222222-2222-4333-a444-555555555555";
      await db.delete(vessels).where(eq(vessels.id, noLenVesselId));
      await db.insert(vessels).values({
        id: noLenVesselId,
        ownerId: uniqueCommercialId,
        name: "Brod Bez Duljine",
        registration: "ZG-0000-NL",
        type: "motorni",
        lengthM: null, // missing!
      });

      const [resNoLen] = await db
        .insert(reservations)
        .values({
          userId: uniqueCommercialId,
          vesselId: noLenVesselId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: new Date(),
          durationMin: 60,
          vesselName: "Brod Bez Duljine",
          vesselRegistration: "ZG-0000-NL",
          vesselLengthM: null, // missing!
        })
        .returning();

      // Completing without length must reject with BAD_REQUEST, never silently using 8m
      await expect(
        completeReservationOperation({
          reservationId: resNoLen.id,
          operatorId: TEST_USER_IDS.operator,
          craneId: TEST_CRANE_IDS.crane2,
          actualDurationMin: 60,
          allowFutureDate: true,
        })
      ).rejects.toThrow("Duljina plovila mora biti");

      await db.delete(reservations).where(eq(reservations.id, resNoLen.id));
      await db.delete(vessels).where(eq(vessels.id, noLenVesselId));
    });

    it("Medium Priority: Concurrent numbering generation is concurrency-safe and produces distinct sequential numbers", async () => {
      const db = await requireTestDb();
      const currentYear = new Date().getFullYear();

      // Generate 5 work order numbers concurrently inside independent transactions
      const orderNumbers = await Promise.all([
        db.transaction(async (tx) => {
          const num = await generateWorkOrderNumber(tx, currentYear);
          await tx.insert(workOrders).values({
            orderNumber: num,
            userId: uniqueMemberId,
            craneId: TEST_CRANE_IDS.crane2,
            operatorId: TEST_USER_IDS.operator,
            status: "in_progress",
          });
          return num;
        }),
        db.transaction(async (tx) => {
          const num = await generateWorkOrderNumber(tx, currentYear);
          await tx.insert(workOrders).values({
            orderNumber: num,
            userId: uniqueMemberId,
            craneId: TEST_CRANE_IDS.crane2,
            operatorId: TEST_USER_IDS.operator,
            status: "in_progress",
          });
          return num;
        }),
        db.transaction(async (tx) => {
          const num = await generateWorkOrderNumber(tx, currentYear);
          await tx.insert(workOrders).values({
            orderNumber: num,
            userId: uniqueMemberId,
            craneId: TEST_CRANE_IDS.crane2,
            operatorId: TEST_USER_IDS.operator,
            status: "in_progress",
          });
          return num;
        }),
      ]);

      // All generated numbers MUST be distinct
      const uniqueNumbers = new Set(orderNumbers);
      expect(uniqueNumbers.size).toBe(3);

      // Clean up the draft test orders
      for (const num of orderNumbers) {
        await db.delete(workOrders).where(eq(workOrders.orderNumber, num));
      }
    });

    it("Medium Priority: getUnifiedCycleSummary returns dynamic vatRate matching items rate instead of hardcoded 25.00", async () => {
      const db = await requireTestDb();

      // Clear previous occupancies for this test vessel so the 45-day occupancy is the latest
      await db.delete(landOccupancies).where(eq(landOccupancies.vesselId, testVesselMemberId));

      const [zone] = await db.select().from(landZones).limit(1);
      const fortyFiveDaysAgo = new Date();
      fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
      const returnedDate = new Date(fortyFiveDaysAgo.getTime() + 45 * 24 * 60 * 60 * 1000);

      await db.insert(landOccupancies).values({
        userId: uniqueMemberId,
        vesselId: testVesselMemberId,
        zoneId: zone.id,
        spotNumber: 12,
        liftedAt: fortyFiveDaysAgo,
        returnedAt: returnedDate,
      });

      try {
        // Set berth item to 13.00% VAT
        await db
          .update(priceListItems)
          .set({ vatRate: "13.00" })
          .where(eq(priceListItems.code, "USL-LEZARINA-DAN"));

        const [operatorUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, TEST_USER_IDS.operator))
          .limit(1);

        const caller = appRouter.createCaller({
          user: operatorUser,
          req: {} as any,
          res: {} as any,
        });

        const summary = await caller.workOrders.getUnifiedCycleSummary({
          vesselId: testVesselMemberId,
        });

        // VAT rate should be 13.00%
        expect(summary.totals.vatRate).toBe(13.00);
        expect(summary.totals.berthVatRate).toBe(13.00);
        // Net 225.00 * 0.13 = 29.25
        expect(summary.totals.grandTotalVat).toBe(29.25);
        expect(summary.totals.grandTotalGross).toBe(254.25);
      } finally {
        // Always restore to 25.00%
        await db
          .update(priceListItems)
          .set({ vatRate: "25.00" })
          .where(eq(priceListItems.code, "USL-LEZARINA-DAN"));
      }
    });

    it("Medium Priority: workOrders.complete enforces allowFutureDate: false and blocks future appointment completion", async () => {
      const db = await requireTestDb();

      // Create reservation scheduled for day after tomorrow
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const [futureRes] = await db
        .insert(reservations)
        .values({
          userId: uniqueMemberId,
          vesselId: testVesselMemberId,
          serviceTypeId: stLiftId,
          craneId: TEST_CRANE_IDS.crane2,
          status: "approved",
          scheduledStart: futureDate,
          durationMin: 60,
          vesselName: "Morski Vuk (Član)",
          vesselRegistration: "ST-1234-CL",
          vesselLengthM: "9.50",
        })
        .returning();

      // Create an existing in-progress work order for this reservation
      const [futureWo] = await db
        .insert(workOrders)
        .values({
          orderNumber: "RN-FUTURE-TEST-01",
          reservationId: futureRes.id,
          userId: uniqueMemberId,
          craneId: TEST_CRANE_IDS.crane2,
          operatorId: TEST_USER_IDS.operator,
          status: "in_progress",
          clientType: "member",
        })
        .returning();

      const [operatorUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, TEST_USER_IDS.operator))
        .limit(1);

      const caller = appRouter.createCaller({
        user: operatorUser,
        req: {} as any,
        res: {} as any,
      });

      // Calling workOrders.complete on a future appointment MUST fail with BAD_REQUEST
      await expect(
        caller.workOrders.complete({
          workOrderId: futureWo.id,
          actualDurationMin: 45,
          operatorNotes: "Pokušaj zaključenja budućeg termina",
        })
      ).rejects.toThrow("Nije moguće zaključiti operaciju za rezervaciju koja je zakazana za budući datum");

      // Cleanup
      await db.delete(workOrders).where(eq(workOrders.id, futureWo.id));
      await db.delete(reservations).where(eq(reservations.id, futureRes.id));
    });

    it("Truck Unloading: truck's own crane incurs 0,00 EUR crane fee, while club crane engages club crane", async () => {
      const db = await requireTestDb();
      const [testZone] = await db.select().from(landZones).limit(1);

      const [operatorUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, TEST_USER_IDS.operator))
        .limit(1);

      const caller = appRouter.createCaller({
        user: operatorUser,
        req: {} as any,
        res: {} as any,
      });

      // 1. Truck with own crane (bez klupske dizalice)
      const truckPlacementResult = await caller.landOccupancy.placeFromTruck({
        userId: uniqueCommercialId,
        newVessel: {
          name: "Kamionski Brod Test",
          type: "motorni",
          registration: "KB-TRUCK-99",
          lengthM: 8.0,
          beamM: 2.5,
          draftM: 0.8,
          weightTons: 2.2,
        },
        zoneId: testZone.id,
        spotNumber: 99,
        craneUsageMode: "truck_crane",
        note: "Iskrcaj vlastitom hidrauličkom dizalicom kamiona",
      });

      expect(truckPlacementResult.id).toBeDefined();
      expect(truckPlacementResult.vesselId).toBeDefined();

      const [truckOcc] = await db
        .select()
        .from(landOccupancies)
        .where(eq(landOccupancies.id, truckPlacementResult.id));

      expect(truckOcc.reservationId).toBeNull();
      expect(truckOcc.note).toContain("[KAMION - VLASTITA DIZALICA KAMIONA (BEZ KLUPSKE DIZALICE)]");

      // Verify that getUnifiedCycleSummary returns 0 EUR for liftCostNet
      const summary = await caller.workOrders.getUnifiedCycleSummary({
        userId: uniqueCommercialId,
        vesselId: truckPlacementResult.vesselId,
      });

      expect(summary.lift.costNet).toBe(0);
      expect(summary.totals.liftCostNet).toBe(0);

      // Verify that generateUnifiedQuote does not charge USL-DIZ-VAD
      const quote = await caller.workOrders.generateUnifiedQuote({
        userId: uniqueCommercialId,
        vesselId: truckPlacementResult.vesselId,
        documentType: "proforma",
      });

      const invItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, quote.id));
      expect(invItems.some((i: any) => i.productCode === "USL-DIZ-VAD")).toBe(false);

      // Clean up truck placement, invoice, and vessel
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, quote.id));
      await db.delete(invoices).where(eq(invoices.id, quote.id));
      await db.delete(landOccupancies).where(eq(landOccupancies.id, truckPlacementResult.id));
      await db.delete(vessels).where(eq(vessels.id, truckPlacementResult.vesselId));
    });

    afterAll(async () => {
      await cleanupTestData();
    });
  });
});
