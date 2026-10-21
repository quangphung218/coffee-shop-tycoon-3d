import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  type Scene,
  type Texture,
} from 'three';
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
 * Warm light: the shop switches its lights on at dusk, once the street lamps
 * (lightingAt().lamps) pass a threshold, and they come up to full over
 * LIGHTS_ON_RAMP game minutes. The window and door glass, the lamp bulbs and
 * the name sign follow that glow as emissive / unlit colour; medium and high
 * quality add warm additive pools on the floor under the lamps, and high
 * quality up to two warm PointLights inside the shop. Lights and pools are
 * created per quality and layout, never per hour, so shaders do not
 * recompile as the day goes by; the clock only changes intensity and opacity.
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
  /** Warm light pools on the floor under the lamps. */
  pools: boolean;
}

const AMBIENT: Readonly<Record<Quality, Readonly<AmbientConfig>>> = {
  low: { motion: false, pointLights: 0, pools: false },
  medium: { motion: true, pointLights: 0, pools: true },
  high: { motion: true, pointLights: 2, pools: true },
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

/** The shop's lights go on once the street lamps pass this (about 17:45 on a clear day). */
export const LIGHTS_ON_LAMPS = 0.44;
/** Rain darkens the afternoon: the lights go on as if it were this many minutes later. */
export const RAIN_LEAD = 45;
/** Game minutes from switching on to full glow. */
export const LIGHTS_ON_RAMP = 20;
/** Lights stay off before this; the shop opens at 07:00 in daylight. */
const LIGHTS_EARLIEST = 12 * 60;
/** Dim glow a rainy day keeps before the lights go on. */
export const RAIN_DAY_GLOW = 0.4;

/** Whether the shop's lights are on at game `minute`: from dusk, when the street lamps pass LIGHTS_ON_LAMPS. */
export function shopLightsOn(minute: number, weather: Weather, scratch: Lighting = createLighting()): boolean {
  if (!Number.isFinite(minute) || minute < LIGHTS_EARLIEST) return false;
  const lead = weather === 'rainy' ? RAIN_LEAD : 0;
  return lightingAt(minute + lead, weather, scratch).lamps >= LIGHTS_ON_LAMPS;
}

/** Minute the lights go on, per weather (Infinity if never); the curve is fixed, so it is found once. */
const switchOn: Partial<Record<Weather, number>> = {};

function lightsOnAt(weather: Weather, scratch: Lighting): number {
  const cached = switchOn[weather];
  if (cached !== undefined) return cached;
  let lo = LIGHTS_EARLIEST;
  let hi = 21 * 60;
  let on = Infinity;
  if (shopLightsOn(lo, weather, scratch)) on = lo;
  else if (shopLightsOn(hi, weather, scratch)) {
    // The lamps only rise through the afternoon, so halve down to the switch.
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (shopLightsOn(mid, weather, scratch)) hi = mid;
      else lo = mid;
    }
    on = hi;
  }
  switchOn[weather] = on;
  return on;
}

/** 0 (day) .. 1 (night) warmth of the shop's lights at game `minute`: off by day, up to 1 over LIGHTS_ON_RAMP once switched on. */
export function warmGlow(minute: number, weather: Weather, scratch: Lighting = createLighting()): number {
  const m = Number.isFinite(minute) ? minute : 12 * 60;
  const t = Math.min(1, Math.max(0, (m - lightsOnAt(weather, scratch)) / LIGHTS_ON_RAMP));
  const ramp = t * t * (3 - 2 * t);
  return weather === 'rainy' ? Math.max(RAIN_DAY_GLOW, ramp) : ramp;
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
/** Opacity of a floor light pool at full glow, and its size: the counter's under the pendants, a round one in the seating. */
export const POOL_OPACITY = 0.38;
const POOL_COLOR = 0xffc988;
const POOL_Y = 0.015;
const POOL_COUNTER_DEPTH = 2.4;
const POOL_COUNTER_MARGIN = 1;
const POOL_SEATING = 2.8;
/** Counter and seating, like the PointLights. */
const POOLS = 2;

/** Soft round falloff for the light pools; null without a DOM (tests, workers). */
function poolTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

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
  /** Floor light pools in the scene. */
  pools: number;
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
  private readonly pools: Mesh[] = [];
  private readonly poolGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly poolMaterial: MeshBasicMaterial;
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
    this.poolMaterial = new MeshBasicMaterial({
      color: POOL_COLOR,
      map: poolTexture(),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
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
    return { glow: this.glow, pointLights: this.lights.length, pools: this.pools.length, motion: this.config.motion, steam: this.steam.active };
  }

  dispose(): void {
    for (const l of this.lights) {
      l.removeFromParent();
      l.dispose();
    }
    this.lights.length = 0;
    for (const p of this.pools) p.removeFromParent();
    this.pools.length = 0;
    this.poolGeometry.dispose();
    this.poolMaterial.map?.dispose();
    this.poolMaterial.dispose();
    this.steam.group.removeFromParent();
    this.steam.dispose();
  }

  /** Adds or removes PointLights and floor pools to match the quality (only on a quality change). */
  private syncLights(): void {
    const pools = this.config.pools ? POOLS : 0;
    while (this.pools.length > pools) this.pools.pop()!.removeFromParent();
    while (this.pools.length < pools) {
      const p = new Mesh(this.poolGeometry, this.poolMaterial);
      p.name = 'light-pool';
      p.visible = false;
      p.raycast = () => {};
      this.pools.push(p);
      this.shop.root.add(p);
    }
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
    for (let i = 0; i < this.pools.length; i++) {
      const pool = this.pools[i]!;
      if (i === 0) {
        pool.position.set(layout.counter.pos.x, POOL_Y, layout.counter.pos.z);
        pool.scale.set(layout.counter.width + POOL_COUNTER_MARGIN, 1, POOL_COUNTER_DEPTH);
      } else {
        pool.position.set(seating.x, POOL_Y, seating.z);
        pool.scale.set(POOL_SEATING, 1, POOL_SEATING);
      }
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
    // Hidden by day so the pools cost no draw; showing a mesh does not recompile its shader.
    this.poolMaterial.opacity = g * POOL_OPACITY;
    for (let i = 0; i < this.pools.length; i++) this.pools[i]!.visible = g > 0;
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
