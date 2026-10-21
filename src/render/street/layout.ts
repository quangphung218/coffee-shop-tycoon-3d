import type { Quality } from '../../save/settings';
import type { Weather } from '../../sim/types';

/**
 * Pure street layout and motion: where the road and sidewalks lie, how many
 * vehicles and people each graphics quality gets, where a vehicle or walker
 * is at time t, and the light colour for a game minute. No three.js here, so
 * everything is testable and allocation-free per frame.
 *
 * The street runs along x in front of the shop (the shop door is at z = 6,
 * the sidewalk seating ends at z = 9).
 */

/** Street runs from -STREET_HALF to +STREET_HALF along x; things wrap around at the ends. */
export const STREET_HALF = 45;
export const STREET_SPAN = STREET_HALF * 2;

/** z bands (min, max) from the shop outwards. */
export const NEAR_WALK = { minZ: 9.4, maxZ: 12.4 } as const;
export const ROAD = { minZ: 12.4, maxZ: 19.6 } as const;
export const FAR_WALK = { minZ: 19.6, maxZ: 22.6 } as const;
/** Front of the buildings across the road. */
export const FAR_BUILDINGS_Z = 23.4;
/** Buildings on the shop's side stand beyond this |x| so they never cover a grown shop (the level 4 side room's wall ends at x = 13.7). */
export const NEAR_BUILDINGS_MIN_X = 15;
export const CENTER_LINE_Z = (ROAD.minZ + ROAD.maxZ) / 2;

export type VehicleKind = 'car' | 'bike' | 'bus';
export const VEHICLE_KINDS: readonly VehicleKind[] = ['car', 'bike', 'bus'];

/** Body length along the direction of travel, for spacing. */
export const VEHICLE_LENGTH: Readonly<Record<VehicleKind, number>> = { car: 3.4, bike: 1.6, bus: 6.4 };

/**
 * One lane per direction for cars and buses, plus a motorbike lane nearer the
 * kerb. Everyone in a lane shares its speed, so nobody drives through anyone.
 * Traffic keeps right: +x on the far side, -x on the shop side.
 */
export interface Lane {
  z: number;
  /** +1 drives toward +x, -1 toward -x. */
  dir: 1 | -1;
  /** World units per second. */
  speed: number;
  kinds: readonly VehicleKind[];
}

export const LANES: readonly Lane[] = [
  { z: ROAD.minZ + 2.3, dir: -1, speed: 7, kinds: ['car', 'bus'] },
  { z: ROAD.minZ + 0.8, dir: -1, speed: 5, kinds: ['bike'] },
  { z: ROAD.maxZ - 2.3, dir: 1, speed: 7.5, kinds: ['car', 'bus'] },
  { z: ROAD.maxZ - 0.8, dir: 1, speed: 5.5, kinds: ['bike'] },
];

export const WALK_SPEED = 1.15;

/**
 * Walking lines on both sidewalks; people walk both ways. Like a traffic
 * lane, everyone on a line shares its speed, so walkers on one line keep
 * their spacing and never walk through each other. Trees and lamps stand by
 * the kerb, at least PROP_CLEARANCE from every line.
 */
export interface WalkLine {
  z: number;
  dir: 1 | -1;
  /** World units per second. */
  speed: number;
}

export const WALK_LINES: readonly WalkLine[] = [
  { z: NEAR_WALK.minZ + 0.8, dir: 1, speed: WALK_SPEED * 1.02 },
  { z: NEAR_WALK.minZ + 1.65, dir: -1, speed: WALK_SPEED * 0.94 },
  { z: FAR_WALK.minZ + 1.35, dir: 1, speed: WALK_SPEED * 0.97 },
  { z: FAR_WALK.minZ + 2.2, dir: -1, speed: WALK_SPEED * 1.05 },
];
/** Top of the sidewalk slabs; walkers stand on it. */
export const CURB_HEIGHT = 0.12;
/** z of the tree and lamp row on each sidewalk. */
export const KERB_PROP_Z: readonly number[] = [NEAR_WALK.maxZ - 0.45, FAR_WALK.minZ + 0.45];
/**
 * Half the width of a walker, and how far a kerb prop reaches out at the
 * height of a walker's body and head: the lowest part of the largest tree
 * canopy (the tree pit and lamp pole are narrower).
 */
