import { z } from "zod";
import { randomUUID } from "crypto";
import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";
import {
  getDb,
  createAuditEntry,
  getOperatorCranes,
} from "../db";
import {
  users,
  vessels,
  reservations,
  cranes,
  landZones,
  landOccupancies,
  resources,
  workOrders,
  workStoppages,
  userCardEntries,
  messages,
  serviceTypes,
} from "../../drizzle/schema";
import { eq, and, inArray, isNull, desc, asc, ne, sql } from "drizzle-orm";
import {
  startReservationWorkOrder,
  completeReservationOperation,
  resolveCanonicalSpotTx,
} from "./workOrderService";
import { landDispatchService } from "../landDispatch/landDispatch.service";
import { sendNewMessageNotification } from "../_core/email";
import { sendSms } from "../_core/sms";

export type VoiceActionType =
  | "start_work_order"
  | "complete_work_order"
  | "update_work_order_notes"
  | "assign_land_zone"
  | "add_card_charge"
  | "send_owner_message"
  | "report_stoppage"
  | "resolve_stoppage"
  | "vessel_lookup";

export interface ProposedVoiceResourceItem {
  resourceId: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceEur: number;
}

export interface VoiceCandidateVessel {
  vesselId: string;
  vesselName: string;
  vesselRegistration: string | null;
  userId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  reservationId?: string | null;
  reservationNumber?: string | null;
}

export interface ProposedVoiceAction {
  id: string;
  type: VoiceActionType;
  title: string;
  description: string;
  confidence: number;
  requiresConfirmation: boolean;
  needsDisambiguation?: boolean;
  candidateVessels?: VoiceCandidateVessel[];
  // Resolved DB references & payload
  reservationId?: string | null;
  reservationNumber?: string | null;
  vesselId?: string | null;
  vesselName?: string | null;
  vesselRegistration?: string | null;
  userId?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  craneId?: string | null;
  craneName?: string | null;
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  spotNumber?: number | null;
  durationMin?: number | null;
  operatorNotes?: string | null;
  messageText?: string | null;
  serviceItemCode?: string | null;
  serviceItemName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  stoppageScope?: "all_cranes" | "single_crane" | "single_zone" | null;
  stoppageReason?: "wind" | "maintenance" | "high_tide" | "other" | null;
  stoppageId?: string | null;
  resources?: ProposedVoiceResourceItem[];
}

export interface VoiceInterpretResult {
  requestId: string;
  modelUsed: string;
  transcript: string;
  spokenResponse: string;
  actions: ProposedVoiceAction[];
  warnings: string[];
}

const VoicePlanOutputSchema = z.object({
  transcript: z.string().default(""),
  spokenResponse: z.string().default("Naredba je obrađena."),
  warnings: z.array(z.string()).optional().default([]),
  rawActions: z
    .array(
      z
        .object({
          type: z.enum([
            "start_work_order",
            "complete_work_order",
            "update_work_order_notes",
            "assign_land_zone",
            "add_card_charge",
            "send_owner_message",
            "report_stoppage",
            "resolve_stoppage",
            "vessel_lookup",
          ]),
        })
        .passthrough()
    )
    .default([]),
});

export interface VoiceContextSnapshot {
  dateStr: string;
  todayTasks: Array<{
    reservationId: string;
    reservationNumber: string | null;
    status: string;
    vesselId: string | null;
    vesselName: string | null;
    vesselRegistration: string | null;
    userId: string;
    ownerName: string | null;
    ownerPhone: string | null;
    craneId: string | null;
    craneName: string | null;
    zoneId: string | null;
    zoneCode: string | null;
    serviceCategory: string | null;
  }>;
  allVessels: Array<{
    id: string;
    name: string;
    registration: string | null;
    lengthM: string | null;
    ownerId: string;
    ownerName: string | null;
    ownerPhone: string | null;
    currentZoneCode: string | null;
    currentZoneName: string | null;
    currentSpotNumber: number | null;
  }>;
  zones: Array<{
    id: string;
    code: string;
    name: string;
    availableSpots: number;
  }>;
  activeResources: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    pricePerUnitEur: number;
  }>;
  cranes: Array<{
    id: string;
    name: string;
  }>;
  activeStoppages: Array<{
    id: string;
    scope: string;
    reason: string;
    note: string | null;
  }>;
}

const VOICE_COMMAND_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    transcript: {
      type: "string",
      description: "Točan transkript onoga što je mornar/operater izgovorio na hrvatskom jeziku.",
    },
    spokenResponse: {
      type: "string",
      description: "Kratak, jasan glasovni sažetak na hrvatskom jeziku što je pripremljeno za izvršenje ili odgovor na pitanje.",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Upozorenja ako neko plovilo ili zona nisu jednoznačno prepoznati.",
    },
    rawActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "start_work_order",
              "complete_work_order",
              "update_work_order_notes",
              "assign_land_zone",
              "add_card_charge",
              "send_owner_message",
              "report_stoppage",
              "resolve_stoppage",
              "vessel_lookup",
            ],
          },
          vesselQuery: {
            type: "string",
            description: "Spomenuta registracija plovila (npr. ST-1234 ili ST-4253), ime plovila ili prezime vlasnika.",
          },
          reservationId: { type: "string" },
          zoneQuery: {
            type: "string",
            description: "Spomenuta zona na kopnu (npr. A1, A2, A3, Arla 3, SZ, Servisna, LB, Lukobran, ZO, MD).",
          },
          spotNumber: { type: "integer" },
          durationMin: { type: "integer" },
          operatorNotes: { type: "string" },
          messageText: {
            type: "string",
            description: "Tekst obavijesti za vlasnika plovila (uredno sročen na hrvatskom).",
          },
          resourceQuery: {
            type: "string",
            description: "Spomenuta dodatna usluga ili resurs (npr. struja, priključak struje, traktor, pumpa, visokotlačni perač).",
          },
          quantity: { type: "number" },
          unit: { type: "string" },
          stoppageScope: {
            type: "string",
            enum: ["all_cranes", "single_crane", "single_zone"],
          },
          stoppageReason: {
            type: "string",
            enum: ["wind", "maintenance", "high_tide", "other"],
          },
          confidence: { type: "number" },
        },
        required: ["type"],
      },
    },
  },
  required: ["transcript", "spokenResponse", "rawActions"],
};

/**
 * Normalizes Croatian vessel registrations so "st 42 53", "ST4253", and "ST-4253" match identically.
 */
export function normalizeRegString(s?: string | null): string {
  if (!s) return "";
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9ČĆŽŠĐ]/g, "")
    .trim();
}

