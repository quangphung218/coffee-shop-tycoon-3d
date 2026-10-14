import type { Vec2 } from '../types';
import type { ShopLayout } from '../upgrades';
import { CHAIR_OFFSET, CHAIR_SIZE, layoutFootprints, shapeDistance, type Footprint, type Shape } from './footprints';
import { AGENT_RADIUS, NAV_CELL, buildNavGrid, cellAt, type NavGrid } from './grid';
import { nearestFree } from './path';

export type LayoutIssue =
  /** Two pieces of furniture (or furniture and a wall) take up the same floor. */
  | { kind: 'overlap'; a: string; b: string }
  /** Nobody can get from the sidewalk through the door into the shop. */
  | { kind: 'door_blocked' }
  /** A counter spot cannot be reached from the door: where customers order, where staff stand, or the pickup mat. */
  | { kind: 'counter_blocked'; spot: 'front' | 'back' | 'pickup' }
  /** No chair of the table can be reached from the door. */
  | { kind: 'table_unreachable'; tableId: number };

const EPS = 1e-6;
const SEGMENT_SAMPLES = 9;
/** Where customers order, and where staff stand, in front of and behind the counter centre. */
const COUNTER_FRONT = 1;
const COUNTER_BACK = 0.75;
/** A chair counts as reachable when free floor starts within this distance of it. */
const CHAIR_REACH = CHAIR_SIZE / 2 + AGENT_RADIUS + NAV_CELL;

function overlaps(a: Shape, b: Shape): boolean {
  if (a.type === 'segment' || b.type === 'segment') {
    const [seg, other] = a.type === 'segment' ? [a, b] : [b as Extract<Shape, { type: 'segment' }>, a];
    for (let k = 0; k < SEGMENT_SAMPLES; k++) {
      const t = k / (SEGMENT_SAMPLES - 1);
      if (shapeDistance(other, seg.ax + (seg.bx - seg.ax) * t, seg.az + (seg.bz - seg.az) * t) < seg.r - EPS) return true;
    }
    return false;
  }
  if (a.type === 'circle') return shapeDistance(b, a.x, a.z) < a.r - EPS;
  if (b.type === 'circle') return shapeDistance(a, b.x, b.z) < b.r - EPS;
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
}

function reachable(grid: NavGrid, p: Vec2, within = 0): boolean {
  if (grid.mainComponent === 0) return false;
  const i = cellAt(grid, p);
  if (i >= 0 && grid.component[i] === grid.mainComponent) return true;
  if (within <= 0) return false;
  const q = nearestFree(grid, p);
  return q !== null && Math.hypot(q.x - p.x, q.z - p.z) <= within;
}

/**
 * Problems with where things stand: overlapping footprints, a blocked door,
 * an unreachable counter or table. Empty for a sound layout.
 */
export function validateLayout(layout: ShopLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const fps: Footprint[] = layoutFootprints(layout);
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const a = fps[i]!;
      const b = fps[j]!;
      if (a.group === b.group) continue;
      if (overlaps(a.shape, b.shape)) issues.push({ kind: 'overlap', a: a.id, b: b.id });
    }
  }

  const grid = buildNavGrid(layout);
  const doorOk =
    grid.mainComponent !== 0 && grid.doorInside >= 0 && grid.component[grid.doorInside] === grid.mainComponent;
  if (!doorOk) issues.push({ kind: 'door_blocked' });

  const c = layout.counter.pos;
  const spots: [LayoutIssue & { kind: 'counter_blocked' }, Vec2][] = [
    [{ kind: 'counter_blocked', spot: 'front' }, { x: c.x, z: c.z + COUNTER_FRONT }],
    [{ kind: 'counter_blocked', spot: 'back' }, { x: c.x, z: c.z - COUNTER_BACK }],
    [{ kind: 'counter_blocked', spot: 'pickup' }, layout.pickup],
  ];
  for (const [issue, p] of spots) if (!reachable(grid, p)) issues.push(issue);

  for (const t of layout.tables) {
    let ok = false;
    for (let s = 0; s < Math.min(t.seats, 2) && !ok; s++) {
      const side = s === 0 ? -1 : 1;
      ok = reachable(grid, { x: t.pos.x + side * CHAIR_OFFSET, z: t.pos.z }, CHAIR_REACH);
    }
    if (!ok) issues.push({ kind: 'table_unreachable', tableId: t.id });
  }
  return issues;
}
