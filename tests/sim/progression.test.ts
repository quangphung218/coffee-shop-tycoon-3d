import { describe, expect, it } from 'vitest';
import { MAX_SHOP_LEVEL, levelForXp } from '../../src/sim/data/levels';
import { dispatch, isUnlocked, rollMissions, scoreProgression } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** A game with a clean, countable day: no missions, no reviews. */
function dayGame(served: number): GameState {
  const s = createNewGame('Quán XP', 'normal', 1);
  s.missions = [];
  s.today.customersArrived = Math.max(served, served + 1);
  s.today.customersServed = served;
  return s;
}

describe('levels and XP', () => {
  it('maps total XP to the level thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(119)).toBe(1);
    expect(levelForXp(120)).toBe(2);
    expect(levelForXp(319)).toBe(2);
    expect(levelForXp(320)).toBe(3);
    expect(levelForXp(1_000_000)).toBe(MAX_SHOP_LEVEL);
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

  it('levels the shop up at the XP threshold and reports the unlocks', () => {
    const s = dayGame(60); // 120 XP, exactly level 2
    const res = scoreProgression(s);
    expect(s.xp).toBe(120);
    expect(s.shopLevel).toBe(2);
    expect(res.levelUp?.level).toBe(2);
    expect(res.levelUp?.unlocks.menu).toContain('cappuccino');
    expect(res.levelUp?.unlocks.upgrades).toContain('fast_machine');
    expect(s.events.some((e) => e.type === 'level_up')).toBe(true);
  });

  it('does not level up just below the threshold', () => {
    const s = dayGame(59); // 118 XP
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

  it('scales serve targets with the shop level', () => {
    const low = rollMissions(123, 5, 1).find((m) => m.id === 'serve_customers');
    const high = rollMissions(123, 5, 6).find((m) => m.id === 'serve_customers');
    if (low && high) expect(high.target).toBeGreaterThan(low.target);
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
    expect(dispatch(s, { type: 'apply_restock' })).toBe(true);
    playDay(s);
    const r = s.lastReport!;
    expect(r.missions).toHaveLength(3);
    for (const m of r.missions!) expect(['completed', 'failed']).toContain(m.status);
    const serve = r.missions!.find((m) => m.id === 'serve_customers');
    if (serve) expect(serve.progress).toBe(s.today.customersServed);
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
