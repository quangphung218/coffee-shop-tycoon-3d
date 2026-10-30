// @vitest-environment jsdom
// T-38: report, toast and week-end fixes UX-101..110 (004 and 012 are elsewhere).
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { grantWeekReward } from '../../src/sim/progression';
import { buildDailyReport } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DayStats, GameState } from '../../src/sim/types';
import { rollWeekPlan, scoreWeek, summarizeWeek } from '../../src/sim/week';
import { MAX_TOASTS, Toasts } from '../../src/ui/core/toast';
import { createHud } from '../../src/ui/hud/hud';
import { registerPrepPanels } from '../../src/ui/panels';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';
import { createDailyReport } from '../../src/ui/report';
import { WEEK_AVG_MIN_DAYS } from '../../src/ui/report/report';
import { nextWeekGoalText } from '../../src/ui/screens/weekEnd';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { cupsLineText, weekGoalBlock } from '../../src/ui/weekGoal';

// Vitest stubs .css imports, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const css = (path: string): string => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const REPORT_CSS = css('src/ui/report/report.css');
const UI_CSS = css('src/ui/styles/ui.css');
const EMOJI = /\p{Extended_Pictographic}/u;

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

function mountShell(state: GameState): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  shell.startGame(state);
  return root;
}

function scoreLastDay(state: GameState): void {
  const result = scoreWeek(state)!;
  state.week!.result = result;
  (state.week!.archive ??= []).push(summarizeWeek(state, result)!);
  result.reward = grantWeekReward(state, result);
}

/** Week 1 (20 of 100 customers left each day), then week 2 (days 8–14, 5 of 100) at its scored report. */
function atWeek2Report(): GameState {
  const state = createNewGame('Quán T38', 'hard', 42);
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
  const root = mountShell(state);
  shell!.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  return root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
}

/** A closed day of week 1 at the report, earlier days in history. */
function onReport(days: number): GameState {
  const state = createNewGame('Quán T38', 'normal', 42);
  const all: DayStats[] = Array.from({ length: days }, (_, i) => {
    const d = createDayStats(i + 1, 4);
    d.revenue = 400_000 + i * 100_000;
    d.customersServed = 40;
    d.customersArrived = 40;
    return d;
  });
  state.history = all.slice(0, -1);
  state.today = all[all.length - 1]!;
  state.day = state.today.day;
  state.phase = 'report';
  state.lastReport = buildDailyReport(state);
  return state;
}

describe('UX-102 toasts while the Daily Report is open', () => {
  it('shows at most 1 toast over the report and says "Đã tự lưu" as a footer line, not a toast', () => {
    const state = onReport(2);
    const root = mountShell(state);
    expect(shell!.report.visible).toBe(true);
    shell!.handleEvents([
      { type: 'notify', level: 'warning', text: 'Một' },
      { type: 'notify', level: 'warning', text: 'Hai' },
      { type: 'notify', level: 'warning', text: 'Ba' },
      { type: 'dayEnded', day: 2 },
    ]);
    shell!.update();
    expect(shell!.toasts.count).toBeLessThanOrEqual(1);
    expect(root.querySelector('.toasts')!.textContent).not.toContain('Đã tự lưu');
    expect(shell!.report.el.querySelector('.rpt-foot [data-save]')!.textContent).toContain('Đã tự lưu ngày 2');

    // Report closed: the stack holds 3 again.
    shell!.report.el.querySelector<HTMLButtonElement>('[data-action="next-day"]')!.click();
    expect(shell!.report.visible).toBe(false);
    expect(shell!.toasts.limit).toBe(MAX_TOASTS);
  });

  it('closes the oldest toasts when the limit drops', () => {
    const t = new Toasts();
    for (const title of ['A', 'B', 'C']) t.show({ level: 'warning', title });
    t.limit = 1;
    expect(t.count).toBe(1);
    expect(t.el.textContent).toContain('C');
    t.show({ level: 'warning', title: 'D' });
    expect(t.count).toBe(1);
  });
});

