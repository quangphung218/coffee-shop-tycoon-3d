import { DOOR_POS, claimSpot } from './customers';
import { DIFFICULTIES } from './data/difficulty';
import { buildNavGrid, cellAt, nearestFree } from './nav';
import { TASK_MINUTES, cleanMinutes, finishTask, isClaimed, workMinute } from './orders';
import { staffSpeedMult } from './policies';
import { DIRTY_HITS_MIN, QUIET_DAY_CUSTOMERS, WAIT_LOSS_MIN, WAIT_LOSS_SHARE } from './report';
import { BASE_MAX_STAFF, growthSpeedMult, maxStaff, onStaffTick } from './staffGrowth';
import { CANDIDATE_COUNT, generateCandidates, withTraits } from './state';
import type { DayStats, GameState, Staff, StaffRole, StaffTask, StaffTaskKind, Vec2 } from './types';
import { getShopLayout, type ShopLayout } from './upgrades';

/** Base team size cap; hireStaff checks maxStaff(state), which expansions can raise. */
export const MAX_STAFF = BASE_MAX_STAFF;
/** A marketer's promote task restarts every this many minutes (only for display). */
export const PROMOTE_MINUTES = 30;

export const ROLE_NAMES: Readonly<Record<StaffRole, string>> = {
  barista: 'Pha chế',
  server: 'Phục vụ',
  cleaner: 'Dọn dẹp',
  marketer: 'Tiếp thị',
  none: 'Chưa phân vai',
};

/** Job kinds each role picks from the shared work pool, in priority order. */
export const ROLE_JOBS: Readonly<Record<StaffRole, readonly StaffTaskKind[]>> = {
  barista: ['brew', 'take_order'],
  server: ['serve', 'collect'],
  cleaner: ['clean'],
  marketer: ['promote'],
  none: [],
};

/** Roles handed out when there is no bottleneck to react to, in order. */
const DEFAULT_PLAN: readonly StaffRole[] = ['barista', 'server', 'cleaner', 'barista', 'server', 'marketer'];

/**
 * Where staff stand when they have nothing to do. Several staff of one role
 * spread out from here to the nearest open spots (see staffSpots).
 */
const STATIONS: Readonly<Record<StaffRole, Vec2>> = {
  barista: { x: -1, z: -2.75 },
  server: { x: 2.5, z: -1.8 },
  cleaner: { x: -4, z: 0 },
  marketer: { x: 1.5, z: DOOR_POS.z + 1 },
  none: { x: 0, z: -4 },
};
/** Staff work this far behind the counter centre, between it and the machines. */
const COUNTER_BACK = 0.75;
/** Staff clean a table from this far in front of or behind its centre, where no chair stands. */
const TABLE_SIDE = 0.8;

function notify(state: GameState, level: 'info' | 'success' | 'error', text: string): void {
  state.events.push({ type: 'notify', level, text });
}

/**
 * Lets go of the current task. Half-done work goes back to the shared pool:
 * an order being brewed returns to pending, a customer giving their order
 * returns to the line.
 */
function releaseTask(state: GameState, member: Staff): void {
  const task = member.task;
  member.task = null;
  member.busy = false;
  if (!task) return;
  if (task.kind === 'brew') {
    const order = state.orders.find((o) => o.id === task.targetId);
    if (order && order.status === 'brewing' && order.staffId === member.id) {
      order.status = 'pending';
      order.staffId = null;
    }
  } else if (task.kind === 'take_order') {
    const customer = state.customers.find((c) => c.id === task.targetId);
    if (customer?.state === 'ordering') customer.state = 'queueing';
  }
}

/** Hires today's candidate into a role. Refused when the candidate is gone or the team is full. */
export function hireStaff(state: GameState, candidateId: number, role: StaffRole = 'none'): Staff | null {
  const index = state.candidates.findIndex((c) => c.id === candidateId);
  if (index < 0) return null;
  const cap = maxStaff(state);
  if (state.staff.length >= cap) {
    notify(state, 'error', `Tối đa ${cap} nhân viên`);
    return null;
  }
  const [member] = state.candidates.splice(index, 1);
  if (!member) return null;
  member.role = role;
  member.task = null;
  member.busy = false;
  state.staff.push(member);
  placeStaff(state);
  notify(state, 'success', `Đã tuyển ${member.name}`);
  if (state.autoAssign) autoAssignRoles(state);
  return member;
}

