import { describe, expect, it } from 'vitest';
import { MENU } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { DayEventId, GameEvent, GameState, Weather } from '../../src/sim/types';
import { getShopLayout } from '../../src/sim/upgrades';
import { HISTORY_DAYS } from '../../src/sim/clock';
import { rollWeekPlan, todayPlan } from '../../src/sim/week';
import { playDay } from './helpers';

const SEED = 12345;
/** Seeds averaged for the controlled comparisons, so one lucky RNG run cannot flip them. */
const SEEDS = [12345, 777, 20261016];
/** Week day the controlled comparisons replay (a mid-week morning, after two played days). */
const REPLAY_DAY = 3;

interface DayRow {
  day: number;
  weather: Weather;
  event: DayEventId;
  customersArrived: number;
  revenue: number;
  ingredientCost: number;
  cups: number;
  costPerCup: number;
}

interface WeekRun {
  state: GameState;
  rows: DayRow[];
  /** Ids of the menu items and upgrades unlocked on the morning of each week day. */
  unlocked: Set<string>[];
  /** Events of each day, from its morning to its report. */
  events: GameEvent[][];
}

/** Every menu item and upgrade that isUnlocked reports open right now. */
function unlockedIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const m of MENU) if (isUnlocked(state, 'menu', m.id)) ids.add(`menu:${m.id}`);
  for (const u of UPGRADES) if (isUnlocked(state, 'upgrade', u.id)) ids.add(`upgrade:${u.id}`);
  return ids;
}

/** Today's row from the daily report, the plan and the cups sold. */
function rowOf(state: GameState): DayRow {
  const report = state.lastReport;
  expect(report?.day).toBe(state.day);
  const plan = todayPlan(state);
  expect(plan).not.toBeNull();
  const cups = Object.values(state.today.sold).reduce((s, n) => s + (n ?? 0), 0);
  return {
    day: state.day,
    weather: state.weather,
    event: plan!.event,
    customersArrived: report!.customersArrived,
    revenue: report!.revenue,
    ingredientCost: report!.ingredientCost,
    cups,
    costPerCup: cups > 0 ? Math.round(report!.ingredientCost / cups) : 0,
  };
}

/** Plays a Normal week on one seed with the basic strategy: restock as suggested, serve alone. */
function playWeek(seed: number): WeekRun {
  const state = createNewGame('Quán Tuần', 'normal', seed);
  const rows: DayRow[] = [];
  const unlocked: Set<string>[] = [];
  const events: GameEvent[][] = [];
  for (let i = 0; i < WEEK_LENGTH; i++) {
    state.events = [];
    if (i > 0) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    const morning = state.events;
    state.events = [];
    unlocked.push(unlockedIds(state));
    dispatch(state, { type: 'apply_restock' });
    events.push([...morning, ...playDay(state)]);
    rows.push(rowOf(state));
  }
  return { state, rows, unlocked, events };
}

