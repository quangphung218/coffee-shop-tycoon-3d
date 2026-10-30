// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { grantWeekReward } from '../../src/sim/progression';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, summarizeWeek } from '../../src/sim/week';
import { createDailyReport } from '../../src/ui/report';
import { createShell, type Shell } from '../../src/ui/screens/shell';

// Vitest stubs .css imports, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const css = (path: string): string => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const REPORT_CSS = css('src/ui/report/report.css');
const UI_CSS = css('src/ui/styles/ui.css');
const PANELS_CSS = css('src/ui/panels/panels.css');

/** Body of the first `@media (<query>) { … }` block, nested braces included. */
function media(src: string, query: string): string {
  const start = src.indexOf(`@media ${query} {`);
  if (start < 0) throw new Error(`missing @media ${query}`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(src.indexOf('{', start) + 1, i);
  }
  throw new Error('unclosed @media');
}

/** Declarations of `selector { … }` inside `src`. */
function rule(src: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`missing rule ${selector}`);
  return m[1]!;
}

let shell: Shell | null = null;
afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function report(): DailyReport {
  return {
    day: 3,
    revenue: 1_200_000,
    ingredientCost: 300_000,
    wages: 450_000,
    marketingCost: 0,
    profit: 450_000,
    money: 2_600_000,
    customersArrived: 100,
    customersServed: 95,
    customersLost: 5,
    topSellers: [],
    outOfStock: [],
    ratingStart: 3.8,
    ratingEnd: 3.9,
    reviews: [],
    suggestions: [],
    insights: {
      metrics: [],
      grossProfit: 500_000,
      itemMargins: [],
      itemProfits: [{ id: 'latte', qty: 20, price: 40_000, cost: 15_000, marginPct: 62.5, grossProfit: 500_000, status: 'good' }],
      arrivalsByHour: new Array(24).fill(0),
    },
  };
}

function scoreLastDay(state: GameState): void {
  const result = scoreWeek(state)!;
  state.week!.result = result;
  (state.week!.archive ??= []).push(summarizeWeek(state, result)!);
  result.reward = grantWeekReward(state, result);
}

/** Week 1 (20 of 100 customers left each day), then week 2 (days 8–14, 5 of 100) at its scored report. */
function atWeek2Report(): GameState {
  const state = createNewGame('Quán T26', 'hard', 42);
  const day = (d: number, lost: number) => {
    const s = createDayStats(d, 4);
    s.revenue = 3_000_000;
    s.customersArrived = 100;
    s.customersLost = lost;
    s.customersServed = 100 - lost;
    return s;
  };
  for (let d = 1; d < WEEK_LENGTH; d++) state.history.push(day(d, 20));
  state.day = WEEK_LENGTH;
  state.today = day(WEEK_LENGTH, 20);
  state.phase = 'report';
  scoreLastDay(state);
  const archive = state.week!.archive;
  state.history.push(state.today);
  state.week = { length: 7, index: 2, startedDay: 8, plan: rollWeekPlan(state.seed, 2), goal: weekGoal('hard', 2), archive };
  for (let d = 8; d < 14; d++) state.history.push(day(d, 5));
  state.day = 14;
  state.today = day(14, 5);
  scoreLastDay(state);
  return state;
}

function openWeekEnd(state: GameState): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  shell.startGame(state);
  shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  return root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
}