/** Lets a staff member go; their half-done task goes back to the pool. No wage is paid for today. */
export function fireStaff(state: GameState, staffId: number): boolean {
  const member = state.staff.find((s) => s.id === staffId);
  if (!member) return false;
  releaseTask(state, member);
  state.staff = state.staff.filter((s) => s.id !== staffId);
  notify(state, 'info', `${member.name} đã nghỉ việc`);
  return true;
}

function setRole(state: GameState, member: Staff, role: StaffRole): void {
  if (member.role === role) return;
  releaseTask(state, member);
  member.role = role;
  placeStaff(state);
}

/** Changes a staff member's role. Refused while auto-assign is on. */
export function assignRole(state: GameState, staffId: number, role: StaffRole): boolean {
  if (state.autoAssign) return false;
  const member = state.staff.find((s) => s.id === staffId);
  if (!member || !(role in ROLE_JOBS)) return false;
  setRole(state, member, role);
  return true;
}

/** The last finished day: today while the report is up, otherwise the newest day in history. */
function lastFinishedDay(state: GameState): DayStats | null {
  if (state.phase === 'report') return state.today;
  return state.history[state.history.length - 1] ?? null;
}

/**
 * Roles to hand out, most needed first, from a day's bottleneck: customers
 * lost to waiting call for baristas and servers, dirty tables for a cleaner,
 * a quiet day for a marketer. With no data the shop gets a barista, then a
 * server, then a cleaner.
 */
export function rolePlan(stats: DayStats | null, count: number): StaffRole[] {
  const first: StaffRole[] = [];
  if (stats) {
    const lostToWait = stats.customersLost - Object.values(stats.outOfStock).reduce<number>((s, v) => s + (v ?? 0), 0);
    const slow = lostToWait >= WAIT_LOSS_MIN && lostToWait >= stats.customersArrived * WAIT_LOSS_SHARE;
    const dirty = (stats.dirtyTableHits ?? 0) >= DIRTY_HITS_MIN;
    const quiet = stats.customersArrived < QUIET_DAY_CUSTOMERS;
    if (slow) first.push('barista', 'server');
    if (dirty) first.push('cleaner');
    if (quiet && !slow) first.push('marketer');
  }
  const rest = [...DEFAULT_PLAN];
  for (const role of first) {
    const i = rest.indexOf(role);
    if (i >= 0) rest.splice(i, 1);
  }
  const plan = [...first, ...rest];
  while (plan.length < count) plan.push(DEFAULT_PLAN[plan.length % DEFAULT_PLAN.length]!);
  return plan.slice(0, count);
}

/** Hands out roles from the last day's bottleneck; the fastest staff get the most needed roles. */
export function autoAssignRoles(state: GameState): void {
  const plan = rolePlan(lastFinishedDay(state), state.staff.length);
  const bySpeed = [...state.staff].sort((a, b) => b.speed - a.speed || a.id - b.id);
  bySpeed.forEach((member, i) => setRole(state, member, plan[i] ?? 'none'));
}

/** Turns auto-assign on or off; turning it on assigns roles right away. */
export function setAutoAssign(state: GameState, enabled: boolean): void {
  state.autoAssign = enabled;
  if (enabled) autoAssignRoles(state);
}

/** Next job for this staff member from the shared pool, or null when there is nothing for their role. */
export function findJob(state: GameState, member: Staff): StaffTask | null {
  const free = (kind: StaffTaskKind, id: number) => !isClaimed(state, kind, id, member.id);
  for (const kind of ROLE_JOBS[member.role]) {
    switch (kind) {
      case 'brew': {
        const order = state.orders.find((o) => o.status === 'pending' && free('brew', o.id));
        if (order) return { kind, targetId: order.id, remaining: order.remaining };
        break;
      }
      case 'take_order': {
        const customer = state.customers.find((c) => c.state === 'queueing' && free('take_order', c.id));
        if (customer) return { kind, targetId: customer.id, remaining: TASK_MINUTES.take_order };
        break;
      }
      case 'serve': {
        const order = state.orders.find((o) => o.status === 'ready' && free('serve', o.id));
        if (order) return { kind, targetId: order.id, remaining: TASK_MINUTES.serve };
        break;
      }
      case 'collect': {
        const table = state.tables.find((t) => t.cash > 0 && free('collect', t.id));
        if (table) return { kind, targetId: table.id, remaining: TASK_MINUTES.collect };
        break;
      }
      case 'clean': {
        const table = state.tables.find((t) => t.trash > 0 && free('clean', t.id));
        if (table) return { kind, targetId: table.id, remaining: cleanMinutes(state) };
        break;
      }
      case 'promote':
        return { kind, targetId: null, remaining: PROMOTE_MINUTES };
      default:
        break;
    }
  }
  return null;
}

