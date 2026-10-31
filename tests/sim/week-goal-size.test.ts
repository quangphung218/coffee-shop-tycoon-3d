import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import {
  SCALED_GOAL_MIN_LEVEL,
  SIZE_GOAL,
  SIZE_GOAL_FIRST_WEEK,
  SIZE_GOAL_MAX_LEVELS,
  WEEK_LENGTH,
  goalProfitTarget,
  scaledWeekGoal,
  sizeGoal,
  weekGoal,
  weekProfitTarget,
} from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, WeekGoal, WeekSummary } from '../../src/sim/types';
import { nextWeekGoal, rollWeekPlan, scoreWeek, totalUpgradeLevels } from '../../src/sim/week';

const SEED = 2121;
const DIFFS = ['easy', 'normal', 'hard'] as const;

function row(index: number, revenue: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/** A normal game on the last day of week `index` at shop level `level`, the day's revenue set, not yet scored. */
function lastDayOf(index: number, level: number, goal: WeekGoal, revenues: readonly number[] = []): GameState {
  const state = createNewGame('Quán Cỡ', 'normal', SEED);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.shopLevel = level;
  state.upgrades = { tables: 4, better_machine: 3, fast_machine: 2 };
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.today.revenue = 50_000_000;
  state.phase = 'report';
  const archive = revenues.map((r, i) => row(index - revenues.length + i, r));
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(SEED, index), goal, archive };
  return state;
}

function load(state: GameState): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), JSON.stringify({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } }));
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('SIZE_GOAL', () => {
  it('has a {revenue, profit} row for 0..77 total upgrade levels on every difficulty', () => {
    for (const d of DIFFS) {
      expect(SIZE_GOAL[d]).toHaveLength(SIZE_GOAL_MAX_LEVELS + 1);
      for (const r of SIZE_GOAL[d]) {
        expect(r.revenue).toBeGreaterThan(0);
        expect(Number.isFinite(r.profit)).toBe(true);
      }
    }
  });

  it('generated rows: positive, rounded to 100.000 đồng and non-decreasing in levels', () => {
    for (const d of DIFFS) {
      SIZE_GOAL[d].forEach((r, i) => {
        expect(r.profit, `${d} ${i}`).toBeGreaterThan(0);
        expect(r.revenue % 100_000, `${d} ${i}`).toBe(0);
        expect(r.profit % 100_000, `${d} ${i}`).toBe(0);
        const prev = SIZE_GOAL[d][i - 1];
        if (!prev) return;
        expect(r.revenue, `${d} revenue ${i}`).toBeGreaterThanOrEqual(prev.revenue);
        expect(r.profit, `${d} profit ${i}`).toBeGreaterThanOrEqual(prev.profit);
      });
      // A full shop asks for well more than an empty one.
      expect(sizeGoal(d, SIZE_GOAL_MAX_LEVELS).revenue).toBeGreaterThan(5 * sizeGoal(d, 0).revenue);
    }
  });

  it('sizeGoal clamps the index', () => {
    for (const d of DIFFS) {
      expect(sizeGoal(d, -3)).toBe(SIZE_GOAL[d][0]);
      expect(sizeGoal(d, 0)).toBe(SIZE_GOAL[d][0]);
      expect(sizeGoal(d, 12.7)).toBe(SIZE_GOAL[d][12]);
      expect(sizeGoal(d, SIZE_GOAL_MAX_LEVELS)).toBe(SIZE_GOAL[d][SIZE_GOAL_MAX_LEVELS]);
      expect(sizeGoal(d, 500)).toBe(SIZE_GOAL[d][SIZE_GOAL_MAX_LEVELS]);
      expect(sizeGoal(d, Number.NaN)).toBe(SIZE_GOAL[d][0]);
    }
  });
});