export const WALKER_RADIUS = 0.22;
export const KERB_PROP_RADIUS = 0.65;
/** Smallest distance in z between a walking line and the kerb prop row. */
export const PROP_CLEARANCE = WALKER_RADIUS + KERB_PROP_RADIUS;
/** Smallest distance along a line between two walkers on it. */
export const MIN_WALKER_GAP = 2;

export interface StreetDensity {
  cars: number;
  bikes: number;
  buses: number;
  pedestrians: number;
  /** Rain streaks drawn while it rains. */
  rainDrops: number;
  /** Splashes on the ground and the awning at any one time while it rains; 0 means none. */
  rainSplashes: number;
  /** Fraction of trees and lamps kept (1 = all). */
  props: number;
}

const DENSITY: Readonly<Record<Quality, Readonly<StreetDensity>>> = {
  low: { cars: 3, bikes: 3, buses: 1, pedestrians: 4, rainDrops: 120, rainSplashes: 0, props: 0.5 },
  medium: { cars: 6, bikes: 8, buses: 1, pedestrians: 10, rainDrops: 350, rainSplashes: 48, props: 1 },
  high: { cars: 10, bikes: 14, buses: 2, pedestrians: 18, rainDrops: 900, rainSplashes: 120, props: 1 },
};

export function densityFor(quality: Quality): Readonly<StreetDensity> {
  return DENSITY[quality] ?? DENSITY.medium;
}

/** Most of anything any quality asks for, to size buffers once. */
export const MAX_DENSITY: Readonly<StreetDensity> = DENSITY.high;

export function vehicleCount(d: StreetDensity, kind: VehicleKind): number {
  return kind === 'car' ? d.cars : kind === 'bike' ? d.bikes : d.buses;
}

/** x wrapped into [-STREET_HALF, STREET_HALF). */
export function wrapX(x: number): number {
  if (!Number.isFinite(x)) return -STREET_HALF;
  const r = (((x + STREET_HALF) % STREET_SPAN) + STREET_SPAN) % STREET_SPAN;
  return r - STREET_HALF;
}

/** Position along the street of something starting at `start`, moving `dir * speed` for `t` seconds, wrapping at the ends. */
export function travelX(start: number, dir: number, speed: number, t: number): number {
  return wrapX(start + dir * speed * t);
}

/** A vehicle on the street: which lane, and where it was at t = 0. */
export interface VehicleSlot {
  kind: VehicleKind;
  lane: number;
  start: number;
}

/**
 * Spreads `counts` vehicles over the lanes, evenly spaced in each lane so
 * the gaps never change (everyone in a lane shares its speed). Each slot is
 * stable for its index, so raising the quality only adds vehicles.
 */
export function vehicleSlots(counts: Readonly<Record<VehicleKind, number>>): VehicleSlot[] {
  const perLane: VehicleKind[][] = LANES.map(() => []);
  for (const kind of VEHICLE_KINDS) {
    const lanes = LANES.map((lane, i) => (lane.kinds.includes(kind) ? i : -1)).filter((i) => i >= 0);
    for (let n = 0; n < counts[kind]; n++) perLane[lanes[n % lanes.length]!]!.push(kind);
  }
  const slots: VehicleSlot[] = [];
  perLane.forEach((kinds, lane) => {
    // Interleave buses between cars instead of bunching them.
    const ordered = interleave(kinds);
    const gap = STREET_SPAN / Math.max(1, ordered.length);
    ordered.forEach((kind, i) => {
      // A small fixed offset per lane so opposite lanes do not pass in step.
      slots.push({ kind, lane, start: wrapX(-STREET_HALF + i * gap + lane * 3.7) });
    });
  });
  return slots;
}

function interleave(kinds: VehicleKind[]): VehicleKind[] {
  const rare = kinds.filter((k) => k === 'bus');
  const common = kinds.filter((k) => k !== 'bus');
  if (rare.length === 0) return common;
  const out: VehicleKind[] = [];
  const every = Math.max(1, Math.floor(common.length / rare.length));
  let r = 0;
  common.forEach((k, i) => {
    if (r < rare.length && i % every === 0) out.push(rare[r++]!);
    out.push(k);
  });
  while (r < rare.length) out.push(rare[r++]!);
  return out;
}

