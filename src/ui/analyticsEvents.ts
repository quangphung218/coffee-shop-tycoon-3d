/**
 * E-23: which GoatCounter events the game sends, derived in the shell from
 * the sim's events and state (src/sim is not touched). Every path has a
 * leading slash, short English words, numbers last:
 *
 *   /session-start          a game session with consent 'yes' (once per page load)
 *   /day-end-N              game day N (1..7, the first week) closed
 *   /week-end-N             week N was scored
 *   /week-N-cups-K          week N was scored with K cups (0..3)
 *   /level-up-N             the shop reached level N
 *   /first-staff-hire       the run's first hire (no staff before it)
 *   /regular-milestone-K    a regular reached milestone K (1..3) of their book
 *   /quit-mid-day           the tab was hidden while a day was open (opening/peak/closing)
 *
 * Each path counts at most once per page load (analytics.ts).
 */
import type { AnalyticsConsent } from '../save/save';
import type { Command, GameEvent, GameState } from '../sim/types';
import { analytics as sharedAnalytics, type Analytics } from './analytics';

export interface AnalyticsHit {
  path: string;
  title: string;
}

/** Days of the first week whose end is counted. */
export const DAY_END_LAST = 7;

function hit(path: string, title: string): AnalyticsHit {
  return { path, title };
}

export const SESSION_START = hit('/session-start', 'Session start');
export const FIRST_STAFF_HIRE = hit('/first-staff-hire', 'First staff hire');
export const QUIT_MID_DAY = hit('/quit-mid-day', 'Quit mid-day');

/** Hits for one sim event; `state` is the state the event was emitted on. */
export function hitsForEvent(event: GameEvent, state: GameState): AnalyticsHit[] {
  switch (event.type) {
    case 'dayEnded':
      return event.day >= 1 && event.day <= DAY_END_LAST ? [hit(`/day-end-${event.day}`, `Day ${event.day} end`)] : [];
    case 'week_ended': {
      // The week is still the scored one until next_day opens the next week.
      const n = state.week?.index;
      if (n === undefined) return [];
      const cups = event.result.cups;
      return [hit(`/week-end-${n}`, `Week ${n} end`), hit(`/week-${n}-cups-${cups}`, `Week ${n} cups ${cups}`)];
    }
    case 'level_up':
      return [hit(`/level-up-${event.level}`, `Level up ${event.level}`)];
    case 'regular_milestone':
      return [hit(`/regular-milestone-${event.milestone}`, `Regular milestone ${event.milestone}`)];
    default:
      return [];
  }
}

/** Hit for a command the sim accepted, judged on the state after it. */
export function hitForCommand(cmd: Command, after: GameState): AnalyticsHit | null {
  if (cmd.type === 'hire_staff' && after.staff.length === 1) return FIRST_STAFF_HIRE;
  return null;
}

/** True while the shop is open for the day (customers can come or are still in). */
export function dayInProgress(state: GameState | null): boolean {
  return state !== null && (state.phase === 'opening' || state.phase === 'peak' || state.phase === 'closing');
}

/** The game shell's analytics hooks; `a` is the shared instance outside tests. */
export interface AnalyticsWiring {
  readonly analytics: Analytics;
  /** Applies a consent read from a save (or chosen by the player) and counts the session once it is 'yes'. */
  setConsent(consent: AnalyticsConsent): void;
  /** Consent to write into a save, or undefined to keep what the slot holds. */
  saveConsent(): AnalyticsConsent | undefined;
  onEvents(events: readonly GameEvent[], state: GameState): void;
  onCommand(cmd: Command, after: GameState): void;
  /** The tab was hidden. */
  onHidden(state: GameState | null): void;
}

export function wireAnalytics(a: Analytics = sharedAnalytics): AnalyticsWiring {
  const track = (h: AnalyticsHit): void => a.track(h.path, h.title);
  return {
    analytics: a,
    setConsent(consent) {
      a.setConsent(consent);
      if (consent === 'yes') track(SESSION_START);
    },
    saveConsent() {
      const c = a.consent();
      return c === 'unasked' ? undefined : c;
    },
    onEvents(events, state) {
      if (a.consent() !== 'yes') return;
      for (const e of events) for (const h of hitsForEvent(e, state)) track(h);
    },
    onCommand(cmd, after) {
      if (a.consent() !== 'yes') return;
      const h = hitForCommand(cmd, after);
      if (h) track(h);
    },
    onHidden(state) {
      if (dayInProgress(state)) a.beacon(QUIT_MID_DAY.path, QUIT_MID_DAY.title);
    },
  };
}

/**
 * For the consent strip and Settings (T-81): sets the player's choice on the
 * shared instance and counts the session when it is 'yes'. The running game
 * writes it into the save at its next save (autosave, manual save).
 */
export function setAnalyticsConsent(consent: AnalyticsConsent, a: Analytics = sharedAnalytics): void {
  wireAnalytics(a).setConsent(consent);
}
