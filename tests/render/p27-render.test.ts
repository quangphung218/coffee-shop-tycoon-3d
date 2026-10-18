// @vitest-environment jsdom
import { Box3, type BufferGeometry, Color, InstancedMesh, Matrix4, type Mesh, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LABEL_FACES, Label, LabelAssets, VIP_ICON, labelFor } from '../../src/render/actors/labels';
import { CameraController, DEFAULT_ZOOM, MIN_ZOOM, fitZoom } from '../../src/render/scene/camera';
import { facadePlan, windowSpots } from '../../src/render/scene/facade';
import { BACK_COUNTER_HEIGHT } from '../../src/render/scene/equipment';
import { GLASS_MATERIAL, PALETTE, WALL_HEIGHT } from '../../src/render/scene/parts';
import { ShopView, layoutKey, type LookTier, type TieredPiece } from '../../src/render/scene/shop';
import { NEAR_BUILDINGS_MIN_X, WALK_LINES, WALKER_RADIUS, buildingLots } from '../../src/render/street/layout';
import { BACK_COUNTER_TOP_DEPTH, BOOKSHELF_SIZE, RECORD_PLAYER_MARGIN, SOFA_SIZE, WALL_THICKNESS, buildingArea, layoutFootprints, shapeBounds } from '../../src/sim/nav/footprints';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState, UpgradeId } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, nextUpgradeCost, upgradeLevel, type ShopLayout } from '../../src/sim/upgrades';

const TIERS: readonly LookTier[] = [1, 2, 3];
/** The P27 pieces with trim: steel from tier 2, gold at tier 3 (the neon tubes only glow). */
const NEW_TRIMMED: readonly TieredPiece[] = ['neon', 'bookshelf', 'recordPlayer', 'sofa'];
const NEW_PIECES: readonly TieredPiece[] = [...NEW_TRIMMED, 'neonTube'];

type Internals = {
  tiered(piece: TieredPiece, tier: LookTier): BufferGeometry;
  applyLayout(layout: ShopLayout): void;
  walls: { mesh: Mesh }[];
  expansionFloor: Mesh;
  neons: InstancedMesh;
  neonTubes: InstancedMesh;
  bookshelves: InstancedMesh;
  recordPlayers: InstancedMesh;
  sofas: InstancedMesh;
};

function internals(shop: ShopView): Internals {
  return shop as unknown as Internals;
}

function buy(s: GameState, id: UpgradeId, levels = 1): void {
  for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

/** A level 10 shop with money and tickets to buy anything. */
function rich(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 10_000_000_000;
  s.shopLevel = 10;
  ensureRetention(s).tickets = 100;
  return s;
}

/** The largest shop: side room at level 4, patio, and every P27 furniture level. */
function grown(): GameState {
  const s = rich();
  buy(s, 'expand_area', 4);
  buy(s, 'outdoor_seating', 2);
  buy(s, 'neon_sign', 2);
  buy(s, 'bookshelf', 2);
  buy(s, 'record_player', 1);
  buy(s, 'sofa_corner', 1);
  return s;
}

function triangles(geo: BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
}

function signature(geo: BufferGeometry): string {
  const color = geo.getAttribute('color');
  return `${Array.from(geo.getAttribute('position').array).join(',')}|${Array.from(color.array).join(',')}`;
}

function hasColor(geo: BufferGeometry, hex: number): boolean {
  const want = new Color(hex);
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(c.getX(i) - want.r) < 1e-4 && Math.abs(c.getY(i) - want.g) < 1e-4 && Math.abs(c.getZ(i) - want.b) < 1e-4) return true;
  }
  return false;
}

function bounds(geo: BufferGeometry): Box3 {
  geo.computeBoundingBox();
  return geo.boundingBox!;
}

/** Meshes the renderer would draw (one draw call each). */
function drawn(shop: ShopView): number {
  let n = 0;
  shop.root.traverse((o) => {
    if ((o as Mesh).isMesh && (!(o instanceof InstancedMesh) || o.count > 0)) n++;
  });
  return n;
}

