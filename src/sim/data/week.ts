import type { MenuItemId, Unlocks, UpgradeId } from '../types';
import { levelDef } from './levels';

/** Days in a week of play. */
export const WEEK_LENGTH = 7;

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
  { day: 2, unlocks: { menu: ['cappuccino'], upgrades: [], tools: ['grinder'] } },
  { day: 3, unlocks: { menu: ['orange_juice'], upgrades: [], tools: ['pastry_case'] } },
  { day: 4, unlocks: { menu: ['mocha'], upgrades: ['paintings', 'lights'], tools: [] } },
  { day: 5, unlocks: { menu: ['frappe'], upgrades: ['outdoor_seating'], tools: ['blender'] } },
  { day: 6, unlocks: { menu: ['cake'], upgrades: ['window_bar'], tools: ['ice_maker'] } },
  { day: 7, unlocks: { menu: [], upgrades: ['expand_area'], tools: ['dishwasher'] }, expandShop: true },
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
