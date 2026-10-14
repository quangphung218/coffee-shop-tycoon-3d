import { claimSpot } from '../../sim/customers';
import { CHAIR_OFFSET } from '../../sim/nav/footprints';
import { buildNavGrid, cellAt, cellCenter, findPath, isWalkable, nearestFree, type NavGrid } from '../../sim/nav';
import type { Customer, CustomerState, GameState, StaffTask, StaffTaskKind, Vec2 } from '../../sim/types';
import type { ShopLayout } from '../../sim/upgrades';
import type { AnimName } from './animations';

/**
 * Maps sim state to what each person on screen should be doing: an
 * animation, a spot to walk to and the direction to face once there.
 * Everything here is pure; index.ts owns the three objects.
 *
 * The sim moves customers in 4-unit hops once per game minute and teleports
 * staff to the spot they hold, so the renderer walks each person to the
 * spot the sim gave them along the nav grid's path (findPath, around the
 * furniture and through the door) on the continuous game clock
 * `minute + alpha`, which keeps movement smooth between ticks.
 */

/** Heading (rotation.y) that faces -z: toward the counter and the machines. */
export const FACE_BACK = Math.PI;
/** Heading that faces +z: from behind the counter toward the room. */
export const FACE_FRONT = 0;

/** Walking speeds in world units per game minute. */
export const WALK_SPEED = 3.5;
export const ANGRY_SPEED = 5.5;
export const STAFF_SPEED = 4.5;
/** Past this much path left, people hurry so they never fall far behind the sim. */
export const CATCH_UP_DISTANCE = 6;
const MAX_CATCH_UP = 4;
/** How far past the door leaving customers walk before they disappear. */
export const EXIT_DISTANCE = 3.2;

/** What a person is doing this frame. */
export interface Goal {
  pos: Vec2;
  /** Heading to turn to once arrived; null keeps the walking direction. */
  face: number | null;
  seated: boolean;
}

/** Customer animation when standing still, by sim state. */
export const CUSTOMER_ANIM: Readonly<Record<CustomerState, AnimName>> = {
  entering: 'queue',
  queueing: 'queue',
  ordering: 'idle',
  waiting: 'queue',
  drinking: 'drink',
  paying: 'sit',
  leaving: 'idle',
  angry_leave: 'angry_leave',
};

export function customerAnim(state: CustomerState, moving: boolean, seated: boolean): AnimName {
  if (state === 'angry_leave') return 'angry_leave';
  if (moving) return 'walk';
  if (state === 'waiting' && seated) return 'sit';
  return CUSTOMER_ANIM[state];
}

/** Staff and player animation while at the task spot. */
const TASK_ANIM: Readonly<Record<StaffTaskKind, AnimName>> = {
  brew: 'work',
  take_order: 'idle',
  serve: 'serve',
  clean: 'clean',
  collect: 'work',
  promote: 'wave',
  idle: 'idle',
};

