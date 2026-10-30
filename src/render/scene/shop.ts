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
  RingGeometry,
  type Scene,
} from 'three';
import type { Quality } from '../../save/settings';
import { UPGRADES } from '../../sim/data/upgrades';
import {
  ART_GALLERY_SIZE,
  BACK_COUNTER_DEPTH,
  BACK_COUNTER_TOP_DEPTH,
  BACK_COUNTER_TOP_EXTRA,
  BACK_COUNTER_Z,
  BOOKSHELF_SIZE,
  CHAIR_OFFSET,
  CHAIR_SIZE,
  PARASOL_POLE_RADIUS,
  PIANO_SIZE,
  PLANT_RADIUS,
  RECORD_PLAYER_MARGIN,
  SOFA_SIZE,
  TABLE_RADIUS,
  WALL_THICKNESS,
  backCounterSpan,
  wallSpans,
} from '../../sim/nav/footprints';
import { getShopLayout, type Area, type DecorKind, type MachineKind, type ShopLayout } from '../../sim/upgrades';
import type { GameState, StyleSlot, UpgradeId } from '../../sim/types';
import { STYLE_SLOTS, styleById, type StyleDef } from '../../sim/data/styles';
import { chosenStyles } from '../../sim/styles';
import { BACK_COUNTER_HEIGHT, COLD_BREW_TOWER_HEIGHT, COUNTER_HEIGHT, counterGeometry, machineGeometry } from './equipment';
import { FacadeView, doorGeometry, doorGlassGeometry, facadeColors } from './facade';
import { GLASS_MATERIAL, GLOW_MATERIAL, PALETTE, SHARED_MATERIAL, WALL_HEIGHT, WALL_LOW, WOOD_MATERIAL, box, cyl, merge, part, recolor } from './parts';

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

/** Centre height of the neon board: level with the middle of the front windows it hangs in front of. */
const NEON_Y = 1.45;
const NEON_WIDTH = 1.1;
const NEON_HEIGHT = 0.5;
/** Neon cords reach up to here (there is no ceiling; matches the lamp cords). */
const NEON_CORD_TOP = 3.4;

/**
 * Board of a neon sign, hung on two cords just inside the front wall so it
 * still shows when that wall lowers; centred on its slot at floor level. The
 * glowing tubes are neonTubeGeometry(). Tier 2 adds a steel frame and cords, tier 3 a gold one.
 */
function neonGeometry(tier: LookTier): BufferGeometry {
  const trim = tier === 2 ? PALETTE.steel : PALETTE.gold;
  const cord = NEON_CORD_TOP - (NEON_Y + NEON_HEIGHT / 2);
  const parts = [part(box(NEON_WIDTH, NEON_HEIGHT, 0.04), PALETTE.chalkboard, 0, NEON_Y, 0)];
  for (const side of [-1, 1]) {
    parts.push(part(tube(0.012, 0.012, cord, 4), tier === 1 ? PALETTE.woodDark : trim, side * (NEON_WIDTH / 2 - 0.1), NEON_Y + NEON_HEIGHT / 2 + cord / 2, 0));
  }
  if (tier >= 2) parts.push(part(box(NEON_WIDTH + 0.08, NEON_HEIGHT + 0.08, 0.03), trim, 0, NEON_Y, 0));
  return merge(parts);
}

/**
 * Glowing tubes of a neon sign (a coffee cup with steam and two lines of
 * script), drawn with GLASS_MATERIAL so they light up with the evening glow.
 * They pass through the board, so both faces show. Tier 2 underlines the
 * script, tier 3 adds a gold star.
 */
function neonTubeGeometry(tier: LookTier): BufferGeometry {
  const t = 0.035;
  const d = 0.08;
  const y = NEON_Y;
  const cx = -0.22;
  const parts = [
    part(box(t, 0.24, d), PALETTE.coral, cx - 0.13, y - 0.02, 0),
    part(box(t, 0.24, d), PALETTE.coral, cx + 0.13, y - 0.02, 0),
    part(box(0.26 + t, t, d), PALETTE.coral, cx, y - 0.14, 0),
    part(box(t, 0.1, d), PALETTE.coral, cx + 0.21, y, 0),
    part(box(t, 0.1, d), PALETTE.cream, cx - 0.05, y + 0.17, 0, 0, 0, 0.35),
    part(box(t, 0.1, d), PALETTE.cream, cx + 0.05, y + 0.17, 0, 0, 0, 0.35),
    part(box(0.36, t, d), PALETTE.mint, 0.25, y + 0.06, 0),
    part(box(0.26, t, d), PALETTE.mint, 0.2, y - 0.06, 0),
  ];
  if (tier >= 2) parts.push(part(box(0.9, t * 0.7, d), PALETTE.coral, 0, y - 0.21, 0));
  if (tier === 3) parts.push(part(new OctahedronGeometry(0.06, 0), PALETTE.gold, 0.43, y + 0.15, 0));
  return merge(parts);
}

