import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch } from '../../src/sim/index';
import { policyLevel, priceWalkoutChance } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-03 made high prices cost arrivals and counter walk-outs from rules alone
 * (no new saved field), so a save from before keeps its version and its
 * played weeks as stored; only days played after loading follow the new rules.
 */

function oldSave(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: 1_700_000_000_000, state: { ...state, events: [] } });
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

function playToWeekEnd(g: GameState): void {
  for (;;) {
    dispatch(g, { type: 'apply_restock' });
    playDay(g);
    if (g.week!.result) return;
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
  }
}

describe('saves on high price from before E-03', { timeout: 120_000 }, () => {
  it('keep the stored week result, archive and day history without recomputing them', () => {
    const g = createNewGame('Quán Giá Cao', 'normal', 303);
    expect(dispatch(g, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
    playToWeekEnd(g);
    // Stamp the week as an older game would have scored it.
    g.week!.result!.score = 99;
    g.week!.result!.cups = 3;
    g.week!.archive![0] = { ...g.week!.archive![0]!, score: 99, cups: 3 };
    const history = structuredClone(g.history);

    const loaded = load(oldSave(g));
    expect(policyLevel(loaded, 'price')).toBe('high');
    expect(loaded.week!.result).toMatchObject({ score: 99, cups: 3 });
    expect(loaded.week!.archive![0]).toMatchObject({ index: 1, score: 99, cups: 3 });
    expect(loaded.history).toEqual(history);
  });

  it('play on under the new rules after loading, the same on every load', () => {
    const g = createNewGame('Quán Giá Cao', 'normal', 304);
    expect(dispatch(g, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
    dispatch(g, { type: 'apply_restock' });
    playDay(g);
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    const text = oldSave(g);

    const days = [load(text), load(text)].map((s) => {
      expect(priceWalkoutChance(s)).toBeGreaterThan(0);
      dispatch(s, { type: 'apply_restock' });
      playDay(s);
      return s.today;
    });
    expect(days[0]!.customersArrived).toBeGreaterThan(0);
    expect(days[1]).toEqual(days[0]);
  });
});
