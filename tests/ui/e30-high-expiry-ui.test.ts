// @vitest-environment jsdom
// E-30 (T-109): outside the Menu / Nhân viên panels, a High price / wage that
// runs out shows as a toast with a button that sets it again, a dock badge on
// the last day and the expiry day, a Việc line, and a week-end line. Driven by
// real days through the shell (playDay, "Ngày tiếp theo", "Sang tuần 2").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch as simDispatch } from '../../src/sim/index';
import { highPriceDaysLeft, highWageDaysLeft, policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { toastForEvent, uniformUnlockToast } from '../../src/ui/hud/events';
import {
  HIGH_PRICE_TASK_TITLE,
  HIGH_PRICE_TOAST_ACTION,
  HIGH_PRICE_TOAST_TITLE,
  HIGH_WAGE_TASK_TITLE,
  HIGH_WAGE_TOAST_ACTION,
  HIGH_WAGE_TOAST_TITLE,
} from '../../src/ui/highExpiry';
import { openTaskCount, registerPrepPanels } from '../../src/ui/panels';
import { dayTasks } from '../../src/ui/panels/tasks';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;

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

/** v0.40.0's toasts for these events: one per toastForEvent / uniform toast. */
function oldToastCount(events: readonly GameEvent[], state: GameState): number {
  return events.filter((e) => toastForEvent(e, state, 0) !== null).length + events.filter((e) => uniformUnlockToast(e) !== null).length;
}

/** Hands queued events to the shell like the game loop does, counting the toasts shown. */
function flush(s: Shell, state: GameState): { shown: string[]; old: number } {
  const events = state.events.splice(0);
  const spy = vi.spyOn(s.toasts, 'show');
  const old = oldToastCount(events, state);
  s.handleEvents(events);
  const shown = spy.mock.calls.map(([input]) => input.title);
  spy.mockRestore();
  s.update();
  return { shown, old };
}

/** Plays today and leaves the report with its main button ("Ngày tiếp theo" or, on the week's last day, the week summary then "Sang tuần 2"). */
function playAndNext(s: Shell, root: HTMLElement, state: GameState): { shown: string[]; old: number } {
  simDispatch(state, { type: 'apply_restock' });
  s.handleEvents(playDay(state));
  s.update();
  const main = s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!;
  main.click();
  if (s.screen === 'weekEnd') root.querySelector<HTMLButtonElement>('[data-screen="weekEnd"] [data-action="next-week"]')!.click();
  return flush(s, state);
}

function badge(root: HTMLElement, panel: string): string | null {
  const b = root.querySelector<HTMLElement>(`[data-panel="${panel}"] .dock-badge`);
  return b && !b.hidden ? b.textContent : null;
}

function toastEl(root: HTMLElement, title: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('.toast')].find((t) => t.querySelector('.toast-title')?.textContent === title) ?? null;
}