export async function loadVoiceContextSnapshot(
  operatorId: string,
  operatorRole: string,
  dateStr?: string
): Promise<VoiceContextSnapshot> {
  const db = await getDb();
  const targetDate = dateStr || new Date().toISOString().split("T")[0];
  if (!db) {
    return {
      dateStr: targetDate,
      todayTasks: [],
      allVessels: [],
      zones: [],
      activeResources: [],
      cranes: [],
      activeStoppages: [],
    };
  }

  const assignedCraneIds = await getOperatorCranes(operatorId);

  const dateCondition = sql`(
    ${reservations.requestedDate} = ${targetDate}
    OR to_char(${reservations.scheduledStart} AT TIME ZONE 'Europe/Zagreb', 'YYYY-MM-DD') = ${targetDate}
    OR DATE(${reservations.scheduledStart}) = ${targetDate}::date
  )`;

  const resRows = await db
    .select({
      reservation: reservations,
      vessel: vessels,
      owner: users,
      crane: cranes,
      zone: landZones,
      serviceType: serviceTypes,
    })
    .from(reservations)
    .leftJoin(vessels, eq(reservations.vesselId, vessels.id))
    .leftJoin(users, eq(reservations.userId, users.id))
    .leftJoin(cranes, eq(reservations.craneId, cranes.id))
    .leftJoin(landZones, eq(reservations.landZoneId, landZones.id))
    .leftJoin(serviceTypes, eq(reservations.serviceTypeId, serviceTypes.id))
    .where(
      and(
        dateCondition,
        inArray(reservations.status, ["approved", "pending", "completed"])
      )
    )
    .orderBy(reservations.scheduledStart);

  const filteredRes =
    assignedCraneIds.length > 0 && operatorRole !== "admin"
      ? resRows.filter(
          (r) => !r.reservation.craneId || assignedCraneIds.includes(r.reservation.craneId)
        )
      : resRows;

  const resIds = filteredRes.map((r) => r.reservation.id);
  const activeWOs =
    resIds.length > 0
      ? await db
          .select()
          .from(workOrders)
          .where(and(inArray(workOrders.reservationId, resIds), ne(workOrders.status, "cancelled")))
      : [];

  const todayTasks = filteredRes.map((r) => {
    const wo = activeWOs.find((w) => w.reservationId === r.reservation.id);
    const effectiveStatus =
      wo && wo.status === "in_progress" ? "in_progress" : r.reservation.status;
    return {
      reservationId: r.reservation.id,
      reservationNumber: r.reservation.reservationNumber,
      status: effectiveStatus,
      vesselId: r.vessel?.id || r.reservation.vesselId || null,
      vesselName: r.vessel?.name || r.reservation.vesselName || null,
      vesselRegistration:
        r.vessel?.registration || r.reservation.vesselRegistration || null,
      userId: r.reservation.userId,
      ownerName: r.owner?.name || null,
      ownerPhone: r.owner?.phone || r.reservation.contactPhone || null,
      craneId: r.crane?.id || r.reservation.craneId || null,
      craneName: r.crane?.name || null,
      zoneId: r.zone?.id || r.reservation.landZoneId || null,
      zoneCode: r.zone?.code || null,
      serviceCategory: r.serviceType?.operationCategory || null,
    };
  });

  const dbZones = await db
    .select()
    .from(landZones)
    .where(eq(landZones.isActive, true))
    .orderBy(asc(landZones.sortOrder), asc(landZones.name));

  const activeOccs = await db
    .select({
      vesselId: landOccupancies.vesselId,
      zoneId: landOccupancies.zoneId,
      spotNumber: landOccupancies.spotNumber,
      zoneCode: landZones.code,
      zoneName: landZones.name,
    })
    .from(landOccupancies)
    .leftJoin(landZones, eq(landOccupancies.zoneId, landZones.id))
    .where(isNull(landOccupancies.returnedAt));

  const zones = dbZones.map((z) => {
    const occCount = activeOccs.filter((o) => o.zoneId === z.id).length;
    const totalOcc = occCount + (z.manualOccupiedSpots || 0);
    return {
      id: z.id,
      code: z.code,
      name: z.name,
      availableSpots: Math.max(0, z.totalSpots - totalOcc),
    };
  });

  const vesselRows = await db
    .select({
      id: vessels.id,
      name: vessels.name,
      registration: vessels.registration,
      lengthM: vessels.lengthM,
      ownerId: vessels.ownerId,
      ownerName: users.name,
      ownerPhone: users.phone,
    })
    .from(vessels)
    .leftJoin(users, eq(vessels.ownerId, users.id))
    .orderBy(asc(vessels.name));

  const occByVessel = new Map(activeOccs.map((o) => [o.vesselId, o]));
  const allVessels = vesselRows.map((v) => {
    const occ = occByVessel.get(v.id);
    return {
      ...v,
      currentZoneCode: occ?.zoneCode || null,
      currentZoneName: occ?.zoneName || null,
      currentSpotNumber: occ?.spotNumber ?? null,
    };
  });

  const dbResources = await db
    .select()
    .from(resources)
    .where(eq(resources.isActive, true))
    .orderBy(asc(resources.sortOrder), asc(resources.name));

  const activeResources = dbResources.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    pricePerUnitEur: Number(r.pricePerUnitEur) || 0,
  }));

  const dbCranes = await db
    .select({ id: cranes.id, name: cranes.name })
    .from(cranes)
    .where(eq(cranes.craneStatus, "active"));

  const activeStoppages = await db
    .select({
      id: workStoppages.id,
      scope: workStoppages.scope,
      reason: workStoppages.reason,
      note: workStoppages.note,
    })
    .from(workStoppages)
    .where(eq(workStoppages.isActive, true))
    .orderBy(desc(workStoppages.startsAt));

  return {
    dateStr: targetDate,
    todayTasks,
    allVessels,
    zones,
    activeResources,
    cranes: dbCranes,
    activeStoppages,
  };
}

/**
 * Normalizes audio base64 & MIME type for Gemini Interactions API and LLM fallbacks.
 * Handles data URLs containing codec parameters such as `data:audio/webm;codecs=opus;base64,...`.
 */
export function normalizeAudioPayload(
  audioBase64?: string,
  audioMimeType?: string
): { base64: string; mimeType: string } | null {
  if (!audioBase64) return null;
  const trimmed = audioBase64.trim();
  if (!trimmed) return null;

  let extractedMime = audioMimeType;
  let rawBase64 = trimmed;

  const dataUrlMatch = /^data:([^,]*);base64,([\s\S]*)$/i.exec(trimmed);
  if (dataUrlMatch) {
    if (!extractedMime && dataUrlMatch[1]) {
      extractedMime = dataUrlMatch[1];
    }
    rawBase64 = dataUrlMatch[2] || "";
  } else if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      rawBase64 = trimmed.slice(commaIdx + 1);
    }
  }

  const cleanBase64 = rawBase64.replace(/\s+/g, "");
  if (!cleanBase64) return null;

  const cleanMimeType = (extractedMime || "audio/webm").split(";")[0].trim() || "audio/webm";
  return { base64: cleanBase64, mimeType: cleanMimeType };
}

/**
 * Calls Google Gemini Interactions API directly when GEMINI_API_KEY is configured,
 * or falls back to ENV.forgeApiKey via invokeLLM.
 */
async function callGeminiForVoicePlan(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<{
  transcript: string;
  spokenResponse: string;
  warnings?: string[];
  rawActions: any[];
}> {
  const { model, systemPrompt, userPrompt, audioBase64, audioMimeType } = params;

  const normalizedAudio = normalizeAudioPayload(audioBase64, audioMimeType);

  // 1. Direct Google Gemini Interactions API (v1beta/interactions)
  if (ENV.geminiApiKey && ENV.geminiApiKey.trim().length > 0) {
    const inputParts: Array<Record<string, unknown>> = [];
    if (normalizedAudio) {
      inputParts.push({
        type: "audio",
        mime_type: normalizedAudio.mimeType,
        data: normalizedAudio.base64,
      });
    }
    inputParts.push({
      type: "text",
      text: userPrompt,
    });

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": ENV.geminiApiKey.trim(),
        },
        body: JSON.stringify({
          model,
          system_instruction: systemPrompt,
          input: inputParts,
          store: false,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: VOICE_COMMAND_JSON_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Interactions API greška (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as any;
    const outputText =
      data.output_text ||
      data.steps
        ?.filter((s: any) => s.type === "model_output")
        .flatMap((s: any) => s.content || [])
        .find((c: any) => c.type === "text")?.text;

    if (!outputText) {
      throw new Error("Gemini API nije vratio strukturirani JSON odgovor.");
    }

    const parsedJson = JSON.parse(outputText);
    const validated = VoicePlanOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error("Gemini API vratio je neispravnu strukturu odgovora.");
    }
    return validated.data;
  }

  // 2. Fallback to server/_core/llm.ts (BUILT_IN_FORGE_API_KEY)
  if (ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0) {
    const contentParts: any[] = [];
    if (normalizedAudio) {
      const dataUrl = `data:${normalizedAudio.mimeType};base64,${normalizedAudio.base64}`;
      contentParts.push({
        type: "file_url",
        file_url: {
          url: dataUrl,
          mime_type: normalizedAudio.mimeType as any,
        },
      });
    }
    contentParts.push({
      type: "text",
      text: userPrompt,
    });

    const res = await invokeLLM({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts },
      ],
      outputSchema: {
        name: "voice_command_plan",
        schema: VOICE_COMMAND_JSON_SCHEMA,
        strict: true,
      },
    });

    const msgContent = res.choices?.[0]?.message?.content;
    const textOut =
      typeof msgContent === "string"
        ? msgContent
        : Array.isArray(msgContent)
          ? (msgContent.find((p: any) => p.type === "text") as any)?.text
          : "";
    if (!textOut) {
      throw new Error("LLM adapter nije vratio JSON izlaz.");
    }
    return JSON.parse(textOut);
  }

  throw new Error("NO_LLM_API_KEY");
}