function atTier(layout: ShopLayout, tier: LookTier): ShopLayout {
  const decorTier = { plant: tier, painting: tier, light: tier, neon: tier, bookshelf: tier, record_player: tier, sofa: tier };
  return { ...layout, furnitureTier: tier, outdoorTier: tier, decorTier };
}

describe('P27 furniture models', () => {
  it('draws three looks per piece, steel trim at tier 2 and gold at tier 3', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    for (const piece of NEW_PIECES) expect(new Set(TIERS.map((t) => signature(v.tiered(piece, t)))).size, piece).toBe(3);
    for (const piece of NEW_TRIMMED) {
      expect(hasColor(v.tiered(piece, 2), PALETTE.steel), `${piece} tier 2`).toBe(true);
      expect(hasColor(v.tiered(piece, 3), PALETTE.gold), `${piece} tier 3`).toBe(true);
    }
    shop.dispose();
  });

  it('keeps every tier within 1.6 times the triangles of tier 1', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    for (const piece of NEW_PIECES) {
      const base = triangles(v.tiered(piece, 1));
      for (const t of [2, 3] as const) expect(triangles(v.tiered(piece, t)), `${piece} tier ${t}`).toBeLessThanOrEqual(1.6 * base);
    }
    // A neon sign is drawn as its board plus its tubes.
    const neon = (t: LookTier): number => triangles(v.tiered('neon', t)) + triangles(v.tiered('neonTube', t));
    expect(neon(3)).toBeLessThanOrEqual(1.6 * neon(1));
    shop.dispose();
  });

  it('builds each model inside the footprint the nav grid blocks', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    const eps = 1e-6;
    for (const t of TIERS) {
      const shelf = bounds(v.tiered('bookshelf', t));
      expect(Math.max(-shelf.min.x, shelf.max.x)).toBeLessThanOrEqual(BOOKSHELF_SIZE.length / 2 + eps);
      expect(Math.max(-shelf.min.z, shelf.max.z)).toBeLessThanOrEqual(BOOKSHELF_SIZE.depth / 2 + eps);
      const sofa = bounds(v.tiered('sofa', t));
      expect(Math.max(-sofa.min.x, sofa.max.x)).toBeLessThanOrEqual(SOFA_SIZE.width / 2 + eps);
      expect(Math.max(-sofa.min.z, sofa.max.z)).toBeLessThanOrEqual(SOFA_SIZE.depth / 2 + eps);
      // The record player stays on the back counter that runs past it.
      const player = bounds(v.tiered('recordPlayer', t));
      expect(Math.max(-player.min.x, player.max.x)).toBeLessThanOrEqual(RECORD_PLAYER_MARGIN + eps);
      expect(Math.max(-player.min.z, player.max.z)).toBeLessThanOrEqual(BACK_COUNTER_TOP_DEPTH / 2 + eps);
      expect(player.min.y).toBeGreaterThanOrEqual(-eps);
    }
    shop.dispose();
  });

  it('places the bookshelves and the sofa on their footprints, the record player on the back counter', () => {
    const state = grown();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const v = internals(shop);
    const layout = getShopLayout(state);
    const prints = layoutFootprints(layout);
    const placed = (mesh: InstancedMesh, i: number): Box3 => {
      const m = new Matrix4();
      mesh.getMatrixAt(i, m);
      return bounds(mesh.geometry).clone().applyMatrix4(m);
    };
    const inside = (box: Box3, id: string): void => {
      const fp = shapeBounds(prints.find((p) => p.id === id)!.shape);
      expect(box.min.x, id).toBeGreaterThanOrEqual(fp.minX - 1e-6);
      expect(box.max.x, id).toBeLessThanOrEqual(fp.maxX + 1e-6);
      expect(box.min.z, id).toBeGreaterThanOrEqual(fp.minZ - 1e-6);
      expect(box.max.z, id).toBeLessThanOrEqual(fp.maxZ + 1e-6);
    };
    expect(v.bookshelves.count).toBe(2);
    expect(v.sofas.count).toBe(1);
    expect(v.recordPlayers.count).toBe(1);
    expect(v.neons.count).toBe(2);
    expect(v.neonTubes.count).toBe(2);
    inside(placed(v.bookshelves, 0), 'bookshelf:0');
    inside(placed(v.bookshelves, 1), 'bookshelf:1');
    inside(placed(v.sofas, 0), 'sofa:0');
    const player = placed(v.recordPlayers, 0);
    expect(player.min.y).toBeCloseTo(BACK_COUNTER_HEIGHT, 5);
    inside(new Box3(new Vector3(player.min.x, 0, player.min.z), new Vector3(player.max.x, 0, player.max.z)), 'back_counter');
    // Neon signs hang inside the front wall, clear of it.
    for (let i = 0; i < 2; i++) expect(placed(v.neons, i).max.z).toBeLessThan(layout.indoor.maxZ);
    expect(shop.counts().decor).toBe(layout.decor.length);
    shop.dispose();
  });

  it('glows the neon tubes with the window glass instead of a light of their own', () => {
    const shop = new ShopView(new Scene(), 'medium');
    const v = internals(shop);
    expect(v.neonTubes.material).toBe(GLASS_MATERIAL);
    let lights = 0;
    shop.root.traverse((o) => {
      if ((o as { isLight?: boolean }).isLight) lights++;
    });
    expect(lights).toBe(0);
    shop.dispose();
  });
});

