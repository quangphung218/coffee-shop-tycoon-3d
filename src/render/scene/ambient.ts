import { Object3D, PointLight, type Scene } from 'three';
import type { Quality } from '../../save/settings';
import type { GameState, Weather } from '../../sim/types';
import type { ShopLayout } from '../../sim/upgrades';
import { Steam, puffTexture } from '../actors/fx';
import { createLighting, lightingAt, type Lighting } from '../street/layout';
import { GLASS_MATERIAL, GLOW_MATERIAL, PALETTE } from './parts';
import type { ShopView } from './shop';

/**
 * Time-of-day warmth and small idle motion in the shop.
 *
 * Warm light: from late afternoon the window and door glass, the lamp bulbs
 * and the name sign glow warm, following the street lamps (lightingAt().lamps).
 * That is emissive / unlit colour only; high quality adds up to two warm
 * PointLights inside the shop. Lights are created per quality, never per
 * hour, so shaders do not recompile as the day goes by.
 *
 * Motion: ceiling fans turn, potted and door plants sway out of phase, the
 * awning valance flutters, and steam rises from the espresso machine while
 * an order brews. Low quality and prefers-reduced-motion keep everything
 * still. All of it moves existing objects; nothing is built per frame.
 */

export interface AmbientConfig {
  /** Fans, swaying plants, valance and machine steam. */
  motion: boolean;
  /** Warm PointLights inside the shop. */
  pointLights: number;
}

const AMBIENT: Readonly<Record<Quality, Readonly<AmbientConfig>>> = {
  low: { motion: false, pointLights: 0 },
  medium: { motion: true, pointLights: 0 },
  high: { motion: true, pointLights: 2 },
};

/** The same with prefers-reduced-motion: no motion, lights kept. */
const STILL: Readonly<Record<Quality, Readonly<AmbientConfig>>> = {
  low: { ...AMBIENT.low, motion: false },
  medium: { ...AMBIENT.medium, motion: false },
  high: { ...AMBIENT.high, motion: false },
};

/** Most PointLights any quality adds. */
export const MAX_POINT_LIGHTS = 2;

/** What a quality turns on (a shared object, so the frame loop allocates nothing). */
export function ambientFor(quality: Quality, reducedMotion = false): Readonly<AmbientConfig> {
  const table = reducedMotion ? STILL : AMBIENT;
  return table[quality] ?? table.medium;
}

/** 0 (day) .. 1 (night) warmth of the shop's lights at game `minute`; follows the street lamps. */
export function warmGlow(minute: number, weather: Weather, scratch: Lighting = createLighting()): number {
  return Math.min(1, Math.max(0, lightingAt(minute, weather, scratch).lamps));
}

/** Emissive intensity of the window and door glass at full glow. */
export const GLASS_GLOW = 0.85;
/** Bulb brightness by day, and what full glow adds (past 1 reads as lit). */
export const BULB_DAY = 0.8;
export const BULB_GLOW = 0.55;
/** Intensity of each warm PointLight at full glow (physical units, decay 2). */
export const POINT_INTENSITY = 6;
const POINT_COLOR = 0xffc27a;
const POINT_DISTANCE = 9;
const POINT_Y = 2.1;

export const FAN_SPEED = 2.4;
/** Sway of a plant (radians) and of the valance. */
export const SWAY_ANGLE = 0.045;
const SWAY_SPEED = 1.3;
export const FLUTTER_ANGLE = 0.09;

/** Steam rises from the top of the espresso machine (machineGeometry in shop.ts). */
const STEAM_Y = 1.62;
const STEAM_SCALE = 2;

/** Tilt (radians) of swaying thing number `index` at `time` seconds; a fixed phase per index keeps neighbours apart. */
export function swayAngle(time: number, index: number, amplitude = SWAY_ANGLE): number {
  const phase = index * 2.39;
  return amplitude * (Math.sin(time * SWAY_SPEED + phase) * 0.75 + Math.sin(time * SWAY_SPEED * 2.1 + phase * 1.7) * 0.25);
}

/** Angle (radians, wrapped to one turn) of fan `index` at `time` seconds. */
export function fanAngle(time: number, index: number): number {
  const a = time * FAN_SPEED + index * 0.8;
  return a % (Math.PI * 2);
}

/** Whether an order is being made at a machine right now. */
export function isBrewing(state: GameState): boolean {
  for (let i = 0; i < state.orders.length; i++) if (state.orders[i]!.status === 'brewing') return true;
  return false;
}

export interface AmbientOptions {
  quality?: Quality;
  /** Asks whether the player wants less motion; defaults to the prefers-reduced-motion media query. */
  reducedMotion?: () => boolean;
}

export interface AmbientStats {
  glow: number;
  pointLights: number;
  motion: boolean;
  steam: boolean;
}

function mediaReducedMotion(): () => boolean {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  return () => query?.matches ?? false;
}

export class AmbientView {
  private quality: Quality;
  private readonly reducedMotion: () => boolean;
  private config: Readonly<AmbientConfig>;
  private readonly lights: PointLight[] = [];
  private readonly light = createLighting();
  private readonly dummy = new Object3D();
  private readonly steam: Steam;
  private layout: ShopLayout | null = null;
  private glow = 0;
  private time = 0;
  /** Everything is at rest (after motion was turned off), so the still pose need not be rewritten. */
  private resting = true;

  private readonly scene: Scene;
  private readonly shop: ShopView;

