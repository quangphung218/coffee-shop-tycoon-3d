import { Raycaster, Scene, Vector3, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALL_ANIMS,
  ANIM_PERIOD,
  BLINK_PERIOD,
  EYE_MIN_OPEN,
  MAX_STRIDES_PER_SECOND,
  PERSONA_GAITS,
  SPEC_ANIMS,
  STRIDE,
  blendPose,
  blinkFor,
  bounceFor,
  gaitFor,
  poseFor,
  propsFor,
  restPose,
  strideCycles,
  stylePose,
  type AnimName,
  type Pose,
} from '../../src/render/actors/animations';
import { createActors } from '../../src/render/actors';
import {
  ANGRY_ICON,
  Label,
  LabelAssets,
  POP_SECONDS,
  commandForCustomer,
  faceFor,
  labelFor,
  patienceColor,
  PATIENCE_COLORS,
  popScale,
} from '../../src/render/actors/labels';
import { Pool } from '../../src/render/actors/pool';
import { ACCESSORIES, APRON_COLORS, createCharacter, materialFor, type Character } from '../../src/render/actors/rig';
import {
  ACCEL_MINUTES,
  BRAKE_DISTANCE,
  CATCH_UP_DISTANCE,
  CORNER_RADIUS,
  CUSTOMER_ANIM,
  FACE_BACK,
  IMPATIENT_FRAC,
  MAX_TURN_SPEED,
  SEPARATION_RADIUS,
  WALK_SPEED,
  advance,
  angleDelta,
  createMotion,
  customerAnim,
  customerGoal,
  customerMood,
  easedStep,
  exitPoint,
  headingOf,
  lookAhead,
  playerSpot,
  remaining,
  roundCorners,
  separate,
  setGoal,
  shownX,
  shownZ,
  snap,
  stepDistance,
  turnToward,
  workerAnim,
  workerGoal,
  type Motion,
} from '../../src/render/actors/sync';
import { dispatch, step } from '../../src/sim';
import { CHAIR_OFFSET, buildNavGrid, cellAt, cellCenter, findPath, isWalkable, nearestFree, type NavGrid } from '../../src/sim/nav';
import { createNewGame } from '../../src/sim/state';
import type { Customer, CustomerState, GameState, PersonaId, StaffTaskKind, Vec2 } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, nextUpgradeCost } from '../../src/sim/upgrades';

const CUSTOMER_STATES: readonly CustomerState[] = [
  'entering',
  'queueing',
  'ordering',
  'waiting',
  'drinking',
  'paying',
  'leaving',
  'angry_leave',
];

function newState(): GameState {
  const state = createNewGame('Test', 'normal', 42);
  state.phase = 'opening';
  return state;
}

function addCustomer(state: GameState, over: Partial<Customer> = {}): Customer {
  const c: Customer = {
    id: state.nextId++,
    state: 'queueing',
    pos: { x: 0, z: -1 },
    target: { x: 0, z: -1 },
    patience: 30,
    maxPatience: 40,
    order: 'latte',
    tableId: null,
    timer: 0,
    look: 2,
    ...over,
  };
  state.customers.push(c);
  return c;
}

function seat(state: GameState, c: Customer, side: -1 | 1 = -1): void {
  const table = state.tables[0]!;
  c.tableId = table.id;
  c.target = { x: table.pos.x + side * 0.5, z: table.pos.z };
  c.pos = { ...c.target };
  table.occupants.push(c.id);
}

function poseValues(p: Pose): number[] {
  return Object.values(p);
}

