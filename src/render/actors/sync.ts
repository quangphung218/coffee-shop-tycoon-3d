import { claimSpot } from '../../sim/customers';
import { CHAIR_OFFSET } from '../../sim/nav/footprints';
import { buildNavGrid, cellAt, cellCenter, findPath, isWalkable, nearestFree, type NavGrid } from '../../sim/nav';
import type { Customer, CustomerState, GameState, StaffTask, StaffTaskKind, Vec2 } from '../../sim/types';
import type { ShopLayout } from '../../sim/upgrades';
import type { AnimName, Mood } from './animations';

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

/** A standing customer below this share of their patience fidgets and frowns. */
export const IMPATIENT_FRAC = 0.4;

/** States where a standing, low-patience customer shows they are getting restless. */
const RESTLESS: ReadonlySet<CustomerState> = new Set<CustomerState>(['entering', 'queueing', 'waiting']);

export function customerAnim(state: CustomerState, moving: boolean, seated: boolean, patienceFrac = 1): AnimName {
  if (state === 'angry_leave') return 'angry_leave';
  if (moving) return 'walk';
  if (state === 'waiting' && seated) return 'sit';
  if (patienceFrac < IMPATIENT_FRAC && RESTLESS.has(state)) return 'impatient';
  return CUSTOMER_ANIM[state];
}

/** Expression for a customer in `state` with `patienceFrac` of their patience left. */
export function customerMood(state: CustomerState, patienceFrac: number): Mood {
  if (state === 'angry_leave') return 'angry';
  if (state === 'drinking' || state === 'leaving') return 'happy';
  if (patienceFrac < IMPATIENT_FRAC && RESTLESS.has(state)) return 'impatient';
  return 'neutral';
}

/** Staff and player animation while at the task spot. */
const TASK_ANIM: Readonly<Record<StaffTaskKind, AnimName>> = {
  brew: 'brew',
  take_order: 'idle',
  serve: 'handoff',
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
  /** Walking speed right now, in world units per game minute (see easedStep). */
  speed: number;
}

export function createMotion(pos: Vec2): Motion {
  return { pos: { x: pos.x, z: pos.z }, path: [], goal: null, end: null, offset: { x: 0, z: 0 }, speed: 0 };
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
  const found = findPath(grid, from, goal) ?? [{ x: goal.x, z: goal.z }];
  if (from !== m.pos) found.unshift(from);
  const path = roundCorners(grid, m.pos, found);
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
  m.speed = 0;
  m.offset.x = 0;
  m.offset.z = 0;
}

/** Corners of a walk are rounded with at most this radius, in world units. */
export const CORNER_RADIUS = 0.35;
/** Segments of each rounded corner. */
const CORNER_STEPS = 6;
/** Spacing of the floor checks along a rounded corner. */
const CORNER_CHECK = 0.01;
/** Turns flatter than this (cosine) are left as they are. */
const STRAIGHT = 0.995;
const MIN_CORNER = 0.02;

/** True when every point every CORNER_CHECK along a → b is walkable. */
function clearLine(grid: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / CORNER_CHECK));
  for (let k = 0; k <= n; k++) {
    probe.x = ax + ((bx - ax) * k) / n;
    probe.z = az + ((bz - az) * k) / n;
    if (!isWalkable(grid, probe)) return false;
  }
  return true;
}

/**
 * The walk from `start` along `path` with each corner swapped for a
 * quadratic Bézier arc: from CORNER_RADIUS before the corner (never more
 * than half of either side) to as far after it, the corner as control point.
 * A corner stays sharp when any point along its arc would be off free floor.
 * The last point (the goal) is kept as it is. Returns a new array.
 */
export function roundCorners(grid: NavGrid, start: Vec2, path: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  let prev = start;
  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    const next = path[i + 1];
    if (next && !roundCorner(grid, prev, c, next, out)) out.push(c);
    else if (!next) out.push(c);
    prev = c;
  }
  return out;
}

