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
  preferredSlotIndex?: number; // indeks preferiranog slota unutar radnog dana
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

export interface OptimizationProblemInput {
  dateStr: string;
  timeSlots: string[]; // npr. ["07:00", "07:30", ..., "14:30"]
  requests: OptimizationRequest[];
  cranes: OptimizationCrane[];
  zones: OptimizationZone[];
  affinities: OptimizationAffinity[];
  existingOccupations: ExistingSlotOccupation[];
  maxConcurrentTeams?: number; // default: 2
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
    slotTeamUtilization: Record<string, number>; // slot => active cranes
    solveTimeMs: number;
  };
}
