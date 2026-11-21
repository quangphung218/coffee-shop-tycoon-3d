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
export function styleOnSale(style: Pick<StyleDef, 'season' | 'cycle'>, week: number): boolean {
  if (style.season === undefined) return true;
  if (seasonFor(week)?.set !== style.season) return false;
  return style.cycle === undefined || cycleFor(week) >= style.cycle;
}

/** First week >= `week` in which a seasonal style (or variant) is on sale. */
export function nextStyleSaleWeek(style: Pick<StyleDef, 'season' | 'cycle'>, week: number): number {
  const next = nextSeasonWeek(style.season!, week);
  return style.cycle === undefined ? next : Math.max(next, variantFirstWeek(style.season!, style.cycle));
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

/*
 * Seasonal colour variants (E-33): a Tem sink once every seasonal style is
 * bought. A cycle is the SEASON_SETS.length seasons (24 weeks) it takes every
 * set to come round once; cycle 0 is weeks 24-47. From cycle 1 (week 48) on,
 * each cycle gives every seasonal style one extra colour variant, made by
 * blending its colours toward a tint from VARIANT_TINTS (the renderer paints
 * it through the same recolor() path, so no mesh or material is added). A
 * variant is sold, like its base style, only in its set's season, from its
 * cycle on, and stays on sale in that set's later seasons. It costs Tem only
 * (no money): base Tem * (1 + cycle), one fixed formula rising per cycle.
 * Variants are not in ALL_STYLES (there is no last cycle); styleById builds
 * them from their id (`<base id>_c<cycle>`), so saves need no new field.
 */

/** Seasons in one cycle (every set once): 3. */
export const SEASONS_PER_CYCLE = SEASON_SETS.length;
/** Weeks in one cycle: 24. */
export const CYCLE_WEEKS = SEASONS_PER_CYCLE * SEASON_WEEKS;
/** First cycle that has variants (weeks 48-71). */
export const VARIANT_FIRST_CYCLE = 1;
/** Tints the variants of cycle c blend toward: VARIANT_TINTS[(c - 1) % length]. */
export const VARIANT_TINTS: readonly number[] = [0x2b59c3, 0x7b2d8e, 0x1b998b, 0xe4572e, 0x3d3b30, 0xf2e8cf];
/** Share of the tint in a variant colour. */
export const VARIANT_TINT_SHARE = 0.4;

const VARIANT_ID = /^(.+)_c(\d+)$/;

/** The cycle of a week (0 for weeks 24-47, 1 for 48-71, ...), or -1 before SEASON_FIRST_WEEK. */
export function cycleFor(week: number): number {
  const season = seasonFor(week);
  return season ? Math.floor(season.index / SEASONS_PER_CYCLE) : -1;
}

/** Tem price of a variant: base Tem * (1 + cycle). */
export function variantTickets(base: Pick<StyleDef, 'tickets'>, cycle: number): number {
  return base.tickets * (1 + cycle);
}

function mix(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

const variantCache = new Map<string, StyleDef>();

/** The variant id of a seasonal style for a cycle. */
export function variantId(baseId: string, cycle: number): string {
  return `${baseId}_c${cycle}`;
}

/** The colour variant of a seasonal style for a cycle >= VARIANT_FIRST_CYCLE, or undefined. */
export function seasonalVariant(baseId: string, cycle: number): StyleDef | undefined {
  if (!Number.isInteger(cycle) || cycle < VARIANT_FIRST_CYCLE) return undefined;
  const base = SEASONAL_STYLES.find((s) => s.id === baseId);
  if (!base) return undefined;
  const id = variantId(baseId, cycle);
  let v = variantCache.get(id);
  if (!v) {
    const tint = VARIANT_TINTS[(cycle - VARIANT_FIRST_CYCLE) % VARIANT_TINTS.length]!;
    v = {
      id,
      slot: base.slot,
      name: `${base.name} (bản ${cycle + 1})`,
      color: mix(base.color, tint, VARIANT_TINT_SHARE),
      accent: mix(base.accent, tint, VARIANT_TINT_SHARE),
      price: 0,
      tickets: variantTickets(base, cycle),
      season: base.season,
      cycle,
      baseId,
    };
    variantCache.set(id, v);
  }
  return v;
}

/** The variant an id names (`<seasonal id>_c<cycle>`), or undefined. */
export function variantById(id: string): StyleDef | undefined {
  const m = VARIANT_ID.exec(id);
  if (!m || String(Number(m[2])) !== m[2]) return undefined;
  return seasonalVariant(m[1]!, Number(m[2]));
}

/** The colour variants on sale in a week: those of the running set for cycles VARIANT_FIRST_CYCLE..current, newest cycle first. */
export function seasonalVariantsFor(week: number): StyleDef[] {
  const cycle = cycleFor(week);
  const out: StyleDef[] = [];
  for (let c = cycle; c >= VARIANT_FIRST_CYCLE; c--) for (const base of seasonalStylesFor(week)) out.push(seasonalVariant(base.id, c)!);
  return out;
}

/** First week a variant of a cycle of a set is on sale. */
export function variantFirstWeek(set: number, cycle: number): number {
  return SEASON_FIRST_WEEK + (cycle * SEASONS_PER_CYCLE + set) * SEASON_WEEKS;
}
