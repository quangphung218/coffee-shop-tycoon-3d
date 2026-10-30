// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { weekProfitTarget } from '../../src/sim/data/week';
import { buildDailyReport } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { Command, DayStats, GameState } from '../../src/sim/types';
import { scoreWeek, weekUpgradeCharge } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { createDailyReport } from '../../src/ui/report';
import { weekGoalView } from '../../src/ui/weekGoal';

const EMOJI = /\p{Extended_Pictographic}/u;

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function day(n: number, revenue: number, rating: number): DayStats {
  const d = createDayStats(n, rating);
  d.revenue = revenue;
  d.ingredientCost = revenue / 4;
  d.customersServed = 40;
  d.customersArrived = 40;
  d.ratingEnd = rating;
  return d;
}

/** A normal game in preparation on week day `days.length + 1`, `days` already played. */
function midWeek(days: DayStats[], rating = 4): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.history = days;
  state.day = days.length + 1;
  state.today = createDayStats(state.day, rating);
  state.rating = rating;
  return state;
}

/** A game with one barista hired: enough staff to run the counter. */
function withStaff(state: GameState): GameState {
  const c = state.candidates.find((s) => s.role === 'barista') ?? state.candidates[0]!;
  expect(simDispatch(state, { type: 'hire_staff', candidateId: c.id, role: c.role })).toBe(true);
  expect(state.staff.length).toBeGreaterThan(0);
  return state;
}

function mountTasks(state: GameState) {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => (sent.push(cmd), simDispatch(state, cmd)),
    getState: () => state,
    close: () => {},
  };
  const handle = renderTasksPanel(body, ctx);
  return { body, handle, sent };
}

function onReport(state: GameState): GameState {
  state.phase = 'report';
  state.lastReport = buildDailyReport(state);
  return state;
}

function mountReport(state: GameState) {
  const view = createDailyReport({ dispatch: () => true });
  document.body.append(view.el);
  view.update(state, true);
  return view.el;
}

const nums = (root: ParentNode, id: string) => q(root, `[data-goal="${id}"] .week-goal-num`).textContent;

afterEach(() => {
  document.body.replaceChildren();
});

describe('weekGoalView', () => {
  it('reads revenue, profit after the upgrade charge and stars from scoreWeek', () => {
    const state = midWeek([day(1, 4_000_000, 4), day(2, 4_000_000, 4)]);
    const v = weekGoalView(state)!;
    const r = scoreWeek(state)!;
    expect(v.bars.map((b) => b.id)).toEqual(['revenue', 'profit', 'stars']);
    expect(v.bars[0]!.value).toBe(r.revenue);
    expect(v.bars[1]!.value).toBe(r.profit);
    expect(v.bars[1]!.target).toBe(weekProfitTarget('normal', state.week!.goal.revenue));
    expect(v.bars[2]!.target).toBe(state.week!.goal.stars);
    expect(v.cups).toBe(r.cups);
    expect(v.score).toBe(r.score);
  });

  it('is null for an old save without week data', () => {
    const state = createNewGame('Quán Thử', 'normal', 42);
    delete state.week;
    expect(weekGoalView(state)).toBeNull();
  });
});

