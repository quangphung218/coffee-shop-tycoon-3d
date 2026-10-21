import {
  Color,
  DirectionalLight,
  HemisphereLight,
  type Material,
  type Object3D,
  PointLight,
  Scene,
  type LineSegments,
  Sprite,
  Texture,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Quality } from '../../src/save/settings';
import { createActors } from '../../src/render/actors';
import { COIN_BURST, COIN_SECONDS, CoinFx } from '../../src/render/actors/fx';
import { AmbientView } from '../../src/render/scene/ambient';
import { createDayCycle } from '../../src/render/scene/dayCycle';
import { LIGHT_BUDGET, totalLightOf } from '../../src/render/scene/renderer';
import { ShopView } from '../../src/render/scene/shop';
import { createStreet } from '../../src/render/street';
import { densityFor } from '../../src/render/street/layout';
import { DAY_END_MINUTE, DAY_START_MINUTE, createNewGame } from '../../src/sim/state';
import type { GameState, Weather } from '../../src/sim/types';

/**
 * P29 invariants across modules: the clock never pushes the rig past
 * LIGHT_BUDGET, the day builds no lights or materials, reduced motion keeps
 * the juice still but the rain on screen, and a paused game freezes rain and coins.
 */

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
const WEATHERS: readonly Weather[] = ['sunny', 'rainy', 'hot'];

function newState(weather: Weather = 'sunny'): GameState {
  const state = createNewGame('Quán P29', 'normal', 29);
  state.phase = 'opening';
  state.minute = DAY_START_MINUTE;
  state.weather = weather;
  return state;
}

/** A scene with the renderer's sky, hemisphere and sun; `withEnv` stands in an environment map so its share counts. */
function lightRig(withEnv: boolean): { scene: Scene; sun: DirectionalLight; hemi: HemisphereLight } {
  const scene = new Scene();
  scene.background = new Color(0xbfe6f5);
  if (withEnv) scene.environment = new Texture();
  const hemi = new HemisphereLight(0xffffff, 0x888888, 1.6);
  const sun = new DirectionalLight(0xffffff, 1.8);
  scene.add(hemi, sun, sun.target);
  return { scene, sun, hemi };
}

function pointLightCount(scene: Scene): number {
  let n = 0;
  scene.traverse((o) => {
    if (o instanceof PointLight) n++;
  });
  return n;
}

function materials(scene: Scene): Set<Material> {
  const out = new Set<Material>();
  scene.traverse((o: Object3D) => {
    const m = (o as Object3D & { material?: Material | Material[] }).material;
    if (Array.isArray(m)) for (const x of m) out.add(x);
    else if (m) out.add(m);
  });
  return out;
}

/** Visible sprites of each live coin popup (coin, chip and small coins). */
function coinSprites(scene: Scene): number[] {
  const coins = scene.getObjectByName('coins')!;
  return coins.children
    .filter((g) => g.visible)
    .map((g) => g.children.filter((c) => c instanceof Sprite && c.visible).length);
}

function rainPositions(scene: Scene): number[] {
  const streaks = scene.getObjectByName('rain-streaks') as LineSegments;
  return Array.from(streaks.geometry.getAttribute('position').array as Float32Array);
}

/** Drives performance.now(), which the actors read for coin time. */
function fakeClock(start = 1000): { set(seconds: number): void } {
  let ms = start * 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => ms);
  return {
    set(seconds: number): void {
      ms = seconds * 1000;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P29 light budget', () => {
  it('keeps sun + fill after the day cycle within LIGHT_BUDGET at every minute, weather and quality', () => {
    let checked = 0;
    let worst = { total: -Infinity, at: '' };
    for (const withEnv of [false, true]) {
      for (const q of QUALITIES) {
        const { scene, sun, hemi } = lightRig(withEnv);
        const cycle = createDayCycle(scene, sun, q);
        for (const w of WEATHERS) {
          const state = newState(w);
          for (let m = DAY_START_MINUTE; m <= DAY_END_MINUTE; m++) {
            state.minute = m;
            cycle.update(state, 0.5, 0, 0);
            const total = totalLightOf({ hemi: hemi.intensity, sun: sun.intensity, env: scene.environmentIntensity });
            expect(Number.isFinite(total)).toBe(true);
            if (total > worst.total) worst = { total, at: `${m} ${w} ${q} env=${withEnv}` };
            checked++;
          }
        }
      }
    }
    expect(worst.total, worst.at).toBeLessThanOrEqual(LIGHT_BUDGET + 1e-9);
    // Noon on a clear day spends the whole rig, so the check above is not trivially loose.
    expect(worst.total).toBeGreaterThan(LIGHT_BUDGET - 0.05);
    expect(checked).toBe(2 * 3 * 3 * (DAY_END_MINUTE - DAY_START_MINUTE + 1));
  });
});

