/**
 * OIB (Osobni identifikacijski broj) validator
 * Algoritam: ISO 7064 MOD 11,10
 * OIB je jedinstven 11-znamenkasti identifikacijski broj koji dodjeljuje
 * Porezna uprava Republike Hrvatske.
 */

/**
 * Validira OIB pomoću ISO 7064 MOD 11,10 algoritma.
 * @returns true ako je OIB ispravan, false inače
 */
export function isValidOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;

  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + parseInt(oib[i], 10)) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }

  const checkDigit = 11 - remainder === 10 ? 0 : 11 - remainder;
  return checkDigit === parseInt(oib[10], 10);
}

/**
 * Formatira OIB grešku za prikaz korisniku.
 */
export function getOibError(oib: string): string | null {
  if (!oib || oib.trim() === "") return "OIB je obavezan.";
  if (!/^\d+$/.test(oib.trim())) return "OIB smije sadržavati samo znamenke.";
  if (oib.trim().length !== 11) return "OIB mora imati točno 11 znamenki.";
  if (!isValidOib(oib.trim())) return "OIB nije ispravan (pogrešna kontrolna znamenka).";
  return null;
}
