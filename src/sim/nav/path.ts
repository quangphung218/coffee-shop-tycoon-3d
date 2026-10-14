import type { Vec2 } from '../types';
import { NAV_CELL, cellAt, cellCenter, type NavGrid } from './grid';

/**
 * A* over a NavGrid: 8 directions, no cutting past a blocked corner, ties
 * broken by cell index so the same grid and endpoints always give the same
 * route. The cell path is then shortened to the corners that are needed
 * (line of sight) and kept in a small LRU cache.
 */

const PATH_CACHE_SIZE = 128;
const SQRT2 = Math.SQRT2;
/** [dCol, dRow] in a fixed order. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function isWalkable(grid: NavGrid, p: Vec2): boolean {
  const i = cellAt(grid, p);
  return i >= 0 && grid.blocked[i] === 0;
}

function free(grid: NavGrid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.blocked[r * grid.cols + c] === 0;
}

/** Index of the reachable free cell closest to p (ties: lower index), or -1. */
function nearestFreeCell(grid: NavGrid, p: Vec2): number {
  const target = grid.mainComponent;
  const pc = Math.round(p.x / NAV_CELL) - grid.col0;
  const pr = Math.round(p.z / NAV_CELL) - grid.row0;
  const maxRing = Math.max(grid.cols, grid.rows) + Math.max(Math.abs(pc), Math.abs(pr));
  let best = -1;
  let bestDist = Infinity;
  for (let ring = 0; ring <= maxRing; ring++) {
    // Every cell in this ring is at least this far from p.
    if ((ring - 0.5) * NAV_CELL > bestDist) break;
    for (let r = pr - ring; r <= pr + ring; r++) {
      if (r < 0 || r >= grid.rows) continue;
      const edge = r === pr - ring || r === pr + ring;
      for (let c = pc - ring; c <= pc + ring; c += edge ? 1 : 2 * ring) {
        if (c >= 0 && c < grid.cols) {
          const i = r * grid.cols + c;
          if (!grid.blocked[i] && (target === 0 || grid.component[i] === target)) {
            const d = Math.hypot((grid.col0 + c) * NAV_CELL - p.x, (grid.row0 + r) * NAV_CELL - p.z);
            if (d < bestDist || (d === bestDist && i < best)) {
              bestDist = d;
              best = i;
            }
          }
        }
        if (ring === 0) break;
      }
    }
  }
  return best;
}

/**
 * p itself when it stands on a free cell people can reach from the door,
 * otherwise the centre of the closest such cell; null if there is none.
 */
export function nearestFree(grid: NavGrid, p: Vec2): Vec2 | null {
  const i = cellAt(grid, p);
  if (i >= 0 && !grid.blocked[i] && (grid.mainComponent === 0 || grid.component[i] === grid.mainComponent)) return { x: p.x, z: p.z };
  const j = nearestFreeCell(grid, p);
  return j >= 0 ? cellCenter(grid, j) : null;
}

/** Binary min-heap of cell indices ordered by (f, index). */
class OpenSet {
  private readonly items: number[] = [];
  constructor(private readonly f: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a]!;
    const fb = this.f[b]!;
    return fa < fb || (fa === fb && a < b);
  }

  push(i: number): void {
    const h = this.items;
    h.push(i);
    let k = h.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!this.less(h[k]!, h[parent]!)) break;
      [h[k], h[parent]] = [h[parent]!, h[k]!];
      k = parent;
    }
  }

  pop(): number {
    const h = this.items;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < h.length && this.less(h[l]!, h[m]!)) m = l;
        if (r < h.length && this.less(h[r]!, h[m]!)) m = r;
        if (m === k) break;
        [h[k], h[m]] = [h[m]!, h[k]!];
        k = m;
      }
    }
    return top;
  }
}

function octile(dc: number, dr: number): number {
  const a = Math.abs(dc);
  const b = Math.abs(dr);
  return Math.max(a, b) + (SQRT2 - 1) * Math.min(a, b);
}

