import { describe, expect, it } from 'vitest';
import { WEEK_GOALS, WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { profit } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { weekDay } from '../../src/sim/progression';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, WeekResult } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, weekCups, weekScore } from '../../src/sim/week';
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

/** A state on week day 7 whose week revenue and rating are set by hand. */
function scoredWith(revenue: number, stars: number): WeekResult {
  const state = createNewGame('Biên', 'normal', SEED);
  for (let day = 1; day < WEEK_LENGTH; day++) state.history.push(createDayStats(day, 4));
  state.day = WEEK_LENGTH;
  state.today = createDayStats(WEEK_LENGTH, 4);
  state.today.revenue = revenue;
  state.rating = stars;
  return scoreWeek(state)!;
}

describe('week goal', () => {
  it('sets the goal of a new game by difficulty', () => {
    expect(createNewGame('A', 'easy', SEED).week!.goal).toEqual(WEEK_GOALS.easy);
    expect(createNewGame('A', 'normal', SEED).week!.goal).toEqual(WEEK_GOALS.normal);
    expect(createNewGame('A', 'hard', SEED).week!.goal).toEqual(WEEK_GOALS.hard);
    expect(WEEK_GOALS.easy.revenue).toBeGreaterThan(WEEK_GOALS.hard.revenue);
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
    const expected = Math.round(
      60 * Math.min(1, result.revenue / result.revenueTarget) + 40 * Math.min(1, result.stars / result.starsTarget),
    );
    expect(result.score).toBe(expected);
    expect(result.cups).toBe(weekCups(expected));
  });

  it('lands the basic strategy at 70–90% of the revenue goal', () => {
    const share = state.week!.result!.revenue / WEEK_GOALS.normal.revenue;
    expect(share).toBeGreaterThanOrEqual(0.7);
    expect(share).toBeLessThanOrEqual(0.9);
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
  it('is WEEK_GOALS in week 1, then grows 20% a week up to twice, stars unchanged', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(weekGoal(d, 1)).toEqual(WEEK_GOALS[d]);
      expect(weekGoal(d, 2).revenue).toBe(Math.round((WEEK_GOALS[d].revenue * 1.2) / 100_000) * 100_000);
      expect(weekGoal(d, 6).revenue).toBe(WEEK_GOALS[d].revenue * 2);
      expect(weekGoal(d, 30).revenue).toBe(WEEK_GOALS[d].revenue * 2);
      for (let i = 2; i <= 8; i++) {
        expect(weekGoal(d, i).revenue).toBeGreaterThanOrEqual(weekGoal(d, i - 1).revenue);
        expect(weekGoal(d, i).stars).toBe(WEEK_GOALS[d].stars);
      }
    }
  });
});

describe('week score formula', () => {
  it('weights revenue 60 and stars 40, each capped at the target', () => {
    expect(scoredWith(WEEK_GOALS.normal.revenue, WEEK_GOALS.normal.stars).score).toBe(100);
    expect(scoredWith(WEEK_GOALS.normal.revenue * 2, 5).score).toBe(100);
    expect(scoredWith(0, 0).score).toBe(0);
    expect(scoredWith(WEEK_GOALS.normal.revenue / 2, WEEK_GOALS.normal.stars).score).toBe(70);
    expect(scoredWith(WEEK_GOALS.normal.revenue, WEEK_GOALS.normal.stars / 2).score).toBe(80);
    expect(weekScore(1, 3, 1, 3)).toBe(33);
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
  });

  it('rounds the stars to one decimal, like the shown rating, before judging the goal', () => {
    const reached = scoredWith(WEEK_GOALS.normal.revenue, 3.96);
    expect(reached.starsTarget).toBe(4.0);
    expect(reached.stars).toBe(4.0);
    expect(reached.stars >= reached.starsTarget).toBe(true);
    expect(reached.score).toBe(100);

    const missed = scoredWith(WEEK_GOALS.normal.revenue, 3.94);
    expect(missed.stars).toBe(3.9);
    expect(missed.stars >= missed.starsTarget).toBe(false);
    expect(missed.score).toBe(weekScore(1, 1, 3.9, 4.0));
  });

  it('gives cups at 90, 70 and 40', () => {
    expect([100, 90, 89, 70, 69, 40, 39, 0].map(weekCups)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    expect(scoredWith(WEEK_GOALS.normal.revenue, WEEK_GOALS.normal.stars).cups).toBe(3);
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
