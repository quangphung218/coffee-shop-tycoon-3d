import { AdditiveBlending, Matrix4, Mesh, MeshBasicMaterial, PointLight, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import {
  AmbientView,
  GLASS_GLOW,
  LIGHTS_ON_LAMPS,
  LIGHTS_ON_RAMP,
  MAX_POINT_LIGHTS,
  POINT_INTENSITY,
  POOL_OPACITY,
  RAIN_DAY_GLOW,
  RAIN_LEAD,
  ambientFor,
  fanAngle,
  isBrewing,
  shopLightsOn,
  swayAngle,
  warmGlow,
} from '../../src/render/scene/ambient';
import { lightingAt } from '../../src/render/street/layout';
import { environmentEnabled } from '../../src/render/scene/environment';
import { GLASS_MATERIAL } from '../../src/render/scene/parts';
import { fillOf, LIGHT_BUDGET, lightingFor, P19_LIGHTING, totalLightOf } from '../../src/render/scene/renderer';
import { ShopView } from '../../src/render/scene/shop';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameState, UpgradeId, Weather } from '../../src/sim/types';
import { ensureRetention } from '../../src/sim/retention';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

function game(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 100_000_000;
  ensureRetention(s).tickets = 1000;
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

function lightPools(scene: Scene): Mesh[] {
  const out: Mesh[] = [];
  scene.traverse((o) => {
    if (o instanceof Mesh && o.name === 'light-pool') out.push(o);
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

/** First game minute (to the minute) the shop's lights are on, from noon. */
function switchMinute(weather: Weather): number {
  for (let m = 12 * 60; m <= 21 * 60; m++) if (shopLightsOn(m, weather)) return m;
  return Infinity;
}

describe('shop lights by time of day', () => {
  it('switches on at dusk, when the street lamps pass the threshold, around 17:45 on a clear day', () => {
    const on = switchMinute('sunny');
    expect(on).toBeGreaterThanOrEqual(17 * 60 + 35);
    expect(on).toBeLessThanOrEqual(17 * 60 + 55);
    expect(lightingAt(on, 'sunny').lamps).toBeGreaterThanOrEqual(LIGHTS_ON_LAMPS);
    expect(lightingAt(on - 1, 'sunny').lamps).toBeLessThan(LIGHTS_ON_LAMPS);
    expect(switchMinute('hot')).toBe(on);
  });

  it('switches on earlier when it rains', () => {
    const sunny = switchMinute('sunny');
    const rainy = switchMinute('rainy');
    expect(rainy).toBeLessThan(sunny);
    expect(rainy).toBeGreaterThanOrEqual(sunny - RAIN_LEAD - 1);
    expect(warmGlow(rainy + LIGHTS_ON_RAMP, 'rainy')).toBe(1);
    expect(warmGlow(rainy + LIGHTS_ON_RAMP, 'sunny')).toBeLessThan(1);
  });

  it('is off at noon, stays off through the morning and is fully on by 19:30', () => {
    expect(warmGlow(12 * 60, 'sunny')).toBeCloseTo(0, 6);
    for (let m = 7 * 60; m <= 17 * 60; m += 15) expect(warmGlow(m, 'sunny')).toBe(0);
    expect(warmGlow(19 * 60 + 30, 'sunny')).toBe(1);
    expect(warmGlow(21 * 60, 'sunny')).toBe(1);
    expect(warmGlow(Number.NaN, 'sunny')).toBe(0);
  });

  it('comes up over about 20 game minutes after switching on, not in one frame', () => {
    const on = switchMinute('sunny');
    const half = warmGlow(on + LIGHTS_ON_RAMP / 2, 'sunny');
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    // One frame at 1x is well under a game minute; the step stays small.
    expect(warmGlow(on + 0.5, 'sunny')).toBeLessThan(0.05);
    expect(warmGlow(on + LIGHTS_ON_RAMP, 'sunny')).toBe(1);
  });

  it('never dims from 16:00 to 21:00, in any weather, and stays in 0..1', () => {
    for (const w of ['sunny', 'rainy', 'hot'] as const) {
      let prev = warmGlow(16 * 60, w);
      for (let m = 16 * 60; m <= 21 * 60; m += 0.5) {
        const g = warmGlow(m, w);
        expect(g).toBeGreaterThanOrEqual(prev);
        prev = g;
      }
      for (let m = 0; m <= 24 * 60; m += 15) {
        const g = warmGlow(m, w);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps a dim glow on a rainy day before the lights go on', () => {
    expect(warmGlow(12 * 60, 'rainy')).toBe(RAIN_DAY_GLOW);
    expect(warmGlow(12 * 60, 'hot')).toBe(0);
  });

  it('keeps the same point lights and pools all day', () => {
    const { scene, ambient, state } = setup('high');
    const lights = pointLights(scene);
    const pools = lightPools(scene);
    expect(lights).toHaveLength(2);
    expect(pools.length).toBeGreaterThan(0);
    for (let m = 7 * 60; m <= 21 * 60; m += 10) {
      state.minute = m;
      ambient.update(state, 0, 0.016);
      const now = pointLights(scene);
      expect(now).toHaveLength(lights.length);
      for (let i = 0; i < now.length; i++) expect(now[i]).toBe(lights[i]);
      expect(lightPools(scene)).toEqual(pools);
    }
    ambient.dispose();
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
    for (const p of lightPools(scene)) {
      expect(p.visible).toBe(true);
      expect((p.material as MeshBasicMaterial).opacity).toBeCloseTo(glow * POOL_OPACITY);
    }
    ambient.dispose();
  });

  it('keeps the floor pools visible at noon (so compileAsync warms them) and turns them off through opacity', () => {
    for (const q of ['medium', 'high'] as const) {
      const { scene, ambient, state } = setup(q);
      state.minute = 12 * 60;
      ambient.update(state, 0, 0.016);
      const pools = lightPools(scene);
      expect(pools.length, q).toBeGreaterThan(0);
      // compileAsync in three 0.180 walks traverseVisible, so a hidden pool would miss the warm-up.
      const shown: Mesh[] = [];
      scene.traverseVisible((o) => {
        if (o instanceof Mesh && o.name === 'light-pool') shown.push(o);
      });
      expect(shown, q).toEqual(pools);
      for (const p of pools) expect((p.material as MeshBasicMaterial).opacity, q).toBe(0);
      ambient.dispose();
    }
  });

  it('shows the floor pools warm and additive at night', () => {
    const { scene, ambient, state } = setup('medium');
    const pools = lightPools(scene);
    expect(pools.length).toBeGreaterThan(0);
    state.minute = 20 * 60;
    ambient.update(state, 0, 0.016);
    for (const p of pools) {
      const m = p.material as MeshBasicMaterial;
      expect(p.visible).toBe(true);
      expect(m.blending).toBe(AdditiveBlending);
      expect(m.depthWrite).toBe(false);
      expect(m.opacity).toBeCloseTo(POOL_OPACITY);
      expect(p.position.y).toBeGreaterThan(0);
      expect(p.position.y).toBeLessThan(0.1);
    }
    ambient.dispose();
    expect(lightPools(scene)).toHaveLength(0);
  });
});

describe('ambient by quality', () => {
  it('turns motion and point lights on per quality', () => {
    expect(ambientFor('low')).toEqual({ motion: false, pointLights: 0, pools: false });
    expect(ambientFor('medium')).toEqual({ motion: true, pointLights: 0, pools: true });
    expect(ambientFor('high')).toEqual({ motion: true, pointLights: 2, pools: true });
    for (const q of QUALITIES) {
      expect(ambientFor(q, true).motion).toBe(false);
      expect(ambientFor(q, true).pointLights).toBe(ambientFor(q).pointLights);
      expect(ambientFor(q, true).pools).toBe(ambientFor(q).pools);
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
    expect(lightPools(scene)).toHaveLength(0);
    expect(ambient.stats()).toMatchObject({ motion: false, pointLights: 0, pools: 0, steam: false });
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
    expect(lightPools(scene)).toHaveLength(2);
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

  it('adds and drops the point lights and pools when the quality changes, and stats follow', () => {
    const { scene, shop, ambient, state } = setup('high');
    state.minute = 20 * 60;
    const expected: Record<Quality, { pointLights: number; pools: number }> = {
      low: { pointLights: 0, pools: 0 },
      medium: { pointLights: 0, pools: 2 },
      high: { pointLights: 2, pools: 2 },
    };
    for (const q of ['low', 'high', 'medium', 'low', 'medium', 'high'] as const) {
      shop.setQuality(q);
      ambient.setQuality(q);
      ambient.update(state, 0, 0.016);
      expect(pointLights(scene)).toHaveLength(expected[q].pointLights);
      expect(lightPools(scene)).toHaveLength(expected[q].pools);
      const stats = ambient.stats();
      expect(stats).toMatchObject(expected[q]);
      // Stats stay put frame to frame at a fixed quality and time.
      ambient.update(state, 0, 0.016);
      expect(ambient.stats()).toEqual(stats);
      for (const p of lightPools(scene)) expect(p.visible).toBe(true);
    }
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
