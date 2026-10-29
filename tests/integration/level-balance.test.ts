import { describe, expect, it } from 'vitest';
import { FULL_UNLOCK_LEVEL } from '../../src/sim/data/levels';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { dailyRent, debtLimit, isOverDebtLimit, totalWages } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { MISSIONS_PER_DAY, isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeCost } from '../../src/sim/upgrades';
import type { DailyReport, Difficulty, GameState, ToolId, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const SEED = 777;
/**
 * Days kept playing after the shop first reaches level 6, to measure a few level-6 days.
 * The P20 milestones stop at level 6, where everything is unlocked; levels 7..10
 * (cap raises only) are measured in tests/integration/p23-long-run.test.ts.
 */
const EXTRA_AT_TOP = 3;
/** Safety bound; the sample strategy reaches level 6 on Hard well inside it. */
const DAY_CAP = 50;

// ---------------------------------------------------------------------------
// Design milestones (P20 brief). The sample strategy below is the yardstick.
// ---------------------------------------------------------------------------

/** On Normal the shop reaches level 2 on one of these days (inclusive). */
const NORMAL_LEVEL2_DAYS = { min: 2, max: 4 } as const;
/** On Normal the shop reaches the top level (6) on one of these days (inclusive). */
const NORMAL_TOP_LEVEL_DAYS = { min: 20, max: 35 } as const;
/** Every tool must earn back the price of its first level within this many days on Normal. */
const MAX_PAYBACK_DAYS = 15;

/*
 * Measured on 2026-10-15 at seed 777 (day the shop first ends a day at each level):
 *   easy   L2 2 · L3 5 · L4 9  · L5 13 · L6 19
 *   normal L2 3 · L3 6 · L4 11 · L5 17 · L6 25
 *   hard   L2 4 · L3 9 · L4 15 · L5 24 · L6 35
 * Tool payback on Normal (first level, 16 seeds × 10 days):
 *   grinder 4.6 · pastry_case 3.1 · blender 5.6 · ice_maker 11.2 · dishwasher 5.4 days.
 */

/**
 * Share of daily missions completed with the sample strategy at seed 777,
 * measured on 2026-10-15 (easy 60/66 over 22 days, normal 76/84 over 28,
 * hard 105/114 over 38). The test allows ±30% of these.
 */
const MISSION_RATE_MEASURED: Readonly<Record<Difficulty, number>> = { easy: 0.909, normal: 0.905, hard: 0.921 };
const MISSION_RATE_TOLERANCE = 0.3;

// ---------------------------------------------------------------------------
// Sample strategy: a competent-but-ordinary player.
// Every morning: enable whatever the current level has unlocked on the menu,
// restock as the game suggests, hire one barista once there is cash to spare,
// then spend the surplus on the cheapest unlocked upgrade or tool while always
// keeping tomorrow's wages + restock in hand.
// ---------------------------------------------------------------------------

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

/** Cash to keep back for tomorrow: wages and rent plus the suggested restock once today's stock is used up. */
function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

/** Buys the cheapest affordable unlocked upgrades/tools, keeping the reserve. */
function buyAffordable(state: GameState): void {
  for (let guard = 0; guard < UPGRADES.length; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!isUnlocked(state, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(state, def.id);
      if (cost === null || state.money - reserve(state) < cost) continue;
      if (best === null || cost < best.cost) best = { id: def.id, cost };
    }
    if (!best || !dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })) break;
  }
}

function hireBarista(state: GameState): void {
  if (state.staff.some((s) => s.role === 'barista')) return;
  const candidate = state.candidates[0];
  if (candidate) dispatch(state, { type: 'hire_staff', candidateId: candidate.id, role: 'barista' });
}

function morning(state: GameState): void {
  enableUnlocked(state);
  dispatch(state, { type: 'apply_restock' });
  if (state.money - reserve(state) > 300000) hireBarista(state);
  buyAffordable(state);
}

