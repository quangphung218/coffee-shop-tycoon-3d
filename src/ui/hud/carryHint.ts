import type { Command, GameState, Order } from '../../sim/types';
import { h } from '../core/dom';

/**
 * E-30 (T-111): a brewed drink left on the counter with nobody carrying it
 * (no staff serve task, nothing queued by the player) for CARRY_HINT_MINUTES
 * game minutes shows one pill, once per day. A tap carries it (the player's
 * own `deliver`, the same as tapping the customer); the pill hides once the
 * drink is carried or gone and does not come back that day.
 * Plain HTML over the canvas: no modal, read-only on the state.
 */

export const CARRY_HINT_TEXT = 'Ly đã pha xong, chạm để mang ra hoặc thuê người phục vụ';

/**
 * Game minutes a ready drink waits before the pill: a working server picks a
 * drink up at once and carries it in TASK_MINUTES.serve (2), so 5 only fires
 * when nobody is going to; it is an eighth of BASE_PATIENCE (40), so the tap
 * still saves the customer.
 */
export const CARRY_HINT_MINUTES = 5;

const OPEN: ReadonlySet<GameState['phase']> = new Set(['opening', 'peak', 'closing']);

function carried(state: GameState, order: Order): boolean {
  return (
    state.playerTasks.some((t) => t.kind === 'serve' && t.targetId === order.id) ||
    state.staff.some((s) => s.task?.kind === 'serve' && s.task.targetId === order.id)
  );
}

export interface CarryHint {
  readonly el: HTMLElement;
  /** Order the pill is shown for, or null when hidden. */
  readonly orderId: number | null;
  /** Per frame: tracks how long ready drinks wait and shows or hides the pill; `covered` hides it under a screen. */
  update(state: GameState | null, covered: boolean): void;
  /** A new or loaded run: forgets the waits and the day it showed. */
  reset(): void;
}

export function createCarryHint(dispatch: (cmd: Command) => boolean): CarryHint {
  let orderId: number | null = null;
  /** Day the pill last showed, so it shows once per day. */
  let shownDay: number | null = null;
  let day: number | null = null;
  /** Ready order id → game minute it was first seen ready and not carried. */
  const since = new Map<number, number>();

  const el = h(
    'button',
    {
      class: 'carry-hint',
      hidden: true,
      attrs: { type: 'button', 'data-hint': 'carry', 'aria-live': 'polite' },
      on: {
        click: () => {
          if (orderId !== null) dispatch({ type: 'deliver', orderId });
          hide();
        },
      },
    },
    h('span', { text: CARRY_HINT_TEXT }),
  );

  function hide(): void {
    orderId = null;
    el.hidden = true;
  }

  return {
    el,
    get orderId() {
      return orderId;
    },
    reset() {
      since.clear();
      shownDay = null;
      day = null;
      hide();
    },
    update(state, covered) {
      if (!state) return hide();
      if (state.day !== day) {
        day = state.day;
        since.clear();
        hide();
      }
      const open = OPEN.has(state.phase);
      // Track every ready, uncarried drink.
      const waiting = open ? state.orders.filter((o) => o.status === 'ready' && !carried(state, o)) : [];
      const ids = new Set(waiting.map((o) => o.id));
      for (const id of [...since.keys()]) if (!ids.has(id)) since.delete(id);
      for (const o of waiting) if (!since.has(o.id)) since.set(o.id, state.minute);
      // Shown: hide once its drink is carried or gone (never comes back this day).
      if (orderId !== null) {
        if (!ids.has(orderId) || covered) hide();
        return;
      }
      // Day 1 with nobody hired has the step-by-step serving hints instead.
      if (covered || shownDay === state.day || state.staff.length === 0) return;
      const late = waiting.find((o) => state.minute - since.get(o.id)! >= CARRY_HINT_MINUTES);
      if (!late) return;
      orderId = late.id;
      shownDay = state.day;
      el.hidden = false;
    },
  };
}