export function workerAnim(task: StaffTask | null, moving: boolean): AnimName {
  const kind = task?.kind ?? 'idle';
  if (moving) return kind === 'serve' ? 'carry_tray' : 'walk';
  return TASK_ANIM[kind];
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Where leaving customers head: out through the door onto the sidewalk. */
export function exitPoint(layout: ShopLayout): Vec2 {
  return { x: layout.door.x, z: layout.door.z + EXIT_DISTANCE };
}

/** The player's spot behind the counter when there is nothing to do. */
export function playerHome(layout: ShopLayout): Vec2 {
  return { x: layout.counter.pos.x + 0.9, z: layout.counter.pos.z - 0.75 };
}

/** Chair a seated customer sits on, or null when they are not at a table. */
function chairFor(state: GameState, c: Customer): { pos: Vec2; face: number } | null {
  if (c.tableId === null || !c.target) return null;
  if (c.state !== 'waiting' && c.state !== 'drinking' && c.state !== 'paying') return null;
  const table = state.tables.find((t) => t.id === c.tableId);
  if (!table) return null;
  const side = c.target.x < table.pos.x ? -1 : 1;
  return { pos: { x: table.pos.x + side * CHAIR_OFFSET, z: table.pos.z }, face: side < 0 ? Math.PI / 2 : -Math.PI / 2 };
}

export function customerGoal(state: GameState, c: Customer, layout: ShopLayout): Goal {
  if (c.state === 'leaving' || c.state === 'angry_leave') return { pos: exitPoint(layout), face: null, seated: false };
  const chair = chairFor(state, c);
  if (chair) return { pos: chair.pos, face: chair.face, seated: true };
  const pos = c.target ?? c.pos;
  return { pos: { x: pos.x, z: pos.z }, face: FACE_BACK, seated: false };
}

/** Heading from `from` toward `to`, or `fallback` when they are on the same spot. */
function faceToward(from: Vec2, to: Vec2, fallback: number): number {
  return dist(from, to) > 1e-3 ? headingOf(to.x - from.x, to.z - from.z) : fallback;
}

/**
 * Pose for a staff member or the player standing on `spot` (the spot the
 * sim holds for them) while working on `task`: facing the machines, the
 * room, the customer they serve or the table they clean.
 */
export function workerGoal(state: GameState, task: StaffTask | null, layout: ShopLayout, spot: Vec2): Goal {
  const pos = { x: spot.x, z: spot.z };
  let face = FACE_FRONT;
  switch (task?.kind) {
    case 'brew':
      face = FACE_BACK;
      break;
    case 'serve': {
      const order = state.orders.find((o) => o.id === task.targetId);
      const customer = state.customers.find((c) => c.id === order?.customerId);
      if (customer) face = faceToward(pos, customerGoal(state, customer, layout).pos, FACE_BACK);
      break;
    }
    case 'collect':
    case 'clean': {
      const table = state.tables.find((t) => t.id === task.targetId);
      if (table) face = faceToward(pos, table.pos, FACE_FRONT);
      break;
    }
    default:
      break;
  }
  return { pos, face, seated: false };
}

/** Where the sim's staff stand for a task (src/sim/staff.ts wantedSpots): behind the counter, by a table. */
const COUNTER_BACK = 0.75;
const TABLE_SIDE = 0.8;

/** Spots the player would like to stand on for `task`, best first, as the sim picks them for staff. */
function playerWants(state: GameState, task: StaffTask | null, layout: ShopLayout): Vec2[] {
  const counter = layout.counter.pos;
  switch (task?.kind) {
    case 'brew': {
      const machine = layout.machines[0]?.pos ?? counter;
      return [{ x: machine.x, z: counter.z - COUNTER_BACK }];
    }
    case 'take_order':
      return [{ x: counter.x, z: counter.z - COUNTER_BACK }];
    case 'serve': {
      const order = state.orders.find((o) => o.id === task.targetId);
      const customer = state.customers.find((c) => c.id === order?.customerId);
      return [customer ? (customer.target ?? customer.pos) : layout.pickup];
    }
    case 'collect':
    case 'clean': {
      const table = state.tables.find((t) => t.id === task.targetId);
      if (!table) break;
      return [
        { x: table.pos.x, z: table.pos.z - TABLE_SIDE },
        { x: table.pos.x, z: table.pos.z + TABLE_SIDE },
      ];
    }
    default:
      break;
  }
  return [playerHome(layout)];
}

/**
 * The player's standing spot for `task`. The sim does not place the player,
 * so this claims one with the sim's claimSpot after the cells customers and
 * staff hold: nobody ends up inside furniture or on top of someone else.
 */
export function playerSpot(state: GameState, task: StaffTask | null, layout: ShopLayout): Vec2 {
  const grid = buildNavGrid(layout);
  const taken = new Set<number>();
  for (const c of state.customers) {
    if (c.state === 'leaving' || c.state === 'angry_leave') continue;
    const spot = nearestFree(grid, c.target ?? c.pos);
    if (spot) taken.add(cellAt(grid, spot));
  }
  for (const s of state.staff) {
    const i = cellAt(grid, s.pos);
    if (i >= 0) taken.add(i);
  }
  return claimSpot(grid, playerWants(state, task, layout), taken);
}

/** Walking state of one person on screen. */
export interface Motion {
  pos: Vec2;
  /** Remaining waypoints, the last one is the goal. */
  path: Vec2[];
  goal: Vec2 | null;
  /** Where the path to the goal ends: the goal, or the free cell next to it when it is blocked. */
  end: Vec2 | null;
  /** Drawn this far from `pos` so walkers do not overlap (see separate); 0 once they stand still. */
  offset: Vec2;
}

export function createMotion(pos: Vec2): Motion {
  return { pos: { x: pos.x, z: pos.z }, path: [], goal: null, end: null, offset: { x: 0, z: 0 } };
}

/**
 * Points the motion at a new goal along the nav grid (findPath, cached), so
 * people walk around furniture instead of through it. A goal within a few
 * centimetres of the current one is ignored, so A* only runs when the goal
 * changes. `seat` adds the last step from the floor onto a chair, which is
 * furniture; other goals end on the nearest free cell when theirs is blocked.
 */
export function setGoal(m: Motion, goal: Vec2, layout: ShopLayout, seat = false): void {
  if (m.goal && dist(m.goal, goal) < 0.05) return;
  m.goal = { x: goal.x, z: goal.z };
  const grid = buildNavGrid(layout);
  // Mid-walk the person is rarely on a cell centre; stepping to the centre of
  // their (free) cell first keeps the whole walk on cells A* checked.
  const cell = cellAt(grid, m.pos);
  const centre = cell >= 0 && grid.blocked[cell] === 0 ? cellCenter(grid, cell) : null;
  const from = centre && dist(centre, m.pos) > 1e-6 ? centre : m.pos;
  const path = findPath(grid, from, goal) ?? [{ x: goal.x, z: goal.z }];
  if (from !== m.pos) path.unshift(from);
  const end = path[path.length - 1]!;
  if (seat && dist(end, goal) > 1e-6) path.push({ x: goal.x, z: goal.z });
  m.path = path;
  m.end = path[path.length - 1]!;
}

/** Jumps straight to the end of the current path (first frame, new day, loaded save). */
export function snap(m: Motion): void {
  const end = m.end ?? m.goal;
  if (end) m.pos = { x: end.x, z: end.z };
  m.path = [];
  m.offset.x = 0;
  m.offset.z = 0;
}

export function remaining(m: Motion): number {
  let total = 0;
  let prev = m.pos;
  for (const p of m.path) {
    total += dist(prev, p);
    prev = p;
  }
  return total;
}

/** Distance to cover this frame: speed × game minutes, faster when far behind. */
export function stepDistance(m: Motion, speed: number, dtMinutes: number): number {
  const left = remaining(m);
  const hurry = left > CATCH_UP_DISTANCE ? Math.min(MAX_CATCH_UP, left / CATCH_UP_DISTANCE) : 1;
  return speed * hurry * Math.max(0, dtMinutes);
}

/**
 * Walks up to `distance` along the path. Returns the distance actually
 * covered and writes the walking direction into `dir` when it moved.
 */
export function advance(m: Motion, distance: number, dir?: { x: number; z: number }): number {
  let left = distance;
  let moved = 0;
  while (left > 1e-6 && m.path.length > 0) {
    const next = m.path[0]!;
    const dx = next.x - m.pos.x;
    const dz = next.z - m.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6 && dir) {
      dir.x = dx / d;
      dir.z = dz / d;
    }
    if (d <= left) {
      m.pos.x = next.x;
      m.pos.z = next.z;
      m.path.shift();
      left -= d;
      moved += d;
    } else {
      m.pos.x += (dx / d) * left;
      m.pos.z += (dz / d) * left;
      moved += left;
      left = 0;
    }
  }
  return moved;
}

