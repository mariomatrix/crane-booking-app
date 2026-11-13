import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  landOccupancies,
  landZones,
  reservations,
  serviceTypes,
  users,
  vessels,
} from "../../drizzle/schema";

export type VesselSearchFilter = "all" | "on_land" | "with_upcoming";
export type VesselTypeFilter = "all" | "jedrilica" | "motorni" | "katamaran" | "ostalo";

export interface VesselSearchResultItem {
  id: string;
  name: string;
  registration: string | null;
  type: "jedrilica" | "motorni" | "katamaran" | "ostalo";
  lengthM: string | null;
  beamM: string | null;
  draftM: string | null;
  weightTons: string | null;
  owner: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  landOccupancy: {
    zoneId: string;
    zoneCode: string;
    zoneName: string;
    spotNumber: number | null;
    liftedAt: string;
  } | null;
  nextReservation: {
    id: string;
    reservationNumber: string | null;
    status: string;
    scheduledStart: string | null;
    requestedDate: string | null;
    serviceName: string | null;
  } | null;
}

export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRegistrationToken(input: string | null | undefined): string {
  return normalizeSearchText(input).replace(/[\s\-._/]/g, "");
}

/**
 * Computes a relevance score for a vessel search item; returns 0 if it does not match.
 */
export function scoreVesselSearchMatch(
  item: Pick<VesselSearchResultItem, "name" | "registration" | "owner">,
  query: string
): number {
  const normQuery = normalizeSearchText(query);
  const regQuery = normalizeRegistrationToken(query);
  if (!normQuery && !regQuery) return 1;

  const normName = normalizeSearchText(item.name);
  const normOwner = normalizeSearchText(item.owner.name);
  const regToken = normalizeRegistrationToken(item.registration);

  if (regQuery.length > 0 && regToken.length > 0) {
    if (regToken === regQuery) return 100;
    if (regToken.startsWith(regQuery)) return 90;
    if (regToken.includes(regQuery)) return 80;
  }

  if (normName === normQuery) return 75;
  if (normName.startsWith(normQuery)) return 70;
  if (normName.includes(normQuery)) return 60;

  if (normOwner.startsWith(normQuery)) return 55;
  if (normOwner.includes(normQuery)) return 45;

  // Multi-word partial matching across name, registration and owner
  const tokens = normQuery.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    const haystack = `${normName} ${regToken} ${normOwner}`;
    if (tokens.every((t) => haystack.includes(t) || haystack.includes(normalizeRegistrationToken(t)))) {
      return 35;
    }
  }

  return 0;
}

export async function searchVesselsReadOnly(params: {
  query?: string;
  filter?: VesselSearchFilter;
  vesselType?: VesselTypeFilter;
  limit?: number;
}): Promise<{ items: VesselSearchResultItem[]; totalMatched: number }> {
  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
  const filter: VesselSearchFilter = params.filter ?? "all";
  const vesselType: VesselTypeFilter = params.vesselType ?? "all";
  const query = (params.query ?? "").trim();

  const [vesselRows, activeOccupancies, upcomingReservations] = await Promise.all([
    db
      .select({
        id: vessels.id,
        name: vessels.name,
        registration: vessels.registration,
        type: vessels.type,
        lengthM: vessels.lengthM,
        beamM: vessels.beamM,
        draftM: vessels.draftM,
        weightTons: vessels.weightTons,
        ownerId: users.id,
        ownerName: users.name,
        ownerPhone: users.phone,
        ownerEmail: users.email,
      })
      .from(vessels)
      .innerJoin(users, eq(vessels.ownerId, users.id))
      .orderBy(asc(vessels.name)),

    db
      .select({
        vesselId: landOccupancies.vesselId,
        zoneId: landOccupancies.zoneId,
        zoneCode: landZones.code,
        zoneName: landZones.name,
        spotNumber: landOccupancies.spotNumber,
        liftedAt: landOccupancies.liftedAt,
      })
      .from(landOccupancies)
      .innerJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
      .where(isNull(landOccupancies.returnedAt))
      .orderBy(desc(landOccupancies.liftedAt)),

    db
      .select({
        id: reservations.id,
        vesselId: reservations.vesselId,
        reservationNumber: reservations.reservationNumber,
        status: reservations.status,
        scheduledStart: reservations.scheduledStart,
        requestedDate: reservations.requestedDate,
        serviceName: serviceTypes.name,
      })
      .from(reservations)
      .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
      .where(inArray(reservations.status, ["approved", "pending"]))
      .orderBy(asc(reservations.scheduledStart), asc(reservations.requestedDate)),
  ]);

  const occupancyByVessel = new Map<string, VesselSearchResultItem["landOccupancy"]>();
  for (const occ of activeOccupancies) {
    if (!occupancyByVessel.has(occ.vesselId)) {
      occupancyByVessel.set(occ.vesselId, {
        zoneId: occ.zoneId,
        zoneCode: occ.zoneCode,
        zoneName: occ.zoneName,
        spotNumber: occ.spotNumber ?? null,
        liftedAt: occ.liftedAt.toISOString(),
      });
    }
  }

  const nextReservationByVessel = new Map<string, VesselSearchResultItem["nextReservation"]>();
  for (const res of upcomingReservations) {
    if (res.vesselId && !nextReservationByVessel.has(res.vesselId)) {
      nextReservationByVessel.set(res.vesselId, {
        id: res.id,
        reservationNumber: res.reservationNumber ?? null,
        status: res.status,
        scheduledStart: res.scheduledStart ? res.scheduledStart.toISOString() : null,
        requestedDate: res.requestedDate ? String(res.requestedDate) : null,
        serviceName: res.serviceName ?? null,
      });
    }
  }

  const matched: Array<{ item: VesselSearchResultItem; score: number }> = [];

  for (const row of vesselRows) {
    if (vesselType !== "all" && row.type !== vesselType) continue;

    const landOccupancy = occupancyByVessel.get(row.id) ?? null;
    const nextReservation = nextReservationByVessel.get(row.id) ?? null;

    if (filter === "on_land" && !landOccupancy) continue;
    if (filter === "with_upcoming" && !nextReservation) continue;

    const item: VesselSearchResultItem = {
      id: row.id,
      name: row.name,
      registration: row.registration ?? null,
      type: row.type,
      lengthM: row.lengthM ?? null,
      beamM: row.beamM ?? null,
      draftM: row.draftM ?? null,
      weightTons: row.weightTons ?? null,
      owner: {
        id: row.ownerId,
        name: row.ownerName ?? null,
        phone: row.ownerPhone ?? null,
        email: row.ownerEmail ?? null,
      },
      landOccupancy,
      nextReservation,
    };

    const score = scoreVesselSearchMatch(item, query);
    if (score > 0) {
      matched.push({ item, score });
    }
  }

  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name, "hr");
  });

  return {
    items: matched.slice(0, limit).map((m) => m.item),
    totalMatched: matched.length,
  };
}