/**
 * Deterministic Croatian marine NLP parser used as a fast local fallback when
 * GEMINI_API_KEY is not configured or for offline/local transcript parsing.
 */
export function parseVoiceTranscriptLocally(
  transcript: string,
  context: VoiceContextSnapshot
): {
  transcript: string;
  spokenResponse: string;
  warnings: string[];
  rawActions: any[];
} {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();
  const rawActions: any[] = [];
  const warnings: string[] = [];

  // Extract registration pattern like "ST-1234", "ST 4253", "ST 42 53", "ŠI-123"
  const regMatch = raw.match(/\b([A-ZČĆŽŠĐ]{2})\s*[-]?\s*(\d{2,5}(?:\s+\d{1,3})?)\b/i);
  const extractedReg = regMatch
    ? `${regMatch[1].toUpperCase()}-${regMatch[2].replace(/\s+/g, "")}`
    : undefined;

  // Match vessel by registration or name from today's tasks or all vessels
  let matchedVesselQuery = extractedReg;
  if (!matchedVesselQuery) {
    for (const t of context.todayTasks) {
      if (t.vesselName && lower.includes(t.vesselName.toLowerCase())) {
        matchedVesselQuery = t.vesselRegistration || t.vesselName;
        break;
      }
    }
    if (!matchedVesselQuery) {
      for (const v of context.allVessels) {
        if (v.name && v.name.length >= 3 && lower.includes(v.name.toLowerCase())) {
          matchedVesselQuery = v.registration || v.name;
          break;
        }
      }
    }
  }

  // Match zone query
  let matchedZoneQuery: string | undefined;
  const zonePatterns: Array<{ regex: RegExp; code: string }> = [
    { regex: /\b(arla\s*1|a\s*1|zoni\s*a1)\b/i, code: "A1" },
    { regex: /\b(arla\s*2|a\s*2|zoni\s*a2)\b/i, code: "A2" },
    { regex: /\b(arla\s*3|a\s*3|zoni\s*a3)\b/i, code: "A3" },
    { regex: /\b(servis\w*|s\s*z)\b/i, code: "SZ" },
    { regex: /\b(lukobran\w*|l\s*b)\b/i, code: "LB" },
    { regex: /\b(zapadn\w*\s*obal\w*|z\s*o)\b/i, code: "ZO" },
    { regex: /\b(mal\w*\s*dizalic\w*|m\s*d)\b/i, code: "MD" },
  ];
  for (const zp of zonePatterns) {
    if (zp.regex.test(raw)) {
      matchedZoneQuery = zp.code;
      break;
    }
  }

  // Extract spot number ("mjesto 12", "broj 8", "pozicija 5")
  const spotMatch = raw.match(/\b(?:mjest[ou]|broj|pozicij[ai])\s*(\d{1,3})\b/i);
  const spotNumber = spotMatch ? parseInt(spotMatch[1], 10) : undefined;

  // Extract duration ("45 minuta", "60 min", "sat i pol")
  let durationMin: number | undefined;
  const minMatch = raw.match(/(\d{2,3})\s*min/i);
  if (minMatch) {
    durationMin = parseInt(minMatch[1], 10);
  } else if (/sat\s+i\s+po/i.test(raw)) {
    durationMin = 90;
  } else if (/\b1\s*sat\b|\bjedan\s*sat\b/i.test(raw)) {
    durationMin = 60;
  }

  // 1. Check for weather / maintenance stoppage commands
  if (/\b(obustav\w*|zaustav\w*\s+rad|blokiraj\s+rad|bura|jak\s+vjetar)\b/i.test(lower)) {
    if (/\b(ukini|prekini\s+obustavu|vrati\s+u\s+rad|otvori\s+rad)\b/i.test(lower)) {
      rawActions.push({
        type: "resolve_stoppage",
        operatorNotes: raw,
        confidence: 0.92,
      });
    } else {
      const isMaintenance = /\b(kvar|servis|održavanj\w*)\b/i.test(lower);
      rawActions.push({
        type: "report_stoppage",
        stoppageScope: "all_cranes",
        stoppageReason: isMaintenance ? "maintenance" : "wind",
        operatorNotes: raw,
        confidence: 0.95,
      });
    }
  } else if (/\b(ukini\s+obustav\w*|završi\s+obustav\w*)\b/i.test(lower)) {
    rawActions.push({
      type: "resolve_stoppage",
      operatorNotes: raw,
      confidence: 0.92,
    });
  }

  // 2. Check for start work order
  if (/\b(pokreni|kreni|započni|otvori\s+nalog|startaj)\b/i.test(lower)) {
    rawActions.push({
      type: "start_work_order",
      vesselQuery: matchedVesselQuery,
      operatorNotes: raw,
      confidence: 0.9,
    });
  }

  // 3. Check for complete work order
  if (/\b(završi|zaključi|gotovo\s+dizanje|gotovo\s+spuštanje|završeno)\b/i.test(lower)) {
    rawActions.push({
      type: "complete_work_order",
      vesselQuery: matchedVesselQuery,
      zoneQuery: matchedZoneQuery,
      spotNumber,
      durationMin: durationMin || 30,
      operatorNotes: raw,
      confidence: 0.9,
    });
  }

  // 4. Check for standalone zone placement/move if not already completing work order
  if (
    !rawActions.some((a) => a.type === "complete_work_order") &&
    matchedZoneQuery &&
    /\b(smjesti|premjesti|prebaci|stavi\s+u\s+zonu|na\s+kopno)\b/i.test(lower)
  ) {
    rawActions.push({
      type: "assign_land_zone",
      vesselQuery: matchedVesselQuery,
      zoneQuery: matchedZoneQuery,
      spotNumber,
      operatorNotes: raw,
      confidence: 0.88,
    });
  }

  // 5. Check for resource / service charge on user card ("struja", "traktor", "pumpa", "perač", "naplati")
  const resourcePatterns: Array<{
    regex: RegExp;
    query: string;
    defaultUnit: string;
  }> = [
    { regex: /\b(struj[aeu]|priključ\w*\s+struj\w*|ormarić)\b/i, query: "struja", defaultUnit: "dan" },
    { regex: /\b(traktor\w*)\b/i, query: "traktor", defaultUnit: "sat" },
    { regex: /\b(pump\w*|ispumpavanj\w*)\b/i, query: "pumpa", defaultUnit: "sat" },
    { regex: /\b(perač\w*|pranj\w*|visokotlačn\w*)\b/i, query: "perač", defaultUnit: "sat" },
    { regex: /\b(vod[aeu]|priključ\w*\s+vod\w*)\b/i, query: "voda", defaultUnit: "dan" },
  ];

  for (const rp of resourcePatterns) {
    if (rp.regex.test(lower)) {
      const qtyMatch =
        raw.match(/(\d+)\s*(?:dan[a]?|sat[ia]?|kom\w*)/i) ||
        raw.match(/\b(jedan|dva|tri|četiri|pet)\s*(?:dan[a]?|sat[ia]?)/i);
      let quantity = 1;
      if (qtyMatch) {
        const wordNums: Record<string, number> = {
          jedan: 1,
          dva: 2,
          tri: 3,
          četiri: 4,
          pet: 5,
        };
        quantity = wordNums[qtyMatch[1].toLowerCase()] || parseInt(qtyMatch[1], 10) || 1;
      }
      rawActions.push({
        type: "add_card_charge",
        vesselQuery: matchedVesselQuery,
        resourceQuery: rp.query,
        quantity,
        unit: rp.defaultUnit,
        operatorNotes: raw,
        confidence: 0.9,
      });
    }
  }

  // 6. Check for owner notification ("javi vlasniku", "pošalji poruku", "obavijesti vlasnika", "pukao konop")
  if (
    /\b(javi\w*\s+vlasnik\w*|obavijest\w*\s+vlasnik\w*|pošalji\s+poruk\w*|pukao\s+.*konop|oštećen\w*)\b/i.test(
      lower
    )
  ) {
    rawActions.push({
      type: "send_owner_message",
      vesselQuery: matchedVesselQuery,
      messageText: `Obavijest iz lučice PŠD Špinut: ${raw}`,
      confidence: 0.9,
    });
  }

  // 7. Check for vessel lookup / question ("gdje je", "tko je vlasnik", "broj mobitela", "status")
  if (
    rawActions.length === 0 &&
    (matchedVesselQuery || /\b(gdje\s+je|tko\s+je|broj\s+mobitela|telefon|status\s+broda|nađi\s+brod)\b/i.test(lower))
  ) {
    rawActions.push({
      type: "vessel_lookup",
      vesselQuery: matchedVesselQuery || raw,
      confidence: 0.85,
    });
  }

  // 8. Fallback: if still no action but vessel matched, add operator note
  if (rawActions.length === 0 && matchedVesselQuery) {
    rawActions.push({
      type: "update_work_order_notes",
      vesselQuery: matchedVesselQuery,
      operatorNotes: raw,
      confidence: 0.75,
    });
  }

  return {
    transcript: raw,
    spokenResponse:
      rawActions.length > 0
        ? `Prepoznato je ${rawActions.length} ${rawActions.length === 1 ? "akcija" : "akcije"} iz glasovnog zapisa. Provjerite i potvrdite izvršenje.`
        : "Nisam uspio prepoznati konkretnu akciju. Pokušajte navesti registraciju plovila (npr. ST-4253) i željenu radnju.",
    warnings,
    rawActions,
  };
}

