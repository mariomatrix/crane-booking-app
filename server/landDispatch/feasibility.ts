import { eq, and, isNull, sql } from "drizzle-orm";
import { toZagreb } from "@shared/timezone";
import { getDb } from "../db";
import { craneZoneAffinities, landZones, landOccupancies } from "../../drizzle/schema";
import { fetchActiveStoppagesForDate } from "./stoppage";

export interface FeasibilityCheckParams {
  crane: {
    id: string;
    name: string;
    maxCapacityKN: number;
    maxPoolWidth: number | null;
    craneStatus: string;
  };
  zone: {
    id: string;
    code: string;
    name: string;
    totalSpots: number;
  };
  affinity?: {
    isAllowed: boolean;
    isBlocked: boolean;
    affinityScore: number;
    penaltySlots: number;
  };
  vessel: {
    name: string;
    weightTons: number | null;
    beamM: number | null;
    lengthM: number | null;
  };
  operationCategory: string; // 'lift_from_sea' | 'lower_to_sea' | 'maintenance' | 'other'
  slotStart: Date;
  slotEnd: Date;
  activeStoppages: Array<{
    scope: string;
    craneId: string | null;
    zoneId: string | null;
    startsAt: Date | string;
    endsAt: Date | string | null;
    reason: string;
  }>;
  existingReservations: Array<{
    id: string;
    craneId: string | null;
    landZoneId: string | null;
    operationCategory: string;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    status: string;
    vesselName?: string | null;
  }>;
  currentZoneFreeAtSlot: number;
  maxConcurrentTeams?: number; // default 2
  teamOverride?: boolean;
  weightTolerancePercent?: number; // default 10 (%)
  allowConstraintOverrides?: boolean; // when true, 100-110% weight, blocked affinity, and full zone become overridable instead of hard blocks
}

export interface FeasibilityResult {
  isFeasible: boolean;
  hardBlockReasons: string[];
  overrideReasons: string[];
  warnings: string[];
  teamCapacityExceeded: boolean;
  concurrentTeamsInSlot: number;
  requiresTeamOverride: boolean;
  requiresOverride: boolean;
  rotationalCandidateReservationId?: string;
  rotationalCandidateVesselName?: string;
}

