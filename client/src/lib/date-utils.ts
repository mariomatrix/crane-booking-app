import { formatZagrebDate, toZagreb, fromZagreb, APP_TIMEZONE } from "@shared/timezone";

export type AppLang = "hr" | "en";

/**
 * Formats a date for display in the app strictly in Croatian local time (Europe/Zagreb).
 * hr: DD.MM.YYYY. [HH:mm]
 * en: MM/dd/yyyy [HH:mm]
 */
export function formatAppDate(
  date: Date | string | number | null | undefined,
  lang: AppLang = "hr",
  includeTime = false
): string {
  return formatZagrebDate(date, { includeTime, lang });
}

/**
 * Helper to format date for <input type="date"> (YYYY-MM-DD) in Europe/Zagreb timezone.
 */
export function formatToSqlDate(date: Date | string | number | null | undefined): string {
  if (!date) return "";
  try {
    return toZagreb(date).dateStr;
  } catch {
    return "";
  }
}

export { toZagreb, fromZagreb, APP_TIMEZONE, formatZagrebDate };
