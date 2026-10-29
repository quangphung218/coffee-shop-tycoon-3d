// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { levelDef } from '../../src/sim/data/levels';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { autosave } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { createFreshStore, fresh } from '../../src/ui/core/fresh';
import { createHud } from '../../src/ui/hud/hud';
import { registerPrepPanels } from '../../src/ui/panels';

const LEVEL_2 = levelDef(2).unlocks;
const levelUp = (level: number): GameEvent => ({ type: 'level_up', level, unlocks: levelDef(level).unlocks });

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** A level-2 shop with the HUD and the real prep panels mounted. */
function mount(state: GameState) {
  const off = registerPrepPanels();
  const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
  document.body.append(hud.el, hud.panelEl);
  hud.el.hidden = false;
  hud.update(state);
  const dockBtn = (id: string) => q(hud.el, `.dock-btn[data-panel="${id}"]`);
  const dot = (id: string) => q(dockBtn(id), '.dock-new');
  return { hud, dockBtn, dot, off };
}

function levelTwoGame(): GameState {
  const state = createNewGame('Quán Mới', 'normal', 3);
  state.shopLevel = 2;
  // Plenty of everything, so a row's label slot is empty unless a test empties a stock.
  state.inventory = state.inventory.map((i) => ({ ...i, qty: 10_000 }));
  return state;
}

let cleanup: (() => void) | null = null;
beforeEach(() => fresh.clear());
afterEach(() => {
  cleanup?.();
  cleanup = null;
  fresh.clear();
  document.body.replaceChildren();
});

describe('fresh store', () => {
  it('collects menu, upgrade and tool ids from level_up and week_unlocks; tools go to Nâng cấp', () => {
    const store = createFreshStore();
    store.handleEvents([levelUp(2), { type: 'week_unlocks', day: 3, unlocks: { menu: ['orange_juice'], upgrades: [], tools: ['pastry_case'] } }]);
    expect(store.has('menu', 'cappuccino')).toBe(true);
    expect(store.has('menu', 'orange_juice')).toBe(true);
    expect(store.has('upgrades', 'fast_machine')).toBe(true);
    expect(store.has('upgrades', 'grinder')).toBe(true);
    expect(store.has('upgrades', 'pastry_case')).toBe(true);
    expect(store.count('menu')).toBe(LEVEL_2.menu.length + 1);
    expect(store.count('upgrades')).toBe(LEVEL_2.upgrades.length + LEVEL_2.tools.length + 1);
    expect(store.count('inventory')).toBe(0);
  });

  it('tells subscribers about changes only', () => {
    const store = createFreshStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.handleEvents([{ type: 'dayEnded', day: 1 }]);
    expect(calls).toBe(0);
    store.handleEvents([levelUp(2)]);
    store.handleEvents([levelUp(2)]);
    expect(calls).toBe(1);
    store.clearTab('menu');
    store.clearTab('menu');
    expect(calls).toBe(2);
    off();
    store.clear();
    expect(calls).toBe(2);
  });

  it('starts empty when created again (session only)', () => {
    const first = createFreshStore();
    first.handleEvents([levelUp(2)]);
    expect(first.count('menu')).toBeGreaterThan(0);
    const again = createFreshStore();
    expect(again.count('menu')).toBe(0);
    expect(again.count('upgrades')).toBe(0);
  });

  it('never reaches the save', () => {
    const state = levelTwoGame();
    const storage = createMemoryStorage();
    const save = (): string => {
      const r = autosave(state, storage, 1000);
      if (!r.ok) throw new Error('save failed');
      return JSON.stringify(r.value);
    };
    const before = save();
    fresh.handleEvents([levelUp(2)]);
    const after = save();
    expect(after).toBe(before);
    expect(after).not.toMatch(/fresh/i);
  });
});