interface DayRec {
  /** Shop level the day was played at (before that evening's level-up). */
  level: number;
  report: DailyReport;
  missionsDone: number;
}

interface Run {
  state: GameState;
  recs: DayRec[];
  /** First day on which the shop was at each level after the evening's scoring. */
  levelDay: Record<number, number>;
  minMoney: number;
  overDebt: boolean;
}

function simulate(difficulty: Difficulty, seed = SEED): Run {
  const state = createNewGame('Quán Cân Bằng', difficulty, seed);
  const recs: DayRec[] = [];
  const levelDay: Record<number, number> = {};
  let minMoney = state.money;
  let overDebt = false;
  let extra = 0;
  const watch = (s: GameState) => {
    minMoney = Math.min(minMoney, s.money);
    overDebt ||= isOverDebtLimit(s);
  };
  for (let day = 1; day <= DAY_CAP; day++) {
    morning(state);
    const playedLevel = state.shopLevel;
    watch(state);
    playDay(state, { onMinute: watch });
    watch(state);
    const report = state.lastReport!;
    recs.push({ level: playedLevel, report, missionsDone: (report.missions ?? []).filter((m) => m.status === 'completed').length });
    for (let l = 2; l <= state.shopLevel; l++) if (!(l in levelDay)) levelDay[l] = day;
    // Play on past the scored week (next_day is refused once week day 7 ends).
    delete state.week?.result;
    dispatch(state, { type: 'next_day' });
    if (state.shopLevel >= FULL_UNLOCK_LEVEL && ++extra > EXTRA_AT_TOP) break;
  }
  return { state, recs, levelDay, minMoney, overDebt };
}