/** Smallest bumper-to-bumper gap in each lane for these slots (Infinity for lanes with fewer than two vehicles). */
export function minLaneGap(slots: readonly VehicleSlot[]): number {
  let best = Infinity;
  for (let lane = 0; lane < LANES.length; lane++) {
    const inLane = slots.filter((s) => s.lane === lane).sort((a, b) => a.start - b.start);
    if (inLane.length < 2) continue;
    for (let i = 0; i < inLane.length; i++) {
      const a = inLane[i]!;
      const b = inLane[(i + 1) % inLane.length]!;
      const centre = i + 1 < inLane.length ? b.start - a.start : b.start + STREET_SPAN - a.start;
      best = Math.min(best, centre - (VEHICLE_LENGTH[a.kind] + VEHICLE_LENGTH[b.kind]) / 2);
    }
  }
  return best;
}

/** A walker: which walking line, where they were at t = 0, the line's speed and a look. */
export interface WalkerSlot {
  line: number;
  start: number;
  speed: number;
  look: number;
}

/**
 * `count` walkers spread round-robin over the lines and evenly along each
 * line, like vehicleSlots: everyone on a line shares its speed, so the gaps
 * never change. Walker i keeps its line and look for any count.
 */
export function walkerSlots(count: number): WalkerSlot[] {
  const n = Math.max(0, Math.floor(count));
  const lines = WALK_LINES.length;
  const slots: WalkerSlot[] = [];
  for (let i = 0; i < n; i++) {
    const line = i % lines;
    const onLine = Math.floor((n - 1 - line) / lines) + 1;
    const nth = Math.floor(i / lines);
    // A fixed offset per line so the two directions do not cross in step.
    const start = wrapX(-STREET_HALF + (nth * STREET_SPAN) / onLine + line * 5.3);
    slots.push({ line, start, speed: WALK_LINES[line]!.speed, look: i * 3 + 1 });
  }
  return slots;
}

/** Smallest distance along a line between two walkers on it at time t (Infinity with fewer than two per line). */
export function minWalkerGap(slots: readonly WalkerSlot[], t: number): number {
  let best = Infinity;
  for (let line = 0; line < WALK_LINES.length; line++) {
    const w = WALK_LINES[line]!;
    const xs = slots
      .filter((s) => s.line === line)
      .map((s) => travelX(s.start, w.dir, s.speed, t))
      .sort((a, b) => a - b);
    if (xs.length < 2) continue;
    for (let i = 0; i < xs.length; i++) {
      const gap = i + 1 < xs.length ? xs[i + 1]! - xs[i]! : xs[0]! + STREET_SPAN - xs[i]!;
      best = Math.min(best, gap);
    }
  }
  return best;
}

/**
 * Light for one moment of the day; written into an existing object so the
 * frame loop allocates nothing. Intensities are factors of a sunny noon (1),
 * applied on top of the quality's rig (src/render/scene/dayCycle.ts), so the
 * clock never lifts the light past the quality's budget.
 */
export interface Lighting {
  /** Sun (DirectionalLight) factor. */
  sunScale: number;
  /** Fill (hemisphere and environment map) factor. */
  fillScale: number;
  /** Unit vector from the ground toward the sun: +x east, +y up, +z the street side. */
  sunDir: [number, number, number];
  /** Linear-ish sRGB components 0..1. */
  sun: [number, number, number];
  sky: [number, number, number];
  /** 0..1 how much the street lamps glow. */
  lamps: number;
}

export function createLighting(): Lighting {
  return { sunScale: 0, fillScale: 0, sunDir: [0, 1, 0], sun: [1, 1, 1], sky: [1, 1, 1], lamps: 0 };
}

interface Key {
  minute: number;
  sun: number;
  fill: number;
  sunColor: number;
  sky: number;
  lamps: number;
}

/**
 * Keyframes over the opening day: bright pale-yellow morning (07:00 clearly
 * brighter than dusk), white noon, orange late afternoon, blue dusk.
 */
const KEYS: readonly Key[] = [
  { minute: 6 * 60, sun: 0.6, fill: 0.76, sunColor: 0xffe0a8, sky: 0xf6dcc0, lamps: 0.6 },
  { minute: 7 * 60, sun: 0.82, fill: 0.88, sunColor: 0xffecbc, sky: 0xf6ead0, lamps: 0 },
  { minute: 8 * 60, sun: 0.88, fill: 0.92, sunColor: 0xfff0c8, sky: 0xdcece8, lamps: 0 },
  { minute: 12 * 60, sun: 1, fill: 1, sunColor: 0xffffff, sky: 0xbfe6f5, lamps: 0 },
  { minute: 16 * 60, sun: 0.92, fill: 0.95, sunColor: 0xfff0d8, sky: 0xc4e3f0, lamps: 0 },
  { minute: 18 * 60, sun: 0.7, fill: 0.8, sunColor: 0xffa860, sky: 0xf7b98f, lamps: 0.5 },
  { minute: 19 * 60 + 30, sun: 0.4, fill: 0.64, sunColor: 0xe0806a, sky: 0x8a8cc6, lamps: 1 },
  { minute: 21 * 60, sun: 0.24, fill: 0.52, sunColor: 0x8fa2dc, sky: 0x46558c, lamps: 1 },
];

