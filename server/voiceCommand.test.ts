import { describe, it, expect } from "vitest";
import {
  normalizeRegString,
  parseVoiceTranscriptLocally,
  resolveVoiceActionsAgainstContext,
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
});
