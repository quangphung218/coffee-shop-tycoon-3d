// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal, weekProfitTarget, weekReward } from '../../src/sim/data/week';
import { grantWeekReward } from '../../src/sim/progression';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, Staff } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, summarizeWeek } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { scoreRows } from '../../src/ui/screens/weekEnd';

// The project has no Node types: read the CSS through a dynamically named node:fs import (as styles.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function scoreLastDay(state: GameState): void {
  const result = scoreWeek(state)!;
  state.week!.result = result;
  (state.week!.archive ??= []).push(summarizeWeek(state, result)!);
  result.reward = grantWeekReward(state, result);
}

interface WeekOpts {
  revenue?: number;
  rating?: number;
  upgradeCost?: number;
  money?: number;
  staffed?: boolean;
}

/**
 * Week 1 (hard) played to its scored day-7 report: `revenue` a day, nothing
 * spent on ingredients; `upgradeCost` bought on day 3. Money and staff are set
 * after scoring, as the shop stands when the summary opens.
 */
function week1({ revenue = 3_000_000, rating = 3, upgradeCost = 0, money, staffed = false }: WeekOpts = {}): GameState {
  const state = createNewGame('Quán Tuần', 'hard', 42);
  for (let d = 1; d <= WEEK_LENGTH; d++) {
    const stats = createDayStats(d, 4);
    stats.revenue = revenue;
    stats.customersServed = 40;
    if (d === 3) stats.upgradeCost = upgradeCost;
    if (d < WEEK_LENGTH) state.history.push(stats);
    else state.today = stats;
  }
  state.day = WEEK_LENGTH;
  state.rating = rating;
  state.phase = 'report';
  scoreLastDay(state);
  if (money !== undefined) state.money = money;
  if (staffed) state.staff.push({ ...(state.candidates[0] as unknown as Staff), role: 'barista' });
  return state;
}

function open(state: GameState): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  shell.startGame(state);
  shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
  expect(el.hidden).toBe(false);
  return el;
}

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);

describe('Week-end score table (item 2)', () => {
  it('lists the points of each criterion adding up to the score', () => {
    const state = week1();
    const el = open(state);
    const r = state.week!.result!;
    const table = q(el, '[data-block="score-table"]')!;
    const rows = [...table.querySelectorAll<HTMLElement>('tbody tr')];
    expect(rows.map((tr) => tr.dataset.criterion)).toEqual(['revenue', 'profit', 'stars']);
    const pts = rows.map((tr) => Number(tr.querySelector('.is-num')!.textContent!.split('/')[0]));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(r.score);
    expect(rows.map((tr) => tr.querySelector('.is-num')!.textContent!.split('/')[1])).toEqual(['25', '55', '20']);
    expect(table.querySelector('tfoot')!.textContent).toContain(`${r.score}/100`);
  });

  it('shows the profit formula with the upgrade charge of week 1', () => {
    const state = week1({ upgradeCost: 4_000_000 });
    const el = open(state);
    const r = state.week!.result!;
    const days = r.profit! + 4_000_000;
    expect(q(el, '[data-line="profit-formula"]')!.textContent).toBe(
      `Lãi các ngày ${formatMoney(days)} − khấu hao nâng cấp ${formatMoney(4_000_000)} = ${formatMoney(r.profit!)}`,
    );
  });

  it('states the score each cup count needs and its reward', () => {
    const el = open(week1());
    const line = q(el, '[data-line="cup-rule"]')!.textContent!;
    expect(line).toContain(`Từ 70 điểm được 2 cúp: thưởng ${formatMoney(weekReward('hard', 2))}`);
    expect(line).toContain(`từ 90 điểm được 3 cúp: thưởng ${formatMoney(weekReward('hard', 3))}`);
  });

  it('splits rounding so the rows always sum to the score', () => {
    const rows = scoreRows({ revenue: 10, revenueTarget: 30, profit: 10, profitTarget: 30, stars: 1, starsTarget: 3, score: 33, cups: 0, days: [] })!;
    expect(rows.reduce((s, x) => s + x.points, 0)).toBe(33);
  });
});

describe('Week-end next-week block (item 3)', () => {
  it('states revenue with its multiple of week 1, profit and stars, no space before the period', () => {
    const el = open(week1());
    const goal = weekGoal('hard', 2);
    const text = q(el, '[data-next="goal"]')!.textContent!;
    expect(text).toBe(
      `Mục tiêu: ${formatMoney(goal.revenue)} doanh thu (×1,9 so tuần 1), ${formatMoney(weekProfitTarget('hard', goal.revenue))} lợi nhuận và 4,2 sao.`,
    );
    expect(text).not.toMatch(/\s\./);
    // The sentence is one flex item after the icon, so the line's gap cannot split "sao" from its period.
    const line = q(el, '[data-next="goal"]')!;
    expect([...line.childNodes].some((n) => n.nodeType === Node.TEXT_NODE)).toBe(false);
    expect(line.lastElementChild!.textContent).toBe(text);
  });
});

