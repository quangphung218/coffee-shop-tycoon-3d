import { describe, expect, it } from 'vitest';
import { MARKETING } from '../../src/sim/data/marketing';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, weekReward } from '../../src/sim/data/week';
import { totalWages } from '../../src/sim/economy';
import { MAX_SHOP_LEVEL, maxLevelBonus } from '../../src/sim/data/levels';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { upgradeLevel } from '../../src/sim/upgrades';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * P23 long-run economy: plays 4 weeks (28 days) per difficulty × strategy ×
 * seed and prints one row per week. Asserts the hard invariants (money never
 * below zero, same seed → same numbers) and the two P23 targets: the spender
 * still has an upgrade to buy at the end of week 3, and the basic strategy
 * cannot take 3 cups in week 2. Read in docs/reports/p23-long-economy.md.
 */

const SEEDS = [1, 42, 777];
const WEEKS = 4;
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const CHEAPEST_CAMPAIGN = [...MARKETING].sort((a, b) => a.cost - b.cost)[0]!;

interface Strategy {
  /** Hire one barista on the morning of day 1. */
  hire: boolean;
  /** Every morning buy the cheapest open upgrade or tool, again and again, while the money keeps tonight's wages and tomorrow's restock. */
  spend: boolean;
  /** Run the cheapest campaign on odd week days when it is affordable. */
  marketing: boolean;
}

/** The P22 strategies a, c and e, with c and e spending on every upgrade (not only tools) over the long run. */
const STRATEGIES: Record<string, Strategy> = {
  a_basic: { hire: false, spend: false, marketing: false },
  c_spend: { hire: true, spend: true, marketing: false },
  e_marketing: { hire: true, spend: true, marketing: true },
};

interface WeekRow {
  week: number;
  revenue: number;
  /** Sum of the daily profits (revenue less ingredients, wages and marketing); upgrades are not in it. */
  profit: number;
  /** Upgrades bought over the week. */
  spent: number;
  /** Cup reward paid at the end of the week. */
  reward: number;
  endMoney: number;
  minMoney: number;
  level: number;
  xp: number;
  /** Open upgrades below their cap at the shop's level at the end of the week: can be bought now. */
  buyable: number;
  /** Upgrades below their cap at the top shop level: still to be bought, now or once a level opens more. */
  left: number;
  stars: number;
  score: number;
  cups: number;
}

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

/** Tonight's wages plus tomorrow's restock: what the suggestion would cost once today's stock is used up. */
function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + autoRestockSuggestion(drained).totalCost;
}

function buyCheapest(state: GameState, track: () => void): void {
  for (let guard = 0; guard < 100; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!isUnlocked(state, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(state, def.id);
      if (cost === null || state.money - reserve(state) < cost) continue;
      if (best === null || cost < best.cost) best = { id: def.id, cost };
    }
    if (!best) return;
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })).toBe(true);
    track();
  }
}

function buyable(state: GameState): number {
  return UPGRADES.filter((u) => isUnlocked(state, 'upgrade', u.id) && nextUpgradeCost(state, u.id) !== null).length;
}

function left(state: GameState): number {
  return UPGRADES.filter((u) => upgradeLevel(state, u.id) < u.maxLevel + maxLevelBonus(MAX_SHOP_LEVEL, u.id)).length;
}

function morning(state: GameState, s: Strategy, weekDay: number, track: () => void): void {
  enableUnlocked(state);
  dispatch(state, { type: 'apply_restock' });
  track();
  if (s.hire && state.day === 1) {
    const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  }
  if (s.marketing && weekDay % 2 === 1 && state.money >= CHEAPEST_CAMPAIGN.cost + reserve(state)) {
    expect(dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id })).toBe(true);
    track();
  }
  if (s.spend) buyCheapest(state, track);
}

