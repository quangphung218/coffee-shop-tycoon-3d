import { describe, expect, it } from 'vitest';
import { loadGame, saveGame } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { HISTORY_DAYS } from '../../src/sim/clock';
import { WEEK_GOALS, WEEK_LENGTH, weekGoal, weekGoalMaxMult } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { playDay, unlockedIds } from './helpers';

/**
 * P23 endless weeks: a normal game played 21 days in a row (three weeks), and
 * the same game saved on day 10, loaded and played on to day 21.
 */

const SEED = 2323;
const LAST_DAY = 3 * WEEK_LENGTH;
const SAVE_DAY = 10;
const GOAL_CAP = Math.round((WEEK_GOALS.normal.revenue * weekGoalMaxMult('normal')) / 100_000) * 100_000;

interface DayLog {
  day: number;
  /** Events of the day, from the morning (after next_day) to the report. */
  events: GameEvent[];
  /** What isUnlocked reports open on the morning, before the shop opens. */
  unlocked: Set<string>;
  historyLength: number;
  goalRevenue: number;
}

/** Plays from the morning of `state.day` through the report of `lastDay`, one log per day. */
function playTo(state: GameState, lastDay: number): DayLog[] {
  const logs: DayLog[] = [];
  for (;;) {
    const events = [...state.events];
    state.events = [];
    const unlocked = unlockedIds(state);
    const goalRevenue = state.week!.goal.revenue;
    dispatch(state, { type: 'apply_restock' });
    events.push(...playDay(state));
    logs.push({ day: state.day, events, unlocked, historyLength: state.history.length, goalRevenue });
    if (state.day >= lastDay) return logs;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
}

/** The whole state as a save would hold it, for exact comparisons. */
function snapshot(state: GameState): unknown {
  return JSON.parse(JSON.stringify({ ...state, events: [] }));
}

describe('endless weeks: 21 days in a row', { timeout: 300_000 }, () => {
  const state = createNewGame('Quán Ba Tuần', 'normal', SEED);
  const logs = playTo(state, LAST_DAY);

  it('plays every day to its report', () => {
    expect(logs.map((l) => l.day)).toEqual(Array.from({ length: LAST_DAY }, (_, i) => i + 1));
    expect(state.day).toBe(LAST_DAY);
    expect(state.phase).toBe('report');
  });

  it('ends a week on days 7, 14 and 21 and on no other day', () => {
    const ended = logs.filter((l) => l.events.some((e) => e.type === 'week_ended')).map((l) => l.day);
    expect(ended).toEqual([7, 14, 21]);
    for (const l of logs) expect(l.events.filter((e) => e.type === 'week_ended').length).toBeLessThanOrEqual(1);
  });

  it('archives one row per week, in order', () => {
    const archive = state.week!.archive!;
    expect(archive.map((w) => w.index)).toEqual([1, 2, 3]);
    expect(archive.map((w) => w.startedDay)).toEqual([1, 8, 15]);
    const results = logs.flatMap((l) => l.events.flatMap((e) => (e.type === 'week_ended' ? [e.result] : [])));
    expect(archive.map((w) => w.revenue)).toEqual(results.map((r) => r.revenue));
    expect(archive.map((w) => w.cups)).toEqual(results.map((r) => r.cups));
    expect(state.week!.result).toEqual(results[2]);
  });

  it(`keeps at most ${HISTORY_DAYS} days of history`, () => {
    for (const l of logs) expect(l.historyLength).toBeLessThanOrEqual(HISTORY_DAYS);
    expect(state.history.map((d) => d.day)).toEqual(Array.from({ length: LAST_DAY - 1 }, (_, i) => i + 1));
  });

  it('raises the week goal each week, never past the cap', () => {
    const goals = [1, 8, 15].map((d) => logs[d - 1]!.goalRevenue);
    expect(goals).toEqual([1, 2, 3].map((i) => weekGoal('normal', i).revenue));
    expect(goals[1]).toBeGreaterThan(goals[0]!);
    expect(goals[2]).toBeGreaterThan(goals[1]!);
    // Every day of a week keeps the goal it started with.
    for (const l of logs) expect(l.goalRevenue).toBe(goals[Math.floor((l.day - 1) / WEEK_LENGTH)]);
    for (const g of goals) expect(g).toBeLessThanOrEqual(GOAL_CAP);
    for (let i = 1; i <= 52; i++) expect(weekGoal('normal', i).revenue).toBeLessThanOrEqual(GOAL_CAP);
    expect(weekGoal('normal', 52).revenue).toBe(GOAL_CAP);
  });

  it('never locks again what was already open', () => {
    for (let i = 1; i < logs.length; i++) {
      const before = logs[i - 1]!.unlocked;
      const now = logs[i]!.unlocked;
      for (const id of before) expect(now.has(id), `${id} on day ${logs[i]!.day}`).toBe(true);
    }
    expect(unlockedIds(state).size).toBeGreaterThanOrEqual(logs[logs.length - 1]!.unlocked.size);
  });

  it('opens week 4 with its own goal on next_day, at least week 3\'s', () => {
    const g = JSON.parse(JSON.stringify(state)) as GameState;
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.day).toBe(LAST_DAY + 1);
    expect(g.week!.index).toBe(4);
    expect(g.week!.startedDay).toBe(LAST_DAY + 1);
    expect(g.week!.result).toBeUndefined();
    expect(g.week!.goal).toEqual(weekGoal('normal', 4));
    // Normal reaches its cap in week 3 (WEEK_GOAL_MULTS).
    expect(g.week!.goal.revenue).toBeGreaterThanOrEqual(logs[14]!.goalRevenue);
    expect(g.week!.goal.revenue).toBeLessThanOrEqual(GOAL_CAP);
  });
});

describe('endless weeks: save on day 10, load, play to day 21', { timeout: 300_000 }, () => {
  it('ends exactly like the game played without saving', () => {
    // Same run id, as the shell gives a running game; a save without one gets a derived id.
    const straight = { ...createNewGame('Quán Ba Tuần', 'normal', SEED), runId: 'run-1' };
    const straightLogs = playTo(straight, LAST_DAY);

    const first = { ...createNewGame('Quán Ba Tuần', 'normal', SEED), runId: 'run-1' };
    playTo(first, SAVE_DAY);
    expect(first.phase).toBe('report');
    expect(first.week!.index).toBe(2);
    // Mid-week 2: the save holds the same state as the straight run had on day 10.
    const storage = createMemoryStorage();
    expect(saveGame(first, '1', storage, 1000).ok).toBe(true);
    const loaded = loadGame('1', storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const g = loaded.value;
    expect(g.day).toBe(SAVE_DAY);
    expect(g.week!.index).toBe(2);
    expect(g.week!.startedDay).toBe(WEEK_LENGTH + 1);
    expect(g.week!.archive).toEqual(first.week!.archive);

    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    const resumedLogs = playTo(g, LAST_DAY);

    expect(resumedLogs.map((l) => l.day)).toEqual(Array.from({ length: LAST_DAY - SAVE_DAY }, (_, i) => SAVE_DAY + 1 + i));
    expect(resumedLogs.map((l) => l.events)).toEqual(straightLogs.slice(SAVE_DAY).map((l) => l.events));
    expect(g.week!.archive).toEqual(straight.week!.archive);
    expect(g.money).toBe(straight.money);
    expect(g.rating).toBe(straight.rating);
    expect(g.rngState).toBe(straight.rngState);
    expect(snapshot(g)).toEqual(snapshot(straight));
  });
});
