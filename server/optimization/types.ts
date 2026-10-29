export interface OptimizationVessel {
  name: string;
  weightTons: number;
  lengthM: number;
  beamM: number;
}

export interface OptimizationRequest {
  id: string;
  reservationNumber?: string;
  vessel: OptimizationVessel;
  operationCategory: "lift_from_sea" | "lower_to_sea" | "move" | "maintenance" | "other";
  durationMin: number;
  preferredCraneId?: string;
  preferredSlotIndex?: number;
  preferredZoneId?: string;
  isUrgent?: boolean;
}

export interface OptimizationCrane {
  id: string;
  name: string;
  maxCapacityTons: number;
  isActive: boolean;
}

export interface OptimizationZone {
  id: string;
  code: string;
  name: string;
  totalSpots: number;
  freeSpots: number;
}

export interface OptimizationAffinity {
  craneId: string;
  zoneId: string;
  affinityScore: number;         // 0 - 100
  extraTransportMinutes: number; // 0 - 30 min
  isAllowed: boolean;            // fizički moguće
}

export interface ExistingSlotOccupation {
  craneId: string;
  slotIndex: number;
  reservationId: string;
}

export interface OptimizationOverrides {
  /** Dopušta istovremeni rad 3. dizalice u istom slotu (npr. vanjski tim radnika) */
  allowTeamOverride?: boolean;
  /** Prilagođeni maksimalni broj timova ako je allowTeamOverride aktivan (default: 3) */
  maxConcurrentTeamsOverride?: number;
  /** Dopušta privremeni smještaj na servisnom platou ili prolazu kad je zona formalno puna */
  allowZoneCapacityOverride?: boolean;
  /** Dopušta rute dizalica-zona koje su inače označene kao nepreporučene/blokirane */
  allowBlockedAffinityOverride?: boolean;
  /**
   * Sigurnosna margina / tolerancija deklarirane nosivosti dizalice u postocima.
   * Zadani standard za marinu: 10% (npr. dizalica od 10t prihvaća do 11t uz upozorenje).
   */
  weightTolerancePercent?: number;
}

export interface OptimizationProblemInput {
  dateStr: string;
  timeSlots: string[]; // npr. ["07:00", "07:30", ..., "14:30"]
  requests: OptimizationRequest[];
  cranes: OptimizationCrane[];
  zones: OptimizationZone[];
  affinities: OptimizationAffinity[];
  existingOccupations: ExistingSlotOccupation[];
  maxConcurrentTeams?: number; // default: 2
  overrides?: OptimizationOverrides;
}

export interface AssignmentResult {
  requestId: string;
  reservationNumber?: string;
  vesselName: string;
  craneId: string;
  craneName: string;
  zoneId?: string;
  zoneCode?: string;
  zoneName?: string;
  slotIndex: number;
  startTime: string;
  endTime: string;
  durationMin: number;
  affinityScore: number;
  extraTransportMinutes: number;
  matchQuality: "optimal" | "acceptable" | "suboptimal";
  hasOverride?: boolean;
  overrideReasons?: string[];
  explanation: string;
}

export interface OptimizationResult {
  success: boolean;
  status: string; // 'Optimal' | 'Feasible' | 'Infeasible'
  objectiveValue: number;
  assignments: AssignmentResult[];
  unassignedRequests: Array<{
    requestId: string;
    vesselName: string;
    reason: string;
  }>;
  metrics: {
    totalRequests: number;
    assignedCount: number;
    unassignedCount: number;
    averageAffinityScore: number;
    totalExtraTransportMinutes: number;
    overridesCount: number;
    slotTeamUtilization: Record<string, number>;
    solveTimeMs: number;
  };
}
