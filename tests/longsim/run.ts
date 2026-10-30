import { expect } from 'vitest';
import { nextChallengeStyle } from '../../src/sim/challenges';
import { LEVELS } from '../../src/sim/data/levels';
import { MARKETING } from '../../src/sim/data/marketing';
import { getMenuItem } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, dayUnlockDay } from '../../src/sim/data/week';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekDay, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeTicketCost, upgradeBlockedReason } from '../../src/sim/upgrades';
import type { Difficulty, GameState, UpgradeId, WeekChallengeId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-19 40-week sim: the E-16 strategies (tests/integration/e16-challenges.test.ts)
 * b_steady and c_spend, with the same upgrade buying and challenge play, run
 * for 40 weeks. One row per week: cups, the goal and the week's challenge.
 * suite.ts (normal.sim.ts, easy.sim.ts) prints the table and asserts the style unlock and determinism;
 * it runs with `npm run sim:long`, not in `npm run check` (about 100 s).
 */

export const WEEKS = 40;

type Chase = 'relaxed' | 'eager';

interface Strategy {
  hireDay: number;
  spend: boolean;
  steady: boolean;
  chase: Chase;
}

export type StrategyName = 'b_steady' | 'c_spend';

export const STRATEGIES: Record<StrategyName, Strategy> = {
  c_spend: { hireDay: 1, spend: true, steady: false, chase: 'eager' },
  b_steady: { hireDay: 2, spend: false, steady: true, chase: 'relaxed' },
};

const STEADY_VISIT_EVERY = 3;
const REVENUE_EFFECTS = ['capacity', 'ratingBonus', 'appeal', 'brewSpeed', 'coffeeBrewSpeed', 'coldBrewSpeed', 'foodBrewSpeed', 'foodAppeal', 'priceBonus'] as const;
const TOOLS = new Set<UpgradeId>(LEVELS.flatMap((l) => l.unlocks.tools));
const CHEAPEST_CAMPAIGN = [...MARKETING].sort((a, b) => a.cost - b.cost)[0]!;

function steadyPick(id: UpgradeId): boolean {
  if (TOOLS.has(id) && dayUnlockDay('upgrade', id) > WEEK_LENGTH) return false;
  const def = UPGRADES.find((u) => u.id === id)!;
  return REVENUE_EFFECTS.some((e) => (def.effectPerLevel[e] ?? 0) > 0);
}

function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

function buyCheapest(state: GameState, pick: (id: UpgradeId) => boolean, max: number): void {
  for (let guard = 0; guard < max; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!pick(def.id) || !isUnlocked(state, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(state, def.id);
      if (cost === null || state.money - reserve(state) < cost) continue;
      if ((nextUpgradeTicketCost(state, def.id) ?? 0) > (state.retention?.tickets ?? 0) || upgradeBlockedReason(state, def.id)) continue;
      if (best === null || cost < best.cost) best = { id: def.id, cost };
    }
    if (!best) return;
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })).toBe(true);
  }
}

export interface WeekRow {
  week: number;
  level: number;
  cups: number;
  score: number;
  revenue: number;
  revenueTarget: number;
  profit: number;
  profitTarget: number;
  challenge: WeekChallengeId | null;
  /** The challenge's target, item and calm-day floor, for the determinism check. */
  challengeGoal: string;
  completed: boolean;
  /** Every challenge-gated style is open at the end of the week. */
  allStyles: boolean;
}

export function playWeeks(difficulty: Difficulty, seed: number, s: Strategy, weeks = WEEKS): WeekRow[] {
  const state = createNewGame('Quán E19', difficulty, seed);
  const rows: WeekRow[] = [];
  const narrowed = new Set<string>();
  const enableUnlocked = () => {
    for (const m of state.menu) {
      if (narrowed.has(m.id)) continue;
      if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
    }
  };
  const narrowMenu = (itemId: string) => {
    const category = getMenuItem(itemId as never).category;
    for (const m of state.menu) {
      if (m.id === itemId || !m.enabled || getMenuItem(m.id).category !== category) continue;
      expect(dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: false })).toBe(true);
      narrowed.add(m.id);
    }
  };
  for (let day = 1; day <= weeks * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    if (weekDay(state) === 1) narrowed.clear();
    enableUnlocked();
    const challenge = state.week?.challenge;
    const active = challenge && challenge.status === 'active';
    if (active && challenge.id === 'sell_item' && challenge.itemId && (s.chase === 'eager' || state.day % STEADY_VISIT_EVERY === 0)) narrowMenu(challenge.itemId);
    dispatch(state, { type: 'apply_restock' });
    if (state.day === s.hireDay) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
      expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
    }
    if (s.spend) buyCheapest(state, () => true, 100);
    if (s.steady && state.day % STEADY_VISIT_EVERY === 0) buyCheapest(state, steadyPick, 1);
    if (s.chase === 'eager' && active && (challenge.id === 'served_week' || challenge.id === 'regular_visits') && state.money - reserve(state) >= CHEAPEST_CAMPAIGN.cost) {
      dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id });
    }
    playDay(state);
    expect(state.bankrupt).toBe(false);
    const week = state.week!;
    const result = week.result;
    if (!result) continue;
    const c = week.challenge;
    rows.push({
      week: weekIndex(state),
      level: state.shopLevel,
      cups: result.cups,
      score: result.score,
      revenue: result.revenue,
      revenueTarget: result.revenueTarget,
      profit: result.profit ?? 0,
      profitTarget: result.profitTarget ?? 0,
      challenge: c?.id ?? null,
      challengeGoal: c ? `${c.target}/${c.itemId ?? '-'}/${c.minServed ?? '-'}` : '',
      completed: c?.status === 'completed',
      allStyles: nextChallengeStyle(state) === null,
    });
  }
  return rows;
}

export const inWeeks = (rows: WeekRow[], from: number, to: number) => rows.filter((r) => r.week >= from && r.week <= to);
export const share = (rows: WeekRow[], f: (r: WeekRow) => boolean) => (rows.length ? rows.filter(f).length / rows.length : 0);
export const pct = (x: number) => `${Math.round(100 * x)}%`;

/** First week whose end has every challenge-gated style open; null when none. */
export function allStylesWeek(rows: WeekRow[]): number | null {
  return rows.find((r) => r.allStyles)?.week ?? null;
}

/** Summary line of one run for the console. */
export function summary(name: string, rows: WeekRow[]): string {
  const late = inWeeks(rows, 21, 40);
  const challenges = (from: number, to: number) => inWeeks(rows, from, to).filter((r) => r.challenge);
  const done = (from: number, to: number) => share(challenges(from, to), (r) => r.completed);
  return [
    name,
    `2+cups ${pct(share(late, (r) => r.cups >= 2))}`,
    `3cups ${pct(share(late, (r) => r.cups === 3))}`,
    `ch5-20 ${pct(done(5, 20))}`,
    `ch21-40 ${pct(done(21, 40))}`,
    `styles@w${allStylesWeek(rows) ?? '-'}`,
    `lvl ${rows.at(-1)?.level}`,
    `cups ${rows.map((r) => r.cups).join('')}`,
  ].join(' | ');
}