describe('E-30: High price / wage expiry outside the panels', { timeout: 300_000 }, () => {
  it('badges the last day, says it on the week end, then toasts with a reset button, badges and lists it on the expiry day', () => {
    const { root, shell, state } = boot(3030);
    expect(shell.dispatch({ type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
    expect(shell.dispatch({ type: 'set_policy', policy: 'wage', level: 'high' })).toBe(true);
    flush(shell, state);
    expect(badge(root, 'menu')).toBeNull();
    expect(badge(root, 'staff')).toBeNull();

    // Days 1..6: no badge; ordinary days get no extra toast.
    for (let d = 1; d < WEEK_LENGTH; d++) {
      const { shown, old } = playAndNext(shell, root, state);
      expect(shown.length).toBeLessThanOrEqual(old + 1);
      expect(state.day).toBe(d + 1);
      if (state.day < WEEK_LENGTH) {
        expect(badge(root, 'menu')).toBeNull();
        expect(badge(root, 'staff')).toBeNull();
      }
    }

    // Day 7, last remaining day: both badges, no Việc line yet.
    expect(state.day).toBe(WEEK_LENGTH);
    expect(highPriceDaysLeft(state)).toBe(1);
    expect(highWageDaysLeft(state)).toBe(1);
    expect(badge(root, 'menu')).toBe('1');
    expect(badge(root, 'staff')).toBe('1');
    expect(dayTasks(state).map((t) => t.id)).not.toContain('price-ended');

    // Week end of week 1: High runs out on the first day of week 2.
    simDispatch(state, { type: 'apply_restock' });
    shell.handleEvents(playDay(state));
    shell.update();
    shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    expect(shell.screen).toBe('weekEnd');
    const week = root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
    expect(week.querySelector('[data-next="price-ends"]')?.textContent).toBe('Giá Cao hết vào ngày đầu tuần 2.');
    expect(week.querySelector('[data-next="wage-ends"]')?.textContent).toBe('Lương Cao hết vào ngày đầu tuần 2.');
    expect(week.textContent).not.toMatch(EMOJI);

    // Sang tuần 2: day 8, the real day change expires both.
    week.querySelector<HTMLButtonElement>('[data-action="next-week"]')!.click();
    const { shown, old } = flush(shell, state);
    expect(state.day).toBe(WEEK_LENGTH + 1);
    expect(policyLevel(state, 'price')).toBe('standard');
    expect(policyLevel(state, 'wage')).toBe('standard');
    // The expiry toasts take the place of the sim's notify toasts: no more toasts than v0.40.0.
    expect(shown.length).toBeLessThanOrEqual(old);
    expect(shown).toContain(HIGH_PRICE_TOAST_TITLE);
    expect(shown).toContain(HIGH_WAGE_TOAST_TITLE);
    expect(shown.some((t) => /^(Giá|Lương) cao đã hết/.test(t))).toBe(false);
    expect(HIGH_PRICE_TOAST_TITLE).toBe('Giá Cao đã hết sau 7 ngày, quán về giá Chuẩn');
    expect(HIGH_WAGE_TOAST_TITLE).toBe('Lương Cao đã hết sau 7 ngày, quán về lương Chuẩn');

    // Badges on the expiry day.
    expect(badge(root, 'menu')).toBe('1');
    expect(badge(root, 'staff')).toBe('1');

    // Việc lines.
    const tasks = dayTasks(state);
    expect(tasks.find((t) => t.id === 'price-ended')?.title).toBe(HIGH_PRICE_TASK_TITLE);
    expect(tasks.find((t) => t.id === 'wage-ended')?.title).toBe(HIGH_WAGE_TASK_TITLE);
    expect(HIGH_PRICE_TASK_TITLE).toBe('Giá Cao vừa hết');
    expect(HIGH_WAGE_TASK_TITLE).toBe('Lương Cao vừa hết');
    root.querySelector<HTMLButtonElement>('[data-panel="tasks"]')!.click();
    const row = root.querySelector<HTMLElement>('[data-task="price-ended"]')!;
    expect(row.textContent).toContain('Giá Cao vừa hết');
    expect(root.querySelector<HTMLElement>('[data-task="wage-ended"]')!.textContent).toContain('Lương Cao vừa hết');
    const tasksOpen = openTaskCount(state);

    // No modal, no emoji.
    expect(root.querySelector('[role="dialog"]:not([hidden]) .toast, dialog[open]')).toBeNull();
    const priceToast = toastEl(root, HIGH_PRICE_TOAST_TITLE)!;
    const wageToast = toastEl(root, HIGH_WAGE_TOAST_TITLE)!;
    expect(priceToast.textContent).not.toMatch(EMOJI);
    expect(wageToast.textContent).not.toMatch(EMOJI);

    // The toast buttons set High again; badges and Việc lines clear.
    const priceBtn = priceToast.querySelector<HTMLButtonElement>(`[data-action="${HIGH_PRICE_TOAST_ACTION}"]`)!;
    expect(priceBtn.textContent).toBe('Đặt lại giá Cao');
    priceBtn.click();
    const wageBtn = wageToast.querySelector<HTMLButtonElement>(`[data-action="${HIGH_WAGE_TOAST_ACTION}"]`)!;
    expect(wageBtn.textContent).toBe('Đặt lại lương Cao');
    wageBtn.click();
    shell.update();
    expect(policyLevel(state, 'price')).toBe('high');
    expect(policyLevel(state, 'wage')).toBe('high');
    expect(highPriceDaysLeft(state)).toBe(7);
    expect(toastEl(root, HIGH_PRICE_TOAST_TITLE)).toBeNull();
    expect(badge(root, 'menu')).toBeNull();
    expect(badge(root, 'staff')).toBeNull();
    expect(dayTasks(state).map((t) => t.id)).not.toContain('price-ended');
    expect(openTaskCount(state)).toBe(tasksOpen - 2);
  });

  it('drops the expiry-day badge and Việc line once the day opens, and the next day', () => {
    const { root, shell, state } = boot(3031);
    shell.dispatch({ type: 'set_policy', policy: 'price', level: 'high' });
    flush(shell, state);
    for (let d = 0; d < WEEK_LENGTH; d++) playAndNext(shell, root, state);
    expect(state.day).toBe(WEEK_LENGTH + 1);
    expect(badge(root, 'menu')).toBe('1');
    expect(badge(root, 'staff')).toBeNull();
    expect(dayTasks(state).map((t) => t.id)).toContain('price-ended');
    expect(dayTasks(state).map((t) => t.id)).not.toContain('wage-ended');

    expect(shell.dispatch({ type: 'start_day' })).toBe(true);
    shell.update();
    expect(badge(root, 'menu')).toBeNull();
    expect(dayTasks(state).map((t) => t.id)).not.toContain('price-ended');
  });
});
