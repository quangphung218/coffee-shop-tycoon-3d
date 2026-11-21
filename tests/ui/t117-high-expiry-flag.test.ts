// @vitest-environment jsdom
// T-117 (E-30 follow-up): the High price / wage expiry toast and its "Đặt lại"
// button come from highPriceEndedDay / highWageEndedDay, not the sim notify's
// text. Rewording the notify must not drop the button.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch as simDispatch } from '../../src/sim/index';
import { policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { toastForEvent, uniformUnlockToast } from '../../src/ui/hud/events';
import {
  createHighExpiryWatch,
  HIGH_PRICE_TOAST_ACTION,
  HIGH_PRICE_TOAST_TITLE,
  HIGH_WAGE_TOAST_ACTION,
  HIGH_WAGE_TOAST_TITLE,
} from '../../src/ui/highExpiry';
import { registerPrepPanels } from '../../src/ui/panels';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

let shell: Shell | null = null;
let offPanels: (() => void) | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  offPanels?.();
  offPanels = null;
  document.body.replaceChildren();
});

function boot(seed: number): { root: HTMLElement; shell: Shell; state: GameState } {
  const root = document.createElement('div');
  document.body.append(root);
  offPanels = registerPrepPanels();
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  const state = createNewGame('Quán Hạn', 'normal', seed);
  shell.startGame(state);
  return { root, shell, state };
}

/** Hands queued events to the shell, each notify reworded first, and returns the toast titles shown and v0.40.0's count. */
function flushReworded(s: Shell, state: GameState): { shown: string[]; old: number } {
  const events: GameEvent[] = state.events.splice(0).map((e) => (e.type === 'notify' ? { ...e, text: `Thông báo mới: ${e.text.toUpperCase()}` } : e));
  const old = events.filter((e) => toastForEvent(e, state, 0) !== null).length + events.filter((e) => uniformUnlockToast(e) !== null).length;
  const spy = vi.spyOn(s.toasts, 'show');
  s.handleEvents(events);
  const shown = spy.mock.calls.map(([input]) => input.title);
  spy.mockRestore();
  s.update();
  return { shown, old };
}

function toastEl(root: HTMLElement, title: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.toast')].find((t) => t.querySelector('.toast-title')?.textContent === title) ?? null;
}

describe('T-117: expiry toast recognised from state, not notice text', { timeout: 300_000 }, () => {
  it('keeps both "Đặt lại" buttons, in place of the notifies, when the sim notify text is changed', () => {
    const { root, shell, state } = boot(3117);
    shell.dispatch({ type: 'set_policy', policy: 'price', level: 'high' });
    shell.dispatch({ type: 'set_policy', policy: 'wage', level: 'high' });
    flushReworded(shell, state);
    for (let d = 0; d < WEEK_LENGTH; d++) {
      simDispatch(state, { type: 'apply_restock' });
      shell.handleEvents(playDay(state));
      shell.update();
      shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
      if (shell.screen === 'weekEnd') root.querySelector<HTMLButtonElement>('[data-screen="weekEnd"] [data-action="next-week"]')!.click();
      if (d < WEEK_LENGTH - 1) {
        const { shown } = flushReworded(shell, state);
        expect(shown).not.toContain(HIGH_PRICE_TOAST_TITLE);
      }
    }
    // Day 8: the batch with the expiry, its notify texts changed.
    const { shown, old } = flushReworded(shell, state);
    expect(state.day).toBe(WEEK_LENGTH + 1);
    expect(policyLevel(state, 'price')).toBe('standard');
    expect(shown).toContain(HIGH_PRICE_TOAST_TITLE);
    expect(shown).toContain(HIGH_WAGE_TOAST_TITLE);
    // Still one toast in place of each notify: none of the reworded expiry notifies shows on its own.
    expect(shown.length).toBeLessThanOrEqual(old);
    expect(shown.filter((t) => /CAO ĐÃ HẾT/.test(t))).toEqual([]);

    const priceBtn = toastEl(root, HIGH_PRICE_TOAST_TITLE)!.querySelector<HTMLButtonElement>(`[data-action="${HIGH_PRICE_TOAST_ACTION}"]`);
    const wageBtn = toastEl(root, HIGH_WAGE_TOAST_TITLE)!.querySelector<HTMLButtonElement>(`[data-action="${HIGH_WAGE_TOAST_ACTION}"]`);
    expect(priceBtn?.textContent).toBe('Đặt lại giá Cao');
    expect(wageBtn?.textContent).toBe('Đặt lại lương Cao');
    priceBtn!.click();
    expect(policyLevel(state, 'price')).toBe('high');

    // A later batch the same day does not toast again.
    shell.dispatch({ type: 'set_policy', policy: 'price', level: 'standard' });
    expect(flushReworded(shell, state).shown).not.toContain(HIGH_PRICE_TOAST_TITLE);
  });
});

describe('createHighExpiryWatch', () => {
  it('reports each expiry once, price first, and not for a state loaded on its expiry day', () => {
    const state = createNewGame('Quán Hạn', 'normal', 1);
    const watch = createHighExpiryWatch();
    watch.reset(state);
    expect(watch.take(state)).toEqual([]);
    state.highWageEndedDay = state.day;
    state.highPriceEndedDay = state.day;
    expect(watch.take(state)).toEqual(['price', 'wage']);
    expect(watch.take(state)).toEqual([]);

    const loaded = createNewGame('Quán Hạn', 'normal', 2);
    loaded.highPriceEndedDay = loaded.day;
    watch.reset(loaded);
    expect(watch.take(loaded)).toEqual([]);
  });
});
