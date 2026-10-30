// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch, styleById } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { ensureRetention } from '../../src/sim/retention';
import type { Command, GameState, StyleSlot } from '../../src/sim/types';
import { PREVIEW_BAR_MEDIA, renderStylesPanel, stylePriceText } from '../../src/ui/panels/styles';

// Vitest stubs .css imports; read the file by path from the repo root (see focus-states.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const EMOJI = /\p{Extended_Pictographic}/u;

/** matchMedia as at `width` px: only PREVIEW_BAR_MEDIA is asked. */
function stubWidth(width: number) {
  const listeners = new Set<() => void>();
  const mq = {
    get matches() {
      return width <= 480;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', (q: string) => (q === PREVIEW_BAR_MEDIA ? mq : { matches: false, addEventListener() {}, removeEventListener() {} }));
  return {
    resize(next: number) {
      width = next;
      for (const fn of listeners) fn();
    },
  };
}

function mount(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const previews: [StyleSlot, string | null][] = [];
  let cameraResets = 0;
  const handle = renderStylesPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
    previewStyle: (slot, id) => previews.push([slot, id]),
    resetCamera: () => (cameraResets += 1),
  });
  return { body, sent, previews, handle: handle!, resets: () => cameraResets };
}

function rich(): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.money = 1_000_000_000;
  ensureRetention(state).tickets = 500;
  return state;
}

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const bar = (body: HTMLElement) => q(body, '.style-bar');
const list = (body: HTMLElement) => q(body, '.style-list');
/** A tap focuses the button, then clicks it (jsdom's click() alone does not focus). */
const tap = (body: HTMLElement, id: string) => {
  const opt = q<HTMLButtonElement>(body, `li[data-style="${id}"] [data-action="preview"]`);
  opt.focus();
  opt.click();
};
const flush = (): Promise<void> => new Promise((r) => queueMicrotask(r));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Phong cách quán: preview bar at ≤ 480 px (UX-201)', () => {
  it('collapses into a bar with name, price, "Bỏ xem thử" and "Mua", and sends the camera home', () => {
    stubWidth(390);
    const { body, previews, resets } = mount(rich());
    expect(bar(body).hidden).toBe(true);
    expect(list(body).hidden).toBe(false);
    tap(body, 'wall_mint');
    const mint = styleById('wall_mint')!;
    expect(previews.at(-1)).toEqual(['wall', 'wall_mint']);
    expect(resets()).toBe(1);
    expect(q(body, '.styles-panel').classList.contains('is-collapsed')).toBe(true);
    expect(bar(body).hidden).toBe(false);
    expect(list(body).hidden).toBe(true);
    expect(q(bar(body), '.item-title').textContent).toBe(mint.name);
    expect(q(bar(body), '.item-meta').textContent).toBe(`Giá ${stylePriceText(mint)}`);
    expect(q(bar(body), '[data-action="unpreview"]').textContent).toBe('Bỏ xem thử');
    expect(q(bar(body), '[data-action="buy"]').textContent).toBe('Mua');
    // Not a modal, no emoji; focus moved from the hidden row into the bar.
    expect(body.querySelector('dialog, [role="dialog"], [aria-modal]')).toBeNull();
    expect(EMOJI.test(bar(body).textContent ?? '')).toBe(false);
    expect(document.activeElement).toBe(q(bar(body), '[data-action="reopen"]'));
  });

  it('tapping the bar reopens the list with the preview kept; a new tap collapses again', () => {
    stubWidth(390);
    const { body, previews, resets } = mount(rich());
    tap(body, 'wall_mint');
    bar(body).click();
    expect(list(body).hidden).toBe(false);
    expect(bar(body).hidden).toBe(true);
    expect(previews.at(-1)).toEqual(['wall', 'wall_mint']);
    expect(q(body, 'li[data-style="wall_mint"] .item-actions').hidden).toBe(false);
    expect(document.activeElement).toBe(q(body, 'li[data-style="wall_mint"] [data-action="preview"]'));
    // The name button in the bar reopens too.
    tap(body, 'wall_wood');
    expect(bar(body).hidden).toBe(false);
    expect(resets()).toBe(2);
    q<HTMLButtonElement>(bar(body), '[data-action="reopen"]').click();
    expect(list(body).hidden).toBe(false);
  });

  it('"Bỏ xem thử" in the bar ends the preview and shows the list', () => {
    stubWidth(390);
    const { body, previews } = mount(rich());
    tap(body, 'wall_mint');
    q<HTMLButtonElement>(bar(body), '[data-action="unpreview"]').click();
    expect(previews.at(-1)).toEqual(['wall', null]);
    expect(bar(body).hidden).toBe(true);
    expect(list(body).hidden).toBe(false);
  });

  it('"Mua" in the bar opens the in-place confirm in the list, then buys', async () => {
    stubWidth(390);
    const state = rich();
    const { body, sent } = mount(state);
    tap(body, 'wall_mint');
    q<HTMLButtonElement>(bar(body), '[data-action="buy"]').click();
    expect(list(body).hidden).toBe(false);
    const confirm = q(body, 'li[data-style="wall_mint"] .confirm');
    await flush();
    q<HTMLButtonElement>(confirm, '[data-action="confirm"]').click();
    expect(sent).toContainEqual({ type: 'buy_style', styleId: 'wall_mint' });
  });

  it('a locked style keeps "Mua" dimmed in the bar; tapping it shows the reason in the list', () => {
    stubWidth(390);
    const { body, sent } = mount(rich());
    tap(body, 'wall_wood');
    const buy = q<HTMLButtonElement>(bar(body), '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    buy.click();
    expect(sent).toEqual([]);
    expect(list(body).hidden).toBe(false);
    expect(q(body, 'li[data-style="wall_wood"] .reason').hidden).toBe(false);
  });

  it('above 480 px the preview stays in the list; crossing the width collapses or opens it', () => {
    const media = stubWidth(1280);
    const { body, resets } = mount(rich());
    tap(body, 'wall_mint');
    expect(bar(body).hidden).toBe(true);
    expect(list(body).hidden).toBe(false);
    expect(resets()).toBe(0);
    media.resize(390);
    expect(bar(body).hidden).toBe(false);
    media.resize(800);
    expect(bar(body).hidden).toBe(true);
  });

  it('CSS: the collapsed panel hugs the bar at ≤ 480 px with no head', () => {
    const narrow = CSS.match(/@media \(max-width: 480px\) \{([\s\S]*?\n)\}/g)?.join('\n') ?? '';
    expect(narrow).toMatch(/#ui > \.panel:has\(\.styles-panel\.is-collapsed\) \{[^}]*top: auto/);
    expect(narrow).toMatch(/#ui > \.panel:has\(\.styles-panel\.is-collapsed\) > \.panel-head \{[^}]*display: none/);
  });
});
