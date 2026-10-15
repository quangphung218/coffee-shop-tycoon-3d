import { describe, expect, it } from 'vitest';
import { CLOSING_MINUTE, isPeakMinute } from '../../src/sim/clock';
import { arrivalRate } from '../../src/sim/customers';
import { dispatch, step } from '../../src/sim/index';
import { DAY_START_MINUTE, createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, Phase } from '../../src/sim/types';

/** Serves alone: one task at a time, delivering first and cleaning last. */
function autoPlay(state: GameState): void {
  if (state.playerTasks.length > 0) return;
  const ready = state.orders.find((o) => o.status === 'ready');
  if (ready && dispatch(state, { type: 'deliver', orderId: ready.id })) return;
  const pending = state.orders.find((o) => o.status === 'pending');
  if (pending && dispatch(state, { type: 'brew', orderId: pending.id })) return;
  const next = state.customers.find((c) => c.state === 'queueing');
  if (next && dispatch(state, { type: 'take_order', customerId: next.id })) return;
  const withCash = state.tables.find((t) => t.cash > 0);
  if (withCash && dispatch(state, { type: 'collect_cash', tableId: withCash.id })) return;
  const dirty = state.tables.find((t) => t.trash > 0);
  if (dirty) dispatch(state, { type: 'clean_table', tableId: dirty.id });
}

interface DayLog {
  state: GameState;
  events: GameEvent[];
  /** Phase at each doorbell. */
  arrivalsByPhase: Record<Phase, number>;
  minutesByPhase: Record<Phase, number>;
}

function playDay(seed: number, play = true): DayLog {
  const state = createNewGame('Quán Test', 'normal', seed);
  const events: GameEvent[] = [];
  const arrivalsByPhase: Record<Phase, number> = { preparation: 0, opening: 0, peak: 0, closing: 0, report: 0 };
  const minutesByPhase: Record<Phase, number> = { preparation: 0, opening: 0, peak: 0, closing: 0, report: 0 };
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  for (let guard = 0; state.phase !== 'report' && guard < 2000; guard++) {
    if (play) autoPlay(state);
    step(state, 1);
    for (const e of state.events) if (e.type === 'doorbell') arrivalsByPhase[state.phase] += 1;
    minutesByPhase[state.phase] += 1;
    events.push(...state.events);
    state.events = [];
  }
  return { state, events, arrivalsByPhase, minutesByPhase };
}

describe('day loop', () => {
  it('waits in preparation until the shop opens', () => {
    const s = createNewGame('A', 'normal', 1);
    step(s, 120);
    expect(s.phase).toBe('preparation');
    expect(s.minute).toBe(DAY_START_MINUTE);
    expect(s.customers).toEqual([]);
    expect(dispatch(s, { type: 'next_day' })).toBe(false);
  });

  it('runs a whole day from preparation to report', () => {
    const { state, events } = playDay(2024);
    expect(state.phase).toBe('report');
    expect(state.minute).toBeGreaterThanOrEqual(CLOSING_MINUTE);
    expect(state.customers).toEqual([]);
    expect(state.tables.every((t) => t.cash === 0 && t.trash === 0)).toBe(true);

    const phases = events.filter((e) => e.type === 'phase').map((e) => (e as { phase: Phase }).phase);
    expect(phases).toEqual(['opening', 'peak', 'opening', 'peak', 'opening', 'closing', 'report']);

    const t = state.today;
    expect(t.customersArrived).toBeGreaterThan(20);
    expect(t.customersServed).toBeGreaterThan(10);
    expect(t.customersServed + t.customersLost).toBe(t.customersArrived);
    const soldCount = Object.values(t.sold).reduce((a, b) => a + (b ?? 0), 0);
    expect(soldCount).toBe(t.customersServed);
    expect(t.revenue).toBeGreaterThan(0);
    const missionReward = (state.lastReport?.missions ?? [])
      .filter((m) => m.status === 'completed')
      .reduce((sum, m) => sum + m.rewardMoney, 0);
    expect(state.money).toBe(createNewGame('Quán Test', 'normal', 2024).money + t.revenue + missionReward);
    for (const type of ['doorbell', 'brew', 'cash', 'notify', 'served', 'cleaned'] as const) {
      expect(events.some((e) => e.type === type), type).toBe(true);
    }
  });

  it('gets more customers per minute at peak than at opening', () => {
    for (const play of [true, false]) {
      const { arrivalsByPhase: a, minutesByPhase: m } = playDay(77, play);
      expect(a.peak / m.peak).toBeGreaterThan(a.opening / m.opening);
    }
    const s = createNewGame('A', 'normal', 1);
    s.phase = 'opening';
    const opening = arrivalRate(s);
    s.phase = 'peak';
    expect(arrivalRate(s)).toBeGreaterThan(opening * 2);
    expect(isPeakMinute(11 * 60)).toBe(true);
    expect(isPeakMinute(13 * 60)).toBe(false);
    expect(isPeakMinute(18 * 60 + 59)).toBe(true);
  });

  it('accepts no new customers after 20:00', () => {
    const { events, state } = playDay(5);
    expect(state.phase).toBe('report');
    const closingAt = events.findIndex((e) => e.type === 'phase' && e.phase === 'closing');
    expect(closingAt).toBeGreaterThan(0);
    expect(events.slice(closingAt).some((e) => e.type === 'doorbell')).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const a = playDay(31337);
    const b = playDay(31337);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
    expect(playDay(31338).events).not.toEqual(a.events);
  });

  it('starts the next day in preparation with new weather and fresh stats', () => {
    const { state } = playDay(9);
    const served = state.today.customersServed;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(state.day).toBe(2);
    expect(state.phase).toBe('preparation');
    expect(state.minute).toBe(DAY_START_MINUTE);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.customersServed).toBe(served);
    expect(state.today.customersArrived).toBe(0);
    expect(['sunny', 'rainy', 'hot']).toContain(state.weather);
  });

  it('keeps the fractional tick and stands still while paused', () => {
    const s = createNewGame('A', 'normal', 3);
    dispatch(s, { type: 'start_day' });
    step(s, 0.5);
    expect(s.minute).toBe(DAY_START_MINUTE);
    step(s, 0.75);
    expect(s.minute).toBe(DAY_START_MINUTE + 1);
    expect(s.tickAccumulator).toBeCloseTo(0.25);
    dispatch(s, { type: 'set_paused', paused: true });
    step(s, 10);
    expect(s.minute).toBe(DAY_START_MINUTE + 1);
  });
});
