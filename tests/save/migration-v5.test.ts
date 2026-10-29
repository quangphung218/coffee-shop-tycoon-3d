import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, migrate, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { RENT } from '../../src/sim/data/rent';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dailyRent } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, DayStats, GameState } from '../../src/sim/types';
import { playDay, runOpenDay } from '../integration/helpers';

/** Plays `days` days with the morning restock. */
function played(seed: number, days: number): GameState {
  const s = createNewGame('Quán V4', 'normal', seed);
  for (let d = 1; d <= days; d++) {
    if (d > 1) expect(dispatch(s, { type: 'next_day' })).toBe(true);
    dispatch(s, { type: 'apply_restock' });
    playDay(s);
  }
  return s;
}

/**
 * A v4 save of `state` as the game wrote it before rent: no `rent` on any
 * day or report, and the money as if no rent had been paid.
 */
function v4Save(state: GameState): string {
  const s = JSON.parse(JSON.stringify({ ...state, events: [] })) as GameState;
  let paid = 0;
  for (const d of [...s.history, s.today] as DayStats[]) {
    paid += d.rent ?? 0;
    delete d.rent;
  }
  s.money += paid;
  if (s.lastReport) {
    const r = s.lastReport as DailyReport;
    r.profit += r.rent ?? 0;
    r.money += paid;
    delete r.rent;
    delete r.rentNext;
  }
  return JSON.stringify({ version: 4, savedAt: 1_700_000_000_000, state: s });
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('migrate v4 → v5 (daily rent)', { timeout: 120_000 }, () => {
  it('loads at SAVE_VERSION 5 without touching money, days or the last report', () => {
    const v4 = v4Save(played(11, 3));
    const raw = JSON.parse(v4) as { state: GameState };
    const r = migrate(JSON.parse(v4));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(SAVE_VERSION).toBe(5);
    expect(r.value.version).toBe(5);
    const g = r.value.state;
    expect(g.money).toBe(raw.state.money);
    expect(g.history).toEqual(raw.state.history);
    expect(g.today).toEqual(raw.state.today);
    expect(g.lastReport).toEqual(raw.state.lastReport);
    expect(g.lastReport!.rent).toBeUndefined();
  });

  it('keeps a played week’s result and archive row as stored, without recounting rent', () => {
    const s = played(7, WEEK_LENGTH);
    const v4 = JSON.parse(v4Save(s)) as { state: GameState };
    const g = load(JSON.stringify(v4));
    expect(g.week!.result).toEqual(v4.state.week!.result);
    expect(g.week!.archive).toEqual(v4.state.week!.archive);
    expect(g.money).toBe(v4.state.money);
  });

  it('charges rent from the next close on after loading', () => {
    const g = load(v4Save(played(11, 2)));
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    const before = g.history.length;
    const level = g.shopLevel;
    dispatch(g, { type: 'apply_restock' });
    playDay(g);
    // Paid at the level the day was played at; a level-up tonight shows in rentNext.
    expect(g.today.rent).toBe(RENT.normal.base + (level - 1) * RENT.normal.perLevel);
    expect(g.lastReport!.rent).toBe(g.today.rent);
    expect(g.lastReport!.rentNext).toBe(dailyRent(g));
    // Days played before the update still carry no rent.
    expect(g.history.slice(0, before).every((d) => d.rent === undefined)).toBe(true);
  });

  it('charges today’s rent on a save written mid-day', () => {
    const s = createNewGame('Quán V4', 'normal', 3);
    dispatch(s, { type: 'apply_restock' });
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    const g = load(v4Save(s));
    expect(g.phase).not.toBe('report');
    runOpenDay(g);
    expect(g.phase).toBe('report');
    expect(g.today.rent).toBe(RENT.normal.base);
    expect(g.lastReport!.rent).toBe(RENT.normal.base);
  });
});
