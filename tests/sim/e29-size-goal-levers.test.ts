import { describe, expect, it } from 'vitest';
import { challengeSize } from '../../src/sim/challenges';
import { getUpgrade } from '../../src/sim/data/upgrades';
import {
  LEVEL_CURVE,
  NON_DECOR_FLOOR_RATIO,
  NON_DECOR_FLOOR_WEEKS,
  SCALED_GOAL_MIN_LEVEL,
  SIZE_GOAL_FIRST_WEEK,
  SIZE_GOAL_MAX_LEVELS,
  TRAINING_ROW_LEVELS,
  WEEK_LENGTH,
  sizeGoal,
  sizeGoalRowIndex,
  weekGoal,
} from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, Staff, WeekGoal } from '../../src/sim/types';
import { nextWeekGoal, rollWeekPlan, sizeGoalExtra, sizeGoalRowOf, totalUpgradeLevels } from '../../src/sim/week';

const SEED = 2929;
const DIFFS = ['easy', 'normal', 'hard'] as const;
const floorOf = (d: (typeof DIFFS)[number], week: number) => Math.floor(0.85 * LEVEL_CURVE[d][week - 1]!);

/** A normal game on the last day of week `index` at level 12 with two staff at `levels`, not yet scored. */
function lastDayOf(index: number, levels: readonly number[], upgrades: GameState['upgrades'], goal: WeekGoal = weekGoal('normal', index)): GameState {
  const state = createNewGame('Quán Cấp', 'normal', SEED);
  for (const [i, c] of [...state.candidates].slice(0, levels.length).entries()) {
    expect(dispatch(state, { type: 'hire_staff', candidateId: c.id, role: i === 0 ? 'barista' : 'server' })).toBe(true);
  }
  state.staff.forEach((m: Staff, i) => (m.level = levels[i]));
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.shopLevel = 12;
  state.upgrades = upgrades;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.today.revenue = 50_000_000;
  state.phase = 'report';
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(SEED, index), goal, archive: [] };
  return state;
}

describe('E-29 SIZE_GOAL row: training levels (k)', () => {
  it('adds TRAINING_ROW_LEVELS (k = 1) rows per training level, still clamped to the table', () => {
    expect(TRAINING_ROW_LEVELS).toBe(1);
    for (const d of DIFFS) {
      for (const week of [9, 20, 25, 35]) {
        const above = floorOf(d, week) + 2;
        expect(sizeGoalRowIndex(d, week, above, { trainingLevels: 0 })).toBe(above);
        expect(sizeGoalRowIndex(d, week, above, { trainingLevels: 5 })).toBe(above + 5);
        // Training under the floor only moves the row once levels + training pass it.
        expect(sizeGoalRowIndex(d, week, 0, { trainingLevels: 3 })).toBe(Math.max(3, floorOf(d, week)));
      }
      expect(sizeGoalRowIndex(d, 35, SIZE_GOAL_MAX_LEVELS - 1, { trainingLevels: 8 })).toBe(SIZE_GOAL_MAX_LEVELS);
      expect(sizeGoalRowIndex(d, 35, 60, { trainingLevels: Number.NaN })).toBe(60);
      expect(sizeGoalRowIndex(d, 35, 60, { trainingLevels: -4 })).toBe(60);
    }
  });

  it('without training or non-decor levels the row is the E-24 one (b_steady2, the generators)', () => {
    for (const d of DIFFS) {
      for (const week of [9, 21, 30, 40]) {
        for (const levels of [0, 30, 71]) {
          const e24 = Math.min(SIZE_GOAL_MAX_LEVELS, Math.max(levels, floorOf(d, week)));
          expect(sizeGoalRowIndex(d, week, levels)).toBe(e24);
          expect(sizeGoalRowIndex(d, week, levels, {})).toBe(e24);
        }
      }
    }
  });
});

