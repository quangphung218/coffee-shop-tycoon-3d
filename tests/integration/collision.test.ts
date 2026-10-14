import { describe, expect, it } from 'vitest';
import {
  ANGRY_SPEED,
  SEPARATION_RATE,
  STAFF_SPEED,
  WALK_SPEED,
  advance,
  createMotion,
  customerGoal,
  playerSpot,
  separate,
  setGoal,
  shownX,
  shownZ,
  stepDistance,
  workerGoal,
  type Motion,
} from '../../src/render/actors/sync';
import { WALKER_RADIUS, STREET_SPAN, WALK_LINES, MAX_DENSITY, travelX, walkerSlots } from '../../src/render/street/layout';
import { DOOR_POS, PICKUP_SPOTS, floorSpots, queueSlot } from '../../src/sim/customers';
import { dispatch, step } from '../../src/sim/index';
import {
  CHAIR_OFFSET,
  buildNavGrid,
  cellAt,
  clearNavGridCache,
  clearPathCache,
  findPath,
  isWalkable,
  layoutFootprints,
  navSearchCount,
  nearestFree,
  shapeDistance,
  validateLayout,
  type Footprint,
  type NavGrid,
} from '../../src/sim/nav';
import { staffSpots } from '../../src/sim/staff';
import { createNewGame } from '../../src/sim/state';
import type { Customer, Difficulty, GameState, UpgradeId, Vec2 } from '../../src/sim/types';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { buyUpgrade, getShopLayout, nextUpgradeCost, type ShopLayout } from '../../src/sim/upgrades';
import { autoPlay, playDay } from './helpers';

/**
 * Nobody walks or stands inside furniture, walls or each other: a week of
 * play per difficulty in the starting shop and in a fully upgraded one,
 * checked after every sim tick and on every render frame, then one test per
 * kind of collision the nav grid was built to stop.
 */

const DAYS = 7;
const SEED = 20261014;
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
/** Render frames per game minute in the motion replay. */
const FRAMES_PER_MINUTE = 4;
const FRAME_DT = 1 / FRAMES_PER_MINUTE;
/** Two people standing still are never closer than this. */
const MIN_STANDING_GAP = 0.4;
/** Spacing of the points checked along a path. */
const SAMPLE_STEP = 0.05;
const MAX_REPORTED = 8;