describe('UX-101 cups line', () => {
  it('reads "Hiện X điểm · cần 70 để 2 cúp", or "đủ 3 cúp" at the top', () => {
    expect(cupsLineText({ score: 52, cups: 1 })).toBe('Hiện 52 điểm · cần 70 để 2 cúp');
    expect(cupsLineText({ score: 12, cups: 0 })).toBe('Hiện 12 điểm · cần 70 để 2 cúp');
    expect(cupsLineText({ score: 75, cups: 2 })).toBe('Hiện 75 điểm · cần 90 để 3 cúp');
    expect(cupsLineText({ score: 95, cups: 3 })).toBe('Hiện 95 điểm · đủ 3 cúp');
    const el = weekGoalBlock({ bars: [], score: 52, cups: 1, upgradeCharge: 0 });
    expect(el.querySelector('[data-goal="cups"]')!.textContent).toBe('Hiện 52 điểm · cần 70 để 2 cúp');
    expect(el.querySelector('[data-goal="cups"] [data-icon="i-trophy"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Đang hướng tới');
  });
});

describe('UX-103 week-end footer at 480 px', () => {
  it('gives Sang tuần the full first row; Về menu and Chơi lại share the second', () => {
    const phone = media(REPORT_CSS, '(max-width: 480px)');
    const row = rule(phone, '.rpt-foot-actions.wk-foot-actions');
    expect(row).toMatch(/flex-direction:\s*row/);
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(phone, '.rpt-foot-actions.wk-foot-actions > .btn')).toMatch(/flex:\s*1 1 0/);
    expect(rule(phone, '.rpt-foot-actions.wk-foot-actions > .btn-primary')).toMatch(/flex-basis:\s*100%/);
    // The column stacking of the Daily Report no longer names the week-end footer.
    expect(phone).not.toMatch(/\.wk-foot-actions\s*\{[^}]*flex-direction:\s*column/);
    const el = openWeekEnd(atWeek2Report());
    const actions = [...el.querySelectorAll<HTMLElement>('.wk-foot-actions > .btn')].map((b) => b.dataset.action);
    expect(actions).toEqual(['menu', 'replay', 'next-week']);
  });
});

describe('UX-105 Tiêu chí–Điểm table', () => {
  it('is at most 360 px wide', () => {
    expect(rule(REPORT_CSS, '.rpt-margins.wk-points')).toMatch(/max-width:\s*360px/);
    const el = openWeekEnd(atWeek2Report());
    const table = el.querySelector('[data-block="score-table"] table')!;
    expect(table.classList.contains('rpt-margins')).toBe(true);
    expect(table.classList.contains('wk-points')).toBe(true);
  });
});

describe('UX-104 Nâng cấp summary lines', () => {
  it('hides "Giá bán +0%" and says where Tem come from', () => {
    const state = createNewGame('Quán T38', 'normal', 5);
    const body = document.createElement('div');
    document.body.append(body);
    renderUpgradesPanel(body, { dispatch: () => true, getState: () => state, close: () => {} });
    const price = body.querySelector<HTMLElement>('[data-summary="price"]')!;
    expect(price.hidden).toBe(true);
    expect(price.textContent).toBe('');
    expect(body.querySelector('[data-summary="tickets"]')!.textContent).toMatch(/^Tem: \d+.* · nhận từ Quà hằng ngày$/);
  });
});

describe('UX-106 trophy on the same line at 390 px', () => {
  it('lets the goal sentence and the week-end title shrink beside their trophy, never wrap below it', () => {
    const goal = rule(UI_CSS, '.wk-next p > span:last-child:not(.wk-next-label)');
    expect(goal).toMatch(/flex:\s*1 1 0/);
    expect(goal).toMatch(/min-width:\s*0/);
    expect(rule(REPORT_CSS, ".rpt-layer[data-screen='weekEnd'] .rpt-head")).toMatch(/flex-wrap:\s*nowrap/);
    const head = rule(REPORT_CSS, ".rpt-layer[data-screen='weekEnd'] .rpt-head-text");
    expect(head).toMatch(/flex:\s*1 1 0/);
    expect(head).toMatch(/min-width:\s*0/);
    const el = openWeekEnd(atWeek2Report());
    const line = el.querySelector('[data-next="goal"]')!;
    expect(line.children).toHaveLength(2);
    expect(line.firstElementChild!.getAttribute('data-icon')).toBe('i-trophy');
    expect(line.lastElementChild!.tagName).toBe('SPAN');
  });
});

describe('UX-107 no orphan card at 768 px', () => {
  it('lets an odd last card of the week grid take the whole row below 1024 px', () => {
    const tablet = media(REPORT_CSS, '(max-width: 1023px)');
    expect(rule(tablet, '.rpt-grid.wk-grid > :last-child:nth-child(odd):not(:first-child)')).toMatch(/grid-column:\s*1 \/ -1/);
    const el = openWeekEnd(atWeek2Report());
    // Revenue, profit, stars: three cards, the third is the odd last one.
    expect(el.querySelectorAll('.wk-grid > .rpt-section')).toHaveLength(3);
  });
});