describe('E-29 SIZE_GOAL row: non-decor floor in weeks 21-30', () => {
  it('reads at least floor(1.6 x non-decor levels) in weeks 21..30 only', () => {
    expect(NON_DECOR_FLOOR_RATIO).toBe(1.6);
    expect(NON_DECOR_FLOOR_WEEKS).toEqual([21, 30]);
    for (const d of DIFFS) {
      // 41 non-decor levels and no decor (b2_nodecor's shop): row 65 in weeks 21-30.
      for (const week of [21, 25, 30]) expect(sizeGoalRowIndex(d, week, 41, { nonDecorLevels: 41 })).toBe(Math.max(65, floorOf(d, week)));
      for (const week of [9, 20, 31, 40]) expect(sizeGoalRowIndex(d, week, 41, { nonDecorLevels: 41 })).toBe(Math.max(41, floorOf(d, week)));
      // A shop with decor bought like b_steady2 (total / non-decor >= 1.6) keeps its own levels.
      expect(sizeGoalRowIndex(d, 25, 56, { nonDecorLevels: 34 })).toBe(Math.max(56, floorOf(d, 25)));
    }
  });
});

describe('E-29 sizeGoalExtra / nextWeekGoal', () => {
  const upgrades = { tables: 4, better_machine: 3, fast_machine: 2, plants: 2, paintings: 1 };

  it('counts level - 1 of every employed member and the levels outside decor', () => {
    expect(getUpgrade('plants').category).toBe('decor');
    expect(getUpgrade('paintings').category).toBe('decor');
    expect(getUpgrade('tables').category).not.toBe('decor');
    const s = lastDayOf(20, [3, 2], upgrades);
    expect(totalUpgradeLevels(s)).toBe(12);
    expect(sizeGoalExtra(s)).toEqual({ trainingLevels: 3, nonDecorLevels: 9 });
    expect(sizeGoalExtra(lastDayOf(20, [], {}))).toEqual({ trainingLevels: 0, nonDecorLevels: 0 });
  });

  it('the next week goal and challenge read the same row, raised by training', () => {
    const big = { tables: 5, better_machine: 3, fast_machine: 3, big_counter: 3, outdoor_seating: 3, expand_area: 3, grinder: 3, pastry_case: 3, blender: 3, ice_maker: 3, dishwasher: 3, cold_brew_tower: 3, oven: 3, plants: 3, paintings: 3, lights: 2 };
    const untrained = lastDayOf(19, [1, 1], big);
    const trained = lastDayOf(19, [4, 3], big);
    const levels = totalUpgradeLevels(trained);
    expect(levels).toBeGreaterThan(floorOf('normal', 20));
    expect(nextWeekGoal(untrained).goal.row).toBe(levels);
    const g = nextWeekGoal(trained).goal;
    expect(g.row).toBe(levels + 5);
    expect(g.levels).toBe(levels);
    expect(g.revenue).toBe(sizeGoal('normal', levels + 5).revenue);
    expect(g.profit).toBe(sizeGoal('normal', levels + 5).profit);
    expect(challengeSize(trained, 20).row).toBe(sizeGoalRowOf(trained, 20));
    expect(sizeGoalRowOf(trained, 20)).toBe(levels + 5);
  });

  it('weeks 1-8 ignore training and decor (goal before SIZE_GOAL_FIRST_WEEK)', () => {
    for (let index = 1; index < SIZE_GOAL_FIRST_WEEK - 1; index++) {
      const plain = nextWeekGoal(lastDayOf(index, [1, 1], { tables: 2 }));
      expect(nextWeekGoal(lastDayOf(index, [5, 5], { tables: 2 }))).toEqual(plain);
      expect(plain.goal.profit).toBeUndefined();
    }
    expect(SCALED_GOAL_MIN_LEVEL).toBeLessThanOrEqual(12);
  });

  it('the running week keeps its goal when staff are trained mid-week; the next week reads the new row', () => {
    const goal = { revenue: 123_400_000, stars: 4, profit: 99_900_000, levels: 3, row: 40 };
    const s = lastDayOf(24, [1, 1], { tables: 4, better_machine: 3, fast_machine: 2 }, goal);
    s.day -= 3;
    s.today = createDayStats(s.day, s.rating);
    s.phase = 'report';
    s.staff[0]!.level = 5;
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.week!.index).toBe(24);
    expect(s.week!.goal).toEqual(goal);
    expect(sizeGoalRowOf(s, 25)).toBe(Math.max(9 + 4, floorOf('normal', 25)));
  });
});