type Config = 'base' | 'maxed' | 'expanded' | 'patio' | 'long_bar';
const CONFIGS: readonly Config[] = ['base', 'maxed'];
/** Shops part way through the upgrades, soaked on hard for fewer days. */
const PARTIAL: Readonly<Record<Exclude<Config, 'base' | 'maxed'>, Partial<Record<UpgradeId, number>>>> = {
  // The side room without the patio.
  expanded: { tables: 3, expand_area: 2 },
  // The patio without the side room.
  patio: { tables: 3, outdoor_seating: 2 },
  // The longest counter with every machine.
  long_bar: { tables: 2, big_counter: 2, fast_machine: 3, better_machine: 3 },
};
const PARTIAL_DAYS = 3;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function fmt(p: Vec2): string {
  return `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
}

/** Points every SAMPLE_STEP along from → path, both ends included. */
function samplePath(from: Vec2, path: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [{ ...from }];
  let prev = from;
  for (const p of path) {
    const n = Math.max(1, Math.ceil(dist(prev, p) / SAMPLE_STEP));
    for (let k = 1; k <= n; k++) out.push({ x: prev.x + ((p.x - prev.x) * k) / n, z: prev.z + ((p.z - prev.z) * k) / n });
    prev = p;
  }
  return out;
}

/** True when the straight line from a to b crosses a footprint of this kind. */
function lineCrosses(a: Vec2, b: Vec2, fp: Footprint): boolean {
  return samplePath(a, [b]).some((p) => shapeDistance(fp.shape, p.x, p.z) === 0);
}

/** Every upgrade bought to its last level. */
function buyEverything(state: GameState): void {
  const money = state.money;
  state.money = 1e12;
  for (const def of UPGRADES) {
    while (nextUpgradeCost(state, def.id) !== null) expect(buyUpgrade(state, def.id).ok, def.id).toBe(true);
  }
  state.money = money;
  state.events = [];
}

/** These upgrade levels bought, in the order given. */
function buyLevels(state: GameState, levels: Partial<Record<UpgradeId, number>>): void {
  const money = state.money;
  state.money = 1e12;
  for (const [id, n] of Object.entries(levels) as [UpgradeId, number][]) {
    for (let i = 0; i < n; i++) expect(buyUpgrade(state, id).ok, id).toBe(true);
  }
  state.money = money;
  state.events = [];
}

function maxedState(): GameState {
  const state = createNewGame('Quán Va Chạm', 'normal', SEED);
  buyEverything(state);
  return state;
}

function isLeaving(c: Customer): boolean {
  return c.state === 'leaving' || c.state === 'angry_leave';
}

/** Where a customer ends up standing: the free cell their walk ends on. */
function settledSpot(grid: NavGrid, c: Customer): Vec2 | null {
  return c.target ? nearestFree(grid, c.target) : null;
}

/** Length of the last step from the free floor onto a chair. */
function seatStep(grid: NavGrid, chair: Vec2): number {
  const stand = nearestFree(grid, chair);
  return stand ? dist(stand, chair) : 0;
}

const footprintCache = new WeakMap<ShopLayout, Footprint[]>();

/** Id of a footprint other than the chair at `chair` that p stands in, or null. */
function footprintAt(layout: ShopLayout, p: Vec2, chair: Vec2): string | null {
  let fps = footprintCache.get(layout);
  if (!fps) {
    fps = layoutFootprints(layout);
    footprintCache.set(layout, fps);
  }
  for (const fp of fps) {
    if (fp.kind === 'chair' && shapeDistance(fp.shape, chair.x, chair.z) === 0) continue;
    if (shapeDistance(fp.shape, p.x, p.z) === 0) return fp.id;
  }
  return null;
}

/** Render-side replay of everyone's walk, as src/render/actors/index.ts drives it. */
interface Replay {
  motions: Map<string, Motion>;
  /** Chair a motion is stepping on or off, where its drawn spot may be furniture. */
  chairs: Map<string, Vec2>;
  list: Motion[];
  frames: number;
}

function createReplay(): Replay {
  return { motions: new Map(), chairs: new Map(), list: [], frames: 0 };
}

interface Soak {
  /** Fingerprint of the state at the end of every day. */
  days: string[];
  violations: string[];
  ticks: number;
  standingPairs: number;
  frames: number;
  /** Most seatless customers waiting for a takeaway at once. */
  maxTakeaway: number;
}

/**
 * Checks one sim tick: everyone on walkable floor, people standing still
 * apart, queue and takeaway spots apart and each held by one customer.
 */
function checkTick(state: GameState, layout: ShopLayout, grid: NavGrid, soak: Soak): void {
  const bad = (msg: string) => {
    if (soak.violations.length < MAX_REPORTED) soak.violations.push(`day ${state.day} ${state.minute}: ${msg}`);
  };
  const standing: { who: string; pos: Vec2 }[] = [];
  for (const c of state.customers) {
    if (!isWalkable(grid, c.pos)) bad(`customer ${c.id} (${c.state}) in a blocked cell at ${fmt(c.pos)}`);
    if (isLeaving(c)) continue;
    const spot = settledSpot(grid, c);
    if (!spot || dist(spot, c.pos) > 1e-9) continue;
    // A seated customer is drawn on the chair, not on the free cell next to it.
    const goal = customerGoal(state, c, layout);
    const where = goal.seated ? `on chair of table ${c.tableId}` : `at ${fmt(c.pos)}`;
    standing.push({ who: `customer ${c.id} (${c.state}, ${where})`, pos: goal.seated ? goal.pos : c.pos });
  }
  for (const s of state.staff) {
    if (!isWalkable(grid, s.pos)) bad(`staff ${s.id} (${s.role}) in a blocked cell at ${fmt(s.pos)}`);
    standing.push({ who: `staff ${s.id} (${s.role}, ${s.task?.kind ?? 'idle'} at ${fmt(s.pos)})`, pos: s.pos });
  }
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      soak.standingPairs++;
      const d = dist(standing[i]!.pos, standing[j]!.pos);
      if (d < MIN_STANDING_GAP) bad(`${standing[i]!.who} and ${standing[j]!.who} stand ${d.toFixed(2)} apart`);
    }
  }

  const spots = floorSpots(layout, grid);
  const all = [...spots.queue, ...spots.takeaway];
  for (let i = 0; i < all.length; i++) {
    if (!isWalkable(grid, all[i]!)) bad(`floor spot ${fmt(all[i]!)} is blocked`);
    for (let j = i + 1; j < all.length; j++) {
      if (dist(all[i]!, all[j]!) < MIN_STANDING_GAP) bad(`floor spots ${fmt(all[i]!)} and ${fmt(all[j]!)} overlap`);
    }
  }
  const held = new Map<number, number>();
  let takeaway = 0;
  for (const c of state.customers) {
    const t = c.target;
    if (!t) continue;
    if (c.state === 'entering' || c.state === 'queueing' || c.state === 'ordering') {
      if (!spots.queue.some((q) => q.x === t.x && q.z === t.z)) bad(`customer ${c.id} in line off the queue at ${fmt(t)}`);
    } else if (c.state === 'waiting' && c.tableId === null) {
      takeaway++;
      const k = spots.takeaway.findIndex((p) => p.x === t.x && p.z === t.z);
      if (k < 0) bad(`takeaway customer ${c.id} off the takeaway spots at ${fmt(t)}`);
      else held.set(k, (held.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of held) if (n > 1) bad(`${n} takeaway customers share takeaway spot ${k}`);
  soak.maxTakeaway = Math.max(soak.maxTakeaway, takeaway);
}

/** Walks every motion toward its goal for one game minute in fixed frames; every drawn point must be walkable. */
function replayMinute(state: GameState, layout: ShopLayout, grid: NavGrid, replay: Replay, soak: Soak): void {
  const bad = (msg: string) => {
    if (soak.violations.length < MAX_REPORTED) soak.violations.push(`day ${state.day} ${state.minute} (render): ${msg}`);
  };
  const seen = new Set<string>();
  const goals: { key: string; goal: Vec2; seated: boolean; speed: number }[] = [];
  for (const c of state.customers) {
    const key = `c${c.id}`;
    const goal = customerGoal(state, c, layout);
    goals.push({ key, goal: goal.pos, seated: goal.seated, speed: c.state === 'angry_leave' ? ANGRY_SPEED : WALK_SPEED });
    if (goal.seated) replay.chairs.set(key, goal.pos);
    if (!replay.motions.has(key)) replay.motions.set(key, createMotion(c.pos));
  }
  for (const s of state.staff) {
    const key = `s${s.id}`;
    goals.push({ key, goal: workerGoal(state, s.task, layout, s.pos).pos, seated: false, speed: STAFF_SPEED });
    if (!replay.motions.has(key)) replay.motions.set(key, createMotion(s.pos));
  }
  const head = state.playerTasks[0] ?? null;
  const playerAt = playerSpot(state, head, layout);
  goals.push({ key: 'player', goal: playerAt, seated: false, speed: STAFF_SPEED * 1.1 });
  if (!replay.motions.has('player')) replay.motions.set('player', createMotion(playerAt));
  if (!isWalkable(grid, playerAt)) bad(`player spot ${fmt(playerAt)} is blocked`);

  replay.list.length = 0;
  for (const g of goals) {
    seen.add(g.key);
    const m = replay.motions.get(g.key)!;
    setGoal(m, g.goal, layout, g.seated);
    replay.list.push(m);
  }
  for (const key of [...replay.motions.keys()]) {
    if (!seen.has(key)) {
      replay.motions.delete(key);
      replay.chairs.delete(key);
    }
  }

  for (let f = 0; f < FRAMES_PER_MINUTE; f++) {
    goals.forEach((g, i) => {
      const m = replay.list[i]!;
      advance(m, stepDistance(m, g.speed, FRAME_DT));
    });
    separate(replay.list, replay.list.length, grid, SEPARATION_RATE * FRAME_DT);
    soak.frames++;
    goals.forEach((g, i) => {
      const m = replay.list[i]!;
      const chair = replay.chairs.get(g.key);
      if (chair && dist(m.pos, chair) <= seatStep(grid, chair) + 1e-6) {
        // Stepping on or off the chair: off the grid, but through no other furniture.
        if (dist(m.pos, chair) < 1e-9) return;
        const hit = footprintAt(layout, m.pos, chair);
        if (hit) bad(`${g.key} steps through ${hit} to its chair at ${fmt(m.pos)}`);
        return;
      }
      if (chair && !g.seated) replay.chairs.delete(g.key);
      if (!isWalkable(grid, m.pos)) bad(`${g.key} walks through a blocked cell at ${fmt(m.pos)}`);
      const shown = { x: shownX(m), z: shownZ(m) };
      if (!isWalkable(grid, shown)) bad(`${g.key} is drawn in a blocked cell at ${fmt(shown)}`);
    });
  }
}

function fingerprint(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

/**
 * Days of play: restock every morning, hire staff (two baristas in the
 * starting shop, an auto-assigned team in the others: six in the maxed shop,
 * four part way) and serve alone besides them. `render` adds the motion replay.
 *
 * `stalled` piles takeaway customers up instead: no staff, every table left
 * dirty, the player only takes orders and never brews, and nobody waiting
 * gives up before closing time, so the waiting crowd grows to all the shop
 * admits.
 */
function soakWeek(difficulty: Difficulty, config: Config, render: boolean, days = DAYS, stalled = false): Soak {
  const state = createNewGame('Quán Va Chạm', difficulty, SEED);
  if (config === 'maxed') buyEverything(state);
  else if (config !== 'base') buyLevels(state, PARTIAL[config]);
  const soak: Soak = { days: [], violations: [], ticks: 0, standingPairs: 0, frames: 0, maxTakeaway: 0 };
  for (let day = 1; day <= days; day++) {
    dispatch(state, { type: 'apply_restock' });
    const team = stalled ? 0 : config === 'maxed' ? 6 : config === 'base' ? 2 : 4;
    for (const cand of [...state.candidates]) {
      if (state.staff.length >= team) break;
      dispatch(state, { type: 'hire_staff', candidateId: cand.id, role: config === 'base' ? 'barista' : 'none' });
    }
    if (config !== 'base' && team > 0 && day === 1) dispatch(state, { type: 'set_auto_assign', enabled: true });
    const layout = getShopLayout(state);
    expect(validateLayout(layout)).toEqual([]);
    const grid = buildNavGrid(layout);
    const replay = createReplay();
    playDay(state, {
      play: !stalled,
      onMinute: (s) => {
        if (stalled) {
          for (const t of s.tables) t.trash = Math.max(t.trash, 1);
          if (s.phase !== 'closing') for (const c of s.customers) if (c.state === 'waiting') c.patience = c.maxPatience;
          const next = s.customers.find((c) => c.state === 'queueing');
          if (s.playerTasks.length === 0 && next) dispatch(s, { type: 'take_order', customerId: next.id });
        }
        soak.ticks++;
        checkTick(s, layout, grid, soak);
        if (render) replayMinute(s, layout, grid, replay, soak);
      },
    });
    soak.days.push(fingerprint(state));
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
  return soak;
}

const soaks = new Map<string, Soak>();

// Each case soaks a whole week; on a busy machine that runs past vitest's 5 s default.
describe(`collision soak: ${DAYS} days per difficulty and shop`, { timeout: 30_000 }, () => {
  for (const difficulty of DIFFICULTIES) {
    for (const config of CONFIGS) {
      it(`${difficulty}, ${config} shop: nobody in a blocked cell or on top of someone`, () => {
        const soak = soakWeek(difficulty, config, true);
        soaks.set(`${difficulty}|${config}`, soak);
        expect(soak.violations).toEqual([]);
        expect(soak.ticks).toBeGreaterThan(DAYS * 700);
        expect(soak.standingPairs).toBeGreaterThan(1000);
        expect(soak.frames).toBe(soak.ticks * FRAMES_PER_MINUTE);
      });
    }
  }

  for (const config of Object.keys(PARTIAL) as (keyof typeof PARTIAL)[]) {
    it(`hard, ${config} shop for ${PARTIAL_DAYS} days: nobody in a blocked cell or on top of someone`, () => {
      const soak = soakWeek('hard', config, true, PARTIAL_DAYS);
      expect(soak.violations).toEqual([]);
      expect(soak.ticks).toBeGreaterThan(PARTIAL_DAYS * 700);
      expect(soak.standingPairs).toBeGreaterThan(1000);
    });
  }

  it(`hard, maxed shop with drinks stalled: more takeaway customers than the mat's ${PICKUP_SPOTS} spots, none sharing`, () => {
    const soak = soakWeek('hard', 'maxed', true, 2, true);
    expect(soak.violations).toEqual([]);
    expect(soak.maxTakeaway).toBeGreaterThan(PICKUP_SPOTS + 4);
  });

  it('replays the same week to the same state, with cold nav caches', () => {
    const first = soaks.get('hard|maxed') ?? soakWeek('hard', 'maxed', true);
    clearNavGridCache();
    clearPathCache();
    const again = soakWeek('hard', 'maxed', false);
    expect(again.days.length).toBe(DAYS);
    again.days.forEach((d, i) => expect(d, `day ${i + 1}`).toBe(first.days[i]));
    expect(again.ticks).toBe(first.ticks);
  });
});

