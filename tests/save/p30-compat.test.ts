import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { REGULARS_FROM_DAY } from '../../src/sim/data/regulars';
import { dispatch, uniformOf } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * P30 adds only optional fields (GameState.regulars/uniform,
 * Customer.regularId), so saves of every version (0..3) load without them,
 * play a full day and save back at version 3 keeping them.
 */

const SAVED_AT = 1_700_000_000_000;

type Raw = Record<string, unknown>;

/** A save of `state` as written before P30: no regulars, no uniform, no named customers. */
function stripP30(state: GameState): Raw {
  const raw = JSON.parse(JSON.stringify(state)) as GameState;
  delete raw.regulars;
  delete raw.uniform;
  for (const c of raw.customers) delete c.regularId;
  return raw as unknown as Raw;
}

/** Fixture files built like tests/integration/p27-save-compat.test.ts, one per old save version. */
function fixtures(): Record<string, string> {
  // v3: a played game (report of day 2), the day regulars start coming.
  const played = createNewGame('Quán v3', 'normal', 303);
  playDay(played);
  expect(dispatch(played, { type: 'next_day' })).toBe(true);
  playDay(played);
  const v3 = JSON.stringify({ version: 3, savedAt: 1, state: stripP30(played) });

  // v2: the same kind of save without the week index and archive.
  const v2State = stripP30(played);
  const week = v2State.week as Raw | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
  }
  const v2 = JSON.stringify({ version: 2, savedAt: 1, state: v2State });

  // v1: a new game without week, seed, level, XP or missions.
  const v1State = stripP30(createNewGame('Quán v1', 'normal', 11));
  for (const k of ['week', 'seed', 'shopLevel', 'xp', 'missions']) delete v1State[k];
  const v1 = JSON.stringify({ version: 1, savedAt: 1, state: v1State });

  // v0: the bare prototype state, no version wrapper.
  const v0State = stripP30(createNewGame('Quán v0', 'normal', 13));
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

describe('P30 save compatibility', { timeout: 120_000 }, () => {
  const files = fixtures();

  it('is at SAVE_VERSION 5 (rent)', () => {
    expect(SAVE_VERSION).toBe(5);
  });

  for (const [name, text] of Object.entries(files)) {
    it(`${name}: migrates without regulars or uniform, plays a day and keeps both through a save`, () => {
      const r = migrate(JSON.parse(text));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.version).toBe(SAVE_VERSION);
      const g = r.value.state;
      expect(g.regulars).toBeUndefined();
      expect(g.uniform).toBeUndefined();
      expect(g.customers.every((c) => c.regularId === undefined)).toBe(true);
      expect(uniformOf(g).id).toBe('classic');

      const dayBefore = g.day;
      const events = playOneDay(g);
      expect(g.phase).toBe('report');
      expect(uniformOf(g).id).toBe('classic');
      const arrived = events.filter((e) => e.type === 'regular_arrived');
      if (g.day < REGULARS_FROM_DAY) expect(arrived).toHaveLength(0);
      expect(g.day).toBeGreaterThanOrEqual(dayBefore);

      // Make sure both fields exist before the save: a day-1 save plays on to day 2, then the team changes uniform.
      for (let extra = 0; !g.regulars && extra < 3; extra++) playOneDay(g);
      expect(g.regulars).toBeDefined();
      g.shopLevel = Math.max(g.shopLevel, 3);
      expect(dispatch(g, { type: 'set_uniform', uniformId: 'mint' })).toBe(true);
      expect(g.uniform).toBe('mint');

      const back = roundTrip(g);
      expect(back.version).toBe(SAVE_VERSION);
      expect(back.state.uniform).toBe('mint');
      expect(uniformOf(back.state).id).toBe('mint');
      expect(back.state.regulars).toEqual(g.regulars);
      expect(Object.keys(back.state.regulars!).length).toBeGreaterThan(0);
    });
  }

  it('wears classic when a v3 save holds a uniform id this build does not know', () => {
    const file = JSON.parse(files.v3!) as { state: Raw };
    file.state.uniform = 'tuxedo';
    const r = migrate(file);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error.message);
    expect(uniformOf(r.value.state).id).toBe('classic');
    playOneDay(r.value.state);
    expect(r.value.state.phase).toBe('report');
  });
});
