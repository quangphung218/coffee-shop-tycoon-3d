import { describe, expect, it } from 'vitest';
import { UPGRADE_AMORTIZE_WEEKS, WEEK_GOALS, WEEK_GOAL_LATE_GROWTH, WEEK_GOAL_MULTS, WEEK_LENGTH, upgradeAmortizeWeeks, weekGoal, weekGoalMult, weekProfitTarget } from '../../src/sim/data/week';
import { profit } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { weekDay } from '../../src/sim/progression';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, WeekResult } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, weekCups, weekProfit, weekScore, weekUpgradeCharge } from '../../src/sim/week';
import { playDay } from '../integration/helpers';

const SEED = 4242;

/** Plays `days` days from a fresh morning, serving alone; returns the events of each day. */
function playDays(state: GameState, days: number): GameEvent[][] {
  const out: GameEvent[][] = [];
  for (let i = 0; i < days; i++) {
    if (i > 0) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    out.push(playDay(state));
  }
  return out;
}

/** A state on week day 7 whose week revenue, ingredient cost and rating are set by hand. */
function scoredWith(revenue: number, stars: number, cost = 0): WeekResult {
  const state = createNewGame('Biên', 'normal', SEED);
  for (let day = 1; day < WEEK_LENGTH; day++) state.history.push(createDayStats(day, 4));
  state.day = WEEK_LENGTH;
  state.today = createDayStats(WEEK_LENGTH, 4);
  state.today.revenue = revenue;
  state.today.ingredientCost = cost;
  state.rating = stars;
  return scoreWeek(state)!;
}

/**
 * A normal game on the last day of week `index`, every earlier day in its
 * history: `buys` maps a game day to the upgrades bought on it, `daily` sets
 * the takings of every day.
 */
function atWeekEnd(index: number, buys: Record<number, number>, daily: { revenue?: number; ingredientCost?: number } = {}): GameState {
  const state = createNewGame('Khấu hao', 'normal', SEED);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  const lastDay = startedDay + WEEK_LENGTH - 1;
  // Earlier weeks scored with the spread: their archive rows carry upgradeCharge.
  const archive = Array.from({ length: index - 1 }, (_, i) => ({
    index: i + 1,
    startedDay: i * WEEK_LENGTH + 1,
    revenue: 0,
    profit: 0,
    customersServed: 0,
    stars: 4,
    score: 0,
    cups: 0,
    upgradeCharge: 0,
  }));
  state.week = { ...state.week!, index, startedDay, plan: rollWeekPlan(SEED, index), goal: weekGoal('normal', index), archive };
  const day = (d: number) => Object.assign(createDayStats(d, 4), daily, { upgradeCost: buys[d] ?? 0 });
  state.history = Array.from({ length: lastDay - 1 }, (_, i) => day(i + 1));
  state.day = lastDay;
  state.today = day(lastDay);
  state.rating = 4;
  return state;
}

describe('week goal', () => {
  it('sets the goal of a new game by difficulty', () => {
    expect(createNewGame('A', 'easy', SEED).week!.goal).toEqual(WEEK_GOALS.easy);
    expect(createNewGame('A', 'normal', SEED).week!.goal).toEqual(WEEK_GOALS.normal);
    expect(createNewGame('A', 'hard', SEED).week!.goal).toEqual(WEEK_GOALS.hard);
    expect(WEEK_GOALS.hard.revenue).toBeGreaterThanOrEqual(WEEK_GOALS.normal.revenue);
    expect(WEEK_GOALS.hard.stars).toBeGreaterThan(WEEK_GOALS.easy.stars);
  });
});

