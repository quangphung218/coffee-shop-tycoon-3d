import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { INGREDIENTS, isIngredientId } from '../../src/sim/data/ingredients';
import { MARKETING } from '../../src/sim/data/marketing';
import { MENU, ingredientCost } from '../../src/sim/data/menu';
import { STAFF_NAMES } from '../../src/sim/data/staffNames';
import { UPGRADES, totalUpgradeEffect, upgradeCost } from '../../src/sim/data/upgrades';

describe('menu', () => {
  it('has the 11 required items and the 2 P31 items with unique ids', () => {
    expect(MENU).toHaveLength(13);
    expect(new Set(MENU.map((m) => m.id)).size).toBe(13);
    expect(MENU.map((m) => m.id).sort()).toEqual(
      [
        'americano',
        'cake',
        'cappuccino',
        'cold_brew',
        'cookie',
        'croissant',
        'espresso',
        'frappe',
        'latte',
        'lemon_tea',
        'milk_tea',
        'mocha',
        'orange_juice',
      ].sort(),
    );
  });

  it('prices every item above its ingredient cost', () => {
    for (const m of MENU) {
      expect(m.cost, m.id).toBeGreaterThan(0);
      expect(m.cost, m.id).toBeLessThan(m.price);
    }
  });

  it('derives cost from ingredients', () => {
    for (const m of MENU) expect(m.cost).toBe(ingredientCost(m.ingredients));
  });

  it('references only existing ingredients', () => {
    for (const m of MENU) {
      expect(m.ingredients.length, m.id).toBeGreaterThan(0);
      for (const a of m.ingredients) {
        expect(isIngredientId(a.id), `${m.id} -> ${a.id}`).toBe(true);
        expect(a.qty).toBeGreaterThan(0);
      }
    }
  });

  it('has sane prep time, popularity and display fields', () => {
    for (const m of MENU) {
      expect(m.prepMinutes).toBeGreaterThan(0);
      expect(m.popularity).toBeGreaterThan(0);
      expect(m.popularity).toBeLessThanOrEqual(1);
      expect(m.name).not.toBe('');
      expect(m.icon).not.toBe('');
      expect(['hot', 'cold']).toContain(m.temperature);
    }
  });
});

describe('ingredients', () => {
  it('have unique ids, positive prices and low-stock thresholds', () => {
    expect(new Set(INGREDIENTS.map((i) => i.id)).size).toBe(INGREDIENTS.length);
    for (const i of INGREDIENTS) {
      expect(i.unitPrice).toBeGreaterThan(0);
      expect(i.packSize).toBeGreaterThan(i.lowStock);
      expect(i.icon).not.toBe('');
    }
  });

  it('are all used by some menu item', () => {
    const used = new Set(MENU.flatMap((m) => m.ingredients.map((a) => a.id)));
    for (const i of INGREDIENTS) expect(used.has(i.id), i.id).toBe(true);
  });
});

describe('upgrades', () => {
  it('has the 15 P23 upgrades, the 4 P27 furniture items and the 2 P31 tools with unique ids', () => {
    // P27 adds neon_sign, bookshelf, record_player and sofa_corner (decor) to the 15 earlier upgrades.
    expect(UPGRADES).toHaveLength(21);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(21);
    for (const id of ['neon_sign', 'bookshelf', 'record_player', 'sofa_corner']) {
      expect(UPGRADES.find((u) => u.id === id)?.category, id).toBe('decor');
    }
    // P31: the cold brew tower and the oven are equipment with two levels.
    for (const id of ['cold_brew_tower', 'oven']) {
      expect(UPGRADES.find((u) => u.id === id), id).toMatchObject({ category: 'equipment', maxLevel: 2 });
    }
  });

  it('have levels with growing cost and a non-empty effect', () => {
    for (const u of UPGRADES) {
      // The record player and the sofa corner (P27) are single pieces: one level.
      expect(u.maxLevel, u.id).toBeGreaterThanOrEqual(u.id === 'record_player' || u.id === 'sofa_corner' ? 1 : 2);
      const c0 = upgradeCost(u, 0)!;
      expect(c0).toBeGreaterThan(0);
      if (u.maxLevel >= 2) expect(upgradeCost(u, 1)!).toBeGreaterThan(c0);
      for (const t of u.ticketCost ?? []) expect(t, u.id).toBeGreaterThan(0);
      expect(u.ticketCost?.length ?? u.maxLevel, u.id).toBe(u.maxLevel);
      expect(upgradeCost(u, u.maxLevel)).toBeNull();
      expect(Object.keys(u.effectPerLevel).length).toBeGreaterThan(0);
    }
  });

  it('sums effects across levels', () => {
    const e = totalUpgradeEffect({ tables: 2, fast_machine: 1, plants: 0 });
    expect(e.capacity).toBe(4);
    expect(e.brewSpeed).toBeCloseTo(0.2);
    expect(e.appeal).toBe(0);
    expect(totalUpgradeEffect({})).toEqual({
      capacity: 0,
      ratingBonus: 0,
      appeal: 0,
      brewSpeed: 0,
      coffeeBrewSpeed: 0,
      coldBrewSpeed: 0,
      foodBrewSpeed: 0,
      foodAppeal: 0,
      cleanSpeed: 0,
      iceCostReduction: 0,
    });
  });
});

describe('difficulty, staff names and marketing', () => {
  it('orders difficulties from easy to hard', () => {
    const { easy, normal, hard } = DIFFICULTIES;
    expect(easy.startMoney).toBeGreaterThan(normal.startMoney);
    expect(normal.startMoney).toBeGreaterThan(hard.startMoney);
    expect(easy.patienceMult).toBeGreaterThan(hard.patienceMult);
    expect(easy.customerMult).toBeGreaterThan(hard.customerMult);
    expect(easy.priceMult).toBeLessThan(hard.priceMult);
  });

  it('has enough unique staff names', () => {
    expect(STAFF_NAMES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(STAFF_NAMES).size).toBe(STAFF_NAMES.length);
  });

  it('has campaigns that cost money and boost customers', () => {
    expect(MARKETING.length).toBeGreaterThanOrEqual(3);
    for (const c of MARKETING) {
      expect(c.cost).toBeGreaterThan(0);
      expect(c.days).toBeGreaterThan(0);
      expect(c.customerMult).toBeGreaterThan(1);
    }
  });
});
