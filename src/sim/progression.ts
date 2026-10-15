import { DIFFICULTIES } from './data/difficulty';
import {
  MAX_SHOP_LEVEL,
  levelForXp,
  menuUnlockLevel,
  unlocksBetween,
  upgradeUnlockLevel,
} from './data/levels';
import { mulberry32 } from './rng';
import type { GameState, MenuEntry, MenuItemId, Mission, MissionId, Unlocks, UpgradeId } from './types';

/** XP for each customer served. */
export const XP_PER_SERVED = 2;
/** XP for each 4–5 star review left today. */
export const XP_PER_GOOD_REVIEW = 6;
/** Reviews of this many stars or more count as good. */
export const GOOD_REVIEW_STARS = 4;
/** Missions chosen from the pool each day. */
export const MISSIONS_PER_DAY = 3;

/** Whether a menu item or upgrade is available at the shop's current level. */
export function isUnlocked(state: GameState, kind: 'menu' | 'upgrade', id: MenuItemId | UpgradeId): boolean {
  const need = kind === 'menu' ? menuUnlockLevel(id as MenuItemId) : upgradeUnlockLevel(id as UpgradeId);
  return state.shopLevel >= need;
}

interface MissionSpec {
  /** Goal value for a shop level. */
  target: (level: number) => number;
  rewardXp: number;
  rewardMoney: number;
  /** Measured value for the day. */
  measure: (state: GameState) => number;
  /** 'gte': reach the target or more; 'lte': stay at or under it. */
  goal: 'gte' | 'lte';
  /** False while the value cannot be judged yet (food cost before any revenue). */
  ready?: (state: GameState) => boolean;
}

function sumValues(rec: Partial<Record<string, number>>): number {
  return Object.values(rec).reduce<number>((s, v) => s + (v ?? 0), 0);
}

const SPECS: Record<MissionId, MissionSpec> = {
  serve_customers: {
    target: (lvl) => 18 + lvl * 7,
    rewardXp: 60,
    rewardMoney: 100000,
    measure: (s) => s.today.customersServed,
    goal: 'gte',
  },
  no_stockout_loss: {
    target: () => 0,
    rewardXp: 70,
    rewardMoney: 120000,
    measure: (s) => sumValues(s.today.outOfStock),
    goal: 'lte',
  },
  food_cost: {
    target: () => 38,
    rewardXp: 60,
    rewardMoney: 100000,
    // Without revenue there is no food cost to judge: ingredients bought but not sold count as 100%.
    measure: (s) =>
      s.today.revenue > 0
        ? Math.round((s.today.ingredientCost / s.today.revenue) * 100)
        : s.today.ingredientCost > 0
          ? 100
          : 0,
    goal: 'lte',
    ready: (s) => s.today.revenue > 0,
  },
  sell_food: {
    target: (lvl) => 2 + lvl,
    rewardXp: 60,
    rewardMoney: 100000,
    measure: (s) => (s.today.sold.croissant ?? 0) + (s.today.sold.cake ?? 0),
    goal: 'gte',
  },
  end_rating: {
    target: (lvl) => Math.round((3.4 + lvl * 0.15) * 10) / 10,
    rewardXp: 50,
    rewardMoney: 80000,
    measure: (s) => Math.round(s.today.ratingEnd * 100) / 100,
    goal: 'gte',
  },
  low_abandon: {
    target: (lvl) => Math.max(10, 21 - lvl),
    rewardXp: 60,
    rewardMoney: 100000,
    measure: (s) =>
      s.today.customersArrived > 0 ? Math.round((s.today.customersLost / s.today.customersArrived) * 100) : 0,
    goal: 'lte',
  },
};

export interface MissionProgress {
  /** Today's measured value, in the mission's unit (customers, cups, stars, %). */
  value: number;
  /**
   * How far along the day is, 0..1, for a progress bar. For a 'reach' goal it
   * is value / target; for a 'stay under' goal it is 1 while the value is
   * within the limit and shrinks as it goes over (0 once a zero limit is broken).
   */
  ratio: number;
  /** True when the mission would count as completed if the day ended now. */
  met: boolean;
}

/**
 * Today's progress on a mission, from the live day stats. Pure: reads the
 * state only. Nothing counts as met before the first customer of the day.
 */
