import { describe, expect, it } from 'vitest';
import { weekGoal } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { buildDailyReport } from '../../src/sim/report';
import { createDayStats, createNewGame } from '../../src/sim/state';
import { bestDay, dayCompare, STAT_IDS, weekCompare, weekToDate, type StatId } from '../../src/sim/stats';
import type { DayStats, GameState, WeekSummary } from '../../src/sim/types';
import { scoreWeek } from '../../src/sim/week';

const SEED = 4242;

/** A closed day: revenue, ingredient cost, served/arrived/lost and the close rating. */
function day(n: number, revenue: number, served: number, arrived: number, lost: number, rating: number): DayStats {
  const d = createDayStats(n, rating);
  d.revenue = revenue;
  d.ingredientCost = revenue / 4;
  d.customersServed = served;
  d.customersArrived = arrived;
  d.customersLost = lost;
  d.ratingEnd = rating;
  return d;
}

/** A game whose `today` is the last of `days` with its report up; the others are in history. */
function onReport(days: DayStats[], mutate?: (state: GameState) => void): GameState {
  const state = createNewGame('Biên', 'normal', SEED);
  mutate?.(state);
  state.history = days.slice(0, -1);
  state.today = days[days.length - 1]!;
  state.day = state.today.day;
  state.rating = state.today.ratingEnd;
  state.phase = 'report';
  state.lastReport = buildDailyReport(state);
  return state;
}

function byId<T extends { id: StatId }>(rows: T[]): Record<StatId, T> {
  return Object.fromEntries(rows.map((r) => [r.id, r])) as Record<StatId, T>;
}

function summary(index: number, startedDay: number, revenue: number, profit: number, served: number, stars: number): WeekSummary {
  return { index, startedDay, revenue, profit, customersServed: served, stars, score: 50, cups: 1 };
}

describe('dayCompare', () => {
  it('has no deltas on day 1', () => {
    const state = onReport([day(1, 400_000, 40, 50, 10, 3.6)]);
    const rows = dayCompare(state, state.lastReport!);
    expect(rows.map((r) => r.id)).toEqual(STAT_IDS);
    const r = byId(rows);
    expect(r.revenue.value).toBe(400_000);
    expect(r.profit.value).toBe(300_000);
    expect(r.customersServed.value).toBe(40);
    expect(r.abandonRate.value).toBeCloseTo(20);
    expect(r.stars.value).toBe(3.6);
    for (const row of rows) {
      expect(row.vsYesterday).toBeNull();
      expect(row.vsWeekAvg).toBeNull();
    }
  });

  it('compares a mid-week day with yesterday and the earlier days of the week', () => {
    const state = onReport([
      day(1, 200_000, 20, 25, 5, 3.0),
      day(2, 400_000, 40, 40, 0, 3.4),
      day(3, 500_000, 50, 50, 5, 3.8),
    ]);
    const r = byId(dayCompare(state, state.lastReport!));
    expect(r.revenue.vsYesterday).toBe(100_000);
    expect(r.revenue.vsWeekAvg).toBe(200_000);
    expect(r.profit.vsYesterday).toBe(75_000);
    expect(r.profit.vsWeekAvg).toBe(150_000);
    expect(r.customersServed.vsYesterday).toBe(10);
    expect(r.customersServed.vsWeekAvg).toBe(20);
    expect(r.abandonRate.vsYesterday).toBeCloseTo(10);
    expect(r.abandonRate.vsWeekAvg).toBeCloseTo(0);
    expect(r.stars.vsYesterday).toBeCloseTo(0.4);
    expect(r.stars.vsWeekAvg).toBeCloseTo(0.6);
  });

  it('keeps comparing with the report day once the next day has started', () => {
    const state = onReport([day(1, 200_000, 20, 25, 5, 3.0), day(2, 400_000, 40, 40, 0, 3.4)]);
    const report = state.lastReport!;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    const r = byId(dayCompare(state, report));
    expect(r.revenue.value).toBe(400_000);
    expect(r.revenue.vsYesterday).toBe(200_000);
    expect(r.revenue.vsWeekAvg).toBe(200_000);
  });

  it('on the first day of week 2 compares with yesterday but not with a week average', () => {
    const days = Array.from({ length: 8 }, (_, i) => day(i + 1, 100_000 * (i + 1), 10 * (i + 1), 10 * (i + 1), 0, 4));
    const state = onReport(days, (s) => {
      s.week = { ...s.week!, index: 2, startedDay: 8, goal: weekGoal('normal', 2) };
    });
    const r = byId(dayCompare(state, state.lastReport!));
    expect(r.revenue.vsYesterday).toBe(100_000);
    expect(r.revenue.vsWeekAvg).toBeNull();
  });

  it('after the day 7 report rolls into week 2, averages only week 2 days', () => {
    const week1 = Array.from({ length: 7 }, (_, i) => day(i + 1, 1_000_000, 50, 50, 0, 4));
    const state = onReport(week1);
    state.week!.result = scoreWeek(state)!;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    expect(state.week!.index).toBe(2);
    expect(state.week!.startedDay).toBe(8);

    // Week 2 day 1 (day 8): yesterday is day 7, but no week day before it.
    state.today = day(8, 300_000, 30, 30, 0, 4);
    state.phase = 'report';
    const first = byId(dayCompare(state, buildDailyReport(state)));
    expect(first.revenue.vsYesterday).toBe(-700_000);
    for (const row of Object.values(first)) expect(row.vsWeekAvg).toBeNull();

    // Week 2 day 2 (day 9): the week average is day 8 alone, not week 1's days.
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.today = day(9, 500_000, 40, 40, 0, 4);
    state.phase = 'report';
    const second = byId(dayCompare(state, buildDailyReport(state)));
    expect(second.revenue.vsYesterday).toBe(200_000);
    expect(second.revenue.vsWeekAvg).toBe(200_000);
    expect(second.customersServed.vsWeekAvg).toBe(10);
  });

  it('compares with yesterday only in a game without a week', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3), day(2, 300_000, 30, 30, 0, 3.2)], (s) => {
      delete s.week;
    });
    const r = byId(dayCompare(state, state.lastReport!));
    expect(r.revenue.vsYesterday).toBe(100_000);
    expect(r.revenue.vsWeekAvg).toBeNull();
  });
});

