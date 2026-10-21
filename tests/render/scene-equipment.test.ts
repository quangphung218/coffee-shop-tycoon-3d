import { type BufferGeometry, Color, type Mesh, MeshStandardMaterial, Scene, type Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { environmentEnabled, ShopEnvironment } from '../../src/render/scene/environment';
import { BACK_COUNTER_HEIGHT, counterGeometry } from '../../src/render/scene/equipment';
import { GLASS_MATERIAL, PALETTE, SHARED_MATERIAL } from '../../src/render/scene/parts';
import { machineGeometry, ShopView } from '../../src/render/scene/shop';
import { MACHINE_SIZE } from '../../src/sim/nav/footprints';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout, nextUpgradeCost, type MachineKind } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

const KINDS: readonly MachineKind[] = [
  'espresso',
  'fast',
  'grinder',
  'pastry_case',
  'blender',
  'ice_maker',
  'dishwasher',
  'cold_brew_tower',
  'oven',
];

function buy(s: GameState, id: UpgradeId, levels = 1): void {
  for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok).toBe(true);
}

/** A shop with the espresso machine, a second brew machine and every piece of back-counter equipment. */
function fullyEquipped(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 1_000_000_000;
  buy(s, 'better_machine', 2);
  buy(s, 'fast_machine', 2);
  buy(s, 'grinder');
  buy(s, 'pastry_case');
  buy(s, 'blender');
  buy(s, 'ice_maker');
  buy(s, 'dishwasher');
  return s;
}

/** Machine at `tier`; espresso and fast take quality from better_machine, whose level equals its tier (maxLevel 3). */
function machine(kind: MachineKind, tier: number): BufferGeometry {
  return machineGeometry({ kind, quality: tier, tier, pos: { x: 0, z: 0 } });
}

function triangles(geo: BufferGeometry): number {
  return geo.getAttribute('position').count / 3;
}

/** Positions and colours, to tell two models apart. */
function signature(geo: BufferGeometry): string {
  return `${Array.from(geo.getAttribute('position').array).join(',')}|${Array.from(geo.getAttribute('color').array).join(',')}`;
}

function hasColor(geo: BufferGeometry, hex: number): boolean {
  const want = new Color(hex);
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(c.getX(i) - want.r) < 1e-4 && Math.abs(c.getY(i) - want.g) < 1e-4 && Math.abs(c.getZ(i) - want.b) < 1e-4) return true;
  }
  return false;
}

