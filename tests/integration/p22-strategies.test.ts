import { describe, expect, it } from 'vitest';
import { DIFFICULTIES as DIFFICULTY_DEFS } from '../../src/sim/data/difficulty';
import { MARKETING } from '../../src/sim/data/marketing';
import { WEEK_GOALS, WEEK_LENGTH } from '../../src/sim/data/week';
import { totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState, ToolId } from '../../src/sim/types';
import { todayPlan } from '../../src/sim/week';
import { cupsSold, playDay, unlockedIds } from './helpers';

/**
 * P22 economy audit: plays a 7-day week per difficulty × strategy × seed and
 * prints the averages. Asserted: same seed → same numbers, money pressure
 * (sensible play a–e never goes bankrupt and never below zero on Easy, but
 * comes near the floor on Hard; bad play f goes bankrupt on at least half the
 * Normal and Hard seeds), and the week score telling play apart (profit counts, Hard is
 * harder than Normal, high price beats tools-only on some seeds but not all);
 * the rest of the balance is read from the printed table
 * (docs/reports/p22-economy.md).
 */

const SEEDS = [1, 42, 777, 2024, 31337, 9001];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const TOOLS: readonly ToolId[] = ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'];
const CHEAPEST_CAMPAIGN = [...MARKETING].sort((a, b) => a.cost - b.cost)[0]!;
/** Profit lead over the same seed that counts as clearly more profitable. */
const CLEAR_PROFIT_LEAD = 1_500_000;

interface Strategy {
  /** Baristas hired on the morning of day 1: none, the cheapest candidate, or every candidate the team has room for. */
  hire: 'none' | 'one' | 'all';
  /**
   * 'level1' buys level 1 of each tool from the morning it opens, once the
   * money covers it and tonight's wages; 'all' buys every level of every open
   * tool the money covers, keeping nothing back for wages and rent.
   */
  tools: 'none' | 'level1' | 'all';
  /** Price policy from day 1. */
  price: 'standard' | 'high' | 'low';
  /**
   * 'odd' runs the cheapest campaign on days 1, 3, 5 and 7 when it leaves
   * tonight's wages; 'daily' starts every campaign the money covers each morning.
   */
  marketing: 'none' | 'odd' | 'daily';
}

/** a–e are sensible play; f ('chơi tồi') plays badly. */
const STRATEGIES: Record<string, Strategy> = {
  a_basic: { hire: 'none', tools: 'none', price: 'standard', marketing: 'none' },
  b_hire: { hire: 'one', tools: 'none', price: 'standard', marketing: 'none' },
  c_tools: { hire: 'one', tools: 'level1', price: 'standard', marketing: 'none' },
  d_high_price: { hire: 'one', tools: 'level1', price: 'high', marketing: 'none' },
  e_marketing: { hire: 'one', tools: 'level1', price: 'standard', marketing: 'odd' },
  f_bad: { hire: 'all', tools: 'all', price: 'low', marketing: 'daily' },
};
const SENSIBLE = ['a_basic', 'b_hire', 'c_tools', 'd_high_price', 'e_marketing'];
const BAD = 'f_bad';
/** On Hard, some a–e strategy's lowest money falls below this share of the starting money. */
const HARD_LOW_SHARE = 0.3;
/** a–e games with 3 cups per difficulty after E-03, before rent; rent and WEEK_PROFIT_SHARE keep them within ±5. */
const THREE_CUPS_E03: Readonly<Record<Difficulty, number>> = { easy: 16, normal: 7, hard: 1 };

