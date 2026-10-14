import { Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ALL_ANIMS, ANIM_PERIOD, SPEC_ANIMS, poseFor, propsFor, type AnimName, type Pose } from '../../src/render/actors/animations';
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
import { APRON_COLORS, createCharacter, materialFor } from '../../src/render/actors/rig';
import {
  CUSTOMER_ANIM,
  FACE_BACK,
  advance,
  createMotion,
  customerAnim,
  customerGoal,
  exitPoint,
  regionOf,
  route,
  setGoal,
  workerAnim,
  workerGoal,
} from '../../src/render/actors/sync';
import { dispatch, step } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { Customer, CustomerState, GameState, StaffTaskKind } from '../../src/sim/types';
import { getShopLayout } from '../../src/sim/upgrades';

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
    expect(propsFor('clean').rag).toBe(true);
    expect(propsFor('walk')).toEqual({ tray: false, cup: false, rag: false });
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
    expect(goal.pos.x).toBeCloseTo(table.pos.x - 0.75);
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
});

describe('sync: staff and player', () => {
  it('maps tasks to carry_tray, serve, clean and friends', () => {
    const task = (kind: StaffTaskKind) => ({ kind, targetId: 1, remaining: 1 });
    expect(workerAnim(task('serve'), true)).toBe('carry_tray');
    expect(workerAnim(task('serve'), false)).toBe('serve');
    expect(workerAnim(task('clean'), false)).toBe('clean');
    expect(workerAnim(task('clean'), true)).toBe('walk');
    expect(workerAnim(task('brew'), false)).toBe('work');
    expect(workerAnim(task('promote'), false)).toBe('wave');
    expect(workerAnim(null, false)).toBe('idle');
  });

  it('places workers at the machine, the table or the customer', () => {
    const state = newState();
    const layout = getShopLayout(state);
    const home = { x: 1, z: -3 };
    const brew = workerGoal(state, { kind: 'brew', targetId: 1, remaining: 1 }, layout, home, 0);
    expect(brew.pos.z).toBeCloseTo(layout.machines[0]!.pos.z + 0.45);
    const table = state.tables[0]!;
    const clean = workerGoal(state, { kind: 'clean', targetId: table.id, remaining: 1 }, layout, home, 0);
    expect(clean.pos).toEqual({ x: table.pos.x, z: table.pos.z - 0.8 });
    const c = addCustomer(state, { state: 'waiting', target: { ...layout.pickup }, pos: { ...layout.pickup } });
    state.orders.push({ id: 900, customerId: c.id, itemId: 'latte', status: 'ready', remaining: 0, staffId: null });
    const serve = workerGoal(state, { kind: 'serve', targetId: 900, remaining: 1 }, layout, home, 0);
    expect(serve.pos.x).toBeCloseTo(layout.pickup.x);
    expect(workerGoal(state, null, layout, home, 0).pos).toEqual(home);
  });
});

describe('sync: routes', () => {
  it('walks around the counter and through the door', () => {
    const layout = getShopLayout(newState());
    const behind = { x: 0, z: -2.8 };
    const room = { x: 3, z: 3 };
    const outside = { x: 2.5, z: 7.8 };
    expect(regionOf(behind, layout)).toBe('back');
    expect(regionOf(room, layout)).toBe('front');
    expect(regionOf(outside, layout)).toBe('out');
    const toRoom = route(behind, room, layout);
    expect(toRoom).toHaveLength(2);
    expect(toRoom[0]!.x).toBeGreaterThan(layout.counter.width / 2);
    const toPatio = route(room, outside, layout);
    expect(toPatio.map((p) => p.x)).toEqual([layout.door.x, layout.door.x, outside.x]);
    expect(route(behind, outside, layout)).toHaveLength(4);
    expect(route(room, { x: -2, z: 1 }, layout)).toEqual([{ x: -2, z: 1 }]);
  });

  it('advances along the path and reports the walking direction', () => {
    const layout = getShopLayout(newState());
    const m = createMotion({ x: 0, z: 0 });
    setGoal(m, { x: 0, z: 3 }, layout);
    const dir = { x: 0, z: 0 };
    expect(advance(m, 1, dir)).toBeCloseTo(1);
    expect(m.pos.z).toBeCloseTo(1);
    expect(dir).toEqual({ x: 0, z: 1 });
    expect(advance(m, 10, dir)).toBeCloseTo(2);
    expect(m.path).toHaveLength(0);
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
    const c = addCustomer(state, { pos: { x: 0, z: 1 }, target: { x: 0, z: 1 } });
    actors.update(state, 0);
    const ray = new Raycaster(new Vector3(0, 10, 1), new Vector3(0, -1, 0));
    expect(actors.pick(ray)).toEqual({ type: 'take_order', customerId: c.id });
    const miss = new Raycaster(new Vector3(-3, 10, 4), new Vector3(0, -1, 0));
    expect(actors.pick(miss)).toBeNull();
    actors.dispose();
  });
});
