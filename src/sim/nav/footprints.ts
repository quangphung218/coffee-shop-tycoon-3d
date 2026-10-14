import type { ShopLayout } from '../upgrades';

/**
 * Floor-plan sizes of the shop's walls and furniture, shared by the renderer
 * (src/render/scene/shop.ts draws with them) and the nav grid (which blocks
 * them), so what people walk around is what is on screen. World units.
 */

export const WALL_THICKNESS = 0.2;
export const DOOR_WIDTH = 1.6;
/** Door posts on both sides of the opening, and the lintel depth. */
export const DOOR_POST_WIDTH = 0.14;
export const DOOR_FRAME_DEPTH = 0.26;
/** Door leaf swung open inward, placed from the left post. */
export const DOOR_LEAF_WIDTH = 0.72;
export const DOOR_LEAF_THICKNESS = 0.06;
export const DOOR_LEAF_X = 0.1;
export const DOOR_LEAF_Z = -0.36;
export const DOOR_LEAF_YAW = Math.PI / 2 - 0.35;

export const COUNTER_DEPTH = 0.8;
/** The counter top overhangs the body by this much in total width. */
export const COUNTER_TOP_EXTRA = 0.12;
export const COUNTER_TOP_DEPTH = 0.92;

export const BACK_COUNTER_Z = -3.4;
export const BACK_COUNTER_DEPTH = 0.7;
export const BACK_COUNTER_TOP_EXTRA = 0.08;
export const BACK_COUNTER_TOP_DEPTH = 0.76;
/** The back counter runs this far past the leftmost and rightmost machine. */
export const BACK_COUNTER_MARGIN_LEFT = 1;
export const BACK_COUNTER_MARGIN_RIGHT = 1.2;

/** Widest part of each machine (its top). */
export const MACHINE_SIZE = {
  espresso: { width: 0.96, depth: 0.6 },
  fast: { width: 0.64, depth: 0.54 },
} as const;

export const TABLE_RADIUS = 0.5;
/** Chairs stand this far from the table centre on the x axis. */
export const CHAIR_OFFSET = 0.75;
export const CHAIR_SIZE = 0.44;
export const PARASOL_POLE_RADIUS = 0.03;
export const PLANT_RADIUS = 0.42;
/** Square planter with a small tree on each side of the door, outside; this is half its side. */
export const PLANTER_HALF = 0.26;
/** Planter centres sit this far left and right of the door centre, and this far out from the front wall's outer face. */
export const PLANTER_X = 1.35;
export const PLANTER_OUT = 0.36;
/**
 * The front step under the door: a slab this low is walked over like a
 * doormat, so it has no footprint. Width along x, depth out from the wall.
 */
export const STEP_WIDTH = 2;
export const STEP_DEPTH = 0.5;
export const STEP_HEIGHT = 0.04;

export type Shape =
  | { type: 'rect'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { type: 'circle'; x: number; z: number; r: number }
  /** A thin slab seen from above: segment a–b thickened by r. */
  | { type: 'segment'; ax: number; az: number; bx: number; bz: number; r: number };

export type FootprintKind = 'wall' | 'door' | 'planter' | 'counter' | 'back_counter' | 'machine' | 'table' | 'chair' | 'parasol' | 'plant';

export interface Footprint {
  kind: FootprintKind;
  /** Readable name, e.g. 'chair:5:1' or 'wall:front-left'. */
  id: string;
  /** Pieces of one group belong together and may touch (a table and its chairs, the bar and its machines). */
  group: string;
  shape: Shape;
}

/** Inside of the building: the indoor room plus the expansion to its right. */
export function buildingArea(layout: ShopLayout): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const { indoor, expansion } = layout;
  return { minX: indoor.minX, maxX: expansion ? expansion.maxX : indoor.maxX, minZ: indoor.minZ, maxZ: indoor.maxZ };
}

const WALL_NAMES = ['back', 'left', 'right', 'front-left', 'front-right'] as const;

/** Walls as [cx, cz, length along x, length along z]: back, left, right, front-left, front-right. */
export function wallSpans(layout: ShopLayout): (readonly [number, number, number, number])[] {
  const { minX, maxX, minZ, maxZ } = buildingArea(layout);
  const t = WALL_THICKNESS;
  const doorL = layout.door.x - DOOR_WIDTH / 2;
  const doorR = layout.door.x + DOOR_WIDTH / 2;
  return [
    [(minX + maxX) / 2, minZ - t / 2, maxX - minX + 2 * t, t],
    [minX - t / 2, (minZ + maxZ) / 2, t, maxZ - minZ],
    [maxX + t / 2, (minZ + maxZ) / 2, t, maxZ - minZ],
    [(minX - t + doorL) / 2, maxZ + t / 2, doorL - minX + t, t],
    [(doorR + maxX + t) / 2, maxZ + t / 2, maxX + t - doorR, t],
  ];
}

/** x range of the back counter under the machines, or null without machines. */
export function backCounterSpan(layout: ShopLayout): { minX: number; maxX: number } | null {
  if (layout.machines.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const m of layout.machines) {
    minX = Math.min(minX, m.pos.x);
    maxX = Math.max(maxX, m.pos.x);
  }
  return { minX: minX - BACK_COUNTER_MARGIN_LEFT, maxX: maxX + BACK_COUNTER_MARGIN_RIGHT };
}

/** Centres of the two planters flanking the door outside, left then right. */
export function doorPlanters(layout: ShopLayout): [{ x: number; z: number }, { x: number; z: number }] {
  const z = buildingArea(layout).maxZ + WALL_THICKNESS + PLANTER_OUT;
  return [
    { x: layout.door.x - PLANTER_X, z },
    { x: layout.door.x + PLANTER_X, z },
  ];
}

