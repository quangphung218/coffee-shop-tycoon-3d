import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, migrate } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { menuUnlockLevel, xpToReach } from '../../src/sim/data/levels';
import { MENU, getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import { buildInsights } from '../../src/sim/insights';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, Insights } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * A version-1 save frozen mid-game, from before the levelling feature: the
 * player had already enabled a high-tier drink and bought a top-tier upgrade
 * with no level gate in sight. On disk it is a v1 wrapper with the v2 fields
 * (seed, shopLevel, xp, missions) stripped off.
 */
function v1MidGameSave(): string {
  const s = createNewGame('Quán Cũ', 'normal', 7);
  s.day = 4;
  s.money = 1500000;
  s.today = createDayStats(4, s.rating);
  s.history = [
    { ...createDayStats(1, 3), customersArrived: 40, customersServed: 36 },
    { ...createDayStats(2, 3.1), customersArrived: 45, customersServed: 41 },
    { ...createDayStats(3, 3.2), customersArrived: 48, customersServed: 44 },
  ];
  // Grandfathered content: cappuccino unlocks at level 2, cake at level 5…
  s.menu.find((m) => m.id === 'cappuccino')!.enabled = true;
  s.menu.find((m) => m.id === 'cake')!.enabled = true;
  // …and expand_area unlocks only at level 6.
  s.upgrades = { expand_area: 1, tables: 1 };

  const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(s));
  for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
  return JSON.stringify({ version: 1, savedAt: 1, state: legacy });
}

/** Every insight figure is either null or a real number — never NaN or Infinity. */
function expectCleanInsights(insights: Insights, label: string): void {
  for (const m of insights.metrics) {
    expect(m.value === null || Number.isFinite(m.value), `${label} metric ${m.id} = ${m.value}`).toBe(true);
  }
  expect(insights.grossProfit === null || Number.isFinite(insights.grossProfit), `${label} grossProfit`).toBe(true);
  for (const im of insights.itemMargins) {
    expect(Number.isFinite(im.grossProfit) && Number.isFinite(im.marginPct), `${label} margin ${im.id}`).toBe(true);
  }
  for (const ip of insights.itemProfits) {
    const ok = [ip.price, ip.cost, ip.marginPct, ip.grossProfit, ip.qty].every(Number.isFinite);
    expect(ok, `${label} itemProfit ${ip.id}`).toBe(true);
  }
}

describe('migrate v1 → v2 mid-game save', () => {
  it('loads a grandfathered save without losing items or upgrades', () => {
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', v1MidGameSave());
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = r.value;
    // The level is raised to keep everything already owned unlocked.
    expect(g.shopLevel).toBe(6);
    expect(typeof g.seed).toBe('number');
    expect(typeof g.xp).toBe('number');
    expect(g.missions).toHaveLength(3);
    // Nothing enabled or bought is lost.
    expect(g.menu.find((m) => m.id === 'cappuccino')!.enabled).toBe(true);
    expect(g.menu.find((m) => m.id === 'cake')!.enabled).toBe(true);
    expect(g.upgrades.expand_area).toBe(1);
    expect(g.upgrades.tables).toBe(1);
  });

  it('reports the migrated version on disk', () => {
    const r = migrate(JSON.parse(v1MidGameSave()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.version).toBe(SAVE_VERSION);
  });

  it('plays three more days after loading with clean insights and no lost content', () => {
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', v1MidGameSave());
    const loaded = loadGame('1', storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state: GameState = loaded.value;

    const startDay = state.day;
    for (let i = 0; i < 3; i++) {
      // Restock may buy nothing when the demand model has no prior sales to learn
      // from; the day must still play cleanly either way.
      dispatch(state, { type: 'apply_restock' });
      expect(() => playDay(state)).not.toThrow();
      const report = state.lastReport!;
      expect(report.insights).toBeDefined();
      expectCleanInsights(report.insights!, `day ${report.day}`);
      // Insights built straight from the day's stats are clean too.
      expectCleanInsights(buildInsights(state, state.today), `rebuild day ${report.day}`);
      expect(Number.isFinite(state.money)).toBe(true);
      expect(dispatch(state, { type: 'next_day' })).toBe(true);
    }

    expect(state.day).toBe(startDay + 3);
    // Still no content lost after playing on.
    expect(state.menu.find((m) => m.id === 'cappuccino')!.enabled).toBe(true);
    expect(state.menu.find((m) => m.id === 'cake')!.enabled).toBe(true);
    expect(state.upgrades.expand_area).toBe(1);
    expect(state.shopLevel).toBe(6);
  });
});

describe('menu items added after the save was written', () => {
  /** A save whose menu predates the frappe: the entry is missing entirely. */
  function withoutFrappe(version: 1 | 2): string {
    const s = createNewGame('Quán Cũ', 'normal', 7);
    s.menu = s.menu.filter((m) => m.id !== 'frappe');
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    if (version === 1) for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
    return JSON.stringify({ version, savedAt: 1, state: legacy });
  }

  function load(text: string): GameState {
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', text);
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    return (r as { ok: true; value: GameState }).value;
  }

  it('adds the frappe to a v1 save, switched off at its menu price, in menu order', () => {
    const g = load(withoutFrappe(1));
    const frappe = g.menu.find((m) => m.id === 'frappe');
    expect(frappe).toEqual({ id: 'frappe', enabled: false, price: getMenuItem('frappe').price });
    expect(g.menu.map((m) => m.id)).toEqual(MENU.map((m) => m.id));
  });

  it('lets a loaded v1 save enable the frappe once the shop level allows it', () => {
    const g = load(withoutFrappe(1));
    expect(g.shopLevel).toBeLessThan(menuUnlockLevel('frappe'));
    expect(dispatch(g, { type: 'set_menu_item', itemId: 'frappe', enabled: true })).toBe(false);
    g.xp = xpToReach(menuUnlockLevel('frappe'));
    g.shopLevel = menuUnlockLevel('frappe');
    expect(dispatch(g, { type: 'set_menu_item', itemId: 'frappe', enabled: true })).toBe(true);
    expect(g.menu.find((m) => m.id === 'frappe')!.enabled).toBe(true);
  });

  it('also fills in the frappe for a v2 save that is missing it', () => {
    const g = load(withoutFrappe(2));
    expect(g.menu.find((m) => m.id === 'frappe')?.enabled).toBe(false);
    expect(g.menu).toHaveLength(MENU.length);
  });

  it('keeps the price and switch of items already on the saved menu', () => {
    const s = createNewGame('Quán Cũ', 'normal', 7);
    const latte = s.menu.find((m) => m.id === 'latte')!;
    latte.price = 52000;
    latte.enabled = false;
    s.menu = s.menu.filter((m) => m.id !== 'frappe');
    const g = load(JSON.stringify({ version: 2, savedAt: 1, state: s }));
    expect(g.menu.find((m) => m.id === 'latte')).toEqual({ id: 'latte', enabled: false, price: 52000 });
  });
});