describe('poseFor', () => {
  it('covers the six spec animations', () => {
    for (const anim of ['idle', 'walk', 'carry_tray', 'serve', 'clean', 'angry_leave'] as const) {
      expect(SPEC_ANIMS).toContain(anim);
    }
  });

  it('returns finite joint values for every animation and odd inputs', () => {
    for (const anim of ALL_ANIMS) {
      for (const t of [0, 0.13, 1.7, 12.5, -3.2, 1e6, Number.NaN, Number.POSITIVE_INFINITY]) {
        for (const v of poseValues(poseFor(anim, t))) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('repeats every period', () => {
    for (const anim of ALL_ANIMS) {
      const period = ANIM_PERIOD[anim];
      for (const t of [0, 0.21, 0.77, 2.3]) {
        const a = poseValues(poseFor(anim, t));
        const b = poseValues(poseFor(anim, t + period));
        const c = poseValues(poseFor(anim, t + 3 * period));
        a.forEach((v, i) => {
          expect(b[i]).toBeCloseTo(v, 6);
          expect(c[i]).toBeCloseTo(v, 6);
        });
      }
    }
  });

  it('actually moves within a loop', () => {
    for (const anim of ALL_ANIMS) {
      const period = ANIM_PERIOD[anim];
      const a = poseValues(poseFor(anim, period * 0.1));
      const b = poseValues(poseFor(anim, period * 0.6));
      expect(a.some((v, i) => Math.abs(v - b[i]!) > 1e-3)).toBe(true);
    }
  });

  it('swings the legs in opposition when walking and stomping', () => {
    for (const anim of ['walk', 'carry_tray', 'angry_leave'] as const) {
      const p = poseFor(anim, ANIM_PERIOD[anim] / 4);
      expect(p.legL).toBeCloseTo(-p.legR, 6);
      expect(Math.abs(p.legL)).toBeGreaterThan(0.3);
    }
  });

  it('holds the tray forward, bends over to clean and sits to drink', () => {
    expect(poseFor('carry_tray', 0.3).armLX).toBeLessThan(-1);
    expect(poseFor('serve', 0.3).armRX).toBeLessThan(-1);
    expect(poseFor('clean', 0.3).lean).toBeGreaterThan(0.3);
    expect(poseFor('drink', 0.3).legL).toBeLessThan(-1);
    expect(poseFor('drink', 0.3).hipsY).toBeLessThan(0);
    expect(poseFor('angry_leave', 0.1).lean).toBeGreaterThan(poseFor('walk', 0.1).lean);
  });

  it('shows the tray, cup and rag props with their animations', () => {
    expect(propsFor('carry_tray').tray).toBe(true);
    expect(propsFor('serve').tray).toBe(true);
    expect(propsFor('drink').cup).toBe(true);
    expect(propsFor('handoff').cup).toBe(true);
    expect(propsFor('clean').rag).toBe(true);
    expect(propsFor('walk')).toEqual({ tray: false, cup: false, rag: false });
  });

  it('works the hands through several moves while brewing', () => {
    const period = ANIM_PERIOD.brew;
    // Grind, tamp, pull and pour: the right hand reaches a different spot each beat.
    const beats = [0.125, 0.375, 0.625, 0.875].map((f) => poseFor('brew', f * period));
    for (const p of beats) {
      expect(p.armRX).toBeLessThan(-0.8);
      expect(Math.abs(p.armRX)).toBeLessThan(3.2);
    }
    const distinct = new Set(beats.map((p) => Math.round(p.armRX * 100) / 100));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    // The left hand comes forward to steady the portafilter and pour.
    expect(poseFor('brew', 0.25 * period).armLX).toBeLessThan(-1);
  });

  it('offers the cup with both hands when handing off', () => {
    const p = poseFor('handoff', ANIM_PERIOD.handoff / 2);
    expect(p.armLX).toBeLessThan(-1);
    expect(p.armRX).toBeLessThan(-1);
    expect(p.lean).toBeGreaterThan(0);
  });

  it('taps a foot and checks a watch when impatient', () => {
    // A foot lifts somewhere in the loop.
    const taps = [0.08, 0.25, 0.42].map((f) => poseFor('impatient', f * ANIM_PERIOD.impatient).legR);
    expect(Math.max(...taps)).toBeGreaterThan(0.1);
    // Early in the loop the left arm comes up to read the wrist.
    expect(poseFor('impatient', 0.1 * ANIM_PERIOD.impatient).armLX).toBeLessThan(-0.8);
  });

  it('crosses the arms when impatient, a silhouette unlike the calm queue', () => {
    for (const f of [0.5, 0.7, 0.9]) {
      const p = poseFor('impatient', f * ANIM_PERIOD.impatient);
      // Both arms forward and drawn in across the body.
      expect(p.armLX).toBeLessThan(-0.6);
      expect(p.armRX).toBeLessThan(-0.6);
      expect(p.armLZ).toBeLessThan(0);
      expect(p.armRZ).toBeLessThan(0);
      const q = poseFor('queue', f * ANIM_PERIOD.queue);
      const armGap = Math.abs(p.armLX - q.armLX) + Math.abs(p.armRX - q.armRX) + Math.abs(p.armLZ - q.armLZ) + Math.abs(p.armRZ - q.armRZ);
      expect(armGap).toBeGreaterThan(1.5);
    }
    // The tapping foot lifts clearly higher than the queue's weight shift.
    const tap = Math.max(...[0.05, 0.08, 0.12].map((f) => poseFor('impatient', f * ANIM_PERIOD.impatient).legR));
    const shift = Math.max(...[0.1, 0.25, 0.4, 0.6, 0.75].map((f) => poseFor('queue', f * ANIM_PERIOD.queue).legR));
    expect(tap).toBeGreaterThan(shift * 4);
  });

  it('blinks on a bounded, per-phase, periodic clock', () => {
    for (const phase of [0, 1.3, 3.7]) {
      let closed = false;
      for (let t = 0; t < BLINK_PERIOD; t += 0.01) {
        const open = blinkFor(t, phase);
        expect(open).toBeGreaterThanOrEqual(EYE_MIN_OPEN - 1e-9);
        expect(open).toBeLessThanOrEqual(1 + 1e-9);
        if (open < 0.9) closed = true;
        // Repeats every period.
        expect(blinkFor(t + BLINK_PERIOD, phase)).toBeCloseTo(open, 9);
      }
      expect(closed).toBe(true);
    }
    // Different phases close at different moments: not all shut at once.
    expect(blinkFor(0.05, 0)).not.toBeCloseTo(blinkFor(0.05, 2), 3);
    expect(blinkFor(Number.NaN, 0)).toBe(1);
  });
});

describe('sync: customers', () => {
  it('maps all 8 customer states to an animation', () => {
    expect(Object.keys(CUSTOMER_ANIM).sort()).toEqual([...CUSTOMER_STATES].sort());
    for (const s of CUSTOMER_STATES) {
      for (const moving of [false, true]) {
        expect(ALL_ANIMS).toContain(customerAnim(s, moving, false));
      }
    }
  });

  it('picks the expected animation per state', () => {
    const still: Record<CustomerState, AnimName> = {
      entering: 'queue',
      queueing: 'queue',
      ordering: 'idle',
      waiting: 'queue',
      drinking: 'drink',
      paying: 'sit',
      leaving: 'idle',
      angry_leave: 'angry_leave',
    };
    for (const s of CUSTOMER_STATES) {
      expect(customerAnim(s, false, false)).toBe(still[s]);
      expect(customerAnim(s, true, false)).toBe(s === 'angry_leave' ? 'angry_leave' : 'walk');
    }
    expect(customerAnim('waiting', false, true)).toBe('sit');
  });

  it('sends seated customers to their chair facing the table', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const c = addCustomer(state, { state: 'drinking' });
    seat(state, c, -1);
    const table = state.tables[0]!;
    const goal = customerGoal(state, c, layout);
    expect(goal.seated).toBe(true);
    expect(goal.pos.x).toBeCloseTo(table.pos.x - CHAIR_OFFSET);
    expect(goal.face).toBeCloseTo(Math.PI / 2);
  });

  it('sends leaving customers out of the door and queueing ones to the line facing the counter', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const leaving = addCustomer(state, { state: 'angry_leave' });
    expect(customerGoal(state, leaving, layout).pos).toEqual(exitPoint(layout));
    const queueing = addCustomer(state, { target: { x: 0, z: 0.6 } });
    expect(customerGoal(state, queueing, layout)).toEqual({ pos: { x: 0, z: 0.6 }, face: FACE_BACK, seated: false });
  });

  it('fidgets while waiting with little patience left', () => {
    expect(customerAnim('queueing', false, false, 0.2)).toBe('impatient');
    expect(customerAnim('waiting', false, false, 0.2)).toBe('impatient');
    expect(customerAnim('queueing', false, false, 0.9)).toBe('queue');
    // Walking or seated overrides the fidget; ordering is not a restless state.
    expect(customerAnim('queueing', true, false, 0.1)).toBe('walk');
    expect(customerAnim('waiting', false, true, 0.1)).toBe('sit');
    expect(customerAnim('ordering', false, false, 0.1)).toBe('idle');
    // Defaults to patient when no fraction is given.
    expect(customerAnim('queueing', false, false)).toBe('queue');
  });
});

describe('sync: mood', () => {
  it('reads the expression from state and patience', () => {
    expect(customerMood('angry_leave', 1)).toBe('angry');
    expect(customerMood('drinking', 0.1)).toBe('happy');
    expect(customerMood('leaving', 0.1)).toBe('happy');
    expect(customerMood('queueing', 0.2)).toBe('impatient');
    expect(customerMood('waiting', IMPATIENT_FRAC - 0.01)).toBe('impatient');
    expect(customerMood('entering', 0.1)).toBe('impatient');
    expect(customerMood('queueing', 0.9)).toBe('neutral');
    expect(customerMood('waiting', IMPATIENT_FRAC + 0.01)).toBe('neutral');
    expect(customerMood('ordering', 0.1)).toBe('neutral');
  });
});

describe('sync: staff and player', () => {
  it('maps tasks to carry_tray, serve, clean and friends', () => {
    const task = (kind: StaffTaskKind) => ({ kind, targetId: 1, remaining: 1 });
    expect(workerAnim(task('serve'), true)).toBe('carry_tray');
    expect(workerAnim(task('serve'), false)).toBe('handoff');
    expect(workerAnim(task('clean'), false)).toBe('clean');
    expect(workerAnim(task('clean'), true)).toBe('walk');
    expect(workerAnim(task('brew'), false)).toBe('brew');
    expect(workerAnim(task('collect'), false)).toBe('work');
    expect(workerAnim(task('promote'), false)).toBe('wave');
    expect(workerAnim(null, false)).toBe('idle');
  });

  it('stands workers on the spot the sim holds and faces their work', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const spot = { x: 1, z: -2.75 };
    const brew = workerGoal(state, { kind: 'brew', targetId: 1, remaining: 1 }, layout, spot);
    expect(brew).toEqual({ pos: spot, face: FACE_BACK, seated: false });
    const table = state.tables[0]!;
    const clean = workerGoal(state, { kind: 'clean', targetId: table.id, remaining: 1 }, layout, { x: table.pos.x, z: table.pos.z - 0.75 });
    expect(clean.pos).toEqual({ x: table.pos.x, z: table.pos.z - 0.75 });
    // Facing +z, toward the table in front of them.
    expect(clean.face).toBeCloseTo(0);
    const c = addCustomer(state, { state: 'waiting', target: { ...layout.pickup }, pos: { ...layout.pickup } });
    state.orders.push({ id: 900, customerId: c.id, itemId: 'latte', status: 'ready', remaining: 0, staffId: null });
    const serve = workerGoal(state, { kind: 'serve', targetId: 900, remaining: 1 }, layout, { x: layout.pickup.x - 1, z: layout.pickup.z });
    expect(serve.face).toBeCloseTo(Math.PI / 2);
    expect(workerGoal(state, null, layout, spot).pos).toEqual(spot);
  });

  it('follows the staff spots from the sim over a day, never inside furniture', () => {
    const state = createNewGame('Test', 'normal', 11);
    const roles = ['barista', 'server', 'cleaner', 'barista'] as const;
    state.candidates.slice(0, 4).forEach((c, i) => dispatch(state, { type: 'hire_staff', candidateId: c.id, role: roles[i]! }));
    dispatch(state, { type: 'start_day' });
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    for (let f = 0; f < 600 && state.phase !== 'report'; f++) {
      step(state, 1);
      for (const s of state.staff) {
        const goal = workerGoal(state, s.task, layout, s.pos);
        expect(goal.pos).toEqual(s.pos);
        expect(isWalkable(grid, goal.pos)).toBe(true);
      }
    }
  });

  it('gives the player a free spot of their own, apart from staff and customers', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const table = state.tables[0]!;
    state.staff.push({ id: 500, name: 'A', role: 'cleaner', wagePerDay: 1, speed: 1, busy: false, task: null, pos: { x: table.pos.x, z: table.pos.z - 0.75 }, look: 0 });
    const spots = [
      playerSpot(state, null, layout),
      playerSpot(state, { kind: 'brew', targetId: 1, remaining: 1 }, layout),
      playerSpot(state, { kind: 'take_order', targetId: 1, remaining: 1 }, layout),
      playerSpot(state, { kind: 'clean', targetId: table.id, remaining: 1 }, layout),
    ];
    for (const p of spots) {
      expect(isWalkable(grid, p)).toBe(true);
      expect(Math.hypot(p.x - table.pos.x, p.z - (table.pos.z - 0.75))).toBeGreaterThan(0.3);
    }
    // Same state, same spot.
    expect(playerSpot(state, null, layout)).toEqual(spots[0]);
  });
});