export function checkFeasibility(params: FeasibilityCheckParams): FeasibilityResult {
  const {
    crane,
    zone,
    affinity,
    vessel,
    operationCategory,
    slotStart,
    slotEnd,
    activeStoppages,
    existingReservations,
    currentZoneFreeAtSlot,
    maxConcurrentTeams = 2,
    teamOverride = false,
    weightTolerancePercent = 10,
    allowConstraintOverrides = false,
  } = params;

  const hardBlockReasons: string[] = [];
  const overrideReasons: string[] = [];
  const warnings: string[] = [];

  const startMs = slotStart.getTime();
  const endMs = slotEnd.getTime();

  // 1. Crane Active Status
  if (crane.craneStatus !== "active") {
    hardBlockReasons.push(`Dizalica ${crane.name} nije u funkciji (status: ${crane.craneStatus}).`);
  }

  // 2. Crane Weight Limit (1 ton ~ 9.80665 kN, with configurable tolerance default 10%)
  if (vessel.weightTons && vessel.weightTons > 0) {
    const vesselWeightKN = vessel.weightTons * 9.80665;
    const nominalTons = crane.maxCapacityKN / 9.80665;
    const maxToleranceFactor = 1 + Math.max(0, weightTolerancePercent) / 100;
    const maxToleranceKN = crane.maxCapacityKN * maxToleranceFactor;
    const maxToleranceTons = maxToleranceKN / 9.80665;

    if (vesselWeightKN > maxToleranceKN) {
      hardBlockReasons.push(
        `Masa plovila (${vessel.weightTons.toFixed(1)} t) premašuje nosivost dizalice ${crane.name} (${nominalTons.toFixed(1)} t / ${crane.maxCapacityKN} kN, max s +${weightTolerancePercent}% tolerancijom: ${maxToleranceTons.toFixed(1)} t).`
      );
    } else if (vesselWeightKN > crane.maxCapacityKN) {
      const exceedPct = ((vesselWeightKN - crane.maxCapacityKN) / crane.maxCapacityKN) * 100;
      const msg = `Masa plovila (${vessel.weightTons.toFixed(1)} t) prelazi nominalnu nosivost dizalice ${crane.name} (${nominalTons.toFixed(1)} t) za +${exceedPct.toFixed(1)}% (unutar +${weightTolerancePercent}% tolerancije).`;
      overrideReasons.push(msg);
      warnings.push(`${msg} Potreban je svjesni dispečerski override.`);
      if (!allowConstraintOverrides && !teamOverride) {
        hardBlockReasons.push(msg);
      }
    }
  }

  // 3. Crane Pool Width (Travelift)
  if (crane.maxPoolWidth && vessel.beamM && vessel.beamM > 0) {
    if (vessel.beamM > Number(crane.maxPoolWidth)) {
      hardBlockReasons.push(
        `Širina plovila (${vessel.beamM.toFixed(2)} m) premašuje širinu bazena dizalice ${crane.name} (${Number(crane.maxPoolWidth).toFixed(2)} m).`
      );
    }
  }

  // 4. Crane-Zone Technical Permission
  if (affinity) {
    if (!affinity.isAllowed || affinity.isBlocked) {
      const msg = `Dizalica ${crane.name} nema tehnički dopušten pristup zoni ${zone.code} (${zone.name}).`;
      overrideReasons.push(msg);
      if (allowConstraintOverrides) {
        warnings.push(`${msg} Zahtijeva svjesni dispečerski override.`);
      } else {
        hardBlockReasons.push(msg);
      }
    } else if (affinity.penaltySlots > 0) {
      warnings.push(
        `Sekundarna zona za dizalicu ${crane.name} (afinitet ${affinity.affinityScore}/100, dodatni transport +${affinity.penaltySlots * 5} min).`
      );
    }
  }

  // 5. Active Work Stoppages (Wind / Bura / Maintenance) — Hard Block
  for (const st of activeStoppages) {
    const stStart = new Date(st.startsAt).getTime();
    const stEnd = st.endsAt ? new Date(st.endsAt).getTime() : Infinity;

    // Check overlap
    if (startMs < stEnd && endMs > stStart) {
      if (st.scope === "all_cranes") {
        hardBlockReasons.push(`Rad svih dizalica je obustavljen (${st.reason}).`);
      } else if (st.scope === "single_crane" && st.craneId === crane.id) {
        hardBlockReasons.push(`Dizalica ${crane.name} je pod obustavom rada (${st.reason}).`);
      } else if (st.scope === "single_zone" && st.zoneId === zone.id) {
        hardBlockReasons.push(`Zona ${zone.code} je pod obustavom rada (${st.reason}).`);
      }
    }
  }

  // 6. Crane Slot Availability (no overlap on same crane)
  const overlappingOnSameCrane = existingReservations.filter((r) => {
    if (r.craneId !== crane.id) return false;
    if (r.status === "cancelled" || r.status === "not_performed" || r.status === "rejected") return false;
    const rStart = new Date(r.scheduledStart).getTime();
    const rEnd = new Date(r.scheduledEnd).getTime();
    return startMs < rEnd && endMs > rStart;
  });

  if (overlappingOnSameCrane.length > 0) {
    hardBlockReasons.push(`Dizalica ${crane.name} već ima zakazanu operaciju u terminu ${slotStart.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}.`);
  }

  // 7. Team Concurrency Limit (Black box teams: max 2 simultaneous cranes)
  const concurrentOpsInSlot = existingReservations.filter((r) => {
    if (r.status === "cancelled" || r.status === "not_performed" || r.status === "rejected") return false;
    const rStart = new Date(r.scheduledStart).getTime();
    const rEnd = new Date(r.scheduledEnd).getTime();
    return startMs < rEnd && endMs > rStart;
  });

  const concurrentTeamsCount = concurrentOpsInSlot.length;
  let teamCapacityExceeded = false;
  let requiresTeamOverride = false;

  if (concurrentTeamsCount >= maxConcurrentTeams) {
    teamCapacityExceeded = true;
    requiresTeamOverride = true;
    const teamMsg = `Kapacitet posade je popunjen (${concurrentTeamsCount}/${maxConcurrentTeams} dizalica već radi).`;
    overrideReasons.push(teamMsg);
    if (!teamOverride) {
      warnings.push(
        `${teamMsg} Potreban je dispečerski override.`
      );
    } else {
      warnings.push(`Aktiviran dispečerski override za posadu (${concurrentTeamsCount + 1}/${maxConcurrentTeams} operacija).`);
    }
  }

  // 8. Land Capacity & Same-Day Rotation
  let rotationalCandidateReservationId: string | undefined;
  let rotationalCandidateVesselName: string | undefined;

  if (operationCategory === "lift_from_sea") {
    if (currentZoneFreeAtSlot <= 0) {
      // Look for a lower_to_sea operation finishing right before or at slotStart in the same zone
      const candidateRotation = existingReservations.find((r) => {
        if (r.landZoneId !== zone.id) return false;
        if (r.operationCategory !== "lower_to_sea") return false;
        if (r.status === "cancelled" || r.status === "not_performed" || r.status === "rejected") return false;
        const rEnd = new Date(r.scheduledEnd).getTime();
        // Finishes up to 60 minutes before or at the start of our slot
        return rEnd <= startMs && (startMs - rEnd) <= 60 * 60 * 1000;
      });

      if (candidateRotation) {
        rotationalCandidateReservationId = candidateRotation.id;
        rotationalCandidateVesselName = candidateRotation.vesselName ?? undefined;
        warnings.push(
          `Zona ${zone.code} nema slobodnih mjesta, ali se oslobađa rotacijom nakon spuštanja plovila ${candidateRotation.vesselName || "drugog plovila"}.`
        );
      } else {
        const zoneMsg = `Zona ${zone.code} nema slobodnih mjesta na kopnu u tom terminu.`;
        overrideReasons.push(zoneMsg);
        if (allowConstraintOverrides) {
          warnings.push(`${zoneMsg} Zahtijeva svjesni override za privremeni smještaj.`);
        } else {
          hardBlockReasons.push(zoneMsg);
        }
      }
    }
  }

  const requiresOverride = overrideReasons.length > 0;
  // If requiresOverride is set, but teamOverride is not true, we treat it as blocking unless override is passed
  const isFeasible = hardBlockReasons.length === 0 && (!requiresOverride || teamOverride);

  return {
    isFeasible,
    hardBlockReasons,
    overrideReasons,
    warnings,
    teamCapacityExceeded,
    concurrentTeamsInSlot: concurrentTeamsCount,
    requiresTeamOverride,
    requiresOverride,
    rotationalCandidateReservationId,
    rotationalCandidateVesselName,
  };
}

