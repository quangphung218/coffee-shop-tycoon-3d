// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { ensureRetention } from '../../src/sim/retention';
import type { Command, GameState } from '../../src/sim/types';
import { PREVIEW_BAR_MEDIA, renderStylesPanel } from '../../src/ui/panels/styles';

// Vitest stubs .css imports; read the file by path from the repo root (see focus-states.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const EMOJI = /\p{Extended_Pictographic}/u;

function stubWidth(width: number): void {
  const mq = { matches: width <= 480, addEventListener() {}, removeEventListener() {} };
  vi.stubGlobal('matchMedia', (q: string) => (q === PREVIEW_BAR_MEDIA ? mq : { matches: false, addEventListener() {}, removeEventListener() {} }));
}

function mount(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  renderStylesPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
    previewStyle: () => {},
    resetCamera: () => {},
  });
  return { body, sent };
}

function rich(week = 1): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 1_000_000_000;
  ensureRetention(state).tickets = 500;
  if (state.week) state.week.index = week;
  else state.week = { index: week } as GameState['week'];
  return state;
}

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const tap = (body: HTMLElement, id: string) => q<HTMLButtonElement>(body, `li[data-style="${id}"] [data-action="preview"]`).click();
const flush = (): Promise<void> => new Promise((r) => queueMicrotask(r));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('T-89 style lock badge and preview bar', () => {
  it('UX-305: lock badge by state (week, then challenges left), max 2 lines; the bar shows why Mua is dimmed', () => {
    stubWidth(1280);
    const early = mount(rich(1)).body;
    const badge = q(early, 'li[data-style="wall_wood"] .badge');
    expect(badge.textContent).toBe('Từ tuần 5');
    document.body.innerHTML = '';

    const later = mount(rich(5)).body;
    expect(q(later, 'li[data-style="wall_wood"] .badge').textContent).toBe('Còn 2 thử thách');
    expect(q(later, 'li[data-style="wall_wood"] .badge').textContent).not.toMatch(EMOJI);
    document.body.innerHTML = '';

    // Max 2 lines: the badge wraps but is capped at two line heights.
    const rule = /\.style-opt > \.badge\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(rule).toMatch(/max-height:\s*calc\(2em \* var\(--line-height-tight\)/);
    expect(rule).toMatch(/overflow:\s*hidden/);

    // Collapsed bar: the reason is in the bar, tied to its dimmed "Mua", and says what to do.
    stubWidth(390);
    const { body, sent } = mount(rich(5));
    tap(body, 'wall_wood');
    const bar = q(body, '.style-bar');
    expect(bar.hidden).toBe(false);
    const buy = q<HTMLButtonElement>(bar, '[data-action="buy"]');
    const why = q(bar, '.reason');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(why.hidden).toBe(false);
    expect(why.textContent).toContain('Hoàn thành thêm 2 thử thách tuần');
    expect(buy.getAttribute('aria-describedby')).toContain(why.id);
    buy.click();
    expect(sent).toEqual([]);

    // A buyable style shows no reason in the bar.
    tap(body, 'wall_mint');
    expect(q(body, '.style-bar .reason').hidden).toBe(true);
  });

  it('UX-312: the purchase confirm sits inside the collapsed bar, no modal, list stays hidden', async () => {
    stubWidth(390);
    const { body, sent } = mount(rich(1));
    tap(body, 'wall_mint');
    const bar = q(body, '.style-bar');
    q<HTMLButtonElement>(bar, '[data-action="buy"]').click();
    const confirm = q(bar, '.confirm');
    expect(q(body, '.style-list').hidden).toBe(true);
    expect(q(bar, '.style-act').hidden).toBe(true);
    expect(body.querySelector('[role="dialog"], dialog')).toBeNull();
    expect(confirm.textContent).not.toMatch(EMOJI);
    await flush();
    expect(document.activeElement).toBe(q(confirm, '[data-action="cancel"]'));

    // Hủy returns to the bar's buttons.
    q<HTMLButtonElement>(confirm, '[data-action="cancel"]').click();
    expect(bar.querySelector('.confirm')).toBeNull();
    expect(q(bar, '.style-act').hidden).toBe(false);
    expect(sent).toEqual([]);

    // Mua confirms and buys.
    q<HTMLButtonElement>(bar, '[data-action="buy"]').click();
    q<HTMLButtonElement>(q(bar, '.confirm'), '[data-action="confirm"]').click();
    expect(sent).toEqual([{ type: 'buy_style', styleId: 'wall_mint' }]);
  });
});
