import highsLoader from "highs";
import type {
  OptimizationProblemInput,
  OptimizationResult,
  AssignmentResult,
  OptimizationRequest,
  OptimizationCrane,
  OptimizationZone,
} from "./types";

let highsInstancePromise: Promise<any> | null = null;

async function getHighs() {
  if (!highsInstancePromise) {
    highsInstancePromise = (highsLoader as any)();
  }
  return highsInstancePromise;
}

export class HighsMarinaOptimizer {
  /**
   * Rješava problem dodjele dizalica, slotova i zona pomoću MILP solvera
   * uz podršku za dispečerske Overridee (tolerancija nosivosti, timski kapacitet, zona)
   */
  async solve(input: OptimizationProblemInput): Promise<OptimizationResult> {
    const startTime = Date.now();
    const highs = await getHighs();

    const {
      timeSlots,
      requests,
      cranes,
      zones,
      affinities,
      existingOccupations,
      maxConcurrentTeams = 2,
      overrides = {},
    } = input;

    // Tolerancija nosivosti dizalice: default 10% prema zahtjevu marine
    const weightTolerancePercent = overrides.weightTolerancePercent ?? 10;
    const weightToleranceFactor = 1 + weightTolerancePercent / 100;

    // Efektivni timski limit uz override (npr. 3 istovremena tima umjesto 2)
    const effectiveTeamLimit = overrides.allowTeamOverride
      ? (overrides.maxConcurrentTeamsOverride ?? (maxConcurrentTeams + 1))
      : maxConcurrentTeams;

    if (requests.length === 0) {
      return {
        success: true,
        status: "Empty",
        objectiveValue: 0,
        assignments: [],
        unassignedRequests: [],
        metrics: {
          totalRequests: 0,
          assignedCount: 0,
          unassignedCount: 0,
          averageAffinityScore: 100,
          totalExtraTransportMinutes: 0,
          overridesCount: 0,
          slotTeamUtilization: {},
          solveTimeMs: Date.now() - startTime,
        },
      };
    }

    // Mapa postojećih zauzeća: key = `${craneId}_${slotIndex}`
    const existingCraneSlotBusy = new Set<string>();
    // Broj postojećih aktivnih dizalica po slotu
    const existingTeamsPerSlot = new Array(timeSlots.length).fill(0);
    const cranesBusyInSlot = new Map<number, Set<string>>();

    for (const occ of existingOccupations) {
      existingCraneSlotBusy.add(`${occ.craneId}_${occ.slotIndex}`);
      if (!cranesBusyInSlot.has(occ.slotIndex)) {
        cranesBusyInSlot.set(occ.slotIndex, new Set());
      }
      cranesBusyInSlot.get(occ.slotIndex)!.add(occ.craneId);
    }

    for (let s = 0; s < timeSlots.length; s++) {
      existingTeamsPerSlot[s] = cranesBusyInSlot.get(s)?.size || 0;
    }

    // Mapa afiniteta: key = `${craneId}_${zoneId}`
    const affinityMap = new Map<string, { score: number; extraMinutes: number; isAllowed: boolean }>();
    for (const aff of affinities) {
      affinityMap.set(`${aff.craneId}_${aff.zoneId}`, {
        score: aff.affinityScore,
        extraMinutes: aff.extraTransportMinutes,
        isAllowed: aff.isAllowed,
      });
    }

    // ─── Generiranje valjanih odluka (Candidates) ───
    interface DecisionVar {
      varName: string;
      reqIndex: number;
      craneIndex: number;
      slotIndex: number;
      zoneIndex: number;
      durationSlots: number;
      score: number;
      hasOverride: boolean;
      overrideReasons: string[];
    }

    const decisionVars: DecisionVar[] = [];
    const varsByRequest = new Map<number, DecisionVar[]>();
    const varsCoveringCraneSlot = new Map<string, DecisionVar[]>();
    const varsCoveringSlot = new Map<number, DecisionVar[]>();
    const varsByZone = new Map<number, DecisionVar[]>();

    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      const req = requests[rIdx];
      varsByRequest.set(rIdx, []);
      const durationSlots = Math.max(1, Math.ceil((req.durationMin || 30) / 30));

      for (let cIdx = 0; cIdx < cranes.length; cIdx++) {
        const crane = cranes[cIdx];
        if (!crane.isActive) continue;

        // Provjera nosivosti dizalice uz zadanu toleranciju (10%)
        const maxAllowedWeight = crane.maxCapacityTons * weightToleranceFactor;
        if (req.vessel.weightTons > maxAllowedWeight) {
          continue; // Preteško čak i s tolerancijom
        }

        const isWeightToleranceUsed = req.vessel.weightTons > crane.maxCapacityTons;

        // Zone za smještaj
        const eligibleZones =
          req.operationCategory === "lift_from_sea" || req.operationCategory === "move"
            ? zones
            : zones.length > 0
            ? [zones[0]]
            : [{ id: "none", code: "NONE", name: "Bez zone", totalSpots: 999, freeSpots: 999 }];

        for (let zIdx = 0; zIdx < eligibleZones.length; zIdx++) {
          const zone = eligibleZones[zIdx];
          const aff = affinityMap.get(`${crane.id}_${zone.id}`);

          // Fizička neprohodnost (osim ako je uključen allowBlockedAffinityOverride)
          let isBlockedAffinityUsed = false;
          if (aff && !aff.isAllowed) {
            if (!overrides.allowBlockedAffinityOverride) {
              continue;
            }
            isBlockedAffinityUsed = true;
          }

          const affinityScore = aff ? aff.score : 50;
          const extraMinutes = aff ? aff.extraMinutes : 0;

          // Za svaki mogući početni slot
          for (let sIdx = 0; sIdx <= timeSlots.length - durationSlots; sIdx++) {
            // Provjera zauzetosti dizalice u svim pokrivenim slotovima (isti brod/dizalica)
            let conflictWithExisting = false;
            let isTeamOverrideNeeded = false;

            for (let span = 0; span < durationSlots; span++) {
              const currentSlot = sIdx + span;
              // Ista dizalica ne može dizati dva broda u istom trenutku (apsolutno pravilo)
              if (existingCraneSlotBusy.has(`${crane.id}_${currentSlot}`)) {
                conflictWithExisting = true;
                break;
              }

              // Provjera timskog limita
              const craneAlreadyCounted = cranesBusyInSlot.get(currentSlot)?.has(crane.id);
              const teamsAfterAdding = existingTeamsPerSlot[currentSlot] + (craneAlreadyCounted ? 0 : 1);

              if (teamsAfterAdding > effectiveTeamLimit) {
                conflictWithExisting = true;
                break;
              }

              if (teamsAfterAdding > maxConcurrentTeams) {
                isTeamOverrideNeeded = true;
              }
            }

            if (conflictWithExisting) continue;

            // Izračun pondera za ciljnu funkciju
            let objWeight = 1000; // Osnovna vrijednost za riješenu rezervaciju
            objWeight += affinityScore * 10;
            objWeight -= extraMinutes * 5;

            const varOverrideReasons: string[] = [];

            // Ponder za toleranciju nosivosti (penal: -200 bodova)
            if (isWeightToleranceUsed) {
              objWeight -= 200;
              const excessPercent = Math.round(
                ((req.vessel.weightTons - crane.maxCapacityTons) / crane.maxCapacityTons) * 100
              );
              varOverrideReasons.push(
                `Iskorištena tolerancija nosivosti dizalice (+${excessPercent}% iznad nazivne nosivosti ${crane.maxCapacityTons}t)`
              );
            }

            // Ponder za timski override (penal: -150 bodova)
            if (isTeamOverrideNeeded) {
              objWeight -= 150;
              varOverrideReasons.push(`Angažiran dodatni 3. operativni tim (dispečerski override)`);
            }

            // Ponder za blokirani afinitet (penal: -400 bodova)
            if (isBlockedAffinityUsed) {
              objWeight -= 400;
              varOverrideReasons.push(`Nestandardna ruta platoa (blokirani afinitet)`);
            }

            // Preferirani slot
            if (req.preferredSlotIndex !== undefined) {
              const slotDiff = Math.abs(sIdx - req.preferredSlotIndex);
              objWeight -= slotDiff * 20;
            }

            // Preferirana dizalica
            if (req.preferredCraneId && req.preferredCraneId === crane.id) {
              objWeight += 50;
            }

            // Hitni zahtjevi
            if (req.isUrgent) {
              objWeight += 300;
            }

            const varName = `x_${rIdx}_${cIdx}_${sIdx}_${zIdx}`;
            const dvar: DecisionVar = {
              varName,
              reqIndex: rIdx,
              craneIndex: cIdx,
              slotIndex: sIdx,
              zoneIndex: zIdx,
              durationSlots,
              score: Math.max(1, objWeight),
              hasOverride: varOverrideReasons.length > 0,
              overrideReasons: varOverrideReasons,
            };

            decisionVars.push(dvar);
            varsByRequest.get(rIdx)!.push(dvar);

            // Indeksiranje po slotovima i dizalicama
            for (let span = 0; span < durationSlots; span++) {
              const currentSlot = sIdx + span;
              const csKey = `${cIdx}_${currentSlot}`;
              if (!varsCoveringCraneSlot.has(csKey)) {
                varsCoveringCraneSlot.set(csKey, []);
              }
              varsCoveringCraneSlot.get(csKey)!.push(dvar);

              if (!varsCoveringSlot.has(currentSlot)) {
                varsCoveringSlot.set(currentSlot, []);
              }
              varsCoveringSlot.get(currentSlot)!.push(dvar);
            }

            if (req.operationCategory === "lift_from_sea") {
              if (!varsByZone.has(zIdx)) {
                varsByZone.set(zIdx, []);
              }
              varsByZone.get(zIdx)!.push(dvar);
            }
          }
        }
      }
    }

