import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/sim/data/levels';
import { MILESTONE_VISITS, REGULAR_BOOK } from '../../src/sim/data/regularMilestones';
import { REGULARS } from '../../src/sim/data/regulars';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, dayUnlockDay } from '../../src/sim/data/week';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeTicketCost, upgradeBlockedReason } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * E-18 Sổ khách quen over a long game: plays 20 weeks on Normal, seeds 1 and
 * 42, as p23's b_steady (one barista hired on day 2, Standard price, no
 * marketing, one revenue upgrade every 3 days), and records each
 * 'regular_milestone' with its week. The thresholds in
 * src/sim/data/regularMilestones.ts are tuned so the last regular's
 * milestone 3 lands in weeks 12–20; visits, customers and scoring are not
 * touched for them. Milestone Tem are spent like any other here.
 */

const SEEDS = [1, 42];
const WEEKS = 20;
const STEADY_VISIT_EVERY = 3;
const REVENUE_EFFECTS = ['capacity', 'ratingBonus', 'appeal', 'brewSpeed', 'coffeeBrewSpeed', 'coldBrewSpeed', 'foodBrewSpeed', 'foodAppeal', 'priceBonus'] as const;
const TOOLS = new Set<UpgradeId>(LEVELS.flatMap((l) => l.unlocks.tools));

/** Same pick as p23's b_steady. */
function steadyPick(id: UpgradeId): boolean {
  if (TOOLS.has(id) && dayUnlockDay('upgrade', id) > WEEK_LENGTH) return false;
  const def = UPGRADES.find((u) => u.id === id)!;
  return REVENUE_EFFECTS.some((e) => (def.effectPerLevel[e] ?? 0) > 0);
}

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

/** b_steady's Nâng cấp visit: the cheapest open revenue item that keeps tonight's wages and tomorrow's restock. */
function steadyBuy(state: GameState): void {
  let best: { id: UpgradeId; cost: number } | null = null;
  for (const def of UPGRADES) {
    if (!steadyPick(def.id) || !isUnlocked(state, 'upgrade', def.id)) continue;
    const cost = nextUpgradeCost(state, def.id);
    if (cost === null || state.money - reserve(state) < cost) continue;
    if ((nextUpgradeTicketCost(state, def.id) ?? 0) > (state.retention?.tickets ?? 0) || upgradeBlockedReason(state, def.id)) continue;
    if (best === null || cost < best.cost) best = { id: def.id, cost };
  }
  if (best) expect(dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })).toBe(true);
}

interface Reached {
  regularId: string;
  milestone: number;
  day: number;
  week: number;
  tickets: number;
}

interface Run {
  reached: Reached[];
  /** Visits per regular at the end of each week. */
  visits: Record<string, number>[];
  /** Tem paid by 'tickets_earned' with reason 'regular_milestone'. */
  tem: number;
}

function play(seed: number): Run {
  const state = createNewGame('Quán E18', 'normal', seed);
  const run: Run = { reached: [], visits: [], tem: 0 };
  for (let day = 1; day <= WEEKS * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    enableUnlocked(state);
    dispatch(state, { type: 'apply_restock' });
    if (day === 2) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
      expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
    }
    if (day % STEADY_VISIT_EVERY === 0) steadyBuy(state);
    for (const e of playDay(state)) {
      if (e.type === 'regular_milestone') run.reached.push({ regularId: e.regularId, milestone: e.milestone, day, week: weekIndex(state), tickets: e.tickets });
      if (e.type === 'tickets_earned' && e.reason === 'regular_milestone') run.tem += e.amount;
    }
    if (day % WEEK_LENGTH === 0) run.visits.push(Object.fromEntries(REGULARS.map((r) => [r.id, state.regulars?.[r.id]?.visits ?? 0])));
  }
  return run;
}

describe('E-18 regular milestones: 20 weeks, Normal, b_steady, seeds 1 and 42', { timeout: 600_000 }, () => {
  const runs = SEEDS.map(play);

  it('prints the visits per regular per week and the milestone weeks', () => {
    for (const [i, run] of runs.entries()) {
      const head = ['week', ...REGULARS.map((r) => r.id)];
      const body = run.visits.map((v, w) => [String(w + 1), ...REGULARS.map((r) => String(v[r.id]))]);
      const table = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
      const third = run.reached.filter((r) => r.milestone === 3).map((r) => `${r.regularId}@w${r.week}`);
      console.log(`seed ${SEEDS[i]} (milestones at ${MILESTONE_VISITS.join('/')})\n${table}\nmilestone 3: ${third.join(', ')}\nTem: ${run.tem}`);
    }
  });

  it('reaches every milestone of every regular once, the last regular’s milestone 3 in weeks 12–20', () => {
    for (const [i, run] of runs.entries()) {
      expect(run.reached, `seed ${SEEDS[i]}`).toHaveLength(REGULAR_BOOK.length * 3);
      const keys = new Set(run.reached.map((r) => `${r.regularId}:${r.milestone}`));
      expect(keys.size, `seed ${SEEDS[i]}`).toBe(REGULAR_BOOK.length * 3);
      const last = run.reached.filter((r) => r.milestone === 3).at(-1)!;
      expect(last.week, `seed ${SEEDS[i]} last ${last.regularId}`).toBeGreaterThanOrEqual(12);
      expect(last.week, `seed ${SEEDS[i]} last ${last.regularId}`).toBeLessThanOrEqual(20);
    }
  });

  it('pays the milestone Tem once per milestone', () => {
    for (const run of runs) expect(run.tem).toBe(run.reached.reduce((s, r) => s + r.tickets, 0));
  });

  it('gives the same milestone order when a seed is played again', () => {
    for (const [i, seed] of SEEDS.entries()) expect(play(seed).reached).toEqual(runs[i]!.reached);
  });
});
