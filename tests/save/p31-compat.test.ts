import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, MenuItemId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * P31 adds two menu items (cold_brew, cookie) and two tools (cold_brew_tower,
 * oven) without a schema change, so saves of every version (0..3) written
 * before them load with both items switched off, play a full day, save back
 * at version 3 unchanged and still refuse Cold brew until the tower is owned.
 */

const SAVED_AT = 1_700_000_000_000;
const P31_ITEMS: readonly MenuItemId[] = ['cold_brew', 'cookie'];

type Raw = Record<string, unknown>;

/** A save of `state` as written before P31: no Cold brew or cookie on the menu, no tower or oven. */
function stripP31(state: GameState): Raw {
  const raw = JSON.parse(JSON.stringify(state)) as GameState;
  raw.menu = raw.menu.filter((m) => !P31_ITEMS.includes(m.id));
  delete raw.upgrades.cold_brew_tower;
  delete raw.upgrades.oven;
  return raw as unknown as Raw;
}

/** Fixture files built like tests/save/p30-compat.test.ts, one per old save version. */
function fixtures(): Record<string, string> {
  // v3: a played game (report of day 2).
  const played = createNewGame('Quán v3', 'normal', 313);
  playDay(played);
  expect(dispatch(played, { type: 'next_day' })).toBe(true);
  playDay(played);
  const v3 = JSON.stringify({ version: 3, savedAt: 1, state: stripP31(played) });

  // v2: the same kind of save without the week index and archive.
  const v2State = stripP31(played);
  const week = v2State.week as Raw | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
  }
  const v2 = JSON.stringify({ version: 2, savedAt: 1, state: v2State });

  // v1: a new game without week, seed, level, XP or missions.
  const v1State = stripP31(createNewGame('Quán v1', 'normal', 17));
  for (const k of ['week', 'seed', 'shopLevel', 'xp', 'missions']) delete v1State[k];
  const v1 = JSON.stringify({ version: 1, savedAt: 1, state: v1State });

  // v0: the bare prototype state, no version wrapper.
  const v0State = stripP31(createNewGame('Quán v0', 'normal', 19));
  const v0Fields = ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'weather', 'tickAccumulator', 'playerTasks'];
  for (const k of [...v0Fields, 'week', 'seed', 'shopLevel', 'xp', 'missions']) delete v0State[k];
  const v0 = JSON.stringify(v0State);

  return { v0, v1, v2, v3 };
}

/** Runs one full day from the morning (or from a report) through start_day to the report. */
function playOneDay(g: GameState): GameEvent[] {
  if (g.phase === 'report') {
    delete g.week?.result;
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
  }
  dispatch(g, { type: 'apply_restock' });
  g.events = [];
  return playDay(g);
}

function roundTrip(state: GameState): { version: number; state: GameState } {
  const storage = createMemoryStorage();
  expect(saveGame(state, '2', storage, SAVED_AT).ok).toBe(true);
  const version = (JSON.parse(storage.getItem(saveKey('2'))!) as { version: number }).version;
  const r = loadGame('2', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return { version, state: r.value };
}

describe('P31 save compatibility', { timeout: 120_000 }, () => {
  const files = fixtures();

  it('keeps SAVE_VERSION at 3', () => {
    expect(SAVE_VERSION).toBe(3);
  });

  it('builds fixtures without the P31 items and tools', () => {
    for (const [name, text] of Object.entries(files)) {
      const file = JSON.parse(text) as Raw;
      const state = (name === 'v0' ? file : file.state) as unknown as GameState;
      expect(state.menu.some((m) => P31_ITEMS.includes(m.id)), name).toBe(false);
      expect(state.upgrades.cold_brew_tower, name).toBeUndefined();
      expect(state.upgrades.oven, name).toBeUndefined();
    }
  });

  for (const [name, text] of Object.entries(files)) {
    it(`${name}: loads with Cold brew and the cookie off, plays a day, saves back and refuses Cold brew without the tower`, () => {
      const r = migrate(JSON.parse(text));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.version).toBe(3);
      const g = r.value.state;
      for (const id of P31_ITEMS) {
        expect(g.menu.find((m) => m.id === id), id).toEqual({ id, enabled: false, price: getMenuItem(id).price });
      }
      expect(g.upgrades.cold_brew_tower ?? 0).toBe(0);
      expect(g.upgrades.oven ?? 0).toBe(0);

      // The same file also loads through a storage slot.
      const storage = createMemoryStorage();
      storage.setItem(saveKey('1'), text);
      const loaded = loadGame('1', storage);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw new Error(loaded.error.message);
      expect(loaded.value.menu.filter((m) => P31_ITEMS.includes(m.id)).every((m) => !m.enabled)).toBe(true);

      const dayBefore = g.day;
      playOneDay(g);
      expect(g.phase).toBe('report');
      expect(g.day).toBeGreaterThanOrEqual(dayBefore);
      for (const id of P31_ITEMS) expect(g.today.sold[id] ?? 0, id).toBe(0);

      const back = roundTrip(g);
      expect(back.version).toBe(3);
      expect(back.state).toEqual(JSON.parse(JSON.stringify(g)));

      // Even at the tower's level, Cold brew stays off until the tower is bought.
      const s = back.state;
      s.shopLevel = Math.max(s.shopLevel, 7);
      s.events = [];
      expect(dispatch(s, { type: 'set_menu_item', itemId: 'cold_brew', enabled: true })).toBe(false);
      expect(s.menu.find((m) => m.id === 'cold_brew')!.enabled).toBe(false);
      expect(s.events.at(-1)).toEqual({ type: 'notify', level: 'error', text: 'Cần Tháp cold brew' });
    });
  }
});
