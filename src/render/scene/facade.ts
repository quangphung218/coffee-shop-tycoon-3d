import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { Quality } from '../../save/settings';
import {
  ART_GALLERY_SIZE,
  BOOKSHELF_SIZE,
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
import { defaultStyle, type StyleDef } from '../../sim/data/styles';
import type { ShopLayout } from '../../sim/upgrades';
import type { Vec2 } from '../../sim/types';
import { PALETTE, cssColor } from './palette';
import { GLASS_MATERIAL, GLOW_MATERIAL, SHARED_MATERIAL, WALL_HEIGHT, WALL_LOW, box, cyl, merge, part, recolor } from './parts';

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
/** Sign brightness by day, and its warm RGB gain at full evening glow (past 1 reads as lit). */
const SIGN_DAY = 0.94;
const SIGN_NIGHT: readonly [number, number, number] = [1.25, 1.12, 0.95];

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
/** Width of side room each ceiling fan covers. */
const FAN_SPACING = 4.5;
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

/** Window centres along the side and front walls, skipping spots taken by a painting, a bookshelf or the art gallery. */
export function windowSpots(layout: ShopLayout): WindowSpot[] {
  const spans = wallSpans(layout);
  const paintings = layout.decor.filter((d) => d.kind === 'painting');
  const shelves = layout.decor.filter((d) => d.kind === 'bookshelf');
  const galleries = layout.premium.filter((p) => p.kind === 'art_gallery');
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
      // Bookshelves stand against a side wall, as tall as the window.
      const shelved = !alongX && shelves.some((s) => Math.abs(s.pos.x - x) < 0.5 && Math.abs(s.pos.z - z) < (WINDOW_WIDTH + BOOKSHELF_SIZE.length) / 2);
      // The gallery frames hang on the left wall.
      const hung = !alongX && galleries.some((g) => Math.abs(g.pos.x - x) < 0.5 && Math.abs(g.pos.z - z) < (WINDOW_WIDTH + ART_GALLERY_SIZE.length) / 2);
      if (!covered && !shelved && !hung) out.push({ wall, x, z, yaw });
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
  if (expansion) {
    // About one fan per FAN_SPACING of side room, spread evenly: one up to level 2, two at levels 3 and 4.
    const width = expansion.maxX - expansion.minX;
    const n = Math.max(1, Math.round(width / FAN_SPACING));
    for (let k = 0; k < n; k++) fans.push({ x: expansion.minX + ((k + 0.5) * width) / n, z: 0.5 });
  }

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

const DOOR_LEAF_HEIGHT = 1.95;
const DOOR_STILE = 0.08;
const DOOR_TOP_RAIL = 0.1;
const DOOR_KICK = 0.3;

/** Places door leaf parts (built around the leaf centre) on the swung-open leaf. */
function onDoorLeaf(parts: BufferGeometry[]): BufferGeometry[] {
  return placed(parts, -DOOR_WIDTH / 2 + DOOR_LEAF_X, 0.99, DOOR_LEAF_Z, DOOR_LEAF_YAW);
}

/** Door frame and the leaf's frame, swung open inward; centred on the doorway at floor level. The glass is doorGlassGeometry(). */
export function doorGeometry(): BufferGeometry {
  const half = DOOR_WIDTH / 2;
  const w = DOOR_LEAF_WIDTH;
  const h = DOOR_LEAF_HEIGHT;
  const t = DOOR_LEAF_THICKNESS;
  const stile = DOOR_STILE;
  const leaf = [
    part(box(stile, h, t), PALETTE.mint, -w / 2 + stile / 2, 0, 0),
    part(box(stile, h, t), PALETTE.mint, w / 2 - stile / 2, 0, 0),
    part(box(w - 2 * stile, DOOR_TOP_RAIL, t), PALETTE.mint, 0, h / 2 - DOOR_TOP_RAIL / 2, 0),
    part(box(w - 2 * stile, DOOR_KICK, t), PALETTE.mint, 0, -h / 2 + DOOR_KICK / 2, 0),
    part(box(0.04, 0.24, t + 0.08), PALETTE.gold, w / 2 - stile - 0.05, 0, 0),
  ];
  return merge([
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, -half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_POST_WIDTH, WALL_HEIGHT, DOOR_FRAME_DEPTH), PALETTE.woodDark, half, WALL_HEIGHT / 2, 0),
    part(box(DOOR_WIDTH + DOOR_POST_WIDTH, 0.18, DOOR_FRAME_DEPTH), PALETTE.woodDark, 0, WALL_HEIGHT - 0.09, 0),
    ...onDoorLeaf(leaf),
  ]);
}

