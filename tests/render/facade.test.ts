import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import {
  FacadeView,
  WINDOW_HEIGHT,
  WINDOW_SILL,
  WINDOW_WIDTH,
  facadePieceCount,
  facadePlan,
  windowSpots,
} from '../../src/render/scene/facade';
import { PALETTE, cssColor } from '../../src/render/scene/palette';
import { PALETTE as PARTS_PALETTE, WALL_HEIGHT, WALL_LOW } from '../../src/render/scene/parts';
import { ShopView } from '../../src/render/scene/shop';
import { DOOR_WIDTH, doorPlanters, wallSpans } from '../../src/sim/nav';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout, nextUpgradeCost, type ShopLayout } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

function rich(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 100_000_000;
  return s;
}

function buy(s: GameState, id: UpgradeId, levels = 1): void {
  for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok).toBe(true);
}

function full(): GameState {
  const s = rich();
  buy(s, 'expand_area', 2);
  buy(s, 'outdoor_seating', 2);
  buy(s, 'big_counter', 2);
  buy(s, 'paintings', 3);
  buy(s, 'plants', 3);
  buy(s, 'lights', 2);
  return s;
}

function layouts(): ShopLayout[] {
  return [getShopLayout(rich()), getShopLayout(full())];
}

describe('facadePlan', () => {
  it('puts windows on the side and front walls, inside their spans and clear of the door', () => {
    for (const layout of layouts()) {
      const spans = wallSpans(layout);
      const spots = windowSpots(layout);
      for (const wall of [1, 2, 3, 4]) expect(spots.some((w) => w.wall === wall)).toBe(true);
      for (const w of spots) {
        const [cx, cz, sx, sz] = spans[w.wall]!;
        const alongX = sx > sz;
        const half = (alongX ? sx : sz) / 2;
        const offset = alongX ? Math.abs(w.x - cx) : Math.abs(w.z - cz);
        expect(offset + WINDOW_WIDTH / 2).toBeLessThan(half);
        if (alongX) {
          expect(w.z).toBe(cz);
          expect(Math.abs(w.x - layout.door.x)).toBeGreaterThan(DOOR_WIDTH / 2 + WINDOW_WIDTH / 2);
        } else {
          expect(w.x).toBe(cx);
        }
      }
    }
  });

  it('keeps windows off the paintings', () => {
    const layout = getShopLayout(full());
    const paintings = layout.decor.filter((d) => d.kind === 'painting');
    expect(paintings.length).toBe(3);
    for (const w of windowSpots(layout)) {
      for (const p of paintings) {
        const along = w.wall <= 2 ? Math.abs(p.pos.z - w.z) : Math.abs(p.pos.x - w.x);
        const across = w.wall <= 2 ? Math.abs(p.pos.x - w.x) : Math.abs(p.pos.z - w.z);
        if (across < 0.5) expect(along).toBeGreaterThan(WINDOW_WIDTH / 2 + 0.5);
      }
    }
  });

  it('adds windows and a fan when the shop expands', () => {
    const small = facadePlan(getShopLayout(rich()), 'medium');
    const big = facadePlan(getShopLayout(full()), 'medium');
    expect(big.windows.length).toBeGreaterThan(small.windows.length);
    expect(small.fans).toHaveLength(1);
    expect(big.fans).toHaveLength(2);
    const exp = getShopLayout(full()).expansion!;
    expect(big.fans[1]!.x).toBeGreaterThan(exp.minX);
    expect(big.fans[1]!.x).toBeLessThan(exp.maxX);
  });

  it('centres the awning, sign and step on the door and flanks it with the nav planters', () => {
    for (const layout of layouts()) {
      const plan = facadePlan(layout, 'medium');
      expect(plan.awning.x).toBe(layout.door.x);
      expect(plan.sign.x).toBe(layout.door.x);
      expect(plan.step.x).toBe(layout.door.x);
      expect(plan.sign.y).toBeGreaterThan(WALL_HEIGHT);
      expect(plan.planters).toEqual(doorPlanters(layout));
      expect(plan.frontZ).toBeGreaterThan(layout.indoor.maxZ);
    }
  });

  it('hangs pendants over the counter and keeps wall pieces below the wall top', () => {
    const layout = getShopLayout(full());
    const plan = facadePlan(layout, 'high');
    const c = layout.counter;
    expect(plan.pendants).toHaveLength(3);
    for (const p of plan.pendants) {
      expect(p.z).toBe(c.pos.z);
      expect(Math.abs(p.x - c.pos.x)).toBeLessThan(c.width / 2);
    }
    expect(WINDOW_SILL + WINDOW_HEIGHT + 0.08).toBeLessThan(WALL_HEIGHT);
    for (const j of plan.jars) {
      expect(j.y + 0.26).toBeLessThan(WALL_HEIGHT);
      expect(j.z).toBeGreaterThan(layout.indoor.minZ);
    }
  });

  it('drops small details on low and adds flower boxes on high', () => {
    const layout = getShopLayout(full());
    const [low, medium, high] = QUALITIES.map((q) => facadePlan(layout, q));
    expect(low!.jars).toHaveLength(0);
    expect(low!.pendants).toHaveLength(0);
    expect(low!.awning.valance).toBe(false);
    expect(low!.mullions).toBe(false);
    expect(medium!.jars.length).toBeGreaterThan(0);
    expect(medium!.flowerBoxes).toBe(false);
    expect(high!.flowerBoxes).toBe(true);
    // The architecture itself is the same on every quality.
    expect(low!.windows).toEqual(high!.windows);
    expect(low!.planters).toEqual(high!.planters);
    expect(facadePieceCount(low!)).toBeLessThan(facadePieceCount(medium!));
    expect(facadePieceCount(medium!)).toBeLessThan(facadePieceCount(high!));
  });

  it('is the same for the same layout', () => {
    expect(facadePlan(getShopLayout(full()), 'medium')).toEqual(facadePlan(getShopLayout(full()), 'medium'));
  });
});

