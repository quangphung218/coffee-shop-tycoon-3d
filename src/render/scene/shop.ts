import {
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Mesh,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  type Scene,
} from 'three';
import type { Quality } from '../../save/settings';
import { UPGRADES } from '../../sim/data/upgrades';
import {
  BACK_COUNTER_DEPTH,
  BACK_COUNTER_TOP_DEPTH,
  BACK_COUNTER_TOP_EXTRA,
  BACK_COUNTER_Z,
  CHAIR_OFFSET,
  CHAIR_SIZE,
  PARASOL_POLE_RADIUS,
  PLANT_RADIUS,
  TABLE_RADIUS,
  WALL_THICKNESS,
  backCounterSpan,
  wallSpans,
} from '../../sim/nav/footprints';
import { getShopLayout, type Area, type ShopLayout } from '../../sim/upgrades';
import type { GameState, UpgradeId } from '../../sim/types';
import { BACK_COUNTER_HEIGHT, counterGeometry, machineGeometry } from './equipment';
import { FacadeView, doorGeometry, doorGlassGeometry } from './facade';
import { GLASS_MATERIAL, GLOW_MATERIAL, PALETTE, SHARED_MATERIAL, WALL_HEIGHT, WALL_LOW, WOOD_MATERIAL, box, cyl, merge, part } from './parts';

export { SHARED_MATERIAL, machineGeometry };

/**
 * Low-poly shop built from getShopLayout(state). All furniture shares one
 * flat-shaded vertex-colour Lambert material; repeated pieces (tables, chairs,
 * parasols, coins, cups, decor) are InstancedMesh. When the layout changes
 * only the affected meshes are refreshed; a new upgrade tier only points the
 * same InstancedMesh at another cached geometry. Windows, awning, sign and the other
 * architectural details come from FacadeView (facade.ts).
 */

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

// ---------- Geometry builders (built once, or on layout change) ----------

/**
 * Tables, chairs, parasols and decor have a look per upgrade tier
 * (upgradeTier, like the machines in equipment.ts). Tier 1 is the original
 * model, tier 2 adds a detail and steel trim, tier 3 gold trim. Each tier
 * stays within 1.6 times the triangles of tier 1.
 */
export type LookTier = 1 | 2 | 3;

/** Tier 0 (not bought) draws as tier 1; levels past the top tier as tier 3. */
function lookTier(tier: number): LookTier {
  return Math.max(1, Math.min(3, Math.floor(tier))) as LookTier;
}

/** Open tube: no caps, for trims and thin rods. */
function tube(rTop: number, rBottom: number, h: number, segments: number): CylinderGeometry {
  return new CylinderGeometry(rTop, rBottom, h, segments, 1, true);
}

/** Tier 2 lays a cloth with a coral runner over the top on a steel foot; tier 3 has a stone top with a gold rim and a gold foot. */
function tableGeometry(tier: LookTier): BufferGeometry {
  const stem = part(cyl(0.06, 0.06, TABLE_TOP_Y - 0.08, 6), PALETTE.woodDark, 0, (TABLE_TOP_Y - 0.08) / 2, 0);
  const foot = (color: number): BufferGeometry => part(cyl(0.28, 0.3, 0.04, 8), color, 0, 0.02, 0);
  if (tier === 1) {
    return merge([part(cyl(TABLE_RADIUS, TABLE_RADIUS, 0.08, 10), PALETTE.woodLight, 0, TABLE_TOP_Y - 0.04, 0), stem, foot(PALETTE.woodDark)]);
  }
  if (tier === 2) {
    return merge([
      part(cyl(TABLE_RADIUS + 0.01, TABLE_RADIUS + 0.03, 0.16, 10), PALETTE.cream, 0, TABLE_TOP_Y - 0.08, 0),
      part(box(0.18, 0.004, 2 * TABLE_RADIUS + 0.02), PALETTE.coral, 0, TABLE_TOP_Y + 0.002, 0),
      stem,
      foot(PALETTE.steel),
    ]);
  }
  return merge([
    part(cyl(TABLE_RADIUS, TABLE_RADIUS, 0.08, 10), PALETTE.stone, 0, TABLE_TOP_Y - 0.04, 0),
    part(tube(TABLE_RADIUS + 0.015, TABLE_RADIUS + 0.015, 0.06, 10), PALETTE.gold, 0, TABLE_TOP_Y - 0.035, 0),
    stem,
    foot(PALETTE.gold),
  ]);
}

