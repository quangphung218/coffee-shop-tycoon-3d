import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';
import { weekGoalView } from '../../src/ui/weekGoal';

/** Week 3's goal on Normal as the game stored it before E-12: ×2,3 on week 1. */
const OLD_GOAL = { revenue: 73_600_000, stars: 4 };
const ARCHIVE = [
  { index: 1, startedDay: 1, revenue: 35_000_000, profit: 18_000_000, customersServed: 0, stars: 4, score: 90, cups: 3 },
  { index: 2, startedDay: 8, revenue: 50_000_000, profit: 26_000_000, customersServed: 0, stars: 4, score: 80, cups: 2 },
  { index: 3, startedDay: 15, revenue: 60_000_000, profit: 30_000_000, customersServed: 0, stars: 4, score: 70, cups: 2 },
];

/** A normal game on the report of the last day of week 3, scored under the E-11 curve. */
function oldWeek3Report(): GameState {
  const state = createNewGame('Quán Cũ', 'normal', 1203);
  const day = (d: number) => Object.assign(createDayStats(d, 4), { revenue: 8_000_000, ingredientCost: 2_000_000 });
  state.history = Array.from({ length: 20 }, (_, i) => day(i + 1));
  state.day = 21;
  state.today = day(21);
  state.rating = 4;
  state.phase = 'report';
  state.week = {
    length: WEEK_LENGTH,
    index: 3,
    startedDay: 15,
    plan: rollWeekPlan(state.seed, 3),
    goal: OLD_GOAL,
    result: {
      revenue: 60_000_000,
      revenueTarget: OLD_GOAL.revenue,
      profit: 30_000_000,
      profitTarget: 36_800_000,
      stars: 4,
      starsTarget: 4,
      score: 70,
      cups: 2,
      reward: 1_500_000,
      days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, revenue: 8_000_000, customersServed: 0, weather: 'sunny', event: 'none' })),
    },
    archive: ARCHIVE.map((w) => ({ ...w })),
  };
  return state;
}

function load(state: GameState): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), JSON.stringify({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } }));
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('saves from before the E-12 goal curve', () => {
  it('load a week scored on the old goal without scoring it again', () => {
    const before = oldWeek3Report();
    const loaded = load(before);
    expect(loaded.money).toBe(before.money);
    expect(loaded.week!.goal).toEqual(OLD_GOAL);
    expect(loaded.week!.result).toEqual(before.week!.result);
    expect(loaded.week!.archive).toEqual(ARCHIVE);
    expect(weekGoalView(loaded)!.bars.find((b) => b.id === 'revenue')!.target).toBe(OLD_GOAL.revenue);
  });

  it('open the next week on the new curve and keep played weeks as they were', () => {
    const loaded = load(oldWeek3Report());
    expect(dispatch(loaded, { type: 'next_day' })).toBe(true);
    expect(loaded.week!.index).toBe(4);
    expect(loaded.week!.goal).toEqual(weekGoal('normal', 4));
    expect(loaded.week!.goal.revenue).toBe(76_800_000); // 32tr × 2,4
    expect(weekGoalView(loaded)!.bars.find((b) => b.id === 'revenue')!.target).toBe(76_800_000);
    expect(loaded.week!.archive).toEqual(ARCHIVE);
  });
});