function average(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

describe('level and tool economic balance', { timeout: 120_000 }, () => {
  const runs = Object.fromEntries(DIFFICULTIES.map((d) => [d, simulate(d)])) as Record<Difficulty, Run>;

  it('reaches level 6 on every difficulty with the sample strategy', () => {
    for (const d of DIFFICULTIES) {
      expect(runs[d].state.shopLevel, d).toBe(FULL_UNLOCK_LEVEL);
      // A day was actually played at the top level, so the level-6 figures are real.
      expect(runs[d].recs.some((r) => r.level === FULL_UNLOCK_LEVEL), d).toBe(true);
    }
  });

  it('never goes into the red on Easy', () => {
    const easy = runs.easy;
    expect(easy.minMoney).toBeGreaterThanOrEqual(0);
    expect(easy.overDebt).toBe(false);
    expect(easy.state.money).toBeGreaterThan(0);
  });

  it('stays within the debt limit on Normal', () => {
    const normal = runs.normal;
    expect(normal.overDebt).toBe(false);
    expect(normal.minMoney).toBeGreaterThan(-debtLimit(normal.state));
    expect(isOverDebtLimit(normal.state)).toBe(false);
  });

  it('reaches level 2 and level 6 on Normal inside the design milestones', () => {
    const { levelDay } = runs.normal;
    expect(levelDay[2]).toBeGreaterThanOrEqual(NORMAL_LEVEL2_DAYS.min);
    expect(levelDay[2]).toBeLessThanOrEqual(NORMAL_LEVEL2_DAYS.max);
    expect(levelDay[FULL_UNLOCK_LEVEL]).toBeGreaterThanOrEqual(NORMAL_TOP_LEVEL_DAYS.min);
    expect(levelDay[FULL_UNLOCK_LEVEL]).toBeLessThanOrEqual(NORMAL_TOP_LEVEL_DAYS.max);
  });

  it('levels up faster on Easy and slower on Hard than on Normal', () => {
    for (let level = 2; level <= FULL_UNLOCK_LEVEL; level++) {
      const easy = runs.easy.levelDay[level]!;
      const normal = runs.normal.levelDay[level]!;
      const hard = runs.hard.levelDay[level]!;
      expect(easy, `easy level ${level}`).toBeLessThanOrEqual(normal);
      expect(hard, `hard level ${level}`).toBeGreaterThanOrEqual(normal);
    }
    expect(runs.easy.levelDay[FULL_UNLOCK_LEVEL]).toBeLessThan(runs.normal.levelDay[FULL_UNLOCK_LEVEL]!);
    expect(runs.hard.levelDay[FULL_UNLOCK_LEVEL]).toBeGreaterThan(runs.normal.levelDay[FULL_UNLOCK_LEVEL]!);
  });

  it('reaches every level in order, one level-up day after another', () => {
    for (const d of DIFFICULTIES) {
      for (let level = 3; level <= FULL_UNLOCK_LEVEL; level++) {
        expect(runs[d].levelDay[level]!, `${d} level ${level}`).toBeGreaterThanOrEqual(runs[d].levelDay[level - 1]!);
      }
    }
  });

  it('grows average profit from the low levels to the high levels', () => {
    for (const d of DIFFICULTIES) {
      const low = runs[d].recs.filter((r) => r.level <= 2).map((r) => r.report.profit);
      const high = runs[d].recs.filter((r) => r.level >= 5).map((r) => r.report.profit);
      expect(low.length, d).toBeGreaterThan(0);
      expect(high.length, d).toBeGreaterThan(0);
      expect(average(high), d).toBeGreaterThan(average(low));
    }
  });

  it('keeps food cost and labor within benchmark or advises on it at level 6', () => {
    for (const d of DIFFICULTIES) {
      const topDays = runs[d].recs.filter((r) => r.level === FULL_UNLOCK_LEVEL);
      expect(topDays.length, d).toBeGreaterThan(0);
      for (const rec of topDays) {
        const insights = rec.report.insights!;
        for (const id of ['food_cost', 'labor_cost'] as const) {
          const metric = insights.metrics.find((m) => m.id === id)!;
          // Either the figure sits in the healthy band, or the player is told to act on it.
          const healthy = metric.status === 'good';
          expect(healthy || metric.advice.length > 0, `${d} ${id} day ${rec.report.day}`).toBe(true);
        }
      }
    }
  });

  it('completes daily missions at the measured rate (±30%) on every difficulty', () => {
    for (const d of DIFFICULTIES) {
      const rate = average(runs[d].recs.map((r) => r.missionsDone)) / MISSIONS_PER_DAY;
      const measured = MISSION_RATE_MEASURED[d];
      expect(rate, d).toBeGreaterThanOrEqual(measured * (1 - MISSION_RATE_TOLERANCE));
      expect(rate, d).toBeLessThanOrEqual(Math.min(1, measured * (1 + MISSION_RATE_TOLERANCE)));
    }
  });

  // -------------------------------------------------------------------------
  // Tool payback. A level-6 Normal shop is run with the sample strategy but
  // without any tool, then forked: one copy buys the first level of a tool,
  // the control does not, and both play PAYBACK_FORK_DAYS days restocking as
  // suggested. Rating and arrivals carry over between days, so the effect of
  // more customers shows up. payback = price / mean daily profit gain over
  // the seeds.
  // -------------------------------------------------------------------------
  describe('tool payback on Normal', () => {
    const TOOLS: readonly ToolId[] = ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'];
    const PAYBACK_SEEDS = [777, 101, 202, 303, 404, 505, 606, 808, 909, 111, 222, 333, 444, 555, 666, 999];
    const WARMUP_DAYS = 8;
    const PAYBACK_FORK_DAYS = 10;

    /** A grown level-6 shop: one barista and every affordable non-tool upgrade. */
    function warmup(seed: number): GameState {
      const s = createNewGame('Quán', 'normal', seed);
      // Far below any threshold, so the evening scoring never lifts the shop past level 6 (levels 7..10 raise caps).
      s.xp = -1e6;
      s.shopLevel = FULL_UNLOCK_LEVEL;
      for (let day = 1; day <= WARMUP_DAYS; day++) {
        enableUnlocked(s);
        dispatch(s, { type: 'apply_restock' });
        hireBarista(s);
        for (const def of UPGRADES) {
          if ((TOOLS as readonly UpgradeId[]).includes(def.id)) continue;
          while ((nextUpgradeCost(s, def.id) ?? Infinity) < s.money - reserve(s)) {
            if (!dispatch(s, { type: 'buy_upgrade', upgradeId: def.id })) break;
          }
        }
        playDay(s);
        // Play on past the scored week (next_day is refused once week day 7 ends).
        delete s.week?.result;
        dispatch(s, { type: 'next_day' });
      }
      return s;
    }

    /** Mean daily profit over the fork days; profit excludes the one-off upgrade cost. */
    function meanProfit(state: GameState): number {
      let total = 0;
      for (let day = 0; day < PAYBACK_FORK_DAYS; day++) {
        enableUnlocked(state);
        dispatch(state, { type: 'apply_restock' });
        playDay(state);
        total += state.lastReport!.profit;
        delete state.week?.result;
        dispatch(state, { type: 'next_day' });
      }
      return total / PAYBACK_FORK_DAYS;
    }

    interface Payback {
      meanDelta: number;
      cost: number;
      days: number;
    }

    const paybacks = new Map<ToolId, Payback>();
    let anyInsolvent = false;
    let anyNonFinite = false;
    for (const seed of PAYBACK_SEEDS) {
      const base = warmup(seed);
      expect(base.shopLevel, `warmup seed ${seed}`).toBe(FULL_UNLOCK_LEVEL);
      const controlProfit = meanProfit(structuredClone(base));
      for (const tool of TOOLS) {
        const fork = structuredClone(base);
        const cost = nextUpgradeCost(fork, tool)!;
        expect(dispatch(fork, { type: 'buy_upgrade', upgradeId: tool }), `${tool} seed ${seed}`).toBe(true);
        const profit = meanProfit(fork);
        if (!Number.isFinite(profit)) anyNonFinite = true;
        if (fork.money <= -debtLimit(fork)) anyInsolvent = true;
        const rec = paybacks.get(tool) ?? { meanDelta: 0, cost, days: 0 };
        rec.meanDelta += (profit - controlProfit) / PAYBACK_SEEDS.length;
        paybacks.set(tool, rec);
      }
    }
    for (const rec of paybacks.values()) rec.days = rec.meanDelta > 0 ? rec.cost / rec.meanDelta : Infinity;

    it('buying any tool keeps the shop solvent with a finite profit', () => {
      expect(anyNonFinite).toBe(false);
      expect(anyInsolvent).toBe(false);
    });

    it(`earns back every tool within ${MAX_PAYBACK_DAYS} days`, () => {
      for (const tool of TOOLS) {
        const p = paybacks.get(tool)!;
        expect(p.meanDelta, `${tool} daily gain`).toBeGreaterThan(0);
        expect(p.days, `${tool}: ${Math.round(p.cost)} / ${Math.round(p.meanDelta)} per day`).toBeLessThanOrEqual(MAX_PAYBACK_DAYS);
      }
    });

    it('proves the ice maker cuts ingredient cost without changing the day', () => {
      // The ice maker changes no timing, so both forks serve the exact same day;
      // the only difference is a lower ingredient cost. Clean, noise-free signal.
      const base = warmup(SEED);
      enableUnlocked(base);
      dispatch(base, { type: 'apply_restock' });
      const without = structuredClone(base);
      const withTool = structuredClone(base);
      expect(dispatch(withTool, { type: 'buy_upgrade', upgradeId: 'ice_maker' })).toBe(true);
      playDay(without);
      playDay(withTool);
      const a = without.lastReport!;
      const b = withTool.lastReport!;
      expect(b.customersServed).toBe(a.customersServed);
      expect(b.revenue).toBe(a.revenue);
      expect(b.ingredientCost).toBeLessThan(a.ingredientCost);
    });
  });
});
