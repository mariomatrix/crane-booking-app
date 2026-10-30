import { TRPCError } from "@trpc/server";
import { toZagreb, fromZagreb } from "@shared/timezone";
import { isHoliday, getActiveSeason } from "../db";
import { validateReservationConstraintsAndOverrides } from "../landDispatch/feasibility";

export { validateReservationConstraintsAndOverrides };

export function parseHHMM(timeStr: string): { h: number; m: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { h: h ?? 8, m: m ?? 0 };
}

/**
 * Validates that a scheduled slot [startDate, endDate] falls on a working day,
 * within active season working hours, and starts/ends on a 30-minute boundary.
 */
export async function validateSlotAgainstSettings(
  startDate: Date,
  endDate: Date,
  sysSettings: Record<string, string>
) {
  const zgStart = toZagreb(startDate);
  const zgEnd = toZagreb(endDate);
  const zgNow = toZagreb(new Date());

  // 1. Past date check (compare against start of today in Zagreb)
  const startOfToday = fromZagreb(zgNow.dateStr, "00:00");
  if (startDate < startOfToday) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Rezervaciju nije moguće ugovoriti ili odobriti za datum u prošlosti. Najraniji datum je današnji dan.",
    });
  }

  // 2. Active Season & Working Hours check
  const dateStr = zgStart.dateStr;

  const dateIsHoliday = await isHoliday(dateStr);
  if (dateIsHoliday) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Odabrani datum je praznik ili neradni dan.",
    });
  }

  const activeSeason = await getActiveSeason(dateStr);
  if (!activeSeason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Odabrani datum je izvan sezone rada.",
    });
  }

  let workStartStr = sysSettings.workdayStart ?? "08:00";
  let workEndStr = sysSettings.workdayEnd ?? "18:00";

  if (
    activeSeason?.workingHours &&
    typeof activeSeason.workingHours === "object"
  ) {
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[zgStart.dayOfWeek];
    const dayHours = (activeSeason.workingHours as any)?.[dayKey];
    if (
      !dayHours?.from ||
      !dayHours?.to ||
      dayHours.from.trim() === "" ||
      dayHours.to.trim() === ""
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Odabrani dan nije radni dan prema rasporedu radnog vremena sezone.",
      });
    }
    workStartStr = dayHours.from;
    workEndStr = dayHours.to;
  }

  const { h: wsH, m: wsM } = parseHHMM(workStartStr);
  const { h: weH, m: weM } = parseHHMM(workEndStr);

  const startH = zgStart.hours * 60 + zgStart.minutes;
  const endH = zgEnd.hours * 60 + zgEnd.minutes;
  const workStart = wsH * 60 + wsM;
  const workEnd = weH * 60 + weM;

  if (startH < workStart || endH > workEnd) {
    const startFormatted = zgStart.timeStr;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Odabrani termin (${startFormatted}) je izvan radnog vremena za taj dan (${workStartStr} - ${workEndStr}).`,
    });
  }

  // Strictly 30-minute interval slots (XX:00 or XX:30)
  if (zgStart.minutes % 30 !== 0 || zgStart.seconds !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Termini moraju početi na svakih 30 minuta (npr. 08:00 ili 08:30).",
    });
  }

  // Duration must be a multiple of 30 minutes (minimum 30 min)
  const durationMin = (endDate.getTime() - startDate.getTime()) / 60000;
  if (durationMin < 30 || durationMin % 30 !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Trajanje mora biti najmanje 30 minuta i višekratnik od 30 minuta (30, 60, 90 min...).",
    });
  }

  return { bufferMin: 0 };
}