describe('P27 tier swap', () => {
  it('keeps meshes, instance counts and draw calls when the new furniture changes tier', () => {
    const state = grown();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const v = internals(shop);
    const layout = getShopLayout(state);
    const before = [v.neons, v.neonTubes, v.bookshelves, v.recordPlayers, v.sofas];
    const counts = shop.counts();
    const children = shop.root.children.length;
    const draws = drawn(shop);
    for (const t of TIERS) {
      v.applyLayout(atTier(layout, t));
      expect([v.neons, v.neonTubes, v.bookshelves, v.recordPlayers, v.sofas]).toEqual(before);
      expect(v.neons.geometry).toBe(v.tiered('neon', t));
      expect(v.neonTubes.geometry).toBe(v.tiered('neonTube', t));
      expect(v.bookshelves.geometry).toBe(v.tiered('bookshelf', t));
      expect(v.recordPlayers.geometry).toBe(v.tiered('recordPlayer', t));
      expect(v.sofas.geometry).toBe(v.tiered('sofa', t));
      expect(shop.counts()).toEqual(counts);
      expect(shop.root.children.length).toBe(children);
      expect(drawn(shop)).toBe(draws);
    }
    shop.dispose();
  });

  it('runs the back counter under a newly bought record player', () => {
    const state = rich();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const counter = (): Box3 => {
      let box: Box3 | null = null;
      shop.root.traverse((o) => {
        if (!box && (o as Mesh).isMesh && o.position.z === -3.4 && !(o instanceof InstancedMesh)) box = bounds((o as Mesh).geometry).clone();
      });
      return box!;
    };
    const width = counter().max.x;
    buy(state, 'record_player');
    shop.update(state, 1, 0.016, 0);
    const player = getShopLayout(state).decor.find((d) => d.kind === 'record_player')!;
    expect(counter().max.x).toBeGreaterThan(width);
    expect(counter().max.x).toBeGreaterThanOrEqual(player.pos.x + RECORD_PLAYER_MARGIN - 1e-6);
    shop.dispose();
  });
});