/** The sun rises in the east (+x) at 06:00, is highest at noon and sets in the west (-x) at 21:00. */
const SUN_RISE = 6 * 60;
const SUN_NOON = 12 * 60;
const SUN_SET = 21 * 60;
/** Elevation at the ends of the arc and at noon; the low end keeps the shadows on the shop's lot. */
const SUN_LOW = (22 * Math.PI) / 180;
const SUN_HIGH = (62 * Math.PI) / 180;
/** How far the sun leans toward the street (+z) all day, so the shop front stays lit. */
const SUN_SOUTH = 0.7;

/** Grey overcast colour mixed in while it rains. */
const RAIN_SKY = 0x9fb0bb;
const RAIN_MIX = 0.55;
const RAIN_DIM = 0.72;
const RAIN_FILL = 0.9;
/** Hot days: a harsher sun on a slightly lower fill (more contrast, same budget), tinted warm. */
const HOT_SUN = 1.08;
const HOT_FILL = 0.9;
const HOT_TINT = 0xffdcae;
const HOT_MIX = 0.3;

function channel(hex: number, shift: number): number {
  return ((hex >> shift) & 0xff) / 255;
}

function mixInto(out: [number, number, number], a: number, b: number, t: number): void {
  out[0] = channel(a, 16) + (channel(b, 16) - channel(a, 16)) * t;
  out[1] = channel(a, 8) + (channel(b, 8) - channel(a, 8)) * t;
  out[2] = channel(a, 0) + (channel(b, 0) - channel(a, 0)) * t;
}

/** Light at game `minute` (any real number; clamped to the keyframes) for the weather. */
export function lightingAt(minute: number, weather: Weather, out: Lighting = createLighting()): Lighting {
  const m = Number.isFinite(minute) ? minute : 12 * 60;
  let i = 0;
  while (i < KEYS.length - 2 && m >= KEYS[i + 1]!.minute) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = Math.min(1, Math.max(0, (m - a.minute) / (b.minute - a.minute)));
  out.sunScale = a.sun + (b.sun - a.sun) * t;
  out.fillScale = a.fill + (b.fill - a.fill) * t;
  out.lamps = a.lamps + (b.lamps - a.lamps) * t;
  mixInto(out.sun, a.sunColor, b.sunColor, t);
  mixInto(out.sky, a.sky, b.sky, t);
  sunDirAt(m, out.sunDir);
  if (weather === 'rainy') {
    out.sunScale *= RAIN_DIM;
    out.fillScale *= RAIN_FILL;
    out.lamps = Math.max(out.lamps, 0.4);
    for (let c = 0; c < 3; c++) {
      const grey = channel(RAIN_SKY, 16 - c * 8);
      out.sky[c] = out.sky[c]! + (grey - out.sky[c]!) * RAIN_MIX;
      out.sun[c] = out.sun[c]! + (0.85 - out.sun[c]!) * 0.4;
    }
  } else if (weather === 'hot') {
    out.sunScale *= HOT_SUN;
    out.fillScale *= HOT_FILL;
    for (let c = 0; c < 3; c++) out.sun[c] = out.sun[c]! + (channel(HOT_TINT, 16 - c * 8) - out.sun[c]!) * HOT_MIX;
  }
  return out;
}

/** Writes the unit vector toward the sun at `minute` (clamped to sunrise..sunset) into `out`. */
function sunDirAt(minute: number, out: [number, number, number]): void {
  const m = Math.min(SUN_SET, Math.max(SUN_RISE, minute));
  // 0 at sunrise, 0.5 at noon, 1 at sunset, so noon is the top of the arc.
  const p = m <= SUN_NOON ? ((m - SUN_RISE) / (SUN_NOON - SUN_RISE)) * 0.5 : 0.5 + ((m - SUN_NOON) / (SUN_SET - SUN_NOON)) * 0.5;
  const elevation = SUN_LOW + (SUN_HIGH - SUN_LOW) * Math.sin(Math.PI * p);
  const hx = Math.cos(Math.PI * p);
  const hLen = Math.hypot(hx, SUN_SOUTH);
  const flat = Math.cos(elevation) / hLen;
  out[0] = hx * flat;
  out[1] = Math.sin(elevation);
  out[2] = SUN_SOUTH * flat;
}

