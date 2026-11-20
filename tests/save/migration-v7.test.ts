import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrate } from '../../src/save/save';
import { dispatch } from '../../src/sim/index';
import { HIGH_PRICE_DAYS, policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** A v7 save of `state`: v7 had no High-price start day. */
function v7(state: GameState): unknown {
  const old: Partial<GameState> = { ...state, events: [] };
  delete old.highPriceSinceDay;
  return JSON.parse(JSON.stringify({ version: 7, savedAt: 1_700_000_000_000, analyticsConsent: 'yes', state: old }));
}

function migrated(raw: unknown): GameState {
  const r = migrate(raw);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  expect(r.value.analyticsConsent).toBe('yes');
  return r.value.state;
}

describe('migrate v7 → v8 (E-28 High price lasts 7 days)', { timeout: 60_000 }, () => {
  it('is at SAVE_VERSION 8', () => expect(SAVE_VERSION).toBe(8));

  it('starts the count of an old High-price save on the saved day', () => {
    const s = createNewGame('Quán V7', 'normal', 5);
    expect(dispatch(s, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
    s.day = 20; // played on High long past 7 days under the old rules
    const g = migrated(v7(s));
    expect(policyLevel(g, 'price')).toBe('high');
    expect(g.highPriceSinceDay).toBe(20);
    expect(g.money).toBe(s.money);

    // High holds through day 26 and reverts to Standard on day 27.
    for (let day = 21; day < 20 + HIGH_PRICE_DAYS; day++) {
      playDay(g);
      expect(dispatch(g, { type: 'next_day' })).toBe(true);
      expect(g.day).toBe(day);
      expect(policyLevel(g, 'price')).toBe('high');
    }
    playDay(g);
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.day).toBe(27);
    expect(policyLevel(g, 'price')).toBe('standard');
  });

  it('adds nothing to saves not on High price', () => {
    for (const level of ['low', 'standard'] as const) {
      const s = createNewGame('Quán V7', 'normal', 5);
      dispatch(s, { type: 'set_policy', policy: 'price', level });
      dispatch(s, { type: 'set_policy', policy: 'wage', level: 'high' });
      const g = migrated(v7(s));
      expect(g.highPriceSinceDay).toBeUndefined();
      expect(g.policies).toEqual({ price: level, wage: 'high' });
    }
    const none = createNewGame('Quán V7', 'normal', 5);
    delete none.policies;
    expect(migrated(v7(none)).highPriceSinceDay).toBeUndefined();
  });
});
