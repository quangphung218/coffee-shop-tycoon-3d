import {
  type BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { Quality } from '../../save/settings';
import {
  DOOR_FRAME_DEPTH,
  DOOR_LEAF_THICKNESS,
  DOOR_LEAF_WIDTH,
  DOOR_LEAF_X,
  DOOR_LEAF_YAW,
  DOOR_LEAF_Z,
  DOOR_POST_WIDTH,
  DOOR_WIDTH,
  PLANTER_HALF,
  STEP_DEPTH,
  STEP_HEIGHT,
  STEP_WIDTH,
  WALL_THICKNESS,
  buildingArea,
  doorPlanters,
  wallSpans,
} from '../../sim/nav/footprints';
import type { ShopLayout } from '../../sim/upgrades';
import type { Vec2 } from '../../sim/types';
import { GLOW_MATERIAL, PALETTE, SHARED_MATERIAL, WALL_HEIGHT, WALL_LOW, box, cyl, merge, part } from './parts';

/**
 * Architecture and small interior details of the shop: framed windows with
 * frosted glass, the glass door, a striped awning and the name sign over the
 * door, planters and the front step, shelves of bean jars and the menu board
 * behind the bar, pendant lamps over the counter, a doormat and ceiling fans.
 *
 * facadePlan() places everything from the layout as plain data (tested); the
 * FacadeView merges it into a few meshes on the shared material. It is
 * rebuilt only when the layout or the quality changes. Details on a wall live
 * in that wall's group, which shrinks and hides with the wall when it lowers.
 * The door frame, awning and sign stand on their own, so the shop front still
 * reads when the front wall is down.
 */

const GLASS = 0xbfe0e8;
const STONE = 0xcfc4b3;
const CHALKBOARD = 0x2e3a35;

export const WINDOW_WIDTH = 1.2;
export const WINDOW_HEIGHT = 0.95;
export const WINDOW_SILL = 0.95;
/** Windows sit this far apart along a wall, and at least this far from its ends. */
export const WINDOW_PITCH = 3;
export const WINDOW_END_MARGIN = 0.9;

const AWNING_WIDTH = DOOR_WIDTH + 0.8;
const AWNING_DEPTH = 0.95;
const AWNING_TILT = 0.32;
const AWNING_STRIPES = 8;
/** Top of the awning where it meets the wall, just over the door lintel. */
const AWNING_TOP = WALL_HEIGHT - 0.02;

export const SIGN_WIDTH = 2.3;
export const SIGN_HEIGHT = 0.5;
const SIGN_FRAME = 0.06;
const SIGN_CANVAS = { width: 512, height: 112 } as const;

const SHELF_WIDTH = 1.5;
const SHELF_LEVELS: readonly number[] = [1.3, 1.75];
const SHELF_DEPTH = 0.26;
const JAR_PITCH = 0.3;

const MENU_WIDTH = 1.3;
const MENU_HEIGHT = 0.85;

const PENDANTS = 3;
const PENDANT_Y = 2.3;
const FAN_Y = 2.6;
const FAN_BLADE = 0.62;
/** Cords and fan rods reach up to here (there is no ceiling; matches the decor lamps). */
const HANG_TOP = 3.4;

/** A wall group is hidden once its wall is this low, so nothing shows squashed flat. */
const WALL_HIDE = WALL_LOW + 0.25;

/** Small details each quality keeps. */
const DETAIL: Readonly<Record<Quality, { jars: boolean; pendants: boolean; valance: boolean; mullions: boolean; flowerBoxes: boolean }>> = {
  low: { jars: false, pendants: false, valance: false, mullions: false, flowerBoxes: false },
  medium: { jars: true, pendants: true, valance: true, mullions: true, flowerBoxes: false },
  high: { jars: true, pendants: true, valance: true, mullions: true, flowerBoxes: true },
};

export interface WindowSpot {
  /** Index into wallSpans(): 1 left, 2 right, 3 front-left, 4 front-right. */
  wall: number;
  x: number;
  z: number;
  /** Turns the window's local +z to the wall's outward normal. */
  yaw: number;
}

export interface FacadePlan {
  windows: WindowSpot[];
  mullions: boolean;
  flowerBoxes: boolean;
  /** Outer face of the front wall. */
  frontZ: number;
  door: Vec2;
  planters: Vec2[];
  awning: { x: number; width: number; stripes: number; valance: boolean };
  sign: { x: number; y: number; z: number };
  step: { x: number; z: number };
  /** Shelf boards on the back wall: centre x, the wall's inner face z, and the board heights. */
  shelves: { x: number; z: number; levels: readonly number[] };
  jars: { x: number; y: number; z: number }[];
  menu: { x: number; y: number; z: number };
  /** Doormat just inside the door. */
  mat: Vec2;
  pendants: Vec2[];
  fans: Vec2[];
}

/** Window centres along the side and front walls, skipping spots taken by a painting. */
export function windowSpots(layout: ShopLayout): WindowSpot[] {
  const spans = wallSpans(layout);
  const paintings = layout.decor.filter((d) => d.kind === 'painting');
  const out: WindowSpot[] = [];
  for (const wall of [1, 2, 3, 4]) {
    const [cx, cz, sx, sz] = spans[wall]!;
    const alongX = sx > sz;
    const length = alongX ? sx : sz;
    const n = Math.floor((length - 2 * WINDOW_END_MARGIN) / WINDOW_PITCH) + 1;
    const yaw = wall === 1 ? -Math.PI / 2 : wall === 2 ? Math.PI / 2 : 0;
    for (let k = 0; k < n; k++) {
      const offset = (k - (n - 1) / 2) * WINDOW_PITCH;
      const x = alongX ? cx + offset : cx;
      const z = alongX ? cz : cz + offset;
      const covered = paintings.some((p) =>
        alongX
          ? Math.abs(p.pos.z - z) < 0.5 && Math.abs(p.pos.x - x) < WINDOW_WIDTH / 2 + 0.6
          : Math.abs(p.pos.x - x) < 0.5 && Math.abs(p.pos.z - z) < WINDOW_WIDTH / 2 + 0.6,
      );
      if (!covered) out.push({ wall, x, z, yaw });
    }
  }
  return out;
}

/** Where every facade and interior detail goes for this layout and quality. */
export function facadePlan(layout: ShopLayout, quality: Quality): FacadePlan {
  const detail = DETAIL[quality] ?? DETAIL.medium;
  const room = buildingArea(layout);
  const { indoor, expansion, counter, door } = layout;
  const frontZ = room.maxZ + WALL_THICKNESS;
  const backZ = room.minZ;
  const roomX = (indoor.minX + indoor.maxX) / 2;

  const shelves = { x: roomX - 1.1, z: backZ, levels: SHELF_LEVELS };
  const jars: FacadePlan['jars'] = [];
  if (detail.jars) {
    const perShelf = Math.floor(SHELF_WIDTH / JAR_PITCH);
    for (const y of SHELF_LEVELS) {
      for (let k = 0; k < perShelf; k++) {
        jars.push({ x: shelves.x + (k - (perShelf - 1) / 2) * JAR_PITCH, y, z: backZ + SHELF_DEPTH / 2 });
      }
    }
  }

  const pendants: Vec2[] = [];
  if (detail.pendants) {
    const pitch = counter.width / PENDANTS;
    for (let k = 0; k < PENDANTS; k++) pendants.push({ x: counter.pos.x + (k - (PENDANTS - 1) / 2) * pitch, z: counter.pos.z });
  }

  const fans: Vec2[] = [{ x: roomX, z: 0.5 }];
  if (expansion) fans.push({ x: (expansion.minX + expansion.maxX) / 2, z: 0.5 });

  return {
    windows: windowSpots(layout),
    mullions: detail.mullions,
    flowerBoxes: detail.flowerBoxes,
    frontZ,
    door: { x: door.x, z: room.maxZ + WALL_THICKNESS / 2 },
    planters: doorPlanters(layout),
    awning: { x: door.x, width: AWNING_WIDTH, stripes: AWNING_STRIPES, valance: detail.valance },
    sign: { x: door.x, y: WALL_HEIGHT + 0.01 + SIGN_HEIGHT / 2 + SIGN_FRAME, z: room.maxZ + WALL_THICKNESS / 2 },
    step: { x: door.x, z: frontZ + STEP_DEPTH / 2 },
    shelves,
    jars,
    menu: { x: roomX + 1.2, y: 1.62, z: backZ },
    mat: { x: door.x, z: room.maxZ - 0.45 },
    pendants,
    fans,
  };
}

/** Number of placed details (windows count their mullions and flower boxes), for tests and tuning. */
export function facadePieceCount(plan: FacadePlan): number {
  const perWindow = 1 + (plan.mullions ? 1 : 0) + (plan.flowerBoxes ? 1 : 0);
  return (
    plan.windows.length * perWindow +
    plan.planters.length +
    1 + // awning
    (plan.awning.valance ? 1 : 0) +
    1 + // sign
    1 + // step
    plan.shelves.levels.length +
    plan.jars.length +
    1 + // menu board
    1 + // doormat
    plan.pendants.length +
    plan.fans.length
  );
}

// ---------- Geometry ----------

/** Turns parts built around a local origin (facing +z) and moves them into place. */
function placed(parts: BufferGeometry[], x: number, y: number, z: number, yaw: number): BufferGeometry[] {
  for (const g of parts) {
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z);
  }
  return parts;
}