describe('side room levels 3 and 4', () => {
  it('changes layoutKey at every level and grows floor, walls and fans with it', () => {
    const state = rich();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    const v = internals(shop);
    const keys = new Set([layoutKey(state)]);
    for (let level = 1; level <= 4; level++) {
      buy(state, 'expand_area');
      expect(upgradeLevel(state, 'expand_area')).toBe(level);
      keys.add(layoutKey(state));
      expect(shop.update(state, level, 0.016, 0), `level ${level}`).toBe(true);
      const layout = getShopLayout(state);
      const room = layout.expansion!;
      expect(room.maxX).toBe(5.5 + 2 * level);
      // Floor, the right wall and both long walls reach the new edge.
      expect(v.expansionFloor.visible).toBe(true);
      expect(v.expansionFloor.position.x + v.expansionFloor.scale.x / 2).toBeCloseTo(room.maxX, 5);
      const right = v.walls[2]!.mesh;
      expect(right.position.x).toBeCloseTo(room.maxX + WALL_THICKNESS / 2, 5);
      for (const i of [0, 4]) {
        const wall = v.walls[i]!.mesh;
        expect(wall.position.x + wall.scale.x / 2, `wall ${i}`).toBeCloseTo(room.maxX + WALL_THICKNESS, 5);
      }
      expect(shop.extent.maxX).toBe(room.maxX);
      // One ceiling fan in the side room up to level 2, two at levels 3 and 4, all inside it.
      const fans = facadePlan(layout, 'medium').fans.slice(1);
      expect(fans).toHaveLength(level <= 2 ? 1 : 2);
      for (const f of fans) {
        expect(f.x).toBeGreaterThan(room.minX + 1);
        expect(f.x).toBeLessThan(room.maxX - 1);
      }
      expect(shop.facade.fans).toHaveLength(1 + fans.length);
      // Windows run along the longer side and front walls too.
      expect(windowSpots(layout).some((w) => w.wall === 4 && w.x > room.maxX - 3)).toBe(true);
    }
    expect(keys.size).toBe(5);
    expect(shop.extent.maxX).toBe(13.5);
    shop.dispose();
  });

  it('keeps street buildings and walkers off the largest shop', () => {
    const layout = getShopLayout(grown());
    const room = buildingArea(layout);
    const outer = room.maxX + WALL_THICKNESS;
    expect(NEAR_BUILDINGS_MIN_X).toBeGreaterThan(outer);
    for (const lot of buildingLots()) {
      if (lot.facesPlusZ) expect(Math.abs(lot.x) - lot.width / 2).toBeGreaterThan(outer);
    }
    for (const line of WALK_LINES) expect(line.z - WALKER_RADIUS).toBeGreaterThan(layout.outdoor!.maxZ);
  });

  it('leaves no window behind a bookshelf', () => {
    const layout = getShopLayout(grown());
    for (const w of windowSpots(layout).filter((s) => s.wall === 1)) {
      for (const d of layout.decor.filter((x) => x.kind === 'bookshelf')) expect(Math.abs(w.z - d.pos.z)).toBeGreaterThanOrEqual(0.6 + BOOKSHELF_SIZE.length / 2);
    }
  });
});

describe('VIP star', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A 2D context that accepts every call, enough for the label drawing. */
  function fakeCanvas(): unknown {
    const ctx = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? () => undefined : undefined), set: () => true });
    return { width: 0, height: 0, getContext: () => ctx };
  }

  it('is built in LabelAssets.prebuild, so a VIP tag draws no canvas mid-frame', () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
    expect(LABEL_FACES).toContain(VIP_ICON);
    const assets = new LabelAssets();
    const textures = assets.prebuild();
    const star = assets.face(VIP_ICON);
    expect(textures).toContain(star.map);
    const label = new Label(assets);
    label.set({ icon: 'i-latte', patience: 0.5, ready: false, face: 'i-face-ok', vip: true }, 0);
    expect(label.vipShown).toBe(true);
    // Nothing new was drawn for the tag.
    expect(assets.prebuild()).toHaveLength(textures.length);
    expect(assets.face(VIP_ICON)).toBe(star);
    assets.dispose();
  });

  it('shows over VIP customers only, also when they have no bubble', () => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
    const state = createNewGame('Quán Mây', 'normal', 1);
    const assets = new LabelAssets();
    const label = new Label(assets);
    const guest = { id: 1, state: 'drinking', vip: true, order: 'latte', patience: 10, maxPatience: 10 } as unknown as Customer;
    label.set(labelFor(state, guest), 0);
    expect(label.vipShown).toBe(true);
    expect(label.visible).toBe(true);
    label.set(labelFor(state, { ...guest, state: 'waiting' } as Customer), 1);
    expect(label.vipShown).toBe(true);
    expect(label.iconShown).toBe('i-latte');
    label.set(labelFor(state, { ...guest, vip: undefined } as Customer), 2);
    expect(label.vipShown).toBe(false);
    expect(label.visible).toBe(false);
    assets.dispose();
  });
});

