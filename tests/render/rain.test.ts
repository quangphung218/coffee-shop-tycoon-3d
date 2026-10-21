import { InstancedMesh, LineSegments, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import { createRain, type Rain } from '../../src/render/street/rain';
import {
  RAIN_BOX,
  SPLASH_LIFE,
  SPLASH_ZONES,
  densityFor,
  rainDrop,
  splashAt,
  splashScale,
} from '../../src/render/street/layout';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

function parts(rain: Rain): { streaks: LineSegments; splashes: InstancedMesh } {
  return {
    streaks: rain.object.getObjectByName('rain-streaks') as LineSegments,
    splashes: rain.object.getObjectByName('rain-splashes') as InstancedMesh,
  };
}

function expectInBox(x: number, y: number, z: number): void {
  expect(x).toBeGreaterThanOrEqual(RAIN_BOX.minX);
  expect(x).toBeLessThanOrEqual(RAIN_BOX.maxX);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(y).toBeLessThanOrEqual(RAIN_BOX.top);
  expect(z).toBeGreaterThanOrEqual(RAIN_BOX.minZ);
  expect(z).toBeLessThanOrEqual(RAIN_BOX.maxZ);
}

describe('rain density', () => {
  it('draws about 120 / 350 / 900 streaks on low / medium / high', () => {
    expect(QUALITIES.map((q) => densityFor(q).rainDrops)).toEqual([120, 350, 900]);
    for (const q of QUALITIES) {
      const rain = createRain(q);
      rain.update(1, 'rainy', false);
      expect(rain.stats().streaks).toBe(densityFor(q).rainDrops);
      expect(parts(rain).streaks.geometry.drawRange.count).toBe(densityFor(q).rainDrops * 2);
      rain.dispose();
    }
  });

  it('splashes on medium and high only', () => {
    for (const q of QUALITIES) {
      const rain = createRain(q);
      rain.update(1, 'rainy', false);
      expect(rain.stats().splashes).toBe(densityFor(q).rainSplashes);
      expect(parts(rain).splashes.count).toBe(rain.stats().splashes);
      rain.dispose();
    }
    expect(densityFor('low').rainSplashes).toBe(0);
    expect(densityFor('medium').rainSplashes).toBeGreaterThan(0);
  });

  it('keeps about 40% of the streaks and no splashes under reduced motion', () => {
    const rain = createRain('high');
    rain.update(1, 'rainy', true);
    expect(rain.stats().streaks).toBe(Math.round(densityFor('high').rainDrops * 0.4));
    expect(rain.stats().splashes).toBe(0);
    expect(parts(rain).streaks.visible).toBe(true);
    expect(parts(rain).splashes.visible).toBe(false);
    rain.update(1.1, 'rainy', false);
    expect(rain.stats().splashes).toBe(densityFor('high').rainSplashes);
    rain.dispose();
  });

  it('follows a quality change', () => {
    const rain = createRain('high');
    rain.setQuality('low');
    rain.update(1, 'rainy', false);
    expect(rain.stats()).toEqual({ streaks: densityFor('low').rainDrops, splashes: 0 });
    rain.setQuality('medium');
    rain.update(1, 'rainy', false);
    expect(rain.stats()).toEqual({ streaks: densityFor('medium').rainDrops, splashes: densityFor('medium').rainSplashes });
    rain.dispose();
  });

  it('stops when the weather is anything but rainy', () => {
    const rain = createRain('high');
    rain.update(1, 'rainy', false);
    for (const weather of ['sunny', 'hot'] as const) {
      rain.update(2, weather, false);
      expect(rain.stats()).toEqual({ streaks: 0, splashes: 0 });
      expect(parts(rain).streaks.visible).toBe(false);
      expect(parts(rain).splashes.visible).toBe(false);
    }
    rain.dispose();
  });
});

describe('rain placement', () => {
  it('keeps every streak inside RAIN_BOX, leaning the same way', () => {
    const rain = createRain('high');
    const { streaks } = parts(rain);
    const pos = streaks.geometry.getAttribute('position');
    for (const t of [0, 0.37, 5.2, 123.4]) {
      rain.update(t, 'rainy', false);
      for (let i = 0; i < rain.stats().streaks; i++) {
        const top = i * 2;
        const bottom = top + 1;
        expectInBox(pos.getX(top), pos.getY(top), pos.getZ(top));
        expectInBox(pos.getX(bottom), pos.getY(bottom), pos.getZ(bottom));
        expect(pos.getY(top)).toBeGreaterThanOrEqual(pos.getY(bottom));
        expect(pos.getX(top)).toBeGreaterThanOrEqual(pos.getX(bottom));
      }
    }
    rain.dispose();
  });

  it('varies streak length and opacity per drop, the same every run', () => {
    const blank = () => ({ x: 0, y: 0, z: 0, length: 0, opacity: 0 });
    const lengths = new Set<number>();
    const opacities = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const d = rainDrop(i, blank());
      lengths.add(d.length);
      opacities.add(d.opacity);
      expect(rainDrop(i, blank())).toEqual(d);
    }
    expect(lengths.size).toBeGreaterThan(40);
    expect(opacities.size).toBeGreaterThan(40);
  });

  it('lands splashes on a splash zone inside RAIN_BOX, moving on after each life', () => {
    const rain = createRain('high');
    const { splashes } = parts(rain);
    const m = new Matrix4();
    const p = new Vector3();
    for (const t of [0, 0.31, 7.77]) {
      rain.update(t, 'rainy', false);
      for (let i = 0; i < splashes.count; i++) {
        splashes.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expectInBox(p.x, p.y, p.z);
        // Matrices are float32, so allow a hair of slack.
        const e = 1e-4;
        const zone = SPLASH_ZONES.find(
          (z) => Math.abs(z.y - p.y) < e && p.x >= z.minX - e && p.x <= z.maxX + e && p.z >= z.minZ - e && p.z <= z.maxZ + e,
        );
        expect(zone).toBeDefined();
      }
    }
    rain.dispose();

    const a = splashAt(3, 1, { x: 0, y: 0, z: 0, age: 0 });
    const again = splashAt(3, 1, { x: 0, y: 0, z: 0, age: 0 });
    expect(again).toEqual(a);
    const later = splashAt(3, 1 + SPLASH_LIFE, { x: 0, y: 0, z: 0, age: 0 });
    expect(later.age).toBeCloseTo(a.age);
    expect(later.x !== a.x || later.z !== a.z).toBe(true);
  });

  it('opens a splash ring and closes it to nothing by the end of its life', () => {
    expect(splashScale(0)).toBeGreaterThan(0);
    expect(splashScale(0.5)).toBeGreaterThan(splashScale(0));
    expect(splashScale(1)).toBe(0);
    expect(SPLASH_ZONES.reduce((s, z) => s + z.share, 0)).toBeCloseTo(1);
  });

  it('holds still while the street clock stands still (paused)', () => {
    const rain = createRain('medium');
    const pos = parts(rain).streaks.geometry.getAttribute('position');
    rain.update(4, 'rainy', false);
    const before = Array.from(pos.array as Float32Array);
    rain.update(4, 'rainy', false);
    expect(Array.from(pos.array as Float32Array)).toEqual(before);
    rain.dispose();
  });
});

