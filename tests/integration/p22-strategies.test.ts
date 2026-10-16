import { describe, expect, it } from 'vitest';
import { MARKETING } from '../../src/sim/data/marketing';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState, ToolId } from '../../src/sim/types';
import { todayPlan } from '../../src/sim/week';
import { cupsSold, playDay, unlockedIds } from './helpers';

/**
 * P22 economy audit: plays a 7-day week per difficulty × strategy × seed and
 * prints the averages. Only hard invariants are asserted (money never below
 * zero, same seed → same numbers); balance is read from the printed table
 * (docs/reports/p22-economy.md).
 */

const SEEDS = [1, 42, 777, 2024, 31337, 9001];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const TOOLS: readonly ToolId[] = ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'];
const CHEAPEST_CAMPAIGN = [...MARKETING].sort((a, b) => a.cost - b.cost)[0]!;

interface Strategy {
  /** Hire one barista on the morning of day 1. */
  hire: boolean;
  /** Buy level 1 of each tool from the morning it opens, once the money covers it and tonight's wages. */
  tools: boolean;
  /** Price policy 'high' from day 1. */
  highPrice: boolean;
  /** Run the cheapest campaign on days 1, 3, 5 and 7. */
  marketing: boolean;
}

const STRATEGIES: Record<string, Strategy> = {
  a_basic: { hire: false, tools: false, highPrice: false, marketing: false },
  b_hire: { hire: true, tools: false, highPrice: false, marketing: false },
  c_tools: { hire: true, tools: true, highPrice: false, marketing: false },
  d_high_price: { hire: true, tools: true, highPrice: true, marketing: false },
  e_marketing: { hire: true, tools: true, highPrice: false, marketing: true },
};

interface WeekRow {
  revenue: number;
  /** revenue − ingredient cost of what was used − wages − upgrades and marketing bought. */
  profit: number;
  wages: number;
  /** Upgrades and marketing bought over the week. */
  spent: number;
  minMoney: number;
  endMoney: number;
  cups: number;
  /** Customers who left angry, as a 0..100 share of arrivals. */
  abandonPct: number;
  stars: number;
  score: number;
  trophies: number;
  /** Week days with nothing new to decide: no unlock that morning and no day event. */
  flatDays: number;
  /** Week days (1..7) on which a tool was bought. */
  toolDays: number[];
}

function playMorning(state: GameState, s: Strategy, weekDay: number, track: () => void): void {
  if (s.highPrice && weekDay === 1) expect(dispatch(state, { type: 'set_policy', policy: 'price', level: 'high' })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  track();
  if (s.hire && weekDay === 1) {
    const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  }
  if (s.marketing && weekDay % 2 === 1 && state.money >= CHEAPEST_CAMPAIGN.cost + totalWages(state)) {
    expect(dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id })).toBe(true);
    track();
  }
}

function buyTools(state: GameState, toolDays: number[], weekDay: number, track: () => void): void {
  for (const id of TOOLS) {
    if ((state.upgrades[id] ?? 0) > 0 || !isUnlocked(state, 'upgrade', id)) continue;
    const cost = nextUpgradeCost(state, id);
    if (cost === null || state.money - cost < totalWages(state)) continue;
    expect(dispatch(state, { type: 'buy_upgrade', upgradeId: id })).toBe(true);
    toolDays.push(weekDay);
    track();
  }
}

