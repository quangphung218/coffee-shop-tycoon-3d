import { Color, DirectionalLight, HemisphereLight, Mesh, MeshLambertMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { Quality } from '../../src/save/settings';
import { createStreet } from '../../src/render/street';
import {
  FAR_WALK,
  KERB_PROP_Z,
  LANES,
  MAX_DENSITY,
  MIN_WALKER_GAP,
  NEAR_BUILDINGS_MIN_X,
  NEAR_WALK,
  ROAD,
  STREET_HALF,
  STREET_SPAN,
  PROP_CLEARANCE,
  WALKER_RADIUS,
  WALK_LINES,
  buildingLots,
  createLighting,
  densityFor,
  lightingAt,
  minLaneGap,
  minWalkerGap,
  propSpots,
  rainY,
  RAIN_BOX,
  travelX,
  vehicleSlots,
  walkerSlots,
  wrapX,
} from '../../src/render/street/layout';
import { exitPoint } from '../../src/render/actors/sync';
import { buildNavGrid, isWalkable } from '../../src/sim/nav';
import { createNewGame } from '../../src/sim/state';
import { INDOOR_AREA, buyUpgrade, getShopLayout, nextUpgradeCost } from '../../src/sim/upgrades';
import type { GameState } from '../../src/sim/types';

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

function newState(): GameState {
  const state = createNewGame('Test', 'normal', 7);
  state.phase = 'opening';
  state.paused = false;
  state.weather = 'sunny';
  return state;
}

function newScene(): { scene: Scene; sun: DirectionalLight; hemi: HemisphereLight } {
  const scene = new Scene();
  scene.background = new Color(0xbfe6f5);
  const hemi = new HemisphereLight(0xffffff, 0x888888, 1.6);
  const sun = new DirectionalLight(0xffffff, 1.8);
  scene.add(hemi, sun);
  return { scene, sun, hemi };
}

describe('wrapX / travelX', () => {
  it('keeps every x inside the street', () => {
    for (const x of [-1000, -STREET_HALF, -1, 0, 3.3, STREET_HALF, STREET_HALF + 0.5, 12345.6]) {
      const w = wrapX(x);
      expect(w).toBeGreaterThanOrEqual(-STREET_HALF);
      expect(w).toBeLessThan(STREET_HALF);
    }
    expect(wrapX(STREET_HALF + 1)).toBeCloseTo(-STREET_HALF + 1);
    expect(wrapX(-STREET_HALF - 1)).toBeCloseTo(STREET_HALF - 1);
    expect(wrapX(Number.NaN)).toBe(-STREET_HALF);
  });

  it('moves along the lane direction and comes back around after one lap', () => {
    expect(travelX(0, 1, 5, 2)).toBeCloseTo(10);
    expect(travelX(0, -1, 5, 2)).toBeCloseTo(-10);
    const lap = STREET_SPAN / 7;
    expect(travelX(4, 1, 7, lap)).toBeCloseTo(4);
    // Driving off the +x end reappears at the -x end.
    expect(travelX(STREET_HALF - 1, 1, 1, 2)).toBeCloseTo(-STREET_HALF + 1);
    expect(travelX(-STREET_HALF + 1, -1, 1, 2)).toBeCloseTo(STREET_HALF - 1);
  });
});

describe('densityFor', () => {
  it('gives low fewer vehicles and walkers than high, and no rain particles on low', () => {
    const low = densityFor('low');
    const medium = densityFor('medium');
    const high = densityFor('high');
    const traffic = (d: typeof low) => d.cars + d.bikes + d.buses;
    expect(traffic(low)).toBeLessThan(traffic(medium));
    expect(traffic(medium)).toBeLessThan(traffic(high));
    expect(low.pedestrians).toBeLessThan(medium.pedestrians);
    expect(medium.pedestrians).toBeLessThan(high.pedestrians);
    expect(low.rainDrops).toBe(0);
    expect(high.rainDrops).toBeGreaterThan(medium.rainDrops);
    expect(high.props).toBe(1);
    for (const q of QUALITIES) expect(traffic(densityFor(q))).toBeGreaterThan(0);
  });

  it('falls back to medium for an unknown quality', () => {
    expect(densityFor('ultra' as Quality)).toBe(densityFor('medium'));
  });
});

describe('vehicleSlots', () => {
  it('puts each kind in its own lanes, both directions, without overlapping bumpers', () => {
    for (const q of QUALITIES) {
      const d = densityFor(q);
      const slots = vehicleSlots({ car: d.cars, bike: d.bikes, bus: d.buses });
      expect(slots.filter((s) => s.kind === 'car')).toHaveLength(d.cars);
      expect(slots.filter((s) => s.kind === 'bike')).toHaveLength(d.bikes);
      expect(slots.filter((s) => s.kind === 'bus')).toHaveLength(d.buses);
      for (const s of slots) expect(LANES[s.lane]!.kinds).toContain(s.kind);
      const dirs = new Set(slots.map((s) => LANES[s.lane]!.dir));
      expect(dirs.size).toBe(2);
      // Everyone in a lane shares its speed, so the gap at t = 0 holds forever.
      expect(minLaneGap(slots)).toBeGreaterThan(2);
    }
  });

  it('keeps lanes on the road and the bike lanes by the kerb', () => {
    for (const lane of LANES) {
      expect(lane.z).toBeGreaterThan(ROAD.minZ);
      expect(lane.z).toBeLessThan(ROAD.maxZ);
    }
  });
});

describe('walkers, buildings and props', () => {
  it('keeps walk lines on the sidewalks', () => {
    for (const line of WALK_LINES) {
      const onNear = line.z > NEAR_WALK.minZ && line.z < NEAR_WALK.maxZ;
      const onFar = line.z > FAR_WALK.minZ && line.z < FAR_WALK.maxZ;
      expect(onNear || onFar).toBe(true);
    }
    expect(new Set(WALK_LINES.map((l) => l.dir)).size).toBe(2);
  });

  it('hands out stable, varied walkers', () => {
    expect(walkerSlots(18)).toEqual(walkerSlots(18));
    const slots = walkerSlots(18);
    expect(new Set(slots.map((s) => s.start.toFixed(2))).size).toBe(18);
    for (const s of slots) expect(s.speed).toBeGreaterThan(0);
    // Raising the count keeps each walker's line and look.
    walkerSlots(4).forEach((s, i) => {
      expect(s.line).toBe(slots[i]!.line);
      expect(s.look).toBe(slots[i]!.look);
    });
    expect(walkerSlots(0)).toEqual([]);
  });

  it('keeps walkers on one line at the line speed and apart at every moment', () => {
    for (const q of QUALITIES) {
      const slots = walkerSlots(densityFor(q).pedestrians);
      for (const s of slots) expect(s.speed).toBe(WALK_LINES[s.line]!.speed);
      const start = minWalkerGap(slots, 0);
      expect(start).toBeGreaterThanOrEqual(MIN_WALKER_GAP);
      for (let t = 0; t <= 600; t += 0.7) expect(minWalkerGap(slots, t)).toBeCloseTo(start, 6);
    }
    // Nobody walks through anybody at the highest count either.
    const crowd = walkerSlots(MAX_DENSITY.pedestrians);
    for (let t = 0; t <= 300; t += 1.3) expect(minWalkerGap(crowd, t)).toBeGreaterThan(2 * WALKER_RADIUS);
  });

  it('keeps every walk line clear of the trees and lamps by the kerb', () => {
    for (const line of WALK_LINES) {
      for (const z of KERB_PROP_Z) expect(Math.abs(line.z - z)).toBeGreaterThanOrEqual(PROP_CLEARANCE);
    }
    for (const spot of propSpots()) {
      for (const line of WALK_LINES) expect(Math.abs(line.z - spot.z)).toBeGreaterThanOrEqual(PROP_CLEARANCE);
    }
    // Lines in one direction stay a body apart from those in the other.
    for (const a of WALK_LINES) {
      for (const b of WALK_LINES) if (a !== b) expect(Math.abs(a.z - b.z)).toBeGreaterThan(2 * WALKER_RADIUS);
    }
  });

  it('lets leaving customers vanish before the walkers and clear of the patio tables', () => {
    const state = newState();
    state.money = 1e10;
    while (nextUpgradeCost(state, 'outdoor_seating') !== null) expect(buyUpgrade(state, 'outdoor_seating').ok).toBe(true);
    const layout = getShopLayout(state);
    expect(layout.tables.some((t) => t.zone === 'outdoor')).toBe(true);
    const exit = exitPoint(layout);
    const nearest = Math.min(...WALK_LINES.map((l) => l.z));
    expect(nearest - exit.z).toBeGreaterThanOrEqual(2 * WALKER_RADIUS);
    expect(exit.z).toBeLessThan(NEAR_WALK.minZ);
    expect(isWalkable(buildNavGrid(layout), exit)).toBe(true);
  });

  it('keeps buildings off the road and clear of the largest shop', () => {
    const lots = buildingLots();
    expect(lots.length).toBeGreaterThan(10);
    for (const lot of lots) {
      if (lot.facesPlusZ) {
        expect(Math.abs(lot.x) - lot.width / 2).toBeGreaterThanOrEqual(NEAR_BUILDINGS_MIN_X - 1e-6);
        expect(lot.z + lot.depth / 2).toBeLessThanOrEqual(NEAR_WALK.minZ);
      } else {
        expect(lot.z - lot.depth / 2).toBeGreaterThanOrEqual(FAR_WALK.maxZ);
      }
    }
    // expand_area at its max level reaches x = 9.5.
    expect(NEAR_BUILDINGS_MIN_X).toBeGreaterThan(9.5);
    expect(NEAR_WALK.minZ).toBeGreaterThan(INDOOR_AREA.maxZ + 3);
  });

  it('alternates trees and lamps and leaves the shop door clear', () => {
    const spots = propSpots();
    expect(spots.some((s) => s.kind === 'tree')).toBe(true);
    expect(spots.some((s) => s.kind === 'lamp')).toBe(true);
    for (const s of spots) if (s.facesPlusZ) expect(Math.abs(s.x)).toBeGreaterThanOrEqual(4);
  });
});

describe('lightingAt', () => {
  it('is brightest around noon and warmer and darker in the evening', () => {
    const morning = lightingAt(7 * 60, 'sunny');
    const noon = lightingAt(12 * 60, 'sunny');
    const evening = lightingAt(20 * 60, 'sunny');
    expect(noon.sunScale).toBe(1);
    expect(noon.fillScale).toBe(1);
    expect(noon.sunScale).toBeGreaterThan(morning.sunScale);
    expect(noon.sunScale).toBeGreaterThan(evening.sunScale);
    expect(evening.sky[2]).toBeLessThan(noon.sky[2]);
    expect(noon.lamps).toBe(0);
    expect(evening.lamps).toBeGreaterThan(0.5);
  });

  it('dims and greys the sky in the rain and lights the lamps', () => {
    const sunny = lightingAt(12 * 60, 'sunny');
    const rainy = lightingAt(12 * 60, 'rainy');
    expect(rainy.sunScale).toBeLessThan(sunny.sunScale);
    expect(rainy.fillScale).toBeLessThan(sunny.fillScale);
    expect(rainy.lamps).toBeGreaterThan(0);
  });

  it('makes hot days harsher and warmer than sunny ones', () => {
    const sunny = lightingAt(12 * 60, 'sunny');
    const hot = lightingAt(12 * 60, 'hot');
    expect(hot.sunScale).toBeGreaterThan(sunny.sunScale);
    expect(hot.sunScale / hot.fillScale).toBeGreaterThan(sunny.sunScale / sunny.fillScale);
    expect(hot.sun[2]).toBeLessThan(sunny.sun[2]);
    expect(hot.sun[0]).toBeGreaterThanOrEqual(hot.sun[2]);
  });

  it('moves the sun from the east in the morning, high at noon, to the west in the evening', () => {
    const morning = lightingAt(8 * 60, 'sunny').sunDir.slice();
    const noon = lightingAt(12 * 60, 'sunny').sunDir.slice();
    const evening = lightingAt(19 * 60, 'sunny').sunDir.slice();
    expect(morning[0]).toBeGreaterThan(0.3);
    expect(evening[0]).toBeLessThan(-0.3);
    expect(Math.abs(noon[0]!)).toBeLessThan(1e-9);
    expect(noon[1]).toBeGreaterThan(morning[1]!);
    expect(noon[1]).toBeGreaterThan(evening[1]!);
    for (const d of [morning, noon, evening]) {
      expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeCloseTo(1, 9);
      expect(d[2]).toBeGreaterThan(0);
    }
  });

  it('writes into the given object and handles odd minutes', () => {
    const out = createLighting();
    expect(lightingAt(12 * 60, 'sunny', out)).toBe(out);
    for (const m of [-100, 0, 3 * 60, 23 * 60, Number.NaN]) {
      const l = lightingAt(m, 'hot');
      expect(Number.isFinite(l.sunScale)).toBe(true);
      expect(Number.isFinite(l.fillScale)).toBe(true);
      expect(Math.hypot(...l.sunDir)).toBeCloseTo(1, 9);
      for (const c of [...l.sun, ...l.sky]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('rainY', () => {
  it('falls and wraps back to the top', () => {
    expect(rainY(10, 0)).toBeCloseTo(10);
    expect(rainY(10, 0.1)).toBeLessThan(10);
    for (const t of [0, 0.3, 1, 10, 1000]) {
      const y = rainY(5, t);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(RAIN_BOX.top);
    }
  });
});

describe('createStreet', () => {
  it('shows traffic and walkers by quality and moves them over time', () => {
    const { scene } = newScene();
    const street = createStreet(scene, { quality: 'high' });
    const state = newState();
    const high = densityFor('high');
    let stats = street.stats();
    expect(stats.vehicles).toEqual({ car: high.cars, bike: high.bikes, bus: high.buses });
    expect(stats.pedestrians).toBe(high.pedestrians);

    const root = scene.getObjectByName('street')!;
    const before = root.children.map((c) => c.position.clone());
    const firstWalker = scene.getObjectByName('street-walkers')!.children[0]!;
    const x0 = firstWalker.position.x;
    street.update(state, 0, 0.1);
    street.update(state, 0, 0.1);
    expect(street.stats().time).toBeCloseTo(0.2);
    expect(firstWalker.position.x).not.toBeCloseTo(x0, 3);
    expect(root.children.map((c) => c.position.clone())).toEqual(before);

    street.setQuality('low');
    stats = street.stats();
    const low = densityFor('low');
    expect(stats.vehicles).toEqual({ car: low.cars, bike: low.bikes, bus: low.buses });
    expect(stats.pedestrians).toBe(low.pedestrians);
    // Characters stay pooled when the quality drops and comes back.
    street.setQuality('high');
    expect(street.stats().charactersCreated).toBe(high.pedestrians);
    street.dispose();
    expect(scene.getObjectByName('street')).toBeUndefined();
  });

  it('builds no new walkers while frames run', () => {
    const { scene } = newScene();
    const street = createStreet(scene, { quality: 'medium' });
    const state = newState();
    for (let i = 0; i < 200; i++) street.update(state, 0.5, 1 / 60);
    expect(street.stats().charactersCreated).toBe(densityFor('medium').pedestrians);
    street.dispose();
  });

  it('freezes while paused', () => {
    const { scene } = newScene();
    const street = createStreet(scene, { quality: 'medium' });
    const state = newState();
    state.paused = true;
    street.update(state, 0, 0.1);
    expect(street.stats().time).toBe(0);
    street.dispose();
  });

  it('rains only when the sim says so and the quality allows particles', () => {
    const { scene } = newScene();
    const street = createStreet(scene, { quality: 'high' });
    const state = newState();
    street.update(state, 0, 0.016);
    expect(street.stats().rainDrops).toBe(0);
    state.weather = 'rainy';
    street.update(state, 0, 0.016);
    expect(street.stats().rainDrops).toBe(densityFor('high').rainDrops);
    street.setQuality('low');
    street.update(state, 0, 0.016);
    expect(street.stats().rainDrops).toBe(0);
    street.dispose();
  });

  it('leaves the sun, sky and hemisphere light to the day cycle', () => {
    const { scene, sun, hemi } = newScene();
    const street = createStreet(scene, { quality: 'medium' });
    const sky = (scene.background as Color).clone();
    const sunColor = sun.color.clone();
    const sunPos = sun.position.clone();
    const state = newState();
    for (const minute of [7 * 60, 12 * 60, 20 * 60]) {
      state.minute = minute;
      street.update(state, 0, 0.016);
      expect(sun.intensity).toBe(1.8);
      expect(hemi.intensity).toBe(1.6);
      expect(sun.color.equals(sunColor)).toBe(true);
      expect(sun.position.equals(sunPos)).toBe(true);
      expect((scene.background as Color).equals(sky)).toBe(true);
    }
    street.dispose();
  });

  it('lights the street lamps after dark', () => {
    const { scene } = newScene();
    const street = createStreet(scene, { quality: 'medium' });
    const found: MeshLambertMaterial[] = [];
    scene.getObjectByName('street')!.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshLambertMaterial && o.material.emissive.getHex() === 0xffd27a) found.push(o.material);
    });
    expect(found).toHaveLength(1);
    const bulb = found[0];
    const state = newState();
    state.minute = 12 * 60;
    street.update(state, 0, 0.016);
    expect(bulb!.emissiveIntensity).toBe(0);
    state.minute = 20 * 60;
    street.update(state, 0, 0.016);
    expect(bulb!.emissiveIntensity).toBeGreaterThan(1);
    street.dispose();
  });
});
