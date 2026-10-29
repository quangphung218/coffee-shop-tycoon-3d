import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal, weekProfitTarget } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** The normal week-1 goal the v4 game stored before profit counted. */
const OLD_GOAL = { revenue: 26_500_000, stars: 4 };

/** A v4 save of `state` as the game wrote it before the profit term. */
function v4Save(state: GameState): string {
  return JSON.stringify({ version: 4, savedAt: 1_700_000_000_000, state: { ...state, events: [] } });
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

/** Plays week days from the current morning until week day 7 is closed. */
function playToWeekEnd(g: GameState): void {
  for (;;) {
    dispatch(g, { type: 'apply_restock' });
    playDay(g);
    if (g.week!.result) return;
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
  }
}

describe('v4 saves and the profit-weighted week score', { timeout: 120_000 }, () => {
  it('keeps the stored score and cups of a week scored under the old formula', () => {
    const g = createNewGame('Quán V4', 'normal', 404);
    g.week!.goal = { ...OLD_GOAL };
    playToWeekEnd(g);
    // Rewrite the result as the v4 game stored it: old formula, no profit fields.
    const old = g.week!.result!;
    delete old.profit;
    delete old.profitTarget;
    old.score = 97;
    old.cups = 3;
    g.week!.archive![0] = { ...g.week!.archive![0]!, score: 97, cups: 3 };

    const loaded = load(v4Save(g));
    expect(SAVE_VERSION).toBe(5);
    expect(loaded.week!.result!.score).toBe(97);
    expect(loaded.week!.result!.cups).toBe(3);
    expect(loaded.week!.result!.profit).toBeUndefined();
    expect(loaded.week!.archive![0]).toMatchObject({ index: 1, score: 97, cups: 3 });

    // The next week is scored with the new goal and the profit term; week 1 keeps its row.
    expect(dispatch(loaded, { type: 'next_day' })).toBe(true);
    expect(loaded.week!.goal).toEqual(weekGoal('normal', 2));
    playToWeekEnd(loaded);
    expect(loaded.week!.result!.profitTarget).toBe(weekProfitTarget('normal', weekGoal('normal', 2).revenue));
    expect(loaded.week!.archive!.map((w) => [w.index, w.score, w.cups])[0]).toEqual([1, 97, 3]);
  });

  it('scores a week saved mid-way against its stored goal, profit target derived from it', () => {
    const g = createNewGame('Quán Giữa Tuần', 'normal', 405);
    g.week!.goal = { ...OLD_GOAL };
    for (let d = 1; d < 3; d++) {
      dispatch(g, { type: 'apply_restock' });
      playDay(g);
      expect(dispatch(g, { type: 'next_day' })).toBe(true);
    }
    const loaded = load(v4Save(g));
    expect(loaded.week!.goal).toEqual(OLD_GOAL);
    playToWeekEnd(loaded);
    expect(loaded.day).toBe(WEEK_LENGTH);
    const r = loaded.week!.result!;
    expect(r.revenueTarget).toBe(OLD_GOAL.revenue);
    expect(r.profitTarget).toBe(weekProfitTarget('normal', OLD_GOAL.revenue));
    expect(typeof r.profit).toBe('number');
  });
});
