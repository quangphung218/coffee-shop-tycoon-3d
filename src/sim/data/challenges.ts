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
 * Most rewards also unlock a challenge-gated shop style (`reward.unlock`, src/sim/data/styles.ts).
 */
export const WEEK_CHALLENGES: Readonly<Record<WeekChallengeId, WeekChallengeDef>> = {
  regular_visits: {
    id: 'regular_visits',
    name: 'Khách quen ghé thăm',
    description: 'Phục vụ {n} lượt khách quen trong tuần.',
    target: 55,
    reward: { tickets: 6, unlock: { kind: 'decor', id: 'wall_wood' } },
  },
  stars_week: {
    id: 'stars_week',
    name: 'Giữ sao cả tuần',
    description: 'Cuối cả 7 ngày trong tuần giữ từ {stars} sao trở lên.',
    target: 7,
    minStars: 4.9,
    reward: { tickets: 8, unlock: { kind: 'decor', id: 'wall_mural' } },
  },
  sell_item: {
    id: 'sell_item',
    name: 'Món của tuần',
    description: 'Bán {n} ly {item} trong tuần.',
    target: 300,
    reward: { tickets: 6, unlock: { kind: 'decor', id: 'sign_neon' } },
  },
  calm_day: {
    id: 'calm_day',
    name: 'Ngày không ai bỏ về',
    description: 'Một ngày phục vụ từ {min} khách mà không khách nào bỏ đi.',
    target: 1,
    minServed: 300,
    reward: { tickets: 5, unlock: { kind: 'decor', id: 'awning_gold' } },
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
    reward: { tickets: 6, unlock: { kind: 'decor', id: 'floor_checker' } },
  },
};

export const WEEK_CHALLENGE_IDS = Object.keys(WEEK_CHALLENGES) as WeekChallengeId[];