    // ─── Konstrukcija CPLEX LP Formata ───
    const lpLines: string[] = [];
    lpLines.push("Maximize");

    const objTerms: string[] = [];
    for (const v of decisionVars) {
      objTerms.push(`${v.score} ${v.varName}`);
    }
    // Slack varijable za neobrađene zahtjeve (penal: -5000)
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      objTerms.push(`-5000 u_${rIdx}`);
    }

    // Slack varijable za zonu ako je dozvoljen zone overflow (penal: -350 po mjestu prekoračenja)
    if (overrides.allowZoneCapacityOverride) {
      for (let zIdx = 0; zIdx < zones.length; zIdx++) {
        objTerms.push(`-350 z_over_${zIdx}`);
      }
    }

    if (objTerms.length === 0) {
      return {
        success: false,
        status: "Infeasible",
        objectiveValue: 0,
        assignments: [],
        unassignedRequests: requests.map((r) => ({
          requestId: r.id,
          vesselName: r.vessel.name,
          reason: `Nema slobodnih slotova koji zadovoljavaju nosivost dizalice (s ${weightTolerancePercent}% tolerancije) ili timsko ograničenje.`,
        })),
        metrics: {
          totalRequests: requests.length,
          assignedCount: 0,
          unassignedCount: requests.length,
          averageAffinityScore: 0,
          totalExtraTransportMinutes: 0,
          overridesCount: 0,
          slotTeamUtilization: {},
          solveTimeMs: Date.now() - startTime,
        },
      };
    }

    lpLines.push(" obj: " + objTerms.join(" + ").replace(/\+ -/g, "- "));
    lpLines.push("Subject To");

    // 1. Ograničenje: Svaki zahtjev najviše jednom
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      const vars = varsByRequest.get(rIdx) || [];
      if (vars.length > 0) {
        const terms = vars.map((v) => v.varName).join(" + ");
        lpLines.push(` c_req_${rIdx}: ${terms} + u_${rIdx} = 1`);
      } else {
        lpLines.push(` c_req_${rIdx}: u_${rIdx} = 1`);
      }
    }

    // 2. Ograničenje: Pojedinačna dizalica može raditi najviše jednu operaciju u istom slotu
    for (let cIdx = 0; cIdx < cranes.length; cIdx++) {
      for (let s = 0; s < timeSlots.length; s++) {
        const csKey = `${cIdx}_${s}`;
        const coveringVars = varsCoveringCraneSlot.get(csKey) || [];
        if (coveringVars.length > 1) {
          const terms = coveringVars.map((v) => v.varName).join(" + ");
          lpLines.push(` c_crane_${cIdx}_slot_${s}: ${terms} <= 1`);
        }
      }
    }

    // 3. Ograničenje: Timski kapacitet (poštujući effectiveTeamLimit)
    for (let s = 0; s < timeSlots.length; s++) {
      const coveringVars = varsCoveringSlot.get(s) || [];
      const remainingTeamSlots = effectiveTeamLimit - existingTeamsPerSlot[s];
      if (coveringVars.length > 0 && remainingTeamSlots >= 0) {
        const terms = coveringVars.map((v) => v.varName).join(" + ");
        lpLines.push(` c_team_slot_${s}: ${terms} <= ${remainingTeamSlots}`);
      }
    }

    // 4. Ograničenje: Kapacitet zona na kopnu za lift_from_sea
    for (let zIdx = 0; zIdx < zones.length; zIdx++) {
      const zoneVars = varsByZone.get(zIdx) || [];
      const freeSpots = Math.max(0, zones[zIdx].freeSpots);
      if (zoneVars.length > 0) {
        const terms = zoneVars.map((v) => v.varName).join(" + ");
        if (overrides.allowZoneCapacityOverride) {
          // Soft constraint: dozvoljen overflow preko z_over
          lpLines.push(` c_zone_${zIdx}: ${terms} - z_over_${zIdx} <= ${freeSpots}`);
        } else {
          lpLines.push(` c_zone_${zIdx}: ${terms} <= ${freeSpots}`);
        }
      }
    }

    // Sekcija binarnih i cjelobrojnih varijabli
    lpLines.push("Binary");
    for (const v of decisionVars) {
      lpLines.push(` ${v.varName}`);
    }
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      lpLines.push(` u_${rIdx}`);
    }

    if (overrides.allowZoneCapacityOverride) {
      lpLines.push("Generals");
      for (let zIdx = 0; zIdx < zones.length; zIdx++) {
        lpLines.push(` z_over_${zIdx}`);
      }
    }

    lpLines.push("End");

    const lpText = lpLines.join("\n");

    // ─── Pokretanje HiGHS Solvera ───
    const solution = highs.solve(lpText);

    const assignments: AssignmentResult[] = [];
    const unassignedRequests: OptimizationResult["unassignedRequests"] = [];
    const slotTeamUtilization: Record<string, number> = {};

    for (let s = 0; s < timeSlots.length; s++) {
      slotTeamUtilization[timeSlots[s]] = existingTeamsPerSlot[s];
    }

    let totalAffinity = 0;
    let totalTransport = 0;
    let overridesCount = 0;

    if (solution.Status === "Optimal" || solution.Status === "Feasible") {
      const cols = solution.Columns as Record<string, { Primal: number }>;

      for (const dvar of decisionVars) {
        const col = cols[dvar.varName];
        if (col && col.Primal > 0.5) {
          const req = requests[dvar.reqIndex];
          const crane = cranes[dvar.craneIndex];
          const zone = dvar.zoneIndex < zones.length ? zones[dvar.zoneIndex] : undefined;
          const aff = zone ? affinityMap.get(`${crane.id}_${zone.id}`) : undefined;

          const startTimeStr = timeSlots[dvar.slotIndex];
          const endSlotIdx = dvar.slotIndex + dvar.durationSlots;
          const endTimeStr = endSlotIdx < timeSlots.length ? timeSlots[endSlotIdx] : "15:00";

          const affScore = aff ? aff.score : 80;
          const extraMin = aff ? aff.extraMinutes : 0;

          totalAffinity += affScore;
          totalTransport += extraMin;

          for (let span = 0; span < dvar.durationSlots; span++) {
            const sIdx = dvar.slotIndex + span;
            if (sIdx < timeSlots.length) {
              const slotLabel = timeSlots[sIdx];
              slotTeamUtilization[slotLabel] = (slotTeamUtilization[slotLabel] || 0) + 1;
            }
          }

          let matchQuality: AssignmentResult["matchQuality"] = dvar.hasOverride
            ? "acceptable"
            : "optimal";

          let explanation = `Optimalno dodijeljeno na dizalicu ${crane.name}`;
          if (dvar.hasOverride) {
            overridesCount++;
            explanation += ` [DISPEČERSKI OVERRIDE: ${dvar.overrideReasons.join(", ")}]`;
          } else if (affScore >= 80 && extraMin <= 5) {
            matchQuality = "optimal";
            explanation += ` s visokim afinitetom (${affScore}%) i minimalnim transportom (${extraMin} min).`;
          } else {
            matchQuality = "acceptable";
            explanation += ` uz prihvatljiv afinitet (${affScore}%).`;
          }

          assignments.push({
            requestId: req.id,
            reservationNumber: req.reservationNumber,
            vesselName: req.vessel.name,
            craneId: crane.id,
            craneName: crane.name,
            zoneId: zone?.id,
            zoneCode: zone?.code,
            zoneName: zone?.name,
            slotIndex: dvar.slotIndex,
            startTime: startTimeStr,
            endTime: endTimeStr,
            durationMin: req.durationMin,
            affinityScore: affScore,
            extraTransportMinutes: extraMin,
            matchQuality,
            hasOverride: dvar.hasOverride,
            overrideReasons: dvar.overrideReasons.length > 0 ? [...dvar.overrideReasons] : undefined,
            explanation,
          });
        }
      }

      // Provjera post-solve timskog overridea (ako ukupan broj aktivnih dizalica u slotu prelazi standardni limit)
      for (const a of assignments) {
        let teamOverrideTriggered = false;
        const durationSlots = Math.max(1, Math.ceil(a.durationMin / 30));
        for (let span = 0; span < durationSlots; span++) {
          const sIdx = a.slotIndex + span;
          if (sIdx < timeSlots.length) {
            const slotLabel = timeSlots[sIdx];
            if ((slotTeamUtilization[slotLabel] || 0) > maxConcurrentTeams) {
              teamOverrideTriggered = true;
              break;
            }
          }
        }

        if (teamOverrideTriggered) {
          if (!a.hasOverride) {
            a.hasOverride = true;
            overridesCount++;
          }
          a.overrideReasons = a.overrideReasons || [];
          if (!a.overrideReasons.some((r) => r.includes("3. operativni tim") || r.includes("timski"))) {
            a.overrideReasons.push("Angažiran dodatni 3. operativni tim (dispečerski override)");
            if (!a.explanation.includes("DISPEČERSKI OVERRIDE")) {
              a.explanation += " [DISPEČERSKI OVERRIDE: Angažiran dodatni 3. operativni tim]";
            }
          }
        }
      }

      for (let rIdx = 0; rIdx < requests.length; rIdx++) {
        const uCol = cols[`u_${rIdx}`];
        if (uCol && uCol.Primal > 0.5) {
          const req = requests[rIdx];
          unassignedRequests.push({
            requestId: req.id,
            vesselName: req.vessel.name,
            reason: `Nema slobodnog operativnog tima ili slobodnog mjesta u zoni unutar radnog vremena (nosivost provjerena uz ${weightTolerancePercent}% tolerancije).`,
          });
        }
      }
    } else {
      for (const req of requests) {
        unassignedRequests.push({
          requestId: req.id,
          vesselName: req.vessel.name,
          reason: `Solver status: ${solution.Status}. Nije pronađen valjan raspored uz zadana ograničenja.`,
        });
      }
    }

    const assignedCount = assignments.length;
    const avgAffinity = assignedCount > 0 ? Math.round(totalAffinity / assignedCount) : 0;

    return {
      success: solution.Status === "Optimal" || solution.Status === "Feasible",
      status: solution.Status,
      objectiveValue: solution.ObjectiveValue || 0,
      assignments,
      unassignedRequests,
      metrics: {
        totalRequests: requests.length,
        assignedCount,
        unassignedCount: unassignedRequests.length,
        averageAffinityScore: avgAffinity,
        totalExtraTransportMinutes: totalTransport,
        overridesCount,
        slotTeamUtilization,
        solveTimeMs: Date.now() - startTime,
      },
    };
  }
}
