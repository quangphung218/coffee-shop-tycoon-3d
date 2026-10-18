import type { DailyReport, GameState, RetentionState } from './types';

function defaultRetention(): RetentionState {
  return {
    tickets: 0,
    login: { lastDate: null, streak: 0, claimed: 0 },
    lifetime: { served: 0, revenue: 0, fiveStar: 0, perfectDays: 0, threeCupWeeks: 0 },
    achievements: {},
  };
}

/** The save's retention state, created with defaults when an older save lacks it. */
export function ensureRetention(state: GameState): RetentionState {
  state.retention ??= defaultRetention();
  return state.retention;
}

/**
 * Claims today's gift for the local date key 'YYYY-MM-DD' sent by the UI.
 * Returns false when the gift does not apply (already claimed today…).
 */
export function claimDailyGift(_state: GameState, _dateKey: string): boolean {
  return false;
}

/** End-of-day lifetime counters and achievements; called from closeDay with the day's report. */
export function endOfDayRetention(_state: GameState, _report: DailyReport): void {}
