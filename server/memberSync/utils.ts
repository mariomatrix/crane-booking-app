/**
 * Member Sync — Utility Functions
 * OIB validacija, phone normalizacija, JMBG hash, email selekcija
 */
import { createHash } from "crypto";
import { isValidOib } from "../../shared/oib";

/**
 * Validira OIB prema ISO 7064, Mod 11,10
 * @returns true ako je OIB validan
 */
export function validateOIB(oib: string): boolean {
    return isValidOib(oib);
}

/**
 * Normalizira OIB: trim, ukloni razmake, crtice, točke
 * @returns normalizirani OIB string ili null ako nije validan
 */
export function normalizeOIB(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[\s\-\.]/g, "").trim();
    if (cleaned.length === 0) return null;
    if (validateOIB(cleaned)) return cleaned;
    if (/^\d{11}$/.test(cleaned)) return cleaned;
    return null;
}

/**
 * Hashira JMBG pomoću SHA-256
 * Samo za pune JMBG-ove (13 znakova)
 * @returns hex hash ili null
 */
export function hashJMBG(jmbg: string | null | undefined): string | null {
    if (!jmbg) return null;
    const cleaned = jmbg.replace(/\s/g, "").trim();
    if (cleaned.length !== 13) return null;
    if (!/^\d{13}$/.test(cleaned)) return null;
    return createHash("sha256").update(cleaned).digest("hex");
}

/**
 * Normalizira telefonski broj
 * Uklanja razmake, crtice, dodaje +385 prefix ako treba
 */
export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    // Ako je kratki broj (npr. lokalni fiksni 383-174), vrati očišćene znamenke
    const cleaned = trimmed.replace(/[\s\-\(\)\.]/g, "");
    if (cleaned.length === 0) return null;

    // Ako počinje s 0 i standardne je duljine mobitela/fiksnog
    if (cleaned.startsWith("00385")) {
        return "+385" + cleaned.substring(5);
    } else if (cleaned.startsWith("0")) {
        return "+385" + cleaned.substring(1);
    } else if (cleaned.startsWith("+")) {
        return "+" + cleaned.replace(/\+/g, "");
    }

    return cleaned;
}

/**
 * Odabire email iz dva legacy polja (Email i Emial — typo u bazi)
 * @returns email string ili null
 */
export function selectEmail(
    email: string | null | undefined,
    emial: string | null | undefined,
): string | null {
    // Prioritet: Email > Emial
    const primary = email?.trim();
    const secondary = emial?.trim();

    const selected = primary && primary.length > 0 ? primary : secondary && secondary.length > 0 ? secondary : null;

    if (!selected) return null;

    // Ako ima više emailova odvojenih ;, uzmi prvi
    const firstEmail = selected.split(";")[0].trim();
    if (firstEmail.length === 0) return null;

    // Osnovna email validacija
    if (!firstEmail.includes("@")) return null;

    return firstEmail.toLowerCase();
}

/**
 * Mapira TIP_BROD iz CLAN03 na vessel_type enum
 */
export function mapVesselType(
    tipBrod: string | null | undefined,
): "jedrilica" | "motorni" | "katamaran" | "ostalo" {
    if (!tipBrod) return "ostalo";
    const t = tipBrod.trim().toLowerCase();

    if (t.includes("jedr") || t.includes("sail")) return "jedrilica";
    if (t.includes("motor") || t.includes("mb") || t.includes("gliser")) return "motorni";
    if (t.includes("katam") || t.includes("cat")) return "katamaran";

    return "ostalo";
}

/**
 * Normalizira ime/prezime: trim, capitalize first letter
 */
export function normalizeName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    // Capitalize svaku riječ (IVICA → Ivica, MARIO MATIĆ → Mario Matić)
    return trimmed
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
