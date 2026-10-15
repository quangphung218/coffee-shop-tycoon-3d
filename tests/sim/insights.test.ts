import { describe, expect, it } from 'vitest';
import { buildInsights } from '../../src/sim/insights';
import { SERVICE_MINUTES } from '../../src/sim/data/benchmarks';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DayStats, GameState, MetricId } from '../../src/sim/types';

/** A fully-tracked day (all optional stats present), with overrides on top. */
function day(over: Partial<DayStats> = {}): DayStats {
  return { ...createDayStats(1, 3), ...over };
}

function game(): GameState {
  // Normal difficulty: priceMult = 1, so costs are straightforward to hand-check.
  // Starter menu enables espresso, americano, latte, lemon_tea; 3 tables × 2 = 6 seats.
  return createNewGame('A', 'normal', 1);
}

function metric(state: GameState, stats: DayStats, id: MetricId) {
  return buildInsights(state, stats).metrics.find((m) => m.id === id)!;
}

describe('buildInsights — hand-computed figures', () => {
  const s = game();
  const stats = day({
    revenue: 1_000_000,
    ingredientCost: 300_000,
    ingredientsUsed: 300_000,
    wages: 300_000,
    customersArrived: 100,
    customersServed: 95,
    customersLost: 5,
    seatMinutesUsed: 2_340, // 6 seats × 780 min = 4680 capacity → 50%
    waitMinutesSum: 380,
    waitCount: 95, // 4 minutes each
    wasteCost: 9_000,
    arrivalsByHour: (() => {
      const a = new Array(24).fill(1);
      a[12] = 30;
      return a;
    })(),
  });

  it('computes the cost ratios as COGS/labour over revenue', () => {
    expect(metric(s, stats, 'food_cost').value).toBeCloseTo(30, 6);
    expect(metric(s, stats, 'labor_cost').value).toBeCloseTo(30, 6);
    expect(metric(s, stats, 'prime_cost').value).toBeCloseTo(60, 6); // (300k + 300k) / 1M
  });

  it('computes AOV, seat fill, average wait, waste, peak hour and abandon rate', () => {
    expect(metric(s, stats, 'aov').value).toBe(Math.round(1_000_000 / 95));
    expect(metric(s, stats, 'seat_fill').value).toBeCloseTo(50, 6);
    expect(metric(s, stats, 'avg_wait').value).toBeCloseTo(4, 6);
    expect(metric(s, stats, 'waste').value).toBe(9_000); // priceMult 1 → đồng equals base
    expect(metric(s, stats, 'peak_hour').value).toBe(12);
    expect(metric(s, stats, 'abandon_rate').value).toBeCloseTo(5, 6);
  });

  it('scores a healthy day as good with no action hints', () => {
    const ins = buildInsights(s, stats);
    for (const m of ins.metrics) {
      if (m.status !== null) expect(m.status).toBe('good');
      expect(m.advice).toBe('');
    }
    expect(ins.grossProfit).toBe(700_000); // revenue − COGS
  });

  it('derives per-item gross margin from price minus ingredient cost', () => {
    const { itemMargins } = buildInsights(s, stats);
    expect(itemMargins.map((m) => m.id)).toEqual(['espresso', 'americano', 'latte', 'lemon_tea']);
    const espresso = itemMargins.find((m) => m.id === 'espresso')!;
    expect(espresso.grossProfit).toBe(25_000 - 6_900); // beans 18×300 + cup 1500
    expect(espresso.marginPct).toBeCloseTo(72.4, 1);
    expect(espresso.status).toBe('good');
    // Trà chanh is the thinnest-margin starter item.
    const lemon = itemMargins.find((m) => m.id === 'lemon_tea')!;
    // tea 2.500 + lemon 3.000 + sugar 625 + ice 200×3 + cup 1.500 = 8.225 of 20.000.
    expect(lemon.marginPct).toBeCloseTo(58.875, 2);
    expect(lemon.status).toBe('watch');
  });

  it('builds per-item day profit from what sold, highest gross profit first', () => {
    const sold = day({ sold: { espresso: 10, lemon_tea: 3 } });
    const { itemProfits, arrivalsByHour } = buildInsights(s, sold);
    // Espresso: (25.000 − 6.900) × 10 = 181.000 beats Trà chanh's smaller take.
    expect(itemProfits.map((p) => p.id)).toEqual(['espresso', 'lemon_tea']);
    const espresso = itemProfits[0]!;
    expect(espresso.qty).toBe(10);
    expect(espresso.price).toBe(25_000);
    expect(espresso.cost).toBe(6_900);
    expect(espresso.grossProfit).toBe((25_000 - 6_900) * 10);
    expect(espresso.marginPct).toBeCloseTo(72.4, 1);
    expect(espresso.status).toBe('good');
    // The hourly arrivals come straight through for the chart.
    expect(arrivalsByHour?.[12]).toBe(sold.arrivalsByHour?.[12]);
  });

  it('includes a sold item even after it is switched off the menu', () => {
    const offMenu = game();
    offMenu.menu = offMenu.menu.map((m) => (m.id === 'latte' ? { ...m, enabled: false } : m));
    const { itemProfits } = buildInsights(offMenu, day({ sold: { latte: 4 } }));
    expect(itemProfits.map((p) => p.id)).toEqual(['latte']);
    expect(itemProfits[0]!.qty).toBe(4);
  });
});

