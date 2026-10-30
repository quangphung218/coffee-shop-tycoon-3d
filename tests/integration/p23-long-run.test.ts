import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, weekReward } from '../../src/sim/data/week';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { MAX_SHOP_LEVEL, maxLevelBonus } from '../../src/sim/data/levels';
import { dispatch, nextUpgradeCost } from '../../src/sim/index';
import { nextUpgradeTicketCost, upgradeBlockedReason, upgradeLevel } from '../../src/sim/upgrades';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * P23 long-run economy: plays 8 weeks (56 days) per difficulty × strategy ×
 * seed and prints one row per week. Asserts the hard invariants (money never
 * below zero, same seed → same numbers, no bankruptcy) and the two P23
 * targets: the spender still has an upgrade to buy at the end of week 3, and
 * the basic strategy cannot take 3 cups in week 2. E-07 and E-11 add the score
 * curve of weeks 1–8 (upgrade cost spread over upgradeAmortizeWeeks from
 * week 1, goals on weekGoalMult): the spender scores at least the basic
 * strategy every week and never drops more than 10 points from one week to
 * the next, steady play (b_steady) takes 2 cups in most weeks, the basic
 * strategy keeps a cup through week 8, and both the spender and steady play
 * reach 3 cups in weeks 5–8. Read in docs/reports/p23-long-economy.md.
 */

const SEEDS = [1, 42, 777];
const WEEKS = 8;
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

interface Strategy {
  /** Hire one barista on the morning of day 1. */
  hire: boolean;
  /** Every morning buy the cheapest open upgrade or tool, again and again, while the money keeps tonight's wages and tomorrow's restock. */
  spend: boolean;
  /** Every morning buy the cheapest open upgrade or tool, again and again, while the money is at least twice its price and keeps tonight's wages and tomorrow's restock. */
  steady: boolean;
}

/**
 * The P22 strategies a and c, with c spending on every upgrade (not only tools)
 * over the long run, and b_steady: the relaxed player with one barista who buys
 * only what costs at most half the money in hand. All keep the Standard price.
 */
const STRATEGIES: Record<string, Strategy> = {
  a_basic: { hire: false, spend: false, steady: false },
  c_spend: { hire: true, spend: true, steady: false },
  b_steady: { hire: true, spend: false, steady: true },
};

interface WeekRow {
  week: number;
  revenue: number;
  /** Week revenue target (the week's goal). */
  revenueTarget: number;
  /** Profit the score counts (weekProfit: upgrades spread over UPGRADE_AMORTIZE_WEEKS) and its target. */
  scoreProfit: number;
  profitTarget: number;
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
  /** Loyalty tickets ('Tem') held at the end of the week. */
  tickets: number;
  /** The game had gone bankrupt by the end of the week. */
  bankrupt: boolean;
}

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

/** Tonight's wages and rent plus tomorrow's restock: what the suggestion would cost once today's stock is used up. */
function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

