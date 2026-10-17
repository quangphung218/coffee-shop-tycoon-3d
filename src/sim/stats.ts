import { profit } from './economy';
import type { DailyReport, DayStats, GameState, WeekGoal, WeekSummary } from './types';

/**
 * Day and week statistics for the Daily Report and the week summary: today
 * against yesterday and the week so far, the week to date against its goal,
 * and a finished week against the one before. Pure reads of GameState over
 * `history` (last HISTORY_DAYS days), `today` and `week.archive`.
 */

/** Figures compared day to day and week to week, in display order. */
export type StatId = 'profit' | 'revenue' | 'customersServed' | 'abandonRate' | 'stars';

export const STAT_IDS: readonly StatId[] = ['profit', 'revenue', 'customersServed', 'abandonRate', 'stars'];

/**
 * One day's figures: profit and revenue in đồng, customers served, the share
 * of arrivals who left angry as 0..100 (0 without arrivals) and the rating at close.
 */
export type DayFigures = Record<StatId, number>;

/** One figure of the report: today's value and its change against yesterday and the week so far. */
export interface StatDelta {
  id: StatId;
  value: number;
  /** value − yesterday's; null when yesterday is not on record (day 1). */
  vsYesterday: number | null;
  /** value − the average of the earlier days of this week; null on week day 1 or without a week. */
  vsWeekAvg: number | null;
}

/** Totals of the current week over its finished days. */
export interface WeekToDate {
  index: number;
  startedDay: number;
  /** Finished days counted, 0..7; today counts once its report is up. */
  days: number;
  /** Profit, revenue and customers summed, abandon rate over all arrivals, stars at the last counted close. */
  totals: DayFigures;
  /** Per-day averages of the counted days (stars: their mean close rating); null when no day counts yet. */
  average: DayFigures | null;
  goal: WeekGoal;
  /** totals.revenue / goal.revenue (1 = goal reached, may pass 1); 1 when the goal is 0. */
  revenueProgress: number;
}

/** One figure of a finished week against the week before. */
export interface WeekStatDelta {
  id: StatId;
  /** Null for the abandon rate when a week's days have left the history. */
  value: number | null;
  previous: number | null;
  delta: number | null;
}

/** The last finished week against the one before it. */
export interface WeekCompare {
  current: WeekSummary;
  previous: WeekSummary;
  rows: WeekStatDelta[];
}

/** Highest-revenue day of the week so far. */
export interface BestDay {
  /** Game day. */
  day: number;
  /** Day of the week, 1..7. */
  weekDay: number;
  revenue: number;
  profit: number;
  customersServed: number;
}

/** Share of arrivals who left angry, 0..100; 0 without arrivals. */
function abandonRate(lost: number, arrived: number): number {
  return arrived > 0 ? (lost / arrived) * 100 : 0;
}

function dayFigures(d: DayStats): DayFigures {
  return {
    profit: profit(d),
    revenue: d.revenue,
    customersServed: d.customersServed,
    abandonRate: abandonRate(d.customersLost, d.customersArrived),
    stars: d.ratingEnd,
  };
}

function reportFigures(r: DailyReport): DayFigures {
  return {
    profit: r.profit,
    revenue: r.revenue,
    customersServed: r.customersServed,
    abandonRate: abandonRate(r.customersLost, r.customersArrived),
    stars: r.ratingEnd,
  };
}

/** Finished days on record plus today, oldest first, one entry per day. */
function knownDays(state: GameState): DayStats[] {
  const days = state.history.filter((d) => d.day !== state.today.day);
  return [...days, state.today];
}

/** Game day the week holding `day` began on; weeks run back to back from `week.startedDay`. Null without a week. */
function weekStartOf(state: GameState, day: number): number | null {
  const week = state.week;
  if (!week) return null;
  return week.startedDay + week.length * Math.floor((day - week.startedDay) / week.length);
}

function average(days: readonly DayStats[]): DayFigures | null {
  if (days.length === 0) return null;
  const figures = days.map(dayFigures);
  const mean = (id: StatId) => figures.reduce((s, f) => s + f[id], 0) / figures.length;
  return {
    profit: mean('profit'),
    revenue: mean('revenue'),
    customersServed: mean('customersServed'),
    abandonRate: mean('abandonRate'),
    stars: mean('stars'),
  };
}

