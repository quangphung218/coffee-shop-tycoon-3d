import { describe, expect, it } from 'vitest';
import { isOverDebtLimit } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { MAX_RATING, MIN_RATING } from '../../src/sim/rating';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, DayStats, Difficulty, GameState } from '../../src/sim/types';
import { playDay } from './helpers';

const DAYS = 7;
const SEED = 777;
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

interface Strategy {
  /** Hire one barista on day 3. */
  hireBarista: boolean;
  /** Buy one table set on day 5. */
  buyTable: boolean;
}

const SAMPLE: Strategy = { hireBarista: true, buyTable: true };

interface Run {
  state: GameState;
  days: DayStats[];
  reports: DailyReport[];
  /** Lowest money seen at any minute. */
  minMoney: number;
  overDebt: boolean;
}

function checkInvariants(state: GameState): void {
  for (const item of state.inventory) expect(item.qty, `${item.id} on day ${state.day}`).toBeGreaterThanOrEqual(0);
  expect(state.rating).toBeGreaterThanOrEqual(MIN_RATING);
  expect(state.rating).toBeLessThanOrEqual(MAX_RATING);
}

/**
 * Seven days of the sample strategy: restock as suggested every morning, serve
 * alone, hire a barista on day 3 and buy a table set on day 5.
 */
function simulateWeek(difficulty: Difficulty, strategy: Strategy, seed = SEED): Run {
  const state = createNewGame('Quán Cân Bằng', difficulty, seed);
  // The bands were measured without day events; a fair or supplier hike would
  // swamp the barista and difficulty comparisons. Events have their own tests.
  state.week!.plan = [];
  const reports: DailyReport[] = [];
  let minMoney = state.money;
  let overDebt = false;
  const watch = (s: GameState) => {
    checkInvariants(s);
    minMoney = Math.min(minMoney, s.money);
    overDebt ||= isOverDebtLimit(s);
  };
  for (let day = 1; day <= DAYS; day++) {
    expect(state.day).toBe(day);
    expect(state.phase).toBe('preparation');
    dispatch(state, { type: 'apply_restock' });
    if (day === 3 && strategy.hireBarista) {
      const candidate = state.candidates[0];
      expect(candidate).toBeDefined();
      expect(dispatch(state, { type: 'hire_staff', candidateId: candidate!.id, role: 'barista' })).toBe(true);
    }
    if (day === 5 && strategy.buyTable) {
      expect(dispatch(state, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    }
    watch(state);
    playDay(state, { onMinute: watch });
    watch(state);
    reports.push(state.lastReport!);
    // Play on past the scored week (next_day is refused once week day 7 ends).
    delete state.week?.result;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
  return { state, days: state.history, reports, minMoney, overDebt };
}

function averageProfit(run: Run): number {
  return run.reports.reduce((s, r) => s + r.profit, 0) / run.reports.length;
}

/** Served / arrived over the whole week. */
function serveRate(run: Run): number {
  const arrived = run.days.reduce((s, d) => s + d.customersArrived, 0);
  const served = run.days.reduce((s, d) => s + d.customersServed, 0);
  return served / arrived;
}

/**
 * Week results of the sample strategy at seed 777, measured on 2026-10-15
 * (after the P20 balance pass: carried-over task minutes, tool and XP tuning):
 * serve rate easy 0.930, normal 0.957, hard 0.923; end-of-week rating easy
 * 4.47, normal 4.41, hard 4.54. The bands allow ±30% around them so tuning
 * can move the numbers, but a change that breaks service (most customers
 * walk out) or sinks the rating fails. Bounds are clipped to what the
 * quantity can reach (serve rate ≤ 1, rating ≤ 5).
 */
const MEASURED: Record<Difficulty, { serveRate: number; rating: number }> = {
  easy: { serveRate: 0.93, rating: 4.47 },
  normal: { serveRate: 0.957, rating: 4.41 },
  hard: { serveRate: 0.923, rating: 4.54 },
};
const TOLERANCE = 0.3;

function band(value: number, max: number): [number, number] {
  return [value * (1 - TOLERANCE), Math.min(max, value * (1 + TOLERANCE))];
}

// Each case simulates whole weeks; on a busy machine that runs past vitest's 5 s default.
describe('balance over seven days', { timeout: 30_000 }, () => {
  const runs = Object.fromEntries(DIFFICULTIES.map((d) => [d, simulateWeek(d, SAMPLE)])) as Record<Difficulty, Run>;

  it('follows the sample strategy on every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const { state, days } = runs[d];
      expect(days).toHaveLength(DAYS);
      expect(state.staff.filter((s) => s.role === 'barista'), d).toHaveLength(1);
      expect(state.upgrades.tables, d).toBe(1);
      expect(days[4]!.upgradeCost, d).toBeGreaterThan(0);
      expect(days.slice(2).every((s) => s.wages > 0), d).toBe(true);
      expect(days.every((s) => s.customersServed > 0), d).toBe(true);
    }
  });

  it('never goes broke on Easy', () => {
    const easy = runs.easy;
    expect(easy.overDebt).toBe(false);
    expect(easy.minMoney).toBeGreaterThanOrEqual(0);
    expect(easy.state.money).toBeGreaterThan(0);
  });

  it('earns less on Hard than on Easy', () => {
    expect(averageProfit(runs.hard)).toBeLessThan(averageProfit(runs.easy));
  });

  it('stays within the debt limit on Normal', () => {
    const normal = runs.normal;
    expect(normal.overDebt).toBe(false);
    expect(isOverDebtLimit(normal.state)).toBe(false);
  });

  it('ranks the average profit Easy > Normal > Hard', () => {
    const easy = averageProfit(runs.easy);
    const normal = averageProfit(runs.normal);
    const hard = averageProfit(runs.hard);
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(hard);
  });

  it('serves a sensible share of customers on every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const [lo, hi] = band(MEASURED[d].serveRate, 1);
      const rate = serveRate(runs[d]);
      expect(rate, d).toBeGreaterThanOrEqual(lo);
      expect(rate, d).toBeLessThanOrEqual(hi);
    }
  });

  it('ends the week with a sensible rating on every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const [lo, hi] = band(MEASURED[d].rating, MAX_RATING);
      const rating = runs[d].state.rating;
      expect(rating, d).toBeGreaterThanOrEqual(lo);
      expect(rating, d).toBeLessThanOrEqual(hi);
    }
  });

  it('loses more customers on day 5 without a barista', () => {
    for (const d of DIFFICULTIES) {
      const withBarista = runs[d].days[4]!;
      const alone = simulateWeek(d, { hireBarista: false, buyTable: true }).days[4]!;
      expect(alone.customersLost, d).toBeGreaterThan(withBarista.customersLost);
    }
  });

  it('keeps the rating in [1, 5] every day', () => {
    for (const d of DIFFICULTIES) {
      for (const r of runs[d].reports) {
        for (const value of [r.ratingStart, r.ratingEnd]) {
          expect(value, `${d} day ${r.day}`).toBeGreaterThanOrEqual(MIN_RATING);
          expect(value, `${d} day ${r.day}`).toBeLessThanOrEqual(MAX_RATING);
        }
      }
    }
  });
});