/** Cell indices from start to goal, both included; null when unreachable. */
function astar(grid: NavGrid, start: number, goal: number): number[] | null {
  const n = grid.cols * grid.rows;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % grid.cols;
  const gr = (goal - gc) / grid.cols;
  const open = new OpenSet(f);
  g[start] = 0;
  f[start] = octile(start % grid.cols - gc, Math.floor(start / grid.cols) - gr);
  open.push(start);
  while (open.size > 0) {
    const i = open.pop();
    if (closed[i]) continue;
    if (i === goal) {
      const path: number[] = [];
      for (let k = goal; k !== -1; k = parent[k]!) path.push(k);
      return path.reverse();
    }
    closed[i] = 1;
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!free(grid, nc, nr)) continue;
      // No squeezing diagonally past a blocked corner.
      if (dc !== 0 && dr !== 0 && (!free(grid, c + dc, r) || !free(grid, c, r + dr))) continue;
      const j = nr * grid.cols + nc;
      if (closed[j]) continue;
      const cost = g[i]! + (dc !== 0 && dr !== 0 ? SQRT2 : 1);
      if (cost < g[j]!) {
        g[j] = cost;
        parent[j] = i;
        f[j] = cost + octile(nc - gc, nr - gr);
        open.push(j);
      }
    }
  }
  return null;
}

/**
 * True when the straight line between two cell centres only crosses free
 * cells; passing exactly through a corner needs both side cells free.
 */
function lineOfSight(grid: NavGrid, a: number, b: number): boolean {
  let c = a % grid.cols;
  let r = (a - c) / grid.cols;
  const bc = b % grid.cols;
  const br = (b - bc) / grid.cols;
  const sc = Math.sign(bc - c);
  const sr = Math.sign(br - r);
  const nc = Math.abs(bc - c);
  const nr = Math.abs(br - r);
  let ic = 0;
  let ir = 0;
  while (ic < nc || ir < nr) {
    // Compare where the line leaves the cell across x and across z (integer maths).
    const d = (1 + 2 * ic) * nr - (1 + 2 * ir) * nc;
    if (d === 0) {
      if (!free(grid, c + sc, r) || !free(grid, c, r + sr)) return false;
      c += sc;
      r += sr;
      ic++;
      ir++;
    } else if (d < 0) {
      c += sc;
      ic++;
    } else {
      r += sr;
      ir++;
    }
    if (!free(grid, c, r)) return false;
  }
  return true;
}

/** Keeps only the corners of the cell path that the line of sight needs. */
function smooth(grid: NavGrid, cells: number[]): number[] {
  if (cells.length <= 2) return cells;
  const out = [cells[0]!];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let next = anchor + 1;
    for (let j = cells.length - 1; j > next; j--) {
      if (lineOfSight(grid, cells[anchor]!, cells[j]!)) {
        next = j;
        break;
      }
    }
    out.push(cells[next]!);
    anchor = next;
  }
  return out;
}

const pathCache = new Map<string, number[] | null>();

function cachedCells(grid: NavGrid, start: number, goal: number): number[] | null {
  const key = `${grid.key}|${start}|${goal}`;
  if (pathCache.has(key)) {
    const hit = pathCache.get(key)!;
    pathCache.delete(key);
    pathCache.set(key, hit);
    return hit;
  }
  const raw = astar(grid, start, goal);
  const cells = raw && smooth(grid, raw);
  pathCache.set(key, cells);
  if (pathCache.size > PATH_CACHE_SIZE) pathCache.delete(pathCache.keys().next().value!);
  return cells;
}

/**
 * Waypoints from `from` to `to` around everything on the floor, not
 * including `from`. A blocked or unreachable end is moved to the nearest
 * free cell first: the path then starts by stepping out to it, or ends at
 * it instead of `to`. Null when no free cell can be reached at all.
 */
export function findPath(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const startFree = nearestFree(grid, from);
  const goalFree = nearestFree(grid, to);
  if (!startFree || !goalFree) return null;
  const start = cellAt(grid, startFree);
  const goal = cellAt(grid, goalFree);
  const cells = cachedCells(grid, start, goal);
  if (!cells) return null;
  const startMoved = startFree.x !== from.x || startFree.z !== from.z;
  const out: Vec2[] = [];
  for (let k = startMoved ? 0 : 1; k < cells.length - 1; k++) out.push(cellCenter(grid, cells[k]!));
  out.push(goalFree);
  return out;
}

/** Empties the path cache (tests). */
export function clearPathCache(): void {
  pathCache.clear();
}
