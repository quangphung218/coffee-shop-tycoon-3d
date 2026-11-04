import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { ownsStyle, styleOf } from '../../src/sim/index';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import { buyStyle } from '../../src/sim/styles';
import type { GameState } from '../../src/sim/types';

/**
 * E-26 adds no save field: seasonal styles go in the same `state.styles` lists
 * (owned/chosen) as the E-17 ones, and the season is derived from the week
 * number. SAVE_VERSION stays 7.
 */

type Raw = Record<string, unknown>;

/** A version-7 save from before E-26 (v0.36.0) that bought and wears base styles. */
function oldSave(): string {
  const state = createNewGame('Quán Cũ', 'normal', 3600);
  state.money = 500_000_000;
  ensureRetention(state).tickets = 200;
  expect(buyStyle(state, 'wall_mint')).toBe(true);
  expect(buyStyle(state, 'awning_navy')).toBe(true);
  state.events = [];
  return JSON.stringify({ version: 7, savedAt: 1, analyticsConsent: 'unset', state: state as unknown as Raw });
}

function load(text: string): GameState {
  const r = migrate(JSON.parse(text));
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  expect(r.value.version).toBe(SAVE_VERSION);
  return r.value.state;
}

describe('E-26 seasonal styles save compatibility', () => {
  it('keeps SAVE_VERSION 7', () => {
    expect(SAVE_VERSION).toBe(7);
  });

  it('an old save keeps its bought and worn styles', () => {
    const g = load(oldSave());
    expect(g.styles!.owned).toEqual(['wall_mint', 'awning_navy']);
    expect(ownsStyle(g, 'wall_mint')).toBe(true);
    expect(ownsStyle(g, 'awning_navy')).toBe(true);
    expect(styleOf(g, 'wall').id).toBe('wall_mint');
    expect(styleOf(g, 'awning').id).toBe('awning_navy');
    expect(g.retention!.tickets).toBe(200 - 5 - 15);
  });

  it('a bought seasonal style survives a save/load after its season ended', () => {
    const state = createNewGame('Quán Mùa', 'normal', 2424);
    state.money = 500_000_000;
    ensureRetention(state).tickets = 500;
    state.week!.index = 24;
    expect(buyStyle(state, 'floor_jade')).toBe(true);
    state.week!.index = 33;
    const storage = createMemoryStorage();
    expect(saveGame(state, '1', storage).ok).toBe(true);
    expect(storage.getItem(saveKey('1'))).toContain('floor_jade');
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ownsStyle(r.value, 'floor_jade')).toBe(true);
    expect(styleOf(r.value, 'floor').id).toBe('floor_jade');
  });
});