describe('end of the week', { timeout: 30_000 }, () => {
  const state = createNewGame('Quán Tuần', 'normal', SEED);
  const daily = playDays(state, WEEK_LENGTH);

  it('emits week_ended once, on day 7, after dayEnded', () => {
    const ended = daily.map((events) => events.filter((e) => e.type === 'week_ended').length);
    expect(ended).toEqual([0, 0, 0, 0, 0, 0, 1]);
    const last = daily[WEEK_LENGTH - 1]!;
    const dayEndedAt = last.findIndex((e) => e.type === 'dayEnded');
    const weekEndedAt = last.findIndex((e) => e.type === 'week_ended');
    expect(dayEndedAt).toBeGreaterThanOrEqual(0);
    expect(weekEndedAt).toBeGreaterThan(dayEndedAt);
    const event = last[weekEndedAt] as Extract<GameEvent, { type: 'week_ended' }>;
    expect(event.result).toEqual(state.week!.result);
  });

  it('stores a result with one row per day and the scoring formula applied', () => {
    const result = state.week!.result!;
    expect(result.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const stats = [...state.history, state.today];
    expect(result.days.map((d) => d.revenue)).toEqual(stats.map((d) => d.revenue));
    expect(result.days.map((d) => d.customersServed)).toEqual(stats.map((d) => d.customersServed));
    expect(result.days.map((d) => [d.weather, d.event])).toEqual(state.week!.plan.map((p) => [p.weather, p.event]));
    expect(result.revenue).toBe(stats.reduce((s, d) => s + d.revenue, 0));
    expect(result.revenue).toBeGreaterThan(0);
    expect(result.stars).toBe(Math.round(state.rating * 10) / 10);
    expect(result.revenueTarget).toBe(WEEK_GOALS.normal.revenue);
    expect(result.starsTarget).toBe(WEEK_GOALS.normal.stars);
    expect(result.profit).toBe(weekProfit(stats));
    expect(result.profitTarget).toBe(weekProfitTarget('normal', WEEK_GOALS.normal.revenue));
    const expected = Math.round(
      25 * Math.min(1, result.revenue / result.revenueTarget) +
        55 * Math.min(1, Math.max(0, result.profit!) / result.profitTarget!) +
        20 * Math.min(1, result.stars / result.starsTarget),
    );
    expect(result.score).toBe(expected);
    expect(result.cups).toBe(weekCups(expected));
  });

  it('lands the basic strategy well short of the revenue goal and below 3 cups', () => {
    const share = state.week!.result!.revenue / WEEK_GOALS.normal.revenue;
    expect(share).toBeGreaterThanOrEqual(0.55);
    expect(share).toBeLessThanOrEqual(0.8);
    expect(state.week!.result!.score).toBeLessThan(90);
  });

  it('adds one archive row with the week totals', () => {
    const result = state.week!.result!;
    const stats = [...state.history, state.today];
    expect(state.week!.archive).toEqual([
      {
        index: 1,
        startedDay: 1,
        revenue: result.revenue,
        profit: stats.reduce((s, d) => s + profit(d), 0),
        customersServed: stats.reduce((s, d) => s + d.customersServed, 0),
        stars: result.stars,
        score: result.score,
        cups: result.cups,
        upgradeCharge: 0,
      },
    ]);
  });

  it('opens week 2 on next_day: new start, index, plan and goal, result cleared', () => {
    const next = structuredClone(state);
    expect(next.phase).toBe('report');
    expect(dispatch(next, { type: 'next_day' })).toBe(true);
    expect(next.day).toBe(WEEK_LENGTH + 1);
    expect(next.phase).toBe('preparation');
    expect(next.week).toMatchObject({ length: WEEK_LENGTH, index: 2, startedDay: WEEK_LENGTH + 1 });
    expect(next.week!.result).toBeUndefined();
    expect(next.week!.plan).toEqual(rollWeekPlan(SEED, 2));
    expect(next.week!.goal).toEqual(weekGoal('normal', 2));
    expect(next.week!.archive).toEqual(state.week!.archive);
    expect(weekDay(next)).toBe(1);
    expect(next.weather).toBe(next.week!.plan[0]!.weather);
  });
});

describe('weekGoal', () => {
  it('is WEEK_GOALS in week 1, then follows WEEK_GOAL_MULTS to week 4, stars unchanged', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const at = (mult: number) => Math.round((WEEK_GOALS[d].revenue * mult) / 100_000) * 100_000;
      expect(weekGoal(d, 1)).toEqual(WEEK_GOALS[d]);
      expect(WEEK_GOAL_MULTS[d]).toHaveLength(4);
      WEEK_GOAL_MULTS[d].forEach((mult, i) => expect(weekGoal(d, i + 1).revenue, `${d} week ${i + 1}`).toBe(at(mult)));
      for (let i = 2; i <= 8; i++) expect(weekGoal(d, i).stars).toBe(WEEK_GOALS[d].stars);
    }
  });

  it('rises in steps no bigger than week 2 asks, then slowly from week 5 with no cap (E-11)', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const steps = [2, 3, 4].map((i) => weekGoalMult(d, i) - weekGoalMult(d, i - 1));
      for (const s of steps) {
        expect(s, d).toBeGreaterThan(0);
        expect(s, d).toBeLessThanOrEqual(steps[0]! + 1e-9);
      }
      expect(WEEK_GOAL_LATE_GROWTH[d]).toBeGreaterThanOrEqual(0.1);
      expect(WEEK_GOAL_LATE_GROWTH[d]).toBeLessThanOrEqual(0.15);
      for (let i = 5; i <= 520; i++) {
        expect(weekGoalMult(d, i), `${d} week ${i}`).toBeCloseTo(WEEK_GOAL_MULTS[d][3]! + WEEK_GOAL_LATE_GROWTH[d] * (i - 4));
        expect(weekGoal(d, i).revenue, `${d} week ${i}`).toBeGreaterThan(weekGoal(d, i - 1).revenue);
      }
    }
  });
});

