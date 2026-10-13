import { describe, expect, it } from 'vitest';
import { pickOrder } from '../../src/sim/customers';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { getIngredient } from '../../src/sim/data/ingredients';
import { getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import {
  DAY_ONE_SERVINGS,
  RESTOCK_BUFFER,
  applyRestockSuggestion,
  autoRestockSuggestion,
  buyIngredient,
  lowStockItems,
  sellable,
  stockOf,
  toggleMenuItem,
} from '../../src/sim/inventory';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, IngredientId, MenuItemId } from '../../src/sim/types';

function setStock(s: GameState, id: IngredientId, qty: number): void {
  s.inventory.find((i) => i.id === id)!.qty = qty;
}

function onlyMenu(s: GameState, ...ids: MenuItemId[]): void {
  for (const m of s.menu) m.enabled = ids.includes(m.id);
}

function emptyStock(s: GameState): void {
  for (const i of s.inventory) i.qty = 0;
}

describe('buyIngredient', () => {
  it('takes the money and adds the stock', () => {
    const s = createNewGame('A', 'normal', 1);
    const money = s.money;
    const before = stockOf(s, 'milk');
    const r = buyIngredient(s, 'milk', 1000);
    expect(r).toEqual({ ok: true, cost: 40000 });
    expect(s.money).toBe(money - 40000);
    expect(stockOf(s, 'milk')).toBe(before + 1000);
  });

  it('charges the difficulty price multiplier', () => {
    const s = createNewGame('A', 'hard', 1);
    const r = buyIngredient(s, 'cup', 50);
    expect(r).toEqual({ ok: true, cost: Math.round(1500 * 50 * DIFFICULTIES.hard.priceMult) });
  });

  it('refuses when the money is short and leaves everything as it was', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = 10000;
    const before = stockOf(s, 'coffee_beans');
    const r = buyIngredient(s, 'coffee_beans', 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Không đủ tiền');
    expect(s.money).toBe(10000);
    expect(stockOf(s, 'coffee_beans')).toBe(before);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'notify', level: 'error' }));
  });

  it('rejects zero, negative and fractional quantities', () => {
    const s = createNewGame('A', 'normal', 1);
    for (const qty of [0, -5, 1.5]) expect(buyIngredient(s, 'milk', qty).ok).toBe(false);
    expect(s.money).toBe(DIFFICULTIES.normal.startMoney);
  });

  it('is reachable as a command, in packs', () => {
    const s = createNewGame('A', 'normal', 1);
    const before = stockOf(s, 'orange');
    expect(dispatch(s, { type: 'buy_ingredient', ingredientId: 'orange', packs: 2 })).toBe(true);
    expect(stockOf(s, 'orange')).toBe(before + 2 * getIngredient('orange').packSize);
    s.money = 0;
    expect(dispatch(s, { type: 'buy_ingredient', ingredientId: 'orange', packs: 1 })).toBe(false);
    expect(dispatch(s, { type: 'buy_ingredient', ingredientId: 'orange', packs: 0 })).toBe(false);
  });
});

describe('low stock', () => {
  it('lists ingredients under their warning level', () => {
    const s = createNewGame('A', 'normal', 1);
    for (const i of s.inventory) i.qty = 10000;
    setStock(s, 'milk', 299);
    setStock(s, 'cup', 10);
    expect(lowStockItems(s)).toEqual([{ id: 'milk', qty: 299, threshold: 300 }]);
  });
});

describe('menu', () => {
  it('toggles an item for today', () => {
    const s = createNewGame('A', 'normal', 1);
    const was = s.menu.find((m) => m.id === 'latte')!.enabled;
    expect(toggleMenuItem(s, 'latte')).toBe(!was);
    expect(toggleMenuItem(s, 'latte')).toBe(was);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'latte', enabled: false })).toBe(true);
    expect(s.menu.find((m) => m.id === 'latte')!.enabled).toBe(false);
  });

  it('does not sell a disabled item and says why', () => {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'espresso', 'latte');
    toggleMenuItem(s, 'latte');
    const r = sellable(s, 'latte');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('tắt');
    for (let i = 0; i < 30; i++) expect(pickOrder(s)).toBe('espresso');
  });

  it('does not sell an item missing ingredients and names them', () => {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'latte');
    expect(sellable(s, 'latte')).toEqual({ ok: true });
    setStock(s, 'milk', 0);
    const r = sellable(s, 'latte');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(`Thiếu ${getIngredient('milk').name}`);
  });
});

