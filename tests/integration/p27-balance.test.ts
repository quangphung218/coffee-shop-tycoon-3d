import { describe, expect, it } from 'vitest';
import { FULL_UNLOCK_LEVEL } from '../../src/sim/data/levels';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked } from '../../src/sim/progression';
import { ACHIEVEMENT_IDS, ACHIEVEMENTS } from '../../src/sim/data/retention';
import { ensureRetention } from '../../src/sim/retention';
import { canTrain } from '../../src/sim/staffGrowth';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeCost } from '../../src/sim/upgrades';
import type { Difficulty, GameEvent, GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

const SEED = 777;
/** Safety bound; the sample strategy reaches level 6 on Normal well inside it. */
const DAY_CAP = 50;
/** The P27 retention run: four full weeks. */
const RETENTION_DAYS = 28;

/** The P20 milestones on Normal (same as tests/integration/level-balance.test.ts). */
const NORMAL_LEVEL2_DAYS = { min: 2, max: 4 } as const;
const NORMAL_TOP_LEVEL_DAYS = { min: 20, max: 35 } as const;

/*
 * Measured on 2026-10-18 at seed 777, Normal:
 *   no P27 commands: L2 day 3 · L3 6 · L4 10 · L5 16 · L6 23
 *   gift every day + training whenever possible, 28 days: L6 day 22,
 *   lowest cash 1.177.500 đ, 188 Tem earned (gift 56 · achievement 60 ·
 *   special order 54 · VIP 18), 11 spent (training to levels 4 and 5,
 *   record player), 177 left; the barista reaches level 5 after 4 trainings.
 * The test allows about ±40% of the 188 Tem.
 */
const TICKETS_28_DAYS = { min: 110, max: 270 } as const;
/** Four 7-day gift cycles: 1 + 1 + 2 + 1 + 2 + 2 + 5 Tem each. */
const GIFT_TICKETS_28_DAYS = 4 * 14;

// ---------------------------------------------------------------------------
// Sample strategy of tests/integration/level-balance.test.ts: enable what is
// unlocked, restock as suggested, hire one barista once there is cash to
// spare, buy the cheapest affordable upgrade keeping tomorrow's wages and
// restock in hand.
// ---------------------------------------------------------------------------

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

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

/** Local date key 'YYYY-MM-DD' of game day `day` in October 2026 (day ≤ 31), never the real clock. */
function octoberKey(day: number): string {
  return `2026-10-${String(day).padStart(2, '0')}`;
}

interface Run {
  state: GameState;
  levelDay: Record<number, number>;
  minMoney: number;
  ticketsEarned: number;
  ticketsByReason: Record<string, number>;
  trainings: number;
  gifts: number;
}

/** Plays Normal with the sample strategy; `p27` adds the daily gift and training. */
function simulate(difficulty: Difficulty, days: number, p27: boolean, stopAtTop: boolean): Run {
  const state = createNewGame('Quán Cân Bằng', difficulty, SEED);
  const levelDay: Record<number, number> = {};
  const ticketsByReason: Record<string, number> = {};
  let minMoney = state.money;
  let ticketsEarned = 0;
  let trainings = 0;
  let gifts = 0;
  const count = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'tickets_earned') {
        ticketsEarned += e.amount;
        ticketsByReason[e.reason] = (ticketsByReason[e.reason] ?? 0) + e.amount;
      }
    }
  };
  const watch = (s: GameState) => {
    minMoney = Math.min(minMoney, s.money);
  };
  for (let day = 1; day <= days; day++) {
    if (p27) {
      if (dispatch(state, { type: 'claim_daily_gift', dateKey: octoberKey(day) })) gifts++;
      for (const m of state.staff) if (canTrain(state, m.id) === null && dispatch(state, { type: 'train_staff', staffId: m.id })) trainings++;
    }
    morning(state);
    count(state.events);
    state.events = [];
    watch(state);
    count(playDay(state, { onMinute: watch }));
    count(state.events);
    state.events = [];
    watch(state);
    for (let l = 2; l <= state.shopLevel; l++) if (!(l in levelDay)) levelDay[l] = day;
    if (stopAtTop && state.shopLevel >= FULL_UNLOCK_LEVEL) break;
    delete state.week?.result;
    dispatch(state, { type: 'next_day' });
  }
  return { state, levelDay, minMoney, ticketsEarned, ticketsByReason, trainings, gifts };
}

describe('P27 balance on Normal', { timeout: 120_000 }, () => {
  const plain = simulate('normal', DAY_CAP, false, true);
  const p27 = simulate('normal', RETENTION_DAYS, true, false);

  it('keeps the P20 milestones with the sample strategy and no P27 commands', () => {
    expect(plain.levelDay[2]).toBeGreaterThanOrEqual(NORMAL_LEVEL2_DAYS.min);
    expect(plain.levelDay[2]).toBeLessThanOrEqual(NORMAL_LEVEL2_DAYS.max);
    expect(plain.levelDay[FULL_UNLOCK_LEVEL]).toBeGreaterThanOrEqual(NORMAL_TOP_LEVEL_DAYS.min);
    expect(plain.levelDay[FULL_UNLOCK_LEVEL]).toBeLessThanOrEqual(NORMAL_TOP_LEVEL_DAYS.max);
  });

  it(`never goes into the red over ${RETENTION_DAYS} days with the daily gift and training`, () => {
    expect(p27.gifts).toBe(RETENTION_DAYS);
    expect(p27.trainings).toBeGreaterThan(0);
    expect(p27.minMoney).toBeGreaterThanOrEqual(0);
  });

  it(`earns a reasonable number of Tem over ${RETENTION_DAYS} days`, () => {
    expect(p27.ticketsByReason.gift).toBe(GIFT_TICKETS_28_DAYS);
    expect(p27.ticketsEarned).toBeGreaterThanOrEqual(TICKETS_28_DAYS.min);
    expect(p27.ticketsEarned).toBeLessThanOrEqual(TICKETS_28_DAYS.max);
    // Nothing is spent that was not earned.
    expect(p27.state.retention!.tickets).toBeGreaterThanOrEqual(0);
    expect(p27.state.retention!.tickets).toBeLessThanOrEqual(p27.ticketsEarned);
  });

  it('gives no XP for achievements: the same day scores the same XP with or without unlocks', () => {
    // A grown shop on the morning of a day, forked: one copy is one served
    // customer short of several tier 1s, the other already holds every tier.
    const base = createNewGame('Quán Thành Tựu', 'normal', SEED);
    for (let day = 1; day <= 3; day++) {
      morning(base);
      playDay(base);
      delete base.week?.result;
      dispatch(base, { type: 'next_day' });
    }
    morning(base);
    const unlocking = structuredClone(base);
    const r = ensureRetention(unlocking);
    r.achievements = {};
    r.lifetime = { served: 99, revenue: 4_999_999, fiveStar: 9, perfectDays: 0, threeCupWeeks: 0 };
    const holding = structuredClone(base);
    ensureRetention(holding).achievements = Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, ACHIEVEMENTS[id].tiers.length]));

    const xpBefore = base.xp;
    playDay(unlocking);
    playDay(holding);
    expect(unlocking.lastReport!.achievements?.length).toBeGreaterThan(0);
    expect(holding.lastReport!.achievements).toBeUndefined();
    expect(unlocking.retention!.tickets).toBeGreaterThan(holding.retention!.tickets);
    expect(unlocking.lastReport!.xpGained).toBe(holding.lastReport!.xpGained);
    expect(unlocking.xp).toBe(holding.xp);
    expect(unlocking.xp - xpBefore).toBe(unlocking.lastReport!.xpGained);
  });
});
