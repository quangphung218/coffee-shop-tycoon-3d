// @vitest-environment jsdom
// T-116 (E-31): Khách quen list polish and two small layout fixes, one test per
// UX code. Layout ones (411/412/413) pin the CSS rule; jsdom does no layout.
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch as simDispatch } from '../../src/sim';
import { MILESTONE_VISITS, regularBookEntry } from '../../src/sim/data/regularMilestones';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { resetRegularToasts } from '../../src/ui/hud/events';
import type { PanelContext } from '../../src/ui/hud/panels';
import { registerPrepPanels } from '../../src/ui/panels';
import { NEW_REGULAR_DAYS, renderTasksPanel } from '../../src/ui/panels/tasks';
import { MILESTONE_ACTION } from '../../src/ui/screens/game';
import { createSettings } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';

const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const css = (p: string): string => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const UI_CSS = 'src/ui/styles/ui.css';
const PANELS_CSS = 'src/ui/panels/panels.css';

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  resetRegularToasts();
  document.body.replaceChildren();
});

/** Cô Lan finished her book on day `movedIn - 1`; Cô Mai moved in on `movedIn`. Today is `day`. */
function season2(day: number, movedIn: number, maiVisits = 1): GameState {
  const state = createNewGame('Quán Thử', 'normal', 1);
  state.day = day;
  state.regulars = {
    co_lan: { visits: MILESTONE_VISITS.co_lan![3], firstDay: 2, lastDay: movedIn - 1, succeededBy: 'co_mai' },
    // Anh Minh came today, so by last visit he would lead the list.
    anh_minh: { visits: 30, firstDay: 2, lastDay: day },
    co_mai: { visits: maiVisits, firstDay: movedIn, lastDay: movedIn },
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

const ids = (body: HTMLElement): string[] => [...body.querySelectorAll<HTMLElement>('[data-book]')].map((r) => r.dataset.book!);
const newBadge = (body: HTMLElement, id: string) => body.querySelector(`[data-book="${id}"] [data-new-regular]`);

describe('T-116 Khách quen UX', () => {
  it('UX-408: a just-moved-in regular leads the list with "Mới" for 7 days, then takes the usual order', () => {
    expect(NEW_REGULAR_DAYS).toBe(7);
    for (const day of [240, 240 + NEW_REGULAR_DAYS - 1]) {
      document.body.replaceChildren();
      const body = render(season2(day, 240));
      expect(ids(body)[0]).toBe('co_mai');
      expect(newBadge(body, 'co_mai')?.textContent).toBe('Mới');
      expect(newBadge(body, 'co_mai')?.classList.contains('badge')).toBe(true);
      expect(body.querySelectorAll('[data-new-regular]')).toHaveLength(1);
      // The label sits beside the name, outside the disclosure button.
      expect(newBadge(body, 'co_mai')?.closest('.regular-head')).toBeNull();
    }
    document.body.replaceChildren();
    const later = render(season2(240 + NEW_REGULAR_DAYS, 240));
    expect(ids(later)[0]).toBe('anh_minh');
    expect(newBadge(later, 'co_mai')).toBeNull();
    // A first-eight regular met for the first time today is never "Mới".
    document.body.replaceChildren();
    const fresh = createNewGame('Quán Thử', 'normal', 1);
    fresh.day = 3;
    fresh.regulars = { chi_hoa: { visits: 1, firstDay: 3, lastDay: 3 } };
    expect(render(fresh).querySelector('[data-new-regular]')).toBeNull();
  });

  it('UX-414: "Xem chuyện" opens the just-reached milestone cell with its story', () => {
    const off = registerPrepPanels();
    onTestFinished(off);
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS } });
    const visits = MILESTONE_VISITS.chi_hoa![1]!;
    const game = createNewGame('Quán Thử', 'normal', 1);
    game.day = 60;
    game.regulars = { chi_hoa: { visits, firstDay: 2, lastDay: 60 } };
    shell.startGame(game);
    shell.handleEvents([{ type: 'regular_milestone', regularId: 'chi_hoa', milestone: 2, visits, tickets: 2 }]);
    const action = root.querySelector<HTMLButtonElement>('.toast [data-action="toast-action"]')!;
    expect(action.textContent).toBe(MILESTONE_ACTION);
    action.click();
    const row = shell.hud.panelEl.querySelector<HTMLElement>('[data-book="chi_hoa"]')!;
    expect(row.querySelector<HTMLElement>('[data-book-page]')!.hidden).toBe(false);
    const open = [...row.querySelectorAll<HTMLElement>('.book-cell[aria-expanded="true"]')];
    expect(open.map((c) => c.dataset.milestone)).toEqual(['2']);
    const detail = row.querySelector<HTMLElement>('[data-book-detail]')!;
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain(regularBookEntry('chi_hoa')!.milestones[1]!.story);
  });

  it('UX-409: a " · " separator stays on the line of the word before it (no stray dot)', () => {
    const body = render(season2(300, 240, 12));
    const meta = body.querySelector<HTMLElement>('[data-book="co_mai"] .item-meta')!;
    const sum = body.querySelector<HTMLElement>('[data-book-sum] > span:last-child')!;
    for (const line of [meta, sum]) {
      expect(line.textContent).toContain(' · ');
      const keeps = [...line.querySelectorAll<HTMLElement>('.dot-keep')];
      expect(keeps.length).toBeGreaterThan(0);
      for (const k of keeps) expect(k.textContent).toMatch(/^\S+ ·$/);
      // No text node holds a bare dot that the browser could wrap alone.
      const texts = [...line.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '');
      expect(texts.some((t) => t.includes('·'))).toBe(false);
    }
    expect(meta.textContent).toMatch(/^Ghé 12 lần · Hay gọi \S/);
    expect(css(PANELS_CSS)).toMatch(/\.dot-keep\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('UX-411: the "53 lần" milestone label never wraps and the cells get room at 390 px', () => {
    const p = css(PANELS_CSS);
    expect(p).toMatch(/\.book-cell > span\s*\{[^}]*white-space:\s*nowrap/);
    expect(p).toMatch(/@media \(max-width: 480px\) \{\s*\.item\.item-row\.regular-row\.is-open\s*\{[^}]*'more more more'[^}]*\}\s*\.book-cells\s*\{[^}]*\}\s*\.book-cell\s*\{[^}]*padding-inline:\s*var\(--space-1\)/);
    // The narrow rule comes after the base open-row areas, so it wins at equal specificity.
    expect(p.lastIndexOf("'more more more'")).toBeGreaterThan(p.indexOf("'. more more'", p.indexOf('.item.item-row.regular-row.is-open')));
  });

  it('UX-412: Settings\' Điều khiển (keyboard) group is hidden on touch screens', () => {
    const screen = createSettings(createMemoryStorage(), { ...DEFAULT_SETTINGS }, { onChange: vi.fn(), onBack: vi.fn() });
    const group = screen.el.querySelector<HTMLElement>('.set-group-keys')!;
    expect(group.querySelector('.section-title')!.textContent).toBe('Điều khiển');
    expect(group.querySelector('.keys-details')).not.toBeNull();
    const touch = css(UI_CSS).match(/@media \(hover: none\), \(pointer: coarse\) \{([\s\S]*?)\n\}/)![1]!;
    expect(touch).toMatch(/\.set-group-keys\s*\{[^}]*display:\s*none/);
  });

  it('UX-413: a week-end next-week line keeps its icon on the first text line', () => {
    const u = css(UI_CSS);
    expect(u).toMatch(/\.wk-next p\s*\{[^}]*align-items:\s*flex-start/);
    expect(u).toMatch(/\.wk-next p > \.ic\s*\{[^}]*margin-top:\s*calc\(\(1lh - 16px\) \/ 2\)/);
  });
});
