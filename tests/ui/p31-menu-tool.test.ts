// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { levelDef, MAX_SHOP_LEVEL } from '../../src/sim/data/levels';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { fresh } from '../../src/ui/core/fresh';
import { toastForEvent } from '../../src/ui/hud/events';
import { createHud } from '../../src/ui/hud/hud';
import { registerPrepPanels } from '../../src/ui/panels';

// The project has no Node types: read panels.css through a dynamically named
// node:fs import, from the project root (jsdom's URL is rejected by node:fs).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8');

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** A Normal game at level 7 (Cold brew open, tower not bought) with money and Tem to spare. */
function level7(): GameState {
  const s = createNewGame('Quán P31', 'normal', 31);
  s.shopLevel = 7;
  s.money = 1e12;
  ensureRetention(s).tickets = 1000;
  return s;
}

/** The HUD with the prep panels and Menu open. */
function openMenu(state: GameState): { hud: ReturnType<typeof createHud>; off: () => void } {
  const off = registerPrepPanels();
  const hud = createHud({ dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
  document.body.append(hud.el, hud.panelEl);
  q<HTMLButtonElement>(hud.el, '[data-panel="menu"]').click();
  return { hud, off };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.replaceChildren();
});

describe('P31 Menu: an item that needs a tool', () => {
  it('shows "Cần Tháp cold brew" on Cold brew at level 7 before the tower, with the switch disabled', () => {
    const state = level7();
    const { hud, off } = openMenu(state);
    cleanup = () => {
      hud.dispose();
      off();
    };
    const row = q(hud.panelEl, '[data-item="cold_brew"]');
    const need = q<HTMLButtonElement>(row, '[data-lock="tool"]');
    expect(need.hidden).toBe(false);
    expect(need.tagName).toBe('BUTTON');
    expect(need.textContent).toBe('Cần Tháp cold brew');
    // Same button label as "Thiếu Cam": warning icon, words, forward arrow.
    expect(need.className).toBe('badge badge-danger badge-btn');
    expect((need.firstElementChild as HTMLElement).dataset.icon).toBe('i-warning');
    expect((need.lastElementChild as HTMLElement).dataset.icon).toBe('i-forward');
    expect(need.getAttribute('aria-label')).toBe('Cần Tháp cold brew, mở Nâng cấp');
    // One label only: not "Mở ở cấp", not "Thiếu …", even with the stock empty.
    expect(q(row, '[data-lock="level"]').hidden).toBe(true);
    expect(q(row, '[data-lock="stock"]').hidden).toBe(true);
    expect(row.classList.contains('is-locked')).toBe(false);

    const sw = q<HTMLButtonElement>(row, '[role="switch"]');
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    // The reason is in the switch's description.
    const ids = sw.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)!.textContent).join(' ')).toContain('Cần Tháp cold brew để bán món này');
    sw.click();
    expect(state.menu.find((m) => m.id === 'cold_brew')!.enabled).toBe(false);
  });

  it('opens Nâng cấp from the label', () => {
    const state = level7();
    const { hud, off } = openMenu(state);
    cleanup = () => {
      hud.dispose();
      off();
    };
    q<HTMLButtonElement>(hud.panelEl, '[data-item="cold_brew"] [data-lock="tool"]').click();
    expect(hud.openPanelId).toBe('upgrades');
    expect(hud.panelEl.querySelector('[data-upgrade="cold_brew_tower"]')).not.toBeNull();
  });

  it('after buying the tower: the switch is on and enabled, the label gone, and the toast says so', () => {
    const state = level7();
    const { hud, off } = openMenu(state);
    cleanup = () => {
      hud.dispose();
      off();
    };
    expect(simDispatch(state, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    hud.update(state);
    const row = q(hud.panelEl, '[data-item="cold_brew"]');
    const sw = q<HTMLButtonElement>(row, '[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('aria-disabled')).not.toBe('true');
    expect(q(row, '[data-lock="tool"]').hidden).toBe(true);
    expect(row.textContent).not.toContain('Cần Tháp cold brew');

    const note = state.events.find((e): e is Extract<GameEvent, { type: 'notify' }> => e.type === 'notify' && e.level === 'info');
    expect(note).toBeDefined();
    expect(toastForEvent(note!, state)).toEqual({ level: 'info', title: 'Món mới: Cold brew đã lên Menu' });
  });

  it('keeps "Mở ở cấp 8" over "Cần Lò nướng" while the cookie is not open', () => {
    const state = level7();
    const { hud, off } = openMenu(state);
    cleanup = () => {
      hud.dispose();
      off();
    };
    const row = q(hud.panelEl, '[data-item="cookie"]');
    expect(q(row, '[data-lock="level"]').textContent).toBe('Mở ở cấp 8');
    expect(q(row, '[data-lock="tool"]').hidden).toBe(true);
    state.shopLevel = 8;
    hud.update(state);
    expect(q(row, '[data-lock="level"]').hidden).toBe(true);
    expect(q(row, '[data-lock="tool"]').textContent).toBe('Cần Lò nướng');
  });

  it('gives the label a 44 px hit area like "Thiếu Cam" (shared .badge-btn rule)', () => {
    expect(CSS).toMatch(/\.badge-btn::before\s*\{[^}]*height:\s*var\(--size-target\)/);
  });

  it('builds "Cần …" exactly like "Thiếu …": same class, icons and structure, only the words differ', () => {
    const state = level7();
    state.shopLevel = 8;
    // Croissant short of stock shows "Thiếu …"; the cookie (oven not bought) shows "Cần Lò nướng".
    state.inventory = state.inventory.map((i) => ({ ...i, qty: 0 }));
    const { hud, off } = openMenu(state);
    cleanup = () => {
      hud.dispose();
      off();
    };
    const miss = q<HTMLButtonElement>(hud.panelEl, '[data-item="croissant"] [data-lock="stock"]');
    expect(miss.hidden).toBe(false);
    const shape = (el: HTMLElement) => ({
      tag: el.tagName,
      className: el.className,
      type: el.getAttribute('type'),
      children: [...el.children].map((c) => `${c.tagName}.${c.getAttribute('class')}:${(c as HTMLElement).dataset.icon ?? ''}`),
    });
    for (const item of ['cold_brew', 'cookie']) {
      const need = q<HTMLButtonElement>(hud.panelEl, `[data-item="${item}"] [data-lock="tool"]`);
      expect(need.hidden, item).toBe(false);
      expect(shape(need), item).toEqual(shape(miss));
      expect(need.textContent, item).not.toBe(miss.textContent);
    }
  });
});

describe('P31 Nâng cấp: the cold brew tower row', () => {
  /** The HUD with Nâng cấp open; the tower row. */
  function openUpgrades(state: GameState): { hud: ReturnType<typeof createHud>; row: () => HTMLElement } {
    const off = registerPrepPanels();
    const hud = createHud({ dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
    document.body.append(hud.el, hud.panelEl);
    q<HTMLButtonElement>(hud.el, '[data-panel="upgrades"]').click();
    cleanup = () => {
      hud.dispose();
      off();
    };
    return { hud, row: () => q(hud.panelEl, '[data-upgrade="cold_brew_tower"]') };
  }
  const buyBtn = (row: HTMLElement): HTMLButtonElement => q<HTMLButtonElement>(row, '[data-action="buy"]');
  const meta = (row: HTMLElement): string => q(row, '.item-meta').textContent ?? '';
  const statusBadge = (row: HTMLElement): HTMLElement => q(row, '.item-status > .badge');

  it('is locked with "Cần cấp quán 7" at level 6', () => {
    const state = level7();
    state.shopLevel = 6;
    const { row } = openUpgrades(state);
    expect(row().classList.contains('is-locked')).toBe(true);
    expect(statusBadge(row()).hidden).toBe(false);
    expect(statusBadge(row()).textContent).toBe('Cần cấp quán 7');
    expect(buyBtn(row()).getAttribute('aria-disabled')).toBe('true');
  });

  it('just opened at level 7: level 0/2, Mua enabled, no label', () => {
    const { row } = openUpgrades(level7());
    expect(row().classList.contains('is-locked')).toBe(false);
    expect(meta(row())).toContain('Cấp 0/2');
    expect(statusBadge(row()).hidden).toBe(true);
    expect(buyBtn(row()).hidden).toBe(false);
    expect(buyBtn(row()).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('short of money: Mua disabled with "Thiếu …" as the reason', () => {
    const state = level7();
    state.money = 1000;
    const { row } = openUpgrades(state);
    expect(buyBtn(row()).getAttribute('aria-disabled')).toBe('true');
    expect(q(row(), '.item-actions').textContent).toContain('Thiếu ');
  });

  it('shows tier 1 then tier 2 as levels are bought, and "Tối đa" at the cap', () => {
    const state = level7();
    const { hud, row } = openUpgrades(state);
    expect(simDispatch(state, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    hud.update(state);
    expect(meta(row())).toContain('Cấp 1/2 · Bậc 1/2 · mua để lên bậc 2');
    expect(row().querySelector('.item-icon [data-icon="i-cold-brew-tower"]')).not.toBeNull();
    expect(statusBadge(row()).hidden).toBe(true);

    expect(simDispatch(state, { type: 'buy_upgrade', upgradeId: 'cold_brew_tower' })).toBe(true);
    hud.update(state);
    expect(meta(row())).toContain('Cấp 2/2 · Bậc 2/2');
    expect(statusBadge(row()).hidden).toBe(false);
    expect(statusBadge(row()).textContent).toBe('Tối đa');
    expect(buyBtn(row()).hidden).toBe(true);
  });

  it('shows "Bậc 2/2" on both new tools at their cap, even at the top shop level', () => {
    const state = level7();
    state.shopLevel = MAX_SHOP_LEVEL;
    state.upgrades.cold_brew_tower = 2;
    state.upgrades.oven = 2;
    const { hud } = openUpgrades(state);
    for (const id of ['cold_brew_tower', 'oven']) {
      const row = q(hud.panelEl, `[data-upgrade="${id}"]`);
      expect(meta(row), id).toContain('Cấp 2/2 · Bậc 2/2');
      expect(statusBadge(row).textContent, id).toBe('Tối đa');
    }
  });

  it('marks the tower row "Mới" after reaching level 7', () => {
    fresh.clear();
    const state = level7();
    state.shopLevel = 6;
    const { hud, row } = openUpgrades(state);
    expect(q(row(), '[data-fresh]').hidden).toBe(true);
    state.shopLevel = 7;
    fresh.handleEvents([{ type: 'level_up', level: 7, unlocks: levelDef(7).unlocks }]);
    hud.update(state);
    const badge = q(row(), '[data-fresh]');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('Mới');
    fresh.clear();
  });
});
