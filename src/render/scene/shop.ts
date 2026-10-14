import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UPGRADES } from '../../sim/data/upgrades';
import {
  BACK_COUNTER_DEPTH,
  BACK_COUNTER_TOP_DEPTH,
  BACK_COUNTER_TOP_EXTRA,
  BACK_COUNTER_Z,
  CHAIR_OFFSET,
  CHAIR_SIZE,
  COUNTER_DEPTH,
  COUNTER_TOP_DEPTH,
  COUNTER_TOP_EXTRA,
  DOOR_FRAME_DEPTH,
  DOOR_LEAF_THICKNESS,
  DOOR_LEAF_WIDTH,
  DOOR_LEAF_X,
  DOOR_LEAF_YAW,
  DOOR_LEAF_Z,
  DOOR_POST_WIDTH,
  DOOR_WIDTH,
  MACHINE_SIZE,
  PARASOL_POLE_RADIUS,
  PLANT_RADIUS,
  TABLE_RADIUS,
  WALL_THICKNESS,
  backCounterSpan,
  wallSpans,
} from '../../sim/nav/footprints';
import { getShopLayout, type Area, type LayoutMachine, type ShopLayout } from '../../sim/upgrades';
import type { GameState, UpgradeId } from '../../sim/types';

/**
 * Low-poly shop built from getShopLayout(state). All furniture shares one
 * flat-shaded vertex-colour Lambert material; repeated pieces (tables, chairs,
 * parasols, coins, cups, decor) are InstancedMesh. When the layout changes
 * only the affected meshes are refreshed.
 */

const PALETTE = {
  ground: 0xb9de9a,
  floor: 0xe9cfa8,
  patio: 0xdcd3c4,
  wall: 0xf6e3c6,
  wood: 0xa0704c,
  woodDark: 0x5c3a26,
  woodLight: 0xc98b5a,
  cream: 0xfff9f0,
  mint: 0x2fb898,
  coral: 0xe07a5f,
  gold: 0xf2c14e,
  plant: 0x3fa66b,
  plantDark: 0x2f8a56,
  pot: 0xc8693f,
  cup: 0xf7f3ea,
  coffee: 0x6b4226,
  steel: 0x9aa3ab,
  steelDark: 0x4a4f55,
  bulb: 0xffe7a3,
} as const;

/** Body and accent colours of the espresso machine per better_machine level. */
const MACHINE_TIERS: readonly (readonly [number, number])[] = [
  [PALETTE.steel, PALETTE.steelDark],
  [0xe05a4f, 0xf2f2f2],
  [PALETTE.mint, PALETTE.gold],
  [PALETTE.gold, 0x3b2418],
];

const WALL_HEIGHT = 2.2;
const WALL_LOW = 0.35;
const COUNTER_HEIGHT = 1;
const BACK_COUNTER_HEIGHT = 0.9;
const TABLE_TOP_Y = 0.78;
const MAX_CUPS_PER_TABLE = 3;
const CUP_SPOTS: readonly (readonly [number, number])[] = [
  [-0.18, 0.12],
  [0.18, -0.05],
  [0, -0.22],
];
const DECOR_CAPACITY = 8;
/** A wall whose outside faces the camera more than this is lowered so the room stays visible. */
const WALL_FACING_DOT = 0.25;
const WALL_DAMPING = 8;

const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((u) => u.id);

export const SHARED_MATERIAL = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GLOW_MATERIAL = new MeshBasicMaterial({ color: PALETTE.bulb });

const tmpColor = new Color();