describe('weekToDate', () => {
  it('sums the finished days of the week and measures them against the goal', () => {
    const state = onReport([
      day(1, 200_000, 20, 25, 5, 3.0),
      day(2, 400_000, 40, 40, 0, 3.4),
      day(3, 600_000, 60, 60, 10, 3.8),
    ]);
    const w = weekToDate(state)!;
    expect(w.index).toBe(1);
    expect(w.days).toBe(3);
    expect(w.totals.revenue).toBe(1_200_000);
    expect(w.totals.profit).toBe(900_000);
    expect(w.totals.customersServed).toBe(120);
    expect(w.totals.abandonRate).toBeCloseTo(12);
    expect(w.totals.stars).toBe(3.8);
    expect(w.average!.revenue).toBe(400_000);
    expect(w.average!.customersServed).toBe(40);
    expect(w.goal).toEqual(state.week!.goal);
    expect(w.revenueProgress).toBeCloseTo(1_200_000 / state.week!.goal.revenue);
  });

  it('leaves out today until its report is up', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3), day(2, 400_000, 40, 40, 0, 3)]);
    state.phase = 'peak';
    const w = weekToDate(state)!;
    expect(w.days).toBe(1);
    expect(w.totals.revenue).toBe(200_000);
  });

  it('starts week 2 empty and counts only its own days', () => {
    const days = Array.from({ length: 8 }, (_, i) => day(i + 1, 100_000, 10, 10, 0, 4));
    days[7]!.revenue = 250_000;
    const state = onReport(days, (s) => {
      s.week = { ...s.week!, index: 2, startedDay: 8, goal: weekGoal('normal', 2) };
    });
    const w = weekToDate(state)!;
    expect(w.index).toBe(2);
    expect(w.days).toBe(1);
    expect(w.totals.revenue).toBe(250_000);
    state.phase = 'preparation';
    const empty = weekToDate(state)!;
    expect(empty.days).toBe(0);
    expect(empty.totals.revenue).toBe(0);
    expect(empty.average).toBeNull();
    expect(empty.revenueProgress).toBe(0);
  });

  it('is null in a game without a week', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3)], (s) => {
      delete s.week;
    });
    expect(weekToDate(state)).toBeNull();
  });
});

