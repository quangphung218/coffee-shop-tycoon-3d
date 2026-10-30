// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { createMemoryStorage } from '../../src/save/storage';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { createShell } from '../../src/ui/screens/shell';

// Vitest stubs .css imports, so read the stylesheet through node:fs (see css-order.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string): string => CSS.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]']/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';

const game = (): GameState => createNewGame('Quán Thử', 'normal', 42);

function mount(state: GameState): { body: HTMLElement; handle: PanelHandle } {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  return { body, handle: renderTasksPanel(body, ctx) as PanelHandle };
}

const toggle = (body: HTMLElement) => body.querySelector<HTMLButtonElement>('[data-action="regular-book"]')!;
const book = (body: HTMLElement) => body.querySelector<HTMLElement>('ul[aria-label="Sổ khách quen"]')!;
const cell = (body: HTMLElement, id: string, m: number) => body.querySelector<HTMLButtonElement>(`[data-book="${id}"] [data-milestone="${m}"]`)!;
const detail = (body: HTMLElement, id: string) => body.querySelector<HTMLElement>(`[data-book="${id}"] [data-book-detail]`)!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Sổ khách quen on the Khách quen card', () => {
  it('sits right under the regulars list, closed, and opens in place (no modal)', () => {
    const { body } = mount(game());
    const btn = toggle(body);
    expect(btn.previousElementSibling).toBe(body.querySelector('ul[aria-label="Khách quen"]'));
    expect(btn.textContent).toBe('Sổ khách quen · 0/24 mốc');
    expect(book(body).hidden).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(book(body).hidden).toBe(false);
    expect(document.querySelector('[role="dialog"], dialog')).toBeNull();
  });

  it('draws 8 regulars x 3 milestone cells, locked or reached from visits', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 45, firstDay: 2, lastDay: 50 }, anh_minh: { visits: 100, firstDay: 2, lastDay: 100 } };
    const { body } = mount(state);
    expect(body.querySelectorAll('[data-book]')).toHaveLength(8);
    expect(body.querySelectorAll('.book-cell')).toHaveLength(24);
    expect([1, 2, 3].map((m) => cell(body, 'co_lan', m).dataset.reached)).toEqual(['true', 'true', 'false']);
    expect([1, 2, 3].map((m) => cell(body, 'anh_minh', m).dataset.reached)).toEqual(['true', 'true', 'true']);
    expect([1, 2, 3].map((m) => cell(body, 'em_vy', m).dataset.reached)).toEqual(['false', 'false', 'false']);
    expect(cell(body, 'co_lan', 3).querySelector('.ic')!.getAttribute('data-icon')).toBe('i-lock');
    expect(toggle(body).textContent).toBe('Sổ khách quen · 5/24 mốc');
    expect(body.querySelector('[data-book="co_lan"] .item-meta')!.textContent).toBe('Ghé 45/100 lần tới mốc 3');
    expect(body.querySelector('[data-book="anh_minh"] .item-meta')!.textContent).toBe('Ghé 100 lần · Đã mở cả 3 mốc');
    expect(body.querySelector('[data-book="em_vy"] .item-meta')!.textContent).toBe('Chưa ghé quán');
  });

  it('expands a reached cell to its story and favourite dish, one at a time, and closes on a second tap', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 12, firstDay: 2, lastDay: 13 } };
    const { body } = mount(state);
    toggle(body).click();
    expect(detail(body, 'co_lan').hidden).toBe(true);
    cell(body, 'co_lan', 1).click();
    const d = detail(body, 'co_lan');
    expect(d.hidden).toBe(false);
    expect(cell(body, 'co_lan', 1).getAttribute('aria-expanded')).toBe('true');
    expect(cell(body, 'co_lan', 1).getAttribute('aria-controls')).toBe(d.id);
    expect(d.textContent).toContain('Cô Lan dạy văn');
    expect(d.textContent).toContain('Món yêu thích: Bánh bông lan trứng muối');
    // A locked cell says only how it opens: no story, no dish.
    cell(body, 'co_lan', 2).click();
    expect(cell(body, 'co_lan', 1).getAttribute('aria-expanded')).toBe('false');
    expect(detail(body, 'co_lan').textContent).toBe('Mở khi Cô Lan ghé đủ 40 lần (đang 12).');
    cell(body, 'co_lan', 2).click();
    expect(detail(body, 'co_lan').hidden).toBe(true);
  });

  it('keeps the open cell across a redraw and unlocks it when the visit lands', () => {
    const state = game();
    state.regulars = { chi_hoa: { visits: 9, firstDay: 2, lastDay: 10 } };
    const { body, handle } = mount(state);
    cell(body, 'chi_hoa', 1).click();
    expect(detail(body, 'chi_hoa').textContent).toContain('ghé đủ 10 lần');
    state.regulars.chi_hoa!.visits = 10;
    handle.update!(state);
    expect(cell(body, 'chi_hoa', 1).dataset.reached).toBe('true');
    expect(cell(body, 'chi_hoa', 1).getAttribute('aria-expanded')).toBe('true');
    expect(detail(body, 'chi_hoa').textContent).toContain('Chị Hoa bán hoa');
  });

  it('uses no emoji', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 100, firstDay: 2, lastDay: 100 } };
    const { body } = mount(state);
    toggle(body).click();
    [1, 2, 3].forEach((m) => {
      cell(body, 'co_lan', m).click();
      expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  it('keeps each cell a 44 px tap target and fits 390 px (three cells share the row)', () => {
    expect(rule('.book-cell')).toContain('min-height: var(--size-target)');
    expect(readFileSync('src/ui/styles/tokens.css', 'utf8')).toContain('--size-target: 44px;');
    expect(rule('.book-cells')).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(rule('.book-cell')).not.toMatch(/(^|[^-])width:/);
  });

  it('shows the milestone toast through the shell', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const shell = createShell({ root, storage: createMemoryStorage() });
    try {
      shell.startGame(game());
      shell.handleEvents([{ type: 'regular_milestone', regularId: 'co_lan', milestone: 1, visits: 10, tickets: 1 }]);
      expect([...root.querySelectorAll('.toast-title')].map((p) => p.textContent)).toEqual(['Cô Lan: mốc 1 trong Sổ khách quen']);
    } finally {
      shell.dispose();
      root.remove();
    }
  });
});
