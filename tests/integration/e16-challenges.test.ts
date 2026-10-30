import { describe, expect, it } from 'vitest';
import { CHALLENGE_FIRST_WEEK, WEEK_CHALLENGE_IDS } from '../../src/sim/data/challenges';
import { MARKETING } from '../../src/sim/data/marketing';
import { getMenuItem } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, dayUnlockDay } from '../../src/sim/data/week';
import { LEVELS } from '../../src/sim/data/levels';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekDay, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeTicketCost, upgradeBlockedReason } from '../../src/sim/upgrades';
import type { GameState, UpgradeId, WeekChallengeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * E-16 week challenges over a long game: plays 20 weeks on Normal, seeds 1 and
 * 42, with the P23 strategies (a_basic, c_spend, b_steady: same hiring and
 * upgrade buying) plus the way each plays the week's challenge, and prints the
 * completion per strategy and template. Targets live in
 * src/sim/data/challenges.ts; scoring and goals are not touched for them.
 *
 * Challenge play (`chase`), done each morning while the week's challenge is active:
 * - 'none' (a_basic): ignores it.
 * - 'relaxed' (b_steady): on its Nâng cấp days (3, 6, 9, …) looks at the
 *   challenge: for sell_item it takes off the menu every other item of the
 *   same category (drink or food) until the week ends.
 * - 'eager' (c_spend): from day 1 of the week, sell_item narrows the menu the
 *   same way, and served_week and regular_visits run the cheapest campaign
 *   every morning the money leaves tonight's wages and tomorrow's restock.
 * The menu is narrowed before the restock and comes back in full on the next
 * week's first morning. Challenge Tem are spent like any other (unlike p23,
 * which sets them aside to keep its tables). The per-week table prints the
 * template's value over the whole week, not stopped at completion (measure),
 * which is what the targets are tuned against.
 */

const SEEDS = [1, 42];
const WEEKS = 20;

type Chase = 'none' | 'relaxed' | 'eager';

interface Strategy {
  hireDay?: number;
  spend: boolean;
  steady: boolean;
  chase: Chase;
}

const STEADY_VISIT_EVERY = 3;
const REVENUE_EFFECTS = ['capacity', 'ratingBonus', 'appeal', 'brewSpeed', 'coffeeBrewSpeed', 'coldBrewSpeed', 'foodBrewSpeed', 'foodAppeal', 'priceBonus'] as const;
const TOOLS = new Set<UpgradeId>(LEVELS.flatMap((l) => l.unlocks.tools));
const CHEAPEST_CAMPAIGN = [...MARKETING].sort((a, b) => a.cost - b.cost)[0]!;

/** Same pick as p23's b_steady. */
function steadyPick(id: UpgradeId): boolean {
  if (TOOLS.has(id) && dayUnlockDay('upgrade', id) > WEEK_LENGTH) return false;
  const def = UPGRADES.find((u) => u.id === id)!;
  return REVENUE_EFFECTS.some((e) => (def.effectPerLevel[e] ?? 0) > 0);
}

const STRATEGIES: Record<string, Strategy> = {
  a_basic: { spend: false, steady: false, chase: 'none' },
  c_spend: { hireDay: 1, spend: true, steady: false, chase: 'eager' },
  b_steady: { hireDay: 2, spend: false, steady: true, chase: 'relaxed' },
};

/** Menu items the strategy took off for a sell_item week, set back on the next week. */
const narrowed = new Set<string>();

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (narrowed.has(m.id)) continue;
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

function buyCheapest(state: GameState, affordable: (cost: number) => boolean, pick: (id: UpgradeId) => boolean = () => true, max = 100): void {
  for (let guard = 0; guard < max; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!pick(def.id) || !isUnlocked(state, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(state, def.id);
      if (cost === null || !affordable(cost)) continue;
      if ((nextUpgradeTicketCost(state, def.id) ?? 0) > (state.retention?.tickets ?? 0) || upgradeBlockedReason(state, def.id)) continue;
      if (best === null || cost < best.cost) best = { id: def.id, cost };
    }
    if (!best) return;
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })).toBe(true);
  }
}