/** Bakes a transform and a flat colour into a primitive so parts can be merged. */
function part(geo: BufferGeometry, color: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  tmpColor.set(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('shop: could not merge geometry');
  merged.computeBoundingSphere();
  return merged;
}

function box(w: number, h: number, d: number): BoxGeometry {
  return new BoxGeometry(w, h, d);
}

function cyl(rTop: number, rBottom: number, h: number, segments = 8): CylinderGeometry {
  return new CylinderGeometry(rTop, rBottom, h, segments);
}

// ---------- Geometry builders (built once, or on layout change) ----------

function tableGeometry(): BufferGeometry {
  return merge([
    part(cyl(TABLE_RADIUS, TABLE_RADIUS, 0.08, 10), PALETTE.woodLight, 0, TABLE_TOP_Y - 0.04, 0),
    part(cyl(0.06, 0.06, TABLE_TOP_Y - 0.08, 6), PALETTE.woodDark, 0, (TABLE_TOP_Y - 0.08) / 2, 0),
    part(cyl(0.28, 0.3, 0.04, 8), PALETTE.woodDark, 0, 0.02, 0),
  ]);
}

/** Chair facing +z with its back toward -z. */
function chairGeometry(): BufferGeometry {
  const legs: BufferGeometry[] = [];
  for (const [lx, lz] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const) {
    legs.push(part(box(0.05, 0.42, 0.05), PALETTE.woodDark, lx, 0.21, lz));
  }
  return merge([
    ...legs,
    part(box(CHAIR_SIZE, 0.07, CHAIR_SIZE), PALETTE.mint, 0, 0.45, 0),
    part(box(CHAIR_SIZE, 0.45, 0.06), PALETTE.mint, 0, 0.7, -0.2),
  ]);
}

function parasolGeometry(): BufferGeometry {
  return merge([
    part(cyl(PARASOL_POLE_RADIUS, PARASOL_POLE_RADIUS, 2.1, 6), PALETTE.cream, 0, 1.05, 0),
    part(new ConeGeometry(1.1, 0.45, 8), PALETTE.coral, 0, 2.15, 0),
    part(cyl(0.08, 0.08, 0.1, 6), PALETTE.cream, 0, 2.42, 0),
  ]);
}

function coinGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.16, 0.16, 0.05, 12), PALETTE.gold, 0, 0, 0, 0, Math.PI / 2),
    part(cyl(0.09, 0.09, 0.07, 8), 0xffd97a, 0, 0, 0, 0, Math.PI / 2),
  ]);
}

function cupGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.11, 0.11, 0.015, 10), PALETTE.cup, 0, 0.008, 0),
    part(cyl(0.065, 0.05, 0.12, 8), PALETTE.cup, 0, 0.075, 0),
    part(cyl(0.058, 0.058, 0.01, 8), PALETTE.coffee, 0, 0.13, 0),
  ]);
}

function plantGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.25, 0.18, 0.45, 8), PALETTE.pot, 0, 0.225, 0),
    part(new IcosahedronGeometry(PLANT_RADIUS, 0), PALETTE.plant, 0, 0.85, 0),
    part(new IcosahedronGeometry(0.28, 0), PALETTE.plantDark, 0.15, 1.2, 0.05),
  ]);
}

/** Painting facing +z, centred on its hook. */
function paintingGeometry(): BufferGeometry {
  return merge([
    part(box(1, 0.75, 0.05), PALETTE.woodDark, 0, 0, 0),
    part(box(0.86, 0.3, 0.06), PALETTE.coral, 0, 0.15, 0),
    part(box(0.86, 0.31, 0.06), PALETTE.mint, 0, -0.155, 0),
    part(new IcosahedronGeometry(0.12, 0), PALETTE.gold, 0.22, 0.18, 0.04),
  ]);
}

function lampGeometry(): BufferGeometry {
  return merge([
    part(cyl(0.012, 0.012, 1, 4), PALETTE.woodDark, 0, 2.95, 0),
    part(new ConeGeometry(0.3, 0.28, 8, 1, true), PALETTE.gold, 0, 2.38, 0),
  ]);
}