/** Door frame and the framed glass leaf, swung open inward; centred on the doorway at floor level. */
export function doorGeometry(): BufferGeometry {
  const half = DOOR_WIDTH / 2;
  const w = DOOR_LEAF_WIDTH;
  const h = 1.95;
  const t = DOOR_LEAF_THICKNESS;
  const stile = 0.08;
  const topRail = 0.1;
  const kick = 0.3;
  const leaf = [
    part(box(stile, h, t), PALETTE.mint, -w / 2 + stile / 2, 0, 0),
    part(box(stile, h, t), PALETTE.mint, w / 2 - stile / 2, 0, 0),
    part(box(w - 2 * stile, topRail, t), PALETTE.mint, 0, h / 2 - topRail / 2, 0),
    part(box(w - 2 * stile, kick, t), PALETTE.mint, 0, -h / 2 + kick / 2, 0),
    part(box(w - 2 * stile, h - topRail - kick, t * 0.5), GLASS, 0, (kick - topRail) / 2, 0),
    part(box(0.04, 0.24, t + 0.08), PALETTE.gold, w / 2 - stile - 0.05, 0, 0),
  ];
  return merge([
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, -half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_WIDTH + DOOR_POST_WIDTH, 0.18, DOOR_FRAME_DEPTH), PALETTE.woodDark, 0, WALL_HEIGHT - 0.09, 0),
    ...placed(leaf, -half + DOOR_LEAF_X, 0.99, DOOR_LEAF_Z, DOOR_LEAF_YAW),
  ]);
}