describe('weekCompare', () => {
  it('is null until two weeks are archived', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3)]);
    expect(weekCompare(state)).toBeNull();
    state.week!.archive = [summary(1, 1, 1_000_000, 700_000, 100, 3.8)];
    expect(weekCompare(state)).toBeNull();
  });

  it('compares the week just finished with the week before', () => {
    // Week 1: days 1–7, 10 lost of 100 a day; week 2: days 8–14, 5 lost of 100 a day.
    const days = Array.from({ length: 14 }, (_, i) =>
      day(i + 1, 100_000, 90, 100, i < 7 ? 10 : 5, 4),
    );
    const state = onReport(days, (s) => {
      s.week = {
        ...s.week!,
        index: 2,
        startedDay: 8,
        archive: [summary(1, 1, 700_000, 500_000, 630, 3.8), summary(2, 8, 1_000_000, 650_000, 700, 4.2)],
      };
    });
    const c = weekCompare(state)!;
    expect(c.current.index).toBe(2);
    expect(c.previous.index).toBe(1);
    expect(c.rows.map((r) => r.id)).toEqual(STAT_IDS);
    const r = byId(c.rows);
    expect(r.revenue).toEqual({ id: 'revenue', value: 1_000_000, previous: 700_000, delta: 300_000 });
    expect(r.profit.delta).toBe(150_000);
    expect(r.customersServed.delta).toBe(70);
    expect(r.stars.delta).toBeCloseTo(0.4);
    expect(r.abandonRate.value).toBeCloseTo(5);
    expect(r.abandonRate.previous).toBeCloseTo(10);
    expect(r.abandonRate.delta).toBeCloseTo(-5);
  });

  it('has no abandon rate for a week whose days left the history', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i + 8, 100_000, 90, 100, 5, 4));
    const state = onReport(days, (s) => {
      s.week = {
        ...s.week!,
        index: 2,
        startedDay: 8,
        archive: [summary(1, 1, 700_000, 500_000, 630, 3.8), summary(2, 8, 700_000, 500_000, 630, 4)],
      };
    });
    const r = byId(weekCompare(state)!.rows);
    expect(r.abandonRate.value).toBeCloseTo(5);
    expect(r.abandonRate.previous).toBeNull();
    expect(r.abandonRate.delta).toBeNull();
    expect(r.revenue.delta).toBe(0);
  });

  it('is null in a game without a week', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3)], (s) => {
      delete s.week;
    });
    expect(weekCompare(state)).toBeNull();
  });
});

describe('bestDay', () => {
  it('picks the week day with the most revenue, the earliest on a tie', () => {
    const state = onReport([
      day(1, 200_000, 20, 20, 0, 3),
      day(2, 500_000, 50, 50, 0, 3),
      day(3, 500_000, 55, 55, 0, 3),
      day(4, 300_000, 30, 30, 0, 3),
    ]);
    expect(bestDay(state)).toEqual({ day: 2, weekDay: 2, revenue: 500_000, profit: 375_000, customersServed: 50 });
  });

  it('only looks at the current week', () => {
    const days = Array.from({ length: 9 }, (_, i) => day(i + 1, i < 7 ? 900_000 : 100_000 * (i - 6), 10, 10, 0, 4));
    const state = onReport(days, (s) => {
      s.week = { ...s.week!, index: 2, startedDay: 8, goal: weekGoal('normal', 2) };
    });
    expect(bestDay(state)).toMatchObject({ day: 9, weekDay: 2, revenue: 200_000 });
  });

  it('is null before a day of the week is finished or without a week', () => {
    const state = onReport([day(1, 200_000, 20, 20, 0, 3)]);
    state.phase = 'preparation';
    expect(bestDay(state)).toBeNull();
    delete state.week;
    state.phase = 'report';
    expect(bestDay(state)).toBeNull();
  });
});