/** Takes every other item of the challenge item's category off the menu. */
function narrowMenu(state: GameState, itemId: string): void {
  const category = getMenuItem(itemId as never).category;
  for (const m of state.menu) {
    if (m.id === itemId || !m.enabled || getMenuItem(m.id).category !== category) continue;
    expect(dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: false })).toBe(true);
    narrowed.add(m.id);
  }
}

function playChallenge(state: GameState, s: Strategy): void {
  const challenge = state.week?.challenge;
  if (!challenge || challenge.status !== 'active' || s.chase === 'none') return;
  if (s.chase === 'relaxed' && state.day % STEADY_VISIT_EVERY !== 0) return;
  if (challenge.id === 'sell_item' && challenge.itemId) narrowMenu(state, challenge.itemId);
}

/** Eager play on served_week and regular_visits weeks: the cheapest campaign, after the upgrades, when the money leaves the reserve. */
function runCampaign(state: GameState): void {
  const challenge = state.week?.challenge;
  if (!challenge || challenge.status !== 'active' || (challenge.id !== 'served_week' && challenge.id !== 'regular_visits')) return;
  if (state.money - reserve(state) >= CHEAPEST_CAMPAIGN.cost) dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id });
}

function morning(state: GameState, s: Strategy): void {
  if (weekDay(state) === 1) narrowed.clear();
  enableUnlocked(state);
  playChallenge(state, s);
  dispatch(state, { type: 'apply_restock' });
  if (state.day === s.hireDay) {
    const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  }
  if (s.spend) buyCheapest(state, (cost) => state.money - reserve(state) >= cost);
  if (s.steady && state.day % STEADY_VISIT_EVERY === 0) buyCheapest(state, (cost) => state.money - reserve(state) >= cost, steadyPick, 1);
  if (s.chase === 'eager') runCampaign(state);
}

interface ChallengeRow {
  week: number;
  id: WeekChallengeId;
  completed: boolean;
  /** The week's value for the template (measure), counted on every day, also after completion. */
  value: number;
  target: number;
}

interface DayValues {
  rating: number;
  served: number;
  lost: number;
  regulars: number;
  item: number;
  perfect: boolean;
}

/**
 * The week's value for the template: the count for the additive ones, the
 * lowest rating (one decimal) for stars_week, the most customers served on a
 * day without walkouts for calm_day, the days with every mission done for
 * perfect_days.
 */
function measure(id: WeekChallengeId, days: DayValues[]): number {
  const sum = (f: (d: DayValues) => number) => days.reduce((t, d) => t + f(d), 0);
  switch (id) {
    case 'regular_visits':
      return sum((d) => d.regulars);
    case 'sell_item':
      return sum((d) => d.item);
    case 'served_week':
      return sum((d) => d.served);
    case 'stars_week':
      return Math.min(...days.map((d) => d.rating));
    case 'calm_day':
      return Math.max(0, ...days.filter((d) => d.lost === 0).map((d) => d.served));
    case 'perfect_days':
      return sum((d) => (d.perfect ? 1 : 0));
  }
}

function playWeeks(seed: number, s: Strategy): { rows: ChallengeRow[]; bankrupt: boolean; minMoney: number } {
  const state = createNewGame('Quán E16', 'normal', seed);
  const rows: ChallengeRow[] = [];
  let minMoney = state.money;
  narrowed.clear();
  let days: DayValues[] = [];
  for (let day = 1; day <= WEEKS * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    morning(state, s);
    minMoney = Math.min(minMoney, state.money);
    playDay(state, { onMinute: () => (minMoney = Math.min(minMoney, state.money)) });
    const week = state.week!;
    const t = state.today;
    const item = week.challenge?.itemId;
    days.push({
      rating: Math.round(state.rating * 10) / 10,
      served: t.customersServed,
      lost: t.customersLost,
      regulars: t.regularsServed ?? 0,
      item: item ? (t.sold[item] ?? 0) : 0,
      perfect: state.missions.length > 0 && state.missions.every((m) => m.status === 'completed'),
    });
    if (!week.result) continue;
    const c = week.challenge;
    if (c) rows.push({ week: weekIndex(state), id: c.id, completed: c.status === 'completed', value: measure(c.id, days), target: c.target });
    days = [];
  }
  return { rows, bankrupt: state.bankrupt, minMoney };
}

