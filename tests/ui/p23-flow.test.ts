// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch as simDispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

/**
 * P23 flow through the real shell and the real sim: the Daily Report of day 1
 * and day 2, the last week day's "Xem tổng kết tuần", and "Sang tuần 2".
 */

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function boot(): { root: HTMLElement; shell: Shell; state: GameState } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  const state = createNewGame('Quán Luồng', 'normal', 2323);
  shell.startGame(state);
  return { root, shell, state };
}

/** Plays today in the sim and hands its events to the shell like the game loop does. */
function playToday(s: Shell, state: GameState): void {
  simDispatch(state, { type: 'apply_restock' });
  const events = playDay(state);
  s.handleEvents(events);
  s.update();
}

function mainButton(s: Shell): HTMLButtonElement {
  const btn = s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary');
  if (!btn) throw new Error('missing report main button');
  return btn;
}

function figures(s: Shell): HTMLElement {
  const el = s.report.el.querySelector<HTMLElement>('[data-block="figures"]');
  if (!el) throw new Error('missing figures');
  return el;
}

function weekEndEl(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]');
  if (!el) throw new Error('missing week-end screen');
  return el;
}

function weekLine(s: Shell): string {
  return s.hud.el.querySelector('[data-stat="week"]')?.textContent ?? '';
}

describe('P23 flow: report, week summary, next week', { timeout: 300_000 }, () => {
  it('shows no change on the day 1 report and changes on day 2', () => {
    const { shell, state } = boot();
    playToday(shell, state);
    expect(shell.report.visible).toBe(true);
    expect(figures(shell).querySelectorAll('[data-fig]').length).toBeGreaterThan(0);
    expect(figures(shell).querySelector('[data-vs]')).toBeNull();
    expect(shell.report.el.querySelector('.rpt-fig-delta')).toBeNull();
    expect(mainButton(shell).textContent).toBe('Ngày tiếp theo');

    mainButton(shell).click();
    expect(state.day).toBe(2);
    expect(shell.report.visible).toBe(false);
    playToday(shell, state);
    expect(shell.report.visible).toBe(true);
    const yesterday = figures(shell).querySelectorAll<HTMLElement>('[data-vs="yesterday"]');
    expect(yesterday.length).toBeGreaterThan(0);
    for (const d of yesterday) {
      expect(['up', 'down', 'flat']).toContain(d.dataset.delta);
      expect(d.textContent).toContain('so hôm qua');
    }
    expect(figures(shell).querySelector('[data-fig="revenue"] [data-vs="yesterday"]')).not.toBeNull();
  });

  it('offers "Xem tổng kết tuần" on day 7, then "Sang tuần 2" opens week 2 on the HUD', () => {
    const { root, shell, state } = boot();
    expect(weekLine(shell)).toBe('Tuần 1 · 1/7');
    for (let d = 1; d < WEEK_LENGTH; d++) {
      playToday(shell, state);
      const btn = mainButton(shell);
      expect(btn.textContent).toBe('Ngày tiếp theo');
      btn.click();
    }
    expect(state.day).toBe(WEEK_LENGTH);
    playToday(shell, state);
    expect(state.week!.result).toBeTruthy();

    const toWeek = mainButton(shell);
    expect(toWeek.textContent).toBe('Xem tổng kết tuần');
    toWeek.click();
    expect(shell.screen).toBe('weekEnd');
    const el = weekEndEl(root);
    expect(el.hidden).toBe(false);
    expect(el.querySelector('h3')?.textContent).toBe('Tổng kết tuần 1');

    const next = el.querySelector<HTMLButtonElement>('[data-action="next-week"]');
    expect(next?.textContent).toBe('Sang tuần 2');
    next!.click();
    shell.update();

    expect(shell.screen).toBeNull();
    expect(el.hidden).toBe(true);
    expect(state.day).toBe(WEEK_LENGTH + 1);
    expect(state.week!.index).toBe(2);
    expect(weekLine(shell)).toBe('Tuần 2 · 1/7');
    expect(shell.hud.el.textContent).toContain('Tuần 2');
  });
});