/** People walking closer than this to someone else are eased apart. */
export const SEPARATION_RADIUS = 0.3;
/** Most a walker is pushed aside per game minute, so the push stays a gentle drift. */
export const SEPARATION_RATE = 1.5;
/** A walker is never drawn further than this from their path. */
const MAX_OFFSET = SEPARATION_RADIUS;

const probe: Vec2 = { x: 0, z: 0 };

/** True when m drawn at offset (ox, oz) stands on a walkable cell. */
function fits(m: Motion, ox: number, oz: number, grid: NavGrid): boolean {
  probe.x = m.pos.x + ox;
  probe.z = m.pos.z + oz;
  return isWalkable(grid, probe);
}

/** Sets m's offset to (ox, oz), or one axis of it, or leaves it, whichever is first to keep m on free floor. */
function setOffset(m: Motion, ox: number, oz: number, grid: NavGrid): boolean {
  const len = Math.hypot(ox, oz);
  if (len > MAX_OFFSET) {
    ox *= MAX_OFFSET / len;
    oz *= MAX_OFFSET / len;
  }
  if (fits(m, ox, oz, grid)) {
    m.offset.x = ox;
    m.offset.z = oz;
    return true;
  }
  if (fits(m, ox, m.offset.z, grid)) {
    m.offset.x = ox;
    return true;
  }
  if (fits(m, m.offset.x, oz, grid)) {
    m.offset.z = oz;
    return true;
  }
  return false;
}

