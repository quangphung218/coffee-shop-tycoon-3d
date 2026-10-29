import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { dispatch } from '../../src/sim/index';
import { isUnlocked } from '../../src/sim/progression';
import { sellPriceMult } from '../../src/sim/policies';
import { createNewGame } from '../../src/sim/state';
import { maxUpgradeLevel, nextUpgradeCost, upgradeLevel } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

/** Plays `days` days with the morning restock. */
function played(seed: number, days: number): GameState {
  const s = createNewGame('Quán V5', 'normal', seed);
  for (let d = 1; d <= days; d++) {
    if (d > 1) expect(dispatch(s, { type: 'next_day' })).toBe(true);
    dispatch(s, { type: 'apply_restock' });
    playDay(s);
  }
  return s;
}

/** A v5 save of `state`: v5 had no field E-05 added, so only the version differs. */
function v5Save(state: GameState): string {
  return JSON.stringify({ version: 5, savedAt: 1_700_000_000_000, state: { ...state, events: [] } });
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('migrate v5 → v6 (E-05 late-game upgrade levels)', { timeout: 120_000 }, () => {
  it('loads a played week at SAVE_VERSION 6 without recomputing money, days, the week or its archive', () => {
    expect(SAVE_VERSION).toBe(6);
    const s = played(7, WEEK_LENGTH);
    const raw = JSON.parse(v5Save(s)) as { state: GameState };
    const r = migrate(JSON.parse(v5Save(s)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe(6);
    const g = r.value.state;
    expect(g.money).toBe(raw.state.money);
    expect(g.upgrades).toEqual(raw.state.upgrades);
    expect(g.history).toEqual(raw.state.history);
    expect(g.today).toEqual(raw.state.today);
    expect(g.week!.result).toEqual(raw.state.week!.result);
    expect(g.week!.archive).toEqual(raw.state.week!.archive);
    expect(g.lastReport).toEqual(raw.state.lastReport);
  });

  it('keeps the old shop-level 7 bonus levels within the new caps and opens the new levels and decor', () => {
    const s = createNewGame('Quán V5 cấp 7', 'normal', 3);
    s.shopLevel = 7;
    s.money = 500_000_000;
    // What v5 let a level-7 shop own: better_machine, grinder and expand_area one level past their base max.
    const old: Partial<Record<UpgradeId, number>> = { better_machine: 4, grinder: 4, expand_area: 3, plants: 3 };
    s.upgrades = { ...old };
    const g = load(v5Save(s));
    expect(g.upgrades).toEqual(old);
    for (const id of Object.keys(old) as UpgradeId[]) expect(upgradeLevel(g, id), id).toBeLessThanOrEqual(maxUpgradeLevel(g, id));
    // The old levels now carry the E-05 price bonus; the new levels and the level-7 decor can be bought.
    expect(sellPriceMult(g)).toBeGreaterThan(1);
    expect(nextUpgradeCost(g, 'plants')).not.toBeNull();
    expect(isUnlocked(g, 'upgrade', 'chandelier')).toBe(true);
    expect(dispatch(g, { type: 'buy_upgrade', upgradeId: 'chandelier' })).toBe(true);
    expect(upgradeLevel(g, 'chandelier')).toBe(1);
  });

  it('plays on after loading and saves back at version 6', () => {
    const g = load(v5Save(played(11, 2)));
    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    playDay(g);
    const storage = createMemoryStorage();
    expect(saveGame(g, 'auto', storage).ok).toBe(true);
    expect(JSON.parse(storage.getItem(saveKey('auto'))!).version).toBe(6);
  });
});
