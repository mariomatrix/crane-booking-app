/**
 * Member Sync — TypeScript Types
 * Tipovi za MSSQL CLAN03 redove i sync rezultate
 */

/** Raw CLAN03 red iz MSSQL baze */
export interface LegacyClan03Row {
    MAT_BROJ: string | null;
    VRSTA_C: string | null;
    PREZIME: string | null;
    IME: string | null;
    OIB: string | null;
    JMBG: string | null;
    ADRESA: string | null;
    Ptt: string | null;
    Grad: string | null;
    DRZAVA: string | null;
    MOBITEL: string | null;
    TELEFON: string | null;
    Email: string | null;
    Emial: string | null;     // typo u legacy bazi
    IME_BR: string | null;
    BROD_BR: string | null;
    TIP_BROD: string | null;
    DUZINA_BR: number | null;
    SIRINA_BR: number | null;
    firma: boolean | null;
    CLAN: string | null;
    KLUB: string | null;
    Klub2: string | null;
    NAPOMENA: string | null;
    GAT: string | null;
    VEZ_BROJ: string | null;
    VEZ_TIP: string | null;
    UGOVOR: string | null;
    DUG: number | null;
    PLAC_DO: string | null;
    KOPNO: string | null;
    KOPNOPIS: string | null;
}

/** Brojači za sync_runs statistiku */
export interface SyncCounters {
    sourceRowsTotal: number;
    membersCreated: number;
    membersUpdated: number;
    membersSkipped: number;
    membersDeactivated: number;
    vesselsCreated: number;
    vesselsUpdated: number;
    vesselsSkipped: number;
    linksCreated: number;
    membershipsCreated: number;
    membershipsUpdated: number;
    conflictsDetected: number;
}

/** Rezultat sync operacije za jednog člana */
export interface MemberSyncResult {
    matBroj: string;
    userId: string | null;
    action: "created" | "updated" | "skipped" | "conflict";
    vesselAction?: "created" | "updated" | "skipped" | "conflict";
    error?: string;
}

/** Rezultat kompletnog sync runa */
export interface FullSyncResult {
    syncRunId: string;
    status: "completed" | "failed" | "partial";
    counters: SyncCounters;
    duration: number; // ms
    errors: string[];
}

/** Konfiguracijska opcija za MSSQL konekciju */
export interface MssqlConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
}