/** A building block: centre x/z, footprint, height, and whether its front faces +z (shop side) or -z. */
export interface BuildingLot {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  facesPlusZ: boolean;
  color: number;
}

const BUILDING_COLORS: readonly number[] = [0xf6c8a8, 0xa8d8ea, 0xf7e3a1, 0xc7e9b0, 0xf2b5c4, 0xd9c8f0, 0xffe0c2, 0xb8e0d2];

/** Deterministic 0..1 hash of an integer. */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fillRow(lots: BuildingLot[], fromX: number, toX: number, frontZ: number, facesPlusZ: boolean, seed: number): void {
  let x = fromX;
  let i = 0;
  while (x < toX - 3) {
    const r = hash01(seed + i * 7);
    const width = Math.min(toX - x, 5 + r * 3.5);
    const depth = 6 + hash01(seed + i * 7 + 1) * 2;
    const height = 3.6 + hash01(seed + i * 7 + 2) * 6.5;
    const z = facesPlusZ ? frontZ - depth / 2 : frontZ + depth / 2;
    const color = BUILDING_COLORS[Math.floor(hash01(seed + i * 7 + 3) * BUILDING_COLORS.length)]!;
    lots.push({ x: x + width / 2, z, width, depth, height, facesPlusZ, color });
    x += width + 0.4;
    i++;
  }
}

/** Buildings across the road for the whole street, and beside the shop beyond NEAR_BUILDINGS_MIN_X. */
export function buildingLots(): BuildingLot[] {
  const lots: BuildingLot[] = [];
  fillRow(lots, -STREET_HALF, STREET_HALF, FAR_BUILDINGS_Z, false, 11);
  const nearFront = NEAR_WALK.minZ - 0.6;
  fillRow(lots, -STREET_HALF, -NEAR_BUILDINGS_MIN_X, nearFront, true, 101);
  fillRow(lots, NEAR_BUILDINGS_MIN_X, STREET_HALF, nearFront, true, 211);
  return lots;
}

/** Kind and spot of a kerb prop. The first half of the list is every other prop, kept on low quality. */
export interface PropSpot {
  kind: 'tree' | 'lamp';
  x: number;
  z: number;
  /** Lamps lean their arm over the road. */
  facesPlusZ: boolean;
}

/** Trees and lamps alternate along both kerbs, with a gap in front of the shop door. */
export function propSpots(): PropSpot[] {
  const all: PropSpot[] = [];
  const spacing = 5;
  KERB_PROP_Z.forEach((z, side) => {
    for (let x = -STREET_HALF + 2.5; x < STREET_HALF; x += spacing) {
      if (side === 0 && Math.abs(x) < 4) continue;
      const n = Math.round((x + STREET_HALF) / spacing);
      all.push({ kind: (n + side) % 2 === 0 ? 'tree' : 'lamp', x, z, facesPlusZ: side === 0 });
    }
  });
  // Every other tree and every other lamp first, so a prefix keeps both kinds spread out.
  const first: PropSpot[] = [];
  const rest: PropSpot[] = [];
  const seen = { tree: 0, lamp: 0 };
  for (const p of all) (seen[p.kind]++ % 2 === 0 ? first : rest).push(p);
  return first.concat(rest);
}

/** Rain falls inside this box around the shop and the street. */
export const RAIN_BOX = { minX: -22, maxX: 22, minZ: -8, maxZ: 28, top: 14 } as const;
export const RAIN_SPEED = 16;
export const RAIN_STREAK = 0.45;

/** Height of a rain drop that started at `y0` after `t` seconds, wrapping back to the top. */
export function rainY(y0: number, t: number): number {
  const top = RAIN_BOX.top;
  const y = (((y0 - RAIN_SPEED * t) % top) + top) % top;
  return Number.isFinite(y) ? y : top;
}

/** A steady wind: a drop drifts this far in -x per unit it falls, so every streak leans the same way. */
export const RAIN_WIND = 0.18;
/** Streak length and opacity vary per drop between these. */
export const RAIN_STREAK_RANGE = { min: 0.7, max: 1.3 } as const;
export const RAIN_OPACITY_RANGE = { min: 0.35, max: 0.75 } as const;
/** Share of rain streaks kept under reduced motion: enough to tell it rains. */
export const RAIN_REDUCED_SHARE = 0.4;

