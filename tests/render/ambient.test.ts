import { Matrix4, PointLight, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import {
  AmbientView,
  GLASS_GLOW,
  MAX_POINT_LIGHTS,
  POINT_INTENSITY,
  ambientFor,
  fanAngle,
  isBrewing,
  swayAngle,
  warmGlow,
} from '../../src/render/scene/ambient';
import { environmentEnabled } from '../../src/render/scene/environment';
import { GLASS_MATERIAL } from '../../src/render/scene/parts';
import { fillOf, LIGHT_BUDGET, lightingFor, P19_LIGHTING, totalLightOf } from '../../src/render/scene/renderer';
import { ShopView } from '../../src/render/scene/shop';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

function game(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 100_000_000;
  s.weather = 'sunny';
  const buy = (id: UpgradeId, levels: number): void => {
    for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok).toBe(true);
  };
  buy('expand_area', 2);
  buy('plants', 3);
  return s;
}

function setup(quality: Quality, reduced = false): { scene: Scene; shop: ShopView; ambient: AmbientView; state: GameState } {
  const scene = new Scene();
  const shop = new ShopView(scene, quality);
  const state = game();
  shop.update(state, 0, 0, 0);
  const ambient = new AmbientView(scene, shop, { quality, reducedMotion: () => reduced });
  return { scene, shop, ambient, state };
}

function pointLights(scene: Scene): PointLight[] {
  const out: PointLight[] = [];
  scene.traverse((o) => {
    if (o instanceof PointLight) out.push(o);
  });
  return out;
}

/** Fan, door plant, valance and potted plant poses, to tell whether anything moved. */
function pose(shop: ShopView): number[] {
  const f = shop.facade;
  const m = new Matrix4();
  const out: number[] = [...f.fans.map((b) => b.rotation.y), ...f.foliage.flatMap((l) => [l.rotation.x, l.rotation.z]), f.valance?.rotation.x ?? 0];
  for (let i = 0; i < shop.plants.count; i++) {
    shop.plants.getMatrixAt(i, m);
    out.push(...m.elements);
  }
  return out;
}

