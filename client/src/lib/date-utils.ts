import { format, parseISO } from "date-fns";
import { hr, enUS } from "date-fns/locale";

export type AppLang = "hr" | "en";

/**
 * Formats a date for display in the app.
 * hr: DD.MM.YYYY.
 * en: MM/dd/yyyy
 */
export function formatAppDate(date: Date | string | number | null | undefined, lang: AppLang = "hr", includeTime = false) {
    if (!date) return "—";

    const dateObj = typeof date === "string" ? parseISO(date) : new Date(date);

    // Check for invalid date
    if (isNaN(dateObj.getTime())) return "—";

    if (lang === "hr") {
        const pattern = includeTime ? "dd.MM.yyyy. HH:mm" : "dd.MM.yyyy.";
        return format(dateObj, pattern, { locale: hr });
    } else {
        const pattern = includeTime ? "MM/dd/yyyy HH:mm" : "MM/dd/yyyy";
        return format(dateObj, pattern, { locale: enUS });
    }
}

/**
 * Helper to format date for <input type="date"> (YYYY-MM-DD)
 */
export function formatToSqlDate(date: Date | string | number) {
    const dateObj = typeof date === "string" ? parseISO(date) : new Date(date);
    return format(dateObj, "yyyy-MM-dd");
}