describe('goal.profit in scoreWeek', () => {
  it('a goal without profit scores against weekProfitTarget of its revenue', () => {
    const goal = { revenue: 300_000_000, stars: 4 };
    const r = scoreWeek(lastDayOf(12, 11, goal))!;
    expect(r.profitTarget).toBe(weekProfitTarget('normal', goal.revenue));
    expect(goalProfitTarget('normal', goal)).toBe(weekProfitTarget('normal', goal.revenue));
  });

  it('a goal with profit scores against it', () => {
    const goal = { revenue: 300_000_000, stars: 4, profit: 123_400_000 };
    const s = lastDayOf(12, 11, goal);
    const r = scoreWeek(s)!;
    expect(r.profitTarget).toBe(123_400_000);
    expect(r.revenueTarget).toBe(300_000_000);
    // Only the profit target differs from the same goal without profit.
    const plain = scoreWeek(lastDayOf(12, 11, { revenue: 300_000_000, stars: 4 }))!;
    expect({ ...r, profitTarget: 0, score: 0, cups: 0 }).toEqual({ ...plain, profitTarget: 0, score: 0, cups: 0 });
  });
});

describe('saves with an E-19 goal at level 10+', () => {
  it('score the running week as before; the next week uses SIZE_GOAL', () => {
    const e19Goal = { revenue: 180_000_000, stars: 4 };
    const old = lastDayOf(12, 11, e19Goal, [200_000_000, 200_000_000, 200_000_000, 200_000_000]);
    old.week!.goalScaled = true;
    const s = load(old);
    expect(s.week!.goal).toEqual(e19Goal);

    const r = scoreWeek(s)!;
    expect(r.revenueTarget).toBe(e19Goal.revenue);
    expect(r.profitTarget).toBe(weekProfitTarget('normal', e19Goal.revenue));

    s.week!.result = r;
    s.week!.archive!.push(row(12, r.revenue));
    const levels = totalUpgradeLevels(s);
    expect(levels).toBe(9);
    const size = sizeGoal('normal', levels);
    expect(nextWeekGoal(s)).toEqual({ goal: { revenue: size.revenue, stars: weekGoal('normal', 13).stars, profit: size.profit }, scaled: false });
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.index).toBe(13);
    expect(s.week!.goal).toEqual({ revenue: size.revenue, stars: weekGoal('normal', 13).stars, profit: size.profit });
    expect(s.week!.goalScaled).toBeUndefined();
  });

  it('a mid-week save keeps its goal until the week ends', () => {
    const goal = { revenue: 180_000_000, stars: 4 };
    const old = lastDayOf(12, 11, goal);
    old.day -= 3;
    old.today = createDayStats(old.day, old.rating);
    old.phase = 'opening';
    expect(load(old).week!.goal).toEqual(goal);
  });
});

describe('weeks 1-8 and shops below level 10', () => {
  it('nextWeekGoal for weeks 2..8 is the E-19 goal at any level', () => {
    const revenues = [400_000_000, 400_000_000, 400_000_000, 400_000_000];
    for (let index = 1; index < SIZE_GOAL_FIRST_WEEK - 1; index++) {
      for (const level of [1, 5, SCALED_GOAL_MIN_LEVEL - 1, SCALED_GOAL_MIN_LEVEL, 15]) {
        const s = lastDayOf(index, level, weekGoal('normal', index), revenues.slice(0, Math.min(4, index - 1)));
        s.week!.archive!.push(row(index, 400_000_000));
        const past = s.week!.archive!.map((w) => w.revenue);
        const expected = scaledWeekGoal('normal', index + 1, level, past);
        expect(nextWeekGoal(s), `week ${index + 1} level ${level}`).toEqual(expected);
        expect(nextWeekGoal(s).goal.profit).toBeUndefined();
      }
    }
  });

  it('below level 10 weeks 9+ keep weekGoal', () => {
    for (const index of [8, 12, 30]) {
      const s = lastDayOf(index, SCALED_GOAL_MIN_LEVEL - 1, weekGoal('normal', index));
      expect(nextWeekGoal(s)).toEqual({ goal: weekGoal('normal', index + 1), scaled: false });
    }
  });

  it('from week 9 at level 10 the goal is the SIZE_GOAL row', () => {
    const s = lastDayOf(SIZE_GOAL_FIRST_WEEK - 1, SCALED_GOAL_MIN_LEVEL, weekGoal('normal', 8));
    expect(nextWeekGoal(s).goal.profit).toBe(sizeGoal('normal', totalUpgradeLevels(s)).profit);
  });
});