describe('Việc panel: live week goal', () => {
  it('shows three bars and the cups line with enough staff', () => {
    const state = withStaff(midWeek([day(1, 3_000_000, 3.9), day(2, 3_000_000, 3.9)], 3.9));
    const { body } = mountTasks(state);
    const block = q(body, '[data-block="week-goal"]');
    expect(block.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
    expect(nums(block, 'revenue')).toBe(`6.000.000đ / 32.000.000đ`);
    expect(nums(block, 'stars')).toBe('3,9 / 4,0');
    const v = weekGoalView(state)!;
    expect(q(block, '[data-goal="cups"]').textContent).toContain(`Đang hướng tới ${v.cups} cúp`);
    expect(block.querySelector('[data-goal="charge"]')).toBeNull();
    expect(EMOJI.test(block.textContent ?? '')).toBe(false);
  });

  it('updates the profit bar and shows the upgrade charge right after buying', () => {
    const state = midWeek([day(1, 5_000_000, 4)]);
    state.money = 50_000_000;
    const { body, handle } = mountTasks(state);
    const before = nums(body, 'profit');
    const profitBefore = weekGoalView(state)!.bars[1]!.value;
    expect(simDispatch(state, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    handle.update!(state);
    const charge = weekUpgradeCharge(state);
    expect(charge).toBeGreaterThan(0);
    expect(weekGoalView(state)!.bars[1]!.value).toBe(profitBefore - charge);
    expect(nums(body, 'profit')).not.toBe(before);
    expect(q(body, '[data-goal="charge"]').textContent).toBe(`Nâng cấp tuần này gánh: ${formatMoney(charge)}`);
  });

  it('keeps the profit bar and hides the charge line when there is not enough money', () => {
    const state = midWeek([day(1, 5_000_000, 4)]);
    state.money = 0;
    const { body, handle } = mountTasks(state);
    const before = nums(body, 'profit');
    expect(simDispatch(state, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(false);
    handle.update!(state);
    expect(nums(body, 'profit')).toBe(before);
    expect(body.querySelector('[data-goal="charge"]')).toBeNull();
  });

  it('heads for 3 cups when every target is met', () => {
    const days = Array.from({ length: 6 }, (_, i) => day(i + 1, 6_000_000, 4.5));
    const state = midWeek(days, 4.5);
    const { body } = mountTasks(state);
    expect(q(body, '[data-goal="cups"]').textContent).toContain('Đang hướng tới 3 cúp');
    for (const id of ['revenue', 'profit', 'stars']) {
      expect(q(body, `[data-goal="${id}"]`).classList.contains('is-done')).toBe(true);
    }
  });

  it('hides the block for an old save without week data', () => {
    const state = createNewGame('Quán Thử', 'normal', 42);
    delete state.week;
    const { body } = mountTasks(state);
    expect(body.querySelector('[data-block="week-goal"]')).toBeNull();
  });
});

describe('Daily report weekStrip: live week goal', () => {
  it('shows the three bars and the cups line under the week day', () => {
    const state = onReport(midWeek([day(1, 4_000_000, 4), day(2, 4_000_000, 4)]));
    const el = mountReport(state);
    const strip = q(el, '[data-block="week"]');
    expect(strip.textContent).toContain('Tuần 1');
    expect(strip.querySelectorAll('[data-block="week-goal"] [role="progressbar"]')).toHaveLength(3);
    expect(q(strip, '[data-goal="cups"]').textContent).toContain(`Đang hướng tới ${weekGoalView(state)!.cups} cúp`);
    expect(EMOJI.test(strip.textContent ?? '')).toBe(false);
  });

  it('lists the upgrade charge when this week bought one', () => {
    const state = midWeek([day(1, 5_000_000, 4)]);
    state.today.upgradeCost = 2_000_000;
    const el = mountReport(onReport(state));
    // Week 1 pays half, like later weeks (E-11).
    expect(q(el, '[data-goal="charge"]').textContent).toBe('Nâng cấp tuần này gánh: 1.000.000đ');
  });

  it('heads for 3 cups when every target is met', () => {
    const days = Array.from({ length: 6 }, (_, i) => day(i + 1, 6_000_000, 4.5));
    const el = mountReport(onReport(midWeek(days, 4.5)));
    expect(q(el, '[data-goal="cups"]').textContent).toContain('Đang hướng tới 3 cúp');
  });

  it('hides the week strip for an old save without week data', () => {
    const state = midWeek([day(1, 4_000_000, 4)]);
    delete state.week;
    const el = mountReport(onReport(state));
    expect(el.querySelector('[data-block="week"]')).toBeNull();
    expect(el.querySelector('[data-block="week-goal"]')).toBeNull();
  });
});
