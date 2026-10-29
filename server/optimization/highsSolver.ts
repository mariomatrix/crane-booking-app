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
    } = input;

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

        // Provjera nosivosti dizalice
        if (req.vessel.weightTons > crane.maxCapacityTons) {
          continue;
        }

        // Zone: za operacije na kopnu (lift_from_sea, move, maintenance) bira se zona; za lower_to_sea ili ostalo zona 0
        const eligibleZones = req.operationCategory === "lift_from_sea" || req.operationCategory === "move"
          ? zones
          : zones.length > 0 ? [zones[0]] : [{ id: "none", code: "NONE", name: "Bez zone", totalSpots: 999, freeSpots: 999 }];

        for (let zIdx = 0; zIdx < eligibleZones.length; zIdx++) {
          const zone = eligibleZones[zIdx];
          const aff = affinityMap.get(`${crane.id}_${zone.id}`);

          // Fizička neprohodnost
          if (aff && !aff.isAllowed) {
            continue;
          }

          const affinityScore = aff ? aff.score : 50;
          const extraMinutes = aff ? aff.extraMinutes : 0;

          // Za svaki mogući početni slot
          for (let sIdx = 0; sIdx <= timeSlots.length - durationSlots; sIdx++) {
            // Provjera zauzetosti dizalice u svim pokrivenim slotovima
            let conflictWithExisting = false;
            for (let span = 0; span < durationSlots; span++) {
              const currentSlot = sIdx + span;
              if (existingCraneSlotBusy.has(`${crane.id}_${currentSlot}`)) {
                conflictWithExisting = true;
                break;
              }
              // Timsko ograničenje s postojećim rezervacijama
              const craneAlreadyCounted = cranesBusyInSlot.get(currentSlot)?.has(crane.id);
              const teamsAfterAdding = existingTeamsPerSlot[currentSlot] + (craneAlreadyCounted ? 0 : 1);
              if (teamsAfterAdding > maxConcurrentTeams) {
                conflictWithExisting = true;
                break;
              }
            }

            if (conflictWithExisting) continue;

            // Izračun pondera za ciljnu funkciju
            // Osnovna vrijednost: 1000 za završenu rezervaciju
            let objWeight = 1000;
            // Afinitet dizalice prema zoni (+10 po bodu afiniteta)
            objWeight += affinityScore * 10;
            // Penal za ekstra transportno vrijeme (-5 po minuti)
            objWeight -= extraMinutes * 5;

            // Preferirani slot (ako postoji)
            if (req.preferredSlotIndex !== undefined) {
              const slotDiff = Math.abs(sIdx - req.preferredSlotIndex);
              objWeight -= slotDiff * 20; // 20 bodova po 30 min kašnjenja
            }

            // Preferirana dizalica (+50 bodova)
            if (req.preferredCraneId && req.preferredCraneId === crane.id) {
              objWeight += 50;
            }

            // Hitni zahtjevi (+300 bodova)
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
            };

            decisionVars.push(dvar);
            varsByRequest.get(rIdx)!.push(dvar);

            // Indeksiranje po pokrivenim slotovima i dizalicama
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

    // Funkcija cilja
    const objTerms: string[] = [];
    for (const v of decisionVars) {
      objTerms.push(`${v.score} ${v.varName}`);
    }
    // Slack varijable za neobrađene zahtjeve (velika penalizacija: -5000)
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      objTerms.push(`-5000 u_${rIdx}`);
    }

    if (objTerms.length === 0) {
      // Nema valjanih varijabli
      return {
        success: false,
        status: "Infeasible",
        objectiveValue: 0,
        assignments: [],
        unassignedRequests: requests.map((r) => ({
          requestId: r.id,
          vesselName: r.vessel.name,
          reason: "Nema slobodnih slotova koji zadovoljavaju nosivost dizalice ili timsko ograničenje.",
        })),
        metrics: {
          totalRequests: requests.length,
          assignedCount: 0,
          unassignedCount: requests.length,
          averageAffinityScore: 0,
          totalExtraTransportMinutes: 0,
          slotTeamUtilization: {},
          solveTimeMs: Date.now() - startTime,
        },
      };
    }

    lpLines.push(" obj: " + objTerms.join(" + ").replace(/\+ -/g, "- "));

    lpLines.push("Subject To");

    // 1. Ograničenje: Svaki zahtjev se dodjeljuje najviše jednom
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      const vars = varsByRequest.get(rIdx) || [];
      if (vars.length > 0) {
        const terms = vars.map((v) => v.varName).join(" + ");
        lpLines.push(` c_req_${rIdx}: ${terms} + u_${rIdx} = 1`);
      } else {
        lpLines.push(` c_req_${rIdx}: u_${rIdx} = 1`);
      }
    }

    // 2. Ograničenje: Pojedina dizalica može raditi najviše jednu operaciju u istom slotu
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

    // 3. Ograničenje: Timski kapacitet (najviše maxConcurrentTeams dizalica u istom slotu)
    for (let s = 0; s < timeSlots.length; s++) {
      const coveringVars = varsCoveringSlot.get(s) || [];
      const remainingTeamSlots = maxConcurrentTeams - existingTeamsPerSlot[s];
      if (coveringVars.length > 0 && remainingTeamSlots >= 0) {
        // Zbroj svih novih operacija u slotu s mora biti <= remainingTeamSlots
        // Pazimo na činjenicu da jedna dizalica već ima <= 1 constraint
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
        lpLines.push(` c_zone_${zIdx}: ${terms} <= ${freeSpots}`);
      }
    }

    // Sekcija binarnih varijabli
    lpLines.push("Binary");
    for (const v of decisionVars) {
      lpLines.push(` ${v.varName}`);
    }
    for (let rIdx = 0; rIdx < requests.length; rIdx++) {
      lpLines.push(` u_${rIdx}`);
    }

    lpLines.push("End");

    const lpText = lpLines.join("\n");

    // ─── Pokretanje HiGHS Solvera ───
    const solution = highs.solve(lpText);

    const assignments: AssignmentResult[] = [];
    const unassignedRequests: OptimizationResult["unassignedRequests"] = [];
    const slotTeamUtilization: Record<string, number> = {};

    // Inicijalizacija metrike timske iskorištenosti s postojećim stanjem
    for (let s = 0; s < timeSlots.length; s++) {
      slotTeamUtilization[timeSlots[s]] = existingTeamsPerSlot[s];
    }

    let totalAffinity = 0;
    let totalTransport = 0;

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

          // Ažuriranje iskorištenosti timova
          for (let span = 0; span < dvar.durationSlots; span++) {
            const sIdx = dvar.slotIndex + span;
            if (sIdx < timeSlots.length) {
              const slotLabel = timeSlots[sIdx];
              slotTeamUtilization[slotLabel] = (slotTeamUtilization[slotLabel] || 0) + 1;
            }
          }

          let matchQuality: AssignmentResult["matchQuality"] = "optimal";
          let explanation = `Optimalno dodijeljeno na dizalicu ${crane.name}`;

          if (affScore >= 80 && extraMin <= 5) {
            matchQuality = "optimal";
            explanation += ` s visokim afinitetom (${affScore}%) i minimalnim transportom (${extraMin} min).`;
          } else if (affScore >= 50) {
            matchQuality = "acceptable";
            explanation += ` uz prihvatljiv afinitet (${affScore}%) i ${extraMin} min transporta.`;
          } else {
            matchQuality = "suboptimal";
            explanation += ` uz kompromisni raspored radi izbjegavanja zastoja.`;
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
            explanation,
          });
        }
      }

      // Detekcija neobrađenih zahtjeva
      for (let rIdx = 0; rIdx < requests.length; rIdx++) {
        const uCol = cols[`u_${rIdx}`];
        if (uCol && uCol.Primal > 0.5) {
          const req = requests[rIdx];
          unassignedRequests.push({
            requestId: req.id,
            vesselName: req.vessel.name,
            reason: "Nema slobodnog operativnog tima ili slobodnog mjesta u zoni unutar radnog vremena.",
          });
        }
      }
    } else {
      // Infeasible
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
        slotTeamUtilization,
        solveTimeMs: Date.now() - startTime,
      },
    };
  }
}