describe('warm glow by time of day', () => {
  it('is off at midday and rises after 17:00 into the night', () => {
    const noon = warmGlow(12 * 60, 'sunny');
    expect(noon).toBe(0);
    let prev = warmGlow(16 * 60 + 30, 'sunny');
    for (const h of [17, 18, 19, 20]) {
      const g = warmGlow(h * 60, 'sunny');
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    expect(warmGlow(17 * 60, 'sunny')).toBeGreaterThan(noon);
    expect(warmGlow(21 * 60, 'sunny')).toBe(1);
  });

  it('fades through the morning into the day', () => {
    expect(warmGlow(6 * 60, 'sunny')).toBeGreaterThan(warmGlow(7 * 60, 'sunny'));
    expect(warmGlow(7 * 60, 'sunny')).toBeGreaterThan(warmGlow(9 * 60, 'sunny'));
    expect(warmGlow(9 * 60, 'sunny')).toBe(0);
  });

  it('stays in 0..1, and rain keeps some glow by day', () => {
    for (let m = 0; m <= 24 * 60; m += 15) {
      const g = warmGlow(m, 'sunny');
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
    expect(warmGlow(12 * 60, 'rainy')).toBeGreaterThan(0);
    expect(warmGlow(Number.NaN, 'sunny')).toBe(0);
  });

  it('drives the glass, sign and point lights from the view', () => {
    const { scene, shop, ambient, state } = setup('high');
    state.minute = 12 * 60;
    ambient.update(state, 0, 0.016);
    const signDay = shop.facade.signColor.r;
    expect(GLASS_MATERIAL.emissiveIntensity).toBe(0);
    for (const l of pointLights(scene)) expect(l.intensity).toBe(0);

    state.minute = 20 * 60;
    ambient.update(state, 0, 0.016);
    const glow = ambient.stats().glow;
    expect(glow).toBeGreaterThan(0.9);
    expect(GLASS_MATERIAL.emissiveIntensity).toBeCloseTo(glow * GLASS_GLOW);
    expect(shop.facade.signColor.r).toBeGreaterThan(signDay);
    for (const l of pointLights(scene)) expect(l.intensity).toBeCloseTo(glow * POINT_INTENSITY);
    ambient.dispose();
  });
});

describe('ambient by quality', () => {
  it('turns motion and point lights on per quality', () => {
    expect(ambientFor('low')).toEqual({ motion: false, pointLights: 0 });
    expect(ambientFor('medium')).toEqual({ motion: true, pointLights: 0 });
    expect(ambientFor('high')).toEqual({ motion: true, pointLights: 2 });
    for (const q of QUALITIES) {
      expect(ambientFor(q, true).motion).toBe(false);
      expect(ambientFor(q, true).pointLights).toBe(ambientFor(q).pointLights);
      expect(ambientFor(q).pointLights).toBeLessThanOrEqual(MAX_POINT_LIGHTS);
      // Shared objects: the frame loop allocates nothing.
      expect(ambientFor(q)).toBe(ambientFor(q));
    }
  });

  it('low has no point lights and nothing moves', () => {
    const { scene, shop, ambient, state } = setup('low');
    state.minute = 20 * 60;
    state.orders.push({ id: 1, customerId: 1, itemId: 'espresso', status: 'brewing', remaining: 2, staffId: null });
    ambient.update(state, 0, 0.016);
    const before = pose(shop);
    for (let i = 0; i < 30; i++) ambient.update(state, 0, 0.05);
    expect(pose(shop)).toEqual(before);
    expect(pointLights(scene)).toHaveLength(0);
    expect(ambient.stats()).toMatchObject({ motion: false, pointLights: 0, steam: false });
    ambient.dispose();
  });

  it('medium moves fans, plants and the valance without adding lights', () => {
    const { scene, shop, ambient, state } = setup('medium');
    expect(shop.facade.fans.length).toBeGreaterThan(0);
    expect(shop.facade.foliage.length).toBeGreaterThan(0);
    expect(shop.facade.valance).not.toBeNull();
    expect(shop.plants.count).toBeGreaterThan(0);
    ambient.update(state, 0, 0.016);
    const before = pose(shop);
    ambient.update(state, 0, 0.4);
    const after = pose(shop);
    expect(after).not.toEqual(before);
    expect(shop.facade.fans[0]!.rotation.y).not.toBe(before[0]);
    expect(pointLights(scene)).toHaveLength(0);
    ambient.dispose();
  });

  it('high adds at most two point lights inside the shop, without shadows', () => {
    const { scene, ambient } = setup('high');
    const lights = pointLights(scene);
    expect(lights.length).toBeGreaterThan(0);
    expect(lights.length).toBeLessThanOrEqual(2);
    for (const l of lights) expect(l.castShadow).toBe(false);
    ambient.dispose();
    expect(pointLights(scene)).toHaveLength(0);
  });

  it('adds and drops the point lights when the quality changes', () => {
    const { scene, shop, ambient, state } = setup('high');
    shop.setQuality('low');
    ambient.setQuality('low');
    ambient.update(state, 0, 0.016);
    expect(pointLights(scene)).toHaveLength(0);
    shop.setQuality('high');
    ambient.setQuality('high');
    ambient.update(state, 0, 0.016);
    expect(pointLights(scene)).toHaveLength(2);
    ambient.dispose();
  });

  it('puts everything back at rest when motion turns off', () => {
    let reduced = false;
    const scene = new Scene();
    const shop = new ShopView(scene, 'medium');
    const state = game();
    shop.update(state, 0, 0, 0);
    const ambient = new AmbientView(scene, shop, { quality: 'medium', reducedMotion: () => reduced });
    ambient.update(state, 0, 0.016);
    ambient.update(state, 0, 0.7);
    expect(shop.facade.fans[0]!.rotation.y).not.toBe(0);
    reduced = true;
    ambient.update(state, 0, 0.7);
    expect(ambient.stats().motion).toBe(false);
    for (const b of shop.facade.fans) expect(b.rotation.y).toBe(0);
    for (const l of shop.facade.foliage) expect(l.rotation.x).toBe(0);
    expect(shop.facade.valance!.rotation.x).toBe(0);
    ambient.dispose();
  });

  it('steams over the machine only while an order brews, and freezes while paused', () => {
    const { ambient, state } = setup('medium');
    ambient.update(state, 0, 0.016);
    expect(isBrewing(state)).toBe(false);
    expect(ambient.stats().steam).toBe(false);
    state.orders.push({ id: 1, customerId: 1, itemId: 'espresso', status: 'brewing', remaining: 2, staffId: null });
    expect(isBrewing(state)).toBe(true);
    ambient.update(state, 0, 0.016);
    expect(ambient.stats().steam).toBe(true);
    state.orders[0]!.status = 'ready';
    ambient.update(state, 0, 0.016);
    expect(ambient.stats().steam).toBe(false);
    ambient.dispose();
  });

  it('holds the pose while the game is paused', () => {
    const { shop, ambient, state } = setup('medium');
    ambient.update(state, 0, 0.3);
    const before = pose(shop);
    state.paused = true;
    ambient.update(state, 0, 0.3);
    expect(pose(shop)).toEqual(before);
    ambient.dispose();
  });
});

describe('scene light budget', () => {
  it('keeps the total light of every quality within the P19 budget', () => {
    expect(LIGHT_BUDGET).toBeCloseTo(3.4);
    for (const q of QUALITIES) expect(totalLightOf(lightingFor(q))).toBeLessThanOrEqual(LIGHT_BUDGET + 1e-9);
  });

  it('keeps the sun at least as strong against the fill as P19, so faces keep their contrast', () => {
    const p19 = P19_LIGHTING.sun / fillOf(P19_LIGHTING);
    for (const q of QUALITIES) {
      const l = lightingFor(q);
      expect(l.sun / fillOf(l)).toBeGreaterThanOrEqual(p19 - 1e-9);
    }
  });

  it('uses the environment map only where the quality builds it, as a small part of the fill', () => {
    for (const q of QUALITIES) {
      const l = lightingFor(q);
      expect(l.env > 0).toBe(environmentEnabled(q));
      expect(l.env).toBeLessThanOrEqual(0.15);
      expect(l.hemi).toBeGreaterThan(0);
    }
    expect(lightingFor('low')).toEqual(P19_LIGHTING);
  });
});

describe('motion curves', () => {
  it('sways gently and out of phase', () => {
    for (let t = 0; t < 20; t += 0.37) {
      expect(Math.abs(swayAngle(t, 0))).toBeLessThan(0.06);
    }
    expect(swayAngle(1, 0)).not.toBeCloseTo(swayAngle(1, 1));
  });

  it('turns the fans steadily within one turn', () => {
    expect(fanAngle(0, 0)).toBe(0);
    expect(fanAngle(1, 0)).toBeGreaterThan(fanAngle(0.5, 0));
    for (let t = 0; t < 100; t += 3.3) {
      expect(fanAngle(t, 1)).toBeGreaterThanOrEqual(0);
      expect(fanAngle(t, 1)).toBeLessThan(Math.PI * 2);
    }
  });
});
