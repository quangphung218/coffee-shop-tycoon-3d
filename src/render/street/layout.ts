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
/** Buildings on the shop's side stand beyond this |x| so they never cover a grown shop. */
export const NEAR_BUILDINGS_MIN_X = 13;
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

/** Walking lines on both sidewalks; people walk both ways. Trees and lamps stand by the kerb. */
export const WALK_LINES: readonly { z: number; dir: 1 | -1 }[] = [
  { z: NEAR_WALK.minZ + 0.8, dir: 1 },
  { z: NEAR_WALK.minZ + 1.8, dir: -1 },
  { z: FAR_WALK.minZ + 1.2, dir: 1 },
  { z: FAR_WALK.minZ + 2.2, dir: -1 },
];
export const WALK_SPEED = 1.15;
/** Top of the sidewalk slabs; walkers stand on it. */
export const CURB_HEIGHT = 0.12;
/** z of the tree and lamp row on each sidewalk. */
export const KERB_PROP_Z: readonly number[] = [NEAR_WALK.maxZ - 0.45, FAR_WALK.minZ + 0.45];

export interface StreetDensity {
  cars: number;
  bikes: number;
  buses: number;
  pedestrians: number;
  /** Rain streaks drawn while it rains; 0 means no rain particles. */
  rainDrops: number;
  /** Fraction of trees and lamps kept (1 = all). */
  props: number;
}

const DENSITY: Readonly<Record<Quality, Readonly<StreetDensity>>> = {
  low: { cars: 3, bikes: 3, buses: 1, pedestrians: 4, rainDrops: 0, props: 0.5 },
  medium: { cars: 6, bikes: 8, buses: 1, pedestrians: 10, rainDrops: 350, props: 1 },
  high: { cars: 10, bikes: 14, buses: 2, pedestrians: 18, rainDrops: 900, props: 1 },
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

/** A walker: which walking line, where they were at t = 0 and a small speed variation. */
export interface WalkerSlot {
  line: number;
  start: number;
  speed: number;
  look: number;
}

/** Walker `i` of the street; stable per index. */
export function walkerSlot(i: number): WalkerSlot {
  const line = i % WALK_LINES.length;
  const round = Math.floor(i / WALK_LINES.length);
  // Golden-ratio spacing spreads people along the street for any count.
  const frac = (round * 0.618034 + line * 0.27) % 1;
  return { line, start: wrapX(-STREET_HALF + frac * STREET_SPAN), speed: WALK_SPEED * (0.85 + ((i * 37) % 10) * 0.03), look: i * 3 + 1 };
}

/** Light for one moment of the day; written into an existing object so the frame loop allocates nothing. */
export interface Lighting {
  sunIntensity: number;
  hemiIntensity: number;
  /** Linear-ish sRGB components 0..1. */
  sun: [number, number, number];
  sky: [number, number, number];
  /** 0..1 how much the street lamps glow. */
  lamps: number;
}

export function createLighting(): Lighting {
  return { sunIntensity: 0, hemiIntensity: 0, sun: [1, 1, 1], sky: [1, 1, 1], lamps: 0 };
}

interface Key {
  minute: number;
  sun: number;
  hemi: number;
  sunColor: number;
  sky: number;
  lamps: number;
}

/** Keyframes over the opening day: soft warm morning, bright noon, golden afternoon, blue dusk. */
const KEYS: readonly Key[] = [
  { minute: 6 * 60, sun: 1.1, hemi: 1.2, sunColor: 0xffd6a8, sky: 0xf5d9c4, lamps: 0.6 },
  { minute: 8 * 60, sun: 1.6, hemi: 1.5, sunColor: 0xffecd2, sky: 0xcde9f2, lamps: 0 },
  { minute: 12 * 60, sun: 1.9, hemi: 1.65, sunColor: 0xffffff, sky: 0xbfe6f5, lamps: 0 },
  { minute: 16 * 60, sun: 1.75, hemi: 1.55, sunColor: 0xfff0d8, sky: 0xc4e3f0, lamps: 0 },
  { minute: 18 * 60, sun: 1.35, hemi: 1.3, sunColor: 0xffb877, sky: 0xf7c59f, lamps: 0.5 },
  { minute: 19 * 60 + 30, sun: 0.8, hemi: 1.0, sunColor: 0xd98a7a, sky: 0x8f8fc4, lamps: 1 },
  { minute: 21 * 60, sun: 0.5, hemi: 0.85, sunColor: 0x9aa6d9, sky: 0x4f5d8f, lamps: 1 },
];

/** Grey overcast colour mixed in while it rains. */
const RAIN_SKY = 0x9fb0bb;
const RAIN_MIX = 0.55;
const RAIN_DIM = 0.72;

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
  out.sunIntensity = a.sun + (b.sun - a.sun) * t;
  out.hemiIntensity = a.hemi + (b.hemi - a.hemi) * t;
  out.lamps = a.lamps + (b.lamps - a.lamps) * t;
  mixInto(out.sun, a.sunColor, b.sunColor, t);
  mixInto(out.sky, a.sky, b.sky, t);
  if (weather === 'rainy') {
    out.sunIntensity *= RAIN_DIM;
    out.hemiIntensity *= 0.9;
    out.lamps = Math.max(out.lamps, 0.4);
    for (let c = 0; c < 3; c++) {
      const grey = channel(RAIN_SKY, 16 - c * 8);
      out.sky[c] = out.sky[c]! + (grey - out.sky[c]!) * RAIN_MIX;
      out.sun[c] = out.sun[c]! + (0.85 - out.sun[c]!) * 0.4;
    }
  } else if (weather === 'hot') {
    out.sunIntensity *= 1.08;
  }
  return out;
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