const BOOKSHELF_HEIGHT = 1.7;
/** Centre heights of the bottom, middle and top shelf boards. */
const BOOKSHELF_BOARDS: readonly number[] = [0.06, 0.6, 1.14, BOOKSHELF_HEIGHT - 0.02];

/**
 * Bookshelf facing +z, `BOOKSHELF_SIZE.length` wide and `depth` deep, with
 * three rows of books; turned to face the room against a side wall. Tier 2
 * adds a steel plinth and cap and more books, tier 3 a gold plinth and cap and a small plant on top.
 */
function bookshelfGeometry(tier: LookTier): BufferGeometry {
  const w = BOOKSHELF_SIZE.length;
  const d = BOOKSHELF_SIZE.depth;
  const h = BOOKSHELF_HEIGHT;
  const t = 0.04;
  const frame = tier === 3 ? PALETTE.woodDark : PALETTE.wood;
  const parts = [
    part(box(t, h, d), frame, -w / 2 + t / 2, h / 2, 0),
    part(box(t, h, d), frame, w / 2 - t / 2, h / 2, 0),
    part(box(w - 2 * t, h, t), PALETTE.woodDark, 0, h / 2, -d / 2 + t / 2),
  ];
  for (const y of BOOKSHELF_BOARDS) parts.push(part(box(w - 2 * t, t, d - t), frame, 0, y, t / 2));
  const spines = [PALETTE.coral, PALETTE.mint, PALETTE.gold, PALETTE.cream];
  for (let row = 0; row < 3; row++) {
    const base = BOOKSHELF_BOARDS[row]! + t / 2;
    parts.push(
      part(box(0.42, 0.36, d - 0.1), spines[row % spines.length]!, -0.22, base + 0.18, t / 2),
      part(box(0.28, 0.3, d - 0.1), spines[(row + 1) % spines.length]!, 0.2, base + 0.15, t / 2),
    );
  }
  if (tier >= 2) {
    const trim = tier === 2 ? PALETTE.steel : PALETTE.gold;
    parts.push(part(box(w, 0.06, d), trim, 0, 0.03, 0), part(box(w, 0.04, d), trim, 0, h + 0.02, 0));
  }
  if (tier === 2) {
    const base = BOOKSHELF_BOARDS[0]! + t / 2;
    parts.push(part(box(0.12, 0.32, d - 0.12), PALETTE.coral, 0.42, base + 0.16, t / 2), part(box(0.14, 0.26, d - 0.12), PALETTE.mint, 0.42, BOOKSHELF_BOARDS[1]! + t / 2 + 0.13, t / 2));
  } else if (tier === 3) {
    parts.push(part(new IcosahedronGeometry(0.13, 0), PALETTE.plant, 0.35, h + 0.15, 0), part(box(0.12, 0.32, d - 0.12), PALETTE.coral, 0.42, BOOKSHELF_BOARDS[0]! + t / 2 + 0.16, t / 2));
  }
  return merge(parts);
}

/** Record player body, narrow enough to stay on the back counter that runs RECORD_PLAYER_MARGIN past its centre. */
const RECORD_PLAYER_WIDTH = 2 * RECORD_PLAYER_MARGIN - 0.06;

/**
 * Record player facing +z, standing on its base (placed on the back counter
 * top). Tier 2 adds a steel plate and a steel horn, tier 3 a gold plate and a bigger gold horn.
 */
function recordPlayerGeometry(tier: LookTier): BufferGeometry {
  const parts = [
    part(box(RECORD_PLAYER_WIDTH, 0.1, 0.4), tier === 3 ? PALETTE.woodDark : PALETTE.woodLight, 0, 0.05, 0),
    part(cyl(0.16, 0.16, 0.02, 10), PALETTE.chalkboard, -0.06, 0.11, 0.02),
    part(cyl(0.05, 0.05, 0.025, 6), PALETTE.coral, -0.06, 0.115, 0.02),
    part(box(0.03, 0.03, 0.22), PALETTE.steelDark, 0.17, 0.13, 0, 0.4),
  ];
  if (tier >= 2) {
    const trim = tier === 2 ? PALETTE.steel : PALETTE.gold;
    const r = tier === 2 ? 0.12 : 0.14;
    // Horn mouth turned up and toward the room.
    parts.push(
      part(box(RECORD_PLAYER_WIDTH + 0.02, 0.02, 0.42), trim, 0, 0.01, 0),
      part(tube(0.015, 0.015, 0.2, 4), trim, 0.14, 0.2, -0.13),
      part(new ConeGeometry(r, 0.24, 8, 1, true), trim, 0.14, 0.38, -0.08, 0, -2.5),
    );
  }
  return merge(parts);
}

