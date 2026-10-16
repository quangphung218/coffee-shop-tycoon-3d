import { totalUpgradeEffect } from './data/upgrades';
import { priceStarBonus } from './policies';
import type { DayStats, GameState } from './types';

export const MIN_RATING = 1;
export const MAX_RATING = 5;
/** Share of the gap to today's score that the rating moves each day. */
export const RATING_STEP = 0.5;

const WEIGHTS = { served: 0.35, speed: 0.25, clean: 0.2, calm: 0.2 } as const;

export interface DayQuality {
  /** Served / arrived. */
  serveRate: number;
  /** 1 − average share of patience spent waiting. */
  speed: number;
  /** 1 − share of served customers turned away from dirty seats. */
  cleanliness: number;
  /** 1 − share of customers who left angry. */
  calm: number;
}

export function dayQuality(stats: DayStats): DayQuality {
  const arrived = Math.max(1, stats.customersArrived);
  const served = Math.max(1, stats.customersServed);
  return {
    serveRate: stats.customersServed / arrived,
    speed: 1 - Math.min(1, (stats.waitShareSum ?? 0) / served),
    cleanliness: 1 - Math.min(1, (stats.dirtyTableHits ?? 0) / served),
    calm: 1 - Math.min(1, stats.customersLost / arrived),
  };
}

/** Star score earned by today's service alone, with upgrade, decor and price policy bonuses, 1..5. */
export function dayScore(state: GameState, stats: DayStats = state.today): number {
  const q = dayQuality(stats);
  const quality = WEIGHTS.served * q.serveRate + WEIGHTS.speed * q.speed + WEIGHTS.clean * q.cleanliness + WEIGHTS.calm * q.calm;
  const bonus = totalUpgradeEffect(state.upgrades ?? {}).ratingBonus + priceStarBonus(state);
  return clampRating(MIN_RATING + (MAX_RATING - MIN_RATING) * quality + bonus);
}

export function clampRating(r: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, r));
}

/** `from` moved halfway toward today's score, rounded to 0.01; unchanged on a day without customers. */
export function nextRating(state: GameState, from: number): number {
  if (state.today.customersArrived <= 0) return from;
  const next = from + (dayScore(state) - from) * RATING_STEP;
  return Math.round(clampRating(next) * 100) / 100;
}

/**
 * Moves the rating halfway toward today's score and records it as ratingEnd.
 * A day without customers leaves it unchanged. Tomorrow's arrivals scale with
 * the rating through arrivalRate in customers.ts.
 */
export function updateRating(state: GameState): number {
  state.rating = nextRating(state, state.rating);
  state.today.ratingEnd = state.rating;
  return state.rating;
}