function windowParts(spot: WindowSpot, plan: FacadePlan): BufferGeometry[] {
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  const t = WALL_THICKNESS;
  const mid = WINDOW_SILL + h / 2;
  const frame = PALETTE.woodDark;
  // The pane passes through the wall so it shows on both faces.
  const parts = [
    part(box(w, h, t + 0.02), GLASS, 0, mid, 0),
    part(box(w + 0.16, 0.08, t + 0.08), frame, 0, WINDOW_SILL + h + 0.04, 0),
    part(box(w + 0.28, 0.07, t + 0.22), PALETTE.cream, 0, WINDOW_SILL - 0.035, 0),
    part(box(0.08, h, t + 0.08), frame, -w / 2 - 0.04, mid, 0),
    part(box(0.08, h, t + 0.08), frame, w / 2 + 0.04, mid, 0),
  ];
  if (plan.mullions) {
    parts.push(part(box(0.05, h, t + 0.05), frame, 0, mid, 0), part(box(w, 0.05, t + 0.05), frame, 0, WINDOW_SILL + h * 0.58, 0));
  }
  if (plan.flowerBoxes) {
    const z = t / 2 + 0.12;
    parts.push(part(box(w * 0.9, 0.16, 0.2), PALETTE.pot, 0, WINDOW_SILL - 0.16, z));
    const blooms = [PALETTE.plant, PALETTE.coral, PALETTE.plantDark, PALETTE.gold, PALETTE.plant];
    blooms.forEach((c, k) => {
      parts.push(part(new IcosahedronGeometry(c === PALETTE.coral || c === PALETTE.gold ? 0.07 : 0.11, 0), c, (k - 2) * 0.24, WINDOW_SILL - 0.03, z));
    });
  }
  return placed(parts, spot.x, 0, spot.z, spot.yaw);
}

