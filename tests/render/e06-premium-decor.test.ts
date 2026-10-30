// @vitest-environment jsdom
import { Box3, type BufferGeometry, InstancedMesh, type Material, Matrix4, type Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { windowSpots } from '../../src/render/scene/facade';
import { GLOW_MATERIAL, SHARED_MATERIAL, WALL_HEIGHT } from '../../src/render/scene/parts';
import { CEILING_Y, CHANDELIER_BOTTOM_Y, PIANO_HEIGHT, ShopView } from '../../src/render/scene/shop';
import { loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { ART_GALLERY_SIZE, layoutFootprints, shapeBounds } from '../../src/sim/nav/footprints';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, maxUpgradeLevel, upgradeLevel } from '../../src/sim/upgrades';

const PREMIUM: readonly UpgradeId[] = ['chandelier', 'marble_tables', 'art_gallery', 'grand_piano'];
/** Draw calls the four items may add with all of them owned. */
const MAX_EXTRA_DRAWS = 8;

type Internals = {
  chandeliers: InstancedMesh;
  crystals: InstancedMesh;
  galleries: InstancedMesh;
  pianos: InstancedMesh;
  marbleTops: InstancedMesh;
  tables: InstancedMesh;
  chairs: InstancedMesh;
};

function internals(shop: ShopView): Internals {
  return shop as unknown as Internals;
}

/** Meshes the renderer would draw (one draw call each), as in p27-render.test.ts. */
function drawn(shop: ShopView): number {
  let n = 0;
  shop.root.traverse((o) => {
    if ((o as Mesh).isMesh && (!(o instanceof InstancedMesh) || o.count > 0)) n++;
  });
  return n;
}

function materials(shop: ShopView): Set<Material> {
  const out = new Set<Material>();
  shop.root.traverse((o) => {
    if ((o as Mesh).isMesh) for (const m of [(o as Mesh).material].flat()) out.add(m);
  });
  return out;
}

/** A level 10 shop with every table, equipment and decor item but no premium decor. */
function full(): GameState {
  const s = createNewGame('Quán Sang', 'normal', 5);
  s.shopLevel = 10;
  s.money = 1e15;
  ensureRetention(s).tickets = 1000;
  for (const id of ['tables', 'expand_area', 'outdoor_seating', 'window_bar', 'big_counter', 'fast_machine', 'grinder', 'dishwasher', 'plants', 'paintings', 'lights', 'neon_sign', 'bookshelf', 'record_player', 'sofa_corner'] as UpgradeId[]) {
    while (upgradeLevel(s, id) < maxUpgradeLevel(s, id)) expect(buyUpgrade(s, id).ok, id).toBe(true);
  }
  return s;
}

function buyAll(s: GameState): void {
  for (const id of PREMIUM) while (upgradeLevel(s, id) < maxUpgradeLevel(s, id)) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

function view(state: GameState): ShopView {
  const shop = new ShopView(new Scene(), 'medium');
  shop.update(state, 0, 0, 0);
  return shop;
}

function placed(mesh: InstancedMesh, i: number): Box3 {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(m);
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('auto'), text);
  const r = loadGame('auto', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

describe('E-06 premium decor in the scene', () => {
  it('draws each item only while it is owned', () => {
    const s = full();
    const shop = view(s);
    const v = internals(shop);
    const shown = (): number[] => [v.chandeliers.count, v.marbleTops.count, v.galleries.count, v.pianos.count];
    expect(shown()).toEqual([0, 0, 0, 0]);
    expect(shop.counts().premium).toBe(0);
    buyUpgrade(s, 'chandelier');
    shop.update(s, 0, 0, 0);
    expect(shown()).toEqual([1, 0, 0, 0]);
    expect(v.crystals.count).toBe(1);
    buyUpgrade(s, 'marble_tables');
    shop.update(s, 0, 0, 0);
    expect(shown()).toEqual([1, s.tables.length, 0, 0]);
    buyUpgrade(s, 'art_gallery');
    shop.update(s, 0, 0, 0);
    expect(shown()).toEqual([1, s.tables.length, 1, 0]);
    buyUpgrade(s, 'grand_piano');
    shop.update(s, 0, 0, 0);
    expect(shown()).toEqual([1, s.tables.length, 1, 1]);
    buyAll(s);
    shop.update(s, 0, 0, 0);
    expect(shown()).toEqual([2, s.tables.length, 2, 1]);
    expect(shop.counts().premium).toBe(2 + s.tables.length + 2 + 1);
    shop.dispose();
  });

  it('adds at most 8 draw calls with all four owned, reusing the shared materials and one geometry per piece', () => {
    const s = full();
    const after = view(s);
    const draws = drawn(after);
    const mats = materials(after);
    const children = after.root.children.length;
    buyAll(s);
    after.update(s, 0, 0, 0);
    const v = internals(after);
    const extra = drawn(after) - draws;
    // The premium meshes are made up front: buying adds instances, not scene objects.
    expect(after.root.children.length).toBe(children);
    // Measured on this full shop: 51 draw calls before, 54 after.
    expect([draws, drawn(after)]).toEqual([51, 54]);
    // Five new meshes (chandelier frame and crystals, gallery, piano, marble tops); the gallery covers the left wall's last
    // window, so that wall's window frame and glass meshes are no longer drawn.
    expect([v.chandeliers, v.crystals, v.galleries, v.pianos, v.marbleTops].every((m) => m.count > 0)).toBe(true);
    expect(extra).toBe(3);
    expect(extra).toBeLessThanOrEqual(MAX_EXTRA_DRAWS);
    // No new material: the premium meshes use the scene's shared ones.
    expect(materials(after)).toEqual(mats);
    expect([v.chandeliers, v.galleries, v.pianos, v.marbleTops].map((m) => m.material)).toEqual([SHARED_MATERIAL, SHARED_MATERIAL, SHARED_MATERIAL, SHARED_MATERIAL]);
    expect(v.crystals.material).toBe(GLOW_MATERIAL);
    // A second chandelier or gallery is one more instance, not one more mesh or geometry.
    const geos = new Set<BufferGeometry>([v.chandeliers.geometry, v.galleries.geometry, v.pianos.geometry]);
    const s2 = full();
    for (const id of PREMIUM) buyUpgrade(s2, id);
    const one = view(s2);
    expect(drawn(one)).toBe(drawn(after));
    expect(new Set([internals(one).chandeliers.geometry, internals(one).galleries.geometry, internals(one).pianos.geometry]).size).toBe(geos.size);
    after.dispose();
    one.dispose();
  });

  it('builds each piece where the layout puts it: the piano on its footprint, the gallery on the wall, the chandelier above the walls, marble on the tables', () => {
    const s = full();
    buyAll(s);
    const shop = view(s);
    const v = internals(shop);
    const layout = getShopLayout(s);
    const eps = 1e-6;
    const piano = placed(v.pianos, 0);
    const fp = shapeBounds(layoutFootprints(layout).find((f) => f.kind === 'piano')!.shape);
    expect(piano.min.x).toBeGreaterThanOrEqual(fp.minX - eps);
    expect(piano.max.x).toBeLessThanOrEqual(fp.maxX + eps);
    expect(piano.min.z).toBeGreaterThanOrEqual(fp.minZ - eps);
    expect(piano.max.z).toBeLessThanOrEqual(fp.maxZ + eps);
    expect(piano.max.y).toBeLessThanOrEqual(PIANO_HEIGHT + eps);
    for (let i = 0; i < 2; i++) {
      const g = placed(v.galleries, i);
      expect(g.min.x).toBeGreaterThanOrEqual(layout.indoor.minX - eps);
      expect(g.max.x).toBeLessThanOrEqual(layout.indoor.minX + ART_GALLERY_SIZE.depth + eps);
      expect(g.max.z - g.min.z).toBeCloseTo(ART_GALLERY_SIZE.length);
      expect(g.max.y).toBeLessThan(WALL_HEIGHT);
      const c = placed(v.crystals, i);
      expect(c.min.y).toBeGreaterThanOrEqual(CHANDELIER_BOTTOM_Y - eps);
      expect(placed(v.chandeliers, i).min.y).toBeGreaterThan(WALL_HEIGHT);
    }
    expect(CHANDELIER_BOTTOM_Y).toBeGreaterThan(WALL_HEIGHT);
    for (let i = 0; i < v.marbleTops.count; i++) {
      const top = placed(v.marbleTops, i);
      const table = placed(v.tables, i);
      expect(top.min.x).toBeGreaterThanOrEqual(table.min.x - 0.02);
      expect(top.max.x).toBeLessThanOrEqual(table.max.x + 0.02);
    }
    // No window behind the gallery frames.
    for (const g of layout.premium.filter((p) => p.kind === 'art_gallery')) {
      expect(windowSpots(layout).some((w) => w.wall === 1 && Math.abs(w.z - g.pos.z) < ART_GALLERY_SIZE.length / 2)).toBe(false);
    }
    shop.dispose();
  });

  it('UX-012: hangs the chandelier at ceiling height, clear of every table and chair, with its halo in the crystal mesh', () => {
    const s = full();
    buyAll(s);
    const shop = view(s);
    const v = internals(shop);
    expect(v.chandeliers.count).toBe(2);
    // Near the ceiling: the whole chandelier sits in the top band under the cord top, well above the walls.
    expect(CHANDELIER_BOTTOM_Y).toBeGreaterThanOrEqual(CEILING_Y - 0.8);
    expect(CHANDELIER_BOTTOM_Y).toBeGreaterThan(WALL_HEIGHT + 0.4);
    const furniture: Box3[] = [];
    for (let i = 0; i < v.tables.count; i++) furniture.push(placed(v.tables, i));
    for (let i = 0; i < v.chairs.count; i++) furniture.push(placed(v.chairs, i));
    expect(furniture.length).toBeGreaterThan(0);
    for (let i = 0; i < v.chandeliers.count; i++) {
      const frame = placed(v.chandeliers, i);
      const glow = placed(v.crystals, i);
      expect(frame.max.y).toBeLessThanOrEqual(CEILING_Y + 1e-6);
      expect(glow.min.y).toBeGreaterThanOrEqual(CEILING_Y - 0.8);
      for (const f of furniture) {
        expect(frame.intersectsBox(f)).toBe(false);
        expect(glow.intersectsBox(f)).toBe(false);
        // Not even overlapping in plan: it hangs over the aisle, not over a table or chair.
        const plan = (b: Box3): Box3 => new Box3(b.min.clone().setY(0), b.max.clone().setY(0));
        expect(plan(glow).intersectsBox(plan(f))).toBe(false);
      }
      // The halo reaches past the gold ring.
      expect(glow.max.x - glow.min.x).toBeGreaterThan(frame.max.x - frame.min.x);
    }
    expect(v.crystals.material).toBe(GLOW_MATERIAL);
    shop.dispose();
  });

  it('gives each item a purchase sparkle spot while owned', () => {
    const s = full();
    const shop = view(s);
    for (const id of PREMIUM) expect(shop.upgradeAnchor(id), id).toBeNull();
    buyAll(s);
    shop.update(s, 0, 0, 0);
    for (const id of PREMIUM) expect(shop.upgradeAnchor(id), id).not.toBeNull();
    shop.dispose();
  });
});

describe('E-06 premium decor from a loaded save', () => {
  /** A save of a level 10 shop owning every premium item at its cap, in the given format version. */
  function saveOf(version: 5 | 6): { text: string; state: GameState } {
    const s = full();
    buyAll(s);
    return { text: JSON.stringify({ version, savedAt: 1_700_000_000_000, state: { ...s, events: [] } }), state: s };
  }

  it.each([5, 6] as const)('shows the owned items on the first frame after loading a v%i save', (version) => {
    const { text, state } = saveOf(version);
    const g = load(text);
    for (const id of PREMIUM) expect(upgradeLevel(g, id), id).toBe(upgradeLevel(state, id));
    const shop = new ShopView(new Scene(), 'medium');
    // The first update after loading builds the scene from the loaded state.
    expect(shop.update(g, 0, 0, 0)).toBe(true);
    const v = internals(shop);
    expect(v.chandeliers.count).toBe(2);
    expect(v.crystals.count).toBe(2);
    expect(v.galleries.count).toBe(2);
    expect(v.pianos.count).toBe(1);
    expect(v.marbleTops.count).toBe(g.tables.length);
    expect(shop.counts().premium).toBe(2 + 2 + 1 + g.tables.length);
    shop.dispose();
  });
});
