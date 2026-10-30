import { CHALLENGE_FIRST_WEEK, WEEK_CHALLENGES, WEEK_CHALLENGE_IDS } from './data/challenges';
import { getMenuItem, MENU } from './data/menu';
import { WEEK_LENGTH, dayUnlockDay } from './data/week';
import { weekDay, weekIndex } from './progression';
import { addTickets } from './retention';
import type { DailyReport, DayStats, GameState, MenuItemId, WeekChallenge } from './types';

/** Keeps challenge draws apart from the week plans and daily missions, which hash the same seed. */
const CHALLENGE_SALT = 0x27d4eb2f;

/** A stable 32-bit hash of the seed and an index, independent of the game RNG (same mix as planHash). */
function challengeHash(seed: number, index: number): number {
  let h = ((seed >>> 0) ^ CHALLENGE_SALT ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Menu items sell_item can ask for: every item the week-1 calendar opens, so all are open by week 5. */
const SELL_ITEMS: readonly MenuItemId[] = MENU.map((m) => m.id).filter((id) => dayUnlockDay('menu', id) <= WEEK_LENGTH);

/**
 * Template index of week `index`: the first challenge week hashes one of all
 * templates; every later week hashes one of the others, so no template comes
 * twice in a row. Walks the weeks from the first, which is a few steps at most.
 */
function templateIndex(seed: number, index: number): number {
  const n = WEEK_CHALLENGE_IDS.length;
  let t = challengeHash(seed, CHALLENGE_FIRST_WEEK) % n;
  for (let w = CHALLENGE_FIRST_WEEK + 1; w <= index; w++) t = (t + 1 + (challengeHash(seed, w) % (n - 1))) % n;
  return t;
}

/**
 * Side challenge of week `index` (from 1): null before CHALLENGE_FIRST_WEEK,
 * then a template and, for sell_item, a menu item hashed from the seed and the
 * week, never drawn from `state.rngState`. Same seed, same sequence.
 */
export function rollWeekChallenge(seed: number, index: number): WeekChallenge | null {
  if (index < CHALLENGE_FIRST_WEEK) return null;
  const def = WEEK_CHALLENGES[WEEK_CHALLENGE_IDS[templateIndex(seed, index)]!];
  const challenge: WeekChallenge = {
    id: def.id,
    target: def.target,
    reward: { ...def.reward },
    progress: 0,
    settledDay: 0,
    status: 'active',
  };
  if (def.id === 'sell_item') {
    // Negative indices never collide with the template hashes above.
    challenge.itemId = SELL_ITEMS[challengeHash(seed, -index) % SELL_ITEMS.length]!;
  }
  return challenge;
}

/**
 * Gives the current week its challenge when a save from before E-16 is loaded
 * on the morning of a week's first day, before anything was sold. A week
 * already under way keeps none; the next week draws its own (startNextWeek).
 */
export function ensureWeekChallenge(state: GameState): void {
  const week = state.week;
  if (!week || week.challenge || state.phase !== 'preparation' || weekDay(state) !== 1) return;
  const challenge = rollWeekChallenge(state.seed, weekIndex(state));
  if (challenge) week.challenge = challenge;
}

/** What the challenge text says: name and description with its numbers filled in. */
export function describeChallenge(challenge: WeekChallenge): { name: string; description: string } {
  const def = WEEK_CHALLENGES[challenge.id];
  const item = challenge.itemId ? getMenuItem(challenge.itemId).name : '';
  const description = def.description
    .replace('{n}', String(challenge.target))
    .replace('{item}', item)
    .replace('{stars}', (def.minStars ?? 0).toLocaleString('vi-VN'))
    .replace('{min}', String(def.minServed ?? 0));
  return { name: def.name, description };
}

/** Value a day adds to an additive challenge; null for the challenges counted per day at the close. */
function dayAmount(challenge: WeekChallenge, day: DayStats): number | null {
  switch (challenge.id) {
    case 'regular_visits':
      return day.regularsServed ?? 0;
    case 'sell_item':
      return challenge.itemId ? (day.sold[challenge.itemId] ?? 0) : 0;
    case 'served_week':
      return day.customersServed;
    default:
      return null;
  }
}

export interface ChallengeProgress {
  /** Value so far, today's open day included, capped at the target. */
  value: number;
  target: number;
  done: boolean;
  failed: boolean;
}

/** Progress of the week's challenge for the UI, today's sales included while the day is open; null without one. */
export function challengeProgress(state: GameState): ChallengeProgress | null {
  const challenge = state.week?.challenge;
  if (!challenge) return null;
  let value = challenge.progress;
  if (challenge.status === 'active' && state.today.day > challenge.settledDay) value += dayAmount(challenge, state.today) ?? 0;
  return {
    value: Math.min(challenge.target, value),
    target: challenge.target,
    done: challenge.status === 'completed',
    failed: challenge.status === 'failed',
  };
}

/**
 * Folds the day just closed into the week's challenge; called from closeDay
 * with the day's report. Reaching the target marks it completed, emits
 * 'challenge_completed' and pays its Tem, once. A day is never folded twice.
 */
export function endOfDayChallenge(state: GameState, report: DailyReport): void {
  const challenge = state.week?.challenge;
  if (!challenge || challenge.status !== 'active' || state.today.day <= challenge.settledDay) return;
  const today = state.today;
  challenge.settledDay = today.day;
  const def = WEEK_CHALLENGES[challenge.id];
  const amount = dayAmount(challenge, today);
  if (amount !== null) {
    challenge.progress += amount;
  } else if (challenge.id === 'stars_week') {
    // Rounded to one decimal like the shown rating.
    if (Math.round(state.rating * 10) / 10 >= (def.minStars ?? 0)) challenge.progress += 1;
    else challenge.status = 'failed';
  } else if (challenge.id === 'calm_day') {
    if (today.customersLost === 0 && today.customersServed >= (def.minServed ?? 0)) challenge.progress += 1;
  } else if (challenge.id === 'perfect_days') {
    const missions = report.missions ?? [];
    if (missions.length > 0 && missions.every((m) => m.status === 'completed')) challenge.progress += 1;
  }
  if (challenge.status !== 'active' || challenge.progress < challenge.target) return;
  challenge.status = 'completed';
  state.events.push({ type: 'challenge_completed', challenge: { ...challenge, reward: { ...challenge.reward } } });
  addTickets(state, challenge.reward.tickets, 'challenge');
}