describe('week score formula', () => {
  const R = WEEK_GOALS.normal.revenue;
  const P = weekProfitTarget('normal', R);
  const S = WEEK_GOALS.normal.stars;

  it('weights revenue 25, profit 55 and stars 20, each capped at the target', () => {
    expect(scoredWith(R, S).score).toBe(100);
    expect(scoredWith(R * 2, 5).score).toBe(100);
    expect(scoredWith(0, 0).score).toBe(0);
    // Revenue at the target but costs eat the whole profit: only revenue and stars count.
    expect(scoredWith(R, S, R).score).toBe(45);
    // Half the profit target, revenue and stars reached.
    expect(scoredWith(R, S, R - P / 2).score).toBe(73);
    expect(scoredWith(R, S / 2).score).toBe(90);
    expect(weekScore({ revenue: 1, revenueTarget: 3, profit: 1, profitTarget: 3, stars: 1, starsTarget: 3 })).toBe(33);
  });

  it('counts the profit of the days less the upgrades bought, and a loss as 0 profit points', () => {
    const lost = scoredWith(R, S, R + 5_000_000);
    expect(lost.profit).toBe(-5_000_000);
    expect(lost.score).toBe(45);
    const state = createNewGame('Lãi', 'normal', SEED);
    for (let day = 1; day < WEEK_LENGTH; day++) state.history.push(createDayStats(day, 4));
    state.day = WEEK_LENGTH;
    state.today = createDayStats(WEEK_LENGTH, 4);
    Object.assign(state.today, { revenue: 10_000_000, ingredientCost: 2_000_000, wages: 1_000_000, marketingCost: 500_000, upgradeCost: 1_500_000 });
    expect(weekProfit([state.today])).toBe(profit(state.today) - 1_500_000);
    // The score pays half the upgrade in week 1, the rest next week (E-11).
    expect(scoreWeek(state)!.profit).toBe(5_000_000 + 1_500_000 / 2);
  });

  it('spreads week 1 upgrades like later weeks: half in week 1 (E-11)', () => {
    const state = atWeekEnd(1, { 3: 2_000_000, 7: 1_000_000 });
    expect(weekUpgradeCharge(state)).toBe(1_500_000);
    expect(scoreWeek(state)!.profit).toBe(weekProfit([...state.history, state.today], 1_500_000));
    expect(scoreWeek(state)!.profit).toBe(weekProfit([...state.history, state.today]) + 1_500_000);
  });

  it('spreads an upgrade over UPGRADE_AMORTIZE_WEEKS weeks, week 1 included', () => {
    expect(UPGRADE_AMORTIZE_WEEKS).toBe(2);
    const buys = { 3: 2_000_000, 10: 4_000_000, 17: 6_000_000, 24: 1_000_000 };
    // Week 2: the other half of week 1's, half of its own.
    expect(weekUpgradeCharge(atWeekEnd(2, buys))).toBe(1_000_000 + 2_000_000);
    // Week 3: the other half of week 2's, half of its own.
    expect(weekUpgradeCharge(atWeekEnd(3, buys))).toBe(2_000_000 + 3_000_000);
    // Week 4: week 2's is paid off.
    expect(weekUpgradeCharge(atWeekEnd(4, buys))).toBe(3_000_000 + 500_000);
    const state = atWeekEnd(3, buys);
    const days = [...state.history, state.today].filter((d) => d.day >= 15);
    expect(scoreWeek(state)!.profit).toBe(days.reduce((s, d) => s + profit(d), 0) - 5_000_000);
  });

  it('spreads over three weeks on Hard, two on Easy and Normal (E-11)', () => {
    expect([upgradeAmortizeWeeks('easy'), upgradeAmortizeWeeks('normal'), upgradeAmortizeWeeks('hard')]).toEqual([2, 2, 3]);
    const hard = (index: number) => {
      const state = atWeekEnd(index, { 3: 3_000_000, 10: 6_000_000 });
      state.difficulty = 'hard';
      return weekUpgradeCharge(state);
    };
    expect(hard(1)).toBe(1_000_000);
    expect(hard(2)).toBe(1_000_000 + 2_000_000);
    expect(hard(3)).toBe(1_000_000 + 2_000_000);
    expect(hard(4)).toBe(2_000_000);
    expect(hard(5)).toBe(0);
  });

  it('still scores spending beyond what the shop earns low, in the week bought and the next', () => {
    const daily = { revenue: 6_000_000, ingredientCost: 1_000_000 };
    const quiet = atWeekEnd(2, {}, daily);
    const reckless = atWeekEnd(2, { 9: 100_000_000 }, daily);
    expect(scoreWeek(reckless)!.profit).toBeLessThan(0);
    expect(scoreWeek(reckless)!.score).toBeLessThan(scoreWeek(quiet)!.score);
    expect(scoreWeek(atWeekEnd(3, { 9: 100_000_000 }, daily))!.score).toBeLessThan(scoreWeek(atWeekEnd(3, {}, daily))!.score);
  });

  it('does not reach the cap on revenue and stars alone, so spending less scores more', () => {
    // Same revenue and stars; the shop that spent 3M more on tools scores lower.
    const frugal = scoredWith(R * 0.9, S, R * 0.9 - P * 0.9);
    const spender = scoredWith(R * 0.9, S, R * 0.9 - P * 0.9 + 3_000_000);
    expect(frugal.score).toBeLessThan(100);
    expect(spender.score).toBeLessThan(frugal.score);
  });

  it('takes the profit target from the stored goal revenue, so goals of older saves still score', () => {
    const state = createNewGame('Cũ', 'hard', SEED);
    state.week!.goal = { revenue: 23_200_000, stars: 4.2 };
    state.day = WEEK_LENGTH;
    expect(scoreWeek(state)!.profitTarget).toBe(weekProfitTarget('hard', 23_200_000));
    delete (state.week as { goal?: unknown }).goal;
    expect(scoreWeek(state)!.revenueTarget).toBe(WEEK_GOALS.hard.revenue);
  });

  it('asks Hard for at least the revenue of Normal', () => {
    expect(WEEK_GOALS.hard.revenue).toBeGreaterThanOrEqual(WEEK_GOALS.normal.revenue);
    expect(WEEK_GOALS.hard.stars).toBeGreaterThanOrEqual(WEEK_GOALS.normal.stars);
  });

  it('sums every week day, not just day 7', () => {
    const state = createNewGame('Cộng', 'normal', SEED);
    for (let day = 1; day < WEEK_LENGTH; day++) {
      const stats = createDayStats(day, 4);
      stats.revenue = 1_000_000;
      state.history.push(stats);
    }
    state.day = WEEK_LENGTH;
    state.today = createDayStats(WEEK_LENGTH, 4);
    state.today.revenue = 500_000;
    expect(scoreWeek(state)!.revenue).toBe(6_500_000);
    expect(scoreWeek(state)!.profit).toBe(6_500_000);
  });

  it('rounds the stars to one decimal, like the shown rating, before judging the goal', () => {
    const reached = scoredWith(R, 3.96);
    expect(reached.starsTarget).toBe(4.0);
    expect(reached.stars).toBe(4.0);
    expect(reached.stars >= reached.starsTarget).toBe(true);
    expect(reached.score).toBe(100);

    const missed = scoredWith(R, 3.94);
    expect(missed.stars).toBe(3.9);
    expect(missed.stars >= missed.starsTarget).toBe(false);
    expect(missed.score).toBe(weekScore({ revenue: 1, revenueTarget: 1, profit: 1, profitTarget: 1, stars: 3.9, starsTarget: 4.0 }));
  });

  it('gives cups at 90, 70 and 40', () => {
    expect([100, 90, 89, 70, 69, 40, 39, 0].map(weekCups)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    expect(scoredWith(R, S).cups).toBe(3);
    expect(scoredWith(0, 0).cups).toBe(0);
  });
});

describe('save without a week', { timeout: 30_000 }, () => {
  it('never ends the week and keeps going past day 7', () => {
    const state = createNewGame('Quán Cũ', 'normal', SEED);
    delete state.week;
    const events = playDays(state, WEEK_LENGTH + 1).flat();
    expect(events.some((e) => e.type === 'week_ended')).toBe(false);
    expect(state.day).toBe(WEEK_LENGTH + 1);
    expect(scoreWeek(state)).toBeNull();
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  });
});
