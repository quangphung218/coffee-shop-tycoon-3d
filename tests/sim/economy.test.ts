import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { getMenuItem } from '../../src/sim/data/menu';
import {
  DEBT_LIMIT,
  ingredientCostUsed,
  isOverDebtLimit,
  payMarketing,
  profit,
  settleDay,
  totalWages,
} from '../../src/sim/economy';
import { ENTER_MINUTES, spawnCustomer, updateCustomers } from '../../src/sim/customers';
import { dispatch } from '../../src/sim/index';
import { consume } from '../../src/sim/inventory';
import { TASK_MINUTES, updatePlayerTasks } from '../../src/sim/orders';
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
  it('prices every serving taken out of stock at the item cost', () => {
    const s = createNewGame('A', 'normal', 1);
    for (const id of ['latte', 'latte', 'latte', 'espresso', 'espresso'] as const) consume(s, id);
    expect(ingredientCostUsed(s)).toBe(3 * getMenuItem('latte').cost + 2 * getMenuItem('espresso').cost);
    const hard = createNewGame('A', 'hard', 1);
    for (let i = 0; i < 3; i++) consume(hard, 'latte');
    expect(ingredientCostUsed(hard)).toBe(Math.round(3 * getMenuItem('latte').cost * DIFFICULTIES.hard.priceMult));
  });

  it('counts the drink made for a customer who left before getting it', () => {
    const s = createNewGame('A', 'normal', 42);
    for (const m of s.menu) m.enabled = m.id === 'latte';
    dispatch(s, { type: 'start_day' });
    const tick = (minutes: number): void => {
      for (let i = 0; i < minutes; i++) {
        updatePlayerTasks(s);
        updateCustomers(s);
      }
    };
    const c = spawnCustomer(s)!;
    tick(ENTER_MINUTES);
    expect(dispatch(s, { type: 'take_order', customerId: c.id })).toBe(true);
    tick(TASK_MINUTES.take_order);
    expect(c.state).toBe('waiting');
    c.patience = 0;
    tick(1);
    expect(c.state).toBe('angry_leave');
    expect(s.today.sold).toEqual({});

    settleDay(s);
    expect(s.today.ingredientCost).toBe(getMenuItem('latte').cost);
    expect(profit(s.today)).toBe(s.today.revenue - getMenuItem('latte').cost);
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
    for (let i = 0; i < 10; i++) consume(s, 'latte');
    for (let i = 0; i < 8; i++) consume(s, 'americano');
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