/** Rain streaks drawn for a quality's drop count. */
export function rainStreaksFor(drops: number, reducedMotion: boolean): number {
  return reducedMotion ? Math.round(drops * RAIN_REDUCED_SHARE) : drops;
}

/** Starting x, height, z, length and opacity of drop `i`; x leaves room for the wind so the whole streak stays in RAIN_BOX. */
export function rainDrop(i: number, out: RainDrop): RainDrop {
  const longest = RAIN_STREAK * RAIN_STREAK_RANGE.max;
  const maxX = RAIN_BOX.maxX - RAIN_WIND * (RAIN_BOX.top + longest);
  out.x = RAIN_BOX.minX + hash01(i * 3 + 1) * (maxX - RAIN_BOX.minX);
  out.y = hash01(i * 3 + 2) * RAIN_BOX.top;
  out.z = RAIN_BOX.minZ + hash01(i * 3 + 3) * (RAIN_BOX.maxZ - RAIN_BOX.minZ);
  out.length = RAIN_STREAK * (RAIN_STREAK_RANGE.min + hash01(i * 7 + 4001) * (RAIN_STREAK_RANGE.max - RAIN_STREAK_RANGE.min));
  out.opacity = RAIN_OPACITY_RANGE.min + hash01(i * 7 + 4002) * (RAIN_OPACITY_RANGE.max - RAIN_OPACITY_RANGE.min);
  return out;
}

export interface RainDrop {
  x: number;
  y: number;
  z: number;
  length: number;
  opacity: number;
}

/** Seconds a splash lives before it shows up somewhere else. */
export const SPLASH_LIFE = 0.3;
/** Scale of the splash ring; it opens to about 0.6 of this. */
export const SPLASH_RADIUS = 0.32;

/** Where splashes land: a flat band at height y; `share` is the fraction of splashes it gets. */
export interface SplashZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  share: number;
}

/** Shares add up to 1. The awning hangs over the door (x = 0) of the shop front (z = 6.2); its slope is about 2 m up. */
export const SPLASH_ZONES: readonly SplashZone[] = [
  { minX: -1.1, maxX: 1.1, minZ: 6.35, maxZ: 7, y: 2.06, share: 0.1 },
  { minX: RAIN_BOX.minX, maxX: RAIN_BOX.maxX, minZ: NEAR_WALK.minZ, maxZ: NEAR_WALK.maxZ, y: CURB_HEIGHT + 0.01, share: 0.3 },
  { minX: RAIN_BOX.minX, maxX: RAIN_BOX.maxX, minZ: ROAD.minZ, maxZ: ROAD.maxZ, y: 0.02, share: 0.35 },
  { minX: RAIN_BOX.minX, maxX: RAIN_BOX.maxX, minZ: FAR_WALK.minZ, maxZ: FAR_WALK.maxZ, y: CURB_HEIGHT + 0.01, share: 0.25 },
];

export interface Splash {
  x: number;
  y: number;
  z: number;
  /** 0 when it lands, 1 when it is gone. */
  age: number;
}

/**
 * Splash slot `i` at time `t`: slots are staggered, each lands somewhere new
 * every SPLASH_LIFE seconds, picked by hash01 of the slot and its round.
 */
export function splashAt(i: number, t: number, out: Splash): Splash {
  const phase = (t + hash01(i * 5 + 7001) * SPLASH_LIFE) / SPLASH_LIFE;
  const safe = Number.isFinite(phase) ? phase : 0;
  const round = Math.floor(safe);
  out.age = safe - round;
  const seed = i * 7919 + round * 104729;
  let pick = hash01(seed);
  let zone = SPLASH_ZONES[SPLASH_ZONES.length - 1]!;
  for (const z of SPLASH_ZONES) {
    if (pick < z.share) {
      zone = z;
      break;
    }
    pick -= z.share;
  }
  out.x = zone.minX + hash01(seed + 1) * (zone.maxX - zone.minX);
  out.y = zone.y;
  out.z = zone.minZ + hash01(seed + 2) * (zone.maxZ - zone.minZ);
  return out;
}

/** Ring radius of a splash at `age`: it opens out, peaks, then closes to nothing. */
export function splashScale(age: number): number {
  const a = Math.min(1, Math.max(0, age));
  return SPLASH_RADIUS * (0.3 + 0.7 * a) * (1 - a * a);
}
