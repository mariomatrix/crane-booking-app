import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import crypto from "crypto";
import { eq, and, gte, lte, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  reservations,
  cranes,
  vessels,
  users,
  serviceTypes,
  landZones,
  maintenanceBlocks,
} from "../../drizzle/schema";

const TIMEZONE = "Europe/Zagreb";
const MARINA_LOCATION = "PŠD Špinut, Lučica 7, 21000 Split";

function getHmacSecret(): string {
  return process.env.JWT_SECRET || "psd-spinut-ical-default-secret";
}

/**
 * Generates an HMAC-SHA256 token for stateless calendar URL authentication.
 */
export function generateCalendarToken(payload: string): string {
  return crypto
    .createHmac("sha256", getHmacSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Verifies an HMAC-SHA256 calendar token in constant time.
 */
export function verifyCalendarToken(payload: string, token: string): boolean {
  if (!token || typeof token !== "string") return false;
  const expected = generateCalendarToken(payload);
  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function generateReservationToken(reservationId: string): string {
  return generateCalendarToken(`res:${reservationId}`);
}

export function verifyReservationToken(reservationId: string, token: string): boolean {
  return verifyCalendarToken(`res:${reservationId}`, token);
}

export function generateFeedToken(
  userId: string,
  scope: "user" | "operator",
  craneId: string = "all"
): string {
  return generateCalendarToken(`feed:${userId}:${scope}:${craneId}`);
}

export function verifyFeedToken(
  userId: string,
  scope: "user" | "operator",
  craneId: string,
  token: string
): boolean {
  return verifyCalendarToken(`feed:${userId}:${scope}:${craneId}`, token);
}

function formatGoogleDateUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Builds a one-click Google Calendar template URL.
 */
export function buildGoogleCalendarUrl(params: {
  title: string;
  start: Date;
  end: Date;
  details: string;
  location?: string;
}): string {
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${formatGoogleDateUtc(params.start)}/${formatGoogleDateUtc(params.end)}`,
    details: params.details,
    location: params.location || MARINA_LOCATION,
    ctz: TIMEZONE,
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/**
 * Generates a single reservation .ics file content and metadata.
 */
export async function generateSingleReservationIcs(reservationId: string): Promise<{
  filename: string;
  content: string;
  googleCalendarUrl: string;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      scheduledStart: reservations.scheduledStart,
      scheduledEnd: reservations.scheduledEnd,
      durationMin: reservations.durationMin,
      status: reservations.status,
      vesselName: reservations.vesselName,
      vName: vessels.name,
      vesselRegistration: reservations.vesselRegistration,
      vRegistration: vessels.registration,
      vesselLengthM: reservations.vesselLengthM,
      vLengthM: vessels.lengthM,
      vesselBeamM: reservations.vesselBeamM,
      vBeamM: vessels.beamM,
      vesselWeightTons: reservations.vesselWeightTons,
      vWeightTons: vessels.weightTons,
      contactPhone: reservations.contactPhone,
      userNote: reservations.userNote,
      adminNote: reservations.adminNote,
      craneName: cranes.name,
      craneLocation: cranes.location,
      serviceName: serviceTypes.name,
      zoneCode: landZones.code,
      zoneName: landZones.name,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(reservations)
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(users, eq(reservations.userId, users.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);

  if (!row || !row.scheduledStart) return null;

  const start = new Date(row.scheduledStart);
  const durMin = Number(row.durationMin) || 30;
  const end = row.scheduledEnd
    ? new Date(row.scheduledEnd)
    : new Date(start.getTime() + durMin * 60000);

  const vesselLabel =
    row.vesselRegistration ||
    row.vRegistration ||
    row.vesselName ||
    row.vName ||
    "Plovilo";
  const craneLabel = row.craneName || "Dizalica";
  const serviceLabel = row.serviceName || "Operacija dizalice";
  const lengthM = row.vesselLengthM ?? row.vLengthM;
  const beamM = row.vesselBeamM ?? row.vBeamM;
  const weightTons = row.vesselWeightTons ?? row.vWeightTons;

  const title = `⚓ ${serviceLabel} — ${vesselLabel} (${craneLabel})`;
  const location = `${MARINA_LOCATION} (${craneLabel}${row.zoneCode ? `, Zona ${row.zoneCode}` : ""})`;

  const descLines: string[] = [
    `Broj rezervacije: ${row.reservationNumber || row.id.slice(0, 8)}`,
    `Usluga: ${serviceLabel}`,
    `Dizalica: ${craneLabel}${row.craneLocation ? ` (${row.craneLocation})` : ""}`,
  ];
  if (row.zoneCode || row.zoneName) {
    descLines.push(`Zona na kopnu (Suhi vez): ${row.zoneName || ""} (${row.zoneCode || ""})`);
  }
  descLines.push(`Plovilo: ${row.vesselName || row.vName || "-"} (${vesselLabel})`);
  if (lengthM || beamM || weightTons) {
    const dims = [
      lengthM ? `L: ${lengthM}m` : null,
      beamM ? `B: ${beamM}m` : null,
      weightTons ? `Masa: ${weightTons}t` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    descLines.push(`Dimenzije: ${dims}`);
  }
  if (row.userName) {
    descLines.push(`Korisnik: ${row.userName} (${row.contactPhone || row.userPhone || "bez telefona"})`);
  }
  if (row.adminNote) {
    descLines.push(`Napomena lučice: ${row.adminNote}`);
  }
  if (row.userNote) {
    descLines.push(`Napomena korisnika: ${row.userNote}`);
  }

  const description = descLines.join("\n");

  const calendar = ical({
    name: "PŠD Špinut — Rezervacija dizalice",
    timezone: TIMEZONE,
    method: ICalCalendarMethod.PUBLISH,
    prodId: {
      company: "PŠD Špinut Split",
      product: "Crane Booking App",
      language: "HR",
    },
  });

  calendar.createEvent({
    id: `res-${row.id}@psd-spinut.hr`,
    start,
    end,
    timezone: TIMEZONE,
    summary: title,
    description,
    location,
    status:
      row.status === "cancelled" || row.status === "rejected"
        ? ICalEventStatus.CANCELLED
        : row.status === "approved" || row.status === "completed"
          ? ICalEventStatus.CONFIRMED
          : ICalEventStatus.TENTATIVE,
  });

  const safeNumber = (row.reservationNumber || row.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "-");

  return {
    filename: `psd-spinut-${safeNumber}.ics`,
    content: calendar.toString(),
    googleCalendarUrl: buildGoogleCalendarUrl({
      title,
      start,
      end,
      details: description,
      location,
    }),
  };
}

/**
 * Generates a live .ics calendar subscription feed for a member's own reservations.
 */
export async function generateUserCalendarFeedIcs(userId: string): Promise<string> {
  const db = await getDb();
  const calendar = ical({
    name: "PŠD Špinut — Moji termini dizalice",
    timezone: TIMEZONE,
    ttl: 900, // 15 min refresh
    prodId: {
      company: "PŠD Špinut Split",
      product: "Crane Booking Member Feed",
      language: "HR",
    },
  });

  if (!db) return calendar.toString();

  const rows = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      scheduledStart: reservations.scheduledStart,
      scheduledEnd: reservations.scheduledEnd,
      durationMin: reservations.durationMin,
      status: reservations.status,
      vesselName: reservations.vesselName,
      vName: vessels.name,
      vesselRegistration: reservations.vesselRegistration,
      vRegistration: vessels.registration,
      adminNote: reservations.adminNote,
      craneName: cranes.name,
      serviceName: serviceTypes.name,
      zoneCode: landZones.code,
      zoneName: landZones.name,
    })
    .from(reservations)
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
    .where(
      and(
        eq(reservations.userId, userId),
        isNotNull(reservations.scheduledStart),
        inArray(reservations.status, ["approved", "completed"])
      )
    );

  for (const r of rows) {
    if (!r.scheduledStart) continue;
    const start = new Date(r.scheduledStart);
    const durMin = Number(r.durationMin) || 30;
    const end = r.scheduledEnd
      ? new Date(r.scheduledEnd)
      : new Date(start.getTime() + durMin * 60000);

    const vesselLabel = r.vesselRegistration || r.vRegistration || r.vesselName || r.vName || "Plovilo";
    const craneLabel = r.craneName || "Dizalica";
    const serviceLabel = r.serviceName || "Termin dizalice";

    calendar.createEvent({
      id: `res-${r.id}@psd-spinut.hr`,
      start,
      end,
      timezone: TIMEZONE,
      summary: `⚓ ${serviceLabel}: ${vesselLabel} (${craneLabel})`,
      location: `${MARINA_LOCATION} — ${craneLabel}${r.zoneCode ? ` / Zona ${r.zoneCode}` : ""}`,
      description: [
        `Rezervacija: ${r.reservationNumber || r.id.slice(0, 8)}`,
        `Usluga: ${serviceLabel}`,
        `Dizalica: ${craneLabel}`,
        r.zoneCode ? `Zona na kopnu: ${r.zoneName} (${r.zoneCode})` : null,
        r.adminNote ? `Napomena: ${r.adminNote}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      status: ICalEventStatus.CONFIRMED,
    });
  }

  return calendar.toString();
}