describe('P29 scene stays built once over the day', () => {
  for (const q of QUALITIES) {
    it(`adds no PointLight or material from 07:00 to 21:00 at ${q} quality`, () => {
      const { scene, sun } = lightRig(q !== 'low');
      const shop = new ShopView(scene, q);
      const state = newState('sunny');
      shop.update(state, 0, 0, 0);
      const ambient = new AmbientView(scene, shop, { quality: q, reducedMotion: () => false });
      const street = createStreet(scene, { quality: q });
      const actors = createActors(scene, { quality: q });
      const cycle = createDayCycle(scene, sun, q);
      const frame = (): void => {
        shop.update(state, 0, 1 / 60, 0);
        ambient.update(state, 0, 1 / 60);
        street.update(state, 0, 1 / 60);
        actors.update(state, 0);
        cycle.update(state, 0, 0, 0);
      };
      frame();
      const lights = pointLightCount(scene);
      const mats = materials(scene);
      const lampsAtDusk = ambient.stats().pointLights;

      for (const w of ['sunny', 'rainy'] as const) {
        state.weather = w;
        for (let m = DAY_START_MINUTE; m <= DAY_END_MINUTE; m++) {
          state.minute = m;
          frame();
        }
        expect(pointLightCount(scene), w).toBe(lights);
        expect(ambient.stats().pointLights, w).toBe(lampsAtDusk);
        const now = materials(scene);
        expect(now.size, w).toBe(mats.size);
        for (const mat of now) expect(mats.has(mat), `${w} new ${mat.type}`).toBe(true);
      }
      // The shop lights are on by closing time, so the run went through dusk.
      expect(ambient.stats().glow).toBeGreaterThan(0.9);

      actors.dispose();
      street.dispose();
      ambient.dispose();
    });
  }
});

