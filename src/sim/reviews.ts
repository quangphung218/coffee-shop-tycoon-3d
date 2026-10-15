import { PERSONAS } from './data/personas';
import { STAFF_NAMES } from './data/staffNames';
import { UPGRADES, totalUpgradeEffect } from './data/upgrades';
import { chance, pick } from './rng';
import type { Customer, GameState, PersonaId, Review, ReviewReason } from './types';

export const MAX_REVIEWS = 30;
/** Share of customers who write a review. Unhappy customers speak up more. */
export const REVIEW_CHANCE = { served: 0.3, angry: 0.6 } as const;
/** Patience share spent waiting under which service counts as fast. */
const FAST_WAIT = 0.35;
const SLOW_WAIT = 0.65;

export type Experience =
  | { kind: 'served'; waitShare: number; dirtyTable: boolean; persona?: PersonaId }
  | { kind: 'angry'; reason: 'long_wait' | 'out_of_stock'; persona?: PersonaId };

/** Chance a connoisseur rewards an extra star when premium coffee gear is in. */
const CONNOISSEUR_GEAR_BONUS = 0.5;

const TEXTS: Record<ReviewReason, readonly string[]> = {
  fast_service: ['Phục vụ nhanh, vừa gọi đã có nước.', 'Nhân viên nhanh nhẹn, không phải chờ lâu.'],
  tasty: ['Đồ uống ngon, đậm vị, sẽ quay lại!', 'Cà phê thơm, uống rất đã.'],
  nice_decor: ['Quán đẹp, ngồi rất thích.', 'Không gian xinh xắn, chụp ảnh đẹp.'],
  long_wait: ['Đợi lâu quá, mãi không thấy đồ uống.', 'Chờ dài cổ mà vẫn chưa được phục vụ.'],
  out_of_stock: ['Món mình gọi lại hết, thất vọng.', 'Quán hết món, phải đi chỗ khác.'],
  dirty_table: ['Bàn bẩn không ai dọn, phải mang đi.', 'Bàn còn ly bẩn, chẳng có chỗ ngồi.'],
};

function decorLevels(state: GameState): number {
  return UPGRADES.filter((u) => u.category === 'decor').reduce((s, u) => s + (state.upgrades[u.id] ?? 0), 0);
}

/** True when the shop has a grinder or a better espresso machine; connoisseurs notice. */
function hasPremiumCoffeeGear(state: GameState): boolean {
  return (state.upgrades.grinder ?? 0) > 0 || (state.upgrades.better_machine ?? 0) > 0;
}

/** Stars and the main reason behind them for one customer's visit. */
export function rateExperience(state: GameState, exp: Experience): { stars: number; reason: ReviewReason } {
  if (exp.kind === 'angry') return exp.reason === 'long_wait' ? { stars: 1, reason: 'long_wait' } : { stars: 2, reason: 'out_of_stock' };
  let stars = exp.waitShare < FAST_WAIT ? 5 : exp.waitShare < SLOW_WAIT ? 4 : 3;
  if (exp.dirtyTable) stars -= 1;
  const bonus = totalUpgradeEffect(state.upgrades).ratingBonus;
  if (stars < 5 && bonus > 0 && chance(state, Math.min(0.5, bonus))) stars += 1;
  const persona = exp.persona ? PERSONAS[exp.persona] : null;
  if (persona) {
    if (persona.id === 'connoisseur' && hasPremiumCoffeeGear(state) && stars < 5 && chance(state, CONNOISSEUR_GEAR_BONUS)) stars += 1;
    const lean = persona.reviewStrictness;
    if (lean < 0 && stars < 5 && chance(state, Math.min(1, -lean))) stars += 1;
    else if (lean > 0 && stars > 1 && chance(state, Math.min(1, lean))) stars -= 1;
  }
  stars = Math.max(1, Math.min(5, stars));

  let reason: ReviewReason;
  if (exp.dirtyTable) reason = 'dirty_table';
  else if (exp.waitShare >= SLOW_WAIT) reason = 'long_wait';
  else if (decorLevels(state) > 0 && chance(state, 0.5)) reason = 'nice_decor';
  else if (exp.waitShare < FAST_WAIT && chance(state, 0.5)) reason = 'fast_service';
  else reason = 'tasty';
  return { stars, reason };
}

export function addReview(state: GameState, review: Review): void {
  state.reviews.push(review);
  if (state.reviews.length > MAX_REVIEWS) state.reviews.splice(0, state.reviews.length - MAX_REVIEWS);
  state.events.push({ type: 'review', review });
}

/** Builds a review for the visit and keeps it. */
export function writeReview(state: GameState, exp: Experience): Review {
  const { stars, reason } = rateExperience(state, exp);
  const persona = exp.persona ? PERSONAS[exp.persona] : null;
  const lines = persona?.reviewTexts[reason] ?? TEXTS[reason];
  const review: Review = { day: state.day, stars, text: pick(state, lines), author: pick(state, STAFF_NAMES), reason };
  addReview(state, review);
  return review;
}

/** Records how the visit went in today's stats, and sometimes leaves a review. */
export function recordExperience(state: GameState, exp: Experience): void {
  if (exp.kind === 'served') {
    state.today.waitShareSum = (state.today.waitShareSum ?? 0) + exp.waitShare;
    if (exp.dirtyTable) state.today.dirtyTableHits = (state.today.dirtyTableHits ?? 0) + 1;
  }
  if (chance(state, REVIEW_CHANCE[exp.kind])) writeReview(state, exp);
}

/** What a customer went through, read right after the served or angry event. */
export function experienceOf(state: GameState, customer: Customer, event: 'served' | 'angry'): Experience {
  if (event === 'angry') {
    return { kind: 'angry', reason: customer.patience <= 0 ? 'long_wait' : 'out_of_stock', persona: customer.persona };
  }
  const waitShare = customer.maxPatience > 0 ? Math.min(1, Math.max(0, 1 - customer.patience / customer.maxPatience)) : 0;
  // Served without a seat while a table with free seats was waiting to be cleaned.
  const dirtyTable =
    customer.tableId === null && state.tables.some((t) => t.trash > 0 && t.occupants.length < t.seats);
  return { kind: 'served', waitShare, dirtyTable, persona: customer.persona };
}

/**
 * Reads the served and angry events pushed since `fromIndex` (within one tick)
 * and records each customer's experience.
 */
export function recordExperiencesSince(state: GameState, fromIndex: number): void {
  const end = state.events.length;
  for (let i = fromIndex; i < end; i++) {
    const e = state.events[i]!;
    if (e.type !== 'served' && e.type !== 'angry') continue;
    const customer = state.customers.find((c) => c.id === e.customerId);
    if (customer) recordExperience(state, experienceOf(state, customer, e.type));
  }
}
