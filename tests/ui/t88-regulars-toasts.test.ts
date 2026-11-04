// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { resetRegularToasts, toastForEvent } from '../../src/ui/hud/events';
import type { PanelContext } from '../../src/ui/hud/panels';
import { registerPrepPanels } from '../../src/ui/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { DAY1_WALKOUT_TOAST_MS, MILESTONE_ACTION } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';

// Vitest stubs .css imports, so read the stylesheet through node:fs (see css-order.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };

const EMOJI = /\p{Extended_Pictographic}/u;

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  resetRegularToasts();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function boot(): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS } });
  return { root, shell };
}

const titles = (root: HTMLElement): string[] => [...root.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
const arrived = (regularId: string, visits: number): GameEvent => ({ type: 'regular_arrived', customerId: 1, regularId, visits });

describe('UX-304 Khách quen row: no empty strip when closed, chevron follows aria-expanded', () => {
  it('a closed row is one grid row; the chevron turns with aria-expanded', () => {
    const state = createNewGame('Quán Thử', 'normal', 1);
    state.regulars = { co_lan: { visits: 3, firstDay: 2, lastDay: 4 } };
    const body = document.createElement('div');
    document.body.append(body);
    const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
    renderTasksPanel(body, ctx);
    const row = body.querySelector<HTMLElement>('[data-book="co_lan"]')!;
    const head = () => row.isConnected ? row.querySelector<HTMLElement>('.regular-head')! : body.querySelector<HTMLElement>('[data-book="co_lan"] .regular-head')!;
    expect(head().getAttribute('aria-expanded')).toBe('false');
    expect(head().querySelector('.regular-chevron')).not.toBeNull();
    expect(body.querySelector('[data-book="co_lan"]')!.classList.contains('is-open')).toBe(false);
    expect(body.querySelector<HTMLElement>('[data-book="co_lan"] [data-book-page]')!.hidden).toBe(true);
    head().click();
    expect(head().getAttribute('aria-expanded')).toBe('true');
    expect(body.querySelector('[data-book="co_lan"]')!.classList.contains('is-open')).toBe(true);
    head().click();
    expect(head().getAttribute('aria-expanded')).toBe('false');
    expect(body.querySelector('[data-book="co_lan"]')!.classList.contains('is-open')).toBe(false);

    const css = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\s+/g, ' ');
    // Closed: only the first grid row, so no row gaps below it; open adds the page row.
    expect(css).toContain(".item.item-row.regular-row { grid-template-areas: 'icon text status'; }");
    expect(css).toContain(".item.item-row.regular-row.is-open { grid-template-areas: 'icon text status' '. more more'; }");
    expect(css).toContain(".regular-head[aria-expanded='true'] .regular-chevron { transform: rotate(180deg); }");
  });
});

describe('UX-306 day-1 "Khách bỏ đi" toast', () => {
  it('hides by itself after ~6 s, and closes when the counter label shows (never both)', () => {
    vi.useFakeTimers();
    const { root, shell: s } = boot();
    s.startGame(createNewGame('Quán Thử', 'normal', 1));
    expect(s.state!.day).toBe(1);
    const angry = (): GameEvent => ({ type: 'angry', customerId: 1 }) as GameEvent;
    s.handleEvents([angry()]);
    expect(titles(root)).toEqual(['Khách bỏ đi']);
    vi.advanceTimersByTime(DAY1_WALKOUT_TOAST_MS - 100);
    expect(titles(root)).toEqual(['Khách bỏ đi']);
    vi.advanceTimersByTime(200);
    expect(titles(root)).toEqual([]);

    // A second run: the second walkout comes while the first toast is still up.
    s.startGame(createNewGame('Quán Thử', 'normal', 2));
    s.handleEvents([angry()]);
    expect(titles(root)).toEqual(['Khách bỏ đi']);
    s.handleEvents([angry()]);
    s.update();
    const counter = root.querySelector<HTMLElement>('.walkout-count')!;
    expect(counter.hidden).toBe(false);
    expect(counter.textContent).toBe('Khách bỏ đi: 2');
    expect(titles(root)).toEqual([]);
  });
});

describe('UX-307 regular arrival toast only on a first visit or near a milestone', () => {
  it('"Anh Minh: còn 1 lần tới mốc 3", and nothing for an ordinary visit', () => {
    const state = createNewGame('Quán Thử', 'normal', 1);
    // Anh Minh: milestones at 25, 65, 145 visits.
    resetRegularToasts();
    expect(toastForEvent(arrived('anh_minh', 1), state, 0)!.title).toBe('Khách quen mới: Anh Minh');
    resetRegularToasts();
    expect(toastForEvent(arrived('anh_minh', 30), state, 0)).toBeNull();
    resetRegularToasts();
    expect(toastForEvent(arrived('anh_minh', 142), state, 0)).toBeNull();
    resetRegularToasts();
    const two = toastForEvent(arrived('anh_minh', 143), state, 0)!;
    expect(two.title).toBe('Anh Minh: còn 2 lần tới mốc 3');
    resetRegularToasts();
    const one = toastForEvent(arrived('anh_minh', 144), state, 0)!;
    expect(one.title).toBe('Anh Minh: còn 1 lần tới mốc 3');
    expect(one.text).toBe('Anh Minh ghé quán (lần 144)');
    expect(EMOJI.test(`${one.title}${one.text}`)).toBe(false);
    // Past the last milestone: no toast.
    resetRegularToasts();
    expect(toastForEvent(arrived('anh_minh', 300), state, 0)).toBeNull();
  });
});

describe('UX-310 milestone toast "Xem chuyện"', () => {
  it('opens the Việc panel at that regular\'s row with its page open, no new modal', () => {
    const off = registerPrepPanels();
    onTestFinished(off);
    const { root, shell: s } = boot();
    const game: GameState = createNewGame('Quán Thử', 'normal', 1);
    game.day = 12;
    game.regulars = { chi_hoa: { visits: 15, firstDay: 2, lastDay: 12 } };
    s.startGame(game);
    const dialogs = () => [...root.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => !d.closest('[hidden]')).length;
    const before = dialogs();
    s.handleEvents([{ type: 'regular_milestone', regularId: 'chi_hoa', milestone: 1, visits: 15, tickets: 1 }]);
    const action = root.querySelector<HTMLButtonElement>('.toast [data-action="toast-action"]')!;
    expect(action.textContent).toBe(MILESTONE_ACTION);
    expect(MILESTONE_ACTION).toBe('Xem chuyện');
    action.click();
    expect(s.hud.openPanelId).toBe('tasks');
    const row = s.hud.panelEl.querySelector<HTMLElement>('[data-book="chi_hoa"]')!;
    expect(row.classList.contains('is-open')).toBe(true);
    expect(row.querySelector('.regular-head')!.getAttribute('aria-expanded')).toBe('true');
    expect(row.querySelector<HTMLElement>('[data-book-page]')!.hidden).toBe(false);
    expect(document.activeElement).toBe(row.querySelector('.regular-head'));
    expect(root.querySelectorAll('.toast')).toHaveLength(0);
    expect(dialogs()).toBe(before);
    // Other rows stay closed, and a later open of the panel does not reopen the page.
    expect(s.hud.panelEl.querySelectorAll('.regular-row.is-open')).toHaveLength(1);
    s.hud.closePanel();
    s.hud.openPanel('tasks');
    expect(s.hud.panelEl.querySelectorAll('.regular-row.is-open')).toHaveLength(0);
  });
});
