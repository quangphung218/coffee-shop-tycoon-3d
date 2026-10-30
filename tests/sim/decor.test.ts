import { describe, expect, it } from 'vitest';
import { arrivalRate } from '../../src/sim/customers';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { getUpgrade, totalUpgradeEffect, upgradeCost } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import { dayScore } from '../../src/sim/rating';
import { createNewGame } from '../../src/sim/state';
import { DECOR_REFUND_SHARE, getShopLayout, isRemovableDecor, removeDecor } from '../../src/sim/upgrades';
import type { GameState } from '../../src/sim/types';
import { ensureRetention } from '../../src/sim/retention';

function rich(difficulty: GameState['difficulty'] = 'normal'): GameState {
  const s = createNewGame('A', difficulty, 1);
  s.money = 100_000_000;
  ensureRetention(s).tickets = 1000;
  s.shopLevel = 6;
  return s;
}

/** A day where everyone was served at half patience, so the score sits below 5 and bonuses show. */
function middlingDay(s: GameState): void {
  s.today.customersArrived = 10;
  s.today.customersServed = 8;
  s.today.customersLost = 2;
  s.today.waitShareSum = 4;
}

describe('placing decor', () => {
  it('buying plants raises the rating bonus, appeal, day score and arrivals', () => {
    const s = rich();
    middlingDay(s);
    const before = {
      bonus: totalUpgradeEffect(s.upgrades).ratingBonus ?? 0,
      appeal: totalUpgradeEffect(s.upgrades).appeal ?? 0,
      score: dayScore(s),
      arrivals: arrivalRate(s),
    };

    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'plants' })).toBe(true);

    const after = totalUpgradeEffect(s.upgrades);
    expect(after.ratingBonus ?? 0).toBeGreaterThan(before.bonus);
    expect(after.appeal ?? 0).toBeGreaterThan(before.appeal);
    expect(dayScore(s)).toBeGreaterThan(before.score);
    expect(arrivalRate(s)).toBeGreaterThan(before.arrivals);
  });
});

describe('remove_decor', () => {
  it('takes plants down one level, refunds half that level and lowers the bonuses', () => {
    const s = rich();
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'plants' })).toBe(true);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'plants' })).toBe(true);
    middlingDay(s);
    const before = {
      money: s.money,
      decor: getShopLayout(s).decor.filter((d) => d.kind === 'plant').length,
      bonus: totalUpgradeEffect(s.upgrades).ratingBonus,
      score: dayScore(s),
      arrivals: arrivalRate(s),
    };
    const paid = upgradeCost(getUpgrade('plants'), 1, DIFFICULTIES.normal.priceMult)!;

    expect(dispatch(s, { type: 'remove_decor', upgradeId: 'plants' })).toBe(true);

    expect(s.upgrades.plants).toBe(1);
    expect(s.money).toBe(before.money + Math.round(paid * DECOR_REFUND_SHARE));
    expect(getShopLayout(s).decor.filter((d) => d.kind === 'plant')).toHaveLength(before.decor - 1);
    expect(totalUpgradeEffect(s.upgrades).ratingBonus).toBeCloseTo(before.bonus - getUpgrade('plants').effectPerLevel.ratingBonus!);
    expect(dayScore(s)).toBeLessThan(before.score);
    expect(arrivalRate(s)).toBeLessThan(before.arrivals);
  });

  it('refunds by the difficulty price', () => {
    const s = rich('hard');
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'lights' })).toBe(true);
    const money = s.money;
    const result = removeDecor(s, 'lights');
    const paid = upgradeCost(getUpgrade('lights'), 0, DIFFICULTIES.hard.priceMult)!;
    expect(result).toEqual({ ok: true, refund: Math.round(paid * DECOR_REFUND_SHARE), level: 0 });
    expect(s.money).toBe(money + Math.round(paid * DECOR_REFUND_SHARE));
    expect(getShopLayout(s).decor).toEqual([]);
  });

  it('refuses at level 0 and leaves the state alone', () => {
    const s = rich();
    const money = s.money;
    expect(dispatch(s, { type: 'remove_decor', upgradeId: 'paintings' })).toBe(false);
    expect(s.upgrades.paintings ?? 0).toBe(0);
    expect(s.money).toBe(money);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'notify', level: 'error' }));
  });

  it('cannot take down the window bar or a non-decor upgrade', () => {
    const s = rich();
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'window_bar' })).toBe(true);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    const tables = s.tables.length;
    const money = s.money;
    expect(dispatch(s, { type: 'remove_decor', upgradeId: 'window_bar' })).toBe(false);
    expect(dispatch(s, { type: 'remove_decor', upgradeId: 'tables' })).toBe(false);
    expect(s.upgrades.window_bar).toBe(1);
    expect(s.upgrades.tables).toBe(1);
    expect(s.tables).toHaveLength(tables);
    expect(s.money).toBe(money);
    expect(s.events.filter((e) => e.type === 'notify' && e.level === 'error')).toHaveLength(2);
  });

  it('only plants, paintings and lights are removable', () => {
    expect(['plants', 'paintings', 'lights'].every((id) => isRemovableDecor(id as 'plants'))).toBe(true);
    expect(isRemovableDecor('window_bar')).toBe(false);
    expect(isRemovableDecor('better_machine')).toBe(false);
  });
});
