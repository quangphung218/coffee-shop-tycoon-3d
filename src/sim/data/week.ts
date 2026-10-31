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

// BEGIN SIZE_GOAL_ROWS (generated by scripts/gen-size-goal.mjs, do not edit by hand)
const SIZE_GOAL_ROWS: Readonly<Record<Difficulty, readonly (readonly [number, number])[]>> = {
  easy: [
    [39700000, 34800000], [39700000, 34800000], [41100000, 34800000], [43300000, 34800000], // 0..3
    [45600000, 35800000], [47800000, 38100000], [50100000, 40300000], [52300000, 42600000], // 4..7
    [54600000, 44800000], [56800000, 47100000], [59100000, 49400000], [61300000, 51600000], // 8..11
    [63600000, 53900000], [65800000, 56100000], [68100000, 58400000], [70300000, 60600000], // 12..15
    [72600000, 62900000], [74800000, 65100000], [77100000, 67400000], [79300000, 69600000], // 16..19
    [80900000, 71300000], [82600000, 73100000], [84200000, 74800000], [87800000, 77600000], // 20..23
    [91400000, 80400000], [91400000, 82100000], [91400000, 83800000], [93900000, 84600000], // 24..27
    [96300000, 85500000], [98800000, 86300000], [102500000, 91500000], [106300000, 96600000], // 28..31
    [109900000, 99300000], [113400000, 101900000], [113400000, 101900000], [113400000, 101900000], // 32..35
    [113400000, 101900000], [119400000, 106100000], [125300000, 110300000], [125300000, 110300000], // 36..39
    [125300000, 110300000], [126100000, 110300000], [127000000, 110300000], [127800000, 110300000], // 40..43
    [136600000, 120700000], [145500000, 131200000], [152100000, 137600000], [158800000, 144000000], // 44..47
    [163700000, 149100000], [168600000, 154300000], [173600000, 159500000], [176600000, 165500000], // 48..51
    [179500000, 171600000], [187800000, 180300000], [196100000, 189000000], [206500000, 201600000], // 52..55
    [216800000, 214300000], [227200000, 226900000], [241800000, 249100000], [256500000, 271200000], // 56..59
    [269800000, 286700000], [283000000, 302200000], [289500000, 311500000], [296100000, 320900000], // 60..63
    [302600000, 330200000], [319400000, 359200000], [336200000, 388100000], [341700000, 390900000], // 64..67
    [347200000, 393700000], [357800000, 425500000], [368400000, 457300000], [379100000, 489100000], // 68..71
    [379100000, 489100000], [379100000, 489100000], [379100000, 489100000], [379100000, 489100000], // 72..75
    [379100000, 489100000], [379100000, 489100000], // 76..77
  ],
  normal: [
    [36800000, 28500000], [37800000, 28500000], [39900000, 28500000], [42000000, 28500000], // 0..3
    [44100000, 30100000], [46200000, 32000000], [48300000, 34000000], [50400000, 35900000], // 4..7
    [52600000, 37800000], [54700000, 39700000], [56800000, 41700000], [58900000, 43600000], // 8..11
    [61000000, 45500000], [63100000, 47500000], [65200000, 49400000], [67300000, 51300000], // 12..15
    [69400000, 53200000], [71500000, 55200000], [73600000, 57100000], [73600000, 57100000], // 16..19
    [77000000, 60800000], [80400000, 64500000], [81100000, 64500000], [83700000, 64500000], // 20..23
    [86500000, 70800000], [86500000, 70800000], [89400000, 70800000], [89800000, 70800000], // 24..27
    [90100000, 70800000], [91700000, 70800000], [98800000, 80200000], [98800000, 80200000], // 28..31
    [104800000, 84400000], [104800000, 84400000], [104800000, 85500000], [104800000, 86700000], // 32..35
    [107900000, 88100000], [116600000, 91100000], [116600000, 91100000], [116600000, 91100000], // 36..39
    [116600000, 91100000], [116600000, 91100000], [116600000, 91100000], [118600000, 91100000], // 40..43
    [133200000, 109500000], [140100000, 112100000], [140100000, 112100000], [152000000, 130300000], // 44..47
    [154100000, 130300000], [156100000, 130300000], [162100000, 131900000], [167700000, 146600000], // 48..51
    [177200000, 159600000], [185200000, 161200000], [185200000, 161200000], [195600000, 175100000], // 52..55
    [205900000, 189000000], [222200000, 209300000], [233600000, 234900000], [246200000, 247300000], // 56..59
    [267800000, 263700000], [278100000, 279400000], [287200000, 293200000], [296300000, 307100000], // 60..63
    [296300000, 307100000], [308500000, 337800000], [324400000, 359600000], [335600000, 361500000], // 64..67
    [355500000, 385800000], [362100000, 403600000], [368700000, 421500000], [370100000, 465800000], // 68..71
    [370100000, 465800000], [370100000, 465800000], [370100000, 465800000], [370100000, 465800000], // 72..75
    [370100000, 465800000], [370100000, 465800000], // 76..77
  ],
  hard: [
    [35800000, 21100000], [37500000, 21100000], [39200000, 21100000], [41000000, 21600000], // 0..3
    [42700000, 23000000], [44400000, 24400000], [46100000, 25700000], [47800000, 27100000], // 4..7
    [49600000, 28500000], [51300000, 29800000], [53000000, 31200000], [54700000, 32600000], // 8..11
    [56400000, 34000000], [58200000, 35300000], [59900000, 36700000], [61600000, 38100000], // 12..15
    [63300000, 39400000], [65000000, 40800000], [66800000, 42200000], [67500000, 43500000], // 16..19
    [68200000, 44800000], [68900000, 46200000], [71900000, 47900000], [74800000, 49600000], // 20..23
    [74800000, 49600000], [74800000, 49600000], [76300000, 49900000], [77800000, 50200000], // 24..27
    [79300000, 50500000], [83300000, 54500000], [87400000, 58600000], [88600000, 59000000], // 28..31
    [89800000, 59400000], [90000000, 60600000], [90200000, 61800000], [90300000, 63000000], // 32..35
    [96400000, 64700000], [102400000, 66400000], [102400000, 66400000], [102400000, 66400000], // 36..39
    [102400000, 66400000], [102400000, 66400000], [102400000, 66400000], [109800000, 72400000], // 40..43
    [117300000, 78500000], [121400000, 81900000], [125400000, 85400000], [129600000, 89500000], // 44..47
    [133700000, 93600000], [137800000, 97800000], [144100000, 105900000], [150400000, 114000000], // 48..51
    [157600000, 119300000], [164800000, 124600000], [171900000, 133800000], [178900000, 142900000], // 52..55
    [186000000, 152100000], [197100000, 166200000], [208200000, 180200000], [222900000, 197000000], // 56..59
    [237700000, 213800000], [247000000, 226200000], [256300000, 238600000], [265600000, 251000000], // 60..63
    [272100000, 262300000], [278700000, 273600000], [294500000, 294600000], [310300000, 315600000], // 64..67
    [320500000, 331400000], [330700000, 347200000], [341000000, 363000000], [342100000, 414500000], // 68..71
    [342100000, 414500000], [342100000, 414500000], [342100000, 414500000], [342100000, 414500000], // 72..75
    [342100000, 414500000], [342100000, 414500000], // 76..77
  ],
};
// END SIZE_GOAL_ROWS

/**
 * Week targets from week SIZE_GOAL_FIRST_WEEK at shop level
 * SCALED_GOAL_MIN_LEVEL and up, by difficulty, indexed by the shop's total
 * upgrade levels at the week's start (0..SIZE_GOAL_MAX_LEVELS): revenue at
 * 1.0x and profit at 1.5x what b_steady2 (tests/longsim/run.ts, standard play
 * with two staff and standard prices) makes at that size. Regenerate with
 * `node scripts/gen-size-goal.mjs`, which documents how levels it never
 * reaches are filled in.
 */
export const SIZE_GOAL: Readonly<Record<Difficulty, readonly SizeGoalRow[]>> = {
  easy: SIZE_GOAL_ROWS.easy.map(([revenue, profit]) => ({ revenue, profit })),
  normal: SIZE_GOAL_ROWS.normal.map(([revenue, profit]) => ({ revenue, profit })),
  hard: SIZE_GOAL_ROWS.hard.map(([revenue, profit]) => ({ revenue, profit })),
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