describe('UX-108 "so TB tuần" before day 3', () => {
  it(`hides the week-average change while the week has fewer than ${WEEK_AVG_MIN_DAYS} days`, () => {
    const mount = (state: GameState): HTMLElement => {
      const view = createDailyReport({ dispatch: () => true });
      document.body.append(view.el);
      view.update(state, true);
      return view.el;
    };
    const day2 = mount(onReport(2));
    expect(day2.querySelector('[data-vs="yesterday"]')).not.toBeNull();
    expect(day2.querySelector('[data-vs="week"]')).toBeNull();
    expect(day2.textContent).not.toContain('so TB tuần');
    const day3 = mount(onReport(3));
    expect(day3.querySelector('[data-fig="revenue"] [data-vs="week"]')!.textContent).toContain('so TB tuần');
  });
});

describe('UX-109 toast above the dock with a panel open', () => {
  it('keeps one bottom anchor above the dock; no rule moves the stack up when a dock button is pressed', () => {
    expect(rule(UI_CSS, '#ui > .toasts')).toMatch(/bottom:\s*calc\(var\(--dock-h, var\(--dock-space\)\) \+ var\(--space-2\)\)/);
    expect(UI_CSS).not.toMatch(/aria-pressed='true'\]\)\s*>\s*\.toasts/);
  });

  it('on a phone with a panel open, lifts the stack above the panel foot as well', () => {
    const phone = rule(media(UI_CSS, '(max-width: 640px)'), '#ui:has(> .panel:not([hidden])) > .toasts');
    expect(phone).toMatch(/bottom:\s*calc\(var\(--dock-h, var\(--dock-space\)\) \+ var\(--space-2\) \+ var\(--panel-foot-h, 0px\) \+ var\(--space-2\)\)/);
    expect(phone).not.toMatch(/(^|[;\s])top:/);
  });

  it('measures the open panel foot into --panel-foot-h, so the toast bottom clears "Mở cửa"', () => {
    const offPanels = registerPrepPanels();
    const state = createNewGame('Quán T38', 'normal', 1);
    const hud = createHud({ dispatch: () => false,getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
    const host = document.createElement('div');
    host.id = 'ui';
    document.body.append(host);
    host.append(hud.el, hud.panelEl);
    hud.el.hidden = false;
    hud.update(state);
    // jsdom has no layout: a 390 px phone, panel bottom at 700, its foot 96 px tall.
    const rects: Record<string, { top: number; bottom: number }> = { panel: { top: 120, bottom: 700 }, 'panel-foot': { top: 604, bottom: 700 } };
    const proto = HTMLElement.prototype;
    const real = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      const r = rects[[...this.classList].find((c) => c in rects) ?? ''] ?? { top: 0, bottom: 0 };
      return { ...r, left: 0, right: 390, width: 390, height: r.bottom - r.top, x: 0, y: r.top, toJSON() {} } as DOMRect;
    };
    try {
      hud.openPanel('tasks');
      const foot = hud.panelEl.querySelector<HTMLElement>('.panel-foot')!;
      expect(foot.querySelector('[data-action="open"]')).not.toBeNull();
      expect(host.style.getPropertyValue('--panel-foot-h')).toBe('96px');
      hud.closePanel();
      expect(host.style.getPropertyValue('--panel-foot-h')).toBe('0px');
    } finally {
      proto.getBoundingClientRect = real;
      hud.dispose();
      offPanels();
    }
  });
});

describe('UX-110 week-end wording and arrows', () => {
  it('says "mục tiêu tuần 1" and shows a fall in Khách bỏ đi with a down arrow', () => {
    const state = atWeek2Report();
    expect(nextWeekGoalText(state)).toContain('mục tiêu tuần 1)');
    expect(nextWeekGoalText(state)).not.toContain('so tuần 1');
    const el = openWeekEnd(state);
    const d = el.querySelector<HTMLElement>('tr[data-stat="abandonRate"] .wk-delta')!;
    expect(d.dataset.delta).toBe('down');
    expect(d.querySelector('[data-icon]')!.getAttribute('data-icon')).toBe('i-trend-down');
    // Still green: fewer customers leaving is better.
    expect(d.classList.contains('is-up')).toBe(true);
    expect(el.textContent).not.toMatch(EMOJI);
  });
});
