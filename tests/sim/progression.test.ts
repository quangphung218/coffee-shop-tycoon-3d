import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import {
  BONUS_LEVEL_PRICE_MULT,
  FULL_UNLOCK_LEVEL,
  LEVELS,
  MAX_SHOP_LEVEL,
  levelForXp,
  maxLevelBonus,
  xpToReach,
} from '../../src/sim/data/levels';
import { UPGRADES, getUpgrade, upgradeCost } from '../../src/sim/data/upgrades';
import { WEEK_REWARDS, weekReward } from '../../src/sim/data/week';
import { dispatch, isUnlocked, missionProgress, rollMissions, scoreProgression } from '../../src/sim/index';
import { validateLayout } from '../../src/sim/nav/validate';
import { MISSION_POOL, XP_PER_SERVED, grantWeekReward, makeMission } from '../../src/sim/progression';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { DayStats, GameState, MissionId, UpgradeId, WeekResult } from '../../src/sim/types';
import {
  DECOR_REFUND_SHARE,
  INDOOR_AREA,
  buyUpgrade,
  getShopLayout,
  maxUpgradeLevel,
  nextUpgradeCost,
  removeDecor,
  upgradeLevel,
  upgradeLevelPrice,
} from '../../src/sim/upgrades';
import { settleDay } from '../../src/sim/economy';
import { updateRating } from '../../src/sim/rating';
import { playDay, runOpenDay } from '../integration/helpers';

/** A game with a clean, countable day: no missions, no reviews. */
function dayGame(served: number): GameState {
  const s = createNewGame('Quán XP', 'normal', 1);
  s.missions = [];
  s.today.customersArrived = Math.max(served, served + 1);
  s.today.customersServed = served;
  return s;
}

/** A level-1 Normal game whose only mission is `id`, with ten customers through the door today. */
function withMission(id: MissionId, patch: (t: DayStats) => void = () => {}): GameState {
  const s = createNewGame('Quán Nhiệm Vụ', 'normal', 1);
  s.missions = [makeMission(id, 1)];
  s.reviews = [];
  s.today.customersArrived = 10;
  patch(s.today);
  return s;
}

function progressOf(s: GameState) {
  return missionProgress(s, s.missions[0]!);
}

