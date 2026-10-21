import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  type Scene,
  Vector3,
} from 'three';
import type { Quality } from '../../save/settings';
import type { GameState } from '../../sim/types';
import { ANIM_PERIOD, poseFor, type Pose } from '../actors/animations';
import { createCharacter, type Character } from '../actors/rig';
import { SHARED_MATERIAL } from '../scene/shop';
import {
  VEHICLE_COLORS,
  buildingBodyGeometry,
  buildingDetailGeometry,
  lampBulbGeometry,
  lampGeometry,
  roadGeometry,
  treeGeometry,
  vehicleBodyGeometry,
  vehicleDetailGeometry,
} from './geometry';
import {
  CURB_HEIGHT,
  LANES,
  MAX_DENSITY,
  RAIN_BOX,
  RAIN_STREAK,
  VEHICLE_KINDS,
  WALK_LINES,
  buildingLots,
  createLighting,
  densityFor,
  hash01,
  lightingAt,
  propSpots,
  rainY,
  travelX,
  vehicleCount,
  vehicleSlots,
  walkerSlots,
  type StreetDensity,
  type VehicleKind,
  type VehicleSlot,
  type WalkerSlot,
} from './layout';

/**
 * Decorative street in front of the shop: road, sidewalks, trees, lamps and
 * buildings (static InstancedMesh), traffic both ways, people walking the
 * sidewalks, rain and lamps that glow by the clock. Reads the state, never changes it;
 * how many vehicles, walkers and rain drops show depends on the quality.
 * Customers walking into the shop are the sim's; these people only pass by.
 */
export interface Street {
  /** Moves traffic and walkers by `dt` real seconds (frozen while paused) and sets the lamp glow for the game clock. */
  update(state: GameState, alpha: number, dt: number): void;
  setQuality(quality: Quality): void;
  /** Visible counts (tests, debugging). */
  stats(): StreetStats;
  dispose(): void;
}

export interface StreetStats {
  vehicles: Record<VehicleKind, number>;
  pedestrians: number;
  /** Walker characters ever built; stays put after the first frames. */
  charactersCreated: number;
  rainDrops: number;
  /** Seconds of street time elapsed. */
  time: number;
}

export interface StreetOptions {
  quality: Quality;
}

/** World units walked per walk loop, as for the shop's people. */
const STRIDE = 0.9;
/** Walk poses baked once, so the frame loop does not build pose objects. */
const WALK_FRAMES = 16;
const WALK_POSES: readonly Pose[] = Array.from({ length: WALK_FRAMES }, (_, k) => poseFor('walk', (k / WALK_FRAMES) * ANIM_PERIOD.walk));
/** Each kind gets this many instances so changing quality never reallocates. */
function maxOf(kind: VehicleKind): number {
  return vehicleCount(MAX_DENSITY, kind);
}

interface VehicleMeshes {
  body: InstancedMesh;
  detail: InstancedMesh;
  slots: VehicleSlot[];
}

interface Walker {
  char: Character;
  slot: WalkerSlot;
}

