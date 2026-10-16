import { rollWeather } from './customers';
import { DAY_EVENTS, WEEK_GOALS, WEEK_LENGTH } from './data/week';
import { weekDay } from './progression';
import { weightedIndex, type RngHolder } from './rng';
import type { DayEventId, DayPlan, GameState, WeekResult } from './types';

/** Draw weights of the events on days 2..WEEK_LENGTH; the grand opening is day 1 only. */
const EVENT_WEIGHTS: Readonly<Record<Exclude<DayEventId, 'grand_opening'>, number>> = {
  none: 0.4,
  fair: 0.3,
  supplier_hike: 0.3,
};

/** Whole-week draws tried before falling back to FALLBACK_PLAN. */
const MAX_ATTEMPTS = 64;

/** Valid week used if no draw passes the rules (practically never). */
const FALLBACK_PLAN: readonly DayPlan[] = [
  { day: 1, weather: 'sunny', event: 'grand_opening' },
  { day: 2, weather: 'rainy', event: 'none' },
  { day: 3, weather: 'sunny', event: 'fair' },
  { day: 4, weather: 'hot', event: 'supplier_hike' },
  { day: 5, weather: 'hot', event: 'none' },
  { day: 6, weather: 'rainy', event: 'fair' },
  { day: 7, weather: 'sunny', event: 'supplier_hike' },
];

/** Keeps week draws apart from the daily missions, which hash the same seed and day. */
const WEEK_SALT = 0x5bd1e995;

/** A stable 32-bit hash of the seed and a draw index, independent of the game RNG (same mix as dayHash). */
function planHash(seed: number, index: number): number {
  let h = ((seed >>> 0) ^ WEEK_SALT ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** One day of a draw: weather and event, redrawn until something differs from a plain sunny day. */
function rollDay(seed: number, day: number, attempt: number): DayPlan {
  const rng: RngHolder = { rngState: planHash(seed, attempt * WEEK_LENGTH + day) };
  const events = Object.keys(EVENT_WEIGHTS) as (keyof typeof EVENT_WEIGHTS)[];
  for (;;) {
    const weather = rollWeather(rng);
    const event = events[weightedIndex(rng, events.map((e) => EVENT_WEIGHTS[e]))] ?? 'none';
    if (weather !== 'sunny' || event !== 'none') return { day, weather, event };
  }
}

/**
 * The rules every week plan keeps: day 1 is sunny with the grand opening,
 * every day has rain, heat or an event, no two days in a row are the same,
 * and the week has at least one rainy day, one fair and one supplier hike.
 */
export function isValidWeekPlan(plan: readonly DayPlan[]): boolean {
  if (plan.length !== WEEK_LENGTH) return false;
  const first = plan[0];
  if (!first || first.weather !== 'sunny' || first.event !== 'grand_opening') return false;
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    if (p.day !== i + 1) return false;
    if (p.weather === 'sunny' && p.event === 'none') return false;
    const prev = plan[i - 1];
    if (prev && prev.weather === p.weather && prev.event === p.event) return false;
  }
  return (
    plan.some((p) => p.weather === 'rainy') &&
    plan.some((p) => p.event === 'fair') &&
    plan.some((p) => p.event === 'supplier_hike')
  );
}

/**
 * Weather and event of each day of the week. Each day draws from a hash of the
 * seed and the day, never from `state.rngState`; a week that breaks the rules
 * (isValidWeekPlan) is drawn again with the next attempt's hashes.
 */
export function rollWeekPlan(seed: number): DayPlan[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const plan: DayPlan[] = [{ day: 1, weather: 'sunny', event: 'grand_opening' }];
    for (let day = 2; day <= WEEK_LENGTH; day++) plan.push(rollDay(seed, day, attempt));
    if (isValidWeekPlan(plan)) return plan;
  }
  return FALLBACK_PLAN.map((p) => ({ ...p }));
}

/** Plan of today, or null when the game has no week plan or today is outside the week. */
export function todayPlan(state: GameState): DayPlan | null {
  const plan = state.week?.plan;
  if (!plan) return null;
  return plan.find((p) => p.day === weekDay(state)) ?? null;
}

/** Today's event multiplier on customer arrivals; 1 without a plan. */
export function dayArrivalMult(state: GameState): number {
  const plan = todayPlan(state);
  return plan ? DAY_EVENTS[plan.event].arrivalMult : 1;
}

/** Score points for reaching the revenue target and the stars target. */
export const SCORE_REVENUE = 60;
export const SCORE_STARS = 40;

/** Lowest score for each cup count, most cups first. */
const CUP_THRESHOLDS: readonly (readonly [number, number])[] = [
  [90, 3],
  [70, 2],
  [40, 1],
];

/** Score 0..100 of a week from its revenue and stars against the targets. */
export function weekScore(revenue: number, revenueTarget: number, stars: number, starsTarget: number): number {
  const share = (value: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, value) / target) : 1);
  return Math.round(SCORE_REVENUE * share(revenue, revenueTarget) + SCORE_STARS * share(stars, starsTarget));
}

/** Cups 0..3 for a week score. */
export function weekCups(score: number): number {
  return CUP_THRESHOLDS.find(([min]) => score >= min)?.[1] ?? 0;
}

/** True when today is the last day of the week. */
export function isLastWeekDay(state: GameState): boolean {
  return state.week !== undefined && weekDay(state) === state.week.length;
}

/**
 * Scores the week from today's and the earlier week days' stats: revenue is
 * the sum over the week, stars the current rating. Call once today's day is
 * settled. Null when the game has no week.
 */
export function scoreWeek(state: GameState): WeekResult | null {
  const week = state.week;
  if (!week) return null;
  // Saves made before goals existed fall back to the difficulty's targets.
  const goal = week.goal ?? WEEK_GOALS[state.difficulty];
  const lastDay = week.startedDay + week.length - 1;
  const stats = [...state.history, state.today].filter(
    (d) => d.day >= week.startedDay && d.day <= lastDay,
  );
  const days = stats.map((d) => {
    const day = d.day - week.startedDay + 1;
    const plan = week.plan.find((p) => p.day === day);
    return {
      day,
      revenue: d.revenue,
      customersServed: d.customersServed,
      weather: plan?.weather ?? (d === state.today ? state.weather : 'sunny'),
      event: plan?.event ?? 'none',
    };
  });
  const revenue = days.reduce((s, d) => s + d.revenue, 0);
  const stars = state.rating;
  const score = weekScore(revenue, goal.revenue, stars, goal.stars);
  return {
    revenue,
    revenueTarget: goal.revenue,
    stars,
    starsTarget: goal.stars,
    score,
    cups: weekCups(score),
    days,
  };
}

/** Today's event multiplier on ingredient prices; 1 without a plan. */
export function dayIngredientPriceMult(state: GameState): number {
  const plan = todayPlan(state);
  return plan ? DAY_EVENTS[plan.event].ingredientPriceMult : 1;
}
