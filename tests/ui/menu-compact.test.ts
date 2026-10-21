// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { getIngredient } from '../../src/sim/data/ingredients';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { createHud } from '../../src/ui/hud/hud';
import type { PanelContext } from '../../src/ui/hud/panels';
import { registerPrepPanels } from '../../src/ui/panels';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { toggle } from '../../src/ui/panels/widgets';

// The project has no Node types: read panels.css through a dynamically named
// node:fs import, from the project root (jsdom's URL is rejected by node:fs).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8');

/** Declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!m) throw new Error(`missing rule ${selector}`);
  return m[1]!;
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function mountMenu(state: GameState): { body: HTMLElement; sent: Command[] } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  };
  renderMenuPanel(body, ctx);
  return { body, sent };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('compact Menu rows', () => {
  it('draws every item switch compact, with no Bán/Không text', () => {
    const { body } = mountMenu(createNewGame('Quán Gọn', 'normal', 7));
    const switches = body.querySelectorAll<HTMLButtonElement>('li[data-item] [role="switch"]');
    expect(switches).toHaveLength(13);
    for (const sw of switches) expect(sw.classList.contains('toggle-compact')).toBe(true);
    expect(body.querySelector('.toggle-state')).toBeNull();
    expect(body.textContent).not.toMatch(/\bBán\b|\bKhông\b/);
  });

  it('switches an item in place: set_menu_item, then aria-checked flips', () => {
    const state = createNewGame('Quán Gọn', 'normal', 7);
    const { body, sent } = mountMenu(state);
    const sw = q<HTMLButtonElement>(body, '[data-item="espresso"] [role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    expect(sent).toEqual([{ type: 'set_menu_item', itemId: 'espresso', enabled: false }]);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(sent.at(-1)).toEqual({ type: 'set_menu_item', itemId: 'espresso', enabled: true });
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('opens Kho from the "Thiếu X" label, which replaces the Mở Kho link', () => {
    const off = registerPrepPanels();
    try {
      const state = createNewGame('Quán Gọn', 'normal', 7);
      state.inventory.find((i) => i.id === 'lemon')!.qty = 0;
      const hud = createHud({ dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
      document.body.append(hud.el, hud.panelEl);
      q<HTMLButtonElement>(hud.el, '[data-panel="menu"]').click();
      const row = q(hud.panelEl, '[data-item="lemon_tea"]');
      expect(row.querySelector('.link-btn')).toBeNull();
      const short = q<HTMLButtonElement>(row, '[data-lock="stock"]');
      expect(short.tagName).toBe('BUTTON');
      expect(short.classList.contains('badge-danger')).toBe(true);
      expect(short.querySelector('[data-icon="i-warning"]')).not.toBeNull();
      // A forward arrow after the text says it goes somewhere.
      expect((short.lastElementChild as HTMLElement).dataset.icon).toBe('i-forward');
      expect(short.textContent).toBe(`Thiếu ${getIngredient('lemon').name}`);
      // The status label sits in its own slot (under the meta), not inside the text.
      expect(short.closest('.item-status')).not.toBeNull();
      // The amounts stay in the description, off screen.
      const why = q(document, `#${short.getAttribute('aria-describedby')}`);
      expect(why.classList.contains('sr-only')).toBe(true);
      expect(why.textContent).toContain(getIngredient('lemon').name);
      // The switch keeps the full line (price, margin, popularity) and adds the reason after it.
      const detail = q(row, '[id^="menu-detail"]');
      expect(q(row, '[role="switch"]').getAttribute('aria-describedby')).toBe(`${detail.id} ${why.id}`);
      expect(detail.textContent).toContain('phổ biến');

      short.click();
      expect(hud.openPanelId).toBe('inventory');
      hud.dispose();
    } finally {
      off();
    }
  });

  it('keeps an item not open yet off and locked, with its unlock label and no third line', () => {
    const state = createNewGame('Quán Gọn', 'normal', 7);
    const { body, sent } = mountMenu(state);
    const row = q(body, '[data-item="mocha"]');
    expect(row.classList.contains('is-locked')).toBe(true);
    expect(q(row, '[data-lock="level"]').hidden).toBe(false);
    expect(q(row, '[data-lock="level"]').textContent).toMatch(/^Mở (ở cấp|ngày) \d+$/);
    const sw = q<HTMLButtonElement>(row, '[role="switch"]');
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(sent).toHaveLength(0);
    expect(row.querySelector('.item-actions')).toBeNull();
    // The full line first, then the unlock reason; both off screen.
    const ids = sw.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(q(document, `#${ids[0]}`).textContent).toContain('phổ biến');
    expect(q(document, `#${ids[1]}`).textContent).toMatch(/Mở khóa/);
    for (const id of ids) expect(q(document, `#${id}`).classList.contains('sr-only')).toBe(true);
  });

  it('leaves the default switch with its text state', () => {
    const t = toggle('Nhạc', 'Bật', 'Tắt', () => {});
    t.set(true);
    expect(t.el.classList.contains('toggle-compact')).toBe(false);
    expect(q(t.el, '.toggle-state').textContent).toBe('Bật');
  });
});

describe('compact switch CSS', () => {
  it('draws a 40 × 24 track and a 14 px thumb inside the focus-ring band', () => {
    const track = rule('.toggle-compact .toggle-track');
    expect(track).toMatch(/width:\s*40px/);
    expect(track).toMatch(/height:\s*24px/);
    const thumb = rule('.toggle-compact .toggle-thumb');
    expect(thumb).toMatch(/width:\s*14px/);
    expect(thumb).toMatch(/height:\s*14px/);
    expect(thumb).toMatch(/top:\s*var\(--size-focus-width\)/);
    expect(thumb).toMatch(/left:\s*var\(--size-focus-width\)/);
    // On: the same band from the right edge.
    expect(rule(".toggle.toggle-compact[aria-checked='true'] .toggle-thumb")).toMatch(/left:\s*calc\(100% - 14px - var\(--size-focus-width\)\)/);
  });

  it('keeps the hit area at least the 44 px target', () => {
    const target = rule('.toggle.toggle-compact');
    expect(target).toMatch(/min-width:\s*var\(--size-target\)/);
    expect(target).toMatch(/min-height:\s*var\(--size-target\)/);
    expect(rule('.badge-btn::before')).toMatch(/height:\s*var\(--size-target\)/);
  });

  it('keeps the switch on the first line and the label under the meta', () => {
    const row = rule('.item.menu-row');
    expect(row).toMatch(/grid-template-columns:\s*32px minmax\(0, 1fr\) auto;/);
    expect(row).toMatch(/grid-template-areas:\s*'icon text control'\s*'\. status \.';/);
    expect(rule('.menu-row > .toggle')).toMatch(/align-self:\s*start/);
  });

  it('wraps the name and meta rather than cutting them, keeping each number whole', () => {
    expect(CSS).not.toMatch(/\.menu-row[^{]*\.item-(title|meta)[^{]*\{[^}]*text-overflow/);
    expect(rule('.menu-row .item-meta .meta-part')).toMatch(/white-space:\s*nowrap/);
  });

  it('draws "Thiếu X" as a button: ink frame, bottom shadow, no pill', () => {
    // Class repeated to beat .badge (game-*.css loads before ui.css).
    const btn = rule('.badge-btn.badge-btn');
    expect(btn).toMatch(/border:\s*var\(--size-outline-sm\) solid var\(--border-outline\)/);
    expect(btn).toMatch(/box-shadow:\s*var\(--shadow-sm\)/);
    expect(btn).toMatch(/border-radius:\s*var\(--btn-radius\)/);
    expect(btn).not.toMatch(/background|color:/);
  });
});

describe('Menu row meta', () => {
  it('splits "Giá …" and "lãi …%" into parts that never break inside', () => {
    const { body } = mountMenu(createNewGame('Quán Gọn', 'normal', 7));
    const parts = [...body.querySelectorAll<HTMLElement>('[data-item="espresso"] .item-meta .meta-part')].map((p) => p.textContent);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^Giá [\d.]+đ$/);
    expect(parts[1]).toMatch(/^lãi \d+%$/);
  });
});