/** Points every 5 cm along the segments of `path` starting at `from`; the last `skip` segments are left out. */
function samples(from: Vec2, path: readonly Vec2[], skip = 0): Vec2[] {
  const out: Vec2[] = [];
  let prev = from;
  for (let k = 0; k < path.length - skip; k++) {
    const p = path[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.05));
    for (let s = 0; s <= n; s++) out.push({ x: prev.x + ((p.x - prev.x) * s) / n, z: prev.z + ((p.z - prev.z) * s) / n });
    prev = p;
  }
  return out;
}

/** A shop with every table, the patio, the expansion and plants bought. */
function fullShop(): GameState {
  const state = newState();
  state.money = 1e10;
  for (const id of ['tables', 'outdoor_seating', 'expand_area', 'plants', 'big_counter', 'fast_machine'] as const) {
    while (nextUpgradeCost(state, id) !== null) expect(buyUpgrade(state, id).ok).toBe(true);
  }
  return state;
}

describe('sync: paths', () => {
  it('walks from the door to every chair of every table without crossing a blocked cell', () => {
    for (const state of [newState(), fullShop()]) {
      const layout = getShopLayout(state);
      const grid = buildNavGrid(layout);
      const door = cellCenter(grid, grid.doorOutside);
      expect(state.tables.length).toBeGreaterThan(0);
      for (const table of state.tables) {
        for (const side of [-1, 1]) {
          const chair = { x: table.pos.x + side * CHAIR_OFFSET, z: table.pos.z };
          const m = createMotion(door);
          setGoal(m, chair, layout, true);
          expect(m.path.at(-1)).toEqual(chair);
          // All but the last step onto the chair stays on free floor.
          for (const p of samples(door, m.path, 1)) expect(isWalkable(grid, p)).toBe(true);
          const before = m.path.at(-2)!;
          expect(Math.hypot(before.x - chair.x, before.z - chair.z)).toBeLessThan(0.7);
          // And back out of the door afterwards.
          m.pos = { ...chair };
          m.path = [];
          setGoal(m, exitPoint(layout), layout);
          const steps = samples(chair, m.path);
          for (const p of steps.slice(steps.findIndex((q) => isWalkable(grid, q)))) expect(isWalkable(grid, p)).toBe(true);
        }
      }
    }
  });

  it('walks from behind the counter to the room around the counter', () => {
    const layout = getShopLayout(newState());
    const grid = buildNavGrid(layout);
    const behind = { x: layout.counter.pos.x, z: layout.counter.pos.z - 0.75 };
    const m = createMotion(behind);
    setGoal(m, { x: 3, z: 2 }, layout);
    expect(m.path.length).toBeGreaterThan(1);
    for (const p of samples(behind, m.path)) expect(isWalkable(grid, p)).toBe(true);
  });

  it('only runs A* when the goal moves', () => {
    const layout = getShopLayout(newState());
    const m = createMotion({ x: 0, z: 0 });
    setGoal(m, { x: 3, z: 2 }, layout);
    const path = m.path;
    setGoal(m, { x: 3.01, z: 2 }, layout);
    expect(m.path).toBe(path);
  });

  it('ends a walk to a blocked spot next to it, and snaps there', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const table = state.tables[0]!;
    const m = createMotion({ x: 0, z: 0 });
    setGoal(m, table.pos, layout);
    snap(m);
    expect(isWalkable(grid, m.pos)).toBe(true);
    expect(Math.hypot(m.pos.x - table.pos.x, m.pos.z - table.pos.z)).toBeLessThan(1.2);
    // A seat goal snaps right onto the chair.
    const chair = { x: table.pos.x - CHAIR_OFFSET, z: table.pos.z };
    setGoal(m, chair, layout, true);
    snap(m);
    expect(m.pos).toEqual(chair);
    expect(m.path).toHaveLength(0);
  });

  it('hurries along a long path and walks normally on a short one', () => {
    const layout = getShopLayout(newState());
    const far = createMotion({ x: -4, z: -0.5 });
    setGoal(far, exitPoint(layout), layout);
    expect(remaining(far)).toBeGreaterThan(CATCH_UP_DISTANCE);
    expect(stepDistance(far, WALK_SPEED, 1)).toBeGreaterThan(WALK_SPEED);
    const near = createMotion({ x: 3, z: 2 });
    setGoal(near, { x: 3, z: 2.5 }, layout);
    expect(stepDistance(near, WALK_SPEED, 1)).toBeCloseTo(WALK_SPEED);
    expect(stepDistance(near, WALK_SPEED, -1)).toBe(0);
  });

  it('advances along the path and reports the walking direction', () => {
    const layout = getShopLayout(newState());
    // Along the free aisle between the rows of tables.
    const m = createMotion({ x: -3, z: 2 });
    setGoal(m, { x: -1, z: 2 }, layout);
    expect(m.path).toEqual([{ x: -1, z: 2 }]);
    const dir = { x: 0, z: 0 };
    expect(advance(m, 1, dir)).toBeCloseTo(1);
    expect(m.pos.x).toBeCloseTo(-2);
    expect(dir).toEqual({ x: 1, z: 0 });
    expect(advance(m, 10, dir)).toBeCloseTo(1);
    expect(m.path).toHaveLength(0);
  });
});