describe('nav cost', () => {
  it('a busy day at 4× speed builds one distance field per goal and searches no route per tick', () => {
    const state = createNewGame('Quán Va Chạm', 'hard', SEED);
    buyEverything(state);
    dispatch(state, { type: 'apply_restock' });
    for (const cand of [...state.candidates]) dispatch(state, { type: 'hire_staff', candidateId: cand.id, role: 'none' });
    dispatch(state, { type: 'set_auto_assign', enabled: true });
    expect(dispatch(state, { type: 'set_speed', speed: 4 })).toBe(true);
    clearPathCache();
    expect(dispatch(state, { type: 'start_day' })).toBe(true);
    // As the game loop drives it: 60 frames a second, 2 game minutes a second at 1×.
    const frameMinutes = (1 / 60) * 2 * state.speed;
    const goals = new Set<string>();
    let walks = 0;
    for (let frame = 0; state.phase !== 'report' && frame < 100_000; frame++) {
      autoPlay(state);
      const minute = state.minute;
      step(state, frameMinutes);
      state.events = [];
      if (state.minute === minute) continue;
      for (const c of state.customers) {
        if (!c.target) continue;
        goals.add(`${c.target.x},${c.target.z}`);
        walks++;
      }
    }
    expect(state.phase).toBe('report');
    const { paths, fields } = navSearchCount();
    expect(walks).toBeGreaterThan(1000);
    // A field per goal the customers walked to (the door, line, takeaway spots and chairs), kept for the whole day.
    expect(fields).toBeLessThanOrEqual(goals.size);
    expect(fields).toBeLessThan(96);
    // Routes are searched only to lay out the line, once per floor plan.
    expect(paths).toBeLessThanOrEqual(1);
  });
});

