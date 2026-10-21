import {
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import type { Quality } from '../../save/settings';
import type { Weather } from '../../sim/types';
import {
  MAX_DENSITY,
  RAIN_WIND,
  densityFor,
  rainDrop,
  rainStreaksFor,
  rainY,
  splashAt,
  splashScale,
  type RainDrop,
  type Splash,
  type StreetDensity,
} from './layout';

/**
 * Rain over the street: leaning streaks in one LineSegments and, on medium
 * and high, small rings splashing on the sidewalks, the road and the shop's
 * awning in one InstancedMesh. Buffers are sized once for high quality and
 * rewritten in place; a frame only moves points and changes draw counts.
 */
export interface Rain {
  readonly object: Group;
  /** Places the rain for street time `time` (frozen while paused, so is the rain). Draws nothing unless `weather` is 'rainy'. */
  update(time: number, weather: Weather, reducedMotion: boolean): void;
  setQuality(quality: Quality): void;
  stats(): RainStats;
  dispose(): void;
}

export interface RainStats {
  /** Streaks drawn this frame. */
  streaks: number;
  /** Splashes drawn this frame. */
  splashes: number;
}

const RAIN_COLOR = 0xd6e9f5;
/** Alpha at the top of a streak relative to its bottom, so it reads as falling. */
const TAIL_ALPHA = 0.3;

export function createRain(quality: Quality): Rain {
  const object = new Group();
  object.name = 'street-rain';

  const maxDrops = MAX_DENSITY.rainDrops;
  const drops: RainDrop[] = [];
  const positions = new Float32Array(maxDrops * 6);
  const colors = new Float32Array(maxDrops * 8);
  for (let i = 0; i < maxDrops; i++) {
    const d = rainDrop(i, { x: 0, y: 0, z: 0, length: 0, opacity: 0 });
    drops.push(d);
    colors.set([1, 1, 1, d.opacity * TAIL_ALPHA, 1, 1, 1, d.opacity], i * 8);
  }
  const streakGeometry = new BufferGeometry();
  const positionAttr = new BufferAttribute(positions, 3);
  streakGeometry.setAttribute('position', positionAttr);
  streakGeometry.setAttribute('color', new BufferAttribute(colors, 4));
  const streakMaterial = new LineBasicMaterial({ color: RAIN_COLOR, vertexColors: true, transparent: true, depthWrite: false });
  const streaks = new LineSegments(streakGeometry, streakMaterial);
  streaks.name = 'rain-streaks';
  streaks.frustumCulled = false;
  streaks.visible = false;
  object.add(streaks);

  // A flat ring, opened and closed by scale only.
  const splashGeometry = new RingGeometry(0.6, 1, 12).rotateX(-Math.PI / 2);
  const splashMaterial = new MeshBasicMaterial({ color: RAIN_COLOR, transparent: true, opacity: 0.5, depthWrite: false });
  const splashes = new InstancedMesh(splashGeometry, splashMaterial, MAX_DENSITY.rainSplashes);
  splashes.name = 'rain-splashes';
  splashes.frustumCulled = false;
  splashes.count = 0;
  splashes.visible = false;
  object.add(splashes);

  const m4 = new Matrix4();
  const splash: Splash = { x: 0, y: 0, z: 0, age: 0 };
  let density: Readonly<StreetDensity> = densityFor(quality);
  let streakCount = 0;
  let splashCount = 0;

  function placeStreaks(n: number, time: number): void {
    for (let i = 0; i < n; i++) {
      const d = drops[i]!;
      const top = rainY(d.y, time);
      const bottom = Math.max(0, top - d.length);
      const o = i * 6;
      positions[o] = d.x + RAIN_WIND * top;
      positions[o + 1] = top;
      positions[o + 2] = d.z;
      positions[o + 3] = d.x + RAIN_WIND * bottom;
      positions[o + 4] = bottom;
      positions[o + 5] = d.z;
    }
    positionAttr.needsUpdate = true;
  }

  function placeSplashes(n: number, time: number): void {
    for (let i = 0; i < n; i++) {
      splashAt(i, time, splash);
      const s = splashScale(splash.age);
      m4.makeScale(s, 1, s);
      m4.setPosition(splash.x, splash.y, splash.z);
      splashes.setMatrixAt(i, m4);
    }
    splashes.instanceMatrix.needsUpdate = true;
  }

  return {
    object,

    update(time: number, weather: Weather, reducedMotion: boolean): void {
      const raining = weather === 'rainy';
      streakCount = raining ? rainStreaksFor(density.rainDrops, reducedMotion) : 0;
      splashCount = raining && !reducedMotion ? density.rainSplashes : 0;
      streaks.visible = streakCount > 0;
      splashes.visible = splashCount > 0;
      streakGeometry.setDrawRange(0, streakCount * 2);
      splashes.count = splashCount;
      if (streakCount > 0) placeStreaks(streakCount, time);
      if (splashCount > 0) placeSplashes(splashCount, time);
    },

    setQuality(next: Quality): void {
      density = densityFor(next);
    },

    stats(): RainStats {
      return { streaks: streakCount, splashes: splashCount };
    },

    dispose(): void {
      object.removeFromParent();
      object.clear();
      streakGeometry.dispose();
      streakMaterial.dispose();
      splashGeometry.dispose();
      splashMaterial.dispose();
      splashes.dispose();
    },
  };
}