  constructor(scene: Scene, shop: ShopView, options: AmbientOptions = {}) {
    this.scene = scene;
    this.shop = shop;
    this.quality = options.quality ?? 'medium';
    this.reducedMotion = options.reducedMotion ?? mediaReducedMotion();
    this.config = ambientFor(this.quality, this.reducedMotion());
    this.steam = new Steam(puffTexture());
    // Named so scripts/capture-p20.mjs can tell when an order is brewing.
    this.steam.group.name = 'machine-steam';
    this.steam.group.scale.setScalar(STEAM_SCALE);
    this.shop.root.add(this.steam.group);
    this.syncLights();
  }

  /** Lights and moves the shop for this frame. `alpha` is the tick fraction, `dt` real seconds since the last frame. */
  update(state: GameState, alpha: number, dt: number): void {
    if (!state.paused && Number.isFinite(dt) && dt > 0) this.time += dt;
    // Keep the clock small for float precision; every motion here repeats well within this.
    if (this.time > 36000) this.time -= 36000;

    const layout = this.shop.current;
    if (layout !== this.layout) {
      this.layout = layout;
      this.placeFixtures();
      this.resting = false;
    }

    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
    this.glow = warmGlow(state.minute + a, state.weather, this.light);
    this.applyGlow();

    this.config = ambientFor(this.quality, this.reducedMotion());
    if (this.config.motion) this.animate(isBrewing(state));
    else if (!this.resting) this.rest();
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.config = ambientFor(quality, this.reducedMotion());
    this.syncLights();
    // A new quality rebuilds the facade, so its fans and plants start from rest.
    this.resting = false;
  }

  stats(): AmbientStats {
    return { glow: this.glow, pointLights: this.lights.length, motion: this.config.motion, steam: this.steam.active };
  }

  dispose(): void {
    for (const l of this.lights) {
      l.removeFromParent();
      l.dispose();
    }
    this.lights.length = 0;
    this.steam.group.removeFromParent();
    this.steam.dispose();
  }

  /** Adds or removes PointLights to match the quality (only on a quality change). */
  private syncLights(): void {
    const want = Math.min(MAX_POINT_LIGHTS, this.config.pointLights);
    while (this.lights.length > want) {
      const l = this.lights.pop()!;
      l.removeFromParent();
      l.dispose();
    }
    while (this.lights.length < want) {
      const l = new PointLight(POINT_COLOR, 0, POINT_DISTANCE, 2);
      l.castShadow = false;
      this.lights.push(l);
      this.scene.add(l);
    }
    this.placeFixtures();
  }

  /** Puts the PointLights over the counter and the seating, and the steam over the espresso machine. */
  private placeFixtures(): void {
    const layout = this.layout;
    if (!layout) return;
    const fans = this.shop.facade.current?.fans;
    const seating = fans && fans.length > 0 ? fans[fans.length - 1]! : layout.counter.pos;
    for (let i = 0; i < this.lights.length; i++) {
      const p = i === 0 ? layout.counter.pos : seating;
      this.lights[i]!.position.set(p.x, POINT_Y, p.z);
    }
    const machine = layout.machines[0];
    if (machine) this.steam.group.position.set(machine.pos.x - 0.2, STEAM_Y, machine.pos.z + 0.05);
  }

  private applyGlow(): void {
    const g = this.glow;
    GLASS_MATERIAL.emissiveIntensity = g * GLASS_GLOW;
    GLOW_MATERIAL.color.setHex(PALETTE.bulb).multiplyScalar(BULB_DAY + BULB_GLOW * g);
    this.shop.facade.setSignGlow(g);
    for (let i = 0; i < this.lights.length; i++) this.lights[i]!.intensity = g * POINT_INTENSITY;
  }

  private animate(brewing: boolean): void {
    this.pose(this.time, 1);
    this.steam.update(brewing, this.time);
    this.resting = false;
  }

  /** Puts fans, plants and the valance back to their still pose and hides the steam. */
  private rest(): void {
    this.pose(0, 0);
    this.steam.update(false, 0);
    this.resting = true;
  }

  private pose(t: number, amount: number): void {
    const facade = this.shop.facade;
    const fans = facade.fans;
    for (let i = 0; i < fans.length; i++) fans[i]!.rotation.y = amount * fanAngle(t, i);
    const foliage = facade.foliage;
    for (let i = 0; i < foliage.length; i++) {
      foliage[i]!.rotation.set(amount * swayAngle(t, i), 0, amount * swayAngle(t, i + 7));
    }
    if (facade.valance) facade.valance.rotation.x = amount * swayAngle(t * 1.8, 3, FLUTTER_ANGLE);
    this.swayPlants(t, amount);
  }

  /** Tilts each potted plant instance about its base, in the order ShopView placed them. */
  private swayPlants(t: number, amount: number): void {
    const plants = this.shop.plants;
    const layout = this.layout;
    if (!layout || plants.count === 0) return;
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < layout.decor.length && n < plants.count; i++) {
      const item = layout.decor[i]!;
      if (item.kind !== 'plant') continue;
      d.position.set(item.pos.x, 0, item.pos.z);
      d.rotation.set(amount * swayAngle(t, n + 2), 0, amount * swayAngle(t, n + 11));
      d.updateMatrix();
      plants.setMatrixAt(n++, d.matrix);
    }
    plants.instanceMatrix.needsUpdate = true;
  }
}
