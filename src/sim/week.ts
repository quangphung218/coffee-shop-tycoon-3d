import { rollWeather } from './customers';
import { DAY_EVENTS, UPGRADE_AMORTIZE_WEEKS, WEEK_GOALS, WEEK_LENGTH, weekProfitTarget } from './data/week';
import { profit } from './economy';
import { weekDay, weekIndex } from './progression';
import { weightedIndex, type RngHolder } from './rng';
import type { DayEventId, DayPlan, DayStats, GameState, WeekResult, WeekSummary } from './types';

/** Draw weights of the events on the rolled days; the grand opening is day 1 of week 1 only. */
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

/** Day 1 of FALLBACK_PLAN from week 2 on, when there is no grand opening. */
const FALLBACK_LATER_DAY1: DayPlan = { day: 1, weather: 'hot', event: 'none' };

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

/** Seed of the draws for week `weekIndex`: the game seed itself for week 1, so its plan never changes. */
function weekSeed(seed: number, weekIndex: number): number {
  // Negative indices never collide with the draw indices (attempt * WEEK_LENGTH + day).
  return weekIndex <= 1 ? seed : planHash(seed, -weekIndex);
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
 * The rules every week plan keeps: day 1 of week 1 is sunny with the grand
 * opening and later weeks have no grand opening, every day has rain, heat or
 * an event, no two days in a row are the same, and the week has at least one
 * rainy day, one fair and one supplier hike.
 */
export function isValidWeekPlan(plan: readonly DayPlan[], weekIndex = 1): boolean {
  if (plan.length !== WEEK_LENGTH) return false;
  const first = plan[0];
  if (weekIndex <= 1) {
    if (!first || first.weather !== 'sunny' || first.event !== 'grand_opening') return false;
  } else if (plan.some((p) => p.event === 'grand_opening')) {
    return false;
  }
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
 * Weather and event of each day of week `weekIndex` (from 1). Each day draws
 * from a hash of the seed, the week and the day, never from `state.rngState`;
 * a week that breaks the rules (isValidWeekPlan) is drawn again with the next
 * attempt's hashes. Week 1 opens with the grand opening; later weeks roll day 1 too.
 */
export function rollWeekPlan(seed: number, weekIndex = 1): DayPlan[] {
  const first = weekIndex <= 1;
  const drawSeed = weekSeed(seed, weekIndex);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const plan: DayPlan[] = first ? [{ day: 1, weather: 'sunny', event: 'grand_opening' }] : [];
    for (let day = plan.length + 1; day <= WEEK_LENGTH; day++) plan.push(rollDay(drawSeed, day, attempt));
    if (isValidWeekPlan(plan, weekIndex)) return plan;
  }
  return FALLBACK_PLAN.map((p) => (first || p.day !== 1 ? { ...p } : { ...FALLBACK_LATER_DAY1 }));
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

/** Score points for reaching the revenue, profit and stars targets. */
export const SCORE_REVENUE = 25;
export const SCORE_PROFIT = 55;
export const SCORE_STARS = 20;

/** Lowest score for each cup count, most cups first. */
const CUP_THRESHOLDS: readonly (readonly [number, number])[] = [
  [90, 3],
  [70, 2],
  [40, 1],
];

export interface WeekScoreInput {
  revenue: number;
  revenueTarget: number;
  /** Week profit: weekProfit of its days. */
  profit: number;
  profitTarget: number;
  stars: number;
  starsTarget: number;
}

/**
 * Score 0..100 of a week from its revenue, profit and stars, each a share of
 * its target capped at 1. A loss scores no profit points.
 */
export function weekScore(w: WeekScoreInput): number {
  const share = (value: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, value) / target) : 1);
  return Math.round(
    SCORE_REVENUE * share(w.revenue, w.revenueTarget) +
      SCORE_PROFIT * share(w.profit, w.profitTarget) +
      SCORE_STARS * share(w.stars, w.starsTarget),
  );
}

/**
 * Profit of a run of days for the week score: the daily profit() (revenue
 * less ingredients, wages and marketing) less `upgradeCharge`, the share of
 * the upgrades and tools bought that this week pays (weekUpgradeCharge).
 * Without it every upgrade bought in these days counts in full.
 */
export function weekProfit(days: readonly DayStats[], upgradeCharge = days.reduce((s, d) => s + d.upgradeCost, 0)): number {
  return days.reduce((s, d) => s + profit(d), 0) - upgradeCharge;
}