/**
 * Sofa `SOFA_SIZE.width` wide and `depth` deep, its back toward -z (the side
 * room's back wall). Tier 2 stands on steel rails with a cushion, tier 3 is
 * brown leather on gold rails with a gold top rail.
 */
function sofaGeometry(tier: LookTier): BufferGeometry {
  const w = SOFA_SIZE.width;
  const d = SOFA_SIZE.depth;
  const body = tier === 3 ? PALETTE.coffee : PALETTE.coral;
  const lift = tier === 1 ? 0 : 0.08;
  const seat = 0.4;
  const parts = [
    part(box(w, seat - lift, d), body, 0, lift + (seat - lift) / 2, 0),
    part(box(w, 0.5, 0.18), body, 0, seat + 0.25, -d / 2 + 0.09),
    part(box(0.16, 0.25, d - 0.18), body, -w / 2 + 0.08, seat + 0.125, 0.09),
    part(box(0.16, 0.25, d - 0.18), body, w / 2 - 0.08, seat + 0.125, 0.09),
  ];
  const cushion = (w - 0.32) / 2 - 0.02;
  for (const side of [-1, 1]) parts.push(part(box(cushion, 0.1, d - 0.22), PALETTE.cream, (side * (w - 0.32)) / 4, seat + 0.05, 0.1));
  if (tier >= 2) {
    const trim = tier === 2 ? PALETTE.steel : PALETTE.gold;
    for (const side of [-1, 1]) parts.push(part(box(w - 0.1, lift, 0.06), trim, 0, lift / 2, side * (d / 2 - 0.08)));
  }
  if (tier === 2) parts.push(part(box(0.3, 0.26, 0.1), PALETTE.mint, -w / 2 + 0.36, seat + 0.2, -d / 2 + 0.24));
  else if (tier === 3) parts.push(part(box(w, 0.05, 0.2), PALETTE.gold, 0, seat + 0.52, -d / 2 + 0.1));
  return merge(parts);
}

/** Ceiling height in the shop: the cords of lamps, neon signs and the chandelier hang from here (there is no ceiling mesh). */
export const CEILING_Y = NEON_CORD_TOP;
/** Chandelier ring, hung just under the ceiling: well above the walls, pendant lamps and ceiling fans (2,6). */
const CHANDELIER_RING_Y = CEILING_Y - 0.5;
/** Lowest point of the chandelier's crystals. */
export const CHANDELIER_BOTTOM_Y = CHANDELIER_RING_Y - 0.18;
const CHANDELIER_RADIUS = 0.45;
const CHANDELIER_CRYSTALS = 8;
/** Soft shadow blob on the floor under the chandelier, inside the aisle (clear of the chairs) and apart from the lamp body. */
export const CHANDELIER_SHADOW_RADIUS = CHANDELIER_RADIUS + 0.1;
/** Just above the floor top (y = 0) and under the light pools (ambient.ts POOL_Y), so it never z-fights the floor. */
const CHANDELIER_SHADOW_Y = 0.008;
/** Darkest the blob gets at its middle, as a fraction of the floor colour. */
const CHANDELIER_SHADOW_DARK = 0.72;

/**
 * Shadow blob: a flat disc whose vertex colour fades from a darker floor in
 * the middle to the floor colour at its rim, so it reads as a soft shadow on
 * the shared opaque material (no extra mesh, material or draw call).
 */
function chandelierShadowGeometry(): BufferGeometry {
  const rings = 4;
  const g = part(new RingGeometry(0, CHANDELIER_SHADOW_RADIUS, 16, rings), PALETTE.floor, 0, CHANDELIER_SHADOW_Y, 0, 0, -Math.PI / 2);
  const pos = g.getAttribute('position');
  const color = g.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / CHANDELIER_SHADOW_RADIUS);
    // Flat core to 30% of the radius, then a smooth fade to the bare floor at the rim.
    const f = Math.max(0, (t - 0.3) / 0.7);
    const k = CHANDELIER_SHADOW_DARK + (1 - CHANDELIER_SHADOW_DARK) * f * f * (3 - 2 * f);
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
  return g;
}

