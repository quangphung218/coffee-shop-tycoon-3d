import { describe, expect, it } from 'vitest';
import { arrivalRate, totalSeats } from '../../src/sim/customers';
import { UPGRADE_TIERS, getUpgrade, upgradeTier } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import { brewMinutes } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import { CHAIR_OFFSET, CHAIR_SIZE } from '../../src/sim/nav';
import { INDOOR_AREA, buyUpgrade, getShopLayout, nextUpgradeCost, relayoutTables } from '../../src/sim/upgrades';
import type { Customer, GameState, UpgradeId, Vec2 } from '../../src/sim/types';

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
    s.shopLevel = 5; // window_bar unlocks at level 5
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

describe('upgradeTier', () => {
  // Levels 0.. up to two past maxLevel (shop-level bonus) and the tier each one shows.
  const TABLE: readonly (readonly [UpgradeId, number, readonly number[]])[] = [
    ['big_counter', 2, [0, 1, 2, 3, 3]],
    ['better_machine', 3, [0, 1, 2, 3, 3, 3]],
    ['tables', 6, [0, 1, 1, 2, 2, 3, 3, 3, 3]],
  ];

  it.each(TABLE)('splits the levels of %s (maxLevel %i) into three tiers', (id, maxLevel, tiers) => {
    expect(getUpgrade(id).maxLevel).toBe(maxLevel);
    expect(UPGRADE_TIERS).toBe(3);
    expect(tiers.map((_, level) => upgradeTier(id, level))).toEqual(tiers);
  });

  it('is 0 for a negative level', () => {
    expect(upgradeTier('tables', -1)).toBe(0);
  });
});

describe('getShopLayout', () => {
  it('reports tier 0 on a new game and the tier of each upgrade after buying', () => {
    const s = createNewGame('A', 'normal', 1);
    const fresh = getShopLayout(s);
    expect(fresh.machines.map((m) => m.tier)).toEqual([0]);
    expect(fresh.counter.tier).toBe(0);
    expect(fresh.furnitureTier).toBe(0);
    expect(fresh.outdoorTier).toBe(0);
    expect(fresh.decorTier).toEqual({ plant: 0, painting: 0, light: 0 });
    expect(fresh.windowBarTier).toBe(0);

    s.upgrades = { better_machine: 2, fast_machine: 1, grinder: 3, blender: 1, big_counter: 2, tables: 3, outdoor_seating: 1, plants: 2, paintings: 3, lights: 1, window_bar: 2 };
    const layout = getShopLayout(s);
    const tierOf = (kind: string): number[] => layout.machines.filter((m) => m.kind === kind).map((m) => m.tier);
    // espresso and fast follow better_machine; equipment follows its own level.
    expect(tierOf('espresso')).toEqual([2]);
    expect(tierOf('fast')).toEqual([2]);
    expect(tierOf('grinder')).toEqual([3]);
    expect(tierOf('blender')).toEqual([1]);
    expect(layout.machines.find((m) => m.kind === 'grinder')!.quality).toBe(3);
    expect(layout.counter).toMatchObject({ level: 2, tier: 2 });
    expect(layout.furnitureTier).toBe(2);
    expect(layout.outdoorTier).toBe(1);
    expect(layout.decorTier).toEqual({ plant: 2, painting: 3, light: 1 });
    expect(layout.windowBarTier).toBe(2);
  });

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

  it('splits the indoor tables into two blocks on a grid, and keeps chairs of different tables apart', () => {
    const s = rich();
    for (const id of ['tables', 'window_bar', 'outdoor_seating', 'expand_area'] as const) buyAll(s, id);
    const layout = getShopLayout(s);
    const indoor = layout.tables.filter((t) => t.zone === 'indoor');
    expect(indoor).toHaveLength(3 + getUpgrade('tables').maxLevel + getUpgrade('window_bar').maxLevel);
    // Every chair stays clear of the main aisle down x = 0, on both sides of it.
    for (const t of indoor) expect(Math.abs(t.pos.x) - CHAIR_OFFSET - CHAIR_SIZE / 2).toBeGreaterThanOrEqual(0.6);
    expect(indoor.some((t) => t.pos.x < 0) && indoor.some((t) => t.pos.x > 0)).toBe(true);
    // Columns and rows: few distinct x and z values, evenly spaced.
    const xs = [...new Set(indoor.map((t) => Math.abs(t.pos.x)))].sort((a, b) => a - b);
    const zs = [...new Set(indoor.map((t) => t.pos.z))].sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(zs).toHaveLength(3);
    expect(zs[1]! - zs[0]!).toBeCloseTo(zs[2]! - zs[1]!);

    const chairs = layout.tables.flatMap((t) => [-1, 1].map((side) => ({ id: t.id, x: t.pos.x + side * CHAIR_OFFSET, z: t.pos.z })));
    let closest = Infinity;
    for (const a of chairs) {
      for (const b of chairs) if (a.id !== b.id) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    }
    // P18 put chairs of neighbouring tables 0.5 apart.
    expect(closest).toBeGreaterThanOrEqual(0.75);
  });

  it('moves tables saved on an older floor plan to the current spots, customers with them', () => {
    const s = rich();
    buyAll(s, 'tables');
    buyAll(s, 'expand_area');
    const spots = s.tables.map((t) => ({ ...t.pos }));
    const table = s.tables[1]!;
    const old = { x: -1, z: 1 };
    table.pos = { ...old };
    s.tables[s.tables.length - 1]!.pos = { x: 6, z: -1 };
    const customer = (id: number, pos: Vec2, target: Vec2): Customer => ({
      id,
      state: 'drinking',
      pos,
      target,
      patience: 30,
      maxPatience: 40,
      order: 'latte',
      tableId: table.id,
      timer: 5,
      look: 0,
    });
    // P18 chairs stood 0.75 from the table centre.
    s.customers.push(customer(900, { x: old.x + 0.75, z: old.z }, { x: old.x + 0.75, z: old.z }), customer(901, { x: 0, z: 5 }, { x: old.x - 0.75, z: old.z }));
    relayoutTables(s);
    expect(s.tables.map((t) => t.pos)).toEqual(spots);
    const [a, b] = s.customers.slice(-2);
    expect(a!.target).toEqual({ x: table.pos.x + CHAIR_OFFSET, z: table.pos.z });
    expect(a!.pos).toEqual(a!.target);
    expect(b!.target).toEqual({ x: table.pos.x - CHAIR_OFFSET, z: table.pos.z });
    expect(b!.pos).toEqual({ x: 0, z: 5 });
  });

  it('survives a save round trip', () => {
    const s = rich();
    buyUpgrade(s, 'outdoor_seating');
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(getShopLayout(copy)).toEqual(getShopLayout(s));
  });
});
