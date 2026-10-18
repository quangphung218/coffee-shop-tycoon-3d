import type { AchievementId } from '../types';

/** One day of the 7-day gift cycle; money is scaled by the difficulty's priceMult. */
export interface GiftReward {
  money: number;
  tickets: number;
}

/** Gift for streak day i + 1 (day 7 is the big one, then the cycle starts again at day 1). */
export const GIFT_REWARDS: readonly GiftReward[] = [
  { money: 50000, tickets: 1 },
  { money: 60000, tickets: 1 },
  { money: 80000, tickets: 2 },
  { money: 100000, tickets: 1 },
  { money: 120000, tickets: 2 },
  { money: 150000, tickets: 2 },
  { money: 250000, tickets: 5 },
];

export interface AchievementTier {
  /** Value of the achievement's measure needed for the tier. */
  target: number;
  /** Tickets ('Tem') paid once when the tier is reached; achievements give no XP. */
  tickets: number;
}

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  /** Tiers 1..3 in order, lowest first. */
  tiers: readonly AchievementTier[];
}

/** Tickets paid by tier 1, 2 and 3 of every achievement. */
const TIER_TICKETS = [2, 4, 8] as const;

function tiers(targets: readonly [number, number, number]): AchievementTier[] {
  return targets.map((target, i) => ({ target, tickets: TIER_TICKETS[i]! }));
}

export const ACHIEVEMENTS: Readonly<Record<AchievementId, AchievementDef>> = {
  served: {
    id: 'served',
    name: 'Khách quen của phố',
    description: 'Phục vụ tổng cộng nhiều khách.',
    tiers: tiers([100, 500, 2000]),
  },
  revenue: {
    id: 'revenue',
    name: 'Két tiền đầy',
    description: 'Tổng doanh thu từ khi mở quán.',
    tiers: tiers([5_000_000, 30_000_000, 150_000_000]),
  },
  five_star: {
    id: 'five_star',
    name: 'Năm sao lấp lánh',
    description: 'Nhận đánh giá 5 sao.',
    tiers: tiers([10, 50, 200]),
  },
  perfect_day: {
    id: 'perfect_day',
    name: 'Ngày hoàn hảo',
    description: 'Hoàn thành cả 3 nhiệm vụ trong một ngày.',
    tiers: tiers([1, 5, 20]),
  },
  three_cups: {
    id: 'three_cups',
    name: 'Tuần ba cúp',
    description: 'Kết thúc tuần với 3 cúp.',
    tiers: tiers([1, 3, 10]),
  },
  staff_master: {
    id: 'staff_master',
    name: 'Đội ngũ lành nghề',
    description: 'Có nhân viên đạt cấp 3 trở lên.',
    tiers: tiers([1, 3, 6]),
  },
};

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

/** Staff at this level or above count toward 'staff_master'. */
export const STAFF_MASTER_LEVEL = 3;
