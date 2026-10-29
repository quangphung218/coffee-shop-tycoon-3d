import { describe, expect, it } from 'vitest';
import { floorSpots } from '../../src/sim/customers';
import { MAX_SHOP_LEVEL } from '../../src/sim/data/levels';
import { upgradeUnlockLevel } from '../../src/sim/data/levels';
import {
  ART_GALLERY_SIZE,
  BOOKSHELF_SIZE,
  CHAIR_OFFSET,
  CHAIR_SIZE,
  DOOR_WIDTH,
  PIANO_SIZE,
  PLANT_RADIUS,
  TABLE_RADIUS,
  buildNavGrid,
  findPath,
  layoutFootprints,
  shapeBounds,
  shapeDistance,
  validateLayout,
} from '../../src/sim/nav';
import { AGENT_RADIUS } from '../../src/sim/nav/grid';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState, UpgradeId, Vec2 } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, maxUpgradeLevel, upgradeBlockedReason, upgradeLevel, type PremiumKind, type ShopLayout } from '../../src/sim/upgrades';

const PREMIUM: readonly PremiumKind[] = ['chandelier', 'marble_tables', 'art_gallery', 'grand_piano'];
const DECOR: readonly UpgradeId[] = ['plants', 'paintings', 'lights', 'neon_sign', 'bookshelf', 'record_player', 'sofa_corner'];
const EQUIPMENT: readonly UpgradeId[] = [
  'better_machine',
  'fast_machine',
  'big_counter',
  'grinder',
  'pastry_case',
  'blender',
  'ice_maker',
  'dishwasher',
  'cold_brew_tower',
  'oven',
];
const OUTSIDE: Vec2 = { x: 0, z: 9.2 };
/** Widest reach of a chandelier from its cord, and of a pendant lamp (tier 2–3 twin shades). */
const CHANDELIER_REACH = 0.5;
const LAMP_REACH = 0.5;
/** The main aisle runs from the door to the counter between the inner chairs (x = ±1.5 ∓ CHAIR_OFFSET). */
const AISLE_HALF = 1.5 - CHAIR_OFFSET - CHAIR_SIZE / 2;

/** A Normal game at `shopLevel` with money and tickets to spare. */
function rich(shopLevel = MAX_SHOP_LEVEL): GameState {
  const s = createNewGame('Quán E06', 'normal', 13);
  s.shopLevel = shopLevel;
  s.money = 1e15;
  ensureRetention(s).tickets = 1000;
  return s;
}