function planterParts(p: Vec2): BufferGeometry[] {
  const s = PLANTER_HALF * 2;
  return [
    part(box(s, 0.42, s), PALETTE.wood, p.x, 0.21, p.z),
    part(box(s + 0.06, 0.05, s + 0.06), PALETTE.woodDark, p.x, 0.43, p.z),
    part(box(s - 0.06, 0.02, s - 0.06), PALETTE.coffee, p.x, 0.45, p.z),
    part(cyl(0.035, 0.045, 0.45, 6), PALETTE.woodDark, p.x, 0.66, p.z),
    part(new IcosahedronGeometry(0.34, 0), PALETTE.plant, p.x, 1.02, p.z),
    part(new IcosahedronGeometry(0.22, 0), PALETTE.plantDark, p.x + 0.08, 1.32, p.z - 0.04),
  ];
}

function awningParts(plan: FacadePlan): BufferGeometry[] {
  const { x, width, stripes, valance } = plan.awning;
  const sw = width / stripes;
  const drop = Math.sin(AWNING_TILT) * AWNING_DEPTH;
  const reach = Math.cos(AWNING_TILT) * AWNING_DEPTH;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < stripes; i++) {
    const color = i % 2 === 0 ? PALETTE.coral : PALETTE.cream;
    const sx = x - width / 2 + (i + 0.5) * sw;
    parts.push(part(box(sw, 0.04, AWNING_DEPTH), color, sx, AWNING_TOP - drop / 2, plan.frontZ + reach / 2 + 0.03, 0, AWNING_TILT));
    if (valance) parts.push(part(box(sw, 0.16, 0.03), color, sx, AWNING_TOP - drop - 0.08, plan.frontZ + reach + 0.03));
  }
  // Brackets from the door posts to the front corners.
  for (const side of [-1, 1]) {
    parts.push(part(box(0.04, 0.04, reach), PALETTE.woodDark, x + side * (width / 2 - 0.05), AWNING_TOP - drop / 2 - 0.05, plan.frontZ + reach / 2, 0, AWNING_TILT));
  }
  return parts;
}

function signParts(plan: FacadePlan): BufferGeometry[] {
  const { x, y, z } = plan.sign;
  return [
    part(box(SIGN_WIDTH + 2 * SIGN_FRAME, SIGN_HEIGHT + 2 * SIGN_FRAME, 0.08), PALETTE.woodDark, x, y, z),
    part(box(SIGN_WIDTH, SIGN_HEIGHT, 0.1), PALETTE.cream, x, y, z),
    part(new IcosahedronGeometry(0.06, 0), PALETTE.gold, x - SIGN_WIDTH / 2 - SIGN_FRAME, y + SIGN_HEIGHT / 2 + SIGN_FRAME, z + 0.04),
    part(new IcosahedronGeometry(0.06, 0), PALETTE.gold, x + SIGN_WIDTH / 2 + SIGN_FRAME, y + SIGN_HEIGHT / 2 + SIGN_FRAME, z + 0.04),
  ];
}

function stepParts(plan: FacadePlan): BufferGeometry[] {
  const { x, z } = plan.step;
  const parts = [part(box(STEP_WIDTH, STEP_HEIGHT, STEP_DEPTH), STONE, x, STEP_HEIGHT / 2, z)];
  // Striped doormat on the step.
  for (let k = 0; k < 3; k++) {
    parts.push(part(box(1.2 / 3, 0.015, 0.36), k === 1 ? PALETTE.cream : PALETTE.coral, x + (k - 1) * 0.4, STEP_HEIGHT + 0.008, z));
  }
  return parts;
}