describe('rain allocation', () => {
  it('rewrites the same buffers frame after frame and across quality changes', () => {
    const rain = createRain('low');
    const { streaks, splashes } = parts(rain);
    const posAttr = streaks.geometry.getAttribute('position');
    const posArray = posAttr.array;
    const colorArray = streaks.geometry.getAttribute('color').array;
    const matrixArray = splashes.instanceMatrix.array;
    const streakMaterial = streaks.material;
    const splashMaterial = splashes.material;
    const qualities: Quality[] = ['low', 'medium', 'high', 'medium'];
    for (let f = 0; f < 200; f++) {
      if (f % 50 === 0) rain.setQuality(qualities[f / 50]!);
      rain.update(f * 0.016, f % 70 < 60 ? 'rainy' : 'sunny', f % 90 > 80);
    }
    expect(streaks.geometry.getAttribute('position')).toBe(posAttr);
    expect(posAttr.array).toBe(posArray);
    expect(streaks.geometry.getAttribute('color').array).toBe(colorArray);
    expect(splashes.instanceMatrix.array).toBe(matrixArray);
    expect(streaks.material).toBe(streakMaterial);
    expect(splashes.material).toBe(splashMaterial);
    expect(posArray.length).toBe(densityFor('high').rainDrops * 6);
    expect(matrixArray.length).toBe(densityFor('high').rainSplashes * 16);
    rain.dispose();
  });
});
