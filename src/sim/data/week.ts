import type { DayEventId, Difficulty, MenuItemId, Unlocks, UpgradeId, WeekGoal } from '../types';
import { levelDef } from './levels';

/** Days in a week of play. */
export const WEEK_LENGTH = 7;

/**
 * Week targets by difficulty. Revenue is set so the basic strategy (restock
 * as suggested, serve alone) reaches about 70–90% of it; how it was measured
 * is in docs/spec/week-7-days.md.
 */
export const WEEK_GOALS: Readonly<Record<Difficulty, WeekGoal>> = {
  easy: { revenue: 28_000_000, stars: 3.8 },
  normal: { revenue: 26_500_000, stars: 4 },
  hard: { revenue: 23_200_000, stars: 4.2 },
};

/**
 * Revenue target growth per week after week 1, and its cap as a multiple of
 * week 1: a shop that keeps investing grows past 3× its week-1 revenue, while
 * one that never buys anything stays near 1.1× and drops to 2 cups from week 2.
 * Measured in docs/reports/p23-long-economy.md.
 */
export const WEEK_GOAL_GROWTH = 0.6;
export const WEEK_GOAL_MAX_MULT = 3;

/**
 * Targets of week `index` (from 1): week 1 is WEEK_GOALS, then revenue grows by
 * WEEK_GOAL_GROWTH a week up to WEEK_GOAL_MAX_MULT times, rounded to 100.000;
 * the stars target stays.
 */
export function weekGoal(difficulty: Difficulty, index: number): WeekGoal {
  const base = WEEK_GOALS[difficulty];
  const mult = Math.min(WEEK_GOAL_MAX_MULT, 1 + WEEK_GOAL_GROWTH * Math.max(0, index - 1));
  return { revenue: Math.round((base.revenue * mult) / 100_000) * 100_000, stars: base.stars };
}

/** Fewest cups a week needs to pay WEEK_REWARDS. */
export const WEEK_REWARD_MIN_CUPS = 2;

/**
 * Cash paid when a week ends with 2 or 3 cups, by difficulty. Harder games pay
 * more because their prices are higher. Numbers in docs/reports/p23-long-economy.md.
 */
export const WEEK_REWARDS: Readonly<Record<Difficulty, Readonly<Record<2 | 3, number>>>> = {
  easy: { 2: 1_000_000, 3: 1_500_000 },
  normal: { 2: 1_500_000, 3: 2_250_000 },
  hard: { 2: 2_000_000, 3: 3_000_000 },
};

/** Cash reward of a week scored with `cups` cups; 0 below WEEK_REWARD_MIN_CUPS. */
export function weekReward(difficulty: Difficulty, cups: number): number {
  if (cups < WEEK_REWARD_MIN_CUPS) return 0;
  return WEEK_REWARDS[difficulty][cups >= 3 ? 3 : 2];
}

export interface WeekUnlockDay {
  /** Day of the week, 1..WEEK_LENGTH. */
  day: number;
  /** What opens on the morning of this day. */
  unlocks: Unlocks;
  /** The shop gets its side room (one free level of expand_area) on this day. */
  expandShop?: boolean;
}

/**
 * The 7-day unlock calendar of week 1. Something new opens every day from day
 * 2, and day 7 expands the shop. A menu item or upgrade is available once the
 * shop level or this calendar reaches it, whichever comes first; from week 2
 * all of it stays open (see isUnlocked).
 * Table in docs/spec/week-7-days.md.
 */
export const WEEK_UNLOCKS: readonly WeekUnlockDay[] = [
  { day: 1, unlocks: levelDef(1).unlocks },
  { day: 2, unlocks: { menu: ['cappuccino'], upgrades: [], tools: ['grinder', 'ice_maker'] } },
  { day: 3, unlocks: { menu: ['orange_juice'], upgrades: [], tools: ['pastry_case'] } },
  { day: 4, unlocks: { menu: ['mocha'], upgrades: ['paintings', 'lights'], tools: ['dishwasher'] } },
  { day: 5, unlocks: { menu: ['frappe'], upgrades: ['outdoor_seating'], tools: ['blender'] } },
  { day: 6, unlocks: { menu: ['cake'], upgrades: ['window_bar'], tools: [] } },
  { day: 7, unlocks: { menu: [], upgrades: ['expand_area'], tools: [] }, expandShop: true },
];

/** Calendar entry for a day of the week; undefined outside 1..WEEK_LENGTH. */
export function weekUnlockDay(day: number): WeekUnlockDay | undefined {
  return WEEK_UNLOCKS.find((d) => d.day === day);
}

/** Day of the week a menu item or upgrade opens on, or Infinity when the calendar never opens it. */
export function dayUnlockDay(kind: 'menu' | 'upgrade', id: MenuItemId | UpgradeId): number {
  for (const { day, unlocks } of WEEK_UNLOCKS) {
    const ids: readonly string[] = kind === 'menu' ? unlocks.menu : [...unlocks.upgrades, ...unlocks.tools];
    if (ids.includes(id)) return day;
  }
  return Infinity;
}

export interface DayEventDef {
  id: DayEventId;
  name: string;
  description: string;
  /** Multiplier on customer arrivals for the day. */
  arrivalMult: number;
  /** Multiplier on ingredient prices for the day: buying and the cost of servings made. */
  ingredientPriceMult: number;
}

/** Day events of the week; the plan picks one per day (rollWeekPlan in src/sim/week.ts). */
export const DAY_EVENTS: Readonly<Record<DayEventId, DayEventDef>> = {
  none: { id: 'none', name: 'Ngày thường', description: 'Không có sự kiện', arrivalMult: 1, ingredientPriceMult: 1 },
  grand_opening: {
    id: 'grand_opening',
    name: 'Khai trương',
    description: 'Khách tò mò ghé thử quán mới',
    arrivalMult: 1.15,
    ingredientPriceMult: 1,
  },
  fair: { id: 'fair', name: 'Hội chợ', description: 'Phố đông, khách tăng mạnh', arrivalMult: 1.4, ingredientPriceMult: 1 },
  supplier_hike: {
    id: 'supplier_hike',
    name: 'Nhà cung cấp tăng giá',
    description: 'Nguyên liệu đắt hơn trong ngày',
    arrivalMult: 1,
    ingredientPriceMult: 1.25,
  },
};