function markdownTable(head: string[], body: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

const pct = (done: number, all: number) => (all ? `${Math.round((100 * done) / all)}%` : '-');

describe('E-16 week challenges: 20 weeks on Normal, seeds 1 and 42, a_basic/c_spend/b_steady', { timeout: 600_000 }, () => {
  const runs = new Map<string, ReturnType<typeof playWeeks>[]>();
  for (const [name, s] of Object.entries(STRATEGIES)) runs.set(name, SEEDS.map((seed) => playWeeks(seed, s)));
  const all = (name: string) => runs.get(name)!.flatMap((r) => r.rows);
  const share = (rows: ChallengeRow[]) => rows.filter((r) => r.completed).length / rows.length;

  it('prints the completion per strategy and template', () => {
    const head = ['strategy', 'all', ...WEEK_CHALLENGE_IDS];
    const body = Object.keys(STRATEGIES).map((name) => {
      const rows = all(name);
      return [
        name,
        `${rows.filter((r) => r.completed).length}/${rows.length} ${pct(rows.filter((r) => r.completed).length, rows.length)}`,
        ...WEEK_CHALLENGE_IDS.map((id) => {
          const t = rows.filter((r) => r.id === id);
          return `${t.filter((r) => r.completed).length}/${t.length}`;
        }),
      ];
    });
    console.log(`Challenges completed, weeks ${CHALLENGE_FIRST_WEEK}–${WEEKS}, seeds ${SEEDS.join(', ')}\n${markdownTable(head, body)}`);
    const detail = [...runs].flatMap(([name, perSeed]) =>
      perSeed.map((r, i) => [name, String(SEEDS[i]), ...r.rows.map((row) => `${row.id.split('_')[0]} ${row.value}${row.completed ? '✓' : ''}`)]),
    );
    console.log(`Per week\n${markdownTable(['strategy', 'seed', ...Array.from({ length: WEEKS - CHALLENGE_FIRST_WEEK + 1 }, (_, w) => `w${w + CHALLENGE_FIRST_WEEK}`)], detail)}`);
    for (const perSeed of runs.values()) for (const r of perSeed) expect(r.rows.map((row) => row.week)).toEqual(Array.from({ length: WEEKS - CHALLENGE_FIRST_WEEK + 1 }, (_, w) => w + CHALLENGE_FIRST_WEEK));
  });

  it('has b_steady complete 40–70% and c_spend 70–95% of the challenges', () => {
    expect(share(all('b_steady'))).toBeGreaterThanOrEqual(0.4);
    expect(share(all('b_steady'))).toBeLessThanOrEqual(0.7);
    expect(share(all('c_spend'))).toBeGreaterThanOrEqual(0.7);
    expect(share(all('c_spend'))).toBeLessThanOrEqual(0.95);
  });

  it('leaves no template completed every time by every strategy', () => {
    for (const id of WEEK_CHALLENGE_IDS) {
      const always = Object.keys(STRATEGIES).every((name) => {
        const t = all(name).filter((r) => r.id === id);
        return t.length > 0 && t.every((r) => r.completed);
      });
      expect(always, id).toBe(false);
    }
  });

  it('never goes bankrupt nor below zero money', () => {
    for (const [name, perSeed] of runs) {
      perSeed.forEach((r, i) => {
        expect(r.bankrupt, `${name} seed ${SEEDS[i]}`).toBe(false);
        expect(r.minMoney, `${name} seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
