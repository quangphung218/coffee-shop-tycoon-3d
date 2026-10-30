// @vitest-environment jsdom
import { Box3, type BufferGeometry, Color, InstancedMesh, type Material, Matrix4, type Mesh, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { windowSpots } from '../../src/render/scene/facade';
import { GLOW_MATERIAL, PALETTE, SHARED_MATERIAL, WALL_HEIGHT } from '../../src/render/scene/parts';
import { CEILING_Y, CHANDELIER_BOTTOM_Y, CHANDELIER_SHADOW_RADIUS, PIANO_HEIGHT, ShopView } from '../../src/render/scene/shop';
import { loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { ART_GALLERY_SIZE, layoutFootprints, shapeBounds, shapeDistance } from '../../src/sim/nav/footprints';
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

/** World box of the instance's vertices with y in [minY, maxY] (the chandelier's floor shadow vs its hanging body). */
function placedBand(mesh: InstancedMesh, i: number, minY: number, maxY: number): Box3 {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  const pos = mesh.geometry.getAttribute('position');
  const out = new Box3();
  const v = new Vector3();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k);
    if (v.y >= minY && v.y <= maxY) out.expandByPoint(v.applyMatrix4(m));
  }
  return out;
}

/** The chandelier's floor shadow and hanging body (cord, crown, ring). */
const shadowOf = (mesh: InstancedMesh, i: number): Box3 => placedBand(mesh, i, -1, 0.1);
const bodyOf = (mesh: InstancedMesh, i: number): Box3 => placedBand(mesh, i, 1, Infinity);

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
      expect(bodyOf(v.chandeliers, i).min.y).toBeGreaterThan(WALL_HEIGHT);
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

  it('UX-012: hangs the chandelier body at ceiling height on a cord up to the ceiling, with a soft shadow blob on the floor apart from it', () => {
    const s = full();
    buyAll(s);
    const shop = view(s);
    const v = internals(shop);
    expect(v.chandeliers.count).toBe(2);
    // Near the ceiling: the whole lamp body sits in the top band under the ceiling, well above the walls.
    expect(CHANDELIER_BOTTOM_Y).toBeGreaterThanOrEqual(CEILING_Y - 0.8);
    expect(CHANDELIER_BOTTOM_Y).toBeGreaterThan(WALL_HEIGHT + 0.4);
    const floor = new Color(PALETTE.floor);
    const geo = v.chandeliers.geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    let darkest = 1;
    let rim = 0;
    for (let k = 0; k < pos.count; k++) {
      if (pos.getY(k) > 0.1) continue;
      const k2 = col.getX(k) / floor.r;
      darkest = Math.min(darkest, k2);
      if (Math.hypot(pos.getX(k), pos.getZ(k)) > CHANDELIER_SHADOW_RADIUS - 1e-6) rim = Math.max(rim, Math.abs(1 - k2));
      // A shade of the floor colour, never the gold of the lamp.
      expect(col.getY(k) / floor.g).toBeCloseTo(k2, 5);
    }
    // Soft: darker in the middle, fading to the bare floor colour at the rim.
    expect(darkest).toBeLessThan(0.85);
    expect(rim).toBeLessThan(1e-6);
    for (let i = 0; i < v.chandeliers.count; i++) {
      const body = bodyOf(v.chandeliers, i);
      const shadow = shadowOf(v.chandeliers, i);
      const glow = placed(v.crystals, i);
      // The cord reaches the ceiling; the body hangs above head height; the crystals stay with the body.
      expect(body.max.y).toBeCloseTo(CEILING_Y, 6);
      expect(body.min.y).toBeGreaterThan(WALL_HEIGHT);
      expect(glow.min.y).toBeGreaterThanOrEqual(CEILING_Y - 0.8);
      // The shadow lies flat on the floor, far below and apart from the body, centred under the cord.
      expect(shadow.min.y).toBeGreaterThan(0);
      expect(shadow.max.y).toBeLessThan(0.02);
      expect(body.min.y - shadow.max.y).toBeGreaterThan(WALL_HEIGHT);
      expect((shadow.min.x + shadow.max.x) / 2).toBeCloseTo((body.min.x + body.max.x) / 2, 6);
      expect(shadow.max.x - shadow.min.x).toBeCloseTo(2 * CHANDELIER_SHADOW_RADIUS, 2);
      // Every vertex of the frame is either the floor blob or the hanging body: nothing joins them.
      for (let k = 0; k < pos.count; k++) expect(pos.getY(k) < 0.1 || pos.getY(k) > WALL_HEIGHT).toBe(true);
    }
    // The old glow torus halo is gone from the crystals: they span no wider than the ring plus a crystal.
    const glow = placed(v.crystals, 0);
    expect(glow.max.x - glow.min.x).toBeLessThan(2 * 0.45 + 0.2);
    expect(v.crystals.material).toBe(GLOW_MATERIAL);
    expect(v.chandeliers.material).toBe(SHARED_MATERIAL);
    shop.dispose();
  });

  it('UX-012: never puts a chandelier (body or floor shadow) over a table or chair cell, across layouts', () => {
    /** Seating layouts: indoor tables, side room and patio at a range of levels, with one or both chandeliers. */
    const layouts: { tables: number; expand: number; outdoor: number; chandeliers: number }[] = [];
    for (const tables of [1, 3, 99]) for (const expand of [0, 1, 99]) for (const outdoor of [0, 99]) for (const chandeliers of [1, 2]) layouts.push({ tables, expand, outdoor, chandeliers });
    let checked = 0;
    for (const c of layouts) {
      const s = createNewGame('Quán Sang', 'normal', 5);
      s.shopLevel = 10;
      s.money = 1e15;
      ensureRetention(s).tickets = 1000;
      const up = (id: UpgradeId, n: number): void => {
        for (let k = 0; k < n && upgradeLevel(s, id) < maxUpgradeLevel(s, id); k++) expect(buyUpgrade(s, id).ok, id).toBe(true);
      };
      up('tables', c.tables);
      up('expand_area', c.expand);
      up('outdoor_seating', c.outdoor);
      up('lights', 99);
      up('chandelier', c.chandeliers);
      const shop = view(s);
      const v = internals(shop);
      const layout = getShopLayout(s);
      const name = JSON.stringify(c);
      expect(v.chandeliers.count, name).toBe(c.chandeliers);
      // Plan boxes of every rendered table and chair.
      const plan = (b: Box3): Box3 => new Box3(b.min.clone().setY(0), b.max.clone().setY(0));
      const furniture: Box3[] = [];
      for (let i = 0; i < v.tables.count; i++) furniture.push(plan(placed(v.tables, i)));
      for (let i = 0; i < v.chairs.count; i++) furniture.push(plan(placed(v.chairs, i)));
      expect(furniture.length, name).toBe(layout.tables.length + layout.tables.reduce((n, t) => n + t.seats, 0));
      const seatFps = layoutFootprints(layout).filter((f) => f.kind === 'table' || f.kind === 'chair');
      for (let i = 0; i < v.chandeliers.count; i++) {
        for (const box of [plan(bodyOf(v.chandeliers, i)), plan(shadowOf(v.chandeliers, i)), plan(placed(v.crystals, i))]) {
          for (const f of furniture) expect(box.intersectsBox(f), name).toBe(false);
        }
        const p = layout.premium.filter((x) => x.kind === 'chandelier')[i]!.pos;
        for (const f of seatFps) expect(shapeDistance(f.shape, p.x, p.z), `${name} ${f.id}`).toBeGreaterThan(CHANDELIER_SHADOW_RADIUS);
        checked++;
      }
      shop.dispose();
    }
    expect(checked).toBe(layouts.length * 1.5);
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