describe('Week-end profit card (item 4)', () => {
  it('has a progress bar and a percent like the revenue card', () => {
    const state = week1({ upgradeCost: 4_000_000 });
    const el = open(state);
    const r = state.week!.result!;
    const card = q(el, '[data-block="profit"]')!;
    const bar = card.querySelector<HTMLElement>('[role="progressbar"]')!;
    const pct = Math.round((r.profit! / r.profitTarget!) * 100);
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.min(100, pct)));
    expect(card.textContent).toContain(`${pct}% mục tiêu`);
    expect(q(el, '[data-block="revenue"] [role="progressbar"]')).not.toBeNull();
  });

  it('puts the three cards in a 3-column grid on desktop', () => {
    const el = open(week1());
    expect(q(el, '.rpt-grid.wk-grid')!.children.length).toBe(3);
    // jsdom gives import.meta.url no file: scheme; vitest runs from the project root.
    const css = readFileSync('src/ui/report/report.css', 'utf8');
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[^@]*\.rpt-grid\.wk-grid \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });
});

describe('Week 1 summary below 3 cups (item 5)', () => {
  it('compares the revenue a day week 2 needs with this week, and hints hire and buy', () => {
    const state = week1({ money: 50_000_000 });
    expect(state.week!.result!.cups).toBeLessThan(3);
    const el = open(state);
    const need = Math.round(weekGoal('hard', 2).revenue / WEEK_LENGTH);
    expect(q(el, '[data-next="per-day"]')!.textContent).toBe(`Doanh thu mỗi ngày tuần 2 cần ${formatMoney(need)}, tuần này đạt ${formatMoney(3_000_000)}.`);
    const hints = [...el.querySelectorAll('[data-hint]')].map((li) => li.textContent);
    expect(hints).toEqual(['Thuê pha chế.', 'Mua nâng cấp, tiền chia ra các tuần.']);
  });

  it('drops the hire hint with enough staff and the buy hint without enough money', () => {
    const el = open(week1({ money: 0, staffed: true }));
    expect(q(el, '[data-block="week-one"]')).not.toBeNull();
    expect(q(el, '[data-block="hints"]')).toBeNull();
  });

  it('keeps only the hire hint when the money pays no upgrade', () => {
    const el = open(week1({ money: 0 }));
    expect([...el.querySelectorAll('[data-hint]')].map((li) => li.textContent)).toEqual(['Thuê pha chế.']);
  });

  it('hides the block and its hints at 3 cups', () => {
    const state = week1({ revenue: 6_000_000, rating: 4.4, money: 50_000_000 });
    expect(state.week!.result!.cups).toBe(3);
    const el = open(state);
    expect(q(el, '[data-block="week-one"]')).toBeNull();
    expect(el.querySelector('[data-hint]')).toBeNull();
  });

  it('is not shown after week 2', () => {
    const state = week1();
    const archive = state.week!.archive;
    state.history.push(state.today);
    state.week = { length: 7, index: 2, startedDay: 8, plan: rollWeekPlan(state.seed, 2), goal: weekGoal('hard', 2), archive };
    for (let d = 8; d <= 14; d++) {
      const stats = createDayStats(d, 4);
      stats.revenue = 4_000_000;
      if (d < 14) state.history.push(stats);
      else state.today = stats;
    }
    state.day = 14;
    scoreLastDay(state);
    const el = open(state);
    expect(q(el, '[data-block="week-one"]')).toBeNull();
    expect(q(el, '[data-next="goal"]')!.textContent).toContain('×2,9 so tuần 1');
  });
});

describe('Old saves', () => {
  it('hide the score table and profit card for weeks scored before profit counted', () => {
    const state = week1();
    delete state.week!.result!.profit;
    delete state.week!.result!.profitTarget;
    const el = open(state);
    expect(q(el, '[data-block="score"]')).not.toBeNull();
    expect(q(el, '[data-block="score-table"]')).toBeNull();
    expect(q(el, '[data-block="profit"]')).toBeNull();
  });

  it('show no week blocks without a week', () => {
    const state = week1();
    delete state.week;
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
    shell.startGame(state);
    expect(root.querySelector('[data-block="score-table"], [data-block="week-one"], [data-block="next-week"]')).toBeNull();
  });
});
