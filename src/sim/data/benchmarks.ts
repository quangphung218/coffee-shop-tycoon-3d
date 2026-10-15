import type { InsightStatus } from '../types';

/**
 * Operating benchmarks for the management insights, adapted to this game.
 * Percentages are of revenue unless noted. These are coaching thresholds, not
 * exact accounting figures.
 *
 * Industry rules of thumb for cafés/restaurants used as reference:
 * - Food cost (COGS) ≈ 28–35% of sales; a labour cost ≈ 25–35% of sales.
 * - Prime cost (COGS + labour) ≤ 65% of sales is considered healthy, ~70% is
 *   the upper limit before margins get thin.
 * (See general restaurant operations guidance, e.g. Toast / restaurant P&L
 * primers. Numbers are tuned for the game's economy, not copied verbatim.)
 */

/** 07:00–20:00 service window in game minutes; the denominator for seat fill. */
export const SERVICE_MINUTES = 13 * 60;

/** Lower is better: at or below `good` is healthy, at or below `watch` needs an eye, above is bad. */
export interface LowerBand {
  good: number;
  watch: number;
}

/** Higher is better: at or above `good` is healthy, at or above `watch` needs an eye, below is bad. */
export interface UpperBand {
  good: number;
  watch: number;
}

/** Food cost (COGS) as a share of revenue. */
export const FOOD_COST_PCT: LowerBand = { good: 35, watch: 40 };
/** Labour (wages) as a share of revenue. */
export const LABOR_PCT: LowerBand = { good: 35, watch: 40 };
/** Prime cost (COGS + wages) as a share of revenue. */
export const PRIME_COST_PCT: LowerBand = { good: 65, watch: 72 };
/** Customers who left without being served, as a share of arrivals. */
export const ABANDON_PCT: LowerBand = { good: 10, watch: 20 };
/** Average wait from the door to getting the drink, in game minutes. */
export const AVG_WAIT_MINUTES: LowerBand = { good: 8, watch: 15 };
/** Wasted ingredients as a share of COGS. */
export const WASTE_PCT_OF_COGS: LowerBand = { good: 5, watch: 12 };
/** Seat occupancy over the service window; a high figure means too few seats. */
export const SEAT_FILL_PCT: LowerBand = { good: 70, watch: 90 };
/** Gross margin per menu item (higher is better). */
export const ITEM_MARGIN_PCT: UpperBand = { good: 65, watch: 58 };

/** Status for a lower-is-better value against a band. */
export function lowerStatus(value: number, band: LowerBand): InsightStatus {
  if (value <= band.good) return 'good';
  if (value <= band.watch) return 'watch';
  return 'bad';
}

/** Status for a higher-is-better value against a band. */
export function upperStatus(value: number, band: UpperBand): InsightStatus {
  if (value >= band.good) return 'good';
  if (value >= band.watch) return 'watch';
  return 'bad';
}