/**
 * Upgrade spending the score of the current week counts against its profit.
 *
 * Week 1 pays all it bought, as before, so the opening week scores the same
 * (its goals are measured with tests/integration/p22-strategies.test.ts).
 * From week 2 an upgrade is paid in UPGRADE_AMORTIZE_WEEKS equal parts, the
 * week it is bought and the weeks after: a shop that reinvests its week-2
 * takings no longer scores below one that buys nothing (P23 measured c_spend
 * at 57–62 points against a_basic's 67–71 with the full charge), while
 * spending past what the shop earns still sinks the profit share for two weeks,
 * so reckless buying keeps scoring low. Two weeks rather than more because a
 * longer spread let the spenders max out weeks 3–4 at any goal a non-spender
 * can still take a cup from (tests/integration/p23-long-run.test.ts).
 * Earlier weeks are read from `state.history`, which keeps more days than the
 * spread needs; a week whose archive row has no upgradeCharge was scored
 * before the spread and paid its upgrades in full, so it carries nothing.
 * Rounded to whole đồng.
 */
export function weekUpgradeCharge(state: GameState): number {
  const week = state.week;
  if (!week) return 0;
  const index = weekIndex(state);
  const lastDay = week.startedDay + week.length - 1;
  let charge = 0;
  for (const d of [...state.history, state.today]) {
    if (d.upgradeCost <= 0 || d.day > lastDay) continue;
    // Weeks follow each other with no gap, so a day before this week falls in week index - ceil(gap / length).
    const bought = d.day >= week.startedDay ? index : index - Math.ceil((week.startedDay - d.day) / week.length);
    if (bought <= 1) {
      if (index <= 1) charge += d.upgradeCost;
    } else if (index - bought < UPGRADE_AMORTIZE_WEEKS && (bought === index || spreadInWeek(state, bought))) {
      charge += d.upgradeCost / UPGRADE_AMORTIZE_WEEKS;
    }
  }
  return Math.round(charge);
}

/** True when week `index` was scored with its upgrades spread (its archive row has upgradeCharge). */
function spreadInWeek(state: GameState, index: number): boolean {
  return state.week?.archive?.some((w) => w.index === index && w.upgradeCharge !== undefined) ?? false;
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
 * Scores the week from today's and the earlier week days' stats: revenue and
 * profit (weekProfit) are sums over the week, stars the current rating to one
 * decimal. The profit target comes from the goal's revenue (weekProfitTarget),
 * so goals stored by older saves score the same way. Call once today's day is
 * settled. Null when the game has no week. A result already stored is never
 * scored again.
 */
export function scoreWeek(state: GameState): WeekResult | null {
  const week = state.week;
  if (!week) return null;
  // Saves made before goals existed fall back to the difficulty's targets.
  const goal = week.goal ?? WEEK_GOALS[state.difficulty];
  const profitTarget = weekProfitTarget(state.difficulty, goal.revenue);
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
  // Rounded to one decimal like the shown rating, so "4,0 / 4,0" always reaches the goal.
  const stars = Math.round(state.rating * 10) / 10;
  const weekProfitSum = weekProfit(stats, weekUpgradeCharge(state));
  const score = weekScore({
    revenue,
    revenueTarget: goal.revenue,
    profit: weekProfitSum,
    profitTarget,
    stars,
    starsTarget: goal.stars,
  });
  return {
    revenue,
    revenueTarget: goal.revenue,
    profit: weekProfitSum,
    profitTarget,
    stars,
    starsTarget: goal.stars,
    score,
    cups: weekCups(score),
    days,
  };
}

/**
 * Archive row of the week just scored: the result's revenue, stars, score and
 * cups plus the profit and customers summed over its days. Null without a week.
 */
export function summarizeWeek(state: GameState, result: WeekResult): WeekSummary | null {
  const week = state.week;
  if (!week) return null;
  const lastDay = week.startedDay + week.length - 1;
  const stats = [...state.history, state.today].filter((d) => d.day >= week.startedDay && d.day <= lastDay);
  return {
    index: weekIndex(state),
    startedDay: week.startedDay,
    revenue: result.revenue,
    profit: stats.reduce((s, d) => s + profit(d), 0),
    customersServed: stats.reduce((s, d) => s + d.customersServed, 0),
    stars: result.stars,
    score: result.score,
    cups: result.cups,
    // Week 1 always pays its upgrades in full, so only later weeks record the charge.
    ...(weekIndex(state) > 1 ? { upgradeCharge: weekUpgradeCharge(state) } : {}),
  };
}

/** Today's event multiplier on ingredient prices; 1 without a plan. */
export function dayIngredientPriceMult(state: GameState): number {
  const plan = todayPlan(state);
  return plan ? DAY_EVENTS[plan.event].ingredientPriceMult : 1;
}
