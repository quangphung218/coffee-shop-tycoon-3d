import { describe, expect, it } from 'vitest';
import { MENU, isCoffeeDrink } from '../../src/sim/data/menu';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { maybeAddOn, pickOrder } from '../../src/sim/customers';
import { dispatch } from '../../src/sim/index';
import { consume, ingredientPrice, servingCost } from '../../src/sim/inventory';
import { validateLayout } from '../../src/sim/nav';
import { MACHINE_SIZE } from '../../src/sim/nav/footprints';
import { brewMinutes, cleanMinutes, updatePlayerTasks } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout } from '../../src/sim/upgrades';
import type { Customer, GameState, MenuItemDef, MenuItemId, UpgradeId } from '../../src/sim/types';

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

/** Buys exactly one level of an upgrade, ignoring the shop-level gate. */
function buyOne(s: GameState, id: UpgradeId): void {
  expect(buyUpgrade(s, id).ok, id).toBe(true);
  expect(s.upgrades[id]).toBe(1);
}

/** Minutes the player needs to work through the queued tasks, one game minute at a time. */
function minutesToClear(s: GameState): number {
  let minutes = 0;
  while (s.playerTasks.length > 0 && minutes < 1000) {
    updatePlayerTasks(s);
    minutes += 1;
  }
  return minutes;
}

/** An open shop with `n` pending orders of `itemId`, all queued for the player to brew. */
function brewQueue(s: GameState, itemId: MenuItemId, n: number): GameState {
  expect(dispatch(s, { type: 'start_day' })).toBe(true);
  for (let i = 0; i < n; i++) {
    const id = s.nextId++;
    s.orders.push({ id, customerId: -1 - i, itemId, status: 'pending', remaining: brewMinutes(s, itemId), staffId: null });
    s.playerTasks.push({ kind: 'brew', targetId: id, remaining: brewMinutes(s, itemId) });
  }
  return s;
}

/** An open shop with `n` dirty tables, all queued for the player to clean. */
function cleanQueue(s: GameState, n: number): GameState {
  expect(dispatch(s, { type: 'start_day' })).toBe(true);
  for (const table of s.tables.slice(0, n)) {
    table.trash = 1;
    s.playerTasks.push({ kind: 'clean', targetId: table.id, remaining: cleanMinutes(s) });
  }
  expect(s.playerTasks).toHaveLength(n);
  return s;
}

