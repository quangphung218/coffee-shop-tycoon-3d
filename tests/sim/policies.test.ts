import { describe, expect, it } from 'vitest';
import { arrivalRate, sellPrice, serveCustomer, spawnCustomer } from '../../src/sim/customers';
import { settleDay, totalWages } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { PRICE_POLICY, WAGE_POLICY, policyLevel } from '../../src/sim/policies';
import { dayScore } from '../../src/sim/rating';
import { rateExperience } from '../../src/sim/reviews';
import { hireStaff, updateStaff } from '../../src/sim/staff';
import { createNewGame } from '../../src/sim/state';
import type { GameState, PolicyLevel } from '../../src/sim/types';

function game(): GameState {
  const s = createNewGame('A', 'normal', 7);
  for (const i of s.inventory) i.qty = 100000;
  return s;
}

/** Revenue of one takeaway latte (every table dirty, so the customer pays at the counter). */
function takeawayRevenue(s: GameState): number {
  for (const m of s.menu) m.enabled = m.id === 'latte';
  dispatch(s, { type: 'start_day' });
  for (const t of s.tables) t.trash = 1;
  const customer = spawnCustomer(s)!;
  delete customer.extraItem;
  const money = s.money;
  serveCustomer(s, customer, 'latte');
  return s.money - money;
}

/** A day where everyone was served at half patience, so the score sits between 1 and 5. */
function middlingDay(s: GameState): GameState {
  s.today.customersArrived = 10;
  s.today.customersServed = 8;
  s.today.customersLost = 2;
  s.today.waitShareSum = 4;
  return s;
}

/** Average stars over many served visits at the same wait, from the same RNG start. */
function avgStars(s: GameState): number {
  let sum = 0;
  const n = 400;
  for (let i = 0; i < n; i++) sum += rateExperience(s, { kind: 'served', waitShare: 0.5, dirtyTable: false }).stars;
  return sum / n;
}

function withPolicy(policy: 'price' | 'wage', level: PolicyLevel, s: GameState = game()): GameState {
  expect(dispatch(s, { type: 'set_policy', policy, level })).toBe(true);
  return s;
}

/** Minutes a slow cleaner needs to clear one dirty table. */
function cleanTime(s: GameState): number {
  dispatch(s, { type: 'start_day' });
  const cleaner = hireStaff(s, s.candidates[0]!.id, 'cleaner')!;
  cleaner.speed = 0.1;
  s.tables[0]!.trash = 1;
  let minutes = 0;
  while (s.tables[0]!.trash > 0 && minutes < 200) {
    updateStaff(s);
    minutes++;
  }
  return minutes;
}

function hireTwo(s: GameState): GameState {
  hireStaff(s, s.candidates[0]!.id, 'barista');
  hireStaff(s, s.candidates[0]!.id, 'server');
  return s;
}

describe('set_policy', () => {
  it('defaults to standard and stores the chosen level', () => {
    const s = game();
    expect(policyLevel(s, 'price')).toBe('standard');
    expect(policyLevel(s, 'wage')).toBe('standard');
    withPolicy('price', 'high', s);
    expect(s.policies).toEqual({ price: 'high', wage: 'standard' });
  });

  it('refuses an unknown level', () => {
    const s = game();
    expect(dispatch(s, { type: 'set_policy', policy: 'price', level: 'max' as PolicyLevel })).toBe(false);
    expect(s.policies).toBeUndefined();
  });
});

describe('price policy', () => {
  const standard = {
    revenue: takeawayRevenue(game()),
    arrivals: arrivalRate(game()),
    score: dayScore(middlingDay(game())),
    stars: avgStars(game()),
  };

  it('high: more per cup, fewer stars and arrivals', () => {
    expect(sellPrice(withPolicy('price', 'high'), 'latte')).toBe(Math.round(sellPrice(game(), 'latte') * PRICE_POLICY.high.priceMult));
    expect(takeawayRevenue(withPolicy('price', 'high'))).toBeGreaterThan(standard.revenue);
    expect(arrivalRate(withPolicy('price', 'high'))).toBeCloseTo(standard.arrivals * PRICE_POLICY.high.arrivals);
    expect(dayScore(middlingDay(withPolicy('price', 'high')))).toBeCloseTo(standard.score + PRICE_POLICY.high.stars);
    expect(avgStars(withPolicy('price', 'high'))).toBeLessThan(standard.stars);
  });

  it('low: less per cup, more stars and arrivals', () => {
    expect(takeawayRevenue(withPolicy('price', 'low'))).toBeLessThan(standard.revenue);
    expect(arrivalRate(withPolicy('price', 'low'))).toBeGreaterThan(standard.arrivals);
    expect(dayScore(middlingDay(withPolicy('price', 'low')))).toBeCloseTo(standard.score + PRICE_POLICY.low.stars);
    expect(avgStars(withPolicy('price', 'low'))).toBeGreaterThan(standard.stars);
  });
});

describe('wage policy', () => {
  const standard = { wages: totalWages(hireTwo(game())), clean: cleanTime(game()) };

  it('high: a bigger wage bill, faster work', () => {
    const s = hireTwo(withPolicy('wage', 'high'));
    const base = s.staff.reduce((sum, m) => sum + m.wagePerDay, 0);
    expect(totalWages(s)).toBe(Math.round(base * WAGE_POLICY.high.wageMult));
    expect(totalWages(s)).toBeGreaterThan(standard.wages);
    expect(cleanTime(withPolicy('wage', 'high'))).toBeLessThan(standard.clean);
  });

  it('low: a smaller wage bill, slower work', () => {
    expect(totalWages(hireTwo(withPolicy('wage', 'low')))).toBeLessThan(standard.wages);
    expect(cleanTime(withPolicy('wage', 'low'))).toBeGreaterThan(standard.clean);
  });

  it('the day pays the wage bill at the policy rate', () => {
    const s = hireTwo(withPolicy('wage', 'high'));
    const money = s.money;
    settleDay(s);
    expect(s.today.wages).toBe(totalWages(s));
    expect(s.money).toBe(money - totalWages(s));
  });
});
