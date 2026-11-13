import { describe, it, expect, vi } from "vitest";
import * as dbModule from "./db";
import {
  normalizeRegString,
  normalizeAudioPayload,
  parseVoiceTranscriptLocally,
  resolveVoiceActionsAgainstContext,
  executeConfirmedVoiceActions,
  type VoiceContextSnapshot,
} from "./services/voiceCommandService";
import { ENV } from "./_core/env";

const mockContext: VoiceContextSnapshot = {
  dateStr: "2026-11-13",
  todayTasks: [
    {
      reservationId: "res-balerina-1",
      reservationNumber: "REZ-26-YPHS",
      status: "in_progress",
      vesselId: "vessel-balerina",
      vesselName: "BALERINA",
      vesselRegistration: "ST-4253",
      userId: "user-pelivan",
      ownerName: "Ivo Pelivan",
      ownerPhone: "+385911234567",
      craneId: "crane-9t",
      craneName: "DIZALICA 9 T",
      zoneId: "zone-a3",
      zoneCode: "A3",
      serviceCategory: "lift_out",
    },
  ],
  allVessels: [
    {
      id: "vessel-balerina",
      name: "BALERINA",
      registration: "ST-4253",
      lengthM: "7.15",
      ownerId: "user-pelivan",
      ownerName: "Ivo Pelivan",
      ownerPhone: "+385911234567",
      currentZoneCode: "A3",
      currentZoneName: "Arla 3",
      currentSpotNumber: 12,
    },
    {
      id: "vessel-st1234",
      name: "ADRIATIC STAR",
      registration: "ST-1234",
      lengthM: "9.40",
      ownerId: "user-maric",
      ownerName: "Marko Marić",
      ownerPhone: "+385987654321",
      currentZoneCode: null,
      currentZoneName: null,
      currentSpotNumber: null,
    },
  ],
  zones: [
    { id: "zone-a1", code: "A1", name: "Arla 1", availableSpots: 8 },
    { id: "zone-a2", code: "A2", name: "Arla 2", availableSpots: 10 },
    { id: "zone-a3", code: "A3", name: "Arla 3", availableSpots: 19 },
    { id: "zone-sz", code: "SZ", name: "Servisna zona", availableSpots: 4 },
  ],
  activeResources: [
    {
      id: "res-elec",
      code: "STRUJA-DAN",
      name: "Priključak struje",
      unit: "dan",
      pricePerUnitEur: 10,
    },
    {
      id: "res-washer",
      code: "PERAC-SAT",
      name: "Visokotlačni perač",
      unit: "sat",
      pricePerUnitEur: 15,
    },
  ],
  cranes: [
    { id: "crane-9t", name: "DIZALICA 9 T" },
    { id: "crane-50t", name: "Travelift 50T" },
  ],
  activeStoppages: [
    {
      id: "stop-1",
      scope: "all_cranes",
      reason: "wind",
      note: "Jaka bura na rivi",
    },
  ],
};