/** Expects every point along from → path to be on free floor, and returns the points. */
function expectWalkablePath(grid: NavGrid, from: Vec2, path: Vec2[] | null): Vec2[] {
  expect(path).not.toBeNull();
  const points = samplePath(from, path!);
  const blocked = points.filter((p) => !isWalkable(grid, p));
  expect(blocked.map(fmt)).toEqual([]);
  return points;
}

function footprint(layout: ShopLayout, id: string): Footprint {
  const fp = layoutFootprints(layout).find((f) => f.id === id);
  expect(fp, id).toBeDefined();
  return fp!;
}

/** Closest any point comes to the footprint. */
function clearance(points: readonly Vec2[], fp: Footprint): number {
  return Math.min(...points.map((p) => shapeDistance(fp.shape, p.x, p.z)));
}

/** A customer stepped by the sim until they stop; returns every position they held. */
function walkCustomer(state: GameState, from: Vec2, target: Vec2): Vec2[] {
  const c: Customer = {
    id: state.nextId++,
    state: 'drinking',
    pos: { ...from },
    target: { ...target },
    patience: 99,
    maxPatience: 99,
    order: 'latte',
    tableId: null,
    timer: 999,
    look: 0,
  };
  state.customers = [c];
  state.phase = 'opening';
  state.minute = 9 * 60;
  const trail = [{ ...c.pos }];
  for (let k = 0; k < 20; k++) {
    step(state, 1);
    trail.push({ ...c.pos });
  }
  return trail;
}

