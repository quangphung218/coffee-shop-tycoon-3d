import { MeshStandardMaterial, Scene, type Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { environmentEnabled, ShopEnvironment } from '../../src/render/scene/environment';
import { GLASS_MATERIAL, SHARED_MATERIAL } from '../../src/render/scene/parts';
import { machineGeometry, ShopView } from '../../src/render/scene/shop';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout, nextUpgradeCost, type MachineKind } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

const KINDS: readonly MachineKind[] = ['espresso', 'fast', 'grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'];

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

describe('machineGeometry', () => {
  it('builds a non-empty model resting on the back counter for every kind', () => {
    for (const kind of KINDS) {
      const geo = machineGeometry({ kind, quality: 1, pos: { x: 0, z: 0 } });
      const pos = geo.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      // Everything sits on the counter top (~0.9) and has real height.
      expect(bb.min.y).toBeGreaterThan(0.8);
      expect(bb.max.y).toBeGreaterThan(bb.min.y);
      expect(Number.isFinite(bb.min.x) && Number.isFinite(bb.max.z)).toBe(true);
      geo.dispose();
    }
  });

  it('keeps UVs on the merged model so the shared grain map has coordinates', () => {
    const geo = machineGeometry({ kind: 'grinder', quality: 1, pos: { x: 0, z: 0 } });
    expect(geo.getAttribute('uv')).toBeDefined();
    geo.dispose();
  });

  it('gives the espresso machine extra detail at higher quality', () => {
    const plain = machineGeometry({ kind: 'espresso', quality: 0, pos: { x: 0, z: 0 } });
    const shiny = machineGeometry({ kind: 'espresso', quality: 3, pos: { x: 0, z: 0 } });
    expect(shiny.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count);
    plain.dispose();
    shiny.dispose();
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