describe('FacadeView', () => {
  it('shrinks and hides wall details with their wall', () => {
    const view = new FacadeView('medium');
    view.build(getShopLayout(rich()));
    view.syncWall(3, WALL_HEIGHT);
    expect(view.wallDetailsVisible(3)).toBe(true);
    view.syncWall(3, 1.2);
    expect(view.wallDetailsVisible(3)).toBe(true);
    view.syncWall(3, WALL_LOW);
    expect(view.wallDetailsVisible(3)).toBe(false);
    view.dispose();
  });

  it('rebuilds on a quality change and keeps one blade mesh per fan', () => {
    const view = new FacadeView('high');
    view.build(getShopLayout(full()));
    const high = facadePieceCount(view.current!);
    expect(view.fans).toHaveLength(2);
    view.setQuality('low');
    expect(facadePieceCount(view.current!)).toBeLessThan(high);
    expect(view.fans).toHaveLength(2);
    view.dispose();
  });

  it('keeps the moving parts as their own meshes: one plant per planter, a valance where the plan has one', () => {
    const layout = getShopLayout(full());
    for (const q of QUALITIES) {
      const view = new FacadeView(q);
      view.build(layout);
      const plan = view.current!;
      expect(view.foliage).toHaveLength(plan.planters.length);
      view.foliage.forEach((leaves, i) => {
        expect(leaves.position.x).toBe(plan.planters[i]!.x);
        expect(leaves.position.z).toBe(plan.planters[i]!.z);
      });
      expect(view.valance !== null).toBe(plan.awning.valance);
      view.build(layout);
      expect(view.foliage).toHaveLength(plan.planters.length);
      view.dispose();
    }
  });

  it('warms the sign up with the evening glow', () => {
    const view = new FacadeView('medium');
    view.setShopName('Quán Mây');
    view.setSignGlow(0);
    const day = view.signColor.clone();
    view.setSignGlow(1);
    const night = view.signColor.clone();
    expect(night.r).toBeGreaterThan(day.r);
    expect(night.r).toBeGreaterThan(night.b);
    view.setSignGlow(5);
    expect(view.signColor.equals(night)).toBe(true);
    view.dispose();
  });

  it('lowers the details of the walls facing the camera, but keeps the shop front', () => {
    const shop = new ShopView(new Scene(), 'medium');
    // Default view from the front right: the front and right walls go down.
    shop.update(rich(), 0, 0, Math.PI / 4);
    expect(shop.facade.wallDetailsVisible(0)).toBe(true);
    expect(shop.facade.wallDetailsVisible(1)).toBe(true);
    expect(shop.facade.wallDetailsVisible(2)).toBe(false);
    expect(shop.facade.wallDetailsVisible(3)).toBe(false);
    expect(shop.facade.wallDetailsVisible(4)).toBe(false);
    // From behind the back wall goes down instead.
    shop.update(rich(), 1, 0, Math.PI);
    expect(shop.facade.wallDetailsVisible(0)).toBe(false);
    expect(shop.facade.wallDetailsVisible(3)).toBe(true);
    shop.dispose();
  });

  it('builds the facade only when the layout changes', () => {
    const s = rich();
    const shop = new ShopView(new Scene(), 'medium');
    shop.update(s, 0, 0, 0);
    const plan = shop.facade.current;
    shop.update(s, 0.016, 0.016, 0);
    expect(shop.facade.current).toBe(plan);
    buy(s, 'expand_area');
    shop.update(s, 0.032, 0.016, 0);
    expect(shop.facade.current).not.toBe(plan);
    shop.dispose();
  });
});

// The project has no Node types, so node:fs comes in through a dynamically
// named import; the path is relative to the repo root.
const FS_MODULE = 'node:fs';
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };

describe('facade colours', () => {
  it('takes every colour from PALETTE', () => {
    const hex = /0x[0-9a-f]{6}\b|#[0-9a-f]{6}\b/gi;
    expect(fs.readFileSync('src/render/scene/facade.ts', 'utf8').match(hex)).toBeNull();
  });

  it('writes palette colours as CSS strings for the sign canvas', () => {
    expect(cssColor(PALETTE.cream)).toBe('#fff9f0');
    expect(cssColor(PALETTE.chalkboard)).toBe('#2e3a35');
    expect(cssColor(0x00ff00)).toBe('#00ff00');
  });

  it('keeps the parts.ts export of PALETTE for older importers', () => {
    expect(PARTS_PALETTE).toBe(PALETTE);
  });
});
