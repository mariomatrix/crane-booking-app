export type OperationCategory =
  | "lift_from_sea"
  | "lower_to_sea"
  | "move"
  | "maintenance"
  | "other";

export interface ZoneCapacitySnapshot {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  totalSpots: number;
  currentOccupied: number;
  currentFree: number;
  manualOccupiedSpots?: number;
  plannedLiftsToday: number;
  plannedLowersToday: number;
  endOfDayFree: number;
  minFreeToday: number;
  deficitTime: string | null;
  hasDeficit: boolean;
  hourlyTimeline: Array<{ time: string; free: number; deficit: boolean }>;
}

export interface DispatchReservationItem {
  id: string;
  reservationNumber: string | null;
  userId: string;
  userName: string;
  userPhone: string | null;
  vesselId: string | null;
  vesselName: string;
  vesselRegistration?: string | null;
  vesselType: string | null;
  vesselWeightTons: number | null;
  vesselBeamM: number | null;
  vesselLengthM: number | null;
  serviceTypeId: string | null;
  serviceTypeName: string;
  operationCategory: OperationCategory;
  craneId: string | null;
  craneName: string | null;
  landZoneId: string | null;
  landZoneCode: string | null;
  landZoneName: string | null;
  scheduledStart: string; // ISO
  scheduledEnd: string;   // ISO
  durationMin?: number;
  adminNote?: string | null;
  status: string;
  teamOverride: boolean;
  teamOverrideReason: string | null;
  notPerformedReason: string | null;
  dependencies: Array<{
    id: string;
    predecessorReservationId: string;
    successorReservationId: string;
    dependencyType: string;
    status: string;
    predecessorVesselName?: string;
  }>;
  isAtRiskOrBroken: boolean;
  conflictReason?: string | null;
}

export interface UnassignedRequestItem {
  id: string;
  reservationNumber: string | null;
  requestedDate: string;
  requestedTimeSlot: string | null;
  userId: string;
  userName: string;
  userPhone: string | null;
  userEmail: string | null;
  vesselId: string | null;
  vesselName: string;
  vesselRegistration: string | null;
  vesselType: string | null;
  vesselWeightTons: number | null;
  vesselBeamM: number | null;
  vesselLengthM: number | null;
  serviceTypeId: string | null;
  serviceTypeName: string;
  operationCategory: OperationCategory;
  craneId: string | null;
  craneName: string | null;
  requestedZoneId: string | null;
  requestedZoneCode: string | null;
  userNote: string | null;
  adminNote: string | null;
  status: string;
  durationMin: number;
  scheduledStart: string | null;
  quickChecks: {
    hasAllowedCrane: boolean;
    hasFreeSlot: boolean;
    hasZoneCapacity: boolean;
  };
}

export interface SlotRecommendation {
  craneId: string;
  craneName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  startTime: string; // "08:00"
  endTime: string;   // "08:30"
  scheduledStartIso: string;
  scheduledEndIso: string;
  score: number;     // 0 - 100
  isPrimary: boolean;
  teamCapacityExceeded: boolean;
  concurrentTeamsInSlot: number;
  requiresTeamOverride: boolean;
  isFeasible: boolean;
  hardBlockReasons: string[];
  warnings: string[];
  explanations: string[];
  rotationalCandidateReservationId?: string;
  rotationalCandidateVesselName?: string;
}

export interface ActiveWorkStoppage {
  id: string;
  scope: "all_cranes" | "single_crane" | "single_zone";
  craneId: string | null;
  craneName: string | null;
  zoneId: string | null;
  zoneCode: string | null;
  startsAt: string;
  endsAt: string | null;
  reason: string;
  note: string | null;
  isActive: boolean;
}

export interface DispatchOverviewResponse {
  date: string;
  workingHours: {
    from: string;
    to: string;
    isOpen: boolean;
    seasonName?: string;
  };
  cranes: Array<{
    id: string;
    name: string;
    type: string;
    maxCapacityKN: number;
    maxPoolWidth: number | null;
    status: string;
  }>;
  zones: ZoneCapacitySnapshot[];
  timeSlots: string[]; // ["07:00", "07:30", ...]
  scheduledOperations: DispatchReservationItem[];
  unassignedRequests: UnassignedRequestItem[];
  activeStoppages: ActiveWorkStoppage[];
  kpi: {
    totalScheduled: number;
    liftsCount: number;
    lowersCount: number;
    peakConcurrentTeams: number;
    maxTeams: number;
    unassignedCount: number;
    zonesInDeficitCount: number;
    totalLandFree: number;
  };
}