describe('autoRestockSuggestion', () => {
  it('uses the difficulty default on day 1', () => {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'espresso');
    emptyStock(s);
    const servings = DAY_ONE_SERVINGS.normal;
    const beans = Math.ceil(servings * 18 * (1 + RESTOCK_BUFFER));
    const pack = getIngredient('coffee_beans').packSize;
    const line = autoRestockSuggestion(s).items.find((i) => i.id === 'coffee_beans')!;
    expect(line.qty).toBe(Math.ceil(beans / pack) * pack);
    expect(line.cost).toBe(line.qty * getIngredient('coffee_beans').unitPrice);

    const easy = createNewGame('A', 'easy', 1);
    const hard = createNewGame('A', 'hard', 1);
    for (const g of [easy, hard]) {
      onlyMenu(g, 'espresso');
      emptyStock(g);
    }
    const cups = (g: GameState) => autoRestockSuggestion(g).items.find((i) => i.id === 'cup')!.qty;
    expect(cups(easy)).toBeGreaterThanOrEqual(cups(hard));
  });

  it('follows the previous day sales plus 20%, minus stock, in whole packs', () => {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'latte');
    emptyStock(s);
    s.history.push({ ...createDayStats(1, 3), sold: { latte: 10, espresso: 40 } });
    s.day = 2;
    const items = autoRestockSuggestion(s).items;
    // latte: 18g beans, 150ml milk, 1 cup. Espresso is off the menu and ignored.
    expect(items.map((i) => [i.id, i.qty])).toEqual([
      ['coffee_beans', 500],
      ['milk', 2000],
      ['cup', 50],
    ]);

    setStock(s, 'coffee_beans', 216);
    setStock(s, 'milk', 1700);
    const after = autoRestockSuggestion(s).items;
    expect(after.find((i) => i.id === 'coffee_beans')).toBeUndefined();
    // Needs 1800, has 1700 → one pack of 1000.
    expect(after.find((i) => i.id === 'milk')!.qty).toBe(1000);
  });

  it('counts orders lost to empty stock as demand', () => {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'orange_juice');
    emptyStock(s);
    s.history.push({ ...createDayStats(1, 3), sold: { orange_juice: 5 }, outOfStock: { orange_juice: 5 } });
    const need = getMenuItem('orange_juice').ingredients.find((n) => n.id === 'orange')!.qty;
    const oranges = autoRestockSuggestion(s).items.find((i) => i.id === 'orange')!;
    const pack = getIngredient('orange').packSize;
    expect(oranges.qty).toBe(Math.ceil(Math.ceil(10 * need * 1.2) / pack) * pack);
  });

  it('suggests nothing when stock already covers demand', () => {
    const s = createNewGame('A', 'normal', 1);
    for (const i of s.inventory) i.qty = 100000;
    expect(autoRestockSuggestion(s)).toEqual({ items: [], totalCost: 0 });
  });
});

describe('applyRestockSuggestion', () => {
  it('buys every suggested line', () => {
    const s = createNewGame('A', 'normal', 1);
    emptyStock(s);
    const suggestion = autoRestockSuggestion(s);
    const money = s.money;
    const r = applyRestockSuggestion(s);
    expect(r.skipped).toEqual([]);
    expect(r.spent).toBe(suggestion.totalCost);
    expect(s.money).toBe(money - suggestion.totalCost);
    for (const line of suggestion.items) expect(stockOf(s, line.id)).toBe(line.qty);
    expect(autoRestockSuggestion(s).items).toEqual([]);
  });

  it('skips lines the money cannot cover', () => {
    const s = createNewGame('A', 'normal', 1);
    emptyStock(s);
    s.money = 0;
    expect(dispatch(s, { type: 'apply_restock' })).toBe(false);
    expect(s.money).toBe(0);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'notify', level: 'warning' }));
  });
});
