import type { Vec2 } from '../types';
import type { ShopLayout } from '../upgrades';
import { WALL_THICKNESS, buildingArea, layoutFootprints, shapeBounds, shapeDistance } from './footprints';

/**
 * Walkability grid of the shop floor, built from a ShopLayout. Cells are
 * NAV_CELL wide and centred on multiples of NAV_CELL. A cell is blocked when
 * its centre lies outside the floor (indoor, expansion, the patio and the
 * sidewalk in front) or closer than AGENT_RADIUS to a footprint, so a path
 * through free cells keeps a person's body clear of the furniture.
 *
 * Grids are cached by navLayoutKey: they are rebuilt only when the layout
 * changes, never per tick or frame.
 */

export const NAV_CELL = 0.25;
/** Half the width of a person; footprints are grown by this much. */
export const AGENT_RADIUS = 0.2;
/** The grid reaches onto the sidewalk up to here, past where leaving customers disappear. */
export const SIDEWALK_MAX_Z = 9.3;
/** Probe points just inside and outside the door. */
const DOOR_INSIDE = 0.3;
const DOOR_OUTSIDE = 0.4;
const GRID_CACHE_SIZE = 4;
const EPS = 1e-9;

export interface NavGrid {
  /** navLayoutKey of the layout the grid was built from. */
  readonly key: number;
  readonly cols: number;
  readonly rows: number;
  /** Cell coordinates (in NAV_CELL units) of cell (0, 0). */
  readonly col0: number;
  readonly row0: number;
  /** 1 = blocked, indexed row * cols + col (row runs along z). */
  readonly blocked: Uint8Array;
  /** Connected walkable area of each cell, 0 for blocked cells. */
  readonly component: Int32Array;
  /** Component of the sidewalk outside the door: where people can actually get to. 0 if blocked. */
  readonly mainComponent: number;
  /** Cells just inside and just outside the door. */
  readonly doorInside: number;
  readonly doorOutside: number;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619);
}

/** Hash of everything in the layout that shapes the floor plan. */
export function navLayoutKey(layout: ShopLayout): number {
  let h = 2166136261;
  for (const a of [layout.indoor, layout.expansion, layout.outdoor]) {
    h = mix(h, a ? 1 : 0);
    if (a) h = mix(mix(mix(mix(h, a.minX), a.maxX), a.minZ), a.maxZ);
  }
  h = mix(mix(h, layout.door.x), layout.door.z);
  h = mix(mix(mix(h, layout.counter.pos.x), layout.counter.pos.z), layout.counter.width);
  h = mix(h, layout.machines.length);
  for (const m of layout.machines) h = mix(mix(mix(h, m.kind === 'fast' ? 1 : 0), m.pos.x), m.pos.z);
  h = mix(h, layout.tables.length);
  for (const t of layout.tables) h = mix(mix(mix(mix(h, t.pos.x), t.pos.z), t.seats), t.zone === 'outdoor' ? 1 : 0);
  h = mix(h, layout.decor.length);
  for (const d of layout.decor) h = mix(mix(mix(h, d.kind === 'plant' ? 1 : d.kind === 'light' ? 2 : 3), d.pos.x), d.pos.z);
  for (const p of layout.premium) if (p.kind === 'grand_piano') h = mix(mix(mix(h, 4), p.pos.x), p.pos.z);
  return h >>> 0;
}