/** Where m is drawn: its place on the path plus the separation offset. */
export function shownX(m: Motion): number {
  return m.pos.x + m.offset.x;
}

export function shownZ(m: Motion): number {
  return m.pos.z + m.offset.z;
}

/**
 * Eases walking people apart when they are drawn within SEPARATION_RADIUS
 * of each other, by at most `maxStep` per pair this frame. It moves only
 * the drawing offset, never `pos`, so everyone still follows the path A*
 * found; once someone stops walking their offset melts back to 0 and they
 * stand right on the spot the sim holds for them. People standing still
 * are not pushed; walkers step around them. An offset that would put
 * someone on a blocked cell is cut to one axis, or dropped. Looks only; the
 * sim never sees it. Reads the first `count` motions and allocates nothing.
 */
export function separate(motions: readonly Motion[], count: number, grid: NavGrid, maxStep: number): void {
  if (!(maxStep > 0)) return;
  // Settle offsets first: melt them for people who stopped, and drop any the
  // walk itself has carried onto furniture.
  for (let i = 0; i < count; i++) {
    const m = motions[i]!;
    const o = m.offset;
    if (o.x === 0 && o.z === 0) continue;
    const len = Math.hypot(o.x, o.z);
    const k = m.path.length === 0 ? Math.max(0, len - maxStep) / len : 1;
    const ox = o.x * k;
    const oz = o.z * k;
    if (k > 0 && fits(m, ox, oz, grid)) {
      o.x = ox;
      o.z = oz;
    } else {
      o.x = 0;
      o.z = 0;
    }
  }
  for (let i = 0; i < count; i++) {
    const a = motions[i]!;
    for (let j = i + 1; j < count; j++) {
      const b = motions[j]!;
      const aWalks = a.path.length > 0;
      const bWalks = b.path.length > 0;
      if (!aWalks && !bWalks) continue;
      const dx = shownX(b) - shownX(a);
      const dz = shownZ(b) - shownZ(a);
      const d = Math.hypot(dx, dz);
      if (d >= SEPARATION_RADIUS) continue;
      // On the very same point, part along x; the order keeps it deterministic.
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      const push = Math.min(maxStep, SEPARATION_RADIUS - d);
      const share = aWalks && bWalks ? push / 2 : push;
      if (aWalks) setOffset(a, a.offset.x - ux * share, a.offset.z - uz * share, grid);
      if (bWalks) setOffset(b, b.offset.x + ux * share, b.offset.z + uz * share, grid);
    }
  }
}

/** Shortest signed turn from heading a to heading b, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  const d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) return d - Math.PI * 2;
  if (d <= -Math.PI) return d + Math.PI * 2;
  return d;
}

/** Heading that faces direction (x, z): rotation.y turns local +z toward it. */
export function headingOf(x: number, z: number): number {
  return Math.atan2(x, z);
}