/** Chair facing +z with its back toward -z. Tier 2 adds a seat cushion on steel legs; tier 3 a high back with a gold top rail. */
function chairGeometry(tier: LookTier): BufferGeometry {
  const legs: BufferGeometry[] = [];
  for (const [lx, lz] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const) {
    legs.push(part(box(0.05, 0.42, 0.05), tier === 2 ? PALETTE.steel : PALETTE.woodDark, lx, 0.21, lz));
  }
  const parts = [...legs, part(box(CHAIR_SIZE, 0.07, CHAIR_SIZE), PALETTE.mint, 0, 0.45, 0)];
  if (tier < 3) parts.push(part(box(CHAIR_SIZE, 0.45, 0.06), PALETTE.mint, 0, 0.7, -0.2));
  if (tier >= 2) parts.push(part(box(CHAIR_SIZE - 0.06, 0.05, CHAIR_SIZE - 0.06), tier === 2 ? PALETTE.coral : PALETTE.cream, 0, 0.51, 0.02));
  if (tier === 3) {
    parts.push(part(box(CHAIR_SIZE, 0.75, 0.06), PALETTE.mint, 0, 0.85, -0.2), part(box(CHAIR_SIZE + 0.02, 0.05, 0.08), PALETTE.gold, 0, 1.245, -0.2));
  }
  return merge(parts);
}

/** Parasol canopy as eight wedges, coloured in turn from `colors` (same triangles as one 8-sided cone). */
function canopy(radius: number, height: number, y: number, colors: readonly number[]): BufferGeometry[] {
  const wedge = Math.PI / 4;
  return Array.from({ length: 8 }, (_, i) => part(new ConeGeometry(radius, height, 1, 1, false, i * wedge, wedge), colors[i % colors.length]!, 0, y, 0));
}

/** Tier 2 has a striped canopy on a steel pole; tier 3 a bigger striped canopy with gold tassels and a gold cap. */
function parasolGeometry(tier: LookTier): BufferGeometry {
  if (tier === 1) {
    return merge([
      part(cyl(PARASOL_POLE_RADIUS, PARASOL_POLE_RADIUS, 2.1, 6), PALETTE.cream, 0, 1.05, 0),
      part(new ConeGeometry(1.1, 0.45, 8), PALETTE.coral, 0, 2.15, 0),
      part(cyl(0.08, 0.08, 0.1, 6), PALETTE.cream, 0, 2.42, 0),
    ]);
  }
  const radius = tier === 2 ? 1.1 : 1.3;
  const height = tier === 2 ? 0.45 : 0.5;
  const parts = [
    part(cyl(PARASOL_POLE_RADIUS, PARASOL_POLE_RADIUS, 2.1, 6), PALETTE.steel, 0, 1.05, 0),
    ...canopy(radius, height, 2.15, [PALETTE.coral, PALETTE.cream]),
    part(cyl(0.08, 0.08, 0.1, 6), tier === 2 ? PALETTE.steel : PALETTE.gold, 0, 2.15 + height / 2 + 0.02, 0),
  ];
  if (tier === 3) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = radius - 0.03;
      parts.push(part(tube(0.035, 0, 0.14, 3), PALETTE.gold, Math.sin(a) * r, 2.15 - height / 2 - 0.07, Math.cos(a) * r));
    }
  }
  return merge(parts);
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

