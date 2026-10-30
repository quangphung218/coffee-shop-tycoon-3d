import type { DayEventId, Difficulty, MenuItemId, Unlocks, UpgradeId, WeekGoal } from '../types';
import { levelDef } from './levels';

/** Days in a week of play. */
export const WEEK_LENGTH = 7;

/**
 * Week targets by difficulty. Revenue sits above what the best week-1
 * strategy makes, so only strong play nears a full score; Hard asks at least
 * as much as Normal from a shop whose prices are higher. Measured with
 * tests/integration/p22-strategies.test.ts.
 */
export const WEEK_GOALS: Readonly<Record<Difficulty, WeekGoal>> = {
  easy: { revenue: 35_000_000, stars: 3.8 },
  normal: { revenue: 32_000_000, stars: 4 },
  hard: { revenue: 33_000_000, stars: 4.2 },
};

/**
 * Week profit target as a share of the week's revenue target, by difficulty
 * (weekProfitTarget). Hard costs more to run, so its share is lower. Lowered
 * with the daily rent (E-04) so the a–e strategies in
 * tests/integration/p22-strategies.test.ts score 3 cups about as often as before.
 */
export const WEEK_PROFIT_SHARE: Readonly<Record<Difficulty, number>> = {
  easy: 0.59,
  normal: 0.5,
  hard: 0.35,
};

/**
 * Profit target of a week with revenue target `revenueTarget`, rounded to
 * 100.000. Derived instead of stored, so goals in saves keep their shape.
 */
export function weekProfitTarget(difficulty: Difficulty, revenueTarget: number): number {
  return Math.round((revenueTarget * WEEK_PROFIT_SHARE[difficulty]) / 100_000) * 100_000;
}

/**
 * Profit target of `goal`: its own `profit` when set (SIZE_GOAL weeks), else
 * derived from its revenue (weekProfitTarget), as goals saved before E-21 are.
 */
export function goalProfitTarget(difficulty: Difficulty, goal: WeekGoal): number {
  return typeof goal.profit === 'number' && Number.isFinite(goal.profit) ? goal.profit : weekProfitTarget(difficulty, goal.revenue);
}

/**
 * Weeks an upgrade is paid over in the week score on Easy and Normal, the week
 * it is bought included (weekUpgradeCharge in src/sim/week.ts); Hard uses
 * UPGRADE_AMORTIZE_WEEKS_BY_DIFFICULTY.
 */
export const UPGRADE_AMORTIZE_WEEKS = 2;

/**
 * Weeks an upgrade is paid over in the week score, by difficulty. Hard keeps
 * the smallest profit share (WEEK_PROFIT_SHARE), so two weeks let the level-up
 * buying of week 3 sink a reinvesting shop by up to 30 points; three keep the
 * drop within 10 (tests/integration/p23-long-run.test.ts) and change no Hard
 * week-1 cup count of tests/integration/p22-strategies.test.ts. Easy and Normal
 * stay at two: three would lift their week-1 3-cup counts past the P22 band.
 */
export const UPGRADE_AMORTIZE_WEEKS_BY_DIFFICULTY: Readonly<Record<Difficulty, number>> = {
  easy: UPGRADE_AMORTIZE_WEEKS,
  normal: UPGRADE_AMORTIZE_WEEKS,
  hard: 3,
};

/** Weeks an upgrade is paid over in the week score on `difficulty`. */
export function upgradeAmortizeWeeks(difficulty: Difficulty): number {
  return UPGRADE_AMORTIZE_WEEKS_BY_DIFFICULTY[difficulty];
}

/**
 * Revenue target of weeks 1, 2, 3, 4 as a multiple of week 1, rising in even
 * steps so a shop that keeps growing never sees its score fall off a cliff.
 * Fitted with tests/integration/p23-long-run.test.ts.
 */
export const WEEK_GOAL_MULTS: Readonly<Record<Difficulty, readonly number[]>> = {
  easy: [1, 1.7, 2.2, 2.35],
  normal: [1, 1.7, 2.2, 2.4],
  hard: [1, 1.65, 2.1, 2.25],
};

/**
 * Multiple of week 1 the revenue target adds each week after the last entry of
 * WEEK_GOAL_MULTS, with no cap: endless play keeps asking a little more.
 */
export const WEEK_GOAL_LATE_GROWTH: Readonly<Record<Difficulty, number>> = {
  easy: 0.1,
  normal: 0.1,
  hard: 0.1,
};

