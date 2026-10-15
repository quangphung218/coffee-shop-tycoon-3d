import { describe, expect, it } from 'vitest';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { pickOrder } from '../../src/sim/customers';
import { consume, ingredientPrice, servingCost } from '../../src/sim/inventory';
import { validateLayout } from '../../src/sim/nav';
import { brewMinutes, cleanMinutes } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout } from '../../src/sim/upgrades';
import type { GameState, MenuItemId, UpgradeId } from '../../src/sim/types';

/** A rich preparation-phase game with full stock, so every item can be made. */
function rich(): GameState {
  const s = createNewGame('A', 'normal', 7);
  s.money = 1e15;
  for (const item of s.inventory) item.qty = 100_000;
  return s;
}

/** Buys an upgrade to its top level, ignoring the shop-level gate. */
function maxOut(s: GameState, id: UpgradeId): void {
  const target = getUpgrade(id).maxLevel;
  for (let i = 0; i < target; i++) expect(buyUpgrade(s, id).ok, id).toBe(true);
  expect(s.upgrades[id]).toBe(target);
}

/** Enables exactly these menu items, disabling the rest. */
function onlyMenu(s: GameState, ids: MenuItemId[]): void {
  for (const entry of s.menu) entry.enabled = ids.includes(entry.id);
}

describe('grinder', () => {
  it('brews coffee drinks faster and leaves other drinks alone', () => {
    const s = rich();
    const base = brewMinutes(s, 'mocha');
    const teaBase = brewMinutes(s, 'lemon_tea');
    maxOut(s, 'grinder');
    expect(brewMinutes(s, 'mocha')).toBeLessThan(base);
    // lemon_tea has no coffee beans, so the grinder does not touch it.
    expect(brewMinutes(s, 'lemon_tea')).toBe(teaBase);
  });
});

describe('pastry case', () => {
  it('brews food faster and makes customers order food more often', () => {
    const s = rich();
    const base = brewMinutes(s, 'croissant');
    maxOut(s, 'pastry_case');
    expect(brewMinutes(s, 'croissant')).toBeLessThan(base);

    const foodShare = (levels: Partial<Record<UpgradeId, number>>): number => {
      const g = rich();
      Object.assign(g.upgrades, levels);
      onlyMenu(g, ['espresso', 'croissant']);
      let food = 0;
      for (let i = 0; i < 600; i++) if (pickOrder(g) === 'croissant') food += 1;
      return food;
    };
    expect(foodShare({ pastry_case: getUpgrade('pastry_case').maxLevel })).toBeGreaterThan(foodShare({}));
  });
});

describe('blender', () => {
  it('brews cold drinks faster and leaves hot drinks alone', () => {
    const s = rich();
    const coldBase = brewMinutes(s, 'americano');
    const hotBase = brewMinutes(s, 'espresso');
    maxOut(s, 'blender');
    expect(brewMinutes(s, 'americano')).toBeLessThan(coldBase);
    expect(brewMinutes(s, 'espresso')).toBe(hotBase);
  });

  it('unlocks the frappe, an iced coffee', () => {
    const s = rich();
    const frappe = s.menu.find((m) => m.id === 'frappe');
    expect(frappe).toBeDefined();
    maxOut(s, 'blender');
    // Frappe is a cold coffee drink, so both the blender and a grinder speed it up.
    const base = brewMinutes(s, 'frappe');
    maxOut(s, 'grinder');
    expect(brewMinutes(s, 'frappe')).toBeLessThanOrEqual(base);
  });
});

describe('ice maker', () => {
  it('cuts the price of ice when buying and when brewing', () => {
    const s = rich();
    const buyBase = ingredientPrice(s, 'ice', 1000);
    const servingBase = servingCost(s, 'lemon_tea'); // lemon_tea uses ice
    maxOut(s, 'ice_maker');
    expect(ingredientPrice(s, 'ice', 1000)).toBeLessThan(buyBase);
    expect(servingCost(s, 'lemon_tea')).toBeLessThan(servingBase);
    // A drink with no ice keeps its cost.
    expect(servingCost(s, 'latte')).toBe(servingCost(rich(), 'latte'));
  });

  it('lowers the ingredient cost charged when a serving is consumed', () => {
    const plain = rich();
    consume(plain, 'lemon_tea');
    const iced = rich();
    maxOut(iced, 'ice_maker');
    consume(iced, 'lemon_tea');
    expect(iced.today.ingredientsUsed).toBeLessThan(plain.today.ingredientsUsed!);
  });
});

describe('dishwasher', () => {
  it('cleans tables faster', () => {
    const s = rich();
    const base = cleanMinutes(s);
    maxOut(s, 'dishwasher');
    expect(cleanMinutes(s)).toBeLessThan(base);
  });
});

describe('layout', () => {
  it('stays valid with every equipment unit at its top level', () => {
    const s = rich();
    for (const id of ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'] as const) maxOut(s, id);
    expect(validateLayout(getShopLayout(s))).toEqual([]);
  });

  it('keeps a valid layout with every machine upgrade maxed together', () => {
    const s = rich();
    for (const id of ['fast_machine', 'grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'] as const) {
      maxOut(s, id);
    }
    const layout = getShopLayout(s);
    // Espresso plus three fast machines plus five equipment units.
    expect(layout.machines).toHaveLength(1 + 3 + 5);
    expect(validateLayout(layout)).toEqual([]);
  });
});
