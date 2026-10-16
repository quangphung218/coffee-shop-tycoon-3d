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
  hard: { revenue: 23_000_000, stars: 4.2 },
};

export interface WeekUnlockDay {
  /** Day of the week, 1..WEEK_LENGTH. */
  day: number;
  /** What opens on the morning of this day. */
  unlocks: Unlocks;
  /** The shop gets its side room (one free level of expand_area) on this day. */
  expandShop?: boolean;
}

/**
 * The 7-day unlock calendar. Something new opens every day from day 2, and
 * day 7 expands the shop. A menu item or upgrade is available once the shop
 * level or this calendar reaches it, whichever comes first (see isUnlocked).
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