function backWallParts(plan: FacadePlan): BufferGeometry[] {
  const { shelves, menu } = plan;
  const parts: BufferGeometry[] = [];
  const sz = shelves.z + SHELF_DEPTH / 2;
  for (const y of shelves.levels) {
    parts.push(part(box(SHELF_WIDTH, 0.05, SHELF_DEPTH), PALETTE.woodLight, shelves.x, y, sz));
    for (const side of [-1, 1]) parts.push(part(box(0.04, 0.16, SHELF_DEPTH - 0.04), PALETTE.woodDark, shelves.x + side * (SHELF_WIDTH / 2 - 0.15), y - 0.1, sz));
  }
  const lids = [PALETTE.coral, PALETTE.gold, PALETTE.mint];
  plan.jars.forEach((j, k) => {
    parts.push(
      part(cyl(0.07, 0.07, 0.17, 8), k % 2 === 0 ? PALETTE.coffee : PALETTE.woodLight, j.x, j.y + 0.11, j.z),
      part(cyl(0.065, 0.065, 0.04, 8), PALETTE.cup, j.x, j.y + 0.2, j.z),
      part(cyl(0.078, 0.078, 0.035, 8), lids[k % lids.length]!, j.x, j.y + 0.235, j.z),
    );
  });

  const mz = menu.z + 0.03;
  parts.push(
    part(box(MENU_WIDTH, MENU_HEIGHT, 0.05), PALETTE.woodDark, menu.x, menu.y, mz),
    part(box(MENU_WIDTH - 0.12, MENU_HEIGHT - 0.12, 0.06), CHALKBOARD, menu.x, menu.y, mz),
    part(box(0.6, 0.08, 0.065), PALETTE.coral, menu.x, menu.y + 0.25, mz),
  );
  for (let k = 0; k < 3; k++) {
    const ly = menu.y + 0.08 - k * 0.15;
    parts.push(part(box(0.62, 0.035, 0.065), PALETTE.cream, menu.x - 0.15, ly, mz), part(box(0.12, 0.035, 0.065), PALETTE.gold, menu.x + 0.4, ly, mz));
  }
  return parts;
}

function interiorParts(plan: FacadePlan): BufferGeometry[] {
  const { mat } = plan;
  const parts: BufferGeometry[] = [part(box(1.3, 0.02, 0.6), PALETTE.mint, mat.x, 0.012, mat.z), part(box(1.1, 0.022, 0.4), PALETTE.cream, mat.x, 0.013, mat.z)];
  for (const p of plan.pendants) {
    parts.push(
      part(cyl(0.01, 0.01, HANG_TOP - PENDANT_Y, 4), PALETTE.steelDark, p.x, (HANG_TOP + PENDANT_Y) / 2, p.z),
      part(new ConeGeometry(0.2, 0.22, 8), PALETTE.coral, p.x, PENDANT_Y, p.z),
    );
  }
  for (const f of plan.fans) {
    parts.push(
      part(cyl(0.02, 0.02, HANG_TOP - FAN_Y, 4), PALETTE.steelDark, f.x, (HANG_TOP + FAN_Y) / 2, f.z),
      part(cyl(0.1, 0.12, 0.14, 8), PALETTE.woodDark, f.x, FAN_Y + 0.02, f.z),
    );
  }
  return parts;
}

function fanBladesGeometry(): BufferGeometry {
  const parts = [part(cyl(0.08, 0.08, 0.05, 8), PALETTE.cream, 0, -0.06, 0)];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const r = 0.12 + FAN_BLADE / 2;
    parts.push(part(box(FAN_BLADE, 0.02, 0.14), PALETTE.woodLight, Math.cos(a) * r, -0.06, -Math.sin(a) * r, a, 0.12));
  }
  return merge(parts);
}

// ---------- View ----------