/** An all-free nav grid of cols × rows cells with cell (0, 0) at the origin. */
function openGrid(cols: number, rows: number): NavGrid {
  return {
    key: 0,
    cols,
    rows,
    col0: 0,
    row0: 0,
    blocked: new Uint8Array(cols * rows),
    component: new Int32Array(cols * rows).fill(1),
    mainComponent: 1,
    doorInside: 0,
    doorOutside: 0,
  };
}

/** Points every 1 cm along from → path. */
function fine(from: Vec2, path: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  let prev = from;
  for (const p of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.01));
    for (let s = 0; s <= n; s++) out.push({ x: prev.x + ((p.x - prev.x) * s) / n, z: prev.z + ((p.z - prev.z) * s) / n });
    prev = p;
  }
  return out;
}

describe('sync: smooth walking', () => {
  it('rounds a corner with a small arc, no wider than half the shorter side', () => {
    const grid = openGrid(16, 16);
    const start = { x: 0.5, z: 0.5 };
    const corner = { x: 2, z: 0.5 };
    const path = [corner, { x: 2, z: 3 }];
    const out = roundCorners(grid, start, path);
    expect(out.length).toBeGreaterThan(path.length);
    expect(out.at(-1)).toEqual(path[1]);
    const arc = out.slice(0, -1);
    expect(arc[0]!.x).toBeCloseTo(corner.x - CORNER_RADIUS);
    for (const p of arc) expect(Math.hypot(p.x - corner.x, p.z - corner.z)).toBeLessThanOrEqual(CORNER_RADIUS + 1e-9);
    // The middle of the arc cuts inside the corner.
    const mid = arc[Math.floor(arc.length / 2)]!;
    expect(Math.hypot(mid.x - corner.x, mid.z - corner.z)).toBeGreaterThan(0.05);
    // Short sides: the arc spans at most half of the shorter one.
    const near = { x: 0.8, z: 0.5 };
    for (const p of roundCorners(grid, start, [near, { x: 0.8, z: 2 }]).slice(0, -1)) {
      expect(Math.hypot(p.x - near.x, p.z - near.z)).toBeLessThanOrEqual(0.15 + 1e-9);
    }
    // Straight on: nothing to round.
    expect(roundCorners(grid, start, [{ x: 1, z: 0.5 }, { x: 2, z: 0.5 }])).toEqual([{ x: 1, z: 0.5 }, { x: 2, z: 0.5 }]);
  });

  it('keeps a corner sharp when its arc would cross a blocked cell', () => {
    const grid = openGrid(16, 16);
    const start = { x: 0.5, z: 0.5 };
    const path = [{ x: 2, z: 0.5 }, { x: 2, z: 3 }];
    const arc = roundCorners(grid, start, path);
    (grid.blocked as Uint8Array)[cellAt(grid, arc[Math.floor(arc.length / 2)]!)] = 1;
    expect(roundCorners(grid, start, path)).toEqual(path);
  });

  it('never rounds a walk into furniture, in the starting and the full shop', () => {
    let rounded = 0;
    for (const state of [newState(), fullShop()]) {
      const layout = getShopLayout(state);
      const grid = buildNavGrid(layout);
      const door = cellCenter(grid, grid.doorOutside);
      for (const table of state.tables) {
        for (const side of [-1, 1]) {
          const chair = { x: table.pos.x + side * CHAIR_OFFSET, z: table.pos.z };
          const m = createMotion(door);
          setGoal(m, chair, layout, true);
          expect(m.path.at(-1)).toEqual(chair);
          // Every centimetre but the last step onto the chair is free floor.
          for (const p of fine(door, m.path.slice(0, -1))) expect(isWalkable(grid, p)).toBe(true);
          const raw = findPath(grid, door, nearestFree(grid, chair)!)!;
          if (m.path.length > raw.length + 1) rounded++;
        }
      }
    }
    expect(rounded).toBeGreaterThan(0);
  });

  it('speeds up from standing and slows down before the end, monotonically', () => {
    const m = createMotion({ x: 0, z: 0 });
    m.path = [{ x: 5, z: 0 }];
    const dt = 0.02;
    const full = WALK_SPEED * dt;
    const steps: number[] = [];
    const lefts: number[] = [];
    for (let f = 0; f < 2000 && m.path.length > 0; f++) {
      lefts.push(remaining(m));
      const d = easedStep(m, WALK_SPEED, dt);
      steps.push(d);
      advance(m, d);
    }
    expect(m.path).toHaveLength(0);
    expect(m.pos.x).toBeCloseTo(5);
    const peak = steps.indexOf(Math.max(...steps));
    expect(steps[peak]).toBeCloseTo(full);
    for (let i = 0; i < peak; i++) expect(steps[i + 1]!).toBeGreaterThanOrEqual(steps[i]! - 1e-12);
    for (let i = peak; i < steps.length - 1; i++) expect(steps[i + 1]!).toBeLessThanOrEqual(steps[i]! + 1e-12);
    // Up to full speed over ACCEL_MINUTES, then slower only within BRAKE_DISTANCE of the end.
    expect(steps[0]!).toBeLessThan(full * 0.2);
    const reach = steps.findIndex((s) => s >= full - 1e-9);
    expect((reach + 1) * dt).toBeCloseTo(ACCEL_MINUTES, 1);
    steps.forEach((s, i) => {
      if (i > reach && s < full - 1e-9) expect(lefts[i]!).toBeLessThan(BRAKE_DISTANCE);
    });
    expect(steps.at(-1)!).toBeLessThan(full * 0.5);
    // Arrived: standing again.
    expect(easedStep(m, WALK_SPEED, dt)).toBe(0);
    expect(m.speed).toBe(0);
  });

  it('holds speed while paused, still catches up when far behind, and stops on a snap', () => {
    const m = createMotion({ x: 0, z: 0 });
    m.path = [{ x: 5, z: 0 }];
    easedStep(m, WALK_SPEED, 0.1);
    const v = m.speed;
    expect(v).toBeGreaterThan(0);
    expect(easedStep(m, WALK_SPEED, 0)).toBe(0);
    expect(m.speed).toBe(v);
    const far = createMotion({ x: 0, z: 0 });
    far.path = [{ x: 40, z: 0 }];
    for (let f = 0; f < 100; f++) easedStep(far, WALK_SPEED, 0.05);
    expect(far.speed).toBeCloseTo(stepDistance(far, WALK_SPEED, 1));
    expect(far.speed).toBeGreaterThan(WALK_SPEED * 2);
    snap(far);
    expect(far.speed).toBe(0);
  });

  it('looks along the path ahead', () => {
    const m = createMotion({ x: 0, z: 0 });
    const dir = { x: 0, z: 0 };
    expect(lookAhead(m, 0.3, dir)).toBe(false);
    m.path = [{ x: 1, z: 0 }, { x: 1, z: 1 }];
    expect(lookAhead(m, 0.3, dir)).toBe(true);
    expect(dir.x).toBeCloseTo(1);
    m.pos = { x: 0.9, z: 0 };
    lookAhead(m, 0.3, dir);
    // Already turning toward the next leg before reaching the corner.
    expect(dir.z).toBeGreaterThan(0.5);
    expect(dir.x).toBeGreaterThan(0);
  });

  it('turns no faster than MAX_TURN_SPEED and settles on the target', () => {
    let h = 0;
    const dt = 1 / 60;
    for (const target of [Math.PI, -Math.PI / 2, 3, 0.2]) {
      for (let f = 0; f < 120; f++) {
        const next = turnToward(h, target, dt);
        expect(Math.abs(next - h)).toBeLessThanOrEqual(MAX_TURN_SPEED * dt + 1e-9);
        h = next;
      }
      expect(Math.abs(angleDelta(h, target))).toBeLessThan(1e-3);
    }
    expect(turnToward(1, 2, 0)).toBe(1);
  });

  it('walks a rounded corner with a smooth, bounded turn', () => {
    const grid = openGrid(24, 24);
    const m = createMotion({ x: 0.5, z: 0.5 });
    m.path = roundCorners(grid, m.pos, [{ x: 3, z: 0.5 }, { x: 3, z: 4 }]);
    const dir = { x: 0, z: 0 };
    const dt = 1 / 60;
    let h = headingOf(1, 0);
    let biggest = 0;
    while (m.path.length > 0) {
      advance(m, easedStep(m, WALK_SPEED, dt * 2), dir);
      if (m.path.length > 0 && lookAhead(m, 0.3, dir)) {
        const next = turnToward(h, headingOf(dir.x, dir.z), dt);
        biggest = Math.max(biggest, Math.abs(next - h));
        h = next;
      }
    }
    expect(biggest).toBeLessThanOrEqual(MAX_TURN_SPEED * dt + 1e-9);
    expect(Math.abs(angleDelta(h, headingOf(0, 1)))).toBeLessThan(0.05);
  });
});

