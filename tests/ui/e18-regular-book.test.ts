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

const list = (body: HTMLElement) => body.querySelector<HTMLElement>('ul[aria-label="Khách quen"]')!;
const head = (body: HTMLElement, id: string) => body.querySelector<HTMLButtonElement>(`[data-book="${id}"] [data-action="regular-page"]`)!;
const page = (body: HTMLElement, id: string) => body.querySelector<HTMLElement>(`[data-book="${id}"] [data-book-page]`)!;
const dots = (body: HTMLElement, id: string) => [...body.querySelectorAll<HTMLElement>(`[data-book="${id}"] .book-dot`)].map((d) => d.dataset.reached);
const cell = (body: HTMLElement, id: string, m: number) => body.querySelector<HTMLButtonElement>(`[data-book="${id}"] [data-milestone="${m}"]`)!;
const detail = (body: HTMLElement, id: string) => body.querySelector<HTMLElement>(`[data-book="${id}"] [data-book-detail]`)!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Sổ khách quen merged into the Khách quen list (UX-207/213)', () => {
  it('is one list: no separate book toggle or list, and a row opens its page in place (no modal)', () => {
    const { body } = mount(game());
    expect(body.querySelector('[data-action="regular-book"]')).toBeNull();
    expect(body.querySelector('ul[aria-label="Sổ khách quen"]')).toBeNull();
    expect(body.querySelectorAll('ul[aria-label="Khách quen"]')).toHaveLength(1);
    expect(list(body).querySelectorAll(':scope > li[data-regular][data-book]')).toHaveLength(8);
    expect(page(body, 'co_lan').hidden).toBe(true);
    head(body, 'co_lan').click();
    expect(head(body, 'co_lan').getAttribute('aria-expanded')).toBe('true');
    expect(head(body, 'co_lan').getAttribute('aria-controls')).toBe(page(body, 'co_lan').id);
    expect(page(body, 'co_lan').hidden).toBe(false);
    expect(document.activeElement).toBe(head(body, 'co_lan'));
    expect(document.querySelector('[role="dialog"], dialog')).toBeNull();
    head(body, 'co_lan').click();
    expect(page(body, 'co_lan').hidden).toBe(true);
  });

  it('shows 4 milestone dots per row and 8 regulars x 4 cells, locked or reached from visits', () => {
    const state = game();
    // co_lan's milestones are at 10/90/195/245 visits, anh_minh's at 25/65/145/265 (MILESTONE_VISITS).
    state.regulars = { co_lan: { visits: 100, firstDay: 2, lastDay: 101 }, anh_minh: { visits: 270, firstDay: 2, lastDay: 271 } };
    const { body } = mount(state);
    expect(body.querySelectorAll('[data-book]')).toHaveLength(8);
    expect(body.querySelectorAll('.book-dot')).toHaveLength(32);
    expect(dots(body, 'co_lan')).toEqual(['true', 'true', 'false', 'false']);
    expect(dots(body, 'anh_minh')).toEqual(['true', 'true', 'true', 'true']);
    expect(dots(body, 'em_vy')).toEqual(['false', 'false', 'false', 'false']);
    expect(head(body, 'co_lan').textContent).toBe('Cô Lan, sổ 2/4 mốc');
    expect(body.querySelector('[data-book="co_lan"] [data-book-dots]')!.getAttribute('aria-hidden')).toBe('true');
    expect(body.querySelectorAll('.book-cell')).toHaveLength(32);
    expect([1, 2, 3, 4].map((m) => cell(body, 'co_lan', m).dataset.reached)).toEqual(['true', 'true', 'false', 'false']);
    expect(cell(body, 'co_lan', 3).querySelector('.ic')!.getAttribute('data-icon')).toBe('i-lock');
    expect(body.querySelector('[data-book-sum]')!.textContent).toBe('Đã gặp 2/8 khách quen · Sổ 6/32 mốc');
    expect(body.querySelector('[data-book="co_lan"] .book-progress')!.textContent).toBe('Ghé 100/195 lần tới mốc 3');
    expect(body.querySelector('[data-book="anh_minh"] .book-progress')!.textContent).toBe('Đã mở cả 4 mốc');
    expect(body.querySelector('[data-book="em_vy"] > .item-text > .item-meta')!.textContent).toBe('Chưa ghé quán');
  });

  it('expands a reached cell to its story, Món ruột ngoài quán and Tem (Tem icon), one at a time, and closes on a second tap', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 12, firstDay: 2, lastDay: 13 } };
    const { body } = mount(state);
    head(body, 'co_lan').click();
    expect(detail(body, 'co_lan').hidden).toBe(true);
    cell(body, 'co_lan', 1).click();
    const d = detail(body, 'co_lan');
    expect(d.hidden).toBe(false);
    expect(cell(body, 'co_lan', 1).getAttribute('aria-expanded')).toBe('true');
    expect(cell(body, 'co_lan', 1).getAttribute('aria-controls')).toBe(d.id);
    expect(d.textContent).toContain('Cô Lan dạy văn');
    expect(d.textContent).toContain('Món ruột ngoài quán: Bánh bông lan trứng muối');
    expect(d.textContent).not.toContain('Món yêu thích');
    const tem = [...d.querySelectorAll('.book-line')].find((p) => p.textContent!.endsWith(' Tem'))!;
    // Same icon as the HUD's Tem value (hud.ts), not the money coin.
    expect(tem.querySelector('.ic')!.getAttribute('data-icon')).toBe('i-sparkle');
    expect(d.querySelector('.ic[data-icon="i-coin"]')).toBeNull();
    // A locked cell says only how it opens: no story, no dish.
    cell(body, 'co_lan', 2).click();
    expect(cell(body, 'co_lan', 1).getAttribute('aria-expanded')).toBe('false');
    expect(detail(body, 'co_lan').textContent).toBe('Mở khi Cô Lan ghé đủ 90 lần (đang 12).');
    cell(body, 'co_lan', 2).click();
    expect(detail(body, 'co_lan').hidden).toBe(true);
  });

  it('keeps the open cell across a redraw and unlocks it when the visit lands', () => {
    const state = game();
    state.regulars = { chi_hoa: { visits: 14, firstDay: 2, lastDay: 15 } };
    const { body, handle } = mount(state);
    cell(body, 'chi_hoa', 1).click();
    expect(detail(body, 'chi_hoa').textContent).toContain('ghé đủ 15 lần');
    state.regulars.chi_hoa!.visits = 15;
    handle.update!(state);
    expect(cell(body, 'chi_hoa', 1).dataset.reached).toBe('true');
    expect(cell(body, 'chi_hoa', 1).getAttribute('aria-expanded')).toBe('true');
    expect(detail(body, 'chi_hoa').textContent).toContain('Chị Hoa bán hoa');
  });

  it('uses no emoji', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 250, firstDay: 2, lastDay: 251 } };
    const { body } = mount(state);
    head(body, 'co_lan').click();
    expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    [1, 2, 3, 4].forEach((m) => {
      cell(body, 'co_lan', m).click();
      expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  it('keeps each cell a 44 px tap target and fits 390 px (four cells share the row)', () => {
    expect(rule('.book-cell')).toContain('min-height: var(--size-target)');
    expect(readFileSync('src/ui/styles/tokens.css', 'utf8')).toContain('--size-target: 44px;');
    expect(rule('.book-cells')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(rule('.book-cell')).not.toMatch(/(^|[^-])width:/);
  });

  it('puts a gap after the lock icon on the locked line, and the row head is a full tap target', () => {
    const state = game();
    state.regulars = { co_lan: { visits: 12, firstDay: 2, lastDay: 13 } };
    const { body } = mount(state);
    head(body, 'co_lan').click();
    cell(body, 'co_lan', 2).click();
    const locked = detail(body, 'co_lan').querySelector('.book-line')!;
    expect(locked.querySelector('.ic')!.getAttribute('data-icon')).toBe('i-lock');
    expect(rule('.book-line')).toContain('display: flex');
    expect(rule('.book-line')).toContain('gap: var(--space-1)');
    // The name button's overlay covers the whole row (position: relative on the li).
    expect(rule('.regular-head::after')).toContain('inset: 0');
    expect(rule('.regular-head::after')).toContain('min-height: var(--size-target)');
    expect(rule('.regular-row')).toContain('position: relative');
    expect(rule('.regular-row > .book-page')).toContain('z-index: 1');
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
