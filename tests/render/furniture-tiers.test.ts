import { type BufferGeometry, Color, InstancedMesh, type Mesh, Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/render/scene/parts';
import { ShopView, type LookTier, type TieredPiece } from '../../src/render/scene/shop';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout, nextUpgradeCost, type ShopLayout } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { ensureRetention } from '../../src/sim/retention';

const TIERS: readonly LookTier[] = [1, 2, 3];
/** Pieces with trim: steel from tier 2, gold at tier 3 (the bulbs only glow). */
const TRIMMED: readonly TieredPiece[] = ['table', 'chair', 'parasol', 'plant', 'painting', 'lamp'];

function buy(s: GameState, id: UpgradeId, levels = 1): void {
  for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok).toBe(true);
}

/** A shop with every table, outdoor seats, and every plant, painting and lamp slot filled. */
function furnished(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 1_000_000_000;
  ensureRetention(s).tickets = 1000;
  buy(s, 'tables', 6);
  buy(s, 'outdoor_seating', 2);
  buy(s, 'plants', 3);
  buy(s, 'paintings', 3);
  buy(s, 'lights', 2);
  return s;
}

type Internals = {
  tiered(piece: TieredPiece, tier: LookTier): BufferGeometry;
  applyLayout(layout: ShopLayout): void;
  tables: InstancedMesh;
  chairs: InstancedMesh;
  parasols: InstancedMesh;
  plants: InstancedMesh;
  paintings: InstancedMesh;
  lamps: InstancedMesh;
  bulbs: InstancedMesh;
  neons: InstancedMesh;
  neonTubes: InstancedMesh;
  bookshelves: InstancedMesh;
  recordPlayers: InstancedMesh;
  sofas: InstancedMesh;
};

function internals(shop: ShopView): Internals {
  return shop as unknown as Internals;
}

/** The instanced mesh drawing each piece. */
function meshes(shop: ShopView): Record<TieredPiece, InstancedMesh> {
  const v = internals(shop);
  return {
    table: v.tables,
    chair: v.chairs,
    parasol: v.parasols,
    plant: v.plants,
    painting: v.paintings,
    lamp: v.lamps,
    bulb: v.bulbs,
    neon: v.neons,
    neonTube: v.neonTubes,
    bookshelf: v.bookshelves,
    recordPlayer: v.recordPlayers,
    sofa: v.sofas,
  };
}

/** Same layout with every furniture and decor tier set to `tier`. */
function atTier(layout: ShopLayout, tier: LookTier): ShopLayout {
  const decorTier = { plant: tier, painting: tier, light: tier, neon: tier, bookshelf: tier, record_player: tier, sofa: tier };
  return { ...layout, furnitureTier: tier, outdoorTier: tier, decorTier };
}

function triangles(geo: BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
}

function signature(geo: BufferGeometry): string {
  const color = geo.getAttribute('color');
  return `${Array.from(geo.getAttribute('position').array).join(',')}|${color ? Array.from(color.array).join(',') : ''}`;
}

function hasColor(geo: BufferGeometry, hex: number): boolean {
  const want = new Color(hex);
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(c.getX(i) - want.r) < 1e-4 && Math.abs(c.getY(i) - want.g) < 1e-4 && Math.abs(c.getZ(i) - want.b) < 1e-4) return true;
  }
  return false;
}

function height(geo: BufferGeometry): number {
  geo.computeBoundingBox();
  return geo.boundingBox!.max.y - geo.boundingBox!.min.y;
}

/** Meshes the renderer would draw (one draw call each). */
function drawn(shop: ShopView): number {
  let n = 0;
  shop.root.traverse((o) => {
    if ((o as Mesh).isMesh && (!(o instanceof InstancedMesh) || o.count > 0)) n++;
  });
  return n;
}

describe('furniture and decor tier models', () => {
  it('draws three different models per piece, steel trim at tier 2 and gold at tier 3', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    for (const piece of [...TRIMMED, 'bulb'] as const) {
      const geos = TIERS.map((t) => v.tiered(piece, t));
      expect(new Set(geos.map(signature)).size, piece).toBe(3);
    }
    for (const piece of TRIMMED) {
      expect(hasColor(v.tiered(piece, 2), PALETTE.steel), `${piece} tier 2`).toBe(true);
      expect(hasColor(v.tiered(piece, 3), PALETTE.gold), `${piece} tier 3`).toBe(true);
    }
    shop.dispose();
  });

  it('keeps every tier within 1.6 times the triangles of tier 1', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    for (const piece of [...TRIMMED, 'bulb'] as const) {
      const base = triangles(v.tiered(piece, 1));
      for (const t of [2, 3] as const) expect(triangles(v.tiered(piece, t)), `${piece} tier ${t}`).toBeLessThanOrEqual(1.6 * base);
    }
    // A lamp is drawn as its shade mesh plus its bulb mesh.
    const lamp = (t: LookTier): number => triangles(v.tiered('lamp', t)) + triangles(v.tiered('bulb', t));
    expect(lamp(3)).toBeLessThanOrEqual(1.6 * lamp(1));
    shop.dispose();
  });

  it('gives tier 3 a high-backed chair and a tall plant, and the tier 2 lamp two bulbs', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    expect(height(v.tiered('chair', 3))).toBeGreaterThan(height(v.tiered('chair', 1)) + 0.2);
    expect(height(v.tiered('plant', 3))).toBeGreaterThan(height(v.tiered('plant', 1)) + 0.2);
    const bulbs = v.tiered('bulb', 2);
    bulbs.computeBoundingBox();
    expect(bulbs.boundingBox!.max.x - bulbs.boundingBox!.min.x).toBeGreaterThan(0.5);
    shop.dispose();
  });

  it('builds each tier once and reuses it', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    for (const piece of TRIMMED) expect(v.tiered(piece, 2)).toBe(v.tiered(piece, 2));
    shop.dispose();
  });
});