function machineGeometry(m: LayoutMachine): BufferGeometry {
  const [body, accent] = MACHINE_TIERS[Math.min(m.quality, MACHINE_TIERS.length - 1)]!;
  const y = BACK_COUNTER_HEIGHT;
  const parts: BufferGeometry[] = [];
  if (m.kind === 'espresso') {
    parts.push(
      part(box(0.9, 0.6, 0.55), body, 0, y + 0.3, 0),
      part(box(MACHINE_SIZE.espresso.width, 0.08, MACHINE_SIZE.espresso.depth), accent, 0, y + 0.64, 0),
      part(box(0.8, 0.05, 0.25), accent, 0, y + 0.03, 0.3),
      part(cyl(0.06, 0.06, 0.12, 6), accent, -0.2, y + 0.38, 0.32),
      part(cyl(0.06, 0.06, 0.12, 6), accent, 0.2, y + 0.38, 0.32),
      part(cyl(0.05, 0.045, 0.1, 8), PALETTE.cup, -0.2, y + 0.11, 0.32),
    );
    if (m.quality >= 1) parts.push(part(new IcosahedronGeometry(0.08, 0), accent, 0.33, y + 0.5, 0.29));
    if (m.quality >= 2) parts.push(part(new ConeGeometry(0.16, 0.32, 8), accent, -0.25, y + 0.84, -0.05, 0, Math.PI));
    if (m.quality >= 3) parts.push(part(new ConeGeometry(0.16, 0.32, 8), accent, 0.25, y + 0.84, -0.05, 0, Math.PI));
  } else {
    parts.push(
      part(box(0.6, 0.9, 0.5), 0x5b8def, 0, y + 0.45, 0),
      part(box(MACHINE_SIZE.fast.width, 0.06, MACHINE_SIZE.fast.depth), accent, 0, y + 0.93, 0),
      part(box(0.3, 0.12, 0.12), accent, 0, y + 0.5, 0.3),
      part(new ConeGeometry(0.18, 0.3, 8), body, 0, y + 1.11, 0, 0, Math.PI),
      part(cyl(0.05, 0.045, 0.1, 8), PALETTE.cup, 0, y + 0.06, 0.3),
    );
  }
  return merge(parts);
}

function counterGeometry(width: number, level: number): BufferGeometry {
  const parts = [
    part(box(width, COUNTER_HEIGHT - 0.06, COUNTER_DEPTH), PALETTE.wood, 0, (COUNTER_HEIGHT - 0.06) / 2, 0),
    part(box(width + COUNTER_TOP_EXTRA, 0.06, COUNTER_TOP_DEPTH), PALETTE.woodDark, 0, COUNTER_HEIGHT - 0.03, 0),
    part(box(width - 0.2, 0.12, 0.04), level >= 1 ? PALETTE.gold : PALETTE.cream, 0, 0.55, 0.41),
    // Cash register at the right end.
    part(box(0.45, 0.25, 0.35), 0x3b2418, width / 2 - 0.4, COUNTER_HEIGHT + 0.125, 0),
    part(box(0.35, 0.18, 0.04), PALETTE.mint, width / 2 - 0.4, COUNTER_HEIGHT + 0.35, -0.05, 0, -0.3),
  ];
  // Pastry plates on a wider counter.
  for (let i = 0; i < level; i++) {
    const x = -width / 2 + 0.5 + i * 0.6;
    parts.push(part(cyl(0.2, 0.2, 0.03, 10), PALETTE.cup, x, COUNTER_HEIGHT + 0.015, 0.1));
    parts.push(part(new IcosahedronGeometry(0.1, 0), 0xd99a4e, x, COUNTER_HEIGHT + 0.09, 0.1));
  }
  return merge(parts);
}

function backCounterGeometry(minX: number, maxX: number): BufferGeometry {
  const w = maxX - minX;
  const cx = (minX + maxX) / 2;
  return merge([
    part(box(w, BACK_COUNTER_HEIGHT - 0.05, BACK_COUNTER_DEPTH), PALETTE.wood, cx, (BACK_COUNTER_HEIGHT - 0.05) / 2, 0),
    part(box(w + BACK_COUNTER_TOP_EXTRA, 0.05, BACK_COUNTER_TOP_DEPTH), PALETTE.cream, cx, BACK_COUNTER_HEIGHT - 0.025, 0),
  ]);
}

