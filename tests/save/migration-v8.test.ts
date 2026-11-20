import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrate } from '../../src/save/save';
import { dispatch } from '../../src/sim/index';
import { HIGH_WAGE_DAYS, policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** A save of `state` at `version` (7 or 8): neither had a High-wage start day. */
function old(state: GameState, version: number): unknown {
  const s: Partial<GameState> = { ...state, events: [] };
  delete s.highWageSinceDay;
  return JSON.parse(JSON.stringify({ version, savedAt: 1_700_000_000_000, analyticsConsent: 'yes', state: s }));
}

function migrated(raw: unknown): GameState {
  const r = migrate(raw);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  expect(r.value.analyticsConsent).toBe('yes');
  return r.value.state;
}

describe('migrate v8 → v9 (E-29 High wage lasts 7 days)', { timeout: 60_000 }, () => {
  it('is at SAVE_VERSION 9', () => expect(SAVE_VERSION).toBe(9));

  for (const version of [7, 8]) {
    it(`gives an old v${version} High-wage save 7 more days from the saved day`, () => {
      const s = createNewGame('Quán V8', 'normal', 5);
      expect(dispatch(s, { type: 'set_policy', policy: 'wage', level: 'high' })).toBe(true);
      s.day = 20; // on High wage long past 7 days under the old rules
      const g = migrated(old(s, version));
      expect(policyLevel(g, 'wage')).toBe('high');
      expect(g.highWageSinceDay).toBe(20);
      expect(g.money).toBe(s.money);

      for (let day = 21; day < 20 + HIGH_WAGE_DAYS; day++) {
        playDay(g);
        expect(dispatch(g, { type: 'next_day' })).toBe(true);
        expect(g.day).toBe(day);
        expect(policyLevel(g, 'wage')).toBe('high');
      }
      playDay(g);
      expect(dispatch(g, { type: 'next_day' })).toBe(true);
      expect(g.day).toBe(27);
      expect(policyLevel(g, 'wage')).toBe('standard');
    });
  }

  it('adds nothing to saves not on High wage', () => {
    for (const level of ['low', 'standard'] as const) {
      const s = createNewGame('Quán V8', 'normal', 5);
      dispatch(s, { type: 'set_policy', policy: 'wage', level });
      const g = migrated(old(s, 8));
      expect(g.highWageSinceDay).toBeUndefined();
      expect(g.policies).toEqual({ price: 'standard', wage: level });
    }
    const none = createNewGame('Quán V8', 'normal', 5);
    delete none.policies;
    expect(migrated(old(none, 8)).highWageSinceDay).toBeUndefined();
  });

  it('keeps an existing start day', () => {
    const s = createNewGame('Quán V8', 'normal', 5);
    dispatch(s, { type: 'set_policy', policy: 'wage', level: 'high' });
    const raw = old(s, 8) as { state: Record<string, unknown> };
    raw.state.highWageSinceDay = 3;
    raw.state.day = 6;
    expect(migrated(raw).highWageSinceDay).toBe(3);
  });
});