/** Unit directions from the foliage centre where the tier 2 flowers sit, and their colours. */
const FLOWER_SPOTS: readonly (readonly [number, number, number, number])[] = [
  [0.55, 0.45, 0.7, PALETTE.coral],
  [-0.65, 0.3, 0.7, PALETTE.gold],
  [0.1, 0.75, 0.65, PALETTE.cream],
];

/** Potted plant pivoting on its base (ambient.ts sways it). Tier 2 adds flowers and a steel pot rim; tier 3 is a tall plant in a gold pot. */
function plantGeometry(tier: LookTier): BufferGeometry {
  if (tier === 3) {
    return merge([
      part(cyl(0.25, 0.18, 0.55, 8), PALETTE.gold, 0, 0.275, 0),
      part(new IcosahedronGeometry(PLANT_RADIUS, 0), PALETTE.plant, 0, 1, 0),
      part(new IcosahedronGeometry(0.32, 0), PALETTE.plantDark, 0.12, 1.45, 0.05),
      part(new IcosahedronGeometry(0.22, 0), PALETTE.plant, -0.05, 1.8, 0),
    ]);
  }
  const parts = [
    part(cyl(0.25, 0.18, 0.45, 8), PALETTE.pot, 0, 0.225, 0),
    part(new IcosahedronGeometry(PLANT_RADIUS, 0), PALETTE.plant, 0, 0.85, 0),
    part(new IcosahedronGeometry(0.28, 0), PALETTE.plantDark, 0.15, 1.2, 0.05),
  ];
  if (tier === 2) {
    parts.push(part(tube(0.26, 0.26, 0.05, 8), PALETTE.steel, 0, 0.43, 0));
    for (const [dx, dy, dz, color] of FLOWER_SPOTS) {
      const r = PLANT_RADIUS * 0.95;
      parts.push(part(new OctahedronGeometry(0.07, 0), color, dx * r, 0.85 + dy * r, dz * r));
    }
  }
  return merge(parts);
}

/** Painting facing +z, centred on its hook. Tier 2 adds a steel outer frame and a picture light; tier 3 a gold frame and a gold plaque. */
function paintingGeometry(tier: LookTier): BufferGeometry {
  const parts = [
    part(box(1, 0.75, 0.05), PALETTE.woodDark, 0, 0, 0),
    part(box(0.86, 0.3, 0.06), PALETTE.coral, 0, 0.15, 0),
    part(box(0.86, 0.31, 0.06), PALETTE.mint, 0, -0.155, 0),
    part(new IcosahedronGeometry(0.12, 0), PALETTE.gold, 0.22, 0.18, 0.04),
  ];
  if (tier === 2) {
    parts.push(part(box(1.08, 0.83, 0.045), PALETTE.steel, 0, 0, 0), part(box(0.5, 0.04, 0.08), PALETTE.steel, 0, 0.45, 0.03));
  } else if (tier === 3) {
    parts.push(part(box(1.1, 0.85, 0.045), PALETTE.gold, 0, 0, 0), part(box(0.26, 0.07, 0.03), PALETTE.gold, 0, -0.5, 0));
  }
  return merge(parts);
}

/** Bulbs hang under a shade this far either side of the rod from tier 2. */
const TWIN_LAMP_X = 0.28;

/** Hanging lamp. Tier 2 has two cream shades on a steel bar; tier 3 two gold shades on a gold bar with a gold finial. */
function lampGeometry(tier: LookTier): BufferGeometry {
  if (tier === 1) {
    return merge([
      part(cyl(0.012, 0.012, 1, 4), PALETTE.woodDark, 0, 2.95, 0),
      part(new ConeGeometry(0.3, 0.28, 8, 1, true), PALETTE.gold, 0, 2.38, 0),
    ]);
  }
  const trim = tier === 2 ? PALETTE.steel : PALETTE.gold;
  const shade = tier === 2 ? PALETTE.cream : PALETTE.gold;
  const parts = [
    part(tube(0.012, 0.012, 1, 4), PALETTE.woodDark, 0, 2.99, 0),
    part(tube(0.012, 0.012, 2 * TWIN_LAMP_X, 4), trim, 0, 2.49, 0, 0, 0, Math.PI / 2),
    part(new ConeGeometry(0.2, 0.22, 8, 1, true), shade, -TWIN_LAMP_X, 2.38, 0),
    part(new ConeGeometry(0.2, 0.22, 8, 1, true), shade, TWIN_LAMP_X, 2.38, 0),
  ];
  if (tier === 3) parts.push(part(tube(0.04, 0, 0.08, 4), PALETTE.gold, 0, 2.45, 0));
  return merge(parts);
}