export function missionProgress(state: GameState, mission: Mission): MissionProgress {
  const spec = SPECS[mission.id];
  const value = spec.measure(state);
  const ready = state.today.customersArrived > 0 && (spec.ready?.(state) ?? true);
  const target = mission.target;
  let ratio: number;
  let within: boolean;
  if (spec.goal === 'gte') {
    within = value >= target;
    ratio = target > 0 ? value / target : 1;
  } else {
    within = value <= target;
    ratio = within ? 1 : target > 0 ? target / value : 0;
  }
  if (!ready) ratio = spec.goal === 'gte' ? ratio : 0;
  return { value, ratio: Math.max(0, Math.min(1, ratio)), met: ready && within };
}

/** The six daily missions, in a fixed order the roll shuffles. */
export const MISSION_POOL: readonly MissionId[] = [
  'serve_customers',
  'no_stockout_loss',
  'food_cost',
  'sell_food',
  'end_rating',
  'low_abandon',
];

/** A stable 32-bit hash of the seed and the day, independent of the game RNG. */
function dayHash(seed: number, day: number): number {
  let h = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (day + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * The three missions for a day. Chosen with a local RNG seeded from the seed
 * and the day, so the same seed always gives the same missions and the draw
 * never advances `state.rngState`.
 */
export function rollMissions(seed: number, day: number, level: number): Mission[] {
  let rngState = dayHash(seed, day);
  const draw = (): number => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, MISSIONS_PER_DAY).map((id) => makeMission(id, level));
}

/** A fresh, active mission with its target and rewards for a shop level. */
export function makeMission(id: MissionId, level: number): Mission {
  const spec = SPECS[id];
  return { id, target: spec.target(level), progress: 0, rewardXp: spec.rewardXp, rewardMoney: spec.rewardMoney, status: 'active' };
}

export interface ProgressionResult {
  xpGained: number;
  levelUp?: { level: number; unlocks: Unlocks };
}

/**
 * Scores today's missions, grants XP (served customers, good reviews, completed
 * missions) and their small cash rewards, then levels the shop up if the XP
 * crosses a threshold. Call at the end of the day, after settleDay and
 * updateRating so the costs and rating are final. Missions are judged by
 * missionProgress, so an empty day completes none.
 */
export function scoreProgression(state: GameState): ProgressionResult {
  const t = state.today;
  let missionXp = 0;
  let missionMoney = 0;
  for (const m of state.missions) {
    const { value, met } = missionProgress(state, m);
    m.progress = value;
    m.status = met ? 'completed' : 'failed';
    if (met) {
      missionXp += m.rewardXp;
      missionMoney += m.rewardMoney;
    }
  }
  const goodReviews = state.reviews.filter((r) => r.day === t.day && r.stars >= GOOD_REVIEW_STARS).length;
  const baseXp = t.customersServed * XP_PER_SERVED + goodReviews * XP_PER_GOOD_REVIEW + missionXp;
  const xpGained = Math.round(baseXp * DIFFICULTIES[state.difficulty].xpMult);
  state.xp += xpGained;
  if (missionMoney > 0) state.money += missionMoney;

  const newLevel = levelForXp(state.xp);
  if (newLevel > state.shopLevel) {
    const unlocks = unlocksBetween(state.shopLevel, newLevel);
    state.shopLevel = newLevel;
    state.events.push({ type: 'level_up', level: newLevel, unlocks });
    return { xpGained, levelUp: { level: newLevel, unlocks } };
  }
  return { xpGained };
}

/** Lowest level that leaves every owned upgrade and enabled menu item unlocked. */
export function coverLevel(menu: readonly MenuEntry[], upgrades: Partial<Record<UpgradeId, number>>): number {
  let level = 1;
  for (const entry of menu) if (entry.enabled) level = Math.max(level, menuUnlockLevel(entry.id));
  for (const id of Object.keys(upgrades) as UpgradeId[]) {
    if ((upgrades[id] ?? 0) > 0) level = Math.max(level, upgradeUnlockLevel(id));
  }
  return Math.min(MAX_SHOP_LEVEL, level);
}

/** XP a played history is worth, so a save from before levelling gets a fair starting level. */
export function historyXp(history: readonly { customersServed?: number }[]): number {
  return history.reduce((sum, d) => sum + (d?.customersServed ?? 0) * XP_PER_SERVED, 0);
}

/** A stable seed derived from the shop name, for saves that predate the stored seed. */
export function deriveSeed(shopName: string): number {
  let h = 2166136261;
  for (let i = 0; i < shopName.length; i++) h = Math.imul(h ^ shopName.charCodeAt(i), 16777619);
  return h >>> 0;
}