function playWeeks(difficulty: Difficulty, seed: number, s: Strategy): WeekRow[] {
  const state = createNewGame('Quán P23', difficulty, seed);
  const rows: WeekRow[] = [];
  let minMoney = state.money;
  const track = () => {
    minMoney = Math.min(minMoney, state.money);
  };
  let spent = 0;
  for (let day = 1; day <= WEEKS * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    const weekDay = day - state.week!.startedDay + 1;
    morning(state, s, weekDay, track);
    playDay(state, { onMinute: track });
    track();
    spent += state.today.upgradeCost;
    const result = state.week!.result;
    if (!result) continue;
    const summary = state.week!.archive!.at(-1)!;
    rows.push({
      week: weekIndex(state),
      revenue: summary.revenue,
      profit: summary.profit,
      spent,
      reward: weekReward(difficulty, result.cups),
      endMoney: state.money,
      minMoney,
      level: state.shopLevel,
      xp: state.xp,
      buyable: buyable(state),
      left: left(state),
      stars: result.stars,
      score: result.score,
      cups: result.cups,
    });
    spent = 0;
  }
  return rows;
}

const k = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;

function markdownTable(head: string[], body: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

describe('P23 long run: 28 days × 3 difficulties × strategies a/c/e', { timeout: 600_000 }, () => {
  const runs = new Map<string, WeekRow[][]>();
  for (const d of DIFFICULTIES) {
    for (const [name, s] of Object.entries(STRATEGIES)) runs.set(`${d}/${name}`, SEEDS.map((seed) => playWeeks(d, seed, s)));
  }

  it('prints a table per week (mean of the seeds) and per seed', () => {
    const head = ['difficulty', 'strategy', 'week', 'revenue', 'profit', 'spent', 'reward', 'endMoney', 'level', 'xp', 'buyable', 'left', 'stars', 'score', 'cups'];
    const meanBody: string[][] = [];
    const seedBody: string[][] = [];
    for (const [key, perSeed] of runs) {
      for (let w = 0; w < WEEKS; w++) {
        const rows = perSeed.map((r) => r[w]!);
        const m = (f: (r: WeekRow) => number) => mean(rows.map(f));
        meanBody.push([
          ...key.split('/'),
          String(w + 1),
          k(m((r) => r.revenue)),
          k(m((r) => r.profit)),
          k(m((r) => r.spent)),
          k(m((r) => r.reward)),
          k(m((r) => r.endMoney)),
          m((r) => r.level).toFixed(1),
          m((r) => r.xp).toFixed(0),
          m((r) => r.buyable).toFixed(1),
          m((r) => r.left).toFixed(1),
          m((r) => r.stars).toFixed(2),
          m((r) => r.score).toFixed(1),
          m((r) => r.cups).toFixed(2),
        ]);
        perSeed.forEach((r, i) => {
          const row = r[w]!;
          seedBody.push([
            ...key.split('/'),
            String(SEEDS[i]),
            String(row.week),
            k(row.revenue),
            k(row.endMoney),
            String(row.level),
            String(row.buyable),
            String(row.left),
            row.stars.toFixed(1),
            String(row.score),
            String(row.cups),
          ]);
        });
      }
    }
    console.log(`Mean of seeds ${SEEDS.join(', ')}\n${markdownTable(head, meanBody)}`);
    console.log(`Per seed\n${markdownTable(['difficulty', 'strategy', 'seed', 'week', 'revenue', 'endMoney', 'level', 'buyable', 'left', 'stars', 'score', 'cups'], seedBody)}`);
    for (const perSeed of runs.values()) for (const rows of perSeed) expect(rows.map((r) => r.week)).toEqual([1, 2, 3, 4]);
  });

  it('never lets the money drop below zero', () => {
    for (const [key, perSeed] of runs) {
      perSeed.forEach((rows, i) => expect(Math.min(...rows.map((r) => r.minMoney)), `${key} seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(0));
    }
  });

  it('gives the same numbers when a seed is played again', () => {
    for (const d of DIFFICULTIES) {
      for (const [name, s] of Object.entries(STRATEGIES)) {
        expect(playWeeks(d, SEEDS[0]!, s), `${d}/${name}`).toEqual(runs.get(`${d}/${name}`)![0]);
      }
    }
  });

  it('leaves the spender at least one upgrade below its top level at the end of week 3', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => expect(rows[2]!.left, `${d} seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(1));
    }
  });

  it('keeps 3 cups out of reach of the basic strategy in week 2', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/a_basic`)!.forEach((rows, i) => expect(rows[1]!.cups, `${d} seed ${SEEDS[i]}`).toBeLessThan(3));
    }
  });
});