/**
 * Server-side validation of crane weight capacity (with 10% tolerance),
 * crane pool width, active work stoppages (hard block), crane-zone technical affinity,
 * zone capacity, and team concurrency for reservation edit/reschedule/approve mutations.
 */
export async function validateReservationConstraintsAndOverrides(params: {
  crane: {
    id: string;
    name: string;
    maxCapacityKN: number | string;
    maxPoolWidth?: number | string | null;
    craneStatus: string;
  };
  landZoneId?: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  operationCategory?: string | null;
  vesselWeightTons?: number | string | null;
  vesselBeamM?: number | string | null;
  overrideConfirmed?: boolean;
  overrideReason?: string | null;
  requireReasonOnOverride?: boolean;
  teamCapacityCheck?: {
    hasCapacity: boolean;
    busyCranesNames: string[];
  };
  weightTolerancePercent?: number;
}): Promise<{
  allowed: boolean;
  code?: "BAD_REQUEST" | "CONFLICT";
  message?: string;
  hasOverride: boolean;
  overrideReasons: string[];
  formattedOverrideReason: string | null;
}> {
  const {
    crane,
    landZoneId,
    scheduledStart,
    scheduledEnd,
    operationCategory,
    vesselWeightTons,
    vesselBeamM,
    overrideConfirmed = false,
    overrideReason,
    requireReasonOnOverride = false,
    teamCapacityCheck,
    weightTolerancePercent = 10,
  } = params;

  const hardBlocks: string[] = [];
  const overrideReasons: string[] = [];

  // 1. Crane weight capacity & pool width
  const weightTons = vesselWeightTons != null ? Number(vesselWeightTons) : 0;
  const maxCapKN = Number(crane.maxCapacityKN) || 0;

  if (weightTons > 0 && maxCapKN > 0) {
    const vesselWeightKN = weightTons * 9.80665;
    const nominalTons = maxCapKN / 9.80665;
    const maxToleranceKN = maxCapKN * (1 + Math.max(0, weightTolerancePercent) / 100);
    const maxToleranceTons = maxToleranceKN / 9.80665;

    if (vesselWeightKN > maxToleranceKN) {
      hardBlocks.push(
        `Tvrda zabrana: Masa plovila (${weightTons.toFixed(1)} t) premašuje maksimalnu nosivost dizalice ${crane.name} čak i uz +${weightTolerancePercent}% toleranciju (${maxToleranceTons.toFixed(1)} t / nominalno ${nominalTons.toFixed(1)} t).`
      );
    } else if (vesselWeightKN > maxCapKN) {
      const exceedPct = ((vesselWeightKN - maxCapKN) / maxCapKN) * 100;
      overrideReasons.push(
        `Prekoračenje nosivosti dizalice ${crane.name} za +${exceedPct.toFixed(1)}% (${weightTons.toFixed(1)} t > ${nominalTons.toFixed(1)} t, unutar +${weightTolerancePercent}% tolerancije)`
      );
    }
  }

  const beamM = vesselBeamM != null ? Number(vesselBeamM) : 0;
  const maxWidth = crane.maxPoolWidth != null ? Number(crane.maxPoolWidth) : 0;
  if (beamM > 0 && maxWidth > 0 && beamM > maxWidth) {
    hardBlocks.push(
      `Tvrda zabrana: Širina plovila (${beamM.toFixed(2)} m) premašuje širinu bazena dizalice ${crane.name} (${maxWidth.toFixed(2)} m).`
    );
  }

  // 2. Database checks: Work Stoppages (Hard Block), Crane-Zone Affinity, Zone Capacity
  const db = await getDb();
  if (db) {
    const dateStr = toZagreb(scheduledStart).dateStr;
    const activeStoppages = await fetchActiveStoppagesForDate(db, dateStr);
    const startMs = scheduledStart.getTime();
    const endMs = scheduledEnd.getTime();

    for (const st of activeStoppages) {
      const stStart = new Date(st.startsAt).getTime();
      const stEnd = st.endsAt ? new Date(st.endsAt).getTime() : Infinity;
      if (startMs < stEnd && endMs > stStart) {
        if (st.scope === "all_cranes") {
          hardBlocks.push(`Tvrda zabrana: Rad svih dizalica je obustavljen u odabranom terminu (${st.reason}).`);
        } else if (st.scope === "single_crane" && st.craneId === crane.id) {
          hardBlocks.push(`Tvrda zabrana: Dizalica ${crane.name} je pod aktivnom obustavom rada (${st.reason}).`);
        } else if (st.scope === "single_zone" && landZoneId && st.zoneId === landZoneId) {
          hardBlocks.push(`Tvrda zabrana: Odabrana zona na kopnu je pod aktivnom obustavom rada (${st.reason}).`);
        }
      }
    }

    if (landZoneId) {
      const [zone] = await db
        .select()
        .from(landZones)
        .where(eq(landZones.id, landZoneId))
        .limit(1);

      const [affinity] = await db
        .select()
        .from(craneZoneAffinities)
        .where(
          and(
            eq(craneZoneAffinities.craneId, crane.id),
            eq(craneZoneAffinities.zoneId, landZoneId)
          )
        )
        .limit(1);

      if (affinity && (!affinity.isAllowed || affinity.isBlocked)) {
        const zLabel = zone ? `${zone.code} (${zone.name})` : landZoneId;
        overrideReasons.push(
          `Dizalica ${crane.name} nema standardni tehnički pristup zoni ${zLabel}`
        );
      }

      if (operationCategory === "lift_from_sea" && zone) {
        const [occCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(landOccupancies)
          .where(
            and(
              eq(landOccupancies.zoneId, landZoneId),
              isNull(landOccupancies.returnedAt)
            )
          );
        const occupied = (occCount?.count || 0) + (zone.manualOccupiedSpots || 0);
        if (occupied >= zone.totalSpots) {
          overrideReasons.push(
            `Zona ${zone.code} (${zone.name}) je popunjena (${occupied}/${zone.totalSpots} mjesta)`
          );
        }
      }
    }
  }

  // 3. Team capacity check
  if (teamCapacityCheck && !teamCapacityCheck.hasCapacity) {
    overrideReasons.push(
      `U ovom terminu već rade 2 dizalice (${teamCapacityCheck.busyCranesNames.join(" i ")})`
    );
  }

  if (hardBlocks.length > 0) {
    return {
      allowed: false,
      code: "BAD_REQUEST",
      message: hardBlocks.join(" "),
      hasOverride: false,
      overrideReasons,
      formattedOverrideReason: null,
    };
  }

  if (overrideReasons.length > 0) {
    if (!overrideConfirmed) {
      return {
        allowed: false,
        code: "CONFLICT",
        message: `Za ovu operaciju potreban je svjesni dispečerski override:\n• ${overrideReasons.join("\n• ")}`,
        hasOverride: true,
        overrideReasons,
        formattedOverrideReason: null,
      };
    }

    if (requireReasonOnOverride && (!overrideReason || overrideReason.trim().length < 3)) {
      return {
        allowed: false,
        code: "BAD_REQUEST",
        message: "Molimo unesite razlog za svjesni dispečerski override (najmanje 3 znaka).",
        hasOverride: true,
        overrideReasons,
        formattedOverrideReason: null,
      };
    }
  }

  const hasOverride = overrideReasons.length > 0;
  const formattedOverrideReason = hasOverride
    ? `[${overrideReasons.join("; ")}] ${overrideReason?.trim() || "Ručni dispečerski override"}`
    : null;

  return {
    allowed: true,
    hasOverride,
    overrideReasons,
    formattedOverrideReason,
  };
}