/** Revenue target multiple of week `index` (from 1): WEEK_GOAL_MULTS, then WEEK_GOAL_LATE_GROWTH a week. */
export function weekGoalMult(difficulty: Difficulty, index: number): number {
  const mults = WEEK_GOAL_MULTS[difficulty];
  const i = Math.max(1, Math.floor(index));
  if (i <= mults.length) return mults[i - 1]!;
  return mults.at(-1)! + WEEK_GOAL_LATE_GROWTH[difficulty] * (i - mults.length);
}

/**
 * Targets of week `index` (from 1): week 1 is WEEK_GOALS, then revenue is
 * weekGoalMult times that, rounded to 100.000; the stars target stays.
 */
export function weekGoal(difficulty: Difficulty, index: number): WeekGoal {
  const base = WEEK_GOALS[difficulty];
  return { revenue: Math.round((base.revenue * weekGoalMult(difficulty, index)) / 100_000) * 100_000, stars: base.stars };
}

/** Shop level from which a new week's revenue target follows the shop's recent revenue (scaledWeekGoal). */
export const SCALED_GOAL_MIN_LEVEL = 10;

/** Finished weeks whose revenue is averaged for a scaled goal. */
export const SCALED_GOAL_WEEKS = 4;

/** Share of the recent average week revenue a scaled goal asks for at least. */
export const SCALED_GOAL_RATIO = 0.9;

/**
 * Targets of week `index` started at shop level `shopLevel`, given the revenue
 * of the finished weeks oldest first. Below SCALED_GOAL_MIN_LEVEL it is
 * weekGoal; from it the revenue target is the larger of weekGoal and
 * SCALED_GOAL_RATIO times the average of the last SCALED_GOAL_WEEKS weeks,
 * rounded to 100.000. `scaled` is true when the average set the target.
 */
export function scaledWeekGoal(
  difficulty: Difficulty,
  index: number,
  shopLevel: number,
  pastRevenues: readonly number[],
): { goal: WeekGoal; scaled: boolean } {
  const goal = weekGoal(difficulty, index);
  const recent = pastRevenues.slice(-SCALED_GOAL_WEEKS);
  if (shopLevel < SCALED_GOAL_MIN_LEVEL || recent.length === 0) return { goal, scaled: false };
  const avg = recent.reduce((s, r) => s + r, 0) / recent.length;
  const revenue = Math.round((avg * SCALED_GOAL_RATIO) / 100_000) * 100_000;
  if (revenue <= goal.revenue) return { goal, scaled: false };
  return { goal: { revenue, stars: goal.stars }, scaled: true };
}

/** First week whose goal comes from SIZE_GOAL once the shop is at SCALED_GOAL_MIN_LEVEL. */
export const SIZE_GOAL_FIRST_WEEK = 9;

/** Highest total of upgrade levels SIZE_GOAL has a row for; larger totals use its last row. */
export const SIZE_GOAL_MAX_LEVELS = 77;

/** Revenue and profit targets of a SIZE_GOAL row. */
export interface SizeGoalRow {
  revenue: number;
  profit: number;
}

/**
 * Placeholder rows until the generator fills SIZE_GOAL from measured play:
 * week 9's revenue target growing 2% per upgrade level, profit from
 * weekProfitTarget.
 */
function placeholderSizeGoal(difficulty: Difficulty): readonly SizeGoalRow[] {
  const base = weekGoal(difficulty, SIZE_GOAL_FIRST_WEEK).revenue;
  return Array.from({ length: SIZE_GOAL_MAX_LEVELS + 1 }, (_, levels) => {
    const revenue = Math.round((base * (1 + 0.02 * levels)) / 100_000) * 100_000;
    return { revenue, profit: weekProfitTarget(difficulty, revenue) };
  });
}

/**
 * Week targets from week SIZE_GOAL_FIRST_WEEK at shop level
 * SCALED_GOAL_MIN_LEVEL and up, by difficulty, indexed by the shop's total
 * upgrade levels at the week's start (0..SIZE_GOAL_MAX_LEVELS). Revenue is
 * meant at 1.0x and profit at 1.5x what a standard shop of that size makes.
 */
export const SIZE_GOAL: Readonly<Record<Difficulty, readonly SizeGoalRow[]>> = {
  easy: placeholderSizeGoal('easy'),
  normal: placeholderSizeGoal('normal'),
  hard: placeholderSizeGoal('hard'),
};

/** SIZE_GOAL row for `totalLevels` upgrade levels, clamped to 0..SIZE_GOAL_MAX_LEVELS. */
export function sizeGoal(difficulty: Difficulty, totalLevels: number): SizeGoalRow {
  const rows = SIZE_GOAL[difficulty];
  const i = Math.min(rows.length - 1, Math.max(0, Math.floor(Number.isFinite(totalLevels) ? totalLevels : 0)));
  return rows[i]!;
}

