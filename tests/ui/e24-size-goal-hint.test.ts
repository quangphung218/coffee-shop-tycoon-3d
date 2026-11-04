// @vitest-environment jsdom
// E-24 UX-301/303: the size goal's hint follows the shop (staff, price) and the
// week-end summary shows the size line and that hint under "Mục tiêu:".
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch as simDispatch } from '../../src/sim';
import { startNextDay } from '../../src/sim/clock';
import { SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_FIRST_WEEK, WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, PolicyLevel, Staff, WeekSummary } from '../../src/sim/types';
import { nextWeekGoal, rollWeekPlan } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import {
  SIZE_GOAL_TEXT,
  sizeGoalHint,
  sizeGoalLineText,
  sizeGoalNumberText,
  sizeGoalUsualProfit,
  weekGoalBlock,
  weekGoalView,
} from '../../src/ui/weekGoal';

const EMOJI = /\p{Extended_Pictographic}/u;
const SEED = 2424;
const BIG = 400_000_000;
/** The week whose report opens the summary; the next week (SIZE_GOAL_FIRST_WEEK) has a size goal. */
const INDEX = SIZE_GOAL_FIRST_WEEK - 1;

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function row(index: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue: BIG, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/** `n` staff members, copies of the first candidate with their own ids. */
function setStaff(state: GameState, n: number): void {
  const base = state.candidates[0] as unknown as Staff;
  state.staff = Array.from({ length: n }, (_, i) => ({ ...base, id: 9000 + i, role: 'barista' as const }));
}

/** A normal game at level SCALED_GOAL_MIN_LEVEL on week INDEX's scored last-day report, with `staff` and the price policy. */
function atReport(staff: number, price: PolicyLevel): GameState {
  const state = createNewGame('Quán Cỡ', 'normal', SEED);
  const startedDay = (INDEX - 1) * WEEK_LENGTH + 1;
  state.shopLevel = SCALED_GOAL_MIN_LEVEL;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = 'report';
  state.week = {
    length: WEEK_LENGTH,
    index: INDEX,
    startedDay,
    plan: rollWeekPlan(SEED, INDEX),
    goal: weekGoal('normal', INDEX),
    archive: [INDEX - 3, INDEX - 2, INDEX - 1, INDEX].map(row),
  };
  state.week.result = { revenue: BIG, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
  setStaff(state, staff);
  state.policies = { price, wage: 'standard' };
  return state;
}

/** Day 1 of week SIZE_GOAL_FIRST_WEEK through the real rollover, with the size goal set. */
function inSizeWeek(staff: number, price: PolicyLevel): GameState {
  const state = atReport(staff, price);
  expect(startNextDay(state)).toBe(true);
  expect(typeof state.week!.goal.profit).toBe('number');
  return state;
}

function mountTasks(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  renderTasksPanel(body, ctx).update?.(state);
  return body;
}

function openWeekEnd(state: GameState): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  shell.startGame(state);
  shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
  expect(el.hidden).toBe(false);
  return el;
}

const STATES: { name: string; staff: number; price: PolicyLevel; hint: string | null }[] = [
  { name: '<2 staff, standard price', staff: 1, price: 'standard', hint: 'Thuê thêm người, đặt giá Cao để vượt mục tiêu.' },
  { name: '2-3 staff, standard price', staff: 3, price: 'standard', hint: 'Thuê đủ 4 người, đặt giá Cao để vượt mục tiêu.' },
  { name: '4 staff, low price', staff: 4, price: 'low', hint: 'Đặt giá Cao để vượt mục tiêu.' },
  { name: '4 staff, Cao price (all good)', staff: 4, price: 'high', hint: null },
];

describe('sizeGoalHint by shop state (UX-301)', () => {
  it.each([
    [0, 'standard', 'Thuê thêm người, đặt giá Cao để vượt mục tiêu.'],
    [1, 'high', 'Thuê thêm người để vượt mục tiêu.'],
    [2, 'high', 'Thuê đủ 4 người để vượt mục tiêu.'],
    [3, 'low', 'Thuê đủ 4 người, đặt giá Cao để vượt mục tiêu.'],
    [4, 'standard', 'Đặt giá Cao để vượt mục tiêu.'],
    [4, 'high', null],
    [6, 'high', null],
  ] as const)('%i staff, price %s', (staff, price, want) => {
    const state = atReport(staff, price);
    expect(sizeGoalHint(state)).toBe(want);
  });

  it('a save without policies reads as standard price', () => {
    const state = atReport(4, 'high');
    delete state.policies;
    expect(sizeGoalHint(state)).toBe('Đặt giá Cao để vượt mục tiêu.');
  });
});

describe('size goal number text (UX-303)', () => {
  it('says it is the goal, shows the usual level and never says "thường lãi"', () => {
    const p = 12_000_000;
    expect(sizeGoalUsualProfit(p)).toBe(8_000_000);
    expect(sizeGoalNumberText(p)).toBe(`Mục tiêu lãi ${formatMoney(p)}, quán cỡ này thường đạt khoảng ${formatMoney(8_000_000)}.`);
    expect(sizeGoalLineText(p)).toBe(`${SIZE_GOAL_TEXT}: lãi ${formatMoney(p)}, quán cỡ này thường đạt khoảng ${formatMoney(8_000_000)}.`);
    for (const t of [sizeGoalNumberText(p), sizeGoalLineText(p)]) expect(t).not.toContain('thường lãi');
  });
});

describe('Mục tiêu tuần (Việc) by shop state', () => {
  it.each(STATES)('$name', ({ staff, price, hint }) => {
    const state = inSizeWeek(staff, price);
    const profit = state.week!.goal.profit!;
    const view = weekGoalView(state)!;
    expect(view.size?.hint).toBe(hint);

    const body = mountTasks(state);
    const block = body.querySelector('[data-block="week-goal"]')!;
    expect(block.querySelector('[data-goal="size"]')?.textContent).toBe(SIZE_GOAL_TEXT);
    expect(block.querySelector('[data-goal="size-num"]')?.textContent).toBe(sizeGoalNumberText(profit));
    const hints = block.querySelectorAll('[data-goal="size-hint"]');
    if (hint) {
      expect(hints).toHaveLength(1);
      expect(hints[0]!.textContent).toBe(hint);
    } else expect(hints).toHaveLength(0);
    expect(body.textContent).not.toContain('thường lãi');
    expect(body.textContent).not.toMatch(EMOJI);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // The block built from the view alone shows the same lines.
    expect(weekGoalBlock(view).querySelectorAll('[data-goal="size-hint"]')).toHaveLength(hint ? 1 : 0);
  });
});

describe('Week-end summary: size line and hint under "Mục tiêu:" (UX-303)', () => {
  it.each(STATES)('$name', ({ staff, price, hint }) => {
    const state = atReport(staff, price);
    const { goal } = nextWeekGoal(state);
    expect(typeof goal.profit).toBe('number');
    const el = openWeekEnd(state);
    const next = el.querySelector<HTMLElement>('[data-block="next-week"]')!;
    const lines = [...next.children].map((c) => c.getAttribute('data-next'));
    const at = lines.indexOf('goal');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(lines[at + 1]).toBe('size');
    expect(next.querySelector('[data-next="goal"]')!.textContent).toMatch(/^Mục tiêu: /);
    expect(next.querySelector('[data-next="size"]')!.textContent).toBe(sizeGoalLineText(goal.profit!));
    const hintEl = next.querySelector('[data-next="size-hint"]');
    if (hint) {
      expect(lines[at + 2]).toBe('size-hint');
      expect(hintEl?.textContent).toBe(hint);
      // The sentence is the line's last span, so it wraps beside its icon at 390 px (.wk-next p > span:last-child).
      expect(hintEl!.lastElementChild?.tagName).toBe('SPAN');
    } else expect(hintEl).toBeNull();
    expect(next.querySelector('[data-next="size"]')!.lastElementChild?.tagName).toBe('SPAN');
    expect(el.textContent).not.toContain('thường lãi');
    expect(el.textContent).not.toMatch(EMOJI);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a week whose next goal is not a size goal shows no size line', () => {
    const state = atReport(1, 'standard');
    state.shopLevel = SCALED_GOAL_MIN_LEVEL - 1;
    expect(nextWeekGoal(state).goal.profit).toBeUndefined();
    const next = openWeekEnd(state).querySelector('[data-block="next-week"]')!;
    expect(next.querySelector('[data-next="size"]')).toBeNull();
    expect(next.querySelector('[data-next="size-hint"]')).toBeNull();
  });
});
