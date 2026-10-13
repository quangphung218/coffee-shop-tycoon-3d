import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { getMenuItem } from '../../src/sim/data/menu';
import {
  DEBT_LIMIT,
  costOfGoodsSold,
  isOverDebtLimit,
  payMarketing,
  profit,
  settleDay,
  totalWages,
} from '../../src/sim/economy';
import { createNewGame, generateCandidates } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';

function hire(s: GameState, ...wages: number[]): void {
  const staff = generateCandidates({ rngState: 1 }, 100, wages.length, 1);
  wages.forEach((w, i) => (staff[i]!.wagePerDay = w));
  s.staff.push(...staff);
}

function notices(s: GameState): GameEvent[] {
  return s.events.filter((e) => e.type === 'notify');
}

describe('costs', () => {
  it('prices ingredients sold at the item cost', () => {
    const s = createNewGame('A', 'normal', 1);
    s.today.sold = { latte: 3, espresso: 2 };
    expect(costOfGoodsSold(s)).toBe(3 * getMenuItem('latte').cost + 2 * getMenuItem('espresso').cost);
    const hard = createNewGame('A', 'hard', 1);
    hard.today.sold = { latte: 3 };
    expect(costOfGoodsSold(hard)).toBe(Math.round(3 * getMenuItem('latte').cost * DIFFICULTIES.hard.priceMult));
  });

  it('adds up staff wages and handles no staff', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(totalWages(s)).toBe(0);
    hire(s, 150000, 120000);
    expect(totalWages(s)).toBe(270000);
  });

  it('pays marketing only when the money covers it', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(payMarketing(s, 150000)).toBe(true);
    expect(s.today.marketingCost).toBe(150000);
    expect(s.money).toBe(DIFFICULTIES.normal.startMoney - 150000);
    s.money = 100;
    expect(payMarketing(s, 150000)).toBe(false);
    expect(s.money).toBe(100);
    expect(s.today.marketingCost).toBe(150000);
  });
});

describe('settleDay', () => {
  it('records costs, pays wages and the profit adds up', () => {
    const s = createNewGame('A', 'normal', 1);
    hire(s, 150000, 130000);
    s.today.revenue = 900000;
    s.today.sold = { latte: 10, americano: 8 };
    s.today.marketingCost = 150000;
    const money = s.money;
    settleDay(s);
    const t = s.today;
    expect(t.ingredientCost).toBe(10 * getMenuItem('latte').cost + 8 * getMenuItem('americano').cost);
    expect(t.wages).toBe(280000);
    expect(s.money).toBe(money - 280000);
    expect(profit(t)).toBe(900000 - t.ingredientCost - 280000 - 150000);
    expect(notices(s)).toEqual([]);
  });

  it('lets money go negative with a warning inside the debt limit', () => {
    const s = createNewGame('A', 'normal', 1);
    hire(s, 200000);
    s.money = 100000;
    settleDay(s);
    expect(s.money).toBe(-100000);
    expect(isOverDebtLimit(s)).toBe(false);
    expect(notices(s)).toEqual([expect.objectContaining({ level: 'warning' })]);
  });

  it('raises an error notice past the debt limit for the difficulty', () => {
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      const s = createNewGame('A', diff, 1);
      hire(s, DEBT_LIMIT[diff] + 1);
      s.money = 0;
      settleDay(s);
      expect(isOverDebtLimit(s)).toBe(true);
      expect(notices(s)).toEqual([expect.objectContaining({ level: 'error' })]);
    }
    expect(DEBT_LIMIT.easy).toBeGreaterThan(DEBT_LIMIT.normal);
    expect(DEBT_LIMIT.normal).toBeGreaterThan(DEBT_LIMIT.hard);
  });
});
