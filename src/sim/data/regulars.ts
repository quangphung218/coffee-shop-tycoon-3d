import type { MenuItemId } from '../types';

/**
 * Named regulars. A customer with the 'regular' persona is matched to one of
 * them by a hash of the seed and the customer id, never from the game RNG, so
 * naming them does not change orders, patience or the economy. A named
 * regular wears their own `look` on every visit.
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

/**
 * Season-2 regulars (E-27). When one of REGULARS completes milestone 4 of the
 * Sổ khách quen, one of these moves in and from then on comes in their place:
 * the customers that hash to the old regular are named after the new one, so
 * who is named on which day, and so arrivals, orders and scoring, stay as
 * they were. Which one moves in first is a hash of the seed
 * (newRegularOrder). Looks 8–15 are recolours of the shared customer model
 * (rig.ts picks skin, shirt, pants and hair by look), so no draw call is added.
 */
export const NEW_REGULARS: readonly Regular[] = [
  { id: 'co_mai', name: 'Cô Mai', favorite: 'cold_brew', look: 8 },
  { id: 'anh_duc', name: 'Anh Đức', favorite: 'cappuccino', look: 9 },
  { id: 'chi_ngoc', name: 'Chị Ngọc', favorite: 'orange_juice', look: 10 },
  { id: 'chu_bay', name: 'Chú Bảy', favorite: 'americano', look: 11 },
  { id: 'em_nam', name: 'Em Nam', favorite: 'frappe', look: 12 },
  { id: 'ba_tu', name: 'Bà Tư', favorite: 'latte', look: 13 },
  { id: 'anh_phong', name: 'Anh Phong', favorite: 'mocha', look: 14 },
  { id: 'chi_linh', name: 'Chị Linh', favorite: 'lemon_tea', look: 15 },
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

/** Whether `id` is one of the first eight regulars (REGULARS), whose places NEW_REGULARS take. */
export function isFirstRegular(id: string): boolean {
  return REGULARS.some((r) => r.id === id);
}

export function regularById(id: string): Regular | undefined {
  return REGULARS.find((r) => r.id === id) ?? NEW_REGULARS.find((r) => r.id === id);
}

const NEW_REGULAR_SALT = 0x2f6b13c5;

/**
 * NEW_REGULARS ids in the order they move in for `seed`: a Fisher–Yates
 * shuffle driven by regularHash, never the game RNG.
 */
export function newRegularOrder(seed: number): string[] {
  const ids = NEW_REGULARS.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = regularHash(seed, NEW_REGULAR_SALT + i) % (i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
}
