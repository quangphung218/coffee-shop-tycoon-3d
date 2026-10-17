import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { isValidWeekPlan } from '../../src/sim/week';
import { playDay } from '../integration/helpers';

/** Revenue of each hand-written day of week 1. */
const DAY_REVENUE = 3_000_000;
const WEEK_REVENUE = DAY_REVENUE * WEEK_LENGTH;

/** One closed day as the v2 game wrote it: only the fields it had, no P23 extras. */
function v2Day(day: number) {
  return {
    day,
    revenue: DAY_REVENUE,
    ingredientCost: 900_000,
    wages: 0,
    marketingCost: 0,
    upgradeCost: 0,
    customersArrived: 60,
    customersServed: 55,
    customersLost: 5,
    sold: { espresso: 30, americano: 25 },
    outOfStock: {},
    ratingStart: 4,
    ratingEnd: 4.1,
  };
}

const PLAN = [
  { day: 1, weather: 'sunny', event: 'grand_opening' },
  { day: 2, weather: 'rainy', event: 'none' },
  { day: 3, weather: 'sunny', event: 'fair' },
  { day: 4, weather: 'hot', event: 'supplier_hike' },
  { day: 5, weather: 'hot', event: 'none' },
  { day: 6, weather: 'rainy', event: 'fair' },
  { day: 7, weather: 'sunny', event: 'supplier_hike' },
];

/**
 * A v2 save written by the 7-day game on the report of day 7: week 1 scored,
 * no week index and no archive. The game fields come from a fresh game; the
 * day, history, today and week are written out by hand in the v2 shape.
 */
function v2EndedWeek(): string {
  const base = JSON.parse(JSON.stringify(createNewGame('Quán Bảy Ngày', 'normal', 909))) as Record<string, unknown>;
  const result = {
    revenue: WEEK_REVENUE,
    revenueTarget: 26_500_000,
    stars: 4.1,
    starsTarget: 4,
    // 60 × 21/26,5 + 40 rounds to 88: 2 cups.
    score: 88,
    cups: 2,
    days: PLAN.map((p) => ({ day: p.day, revenue: DAY_REVENUE, customersServed: 55, weather: p.weather, event: p.event })),
  };
  const state = {
    ...base,
    day: WEEK_LENGTH,
    minute: 21 * 60,
    phase: 'report',
    rating: 4.1,
    weather: 'sunny',
    history: [1, 2, 3, 4, 5, 6].map(v2Day),
    today: v2Day(7),
    lastReport: null,
    week: { length: 7, startedDay: 1, plan: PLAN, goal: { revenue: 26_500_000, stars: 4 }, result },
  };
  return JSON.stringify({ version: 2, savedAt: 1_700_000_000_000, state });
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('a v2 save that finished week 1', { timeout: 300_000 }, () => {
  it(`loads as v${SAVE_VERSION} still on the day 7 report with its result archived`, () => {
    const g = load(v2EndedWeek());
    expect(g.day).toBe(WEEK_LENGTH);
    expect(g.phase).toBe('report');
    expect(g.week!.index).toBe(1);
    expect(g.week!.result!.cups).toBe(2);
    expect(g.week!.archive).toEqual([
      {
        index: 1,
        startedDay: 1,
        revenue: WEEK_REVENUE,
        profit: (DAY_REVENUE - 900_000) * WEEK_LENGTH,
        customersServed: 55 * WEEK_LENGTH,
        stars: 4.1,
        score: 88,
        cups: 2,
      },
    ]);
  });

  it('opens week 2 on next_day and plays its 7 days to the week 2 score', () => {
    const g = load(v2EndedWeek());
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.day).toBe(WEEK_LENGTH + 1);
    expect(g.phase).toBe('preparation');
    expect(g.week!.index).toBe(2);
    expect(g.week!.startedDay).toBe(WEEK_LENGTH + 1);
    expect(g.week!.result).toBeUndefined();
    expect(g.week!.goal).toEqual(weekGoal('normal', 2));
    expect(isValidWeekPlan(g.week!.plan, 2)).toBe(true);
    expect(g.week!.plan.some((p) => p.event === 'grand_opening')).toBe(false);
    expect(g.week!.archive!.map((w) => w.index)).toEqual([1]);

    const ended: number[] = [];
    for (let d = 1; d <= WEEK_LENGTH; d++) {
      g.events = [];
      dispatch(g, { type: 'apply_restock' });
      const events: GameEvent[] = playDay(g);
      expect(g.day).toBe(WEEK_LENGTH + d);
      if (events.some((e) => e.type === 'week_ended')) ended.push(g.day);
      if (d < WEEK_LENGTH) {
        expect(g.week!.result).toBeUndefined();
        expect(dispatch(g, { type: 'next_day' })).toBe(true);
        expect(g.week!.index).toBe(2);
      }
    }
    expect(ended).toEqual([2 * WEEK_LENGTH]);
    expect(g.week!.result).toBeTruthy();
    expect(g.week!.result!.revenueTarget).toBe(weekGoal('normal', 2).revenue);
    expect(g.week!.result!.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.week!.archive!.map((w) => w.index)).toEqual([1, 2]);
    expect(g.week!.archive![1]!.startedDay).toBe(WEEK_LENGTH + 1);

    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.week!.index).toBe(3);
    expect(g.week!.startedDay).toBe(2 * WEEK_LENGTH + 1);
  });
});