/** Spots a staff member would like to stand on for the task, best first. */
function wantedSpots(state: GameState, layout: ShopLayout, member: Staff): Vec2[] {
  const task = member.task;
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
      // The customer's own cell is taken, so this is the open spot next to them.
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
  return [STATIONS[member.role]];
}

/**
 * Where every staff member stands this minute, by staff id. Spots are
 * claimed in id order on the nav grid, after the spots customers are
 * heading for, so nobody stands inside furniture, on a customer or on
 * another staff member. Deterministic; the renderer can use it as well.
 */
export function staffSpots(state: GameState, layout: ShopLayout = getShopLayout(state)): Map<number, Vec2> {
  const grid = buildNavGrid(layout);
  const taken = new Set<number>();
  for (const c of state.customers) {
    if (c.state === 'leaving' || c.state === 'angry_leave') continue;
    // A seated customer's target is the chair; they stand on the free cell next to it.
    const spot = nearestFree(grid, c.target ?? c.pos);
    if (spot) taken.add(cellAt(grid, spot));
  }
  const out = new Map<number, Vec2>();
  for (const member of [...state.staff].sort((a, b) => a.id - b.id)) {
    out.set(member.id, claimSpot(grid, wantedSpots(state, layout, member), taken));
  }
  return out;
}

/** Moves every staff member to their spot from staffSpots. */
export function placeStaff(state: GameState): void {
  const spots = staffSpots(state);
  for (const member of state.staff) member.pos = spots.get(member.id) ?? member.pos;
}

/** Work done per minute: the member's speed times the wage policy, level and trait multipliers for the current task. */
export function workSpeed(state: GameState, member: Staff): number {
  return member.speed * staffSpeedMult(state) * growthSpeedMult(state, member, member.task?.kind ?? 'idle');
}

/** One game minute of work for one staff member, at their speed. */
function work(state: GameState, member: Staff): void {
  member.task ??= findJob(state, member);
  const task = member.task;
  const speed = workSpeed(state, member);
  if (task && task.kind === 'promote') {
    task.remaining -= speed;
    if (task.remaining <= 0) task.remaining = PROMOTE_MINUTES;
  } else if (task) {
    workMinute(
      state,
      member.id,
      speed,
      () => {
        member.task ??= findJob(state, member);
        // Promoting is a role of its own; it never shares a minute with other work.
        return member.task?.kind === 'promote' ? null : member.task;
      },
      () => {
        member.task = null;
        return false;
      },
      (done) => {
        // Drop the task before finishing it: finishing may send the customer away.
        member.task = null;
        finishTask(state, done);
      },
    );
  }
  member.busy = member.task !== null;
}

/** One game minute for every staff member: pick up free work for their role, progress it, step to its spot. */
export function updateStaff(state: GameState): void {
  for (const member of state.staff) {
    work(state, member);
    onStaffTick(state, member, 1);
  }
  placeStaff(state);
}

/** Clears everyone's task when the shop closes up. */
export function clearStaffTasks(state: GameState): void {
  for (const member of state.staff) {
    member.task = null;
    member.busy = false;
  }
  placeStaff(state);
}

/** Morning of a new day: fresh candidates, idle staff, and roles from yesterday's bottleneck when auto-assign is on. */
export function startStaffDay(state: GameState): void {
  state.candidates = withTraits(
    state.seed,
    generateCandidates(state, state.nextId, CANDIDATE_COUNT, DIFFICULTIES[state.difficulty].priceMult),
  );
  state.nextId += state.candidates.length;
  clearStaffTasks(state);
  if (state.autoAssign) autoAssignRoles(state);
}