/**
 * The report's figures with their change against yesterday and against the
 * average of the earlier days of the same week (week day 1 has none).
 */
export function dayCompare(state: GameState, report: DailyReport): StatDelta[] {
  const today = reportFigures(report);
  const days = knownDays(state);
  const yesterdayStats = days.find((d) => d.day === report.day - 1);
  const yesterday = yesterdayStats ? dayFigures(yesterdayStats) : null;
  const start = weekStartOf(state, report.day);
  const earlier = start === null ? [] : days.filter((d) => d.day >= start && d.day < report.day);
  const weekAvg = average(earlier);
  return STAT_IDS.map((id) => ({
    id,
    value: today[id],
    vsYesterday: yesterday ? today[id] - yesterday[id] : null,
    vsWeekAvg: weekAvg ? today[id] - weekAvg[id] : null,
  }));
}

/** Finished days of the current week: earlier days plus today once its report is up. */
function weekDaysSoFar(state: GameState): DayStats[] {
  const week = state.week;
  if (!week) return [];
  const lastDay = week.startedDay + week.length - 1;
  return knownDays(state).filter(
    (d) =>
      d.day >= week.startedDay &&
      d.day <= lastDay &&
      (d.day !== state.today.day || state.phase === 'report'),
  );
}

/** The current week's totals and averages so far and its progress toward the revenue goal; null without a week. */
export function weekToDate(state: GameState): WeekToDate | null {
  const week = state.week;
  if (!week) return null;
  const days = weekDaysSoFar(state);
  const sum = (pick: (d: DayStats) => number) => days.reduce((s, d) => s + pick(d), 0);
  const revenue = sum((d) => d.revenue);
  const last = days[days.length - 1];
  return {
    index: week.index,
    startedDay: week.startedDay,
    days: days.length,
    totals: {
      profit: sum(profit),
      revenue,
      customersServed: sum((d) => d.customersServed),
      abandonRate: abandonRate(sum((d) => d.customersLost), sum((d) => d.customersArrived)),
      stars: last ? last.ratingEnd : state.rating,
    },
    average: average(days),
    goal: week.goal,
    revenueProgress: week.goal.revenue > 0 ? revenue / week.goal.revenue : 1,
  };
}

/** Abandon rate over a finished week's days, or null when any of them has left the history. */
function weekAbandonRate(state: GameState, row: WeekSummary): number | null {
  const length = state.week?.length ?? 7;
  const days = knownDays(state).filter((d) => d.day >= row.startedDay && d.day < row.startedDay + length);
  if (days.length < length) return null;
  const lost = days.reduce((s, d) => s + d.customersLost, 0);
  const arrived = days.reduce((s, d) => s + d.customersArrived, 0);
  return abandonRate(lost, arrived);
}

function summaryFigure(state: GameState, row: WeekSummary, id: StatId): number | null {
  if (id === 'abandonRate') return weekAbandonRate(state, row);
  return row[id];
}

/** The last week in the archive against the week before it; null until two weeks are finished. */
export function weekCompare(state: GameState): WeekCompare | null {
  const archive = state.week?.archive ?? [];
  const current = archive[archive.length - 1];
  const previous = archive[archive.length - 2];
  if (!current || !previous) return null;
  const rows = STAT_IDS.map((id) => {
    const value = summaryFigure(state, current, id);
    const prev = summaryFigure(state, previous, id);
    return { id, value, previous: prev, delta: value !== null && prev !== null ? value - prev : null };
  });
  return { current, previous, rows };
}

/** The current week's finished day with the most revenue (earliest on a tie); null before any. */
export function bestDay(state: GameState): BestDay | null {
  const week = state.week;
  if (!week) return null;
  let best: DayStats | null = null;
  for (const d of weekDaysSoFar(state)) if (!best || d.revenue > best.revenue) best = d;
  if (!best) return null;
  return {
    day: best.day,
    weekDay: best.day - week.startedDay + 1,
    revenue: best.revenue,
    profit: profit(best),
    customersServed: best.customersServed,
  };
}
