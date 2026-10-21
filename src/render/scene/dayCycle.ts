import { Color, type DirectionalLight, HemisphereLight, SRGBColorSpace, type Scene } from 'three';
import type { Quality } from '../../save/settings';
import type { GameState } from '../../sim/types';
import { createLighting, lightingAt, type Lighting } from '../street/layout';
import { lightingFor, type SceneLighting } from './renderer';

/** How far the sun sits from its target, as the old fixed (8, 16, 10); inside the shadow camera's near..far. */
export const SUN_DISTANCE = 20;

/**
 * Scales the quality's rig `base` by the clock's light: the sun by sunScale,
 * the hemisphere and environment map by fillScale. Writes into `out`.
 */
export function scaleLighting(base: Readonly<SceneLighting>, light: Readonly<Lighting>, out: SceneLighting): SceneLighting {
  out.sun = base.sun * light.sunScale;
  out.hemi = base.hemi * light.fillScale;
  out.env = base.env * light.fillScale;
  return out;
}

export interface DayCycle {
  /** Sets the sun, fill and sky for the game clock; `targetX`/`targetZ` is the shop's centre the sun aims at. */
  update(state: GameState, alpha: number, targetX: number, targetZ: number): void;
  setQuality(quality: Quality): void;
  /** The light of the last update (tests, debugging); the same object every frame. */
  readonly light: Readonly<Lighting>;
}

/**
 * Time-of-day light on top of the quality's rig (renderer.ts LIGHTING): the
 * clock only scales it down from noon, so no hour exceeds LIGHT_BUDGET. The
 * sun moves along its arc around the shop; the shadow camera is left as set.
 */
export function createDayCycle(scene: Scene, sun: DirectionalLight, quality: Quality): DayCycle {
  const hemi = scene.children.find((o): o is HemisphereLight => o instanceof HemisphereLight) ?? null;
  const light = createLighting();
  const scaled: SceneLighting = { hemi: 0, sun: 0, env: 0 };
  let base = lightingFor(quality);

  return {
    light,
    update(state, alpha, targetX, targetZ): void {
      const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
      lightingAt(state.minute + a, state.weather, light);
      scaleLighting(base, light, scaled);
      sun.intensity = scaled.sun;
      sun.color.setRGB(light.sun[0], light.sun[1], light.sun[2], SRGBColorSpace);
      if (hemi) hemi.intensity = scaled.hemi;
      scene.environmentIntensity = scene.environment ? scaled.env : 0;
      if (scene.background instanceof Color) scene.background.setRGB(light.sky[0], light.sky[1], light.sky[2], SRGBColorSpace);
      const d = light.sunDir;
      sun.target.position.set(targetX, 0, targetZ);
      sun.position.set(targetX + d[0] * SUN_DISTANCE, d[1] * SUN_DISTANCE, targetZ + d[2] * SUN_DISTANCE);
    },
    setQuality(q): void {
      base = lightingFor(q);
    },
  };
}
