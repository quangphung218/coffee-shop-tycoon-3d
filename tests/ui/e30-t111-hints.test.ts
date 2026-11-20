// @vitest-environment jsdom
// T-111: size goal hint routes to Menu, week 2-8 hire hints, uncarried-drink pill.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch as simDispatch, step } from '../../src/sim';
import { startNextDay } from '../../src/sim/clock';
import { SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_FIRST_WEEK, WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, Staff, StaffRole, WeekSummary } from '../../src/sim/types';
import { rollWeekPlan } from '../../src/sim/week';
import { CARRY_HINT_MINUTES, CARRY_HINT_TEXT, createCarryHint } from '../../src/ui/hud/carryHint';
import { registerPrepPanels } from '../../src/ui/panels';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { weekOneHints } from '../../src/ui/screens/weekEnd';
import { sizeGoalHint } from '../../src/ui/weekGoal';

const EMOJI = /\p{Extended_Pictographic}/u;
const SEED = 2424;

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function boot(): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 99 });
  return { root, shell };
}

function setStaff(state: GameState, roles: StaffRole[]): void {
  const base = state.candidates[0] as unknown as Staff;
  state.staff = roles.map((role, i) => ({ ...base, id: 9000 + i, role, task: null }));
}

function row(index: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue: 1, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/** Week `index` ended on its scored last-day report with `cups` cups and `staff`. */
function atWeekEnd(index: number, cups: number, staff: StaffRole[], level = 3): GameState {
  const state = createNewGame('Quán Gợi Ý', 'normal', SEED);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.shopLevel = level;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = 'report';
  state.money = 0;
  state.week = {
    length: WEEK_LENGTH,
    index,
    startedDay,
    plan: rollWeekPlan(SEED, index),
    goal: weekGoal('normal', index),
    archive: Array.from({ length: index }, (_, i) => row(i + 1)),
  };
  state.week.result = { revenue: 1, revenueTarget: 1, stars: 4, starsTarget: 4, score: cups ? 50 : 0, cups, days: [] };
  setStaff(state, staff);
  return state;
}

function openWeekEnd(state: GameState): HTMLElement {
  const { root, shell: s } = boot();
  s.startGame(state);
  s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]')!;
  expect(el.hidden).toBe(false);
  return el;
}

const hintsOf = (el: HTMLElement): string[] => [...el.querySelectorAll('[data-block="week-hints"] [data-hint]')].map((li) => li.textContent ?? '');

describe('sizeGoalHint route (UX-405)', () => {
  it('3 cups: no price hint', () => {
    const state = atWeekEnd(SIZE_GOAL_FIRST_WEEK - 1, 3, ['barista', 'server']);
    expect(sizeGoalHint(state)).toBeNull();
  });

  it('the Việc hint "Mở Menu" opens the Menu panel', () => {
    const state = atWeekEnd(SIZE_GOAL_FIRST_WEEK - 1, 0, ['barista', 'server'], SCALED_GOAL_MIN_LEVEL);
    state.week!.archive = [SIZE_GOAL_FIRST_WEEK - 4, SIZE_GOAL_FIRST_WEEK - 3, SIZE_GOAL_FIRST_WEEK - 2, SIZE_GOAL_FIRST_WEEK - 1].map((i) => ({ ...row(i), revenue: 400_000_000 }));
    state.week!.result!.revenue = 400_000_000;
    expect(startNextDay(state)).toBe(true);
    expect(typeof state.week!.goal.profit).toBe('number');
    const off = registerPrepPanels();
    const { shell: s } = boot();
    s.startGame(state);
    s.hud.openPanel('tasks');
    expect(s.hud.openPanelId).toBe('tasks');
    const hint = s.hud.panelEl.querySelector<HTMLElement>('[data-goal="size-hint"]')!;
    expect(hint.textContent).toContain('Đặt giá Cao ở Menu mỗi tuần để lên 3 cúp');
    expect(hint.textContent).not.toMatch(EMOJI);
    hint.querySelector<HTMLButtonElement>('[data-goto="menu"]')!.click();
    expect(s.hud.openPanelId).toBe('menu');
    // A panel, no modal opens on the way.
    expect(s.report.visible).toBe(false);
    expect(s.screen).toBeNull();
    off();
  });
});