/** Pushes the arc rounding corner c (from a, on to b) onto `out`; false when it does not fit. */
function roundCorner(grid: NavGrid, a: Vec2, c: Vec2, b: Vec2, out: Vec2[]): boolean {
  const inLen = dist(a, c);
  const outLen = dist(c, b);
  const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
  if (r < MIN_CORNER) return false;
  const ix = (c.x - a.x) / inLen;
  const iz = (c.z - a.z) / inLen;
  const ox = (b.x - c.x) / outLen;
  const oz = (b.z - c.z) / outLen;
  if (ix * ox + iz * oz > STRAIGHT) return false;
  const p0x = c.x - ix * r;
  const p0z = c.z - iz * r;
  const p2x = c.x + ox * r;
  const p2z = c.z + oz * r;
  let px = p0x;
  let pz = p0z;
  for (let k = 1; k <= CORNER_STEPS; k++) {
    const t = k / CORNER_STEPS;
    const u = 1 - t;
    const x = u * u * p0x + 2 * u * t * c.x + t * t * p2x;
    const z = u * u * p0z + 2 * u * t * c.z + t * t * p2z;
    if (!clearLine(grid, px, pz, x, z)) return false;
    px = x;
    pz = z;
  }
  out.push({ x: p0x, z: p0z });
  for (let k = 1; k <= CORNER_STEPS; k++) {
    const t = k / CORNER_STEPS;
    const u = 1 - t;
    out.push({ x: u * u * p0x + 2 * u * t * c.x + t * t * p2x, z: u * u * p0z + 2 * u * t * c.z + t * t * p2z });
  }
  return true;
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

/** Game minutes to get from standing to full speed: 0.25 s at 1× (2 game minutes per second). */
export const ACCEL_MINUTES = 0.5;
/** People slow down over the last this much of their walk. */
export const BRAKE_DISTANCE = 0.6;
/** Share of the walking speed kept at the very end of a walk, so it still ends. */
const MIN_BRAKE = 0.25;

/**
 * Distance to cover this frame with easing: speeds up from standing over
 * ACCEL_MINUTES toward stepDistance's speed (catch-up included), and slows
 * down over the last BRAKE_DISTANCE. Keeps `m.speed` across frames; a
 * paused frame keeps it, a finished walk drops it to 0.
 */
export function easedStep(m: Motion, speed: number, dtMinutes: number): number {
  if (m.path.length === 0) {
    m.speed = 0;
    return 0;
  }
  const dt = Math.max(0, dtMinutes);
  if (dt === 0) return 0;
  const cruise = stepDistance(m, speed, 1);
  const left = remaining(m);
  const brake = left < BRAKE_DISTANCE ? speed * Math.max(MIN_BRAKE, Math.sqrt(left / BRAKE_DISTANCE)) : cruise;
  m.speed = Math.min(cruise, brake, m.speed + (cruise / ACCEL_MINUTES) * dt);
  return m.speed * dt;
}

/**
 * Writes into `out` the direction from m.pos toward the point `ahead`
 * further along the path, so the body faces where the walk is going
 * rather than the segment underfoot. False when there is no path left.
 */
export function lookAhead(m: Motion, ahead: number, out: { x: number; z: number }): boolean {
  let left = ahead;
  let px = m.pos.x;
  let pz = m.pos.z;
  for (let i = 0; i < m.path.length && left > 0; i++) {
    const p = m.path[i]!;
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d >= left) {
      px += ((p.x - px) / d) * left;
      pz += ((p.z - pz) / d) * left;
      left = 0;
    } else {
      px = p.x;
      pz = p.z;
      left -= d;
    }
  }
  const dx = px - m.pos.x;
  const dz = pz - m.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  out.x = dx / len;
  out.z = dz / len;
  return true;
}

/** Fastest turn, in radians per second. */
export const MAX_TURN_SPEED = 10;
/** Rate of the eased turn toward the target heading (per second). */
const TURN_EASE = 12;

/** Heading after turning from `heading` toward `target` for `dt` seconds: eased, never faster than MAX_TURN_SPEED. */
export function turnToward(heading: number, target: number, dt: number): number {
  const t = Math.max(0, dt);
  const eased = angleDelta(heading, target) * (1 - Math.exp(-TURN_EASE * t));
  const max = MAX_TURN_SPEED * t;
  return heading + Math.min(max, Math.max(-max, eased));
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
