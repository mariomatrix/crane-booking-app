import { eq, and, sql } from "drizzle-orm";
import { workStoppages, reservations, cranes, landZones } from "../../drizzle/schema";
import { ActiveWorkStoppage } from "./types";

export async function fetchActiveStoppagesForDate(
  db: any,
  dateStr: string
): Promise<ActiveWorkStoppage[]> {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const rows = await db
    .select({
      id: workStoppages.id,
      scope: workStoppages.scope,
      craneId: workStoppages.craneId,
      craneName: cranes.name,
      zoneId: workStoppages.zoneId,
      zoneCode: landZones.code,
      startsAt: workStoppages.startsAt,
      endsAt: workStoppages.endsAt,
      reason: workStoppages.reason,
      note: workStoppages.note,
      isActive: workStoppages.isActive,
    })
    .from(workStoppages)
    .leftJoin(cranes, eq(workStoppages.craneId, cranes.id))
    .leftJoin(landZones, eq(workStoppages.zoneId, landZones.id))
    .where(
      and(
        eq(workStoppages.isActive, true),
        sql`${workStoppages.startsAt} <= ${dayEnd.toISOString()}`,
        sql`(${workStoppages.endsAt} IS NULL OR ${workStoppages.endsAt} >= ${dayStart.toISOString()})`
      )
    );

  return rows.map((r: any) => ({
    id: r.id,
    scope: r.scope,
    craneId: r.craneId,
    craneName: r.craneName,
    zoneId: r.zoneId,
    zoneCode: r.zoneCode,
    startsAt: new Date(r.startsAt).toISOString(),
    endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
    reason: r.reason,
    note: r.note,
    isActive: r.isActive,
  }));
}

export async function findAffectedReservationsForStoppage(
  db: any,
  stoppage: {
    scope: string;
    craneId?: string | null;
    zoneId?: string | null;
    startsAt: Date | string;
    endsAt?: Date | string | null;
  }
) {
  const startsAtIso = new Date(stoppage.startsAt).toISOString();
  const endsAtIso = stoppage.endsAt ? new Date(stoppage.endsAt).toISOString() : null;

  let timeCondition = sql`${reservations.scheduledEnd} > ${startsAtIso}`;
  if (endsAtIso) {
    timeCondition = sql`${reservations.scheduledStart} < ${endsAtIso} AND ${reservations.scheduledEnd} > ${startsAtIso}`;
  }

  let scopeCondition = sql`TRUE`;
  if (stoppage.scope === "single_crane" && stoppage.craneId) {
    scopeCondition = eq(reservations.craneId, stoppage.craneId);
  } else if (stoppage.scope === "single_zone" && stoppage.zoneId) {
    scopeCondition = eq(reservations.landZoneId, stoppage.zoneId);
  }

  const affected = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      vesselName: reservations.vesselName,
      scheduledStart: reservations.scheduledStart,
      scheduledEnd: reservations.scheduledEnd,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        sql`${reservations.status} IN ('pending', 'approved')`,
        timeCondition,
        scopeCondition
      )
    );

  return affected;
}