interface WeekRow {
  revenue: number;
  /** revenue − ingredient cost of what was used − wages − rent − upgrades and marketing bought. */
  profit: number;
  wages: number;
  rent: number;
  /** Upgrades and marketing bought over the week. */
  spent: number;
  minMoney: number;
  endMoney: number;
  /** The shop went bankrupt; the week stops that evening. */
  bankrupt: boolean;
  /** Days played, the bankrupt day included. */
  days: number;
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
  if (s.price !== 'standard' && weekDay === 1) expect(dispatch(state, { type: 'set_policy', policy: 'price', level: s.price })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  track();
  if (s.hire === 'one' && weekDay === 1) {
    const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  }
  if (s.hire === 'all' && weekDay === 1) {
    // Stops being accepted once the team is full.
    for (const c of [...state.candidates]) dispatch(state, { type: 'hire_staff', candidateId: c.id, role: 'barista' });
  }
  if (s.marketing === 'odd' && weekDay % 2 === 1 && state.money >= CHEAPEST_CAMPAIGN.cost + totalWages(state)) {
    expect(dispatch(state, { type: 'start_campaign', campaignId: CHEAPEST_CAMPAIGN.id })).toBe(true);
    track();
  }
  if (s.marketing === 'daily') {
    for (const c of [...MARKETING].sort((a, b) => b.cost - a.cost)) {
      if (state.money >= c.cost) dispatch(state, { type: 'start_campaign', campaignId: c.id });
    }
    track();
  }
}

function buyTools(state: GameState, s: Strategy, toolDays: number[], weekDay: number, track: () => void): void {
  for (const id of TOOLS) {
    if (!isUnlocked(state, 'upgrade', id) || (s.tools === 'level1' && (state.upgrades[id] ?? 0) > 0)) continue;
    const reserve = s.tools === 'all' ? 0 : totalWages(state);
    for (let cost = nextUpgradeCost(state, id); cost !== null && state.money - cost >= reserve; cost = nextUpgradeCost(state, id)) {
      expect(dispatch(state, { type: 'buy_upgrade', upgradeId: id })).toBe(true);
      toolDays.push(weekDay);
      track();
      if (s.tools === 'level1') break;
    }
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
  let rent = 0;
  let spent = 0;
  let cups = 0;
  let arrived = 0;
  let lost = 0;
  let flatDays = 0;
  const toolDays: number[] = [];
  let before = new Set<string>();
  let days = 0;
  for (let weekDay = 1; weekDay <= WEEK_LENGTH && !state.bankrupt; weekDay++) {
    days = weekDay;
    if (weekDay > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    const now = unlockedIds(state);
    const opened = [...now].some((id) => !before.has(id));
    before = now;
    if (!opened && todayPlan(state)!.event === 'none') flatDays++;
    // Hire before buying, so the tool budget keeps tonight's wage in hand.
    playMorning(state, s, weekDay, track);
    if (s.tools !== 'none') buyTools(state, s, toolDays, weekDay, track);
    playDay(state, { onMinute: track });
    track();
    const t = state.today;
    revenue += t.revenue;
    cogs += t.ingredientCost;
    wages += t.wages;
    rent += t.rent ?? 0;
    spent += t.upgradeCost + t.marketingCost;
    cups += cupsSold(t);
    arrived += t.customersArrived;
    lost += t.customersLost;
  }
  // A bankrupt run never reaches the week score: it counts as 0 points and no cups.
  const result = state.bankrupt ? { stars: 0, score: 0, cups: 0 } : state.week!.result!;
  expect(result).toBeTruthy();
  return {
    revenue,
    profit: revenue - cogs - wages - rent - spent,
    wages,
    rent,
    spent,
    minMoney,
    endMoney: state.money,
    bankrupt: state.bankrupt,
    days,
    cups,
    abandonPct: arrived > 0 ? (lost / arrived) * 100 : 0,
    stars: result.stars,
    score: result.score,
    trophies: result.cups,
    flatDays,
    toolDays,
  };
}

const NUMERIC = ['revenue', 'profit', 'wages', 'rent', 'spent', 'minMoney', 'endMoney', 'cups', 'abandonPct', 'stars', 'score', 'trophies', 'flatDays'] as const;
type NumericKey = (typeof NUMERIC)[number];

function mean(rows: readonly WeekRow[], key: NumericKey): number {
  return rows.reduce((s, r) => s + r[key], 0) / rows.length;
}

const k = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}k`;
const FORMAT: Record<NumericKey, (v: number) => string> = {
  revenue: k,
  profit: k,
  wages: k,
  rent: k,
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

const SEED_HEAD = ['difficulty', 'strategy', 'seed', 'revenue', 'profit', 'minMoney', 'cups', 'abandon', 'stars', 'score', 'trophies', 'flatDays', 'toolDays', 'endMoney', 'bankrupt'];

function markdownTable(head: string[], body: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

describe('P22 strategies: 3 difficulties × 6 strategies × 6 seeds', { timeout: 300_000 }, () => {
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
      k(r.endMoney),
      r.bankrupt ? `day ${r.days}` : '-',
    ]),
  );

  it('never bankrupts a–e on any difficulty', () => {
    for (const d of DIFFICULTIES) {
      for (const name of SENSIBLE) runs.get(`${d}/${name}`)!.forEach((r, i) => expect(r.bankrupt, `${d}/${name} seed ${SEEDS[i]}`).toBe(false));
    }
  });

  it('never lets a–e money drop below zero on Easy', () => {
    for (const name of SENSIBLE) runs.get(`easy/${name}`)!.forEach((r, i) => expect(r.minMoney, `${name} seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(0));
  });

  it('brings some a–e strategy below 30% of the starting money on Hard', () => {
    const floor = DIFFICULTY_DEFS.hard.startMoney * HARD_LOW_SHARE;
    const lowest = SENSIBLE.map((name) => Math.min(...runs.get(`hard/${name}`)!.map((r) => r.minMoney)));
    console.log(`hard: lowest money of a–e ${lowest.map(k).join(' / ')} (30% of start: ${k(floor)})`);
    expect(Math.min(...lowest)).toBeLessThan(floor);
  });

  it('bankrupts f on at least half the seeds on Normal and Hard', () => {
    for (const d of DIFFICULTIES) {
      const broke = runs.get(`${d}/${BAD}`)!.filter((r) => r.bankrupt).length;
      console.log(`${d}: f bankrupt in ${broke}/${SEEDS.length} seeds`);
      if (d !== 'easy') expect(broke, d).toBeGreaterThanOrEqual(SEEDS.length / 2);
    }
  });

  it('keeps the a–e 3-cup game count within 5 of E-03 on each difficulty', () => {
    for (const d of DIFFICULTIES) {
      const three = SENSIBLE.flatMap((name) => runs.get(`${d}/${name}`)!).filter((r) => r.trophies === 3).length;
      console.log(`${d}: a–e 3 cups in ${three}/${SENSIBLE.length * SEEDS.length} games (E-03: ${THREE_CUPS_E03[d]})`);
      expect(Math.abs(three - THREE_CUPS_E03[d]), d).toBeLessThanOrEqual(5);
    }
  });

  it('scores hiring alone above hiring plus tools on a seed where it is clearly more profitable', () => {
    let compared = 0;
    for (const d of DIFFICULTIES) {
      const b = runs.get(`${d}/b_hire`)!;
      const c = runs.get(`${d}/c_tools`)!;
      SEEDS.forEach((seed, i) => {
        if (b[i]!.profit - c[i]!.profit < CLEAR_PROFIT_LEAD) return;
        compared++;
        expect(b[i]!.score, `${d} seed ${seed}`).toBeGreaterThan(c[i]!.score);
      });
    }
    // The comparison must not be empty: Normal and Hard have such seeds.
    expect(compared).toBeGreaterThanOrEqual(SEEDS.length);
  });

  // A "win" for d is a seed where its week score beats c's on the same seed.
  it('makes high price a trade-off: d beats c on some seeds but not on all, per difficulty', () => {
    for (const d of DIFFICULTIES) {
      const c = runs.get(`${d}/c_tools`)!;
      const dRows = runs.get(`${d}/d_high_price`)!;
      const wins = SEEDS.filter((_, i) => dRows[i]!.score > c[i]!.score).length;
      console.log(`${d}: d beats c on score in ${wins}/${SEEDS.length} seeds`);
      expect(wins, `${d} d wins at least once`).toBeGreaterThanOrEqual(1);
      expect(wins, `${d} d does not win every seed`).toBeLessThan(SEEDS.length);
    }
  });

  it('keeps 3 cups out of reach for some strategy on Hard', () => {
    const hard = [...runs].filter(([key]) => key.startsWith('hard/')).flatMap(([, rows]) => rows);
    expect(hard.every((r) => r.trophies === 3)).toBe(false);
    expect(SENSIBLE.some((name) => runs.get(`hard/${name}`)!.some((r) => r.trophies < 3))).toBe(true);
  });

  it('asks Hard for at least the revenue of Normal', () => {
    expect(WEEK_GOALS.hard.revenue).toBeGreaterThanOrEqual(WEEK_GOALS.normal.revenue);
  });

  it('scores Hard below Normal and the basic strategy below the hiring ones', () => {
    for (const name of SENSIBLE) {
      expect(mean(runs.get(`hard/${name}`)!, 'score'), name).toBeLessThan(mean(runs.get(`normal/${name}`)!, 'score'));
    }
    for (const d of DIFFICULTIES) {
      expect(mean(runs.get(`${d}/a_basic`)!, 'score'), d).toBeLessThan(mean(runs.get(`${d}/b_hire`)!, 'score'));
    }
  });

  it('gives the same numbers when a seed is played again', () => {
    for (const d of DIFFICULTIES) {
      for (const [name, s] of Object.entries(STRATEGIES)) {
        SEEDS.forEach((seed, i) => expect(playWeek(d, seed, s), `${d}/${name} seed ${seed}`).toEqual(runs.get(`${d}/${name}`)![i]));
      }
    }
  });
});
