// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch as simDispatch } from '../../src/sim';
import { getMenuItem } from '../../src/sim/data/menu';
import { MILESTONE_VISITS, regularBookEntry } from '../../src/sim/data/regularMilestones';
import { NEW_REGULARS, REGULARS } from '../../src/sim/data/regulars';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { resetRegularToasts, toastForEvent } from '../../src/ui/hud/events';
import type { PanelContext } from '../../src/ui/hud/panels';
import { registerPrepPanels } from '../../src/ui/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { MILESTONE_ACTION } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';

/**
 * E-27 T-98: season-2 regulars in the merged Khách quen list (E-22/E-25) and
 * the milestone toast with "Xem chuyện" (E-25, UX-310). The UI is data-driven
 * (bookRegulars, regularById), so these pin that new regulars get the same
 * row kind and toast as the first eight.
 */

const EMOJI = /\p{Extended_Pictographic}/u;

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  resetRegularToasts();
  document.body.replaceChildren();
});

/** Cô Lan finished her book and Cô Mai moved in; Cô Mai has `visits` visits. */
function season2(visits: number): GameState {
  const state = createNewGame('Quán Thử', 'normal', 1);
  state.day = 300;
  const done = MILESTONE_VISITS.co_lan![3];
  state.regulars = {
    co_lan: { visits: done, firstDay: 2, lastDay: 250, succeededBy: 'co_mai' },
    ...(visits > 0 ? { co_mai: { visits, firstDay: 251, lastDay: 299 } } : {}),
  };
  return state;
}

function render(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  renderTasksPanel(body, ctx);
  return body;
}

const rowShape = (row: HTMLElement) => ({
  tag: row.tagName,
  className: row.className,
  dots: row.querySelectorAll('[data-book-dots] .book-dot').length,
  chevron: row.querySelector('.regular-head .regular-chevron') !== null,
  cells: row.querySelectorAll('.book-cell').length,
  icon: (row.querySelector('.item-icon')?.childElementCount ?? 0) > 0,
});

describe('E-27 new regular row in the merged Khách quen list', () => {
  it('a moved-in regular is the same row kind as an old one: 4 dots, chevron, page opens in place', () => {
    const reachedOne = MILESTONE_VISITS.co_mai![0];
    const body = render(season2(reachedOne));
    const mai = body.querySelector<HTMLElement>('[data-book="co_mai"]')!;
    const lan = body.querySelector<HTMLElement>('[data-book="co_lan"]')!;
    expect(mai).not.toBeNull();
    expect(rowShape(mai)).toEqual(rowShape(lan));
    expect(rowShape(mai)).toMatchObject({ dots: 4, chevron: true, cells: 4, icon: true });
    expect(mai.dataset.reached).toBe('1');
    expect(mai.querySelectorAll('.book-dot.is-reached')).toHaveLength(1);
    expect(mai.querySelector('.regular-head')!.textContent).toContain('Cô Mai');
    expect(mai.querySelector('.item-meta')!.textContent).toBe(`Ghé ${reachedOne} lần · Hay gọi ${getMenuItem('cold_brew').name}`);
    // Opening the page and milestone 1 shows the new regular's story, in place (no dialog).
    const head = () => body.querySelector<HTMLElement>('[data-book="co_mai"] .regular-head')!;
    head().click();
    expect(head().getAttribute('aria-expanded')).toBe('true');
    expect(body.querySelector<HTMLElement>('[data-book="co_mai"] [data-book-page]')!.hidden).toBe(false);
    body.querySelector<HTMLElement>('[data-book="co_mai"] [data-milestone="1"]')!.click();
    const detail = body.querySelector<HTMLElement>('[data-book="co_mai"] [data-book-detail]')!;
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain(regularBookEntry('co_mai')!.milestones[0]!.story);
    expect(body.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(EMOJI.test(body.textContent ?? '')).toBe(false);
  });

  it('a moved-in regular with no visit yet is an unmet row like an old unmet one; not-yet-moved-in ones are not listed', () => {
    const body = render(season2(0));
    const mai = body.querySelector<HTMLElement>('[data-book="co_mai"]')!;
    const unmetOld = body.querySelector<HTMLElement>('[data-book="anh_minh"]')!;
    expect(rowShape(mai)).toEqual(rowShape(unmetOld));
    expect(mai.querySelector('.item-meta')!.textContent).toBe('Chưa ghé quán');
    // Unmet rows come after met ones, book order: the first eight, then season 2.
    const ids = [...body.querySelectorAll<HTMLElement>('[data-book]')].map((r) => r.dataset.book);
    expect(ids).toHaveLength(REGULARS.length + 1);
    expect(ids[0]).toBe('co_lan');
    expect(ids.at(-1)).toBe('co_mai');
    for (const r of NEW_REGULARS) if (r.id !== 'co_mai') expect(ids).not.toContain(r.id);
    expect(body.querySelector('[data-book-sum]')!.textContent).toContain(`Đã gặp 1/${REGULARS.length + 1} khách quen`);
  });
});

describe('E-27 milestone toast for a new regular', () => {
  it('names the new regular, no emoji', () => {
    const state = season2(MILESTONE_VISITS.co_mai![0]);
    const toast = toastForEvent({ type: 'regular_milestone', regularId: 'co_mai', milestone: 1, visits: MILESTONE_VISITS.co_mai![0], tickets: 1 }, state);
    expect(toast?.title).toBe('Cô Mai: mốc 1 trong Sổ khách quen');
    expect(EMOJI.test(`${toast?.title} ${toast?.text}`)).toBe(false);
  });

  it('"Xem chuyện" opens the Việc panel at the new regular\'s row with its page open, no new modal', () => {
    const off = registerPrepPanels();
    onTestFinished(off);
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS } });
    const s = shell;
    const visits = MILESTONE_VISITS.co_mai![1];
    s.startGame(season2(visits));
    const dialogs = () => [...root.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => !d.closest('[hidden]')).length;
    const before = dialogs();
    s.handleEvents([{ type: 'regular_milestone', regularId: 'co_mai', milestone: 2, visits, tickets: 2 }]);
    expect(root.querySelector('.toast-title')!.textContent).toBe('Cô Mai: mốc 2 trong Sổ khách quen');
    const action = root.querySelector<HTMLButtonElement>('.toast [data-action="toast-action"]')!;
    expect(action.textContent).toBe(MILESTONE_ACTION);
    action.click();
    expect(s.hud.openPanelId).toBe('tasks');
    const row = s.hud.panelEl.querySelector<HTMLElement>('[data-book="co_mai"]')!;
    expect(row.classList.contains('is-open')).toBe(true);
    expect(row.querySelector('.regular-head')!.getAttribute('aria-expanded')).toBe('true');
    expect(row.querySelector<HTMLElement>('[data-book-page]')!.hidden).toBe(false);
    expect(row.querySelectorAll('.book-cell.is-reached')).toHaveLength(2);
    expect(document.activeElement).toBe(row.querySelector('.regular-head'));
    expect(s.hud.panelEl.querySelectorAll('.regular-row.is-open')).toHaveLength(1);
    expect(root.querySelectorAll('.toast')).toHaveLength(0);
    expect(dialogs()).toBe(before);
  });
});