function doorGeometry(): BufferGeometry {
  const half = DOOR_WIDTH / 2;
  return merge([
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, -half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_WIDTH + DOOR_POST_WIDTH, 0.18, DOOR_FRAME_DEPTH), PALETTE.woodDark, 0, WALL_HEIGHT - 0.09, 0),
    // Door leaf swung open inward.
    part(box(DOOR_LEAF_WIDTH, 1.95, DOOR_LEAF_THICKNESS), PALETTE.mint, -half + DOOR_LEAF_X, 0.99, DOOR_LEAF_Z, DOOR_LEAF_YAW),
    // Awning over the entrance.
    part(box(DOOR_WIDTH + 1.4, 0.08, 1.1), PALETTE.coral, 0, WALL_HEIGHT + 0.05, 0.55, 0, 0.3),
    part(box(DOOR_WIDTH + 1.4, 0.2, 0.04), PALETTE.cream, 0, WALL_HEIGHT - 0.18, 1.07),
    // Doormat.
    part(box(1.3, 0.02, 0.7), PALETTE.coral, 0, 0.01, 0.55),
  ]);
}

// ---------- Scene objects ----------

export type SceneHit =
  | { kind: 'table'; tableId: number }
  | { kind: 'cash'; tableId: number }
  | { kind: 'trash'; tableId: number }
  | { kind: 'machine' };

interface Wall {
  mesh: Mesh;
  /** Outward normal on the ground plane. */
  nx: number;
  nz: number;
  height: number;
}

/** Mixes the layout-relevant parts of the state into one number (no allocation). */
export function layoutKey(state: GameState): number {
  let h = 2166136261 ^ state.tables.length;
  for (let i = 0; i < UPGRADE_IDS.length; i++) {
    h = Math.imul(h ^ (state.upgrades[UPGRADE_IDS[i]!] ?? 0), 16777619);
  }
  for (let i = 0; i < state.tables.length; i++) {
    h = Math.imul(h ^ state.tables[i]!.id, 16777619);
  }
  return h >>> 0;
}

function growCapacity(needed: number, current: number): number {
  let cap = Math.max(current, 8);
  while (cap < needed) cap *= 2;
  return cap;
}

function instanced(geo: BufferGeometry, mat: Material, capacity: number, shadows: boolean): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, capacity);
  mesh.count = 0;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

export class ShopView {
  readonly root = new Group();
  /** Objects the picker raycasts against. */
  readonly pickables: Object3D[] = [];
  /** Centre and extent of the built shop, for the camera. */
  readonly center = { x: 0, z: 0 };
  readonly extent = { minX: -5, maxX: 5, minZ: -5, maxZ: 9 };

  private key = -1;
  private layout: ShopLayout | null = null;
  private readonly dummy = new Object3D();

  private readonly geo = {
    unit: part(box(1, 1, 1), PALETTE.floor),
    patio: part(box(1, 1, 1), PALETTE.patio),
    wall: part(box(1, 1, 1), PALETTE.wall),
    table: tableGeometry(),
    chair: chairGeometry(),
    parasol: parasolGeometry(),
    coin: coinGeometry(),
    cup: cupGeometry(),
    plant: plantGeometry(),
    painting: paintingGeometry(),
    lamp: lampGeometry(),
    bulb: new IcosahedronGeometry(0.1, 0),
    door: doorGeometry(),
  };

  private readonly indoorFloor: Mesh;
  private readonly expansionFloor: Mesh;
  private readonly patioFloor: Mesh;
  private readonly walls: Wall[] = [];
  private readonly door: Mesh;
  private readonly pickupMat: Mesh;
  private counter: Mesh | null = null;
  private counterSig = '';
  private backCounter: Mesh | null = null;
  private readonly machines = new Group();
  private machineSig = '';

