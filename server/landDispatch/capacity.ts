import { ZoneCapacitySnapshot } from "./types";

export interface ZoneData {
  id: string;
  code: string;
  name: string;
  totalSpots: number;
  manualOccupiedSpots?: number | null;
}

export interface CapacityEvent {
  timeIso: string;
  delta: number; // -1 for lift (reserves spot), +1 for lower (releases spot)
  type: "lift" | "lower" | "offer_hold";
  zoneId: string;
  reservationId?: string;
  label?: string;
}

export function getZagrebMinutes(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/**
 * Calculates Available-To-Promise (ATP) capacity per zone across working hours.
 * Rule: 1 vessel = 1 spot (1:1).
 * Podizanje reserves spot at scheduledStart (-1).
 * Spuštanje releases spot at scheduledEnd (+1).
 */
export function calculateZoneCapacitySnapshots(params: {
  zones: ZoneData[];
  currentOccupiedMap: Map<string, number>; // zoneId -> count of active land_occupancies (returned_at IS NULL)
  scheduledReservations: Array<{
    id: string;
    landZoneId: string | null;
    operationCategory: string;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    status: string;
  }>;
  activeOfferHolds?: Array<{
    zoneId: string;
    offeredStart: Date | string;
    expiresAt: Date | string;
  }>;
  timeSlots: string[]; // e.g. ["07:00", "07:30", ..., "15:00"]
  dateStr: string;     // "YYYY-MM-DD"
}): ZoneCapacitySnapshot[] {
  const { zones, currentOccupiedMap, scheduledReservations, activeOfferHolds = [], timeSlots, dateStr } = params;

  return zones.map((zone) => {
    const totalSpots = zone.totalSpots || 0;
    const currentOccupied = currentOccupiedMap.get(zone.id) || 0;
    const currentFree = Math.max(0, totalSpots - currentOccupied);

    // Filter relevant operations for this zone on this date
    const zoneReservations = scheduledReservations.filter((r) => {
      if (r.landZoneId !== zone.id) return false;
      if (r.status === "cancelled" || r.status === "not_performed" || r.status === "rejected") return false;
      return true;
    });

    const plannedLifts = zoneReservations.filter((r) => r.operationCategory === "lift_from_sea");
    const plannedLowers = zoneReservations.filter((r) => r.operationCategory === "lower_to_sea");

    // Build timeline events
    const events: Array<{ minutesFromMidnight: number; delta: number; type: string }> = [];

    for (const res of zoneReservations) {
      if (res.status === "completed") {
        // Already physically recorded in land_occupancies, do not double count
        continue;
      }

      if (res.operationCategory === "lift_from_sea") {
        const minutes = getZagrebMinutes(res.scheduledStart);
        events.push({ minutesFromMidnight: minutes, delta: -1, type: "lift" });
      } else if (res.operationCategory === "lower_to_sea") {
        const minutes = getZagrebMinutes(res.scheduledEnd);
        events.push({ minutesFromMidnight: minutes, delta: 1, type: "lower" });
      }
    }

    // Active holds from waiting offers
    for (const hold of activeOfferHolds) {
      if (hold.zoneId === zone.id) {
        const minutes = getZagrebMinutes(hold.offeredStart);
        events.push({ minutesFromMidnight: minutes, delta: -1, type: "offer_hold" });
      }
    }

    // Sort events chronologically
    events.sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight);

    // Compute free capacity at each slot
    let runningFree = currentFree;
    let minFree = runningFree;
    let deficitTime: string | null = null;
    let lastSlotFree = runningFree;

    const hourlyTimeline: Array<{ time: string; free: number; deficit: boolean }> = [];

    // Map timeSlots to minutes
    for (const slot of timeSlots) {
      const [hStr, mStr] = slot.split(":");
      const slotMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

      // Apply all events up to and including this slot
      // Notice: lifts reserve AT start time. Lowers release AT end time.
      const appliedEvents = events.filter((e) => e.minutesFromMidnight <= slotMinutes);
      const deltaSoFar = appliedEvents.reduce((acc, ev) => acc + ev.delta, 0);

      const freeAtSlot = currentFree + deltaSoFar;
      const isDeficit = freeAtSlot < 0;

      if (freeAtSlot < minFree) {
        minFree = freeAtSlot;
      }
      if (isDeficit && !deficitTime) {
        deficitTime = slot;
      }

      hourlyTimeline.push({
        time: slot,
        free: freeAtSlot,
        deficit: isDeficit,
      });

      lastSlotFree = freeAtSlot;
    }

    return {
      zoneId: zone.id,
      zoneCode: zone.code,
      zoneName: zone.name,
      totalSpots,
      currentOccupied,
      currentFree,
      manualOccupiedSpots: zone.manualOccupiedSpots ?? 0,
      plannedLiftsToday: plannedLifts.length,
      plannedLowersToday: plannedLowers.length,
      endOfDayFree: lastSlotFree,
      minFreeToday: minFree,
      deficitTime,
      hasDeficit: minFree < 0,
      hourlyTimeline,
    };
  });
}