describe('animations: stride and blend', () => {
  it('steps in proportion to the distance walked, up to the stride cap', () => {
    expect(strideCycles(0, 1)).toBe(0);
    expect(strideCycles(0.3, 1)).toBeCloseTo(0.3 / STRIDE);
    expect(strideCycles(0.6, 1)).toBeCloseTo(2 * strideCycles(0.3, 1));
    expect(strideCycles(0.027, 1 / 60)).toBeCloseTo(0.03, 6);
    expect(strideCycles(0.09, 1 / 60)).toBeCloseTo(MAX_STRIDES_PER_SECOND / 60, 6);
    expect(strideCycles(100, 0.1)).toBeCloseTo(0.1 * MAX_STRIDES_PER_SECOND);
    // An eased walk: slow steps while speeding up, stride per frame matching distance per frame.
    const m = createMotion({ x: 0, z: 0 });
    m.path = [{ x: 2, z: 0 }];
    const dt = 1 / 60;
    let walked = 0;
    let cycles = 0;
    while (m.path.length > 0) {
      const moved = advance(m, easedStep(m, WALK_SPEED, dt * 0.25), undefined);
      walked += moved;
      cycles += strideCycles(moved, dt);
    }
    expect(cycles).toBeCloseTo(walked / STRIDE);
  });

  it('blends between two poses and writes into the given pose', () => {
    const a = poseFor('idle', 0.4);
    const b = poseFor('walk', 0.2);
    const out = restPose();
    expect(poseFor('walk', 0.2, out)).toBe(out);
    expect(out).toEqual(b);
    const keys = Object.keys(a) as (keyof Pose)[];
    const none = blendPose(a, b, 0, restPose());
    const all = blendPose(a, b, 1, restPose());
    const half = blendPose(a, b, 0.5, restPose());
    for (const k of keys) {
      expect(none[k]).toBeCloseTo(a[k], 9);
      expect(all[k]).toBeCloseTo(b[k], 9);
      expect(half[k]).toBeCloseTo((a[k] + b[k]) / 2, 9);
    }
  });
});

