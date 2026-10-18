/**
 * Local calendar day of the machine as 'YYYY-MM-DD', the date key the daily
 * gift (claim_daily_gift) uses. The UI reads the clock; the sim only compares keys.
 */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
