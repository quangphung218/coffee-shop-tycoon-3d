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
import { policyLevel } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeTicketCost, upgradeBlockedReason } from '../../src/sim/upgrades';
import { totalUpgradeLevels } from '../../src/sim/week';
import type { Difficulty, GameState, StaffRole, UpgradeId, WeekChallengeId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/**
 * E-19 40-week sim: the E-16 strategies (tests/integration/e16-challenges.test.ts)
 * b_steady and c_spend, with the same upgrade buying and challenge play, run
 * for 40 weeks. One row per week: cups, the goal and the week's challenge.
 * E-21 adds d_manage (c_spend with a full team of 4 and high prices from
 * week 9) and b_steady2 (b_steady with a second hire); the E-16 bots leave
 * the new fields unset and play exactly as before.
 * suite.ts (the *.sim.ts files) prints the table and asserts the style unlock and determinism;
 * it runs with `npm run sim:long`, not in `npm run check`.
 */

export const WEEKS = 40;

type Chase = 'relaxed' | 'eager';

interface Strategy {
  hireDay: number;
  spend: boolean;
  steady: boolean;
  chase: Chase;
  /** Team size to grow to after the first hire, one role each from HIRE_ROLES; unset keeps the single barista. */
  staff?: number;
  /** Week from which the price policy is high; unset keeps standard prices. */
  highPriceFromWeek?: number;
}

export type StrategyName = 'b_steady' | 'c_spend' | 'd_manage' | 'b_steady2';

export const STRATEGIES: Record<StrategyName, Strategy> = {
  c_spend: { hireDay: 1, spend: true, steady: false, chase: 'eager' },
  b_steady: { hireDay: 2, spend: false, steady: true, chase: 'relaxed' },
  d_manage: { hireDay: 1, spend: true, steady: false, chase: 'eager', staff: 4, highPriceFromWeek: 9 },
  b_steady2: { hireDay: 2, spend: false, steady: true, chase: 'relaxed', staff: 2 },
};

/** Roles of the team in hiring order: the first hire is the barista. */
const HIRE_ROLES: readonly StaffRole[] = ['barista', 'server', 'cleaner', 'marketer'];
/** An extra hire waits until the spare money covers this many days of the candidate's wage. */
const HIRE_BUFFER_DAYS = WEEK_LENGTH;

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
  /** Total upgrade levels at the week's start, before its first purchase (the SIZE_GOAL row). */
  startLevels: number;
  /** The goal came from SIZE_GOAL (it carries its own profit target). */
  sized: boolean;
}

/** Weekly rows of a run; bankruptDay is set when the shop went bankrupt and the run stopped there. */
export type WeekRows = WeekRow[] & { bankruptDay?: number };

export function playWeeks(difficulty: Difficulty, seed: number, s: Strategy, weeks = WEEKS): WeekRows {
  const state = createNewGame('Quán E19', difficulty, seed);
  const rows: WeekRows = [];
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
  let startLevels = 0;
  for (let day = 1; day <= weeks * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    if (weekDay(state) === 1) {
      narrowed.clear();
      startLevels = totalUpgradeLevels(state);
    }
    enableUnlocked();
    const challenge = state.week?.challenge;
    const active = challenge && challenge.status === 'active';
    if (active && challenge.id === 'sell_item' && challenge.itemId && (s.chase === 'eager' || state.day % STEADY_VISIT_EVERY === 0)) narrowMenu(challenge.itemId);
    dispatch(state, { type: 'apply_restock' });
    if (state.day === s.hireDay) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
      expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
    }
    if (s.staff && state.day > s.hireDay && state.staff.length < Math.min(s.staff, HIRE_ROLES.length)) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0];
      if (pick && state.money - reserve(state) >= pick.wagePerDay * HIRE_BUFFER_DAYS) {
        expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: HIRE_ROLES[state.staff.length]! })).toBe(true);
      }
    }
    if (s.highPriceFromWeek && weekIndex(state) >= s.highPriceFromWeek && policyLevel(state, 'price') !== 'high') {
      expect(dispatch(state, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
    }
    if (s.spend) buyCheapest(state, () => true, 100);
    if (s.steady && state.day % STEADY_VISIT_EVERY === 0) buyCheapest(state, steadyPick, 1);
    if (s.chase === 'eager' && active && (challenge.id === 'served_week' || challenge.id === 'regular_visits') && state.money - reserve(state) >= CHEAPEST_CAMPAIGN.cost) {
      dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id });
    }
    playDay(state);
    if (state.bankrupt) {
      rows.bankruptDay = state.day;
      break;
    }
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
      startLevels,
      sized: week.goal.profit !== undefined,
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

export const avgScore = (rows: WeekRow[]) => (rows.length ? rows.reduce((sum, r) => sum + r.score, 0) / rows.length : 0);

/** Summary line of one run for the console. */
export function summary(name: string, rows: WeekRows): string {
  const late = inWeeks(rows, 21, 40);
  const challenges = (from: number, to: number) => inWeeks(rows, from, to).filter((r) => r.challenge);
  const done = (from: number, to: number) => share(challenges(from, to), (r) => r.completed);
  return [
    name,
    `2+cups ${pct(share(late, (r) => r.cups >= 2))}`,
    `=2cups ${pct(share(late, (r) => r.cups === 2))}`,
    `3cups ${pct(share(late, (r) => r.cups === 3))}`,
    `<2cups ${pct(share(late, (r) => r.cups < 2))}`,
    `avg21-40 ${avgScore(late).toFixed(1)}`,
    `ch5-20 ${pct(done(5, 20))}`,
    `ch21-40 ${pct(done(21, 40))}`,
    `styles@w${allStylesWeek(rows) ?? '-'}`,
    `lvl ${rows.at(-1)?.level}`,
    `avg score ${avgScore(rows).toFixed(1)}`,
    ...(rows.bankruptDay ? [`bankrupt d${rows.bankruptDay}`] : []),
    `cups ${rows.map((r) => r.cups).join('')}`,
  ].join(' | ');
}