/**
 * Generates a live .ics calendar subscription feed for operators and admins
 * (all cranes or filtered by a single craneId, including maintenance blocks).
 */
export async function generateOperatorCalendarFeedIcs(params?: {
  craneId?: string;
  daysBack?: number;
  daysForward?: number;
}): Promise<string> {
  const db = await getDb();
  const craneId = params?.craneId && params.craneId !== "all" ? params.craneId : undefined;
  const daysBack = params?.daysBack ?? 30;
  const daysForward = params?.daysForward ?? 180;

  let calTitle = "PŠD Špinut — Operativni kalendar dizalica";

  if (db && craneId) {
    const [c] = await db.select({ name: cranes.name }).from(cranes).where(eq(cranes.id, craneId)).limit(1);
    if (c?.name) {
      calTitle = `PŠD Špinut — ${c.name}`;
    }
  }

  const calendar = ical({
    name: calTitle,
    timezone: TIMEZONE,
    ttl: 900, // 15 min refresh
    prodId: {
      company: "PŠD Špinut Split",
      product: "Crane Booking Operator Feed",
      language: "HR",
    },
  });

  if (!db) return calendar.toString();

  const windowStart = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + daysForward * 24 * 60 * 60 * 1000);

  const conditions: any[] = [
    isNotNull(reservations.scheduledStart),
    gte(reservations.scheduledStart, windowStart),
    lte(reservations.scheduledStart, windowEnd),
    inArray(reservations.status, ["approved", "completed"]),
  ];
  if (craneId) {
    conditions.push(eq(reservations.craneId, craneId));
  }

  const rows = await db
    .select({
      id: reservations.id,
      reservationNumber: reservations.reservationNumber,
      scheduledStart: reservations.scheduledStart,
      scheduledEnd: reservations.scheduledEnd,
      durationMin: reservations.durationMin,
      status: reservations.status,
      vesselName: reservations.vesselName,
      vName: vessels.name,
      vesselRegistration: reservations.vesselRegistration,
      vRegistration: vessels.registration,
      vesselLengthM: reservations.vesselLengthM,
      vLengthM: vessels.lengthM,
      vesselBeamM: reservations.vesselBeamM,
      vBeamM: vessels.beamM,
      vesselWeightTons: reservations.vesselWeightTons,
      vWeightTons: vessels.weightTons,
      contactPhone: reservations.contactPhone,
      adminNote: reservations.adminNote,
      userNote: reservations.userNote,
      teamOverride: reservations.teamOverride,
      teamOverrideReason: reservations.teamOverrideReason,
      craneName: cranes.name,
      serviceName: serviceTypes.name,
      zoneCode: landZones.code,
      zoneName: landZones.name,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(reservations)
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(users, eq(reservations.userId, users.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
    .where(and(...conditions));

  for (const r of rows) {
    if (!r.scheduledStart) continue;
    const start = new Date(r.scheduledStart);
    const durMin = Number(r.durationMin) || 30;
    const end = r.scheduledEnd
      ? new Date(r.scheduledEnd)
      : new Date(start.getTime() + durMin * 60000);

    const vesselLabel = r.vesselRegistration || r.vRegistration || r.vesselName || r.vName || "Plovilo";
    const craneLabel = r.craneName || "Dizalica";
    const serviceLabel = r.serviceName || "Operacija";
    const lengthM = r.vesselLengthM ?? r.vLengthM;
    const beamM = r.vesselBeamM ?? r.vBeamM;
    const weightTons = r.vesselWeightTons ?? r.vWeightTons;

    const summary = `[${craneLabel}] ${vesselLabel}${r.zoneCode ? ` → ${r.zoneCode}` : ""} (${serviceLabel})`;

    const details = [
      `Broj: ${r.reservationNumber || r.id.slice(0, 8)}`,
      `Usluga: ${serviceLabel}`,
      `Dizalica: ${craneLabel}`,
      r.zoneCode ? `Zona na kopnu: ${r.zoneName} (${r.zoneCode})` : null,
      `Plovilo: ${r.vesselName || r.vName || "-"} (${vesselLabel})`,
      lengthM || beamM || weightTons
        ? `Dimenzije: ${[
            lengthM ? `L:${lengthM}m` : null,
            beamM ? `B:${beamM}m` : null,
            weightTons ? `${weightTons}t` : null,
          ]
            .filter(Boolean)
            .join(" × ")}`
        : null,
      `Vlasnik: ${r.userName || "-"} (${r.contactPhone || r.userPhone || "-"})`,
      r.teamOverride ? `⚠️ OVERRIDE: ${r.teamOverrideReason || "Da"}` : null,
      r.adminNote ? `Bilješka operatera: ${r.adminNote}` : null,
      r.userNote ? `Napomena klijenta: ${r.userNote}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    calendar.createEvent({
      id: `op-${r.id}@psd-spinut.hr`,
      start,
      end,
      timezone: TIMEZONE,
      summary,
      description: details,
      location: `${MARINA_LOCATION} — ${craneLabel}${r.zoneCode ? ` (${r.zoneCode})` : ""}`,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  // Also include maintenance blocks
  const maintConditions: any[] = [
    gte(maintenanceBlocks.startAt, windowStart),
    lte(maintenanceBlocks.startAt, windowEnd),
  ];
  if (craneId) {
    maintConditions.push(eq(maintenanceBlocks.craneId, craneId));
  }

  const maintRows = await db
    .select({
      id: maintenanceBlocks.id,
      craneName: cranes.name,
      startAt: maintenanceBlocks.startAt,
      endAt: maintenanceBlocks.endAt,
      reason: maintenanceBlocks.reason,
    })
    .from(maintenanceBlocks)
    .leftJoin(cranes, eq(maintenanceBlocks.craneId, cranes.id))
    .where(and(...maintConditions));

  for (const m of maintRows) {
    calendar.createEvent({
      id: `maint-${m.id}@psd-spinut.hr`,
      start: new Date(m.startAt),
      end: new Date(m.endAt),
      timezone: TIMEZONE,
      summary: `🔧 [ODRŽAVANJE - ${m.craneName || "Dizalica"}] ${m.reason || "Blokada dizalice"}`,
      description: m.reason || "Planirano tehničko održavanje dizalice",
      location: MARINA_LOCATION,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  return calendar.toString();
}
