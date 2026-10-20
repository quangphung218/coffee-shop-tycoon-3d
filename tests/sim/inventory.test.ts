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
  canBuyOnCredit,
  lowStockItems,
  sellable,
  stockOf,
  stockOutlook,
  toggleMenuItem,
} from '../../src/sim/inventory';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { playDay } from '../integration/helpers';
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
    // At the warning level: short for the day, but not low enough to buy on credit.
    for (const i of s.inventory) i.qty = getIngredient(i.id).lowStock;
    s.money = 0;
    expect(dispatch(s, { type: 'apply_restock' })).toBe(false);
    expect(s.money).toBe(0);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'notify', level: 'warning' }));
  });

  it('buys one pack on credit of each short line when the shop is broke', () => {
    const s = createNewGame('A', 'hard', 1);
    emptyStock(s);
    s.money = -50000;
    const suggested = autoRestockSuggestion(s).items.map((l) => l.id);
    const r = applyRestockSuggestion(s);
    expect(r.bought.map((l) => l.id)).toEqual(suggested);
    for (const line of r.bought) expect(line.qty).toBe(getIngredient(line.id).packSize);
    expect(r.skipped).toEqual([]);
    expect(s.money).toBe(-50000 - r.spent);
  });
});

describe('buying on credit', () => {
  it('lets a broke shop buy one pack of an ingredient below its warning level', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = -100000;
    setStock(s, 'milk', 0);
    expect(canBuyOnCredit(s, 'milk', 1000)).toBe(true);
    expect(buyIngredient(s, 'milk', 1000)).toEqual({ ok: true, cost: 40000 });
    expect(s.money).toBe(-140000);
    expect(stockOf(s, 'milk')).toBe(1000);
  });

  it('refuses more than one pack, or stock at the warning level', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = -100000;
    setStock(s, 'milk', 0);
    expect(buyIngredient(s, 'milk', 2000).ok).toBe(false);
    setStock(s, 'milk', getIngredient('milk').lowStock);
    expect(buyIngredient(s, 'milk', 1000).ok).toBe(false);
    expect(s.money).toBe(-100000);
    expect(stockOf(s, 'milk')).toBe(getIngredient('milk').lowStock);
  });

  it('gets a shop that wages pushed below zero with an empty store open and selling again', () => {
    const s = createNewGame('A', 'hard', 3);
    emptyStock(s);
    s.money = -20000;
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    playDay(s);
    expect(s.today.revenue).toBeGreaterThan(0);
  });
});

describe('stockOutlook', () => {
  /** Espresso only (18 g beans, 1 cup), 40 sold yesterday: 720 g beans for a full day. */
  function espressoDay(): GameState {
    const s = createNewGame('A', 'normal', 1);
    onlyMenu(s, 'espresso');
    s.history.push({ ...createDayStats(1, 3), sold: { espresso: 40 } });
    s.day = 2;
    setStock(s, 'cup', 100);
    return s;
  }

  it('marks stock above the warning level but short of the day as low', () => {
    const s = espressoDay();
    setStock(s, 'coffee_beans', 704);
    expect(704).toBeGreaterThan(getIngredient('coffee_beans').lowStock);
    expect(stockOutlook(s).coffee_beans).toEqual({ qty: 704, need: 720, level: 'low', cups: 39 });
    expect(stockOutlook(s).cup.level).toBe('ok');
  });

  it('only counts the part of the day still ahead while open', () => {
    const s = espressoDay();
    setStock(s, 'coffee_beans', 704);
    s.phase = 'opening';
    // 13:30 is half way through 07:00–20:00.
    s.minute = 13 * 60 + 30;
    expect(stockOutlook(s).coffee_beans).toMatchObject({ need: 360, level: 'ok' });
    s.phase = 'closing';
    s.minute = 20 * 60 + 10;
    expect(stockOutlook(s).coffee_beans).toMatchObject({ need: 0, level: 'ok' });
  });

  it('still uses the fixed warning level and says out at zero', () => {
    const s = espressoDay();
    setStock(s, 'coffee_beans', 0);
    setStock(s, 'milk', 50);
    const o = stockOutlook(s);
    expect(o.coffee_beans.level).toBe('out');
    // Milk is off today's menu: no demand, but below its warning level.
    expect(o.milk).toEqual({ qty: 50, need: 0, level: 'low', cups: null });
  });

  it('reuses the result until stock, menu or the 15-minute bucket changes', () => {
    const s = espressoDay();
    s.phase = 'opening';
    s.minute = 9 * 60;
    const first = stockOutlook(s);
    s.minute = 9 * 60 + 14;
    expect(stockOutlook(s)).toBe(first);
    s.minute = 9 * 60 + 15;
    const second = stockOutlook(s);
    expect(second).not.toBe(first);
    setStock(s, 'coffee_beans', stockOf(s, 'coffee_beans') - 18);
    const third = stockOutlook(s);
    expect(third).not.toBe(second);
    expect(third.coffee_beans.qty).toBe(stockOf(s, 'coffee_beans'));
    toggleMenuItem(s, 'latte');
    expect(stockOutlook(s)).not.toBe(third);
  });
});