/**
 * Resolves raw AI/NLP actions against the database snapshot so the mobile UI gets
 * concrete IDs, vessel names, owner phone numbers, zone names, and prices.
 */
export function resolveVoiceActionsAgainstContext(
  rawActions: any[],
  context: VoiceContextSnapshot,
  activeReservationId?: string | null
): { actions: ProposedVoiceAction[]; warnings: string[] } {
  const resolved: ProposedVoiceAction[] = [];
  const warnings: string[] = [];

  const findVesselAndTask = (vesselQuery?: string | null, explicitResId?: string | null) => {
    if (explicitResId) {
      const task = context.todayTasks.find((t) => t.reservationId === explicitResId);
      const vessel = task?.vesselId
        ? context.allVessels.find((v) => v.id === task.vesselId)
        : undefined;
      return { task, vessel };
    }

    if (vesselQuery && vesselQuery.trim().length > 0) {
      const normQ = normalizeRegString(vesselQuery);
      const lowerQ = vesselQuery.trim().toLowerCase();

      // Exact registration match is always unambiguous
      const exactTask = context.todayTasks.find(
        (t) => t.vesselRegistration && normalizeRegString(t.vesselRegistration) === normQ
      );
      const exactVessel = context.allVessels.find(
        (v) => v.registration && normalizeRegString(v.registration) === normQ
      );
      if (exactTask || exactVessel) {
        const vessel =
          exactVessel ||
          (exactTask?.vesselId ? context.allVessels.find((v) => v.id === exactTask.vesselId) : undefined);
        const task =
          exactTask || (vessel ? context.todayTasks.find((t) => t.vesselId === vessel.id) : undefined);
        return { task, vessel, ambiguousCandidates: [] as VoiceCandidateVessel[] };
      }

      // Otherwise check all matching tasks & vessels to detect ambiguity (e.g. two Drinković brothers)
      const matchingTasks = context.todayTasks.filter(
        (t) =>
          (t.vesselRegistration &&
            normQ.length >= 3 &&
            normalizeRegString(t.vesselRegistration).includes(normQ)) ||
          (t.vesselName && t.vesselName.toLowerCase().includes(lowerQ)) ||
          (t.ownerName && t.ownerName.toLowerCase().includes(lowerQ))
      );

      const matchingVessels = context.allVessels.filter(
        (v) =>
          (v.registration &&
            normQ.length >= 3 &&
            normalizeRegString(v.registration).includes(normQ)) ||
          v.name.toLowerCase().includes(lowerQ) ||
          (v.ownerName && v.ownerName.toLowerCase().includes(lowerQ))
      );

      // Deduplicate candidates by vesselId
      const candidateMap = new Map<string, VoiceCandidateVessel>();
      for (const t of matchingTasks) {
        if (!t.vesselId) continue;
        candidateMap.set(t.vesselId, {
          vesselId: t.vesselId,
          vesselName: t.vesselName || "Plovilo",
          vesselRegistration: t.vesselRegistration || null,
          userId: t.userId,
          ownerName: t.ownerName || null,
          ownerPhone: t.ownerPhone || null,
          reservationId: t.reservationId,
          reservationNumber: t.reservationNumber,
        });
      }
      for (const v of matchingVessels) {
        if (!candidateMap.has(v.id)) {
          const linkedTask = context.todayTasks.find((t) => t.vesselId === v.id);
          candidateMap.set(v.id, {
            vesselId: v.id,
            vesselName: v.name,
            vesselRegistration: v.registration || null,
            userId: v.ownerId,
            ownerName: v.ownerName || null,
            ownerPhone: v.ownerPhone || null,
            reservationId: linkedTask?.reservationId || null,
            reservationNumber: linkedTask?.reservationNumber || null,
          });
        }
      }

      const candidates = Array.from(candidateMap.values());
      if (candidates.length > 1) {
        return { task: undefined, vessel: undefined, ambiguousCandidates: candidates.slice(0, 6) };
      }

      if (matchingTasks.length === 1) {
        const taskMatch = matchingTasks[0];
        const vessel =
          matchingVessels[0] ||
          (taskMatch.vesselId ? context.allVessels.find((v) => v.id === taskMatch.vesselId) : undefined);
        return { task: taskMatch, vessel, ambiguousCandidates: [] as VoiceCandidateVessel[] };
      }

      if (matchingVessels.length === 1) {
        const vesselMatch = matchingVessels[0];
        const task = context.todayTasks.find((t) => t.vesselId === vesselMatch.id);
        return { task, vessel: vesselMatch, ambiguousCandidates: [] as VoiceCandidateVessel[] };
      }

      // Explicit vesselQuery was provided but did not match anything: do NOT silently fall back to activeReservationId
      return { task: undefined, vessel: undefined, ambiguousCandidates: [] as VoiceCandidateVessel[] };
    }

    // Fallback to currently opened reservation in mobile UI if provided
    if (activeReservationId) {
      const task = context.todayTasks.find((t) => t.reservationId === activeReservationId);
      const vessel = task?.vesselId
        ? context.allVessels.find((v) => v.id === task.vesselId)
        : undefined;
      return { task, vessel };
    }

    // Or if there is exactly 1 task currently in_progress for this operator
    const inProgressTasks = context.todayTasks.filter((t) => t.status === "in_progress");
    if (inProgressTasks.length === 1) {
      const task = inProgressTasks[0];
      const vessel = task.vesselId
        ? context.allVessels.find((v) => v.id === task.vesselId)
        : undefined;
      return { task, vessel };
    }

    return { task: undefined, vessel: undefined };
  };

  const findZone = (zoneQuery?: string | null) => {
    if (!zoneQuery) return undefined;
    const q = zoneQuery.trim().toLowerCase();
    const normCode = zoneQuery.trim().toUpperCase().replace(/\s+/g, "");
    return (
      context.zones.find((z) => z.code.toUpperCase() === normCode) ||
      context.zones.find(
        (z) =>
          z.name.toLowerCase().includes(q) ||
          q.includes(z.code.toLowerCase()) ||
          q.includes(z.name.toLowerCase())
      )
    );
  };

  const findResource = (resourceQuery?: string | null) => {
    if (!resourceQuery) return undefined;
    const q = resourceQuery.trim().toLowerCase();
    return context.activeResources.find(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (q.includes("struj") && r.name.toLowerCase().includes("struj")) ||
        (q.includes("traktor") && r.name.toLowerCase().includes("traktor")) ||
        (q.includes("pump") && r.name.toLowerCase().includes("pump")) ||
        (q.includes("perač") && r.name.toLowerCase().includes("pera"))
    );
  };

  rawActions.forEach((raw, idx) => {
    const actionId = `voice-act-${idx + 1}`;
    const { task, vessel, ambiguousCandidates = [] } = findVesselAndTask(raw.vesselQuery, raw.reservationId);
    const isAmbiguous = ambiguousCandidates.length > 1;
    const zone =
      findZone(raw.zoneQuery) ||
      (task?.zoneId ? context.zones.find((z) => z.id === task.zoneId) : undefined);

    const vesselName = vessel?.name || task?.vesselName || raw.vesselQuery || "Nepoznato plovilo";
    const vesselReg = vessel?.registration || task?.vesselRegistration || null;
    const ownerName = vessel?.ownerName || task?.ownerName || null;
    const ownerPhone = vessel?.ownerPhone || task?.ownerPhone || null;
    const userId = vessel?.ownerId || task?.userId || null;

    if (
      isAmbiguous &&
      raw.type !== "report_stoppage" &&
      raw.type !== "resolve_stoppage"
    ) {
      warnings.push(
        `Pronađeno je više plovila za "${raw.vesselQuery}" (${ambiguousCandidates.map((c) => `${c.vesselName} [${c.vesselRegistration || "—"}]`).join(", ")}). Odaberite točno plovilo prije izvršenja.`
      );
      resolved.push({
        id: actionId,
        type: raw.type,
        title: `Odaberite točno plovilo (${raw.vesselQuery})`,
        description: `Više podudaranja u bazi — dodirnite ispravno plovilo ispod prije potvrde.`,
        confidence: 0.5,
        requiresConfirmation: true,
        needsDisambiguation: true,
        candidateVessels: ambiguousCandidates,
        zoneId: zone?.id || null,
        zoneCode: zone?.code || null,
        zoneName: zone?.name || null,
        spotNumber: raw.spotNumber ?? null,
        durationMin: raw.durationMin || 30,
        operatorNotes: raw.operatorNotes || null,
        messageText: raw.messageText || null,
        serviceItemName: raw.resourceQuery || null,
        quantity: raw.quantity || 1,
        unit: raw.unit || null,
      });
      return;
    }

    if (raw.type === "start_work_order") {
      if (!task) {
        warnings.push(
          `Za plovilo "${vesselName}" nije pronađena današnja zakazana rezervacija za pokretanje radnog naloga.`
        );
        return;
      }
      resolved.push({
        id: actionId,
        type: "start_work_order",
        title: `Pokreni radni nalog (${task.reservationNumber || "REZ"})`,
        description: `Plovilo: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""} · Vlasnik: ${ownerName || "—"}${raw.operatorNotes ? ` · Bilješka: "${raw.operatorNotes}"` : ""}`,
        confidence: raw.confidence ?? 0.9,
        requiresConfirmation: true,
        reservationId: task.reservationId,
        reservationNumber: task.reservationNumber,
        vesselId: task.vesselId,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        operatorNotes: raw.operatorNotes || null,
      });
    } else if (raw.type === "complete_work_order") {
      if (!task) {
        warnings.push(
          `Za plovilo "${vesselName}" nije pronađena aktivna rezervacija za zaključenje naloga.`
        );
        return;
      }
      const matchedRes = findResource(raw.resourceQuery);
      const resList: ProposedVoiceResourceItem[] = matchedRes
        ? [
            {
              resourceId: matchedRes.id,
              code: matchedRes.code,
              name: matchedRes.name,
              quantity: Number(raw.quantity) || 1,
              unit: matchedRes.unit,
              unitPriceEur: matchedRes.pricePerUnitEur,
            },
          ]
        : [];

      resolved.push({
        id: actionId,
        type: "complete_work_order",
        title: `Završi operaciju i zaključi nalog (${task.reservationNumber || "REZ"})`,
        description: `Plovilo: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""} · Trajanje: ${raw.durationMin || 30} min${zone ? ` · Zona: ${zone.name} (${zone.code})${raw.spotNumber ? ` #${raw.spotNumber}` : ""}` : ""}`,
        confidence: raw.confidence ?? 0.9,
        requiresConfirmation: true,
        reservationId: task.reservationId,
        reservationNumber: task.reservationNumber,
        vesselId: task.vesselId,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        zoneId: zone?.id || null,
        zoneCode: zone?.code || null,
        zoneName: zone?.name || null,
        spotNumber: raw.spotNumber ?? null,
        durationMin: raw.durationMin || 30,
        operatorNotes: raw.operatorNotes || null,
        resources: resList,
      });
    } else if (raw.type === "update_work_order_notes") {
      if (!task) {
        warnings.push(`Nije pronađen aktivni nalog za dopunu bilješke (${vesselName}).`);
        return;
      }
      resolved.push({
        id: actionId,
        type: "update_work_order_notes",
        title: `Spremi terensku bilješku na nalog (${task.reservationNumber || "REZ"})`,
        description: `${vesselName}${vesselReg ? ` [${vesselReg}]` : ""}: "${raw.operatorNotes || ""}"`,
        confidence: raw.confidence ?? 0.85,
        requiresConfirmation: true,
        reservationId: task.reservationId,
        reservationNumber: task.reservationNumber,
        vesselId: task.vesselId,
        vesselName,
        vesselRegistration: vesselReg,
        operatorNotes: raw.operatorNotes || "",
      });
    } else if (raw.type === "assign_land_zone") {
      if (!vessel && !task?.vesselId) {
        warnings.push(`Plovilo "${raw.vesselQuery || ""}" nije pronađeno u bazi za smještaj u zonu.`);
        return;
      }
      if (!zone) {
        warnings.push(`Zona "${raw.zoneQuery || ""}" nije prepoznata.`);
        return;
      }
      resolved.push({
        id: actionId,
        type: "assign_land_zone",
        title: `Smjesti plovilo u zonu ${zone.name} (${zone.code})${raw.spotNumber ? ` · Mjesto #${raw.spotNumber}` : ""}`,
        description: `Plovilo: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""} · Vlasnik: ${ownerName || "—"} (${zone.availableSpots} slobodno)`,
        confidence: raw.confidence ?? 0.9,
        requiresConfirmation: true,
        reservationId: task?.reservationId || null,
        vesselId: vessel?.id || task?.vesselId || null,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        zoneId: zone.id,
        zoneCode: zone.code,
        zoneName: zone.name,
        spotNumber: raw.spotNumber ?? null,
        operatorNotes: raw.operatorNotes || "Glasovni unos smještaja na kopnu",
      });
    } else if (raw.type === "add_card_charge") {
      if (!userId) {
        warnings.push(
          `Nije pronađen vlasnik za plovilo "${raw.vesselQuery || "nepoznato"}" — zaduženje kartona nije moguće bez vlasnika.`
        );
        return;
      }
      const matchedRes = findResource(raw.resourceQuery);
      const qty = Number(raw.quantity) || 1;
      const unit = raw.unit || matchedRes?.unit || "dan";
      const itemName = matchedRes
        ? `${matchedRes.name} (${qty} ${unit})`
        : `${raw.resourceQuery || "Dodatna terenska usluga"} (${qty} ${unit})`;
      const itemCode = matchedRes?.code || "TEREN-USLUGA";

      resolved.push({
        id: actionId,
        type: "add_card_charge",
        title: `Zaduži karton korisnika: ${itemName}`,
        description: `Korisnik: ${ownerName || "Član"} · Plovilo: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""}${raw.operatorNotes ? ` · Napomena: "${raw.operatorNotes}"` : ""}`,
        confidence: raw.confidence ?? 0.9,
        requiresConfirmation: true,
        vesselId: vessel?.id || task?.vesselId || null,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        serviceItemCode: itemCode,
        serviceItemName: itemName,
        quantity: qty,
        unit,
        operatorNotes: raw.operatorNotes || null,
      });
    } else if (raw.type === "send_owner_message") {
      if (!userId && !task?.reservationId) {
        warnings.push(
          `Nije pronađen vlasnik za plovilo "${raw.vesselQuery || "nepoznato"}" za slanje obavijesti.`
        );
        return;
      }
      const msgText =
        raw.messageText ||
        `Obavijest iz lučice PŠD Špinut za plovilo ${vesselName} (${vesselReg || ""}): ${raw.operatorNotes || ""}`;

      resolved.push({
        id: actionId,
        type: "send_owner_message",
        title: `Pošalji obavijest vlasniku (${ownerName || "Vlasnik"})`,
        description: `Plovilo: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""}${ownerPhone ? ` · SMS na ${ownerPhone}` : ""} · Poruka: "${msgText}"`,
        confidence: raw.confidence ?? 0.9,
        requiresConfirmation: true,
        reservationId: task?.reservationId || null,
        vesselId: vessel?.id || task?.vesselId || null,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        ownerPhone,
        messageText: msgText,
      });
    } else if (raw.type === "report_stoppage") {
      const reasonLabel =
        raw.stoppageReason === "maintenance"
          ? "Kvar / održavanje"
          : raw.stoppageReason === "high_tide"
            ? "Visoka plima"
            : "Jak vjetar / bura";
      resolved.push({
        id: actionId,
        type: "report_stoppage",
        title: `Prijavi obustavu rada dizalica (${reasonLabel})`,
        description: `Opseg: Sve dizalice · Razlog: ${reasonLabel}${raw.operatorNotes ? ` · "${raw.operatorNotes}"` : ""}`,
        confidence: raw.confidence ?? 0.95,
        requiresConfirmation: true,
        stoppageScope: raw.stoppageScope || "all_cranes",
        stoppageReason: raw.stoppageReason || "wind",
        operatorNotes: raw.operatorNotes || `Glasovna prijava s rive: ${reasonLabel}`,
      });
    } else if (raw.type === "resolve_stoppage") {
      const firstActive = context.activeStoppages[0];
      if (!firstActive) {
        warnings.push("Trenutačno nema aktivnih obustava rada koje bi se mogle ukinuti.");
        return;
      }
      resolved.push({
        id: actionId,
        type: "resolve_stoppage",
        title: `Ukini aktivnu obustavu rada (${firstActive.reason})`,
        description: `Aktivna obustava: ${firstActive.note || firstActive.reason}`,
        confidence: raw.confidence ?? 0.95,
        requiresConfirmation: true,
        stoppageId: firstActive.id,
      });
    } else if (raw.type === "vessel_lookup") {
      if (!vessel && !task) {
        warnings.push(`Plovilo "${raw.vesselQuery || ""}" nije pronađeno u bazi lučice.`);
        return;
      }
      const locationInfo = vessel?.currentZoneCode
        ? `Na kopnu: ${vessel.currentZoneName} (${vessel.currentZoneCode})${vessel.currentSpotNumber ? `, mjesto #${vessel.currentSpotNumber}` : ""}`
        : "Nema evidentiranog boravka na kopnu";
      resolved.push({
        id: actionId,
        type: "vessel_lookup",
        title: `Info o plovilu: ${vesselName}${vesselReg ? ` [${vesselReg}]` : ""}`,
        description: `Vlasnik: ${ownerName || "—"} · Tel: ${ownerPhone || "nema broja"} · Lokacija: ${locationInfo}${vessel?.lengthM ? ` · Dužina: ${vessel.lengthM}m` : ""}`,
        confidence: 1.0,
        requiresConfirmation: false,
        vesselId: vessel?.id || task?.vesselId || null,
        vesselName,
        vesselRegistration: vesselReg,
        userId,
        ownerName,
        ownerPhone,
        zoneCode: vessel?.currentZoneCode || null,
        zoneName: vessel?.currentZoneName || null,
        spotNumber: vessel?.currentSpotNumber ?? null,
      });
    }
  });

  return { actions: resolved, warnings };
}