describe('animations: persona style', () => {
  const PERSONAS: readonly PersonaId[] = ['office', 'student', 'regular', 'connoisseur', 'family'];
  /** Personas told apart by how they move; the regular is told apart by the beanie. */
  const MOVERS: readonly PersonaId[] = ['office', 'student', 'connoisseur', 'family'];
  const styled = (persona: PersonaId | undefined, anim: AnimName, t: number, calm = false): Pose =>
    stylePose(persona, anim, t, calm, poseFor(anim, t));
  const gap = (a: Pose, b: Pose): number => {
    const bv = poseValues(b);
    return poseValues(a).reduce((sum, v, i) => sum + Math.abs(v - bv[i]!), 0);
  };

  it('gives each moving persona its own walk and its own wait in the queue', () => {
    for (const anim of ['walk', 'queue', 'idle'] as const) {
      const t = ANIM_PERIOD[anim] * 0.3;
      const plain = poseFor(anim, t);
      for (const p of MOVERS) expect(gap(styled(p, anim, t), plain)).toBeGreaterThan(0.1);
      for (let i = 0; i < MOVERS.length; i++) {
        for (let j = i + 1; j < MOVERS.length; j++) {
          expect(gap(styled(MOVERS[i], anim, t), styled(MOVERS[j], anim, t))).toBeGreaterThan(0.1);
        }
      }
    }
    // Office workers keep the head down, connoisseurs the chin up.
    expect(styled('office', 'queue', 1).headX).toBeGreaterThan(poseFor('queue', 1).headX + 0.2);
    expect(styled('connoisseur', 'walk', 0.2).headX).toBeLessThan(poseFor('walk', 0.2).headX - 0.1);
    // Connoisseurs walk with the hands clasped behind the back.
    const stroll = styled('connoisseur', 'walk', 0.2);
    expect(stroll.armLX).toBeGreaterThan(0.3);
    expect(stroll.armRX).toBeGreaterThan(0.3);
  });

  it('keeps the walk symmetric, finite and periodic for every persona', () => {
    for (const p of PERSONAS) {
      for (const anim of ['walk', 'queue', 'idle'] as const) {
        const period = ANIM_PERIOD[anim];
        for (const t of [0, 0.21, 1.3, -2.2, Number.NaN]) {
          const a = poseValues(styled(p, anim, t));
          for (const v of a) expect(Number.isFinite(v)).toBe(true);
          const b = poseValues(styled(p, anim, t + period));
          if (Number.isFinite(t)) a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6));
        }
      }
      const step = styled(p, 'walk', ANIM_PERIOD.walk / 4);
      expect(step.legL).toBeCloseTo(-step.legR, 6);
      expect(Math.abs(step.legL)).toBeGreaterThan(0.25);
    }
  });

  it('leaves staff, the player and the other animations alone', () => {
    for (const anim of ALL_ANIMS) {
      expect(styled(undefined, anim, 0.7)).toEqual(poseFor(anim, 0.7));
    }
    for (const anim of ['brew', 'carry_tray', 'angry_leave', 'impatient', 'drink', 'sit'] as const) {
      for (const p of PERSONAS) expect(styled(p, anim, 0.7)).toEqual(poseFor(anim, 0.7));
    }
    expect(gaitFor(undefined).stride).toBe(STRIDE);
    expect(gaitFor('regular')).toEqual(gaitFor(undefined));
  });

  it('keeps the posture but drops the extra movement with reduced motion', () => {
    const period = ANIM_PERIOD.queue;
    const offsets = (calm: boolean): number[][] =>
      [0.1, 0.35, 0.6, 0.85].map((f) => {
        const s = poseValues(styled('student', 'queue', f * period, calm));
        return poseValues(poseFor('queue', f * period)).map((v, i) => s[i]! - v);
      });
    // Calm: the student's habit is a fixed offset from the plain wait (hands in pockets), no nodding.
    const calm = offsets(true);
    for (const row of calm) row.forEach((v, i) => expect(v).toBeCloseTo(calm[0]![i]!, 9));
    expect(calm[0]!.some((v) => Math.abs(v) > 0.05)).toBe(true);
    // Full motion: the nod changes from moment to moment.
    const full = offsets(false);
    expect(full.some((row) => row.some((v, i) => Math.abs(v - full[0]![i]!) > 0.02))).toBe(true);
  });

  it('sets the step rate and hop per persona, within the stride cap', () => {
    // Over the same ground office workers take more, quicker steps than connoisseurs.
    const steps = (p: PersonaId): number => strideCycles(0.5, 1, PERSONA_GAITS[p].stride);
    expect(steps('office')).toBeGreaterThan(steps('connoisseur') * 1.3);
    for (const p of PERSONAS) expect(strideCycles(100, 0.1, PERSONA_GAITS[p].stride)).toBeCloseTo(0.1 * MAX_STRIDES_PER_SECOND);
    // Students bounce higher mid-step than office workers; calm still shrinks it.
    const mid = ANIM_PERIOD.walk / 4;
    const lift = (p: PersonaId, calm = false): number => bounceFor('walk', mid, 0, calm, undefined, PERSONA_GAITS[p].hop).lift;
    expect(lift('student')).toBeGreaterThan(lift('office') * 2);
    expect(lift('student', true)).toBeLessThan(lift('student') / 2);
    expect(bounceFor('walk', mid, 0, false).lift).toBeCloseTo(lift('regular'), 9);
  });
});

describe('sync: separation', () => {
  it('eases walkers apart without pushing anyone into furniture', () => {
    const state = fullShop();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    // Pairs squeezed together right beside every table, chair and the counter.
    const pairs: Motion[] = [];
    for (const table of state.tables) {
      for (const [x, z] of [
        [table.pos.x, table.pos.z - 0.75],
        [table.pos.x, table.pos.z + 0.75],
        [table.pos.x + 1.25, table.pos.z],
      ] as const) {
        const a = nearestFree(grid, { x, z })!;
        for (const p of [a, { x: a.x + 0.05, z: a.z + 0.02 }]) {
          const m = createMotion(p);
          m.path = [{ x: p.x, z: p.z + 5 }];
          pairs.push(m);
        }
      }
    }
    const shown = (m: Motion) => ({ x: shownX(m), z: shownZ(m) });
    const start = pairs.map((m) => ({ ...m.pos }));
    for (const m of pairs) expect(isWalkable(grid, shown(m))).toBe(true);
    let parted = 0;
    for (let k = 0; k < 200; k++) {
      separate(pairs, pairs.length, grid, 0.05);
      for (const m of pairs) expect(isWalkable(grid, shown(m))).toBe(true);
    }
    for (let i = 0; i < pairs.length; i += 2) {
      const a = shown(pairs[i]!);
      const b = shown(pairs[i + 1]!);
      if (Math.hypot(a.x - b.x, a.z - b.z) > 0.06) parted++;
    }
    expect(parted).toBeGreaterThan(0);
    // Only the drawing moves: everyone is still on their path.
    pairs.forEach((m, i) => expect(m.pos).toEqual(start[i]));
    // Once they stop walking, they settle back onto their spot.
    for (const m of pairs) m.path = [];
    for (let k = 0; k < 20; k++) separate(pairs, pairs.length, grid, 0.05);
    for (const m of pairs) expect(m.offset).toEqual({ x: 0, z: 0 });
  });

  it('parts walkers on the same point, leaves people standing still and stops while paused', () => {
    const layout = getShopLayout(newState());
    const grid = buildNavGrid(layout);
    const a = createMotion({ x: 3, z: 2 });
    const b = createMotion({ x: 3, z: 2 });
    const still = createMotion({ x: 3, z: 2.25 });
    a.path = [{ x: 3, z: 0 }];
    b.path = [{ x: 3, z: 0 }];
    const all = [a, b, still];
    separate(all, 3, grid, 0);
    expect(a.offset).toEqual({ x: 0, z: 0 });
    expect(b.offset).toEqual({ x: 0, z: 0 });
    for (let k = 0; k < 20; k++) separate(all, 3, grid, 0.05);
    expect(Math.hypot(shownX(a) - shownX(b), shownZ(a) - shownZ(b))).toBeGreaterThan(SEPARATION_RADIUS * 0.9);
    expect(still.offset).toEqual({ x: 0, z: 0 });
    for (const m of all) expect(isWalkable(grid, { x: shownX(m), z: shownZ(m) })).toBe(true);
    // Only the first `count` motions are read.
    const c = createMotion({ x: -3, z: 2 });
    const d = createMotion({ x: -3, z: 2 });
    c.path = [{ x: -3, z: 2.5 }];
    d.path = [{ x: -3, z: 2.5 }];
    separate([c, d], 1, grid, 0.1);
    expect(c.offset).toEqual({ x: 0, z: 0 });
  });

  it('keeps everyone out of furniture over a busy day', () => {
    const state = createNewGame('Test', 'normal', 5);
    const roles = ['barista', 'server', 'cleaner'] as const;
    state.candidates.slice(0, 3).forEach((c, i) => dispatch(state, { type: 'hire_staff', candidateId: c.id, role: roles[i]! }));
    state.rating = 5;
    dispatch(state, { type: 'start_day' });
    const actors = createActors(new Scene());
    const grid = buildNavGrid(getShopLayout(state));
    let checked = 0;
    for (let f = 0; f < 840 * 4 && state.phase !== 'report'; f++) {
      step(state, 0.25);
      actors.update(state, state.tickAccumulator);
      for (const s of state.staff) {
        const info = actors.inspect(`s${s.id}`)!;
        expect(isWalkable(grid, info.pos)).toBe(true);
        checked++;
      }
      for (const c of state.customers) {
        // Seated customers sit on a chair, which is furniture, and step off it to leave.
        const standing = c.state === 'queueing' || c.state === 'ordering' || (c.state === 'waiting' && c.tableId === null);
        const info = actors.inspect(`c${c.id}`);
        if (!info || !standing) continue;
        expect(isWalkable(grid, info.pos)).toBe(true);
        checked++;
      }
      state.events.length = 0;
    }
    expect(checked).toBeGreaterThan(1000);
    actors.dispose();
  });
});