function formatTable(rows: readonly DayRow[]): string {
  const head = ['day', 'weather', 'event', 'arrived', 'revenue', 'ingCost', 'cups', 'cost/cup'];
  const body = rows.map((r) => [
    String(r.day),
    r.weather,
    r.event,
    String(r.customersArrived),
    r.revenue.toLocaleString('en-US'),
    r.ingredientCost.toLocaleString('en-US'),
    String(r.cups),
    r.costPerCup.toLocaleString('en-US'),
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...body.map((b) => b[c]!.length)));
  const line = (cells: string[]) => cells.map((cell, c) => cell.padEnd(widths[c]!)).join(' | ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('-|-'), ...body.map(line)].join('\n');
}

describe('a 7-day week on one seed', { timeout: 120_000 }, () => {
  const run = playWeek(SEED);
  console.log(`Week, Normal, seed ${SEED}\n${formatTable(run.rows)}`);

  it('plays the planned weather and event on each of the 7 days', () => {
    expect(run.rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(run.rows.map((r) => ({ day: r.day, weather: r.weather, event: r.event }))).toEqual(run.state.week!.plan);
    for (const r of run.rows) {
      expect(r.customersArrived, `day ${r.day}`).toBeGreaterThan(0);
      expect(r.revenue, `day ${r.day}`).toBeGreaterThan(0);
      expect(r.ingredientCost, `day ${r.day}`).toBeGreaterThan(0);
    }
  });

  it('has at least one variable every day', () => {
    for (const r of run.rows) expect(r.weather !== 'sunny' || r.event !== 'none', `day ${r.day}`).toBe(true);
  });

  it('never repeats the (weather, event) pair on two days in a row', () => {
    for (let i = 1; i < run.rows.length; i++) {
      const prev = run.rows[i - 1]!;
      const cur = run.rows[i]!;
      expect([cur.weather, cur.event], `day ${cur.day}`).not.toEqual([prev.weather, prev.event]);
    }
  });

  it('gives the same table when the seed is played again', () => {
    expect(playWeek(SEED).rows).toEqual(run.rows);
  });

  it('opens something new at least every 2 days and expands the shop on day 7', () => {
    for (let d = 1; d < WEEK_LENGTH; d++) {
      const prev = run.unlocked[d - 1]!;
      const cur = run.unlocked[d]!;
      for (const id of prev) expect(cur.has(id), `day ${d + 1} keeps ${id}`).toBe(true);
    }
    let gap = 0;
    for (let d = 1; d < WEEK_LENGTH; d++) {
      gap = run.unlocked[d]!.size > run.unlocked[d - 1]!.size ? 0 : gap + 1;
      expect(gap, `day ${d + 1}`).toBeLessThanOrEqual(2);
    }
    expect(run.unlocked[WEEK_LENGTH - 1]!.has('upgrade:expand_area')).toBe(true);
    expect(run.state.upgrades.expand_area ?? 0).toBeGreaterThanOrEqual(1);
    expect(getShopLayout(run.state).expansion).not.toBeNull();
    const morning7 = run.events[WEEK_LENGTH - 1]!;
    expect(morning7.some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(true);
    for (const day of run.events.slice(0, WEEK_LENGTH - 1)) {
      expect(day.some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(false);
    }
  });

  it('ends the week once, on day 7, and then lets next_day open week 2', () => {
    const ended = run.events.map((day) => day.filter((e) => e.type === 'week_ended').length);
    expect(ended).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(run.state.week!.result).toBeTruthy();
    expect(run.state.week!.archive).toHaveLength(1);
    expect(run.state.phase).toBe('report');
    const next = structuredClone(run.state);
    expect(dispatch(next, { type: 'next_day' })).toBe(true);
    expect(next.day).toBe(WEEK_LENGTH + 1);
    expect(next.week!.index).toBe(2);
    expect(next.phase).toBe('preparation');
  });
});

/** Days played back to back in the rolling-weeks run: two full weeks and one day of the third. */
const ROLLING_DAYS = 2 * WEEK_LENGTH + 1;

describe(`${ROLLING_DAYS} days in a row over rolling weeks`, { timeout: 180_000 }, () => {
  const state = createNewGame('Quán Cuốn Chiếu', 'normal', SEED);
  const plans: GameState['week'][] = [structuredClone(state.week)];
  const unlocked: Set<string>[] = [];
  const events: GameEvent[][] = [];
  const nextDay: boolean[] = [];
  for (let day = 1; day <= ROLLING_DAYS; day++) {
    if (day > 1) {
      expect(state.phase).toBe('report');
      state.events = [];
      nextDay.push(dispatch(state, { type: 'next_day' }));
      if (state.week!.startedDay === state.day) plans.push(structuredClone(state.week));
    }
    const morning = state.events;
    state.events = [];
    unlocked.push(unlockedIds(state));
    dispatch(state, { type: 'apply_restock' });
    events.push([...morning, ...playDay(state)]);
  }

  it('never refuses next_day from the report', () => {
    expect(nextDay).toHaveLength(ROLLING_DAYS - 1);
    expect(nextDay.every(Boolean)).toBe(true);
    expect(state.day).toBe(ROLLING_DAYS);
  });

  it('ends a week on days 7 and 14 and reaches week 3', () => {
    const ended = events.map((day, i) => (day.some((e) => e.type === 'week_ended') ? i + 1 : 0)).filter(Boolean);
    expect(ended).toEqual([WEEK_LENGTH, 2 * WEEK_LENGTH]);
    expect(state.week!.index).toBe(3);
    expect(state.week!.startedDay).toBe(2 * WEEK_LENGTH + 1);
    expect(state.week!.result).toBeUndefined();
    expect(state.week!.archive!.map((w) => [w.index, w.startedDay])).toEqual([
      [1, 1],
      [2, WEEK_LENGTH + 1],
    ]);
    for (const w of state.week!.archive!) {
      expect(w.revenue, `week ${w.index}`).toBeGreaterThan(0);
      expect(w.customersServed, `week ${w.index}`).toBeGreaterThan(0);
    }
  });

  it('plays a new plan each week, with the grand opening in week 1 only', () => {
    expect(plans.map((w) => w!.index)).toEqual([1, 2, 3]);
    expect(plans[1]!.plan).not.toEqual(plans[0]!.plan);
    expect(plans[2]!.plan).not.toEqual(plans[1]!.plan);
    expect(plans[0]!.plan).toEqual(rollWeekPlan(SEED, 1));
    expect(plans[1]!.plan).toEqual(rollWeekPlan(SEED, 2));
    for (const w of plans.slice(1)) expect(w!.plan.some((p) => p.event === 'grand_opening')).toBe(false);
    expect(plans[1]!.goal.revenue).toBeGreaterThan(plans[0]!.goal.revenue);
  });

  it('never locks again what week 1 opened, and does not replay its calendar', () => {
    for (let d = 1; d < ROLLING_DAYS; d++) {
      for (const id of unlocked[d - 1]!) expect(unlocked[d]!.has(id), `day ${d + 1} keeps ${id}`).toBe(true);
    }
    for (const day of events.slice(WEEK_LENGTH)) {
      expect(day.some((e) => e.type === 'week_unlocks')).toBe(false);
      expect(day.some((e) => e.type === 'notify' && e.text === 'Quán mở rộng!')).toBe(false);
    }
  });
});

describe('history over a long game', () => {
  it(`keeps the last ${HISTORY_DAYS} days only`, () => {
    const state = createNewGame('Quán Dài', 'normal', SEED);
    for (let day = 1; day <= HISTORY_DAYS + 5; day++) {
      if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
      playDay(state, { play: false });
    }
    expect(state.history).toHaveLength(HISTORY_DAYS);
    expect(state.history.map((d) => d.day)).toEqual(Array.from({ length: HISTORY_DAYS }, (_, i) => i + 5));
    expect(state.week!.archive).toHaveLength(4);
  });
});

/** The morning of REPLAY_DAY on a seed, after playing the days before it. */
function replayMorning(seed: number): GameState {
  const state = createNewGame('Quán So Sánh', 'normal', seed);
  for (let day = 1; day < REPLAY_DAY; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    dispatch(state, { type: 'apply_restock' });
    playDay(state);
  }
  expect(dispatch(state, { type: 'next_day' })).toBe(true);
  expect(state.day).toBe(REPLAY_DAY);
  return state;
}

/** Plays a copy of `morning` with today's weather and event replaced. */
function playAs(morning: GameState, weather: Weather, event: DayEventId): DayRow {
  const state = structuredClone(morning);
  const plan = state.week!.plan;
  plan[REPLAY_DAY - 1] = { day: REPLAY_DAY, weather, event };
  state.weather = weather;
  dispatch(state, { type: 'apply_restock' });
  playDay(state);
  return rowOf(state);
}

function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

describe('controlled day effects, mean of 3 seeds', { timeout: 120_000 }, () => {
  const mornings = SEEDS.map(replayMorning);
  const variants = {
    plain: mornings.map((m) => playAs(m, 'sunny', 'none')),
    fair: mornings.map((m) => playAs(m, 'sunny', 'fair')),
    rainy: mornings.map((m) => playAs(m, 'rainy', 'none')),
    hike: mornings.map((m) => playAs(m, 'sunny', 'supplier_hike')),
  };
  const rows = Object.entries(variants).flatMap(([name, rs]) =>
    rs.map((r, i) => `${name.padEnd(5)} seed ${String(SEEDS[i]).padEnd(8)} arrived ${r.customersArrived} cost/cup ${r.costPerCup}`),
  );
  console.log(`Day ${REPLAY_DAY} replayed, Normal\n${rows.join('\n')}`);

  const arrived = (rs: DayRow[]) => mean(rs.map((r) => r.customersArrived));
  const costPerCup = (rs: DayRow[]) => mean(rs.map((r) => r.costPerCup));

  it('brings more customers on a fair than on a plain day', () => {
    expect(arrived(variants.fair)).toBeGreaterThan(arrived(variants.plain));
  });

  it('brings fewer customers on a rainy day than on a sunny one', () => {
    expect(arrived(variants.rainy)).toBeLessThan(arrived(variants.plain));
  });

  it('costs more per cup on a supplier hike day', () => {
    expect(costPerCup(variants.hike)).toBeGreaterThan(costPerCup(variants.plain));
    // Same drinks at 1.25× ingredient prices; the menu mix shifts a little between runs.
    expect(costPerCup(variants.hike) / costPerCup(variants.plain)).toBeGreaterThan(1.1);
  });
});