/** Fewest cups a week needs to pay WEEK_REWARDS. */
export const WEEK_REWARD_MIN_CUPS = 2;

/**
 * Cash paid when a week ends with 2 or 3 cups, by difficulty. Harder games pay
 * more because their prices are higher. Numbers in docs/reports/p23-long-economy.md.
 */
export const WEEK_REWARDS: Readonly<Record<Difficulty, Readonly<Record<2 | 3, number>>>> = {
  easy: { 2: 1_000_000, 3: 1_500_000 },
  normal: { 2: 1_500_000, 3: 2_250_000 },
  hard: { 2: 2_000_000, 3: 3_000_000 },
};

/** Cash reward of a week scored with `cups` cups; 0 below WEEK_REWARD_MIN_CUPS. */
export function weekReward(difficulty: Difficulty, cups: number): number {
  if (cups < WEEK_REWARD_MIN_CUPS) return 0;
  return WEEK_REWARDS[difficulty][cups >= 3 ? 3 : 2];
}

export interface WeekUnlockDay {
  /** Day of the week, 1..WEEK_LENGTH. */
  day: number;
  /** What opens on the morning of this day. */
  unlocks: Unlocks;
  /** The shop gets its side room (one free level of expand_area) on this day. */
  expandShop?: boolean;
}

/**
 * The 7-day unlock calendar of week 1. Something new opens every day from day
 * 2, and day 7 expands the shop. A menu item or upgrade is available once the
 * shop level or this calendar reaches it, whichever comes first; from week 2
 * all of it stays open (see isUnlocked).
 * Table in docs/spec/week-7-days.md.
 */
export const WEEK_UNLOCKS: readonly WeekUnlockDay[] = [
  { day: 1, unlocks: levelDef(1).unlocks },
  { day: 2, unlocks: { menu: ['cappuccino'], upgrades: [], tools: ['grinder', 'ice_maker'] } },
  { day: 3, unlocks: { menu: ['orange_juice'], upgrades: [], tools: ['pastry_case'] } },
  { day: 4, unlocks: { menu: ['mocha'], upgrades: ['paintings', 'lights'], tools: ['dishwasher'] } },
  { day: 5, unlocks: { menu: ['frappe'], upgrades: ['outdoor_seating'], tools: ['blender'] } },
  { day: 6, unlocks: { menu: ['cake'], upgrades: ['window_bar'], tools: [] } },
  { day: 7, unlocks: { menu: [], upgrades: ['expand_area'], tools: [] }, expandShop: true },
];

/** Calendar entry for a day of the week; undefined outside 1..WEEK_LENGTH. */
export function weekUnlockDay(day: number): WeekUnlockDay | undefined {
  return WEEK_UNLOCKS.find((d) => d.day === day);
}

/** Day of the week a menu item or upgrade opens on, or Infinity when the calendar never opens it. */
export function dayUnlockDay(kind: 'menu' | 'upgrade', id: MenuItemId | UpgradeId): number {
  for (const { day, unlocks } of WEEK_UNLOCKS) {
    const ids: readonly string[] = kind === 'menu' ? unlocks.menu : [...unlocks.upgrades, ...unlocks.tools];
    if (ids.includes(id)) return day;
  }
  return Infinity;
}

export interface DayEventDef {
  id: DayEventId;
  name: string;
  description: string;
  /** Multiplier on customer arrivals for the day. */
  arrivalMult: number;
  /** Multiplier on ingredient prices for the day: buying and the cost of servings made. */
  ingredientPriceMult: number;
}

/** Day events of the week; the plan picks one per day (rollWeekPlan in src/sim/week.ts). */
export const DAY_EVENTS: Readonly<Record<DayEventId, DayEventDef>> = {
  none: { id: 'none', name: 'Ngày thường', description: 'Không có sự kiện', arrivalMult: 1, ingredientPriceMult: 1 },
  grand_opening: {
    id: 'grand_opening',
    name: 'Khai trương',
    description: 'Khách tò mò ghé thử quán mới',
    arrivalMult: 1.15,
    ingredientPriceMult: 1,
  },
  fair: { id: 'fair', name: 'Hội chợ', description: 'Phố đông, khách tăng mạnh', arrivalMult: 1.4, ingredientPriceMult: 1 },
  supplier_hike: {
    id: 'supplier_hike',
    name: 'Nhà cung cấp tăng giá',
    description: 'Nguyên liệu đắt hơn trong ngày',
    arrivalMult: 1,
    ingredientPriceMult: 1.25,
  },
};
