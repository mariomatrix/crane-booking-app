/**
 * Member Sync — MSSQL Queries
 * SQL upiti prema legacy CLAN03 tablici
 */
import { getMssqlPool } from "./mssqlClient";
import type { LegacyClan03Row } from "./types";

/**
 * Dohvaća sve aktivne članove iz CLAN03
 * Filtrira po VRSTA_C IN ('U','B') AND ISNULL(KLUB,0) > 0
 */
export async function fetchAllClan03Members(): Promise<LegacyClan03Row[]> {
    const pool = await getMssqlPool();

    const result = await pool.request().query<LegacyClan03Row>(`
        SELECT
            MAT_BROJ,
            VRSTA_C,
            PREZIME,
            IME,
            OIB,
            JMBG,
            ADRESA,
            Ptt,
            Grad,
            DRZAVA,
            MOBITEL,
            TELEFON,
            Email,
            Emial,
            IME_BR,
            BROD_BR,
            TIP_BROD,
            DUZINA_BR,
            SIRINA_BR,
            firma,
            CLAN,
            KLUB,
            Klub2,
            NAPOMENA
        FROM CLAN03
        WHERE VRSTA_C IN ('U','B')
          AND ISNULL(KLUB, 0) > 0
    `);

    return result.recordset;
}

/**
 * Test upit za provjeru MSSQL konekcije
 */
export async function testMssqlConnection(): Promise<{ connected: boolean; rowCount: number; error?: string }> {
    try {
        const pool = await getMssqlPool();
        const result = await pool.request().query(`
            SELECT COUNT(*) as cnt
            FROM CLAN03
            WHERE VRSTA_C IN ('U','B')
              AND ISNULL(KLUB, 0) > 0
        `);
        return {
            connected: true,
            rowCount: result.recordset[0]?.cnt ?? 0,
        };
    } catch (err) {
        return {
            connected: false,
            rowCount: 0,
            error: (err as Error).message,
        };
    }
}
