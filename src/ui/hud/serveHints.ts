import type { Command, GameState } from '../../sim/types';
import type { StorageLike } from '../../save/storage';
import { h } from '../core/dom';

/**
 * First-minute serving hints (E-15, E-20): on day 1 with no staff, a text
 * label over what to tap next, one step at a time: the first customer in
 * line, the coffee machine, the customer whose drink is ready, then a table
 * with money on it and a dirty table. Each step is done after its first
 * accepted tap and remembered per browser (not in the save), so a reload on
 * day 1 picks up at the next step, and day 2 and the next run show none.
 * Plain HTML over the canvas: no draw call, no modal, taps go through.
 *
 * Also folds day-1 walkouts: the first "Khách bỏ đi" is a toast, the rest
 * only count up in a small label.
 */

export type ServeHintStep = 'order' | 'brew' | 'serve' | 'collect' | 'clean';
export const SERVE_HINT_STEPS: readonly ServeHintStep[] = ['order', 'brew', 'serve', 'collect', 'clean'];
export const SERVE_HINT_TEXT: Readonly<Record<ServeHintStep, string>> = {
  order: 'Chạm để nhận order',
  brew: 'Chạm để pha',
  serve: 'Chạm để bưng',
  collect: 'Chạm để thu tiền',
  clean: 'Chạm để dọn',
};
/** Steps done, comma separated (e.g. "order,brew"). */
export const SERVE_HINT_KEY = 'cst3d:hint:serve';

/** What a hint points at: a customer's head, the coffee machine or a table. */
export type ServeHintTarget = { kind: 'customer'; id: number } | { kind: 'machine' } | { kind: 'table'; id: number };
/** Screen point in CSS px of the overlay, or null when the target is not on screen. */
export type LocateHint = (target: ServeHintTarget) => { x: number; y: number } | null;

const STEP_FOR_COMMAND: Partial<Record<Command['type'], ServeHintStep>> = {
  take_order: 'order',
  brew: 'brew',
  deliver: 'serve',
  collect_cash: 'collect',
  clean_table: 'clean',
};

/** Where the hint of `step` points now, or null when there is nothing to tap for it yet. */
export function serveHintTarget(state: GameState, step: ServeHintStep): ServeHintTarget | null {
  if (step === 'order') {
    const first = state.customers.find((c) => c.state === 'queueing');
    return first ? { kind: 'customer', id: first.id } : null;
  }
  if (step === 'brew') return state.orders.some((o) => o.status === 'pending') ? { kind: 'machine' } : null;
  if (step === 'collect' || step === 'clean') {
    // A tap on a table with money collects first (picking.ts), so "dọn" waits for a table without any.
    const table = state.tables.find((t) => (step === 'collect' ? t.cash > 0 : t.trash > 0 && t.cash <= 0));
    return table ? { kind: 'table', id: table.id } : null;
  }
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
  /** Day-1 walkout counter, shown after the first walkout's toast. */
  readonly walkoutEl: HTMLElement;
  /** A run starts, new or loaded: day 1 with no staff gets the steps not done yet. */
  start(state: GameState): void;
  /** Stops showing hints (back to the menu). */
  stop(): void;
  /** An accepted command: a matching tap finishes its step. */
  onCommand(cmd: Command): void;
  /** A customer left angry: true when it gets a toast, false when it only counts up the label (day 1 after the first). */
  onWalkout(state: GameState): boolean;
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
  const walkoutEl = h('div', { class: 'walkout-count', hidden: true, attrs: { role: 'status' } });
  /** Day-1 walkouts this run; the first had a toast. */
  let walkouts = 0;

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
    walkoutEl,
    start(state) {
      readDone();
      walkouts = 0;
      walkoutEl.hidden = true;
      active = state.day === 1 && state.staff.length === 0 && done.size < SERVE_HINT_STEPS.length;
      hide();
    },
    stop() {
      active = false;
      walkouts = 0;
      walkoutEl.hidden = true;
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
    onWalkout(state) {
      if (state.day !== 1) return true;
      walkouts += 1;
      if (walkouts === 1) return true;
      walkoutEl.textContent = `Khách bỏ đi: ${walkouts}`;
      return false;
    },
    update(state, covered) {
      walkoutEl.hidden = walkouts < 2 || !state || covered || state.day !== 1;
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