/** Index of the cell containing p, or -1 outside the grid. */
export function cellAt(grid: NavGrid, p: Vec2): number {
  const c = Math.round(p.x / NAV_CELL) - grid.col0;
  const r = Math.round(p.z / NAV_CELL) - grid.row0;
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

/** World position of a cell's centre. */
export function cellCenter(grid: NavGrid, index: number): Vec2 {
  return { x: (grid.col0 + (index % grid.cols)) * NAV_CELL, z: (grid.row0 + Math.floor(index / grid.cols)) * NAV_CELL };
}

/** Builds the grid without the cache (tests and benchmarks). */
export function createNavGrid(layout: ShopLayout, key = navLayoutKey(layout)): NavGrid {
  const room = buildingArea(layout);
  const t = WALL_THICKNESS;
  const minX = Math.min(room.minX - t, layout.outdoor?.minX ?? Infinity);
  const maxX = Math.max(room.maxX + t, layout.outdoor?.maxX ?? -Infinity);
  const col0 = Math.floor(minX / NAV_CELL + EPS);
  const row0 = Math.floor((room.minZ - t) / NAV_CELL + EPS);
  const cols = Math.ceil(maxX / NAV_CELL - EPS) - col0 + 1;
  const rows = Math.floor(SIDEWALK_MAX_Z / NAV_CELL + EPS) - row0 + 1;
  const blocked = new Uint8Array(cols * rows);

  // Floor: inside the building, or anywhere in front of it (patio and sidewalk);
  // the front wall footprint then closes everything but the doorway.
  for (let r = 0; r < rows; r++) {
    const z = (row0 + r) * NAV_CELL;
    if (z > room.maxZ) continue;
    for (let c = 0; c < cols; c++) {
      const x = (col0 + c) * NAV_CELL;
      if (!(x > room.minX && x < room.maxX && z > room.minZ)) blocked[r * cols + c] = 1;
    }
  }

  const reach = AGENT_RADIUS - EPS;
  for (const fp of layoutFootprints(layout)) {
    const b = shapeBounds(fp.shape);
    const c1 = Math.max(0, Math.ceil((b.minX - reach) / NAV_CELL) - col0);
    const c2 = Math.min(cols - 1, Math.floor((b.maxX + reach) / NAV_CELL) - col0);
    const r1 = Math.max(0, Math.ceil((b.minZ - reach) / NAV_CELL) - row0);
    const r2 = Math.min(rows - 1, Math.floor((b.maxZ + reach) / NAV_CELL) - row0);
    for (let r = r1; r <= r2; r++) {
      const z = (row0 + r) * NAV_CELL;
      for (let c = c1; c <= c2; c++) {
        const i = r * cols + c;
        if (blocked[i]) continue;
        if (shapeDistance(fp.shape, (col0 + c) * NAV_CELL, z) < reach) blocked[i] = 1;
      }
    }
  }

  const component = labelComponents(blocked, cols, rows);
  const partial = { key, cols, rows, col0, row0, blocked, component, mainComponent: 0, doorInside: -1, doorOutside: -1 };
  const doorInside = cellAt(partial, { x: layout.door.x, z: room.maxZ - DOOR_INSIDE });
  const doorOutside = cellAt(partial, { x: layout.door.x, z: room.maxZ + t + DOOR_OUTSIDE });
  const mainComponent = doorOutside >= 0 ? component[doorOutside]! : 0;
  return { ...partial, mainComponent, doorInside, doorOutside };
}

/** 4-connected labelling in index order, so the labels are deterministic. */
function labelComponents(blocked: Uint8Array, cols: number, rows: number): Int32Array {
  const comp = new Int32Array(cols * rows);
  const stack = new Int32Array(cols * rows);
  let next = 0;
  for (let start = 0; start < comp.length; start++) {
    if (blocked[start] || comp[start]) continue;
    const label = ++next;
    let top = 0;
    const visit = (j: number): void => {
      if (blocked[j] || comp[j]) return;
      comp[j] = label;
      stack[top++] = j;
    };
    visit(start);
    while (top > 0) {
      const i = stack[--top]!;
      const c = i % cols;
      const r = (i - c) / cols;
      if (c > 0) visit(i - 1);
      if (c < cols - 1) visit(i + 1);
      if (r > 0) visit(i - cols);
      if (r < rows - 1) visit(i + cols);
    }
  }
  return comp;
}

const gridCache = new Map<number, NavGrid>();

/** The nav grid for this layout, from the cache when the layout is unchanged. */
export function buildNavGrid(layout: ShopLayout): NavGrid {
  const key = navLayoutKey(layout);
  const cached = gridCache.get(key);
  if (cached) {
    // Refresh its place in the LRU order.
    gridCache.delete(key);
    gridCache.set(key, cached);
    return cached;
  }
  const grid = createNavGrid(layout, key);
  gridCache.set(key, grid);
  if (gridCache.size > GRID_CACHE_SIZE) gridCache.delete(gridCache.keys().next().value!);
  return grid;
}

/** Empties the grid cache (tests). */
export function clearNavGridCache(): void {
  gridCache.clear();
}