/** Chandelier frame: a gold crown of two rings and four arms on a cord up to the ceiling, plus its shadow blob on the floor. */
function chandelierGeometry(): BufferGeometry {
  const y = CHANDELIER_RING_Y;
  const cord = CEILING_Y - (y + 0.3);
  return merge([
    part(tube(0.012, 0.012, cord, 4), PALETTE.gold, 0, y + 0.3 + cord / 2, 0),
    part(tube(CHANDELIER_RADIUS, CHANDELIER_RADIUS, 0.04, 10), PALETTE.gold, 0, y, 0),
    part(tube(CHANDELIER_RADIUS * 0.55, CHANDELIER_RADIUS * 0.55, 0.04, 8), PALETTE.gold, 0, y + 0.16, 0),
    part(box(2 * CHANDELIER_RADIUS, 0.025, 0.025), PALETTE.gold, 0, y + 0.08, 0),
    part(box(0.025, 0.025, 2 * CHANDELIER_RADIUS), PALETTE.gold, 0, y + 0.08, 0),
    part(new ConeGeometry(0.1, 0.18, 6), PALETTE.gold, 0, y + 0.22, 0),
    chandelierShadowGeometry(),
  ]);
}

/** Glowing crystals hanging round the chandelier's ring and one drop in the middle, the lowest at CHANDELIER_BOTTOM_Y. */
function crystalGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < CHANDELIER_CRYSTALS; k++) {
    const a = (k / CHANDELIER_CRYSTALS) * Math.PI * 2;
    parts.push(part(new OctahedronGeometry(0.06, 0), PALETTE.bulb, Math.cos(a) * CHANDELIER_RADIUS, CHANDELIER_RING_Y - 0.08, Math.sin(a) * CHANDELIER_RADIUS));
  }
  parts.push(part(new OctahedronGeometry(0.08, 0), PALETTE.bulb, 0, CHANDELIER_BOTTOM_Y + 0.08, 0));
  return merge(parts);
}

/** Marble slab laid on a table top (any tier), cream with stone veins; the second level adds a gold rim. */
function marbleTopGeometry(level: number): BufferGeometry {
  const parts = [
    part(cyl(TABLE_RADIUS, TABLE_RADIUS, 0.025, 10), PALETTE.cream, 0, TABLE_TOP_Y + 0.0125, 0),
    part(box(0.5, 0.004, 0.02), PALETTE.stone, -0.04, TABLE_TOP_Y + 0.026, 0.08, 0.5),
    part(box(0.36, 0.004, 0.015), PALETTE.stone, 0.06, TABLE_TOP_Y + 0.026, -0.12, -0.4),
  ];
  if (level >= 2) parts.push(part(tube(TABLE_RADIUS + 0.01, TABLE_RADIUS + 0.01, 0.03, 10), PALETTE.gold, 0, TABLE_TOP_Y + 0.0125, 0));
  return merge(parts);
}

/** Bottom of the gallery frames: above the chair backs and the bookshelves' reach. */
const GALLERY_Y = 1.1;

/** Art gallery facing +z, `ART_GALLERY_SIZE.length` wide: a large framed canvas between two smaller ones under a gold picture rail. */
function galleryGeometry(): BufferGeometry {
  const half = ART_GALLERY_SIZE.length / 2;
  const d = ART_GALLERY_SIZE.depth;
  const frame = (w: number, h: number, x: number, canvas: number, accent: number): BufferGeometry[] => {
    const y = GALLERY_Y + h / 2;
    return [
      part(box(w, h, d * 0.6), PALETTE.gold, x, y, -d * 0.2),
      part(box(w - 0.08, h - 0.08, d * 0.8), canvas, x, y, -d * 0.1),
      part(box((w - 0.08) * 0.5, (h - 0.08) * 0.35, d), accent, x - 0.04, y + 0.06, 0),
    ];
  };
  const side = 0.5;
  return merge([
    ...frame(0.7, 0.9, 0, PALETTE.cream, PALETTE.coral),
    ...frame(side, 0.62, -half + side / 2, PALETTE.mint, PALETTE.cream),
    ...frame(side, 0.62, half - side / 2, PALETTE.coffee, PALETTE.gold),
    part(box(ART_GALLERY_SIZE.length, 0.03, d * 0.6), PALETTE.gold, 0, GALLERY_Y + 1.02, -d * 0.2),
  ]);
}

/** Top of the piano lid: below the neon board that hangs over it on the front wall. */
export const PIANO_HEIGHT = 1.12;

/**
 * Upright piano `PIANO_SIZE.width` wide and `depth` deep, its back toward +z
 * (the front wall) and the keys toward the room; black body with gold trim.
 */
