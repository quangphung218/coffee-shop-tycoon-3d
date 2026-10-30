import type { Command, GameState } from '../../sim/types';
import type { StorageLike } from '../../save/storage';
import { h } from '../core/dom';

/**
 * First-minute serving hints (E-15): on day 1 of a new run with no staff, a
 * text label over what to tap next, one step at a time: the first customer
 * in line, then the coffee machine, then the customer whose drink is ready.
 * Each step is done after its first accepted tap and remembered per browser
 * (not in the save), so day 2, a loaded save and the next run show none.
 * Plain HTML over the canvas: no draw call, no modal, taps go through.
 */

export type ServeHintStep = 'order' | 'brew' | 'serve';
export const SERVE_HINT_STEPS: readonly ServeHintStep[] = ['order', 'brew', 'serve'];
export const SERVE_HINT_TEXT: Readonly<Record<ServeHintStep, string>> = {
  order: 'Chạm để nhận order',
  brew: 'Chạm để pha',
  serve: 'Chạm để bưng',
};
/** Steps done, comma separated (e.g. "order,brew"). */
export const SERVE_HINT_KEY = 'cst3d:hint:serve';

/** What a hint points at: a customer's head or the coffee machine. */
export type ServeHintTarget = { kind: 'customer'; id: number } | { kind: 'machine' };
/** Screen point in CSS px of the overlay, or null when the target is not on screen. */
export type LocateHint = (target: ServeHintTarget) => { x: number; y: number } | null;

const STEP_FOR_COMMAND: Partial<Record<Command['type'], ServeHintStep>> = { take_order: 'order', brew: 'brew', deliver: 'serve' };

/** Where the hint of `step` points now, or null when there is nothing to tap for it yet. */
export function serveHintTarget(state: GameState, step: ServeHintStep): ServeHintTarget | null {
  if (step === 'order') {
    const first = state.customers.find((c) => c.state === 'queueing');
    return first ? { kind: 'customer', id: first.id } : null;
  }
  if (step === 'brew') return state.orders.some((o) => o.status === 'pending') ? { kind: 'machine' } : null;
  const ready = state.orders.find((o) => o.status === 'ready' && state.customers.some((c) => c.id === o.customerId && c.state === 'waiting'));
  return ready ? { kind: 'customer', id: ready.customerId } : null;
}

/** The hints apply to this state: day 1, nobody hired, doors open. */
export function serveHintsApply(state: GameState): boolean {
  return state.day === 1 && state.staff.length === 0 && (state.phase === 'opening' || state.phase === 'peak' || state.phase === 'closing');
}

export interface ServeHints {
  readonly el: HTMLElement;
  /** Shown step, or null. */
  readonly step: ServeHintStep | null;
  /** A run starts: only a new run (no save slot) on day 1 gets the hints. */
  start(state: GameState, fromSave: boolean): void;
  /** Stops showing hints (back to the menu). */
  stop(): void;
  /** An accepted command: a matching tap finishes its step. */
  onCommand(cmd: Command): void;
  /** Per frame: picks the step and moves the label; `covered` hides it under a screen. */
  update(state: GameState | null, covered: boolean): void;
}

export function createServeHints(storage: StorageLike, locate?: LocateHint): ServeHints {
  const el = h('div', { class: 'serve-hint', hidden: true, attrs: { role: 'status', 'aria-live': 'polite' } });
  const text = h('span');
  el.append(text);
  let active = false;
  let shown: ServeHintStep | null = null;
  const done = new Set<ServeHintStep>();

  function readDone(): void {
    done.clear();
    try {
      for (const s of (storage.getItem(SERVE_HINT_KEY) ?? '').split(',')) {
        if ((SERVE_HINT_STEPS as readonly string[]).includes(s)) done.add(s as ServeHintStep);
      }
    } catch {
      // Storage blocked: the hints still run for this page.
    }
  }

  function hide(): void {
    shown = null;
    el.hidden = true;
  }

  return {
    el,
    get step() {
      return shown;
    },
    start(state, fromSave) {
      readDone();
      active = !fromSave && state.day === 1 && state.staff.length === 0 && done.size < SERVE_HINT_STEPS.length;
      hide();
    },
    stop() {
      active = false;
      hide();
    },
    onCommand(cmd) {
      const step = STEP_FOR_COMMAND[cmd.type];
      if (!active || !step || done.has(step)) return;
      done.add(step);
      try {
        storage.setItem(SERVE_HINT_KEY, SERVE_HINT_STEPS.filter((s) => done.has(s)).join(','));
      } catch {
        // Not remembered past this page.
      }
      if (done.size === SERVE_HINT_STEPS.length) active = false;
      if (shown === step) hide();
    },
    update(state, covered) {
      if (!active || !state || covered || !serveHintsApply(state)) return hide();
      const step = SERVE_HINT_STEPS.find((s) => !done.has(s));
      const target = step ? serveHintTarget(state, step) : null;
      if (!step || !target) return hide();
      if (shown !== step) text.textContent = SERVE_HINT_TEXT[step];
      shown = step;
      el.setAttribute('data-step', step);
      // Without a 3D view (or the target off screen) it waits mid-screen.
      const at = locate?.(target) ?? null;
      el.classList.toggle('is-anchored', at !== null);
      el.style.left = at ? `${Math.round(at.x)}px` : '';
      el.style.top = at ? `${Math.round(at.y)}px` : '';
      el.hidden = false;
    },
  };
}