describe('camera limits for the largest shop', () => {
  const VIEWPORTS: readonly (readonly [number, number])[] = [
    [390, 844],
    [1280, 720],
  ];

  function settle(cam: CameraController): void {
    for (let i = 0; i < 120; i++) cam.update(0.05);
  }

  it('zooms out far enough to see the whole level 4 shop from every side', () => {
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(grown(), 0, 0, 0);
    const e = shop.extent;
    expect(e.maxX).toBe(13.5);
    const t = WALL_THICKNESS;
    const corners: Vector3[] = [];
    for (const x of [e.minX - t, e.maxX + t]) for (const z of [e.minZ - t, e.maxZ]) for (const y of [0, WALL_HEIGHT]) corners.push(new Vector3(x, y, z));
    for (const [w, h] of VIEWPORTS) {
      const canvas = document.createElement('canvas');
      const cam = new CameraController(canvas, { edgePan: false, reducedMotion: () => true });
      cam.setAspect(w / h);
      cam.setBounds(e.minX, e.maxX, e.minZ, e.maxZ);
      expect(cam.minZoom).toBeLessThanOrEqual(MIN_ZOOM);
      // The pan limits reach past the whole shop.
      const b = (cam as unknown as { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }).bounds;
      expect(b.minX).toBeLessThan(e.minX);
      expect(b.maxX).toBeGreaterThan(e.maxX);
      expect(b.minZ).toBeLessThan(e.minZ);
      expect(b.maxZ).toBeGreaterThan(e.maxZ);
      cam.setHome((e.minX + e.maxX) / 2, (e.minZ + e.maxZ) / 2);
      cam.reset(true);
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100_000, cancelable: true }));
      for (let k = 0; k < 8; k++) {
        settle(cam);
        expect(cam.camera.zoom, `${w}x${h}`).toBeCloseTo(cam.minZoom, 4);
        cam.camera.updateMatrixWorld();
        for (const c of corners) {
          const p = c.clone().project(cam.camera);
          expect(Math.abs(p.x), `${w}x${h} turn ${k} x`).toBeLessThanOrEqual(1);
          expect(Math.abs(p.y), `${w}x${h} turn ${k} y`).toBeLessThanOrEqual(1);
        }
        cam.rotate(Math.PI / 4);
      }
      cam.dispose();
    }
    shop.dispose();
  });

  it('keeps the small shop as it was: zoom limit, home and reset zoom', () => {
    const state = createNewGame('Quán Mây', 'normal', 1);
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(state, 0, 0, 0);
    expect(shop.center.x).toBe(0);
    const e = shop.extent;
    const canvas = document.createElement('canvas');
    const cam = new CameraController(canvas, { edgePan: false, reducedMotion: () => true });
    cam.setAspect(1280 / 720);
    cam.setBounds(e.minX, e.maxX, e.minZ, e.maxZ);
    expect(cam.minZoom).toBe(MIN_ZOOM);
    cam.setHome(shop.center.x, shop.center.z);
    cam.reset(true);
    expect(cam.camera.zoom).toBe(DEFAULT_ZOOM);
    cam.dispose();
    shop.dispose();
  });

  it('fits a wider shop on a narrower screen only by zooming out further', () => {
    expect(fitZoom(20, 15, 2.2, 390 / 844)).toBeLessThan(fitZoom(10, 15, 2.2, 390 / 844));
    expect(fitZoom(20, 15, 2.2, 1280 / 720)).toBeGreaterThan(fitZoom(20, 15, 2.2, 390 / 844));
    expect(fitZoom(0, 0, 2.2, 1)).toBe(MIN_ZOOM);
  });
});