describe('collision cases', () => {
  it('customer vs table: walks around a table in the way instead of through it', () => {
    const state = maxedState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const table = layout.tables.find((t) => t.zone === 'indoor')!;
    const fp = footprint(layout, `table:${table.id}`);
    const from = nearestFree(grid, { x: table.pos.x, z: table.pos.z - 1.3 })!;
    const to = nearestFree(grid, { x: table.pos.x, z: table.pos.z + 1.3 })!;
    expect(lineCrosses(from, to, fp)).toBe(true);
    const points = expectWalkablePath(grid, from, findPath(grid, from, to));
    expect(clearance(points, fp)).toBeGreaterThan(0);

    // The sim's own walk, a minute at a time, never lands in the table either.
    const trail = walkCustomer(state, from, to);
    expect(trail.filter((p) => !isWalkable(grid, p)).map(fmt)).toEqual([]);
    expect(dist(trail[trail.length - 1]!, to)).toBeLessThan(1e-9);
  });

  it('customer vs chair: the line and seated customers stand off the chairs, which are drawn where the sim seats', () => {
    const state = maxedState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const chairs = layoutFootprints(layout).filter((f) => f.kind === 'chair');
    expect(chairs.length).toBeGreaterThan(10);
    for (let i = 0; i < 6; i++) {
      const q = queueSlot(layout, i);
      expect(isWalkable(grid, q)).toBe(true);
      for (const ch of chairs) expect(shapeDistance(ch.shape, q.x, q.z)).toBeGreaterThan(0);
    }
    for (const t of layout.tables) {
      for (const side of [-1, 1]) {
        const chair = { x: t.pos.x + side * CHAIR_OFFSET, z: t.pos.z };
        expect(isWalkable(grid, chair)).toBe(false);
        // The last step from the free floor onto the chair crosses no other furniture.
        const stand = nearestFree(grid, chair)!;
        const hits = samplePath(stand, [chair]).map((p) => footprintAt(layout, p, chair)).filter((id) => id !== null);
        expect(hits, fmt(chair)).toEqual([]);
        expectWalkablePath(grid, DOOR_POS, findPath(grid, DOOR_POS, chair));
      }
    }
    // Two customers at one table sit on the two chairs, where they are drawn.
    const s = createNewGame('Quán Va Chạm', 'normal', SEED);
    s.phase = 'opening';
    s.minute = 9 * 60;
    const table = s.tables[0]!;
    const [a, b] = [0, 1].map((k) => {
      const c: Customer = { id: s.nextId++, state: 'waiting', pos: { ...DOOR_POS }, target: null, patience: 99, maxPatience: 99, order: 'latte', tableId: null, timer: 0, look: k };
      s.customers.push(c);
      return c;
    });
    step(s, 1);
    expect(a!.tableId).toBe(table.id);
    expect(b!.tableId).toBe(table.id);
    const xs = [a!.target!.x, b!.target!.x].sort((p, q) => p - q);
    expect(xs).toEqual([table.pos.x - CHAIR_OFFSET, table.pos.x + CHAIR_OFFSET]);
  });

  it('customer vs counter: goes round the counter and staff go round it from behind', () => {
    const state = maxedState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const fp = footprint(layout, 'counter');
    const front = { x: layout.counter.pos.x, z: layout.counter.pos.z + 1 };
    const back = { x: layout.counter.pos.x, z: layout.counter.pos.z - 0.75 };
    expect(lineCrosses(front, back, fp)).toBe(true);
    const points = expectWalkablePath(grid, front, findPath(grid, front, back));
    expect(clearance(points, fp)).toBeGreaterThan(0);
    // A barista behind the bar walking out to clean the farthest table.
    const far = layout.tables[layout.tables.length - 1]!;
    expectWalkablePath(grid, back, findPath(grid, back, { x: far.pos.x, z: far.pos.z - 0.8 }));
    for (const m of layout.machines) expect(isWalkable(grid, m.pos)).toBe(false);
  });

  it('customer vs wall: leaves the side room and the patio only through openings', () => {
    const state = maxedState();
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    const walls = layoutFootprints(layout).filter((f) => f.kind === 'wall');
    for (const w of walls) {
      const b = w.shape.type === 'rect' ? w.shape : null;
      expect(b).not.toBeNull();
      expect(isWalkable(grid, { x: (b!.minX + b!.maxX) / 2, z: (b!.minZ + b!.maxZ) / 2 })).toBe(false);
    }
    const sideTable = layout.tables.find((t) => t.zone === 'expansion')!;
    // The patio table on the right, so the straight line runs into the front-right wall.
    const patioTable = layout.tables.find((t) => t.zone === 'outdoor' && t.pos.x > layout.door.x)!;
    const inSide = nearestFree(grid, { x: sideTable.pos.x, z: sideTable.pos.z - 0.8 })!;
    const onPatio = nearestFree(grid, { x: patioTable.pos.x, z: patioTable.pos.z - 0.8 })!;
    const right = footprint(layout, 'wall:front-right');
    expect(lineCrosses(inSide, onPatio, right)).toBe(true);
    const points = expectWalkablePath(grid, inSide, findPath(grid, inSide, onPatio));
    for (const w of walls) expect(clearance(points, w), w.id).toBeGreaterThan(0);
    // Inside to outside goes through the doorway.
    expect(points.some((p) => Math.abs(p.x - layout.door.x) < 0.8 && Math.abs(p.z - (layout.indoor.maxZ + 0.1)) < 0.15)).toBe(true);
  });

  it('customer vs door: walks between the posts and past the open leaf', () => {
    const layout = getShopLayout(createNewGame('Quán Va Chạm', 'normal', SEED));
    const grid = buildNavGrid(layout);
    const inside = { x: layout.door.x - 0.6, z: layout.indoor.maxZ - 1.2 };
    const outside = { x: layout.door.x - 0.6, z: layout.indoor.maxZ + 1.5 };
    const parts = layoutFootprints(layout).filter((f) => f.kind === 'door');
    expect(parts.map((p) => p.id).sort()).toEqual(['door:leaf', 'door:postL', 'door:postR']);
    expect(parts.some((p) => lineCrosses(inside, outside, p))).toBe(true);
    for (const [a, b] of [
      [inside, outside],
      [outside, inside],
    ] as const) {
      const points = expectWalkablePath(grid, a, findPath(grid, a, b));
      for (const p of parts) expect(clearance(points, p), p.id).toBeGreaterThan(0);
    }
    expect(isWalkable(grid, DOOR_POS)).toBe(true);
  });

  it('person vs person: staff of one role, the player and customers each get their own spot', () => {
    const state = maxedState();
    state.money = 1e9;
    for (let round = 0; round < 3; round++) {
      for (const cand of [...state.candidates]) dispatch(state, { type: 'hire_staff', candidateId: cand.id, role: 'server' });
      state.candidates = createNewGame('x', 'normal', SEED + round + 1).candidates.map((c) => ({ ...c, id: state.nextId++ }));
    }
    expect(state.staff.length).toBe(6);
    const layout = getShopLayout(state);
    const grid = buildNavGrid(layout);
    // A full line and more takeaway customers than spots near the mat.
    for (let k = 0; k < 6 + PICKUP_SPOTS; k++) {
      state.customers.push({
        id: state.nextId++,
        state: k < 6 ? 'queueing' : 'waiting',
        pos: k < 6 ? queueSlot(layout, k) : { ...floorSpots(layout).pickup[k - 6]! },
        target: k < 6 ? queueSlot(layout, k) : { ...floorSpots(layout).pickup[k - 6]! },
        patience: 99,
        maxPatience: 99,
        order: 'latte',
        tableId: null,
        timer: 0,
        look: k,
      });
    }
    const spots = [...staffSpots(state, layout).values()];
    const standing = [...state.customers.map((c) => c.pos), ...spots, playerSpot(state, null, layout)];
    for (const p of standing) expect(isWalkable(grid, p), fmt(p)).toBe(true);
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        expect(dist(standing[i]!, standing[j]!), `${fmt(standing[i]!)} / ${fmt(standing[j]!)}`).toBeGreaterThanOrEqual(MIN_STANDING_GAP);
      }
    }
    // The line and the pickup mat never share a cell.
    const queueCells = new Set(floorSpots(layout).queue.map((p) => cellAt(grid, p)));
    for (const p of floorSpots(layout).pickup) expect(queueCells.has(cellAt(grid, p))).toBe(false);
  });

  it('pedestrian vs pedestrian: the street crowd never overlaps at any moment', () => {
    const slots = walkerSlots(MAX_DENSITY.pedestrians);
    expect(slots.length).toBeGreaterThan(4);
    let closest = Infinity;
    for (let t = 0; t <= 600; t += 0.5) {
      const at = slots.map((s) => {
        const line = WALK_LINES[s.line]!;
        return { x: travelX(s.start, line.dir, s.speed, t), z: line.z };
      });
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          // The street wraps around, so measure the shorter way along x.
          const dx = Math.abs(at[i]!.x - at[j]!.x);
          closest = Math.min(closest, Math.hypot(Math.min(dx, STREET_SPAN - dx), at[i]!.z - at[j]!.z));
        }
      }
    }
    expect(closest).toBeGreaterThan(2 * WALKER_RADIUS);
  });

  it('decor vs furniture: every purchase order keeps decor clear, and a plant on a table is caught', () => {
    for (const decor of UPGRADES.filter((u) => u.category === 'decor')) {
      for (const seating of ['tables', 'expand_area', 'outdoor_seating'] as const) {
        const state = createNewGame('Quán Va Chạm', 'normal', SEED);
        state.money = 1e12;
        while (nextUpgradeCost(state, decor.id) !== null) {
          expect(buyUpgrade(state, decor.id).ok).toBe(true);
          expect(validateLayout(getShopLayout(state)), decor.id).toEqual([]);
        }
        while (nextUpgradeCost(state, seating) !== null) {
          expect(buyUpgrade(state, seating).ok).toBe(true);
          expect(validateLayout(getShopLayout(state)), `${decor.id} then ${seating}`).toEqual([]);
        }
      }
    }
    const layout = getShopLayout(maxedState());
    expect(validateLayout(layout)).toEqual([]);
    const table = layout.tables[0]!;
    const crowded: ShopLayout = { ...layout, decor: [...layout.decor, { kind: 'plant', pos: { ...table.pos } }] };
    const issues = validateLayout(crowded);
    expect(issues.some((i) => i.kind === 'overlap' && [i.a, i.b].includes(`table:${table.id}`))).toBe(true);
  });
});
