import type { ChallengeReward, WeekChallengeId } from '../types';

/** First week that draws a side challenge (rollWeekChallenge in src/sim/challenges.ts). */
export const CHALLENGE_FIRST_WEEK = 5;

export interface WeekChallengeDef {
  id: WeekChallengeId;
  /** Short name for the Mục tiêu tuần block. */
  name: string;
  /** What to do: `{n}` is the target, `{item}` the drawn menu item, `{stars}` minStars, `{min}` minServed. */
  description: string;
  /** Count to reach over the week (days for stars_week, calm_day and perfect_days). */
  target: number;
  /** Paid once when the challenge completes. */
  reward: ChallengeReward;
  /** stars_week: lowest rating, to one decimal, at the close of every day. */
  minStars?: number;
  /** calm_day: fewest customers served for a day without walkouts to count. */
  minServed?: number;
}

/**
 * The side challenges a week from CHALLENGE_FIRST_WEEK can draw, in draw order.
 * Any completed one also unlocks the next challenge-gated shop style in
 * CHALLENGE_STYLE_ORDER; no template holds a style of its own.
 */
export const WEEK_CHALLENGES: Readonly<Record<WeekChallengeId, WeekChallengeDef>> = {
  regular_visits: {
    id: 'regular_visits',
    name: 'Khách quen ghé thăm',
    description: 'Phục vụ {n} lượt khách quen trong tuần.',
    target: 55,
    reward: { tickets: 6 },
  },
  stars_week: {
    id: 'stars_week',
    name: 'Giữ sao cả tuần',
    description: 'Cuối cả 7 ngày trong tuần giữ từ {stars} sao trở lên.',
    target: 7,
    minStars: 4.9,
    reward: { tickets: 8 },
  },
  sell_item: {
    id: 'sell_item',
    name: 'Món của tuần',
    description: 'Bán {n} ly {item} trong tuần.',
    target: 300,
    reward: { tickets: 6 },
  },
  calm_day: {
    id: 'calm_day',
    name: 'Ngày không ai bỏ về',
    description: 'Một ngày phục vụ từ {min} khách mà không khách nào bỏ đi.',
    target: 1,
    minServed: 300,
    reward: { tickets: 5 },
  },
  served_week: {
    id: 'served_week',
    name: 'Tuần đông khách',
    description: 'Phục vụ {n} khách trong tuần.',
    target: 1700,
    reward: { tickets: 6 },
  },
  perfect_days: {
    id: 'perfect_days',
    name: 'Ngày trọn nhiệm vụ',
    description: 'Hoàn thành cả 3 nhiệm vụ ngày trong {n} ngày.',
    target: 4,
    reward: { tickets: 6 },
  },
};

export const WEEK_CHALLENGE_IDS = Object.keys(WEEK_CHALLENGES) as WeekChallengeId[];

/**
 * Challenge-gated styles (src/sim/data/styles.ts) in the order completed
 * challenges unlock them: each completed challenge, whatever its template,
 * opens the first one still locked. Cheapest first.
 */
export const CHALLENGE_STYLE_ORDER: readonly string[] = ['sign_neon', 'wall_wood', 'awning_gold', 'floor_checker', 'wall_mural'];

/** Templates whose numbers follow the shop's previous weeks from CHALLENGE_SCALE_FIRST_WEEK (scaledChallengeTarget). */
export type ScaledChallengeId = Extract<WeekChallengeId, 'served_week' | 'sell_item' | 'regular_visits' | 'calm_day'>;

/** First week whose counting challenges scale; weeks before it keep the WEEK_CHALLENGES numbers. */
export const CHALLENGE_SCALE_FIRST_WEEK = 9;

/** Finished weeks, read from the day history, whose values a scaled challenge averages. */
export const CHALLENGE_SCALE_WEEKS = 4;

/**
 * Share of the previous weeks' average a scaled challenge asks for: per week
 * for served_week (customers), sell_item (cups of the item) and
 * regular_visits; per day for calm_day (its minServed).
 */
export const CHALLENGE_SCALE_FACTORS: Readonly<Record<ScaledChallengeId, number>> = {
  served_week: 0.95,
  sell_item: 0.95,
  regular_visits: 1,
  calm_day: 0.9,
};

/** Scaled numbers are rounded to these steps. */
export const CHALLENGE_SCALE_STEPS: Readonly<Record<ScaledChallengeId, number>> = {
  served_week: 50,
  sell_item: 10,
  regular_visits: 5,
  calm_day: 10,
};

/** True for the templates whose numbers scale. */
export function isScaledChallenge(id: WeekChallengeId): id is ScaledChallengeId {
  return id in CHALLENGE_SCALE_FACTORS;
}

/**
 * Number a scaled challenge asks for given the previous weeks' average value
 * (per week, or per day for calm_day): the average times its factor, rounded
 * to its step, never below the template's number (`target`, or `minServed`
 * for calm_day).
 */
export function scaledChallengeTarget(id: ScaledChallengeId, average: number): number {
  const def = WEEK_CHALLENGES[id];
  const floor = id === 'calm_day' ? (def.minServed ?? 0) : def.target;
  const step = CHALLENGE_SCALE_STEPS[id];
  return Math.max(floor, Math.round((average * CHALLENGE_SCALE_FACTORS[id]) / step) * step);
}