/** Buys the cheapest open upgrade while `affordable(cost)` holds, again and again. */
function buyCheapest(state: GameState, track: () => void, affordable: (cost: number) => boolean): void {
  for (let guard = 0; guard < 100; guard++) {
    let best: { id: UpgradeId; cost: number } | null = null;
    for (const def of UPGRADES) {
      if (!isUnlocked(state, 'upgrade', def.id)) continue;
      const cost = nextUpgradeCost(state, def.id);
      if (cost === null || !affordable(cost)) continue;
      // P27 furniture priced in tickets, or needing the side room first, waits until it can be bought.
      if ((nextUpgradeTicketCost(state, def.id) ?? 0) > (state.retention?.tickets ?? 0) || upgradeBlockedReason(state, def.id)) continue;
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

function morning(state: GameState, s: Strategy, track: () => void): void {
  enableUnlocked(state);
  dispatch(state, { type: 'apply_restock' });
  track();
  if (s.hire && state.day === 1) {
    const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
    expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
  }
  if (s.spend) buyCheapest(state, track, (cost) => state.money - reserve(state) >= cost);
  if (s.steady) buyCheapest(state, track, (cost) => state.money >= 2 * cost && state.money - reserve(state) >= cost);
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
    morning(state, s, track);
    playDay(state, { onMinute: track });
    track();
    spent += state.today.upgradeCost;
    const result = state.week!.result;
    if (!result) continue;
    const summary = state.week!.archive!.at(-1)!;
    rows.push({
      week: weekIndex(state),
      revenue: summary.revenue,
      revenueTarget: result.revenueTarget,
      scoreProfit: result.profit ?? 0,
      profitTarget: result.profitTarget ?? 0,
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
      tickets: state.retention?.tickets ?? 0,
      bankrupt: state.bankrupt,
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

describe('P23 long run: 56 days × 3 difficulties × strategies a/c/b_steady', { timeout: 600_000 }, () => {
  const runs = new Map<string, WeekRow[][]>();
  for (const d of DIFFICULTIES) {
    for (const [name, s] of Object.entries(STRATEGIES)) runs.set(`${d}/${name}`, SEEDS.map((seed) => playWeeks(d, seed, s)));
  }

  it('prints a table per week (mean of the seeds) and per seed', () => {
    const head = ['difficulty', 'strategy', 'week', 'revenue', 'profit', 'spent', 'reward', 'endMoney', 'level', 'xp', 'buyable', 'left', 'stars', 'score', 'cups', 'tickets'];
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
          m((r) => r.tickets).toFixed(1),
        ]);
        perSeed.forEach((r, i) => {
          const row = r[w]!;
          seedBody.push([
            ...key.split('/'),
            String(SEEDS[i]),
            String(row.week),
            k(row.revenue),
            k(row.revenueTarget),
            k(row.scoreProfit),
            k(row.profitTarget),
            k(row.endMoney),
            String(row.level),
            String(row.buyable),
            String(row.left),
            row.stars.toFixed(1),
            String(row.score),
            String(row.cups),
            String(row.tickets),
          ]);
        });
      }
    }
    console.log(`Mean of seeds ${SEEDS.join(', ')}\n${markdownTable(head, meanBody)}`);
    console.log(`Per seed\n${markdownTable(['difficulty', 'strategy', 'seed', 'week', 'revenue', 'goal', 'scoreProfit', 'profitTarget', 'endMoney', 'level', 'buyable', 'left', 'stars', 'score', 'cups', 'tickets'], seedBody)}`);
    const scores = [...runs].flatMap(([key, perSeed]) =>
      perSeed.map((rows, i) => [...key.split('/'), String(SEEDS[i]), ...rows.map((r) => `${r.score}/${r.cups}`)]),
    );
    console.log(`Score/cups per week\n${markdownTable(['difficulty', 'strategy', 'seed', ...Array.from({ length: WEEKS }, (_, w) => `w${w + 1}`)], scores)}`);
    for (const perSeed of runs.values()) for (const rows of perSeed) expect(rows.map((r) => r.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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

  it('leaves the spender something to buy at the end of every week up to week 3 (E-05)', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => {
        for (const row of rows.slice(0, 3)) expect(row.buyable, `${d} seed ${SEEDS[i]} week ${row.week}`).toBeGreaterThan(0);
      });
    }
  });

  it('has the spender spend at least 20% of the week’s profit in weeks 3 and 4 (E-05)', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => {
        for (const row of rows.slice(2, 4)) expect(row.spent, `${d} seed ${SEEDS[i]} week ${row.week}`).toBeGreaterThanOrEqual(0.2 * row.profit);
      });
    }
  });

  it('still leaves the spender richer than the basic strategy at the end of week 4 (E-05)', () => {
    for (const d of DIFFICULTIES) {
      const basic = runs.get(`${d}/a_basic`)!;
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => {
        expect(rows[3]!.endMoney, `${d} seed ${SEEDS[i]}`).toBeGreaterThan(basic[i]![3]!.endMoney);
      });
    }
  });

  it('keeps 3 cups out of reach of the basic strategy in week 2', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/a_basic`)!.forEach((rows, i) => expect(rows[1]!.cups, `${d} seed ${SEEDS[i]}`).toBeLessThan(3));
    }
  });

  it('scores the spender at least as high as the basic strategy in every week 1–8 (E-11)', () => {
    for (const d of DIFFICULTIES) {
      const basic = runs.get(`${d}/a_basic`)!;
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => {
        for (const row of rows) expect(row.score, `${d} seed ${SEEDS[i]} week ${row.week}`).toBeGreaterThanOrEqual(basic[i]![row.week - 1]!.score);
      });
    }
  });

  it('never drops the spender more than 10 points from one week to the next from week 2 (E-11)', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/c_spend`)!.forEach((rows, i) => {
        for (let w = 2; w < rows.length; w++) {
          expect(rows[w]!.score, `${d} seed ${SEEDS[i]} weeks ${w}→${w + 1}`).toBeGreaterThanOrEqual(rows[w - 1]!.score - 10);
        }
      });
    }
  });

  it('gives steady play 2 cups or more in at least 75% of its week 2–8 games per difficulty (E-11)', () => {
    for (const d of DIFFICULTIES) {
      const games = runs.get(`${d}/b_steady`)!.flatMap((rows) => rows.slice(1));
      const two = games.filter((r) => r.cups >= 2).length;
      console.log(`${d}: b_steady 2+ cups in ${two}/${games.length} week 2–8 games`);
      expect(two, d).toBeGreaterThanOrEqual(0.75 * games.length);
    }
  });

  it('lets the spender and steady play reach 3 cups in weeks 5–8 per difficulty (E-11)', () => {
    for (const d of DIFFICULTIES) {
      for (const name of ['c_spend', 'b_steady']) {
        const games = runs.get(`${d}/${name}`)!.flatMap((rows) => rows.slice(4, 8));
        const three = games.filter((r) => r.cups === 3).length;
        console.log(`${d}: ${name} 3 cups in ${three}/${games.length} week 5–8 games`);
        expect(three, `${d}/${name}`).toBeGreaterThan(0);
      }
    }
  });

  // Week 1 keeps the WEEK_GOALS measured by p22, which a spread upgrade charge lets c_spend and b_steady top at 106% (E-11).
  it('scores 100 from week 2 only when the revenue reaches 120% of its target (E-07)', () => {
    for (const [key, perSeed] of runs) {
      perSeed.forEach((rows, i) => {
        for (const row of rows.filter((r) => r.week >= 2 && r.score === 100)) {
          expect(row.revenue, `${key} seed ${SEEDS[i]} week ${row.week}`).toBeGreaterThanOrEqual(row.revenueTarget * 1.2);
        }
      });
    }
  });

  it('keeps the basic strategy at 1 cup or more in weeks 2–8, never gaining cups (E-07, E-11)', () => {
    for (const d of DIFFICULTIES) {
      runs.get(`${d}/a_basic`)!.forEach((rows, i) => {
        const cups = rows.slice(1).map((r) => r.cups);
        for (const c of cups) expect(c, `${d} seed ${SEEDS[i]} cups ${cups.join(',')}`).toBeGreaterThanOrEqual(1);
        for (let w = 1; w < cups.length; w++) expect(cups[w], `${d} seed ${SEEDS[i]} cups ${cups.join(',')}`).toBeLessThanOrEqual(cups[w - 1]!);
      });
    }
  });

  it('never goes bankrupt (E-07)', () => {
    for (const [key, perSeed] of runs) {
      perSeed.forEach((rows, i) => expect(rows.some((r) => r.bankrupt), `${key} seed ${SEEDS[i]}`).toBe(false));
    }
  });
});