  private tableCap = 0;
  private tables!: InstancedMesh;
  private chairs!: InstancedMesh;
  private parasols!: InstancedMesh;
  private coins!: InstancedMesh;
  private cups!: InstancedMesh;
  /** Table id per instance index of each instanced mesh. */
  private tableIds: number[] = [];
  private chairTableIds: number[] = [];
  private parasolTableIds: number[] = [];
  private coinTableIds: number[] = [];
  private cupTableIds: number[] = [];

  private readonly plants: InstancedMesh;
  private readonly paintings: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly bulbs: InstancedMesh;

  constructor(scene: Scene) {
    const ground = new Mesh(part(new PlaneGeometry(160, 160), PALETTE.ground, 0, 0, 0, 0, -Math.PI / 2), SHARED_MATERIAL);
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.root.add(ground);

    this.indoorFloor = this.floorMesh(this.geo.unit);
    this.expansionFloor = this.floorMesh(this.geo.unit);
    this.patioFloor = this.floorMesh(this.geo.patio);

    // back, left, right, front-left, front-right
    const normals: readonly (readonly [number, number])[] = [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
    ];
    for (const [nx, nz] of normals) {
      const mesh = new Mesh(this.geo.wall, SHARED_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.walls.push({ mesh, nx, nz, height: WALL_HEIGHT });
    }

    this.door = new Mesh(this.geo.door, SHARED_MATERIAL);
    this.door.castShadow = true;
    this.root.add(this.door);

    this.pickupMat = new Mesh(part(box(1, 0.02, 0.8), PALETTE.mint), SHARED_MATERIAL);
    this.pickupMat.position.y = 0.01;
    this.root.add(this.pickupMat);

    this.root.add(this.machines);
    this.pickables.push(this.machines);

    this.plants = instanced(this.geo.plant, SHARED_MATERIAL, DECOR_CAPACITY, true);
    this.paintings = instanced(this.geo.painting, SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.lamps = instanced(this.geo.lamp, SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.bulbs = instanced(this.geo.bulb, GLOW_MATERIAL, DECOR_CAPACITY, false);
    this.root.add(this.plants, this.paintings, this.lamps, this.bulbs);

    this.allocTables(16);
    scene.add(this.root);
  }

  /**
   * Syncs the shop with the state: rebuilds the parts whose layout changed,
   * moves the cash and trash icons and lowers the walls facing the camera.
   * `time` is in seconds, `dt` the frame time, `cameraYaw` the orbit angle.
   */
  update(state: GameState, time: number, dt: number, cameraYaw: number): boolean {
    const key = layoutKey(state);
    const changed = key !== this.key;
    if (changed) {
      this.key = key;
      this.applyLayout(getShopLayout(state));
    }
    this.updateIcons(state, time);
    this.updateWalls(dt, cameraYaw);
    return changed;
  }

  /** Maps a raycast hit back to the shop element it belongs to. */
  resolveHit(object: Object3D, instanceId: number | undefined): SceneHit | null {
    const i = instanceId ?? -1;
    const id = (ids: number[]): number | undefined => (i >= 0 ? ids[i] : undefined);
    let tableId: number | undefined;
    if (object === this.coins && (tableId = id(this.coinTableIds)) !== undefined) return { kind: 'cash', tableId };
    if (object === this.cups && (tableId = id(this.cupTableIds)) !== undefined) return { kind: 'trash', tableId };
    if (object === this.tables) tableId = id(this.tableIds);
    else if (object === this.chairs) tableId = id(this.chairTableIds);
    else if (object === this.parasols) tableId = id(this.parasolTableIds);
    if (tableId !== undefined) return { kind: 'table', tableId };
    for (let o: Object3D | null = object; o; o = o.parent) {
      if (o.userData.pick === 'machine') return { kind: 'machine' };
    }
    return null;
  }

  /** Number of visible pieces per kind (for tests and debugging). */
  counts(): { tables: number; chairs: number; parasols: number; coins: number; cups: number; machines: number; decor: number } {
    return {
      tables: this.tables.count,
      chairs: this.chairs.count,
      parasols: this.parasols.count,
      coins: this.coins.count,
      cups: this.cups.count,
      machines: this.machines.children.length,
      decor: this.plants.count + this.paintings.count + this.lamps.count,
    };
  }

  /** Refreshes bounding spheres of the per-frame icons before a raycast. */
  prepareForPick(): void {
    this.coins.computeBoundingSphere();
    this.cups.computeBoundingSphere();
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof InstancedMesh) o.dispose();
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const g of Object.values(this.geo)) g.dispose();
    this.machines.clear();
  }

  // ---------- layout ----------

  private applyLayout(layout: ShopLayout): void {
    const prev = this.layout;
    this.layout = layout;
    if (!prev || !sameArea(prev.indoor, layout.indoor) || !sameArea(prev.expansion, layout.expansion) || !sameArea(prev.outdoor, layout.outdoor)) {
      this.buildStructure(layout);
    }
    this.buildCounter(layout);
    this.buildMachines(layout);
    this.buildTables(layout);
    this.buildDecor(layout);
    this.pickupMat.position.set(layout.pickup.x, 0.01, layout.pickup.z);
  }

  private floorMesh(geo: BufferGeometry): Mesh {
    const mesh = new Mesh(geo, SHARED_MATERIAL);
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.root.add(mesh);
    return mesh;
  }

  private placeFloor(mesh: Mesh, area: Area | null): void {
    mesh.visible = area !== null;
    if (!area) return;
    mesh.scale.set(area.maxX - area.minX, 0.1, area.maxZ - area.minZ);
    mesh.position.set((area.minX + area.maxX) / 2, -0.05, (area.minZ + area.maxZ) / 2);
  }

  private buildStructure(layout: ShopLayout): void {
    const { indoor, expansion, outdoor, door } = layout;
    this.placeFloor(this.indoorFloor, indoor);
    this.placeFloor(this.expansionFloor, expansion);
    this.placeFloor(this.patioFloor, outdoor);

    const minX = indoor.minX;
    const maxX = expansion ? expansion.maxX : indoor.maxX;
    const minZ = indoor.minZ;
    const maxZ = indoor.maxZ;
    const t = WALL_THICKNESS;
    wallSpans(layout).forEach(([cx, cz, sx, sz], i) => {
      const wall = this.walls[i]!;
      wall.mesh.position.set(cx, wall.height / 2, cz);
      wall.mesh.scale.set(sx, wall.height, sz);
    });
    this.door.position.set(door.x, 0, maxZ + t / 2);

    this.center.x = (indoor.minX + indoor.maxX) / 2;
    this.center.z = (indoor.minZ + indoor.maxZ) / 2;
    this.extent.minX = minX;
    this.extent.maxX = Math.max(maxX, outdoor?.maxX ?? maxX);
    this.extent.minZ = minZ;
    this.extent.maxZ = outdoor ? outdoor.maxZ : maxZ;
  }

  private buildCounter(layout: ShopLayout): void {
    const { pos, width, level } = layout.counter;
    const sig = `${width}|${level}`;
    if (sig !== this.counterSig) {
      this.counterSig = sig;
      if (this.counter) {
        this.counter.geometry.dispose();
        this.counter.geometry = counterGeometry(width, level);
      } else {
        this.counter = new Mesh(counterGeometry(width, level), SHARED_MATERIAL);
        this.counter.castShadow = true;
        this.counter.receiveShadow = true;
        this.root.add(this.counter);
      }
    }
    this.counter!.position.set(pos.x, 0, pos.z);
  }

  private clearMachines(): void {
    for (const child of this.machines.children) (child as Mesh).geometry.dispose();
    this.machines.clear();
  }

  private buildMachines(layout: ShopLayout): void {
    const sig = layout.machines.map((m) => `${m.kind}${m.quality}@${m.pos.x},${m.pos.z}`).join(';');
    if (sig === this.machineSig) return;
    this.machineSig = sig;
    this.clearMachines();
    for (const m of layout.machines) {
      const mesh = new Mesh(machineGeometry(m), SHARED_MATERIAL);
      mesh.position.set(m.pos.x, 0, m.pos.z);
      mesh.castShadow = true;
      mesh.userData.pick = 'machine';
      this.machines.add(mesh);
    }
    const span = backCounterSpan(layout);
    if (!span) return;
    const geo = backCounterGeometry(span.minX, span.maxX);
    if (this.backCounter) {
      this.backCounter.geometry.dispose();
      this.backCounter.geometry = geo;
    } else {
      this.backCounter = new Mesh(geo, SHARED_MATERIAL);
      this.backCounter.castShadow = true;
      this.backCounter.receiveShadow = true;
      this.root.add(this.backCounter);
    }
    this.backCounter.position.set(0, 0, BACK_COUNTER_Z);
  }

  private allocTables(capacity: number): void {
    const old = [this.tables, this.chairs, this.parasols, this.coins, this.cups];
    for (const mesh of old) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.tableCap = capacity;
    this.tables = instanced(this.geo.table, SHARED_MATERIAL, capacity, true);
    this.chairs = instanced(this.geo.chair, SHARED_MATERIAL, capacity * 2, true);
    this.parasols = instanced(this.geo.parasol, SHARED_MATERIAL, capacity, true);
    this.coins = instanced(this.geo.coin, SHARED_MATERIAL, capacity, false);
    this.cups = instanced(this.geo.cup, SHARED_MATERIAL, capacity * MAX_CUPS_PER_TABLE, false);
    // Icons move every frame; skip culling instead of recomputing bounds.
    this.coins.frustumCulled = false;
    this.cups.frustumCulled = false;
    this.tableIds = new Array<number>(capacity).fill(-1);
    this.chairTableIds = new Array<number>(capacity * 2).fill(-1);
    this.parasolTableIds = new Array<number>(capacity).fill(-1);
    this.coinTableIds = new Array<number>(capacity).fill(-1);
    this.cupTableIds = new Array<number>(capacity * MAX_CUPS_PER_TABLE).fill(-1);
    this.root.add(this.tables, this.chairs, this.parasols, this.coins, this.cups);
    this.pickables.length = 0;
    this.pickables.push(this.machines, this.coins, this.cups, this.tables, this.chairs, this.parasols);
  }

  private buildTables(layout: ShopLayout): void {
    const n = layout.tables.length;
    if (n > this.tableCap) this.allocTables(growCapacity(n, this.tableCap));
    const d = this.dummy;
    let chairs = 0;
    let parasols = 0;
    for (let i = 0; i < n; i++) {
      const t = layout.tables[i]!;
      d.position.set(t.pos.x, 0, t.pos.z);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.tables.setMatrixAt(i, d.matrix);
      this.tableIds[i] = t.id;
      for (let s = 0; s < Math.min(t.seats, 2); s++) {
        const side = s === 0 ? -1 : 1;
        d.position.set(t.pos.x + side * CHAIR_OFFSET, 0, t.pos.z);
        d.rotation.set(0, (-side * Math.PI) / 2, 0);
        d.updateMatrix();
        this.chairs.setMatrixAt(chairs, d.matrix);
        this.chairTableIds[chairs++] = t.id;
      }
      if (t.zone === 'outdoor') {
        d.position.set(t.pos.x, 0, t.pos.z);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        this.parasols.setMatrixAt(parasols, d.matrix);
        this.parasolTableIds[parasols++] = t.id;
      }
    }
    finishInstances(this.tables, n);
    finishInstances(this.chairs, chairs);
    finishInstances(this.parasols, parasols);
  }

  private buildDecor(layout: ShopLayout): void {
    const d = this.dummy;
    let plants = 0;
    let paintings = 0;
    let lamps = 0;
    for (const item of layout.decor) {
      d.rotation.set(0, 0, 0);
      if (item.kind === 'plant' && plants < DECOR_CAPACITY) {
        d.position.set(item.pos.x, 0, item.pos.z);
        d.updateMatrix();
        this.plants.setMatrixAt(plants++, d.matrix);
      } else if (item.kind === 'painting' && paintings < DECOR_CAPACITY) {
        // Slots near a side wall hang on it; the rest hang on the back wall.
        const onSide = Math.abs(item.pos.x) > Math.abs(layout.indoor.minX) - 0.3;
        d.position.set(item.pos.x, 1.45, item.pos.z);
        if (onSide) d.rotation.set(0, item.pos.x < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        d.updateMatrix();
        this.paintings.setMatrixAt(paintings++, d.matrix);
      } else if (item.kind === 'light' && lamps < DECOR_CAPACITY) {
        d.position.set(item.pos.x, 0, item.pos.z);
        d.updateMatrix();
        this.lamps.setMatrixAt(lamps, d.matrix);
        d.position.y = 2.28;
        d.updateMatrix();
        this.bulbs.setMatrixAt(lamps++, d.matrix);
      }
    }
    finishInstances(this.plants, plants);
    finishInstances(this.paintings, paintings);
    finishInstances(this.lamps, lamps);
    finishInstances(this.bulbs, lamps);
  }

  // ---------- per frame (no allocation) ----------

  private updateIcons(state: GameState, time: number): void {
    const d = this.dummy;
    const tables = state.tables;
    let coins = 0;
    let cups = 0;
    const n = Math.min(tables.length, this.tableCap);
    for (let i = 0; i < n; i++) {
      const t = tables[i]!;
      if (t.cash > 0) {
        d.position.set(t.pos.x, 1.3 + Math.sin(time * 3 + i) * 0.06, t.pos.z);
        d.rotation.set(0, time * 2.5 + i, 0);
        d.updateMatrix();
        this.coins.setMatrixAt(coins, d.matrix);
        this.coinTableIds[coins++] = t.id;
      }
      const dirty = Math.min(t.trash, MAX_CUPS_PER_TABLE);
      for (let c = 0; c < dirty; c++) {
        const spot = CUP_SPOTS[c]!;
        d.position.set(t.pos.x + spot[0], TABLE_TOP_Y, t.pos.z + spot[1]);
        d.rotation.set(0, i + c, 0);
        d.updateMatrix();
        this.cups.setMatrixAt(cups, d.matrix);
        this.cupTableIds[cups++] = t.id;
      }
    }
    if (coins > 0 || this.coins.count > 0) this.coins.instanceMatrix.needsUpdate = true;
    if (cups > 0 || this.cups.count > 0) this.cups.instanceMatrix.needsUpdate = true;
    this.coins.count = coins;
    this.cups.count = cups;
  }

  private updateWalls(dt: number, yaw: number): void {
    const cx = Math.sin(yaw);
    const cz = Math.cos(yaw);
    // The first frame (dt 0) snaps so the walls do not slide down at startup.
    const k = dt > 0 ? 1 - Math.exp(-WALL_DAMPING * dt) : 1;
    for (let i = 0; i < this.walls.length; i++) {
      const wall = this.walls[i]!;
      const goal = wall.nx * cx + wall.nz * cz > WALL_FACING_DOT ? WALL_LOW : WALL_HEIGHT;
      if (Math.abs(wall.height - goal) < 0.001) continue;
      wall.height += (goal - wall.height) * k;
      wall.mesh.scale.y = wall.height;
      wall.mesh.position.y = wall.height / 2;
    }
  }
}

function sameArea(a: Area | null, b: Area | null): boolean {
  if (a === null || b === null) return a === b;
  return a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
}

function finishInstances(mesh: InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
