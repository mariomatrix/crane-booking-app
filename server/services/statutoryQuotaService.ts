import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  memberStatutoryRights,
  memberMemberships,
  priceListItems,
  cranes,
  serviceTypes,
} from "../../drizzle/schema";

export interface QuotaOperationEvaluation {
  quotaOperationType: "lift" | "lower" | "none";
  opCategory: string | null;
  isTruckDelivery: boolean;
}

/**
 * Determine the quota operation type (lift, lower, or none) from service type and fallbacks.
 */
export async function evaluateQuotaOperationType(
  db: any,
  serviceTypeId?: string | null,
  liftPurpose?: string | null
): Promise<QuotaOperationEvaluation> {
  let quotaOperationType: "lift" | "lower" | "none" = "none";
  let opCategory: string | null = null;
  let isTruckDelivery = false;

  if (serviceTypeId) {
    const [st] = await db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.id, serviceTypeId))
      .limit(1);

    if (st) {
      opCategory = st.operationCategory || null;
      isTruckDelivery = !!st.name?.toLowerCase().includes("kamion");
      if (isTruckDelivery) {
        quotaOperationType = "none";
      } else if (st.operationCategory === "lift_from_sea") {
        quotaOperationType = "lift";
      } else if (st.operationCategory === "lower_to_sea") {
        quotaOperationType = "lower";
      }
    }
  }

  // Fallback if serviceTypeId was missing or category was unresolved
  if (quotaOperationType === "none" && !isTruckDelivery && liftPurpose) {
    const lp = liftPurpose.toLowerCase();
    if (lp.includes("spušt") || lp.includes("spust") || lp.includes("lower")) {
      quotaOperationType = "lower";
      opCategory = "lower_to_sea";
    } else if (lp.includes("vađ") || lp.includes("vad") || lp.includes("diz") || lp.includes("lift") || lp.includes("zimovanje")) {
      quotaOperationType = "lift";
      opCategory = "lift_from_sea";
    }
  }

  return { quotaOperationType, opCategory, isTruckDelivery };
}

/**
 * Ensures a member's statutory rights are accurately initialized or rolled over according to PŠD rules:
 * 1. 1 lift + 1 lower per annual membership cycle.
 * 2. Valid for 2 years (current year + next year, until 31.12. N+1).
 * 3. Non-cumulative: rights never accumulate to 2 lifts or 2 lowers.
 * 4. Year rollover: if quota was used in year N-1, year N grants fresh annual quota provided membership dues are active.
 *    If quota from N-2 expired on 31.12. N-1, old quota is retired and year N quota is granted.
 */