/** Glowing bulb(s) of a lamp, placed at the bulb height: one, two from tier 2, bigger at tier 3. */
function bulbGeometry(tier: LookTier): BufferGeometry {
  if (tier === 1) return new IcosahedronGeometry(0.1, 0);
  const r = tier === 2 ? 0.08 : 0.09;
  return merge([part(new OctahedronGeometry(r, 0), PALETTE.bulb, -TWIN_LAMP_X, 0, 0), part(new OctahedronGeometry(r, 0), PALETTE.bulb, TWIN_LAMP_X, 0, 0)]);
}

/** Pieces drawn per look tier; geometry for each (piece, tier) is built once on first use. */
const TIERED_GEOMETRY = {
  table: tableGeometry,
  chair: chairGeometry,
  parasol: parasolGeometry,
  plant: plantGeometry,
  painting: paintingGeometry,
  lamp: lampGeometry,
  bulb: bulbGeometry,
} as const satisfies Record<string, (tier: LookTier) => BufferGeometry>;

export type TieredPiece = keyof typeof TIERED_GEOMETRY;

function backCounterGeometry(minX: number, maxX: number): BufferGeometry {
  const w = maxX - minX;
  const cx = (minX + maxX) / 2;
  return merge([
    part(box(w, BACK_COUNTER_HEIGHT - 0.05, BACK_COUNTER_DEPTH), PALETTE.wood, cx, (BACK_COUNTER_HEIGHT - 0.05) / 2, 0),
    part(box(w + BACK_COUNTER_TOP_EXTRA, 0.05, BACK_COUNTER_TOP_DEPTH), PALETTE.cream, cx, BACK_COUNTER_HEIGHT - 0.025, 0),
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
    coin: coinGeometry(),
    cup: cupGeometry(),
    door: doorGeometry(),
    doorGlass: doorGlassGeometry(),
  };
  /** Geometry per tiered piece and look tier, kept for the life of the view (tiers 2 and 3 built when first shown). */
  private readonly tierGeo = new Map<string, BufferGeometry>();

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

  /** Potted plants, one instance per 'plant' decor item in layout order; ambient.ts sways them. */
  readonly plants: InstancedMesh;
  private readonly paintings: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly bulbs: InstancedMesh;

  /** Windows, awning, sign, planters and interior details. */
  readonly facade: FacadeView;

  constructor(scene: Scene, quality: Quality = 'medium') {
    const ground = new Mesh(part(new PlaneGeometry(160, 160), PALETTE.ground, 0, 0, 0, 0, -Math.PI / 2), SHARED_MATERIAL);
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.root.add(ground);

    this.indoorFloor = this.floorMesh(this.geo.unit, WOOD_MATERIAL);
    this.expansionFloor = this.floorMesh(this.geo.unit, WOOD_MATERIAL);
    this.patioFloor = this.floorMesh(this.geo.patio, SHARED_MATERIAL);

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
    this.door.add(new Mesh(this.geo.doorGlass, GLASS_MATERIAL));
    this.root.add(this.door);

    this.pickupMat = new Mesh(part(box(1, 0.02, 0.8), PALETTE.mint), SHARED_MATERIAL);
    this.pickupMat.position.y = 0.01;
    this.root.add(this.pickupMat);

    this.root.add(this.machines);
    this.pickables.push(this.machines);

    this.plants = instanced(this.tiered('plant', 1), SHARED_MATERIAL, DECOR_CAPACITY, true);
    this.paintings = instanced(this.tiered('painting', 1), SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.lamps = instanced(this.tiered('lamp', 1), SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.bulbs = instanced(this.tiered('bulb', 1), GLOW_MATERIAL, DECOR_CAPACITY, false);
    this.root.add(this.plants, this.paintings, this.lamps, this.bulbs);

    this.facade = new FacadeView(quality);
    this.root.add(this.facade.root);

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
    this.facade.setShopName(state.shopName);
    this.updateIcons(state, time);
    this.updateWalls(dt, cameraYaw);
    return changed;
  }

  /** Layout of the current build (a new object after every rebuild), or null before the first update. */
  get current(): ShopLayout | null {
    return this.layout;
  }

  /** Rebuilds the facade details for a graphics quality (low drops the small ones). */
  setQuality(quality: Quality): void {
    this.facade.setQuality(quality);
    this.syncFacadeWalls();
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
    for (const g of this.tierGeo.values()) g.dispose();
    this.tierGeo.clear();
    this.machines.clear();
    this.facade.dispose();
  }

  // ---------- layout ----------

  /** Cached geometry of a piece at a look tier. */
  private tiered(piece: TieredPiece, tier: LookTier): BufferGeometry {
    const key = `${piece}${tier}`;
    let geo = this.tierGeo.get(key);
    if (!geo) {
      geo = TIERED_GEOMETRY[piece](tier);
      this.tierGeo.set(key, geo);
    }
    return geo;
  }

  /** Points an instanced mesh at the piece's geometry for an upgrade tier; the mesh, its instances and draw call stay. */
  private setTier(mesh: InstancedMesh, piece: TieredPiece, tier: number): void {
    const geo = this.tiered(piece, lookTier(tier));
    if (mesh.geometry !== geo) mesh.geometry = geo;
  }

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
    this.facade.build(layout);
    this.syncFacadeWalls();
  }

  private syncFacadeWalls(): void {
    for (let i = 0; i < this.walls.length; i++) this.facade.syncWall(i, this.walls[i]!.height);
  }

  private floorMesh(geo: BufferGeometry, material: Material): Mesh {
    const mesh = new Mesh(geo, material);
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
    const { pos, width, level, tier } = layout.counter;
    const sig = `${width}|${level}|${tier}`;
    if (sig !== this.counterSig) {
      this.counterSig = sig;
      if (this.counter) {
        this.counter.geometry.dispose();
        this.counter.geometry = counterGeometry(width, level, tier);
      } else {
        this.counter = new Mesh(counterGeometry(width, level, tier), WOOD_MATERIAL);
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
    const sig = layout.machines.map((m) => `${m.kind}${m.quality}t${m.tier}@${m.pos.x},${m.pos.z}`).join(';');
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
      this.backCounter = new Mesh(geo, WOOD_MATERIAL);
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
    // buildTables sets the tier geometry right after a reallocation.
    this.tables = instanced(this.tiered('table', 1), WOOD_MATERIAL, capacity, true);
    this.chairs = instanced(this.tiered('chair', 1), WOOD_MATERIAL, capacity * 2, true);
    this.parasols = instanced(this.tiered('parasol', 1), SHARED_MATERIAL, capacity, true);
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
    this.setTier(this.tables, 'table', layout.furnitureTier);
    this.setTier(this.chairs, 'chair', layout.furnitureTier);
    this.setTier(this.parasols, 'parasol', layout.outdoorTier);
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
    const { plant, painting, light } = layout.decorTier;
    this.setTier(this.plants, 'plant', plant);
    this.setTier(this.paintings, 'painting', painting);
    this.setTier(this.lamps, 'lamp', light);
    this.setTier(this.bulbs, 'bulb', light);
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
      this.facade.syncWall(i, wall.height);
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
