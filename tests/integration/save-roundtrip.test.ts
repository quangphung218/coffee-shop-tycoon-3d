import { describe, expect, it } from 'vitest';
import { listSlots, loadGame, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { runOpenDay } from './helpers';

const NOON = 12 * 60;

/** Normal game on day 1, open and played until noon (mid-peak). */
function midDayGame(seed: number): GameState {
  const state = createNewGame('Quán Lưu', 'normal', seed);
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