describe('shop levels 7–10', () => {
  /** A Normal game at `level` with plenty of money. */
  function rich(level: number): GameState {
    const s = createNewGame('Quán Cấp Cao', 'normal', 1);
    s.shopLevel = level;
    s.xp = xpToReach(level);
    s.money = 1e9;
    // The P27 record player and sofa corner also cost tickets.
    ensureRetention(s).tickets = 1000;
    return s;
  }

  /** Buys an upgrade until its cap at the shop's level. */
  function maxOut(s: GameState, id: UpgradeId): void {
    while (nextUpgradeCost(s, id) !== null) expect(buyUpgrade(s, id).ok).toBe(true);
  }

  it('unlocks only the sofa corner (level 8) and raises the cap of some upgrades by one level each', () => {
    expect(MAX_SHOP_LEVEL).toBe(10);
    for (const def of LEVELS.filter((l) => l.level > FULL_UNLOCK_LEVEL)) {
      // P27: the sofa corner stands in the side room, so it opens after the side room's third level (shop level 7).
      const upgrades = def.level === 8 ? ['sofa_corner'] : [];
      expect(def.unlocks, `level ${def.level}`).toEqual({ menu: [], upgrades, tools: [] });
      expect(Object.keys(def.maxLevelBonus ?? {}).length, `level ${def.level}`).toBeGreaterThan(0);
    }
    for (const def of LEVELS.filter((l) => l.level <= FULL_UNLOCK_LEVEL)) expect(def.maxLevelBonus).toBeUndefined();
    expect(maxLevelBonus(FULL_UNLOCK_LEVEL, 'better_machine')).toBe(0);
    expect(maxLevelBonus(7, 'better_machine')).toBe(1);
    expect(maxLevelBonus(MAX_SHOP_LEVEL, 'better_machine')).toBe(2);
    // P27: levels 7 and 9 each open one more side room level.
    expect(maxLevelBonus(MAX_SHOP_LEVEL, 'expand_area')).toBe(2);
  });

  it('opens the extra level only from the shop level that grants it, at BONUS_LEVEL_PRICE_MULT times the price', () => {
    const s6 = rich(FULL_UNLOCK_LEVEL);
    maxOut(s6, 'better_machine');
    expect(upgradeLevel(s6, 'better_machine')).toBe(getUpgrade('better_machine').maxLevel);
    expect(nextUpgradeCost(s6, 'better_machine')).toBeNull();

    const s7 = rich(7);
    maxOut(s7, 'better_machine');
    expect(maxUpgradeLevel(s7, 'better_machine')).toBe(getUpgrade('better_machine').maxLevel + 1);
    expect(upgradeLevel(s7, 'better_machine')).toBe(maxUpgradeLevel(s7, 'better_machine'));
    const def = getUpgrade('better_machine');
    const plain = upgradeCost({ ...def, maxLevel: Infinity }, def.maxLevel, DIFFICULTIES.normal.priceMult)!;
    expect(upgradeLevelPrice(s7, 'better_machine', def.maxLevel + 1)).toBe(plain * BONUS_LEVEL_PRICE_MULT);
    expect(upgradeLevelPrice(s7, 'better_machine', def.maxLevel)).toBe(
      upgradeCost(def, def.maxLevel - 1, DIFFICULTIES.normal.priceMult),
    );
  });

  it('keeps the floor plan valid with every upgrade at its level-10 cap', () => {
    const s = rich(MAX_SHOP_LEVEL);
    for (const def of UPGRADES) maxOut(s, def.id);
    const layout = getShopLayout(s);
    expect(validateLayout(layout)).toEqual([]);
    expect(layout.decor.filter((d) => d.kind === 'light')).toHaveLength(maxUpgradeLevel(s, 'lights'));
    expect(layout.tables.every((t) => t.pos.z < INDOOR_AREA.maxZ || t.zone === 'outdoor')).toBe(true);
  });

  it('refunds half of what a bonus decor level cost', () => {
    const s = rich(9);
    maxOut(s, 'lights');
    const top = upgradeLevel(s, 'lights');
    expect(top).toBe(getUpgrade('lights').maxLevel + 1);
    const before = s.money;
    const res = removeDecor(s, 'lights');
    expect(res).toEqual({ ok: true, refund: Math.round(upgradeLevelPrice(s, 'lights', top) * DECOR_REFUND_SHARE), level: top - 1 });
    expect(s.money - before).toBeGreaterThan(0);
  });
});

describe('week cup reward', () => {
  const result = (cups: number): WeekResult => ({
    revenue: 0,
    revenueTarget: 1,
    stars: 0,
    starsTarget: 1,
    score: 0,
    cups,
    days: [],
  });

  it('pays nothing below 2 cups', () => {
    const s = createNewGame('Quán', 'normal', 1);
    const money = s.money;
    expect(grantWeekReward(s, result(1))).toBe(0);
    expect(s.money).toBe(money);
    expect(s.events.some((e) => e.type === 'notify' && e.text.startsWith('Thưởng'))).toBe(false);
  });

  it('pays the difficulty amount for 2 and 3 cups and announces it, more on harder games', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (const cups of [2, 3] as const) {
        const s = createNewGame('Quán', d, 1);
        const money = s.money;
        expect(grantWeekReward(s, result(cups))).toBe(WEEK_REWARDS[d][cups]);
        expect(s.money - money).toBe(WEEK_REWARDS[d][cups]);
        expect(s.events.some((e) => e.type === 'notify' && e.level === 'success' && e.text.includes(`${cups} cúp`))).toBe(true);
      }
      expect(WEEK_REWARDS[d][3]).toBeGreaterThan(WEEK_REWARDS[d][2]);
    }
    expect(weekReward('hard', 2)).toBeGreaterThan(weekReward('normal', 2));
    expect(weekReward('normal', 2)).toBeGreaterThan(weekReward('easy', 2));
  });
});

