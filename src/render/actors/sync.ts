import type { Customer, CustomerState, GameState, StaffTask, StaffTaskKind, Vec2 } from '../../sim/types';
import type { ShopLayout } from '../../sim/upgrades';
import type { AnimName } from './animations';

/**
 * Maps sim state to what each person on screen should be doing: an
 * animation, a spot to walk to and the direction to face once there.
 * Everything here is pure; index.ts owns the three objects.
 *
 * The sim moves customers in straight 4-unit hops once per game minute and
 * teleports staff to their task spot, so the renderer walks each person
 * along a short route (around the counter, through the door) on the
 * continuous game clock `minute + alpha`, which keeps movement smooth
 * between ticks.
 */

/** Heading (rotation.y) that faces -z: toward the counter and the machines. */
export const FACE_BACK = Math.PI;
/** Heading that faces +z: from behind the counter toward the room. */
export const FACE_FRONT = 0;

/** Chairs stand this far from the table centre on the x axis (matches the shop's CHAIR_OFFSET). */
export const CHAIR_OFFSET = 0.75;
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

/**
 * Spot and facing for a staff member or the player working on `task`.
 * `home` is where they wait when idle; `slot` spreads several workers along
 * the counter and over the machines.
 */
export function workerGoal(state: GameState, task: StaffTask | null, layout: ShopLayout, home: Vec2, slot: number): Goal {
  const counter = layout.counter;
  switch (task?.kind) {
    case 'brew': {
      const machine = layout.machines[slot % Math.max(1, layout.machines.length)];
      const m = machine?.pos ?? { x: counter.pos.x, z: counter.pos.z - 1.3 };
      return { pos: { x: m.x, z: m.z + 0.45 }, face: FACE_BACK, seated: false };
    }
    case 'take_order': {
      const reach = Math.max(0, counter.width / 2 - 0.4);
      const offset = Math.max(-reach, Math.min(reach, ((slot % 3) - 1) * 0.8));
      return { pos: { x: counter.pos.x + offset, z: counter.pos.z - 0.55 }, face: FACE_FRONT, seated: false };
    }
    case 'serve': {
      const order = state.orders.find((o) => o.id === task.targetId);
      const customer = state.customers.find((c) => c.id === order?.customerId);
      if (!customer) break;
      const spot = customerGoal(state, customer, layout).pos;
      return { pos: { x: spot.x, z: spot.z + 0.65 }, face: FACE_BACK, seated: false };
    }
    case 'collect':
    case 'clean': {
      const table = state.tables.find((t) => t.id === task.targetId);
      if (!table) break;
      return { pos: { x: table.pos.x, z: table.pos.z - 0.8 }, face: FACE_FRONT, seated: false };
    }
    default:
      break;
  }
  return { pos: { x: home.x, z: home.z }, face: FACE_FRONT, seated: false };
}

export type Region = 'back' | 'front' | 'out';

/** Behind the counter, in the room, or outside the front wall. */
export function regionOf(p: Vec2, layout: ShopLayout): Region {
  if (p.z > layout.indoor.maxZ + 0.05) return 'out';
  const c = layout.counter;
  if (p.z < c.pos.z && Math.abs(p.x - c.pos.x) < c.width / 2 + 0.3) return 'back';
  return 'front';
}

/** The gap at the end of the counter nearest to x. */
function counterGate(layout: ShopLayout, x: number): Vec2 {
  const c = layout.counter;
  const side = x >= c.pos.x ? 1 : -1;
  return { x: c.pos.x + side * (c.width / 2 + 0.55), z: c.pos.z };
}

/**
 * Waypoints from `from` to `to` (ending at `to`): around the end of the
 * counter between the bar and the room, through the door between the room
 * and outside. Tables are low enough to walk past without detours.
 */
export function route(from: Vec2, to: Vec2, layout: ShopLayout): Vec2[] {
  const ra = regionOf(from, layout);
  const rb = regionOf(to, layout);
  const end = { x: to.x, z: to.z };
  if (ra === rb) return [end];
  const door = layout.door;
  const doorIn = { x: door.x, z: door.z - 0.6 };
  const doorOut = { x: door.x, z: door.z + 0.6 };
  const path: Vec2[] = [];
  if (ra === 'back') path.push(counterGate(layout, to.x));
  if (ra === 'out') path.push(doorOut, doorIn);
  if (rb === 'back') path.push(counterGate(layout, path.at(-1)?.x ?? from.x));
  if (rb === 'out') path.push(doorIn, doorOut);
  path.push(end);
  return path;
}

/** Walking state of one person on screen. */
export interface Motion {
  pos: Vec2;
  /** Remaining waypoints, the last one is the goal. */
  path: Vec2[];
  goal: Vec2 | null;
}

export function createMotion(pos: Vec2): Motion {
  return { pos: { x: pos.x, z: pos.z }, path: [], goal: null };
}

/** Points the motion at a new goal; a goal within a few centimetres of the current one is ignored. */
export function setGoal(m: Motion, goal: Vec2, layout: ShopLayout): void {
  if (m.goal && dist(m.goal, goal) < 0.05) return;
  m.goal = { x: goal.x, z: goal.z };
  m.path = route(m.pos, goal, layout);
}

/** Jumps straight to the current goal (first frame, new day, loaded save). */
export function snap(m: Motion): void {
  if (m.goal) m.pos = { x: m.goal.x, z: m.goal.z };
  m.path = [];
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
      m.pos = { x: next.x, z: next.z };
      m.path.shift();
      left -= d;
      moved += d;
    } else {
      m.pos = { x: m.pos.x + (dx / d) * left, z: m.pos.z + (dz / d) * left };
      moved += left;
      left = 0;
    }
  }
  return moved;
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
