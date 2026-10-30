// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { startNextDay } from '../../src/sim/clock';
import { SCALED_GOAL_MIN_LEVEL, WEEK_LENGTH, weekGoal } from '../../src/sim/data/week';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameState, WeekSummary } from '../../src/sim/types';
import { isWeekGoalScaled, nextWeekGoal, rollWeekPlan } from '../../src/sim/week';
import { formatMoney } from '../../src/ui/core/format';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { nextWeekGoalText } from '../../src/ui/screens/weekEnd';
import { SCALED_GOAL_TEXT, weekGoalBlock, weekGoalView } from '../../src/ui/weekGoal';

const EMOJI = /\p{Extended_Pictographic}/u;
const SEED = 1919;
/** Recent weekly revenue well above weekGoal for week 12, so the scaled rule sets the target. */
const BIG = 400_000_000;
const INDEX = 12;

function row(index: number): WeekSummary {
  return { index, startedDay: (index - 1) * WEEK_LENGTH + 1, revenue: BIG, profit: 0, customersServed: 0, stars: 4, score: 0, cups: 0, upgradeCharge: 0 };
}

/** A normal game at shop level `level` on the report of week INDEX's last day, scored, the last 4 weeks at BIG revenue. */
function atWeekReport(level: number): GameState {
  const state = createNewGame('Quán Lớn', 'normal', SEED);
  const startedDay = (INDEX - 1) * WEEK_LENGTH + 1;
  state.shopLevel = level;
  state.day = startedDay + WEEK_LENGTH - 1;
  state.today = createDayStats(state.day, state.rating);
  state.phase = 'report';
  const archive = [INDEX - 3, INDEX - 2, INDEX - 1, INDEX].map(row);
  state.week = { length: WEEK_LENGTH, index: INDEX, startedDay, plan: rollWeekPlan(SEED, INDEX), goal: weekGoal('normal', INDEX), archive };
  state.week.result = { revenue: BIG, revenueTarget: 1, stars: 4, starsTarget: 4, score: 0, cups: 0, days: [] };
  return state;
}

/** Day 1 of the next week, reached through the real rollover. */
function nextWeek(level: number): GameState {
  const state = atWeekReport(level);
  expect(startNextDay(state)).toBe(true);
  expect(state.week!.index).toBe(INDEX + 1);
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
