import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrate } from '../../src/save/save';
import { pickOrder } from '../../src/sim/customers';
import { getIngredient } from '../../src/sim/data/ingredients';
import { applyRestockSuggestion, autoRestockSuggestion, expectedDemand } from '../../src/sim/inventory';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, IngredientId, MenuItemId } from '../../src/sim/types';

function setStock(s: GameState, id: IngredientId, qty: number): void {
  s.inventory.find((i) => i.id === id)!.qty = qty;
}

function enable(s: GameState, ...ids: MenuItemId[]): void {
  for (const m of s.menu) if (ids.includes(m.id)) m.enabled = true;
}

/** Day 2 morning after a day 1 that sold only the starter menu, every shelf full but the given ones empty. */
function dayTwo(empty: IngredientId[]): GameState {
  const s = createNewGame('A', 'normal', 1);
  s.history.push({ ...createDayStats(1, 3), sold: { espresso: 15, americano: 15, latte: 20, lemon_tea: 10 } });
  s.day = 2;
  for (const i of s.inventory) i.qty = 100000;
  for (const id of empty) setStock(s, id, 0);
  return s;
}

const suggested = (s: GameState): IngredientId[] => autoRestockSuggestion(s).items.map((i) => i.id);

describe('restock demand for items the last day did not sell', () => {
  it('(a) buys oranges for orange juice switched on today', () => {
    const s = dayTwo(['orange']);
    enable(s, 'orange_juice');
    expect(suggested(s)).toContain('orange');
  });

  it('(b) buys flour and butter for cake switched on today', () => {
    const s = dayTwo(['flour', 'butter']);
    enable(s, 'cake');
    expect(suggested(s)).toEqual(expect.arrayContaining(['flour', 'butter']));
  });

  it('(c) buys lemons when lemon tea sold nothing because lemons ran out', () => {
    const s = dayTwo(['lemon']);
    s.history[0]!.sold = { espresso: 20, americano: 20, latte: 20 };
    expect(suggested(s)).toContain('lemon');
  });

  it('(d) names the ingredients and the money short when the cash cannot cover them', () => {
    const s = dayTwo(['orange', 'flour']);
    enable(s, 'orange_juice', 'cake');
    s.money = 0;
    const shortfall = autoRestockSuggestion(s).totalCost;
    const r = applyRestockSuggestion(s);
    expect(r.skipped).toEqual(expect.arrayContaining(['orange', 'flour']));
    const amount = String(shortfall).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const names = r.skipped.map((id) => getIngredient(id).name).join(', ');
    expect(s.events).toContainEqual({ type: 'notify', level: 'warning', text: `Thiếu ${amount}đ để nhập ${names}` });
  });
});

describe('demand missed while an item is out of stock', () => {
  it('counts a share of each order the item could not join, without extra random draws', () => {
    const s = createNewGame('A', 'normal', 1);
    setStock(s, 'lemon', 0);
    // Same draws as a menu without lemon tea at all.
    const twin = createNewGame('A', 'normal', 1);
    twin.menu.find((m) => m.id === 'lemon_tea')!.enabled = false;
    for (let i = 0; i < 20; i++) {
      expect(pickOrder(s)).not.toBe('lemon_tea');
      pickOrder(twin);
    }
    expect(s.rngState).toBe(twin.rngState);
    const missed = s.today.missedDemand?.lemon_tea ?? 0;
    expect(missed).toBeGreaterThan(0);
    expect(missed).toBeLessThan(20);
    expect(s.today.outOfStock.lemon_tea).toBeUndefined();
  });

  it('loads a save written before missed demand was tracked and plans from its history', () => {
    const s = dayTwo(['lemon']);
    delete s.history[0]!.missedDemand;
    delete s.today.missedDemand;
    const loaded = migrate(JSON.parse(JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state: s })));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value.state;
    expect(suggested(state)).toContain('lemon');
    expect(pickOrder(state)).not.toBe('lemon_tea');
    expect(state.today.missedDemand?.lemon_tea).toBeGreaterThan(0);
  });

  it('adds the missed share to the next day demand', () => {
    const s = createNewGame('A', 'normal', 1);
    s.history.push({ ...createDayStats(1, 3), sold: { espresso: 10, lemon_tea: 2 }, missedDemand: { lemon_tea: 6 } });
    s.day = 2;
    expect(expectedDemand(s).lemon_tea).toBe(8);
  });
});
