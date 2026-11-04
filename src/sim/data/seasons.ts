import type { StyleDef } from './styles';

/**
 * Seasonal shop styles (E-26): from week SEASON_FIRST_WEEK, every
 * SEASON_WEEKS weeks a season offers a set of 3-4 extra styles, paid mostly in
 * Tem. The sets rotate (SEASON_SETS order), so a set missed in one season
 * comes back SEASON_SETS.length seasons later. Like every style they only
 * recolour existing meshes (color/accent); bought ones stay owned for good.
 * Everything here is a pure function of the week number.
 */

/** First week a season is on sale. */
export const SEASON_FIRST_WEEK = 24;
/** Length of one season in weeks. */
export const SEASON_WEEKS = 8;

export interface SeasonSet {
  id: string;
  /** Vietnamese name of the season shown in the UI. */
  name: string;
  /** Style ids (SEASONAL_STYLES) on sale while this set's season runs. */
  ids: readonly string[];
}

export const SEASONAL_STYLES: readonly StyleDef[] = [
  // Set 0: Mùa xuân (Tết)
  { id: 'wall_peach', slot: 'wall', name: 'Tường hoa đào', color: 0xf7c9c4, accent: 0xb5384a, price: 0, tickets: 70, season: 0 },
  { id: 'floor_jade', slot: 'floor', name: 'Gạch ngọc bích', color: 0xcfe6d4, accent: 0x3f7f5f, price: 0, tickets: 80, season: 0 },
  { id: 'sign_lacquer', slot: 'sign', name: 'Biển sơn mài', color: 0x8c1c24, accent: 0xf2c14e, price: 5_000_000, tickets: 90, season: 0 },
  { id: 'awning_apricot', slot: 'awning', name: 'Mái hiên hoa mai', color: 0xf5c518, accent: 0xb5384a, price: 0, tickets: 80, season: 0 },
  // Set 1: Mùa hè
  { id: 'wall_seafoam', slot: 'wall', name: 'Tường xanh biển', color: 0xbfe7ea, accent: 0x1f6f8b, price: 0, tickets: 100, season: 1 },
  { id: 'sign_lagoon', slot: 'sign', name: 'Biển đầm phá', color: 0x1f6f8b, accent: 0xfff9f0, price: 5_000_000, tickets: 110, season: 1 },
  { id: 'awning_sunset', slot: 'awning', name: 'Mái hiên hoàng hôn', color: 0xf08a4b, accent: 0xffe3b0, price: 0, tickets: 110, season: 1 },
  // Set 2: Mùa thu
  { id: 'wall_maple', slot: 'wall', name: 'Tường lá phong', color: 0xe8b07a, accent: 0x8a3b12, price: 0, tickets: 75, season: 2 },
  { id: 'floor_walnut', slot: 'floor', name: 'Sàn gỗ óc chó', color: 0x7a5236, accent: 0x3d2817, price: 0, tickets: 80, season: 2 },
  { id: 'sign_lantern', slot: 'sign', name: 'Biển đèn lồng', color: 0x6b2d1a, accent: 0xf6a623, price: 5_000_000, tickets: 85, season: 2 },
  { id: 'awning_harvest', slot: 'awning', name: 'Mái hiên mùa gặt', color: 0xc9a227, accent: 0x5c3a26, price: 0, tickets: 80, season: 2 },
];

export const SEASON_SETS: readonly SeasonSet[] = [
  { id: 'spring', name: 'Mùa xuân', ids: SEASONAL_STYLES.filter((s) => s.season === 0).map((s) => s.id) },
  { id: 'summer', name: 'Mùa hè', ids: SEASONAL_STYLES.filter((s) => s.season === 1).map((s) => s.id) },
  { id: 'autumn', name: 'Mùa thu', ids: SEASONAL_STYLES.filter((s) => s.season === 2).map((s) => s.id) },
];

/** The season running in a week. */
export interface Season {
  /** Season number from 0 (weeks 24-31), 1 (32-39), ... */
  index: number;
  /** SEASON_SETS index of the styles on sale (index mod the number of sets). */
  set: number;
  /** Name of the set, e.g. "Mùa xuân". */
  name: string;
  /** First and last week of the season. */
  startWeek: number;
  endWeek: number;
  /** Weeks left including the given one: SEASON_WEEKS in its first week, 1 in its last. */
  weeksLeft: number;
  /** Style ids on sale. */
  ids: readonly string[];
}

/** The season of a week (1-based), or null before SEASON_FIRST_WEEK. */
export function seasonFor(week: number): Season | null {
  if (!Number.isFinite(week) || week < SEASON_FIRST_WEEK) return null;
  const index = Math.floor((Math.floor(week) - SEASON_FIRST_WEEK) / SEASON_WEEKS);
  const set = index % SEASON_SETS.length;
  const startWeek = SEASON_FIRST_WEEK + index * SEASON_WEEKS;
  const endWeek = startWeek + SEASON_WEEKS - 1;
  return { index, set, name: SEASON_SETS[set]!.name, startWeek, endWeek, weeksLeft: endWeek - Math.floor(week) + 1, ids: SEASON_SETS[set]!.ids };
}

/** The seasonal styles on sale in a week, in SEASONAL_STYLES order; empty before SEASON_FIRST_WEEK. */
export function seasonalStylesFor(week: number): StyleDef[] {
  const season = seasonFor(week);
  return season ? SEASONAL_STYLES.filter((s) => s.season === season.set) : [];
}

/** True when the style is a seasonal one (sold only in its season). */
export function isSeasonalStyle(style: Pick<StyleDef, 'season'> | undefined): boolean {
  return style?.season !== undefined;
}

/** True when a style may be sold in a week: always for a base style, only in its season for a seasonal one. */
export function styleOnSale(style: Pick<StyleDef, 'season'>, week: number): boolean {
  return style.season === undefined || seasonFor(week)?.set === style.season;
}

/** First week >= `week` in which the given set is on sale. */
export function nextSeasonWeek(set: number, week: number): number {
  const now = seasonFor(week);
  if (now?.set === set) return Math.floor(week);
  const n = SEASON_SETS.length;
  const from = now ? now.index + 1 : 0;
  const index = from + ((set - (from % n) + n) % n);
  return SEASON_FIRST_WEEK + index * SEASON_WEEKS;
}