/**
 * Main entry point to interpret a voice command (audio and/or transcript) from a mobile operator.
 */
export async function interpretVoiceCommand(params: {
  operatorId: string;
  operatorRole: string;
  transcript?: string;
  audioBase64?: string;
  audioMimeType?: string;
  activeReservationId?: string | null;
  dateStr?: string;
}): Promise<VoiceInterpretResult> {
  const {
    operatorId,
    operatorRole,
    transcript,
    audioBase64,
    audioMimeType,
    activeReservationId,
    dateStr,
  } = params;

  const context = await loadVoiceContextSnapshot(operatorId, operatorRole, dateStr);
  const modelToUse = ENV.geminiVoiceModel || ENV.geminiModel || "gemini-3.5-flash-lite";

  const systemPrompt = `Ti si specijalizirani AI glasovni asistent za mornare i operatere dizalica u športskoj lučici PŠD Špinut (Split).
Tvoj zadatak je poslušati audio zapis i/ili pročitati transkript s terena te ga pretvoriti u strukturirane akcije u ERP sustavu lučice.
Uvijek odgovaraj isključivo valjanim JSON-om prema zadanoj shemi na hrvatskom jeziku.

PRAVILA:
1. Ako mornar spominje registraciju (npr. "ST 12 34", "ST-4253", "brod Balerina"), upiši je u polje "vesselQuery" u standardnom obliku (npr. "ST-1234" ili "BALERINA").
2. Jedna rečenica može sadržavati VIŠE akcija odjednom! Primjer:
   "Brod ST-1234, pukao mu je krmeni konop na gatu B, spojili smo ga privremeno na struju 2 dana, treba javiti vlasniku"
   -> Kreiraj 2 akcije u "rawActions":
   a) "add_card_charge" (vesselQuery: "ST-1234", resourceQuery: "struja", quantity: 2, unit: "dan", operatorNotes: "Privremeni priključak struje 2 dana - pukao krmeni konop")
   b) "send_owner_message" (vesselQuery: "ST-1234", messageText: "Poštovani, prilikom obilaska uočeno je da je na Vašem plovilu ST-1234 pukao krmeni konop. Plovilo je osigurano i privremeno spojeno na struju (2 dana). Molimo Vas da provjerite vez.")
3. Za pokretanje naloga koristi "start_work_order", za završetak operacije "complete_work_order" (uz durationMin, zoneQuery, spotNumber ako su spomenuti).
4. Za smještaj ili premještaj na suhi vez koristi "assign_land_zone".
5. Za obustavu rada zbog bure/vjetra ili kvara koristi "report_stoppage", a za prekid obustave "resolve_stoppage".
6. Za pitanja ("gdje je brod...", "koji je broj mobitela vlasnika...") koristi "vessel_lookup".`;

  const compactContext = {
    date: context.dateStr,
    activeReservationId: activeReservationId || null,
    todayTasks: context.todayTasks.map((t) => ({
      reservationId: t.reservationId,
      reservationNumber: t.reservationNumber,
      status: t.status,
      vesselName: t.vesselName,
      vesselRegistration: t.vesselRegistration,
      ownerName: t.ownerName,
      zoneCode: t.zoneCode,
    })),
    zones: context.zones.map((z) => ({ code: z.code, name: z.name, free: z.availableSpots })),
    resources: context.activeResources.map((r) => ({ code: r.code, name: r.name, unit: r.unit })),
    activeStoppagesCount: context.activeStoppages.length,
  };

  const userPrompt = `KONTEKST SMJENE (${context.dateStr}):
${JSON.stringify(compactContext)}

${transcript ? `PREPOZNATI TEKST / BILJEŠKA MORNARA: "${transcript}"` : "Analiziraj priloženi audio zapis mornara i izvuci sve akcije."}`;

  let rawResult: {
    transcript: string;
    spokenResponse: string;
    warnings?: string[];
    rawActions: any[];
  };
  let usedModelLabel = modelToUse;

  try {
    rawResult = await callGeminiForVoicePlan({
      model: modelToUse,
      systemPrompt,
      userPrompt,
      audioBase64,
      audioMimeType,
    });
  } catch (err: any) {
    if (transcript && transcript.trim().length > 0) {
      rawResult = parseVoiceTranscriptLocally(transcript, context);
      usedModelLabel = `${modelToUse} (lokalni parser)`;
    } else {
      throw new Error(
        err?.message === "NO_LLM_API_KEY"
          ? "GEMINI_API_KEY nije postavljen u .env datoteci. Unesite GEMINI_API_KEY ili koristite glasovno prepoznavanje preglednika."
          : err?.message || "Greška pri obradi glasovne naredbe."
      );
    }
  }

  const { actions, warnings } = resolveVoiceActionsAgainstContext(
    rawResult.rawActions || [],
    context,
    activeReservationId
  );

  // Enhance spoken response for vessel_lookup so the phone reads the exact answer aloud
  let finalSpoken = rawResult.spokenResponse;
  const lookupAct = actions.find((a) => a.type === "vessel_lookup");
  if (lookupAct) {
    finalSpoken = `${lookupAct.title}. ${lookupAct.description}`;
  }

  const requestId = randomUUID();
  pendingVoicePlans.set(`${operatorId}:${requestId}`, {
    expiresAt: Date.now() + 30 * 60 * 1000,
    actions,
  });

  return {
    requestId,
    modelUsed: usedModelLabel,
    transcript: rawResult.transcript || transcript || "",
    spokenResponse: finalSpoken,
    actions,
    warnings: [...(rawResult.warnings || []), ...warnings],
  };
}

