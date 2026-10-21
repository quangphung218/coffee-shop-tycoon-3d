import { describe, expect, it } from 'vitest';
import { REGULARS_FROM_DAY, regularById } from '../../src/sim/data/regulars';
import { UNIFORMS } from '../../src/sim/data/uniforms';
import { dispatch, uniformOf } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay } from './helpers';

const SEED = 3030;
const DAYS = 3;

interface Trace {
  state: GameState;
  /** Every event of each day, by day (index 0 = day 1). */
  eventsByDay: GameEvent[][];
}

/** A new game played DAYS days with the same morning routine: restock, hire one barista. */
function run(seed: number): Trace {
  const state = createNewGame('Quán P30', 'normal', seed);
  const trace: Trace = { state, eventsByDay: [] };
  for (let day = 1; day <= DAYS; day++) {
    if (!state.staff.some((m) => m.role === 'barista') && state.candidates[0]) {
      dispatch(state, { type: 'hire_staff', candidateId: state.candidates[0].id, role: 'barista' });
    }
    dispatch(state, { type: 'apply_restock' });
    const events = [...state.events];
    state.events = [];
    events.push(...playDay(state), ...state.events);
    state.events = [];
    trace.eventsByDay.push(events);
    if (day < DAYS) {
      delete state.week?.result;
      expect(dispatch(state, { type: 'next_day' })).toBe(true);
    }
  }
  return trace;
}

describe('P30 day', { timeout: 120_000 }, () => {
  const a = run(SEED);
  const b = run(SEED);

  it(`ends ${DAYS} days with the same state JSON and events for the same seed`, () => {
    expect(a.state.day).toBe(DAYS);
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
    expect(b.state.rngState).toBe(a.state.rngState);
    expect(JSON.stringify(b.eventsByDay)).toBe(JSON.stringify(a.eventsByDay));
  });

  it('greets named regulars from day 2 and never on day 1', () => {
    const arrivals = (day: number) =>
      a.eventsByDay[day - 1]!.filter((e): e is Extract<GameEvent, { type: 'regular_arrived' }> => e.type === 'regular_arrived');
    expect(REGULARS_FROM_DAY).toBe(2);
    expect(arrivals(1)).toHaveLength(0);
    const later = [...arrivals(2), ...arrivals(3)];
    expect(later.length).toBeGreaterThan(0);
    for (const e of later) expect(regularById(e.regularId), e.regularId).toBeDefined();
    // A regular comes at most once a day.
    for (const day of [2, 3]) {
      const ids = arrivals(day).map((e) => e.regularId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const visits = a.state.regulars!;
    const total = Object.values(visits).reduce((s, v) => s + v.visits, 0);
    expect(total).toBe(later.length);
  });

  it('refuses set_uniform below the unlock level without touching the state', () => {
    const state = createNewGame('Quán Đồng Phục', 'normal', SEED);
    expect(state.shopLevel).toBe(1);
    state.events = [];
    const before = JSON.stringify(state);
    for (const u of UNIFORMS.filter((x) => x.unlockLevel > state.shopLevel)) {
      expect(dispatch(state, { type: 'set_uniform', uniformId: u.id }), u.id).toBe(false);
      expect(state.uniform).toBeUndefined();
      expect(uniformOf(state).id).toBe('classic');
      const last = state.events.at(-1);
      expect(last?.type).toBe('notify');
      expect(state.events.some((e) => e.type === 'uniform_changed')).toBe(false);
    }
    state.events = [];
    expect(JSON.stringify(state)).toBe(before);
  });
});