function staticMesh(parts: BufferGeometry[], shadows: boolean): Mesh | null {
  if (parts.length === 0) return null;
  const mesh = new Mesh(merge(parts), SHARED_MATERIAL);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** Draws the shop name on a small canvas; null without OffscreenCanvas (tests, jsdom). */
function signTexture(name: string): CanvasTexture | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(SIGN_CANVAS.width, SIGN_CANVAS.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width: w, height: h } = SIGN_CANVAS;
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e07a5f';
  for (const x of [28, w - 28]) {
    ctx.beginPath();
    ctx.arc(x, h / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  const text = name.trim() || 'Coffee';
  let size = 64;
  ctx.font = `700 ${size}px Nunito, sans-serif`;
  while (size > 24 && ctx.measureText(text).width > w - 100) {
    size -= 4;
    ctx.font = `700 ${size}px Nunito, sans-serif`;
  }
  ctx.fillStyle = '#5c3a26';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05, w - 100);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class FacadeView {
  readonly root = new Group();
  /** Blade meshes of the ceiling fans; spinning them around y animates the fans. */
  readonly fans: Mesh[] = [];
  /** One group per wall of wallSpans(), holding what hangs on that wall. */
  private readonly wallGroups: Group[] = [];
  /** Everything else built from the layout. */
  private readonly free = new Group();
  private readonly fanGeometry = fanBladesGeometry();
  private readonly signMaterial = new MeshBasicMaterial({ color: PALETTE.cream });
  private signName: string | null = null;
  private layout: ShopLayout | null = null;
  private quality: Quality;
  private plan: FacadePlan | null = null;

  constructor(quality: Quality = 'medium') {
    this.quality = quality;
    for (let i = 0; i < 5; i++) {
      const g = new Group();
      this.wallGroups.push(g);
      this.root.add(g);
    }
    this.root.add(this.free);
  }

  /** The plan of the current build, or null before the first one. */
  get current(): FacadePlan | null {
    return this.plan;
  }

  /** Rebuilds everything for a new layout; call only when the layout changed. */
  build(layout: ShopLayout): void {
    this.layout = layout;
    this.clear();
    const plan = facadePlan(layout, this.quality);
    this.plan = plan;

    const byWall: BufferGeometry[][] = [[], [], [], [], []];
    for (const w of plan.windows) byWall[w.wall]!.push(...windowParts(w, plan));
    byWall[0]!.push(...backWallParts(plan));
    byWall.forEach((parts, i) => {
      const mesh = staticMesh(parts, false);
      if (mesh) this.wallGroups[i]!.add(mesh);
    });

    const front = [...stepParts(plan), ...awningParts(plan), ...signParts(plan)];
    for (const p of plan.planters) front.push(...planterParts(p));
    this.free.add(staticMesh(front, true)!, staticMesh(interiorParts(plan), false)!);

    if (plan.pendants.length > 0) {
      const bulbs = merge(plan.pendants.map((p) => part(new IcosahedronGeometry(0.07, 0), PALETTE.bulb, p.x, PENDANT_Y - 0.12, p.z)));
      this.free.add(new Mesh(bulbs, GLOW_MATERIAL));
    }

    for (const f of plan.fans) {
      const blades = new Mesh(this.fanGeometry, SHARED_MATERIAL);
      blades.position.set(f.x, FAN_Y, f.z);
      this.fans.push(blades);
      this.free.add(blades);
    }

    const face = new Mesh(new PlaneGeometry(SIGN_WIDTH - 0.06, SIGN_HEIGHT - 0.06), this.signMaterial);
    face.position.set(plan.sign.x, plan.sign.y, plan.sign.z + 0.06);
    this.free.add(face);
  }

  /** Low drops jars, pendant lamps, the awning valance and window bars; high adds flower boxes. */
  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    if (this.layout) this.build(this.layout);
  }

  /** Shrinks the details on wall `index` with the wall, hiding them when it is down. */
  syncWall(index: number, height: number): void {
    const g = this.wallGroups[index];
    if (!g) return;
    g.scale.y = height / WALL_HEIGHT;
    g.visible = height > WALL_HIDE;
  }

  /** Redraws the sign when the shop name changes. */
  setShopName(name: string): void {
    if (name === this.signName) return;
    this.signName = name;
    const tex = signTexture(name);
    this.signMaterial.map?.dispose();
    this.signMaterial.map = tex;
    this.signMaterial.color.set(tex ? 0xffffff : PALETTE.cream);
    this.signMaterial.needsUpdate = true;
  }

  /** Whether wall `index`'s details are showing (tests). */
  wallDetailsVisible(index: number): boolean {
    return this.wallGroups[index]?.visible ?? false;
  }

  dispose(): void {
    this.clear();
    this.fanGeometry.dispose();
    this.signMaterial.map?.dispose();
    this.signMaterial.dispose();
    this.root.removeFromParent();
  }

  private clear(): void {
    const drop = (g: Group): void => {
      for (const child of g.children) {
        const geo = (child as Mesh).geometry;
        if (geo && geo !== this.fanGeometry) geo.dispose();
      }
      g.clear();
    };
    for (const g of this.wallGroups) drop(g);
    drop(this.free);
    this.fans.length = 0;
  }
}