function pianoGeometry(): BufferGeometry {
  const w = PIANO_SIZE.width;
  const d = PIANO_SIZE.depth;
  const h = PIANO_HEIGHT;
  const back = 0.3;
  const bz = d / 2 - back / 2;
  const kz = -d / 2 + (d - back) / 2;
  return merge([
    part(box(w, h - 0.03, back), PALETTE.chalkboard, 0, (h - 0.03) / 2, bz),
    part(box(w, 0.03, back), PALETTE.gold, 0, h - 0.015, bz),
    part(box(w, 0.08, d - back), PALETTE.chalkboard, 0, 0.72, kz),
    part(box(w - 0.16, 0.03, (d - back) * 0.7), PALETTE.cream, 0, 0.775, kz - 0.02),
    part(box(w - 0.2, 0.02, (d - back) * 0.3), PALETTE.chalkboard, 0, 0.795, kz + 0.05),
    part(box(0.06, 0.68, 0.06), PALETTE.chalkboard, -w / 2 + 0.05, 0.34, -d / 2 + 0.04),
    part(box(0.06, 0.68, 0.06), PALETTE.chalkboard, w / 2 - 0.05, 0.34, -d / 2 + 0.04),
    part(box(0.5, 0.22, 0.02), PALETTE.woodDark, 0, 0.98, d / 2 - back - 0.01),
  ]);
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
  neon: neonGeometry,
  neonTube: neonTubeGeometry,
  bookshelf: bookshelfGeometry,
  recordPlayer: recordPlayerGeometry,
  sofa: sofaGeometry,
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

/** Where an upgrade's sparkle goes and which mesh (if a single one) bounces about its base at `pivotY`. */
export interface UpgradeAnchor {
  x: number;
  y: number;
  z: number;
  object: Object3D | null;
  pivotY: number;
}

const MACHINE_FOR_UPGRADE: Partial<Record<UpgradeId, MachineKind>> = {
  better_machine: 'espresso',
  fast_machine: 'fast',
  grinder: 'grinder',
  pastry_case: 'pastry_case',
  blender: 'blender',
  ice_maker: 'ice_maker',
  dishwasher: 'dishwasher',
  cold_brew_tower: 'cold_brew_tower',
  oven: 'oven',
};

/** Sparkle height over a machine: half a metre above the back counter, the top of the frame for the tall cold brew tower. */
const MACHINE_SPARKLE_Y: Partial<Record<MachineKind, number>> = {
  cold_brew_tower: BACK_COUNTER_HEIGHT + COLD_BREW_TOWER_HEIGHT,
};

const DECOR_FOR_UPGRADE = {
  plants: 'plant',
  paintings: 'painting',
  lights: 'light',
  neon_sign: 'neon',
  bookshelf: 'bookshelf',
  record_player: 'record_player',
  sofa_corner: 'sofa',
} as const satisfies Partial<Record<UpgradeId, DecorKind>>;

/** Sparkle height over each decor kind: the foliage, the painting hook, the bulb, the neon board, the shelves, the turntable, the seat. */
const DECOR_SPARKLE_Y: Record<(typeof DECOR_FOR_UPGRADE)[keyof typeof DECOR_FOR_UPGRADE], number> = {
  plant: 1,
  painting: 1.45,
  light: 2.28,
  neon: NEON_Y,
  bookshelf: 1,
  record_player: BACK_COUNTER_HEIGHT + 0.3,
  sofa: 0.7,
};

/** Sparkle height over the premium decor: the chandelier's ring, the middle of the gallery, the piano lid. */
const PREMIUM_SPARKLE_Y: Record<'chandelier' | 'art_gallery' | 'grand_piano', number> = {
  chandelier: CHANDELIER_RING_Y,
  art_gallery: GALLERY_Y + 0.5,
  grand_piano: PIANO_HEIGHT + 0.2,
};

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
  /** Centre of the building (indoor room and side room) and extent of the built shop with its patio, for the camera. */
  readonly center = { x: 0, z: 0 };
  readonly extent = { minX: -5, maxX: 5, minZ: -5, maxZ: 9 };

  private key = -1;
  private layout: ShopLayout | null = null;
  /** Ids of the styles last painted, joined in STYLE_SLOTS order ('' before the first update). */
  private styleKey = '';
  private readonly stylePreview: Partial<Record<StyleSlot, string>> = {};
  private readonly dummy = new Object3D();

  private readonly geo = {
    unit: part(box(1, 1, 1), PALETTE.floor),
    patio: part(box(1, 1, 1), PALETTE.patio),
    wall: part(box(1, 1, 1), PALETTE.wall),
    coin: coinGeometry(),
    cup: cupGeometry(),
    door: doorGeometry(),
    doorGlass: doorGlassGeometry(),
    chandelier: chandelierGeometry(),
    crystal: crystalGeometry(),
    gallery: galleryGeometry(),
    piano: pianoGeometry(),
    marble1: marbleTopGeometry(1),
    marble2: marbleTopGeometry(2),
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
  private readonly neons: InstancedMesh;
  private readonly neonTubes: InstancedMesh;
  private readonly bookshelves: InstancedMesh;
  private readonly recordPlayers: InstancedMesh;
  private readonly sofas: InstancedMesh;
  /** E-05 premium decor: five meshes with the shared materials, drawn only while owned. */
  private readonly chandeliers: InstancedMesh;
  private readonly crystals: InstancedMesh;
  private readonly galleries: InstancedMesh;
  private readonly pianos: InstancedMesh;
  /** Marble slab on every table while marble_tables is owned; sized with the tables in allocTables. */
  private marbleTops!: InstancedMesh;

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
    this.neons = instanced(this.tiered('neon', 1), SHARED_MATERIAL, DECOR_CAPACITY, false);
    // The tubes glow with the window glass in the evening (ambient.ts), without a light of their own.
    this.neonTubes = instanced(this.tiered('neonTube', 1), GLASS_MATERIAL, DECOR_CAPACITY, false);
    this.bookshelves = instanced(this.tiered('bookshelf', 1), SHARED_MATERIAL, DECOR_CAPACITY, true);
    this.recordPlayers = instanced(this.tiered('recordPlayer', 1), SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.sofas = instanced(this.tiered('sofa', 1), SHARED_MATERIAL, DECOR_CAPACITY, true);
    this.root.add(this.plants, this.paintings, this.lamps, this.bulbs, this.neons, this.neonTubes, this.bookshelves, this.recordPlayers, this.sofas);
    this.chandeliers = instanced(this.geo.chandelier, SHARED_MATERIAL, DECOR_CAPACITY, false);
    // The crystals glow like the lamp bulbs, without a light of their own.
    this.crystals = instanced(this.geo.crystal, GLOW_MATERIAL, DECOR_CAPACITY, false);
    this.galleries = instanced(this.geo.gallery, SHARED_MATERIAL, DECOR_CAPACITY, false);
    this.pianos = instanced(this.geo.piano, SHARED_MATERIAL, DECOR_CAPACITY, true);
    this.root.add(this.chandeliers, this.crystals, this.galleries, this.pianos);

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
    this.applyStyles(state);
    this.updateIcons(state, time);
    this.updateWalls(dt, cameraYaw);
    return changed;
  }

  /** Layout of the current build (a new object after every rebuild), or null before the first update. */
  get current(): ShopLayout | null {
    return this.layout;
  }

  /**
   * Where the piece an upgrade changed stands, for the purchase sparkle: the
   * machine of that kind, the counter, the newest table or decor slot, or the
   * middle of the side room. `object` is the single mesh to bounce (machines
   * and the counter); instanced pieces only get the position. Null before
   * the first update or when the piece is not drawn (window_bar).
   */
  upgradeAnchor(id: UpgradeId): UpgradeAnchor | null {
    const layout = this.layout;
    if (!layout) return null;
    const kind = MACHINE_FOR_UPGRADE[id];
    if (kind) {
      const i = layout.machines.findIndex((m) => m.kind === kind);
      if (i < 0) return null;
      const m = layout.machines[i]!;
      return { x: m.pos.x, y: MACHINE_SPARKLE_Y[kind] ?? BACK_COUNTER_HEIGHT + 0.5, z: m.pos.z, object: this.machines.children[i] ?? null, pivotY: BACK_COUNTER_HEIGHT };
    }
    switch (id) {
      case 'big_counter': {
        const { pos } = layout.counter;
        return { x: pos.x, y: COUNTER_HEIGHT + 0.3, z: pos.z, object: this.counter, pivotY: 0 };
      }
      case 'tables':
      case 'outdoor_seating': {
        const outdoor = id === 'outdoor_seating';
        let newest: ShopLayout['tables'][number] | null = null;
        for (const t of layout.tables) {
          if ((t.zone === 'outdoor') === outdoor && (!newest || t.id > newest.id)) newest = t;
        }
        return newest ? { x: newest.pos.x, y: TABLE_TOP_Y + 0.3, z: newest.pos.z, object: null, pivotY: 0 } : null;
      }
      case 'plants':
      case 'paintings':
      case 'lights':
      case 'neon_sign':
      case 'bookshelf':
      case 'record_player':
      case 'sofa_corner': {
        const decor = DECOR_FOR_UPGRADE[id];
        const items = layout.decor.filter((d) => d.kind === decor).slice(0, DECOR_CAPACITY);
        const last = items[items.length - 1];
        return last ? { x: last.pos.x, y: DECOR_SPARKLE_Y[decor], z: last.pos.z, object: null, pivotY: 0 } : null;
      }
      case 'chandelier':
      case 'art_gallery':
      case 'grand_piano': {
        const items = layout.premium.filter((p) => p.kind === id).slice(0, DECOR_CAPACITY);
        const last = items[items.length - 1];
        return last ? { x: last.pos.x, y: PREMIUM_SPARKLE_Y[id], z: last.pos.z, object: null, pivotY: 0 } : null;
      }
      case 'marble_tables': {
        // The middle of the room's tables; every top changed at once.
        const t = layout.premiumLevel.marble_tables > 0 ? layout.tables[Math.floor(layout.tables.length / 2)] : undefined;
        return t ? { x: t.pos.x, y: TABLE_TOP_Y + 0.3, z: t.pos.z, object: null, pivotY: 0 } : null;
      }
      case 'expand_area': {
        const e = layout.expansion;
        return e ? { x: (e.minX + e.maxX) / 2, y: 1, z: (e.minZ + e.maxZ) / 2, object: null, pivotY: 0 } : null;
      }
      default:
        return null;
    }
  }

  /**
   * Shows style `id` on `slot` instead of the chosen one, without buying it
   * (the style picker); null goes back to the chosen style. Ids of another
   * slot or unknown ids are ignored. Applied on the next update().
   */
  setStylePreview(slot: StyleSlot, id: string | null): void {
    const style = id === null ? undefined : styleById(id);
    if (style && style.slot === slot) this.stylePreview[slot] = style.id;
    else delete this.stylePreview[slot];
  }

  /** The style each slot is drawn with now: the preview, or else the chosen style. */
  shownStyles(state: Pick<GameState, 'styles'>): Record<StyleSlot, StyleDef> {
    const styles = chosenStyles(state);
    for (const slot of STYLE_SLOTS) {
      const id = this.stylePreview[slot];
      if (id) styles[slot] = styleById(id)!;
    }
    return styles;
  }

  /** Paints the shown wall, floor, sign and awning styles onto the existing parts (colours only, E-17). */
  private applyStyles(state: GameState): void {
    const styles = this.shownStyles(state);
    const key = STYLE_SLOTS.map((slot) => styles[slot].id).join();
    if (key === this.styleKey) return;
    this.styleKey = key;
    recolor(this.geo.wall, styles.wall.color);
    recolor(this.geo.unit, styles.floor.color);
    this.facade.setColors(facadeColors(styles.sign, styles.awning));
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
  counts(): { tables: number; chairs: number; parasols: number; coins: number; cups: number; machines: number; decor: number; premium: number } {
    return {
      tables: this.tables.count,
      chairs: this.chairs.count,
      parasols: this.parasols.count,
      coins: this.coins.count,
      cups: this.cups.count,
      machines: this.machines.children.length,
      decor:
        this.plants.count +
        this.paintings.count +
        this.lamps.count +
        this.neons.count +
        this.bookshelves.count +
        this.recordPlayers.count +
        this.sofas.count,
      // Chandeliers, gallery walls and pianos (layout.premium), plus one marble top per table.
      premium: this.chandeliers.count + this.galleries.count + this.pianos.count + this.marbleTops.count,
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
    this.buildPremium(layout);
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

    // The camera's home: the middle of the building, side room included, so a reset frames a grown shop too.
    this.center.x = (minX + maxX) / 2;
    this.center.z = (minZ + maxZ) / 2;
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
    const span = backCounterSpan(layout);
    // The span is in the signature: the record player stretches the back counter without changing the machines.
    const sig = `${layout.machines.map((m) => `${m.kind}${m.quality}t${m.tier}@${m.pos.x},${m.pos.z}`).join(';')}|${span?.minX},${span?.maxX}`;
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
    const old = [this.tables, this.chairs, this.parasols, this.coins, this.cups, this.marbleTops];
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
    // buildPremium sets the level geometry right after a reallocation.
    this.marbleTops = instanced(this.geo.marble1, SHARED_MATERIAL, capacity, false);
    // Icons move every frame; skip culling instead of recomputing bounds.
    this.coins.frustumCulled = false;
    this.cups.frustumCulled = false;
    this.tableIds = new Array<number>(capacity).fill(-1);
    this.chairTableIds = new Array<number>(capacity * 2).fill(-1);
    this.parasolTableIds = new Array<number>(capacity).fill(-1);
    this.coinTableIds = new Array<number>(capacity).fill(-1);
    this.cupTableIds = new Array<number>(capacity * MAX_CUPS_PER_TABLE).fill(-1);
    this.root.add(this.tables, this.chairs, this.parasols, this.coins, this.cups, this.marbleTops);
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
    const { plant, painting, light, neon, bookshelf, record_player, sofa } = layout.decorTier;
    this.setTier(this.plants, 'plant', plant);
    this.setTier(this.paintings, 'painting', painting);
    this.setTier(this.lamps, 'lamp', light);
    this.setTier(this.bulbs, 'bulb', light);
    this.setTier(this.neons, 'neon', neon);
    this.setTier(this.neonTubes, 'neonTube', neon);
    this.setTier(this.bookshelves, 'bookshelf', bookshelf);
    this.setTier(this.recordPlayers, 'recordPlayer', record_player);
    this.setTier(this.sofas, 'sofa', sofa);
    const d = this.dummy;
    let plants = 0;
    let paintings = 0;
    let lamps = 0;
    let neons = 0;
    let shelves = 0;
    let players = 0;
    let sofas = 0;
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
      } else if (item.kind === 'neon' && neons < DECOR_CAPACITY) {
        d.position.set(item.pos.x, 0, item.pos.z);
        d.updateMatrix();
        this.neons.setMatrixAt(neons, d.matrix);
        this.neonTubes.setMatrixAt(neons++, d.matrix);
      } else if (item.kind === 'bookshelf' && shelves < DECOR_CAPACITY) {
        // Against a side wall, the shelves facing the room.
        d.position.set(item.pos.x, 0, item.pos.z);
        d.rotation.set(0, item.pos.x < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        d.updateMatrix();
        this.bookshelves.setMatrixAt(shelves++, d.matrix);
      } else if (item.kind === 'record_player' && players < DECOR_CAPACITY) {
        d.position.set(item.pos.x, BACK_COUNTER_HEIGHT, item.pos.z);
        d.updateMatrix();
        this.recordPlayers.setMatrixAt(players++, d.matrix);
      } else if (item.kind === 'sofa' && sofas < DECOR_CAPACITY) {
        d.position.set(item.pos.x, 0, item.pos.z);
        d.updateMatrix();
        this.sofas.setMatrixAt(sofas++, d.matrix);
      }
    }
    finishInstances(this.plants, plants);
    finishInstances(this.paintings, paintings);
    finishInstances(this.lamps, lamps);
    finishInstances(this.bulbs, lamps);
    finishInstances(this.neons, neons);
    finishInstances(this.neonTubes, neons);
    finishInstances(this.bookshelves, shelves);
    finishInstances(this.recordPlayers, players);
    finishInstances(this.sofas, sofas);
  }

  private buildPremium(layout: ShopLayout): void {
    const d = this.dummy;
    let chandeliers = 0;
    let galleries = 0;
    let pianos = 0;
    for (const item of layout.premium) {
      d.rotation.set(0, 0, 0);
      d.position.set(item.pos.x, 0, item.pos.z);
      if (item.kind === 'chandelier' && chandeliers < DECOR_CAPACITY) {
        d.updateMatrix();
        this.chandeliers.setMatrixAt(chandeliers, d.matrix);
        this.crystals.setMatrixAt(chandeliers++, d.matrix);
      } else if (item.kind === 'art_gallery' && galleries < DECOR_CAPACITY) {
        // On the left wall, facing the room like the side paintings.
        d.rotation.set(0, Math.PI / 2, 0);
        d.updateMatrix();
        this.galleries.setMatrixAt(galleries++, d.matrix);
      } else if (item.kind === 'grand_piano' && pianos < DECOR_CAPACITY) {
        d.updateMatrix();
        this.pianos.setMatrixAt(pianos++, d.matrix);
      }
    }
    finishInstances(this.chandeliers, chandeliers);
    finishInstances(this.crystals, chandeliers);
    finishInstances(this.galleries, galleries);
    finishInstances(this.pianos, pianos);

    const marble = layout.premiumLevel.marble_tables;
    const geo = marble >= 2 ? this.geo.marble2 : this.geo.marble1;
    if (this.marbleTops.geometry !== geo) this.marbleTops.geometry = geo;
    const tops = marble > 0 ? Math.min(layout.tables.length, this.tableCap) : 0;
    for (let i = 0; i < tops; i++) {
      const t = layout.tables[i]!;
      d.position.set(t.pos.x, 0, t.pos.z);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.marbleTops.setMatrixAt(i, d.matrix);
    }
    finishInstances(this.marbleTops, tops);
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
