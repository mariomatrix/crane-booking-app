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
}

export interface FeasibilityResult {
  isFeasible: boolean;
  hardBlockReasons: string[];
  warnings: string[];
  teamCapacityExceeded: boolean;
  concurrentTeamsInSlot: number;
  requiresTeamOverride: boolean;
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
  } = params;

  const hardBlockReasons: string[] = [];
  const warnings: string[] = [];

  const startMs = slotStart.getTime();
  const endMs = slotEnd.getTime();

  // 1. Crane Active Status
  if (crane.craneStatus !== "active") {
    hardBlockReasons.push(`Dizalica ${crane.name} nije u funkciji (status: ${crane.craneStatus}).`);
  }

  // 2. Crane Weight Limit (1 ton ~ 9.81 kN, capacity in kN vs tons)
  if (vessel.weightTons && vessel.weightTons > 0) {
    const vesselWeightKN = vessel.weightTons * 9.80665;
    if (vesselWeightKN > crane.maxCapacityKN * 1.02) { // 2% tolerance margin
      hardBlockReasons.push(
        `Masa plovila (${vessel.weightTons.toFixed(1)} t) premašuje nosivost dizalice ${crane.name} (${(crane.maxCapacityKN / 9.80665).toFixed(1)} t / ${crane.maxCapacityKN} kN).`
      );
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
      hardBlockReasons.push(
        `Dizalica ${crane.name} nema tehnički dopušten pristup zoni ${zone.code} (${zone.name}).`
      );
    }
  }

  // 5. Active Work Stoppages (Wind / Bura / Maintenance)
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
    if (!teamOverride) {
      warnings.push(
        `Kapacitet posade je popunjen (${concurrentTeamsCount}/${maxConcurrentTeams} dizalica već radi). Potreban je dispečerski override.`
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
        hardBlockReasons.push(`Zona ${zone.code} nema slobodnih mjesta na kopnu u tom terminu.`);
      }
    }
  }

  // If requiresTeamOverride is set, but teamOverride is not true, we treat it as blocking unless override is passed
  const isFeasible = hardBlockReasons.length === 0 && (!requiresTeamOverride || teamOverride);

  return {
    isFeasible,
    hardBlockReasons,
    warnings,
    teamCapacityExceeded,
    concurrentTeamsInSlot: concurrentTeamsCount,
    requiresTeamOverride,
    rotationalCandidateReservationId,
    rotationalCandidateVesselName,
  };
}