describe('levels and XP', () => {
  it('maps total XP to the level thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpToReach(2) - 1)).toBe(1);
    expect(levelForXp(xpToReach(2))).toBe(2);
    expect(levelForXp(xpToReach(3) - 1)).toBe(2);
    expect(levelForXp(xpToReach(3))).toBe(3);
    expect(levelForXp(1_000_000)).toBe(MAX_SHOP_LEVEL);
  });

  it('raises the XP needed for every level', () => {
    for (let level = 2; level <= MAX_SHOP_LEVEL; level++) expect(xpToReach(level)).toBeGreaterThan(xpToReach(level - 1));
  });

  it('awards two XP per served customer', () => {
    const s = dayGame(10);
    const res = scoreProgression(s);
    expect(res.xpGained).toBe(20);
    expect(s.xp).toBe(20);
    expect(s.shopLevel).toBe(1);
    expect(res.levelUp).toBeUndefined();
  });

  it('counts 4–5 star reviews from today toward XP', () => {
    const s = dayGame(5);
    s.reviews = [
      { day: 1, stars: 5, text: '', author: 'A' },
      { day: 1, stars: 4, text: '', author: 'B' },
      { day: 1, stars: 3, text: '', author: 'C' },
      { day: 0, stars: 5, text: '', author: 'D' },
    ];
    const res = scoreProgression(s);
    // 5 served * 2 + 2 good reviews * 6 = 22
    expect(res.xpGained).toBe(22);
  });

  it('scales XP by difficulty: more on Easy, less on Hard', () => {
    const gained = (difficulty: 'easy' | 'normal' | 'hard') => {
      const s = dayGame(100);
      s.difficulty = difficulty;
      return scoreProgression(s).xpGained;
    };
    expect(gained('normal')).toBe(200);
    expect(gained('easy')).toBe(250);
    expect(gained('hard')).toBe(160);
  });

  it('levels the shop up at the XP threshold and reports the unlocks', () => {
    const s = dayGame(xpToReach(2) / XP_PER_SERVED);
    const res = scoreProgression(s);
    expect(s.xp).toBe(xpToReach(2));
    expect(s.shopLevel).toBe(2);
    expect(res.levelUp?.level).toBe(2);
    expect(res.levelUp?.unlocks.menu).toContain('cappuccino');
    expect(res.levelUp?.unlocks.upgrades).toContain('fast_machine');
    expect(s.events.some((e) => e.type === 'level_up')).toBe(true);
  });

  it('does not level up just below the threshold', () => {
    const s = dayGame(xpToReach(2) / XP_PER_SERVED - 1);
    const res = scoreProgression(s);
    expect(s.shopLevel).toBe(1);
    expect(res.levelUp).toBeUndefined();
    expect(s.events.some((e) => e.type === 'level_up')).toBe(false);
  });
});

describe('unlock gating', () => {
  it('reports which items and upgrades the level allows', () => {
    const s = createNewGame('Quán Khóa', 'normal', 1);
    expect(s.shopLevel).toBe(1);
    expect(isUnlocked(s, 'menu', 'espresso')).toBe(true);
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(false);
    expect(isUnlocked(s, 'upgrade', 'tables')).toBe(true);
    expect(isUnlocked(s, 'upgrade', 'expand_area')).toBe(false);
    s.shopLevel = MAX_SHOP_LEVEL;
    expect(isUnlocked(s, 'menu', 'cappuccino')).toBe(true);
    expect(isUnlocked(s, 'upgrade', 'expand_area')).toBe(true);
  });

  it('refuses to enable a locked menu item through dispatch', () => {
    const s = createNewGame('Quán Khóa', 'normal', 1);
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: true })).toBe(false);
    expect(s.menu.find((m) => m.id === 'cappuccino')!.enabled).toBe(false);
    // Turning a locked item off is a no-op that still succeeds.
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: false })).toBe(true);
    // Once the level is high enough, the same command works.
    s.shopLevel = 2;
    expect(dispatch(s, { type: 'set_menu_item', itemId: 'cappuccino', enabled: true })).toBe(true);
    expect(s.menu.find((m) => m.id === 'cappuccino')!.enabled).toBe(true);
  });

  it('refuses to buy a locked upgrade through dispatch', () => {
    const s = createNewGame('Quán Khóa', 'normal', 1);
    s.money = 1e12;
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'fast_machine' })).toBe(false);
    expect(s.upgrades.fast_machine ?? 0).toBe(0);
    // A level-1 upgrade still buys.
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    // After levelling, the gated upgrade opens up.
    s.shopLevel = 2;
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'fast_machine' })).toBe(true);
    expect(s.upgrades.fast_machine).toBe(1);
  });
});

