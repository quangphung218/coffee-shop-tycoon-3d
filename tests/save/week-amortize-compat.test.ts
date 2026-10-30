import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { profit } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, summarizeWeek, weekUpgradeCharge } from '../../src/sim/week';

/** Week 2's goal as the game stored it before E-07: +60% on week 1. */
const OLD_GOAL = { revenue: 51_200_000, stars: 4 };
const BOUGHT = 8_000_000;

/**
 * A normal game on the report of week day 7 of week 2, scored and archived the
 * way the game did before E-07: the 8.000.000đ bought on day 10 counted in full.
 */
function oldWeek2Report(): GameState {
  const state = createNewGame('Quán Cũ', 'normal', 707);
  const day = (d: number) => Object.assign(createDayStats(d, 4), { revenue: 5_000_000, ingredientCost: 1_000_000, upgradeCost: d === 10 ? BOUGHT : 0 });
  state.history = Array.from({ length: 13 }, (_, i) => day(i + 1));
  state.day = 14;
  state.today = day(14);
  state.rating = 4;
  state.phase = 'report';
  const days = state.history.filter((d) => d.day >= 8).concat(state.today);
  const oldProfit = days.reduce((s, d) => s + profit(d), 0) - BOUGHT;
  state.week = {
    length: WEEK_LENGTH,
    index: 2,
    startedDay: 8,
    plan: rollWeekPlan(state.seed, 2),
    goal: OLD_GOAL,
    result: {
      revenue: 35_000_000,
      revenueTarget: OLD_GOAL.revenue,
      profit: oldProfit,
      profitTarget: 25_600_000,
      stars: 4,
      starsTarget: 4,
      score: 77,
      cups: 2,
      reward: 1_500_000,
      days: days.map((d) => ({ day: d.day - 7, revenue: d.revenue, customersServed: 0, weather: 'sunny', event: 'none' })),
    },
    archive: [
      { index: 1, startedDay: 1, revenue: 35_000_000, profit: 28_000_000, customersServed: 0, stars: 4, score: 90, cups: 3 },
      { index: 2, startedDay: 8, revenue: 35_000_000, profit: 28_000_000, customersServed: 0, stars: 4, score: 77, cups: 2 },
    ],
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

describe('saves from before the upgrade spread (E-07)', () => {
  it('loads a week scored under the full upgrade charge without scoring it again', () => {
    const before = oldWeek2Report();
    const loaded = load(before);
    expect(loaded.money).toBe(before.money);
    expect(loaded.week!.goal).toEqual(OLD_GOAL);
    expect(loaded.week!.result).toEqual(before.week!.result);
    expect(loaded.week!.archive).toEqual(before.week!.archive);
  });

  it('opens week 3 on the new goal curve without charging the week-2 upgrade again', () => {
    const loaded = load(oldWeek2Report());
    expect(dispatch(loaded, { type: 'next_day' })).toBe(true);
    expect(loaded.week!.index).toBe(3);
    expect(loaded.week!.goal).toEqual(weekGoal('normal', 3));
    expect(loaded.week!.result).toBeUndefined();
    expect(loaded.week!.archive!.map((w) => [w.index, w.score, w.cups])).toEqual([
      [1, 90, 3],
      [2, 77, 2],
    ]);
    // Week 2 already paid it in full.
    expect(weekUpgradeCharge(loaded)).toBe(0);
  });

  it('charges week 3 the other half once week 2 was scored with the spread', () => {
    const state = oldWeek2Report();
    state.week!.archive![1]!.upgradeCharge = BOUGHT / 2;
    const loaded = load(state);
    expect(dispatch(loaded, { type: 'next_day' })).toBe(true);
    expect(weekUpgradeCharge(loaded)).toBe(BOUGHT / 2);
  });
});

/** A save on the report of `day` (1..7) of week 1: same shape before and after E-11, nothing scored yet. */
function insideWeek1(day: number): GameState {
  const state = createNewGame('Quán Tuần Một', 'normal', 1111);
  const stats = (d: number) => Object.assign(createDayStats(d, 4), { revenue: 5_000_000, ingredientCost: 1_000_000, upgradeCost: d === 3 ? BOUGHT : 0 });
  state.history = Array.from({ length: day - 1 }, (_, i) => stats(i + 1));
  state.day = day;
  state.today = stats(day);
  state.rating = 4;
  state.phase = 'report';
  return state;
}

describe('saves inside or after week 1 from before week 1 spread its upgrades (E-11)', () => {
  it('spreads the upgrades of a save inside week 1 over weeks 1 and 2, never charging more than bought', () => {
    const loaded = load(insideWeek1(5));
    expect(loaded.week!.index).toBe(1);
    expect(loaded.week!.result).toBeUndefined();
    expect(weekUpgradeCharge(loaded)).toBe(BOUGHT / 2);
    // Played on to the week-1 report: half the upgrade is charged and recorded for week 2 to carry.
    const end = load(insideWeek1(WEEK_LENGTH));
    const result = scoreWeek(end)!;
    const days = [...end.history, end.today];
    expect(result.profit).toBe(days.reduce((s, d) => s + profit(d), 0) - BOUGHT / 2);
    const row = summarizeWeek(end, result)!;
    expect(row.upgradeCharge).toBe(BOUGHT / 2);
    end.week!.result = result;
    end.week!.archive = [row];
    expect(dispatch(end, { type: 'next_day' })).toBe(true);
    expect(end.week!.index).toBe(2);
    // Week 2 pays the other half: BOUGHT in all.
    expect(weekUpgradeCharge(end)).toBe(BOUGHT / 2);
  });

  it('does not charge week 2 again for a week 1 scored before E-11 with its upgrades in full', () => {
    const state = insideWeek1(WEEK_LENGTH);
    const days = [...state.history, state.today];
    const oldResult = { ...scoreWeek(state)!, profit: days.reduce((s, d) => s + profit(d), 0) - BOUGHT, score: 80, cups: 2 };
    state.week!.result = oldResult;
    // Archived the way the game did before E-11: no upgradeCharge on week 1.
    state.week!.archive = [{ index: 1, startedDay: 1, revenue: oldResult.revenue, profit: oldResult.profit!, customersServed: 0, stars: 4, score: 80, cups: 2 }];
    const loaded = load(state);
    expect(loaded.week!.result).toEqual(oldResult);
    expect(loaded.week!.archive).toEqual(state.week!.archive);
    expect(dispatch(loaded, { type: 'next_day' })).toBe(true);
    expect(loaded.week!.index).toBe(2);
    expect(loaded.week!.archive!.map((w) => [w.index, w.score, w.cups])).toEqual([[1, 80, 2]]);
    expect(weekUpgradeCharge(loaded)).toBe(0);
  });
});
