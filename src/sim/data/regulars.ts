import type { MenuItemId } from '../types';

/**
 * Named regulars. A customer with the 'regular' persona is matched to one of
 * them by a hash of the seed and the customer id, never from the game RNG, so
 * naming them does not change orders, patience, looks or the economy.
 */
export interface Regular {
  id: string;
  /** Vietnamese name with a form of address, shown in toasts and reviews. */
  name: string;
  /** Drink they are known for; shown only, it does not change what they order. */
  favorite: MenuItemId;
  /** Visual variant for the 3D figure. */
  look: number;
}

export const REGULARS: readonly Regular[] = [
  { id: 'co_lan', name: 'Cô Lan', favorite: 'latte', look: 0 },
  { id: 'anh_minh', name: 'Anh Minh', favorite: 'americano', look: 1 },
  { id: 'chu_tuan', name: 'Chú Tuấn', favorite: 'espresso', look: 2 },
  { id: 'chi_hoa', name: 'Chị Hoa', favorite: 'cappuccino', look: 3 },
  { id: 'em_vy', name: 'Em Vy', favorite: 'milk_tea', look: 4 },
  { id: 'bac_hung', name: 'Bác Hùng', favorite: 'mocha', look: 5 },
  { id: 'chi_thao', name: 'Chị Thảo', favorite: 'lemon_tea', look: 6 },
  { id: 'anh_khoa', name: 'Anh Khoa', favorite: 'frappe', look: 7 },
];

/** First game day regulars can be recognised; day 1 is everyone's first visit. */
export const REGULARS_FROM_DAY = 2;

const REGULAR_SALT = 0x165667b1;

/** A stable 32-bit hash of the seed and a customer id, the same mix as the persona hash with its own salt. */
function regularHash(seed: number, id: number): number {
  let h = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((id + REGULAR_SALT) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** The regular customer `id` would be, before the once-a-day check. */
export function pickRegular(seed: number, id: number): Regular {
  return REGULARS[regularHash(seed, id) % REGULARS.length]!;
}

export function regularById(id: string): Regular | undefined {
  return REGULARS.find((r) => r.id === id);
}
