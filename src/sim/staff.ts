import { DOOR_POS, PICKUP_POS } from './customers';
import { DIFFICULTIES } from './data/difficulty';
import { TASK_MINUTES, advanceTask, finishTask, isClaimed } from './orders';
import { DIRTY_HITS_MIN, QUIET_DAY_CUSTOMERS, WAIT_LOSS_MIN, WAIT_LOSS_SHARE } from './report';
import { CANDIDATE_COUNT, generateCandidates } from './state';
import type { DayStats, GameState, Staff, StaffRole, StaffTask, StaffTaskKind, Vec2 } from './types';

export const MAX_STAFF = 6;
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

/** Where staff stand when they have nothing to do. */
const STATIONS: Readonly<Record<StaffRole, Vec2>> = {
  barista: { x: -1, z: -2.7 },
  server: { x: 2.5, z: -1.8 },
  cleaner: { x: -4, z: 0 },
  marketer: { x: 1.5, z: DOOR_POS.z + 1 },
  none: { x: 0, z: -3.8 },
};
const COUNTER_FRONT: Vec2 = { x: 0, z: -1.6 };
const MACHINE_FRONT: Vec2 = { x: -1, z: -2.9 };

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
  if (state.staff.length >= MAX_STAFF) {
    notify(state, 'error', `Tối đa ${MAX_STAFF} nhân viên`);
    return null;
  }
  const [member] = state.candidates.splice(index, 1);
  if (!member) return null;
  member.role = role;
  member.task = null;
  member.busy = false;
  member.pos = { ...STATIONS[role] };
  state.staff.push(member);
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
  member.pos = { ...STATIONS[role] };
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
        if (table) return { kind, targetId: table.id, remaining: TASK_MINUTES.clean };
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

/** Where a staff member stands while doing the task. */
function taskPos(state: GameState, member: Staff, task: StaffTask | null): Vec2 {
  if (!task) return { ...STATIONS[member.role] };
  switch (task.kind) {
    case 'brew':
      return { ...MACHINE_FRONT };
    case 'take_order':
      return { ...COUNTER_FRONT };
    case 'serve': {
      const order = state.orders.find((o) => o.id === task.targetId);
      const customer = state.customers.find((c) => c.id === order?.customerId);
      return customer ? { ...customer.pos } : { ...PICKUP_POS };
    }
    case 'collect':
    case 'clean': {
      const table = state.tables.find((t) => t.id === task.targetId);
      return table ? { x: table.pos.x, z: table.pos.z - 0.8 } : { ...STATIONS[member.role] };
    }
    default:
      return { ...STATIONS[member.role] };
  }
}

/** One game minute of work for one staff member, at their speed. */
function work(state: GameState, member: Staff): void {
  member.task ??= findJob(state, member);
  const task = member.task;
  if (task && task.kind === 'promote') {
    task.remaining -= member.speed;
    if (task.remaining <= 0) task.remaining = PROMOTE_MINUTES;
  } else if (task) {
    if (!advanceTask(state, task, member.id, member.speed)) {
      member.task = null;
    } else if (task.remaining <= 0) {
      // Drop the task before finishing it: finishing may send the customer away.
      member.task = null;
      finishTask(state, task);
    }
  }
  member.busy = member.task !== null;
  member.pos = taskPos(state, member, member.task);
}

/** One game minute for every staff member: pick up free work for their role and progress it. */
export function updateStaff(state: GameState): void {
  for (const member of state.staff) work(state, member);
}

/** Clears everyone's task when the shop closes up. */
export function clearStaffTasks(state: GameState): void {
  for (const member of state.staff) {
    member.task = null;
    member.busy = false;
    member.pos = { ...STATIONS[member.role] };
  }
}

/** Morning of a new day: fresh candidates, idle staff, and roles from yesterday's bottleneck when auto-assign is on. */
export function startStaffDay(state: GameState): void {
  state.candidates = generateCandidates(state, state.nextId, CANDIDATE_COUNT, DIFFICULTIES[state.difficulty].priceMult);
  state.nextId += state.candidates.length;
  clearStaffTasks(state);
  if (state.autoAssign) autoAssignRoles(state);
}
