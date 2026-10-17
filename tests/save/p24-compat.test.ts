import { describe, expect, it } from 'vitest';
import { listSlots, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { getMenuItem } from '../../src/sim/data/menu';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { autoRestockSuggestion, expectedDemand } from '../../src/sim/inventory';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { GameState, IngredientId, MenuItemId } from '../../src/sim/types';
import { playDay, runOpenDay } from '../integration/helpers';

/**
 * P24 adds DayStats.missedDemand. A P23 save (same version 3, several weeks of
 * history, no missedDemand anywhere) must still load, plan a restock and
 * survive a save/load round trip.
 */

const P23_VERSION = 3;
const NOON = 12 * 60;

/** Plays `days` full days with every unlocked item on and the suggested restock bought. */
function playedGame(days: number, seed = 2424): GameState {
  const state = createNewGame('Quán Cũ', 'normal', seed);
  for (let day = 1; day <= days; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    for (const m of state.menu) {
      if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
    }
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  state.events = [];
  return state;
}

/** The game as P23 wrote it: version 3 and no missedDemand on any day. */
function p23Text(state: GameState): string {
  const raw = JSON.parse(JSON.stringify({ ...state, events: [] })) as GameState;
  delete raw.today.missedDemand;
  for (const d of raw.history) delete d.missedDemand;
  return JSON.stringify({ version: P23_VERSION, savedAt: 1_700_000_000_000, state: raw });
}

function storeP23(state: GameState): StorageLike {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('1'), p23Text(state));
  return storage;
}

function load(storage: StorageLike): GameState {
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function setStock(s: GameState, id: IngredientId, qty: number): void {
  s.inventory.find((i) => i.id === id)!.qty = qty;
}

describe('P23 save with several weeks and no missedDemand', { timeout: 120_000 }, () => {
  // Two weeks and two days: day 16 in preparation, with week 1 and 2 archived.
  const played = playedGame(2 * WEEK_LENGTH + 2);
  expect(dispatch(played, { type: 'next_day' })).toBe(true);
  played.events = [];

  it('loads with its history, weeks and menu as saved', () => {
    const storage = storeP23(played);
    expect(storage.getItem(saveKey('1'))).not.toContain('missedDemand');
    const s = load(storage);
    expect(s.day).toBe(2 * WEEK_LENGTH + 3);
    expect(s.week!.index).toBe(3);
    expect(s.week!.archive!.map((w) => w.index)).toEqual([1, 2]);
    expect(s.history.map((d) => d.day)).toEqual(played.history.map((d) => d.day));
    expect(s.history.length).toBeGreaterThanOrEqual(WEEK_LENGTH);
    expect(s.history.every((d) => d.missedDemand === undefined)).toBe(true);
    expect(s.menu.filter((m) => m.enabled).map((m) => m.id)).toEqual(played.menu.filter((m) => m.enabled).map((m) => m.id));
    expect(listSlots(storage).find((x) => x.slot === '1')).toMatchObject({ empty: false, day: s.day, shopName: 'Quán Cũ' });
  });

  it('plans demand from sold plus out-of-stock when missedDemand is absent', () => {
    const s = load(storeP23(played));
    const last = s.history.at(-1)!;
    const zeroed = structuredClone(s);
    zeroed.history.at(-1)!.missedDemand = {};
    expect(expectedDemand(s)).toEqual(expectedDemand(zeroed));
    for (const m of s.menu.filter((x) => x.enabled)) {
      const seen = (last.sold[m.id] ?? 0) + (last.outOfStock[m.id] ?? 0);
      if (seen > 0) expect(expectedDemand(s)[m.id], m.id).toBe(seen);
    }
  });

  it('suggests oranges, flour and butter for enabled items whose shelves are empty', () => {
    const s = load(storeP23(played));
    const enabled = new Set<MenuItemId>(s.menu.filter((m) => m.enabled).map((m) => m.id));
    expect(enabled.has('orange_juice') && enabled.has('cake')).toBe(true);
    for (const id of ['orange', 'flour', 'butter'] as const) setStock(s, id, 0);
    const sug = autoRestockSuggestion(s);
    expect(sug.items.map((i) => i.id)).toEqual(expect.arrayContaining(['orange', 'flour', 'butter']));
    expect(sug.totalCost).toBe(sug.items.reduce((a, i) => a + i.cost, 0));
    expect(sug.items.every((i) => i.qty > 0 && i.cost > 0)).toBe(true);
  });

  it('buys the suggestion and opens with every enabled item makeable', () => {
    const s = load(storeP23(played));
    for (const id of ['orange', 'flour', 'butter'] as const) setStock(s, id, 0);
    s.money = 1e9;
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    for (const m of s.menu.filter((x) => x.enabled)) {
      for (const need of getMenuItem(m.id).ingredients) {
        expect(s.inventory.find((i) => i.id === need.id)!.qty, `${m.id} ${need.id}`).toBeGreaterThanOrEqual(need.qty);
      }
    }
  });

  it('round-trips unchanged, before and after a day played on the new version', () => {
    const storage = storeP23(played);
    const s = load(storage);
    expect(saveGame(s, '2', storage, 1).ok).toBe(true);
    expect(loadGame('2', storage)).toEqual({ ok: true, value: s });

    dispatch(s, { type: 'apply_restock' });
    // No lemons: lemon tea misses orders, so the day writes missedDemand.
    setStock(s, 'lemon', 0);
    playDay(s);
    s.events = [];
    expect(s.today.missedDemand).toBeDefined();
    expect(saveGame(s, '2', storage, 2).ok).toBe(true);
    const again = loadGame('2', storage);
    expect(again).toEqual({ ok: true, value: s });
  });

  it('continues a P23 save made mid-day, today without missedDemand', () => {
    const s = createNewGame('Quán Cũ', 'normal', 99);
    dispatch(s, { type: 'apply_restock' });
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    runOpenDay(s, { untilMinute: NOON });
    s.events = [];
    const loaded = load(storeP23(s));
    expect(loaded.phase).toBe('peak');
    expect(loaded.today.missedDemand).toBeUndefined();
    runOpenDay(loaded);
    expect(loaded.phase).toBe('report');
    expect(() => autoRestockSuggestion(loaded)).not.toThrow();
    expect(autoRestockSuggestion(loaded).totalCost).toBeGreaterThanOrEqual(0);
  });
});
