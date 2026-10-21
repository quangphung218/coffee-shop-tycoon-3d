import { Color, DirectionalLight, HemisphereLight, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import { SUN_DISTANCE, createDayCycle, scaleLighting } from '../../src/render/scene/dayCycle';
import { LIGHT_BUDGET, lightingFor, totalLightOf, type SceneLighting } from '../../src/render/scene/renderer';
import { createLighting, lightingAt, type Lighting } from '../../src/render/street/layout';
import { DAY_END_MINUTE, DAY_START_MINUTE, createNewGame } from '../../src/sim/state';
import type { GameState, Weather } from '../../src/sim/types';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
const WEATHERS: readonly Weather[] = ['sunny', 'rainy', 'hot'];

function newState(minute: number, weather: Weather = 'sunny'): GameState {
  const state = createNewGame('Test', 'normal', 7);
  state.phase = 'opening';
  state.minute = minute;
  state.weather = weather;
  return state;
}

function newScene(): { scene: Scene; sun: DirectionalLight; hemi: HemisphereLight } {
  const scene = new Scene();
  scene.background = new Color(0xbfe6f5);
  const hemi = new HemisphereLight(0xffffff, 0x888888, 1.6);
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(8, 16, 10);
  scene.add(hemi, sun, sun.target);
  return { scene, sun, hemi };
}

/** How far apart two moments look: sun strength, fill, sun colour and sky colour. */
function difference(a: Lighting, b: Lighting): number {
  let d = Math.abs(a.sunScale - b.sunScale) + Math.abs(a.fillScale - b.fillScale);
  for (let c = 0; c < 3; c++) d += Math.abs(a.sun[c]! - b.sun[c]!) + Math.abs(a.sky[c]! - b.sky[c]!);
  return d;
}

describe('day cycle light', () => {
  it('keeps every minute of the opening day within LIGHT_BUDGET for every weather and quality', () => {
    const light = createLighting();
    const out: SceneLighting = { hemi: 0, sun: 0, env: 0 };
    let checked = 0;
    for (let m = DAY_START_MINUTE; m <= DAY_END_MINUTE; m += 15) {
      for (const w of WEATHERS) {
        lightingAt(m, w, light);
        for (const q of QUALITIES) {
          scaleLighting(lightingFor(q), light, out);
          expect(totalLightOf(out), `${m} ${w} ${q}`).toBeLessThanOrEqual(LIGHT_BUDGET + 1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBe(57 * 3 * 3);
  });

  it('keeps the sun above 20° all day', () => {
    const minY = Math.sin((20 * Math.PI) / 180);
    const light = createLighting();
    for (let m = DAY_START_MINUTE; m <= DAY_END_MINUTE; m += 15) {
      for (const w of WEATHERS) expect(lightingAt(m, w, light).sunDir[1], `${m} ${w}`).toBeGreaterThan(minY);
    }
  });

  it('tells morning, noon and dusk apart by colour or strength', () => {
    const morning = lightingAt(7 * 60, 'sunny');
    const noon = lightingAt(12 * 60, 'sunny');
    const dusk = lightingAt(19 * 60 + 30, 'sunny');
    expect(difference(morning, noon)).toBeGreaterThan(0.5);
    expect(difference(noon, dusk)).toBeGreaterThan(0.5);
    expect(difference(morning, dusk)).toBeGreaterThan(0.5);
    // Pale warm morning (blue below red), white noon, orange-to-blue dusk with a weaker sun.
    expect(morning.sun[2]).toBeLessThan(morning.sun[0]! - 0.2);
    expect(noon.sun).toEqual([1, 1, 1]);
    expect(dusk.sunScale).toBeLessThan(morning.sunScale);
    expect(dusk.sky[2]).toBeGreaterThan(dusk.sky[0]!);
  });

  it('leaves enough fill to see the shop at closing time', () => {
    for (const w of WEATHERS) expect(lightingAt(DAY_END_MINUTE, w).fillScale, w).toBeGreaterThanOrEqual(0.45);
  });

  it('matches the quality rig at a sunny noon', () => {
    for (const q of QUALITIES) {
      const out = scaleLighting(lightingFor(q), lightingAt(12 * 60, 'sunny'), { hemi: 0, sun: 0, env: 0 });
      expect(out).toEqual(lightingFor(q));
    }
  });
});

describe('createDayCycle', () => {
  it('scales the sun and hemisphere of the quality, tints the sky and aims the sun at the shop', () => {
    const { scene, sun, hemi } = newScene();
    const cycle = createDayCycle(scene, sun, 'medium');
    cycle.update(newState(12 * 60), 0, 2, -1);
    expect(sun.intensity).toBeCloseTo(lightingFor('medium').sun);
    expect(hemi.intensity).toBeCloseTo(lightingFor('medium').hemi);
    expect(scene.environmentIntensity).toBe(0);
    expect(sun.target.position.toArray()).toEqual([2, 0, -1]);
    expect(sun.position.distanceTo(sun.target.position)).toBeCloseTo(SUN_DISTANCE);
    const noonSky = (scene.background as Color).clone();

    cycle.update(newState(20 * 60), 0, 2, -1);
    expect(sun.intensity).toBeLessThan(lightingFor('medium').sun);
    expect(hemi.intensity).toBeLessThan(lightingFor('medium').hemi);
    expect((scene.background as Color).equals(noonSky)).toBe(false);
    // Evening sun stands west (-x) of the shop.
    expect(sun.position.x).toBeLessThan(2);

    cycle.setQuality('low');
    cycle.update(newState(12 * 60), 0, 0, 0);
    expect(sun.intensity).toBeCloseTo(lightingFor('low').sun);
    expect(hemi.intensity).toBeCloseTo(lightingFor('low').hemi);
  });

  it('writes into the same objects every frame', () => {
    const { scene, sun } = newScene();
    const cycle = createDayCycle(scene, sun, 'high');
    const light = cycle.light;
    const dir = light.sunDir;
    const color = light.sun;
    const background = scene.background;
    const position = sun.position;
    for (let m = DAY_START_MINUTE; m <= DAY_END_MINUTE; m += 30) {
      cycle.update(newState(m, 'rainy'), 0.5, 0, 0);
      expect(cycle.light).toBe(light);
      expect(cycle.light.sunDir).toBe(dir);
      expect(cycle.light.sun).toBe(color);
      expect(scene.background).toBe(background);
      expect(sun.position).toBe(position);
    }
    const out = createLighting();
    const sunDir = out.sunDir;
    expect(lightingAt(9 * 60, 'hot', out)).toBe(out);
    expect(out.sunDir).toBe(sunDir);
  });
});
