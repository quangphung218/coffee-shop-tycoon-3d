import { describe, expect, it } from 'vitest';
import { listSlots, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { buyUpgrade, nextUpgradeCost, tableZone, type TableZone } from '../../src/sim/upgrades';
import { runOpenDay } from './helpers';

const NOON = 12 * 60;

/** Normal game on day 1, open and played until noon (mid-peak). */
function midDayGame(seed: number): GameState {
  // The run id the shell gives a running game; a save without one gets a derived id.
  const state: GameState = { ...createNewGame('Quán Lưu', 'normal', seed), runId: `run-${seed}` };
  expect(dispatch(state, { type: 'apply_restock' })).toBe(true);
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  runOpenDay(state, { untilMinute: NOON });
  expect(state.minute).toBe(NOON);
  expect(state.phase).toBe('peak');
  return state;
}

/** Plays the rest of today and the whole of tomorrow; returns the end state and every event. */
function finishTwoDays(state: GameState) {
  const events = runOpenDay(state);
  expect(state.phase).toBe('report');
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  events.push(...runOpenDay(state));
  expect(state.phase).toBe('report');
  return { state, events };
}

/** Storage whose writes can be made to fail, like a full localStorage. */
function flakyStorage(): StorageLike & { failWrites: boolean } {
  const inner = createMemoryStorage();
  return {
    failWrites: false,
    getItem: (k) => inner.getItem(k),
    setItem(k, v) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
  };
}

describe('save round trip', () => {
  it('a game saved mid-day and loaded again plays out exactly like the unsaved one', () => {
    const original = midDayGame(4242);
    expect(original.customers.length + original.orders.length).toBeGreaterThan(0);

    const storage = createMemoryStorage();
    expect(saveGame(original, '1', storage, 1000).ok).toBe(true);
    const loaded = loadGame('1', storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // Only the transient event queue is dropped from the save.
    expect(loaded.value).toEqual({ ...original, events: [] });
    original.events = [];

    const a = finishTwoDays(original);
    const b = finishTwoDays(loaded.value);
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
    expect(b.state.lastReport).toEqual(a.state.lastReport);
    expect(b.state.day).toBe(2);
  });

  it('loads a save from the P18 floor plan with the tables on the current grid and nothing else lost', () => {
    const current = createNewGame('Quán Lưu', 'normal', 99);
    current.money = 1e12;
    for (const id of ['tables', 'window_bar', 'expand_area', 'outdoor_seating'] as const) {
      while (nextUpgradeCost(current, id) !== null) expect(buyUpgrade(current, id).ok).toBe(true);
    }
    expect(dispatch(current, { type: 'apply_restock' })).toBe(true);
    expect(dispatch(current, { type: 'start_day' })).toBe(true);
    runOpenDay(current, { untilMinute: NOON });
    expect(current.customers.some((c) => c.tableId !== null)).toBe(true);

    // The same game as P18 saved it: four tables a row 2 apart, chairs 0.75 from the centre.
    const old: GameState = JSON.parse(JSON.stringify(current));
    const count: Record<TableZone, number> = { indoor: 0, expansion: 0, outdoor: 0 };
    for (const t of old.tables) {
      const zone = tableZone(t.pos);
      const i = count[zone]++;
      const pos =
        zone === 'indoor'
          ? { x: -3 + (i % 4) * 2, z: 1 + Math.floor(i / 4) * 2 }
          : zone === 'expansion'
            ? { x: 6 + Math.floor(i / 3) * 2, z: -1 + (i % 3) * 2.2 }
            : { x: [-2.5, 2.5, -4.5, 4.5][i % 4]!, z: 7.8 };
      for (const c of old.customers) {
        if (c.tableId !== t.id || !c.target) continue;
        const chair = { x: pos.x + (c.target.x < t.pos.x ? -0.75 : 0.75), z: pos.z };
        if (c.pos.x === c.target.x && c.pos.z === c.target.z) c.pos = { ...chair };
        c.target = chair;
      }
      t.pos = pos;
    }
    expect(old.tables.map((t) => t.pos)).not.toEqual(current.tables.map((t) => t.pos));

    const storage = createMemoryStorage();
    expect(saveGame(current, '1', storage, 1).ok).toBe(true);
    expect(saveGame(old, '2', storage, 1).ok).toBe(true);
    const a = loadGame('1', storage);
    const b = loadGame('2', storage);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.value.tables.map((t) => t.pos)).toEqual(current.tables.map((t) => t.pos));
    expect(b.value).toEqual(a.value);
  });

  it('keeps the old save when the slot holds broken JSON or a write fails', () => {
    const storage = flakyStorage();
    const good = midDayGame(7);
    expect(saveGame(good, '1', storage, 1).ok).toBe(true);
    const goodText = storage.getItem(saveKey('1'));

    // Broken JSON in another slot: reported, left as is, and the good slot still loads.
    const broken = '{"version":1,"state":{"shopName":"Quán';
    storage.setItem(saveKey('2'), broken);
    const r = loadGame('2', storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('corrupt');
    expect(storage.getItem(saveKey('2'))).toBe(broken);
    expect(storage.getItem(saveKey('1'))).toBe(goodText);
    expect(listSlots(storage).find((s) => s.slot === '2')?.error).toBe('corrupt');
    expect(listSlots(storage).find((s) => s.slot === '1')).toMatchObject({ empty: false, day: 1, shopName: 'Quán Lưu' });

    // A failed write leaves the earlier save intact.
    runOpenDay(good);
    storage.failWrites = true;
    const failed = saveGame(good, '1', storage, 2);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.kind).toBe('storage');
    storage.failWrites = false;
    expect(storage.getItem(saveKey('1'))).toBe(goodText);
    const back = loadGame('1', storage);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.minute).toBe(NOON);
  });

  it('rejects valid JSON that is not a game without touching the slot', () => {
    const storage = createMemoryStorage();
    storage.setItem(saveKey('3'), '{"version":1,"state":{"hello":"world"}}');
    const r = loadGame('3', storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid');
    expect(storage.getItem(saveKey('3'))).toBe('{"version":1,"state":{"hello":"world"}}');
  });
});
