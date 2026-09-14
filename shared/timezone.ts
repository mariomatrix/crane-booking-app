/**
 * Timezone utilities for Croatia / Europe/Zagreb.
 *
 * Croatia observes Central European Time (CET, UTC+1) in winter
 * and Central European Summer Time (CEST, UTC+2) in summer.
 *
 * Using Intl.DateTimeFormat guarantees correct timezone calculation
 * on any platform (Linux/Docker/Windows/macOS/Browsers) regardless
 * of the host machine's system timezone.
 */

export const APP_TIMEZONE = "Europe/Zagreb";

export interface ZagrebDateTimeParts {
  year: number;
  month: number; // 1 - 12
  day: number; // 1 - 31
  hours: number; // 0 - 23
  minutes: number; // 0 - 59
  seconds: number; // 0 - 59
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
}

const zagrebFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const dayOfWeekMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Deconstructs any Date/timestamp into its components in Europe/Zagreb timezone.
 */
export function toZagreb(dateInput: Date | string | number): ZagrebDateTimeParts {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date passed to toZagreb: ${dateInput}`);
  }

  const parts: Record<string, string> = {};
  for (const p of zagrebFormatter.formatToParts(date)) {
    parts[p.type] = p.value;
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hours = Number(parts.hour);
  const minutes = Number(parts.minute);
  const seconds = Number(parts.second);
  const dayOfWeek = dayOfWeekMap[parts.weekday] ?? date.getUTCDay();

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const timeStr = `${parts.hour}:${parts.minute}`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    dayOfWeek,
    dateStr,
    timeStr,
  };
}

/**
 * Creates a standard UTC JavaScript Date from a date string (YYYY-MM-DD)
 * and time string (HH:mm) interpreted strictly in Europe/Zagreb local time.
 */
export function fromZagreb(dateStr: string, timeStr = "00:00"): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);

  // Approximate UTC instant assuming naive UTC
  const naiveIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`;
  const approx = new Date(naiveIso);

  // Determine actual local time in Zagreb for this approximate instant
  const zgParts = toZagreb(approx);
  const localAsUtc = new Date(
    `${zgParts.year}-${String(zgParts.month).padStart(2, "0")}-${String(zgParts.day).padStart(2, "0")}T${String(zgParts.hours).padStart(2, "0")}:${String(zgParts.minutes).padStart(2, "0")}:${String(zgParts.seconds).padStart(2, "0")}.000Z`
  );

  const diffMs = localAsUtc.getTime() - approx.getTime();
  const adjusted = new Date(approx.getTime() - diffMs);

  // Verify and correct for any potential DST boundary iteration
  const checkParts = toZagreb(adjusted);
  if (checkParts.hours !== hh || checkParts.minutes !== mm || checkParts.dateStr !== dateStr) {
    const secondLocalAsUtc = new Date(
      `${checkParts.year}-${String(checkParts.month).padStart(2, "0")}-${String(checkParts.day).padStart(2, "0")}T${String(checkParts.hours).padStart(2, "0")}:${String(checkParts.minutes).padStart(2, "0")}:${String(checkParts.seconds).padStart(2, "0")}.000Z`
    );
    const secondDiff = secondLocalAsUtc.getTime() - approx.getTime();
    return new Date(approx.getTime() - secondDiff);
  }

  return adjusted;
}

/**
 * Formats a date for display in Croatian/English locale with Europe/Zagreb time.
 */
export function formatZagrebDate(
  dateInput: Date | string | number | null | undefined,
  options: { includeTime?: boolean; lang?: "hr" | "en" } = {}
): string {
  if (!dateInput) return "—";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  const { includeTime = false, lang = "hr" } = options;
  const parts = toZagreb(date);

  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  const yyyy = parts.year;
  const time = parts.timeStr;

  if (lang === "hr") {
    return includeTime ? `${dd}.${mm}.${yyyy}. ${time}` : `${dd}.${mm}.${yyyy}.`;
  } else {
    return includeTime ? `${mm}/${dd}/${yyyy} ${time}` : `${mm}/${dd}/${yyyy}`;
  }
}