describe('"Mới" on the dock and rows', () => {
  it('shows the dock dot after level_up and clears it once the tab is opened and closed', () => {
    const state = levelTwoGame();
    const m = mount(state);
    cleanup = m.off;
    expect(m.dot('menu').hidden).toBe(true);

    fresh.handleEvents([levelUp(2)]);
    expect(m.dot('menu').hidden).toBe(false);
    expect(m.dot('upgrades').hidden).toBe(false);
    expect(m.dockBtn('menu').textContent).toContain('có mục mới');
    expect(m.dot('inventory').hidden).toBe(true);

    m.hud.openPanel('menu');
    m.hud.update(state);
    // Open: the rows say it, the dot steps back.
    expect(m.dot('menu').hidden).toBe(true);
    m.hud.closePanel();
    m.hud.update(state);
    expect(m.dot('menu').hidden).toBe(true);
    expect(m.dockBtn('menu').textContent).not.toContain('có mục mới');
    // Nâng cấp was not opened: its dot stays.
    expect(m.dot('upgrades').hidden).toBe(false);
  });

  it('clears the old tab when switching panels', () => {
    const state = levelTwoGame();
    const m = mount(state);
    cleanup = m.off;
    fresh.handleEvents([levelUp(2)]);
    m.hud.openPanel('upgrades');
    m.hud.openPanel('menu');
    m.hud.update(state);
    expect(fresh.count('upgrades')).toBe(0);
    expect(fresh.count('menu')).toBeGreaterThan(0);
  });

  it('marks a new sellable item "Mới" with the sparkle icon', () => {
    const state = levelTwoGame();
    const m = mount(state);
    cleanup = m.off;
    fresh.handleEvents([levelUp(2)]);
    m.hud.openPanel('menu');
    const row = q(m.hud.panelEl, 'li[data-item="cappuccino"]');
    const badge = q(row, '[data-fresh]');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('Mới');
    expect(badge.innerHTML).toContain('i-sparkle');
    // An item opened earlier has no mark.
    expect(q(m.hud.panelEl, 'li[data-item="espresso"] [data-fresh]').hidden).toBe(true);
  });

  it('does not cover "Thiếu X"', () => {
    const state = levelTwoGame();
    state.inventory = state.inventory.map((i) => (i.id === 'milk' ? { ...i, qty: 0 } : i));
    const m = mount(state);
    cleanup = m.off;
    fresh.handleEvents([levelUp(2)]);
    m.hud.openPanel('menu');
    const row = q(m.hud.panelEl, 'li[data-item="cappuccino"]');
    expect(q(row, '[data-lock="stock"]').hidden).toBe(false);
    expect(q(row, '[data-lock="stock"]').textContent).toContain('Thiếu');
    expect(q(row, '[data-fresh]').hidden).toBe(true);
  });

  it('does not cover "Mở ở cấp N" on an item or upgrade still locked', () => {
    // The store holds level-3 ids while the shop is still level 2 (no week calendar, so the label is by level).
    const state = levelTwoGame();
    delete state.week;
    const m = mount(state);
    cleanup = m.off;
    fresh.handleEvents([levelUp(3)]);
    m.hud.openPanel('menu');
    const item = q(m.hud.panelEl, 'li[data-item="orange_juice"]');
    expect(q(item, '[data-lock="level"]').textContent).toContain('Mở ở cấp 3');
    expect(q(item, '[data-fresh]').hidden).toBe(true);

    m.hud.openPanel('upgrades');
    const up = q(m.hud.panelEl, 'li[data-upgrade="better_machine"]');
    expect(q(up, '.badge:not([data-fresh])').textContent).toContain('Cần cấp quán 3');
    expect(q(up, '[data-fresh]').hidden).toBe(true);
  });

  it('marks a new open upgrade "Mới" in Nâng cấp', () => {
    const state = levelTwoGame();
    const m = mount(state);
    cleanup = m.off;
    fresh.handleEvents([levelUp(2)]);
    m.hud.openPanel('upgrades');
    const up = q(m.hud.panelEl, 'li[data-upgrade="fast_machine"]');
    expect(q(up, '[data-fresh]').hidden).toBe(false);
  });
});
