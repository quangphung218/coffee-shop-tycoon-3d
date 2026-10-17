import { type Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ShopView } from '../../src/render/scene/shop';
import { BOUNCE_SECONDS, MAX_BURSTS, SPARKLES, SPARKLES_LOW, UpgradeFx, bounceScale } from '../../src/render/scene/upgradeFx';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';

const FRAME = 1 / 60;

function rich(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 1_000_000_000;
  return s;
}

function buy(s: GameState, id: UpgradeId): void {
  expect(nextUpgradeCost(s, id)).not.toBeNull();
  expect(buyUpgrade(s, id).ok).toBe(true);
}

function setup(options: { quality?: 'low' | 'medium'; reduced?: () => boolean } = {}) {
  const scene = new Scene();
  const shop = new ShopView(scene);
  const fx = new UpgradeFx(scene, shop, { quality: options.quality, reducedMotion: options.reduced ?? (() => false) });
  const state = rich();
  let time = 10;
  const frame = (dt = FRAME): void => {
    time += dt;
    shop.update(state, time, dt, 0);
    fx.update(state, time);
  };
  /** Runs frames for `seconds`. */
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds; t += FRAME) frame();
  };
  return { scene, shop, fx, state, frame, run };
}

/** Sparkles currently drawn with any brightness. */
function lit(fx: UpgradeFx): number {
  const colors = fx.points.geometry.getAttribute('color');
  let n = 0;
  for (let i = 0; i < colors.count; i++) if (colors.getX(i) + colors.getY(i) + colors.getZ(i) > 0) n++;
  return n;
}

function espresso(shop: ShopView): Object3D {
  const object = shop.upgradeAnchor('better_machine')?.object;
  expect(object).toBeTruthy();
  return object!;
}

describe('bounceScale', () => {
  it('overshoots to 1.15, dips to 0.96 and settles at 1', () => {
    let peak = 0;
    let dip = 2;
    for (let t = 0; t <= BOUNCE_SECONDS; t += 0.005) {
      peak = Math.max(peak, bounceScale(t));
      dip = Math.min(dip, bounceScale(t));
    }
    expect(peak).toBeCloseTo(1.15, 2);
    expect(dip).toBeCloseTo(0.96, 2);
    expect(bounceScale(0)).toBe(1);
    expect(bounceScale(BOUNCE_SECONDS)).toBe(1);
  });
});

describe('UpgradeFx', () => {
  it('does not fire on the first update (a loaded save)', () => {
    const { fx, state, frame } = setup();
    buy(state, 'better_machine');
    buy(state, 'big_counter');
    frame();
    frame();
    expect(fx.stats().live).toBe(0);
    expect(fx.points.visible).toBe(false);
  });

  it('sparkles and bounces the machine on a purchase, then cleans up within 1 s', () => {
    const { fx, shop, state, frame, run } = setup();
    frame();
    const restY = espresso(shop).position.y;
    buy(state, 'better_machine');
    frame();
    run(0.15);
    const machine = espresso(shop);
    expect(fx.stats().live).toBe(1);
    expect(fx.points.visible).toBe(true);
    expect(lit(fx)).toBeGreaterThan(0);
    expect(lit(fx)).toBeLessThanOrEqual(SPARKLES);
    expect(machine.scale.x).toBeGreaterThan(1.05);
    run(0.85);
    expect(machine.scale.x).toBe(1);
    expect(machine.position.y).toBe(restY);
    expect(fx.stats()).toEqual({ live: 0, free: 1, created: 1 });
    expect(lit(fx)).toBe(0);
    expect(fx.points.visible).toBe(false);
  });

  it('only sparkles instanced pieces such as tables', () => {
    const { fx, state, frame, run } = setup();
    frame();
    buy(state, 'tables');
    frame();
    run(0.1);
    expect(fx.stats().live).toBe(1);
    expect(lit(fx)).toBeGreaterThan(0);
  });

  it('uses fewer sparkles on low quality', () => {
    const { fx, state, frame, run } = setup({ quality: 'low' });
    frame();
    buy(state, 'big_counter');
    frame();
    run(0.4);
    expect(lit(fx)).toBeGreaterThan(0);
    expect(lit(fx)).toBeLessThanOrEqual(SPARKLES_LOW);
  });

  it('does not fire when a level goes down', () => {
    const { fx, state, frame } = setup();
    buy(state, 'better_machine');
    frame();
    state.upgrades.better_machine = 0;
    frame();
    frame();
    expect(fx.stats().live).toBe(0);
    expect(lit(fx)).toBe(0);
  });

  it('does not fire with reduced motion', () => {
    const { fx, shop, state, frame } = setup({ reduced: () => true });
    frame();
    buy(state, 'better_machine');
    frame();
    frame();
    expect(fx.stats()).toEqual({ live: 0, free: 0, created: 0 });
    expect(espresso(shop).scale.x).toBe(1);
  });

  it('does not grow the pool over 10 purchases in a row', () => {
    const { fx, shop, state, frame, run } = setup();
    state.upgrades.better_machine = 1;
    state.upgrades.big_counter = 1;
    frame();
    const counter = shop.upgradeAnchor('big_counter')!.object!;
    const restY = counter.position.y;
    for (let i = 0; i < 10; i++) {
      // Each step goes down (no fire) and back up (fire), so every round fires twice.
      state.upgrades.better_machine = 1;
      state.upgrades.big_counter = 1;
      frame();
      state.upgrades.better_machine = 2;
      state.upgrades.big_counter = 2;
      frame();
      frame();
      expect(fx.stats().created).toBeLessThanOrEqual(MAX_BURSTS);
      expect(fx.stats().live).toBeLessThanOrEqual(MAX_BURSTS);
    }
    expect(fx.stats().live).toBe(MAX_BURSTS);
    run(1);
    expect(fx.stats()).toEqual({ live: 0, free: MAX_BURSTS, created: MAX_BURSTS });
    expect(espresso(shop).scale.x).toBe(1);
    expect(counter.scale.x).toBe(1);
    expect(counter.position.y).toBe(restY);
  });

  it('removes its points from the scene on dispose', () => {
    const { fx, scene } = setup();
    expect(scene.children).toContain(fx.points);
    fx.dispose();
    expect(scene.children).not.toContain(fx.points);
  });
});