function buy(s: GameState, id: UpgradeId, levels: number): void {
  for (let i = 0; i < levels; i++) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

function maxOut(s: GameState, id: UpgradeId): void {
  while (upgradeLevel(s, id) < maxUpgradeLevel(s, id)) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

interface Combo {
  expand: number;
  outdoor: number;
  windowBar: number;
  equipment: boolean;
  premium: boolean;
}

/** Shop level 10 with the tables and every decor item at their cap, the given side room, patio, window bar and equipment, and optionally every premium item at its cap. */
function comboState({ expand, outdoor, windowBar, equipment, premium }: Combo): GameState {
  const s = rich();
  maxOut(s, 'tables');
  buy(s, 'expand_area', expand);
  buy(s, 'outdoor_seating', outdoor);
  buy(s, 'window_bar', windowBar);
  if (equipment) for (const id of EQUIPMENT) maxOut(s, id);
  for (const id of DECOR) if (!upgradeBlockedReason(s, id)) maxOut(s, id);
  if (premium) for (const id of PREMIUM) maxOut(s, id);
  return s;
}

const COMBOS: Omit<Combo, 'premium'>[] = [];
for (let expand = 0; expand <= 4; expand++) {
  for (const outdoor of [0, 2]) for (const windowBar of [0, 2]) for (const equipment of [false, true]) COMBOS.push({ expand, outdoor, windowBar, equipment });
}
const name = (c: Omit<Combo, 'premium'>): string => `expand ${c.expand}, outdoor ${c.outdoor}, window bar ${c.windowBar}, ${c.equipment ? 'all' : 'no'} equipment`;

function premiumAt(layout: ShopLayout, kind: PremiumKind): Vec2[] {
  return layout.premium.filter((p) => p.kind === kind).map((p) => p.pos);
}

describe('E-06 premium decor in the layout', () => {
  it('places each item only while it is owned, one spot per level', () => {
    const s = rich();
    maxOut(s, 'tables');
    expect(getShopLayout(s).premium).toEqual([]);
    expect(getShopLayout(s).premiumLevel).toEqual({ chandelier: 0, marble_tables: 0, art_gallery: 0, grand_piano: 0 });
    for (const id of PREMIUM) {
      for (let level = 1; level <= maxUpgradeLevel(s, id); level++) {
        buy(s, id, 1);
        const layout = getShopLayout(s);
        expect(layout.premiumLevel[id], id).toBe(level);
        // The marble tops lie on the tables and have no spot of their own.
        expect(premiumAt(layout, id), id).toHaveLength(id === 'marble_tables' ? 0 : level);
      }
    }
    expect(getShopLayout(s).premium).toHaveLength(2 + 2 + 1);
  });

  it('opens at shop levels 7 to 10 without changing the unlock levels', () => {
    expect(PREMIUM.map((id) => upgradeUnlockLevel(id))).toEqual([7, 8, 9, 10]);
  });

  it('places the items at the documented spots', () => {
    const layout = getShopLayout(comboState({ expand: 0, outdoor: 0, windowBar: 0, equipment: false, premium: true }));
    expect(premiumAt(layout, 'chandelier')).toEqual([
      { x: 0, z: 2.75 },
      { x: 0, z: 4.75 },
    ]);
    expect(premiumAt(layout, 'art_gallery')).toEqual([
      { x: -4.47, z: 3.75 },
      { x: -4.47, z: expect.closeTo(0.05, 9) as unknown as number },
    ]);
    expect(premiumAt(layout, 'grand_piano')).toEqual([{ x: 1.6, z: expect.closeTo(5.705, 9) as unknown as number }]);
  });
});

describe('E-06 premium decor placement', () => {
  it.each(COMBOS.map((c) => [name(c), c] as const))('validates clean and leaves every walkway as it was: %s', (_, combo) => {
    const without = getShopLayout(comboState({ ...combo, premium: false }));
    const layout = getShopLayout(comboState({ ...combo, premium: true }));
    expect(layout.premium.length).toBe(5);
    expect(validateLayout(layout)).toEqual([]);
    // Same tables and machines, and every standing spot of the customers (line, pickup, overflow) unchanged.
    expect(layout.tables).toEqual(without.tables);
    expect(layout.machines).toEqual(without.machines);
    expect(floorSpots(layout)).toEqual(floorSpots(without));
    const grid = buildNavGrid(layout);
    expect(findPath(grid, OUTSIDE, { x: layout.door.x, z: layout.door.z - 0.5 })).not.toBeNull();
    expect(findPath(grid, OUTSIDE, { x: layout.counter.pos.x, z: layout.counter.pos.z + 1 })).not.toBeNull();
  });

  it('keeps the piano off every table, chair, machine, counter, door and the main aisle', () => {
    for (const combo of COMBOS) {
      const layout = getShopLayout(comboState({ ...combo, premium: true }));
      const fps = layoutFootprints(layout);
      const piano = fps.filter((f) => f.kind === 'piano');
      expect(piano).toHaveLength(1);
      const box = shapeBounds(piano[0]!.shape);
      expect(box.maxX - box.minX).toBeCloseTo(PIANO_SIZE.width);
      expect(box.maxZ - box.minZ).toBeCloseTo(PIANO_SIZE.depth);
      // Against the inside of the front wall, inside the room.
      expect(box.maxZ).toBeLessThan(layout.indoor.maxZ);
      expect(box.maxZ).toBeGreaterThan(layout.indoor.maxZ - 0.05);
      expect(box.maxX).toBeLessThan(layout.indoor.maxX);
      // Beside the door opening, outside the main aisle that runs from it to the counter.
      expect(box.minX).toBeGreaterThan(layout.door.x + DOOR_WIDTH / 2);
      expect(box.minX).toBeGreaterThan(AISLE_HALF);
      for (const f of fps) {
        if (!['table', 'chair', 'machine', 'counter', 'back_counter', 'plant', 'bookshelf', 'sofa', 'parasol'].includes(f.kind)) continue;
        // A person can still pass between the piano and anything else on the floor.
        const gap = Math.min(...[box.minX, box.maxX].flatMap((x) => [box.minZ, box.maxZ].map((z) => shapeDistance(f.shape, x, z))));
        const b = shapeBounds(f.shape);
        const apart = b.maxX <= box.minX || b.minX >= box.maxX || b.maxZ <= box.minZ || b.minZ >= box.maxZ;
        expect(apart, `${name(combo)}: ${f.id}`).toBe(true);
        expect(gap, `${name(combo)}: ${f.id}`).toBeGreaterThan(2 * AGENT_RADIUS - 0.01);
      }
    }
  });

  it('hangs the chandeliers over the main aisle, clear of the tables, chairs, pendant lamps and machines', () => {
    const layout = getShopLayout(comboState({ expand: 4, outdoor: 2, windowBar: 2, equipment: true, premium: true }));
    const fps = layoutFootprints(layout);
    const lamps = layout.decor.filter((d) => d.kind === 'light');
    for (const c of premiumAt(layout, 'chandelier')) {
      expect(Math.abs(c.x - layout.door.x)).toBeLessThan(1e-9);
      expect(CHANDELIER_REACH).toBeLessThanOrEqual(AISLE_HALF);
      for (const f of fps.filter((f) => f.kind === 'table' || f.kind === 'chair' || f.kind === 'machine' || f.kind === 'counter')) {
        expect(shapeDistance(f.shape, c.x, c.z), f.id).toBeGreaterThan(CHANDELIER_REACH);
      }
      for (const l of lamps) expect(Math.hypot(l.pos.x - c.x, l.pos.z - c.z)).toBeGreaterThan(CHANDELIER_REACH + LAMP_REACH);
      // Not over the counter queue: behind the first table row.
      expect(c.z).toBeGreaterThan(layout.tables[0]!.pos.z + TABLE_RADIUS);
    }
  });

  it('hangs the gallery walls on the left wall, clear of the paintings, bookshelves and plants, and gives them no footprint', () => {
    const layout = getShopLayout(comboState({ expand: 2, outdoor: 2, windowBar: 2, equipment: true, premium: true }));
    const galleries = premiumAt(layout, 'art_gallery');
    expect(galleries).toHaveLength(2);
    const span = (z: number, length: number): [number, number] => [z - length / 2, z + length / 2];
    const clear = (a: [number, number], b: [number, number]): boolean => a[1] <= b[0] || b[1] <= a[0];
    for (const g of galleries) {
      expect(g.x - layout.indoor.minX).toBeGreaterThanOrEqual(ART_GALLERY_SIZE.depth / 2);
      expect(g.x - layout.indoor.minX).toBeLessThan(0.1);
      const own = span(g.z, ART_GALLERY_SIZE.length);
      expect(own[0]).toBeGreaterThan(layout.indoor.minZ);
      expect(own[1]).toBeLessThan(layout.indoor.maxZ);
      for (const d of layout.decor) {
        if (d.pos.x > layout.indoor.minX + 1) continue;
        const length = d.kind === 'painting' ? 1.1 : d.kind === 'bookshelf' ? BOOKSHELF_SIZE.length : d.kind === 'plant' ? 2 * PLANT_RADIUS : 0;
        expect(clear(own, span(d.pos.z, length)), `${d.kind} at ${d.pos.z}`).toBe(true);
      }
      for (const o of galleries) if (o !== g) expect(clear(own, span(o.z, ART_GALLERY_SIZE.length))).toBe(true);
    }
    expect(layoutFootprints(layout).some((f) => f.id.startsWith('gallery') || f.id.startsWith('chandelier'))).toBe(false);
  });

  it('keeps every premium item out of the side room and the patio', () => {
    const layout = getShopLayout(comboState({ expand: 4, outdoor: 2, windowBar: 2, equipment: true, premium: true }));
    for (const p of layout.premium) {
      expect(p.pos.x, p.kind).toBeGreaterThanOrEqual(layout.indoor.minX);
      expect(p.pos.x, p.kind).toBeLessThan(layout.indoor.maxX);
      expect(p.pos.z, p.kind).toBeLessThan(layout.indoor.maxZ);
    }
  });
});