function rect(cx: number, cz: number, sx: number, sz: number): Shape {
  return { type: 'rect', minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 };
}

/**
 * Everything standing on the floor that people must walk around. Paintings,
 * windows, shelves and the menu board hang on walls and lamps and fans from
 * the ceiling; the step and mats are walked over: none has a footprint.
 */
export function layoutFootprints(layout: ShopLayout): Footprint[] {
  const out: Footprint[] = [];
  wallSpans(layout).forEach(([cx, cz, sx, sz], i) => {
    out.push({ kind: 'wall', id: `wall:${WALL_NAMES[i]}`, group: 'structure', shape: rect(cx, cz, sx, sz) });
  });

  const doorZ = buildingArea(layout).maxZ + WALL_THICKNESS / 2;
  const half = DOOR_WIDTH / 2;
  for (const side of [-1, 1]) {
    out.push({ kind: 'door', id: `door:post${side < 0 ? 'L' : 'R'}`, group: 'structure', shape: rect(layout.door.x + side * half, doorZ, DOOR_POST_WIDTH, DOOR_FRAME_DEPTH) });
  }
  // rotation.y turns local +x toward (cos, -sin).
  const lx = layout.door.x - half + DOOR_LEAF_X;
  const lz = doorZ + DOOR_LEAF_Z;
  const ux = (Math.cos(DOOR_LEAF_YAW) * DOOR_LEAF_WIDTH) / 2;
  const uz = (-Math.sin(DOOR_LEAF_YAW) * DOOR_LEAF_WIDTH) / 2;
  out.push({
    kind: 'door',
    id: 'door:leaf',
    group: 'structure',
    shape: { type: 'segment', ax: lx - ux, az: lz - uz, bx: lx + ux, bz: lz + uz, r: DOOR_LEAF_THICKNESS / 2 },
  });
  doorPlanters(layout).forEach((p, i) => {
    const id = `planter:${i === 0 ? 'L' : 'R'}`;
    out.push({ kind: 'planter', id, group: id, shape: rect(p.x, p.z, PLANTER_HALF * 2, PLANTER_HALF * 2) });
  });

  const c = layout.counter;
  out.push({ kind: 'counter', id: 'counter', group: 'counter', shape: rect(c.pos.x, c.pos.z, c.width + COUNTER_TOP_EXTRA, COUNTER_TOP_DEPTH) });

  const bar = backCounterSpan(layout);
  if (bar) {
    out.push({
      kind: 'back_counter',
      id: 'back_counter',
      group: 'bar',
      shape: rect((bar.minX + bar.maxX) / 2, BACK_COUNTER_Z, bar.maxX - bar.minX + BACK_COUNTER_TOP_EXTRA, BACK_COUNTER_TOP_DEPTH),
    });
  }
  layout.machines.forEach((m, i) => {
    const size = MACHINE_SIZE[m.kind];
    out.push({ kind: 'machine', id: `machine:${i}`, group: 'bar', shape: rect(m.pos.x, m.pos.z, size.width, size.depth) });
  });

  for (const t of layout.tables) {
    const group = `table:${t.id}`;
    out.push({ kind: 'table', id: group, group, shape: { type: 'circle', x: t.pos.x, z: t.pos.z, r: TABLE_RADIUS } });
    for (let s = 0; s < Math.min(t.seats, 2); s++) {
      const side = s === 0 ? -1 : 1;
      out.push({ kind: 'chair', id: `chair:${t.id}:${s}`, group, shape: rect(t.pos.x + side * CHAIR_OFFSET, t.pos.z, CHAIR_SIZE, CHAIR_SIZE) });
    }
    if (t.zone === 'outdoor') {
      out.push({ kind: 'parasol', id: `parasol:${t.id}`, group, shape: { type: 'circle', x: t.pos.x, z: t.pos.z, r: PARASOL_POLE_RADIUS } });
    }
  }

  layout.decor.forEach((d, i) => {
    if (d.kind !== 'plant') return;
    out.push({ kind: 'plant', id: `plant:${i}`, group: `plant:${i}`, shape: { type: 'circle', x: d.pos.x, z: d.pos.z, r: PLANT_RADIUS } });
  });
  return out;
}

/** Distance from (x, z) to the shape, 0 inside it. */
export function shapeDistance(s: Shape, x: number, z: number): number {
  switch (s.type) {
    case 'rect': {
      const dx = Math.max(s.minX - x, 0, x - s.maxX);
      const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
      return Math.hypot(dx, dz);
    }
    case 'circle':
      return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
    case 'segment': {
      const vx = s.bx - s.ax;
      const vz = s.bz - s.az;
      const len2 = vx * vx + vz * vz;
      const k = len2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / len2)) : 0;
      return Math.max(0, Math.hypot(x - (s.ax + vx * k), z - (s.az + vz * k)) - s.r);
    }
  }
}

/** Axis-aligned bounds of the shape. */
export function shapeBounds(s: Shape): { minX: number; maxX: number; minZ: number; maxZ: number } {
  switch (s.type) {
    case 'rect':
      return s;
    case 'circle':
      return { minX: s.x - s.r, maxX: s.x + s.r, minZ: s.z - s.r, maxZ: s.z + s.r };
    case 'segment':
      return {
        minX: Math.min(s.ax, s.bx) - s.r,
        maxX: Math.max(s.ax, s.bx) + s.r,
        minZ: Math.min(s.az, s.bz) - s.r,
        maxZ: Math.max(s.az, s.bz) + s.r,
      };
  }
}
