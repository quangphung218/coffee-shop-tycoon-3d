// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch, STYLE_SLOTS, stylesOf, styleOf } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { ensureRetention } from '../../src/sim/retention';
import type { Command, GameState, StyleSlot } from '../../src/sim/types';
import { PREP_PANELS } from '../../src/ui/panels';
import { renderStylesPanel, SLOT_LABELS, STYLES_PANEL_ID } from '../../src/ui/panels/styles';

// Vitest stubs .css imports; read the file by path from the repo root (see focus-states.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Preview = [StyleSlot, string | null];

function mount(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const previews: Preview[] = [];
  const handle = renderStylesPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
    previewStyle: (slot, id) => previews.push([slot, id]),
  });
  return { body, sent, previews, handle: handle! };
}

function rich(): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 1_000_000_000;
  ensureRetention(state).tickets = 500;
  return state;
}

const row = (body: HTMLElement, id: string): HTMLElement => {
  const el = body.querySelector<HTMLElement>(`li[data-style="${id}"]`);
  if (!el) throw new Error(`missing style ${id}`);
  return el;
};
const btn = (el: HTMLElement, action: string): HTMLButtonElement => el.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
const visibleRows = (body: HTMLElement): string[] =>
  [...body.querySelectorAll<HTMLElement>('ul[data-slot]')].filter((u) => !u.hidden).flatMap((u) => [...u.querySelectorAll<HTMLElement>('li[data-style]')].map((li) => li.dataset.style!));