describe('labels', () => {
  it('shows the item icon, face and patience while waiting, the angry face when leaving, nothing when drinking', () => {
    const state = newState();
    const c = addCustomer(state, { patience: 10, maxPatience: 40 });
    expect(labelFor(state, c)).toEqual({ icon: 'i-latte', patience: 0.25, ready: false, face: 'i-face-worried' });
    c.state = 'ordering';
    expect(labelFor(state, c)).toEqual({ icon: 'i-latte', patience: null, ready: false, face: null });
    c.state = 'angry_leave';
    expect(ANGRY_ICON).toBe('i-face-angry');
    expect(labelFor(state, c).icon).toBe(ANGRY_ICON);
    c.state = 'drinking';
    expect(labelFor(state, c)).toEqual({ icon: null, patience: null, ready: false, face: null });
    expect(patienceColor(0.9)).toBe(PATIENCE_COLORS.high);
    expect(patienceColor(0.4)).toBe(PATIENCE_COLORS.mid);
    expect(patienceColor(0.1)).toBe(PATIENCE_COLORS.low);
  });

  it('picks the face from the patience thresholds', () => {
    expect(faceFor(1)).toBe('i-face-happy');
    expect(faceFor(0.6)).toBe('i-face-happy');
    expect(faceFor(0.59)).toBe('i-face-ok');
    expect(faceFor(0.3)).toBe('i-face-ok');
    expect(faceFor(0.29)).toBe('i-face-worried');
    expect(faceFor(0)).toBe('i-face-worried');
    const state = newState();
    const c = addCustomer(state, { state: 'waiting', patience: 30, maxPatience: 40 });
    expect(labelFor(state, c).face).toBe('i-face-happy');
    c.patience = 16;
    expect(labelFor(state, c).face).toBe('i-face-ok');
    c.patience = 4;
    expect(labelFor(state, c).face).toBe('i-face-worried');
  });

  it('pops the bubble with an overshoot, unless motion is reduced', () => {
    expect(popScale(0, false)).toBeCloseTo(0);
    const peak = Math.max(...[0.2, 0.25, 0.3].map((t) => popScale(t, false)));
    expect(peak).toBeGreaterThan(1);
    expect(popScale(POP_SECONDS, false)).toBe(1);
    expect(popScale(10, false)).toBe(1);
    for (const t of [0, 0.1, 0.25]) expect(popScale(t, true)).toBe(1);
  });

  it('shows the face beside the bar and never in the angry tag', () => {
    const state = newState();
    const assets = new LabelAssets();
    const label = new Label(assets);
    const c = addCustomer(state, { state: 'waiting', patience: 35, maxPatience: 40 });
    label.set(labelFor(state, c), 1);
    expect(label.iconShown).toBe('i-latte');
    expect(label.faceShown).toBe('i-face-happy');
    c.state = 'angry_leave';
    label.set(labelFor(state, c), 2);
    expect(label.iconShown).toBe('i-face-angry');
    expect(label.faceShown).toBeNull();
    assets.dispose();
  });

  it('turns clicks into take_order and deliver', () => {
    const state = newState();
    const c = addCustomer(state);
    expect(commandForCustomer(state, c.id)).toEqual({ type: 'take_order', customerId: c.id });
    state.playerTasks.push({ kind: 'take_order', targetId: c.id, remaining: 2 });
    expect(commandForCustomer(state, c.id)).toBeNull();
    c.state = 'waiting';
    state.orders.push({ id: 77, customerId: c.id, itemId: 'latte', status: 'brewing', remaining: 2, staffId: null });
    expect(commandForCustomer(state, c.id)).toBeNull();
    state.orders[0]!.status = 'ready';
    expect(commandForCustomer(state, c.id)).toEqual({ type: 'deliver', orderId: 77 });
    expect(labelFor(state, c).ready).toBe(true);
    expect(commandForCustomer(state, 12345)).toBeNull();
  });
});

describe('rig and pool', () => {
  it('builds characters from shared geometry and per-colour materials', () => {
    const a = createCharacter({ role: 'customer', look: 1 });
    const b = createCharacter({ role: 'barista', look: 1 });
    const meshes = (ch: typeof a) => {
      const out: { geometry: unknown }[] = [];
      ch.root.traverse((o) => {
        if ('geometry' in o) out.push(o as unknown as { geometry: unknown });
      });
      return out;
    };
    const geoA = new Set(meshes(a).map((m) => m.geometry));
    expect(meshes(b).every((m) => geoA.has(m.geometry))).toBe(true);
    expect(materialFor(APRON_COLORS.barista)).toBe(materialFor(APRON_COLORS.barista));
    expect(a.head.parent).toBe(a.torso);
    expect(a.armL.parent).toBe(a.torso);
    expect(a.legL.parent).toBe(a.hips);
  });

  it('stays within the mesh budget and swaps faces in place', () => {
    const countMeshes = (ch: Character): number => {
      let n = 0;
      ch.root.traverse((o) => {
        if ('geometry' in o) n += 1;
      });
      return n;
    };
    // Pre-P20 the rig drew 21 meshes; a 30% rise is the budget (merged faces compensate).
    const BUDGET = Math.ceil(21 * 1.3);
    const plain = createCharacter({ role: 'customer', look: 0 });
    const dressed = createCharacter({ role: 'customer', look: 2, persona: 'student' });
    expect(countMeshes(dressed)).toBeLessThanOrEqual(BUDGET);
    // The accessory slot always exists, so a persona adds no meshes.
    expect(countMeshes(dressed)).toBe(countMeshes(plain));
    // Every mood swaps geometry in place, never adds a mesh.
    const before = countMeshes(dressed);
    for (const mood of ['happy', 'impatient', 'angry', 'neutral'] as const) {
      dressed.setMood(mood);
      expect(countMeshes(dressed)).toBe(before);
    }
    dressed.setMood('angry');
    expect(dressed.isAngry).toBe(true);
    dressed.setMood('happy');
    expect(dressed.isAngry).toBe(false);
    // Blink and persona accessories build for every persona without error.
    dressed.setBlink(EYE_MIN_OPEN);
    dressed.setBlink(1);
    for (const persona of ['office', 'student', 'regular', 'connoisseur', 'family'] as const) {
      expect(countMeshes(createCharacter({ role: 'customer', look: 1, persona }))).toBe(before);
    }
  });

  it('gives every persona its own accessory from the one shared slot', () => {
    type Slot = { accessory: Mesh; hair: Mesh };
    const slot = (ch: Character): Slot => ch as unknown as Slot;
    const seen = new Set<string>();
    for (const persona of ['office', 'student', 'regular', 'connoisseur', 'family'] as const) {
      const ch = createCharacter({ role: 'customer', look: 1, persona });
      const acc = slot(ch).accessory;
      expect(acc.visible).toBe(true);
      // No shadow pass for the accessory, so a persona adds no shadow draw call at high quality.
      expect(acc.castShadow).toBe(false);
      expect(acc.material).toBe(materialFor(ACCESSORIES[persona].color));
      seen.add(`${acc.geometry.uuid}:${ACCESSORIES[persona].color}`);
    }
    expect(seen.size).toBe(5);
    // The beanie rides on the head and covers the hair; a pooled body handed to
    // another persona puts the slot back on the torso and shows the hair again.
    const ch = createCharacter({ role: 'customer', look: 1, persona: 'regular' });
    expect(slot(ch).accessory.parent).toBe(ch.head);
    expect(slot(ch).hair.visible).toBe(false);
    ch.setLook({ role: 'customer', look: 1, persona: 'student' });
    expect(slot(ch).accessory.parent).toBe(ch.torso);
    expect(slot(ch).hair.visible).toBe(true);
    // Staff never wear one.
    ch.setLook({ role: 'barista', look: 1, persona: 'family' });
    expect(slot(ch).accessory.visible).toBe(false);
    expect(slot(ch).hair.visible).toBe(true);
  });

  it('reuses released objects instead of creating new ones', () => {
    let made = 0;
    const pool = new Pool(() => ({ n: made++ }));
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    pool.release(b);
    pool.release(b);
    expect(pool.freeCount).toBe(1);
    expect(pool.created).toBe(2);
  });
});

