import { describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { DayStats, GameState, PolicyLevel } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * E6 (docs/reports/p22-economy.md): high prices lose customers at the door and
 * at the counter, so they pay only in a shop with high stars or quality gear.
 */

const SEEDS = [1, 42, 777, 2024];

interface Shop {
  rating?: number;
  /** Level of the espresso machine (the rating-bonus gear). */
  machine?: number;
}

function playOneDay(seed: number, price: PolicyLevel, shop: Shop): DayStats {
  const s: GameState = createNewGame('Quán E6', 'normal', seed);
  if (shop.rating !== undefined) s.rating = shop.rating;
  if (shop.machine) s.upgrades.better_machine = shop.machine;
  expect(dispatch(s, { type: 'set_policy', policy: 'price', level: price })).toBe(true);
  // Stocked past any demand, so sales follow the customers and not the restock plan.
  for (const i of s.inventory) i.qty = 100000;
  // Staffed like the p22 strategies, so the day is not capped by one pair of hands.
  const pick = [...s.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
  expect(dispatch(s, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  playDay(s);
  return s.today;
}

function total(price: PolicyLevel, shop: Shop): { revenue: number; lost: number; arrived: number; served: number } {
  const days = SEEDS.map((seed) => playOneDay(seed, price, shop));
  return {
    revenue: days.reduce((n, t) => n + t.revenue, 0),
    lost: days.reduce((n, t) => n + t.customersLost, 0),
    arrived: days.reduce((n, t) => n + t.customersArrived, 0),
    served: days.reduce((n, t) => n + t.customersServed, 0),
  };
}

describe('high price demand', { timeout: 120_000 }, () => {
  it('earns less than standard in a plain 3-star shop: fewer customers, more walk-outs', () => {
    const standard = total('standard', {});
    const high = total('high', {});
    expect(high.arrived).toBeLessThan(standard.arrived);
    expect(high.lost).toBeGreaterThan(standard.lost);
    expect(high.served).toBeLessThan(standard.served);
    expect(high.revenue).toBeLessThan(standard.revenue);
  });

  it('earns more than standard in a shop with high stars and a top espresso machine', () => {
    const shop = { rating: 4.5, machine: 3 };
    const standard = total('standard', shop);
    const high = total('high', shop);
    expect(high.revenue).toBeGreaterThan(standard.revenue);
  });

  it('plays the same day again from the same seed', () => {
    expect(playOneDay(9001, 'high', {})).toEqual(playOneDay(9001, 'high', {}));
  });
});