describe('P29 reduced motion', () => {
  it('keeps the coin whole: no small coins at the burst, at any quality', () => {
    const clock = fakeClock(100);
    for (const q of QUALITIES) {
      const scene = new Scene();
      const actors = createActors(scene, { quality: q, reducedMotion: true });
      expect(actors.calm()).toBe(true);
      const state = newState();
      state.events.push({ type: 'cash', amount: 35000, pos: { x: 0, z: 0 } });
      clock.set(100);
      actors.update(state, 0);
      state.events.length = 0;
      for (const age of [0.1, COIN_BURST * COIN_SECONDS + 0.02, COIN_SECONDS * 0.95]) {
        clock.set(100 + age);
        actors.update(state, 0);
        expect(coinSprites(scene), `${q} ${age}`).toEqual([2]);
      }
      actors.dispose();
    }
    // Same burst moment with motion on and high quality throws small coins, so the check above can fail.
    const scene = new Scene();
    const actors = createActors(scene, { quality: 'high', reducedMotion: false });
    const state = newState();
    state.events.push({ type: 'cash', amount: 35000, pos: { x: 0, z: 0 } });
    clock.set(200);
    actors.update(state, 0);
    state.events.length = 0;
    clock.set(200 + COIN_BURST * COIN_SECONDS + 0.02);
    actors.update(state, 0);
    expect(coinSprites(scene)[0]).toBeGreaterThan(2);
    actors.dispose();

    const fx = new CoinFx(null);
    fx.setQuality('high');
    fx.spawn(1000, { x: 0, z: 0 }, 0);
    fx.update(COIN_BURST * COIN_SECONDS + 0.02, true);
    expect(fx.peek(0)!.debris).toBe(0);
    fx.dispose();
  });

  it('turns the machine steam and the cup steam off', () => {
    for (const q of ['medium', 'high'] as const) {
      const scene = new Scene();
      const shop = new ShopView(scene, q);
      const state = newState();
      shop.update(state, 0, 0, 0);
      const itemId = 'cappuccino';
      const customerId = state.nextId++;
      state.customers.push({
        id: customerId,
        state: 'waiting',
        pos: { x: 0, z: -1 },
        target: { x: 0, z: -1 },
        patience: 30,
        maxPatience: 40,
        order: itemId,
        tableId: null,
        timer: 0,
        look: 1,
      });
      const orderId = state.nextId++;
      state.orders.push({ id: orderId, customerId, itemId, status: 'brewing', remaining: 5, staffId: null });

      let reduced = false;
      const ambient = new AmbientView(scene, shop, { quality: q, reducedMotion: () => reduced });
      ambient.update(state, 0, 0.1);
      expect(ambient.stats().steam, `${q} motion on`).toBe(true);
      reduced = true;
      ambient.update(state, 0, 0.1);
      expect(ambient.stats().steam, q).toBe(false);
      expect(scene.getObjectByName('machine-steam')!.visible, q).toBe(false);
      ambient.dispose();

      state.orders[0]!.status = 'ready';
      state.playerTasks = [{ kind: 'serve', targetId: orderId, remaining: 1 }];
      const actors = createActors(new Scene(), { quality: q, reducedMotion: true });
      actors.update(state, 0);
      expect(actors.inspect('player')!.steam, q).toBe(false);
      actors.dispose();
    }
  });

  it('hands the street the world reduced-motion switch (setting or OS query)', async () => {
    // createWorld needs WebGL and a DOM, so stub the renderer and stop at the street.
    const got: Array<(() => boolean) | undefined> = [];
    const stop = new Error('stop after createStreet');
    vi.resetModules();
    vi.doMock('../../src/render/scene/renderer', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../src/render/scene/renderer')>()),
      createRenderer: () => ({ scene: new Scene(), sun: new DirectionalLight() }),
    }));
    vi.doMock('../../src/render/street', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../src/render/street')>()),
      createStreet: (_scene: Scene, options: { reducedMotion?: () => boolean }) => {
        got.push(options.reducedMotion);
        throw stop;
      },
    }));
    let osReduce = false;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return osReduce;
      },
    }));
    try {
      const { createWorld } = await import('../../src/render/scene');
      const canvas = {} as HTMLCanvasElement;
      expect(() => createWorld(canvas, { quality: 'high', reducedMotion: true })).toThrow(stop);
      expect(() => createWorld(canvas, { quality: 'high', reducedMotion: false })).toThrow(stop);
      expect(got).toHaveLength(2);
      const [forced, fromOs] = got;
      expect(forced?.()).toBe(true);
      expect(fromOs?.()).toBe(false);
      // Read live, so the OS setting flipping at runtime reaches the rain.
      osReduce = true;
      expect(fromOs?.()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock('../../src/render/scene/renderer');
      vi.doUnmock('../../src/render/street');
      vi.resetModules();
    }
  });

  it('drops the splashes to 0 but keeps the rain falling', () => {
    for (const q of QUALITIES) {
      const scene = new Scene();
      const street = createStreet(scene, { quality: q, reducedMotion: () => true });
      const state = newState('rainy');
      street.update(state, 0, 0.5);
      const stats = street.stats();
      expect(stats.rainSplashes, q).toBe(0);
      expect(stats.rainDrops, q).toBeGreaterThan(0);
      expect(stats.rainDrops, q).toBeLessThanOrEqual(densityFor(q).rainDrops);
      expect(scene.getObjectByName('rain-streaks')!.visible, q).toBe(true);
      expect(scene.getObjectByName('rain-splashes')!.visible, q).toBe(false);
      street.dispose();
    }
  });
});

describe('P29 pause', () => {
  it('holds every rain streak in place between two updates while paused', () => {
    const scene = new Scene();
    const street = createStreet(scene, { quality: 'high' });
    const state = newState('rainy');
    street.update(state, 0, 0.7);
    state.paused = true;
    const before = rainPositions(scene);
    const splashesBefore = street.stats().rainSplashes;
    street.update(state, 0, 0.25);
    street.update(state, 0.5, 1);
    expect(rainPositions(scene)).toEqual(before);
    expect(street.stats().rainSplashes).toBe(splashesBefore);
    street.dispose();
  });

  it('holds a flying coin in place between two updates while paused', () => {
    const clock = fakeClock(300);
    const scene = new Scene();
    const actors = createActors(scene, { quality: 'high', reducedMotion: false });
    const state = newState();
    state.events.push({ type: 'cash', amount: 35000, pos: { x: 0, z: 0 } });
    actors.update(state, 0);
    state.events.length = 0;
    clock.set(300.2);
    actors.update(state, 0);
    state.paused = true;
    const coins = scene.getObjectByName('coins')!;
    const snapshot = (): number[] => {
      coins.updateMatrixWorld(true);
      const out: number[] = [];
      coins.traverse((o) => {
        if (o.visible) out.push(...o.matrixWorld.elements);
      });
      return out;
    };
    const before = snapshot();
    clock.set(300.5);
    actors.update(state, 0);
    expect(snapshot()).toEqual(before);
    expect(actors.stats().coins).toBe(1);
    // Resumes from where it stopped once the game runs again.
    state.paused = false;
    clock.set(300.7);
    actors.update(state, 0);
    expect(snapshot()).not.toEqual(before);
    expect(actors.stats().coins).toBe(1);
    actors.dispose();
  });
});