function playWeek(difficulty: Difficulty, seed: number, s: Strategy): WeekRow {
  const state = createNewGame('Quán P22', difficulty, seed);
  let minMoney = state.money;
  const track = () => {
    minMoney = Math.min(minMoney, state.money);
  };
  let revenue = 0;
  let cogs = 0;
  let wages = 0;
  let spent = 0;
  let cups = 0;
  let arrived = 0;
  let lost = 0;
  let flatDays = 0;
  const toolDays: number[] = [];
  let before = new Set<string>();
  for (let weekDay = 1; weekDay <= WEEK_LENGTH; weekDay++) {
    if (weekDay > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    const now = unlockedIds(state);
    const opened = [...now].some((id) => !before.has(id));
    before = now;
    if (!opened && todayPlan(state)!.event === 'none') flatDays++;
    // Hire before buying, so the tool budget keeps tonight's wage in hand.
    playMorning(state, s, weekDay, track);
    if (s.tools) buyTools(state, toolDays, weekDay, track);
    playDay(state, { onMinute: track });
    track();
    const t = state.today;
    revenue += t.revenue;
    cogs += t.ingredientCost;
    wages += t.wages;
    spent += t.upgradeCost + t.marketingCost;
    cups += cupsSold(t);
    arrived += t.customersArrived;
    lost += t.customersLost;
  }
  const result = state.week!.result!;
  expect(result).toBeTruthy();
  return {
    revenue,
    profit: revenue - cogs - wages - spent,
    wages,
    spent,
    minMoney,
    endMoney: state.money,
    cups,
    abandonPct: arrived > 0 ? (lost / arrived) * 100 : 0,
    stars: result.stars,
    score: result.score,
    trophies: result.cups,
    flatDays,
    toolDays,
  };
}

const NUMERIC = ['revenue', 'profit', 'wages', 'spent', 'minMoney', 'endMoney', 'cups', 'abandonPct', 'stars', 'score', 'trophies', 'flatDays'] as const;
type NumericKey = (typeof NUMERIC)[number];

function mean(rows: readonly WeekRow[], key: NumericKey): number {
  return rows.reduce((s, r) => s + r[key], 0) / rows.length;
}

const k = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;
const FORMAT: Record<NumericKey, (v: number) => string> = {
  revenue: k,
  profit: k,
  wages: k,
  spent: k,
  minMoney: k,
  endMoney: k,
  cups: (v) => v.toFixed(0),
  abandonPct: (v) => `${v.toFixed(1)}%`,
  stars: (v) => v.toFixed(2),
  score: (v) => v.toFixed(1),
  trophies: (v) => v.toFixed(2),
  flatDays: (v) => v.toFixed(1),
};

const SEED_HEAD = ['difficulty', 'strategy', 'seed', 'revenue', 'profit', 'minMoney', 'cups', 'abandon', 'stars', 'score', 'trophies', 'flatDays', 'toolDays'];

function markdownTable(head: string[], body: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

describe('P22 strategies: 3 difficulties × 5 strategies × 6 seeds', { timeout: 300_000 }, () => {
  const runs = new Map<string, WeekRow[]>();
  for (const d of DIFFICULTIES) {
    for (const [name, s] of Object.entries(STRATEGIES)) runs.set(`${d}/${name}`, SEEDS.map((seed) => playWeek(d, seed, s)));
  }

  it('prints the mean and per-seed tables', () => {
    const meanBody = [...runs].map(([key, rows]) => [...key.split('/'), ...NUMERIC.map((n) => FORMAT[n](mean(rows, n)))]);
    console.log(`Mean of seeds ${SEEDS.join(', ')}\n${markdownTable(['difficulty', 'strategy', ...NUMERIC], meanBody)}`);
    console.log(`Per seed\n${markdownTable(SEED_HEAD, seedRows())}`);
    expect(meanBody).toHaveLength(DIFFICULTIES.length * Object.keys(STRATEGIES).length);
  });

  const seedRows = () => [...runs].flatMap(([key, rows]) =>
    rows.map((r, i) => [
      ...key.split('/'),
      String(SEEDS[i]),
      k(r.revenue),
      k(r.profit),
      k(r.minMoney),
      String(r.cups),
      `${r.abandonPct.toFixed(1)}%`,
      r.stars.toFixed(2),
      String(r.score),
      String(r.trophies),
      String(r.flatDays),
      r.toolDays.join(',') || '-',
    ]),
  );

  it('never lets the money drop below zero', () => {
    for (const [key, rows] of runs) rows.forEach((r, i) => expect(r.minMoney, `${key} seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(0));
  });

  it('gives the same numbers when a seed is played again', () => {
    for (const d of DIFFICULTIES) {
      for (const [name, s] of Object.entries(STRATEGIES)) {
        SEEDS.forEach((seed, i) => expect(playWeek(d, seed, s), `${d}/${name} seed ${seed}`).toEqual(runs.get(`${d}/${name}`)![i]));
      }
    }
  });
});