describe('every tool works from its first level', () => {
  const SPEED_TOOLS: Record<'grinder' | 'pastry_case' | 'blender', (item: MenuItemDef) => boolean> = {
    grinder: isCoffeeDrink,
    pastry_case: (item) => item.category === 'food',
    blender: (item) => item.temperature === 'cold',
  };

  for (const [tool, applies] of Object.entries(SPEED_TOOLS) as [keyof typeof SPEED_TOOLS, (item: MenuItemDef) => boolean][]) {
    it(`${tool} level 1 speeds up every item it applies to and no other`, () => {
      const affected = MENU.filter(applies);
      expect(affected.length, tool).toBeGreaterThan(0);
      const base = rich();
      const s = rich();
      buyOne(s, tool);
      for (const item of MENU) {
        if (applies(item)) expect(brewMinutes(s, item.id), `${tool} ${item.id}`).toBeLessThan(brewMinutes(base, item.id));
        else expect(brewMinutes(s, item.id), `${tool} ${item.id}`).toBe(brewMinutes(base, item.id));
      }
    });
  }

  it('grinder level 1 makes espresso faster', () => {
    const s = rich();
    buyOne(s, 'grinder');
    expect(brewMinutes(s, 'espresso')).toBeLessThan(brewMinutes(rich(), 'espresso'));
  });

  it('pastry case level 1 makes croissant and cake faster', () => {
    const s = rich();
    buyOne(s, 'pastry_case');
    expect(brewMinutes(s, 'croissant')).toBeLessThan(brewMinutes(rich(), 'croissant'));
    expect(brewMinutes(s, 'cake')).toBeLessThan(brewMinutes(rich(), 'cake'));
  });

  it('blender level 1 makes lemon tea faster', () => {
    const s = rich();
    buyOne(s, 'blender');
    expect(brewMinutes(s, 'lemon_tea')).toBeLessThan(brewMinutes(rich(), 'lemon_tea'));
  });

  it('pastry case level 1 makes customers order and add food more often', () => {
    const foodShare = (levels: Partial<Record<UpgradeId, number>>): number => {
      const g = rich();
      Object.assign(g.upgrades, levels);
      onlyMenu(g, ['espresso', 'croissant']);
      let food = 0;
      for (let i = 0; i < 600; i++) if (pickOrder(g) === 'croissant') food += 1;
      return food;
    };
    expect(foodShare({ pastry_case: 1 })).toBeGreaterThan(foodShare({}));

    const addOns = (levels: Partial<Record<UpgradeId, number>>): number => {
      const g = rich();
      Object.assign(g.upgrades, levels);
      onlyMenu(g, ['espresso', 'croissant', 'cake']);
      let added = 0;
      for (let id = 1; id <= 400; id++) {
        const c = { id, persona: 'student', order: 'espresso', extraItem: undefined } as unknown as Customer;
        maybeAddOn(g, c);
        if (c.extraItem) added += 1;
      }
      return added;
    };
    expect(addOns({ pastry_case: 1 })).toBeGreaterThan(addOns({}));
  });

  it('ice maker level 1 lowers the cost of ice and of an iced drink', () => {
    const s = rich();
    buyOne(s, 'ice_maker');
    expect(ingredientPrice(s, 'ice', 1000)).toBeLessThan(ingredientPrice(rich(), 'ice', 1000));
    expect(servingCost(s, 'lemon_tea')).toBeLessThan(servingCost(rich(), 'lemon_tea'));
  });

  it('dishwasher level 1 cleans a table faster', () => {
    const s = rich();
    buyOne(s, 'dishwasher');
    expect(cleanMinutes(s)).toBeLessThan(cleanMinutes(rich()));
  });

  it('carries the spare part of a minute into the next brew, so level 1 saves real time', () => {
    const base = minutesToClear(brewQueue(rich(), 'espresso', 6));
    const ground = rich();
    buyOne(ground, 'grinder');
    expect(minutesToClear(brewQueue(ground, 'espresso', 6))).toBeLessThan(base);
    expect(ground.orders.every((o) => o.status === 'ready')).toBe(true);
  });

  it('carries the spare part of a minute into the next clean, so the dishwasher saves real time', () => {
    /** Six tables: three to start with and three bought. */
    const sixTables = (): GameState => {
      const s = rich();
      for (let i = 0; i < 3; i++) expect(buyUpgrade(s, 'tables').ok).toBe(true);
      return s;
    };
    const base = minutesToClear(cleanQueue(sixTables(), 6));
    const washed = sixTables();
    buyOne(washed, 'dishwasher');
    expect(minutesToClear(cleanQueue(washed, 6))).toBeLessThan(base);
    expect(washed.tables.every((t) => t.trash === 0)).toBe(true);
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

  it('never lets two machines on the back counter overlap, at any combination of levels', () => {
    const TOOLS = ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'] as const;
    let checked = 0;
    for (let fast = 0; fast <= getUpgrade('fast_machine').maxLevel; fast++) {
      for (let mask = 0; mask < 1 << TOOLS.length; mask++) {
        for (const quality of [0, getUpgrade('better_machine').maxLevel]) {
          const s = rich();
          s.upgrades = { fast_machine: fast, better_machine: quality };
          TOOLS.forEach((tool, i) => {
            if (mask & (1 << i)) s.upgrades[tool] = 1 + (mask % getUpgrade(tool).maxLevel);
          });
          const layout = getShopLayout(s);
          const boxes = layout.machines.map((m) => {
            const size = MACHINE_SIZE[m.kind];
            return { kind: m.kind, minX: m.pos.x - size.width / 2, maxX: m.pos.x + size.width / 2, minZ: m.pos.z - size.depth / 2, maxZ: m.pos.z + size.depth / 2 };
          });
          for (let a = 0; a < boxes.length; a++) {
            for (let b = a + 1; b < boxes.length; b++) {
              const A = boxes[a]!;
              const B = boxes[b]!;
              const overlap = A.minX < B.maxX && B.minX < A.maxX && A.minZ < B.maxZ && B.minZ < A.maxZ;
              expect(overlap, `${A.kind} and ${B.kind} with fast ${fast}, tools ${mask}`).toBe(false);
            }
          }
          expect(validateLayout(layout), `fast ${fast}, tools ${mask}`).toEqual([]);
          checked += 1;
        }
      }
    }
    expect(checked).toBe((getUpgrade('fast_machine').maxLevel + 1) * 32 * 2);
  });

  it('keeps the pastry case clear of the espresso machine', () => {
    const s = rich();
    buyOne(s, 'pastry_case');
    const machines = getShopLayout(s).machines;
    const espresso = machines.find((m) => m.kind === 'espresso')!;
    const pastry = machines.find((m) => m.kind === 'pastry_case')!;
    const gap = Math.abs(espresso.pos.x - pastry.pos.x) - (MACHINE_SIZE.espresso.width + MACHINE_SIZE.pastry_case.width) / 2;
    expect(gap).toBeGreaterThan(0);
  });
});
