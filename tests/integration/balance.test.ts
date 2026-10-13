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
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
  return { state, days: state.history, reports, minMoney, overDebt };
}

function averageProfit(run: Run): number {
  return run.reports.reduce((s, r) => s + r.profit, 0) / run.reports.length;
}

describe('balance over seven days', () => {
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
