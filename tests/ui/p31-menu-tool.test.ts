// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
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
    // Same button label as "Thiếu Cam"; the tool's own icon, then the forward arrow.
    expect(need.className).toBe('badge badge-danger badge-btn');
    expect(need.querySelector('[data-icon="i-cold-brew-tower"]')).not.toBeNull();
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
});