describe('Week-end weeks 2-8: hire hints under 2 cups and 2 staff', () => {
  it('week 2 ended with 1 cup and 0 staff: Thuê pha chế', () => {
    const el = openWeekEnd(atWeekEnd(2, 1, []));
    expect(hintsOf(el)).toEqual(['Thuê pha chế.']);
  });

  it('week 2 ended with 1 cup and 1 barista: Thuê người phục vụ', () => {
    const el = openWeekEnd(atWeekEnd(2, 1, ['barista']));
    expect(hintsOf(el)).toEqual(['Thuê người phục vụ.']);
    expect(el.textContent).not.toMatch(EMOJI);
  });

  it('a lone server is told to hire a barista', () => {
    expect(weekOneHints(atWeekEnd(5, 0, ['server']), 2)).toEqual(['Thuê pha chế']);
  });

  it.each([
    ['2 cups', 2, 2, ['barista']],
    ['2 staff', 2, 1, ['barista', 'server']],
    ['week 9', 9, 1, ['barista']],
    ['week 1 (its own block)', 1, 1, ['barista']],
  ] as const)('no block: %s', (_, index, cups, staff) => {
    const el = openWeekEnd(atWeekEnd(index, cups, [...staff]));
    expect(el.querySelector('[data-block="week-hints"]')).toBeNull();
  });

  it('week 1 keeps its one-staff rule', () => {
    expect(weekOneHints(atWeekEnd(1, 1, ['barista']))).toEqual([]);
  });
});

describe('Uncarried drink pill', () => {
  const FRAME = 2 / 60;

  /** Plays the open hours of the day; returns how many times the pill appeared. */
  function playDay(s: Shell, root: HTMLElement): number {
    const pill = root.querySelector<HTMLElement>('.carry-hint')!;
    expect(simDispatch(s.state!, { type: 'start_day' })).toBe(true);
    let shows = 0;
    let was = false;
    let guard = 0;
    while (s.state!.phase !== 'report') {
      step(s.state!, FRAME);
      s.update();
      s.state!.events = [];
      const now = !pill.hidden;
      if (now && !was) {
        shows += 1;
        expect(pill.textContent).toBe(CARRY_HINT_TEXT);
        // It waited CARRY_HINT_MINUTES with nobody carrying it.
        const order = s.state!.orders.find((o) => o.status === 'ready');
        expect(order).toBeDefined();
      }
      was = now;
      expect(++guard).toBeLessThan(200_000);
    }
    return shows;
  }

  it('1 barista who never carries: the pill shows exactly once a day, two days running', () => {
    const state = createNewGame('Quán Ly', 'normal', 7);
    state.day = 3;
    state.today = createDayStats(3, state.rating);
    setStaff(state, ['barista']);
    const { root, shell: s } = boot();
    s.startGame(state);
    expect(CARRY_HINT_TEXT).toBe('Ly đã pha xong, chạm để mang ra hoặc thuê người phục vụ');
    expect(CARRY_HINT_TEXT).not.toMatch(EMOJI);
    // Stock for both days, so the barista keeps brewing.
    for (const item of state.inventory) item.qty = 100_000;
    expect(playDay(s, root)).toBe(1);
    expect(simDispatch(s.state!, { type: 'next_day' })).toBe(true);
    s.update();
    expect(s.state!.day).toBe(4);
    expect(playDay(s, root)).toBe(1);
    // A pill, not a modal: the only dialog is the Daily Report that closes the day.
    const pill = root.querySelector<HTMLElement>('.carry-hint')!;
    expect(pill.tagName).toBe('BUTTON');
    expect(pill.getAttribute('role')).toBeNull();
    expect(pill.closest('[role="dialog"]')).toBeNull();
  });

  it('a tap carries the drink (deliver) and hides the pill', () => {
    const cmds: unknown[] = [];
    const hint = createCarryHint((cmd) => (cmds.push(cmd), true));
    const state = createNewGame('Quán Ly', 'normal', 7);
    setStaff(state, ['barista']);
    state.phase = 'opening';
    state.minute = 480;
    state.orders = [{ id: 77, customerId: 1, itemId: state.orders[0]?.itemId ?? ('espresso' as never), status: 'ready', remaining: 0, staffId: null }];
    hint.update(state, false);
    expect(hint.el.hidden).toBe(true);
    state.minute += CARRY_HINT_MINUTES - 1;
    hint.update(state, false);
    expect(hint.el.hidden).toBe(true);
    state.minute += 1;
    hint.update(state, false);
    expect(hint.el.hidden).toBe(false);
    hint.el.click();
    expect(cmds).toEqual([{ type: 'deliver', orderId: 77 }]);
    expect(hint.el.hidden).toBe(true);
  });

  it('no pill while a server carries it or with nobody hired', () => {
    const hint = createCarryHint(() => true);
    const state = createNewGame('Quán Ly', 'normal', 7);
    setStaff(state, ['barista', 'server']);
    state.phase = 'opening';
    state.minute = 480;
    state.orders = [{ id: 5, customerId: 1, itemId: 'espresso' as never, status: 'ready', remaining: 0, staffId: null }];
    state.staff[1]!.task = { kind: 'serve', targetId: 5, remaining: 2 };
    hint.update(state, false);
    state.minute += 30;
    hint.update(state, false);
    expect(hint.el.hidden).toBe(true);
    state.staff = [];
    hint.update(state, false);
    state.minute += 30;
    hint.update(state, false);
    expect(hint.el.hidden).toBe(true);
  });
});