export function createStreet(scene: Scene, options: StreetOptions): Street {
  const root = new Group();
  root.name = 'street';
  scene.add(root);
  const geometries: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const m4 = new Matrix4();
  const scale = new Vector3();
  const color = new Color();

  const road = new Mesh(keep(roadGeometry()), SHARED_MATERIAL);
  road.receiveShadow = true;
  root.add(road);

  // Buildings: one tinted body mesh plus one detail mesh sharing the matrices.
  const lots = buildingLots();
  const buildingBody = new InstancedMesh(keep(buildingBodyGeometry()), SHARED_MATERIAL, lots.length);
  const buildingDetail = new InstancedMesh(keep(buildingDetailGeometry()), SHARED_MATERIAL, lots.length);
  lots.forEach((lot, i) => {
    m4.makeRotationY(lot.facesPlusZ ? 0 : Math.PI);
    m4.scale(scale.set(lot.width, lot.height, lot.depth));
    m4.setPosition(lot.x, 0, lot.z);
    buildingBody.setMatrixAt(i, m4);
    buildingDetail.setMatrixAt(i, m4);
    buildingBody.setColorAt(i, color.setHex(lot.color));
  });
  for (const mesh of [buildingBody, buildingDetail]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }

  // Kerb trees and lamps; low quality keeps a prefix (every other one).
  const spots = propSpots();
  const treeSpots = spots.filter((s) => s.kind === 'tree');
  const lampSpots = spots.filter((s) => s.kind === 'lamp');
  const trees = new InstancedMesh(keep(treeGeometry()), SHARED_MATERIAL, treeSpots.length);
  treeSpots.forEach((s, i) => {
    m4.makeRotationY(hash01(i + 5) * Math.PI * 2);
    const k = 0.85 + hash01(i + 9) * 0.35;
    m4.scale(scale.setScalar(k));
    m4.setPosition(s.x, 0, s.z);
    trees.setMatrixAt(i, m4);
  });
  const bulbMaterial = new MeshLambertMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 0 });
  const lamps = new InstancedMesh(keep(lampGeometry()), SHARED_MATERIAL, lampSpots.length);
  const bulbs = new InstancedMesh(keep(lampBulbGeometry()), bulbMaterial, lampSpots.length);
  lampSpots.forEach((s, i) => {
    // Near-side lamps lean over the road (+z), far-side ones toward it (-z).
    m4.makeRotationY(s.facesPlusZ ? 0 : Math.PI);
    m4.setPosition(s.x, 0, s.z);
    lamps.setMatrixAt(i, m4);
    bulbs.setMatrixAt(i, m4);
  });
  for (const mesh of [trees, lamps, bulbs]) {
    mesh.castShadow = mesh !== bulbs;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }

  // Traffic: two InstancedMeshes per kind, sized for high quality once.
  const vehicles = {} as Record<VehicleKind, VehicleMeshes>;
  for (const kind of VEHICLE_KINDS) {
    const body = new InstancedMesh(keep(vehicleBodyGeometry(kind)), SHARED_MATERIAL, maxOf(kind));
    const detail = new InstancedMesh(keep(vehicleDetailGeometry(kind)), SHARED_MATERIAL, maxOf(kind));
    for (const mesh of [body, detail]) {
      mesh.castShadow = true;
      // Instances move every frame, so a cached bounding sphere would cull them wrongly.
      mesh.frustumCulled = false;
      mesh.count = 0;
      root.add(mesh);
    }
    vehicles[kind] = { body, detail, slots: [] };
  }

  // People strolling by; characters are built when a higher quality first needs them and reused after.
  const walkers: Walker[] = [];
  const walkerRoot = new Group();
  walkerRoot.name = 'street-walkers';
  root.add(walkerRoot);

  // Rain streaks: one LineSegments whose positions are rewritten in place.
  const maxDrops = MAX_DENSITY.rainDrops;
  const rainPositions = new Float32Array(maxDrops * 6);
  const rainSeed = new Float32Array(maxDrops * 3);
  for (let i = 0; i < maxDrops; i++) {
    rainSeed[i * 3] = RAIN_BOX.minX + hash01(i * 3 + 1) * (RAIN_BOX.maxX - RAIN_BOX.minX);
    rainSeed[i * 3 + 1] = hash01(i * 3 + 2) * RAIN_BOX.top;
    rainSeed[i * 3 + 2] = RAIN_BOX.minZ + hash01(i * 3 + 3) * (RAIN_BOX.maxZ - RAIN_BOX.minZ);
  }
  const rainGeometry = keep(new BufferGeometry());
  const rainAttr = new BufferAttribute(rainPositions, 3);
  rainGeometry.setAttribute('position', rainAttr);
  const rainMaterial = new LineBasicMaterial({ color: 0xd6e9f5, transparent: true, opacity: 0.55, depthWrite: false });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  rain.visible = false;
  root.add(rain);

  const light = createLighting();

  let density: Readonly<StreetDensity> = densityFor(options.quality);
  let time = 0;

  function applyDensity(): void {
    for (const kind of VEHICLE_KINDS) vehicles[kind].slots = [];
    const slots = vehicleSlots({ car: density.cars, bike: density.bikes, bus: density.buses });
    for (const slot of slots) vehicles[slot.kind].slots.push(slot);
    for (const kind of VEHICLE_KINDS) {
      const v = vehicles[kind];
      v.body.count = v.slots.length;
      v.detail.count = v.slots.length;
      const palette = VEHICLE_COLORS[kind];
      v.slots.forEach((_, i) => v.body.setColorAt(i, color.setHex(palette[Math.floor(hash01(i * 13 + kind.length) * palette.length)]!)));
      if (v.body.instanceColor) v.body.instanceColor.needsUpdate = true;
    }
    // Walkers are spaced evenly per line for this count, so a new count re-spaces everyone.
    const walkerPlan = walkerSlots(density.pedestrians);
    while (walkers.length < density.pedestrians) {
      const slot = walkerPlan[walkers.length]!;
      const char = createCharacter({ role: 'customer', look: slot.look });
      walkerRoot.add(char.root);
      walkers.push({ char, slot });
    }
    walkers.forEach((w, i) => {
      w.char.root.visible = i < density.pedestrians;
      if (i < walkerPlan.length) w.slot = walkerPlan[i]!;
    });
    trees.count = Math.ceil(treeSpots.length * density.props);
    lamps.count = Math.ceil(lampSpots.length * density.props);
    bulbs.count = lamps.count;
    rainGeometry.setDrawRange(0, density.rainDrops * 2);
  }

  function placeVehicles(): void {
    for (const kind of VEHICLE_KINDS) {
      const v = vehicles[kind];
      for (let i = 0; i < v.slots.length; i++) {
        const slot = v.slots[i]!;
        const lane = LANES[slot.lane]!;
        const x = travelX(slot.start, lane.dir, lane.speed, time);
        m4.makeRotationY(lane.dir > 0 ? 0 : Math.PI);
        m4.setPosition(x, 0, lane.z);
        v.body.setMatrixAt(i, m4);
        v.detail.setMatrixAt(i, m4);
      }
      v.body.instanceMatrix.needsUpdate = true;
      v.detail.instanceMatrix.needsUpdate = true;
    }
  }

  function placeWalkers(): void {
    for (let i = 0; i < density.pedestrians; i++) {
      const w = walkers[i]!;
      const line = WALK_LINES[w.slot.line]!;
      const x = travelX(w.slot.start, line.dir, line.speed, time);
      const loops = (time * w.slot.speed) / STRIDE + i * 0.37;
      const frame = Math.floor((loops - Math.floor(loops)) * WALK_FRAMES) % WALK_FRAMES;
      w.char.applyPose(WALK_POSES[frame]!);
      w.char.root.position.set(x, CURB_HEIGHT, line.z);
      // Characters face +z at rotation 0.
      w.char.root.rotation.y = line.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  function placeRain(): void {
    const n = density.rainDrops;
    for (let i = 0; i < n; i++) {
      const x = rainSeed[i * 3]!;
      const y = rainY(rainSeed[i * 3 + 1]!, time);
      const z = rainSeed[i * 3 + 2]!;
      const o = i * 6;
      rainPositions[o] = x;
      rainPositions[o + 1] = y + RAIN_STREAK;
      rainPositions[o + 2] = z;
      rainPositions[o + 3] = x - 0.06;
      rainPositions[o + 4] = y;
      rainPositions[o + 5] = z;
    }
    rainAttr.needsUpdate = true;
  }

  /** Street lamp bulbs only; the sun, fill and sky follow the clock in scene/dayCycle.ts. */
  function applyLamps(state: GameState, alpha: number): void {
    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
    lightingAt(state.minute + a, state.weather, light);
    bulbMaterial.emissiveIntensity = light.lamps * 1.6;
  }

  applyDensity();
  placeVehicles();
  placeWalkers();

  return {
    update(state: GameState, alpha: number, dt: number): void {
      if (!state.paused && Number.isFinite(dt) && dt > 0) time += dt;
      // Keep the clock small so float precision holds over a long session; every motion repeats well within this.
      if (time > 36000) time -= 36000;
      placeVehicles();
      placeWalkers();
      rain.visible = state.weather === 'rainy' && density.rainDrops > 0;
      if (rain.visible) placeRain();
      applyLamps(state, alpha);
    },

    setQuality(quality: Quality): void {
      const next = densityFor(quality);
      if (next === density) return;
      density = next;
      applyDensity();
      placeVehicles();
      placeWalkers();
    },

    stats(): StreetStats {
      return {
        vehicles: { car: vehicles.car.body.count, bike: vehicles.bike.body.count, bus: vehicles.bus.body.count },
        pedestrians: walkers.filter((w) => w.char.root.visible).length,
        charactersCreated: walkers.length,
        rainDrops: rain.visible ? density.rainDrops : 0,
        time,
      };
    },

    dispose(): void {
      for (const w of walkers) w.char.dispose();
      walkers.length = 0;
      root.removeFromParent();
      root.clear();
      for (const g of geometries) g.dispose();
      for (const kind of VEHICLE_KINDS) {
        vehicles[kind].body.dispose();
        vehicles[kind].detail.dispose();
      }
      for (const mesh of [buildingBody, buildingDetail, trees, lamps, bulbs]) mesh.dispose();
      bulbMaterial.dispose();
      rainMaterial.dispose();
      // SHARED_MATERIAL belongs to the shop, and the character rig is shared with the actors.
    },
  };
}
