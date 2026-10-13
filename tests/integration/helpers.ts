import { expect } from 'vitest';
import { dispatch, step } from '../../src/sim/index';
import { isClaimed } from '../../src/sim/orders';
import type { GameEvent, GameState } from '../../src/sim/types';

/** Upper bound on simulated minutes per day; a day is 07:00–21:00 plus closing. */
export const DAY_GUARD = 3000;

/** Serves alone on whatever the staff have not picked up: delivers first, cleans last. */
export function autoPlay(state: GameState): void {
  if (state.playerTasks.length > 0) return;
  const free = (kind: Parameters<typeof isClaimed>[1], id: number) => !isClaimed(state, kind, id, null);
  const ready = state.orders.find((o) => o.status === 'ready' && free('serve', o.id));
  if (ready && dispatch(state, { type: 'deliver', orderId: ready.id })) return;
  const pending = state.orders.find((o) => o.status === 'pending' && free('brew', o.id));
  if (pending && dispatch(state, { type: 'brew', orderId: pending.id })) return;
  const next = state.customers.find((c) => c.state === 'queueing' && free('take_order', c.id));
  if (next && dispatch(state, { type: 'take_order', customerId: next.id })) return;
  const withCash = state.tables.find((t) => t.cash > 0 && free('collect', t.id));
  if (withCash && dispatch(state, { type: 'collect_cash', tableId: withCash.id })) return;
  const dirty = state.tables.find((t) => t.trash > 0 && free('clean', t.id));
  if (dirty) dispatch(state, { type: 'clean_table', tableId: dirty.id });
}

export interface RunOptions {
  /** The player serves customers (default true). */
  play?: boolean;
  /** Called after every one-minute step, before the events are drained. */
  onMinute?: (state: GameState) => void;
  /** Stop once the clock reaches this minute (for mid-day snapshots). */
  untilMinute?: number;
}

/**
 * Steps an open shop minute by minute until the report (or `untilMinute`),
 * draining `state.events` each minute. Returns every event seen.
 */
export function runOpenDay(state: GameState, opts: RunOptions = {}): GameEvent[] {
  const { play = true, onMinute, untilMinute } = opts;
  const events: GameEvent[] = [];
  for (let guard = 0; state.phase !== 'report' && guard < DAY_GUARD; guard++) {
    if (untilMinute !== undefined && state.minute >= untilMinute) break;
    if (play) autoPlay(state);
    step(state, 1);
    onMinute?.(state);
    events.push(...state.events);
    state.events = [];
  }
  return events;
}

/** Opens the shop and plays it to the report. */
export function playDay(state: GameState, opts: RunOptions = {}): GameEvent[] {
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  const events = runOpenDay(state, opts);
  expect(state.phase).toBe('report');
  return events;
}