describe('UX-010 Daily Report at 390 px', () => {
  const phone = media(REPORT_CSS, '(max-width: 480px)');

  it('keeps the three tabs on one row: no wrap, each tab shrinks and keeps its label on one line', () => {
    expect(rule(phone, '.rpt-tabs')).toMatch(/flex-wrap:\s*nowrap/);
    const tab = rule(phone, '.rpt-tab');
    expect(tab).toMatch(/flex:\s*1 1 auto/);
    expect(tab).toMatch(/min-width:\s*0/);
    expect(tab).toMatch(/white-space:\s*nowrap/);
    const view = createDailyReport({ dispatch: () => true });
    document.body.append(view.el);
    expect(view.el.querySelectorAll('.rpt-tabs > .rpt-tab')).toHaveLength(3);
  });

  it('puts Sao next to Khách: profit and revenue span the row, the last two cells share one', () => {
    const narrow = media(REPORT_CSS, '(max-width: 640px)');
    expect(rule(narrow, '.rpt-figs')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(rule(narrow, ".rpt-fig.is-result,\n  .rpt-fig[data-fig='revenue']")).toMatch(/grid-column:\s*1 \/ -1/);
    const state = createNewGame('Quán T26', 'normal', 42);
    state.phase = 'report';
    state.lastReport = report();
    const view = createDailyReport({ dispatch: () => true });
    document.body.append(view.el);
    view.update(state, true);
    const figs = [...view.el.querySelectorAll<HTMLElement>('[data-block="figures"] > .rpt-fig')].map((f) => f.dataset.fig);
    // Khách and Sao are the last two cells, in a 2-column grid after two full rows.
    expect(figs).toEqual(['profit', 'revenue', 'customersServed', 'stars']);
  });
});

describe('UX-011 scroll regions reachable by keyboard', () => {
  it('gives every Daily Report panel and the margins table tabindex=0 and an aria-label', () => {
    const state = createNewGame('Quán T26', 'normal', 42);
    state.phase = 'report';
    state.lastReport = report();
    const view = createDailyReport({ dispatch: () => true });
    document.body.append(view.el);
    view.update(state, true);
    view.showTab('insights');
    const scrollers = [...view.el.querySelectorAll<HTMLElement>('.rpt-body, .rpt-table-wrap')];
    expect(view.el.querySelectorAll('.rpt-body')).toHaveLength(3);
    expect(view.el.querySelectorAll('.rpt-table-wrap').length).toBeGreaterThan(0);
    for (const el of scrollers) {
      expect(el.getAttribute('tabindex'), el.className).toBe('0');
      expect(el.getAttribute('aria-label')?.length, el.className).toBeGreaterThan(0);
    }
  });

  it('does the same on the week summary (body and comparison table)', () => {
    const el = openWeekEnd(atWeek2Report());
    const scrollers = [...el.querySelectorAll<HTMLElement>('.rpt-body, .rpt-table-wrap')];
    expect(scrollers).toHaveLength(2);
    for (const s of scrollers) {
      expect(s.getAttribute('tabindex')).toBe('0');
      expect(s.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('main menu key hint', () => {
  it('wraps "↑ ↓ di chuyển · Enter chọn" in .menu-keys, hidden on a touch screen', () => {
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
    const keys = root.querySelector<HTMLElement>('.menu-foot .menu-keys');
    expect(keys?.textContent).toBe('↑ ↓ di chuyển · Enter chọn');
    expect(rule(media(UI_CSS, '(hover: none), (pointer: coarse)'), '.menu-keys')).toMatch(/display:\s*none/);
  });
});

describe('week summary', () => {
  it('labels the chart with the run\'s days, Ngày 8 to Ngày 14 in week 2', () => {
    const el = openWeekEnd(atWeek2Report());
    const cols = [...el.querySelectorAll<HTMLElement>('[data-block="days"] .wk-col')];
    expect(cols.map((c) => c.querySelector('.wk-col-date')?.textContent)).toEqual(['Ngày8', 'Ngày9', 'Ngày10', 'Ngày11', 'Ngày12', 'Ngày13', 'Ngày14']);
    expect(cols.map((c) => c.getAttribute('aria-label')!.split(' · ')[0])).toEqual(['Ngày 8', 'Ngày 9', 'Ngày 10', 'Ngày 11', 'Ngày 12', 'Ngày 13', 'Ngày 14']);
    expect(el.querySelector('[data-block="days"]')!.textContent).not.toMatch(/\bN\d/);
  });

  it('shows a drop in Khách bỏ đi with the arrow and colour both saying better', () => {
    const el = openWeekEnd(atWeek2Report());
    const d = el.querySelector<HTMLElement>('tr[data-stat="abandonRate"] .wk-delta')!;
    // 20% → 5%: the figure went down, which is the good direction.
    expect(d.dataset.delta).toBe('down');
    expect(d.textContent).toBe('−15 điểm %');
    expect(d.classList.contains('is-up')).toBe(true);
    expect(d.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('i-trend-up');
    expect(d.getAttribute('aria-label')).toBe('Giảm 15 điểm %, tốt hơn');
    // Elsewhere arrow, colour and direction still agree.
    const rev = el.querySelector<HTMLElement>('tr[data-stat="customersServed"] .wk-delta')!;
    expect(rev.classList.contains('is-up')).toBe(true);
    expect(rev.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('i-trend-up');
  });
});

describe('Nhân viên: "Ứng viên hôm nay" on the margin', () => {
  it('outranks the #ui h3 / #ui p reset so headings and intro lines get the --space-4 inset', () => {
    expect(UI_CSS).toMatch(/#ui h3,\s*#ui p\s*\{\s*margin:\s*0/);
    expect(rule(PANELS_CSS, '#ui .prep:has(> .panel-foot) > :is(h3, p)')).toMatch(/margin-inline:\s*var\(--space-4\)/);
  });
});
