/** Display formats from design/NOTES.md: 25.000đ, 3,8, 07:00. */

function groupThousands(n: number): string {
  return String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 25000 → "25.000đ", −450000 → "−450.000đ". */
export function formatMoney(dong: number): string {
  return `${dong < 0 ? '−' : ''}${groupThousands(dong)}đ`;
}

/** Sums from this many đồng show compact in formatMoneyShort. */
export const SHORT_MONEY_FROM = 10_000_000;

/**
 * Compact money for the narrow HUD: 109582093 → "109,6tr", 1234567890 →
 * "1,2 tỷ", one decimal; below SHORT_MONEY_FROM the same as formatMoney.
 */
export function formatMoneyShort(dong: number): string {
  const abs = Math.abs(Math.round(dong));
  if (abs < SHORT_MONEY_FROM) return formatMoney(dong);
  const sign = dong < 0 ? '−' : '';
  const tr = Math.round(abs / 100_000) / 10;
  if (tr < 1000) return `${sign}${tr.toFixed(1).replace('.', ',')}tr`;
  return `${sign}${(Math.round(abs / 100_000_000) / 10).toFixed(1).replace('.', ',')} tỷ`;
}

/** 702 → "11:42". */
export function formatClock(minute: number): string {
  const m = Math.max(0, Math.floor(minute));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 3.84 → "3,8". */
export function formatRating(rating: number): string {
  return (Math.round(rating * 10) / 10).toFixed(1).replace('.', ',');
}

/** Epoch ms → "21:00, 13/10/2026" in local time. */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