const flush = (): Promise<void> => new Promise((r) => queueMicrotask(r));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phong cách quán panel', () => {
  it('is a dock panel named "Phong cách quán" in the Phát triển group', () => {
    const def = PREP_PANELS.find((p) => p.id === STYLES_PANEL_ID);
    expect(def?.label).toBe('Phong cách quán');
    expect(def?.group).toBe('dev');
  });

  it('has four slot tabs and lists the tab slot styles only', async () => {
    const { body } = mount(rich());
    const tabs = [...body.querySelectorAll<HTMLInputElement>('[data-seg="style-slot"] input')];
    expect(tabs.map((t) => t.value)).toEqual([...STYLE_SLOTS]);
    expect([...body.querySelectorAll('[data-seg="style-slot"] .seg-opt span')].map((s) => s.textContent)).toEqual(STYLE_SLOTS.map((s) => SLOT_LABELS[s]));
    expect(tabs[0]!.checked).toBe(true);
    expect(visibleRows(body)).toEqual(stylesOf('wall').map((s) => s.id));
    tabs[2]!.checked = true;
    tabs[2]!.dispatchEvent(new Event('change'));
    expect(visibleRows(body)).toEqual(stylesOf('sign').map((s) => s.id));
  });

  it('tap previews inline on the shop, tap again or "Bỏ xem thử" ends it', () => {
    const { body, previews, sent } = mount(rich());
    const mint = row(body, 'wall_mint');
    const more = mint.querySelector<HTMLElement>('.item-actions')!;
    expect(more.hidden).toBe(true);
    btn(mint, 'preview').click();
    expect(previews.at(-1)).toEqual(['wall', 'wall_mint']);
    expect(btn(mint, 'preview').getAttribute('aria-pressed')).toBe('true');
    expect(btn(row(body, 'wall_cream'), 'preview').getAttribute('aria-pressed')).toBe('false');
    expect(more.hidden).toBe(false);
    expect(sent).toEqual([]);
    btn(mint, 'preview').click();
    expect(previews.at(-1)).toEqual(['wall', null]);
    expect(more.hidden).toBe(true);
    btn(mint, 'preview').click();
    btn(mint, 'unpreview').click();
    expect(previews.at(-1)).toEqual(['wall', null]);
  });

  it('buys only after an in-place confirm, no modal', async () => {
    const state = rich();
    const { body, sent, previews } = mount(state);
    const mint = row(body, 'wall_mint');
    btn(mint, 'preview').click();
    const buy = btn(mint, 'buy');
    expect(buy.textContent).toBe('Mua');
    buy.click();
    await flush();
    expect(sent).toEqual([]);
    const confirm = mint.querySelector('.confirm')!;
    expect(confirm.textContent).toContain('Mua Tường bạc hà với 3.000.000đ + 5 Tem?');
    expect(document.querySelector('dialog, [role="dialog"], [aria-modal]')).toBeNull();
    btn(confirm as HTMLElement, 'cancel').click();
    expect(sent).toEqual([]);
    expect(mint.querySelector('.confirm')).toBeNull();
    btn(mint, 'buy').click();
    btn(mint.querySelector<HTMLElement>('.confirm')!, 'confirm').click();
    expect(sent).toEqual([{ type: 'buy_style', styleId: 'wall_mint' }]);
    expect(styleOf(state, 'wall').id).toBe('wall_mint');
    expect(previews.at(-1)).toEqual(['wall', null]);
    expect(mint.classList.contains('is-worn')).toBe(true);
    expect(mint.querySelector('.badge')!.textContent).toBe('Đang dùng');
  });

  it('uses an owned style at once with "Dùng kiểu này"', () => {
    const state = rich();
    state.styles = { chosen: { wall: 'wall_mint' }, owned: ['wall_mint'], unlocked: [] };
    const { body, sent } = mount(state);
    const cream = row(body, 'wall_cream');
    btn(cream, 'preview').click();
    expect(btn(cream, 'buy').textContent).toBe('Dùng kiểu này');
    btn(cream, 'buy').click();
    expect(sent).toEqual([{ type: 'select_style', styleId: 'wall_cream' }]);
    expect(styleOf(state, 'wall').id).toBe('wall_cream');
  });

  it('locked styles say which weekly challenge opens them and keep Mua dimmed', () => {
    const { body, sent } = mount(rich());
    const wood = row(body, 'wall_wood');
    expect(wood.classList.contains('is-locked')).toBe(true);
    expect(wood.querySelector('.badge')!.textContent).toBe('Thử thách tuần');
    btn(wood, 'preview').click();
    const buy = btn(wood, 'buy');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    const why = wood.querySelector<HTMLElement>('.reason')!;
    expect(why.hidden).toBe(false);
    expect(why.textContent).toContain('Hoàn thành thêm 2 thử thách tuần bất kỳ để mở kiểu này');
    expect(buy.getAttribute('aria-describedby')).toContain(why.id);
    buy.click();
    expect(wood.querySelector('.confirm')).toBeNull();
    expect(sent).toEqual([]);
  });

  it('short of money or Tem says how much is missing', () => {
    const state = createNewGame('Quán Thử', 'normal', 7);
    state.money = 1_000_000;
    const { body, handle } = mount(state);
    const mint = row(body, 'wall_mint');
    btn(mint, 'preview').click();
    expect(btn(mint, 'buy').getAttribute('aria-disabled')).toBe('true');
    expect(mint.querySelector('.reason')!.textContent).toContain('Thiếu 2.000.000đ');
    state.money = 5_000_000;
    ensureRetention(state).tickets = 2;
    handle.update!(state);
    expect(mint.querySelector('.reason')!.textContent).toContain('Thiếu 3 Tem');
  });

  it('switching tab or closing the panel clears the preview', () => {
    const { body, previews, handle } = mount(rich());
    btn(row(body, 'wall_mint'), 'preview').click();
    const floor = body.querySelectorAll<HTMLInputElement>('[data-seg="style-slot"] input')[1]!;
    floor.checked = true;
    floor.dispatchEvent(new Event('change'));
    expect(previews.at(-1)).toEqual(['wall', null]);
    btn(row(body, 'floor_tile'), 'preview').click();
    btn(row(body, 'floor_terrazzo'), 'preview').click();
    expect(previews.at(-1)).toEqual(['floor', 'floor_terrazzo']);
    handle.dispose!();
    expect(previews.at(-1)).toEqual(['floor', null]);
  });

  it('works without a scene hook and uses no emoji', () => {
    const body = document.createElement('div');
    document.body.append(body);
    const state = rich();
    renderStylesPanel(body, { dispatch: (c) => simDispatch(state, c), getState: () => state, close: () => {} });
    expect(() => body.querySelector<HTMLButtonElement>('[data-action="preview"]')!.click()).not.toThrow();
    expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('keeps every tap target at least --size-target', () => {
    const rule = (sel: string): string => CSS.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]']/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';
    expect(rule('.style-opt')).toContain('min-height: var(--size-target)');
    expect(rule('.style-swatch')).toContain('height: 44px');
  });
});
