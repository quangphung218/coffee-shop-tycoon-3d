import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { SCALED_GOAL_MIN_LEVEL, SCALED_GOAL_RATIO, SCALED_GOAL_WEEKS, WEEK_LENGTH, scaledWeekGoal, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, WeekSummary } from '../../src/sim/types';
import { isWeekGoalScaled, nextWeekGoal, rollWeekPlan } from '../../src/sim/week';

const SEED = 1919;
const round = (v: number) => Math.round(v / 100_000) * 100_000;

function row(index: number, revenue: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/**
 * A normal game at shop level `level` on the report of week `index`'s last
 * day, scored, with archive rows of the given revenues (last one is this week).
 */
function atWeekReport(index: number, level: number, revenues: readonly number[]): GameState {
  const state = createNewGame('Quán Lớn', 'normal', SEED);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.shopLevel = level;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = 'report';
  const archive = revenues.map((r, i) => row(index - revenues.length + 1 + i, r));
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(SEED, index), goal: weekGoal('normal', index), archive };
  state.week.result = { revenue: revenues.at(-1) ?? 0, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
  return state;
}

describe('scaledWeekGoal', () => {
  it('is weekGoal below level 10 whatever the revenue', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (let index = 1; index <= 12; index++) {
        expect(scaledWeekGoal(d, index, SCALED_GOAL_MIN_LEVEL - 1, [900_000_000, 900_000_000])).toEqual({ goal: weekGoal(d, index), scaled: false });
      }
    }
  });

  it('from level 10 asks the larger of weekGoal and the ratio of the last 4 weeks average', () => {
    const base = weekGoal('normal', 12);
    const revenues = [10_000_000, 200_000_000, 220_000_000, 240_000_000, 260_000_000];
    const avg = (200_000_000 + 220_000_000 + 240_000_000 + 260_000_000) / SCALED_GOAL_WEEKS;
    const r = scaledWeekGoal('normal', 12, 10, revenues);
    expect(r.scaled).toBe(true);
    expect(r.goal).toEqual({ revenue: round(avg * SCALED_GOAL_RATIO), stars: base.stars });
    expect(r.goal.revenue).toBeGreaterThan(base.revenue);
  });

  it('keeps weekGoal when the recent revenue asks less, or there is none', () => {
    expect(scaledWeekGoal('normal', 12, 15, [1_000_000, 1_000_000, 1_000_000, 1_000_000])).toEqual({ goal: weekGoal('normal', 12), scaled: false });
    expect(scaledWeekGoal('normal', 12, 15, [])).toEqual({ goal: weekGoal('normal', 12), scaled: false });
  });

  it('keeps a ratio that asks less than the recent average', () => {
    expect(SCALED_GOAL_RATIO).toBeGreaterThan(0.5);
    expect(SCALED_GOAL_RATIO).toBeLessThan(1);
  });
});

describe('next week at level 10+', () => {
  const big = [150_000_000, 160_000_000, 170_000_000, 180_000_000];
  const scaledRevenue = round(((150_000_000 + 160_000_000 + 170_000_000 + 180_000_000) / 4) * SCALED_GOAL_RATIO);

  it('opens with the scaled goal and marks it for the UI; nextWeekGoal previews it', () => {
    const s = atWeekReport(10, 10, big);
    expect(nextWeekGoal(s)).toEqual({ goal: { revenue: scaledRevenue, stars: weekGoal('normal', 11).stars }, scaled: true });
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.index).toBe(11);
    expect(s.week!.goal.revenue).toBe(scaledRevenue);
    expect(isWeekGoalScaled(s)).toBe(true);
  });

  it('below level 10 opens with weekGoal, unmarked', () => {
    const s = atWeekReport(10, 9, big);
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.goal).toEqual(weekGoal('normal', 11));
    expect(s.week!.goalScaled).toBeUndefined();
    expect(isWeekGoalScaled(s)).toBe(false);
  });

  it('at level 10 with small revenue opens with weekGoal, unmarked', () => {
    const s = atWeekReport(10, 12, [1_000_000]);
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.goal).toEqual(weekGoal('normal', 11));
    expect(isWeekGoalScaled(s)).toBe(false);
  });
});

describe('saves from before E-19 already at level 10', () => {
  function load(state: GameState): GameState {
    const storage = createMemoryStorage();
    storage.setItem(saveKey('auto'), JSON.stringify({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } }));
    const r = loadGame('auto', storage);
    expect(r.ok).toBe(true);
    return (r as { ok: true; value: GameState }).value;
  }

  it('keep the running week goal, then the next week gets the new rule', () => {
    const old = createNewGame('Quán Cũ E19', 'normal', SEED);
    old.shopLevel = 11;
    old.day = 9 * WEEK_LENGTH + 3;
    old.today = createDayStats(old.day, old.rating);
    old.phase = 'opening';
    old.week = {
      length: WEEK_LENGTH,
      index: 10,
      startedDay: 9 * WEEK_LENGTH + 1,
      plan: rollWeekPlan(SEED, 10),
      goal: weekGoal('normal', 10),
      archive: [6, 7, 8, 9].map((i) => row(i, 200_000_000)),
    };
    const s = load(old);
    expect(s.week!.goal).toEqual(weekGoal('normal', 10));
    expect(isWeekGoalScaled(s)).toBe(false);

    s.day = s.week!.startedDay + WEEK_LENGTH - 1;
    s.today = createDayStats(s.day, s.rating);
    s.phase = 'report';
    s.week!.archive!.push(row(10, 200_000_000));
    s.week!.result = { revenue: 200_000_000, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.index).toBe(11);
    expect(s.week!.goal.revenue).toBe(round(200_000_000 * SCALED_GOAL_RATIO));
    expect(isWeekGoalScaled(s)).toBe(true);
  });
});
