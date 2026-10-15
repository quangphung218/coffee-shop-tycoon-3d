import { describe, expect, it } from 'vitest';
import { MAX_SHOP_LEVEL, levelForXp, xpToReach } from '../../src/sim/data/levels';
import { dispatch, isUnlocked, missionProgress, rollMissions, scoreProgression } from '../../src/sim/index';
import { MISSION_POOL, XP_PER_SERVED, makeMission } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import type { DayStats, GameState, MissionId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

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
    const at = progressOf(withMission('food_cost', (t) => {
      t.revenue = 100_000;
      t.ingredientCost = target * 1000;
    }));
    expect(at).toEqual({ value: target, ratio: 1, met: true });
    const over = progressOf(withMission('food_cost', (t) => {
      t.revenue = 100_000;
      t.ingredientCost = (target + 2) * 1000;
    }));
    expect(over.value).toBe(target + 2);
    expect(over.met).toBe(false);
    expect(over.ratio).toBeCloseTo(target / (target + 2), 6);
  });

  it('food_cost: with no revenue it neither passes on its own nor reads as a blow-out', () => {
    // Customers came but nothing was sold or used: nothing to judge yet, so not met and no bar.
    const idle = progressOf(withMission('food_cost'));
    expect(idle).toEqual({ value: 0, ratio: 0, met: false });
    // Ingredients used with no sales count as 100%, which misses the target.
    const unsold = progressOf(withMission('food_cost', (t) => (t.ingredientCost = 12_000)));
    expect(unsold).toEqual({ value: 100, ratio: 0, met: false });
  });

  it('sell_food: counts croissants and cakes together against the target (gte)', () => {
    const target = makeMission('sell_food', 1).target;
    const short = progressOf(withMission('sell_food', (t) => (t.sold = { croissant: target - 1, latte: 20 })));
    expect(short.value).toBe(target - 1);
    expect(short.met).toBe(false);
    const done = progressOf(withMission('sell_food', (t) => (t.sold = { croissant: target - 1, cake: 1 })));
    expect(done).toEqual({ value: target, ratio: 1, met: true });
  });

  it('end_rating: met when the end-of-day rating reaches the target (gte)', () => {
    const target = makeMission('end_rating', 1).target;
    expect(progressOf(withMission('end_rating', (t) => (t.ratingEnd = target))).met).toBe(true);
    const low = progressOf(withMission('end_rating', (t) => (t.ratingEnd = target - 0.01)));
    expect(low.met).toBe(false);
    expect(low.ratio).toBeCloseTo((target - 0.01) / target, 6);
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