describe('buildInsights — thresholds and advice on a bad day', () => {
  const s = game();
  const stats = day({
    revenue: 1_000_000,
    ingredientCost: 450_000, // 45% food cost
    ingredientsUsed: 450_000,
    wages: 450_000, // 45% labour, 90% prime
    customersArrived: 100,
    customersServed: 70,
    customersLost: 30, // 30% abandon
    seatMinutesUsed: 4_600, // ~98% of 4680 capacity
    waitMinutesSum: 2_000,
    waitCount: 100, // 20 minutes each
    wasteCost: 90_000, // 20% of COGS
  });

  it('flags every stressed metric as bad', () => {
    for (const id of ['food_cost', 'labor_cost', 'prime_cost', 'seat_fill', 'avg_wait', 'waste', 'abandon_rate'] as const) {
      expect(metric(s, stats, id).status).toBe('bad');
    }
  });

  it('gives an action hint with a panel for watch/bad metrics', () => {
    const food = metric(s, stats, 'food_cost');
    expect(food.advice).toContain('Trà chanh'); // the thinnest-margin starter item
    expect(food.panel).toBe('menu');

    const wait = metric(s, stats, 'avg_wait');
    expect(wait.advice).toContain('barista'); // no barista on staff yet
    expect(wait.panel).toBe('staff');

    expect(metric(s, stats, 'seat_fill').panel).toBe('upgrades');
  });

  it('points the wait hint at more servers once a barista is on staff', () => {
    const withBarista = game();
    withBarista.staff.push({
      id: 99,
      name: 'B',
      role: 'barista',
      wagePerDay: 150_000,
      speed: 1,
      busy: false,
      task: null,
      pos: { x: 0, z: 0 },
      look: 0,
    });
    expect(metric(withBarista, stats, 'avg_wait').advice).toContain('phục vụ');
  });
});

describe('buildInsights — empty and old-save edges', () => {
  it('returns null (never NaN/Infinity) for an empty, revenue-free day', () => {
    const s = game();
    const ins = buildInsights(s, day({ revenue: 0 }));
    for (const id of ['food_cost', 'labor_cost', 'prime_cost', 'aov', 'abandon_rate'] as const) {
      const m = ins.metrics.find((x) => x.id === id)!;
      expect(m.value).toBeNull();
      expect(m.status).toBeNull();
    }
    expect(ins.grossProfit).toBeNull();
    // Margins still come from the menu, and every number stays finite.
    expect(ins.itemMargins.length).toBeGreaterThan(0);
    for (const m of ins.metrics) expect(m.value === null || Number.isFinite(m.value)).toBe(true);
    for (const im of ins.itemMargins) {
      expect(Number.isFinite(im.marginPct)).toBe(true);
      expect(Number.isFinite(im.grossProfit)).toBe(true);
    }
  });

  it('returns null for stats from a save without the extra day fields', () => {
    const s = game();
    // A pre-insights DayStats: none of the optional tracking fields are present.
    const oldStats: DayStats = {
      day: 1,
      revenue: 500_000,
      ingredientCost: 150_000,
      wages: 150_000,
      marketingCost: 0,
      upgradeCost: 0,
      customersArrived: 50,
      customersServed: 50,
      customersLost: 0,
      sold: {},
      outOfStock: {},
      ratingStart: 3,
      ratingEnd: 3,
    };
    const ins = buildInsights(s, oldStats);
    // Ratios that need only revenue/cost are still computable.
    expect(metric(s, oldStats, 'food_cost').value).toBeCloseTo(30, 6);
    // Hour/seat/wait/waste fields are missing → null, no NaN.
    expect(ins.metrics.find((m) => m.id === 'seat_fill')!.value).toBeNull();
    expect(ins.metrics.find((m) => m.id === 'avg_wait')!.value).toBeNull();
    expect(ins.metrics.find((m) => m.id === 'waste')!.value).toBeNull();
    expect(ins.metrics.find((m) => m.id === 'peak_hour')!.value).toBeNull();
  });

  it('shows waste in đồng but no status when COGS is unknown', () => {
    const s = game();
    const m = metric(s, day({ wasteCost: 5_000, ingredientsUsed: undefined }), 'waste');
    expect(m.value).toBe(5_000);
    expect(m.status).toBeNull();
  });

  it('scales the seat-fill denominator by the service window', () => {
    const s = game();
    const seats = s.tables.reduce((sum, t) => sum + t.seats, 0);
    const full = day({ seatMinutesUsed: seats * SERVICE_MINUTES });
    expect(metric(s, full, 'seat_fill').value).toBeCloseTo(100, 6);
  });
});
