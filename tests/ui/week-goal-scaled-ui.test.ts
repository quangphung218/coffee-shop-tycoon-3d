// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { startNextDay } from '../../src/sim/clock';
import { SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_FIRST_WEEK, WEEK_LENGTH, sizeGoal, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, WeekSummary } from '../../src/sim/types';
import { isWeekGoalScaled, nextWeekGoal, rollWeekPlan, totalUpgradeLevels } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { nextWeekGoalText } from '../../src/ui/screens/weekEnd';
import { SCALED_GOAL_TEXT, sizeGoalHint, weekGoalBlock, weekGoalView } from '../../src/ui/weekGoal';

const EMOJI = /\p{Extended_Pictographic}/u;
const SEED = 1919;
/** Recent weekly revenue well above weekGoal for week 8, so the scaled rule sets the target. */
const BIG = 400_000_000;
/** Week 7: the next week is still before SIZE_GOAL_FIRST_WEEK, where the E-19 rule holds. */
const INDEX = 7;

function row(index: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue: BIG, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/** A normal game at shop level `level` on the report of week INDEX's last day, scored, the last 4 weeks at BIG revenue. */
function atWeekReport(level: number, index = INDEX): GameState {
  const state = createNewGame('Quán Lớn', 'normal', SEED);
  const startedDay = (index - 1) * WEEK_LENGTH + 1;
  state.shopLevel = level;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = 'report';
  const archive = [index - 3, index - 2, index - 1, index].map(row);
  state.week = { length: WEEK_LENGTH, index, startedDay, plan: rollWeekPlan(SEED, index), goal: weekGoal('normal', index), archive };
  state.week.result = { revenue: BIG, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
  return state;
}

/** Day 1 of the next week, reached through the real rollover. */
function nextWeek(level: number, index = INDEX): GameState {
  const state = atWeekReport(level, index);
  expect(startNextDay(state)).toBe(true);
  expect(state.week!.index).toBe(index + 1);
  return state;
}

function mountTasks(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} };
  const handle = renderTasksPanel(body, ctx);
  handle.update?.(state);
  return body;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Mục tiêu tuần: scaled goal line', () => {
  it(`shows "${SCALED_GOAL_TEXT}" from level ${SCALED_GOAL_MIN_LEVEL} when the goal is scaled`, () => {
    const state = nextWeek(SCALED_GOAL_MIN_LEVEL);
    expect(isWeekGoalScaled(state)).toBe(true);
    const view = weekGoalView(state)!;
    expect(view.scaled).toBe(true);
    const line = weekGoalBlock(view).querySelector('[data-goal="scaled"]');
    expect(line?.textContent).toBe('Quán đã lớn: mục tiêu theo 4 tuần gần nhất');

    const body = mountTasks(state);
    const panelLine = body.querySelector('[data-block="week-goal"] [data-goal="scaled"]');
    expect(panelLine?.textContent).toBe(SCALED_GOAL_TEXT);
    expect(body.textContent).not.toMatch(EMOJI);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it(`is not shown before level ${SCALED_GOAL_MIN_LEVEL}, with the same revenue`, () => {
    const state = nextWeek(SCALED_GOAL_MIN_LEVEL - 1);
    expect(isWeekGoalScaled(state)).toBe(false);
    const view = weekGoalView(state)!;
    expect(view.scaled).toBe(false);
    expect(weekGoalBlock(view).querySelector('[data-goal="scaled"]')).toBeNull();

    const body = mountTasks(state);
    expect(body.querySelector('[data-block="week-goal"]')).not.toBeNull();
    expect(body.querySelector('[data-goal="scaled"]')).toBeNull();
    expect(body.textContent).not.toContain(SCALED_GOAL_TEXT);
  });
});

describe('Mục tiêu tuần: size goal line (E-21)', () => {
  it(`from week ${SIZE_GOAL_FIRST_WEEK} at level ${SCALED_GOAL_MIN_LEVEL} shows the size line and one hint in place of the scaled line`, () => {
    const state = nextWeek(SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_FIRST_WEEK - 1);
    const levels = totalUpgradeLevels(state);
    const row = sizeGoal('normal', levels);
    expect(state.week!.goal.profit).toBe(row.profit);
    expect(state.week!.goal.levels).toBe(levels);

    const view = weekGoalView(state)!;
    expect(view.size).toEqual({ levels, profit: row.profit });
    const block = weekGoalBlock(view);
    expect(block.querySelector('[data-goal="size"]')?.textContent).toBe(`Mục tiêu theo cỡ quán (${levels} cấp nâng cấp)`);
    expect(block.querySelector('[data-goal="size-hint"]')?.textContent).toBe(
      `Quán cỡ này thường lãi ${formatMoney(row.profit)}. Thuê người thứ hai, chỉnh giá để vượt.`,
    );
    expect(block.querySelector('[data-goal="scaled"]')).toBeNull();

    const body = mountTasks(state);
    const goalBlock = body.querySelector('[data-block="week-goal"]')!;
    expect(goalBlock.querySelector('[data-goal="size"]')?.textContent).toBe(`Mục tiêu theo cỡ quán (${levels} cấp nâng cấp)`);
    expect(goalBlock.querySelectorAll('[data-goal="size-hint"]')).toHaveLength(1);
    expect(body.textContent).not.toContain(SCALED_GOAL_TEXT);
    expect(body.textContent).not.toMatch(EMOJI);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('N is the levels at week start, not after a mid-week upgrade', () => {
    const state = nextWeek(SCALED_GOAL_MIN_LEVEL, SIZE_GOAL_FIRST_WEEK - 1);
    const start = state.week!.goal.levels!;
    state.upgrades = { ...state.upgrades, tables: ((state.upgrades.tables as number | undefined) ?? 0) + 1 };
    expect(totalUpgradeLevels(state)).toBe(start + 1);
    expect(weekGoalView(state)!.size!.levels).toBe(start);
  });

  it('E-19 goal weeks keep the old line and show no size line', () => {
    const state = nextWeek(SCALED_GOAL_MIN_LEVEL);
    expect(state.week!.goal.profit).toBeUndefined();
    const view = weekGoalView(state)!;
    expect(view.size).toBeUndefined();
    const block = weekGoalBlock(view);
    expect(block.querySelector('[data-goal="scaled"]')?.textContent).toBe(SCALED_GOAL_TEXT);
    expect(block.querySelector('[data-goal="size"]')).toBeNull();
    expect(block.querySelector('[data-goal="size-hint"]')).toBeNull();
  });

  it('sizeGoalHint formats money like the other values', () => {
    expect(sizeGoalHint(12_300_000)).toBe(`Quán cỡ này thường lãi ${formatMoney(12_300_000)}. Thuê người thứ hai, chỉnh giá để vượt.`);
  });
});

describe('week-end next-week preview', () => {
  it(`at level ${SCALED_GOAL_MIN_LEVEL}+ shows the scaled target the next week will get`, () => {
    const state = atWeekReport(SCALED_GOAL_MIN_LEVEL);
    const { goal, scaled } = nextWeekGoal(state);
    expect(scaled).toBe(true);
    expect(goal.revenue).toBeGreaterThan(weekGoal('normal', INDEX + 1).revenue);
    const text = nextWeekGoalText(state);
    expect(text).toContain(`Mục tiêu: ${formatMoney(goal.revenue)} doanh thu`);
    expect(text).not.toContain(`${formatMoney(weekGoal('normal', INDEX + 1).revenue)} doanh thu`);

    // The preview matches what the rollover then sets.
    expect(startNextDay(state)).toBe(true);
    expect(state.week!.goal.revenue).toBe(goal.revenue);
  });

  it(`below level ${SCALED_GOAL_MIN_LEVEL} keeps weekGoal`, () => {
    const state = atWeekReport(SCALED_GOAL_MIN_LEVEL - 1);
    expect(nextWeekGoalText(state)).toContain(`Mục tiêu: ${formatMoney(weekGoal('normal', INDEX + 1).revenue)} doanh thu`);
  });
});