// Server-side short-lived store of interpreted voice plans (prevents trusting tampered client payloads)
const pendingVoicePlans = new Map<
  string,
  { expiresAt: number; actions: ProposedVoiceAction[] }
>();

// Per-action execution idempotency cache (planId:actionId -> result)
const executedVoiceActionCache = new Map<
  string,
  {
    expiresAt: number;
    result: { id: string; type: VoiceActionType; success: boolean; message: string };
  }
>();

// In-memory TTL cache for whole-request voice execution idempotency
const executedVoiceRequestCache = new Map<
  string,
  {
    expiresAt: number;
    response: {
      executedCount: number;
      alreadyExecuted?: boolean;
      results: Array<{ id: string; type: VoiceActionType; success: boolean; message: string }>;
    };
  }
>();

/**
 * Executes a list of operator-confirmed voice actions atomically and logs them in audit_log.
 */
export async function executeConfirmedVoiceActions(params: {
  operatorId: string;
  operatorName?: string | null;
  actions: ProposedVoiceAction[];
  idempotencyKey?: string;
}): Promise<{
  executedCount: number;
  alreadyExecuted?: boolean;
  results: Array<{ id: string; type: VoiceActionType; success: boolean; message: string }>;
}> {
  const { operatorId, actions, idempotencyKey } = params;

  const now = Date.now();
  pendingVoicePlans.forEach((v, k) => {
    if (v.expiresAt < now) pendingVoicePlans.delete(k);
  });
  executedVoiceActionCache.forEach((v, k) => {
    if (v.expiresAt < now) executedVoiceActionCache.delete(k);
  });
  executedVoiceRequestCache.forEach((v, k) => {
    if (v.expiresAt < now) executedVoiceRequestCache.delete(k);
  });

  if (idempotencyKey) {
    const cached = executedVoiceRequestCache.get(`${operatorId}:${idempotencyKey}`);
    if (cached) {
      return { ...cached.response, alreadyExecuted: true };
    }
  }

  // If a server-side plan exists for this idempotencyKey (requestId), resolve authoritative actions from it
  const serverPlan = idempotencyKey ? pendingVoicePlans.get(`${operatorId}:${idempotencyKey}`) : undefined;
  const authoritativeActions: ProposedVoiceAction[] = serverPlan
    ? actions.map((clientAct) => {
        const planAct = serverPlan.actions.find((p) => p.id === clientAct.id);
        if (!planAct) return clientAct;
        // Only allow client to resolve disambiguation from server-provided candidateVessels
        if (planAct.needsDisambiguation && clientAct.vesselId && planAct.candidateVessels) {
          const picked = planAct.candidateVessels.find((c) => c.vesselId === clientAct.vesselId);
          if (picked) {
            return {
              ...planAct,
              needsDisambiguation: false,
              vesselId: picked.vesselId,
              vesselName: picked.vesselName,
              vesselRegistration: picked.vesselRegistration,
              userId: picked.userId,
              ownerName: picked.ownerName,
              ownerPhone: picked.ownerPhone,
              reservationId: picked.reservationId || null,
            };
          }
        }
        return planAct;
      })
    : actions;

  const db = await getDb();
  if (!db) throw new Error("Baza podataka nije dostupna.");

  const results: Array<{ id: string; type: VoiceActionType; success: boolean; message: string }> = [];

  for (const action of authoritativeActions) {
    const actionKey = idempotencyKey ? `${operatorId}:${idempotencyKey}:${action.id}` : null;
    if (actionKey) {
      const prevAction = executedVoiceActionCache.get(actionKey);
      if (prevAction && prevAction.result.success) {
        results.push(prevAction.result);
        continue;
      }
    }
    try {
      if (action.needsDisambiguation) {
        throw new Error("Potrebno je prvo odabrati točno plovilo između više kandidata.");
      }
      if (action.type === "start_work_order") {
        if (!action.reservationId) throw new Error("Nedostaje ID rezervacije.");
        const res = await startReservationWorkOrder({
          reservationId: action.reservationId,
          operatorId,
          operatorNotes: action.operatorNotes || undefined,
          auditAction: "mobile_voice_work_order_started",
        });
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: `Pokrenut radni nalog ${res.workOrder.orderNumber}`,
        });
      } else if (action.type === "complete_work_order") {
        if (!action.reservationId) throw new Error("Nedostaje ID rezervacije.");
        const res = await completeReservationOperation({
          reservationId: action.reservationId,
          operatorId,
          actualDurationMin: Number(action.durationMin) || 30,
          operatorNotes: action.operatorNotes || undefined,
          zoneId: action.zoneId || undefined,
          spotNumber: action.spotNumber ? Number(action.spotNumber) : undefined,
          resources: action.resources?.map((r) => ({
            resourceId: r.resourceId,
            quantity: r.quantity,
          })),
        });
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: `Zaključen radni nalog ${res.workOrder?.orderNumber || ""}`,
        });
      } else if (action.type === "update_work_order_notes") {
        if (!action.reservationId) throw new Error("Nedostaje ID rezervacije.");
        const [wo] = await db
          .select()
          .from(workOrders)
          .where(
            and(
              eq(workOrders.reservationId, action.reservationId),
              ne(workOrders.status, "cancelled")
            )
          )
          .orderBy(desc(workOrders.createdAt))
          .limit(1);

        if (wo) {
          const mergedNote = wo.operatorNotes
            ? `${wo.operatorNotes}\n[Glasovni zapis]: ${action.operatorNotes || ""}`
            : `[Glasovni zapis]: ${action.operatorNotes || ""}`;
          await db
            .update(workOrders)
            .set({ operatorNotes: mergedNote, updatedAt: new Date() })
            .where(eq(workOrders.id, wo.id));
        } else {
          await db
            .update(reservations)
            .set({
              adminNote: `[Glasovni zapis]: ${action.operatorNotes || ""}`,
              updatedAt: new Date(),
            })
            .where(eq(reservations.id, action.reservationId));
        }
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: "Spremljena terenska bilješka",
        });
      } else if (action.type === "assign_land_zone") {
        if (!action.vesselId || !action.zoneId) {
          throw new Error("Nedostaje plovilo ili zona za smještaj.");
        }
        const moveOutcome = await db.transaction(async (tx) => {
          const [vessel] = await tx
            .select()
            .from(vessels)
            .where(eq(vessels.id, action.vesselId!))
            .limit(1);
          if (!vessel) throw new Error("Plovilo nije pronađeno.");

          const spotNum = action.spotNumber ? Number(action.spotNumber) : null;
          const [activeOcc] = await tx
            .select()
            .from(landOccupancies)
            .where(
              and(
                eq(landOccupancies.vesselId, action.vesselId!),
                isNull(landOccupancies.returnedAt)
              )
            )
            .for("update")
            .limit(1);

          const resolvedSpotId = await resolveCanonicalSpotTx(
            tx,
            action.zoneId!,
            spotNum,
            activeOcc?.id
          );

          if (activeOcc) {
            // Preserve original liftedAt and stay identity when relocating an already-landed vessel
            const moveNote = action.operatorNotes
              ? `${activeOcc.note ? `${activeOcc.note} | ` : ""}[Glasovni premještaj]: ${action.operatorNotes}`
              : activeOcc.note;
            await tx
              .update(landOccupancies)
              .set({
                zoneId: action.zoneId!,
                spotNumber: spotNum,
                spotId: resolvedSpotId,
                note: moveNote,
                updatedAt: new Date(),
              })
              .where(eq(landOccupancies.id, activeOcc.id));

            await createAuditEntry(
              {
                actorId: operatorId,
                action: "mobile_voice_vessel_relocated",
                entityType: "land_occupancy",
                entityId: activeOcc.id,
                payload: {
                  vesselId: vessel.id,
                  fromZoneId: activeOcc.zoneId,
                  toZoneId: action.zoneId,
                  spotNumber: spotNum,
                  preservedLiftedAt: activeOcc.liftedAt,
                },
              },
              tx
            );
            return { vesselName: vessel.name, relocated: true };
          }

          const [inserted] = await tx
            .insert(landOccupancies)
            .values({
              vesselId: action.vesselId!,
              userId: vessel.ownerId,
              zoneId: action.zoneId!,
              spotNumber: spotNum,
              spotId: resolvedSpotId,
              reservationId: action.reservationId || null,
              liftedAt: new Date(),
              note: action.operatorNotes || "Glasovni unos smještaja putem mobilne aplikacije",
              createdBy: operatorId,
            })
            .returning({ id: landOccupancies.id });

          await createAuditEntry(
            {
              actorId: operatorId,
              action: "mobile_voice_land_occupancy_created",
              entityType: "land_occupancy",
              entityId: inserted?.id,
              payload: { vesselId: vessel.id, zoneId: action.zoneId, spotNumber: spotNum },
            },
            tx
          );
          return { vesselName: vessel.name, relocated: false };
        });

        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: moveOutcome.relocated
            ? `Plovilo ${moveOutcome.vesselName} premješteno u zonu ${action.zoneCode || ""} (zadržan izvorni dolazak)`
            : `Plovilo ${moveOutcome.vesselName} smješteno u zonu ${action.zoneCode || ""}`,
        });
      } else if (action.type === "add_card_charge") {
        if (!action.userId) throw new Error("Nedostaje ID vlasnika plovila.");
        await db.insert(userCardEntries).values({
          userId: action.userId,
          entryType: "commercial_service",
          serviceItemCode: action.serviceItemCode || "TEREN-USLUGA",
          serviceItemName: action.serviceItemName || "Terenska usluga",
          vesselName: action.vesselName || null,
          vesselRegistration: action.vesselRegistration || null,
          eventDate: new Date(),
          note: action.operatorNotes || "Glasovni terenski zapisnik mornara",
          erpStatus: "pending",
        });

        await createAuditEntry({
          actorId: operatorId,
          action: "mobile_voice_card_charge_added",
          entityType: "user_card_entries",
          entityId: action.userId,
          payload: {
            vesselRegistration: action.vesselRegistration,
            serviceItemName: action.serviceItemName,
            quantity: action.quantity,
            unit: action.unit,
          },
        });

        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: `Dodano zaduženje na karton: ${action.serviceItemName}`,
        });
      } else if (action.type === "send_owner_message") {
        const msgBody = (action.messageText || "").trim();
        if (!msgBody) throw new Error("Prazan tekst obavijesti.");

        const deliveredChannels: string[] = [];

        if (action.reservationId) {
          await db.insert(messages).values({
            reservationId: action.reservationId,
            senderId: operatorId,
            body: msgBody,
            isRead: false,
          });
          deliveredChannels.push("in-app");
        }

        if (action.userId) {
          const [owner] = await db
            .select()
            .from(users)
            .where(eq(users.id, action.userId))
            .limit(1);

          if (!owner) {
            throw new Error("Vlasnik plovila nije pronađen u bazi.");
          }

          if (owner.email) {
            try {
              await sendNewMessageNotification({
                to: owner.email,
                userName: owner.name || owner.firstName || "Korisnik",
                reservationNumber: action.reservationNumber || action.vesselRegistration || "TEREN",
                messageBody: msgBody,
                lang: "hr",
              });
              deliveredChannels.push("email");
            } catch (err: any) {
              console.warn("[Voice Email] Failed:", err?.message || err);
            }
          }

          if (owner.phone) {
            try {
              const smsText = `PŠD ŠPINUT (${action.vesselRegistration || action.vesselName || "Obavijest"}): ${msgBody}`;
              const smsOk = await sendSms(owner.phone, smsText);
              if (smsOk !== false) deliveredChannels.push("sms");
            } catch (err: any) {
              console.warn("[Voice SMS] Failed:", err?.message || err);
            }
          }
        }

        if (deliveredChannels.length === 0) {
          throw new Error("Vlasnik nema evidentiran e-mail ni broj mobitela za slanje obavijesti.");
        }

        await createAuditEntry({
          actorId: operatorId,
          action: "mobile_voice_owner_notified",
          entityType: "users",
          entityId: action.userId || action.reservationId || "unknown",
          payload: {
            vesselRegistration: action.vesselRegistration,
            messageText: msgBody,
            deliveredChannels,
          },
        });

        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: `Poslana obavijest vlasniku (${action.ownerName || "vlasnik"}) putem: ${deliveredChannels.join(", ")}`,
        });
      } else if (action.type === "report_stoppage") {
        const stoppage = await landDispatchService.createWorkStoppage({
          scope: action.stoppageScope || "all_cranes",
          craneId: action.craneId || null,
          zoneId: action.zoneId || null,
          startsAtIso: new Date().toISOString(),
          endsAtIso: null,
          reason: action.stoppageReason || "wind",
          note: action.operatorNotes || "Glasovna prijava obustave rada s rive",
          createdBy: operatorId,
        });
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: `Aktivirana obustava rada (${stoppage.reason})`,
        });
      } else if (action.type === "resolve_stoppage") {
        if (!action.stoppageId) throw new Error("Nema ID-a obustave za ukidanje.");
        await landDispatchService.cancelWorkStoppage(action.stoppageId);
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: "Obustava rada je ukinuta",
        });
      } else if (action.type === "vessel_lookup") {
        results.push({
          id: action.id,
          type: action.type,
          success: true,
          message: action.description,
        });
      }
      if (actionKey && results.length > 0) {
        const lastRes = results[results.length - 1];
        if (lastRes.id === action.id && lastRes.success) {
          executedVoiceActionCache.set(actionKey, {
            expiresAt: Date.now() + 15 * 60 * 1000,
            result: lastRes,
          });
        }
      }
    } catch (err: any) {
      results.push({
        id: action.id,
        type: action.type,
        success: false,
        message: err?.message || "Greška pri izvršavanju akcije.",
      });
    }
  }

  const response = {
    executedCount: results.filter((r) => r.success).length,
    results,
  };

  if (idempotencyKey && response.executedCount > 0) {
    executedVoiceRequestCache.set(`${operatorId}:${idempotencyKey}`, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      response,
    });
  }

  return response;
}