describe('createActors', () => {
  it('reuses characters as customers come and go', () => {
    const state = newState();
    const actors = createActors(new Scene());
    for (let i = 0; i < 20; i++) {
      state.customers = [];
      addCustomer(state);
      addCustomer(state, { target: { x: 0, z: -0.2 } });
      actors.update(state, 0);
    }
    // Two customers plus the player at a time; nobody new after the first frame.
    expect(actors.stats().created).toBe(3);
    expect(actors.stats().live).toBe(3);
    actors.dispose();
  });

  it('animates customers by state, walks them, and labels them', () => {
    const state = newState();
    const actors = createActors(new Scene());
    // The first frame snaps everyone into place; arrivals after it walk in.
    actors.update(state, 0);
    const c = addCustomer(state, { state: 'entering', pos: { x: 0, z: 6 }, target: { x: 0, z: -1 } });
    actors.update(state, 0);
    state.minute += 1;
    actors.update(state, 0.2);
    const walking = actors.inspect(`c${c.id}`)!;
    expect(walking.anim).toBe('walk');
    expect(walking.pos.z).toBeLessThan(6);
    expect(walking.label).toBeNull();
    for (let i = 0; i < 5; i++) {
      state.minute += 1;
      actors.update(state, 0);
    }
    c.state = 'queueing';
    actors.update(state, 0);
    const queued = actors.inspect(`c${c.id}`)!;
    expect(queued.anim).toBe('queue');
    expect(queued.pos).toEqual({ x: 0, z: -1 });
    expect(queued.label).toBe('i-latte');
    c.state = 'angry_leave';
    state.minute += 1;
    actors.update(state, 0.5);
    expect(actors.inspect(`c${c.id}`)!.anim).toBe('angry_leave');
    expect(actors.inspect(`c${c.id}`)!.label).toBe(ANGRY_ICON);
    actors.dispose();
  });

  it('eases a customer into a walk instead of starting at full speed', () => {
    const state = newState();
    const actors = createActors(new Scene());
    actors.update(state, 0);
    // Along the free aisle between the rows of tables.
    const c = addCustomer(state, { state: 'entering', pos: { x: -3, z: 2 }, target: { x: -1, z: 2 } });
    actors.update(state, 0);
    const xs = [actors.inspect(`c${c.id}`)!.pos.x];
    for (let f = 0; f < 6; f++) {
      state.minute += 0.05;
      actors.update(state, 0);
      xs.push(actors.inspect(`c${c.id}`)!.pos.x);
    }
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    expect(steps[0]!).toBeLessThan(WALK_SPEED * 0.05 * 0.2);
    actors.dispose();
  });

  it('lets a removed customer finish walking out, then frees the character', () => {
    const state = newState();
    const actors = createActors(new Scene());
    const c = addCustomer(state, { state: 'queueing', pos: { x: 0, z: 2 }, target: { x: 0, z: 2 } });
    actors.update(state, 0);
    c.state = 'leaving';
    c.target = { x: 0, z: 6 };
    state.minute += 0.2;
    actors.update(state, 0);
    state.customers = [];
    state.minute += 0.2;
    actors.update(state, 0);
    expect(actors.inspect(`c${c.id}`)?.anim).toBe('walk');
    for (let i = 0; i < 10; i++) {
      state.minute += 1;
      actors.update(state, 0);
    }
    expect(actors.inspect(`c${c.id}`)).toBeNull();
    expect(actors.stats().free).toBe(1);
    actors.dispose();
  });

  it('follows a whole simulated day with staff without errors or leaks', () => {
    const state = createNewGame('Test', 'normal', 7);
    const roles = ['barista', 'server', 'cleaner'] as const;
    state.candidates.slice(0, 3).forEach((c, i) => dispatch(state, { type: 'hire_staff', candidateId: c.id, role: roles[i]! }));
    state.rating = 4.5;
    dispatch(state, { type: 'start_day' });
    const actors = createActors(new Scene());
    const seen = new Set<AnimName>();
    for (let f = 0; f < 840 * 4 && state.phase !== 'report'; f++) {
      step(state, 0.25);
      actors.update(state, state.tickAccumulator);
      for (const c of state.customers) {
        const info = actors.inspect(`c${c.id}`);
        if (info) seen.add(info.anim);
      }
      for (const s of state.staff) seen.add(actors.inspect(`s${s.id}`)!.anim);
      state.events.length = 0;
    }
    expect(state.phase).toBe('report');
    for (const anim of ['walk', 'queue', 'drink', 'carry_tray', 'clean'] as const) expect(seen).toContain(anim);
    // Characters are reused: far fewer made than customers who came in.
    expect(actors.stats().created).toBeLessThan(state.today.customersArrived);
    actors.dispose();
  });

  it('picks a queueing customer as take_order', () => {
    const state = newState();
    const actors = createActors(new Scene());
    // On free floor in the main aisle between the two blocks of tables.
    const c = addCustomer(state, { pos: { x: 0, z: 2 }, target: { x: 0, z: 2 } });
    actors.update(state, 0);
    const ray = new Raycaster(new Vector3(0, 10, 2), new Vector3(0, -1, 0));
    expect(actors.pick(ray)).toEqual({ type: 'take_order', customerId: c.id });
    const miss = new Raycaster(new Vector3(-3, 10, 4), new Vector3(0, -1, 0));
    expect(actors.pick(miss)).toBeNull();
    actors.dispose();
  });
});
