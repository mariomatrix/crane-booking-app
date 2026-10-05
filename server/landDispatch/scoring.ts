export interface ScoringParams {
  affinityScore?: number;
  isPrimary?: boolean;
  penaltySlots?: number;
  concurrentTeamsInSlot: number;
  maxConcurrentTeams: number;
  craneName: string;
  zoneCode: string;
  zoneName: string;
  isRotational?: boolean;
  rotationalVesselName?: string;
  teamCapacityExceeded?: boolean;
}

export interface ScoreBreakdown {
  finalScore: number; // 0 - 100
  explanations: string[];
}

export function computeRecommendationScore(params: ScoringParams): ScoreBreakdown {
  const {
    affinityScore = 50,
    isPrimary = false,
    penaltySlots = 0,
    concurrentTeamsInSlot,
    maxConcurrentTeams,
    craneName,
    zoneCode,
    zoneName,
    isRotational = false,
    rotationalVesselName,
    teamCapacityExceeded = false,
  } = params;

  let score = affinityScore;
  const explanations: string[] = [];

  // 1. Base affinity
  explanations.push(`Tehnički afinitet dizalice ${craneName} za zonu ${zoneCode} (${zoneName}): ${affinityScore}/100.`);

  // 2. Primary crane bonus
  if (isPrimary) {
    score += 15;
    explanations.push(`Dizalica ${craneName} je primarni izbor za zonu ${zoneCode} (+15 bodova).`);
  }

  // 3. Penalty slots (extra transport / handling distance)
  if (penaltySlots > 0) {
    const penalty = penaltySlots * 10;
    score -= penalty;
    explanations.push(`Otežan pristup ili veća udaljenost: -${penalty} bodova (${penaltySlots} kaznenih slotova).`);
  }

  // 4. Team concurrency load balancing
  if (concurrentTeamsInSlot === 0) {
    score += 10;
    explanations.push(`Termin je potpuno miran — nijedna druga dizalica ne radi u ovom slotu (+10 bodova).`);
  } else if (concurrentTeamsInSlot < maxConcurrentTeams) {
    score += 5;
    explanations.push(`Raspoloživost tima: ${concurrentTeamsInSlot}/${maxConcurrentTeams} timova zauzeto.`);
  } else if (teamCapacityExceeded) {
    score -= 25;
    explanations.push(`Prekoračen redovan kapacitet timova (${concurrentTeamsInSlot}/${maxConcurrentTeams}): zahtijeva dispečerski override (-25 bodova).`);
  }

  // 5. Rotational dependency
  if (isRotational) {
    score -= 5;
    explanations.push(`Uvjetno vezano za prethodno spuštanje (${rotationalVesselName || "drugo plovilo"}).`);
  }

  // Clamp 0 - 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    finalScore,
    explanations,
  };
}