describe('machineGeometry', () => {
  it('builds a non-empty model resting on the back counter for every kind and tier', () => {
    for (const kind of KINDS) {
      for (const tier of [0, 1, 2, 3]) {
        const geo = machine(kind, tier);
        const pos = geo.getAttribute('position');
        expect(pos.count).toBeGreaterThan(0);
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        // Everything sits on the counter top (~0.9) and has real height.
        expect(bb.min.y).toBeGreaterThan(0.8);
        expect(bb.max.y).toBeGreaterThan(bb.min.y);
        expect(Number.isFinite(bb.min.x) && Number.isFinite(bb.max.z)).toBe(true);
        // Tier details stay within the machine's footprint on the back counter.
        expect(bb.max.x - bb.min.x, `${kind} tier ${tier}`).toBeLessThanOrEqual(MACHINE_SIZE[kind].width + 1e-6);
        geo.dispose();
      }
    }
  });

  it('keeps the cold brew tower and the oven inside their footprint at every tier, with more detail from tier 2', () => {
    for (const kind of ['cold_brew_tower', 'oven'] as const) {
      const size = MACHINE_SIZE[kind];
      const geos = [1, 2, 3].map((t) => machine(kind, t));
      for (const [i, geo] of geos.entries()) {
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        const label = `${kind} tier ${i + 1}`;
        expect(bb.min.x, label).toBeGreaterThanOrEqual(-size.width / 2 - 1e-6);
        expect(bb.max.x, label).toBeLessThanOrEqual(size.width / 2 + 1e-6);
        expect(bb.min.z, label).toBeGreaterThanOrEqual(-size.depth / 2 - 1e-6);
        expect(bb.max.z, label).toBeLessThanOrEqual(size.depth / 2 + 1e-6);
        expect(bb.min.y, label).toBeGreaterThanOrEqual(BACK_COUNTER_HEIGHT - 1e-6);
      }
      expect(geos[1]!.getAttribute('position').count, kind).not.toBe(geos[0]!.getAttribute('position').count);
      for (const g of geos) g.dispose();
    }
  });

  it('keeps UVs on the merged model so it merges with the other parts', () => {
    for (const tier of [1, 3]) {
      const geo = machine('grinder', tier);
      expect(geo.getAttribute('uv')).toBeDefined();
      geo.dispose();
    }
  });

  it('gives the espresso machine extra detail at higher quality', () => {
    const plain = machineGeometry({ kind: 'espresso', quality: 0, tier: 0, pos: { x: 0, z: 0 } });
    const shiny = machineGeometry({ kind: 'espresso', quality: 3, tier: 0, pos: { x: 0, z: 0 } });
    expect(shiny.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count);
    plain.dispose();
    shiny.dispose();
  });

  it('draws a different model per tier for every kind, gold at tier 3, within 1.6 times the tier 1 triangles', () => {
    for (const kind of KINDS) {
      const geos = [1, 2, 3].map((t) => machine(kind, t));
      const sigs = new Set(geos.map(signature));
      expect(sigs.size, kind).toBe(3);
      expect(hasColor(geos[2]!, PALETTE.gold), kind).toBe(true);
      expect(triangles(geos[2]!), kind).toBeLessThanOrEqual(1.6 * triangles(geos[0]!));
      for (const g of geos) g.dispose();
    }
  });

  it('draws tier 0 (not bought) like tier 1 and levels past the top tier like tier 3', () => {
    for (const kind of KINDS) {
      const pairs: [BufferGeometry, BufferGeometry][] = [
        [machineGeometry({ kind, quality: 1, tier: 0, pos: { x: 0, z: 0 } }), machine(kind, 1)],
        [machineGeometry({ kind, quality: 3, tier: 4, pos: { x: 0, z: 0 } }), machine(kind, 3)],
      ];
      for (const [a, b] of pairs) {
        expect(signature(a), kind).toBe(signature(b));
        a.dispose();
        b.dispose();
      }
    }
  });
});

describe('counterGeometry', () => {
  it('draws a different counter per tier, gold at tier 3, within 1.6 times the tier 1 triangles', () => {
    // A bought counter (big_counter level ≥ 1); level 0 is always tier 0.
    for (const level of [1, 2]) {
      const width = 3 + 1.5 * level;
      const geos = [1, 2, 3].map((t) => counterGeometry(width, level, t));
      expect(new Set(geos.map(signature)).size).toBe(3);
      expect(hasColor(geos[2]!, PALETTE.gold)).toBe(true);
      expect(triangles(geos[2]!)).toBeLessThanOrEqual(1.6 * triangles(geos[0]!));
      geos[0]!.computeBoundingBox();
      geos[2]!.computeBoundingBox();
      // Tier details stay on the counter's footprint.
      expect(geos[2]!.boundingBox!.max.z).toBeLessThanOrEqual(geos[0]!.boundingBox!.max.z + 1e-6);
      for (const g of geos) g.dispose();
    }
  });

  it('draws tier 0 like tier 1', () => {
    const a = counterGeometry(3, 0, 0);
    const b = counterGeometry(3, 0, 1);
    expect(signature(a)).toBe(signature(b));
    a.dispose();
    b.dispose();
  });
});