describe('ShopView tier swap', () => {
  it('swaps geometry on the same instanced meshes, keeping counts, meshes and draw calls', () => {
    const state = furnished();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const layout = getShopLayout(state);
    const v = internals(shop);
    const before = meshes(shop);
    const counts = shop.counts();
    const children = shop.root.children.length;
    const draws = drawn(shop);
    expect(counts.tables).toBe(state.tables.length);
    expect(counts.parasols).toBeGreaterThan(0);
    expect(v.lamps.count).toBeGreaterThan(0);

    const seen = new Map<TieredPiece, Set<BufferGeometry>>();
    for (const t of TIERS) {
      v.applyLayout(atTier(layout, t));
      const now = meshes(shop);
      for (const piece of Object.keys(now) as TieredPiece[]) {
        expect(now[piece], piece).toBe(before[piece]);
        expect(now[piece].geometry, `${piece} tier ${t}`).toBe(v.tiered(piece, t));
        (seen.get(piece) ?? seen.set(piece, new Set()).get(piece)!).add(now[piece].geometry);
      }
      expect(shop.counts()).toEqual(counts);
      expect(v.bulbs.count).toBe(v.lamps.count);
      expect(shop.root.children.length).toBe(children);
      expect(drawn(shop)).toBe(draws);
    }
    for (const [piece, geos] of seen) expect(geos.size, piece).toBe(3);
    shop.dispose();
  });

  it('draws tier 0 (not bought) like tier 1', () => {
    const state = createNewGame('Quán Mây', 'normal', 1);
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const layout = getShopLayout(state);
    expect(layout.furnitureTier).toBe(0);
    expect(layout.outdoorTier).toBe(0);
    const v = internals(shop);
    expect(v.tables.geometry).toBe(v.tiered('table', 1));
    expect(v.chairs.geometry).toBe(v.tiered('chair', 1));
    expect(v.plants.geometry).toBe(v.tiered('plant', 1));
    shop.dispose();
  });

  it('follows the tables upgrade: one more table per level, a new look at each tier step', () => {
    const state = createNewGame('Quán Mây', 'normal', 1);
    state.money = 1_000_000_000;
    ensureRetention(state).tickets = 1000;
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const v = internals(shop);
    const tables = v.tables;
    const chairs = v.chairs;
    const looks = new Set<BufferGeometry>();
    for (let level = 1; level <= 6; level++) {
      const tablesBefore = shop.counts().tables;
      buy(state, 'tables');
      shop.update(state, level, 0.016, 0);
      expect(shop.counts().tables).toBe(tablesBefore + 1);
      expect(v.tables).toBe(tables);
      expect(v.chairs).toBe(chairs);
      const tier = getShopLayout(state).furnitureTier as LookTier;
      expect(v.tables.geometry).toBe(v.tiered('table', tier));
      expect(v.chairs.geometry).toBe(v.tiered('chair', tier));
      looks.add(v.tables.geometry);
    }
    expect(looks.size).toBe(3);
    shop.dispose();
  });

  it('adds one decor instance per level bought and swaps to the tier look', () => {
    const state = createNewGame('Quán Mây', 'normal', 1);
    state.money = 1_000_000_000;
    ensureRetention(state).tickets = 1000;
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const v = internals(shop);
    const plants = v.plants;
    for (let level = 1; level <= 3; level++) {
      buy(state, 'plants');
      shop.update(state, level, 0.016, 0);
      expect(v.plants).toBe(plants);
      expect(v.plants.count).toBe(level);
      expect(v.plants.geometry).toBe(v.tiered('plant', getShopLayout(state).decorTier.plant as LookTier));
    }
    expect(v.plants.geometry).toBe(v.tiered('plant', 3));
    shop.dispose();
  });

  it('still picks a table at tier 3', () => {
    const state = furnished();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    internals(shop).applyLayout(atTier(getShopLayout(state), 3));
    const table = state.tables.find((t) => getShopLayout(state).tables.find((l) => l.id === t.id)!.zone !== 'outdoor')!;
    shop.prepareForPick();
    const ray = new Raycaster(new Vector3(table.pos.x, 5, table.pos.z), new Vector3(0, -1, 0));
    const hit = ray.intersectObjects(shop.pickables, true)[0]!;
    expect(hit).toBeDefined();
    expect(shop.resolveHit(hit.object, hit.instanceId)).toEqual({ kind: 'table', tableId: table.id });
    shop.dispose();
  });
});