describe("Voice Command Service & Gemini Model Configuration", () => {
  it("defaults ENV.geminiVoiceModel to gemini-3.5-flash-lite and never uses deprecated 2.5 models", () => {
    expect(ENV.geminiVoiceModel).toBeTruthy();
    expect(ENV.geminiVoiceModel).not.toContain("2.5");
    expect(ENV.geminiModel).not.toContain("2.5");
  });

  it("normalizes spoken Croatian vessel registrations accurately", () => {
    expect(normalizeRegString("st 42 53")).toBe("ST4253");
    expect(normalizeRegString("ST-4253")).toBe("ST4253");
    expect(normalizeRegString("ŠI - 987")).toBe("ŠI987");
  });

  it("parses sailor field log into multiple ERP actions (card charge + owner notification)", () => {
    const note =
      "Brod ST-1234, pukao mu je krmeni konop na gatu B, spojili smo ga privremeno na struju ormarić 4, treba javiti vlasniku i naplatiti 2 dana struje.";

    const parsed = parseVoiceTranscriptLocally(note, mockContext);
    const { actions, warnings } = resolveVoiceActionsAgainstContext(parsed.rawActions, mockContext);

    expect(warnings).toHaveLength(0);
    expect(actions.length).toBe(2);

    const chargeAction = actions.find((a) => a.type === "add_card_charge");
    expect(chargeAction).toBeDefined();
    expect(chargeAction?.vesselId).toBe("vessel-st1234");
    expect(chargeAction?.userId).toBe("user-maric");
    expect(chargeAction?.quantity).toBe(2);
    expect(chargeAction?.serviceItemCode).toBe("STRUJA-DAN");

    const msgAction = actions.find((a) => a.type === "send_owner_message");
    expect(msgAction).toBeDefined();
    expect(msgAction?.vesselId).toBe("vessel-st1234");
    expect(msgAction?.ownerPhone).toBe("+385987654321");
  });

  it("parses work order completion with spoken registration, duration, zone and spot number", () => {
    const command =
      "Završi dizanje za Balerina ST 42 53, trajalo je 45 minuta, smješten u zonu Arla 3 mjesto 12";

    const parsed = parseVoiceTranscriptLocally(command, mockContext);
    const { actions, warnings } = resolveVoiceActionsAgainstContext(parsed.rawActions, mockContext);

    expect(warnings).toHaveLength(0);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("complete_work_order");
    expect(actions[0].reservationId).toBe("res-balerina-1");
    expect(actions[0].durationMin).toBe(45);
    expect(actions[0].zoneCode).toBe("A3");
    expect(actions[0].spotNumber).toBe(12);
  });

  it("parses weather stoppage voice commands", () => {
    const command = "Obustavi rad svih dizalica zbog jake bure na rivi";
    const parsed = parseVoiceTranscriptLocally(command, mockContext);
    const { actions } = resolveVoiceActionsAgainstContext(parsed.rawActions, mockContext);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("report_stoppage");
    expect(actions[0].stoppageReason).toBe("wind");
    expect(actions[0].stoppageScope).toBe("all_cranes");
  });

  it("parses vessel location and owner phone lookup questions", () => {
    const command = "Gdje je brod ST-4253 i koji je broj mobitela vlasnika?";
    const parsed = parseVoiceTranscriptLocally(command, mockContext);
    const { actions } = resolveVoiceActionsAgainstContext(parsed.rawActions, mockContext);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("vessel_lookup");
    expect(actions[0].vesselName).toBe("BALERINA");
    expect(actions[0].ownerPhone).toBe("+385911234567");
    expect(actions[0].zoneCode).toBe("A3");
  });

  it("flags ambiguity and returns candidate vessels when multiple owners/vessels match", () => {
    const contextWithBrothers: VoiceContextSnapshot = {
      ...mockContext,
      allVessels: [
        ...mockContext.allVessels,
        {
          id: "v-martin",
          name: "MORE 1",
          registration: "ST-240008",
          lengthM: "6.50",
          ownerId: "u-martin",
          ownerName: "Martin Drinković",
          ownerPhone: "+385911111111",
          currentZoneCode: null,
          currentZoneName: null,
          currentSpotNumber: null,
        },
        {
          id: "v-ivan",
          name: "MORE 2",
          registration: "ST-247206",
          lengthM: "7.00",
          ownerId: "u-ivan",
          ownerName: "Ivan Drinković",
          ownerPhone: "+385922222222",
          currentZoneCode: "A1",
          currentZoneName: "Arla 1",
          currentSpotNumber: 4,
        },
      ],
    };

    const { actions, warnings } = resolveVoiceActionsAgainstContext(
      [{ type: "add_card_charge", vesselQuery: "Drinković", resourceQuery: "struja", quantity: 2 }],
      contextWithBrothers
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].needsDisambiguation).toBe(true);
    expect(actions[0].candidateVessels).toHaveLength(2);
    expect(warnings.some((w) => w.includes("više plovila"))).toBe(true);
  });

  it("does not fall back to activeReservationId when explicit vesselQuery matches nothing (G-15)", () => {
    const { actions, warnings } = resolveVoiceActionsAgainstContext(
      [{ type: "add_card_charge", vesselQuery: "NEPOSTOJECI-999", resourceQuery: "struja", quantity: 1 }],
      mockContext,
      "res-balerina-1"
    );

    expect(actions).toHaveLength(0);
    expect(warnings.some((w) => w.includes("NEPOSTOJECI-999"))).toBe(true);
  });

  it("reports 'Nema evidentiranog boravka na kopnu' instead of 'U moru' when vessel has no active land occupancy (G-25)", () => {
    const contextNoLand: VoiceContextSnapshot = {
      ...mockContext,
      allVessels: [
        {
          id: "v-martin",
          name: "MORE 1",
          registration: "ST-240008",
          lengthM: "6.50",
          ownerId: "u-martin",
          ownerName: "Martin Drinković",
          ownerPhone: "+385911111111",
          currentZoneCode: null,
          currentZoneName: null,
          currentSpotNumber: null,
        },
      ],
    };

    const { actions } = resolveVoiceActionsAgainstContext(
      [{ type: "vessel_lookup", vesselQuery: "ST-240008" }],
      contextNoLand
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("vessel_lookup");
    expect(actions[0].description).toContain("Nema evidentiranog boravka na kopnu");
    expect(actions[0].description).not.toContain("U moru");
  });

  it("refuses to execute actions that still require disambiguation (G-11)", async () => {
    const dbSpy = vi.spyOn(dbModule, "getDb").mockResolvedValueOnce({} as any);
    try {
      const res = await executeConfirmedVoiceActions({
        operatorId: "op-test",
        actions: [
          {
            id: "act-1",
            type: "add_card_charge",
            title: "Naplata struje",
            description: "Naplata struje",
            requiresConfirmation: true,
            needsDisambiguation: true,
            confidence: 0.5,
          },
        ],
      });

      expect(res.results).toHaveLength(1);
      expect(res.results[0].success).toBe(false);
      expect(res.results[0].message).toContain("odabrati točno plovilo");
    } finally {
      dbSpy.mockRestore();
    }
  });

  it("strips codec-parameterized data URL prefixes and normalizes MIME type for Gemini audio input", () => {
    const webm = normalizeAudioPayload(
      "data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQ==",
      "audio/webm;codecs=opus"
    );
    expect(webm).toEqual({
      base64: "GkXfo59ChoEBQveBAULygQ==",
      mimeType: "audio/webm",
    });

    const mp4 = normalizeAudioPayload("data:audio/mp4;codecs=mp4a.40.2;base64,AAAA\nBBBB");
    expect(mp4).toEqual({
      base64: "AAAABBBB",
      mimeType: "audio/mp4",
    });

    expect(normalizeAudioPayload("data:audio/webm;base64,   ")).toBeNull();
  });
});