describe('ShopView equipment meshes', () => {
  it('draws one mesh per machine, one per equipment kind', () => {
    const state = fullyEquipped();
    const scene = new Scene();
    const shop = new ShopView(scene, 'high');
    shop.update(state, 0, 0, 0);
    const layout = getShopLayout(state);

    // espresso + 2 fast + 5 equipment kinds.
    expect(layout.machines).toHaveLength(8);
    // One draw call per machine.
    expect(shop.counts().machines).toBe(layout.machines.length);

    const kinds = new Set(layout.machines.map((m) => m.kind));
    for (const kind of ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(layout.machines[0]!.kind).toBe('espresso');
    shop.dispose();
  });

  it('rebuilds the machines when a new piece of equipment is bought', () => {
    const s = createNewGame('Quán Mây', 'normal', 1);
    s.money = 1_000_000_000;
    const scene = new Scene();
    const shop = new ShopView(scene, 'medium');
    shop.update(s, 0, 0, 0);
    const before = shop.counts().machines;
    buy(s, 'blender');
    shop.update(s, 0.016, 0.016, 0);
    expect(shop.counts().machines).toBe(before + 1);
    shop.dispose();
  });

  it('puts the purchase sparkle at the top of the cold brew tower and over the oven', () => {
    const s = createNewGame('Quán Mây', 'normal', 1);
    s.upgrades.cold_brew_tower = 1;
    s.upgrades.oven = 1;
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(s, 0, 0, 0);
    for (const kind of ['cold_brew_tower', 'oven'] as const) {
      const anchor = shop.upgradeAnchor(kind)!;
      const geo = (anchor.object as Mesh).geometry;
      geo.computeBoundingBox();
      const top = geo.boundingBox!.max.y;
      // At the model's top or just above it, not floating far over it or sunk into it.
      expect(anchor.y, kind).toBeGreaterThanOrEqual(top - 0.05);
      expect(anchor.y, kind).toBeLessThanOrEqual(top + 0.15);
    }
    shop.dispose();
  });

  it('swaps in the next tier model when a machine is upgraded', () => {
    const s = createNewGame('Quán Mây', 'normal', 1);
    s.money = 1_000_000_000;
    buy(s, 'grinder');
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(s, 0, 0, 0);
    // pickables[0] is the group of machine meshes.
    const triangleCounts = (): number[] => shop.pickables[0]!.children.map((m) => (m as Mesh).geometry.getAttribute('position').count);
    const before = triangleCounts();
    buy(s, 'grinder');
    expect(getShopLayout(s).machines.find((m) => m.kind === 'grinder')!.tier).toBe(2);
    shop.update(s, 0.016, 0.016, 0);
    expect(triangleCounts()).not.toEqual(before);
    shop.dispose();
  });
});

describe('scene environment', () => {
  it('lights every quality but low from the environment map', () => {
    expect(environmentEnabled('low')).toBe(false);
    expect(environmentEnabled('medium')).toBe(true);
    expect(environmentEnabled('high')).toBe(true);
  });

  it('builds the environment map once and reuses it across quality changes', () => {
    let builds = 0;
    const texture = { dispose() {} } as unknown as Texture;
    const env = new ShopEnvironment(() => {
      builds++;
      return texture;
    });
    expect(env.forQuality('low')).toBeNull();
    expect(builds).toBe(0);
    expect(env.forQuality('medium')).toBe(texture);
    expect(env.forQuality('high')).toBe(texture);
    expect(env.forQuality('low')).toBeNull();
    expect(env.forQuality('medium')).toBe(texture);
    expect(builds).toBe(1);
    env.dispose();
  });

  it('uses an environment-lit flat standard material for the shop surfaces', () => {
    expect(SHARED_MATERIAL).toBeInstanceOf(MeshStandardMaterial);
    expect(GLASS_MATERIAL).toBeInstanceOf(MeshStandardMaterial);
    expect(SHARED_MATERIAL.flatShading).toBe(true);
    expect(SHARED_MATERIAL.roughness).toBeGreaterThan(0.5);
  });
});