describe('daily missions', () => {
  it('rolls three distinct missions deterministically from the seed and day', () => {
    const a = rollMissions(123, 5, 3);
    const b = rollMissions(123, 5, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
    for (const m of a) expect(m).toEqual(makeMission(m.id, 3));
  });

  it('gives the same missions to two games with the same seed', () => {
    const g1 = createNewGame('Quán Hạt', 'normal', 42);
    const g2 = createNewGame('Quán Hạt', 'normal', 42);
    expect(g1.missions).toEqual(g2.missions);
  });

  it('gives different seeds different missions over the first days', () => {
    const forSeed = (seed: number) => [1, 2, 3].map((d) => rollMissions(seed, d, 1).map((m) => m.id).join(','));
    expect(forSeed(1)).not.toEqual(forSeed(2));
  });

  it('draws every mission of the pool over a few weeks', () => {
    const seen = new Set<MissionId>();
    for (let day = 1; day <= 30; day++) for (const m of rollMissions(7, day, 1)) seen.add(m.id);
    expect([...seen].sort()).toEqual([...MISSION_POOL].sort());
  });

  it('scales serve and food targets with the shop level', () => {
    expect(makeMission('serve_customers', 6).target).toBeGreaterThan(makeMission('serve_customers', 1).target);
    expect(makeMission('sell_food', 6).target).toBeGreaterThan(makeMission('sell_food', 1).target);
    expect(makeMission('end_rating', 6).target).toBeGreaterThan(makeMission('end_rating', 1).target);
    expect(makeMission('low_abandon', 6).target).toBeLessThan(makeMission('low_abandon', 1).target);
  });

  it('completes no missions and grants nothing on a day with no customers', () => {
    const s = createNewGame('Quán Vắng', 'normal', 1);
    const money = s.money;
    const res = scoreProgression(s);
    expect(res.xpGained).toBe(0);
    expect(s.money).toBe(money);
    expect(s.missions.every((m) => m.status === 'failed')).toBe(true);
  });

  it('scores the missions at the end of the day and puts them in the report', () => {
    const s = createNewGame('Quán Báo Cáo', 'normal', 20261014);
    s.missions = [makeMission('serve_customers', 1), makeMission('food_cost', 1), makeMission('low_abandon', 1)];
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    playDay(s);
    const r = s.lastReport!;
    expect(r.missions).toHaveLength(3);
    for (const m of r.missions!) expect(['completed', 'failed']).toContain(m.status);
    const serve = r.missions!.find((m) => m.id === 'serve_customers');
    expect(serve).toBeDefined();
    expect(serve!.progress).toBe(s.today.customersServed);
    expect(r.xpGained).toBeGreaterThanOrEqual(s.today.customersServed * 2);
    // Day one started at zero XP, so the total equals what today gained.
    expect(s.xp).toBe(r.xpGained);
  });

  it('rolls a fresh set of missions keyed to the next day', () => {
    const s = createNewGame('Quán Ngày', 'normal', 55);
    expect(s.missions).toEqual(rollMissions(s.seed, 1, s.shopLevel));
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    playDay(s);
    expect(dispatch(s, { type: 'next_day' })).toBe(true);
    expect(s.day).toBe(2);
    expect(s.missions).toEqual(rollMissions(s.seed, 2, s.shopLevel));
  });
});

describe('missionProgress', () => {
  it('serve_customers: met at the target (gte), partway below it', () => {
    const target = makeMission('serve_customers', 1).target;
    const below = progressOf(withMission('serve_customers', (t) => (t.customersServed = target - 1)));
    expect(below).toEqual({ value: target - 1, ratio: (target - 1) / target, met: false });
    const at = progressOf(withMission('serve_customers', (t) => (t.customersServed = target)));
    expect(at).toEqual({ value: target, ratio: 1, met: true });
    const over = progressOf(withMission('serve_customers', (t) => (t.customersServed = target * 2)));
    expect(over.ratio).toBe(1);
    expect(over.met).toBe(true);
  });

  it('no_stockout_loss: target 0 holds with no stockout and breaks on the first one', () => {
    expect(makeMission('no_stockout_loss', 1).target).toBe(0);
    expect(progressOf(withMission('no_stockout_loss'))).toEqual({ value: 0, ratio: 1, met: true });
    const lost = progressOf(withMission('no_stockout_loss', (t) => (t.outOfStock = { latte: 1 })));
    expect(lost).toEqual({ value: 1, ratio: 0, met: false });
  });

  it('food_cost: met at or under the target (lte), missed above it', () => {
    const target = makeMission('food_cost', 1).target;
    // Normal difficulty prices ingredients at ×1, so ingredientsUsed is the cost in đồng.
    const at = progressOf(withMission('food_cost', (t) => {
      t.revenue = 100_000;
      t.ingredientsUsed = target * 1000;
    }));
    expect(at).toEqual({ value: target, ratio: 1, met: true });
    const over = progressOf(withMission('food_cost', (t) => {
      t.revenue = 100_000;
      t.ingredientsUsed = (target + 2) * 1000;
    }));
    expect(over.value).toBe(target + 2);
    expect(over.met).toBe(false);
    expect(over.ratio).toBeCloseTo(target / (target + 2), 6);
  });

  it('food_cost: reads the live cost during the day, not the ingredientCost booked at closing', () => {
    // Mid-day ingredientCost is still 0; only settleDay fills it.
    const s = withMission('food_cost', (t) => {
      t.revenue = 100_000;
      t.ingredientsUsed = 60_000;
    });
    expect(s.today.ingredientCost).toBe(0);
    expect(progressOf(s)).toMatchObject({ value: 60, met: false });
  });

  it('food_cost: mid-day progress equals the ratio booked when the day is settled', () => {
    const s = createNewGame('Quán Giá Vốn', 'hard', 20261015);
    s.missions = [makeMission('food_cost', 1)];
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    runOpenDay(s, { untilMinute: 13 * 60 });
    expect(s.phase).not.toBe('report');
    expect(s.today.revenue).toBeGreaterThan(0);
    expect(s.today.ingredientsUsed ?? 0).toBeGreaterThan(0);
    const live = progressOf(s);
    const settled = structuredClone(s);
    settleDay(settled);
    expect(settled.today.ingredientCost).toBeGreaterThan(0);
    expect(live.value).toBe(Math.round((settled.today.ingredientCost / settled.today.revenue) * 100));
    expect(progressOf(settled)).toEqual(live);
  });

  it('food_cost: with no revenue there is not enough data, so no value, no bar and not met', () => {
    const idle = progressOf(withMission('food_cost'));
    expect(idle).toEqual({ value: null, ratio: 0, met: false });
    // Ingredients used with no sales yet is still not a judgeable ratio.
    const unsold = progressOf(withMission('food_cost', (t) => (t.ingredientsUsed = 12_000)));
    expect(unsold).toEqual({ value: null, ratio: 0, met: false });
  });

  it('sell_food: counts croissants and cakes together against the target (gte)', () => {
    const target = makeMission('sell_food', 1).target;
    const short = progressOf(withMission('sell_food', (t) => (t.sold = { croissant: target - 1, latte: 20 })));
    expect(short.value).toBe(target - 1);
    expect(short.met).toBe(false);
    const done = progressOf(withMission('sell_food', (t) => (t.sold = { croissant: target - 1, cake: 1 })));
    expect(done).toEqual({ value: target, ratio: 1, met: true });
  });

  it('end_rating: met when the projected end-of-day rating reaches the target (gte)', () => {
    const target = makeMission('end_rating', 1).target;
    // A flawless day from a 5-star start stays at 5.
    const good = progressOf(withMission('end_rating', (t) => {
      t.ratingStart = 5;
      t.customersServed = 10;
    }));
    expect(good).toEqual({ value: 5, ratio: 1, met: true });
    // From 1 star, a day where everyone walks out cannot reach the target.
    const low = progressOf(withMission('end_rating', (t) => {
      t.ratingStart = 1;
      t.customersLost = 10;
    }));
    expect(low.met).toBe(false);
    expect(low.value!).toBeLessThan(target);
    expect(low.ratio).toBeCloseTo(low.value! / target, 6);
  });

  it('end_rating: mid-day value equals the rating updateRating records at closing', () => {
    const s = createNewGame('Quán Sao', 'normal', 7);
    s.missions = [makeMission('end_rating', 1)];
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    runOpenDay(s, { untilMinute: 12 * 60 });
    expect(s.today.customersArrived).toBeGreaterThan(0);
    const live = progressOf(s);
    const closed = structuredClone(s);
    updateRating(closed);
    expect(live.value).toBe(closed.today.ratingEnd);
  });

  it('low_abandon: met at or under the target walk-out share (lte)', () => {
    const target = makeMission('low_abandon', 1).target;
    const at = progressOf(withMission('low_abandon', (t) => {
      t.customersArrived = 100;
      t.customersLost = target;
    }));
    expect(at).toEqual({ value: target, ratio: 1, met: true });
    const over = progressOf(withMission('low_abandon', (t) => {
      t.customersArrived = 100;
      t.customersLost = target + 5;
    }));
    expect(over.met).toBe(false);
    expect(over.ratio).toBeCloseTo(target / (target + 5), 6);
  });

  it('counts nothing as met before the first customer of the day', () => {
    for (const id of MISSION_POOL) {
      const s = withMission(id, (t) => {
        t.customersArrived = 0;
        t.ratingEnd = 5;
      });
      expect(progressOf(s).met, id).toBe(false);
    }
  });

  it('does not change the state', () => {
    const s = withMission('serve_customers', (t) => (t.customersServed = 3));
    const before = structuredClone(s);
    progressOf(s);
    expect(s).toEqual(before);
  });
});

describe('mission rewards', () => {
  it('adds the XP and money of a completed mission on top of service XP', () => {
    const s = withMission('serve_customers', (t) => (t.customersServed = 40));
    const mission = s.missions[0]!;
    const money = s.money;
    const res = scoreProgression(s);
    expect(mission.status).toBe('completed');
    expect(mission.progress).toBe(40);
    expect(res.xpGained).toBe(40 * XP_PER_SERVED + mission.rewardXp);
    expect(s.money).toBe(money + mission.rewardMoney);
  });

  it('grants nothing for a failed mission', () => {
    const s = withMission('no_stockout_loss', (t) => {
      t.customersServed = 5;
      t.outOfStock = { croissant: 2 };
    });
    const money = s.money;
    const res = scoreProgression(s);
    expect(s.missions[0]!.status).toBe('failed');
    expect(res.xpGained).toBe(5 * XP_PER_SERVED);
    expect(s.money).toBe(money);
  });

  it('sums the rewards of every completed mission', () => {
    const s = createNewGame('Quán Thưởng', 'normal', 1);
    s.reviews = [];
    s.missions = [makeMission('serve_customers', 1), makeMission('no_stockout_loss', 1), makeMission('sell_food', 1)];
    s.today.customersArrived = 50;
    s.today.customersServed = 50;
    s.today.sold = { croissant: 1 }; // short of the food target
    const money = s.money;
    const res = scoreProgression(s);
    const [serve, stock, food] = s.missions;
    expect([serve!.status, stock!.status, food!.status]).toEqual(['completed', 'completed', 'failed']);
    expect(res.xpGained).toBe(50 * XP_PER_SERVED + serve!.rewardXp + stock!.rewardXp);
    expect(s.money).toBe(money + serve!.rewardMoney + stock!.rewardMoney);
  });

  it('gives every mission a positive XP and money reward', () => {
    for (const id of MISSION_POOL) {
      const m = makeMission(id, 1);
      expect(m.rewardXp, id).toBeGreaterThan(0);
      expect(m.rewardMoney, id).toBeGreaterThan(0);
      expect(Number.isInteger(m.rewardMoney), id).toBe(true);
    }
  });
});
