import { DIFFICULTIES } from './data/difficulty';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  GIFT_REWARDS,
  STAFF_MASTER_LEVEL,
  type GiftReward,
} from './data/retention';
import { isLastWeekDay } from './week';
import type { AchievementId, DailyReport, GameEvent, GameState, RetentionState } from './types';

type TicketReason = Extract<GameEvent, { type: 'tickets_earned' }>['reason'];
type Lifetime = RetentionState['lifetime'];

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 of a valid local date key 'YYYY-MM-DD' (days-from-civil, no Date); null otherwise. */
export function parseDateKey(key: string): number | null {
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  const yy = mo <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Served and revenue a save played before retention existed is worth: finished
 * weeks from `week.archive`, then the history days outside them, plus today once
 * its report is up. The rest of the counters start at 0.
 */
function backfillLifetime(state: GameState): Lifetime {
  const today = state.today.day;
  const counted = (state.week?.archive ?? []).filter((w) => w.startedDay + 6 < today);
  const inCounted = (day: number) => counted.some((w) => day >= w.startedDay && day <= w.startedDay + 6);
  let served = counted.reduce((s, w) => s + w.customersServed, 0);
  let revenue = counted.reduce((s, w) => s + w.revenue, 0);
  const days = state.history.filter((d) => d.day < today && !inCounted(d.day));
  if (state.phase === 'report') days.push(state.today);
  for (const d of days) {
    served += d.customersServed;
    revenue += d.revenue;
  }
  return { served, revenue, fiveStar: 0, perfectDays: 0, threeCupWeeks: 0 };
}

function defaultRetention(state: GameState): RetentionState {
  return {
    tickets: 0,
    login: { lastDate: null, streak: 0, claimed: 0 },
    lifetime: backfillLifetime(state),
    achievements: {},
  };
}

/** The retention state without creating it: what ensureRetention would make for an older save. */
function readRetention(state: GameState): RetentionState {
  return state.retention ?? defaultRetention(state);
}

/** The save's retention state, created (lifetime backfilled from history) when an older save lacks it. */
export function ensureRetention(state: GameState): RetentionState {
  state.retention ??= defaultRetention(state);
  return state.retention;
}

function notify(state: GameState, level: 'info' | 'success' | 'error', text: string): void {
  state.events.push({ type: 'notify', level, text });
}

/** Adds tickets ('Tem') and emits 'tickets_earned'; amounts of 0 or less do nothing. */
export function addTickets(state: GameState, amount: number, reason: TicketReason): void {
  if (amount <= 0) return;
  const retention = ensureRetention(state);
  retention.tickets += amount;
  state.events.push({ type: 'tickets_earned', amount, total: retention.tickets, reason });
}

/** Takes n tickets; false (nothing taken) when the balance is short or n is negative. */
export function spendTickets(state: GameState, n: number): boolean {
  const retention = ensureRetention(state);
  if (n < 0 || retention.tickets < n) return false;
  retention.tickets -= n;
  return true;
}

/** Gift of streak day `streak` (1..7), money scaled by the difficulty. */
function giftReward(state: GameState, streak: number): GiftReward {
  const base = GIFT_REWARDS[(streak - 1) % GIFT_REWARDS.length]!;
  // priceMult as a whole percentage, so 50.000 × 1,15 rounds to 58.000 and not down from 57.499,99….
  const pct = Math.round(DIFFICULTIES[state.difficulty].priceMult * 100);
  return { money: Math.round((base.money * pct) / 100000) * 1000, tickets: base.tickets };
}

export interface GiftPreview {
  canClaim: boolean;
  /** Why the gift cannot be claimed; null when it can. */
  reason: string | null;
  /** Streak day the gift would be (1..7). */
  nextStreak: number;
  reward: GiftReward;
}

/** What claiming on `dateKey` would do, without changing the state. */
export function giftPreview(state: GameState, dateKey: string): GiftPreview {
  const login = readRetention(state).login;
  const today = parseDateKey(dateKey);
  const last = login.lastDate === null ? null : parseDateKey(login.lastDate);
  let reason: string | null = null;
  let nextStreak = 1;
  if (today === null) reason = 'Ngày không hợp lệ, không nhận được quà';
  else if (last !== null && today === last) reason = 'Hôm nay đã nhận quà';
  else if (last !== null && today < last) reason = 'Ngày trên máy lùi lại, không nhận được quà';
  else if (last !== null && today === last + 1) nextStreak = (login.streak % GIFT_REWARDS.length) + 1;
  if (reason) nextStreak = login.streak > 0 ? login.streak : 1;
  return { canClaim: reason === null, reason, nextStreak, reward: giftReward(state, nextStreak) };
}

/**
 * Claims today's gift for the local date key 'YYYY-MM-DD' sent by the UI, in
 * any phase. Returns false when the gift does not apply (bad date, already
 * claimed today, clock moved back); the streak is then kept.
 */
export function claimDailyGift(state: GameState, dateKey: string): boolean {
  const preview = giftPreview(state, dateKey);
  if (!preview.canClaim) {
    notify(state, 'error', preview.reason!);
    return false;
  }
  const login = ensureRetention(state).login;
  login.streak = preview.nextStreak;
  login.lastDate = dateKey;
  login.claimed += 1;
  state.money += preview.reward.money;
  state.events.push({
    type: 'gift_claimed',
    streak: preview.nextStreak,
    money: preview.reward.money,
    tickets: preview.reward.tickets,
  });
  addTickets(state, preview.reward.tickets, 'gift');
  return true;
}

/** Current value of an achievement's measure. */
function achievementValue(state: GameState, retention: RetentionState, id: AchievementId): number {
  const l = retention.lifetime;
  switch (id) {
    case 'served':
      return l.served;
    case 'revenue':
      return l.revenue;
    case 'five_star':
      return l.fiveStar;
    case 'perfect_day':
      return l.perfectDays;
    case 'three_cups':
      return l.threeCupWeeks;
    case 'staff_master':
      return state.staff.filter((s) => (s.level ?? 1) >= STAFF_MASTER_LEVEL).length;
  }
}

/** Highest tier (0..3) the value reaches. */
function tierFor(id: AchievementId, value: number): number {
  return ACHIEVEMENTS[id].tiers.filter((t) => value >= t.target).length;
}

export interface AchievementProgress {
  id: AchievementId;
  name: string;
  /** Tier reached, 0..3. */
  tier: number;
  value: number;
  /** Target of the next tier; null once the last tier is reached. */
  next: number | null;
}

/** Every achievement with its tier, current value and next target, without changing the state. */
export function achievementProgress(state: GameState): AchievementProgress[] {
  const retention = readRetention(state);
  return ACHIEVEMENT_IDS.map((id) => {
    const def = ACHIEVEMENTS[id];
    const tier = retention.achievements[id] ?? 0;
    return {
      id,
      name: def.name,
      tier,
      value: achievementValue(state, retention, id),
      next: def.tiers[tier]?.target ?? null,
    };
  });
}

/**
 * End-of-day lifetime counters and achievements; called from closeDay with the
 * day's report. Each tier newly reached pays its tickets once and is listed in
 * `report.achievements`; tiers already held are never paid again.
 */
export function endOfDayRetention(state: GameState, report: DailyReport): void {
  const retention = ensureRetention(state);
  const l = retention.lifetime;
  l.served += report.customersServed;
  l.revenue += report.revenue;
  l.fiveStar += state.reviews.filter((r) => r.day === report.day && r.stars === 5).length;
  const missions = report.missions ?? [];
  if (missions.length > 0 && missions.every((m) => m.status === 'completed')) l.perfectDays += 1;
  if (isLastWeekDay(state) && state.week?.result?.cups === 3) l.threeCupWeeks += 1;

  const unlocked: { id: AchievementId; tier: number }[] = [];
  for (const id of ACHIEVEMENT_IDS) {
    const held = retention.achievements[id] ?? 0;
    const reached = tierFor(id, achievementValue(state, retention, id));
    for (let tier = held + 1; tier <= reached; tier++) {
      retention.achievements[id] = tier;
      addTickets(state, ACHIEVEMENTS[id].tiers[tier - 1]!.tickets, 'achievement');
      state.events.push({ type: 'achievement_unlocked', id, tier });
      unlocked.push({ id, tier });
    }
  }
  if (unlocked.length > 0) report.achievements = unlocked;
}
