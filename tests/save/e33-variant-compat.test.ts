import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import { buyStyle, ownsStyle, styleOf } from '../../src/sim/styles';
import type { GameState } from '../../src/sim/types';

/**
 * E-33 colour variants add no save field: their ids (`<seasonal id>_c<cycle>`)
 * go in the same state.styles lists and styleById rebuilds them, so
 * SAVE_VERSION stays 9 and older saves keep every bought style.
 */

function load(raw: unknown): GameState {
  const r = migrate(JSON.parse(JSON.stringify(raw)));
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

describe('E-33 seasonal variants save compatibility', () => {
  it('keeps SAVE_VERSION 9', () => {
    expect(SAVE_VERSION).toBe(9);
  });

  it('a v0.43.0 save keeps its bought base and seasonal styles and what it wears', () => {
    const s = createNewGame('Quán Cũ', 'normal', 7);
    s.money = 500_000_000;
    ensureRetention(s).tickets = 1_000;
    expect(buyStyle(s, 'wall_mint')).toBe(true);
    s.week!.index = 24;
    expect(buyStyle(s, 'floor_jade')).toBe(true);
    expect(buyStyle(s, 'sign_lacquer')).toBe(true);
    s.events = [];
    const state = load({ version: 9, savedAt: 1, analyticsConsent: 'unset', state: s });
    expect(state.styles!.owned).toEqual(['wall_mint', 'floor_jade', 'sign_lacquer']);
    expect(ownsStyle(state, 'floor_jade')).toBe(true);
    expect(styleOf(state, 'sign').id).toBe('sign_lacquer');
    expect(styleOf(state, 'wall').id).toBe('wall_mint');
  });

  it('a bought variant survives save and load, worn and owned', () => {
    const s = createNewGame('Quán Mới', 'normal', 7);
    ensureRetention(s).tickets = 1_000;
    s.week!.index = 48;
    expect(buyStyle(s, 'awning_apricot_c1')).toBe(true);
    s.events = [];
    const state = load({ version: SAVE_VERSION, savedAt: 1, analyticsConsent: 'unset', state: s });
    expect(state.styles!.owned).toEqual(['awning_apricot_c1']);
    expect(styleOf(state, 'awning').id).toBe('awning_apricot_c1');
  });
});
