import { describe, expect, it } from 'vitest';
import { arrivalRate, totalSeats } from '../../src/sim/customers';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import { brewMinutes } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import { INDOOR_AREA, buyUpgrade, getShopLayout, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

function rich(): GameState {
  const s = createNewGame('A', 'normal', 1);
  s.money = 100_000_000;
  return s;
}

function buyAll(s: GameState, id: UpgradeId): void {
  while (nextUpgradeCost(s, id) !== null) expect(buyUpgrade(s, id).ok).toBe(true);
}

describe('buyUpgrade', () => {
  it('adds a table and seats when buying tables', () => {
    const s = createNewGame('A', 'normal', 1);
    const tables = s.tables.length;
    const seats = totalSeats(s);
    const money = s.money;
    const cost = nextUpgradeCost(s, 'tables')!;
    expect(cost).toBe(getUpgrade('tables').baseCost);
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'tables' })).toBe(true);
    expect(s.upgrades.tables).toBe(1);
    expect(s.tables).toHaveLength(tables + 1);
    expect(totalSeats(s)).toBe(seats + 2);
    expect(s.money).toBe(money - cost);
    expect(s.today.upgradeCost).toBe(cost);
    expect(nextUpgradeCost(s, 'tables')).toBeGreaterThan(cost);
  });

  it('refuses when the money is short', () => {
    const s = createNewGame('A', 'normal', 1);
    s.money = nextUpgradeCost(s, 'tables')! - 1;
    const before = JSON.stringify({ tables: s.tables, upgrades: s.upgrades, money: s.money });
    const result = buyUpgrade(s, 'tables');
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify({ tables: s.tables, upgrades: s.upgrades, money: s.money })).toBe(before);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'notify', level: 'error' }));
  });

  it('refuses past the max level', () => {
    const s = rich();
    buyAll(s, 'tables');
    expect(s.upgrades.tables).toBe(getUpgrade('tables').maxLevel);
    const money = s.money;
    expect(buyUpgrade(s, 'tables').ok).toBe(false);
    expect(s.money).toBe(money);
  });

  it('adds seats indoors when buying a decor item with capacity', () => {
    const s = createNewGame('A', 'normal', 1);
    const def = getUpgrade('window_bar');
    expect(def.category).toBe('decor');
    const seats = totalSeats(s);
    const layoutSeats = getShopLayout(s).totalSeats;
    expect(dispatch(s, { type: 'buy_upgrade', upgradeId: 'window_bar' })).toBe(true);
    expect(totalSeats(s)).toBe(seats + def.effectPerLevel.capacity!);
    const layout = getShopLayout(s);
    expect(layout.totalSeats).toBe(layoutSeats + def.effectPerLevel.capacity!);
    const added = layout.tables[layout.tables.length - 1]!;
    expect(added.zone).toBe('indoor');
  });

  it('charges more on hard', () => {
    expect(nextUpgradeCost(createNewGame('A', 'hard', 1), 'plants')).toBeGreaterThan(
      nextUpgradeCost(createNewGame('A', 'normal', 1), 'plants')!,
    );
  });

  it('applies brew speed, appeal and seating effects', () => {
    const s = rich();
    s.phase = 'opening';
    const brew = brewMinutes(s, 'mocha');
    const rate = arrivalRate(s);
    buyAll(s, 'fast_machine');
    expect(brewMinutes(s, 'mocha')).toBeLessThan(brew);
    buyUpgrade(s, 'lights');
    expect(arrivalRate(s)).toBeGreaterThan(rate);

    const seats = totalSeats(s);
    buyUpgrade(s, 'outdoor_seating');
    buyUpgrade(s, 'expand_area');
    expect(totalSeats(s)).toBe(seats + 4 + 6);
  });
});

describe('getShopLayout', () => {
  it('lists the new table where the renderer can place it', () => {
    const s = createNewGame('A', 'normal', 1);
    const before = getShopLayout(s);
    expect(before.tables).toHaveLength(s.tables.length);
    expect(before.expansion).toBeNull();
    expect(before.outdoor).toBeNull();
    expect(before.machines).toHaveLength(1);
    expect(before.decor).toEqual([]);

    buyUpgrade(s, 'tables');
    const after = getShopLayout(s);
    const added = s.tables[s.tables.length - 1]!;
    expect(after.tables).toContainEqual({ id: added.id, pos: added.pos, seats: 2, zone: 'indoor' });
    expect(after.totalSeats).toBe(before.totalSeats + 2);
    expect(added.pos.x).toBeGreaterThanOrEqual(INDOOR_AREA.minX);
    expect(added.pos.x).toBeLessThanOrEqual(INDOOR_AREA.maxX);
    expect(added.pos.z).toBeLessThan(INDOOR_AREA.maxZ);
  });

  it('places every table at its own spot inside its area', () => {
    const s = rich();
    for (const id of ['tables', 'outdoor_seating', 'expand_area', 'big_counter', 'fast_machine', 'plants', 'paintings', 'lights', 'window_bar'] as const) {
      buyAll(s, id);
    }
    const layout = getShopLayout(s);
    const spots = new Set(layout.tables.map((t) => `${t.pos.x},${t.pos.z}`));
    expect(spots.size).toBe(layout.tables.length);
    const zones = { indoor: layout.indoor, expansion: layout.expansion, outdoor: layout.outdoor };
    for (const t of layout.tables) {
      const area = zones[t.zone]!;
      expect(area, t.zone).not.toBeNull();
      expect(t.pos.x).toBeGreaterThanOrEqual(area.minX);
      expect(t.pos.x).toBeLessThanOrEqual(area.maxX);
      expect(t.pos.z).toBeGreaterThanOrEqual(area.minZ);
      expect(t.pos.z).toBeLessThanOrEqual(area.maxZ);
    }
    expect(layout.tables.filter((t) => t.zone === 'outdoor')).toHaveLength(4);
    expect(layout.tables.filter((t) => t.zone === 'expansion')).toHaveLength(6);
    expect(layout.counter.width).toBeGreaterThan(getShopLayout(createNewGame('A', 'normal', 1)).counter.width);
    expect(layout.machines.filter((m) => m.kind === 'fast')).toHaveLength(getUpgrade('fast_machine').maxLevel);
    expect(layout.decor.filter((d) => d.kind === 'plant')).toHaveLength(getUpgrade('plants').maxLevel);
    expect(layout.decor.filter((d) => d.kind === 'light')).toHaveLength(getUpgrade('lights').maxLevel);
    expect(layout.totalSeats).toBe(totalSeats(s));
  });

  it('survives a save round trip', () => {
    const s = rich();
    buyUpgrade(s, 'outdoor_seating');
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(getShopLayout(copy)).toEqual(getShopLayout(s));
  });
});