export async function ensureMemberStatutoryRights(
  db: any,
  userId: string,
  currentYear?: number
) {
  const year = currentYear ?? new Date().getFullYear();
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const defaultExpiresAt = `${year + 1}-12-31`;

  // Verify membership payment / active status if recorded
  const [membership] = await db
    .select({ activeMember: memberMemberships.activeMember })
    .from(memberMemberships)
    .where(eq(memberMemberships.userId, userId))
    .limit(1);

  // If a membership record is recorded and activeMember === false (unpaid dues), renewal is blocked
  const isDuesPaid = membership ? membership.activeMember : true;

  let [rights] = await db
    .select()
    .from(memberStatutoryRights)
    .where(eq(memberStatutoryRights.userId, userId))
    .limit(1);

  if (!rights) {
    [rights] = await db
      .insert(memberStatutoryRights)
      .values({
        userId,
        liftAvailable: isDuesPaid,
        liftAcquiredYear: year,
        liftExpiresAt: defaultExpiresAt,
        lowerAvailable: isDuesPaid,
        lowerAcquiredYear: year,
        lowerExpiresAt: defaultExpiresAt,
        pendingFeeAdjustmentsCount: 0,
      })
      .returning();
    return rights;
  }

  // If member dues are unpaid, do not grant new quota
  if (!isDuesPaid) {
    return rights;
  }

  let needsUpdate = false;
  const updates: Partial<typeof memberStatutoryRights.$inferInsert> = {};

  // --- LIFT LOGIC ---
  if (!rights.liftAvailable) {
    // If lift was already used in a previous year (acquiredYear < currentYear),
    // the member acquires their new annual membership quota for current year.
    if (rights.liftAcquiredYear < year) {
      updates.liftAvailable = true;
      updates.liftAcquiredYear = year;
      updates.liftExpiresAt = defaultExpiresAt;
      needsUpdate = true;
    }
  } else {
    // If lift is marked available, check if the old 2-year window expired (e.g. acquired in Y-2)
    const expiresAtStr = String(rights.liftExpiresAt);
    if (expiresAtStr < todayStr) {
      // Old unused right expired (lost due to non-cumulative expiry).
      // Active member in current year receives fresh current year right.
      updates.liftAvailable = true;
      updates.liftAcquiredYear = year;
      updates.liftExpiresAt = defaultExpiresAt;
      needsUpdate = true;
    }
  }

  // --- LOWER LOGIC ---
  if (!rights.lowerAvailable) {
    // If lower was already used in a previous year (acquiredYear < currentYear),
    // the member acquires their new annual membership quota for current year.
    if (rights.lowerAcquiredYear < year) {
      updates.lowerAvailable = true;
      updates.lowerAcquiredYear = year;
      updates.lowerExpiresAt = defaultExpiresAt;
      needsUpdate = true;
    }
  } else {
    // If lower is marked available, check if the old 2-year window expired
    const expiresAtStr = String(rights.lowerExpiresAt);
    if (expiresAtStr < todayStr) {
      updates.lowerAvailable = true;
      updates.lowerAcquiredYear = year;
      updates.lowerExpiresAt = defaultExpiresAt;
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    updates.updatedAt = new Date();
    await db
      .update(memberStatutoryRights)
      .set(updates)
      .where(eq(memberStatutoryRights.id, rights.id));

    const [refreshed] = await db
      .select()
      .from(memberStatutoryRights)
      .where(eq(memberStatutoryRights.id, rights.id))
      .limit(1);
    rights = refreshed;
  }

  return rights;
}

/**
 * Determine the appropriate fee adjustment price item (e.g. Travelift 50T vs 9T crane).
 */
export async function determineMemberFeeAdjustmentItem(
  db: any,
  craneId?: string | null
): Promise<{ code: string; name: string }> {
  let isTravelift = false;

  if (craneId) {
    const [crane] = await db
      .select()
      .from(cranes)
      .where(eq(cranes.id, craneId))
      .limit(1);

    if (crane) {
      const nameLower = (crane.name || "").toLowerCase();
      isTravelift =
        nameLower.includes("travelift") ||
        nameLower.includes("50t") ||
        (crane.type === "travelift" && Number(crane.maxCapacityKN || 0) >= 400);
    }
  }

  const preferredCode = isTravelift ? "USL-TR50" : "USL-D9T";

  const [priceItem] = await db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.code, preferredCode), eq(priceListItems.isActive, true)))
    .limit(1);

  if (priceItem?.code) {
    return { code: priceItem.code, name: priceItem.name || preferredCode };
  }

  if (isTravelift) {
    return {
      code: "USL-TR50",
      name: "Korištenje Travelifta 50T (Doplata članarine)",
    };
  }

  return {
    code: "USL-D9T",
    name: "Korištenje dizalice 9T (Doplata članarine)",
  };
}

/**
 * Commercial calculation for external / non-member vessels based on length in meters.
 * Validates that length is strictly positive and applies active price list item and configured VAT rate.
 */
export async function calculateCommercialPricing(
  db: any,
  vesselLengthM?: string | number | null
): Promise<{
  ratePerMeter: string;
  totalWithVat: string;
  vesselLengthM: string;
  chargeItemCode: string;
  chargeItemName: string;
  vatRate: string;
}> {
  const parsedLen = typeof vesselLengthM === "number" ? vesselLengthM : parseFloat(String(vesselLengthM ?? "").trim());
  if (isNaN(parsedLen) || parsedLen <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Duljina plovila mora biti valjani pozitivni broj veći od 0 metara za komercijalni obračun (uneseno: "${vesselLengthM ?? ""}").`,
    });
  }

  const [priceItem] = await db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.code, "USL-VANJSKI-M"), eq(priceListItems.isActive, true)))
    .limit(1);

  const rate = priceItem?.pricePerMeterEur ? Number(priceItem.pricePerMeterEur) : 12.0;
  const vatRate = priceItem?.vatRate ? Number(priceItem.vatRate) : 25.0;

  const baseAmount = parsedLen * rate;
  const total = baseAmount * (1 + vatRate / 100);

  return {
    ratePerMeter: rate.toFixed(2),
    totalWithVat: total.toFixed(2),
    vesselLengthM: parsedLen.toFixed(2),
    chargeItemCode: priceItem?.code || "USL-VANJSKI-M",
    chargeItemName: priceItem?.name || "Komercijalno korištenje dizalice (po metru duljine)",
    vatRate: vatRate.toFixed(2),
  };
}