/** Glass pane of the door leaf, drawn with GLASS_MATERIAL so it glows in the evening. */
export function doorGlassGeometry(): BufferGeometry {
  const w = DOOR_LEAF_WIDTH - 2 * DOOR_STILE;
  const h = DOOR_LEAF_HEIGHT - DOOR_TOP_RAIL - DOOR_KICK;
  return merge(onDoorLeaf([part(box(w, h, DOOR_LEAF_THICKNESS * 0.5), PALETTE.glass, 0, (DOOR_KICK - DOOR_TOP_RAIL) / 2, 0)]));
}

/** Glass pane of a window; it passes through the wall so it shows on both faces. */
function windowGlass(spot: WindowSpot): BufferGeometry[] {
  return placed([part(box(WINDOW_WIDTH, WINDOW_HEIGHT, WALL_THICKNESS + 0.02), PALETTE.glass, 0, WINDOW_SILL + WINDOW_HEIGHT / 2, 0)], spot.x, 0, spot.z, spot.yaw);
}

function windowParts(spot: WindowSpot, plan: FacadePlan): BufferGeometry[] {
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  const t = WALL_THICKNESS;
  const mid = WINDOW_SILL + h / 2;
  const frame = PALETTE.woodDark;
  const parts = [
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

/** Top of the soil in a door planter, where its plant pivots when it sways. */
const PLANTER_SOIL_Y = 0.45;

function planterParts(p: Vec2): BufferGeometry[] {
  const s = PLANTER_HALF * 2;
  return [
    part(box(s, 0.42, s), PALETTE.wood, p.x, 0.21, p.z),
    part(box(s + 0.06, 0.05, s + 0.06), PALETTE.woodDark, p.x, 0.43, p.z),
    part(box(s - 0.06, 0.02, s - 0.06), PALETTE.coffee, p.x, PLANTER_SOIL_Y, p.z),
  ];
}

/** Stem and leaves of a door planter, around its pivot on the soil. */
function planterFoliageGeometry(): BufferGeometry {
  const y = PLANTER_SOIL_Y;
  return merge([
    part(cyl(0.035, 0.045, 0.45, 6), PALETTE.woodDark, 0, 0.66 - y, 0),
    part(new IcosahedronGeometry(0.34, 0), PALETTE.plant, 0, 1.02 - y, 0),
    part(new IcosahedronGeometry(0.22, 0), PALETTE.plantDark, 0.08, 1.32 - y, -0.04),
  ]);
}

/** Pivot of the valance: the awning's front edge. */
function valancePivot(plan: FacadePlan): { y: number; z: number } {
  return { y: AWNING_TOP - Math.sin(AWNING_TILT) * AWNING_DEPTH, z: plan.frontZ + Math.cos(AWNING_TILT) * AWNING_DEPTH + 0.03 };
}

/** The striped cloth hanging from the awning's front edge, around its pivot (valancePivot). */
function valanceGeometry(plan: FacadePlan): BufferGeometry {
  const { width, stripes } = plan.awning;
  const sw = width / stripes;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < stripes; i++) {
    parts.push(part(box(sw, 0.16, 0.03), i % 2 === 0 ? PALETTE.coral : PALETTE.cream, -width / 2 + (i + 0.5) * sw, -0.08, 0));
  }
  return merge(parts);
}

function awningParts(plan: FacadePlan): BufferGeometry[] {
  const { x, width, stripes } = plan.awning;
  const sw = width / stripes;
  const drop = Math.sin(AWNING_TILT) * AWNING_DEPTH;
  const reach = Math.cos(AWNING_TILT) * AWNING_DEPTH;
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < stripes; i++) {
    const color = i % 2 === 0 ? PALETTE.coral : PALETTE.cream;
    const sx = x - width / 2 + (i + 0.5) * sw;
    parts.push(part(box(sw, 0.04, AWNING_DEPTH), color, sx, AWNING_TOP - drop / 2, plan.frontZ + reach / 2 + 0.03, 0, AWNING_TILT));
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
  const parts = [part(box(STEP_WIDTH, STEP_HEIGHT, STEP_DEPTH), PALETTE.stone, x, STEP_HEIGHT / 2, z)];
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
    part(box(MENU_WIDTH - 0.12, MENU_HEIGHT - 0.12, 0.06), PALETTE.chalkboard, menu.x, menu.y, mz),
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

/**
 * Colours of the styled front parts (E-17). The default sign and awning keep
 * the scene palette exactly; another style paints the sign board and awning
 * stripes with its colour, and the sign text, dots and other stripes with its accent.
 */
export interface FacadeColors {
  awning: number;
  awningAlt: number;
  signBoard: number;
  signInk: number;
  signDots: number;
}

export const DEFAULT_FACADE_COLORS: Readonly<FacadeColors> = {
  awning: PALETTE.coral,
  awningAlt: PALETTE.cream,
  signBoard: PALETTE.cream,
  signInk: PALETTE.woodDark,
  signDots: PALETTE.coral,
};

/** The front colours for a sign and an awning style. */
export function facadeColors(sign: StyleDef, awning: StyleDef): FacadeColors {
  const defSign = sign.id === defaultStyle('sign').id;
  const defAwning = awning.id === defaultStyle('awning').id;
  const d = DEFAULT_FACADE_COLORS;
  return {
    awning: defAwning ? d.awning : awning.color,
    awningAlt: defAwning ? d.awningAlt : awning.accent,
    signBoard: defSign ? d.signBoard : sign.color,
    signInk: defSign ? d.signInk : sign.accent,
    signDots: defSign ? d.signDots : sign.accent,
  };
}

type SwatchRole = 'awning' | 'awningAlt' | 'signBoard';

/** A vertex range of a built geometry painted with one style colour. */
interface Swatch {
  geo: BufferGeometry;
  start: number;
  count: number;
  role: SwatchRole;
}

function sameColors(a: FacadeColors, b: FacadeColors): boolean {
  return a.awning === b.awning && a.awningAlt === b.awningAlt && a.signBoard === b.signBoard && a.signInk === b.signInk && a.signDots === b.signDots;
}

function staticMesh(parts: BufferGeometry[], shadows: boolean, material: Material = SHARED_MATERIAL): Mesh | null {
  if (parts.length === 0) return null;
  const mesh = new Mesh(merge(parts), material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** Draws the shop name on a small canvas; null without OffscreenCanvas (tests, jsdom). */
function signTexture(name: string, colors: FacadeColors): CanvasTexture | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(SIGN_CANVAS.width, SIGN_CANVAS.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width: w, height: h } = SIGN_CANVAS;
  ctx.fillStyle = cssColor(colors.signBoard);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = cssColor(colors.signDots);
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
  ctx.fillStyle = cssColor(colors.signInk);
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
  /** Plants in the door planters, pivoting on the soil; tilting them sways the leaves. */
  readonly foliage: Mesh[] = [];
  /** Awning valance pivoting on the awning's front edge (null without one); tilting it around x flutters it. */
  valance: Mesh | null = null;
  /** One group per wall of wallSpans(), holding what hangs on that wall. */
  private readonly wallGroups: Group[] = [];
  /** Everything else built from the layout. */
  private readonly free = new Group();
  private readonly fanGeometry = fanBladesGeometry();
  private readonly foliageGeometry = planterFoliageGeometry();
  private readonly signMaterial = new MeshBasicMaterial({ color: PALETTE.cream });
  /** Sign colour before the evening glow (white under the name texture, cream without one). */
  private readonly signBase = new Color(PALETTE.cream);
  private signName: string | null = null;
  private signGlow = 0;
  private colors: FacadeColors = { ...DEFAULT_FACADE_COLORS };
  /** Styled vertex ranges of the current build (awning stripes and valance, sign board). */
  private swatches: Swatch[] = [];
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
    const glassByWall: BufferGeometry[][] = [[], [], [], [], []];
    for (const w of plan.windows) {
      byWall[w.wall]!.push(...windowParts(w, plan));
      glassByWall[w.wall]!.push(...windowGlass(w));
    }
    byWall[0]!.push(...backWallParts(plan));
    byWall.forEach((parts, i) => {
      const mesh = staticMesh(parts, false);
      if (mesh) this.wallGroups[i]!.add(mesh);
      const glass = staticMesh(glassByWall[i]!, false, GLASS_MATERIAL);
      if (glass) this.wallGroups[i]!.add(glass);
    });

    const steps = stepParts(plan);
    const awning = awningParts(plan);
    const front = [...steps, ...awning, ...signParts(plan)];
    // Vertex ranges of the awning stripes and sign board, read before merging disposes the parts.
    const styled: Omit<Swatch, 'geo'>[] = [];
    let start = 0;
    front.forEach((p, i) => {
      const count = p.getAttribute('position').count;
      const stripe = i - steps.length;
      if (stripe >= 0 && stripe < plan.awning.stripes) styled.push({ start, count, role: stripe % 2 === 0 ? 'awning' : 'awningAlt' });
      else if (i === steps.length + awning.length + 1) styled.push({ start, count, role: 'signBoard' });
      start += count;
    });
    for (const p of plan.planters) {
      front.push(...planterParts(p));
      const leaves = new Mesh(this.foliageGeometry, SHARED_MATERIAL);
      leaves.position.set(p.x, PLANTER_SOIL_Y, p.z);
      leaves.castShadow = true;
      this.foliage.push(leaves);
      this.free.add(leaves);
    }
    const frontMesh = staticMesh(front, true)!;
    for (const s of styled) this.swatches.push({ ...s, geo: frontMesh.geometry });
    this.free.add(frontMesh, staticMesh(interiorParts(plan), false)!);

    if (plan.awning.valance) {
      const pivot = valancePivot(plan);
      this.valance = new Mesh(valanceGeometry(plan), SHARED_MATERIAL);
      const geo = this.valance.geometry;
      const perStripe = geo.getAttribute('position').count / plan.awning.stripes;
      for (let i = 0; i < plan.awning.stripes; i++) {
        this.swatches.push({ geo, start: i * perStripe, count: perStripe, role: i % 2 === 0 ? 'awning' : 'awningAlt' });
      }
      this.valance.position.set(plan.awning.x, pivot.y, pivot.z);
      this.valance.castShadow = true;
      this.free.add(this.valance);
    }

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
    this.paintSwatches();
  }

  /**
   * Wears a sign and awning style (E-17) by repainting the colours of the
   * parts already built and redrawing the sign texture: no mesh, material
   * or draw call is added.
   */
  setColors(colors: FacadeColors): void {
    const old = this.colors;
    if (sameColors(old, colors)) return;
    this.colors = { ...colors };
    this.paintSwatches();
    if (old.signBoard !== colors.signBoard || old.signInk !== colors.signInk || old.signDots !== colors.signDots) this.drawSign();
  }

  /** Front colours worn now (tests). */
  get currentColors(): Readonly<FacadeColors> {
    return this.colors;
  }

  private paintSwatches(): void {
    for (const s of this.swatches) recolor(s.geo, this.colors[s.role], s.start, s.count);
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
    this.drawSign();
  }

  private drawSign(): void {
    const tex = signTexture(this.signName ?? '', this.colors);
    this.signMaterial.map?.dispose();
    this.signMaterial.map = tex;
    // White lets the name texture show its own palette colours.
    if (tex) this.signBase.setRGB(1, 1, 1);
    else this.signBase.set(this.colors.signBoard);
    this.setSignGlow(this.signGlow);
    this.signMaterial.needsUpdate = true;
  }

  /**
   * Lights the sign for the evening: `glow` 0 (day) leaves it a little below
   * full white so it sits in the lit scene, 1 (night) pushes it past white
   * toward warm, so it reads as lit from inside.
   */
  setSignGlow(glow: number): void {
    const g = Math.min(1, Math.max(0, glow));
    this.signGlow = g;
    this.signMaterial.color.setRGB(
      this.signBase.r * (SIGN_DAY + (SIGN_NIGHT[0] - SIGN_DAY) * g),
      this.signBase.g * (SIGN_DAY + (SIGN_NIGHT[1] - SIGN_DAY) * g),
      this.signBase.b * (SIGN_DAY + (SIGN_NIGHT[2] - SIGN_DAY) * g),
    );
  }

  /** Current sign colour (tests). */
  get signColor(): Color {
    return this.signMaterial.color;
  }

  /** Whether wall `index`'s details are showing (tests). */
  wallDetailsVisible(index: number): boolean {
    return this.wallGroups[index]?.visible ?? false;
  }

  dispose(): void {
    this.clear();
    this.fanGeometry.dispose();
    this.foliageGeometry.dispose();
    this.signMaterial.map?.dispose();
    this.signMaterial.dispose();
    this.root.removeFromParent();
  }

  private clear(): void {
    const drop = (g: Group): void => {
      for (const child of g.children) {
        const geo = (child as Mesh).geometry;
        if (geo && geo !== this.fanGeometry && geo !== this.foliageGeometry) geo.dispose();
      }
      g.clear();
    };
    for (const g of this.wallGroups) drop(g);
    drop(this.free);
    this.fans.length = 0;
    this.foliage.length = 0;
    this.valance = null;
    this.swatches = [];
  }
}
