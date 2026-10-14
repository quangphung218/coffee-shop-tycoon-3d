import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, step } from '../../src/sim';
import {
  AGENT_RADIUS,
  CHAIR_OFFSET,
  NAV_CELL,
  buildNavGrid,
  clearNavGridCache,
  clearPathCache,
  createNavGrid,
  doorPlanters,
  findPath,
  isWalkable,
  layoutFootprints,
  navSearchCount,
  nearestFree,
  shapeDistance,
  validateLayout,
  walkToward,
  type NavGrid,
} from '../../src/sim/nav';
import { createNewGame } from '../../src/sim/state';
import { buyUpgrade, getShopLayout, type ShopLayout } from '../../src/sim/upgrades';
import type { UpgradeId, Vec2 } from '../../src/sim/types';

type Levels = Partial<Record<UpgradeId, number>>;

function layoutWith(levels: Levels): ShopLayout {
  const s = createNewGame('Nav', 'normal', 1);
  s.money = 1e15;
  for (const [id, n] of Object.entries(levels) as [UpgradeId, number][]) {
    for (let i = 0; i < n; i++) expect(buyUpgrade(s, id).ok).toBe(true);
  }
  return getShopLayout(s);
}

/** Every upgrade at its last level: the most crowded floor. */
const FULL: Levels = {
  tables: 6,
  window_bar: 2,
  expand_area: 2,
  outdoor_seating: 2,
  big_counter: 2,
  fast_machine: 3,
  better_machine: 3,
  plants: 3,
  paintings: 3,
  lights: 2,
};

const OUTSIDE: Vec2 = { x: 0, z: 9.2 };

/** Samples the polyline every few centimetres. */
function samples(from: Vec2, path: Vec2[], step = 0.03): Vec2[] {
  const out: Vec2[] = [];
  let prev = from;
  for (const p of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / step));
    for (let k = 0; k <= n; k++) out.push({ x: prev.x + ((p.x - prev.x) * k) / n, z: prev.z + ((p.z - prev.z) * k) / n });
    prev = p;
  }
  return out;
}

/** Footprints the point stands inside of. */
function hits(layout: ShopLayout, p: Vec2): string[] {
  return layoutFootprints(layout)
    .filter((f) => shapeDistance(f.shape, p.x, p.z) === 0)
    .map((f) => f.id);
}

function expectClearPath(layout: ShopLayout, grid: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const path = findPath(grid, from, to);
  expect(path, `no path ${JSON.stringify(from)} -> ${JSON.stringify(to)}`).not.toBeNull();
  for (const p of samples(from, path!)) expect(hits(layout, p), `at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toEqual([]);
  return path!;
}

beforeEach(() => {
  clearNavGridCache();
  clearPathCache();
});

describe('nav grid', () => {
  it('blocks walls, furniture and floor-standing decor, but not the doorway', () => {
    const layout = layoutWith(FULL);
    const grid = buildNavGrid(layout);
    expect(isWalkable(grid, { x: 0, z: 6.1 })).toBe(true); // in the doorway
    expect(isWalkable(grid, { x: -2, z: 6.1 })).toBe(false); // front wall
    expect(isWalkable(grid, { x: -4.6, z: 0 })).toBe(false); // left wall
    expect(isWalkable(grid, { x: -6, z: 0 })).toBe(false); // outside the building, beside it
    expect(isWalkable(grid, layout.counter.pos)).toBe(false);
    expect(isWalkable(grid, layout.machines[0]!.pos)).toBe(false);
    for (const t of layout.tables) {
      expect(isWalkable(grid, t.pos)).toBe(false);
      expect(isWalkable(grid, { x: t.pos.x - CHAIR_OFFSET, z: t.pos.z })).toBe(false);
      expect(isWalkable(grid, { x: t.pos.x + CHAIR_OFFSET, z: t.pos.z })).toBe(false);
    }
    for (const d of layout.decor) if (d.kind === 'plant') expect(isWalkable(grid, d.pos)).toBe(false);
    expect(isWalkable(grid, OUTSIDE)).toBe(true);
  });

  it('keeps every free cell at least the agent radius away from footprints', () => {
    const layout = layoutWith(FULL);
    const grid = buildNavGrid(layout);
    const fps = layoutFootprints(layout);
    let closest = Infinity;
    for (let i = 0; i < grid.blocked.length; i++) {
      if (grid.blocked[i]) continue;
      const x = (grid.col0 + (i % grid.cols)) * NAV_CELL;
      const z = (grid.row0 + Math.floor(i / grid.cols)) * NAV_CELL;
      for (const f of fps) closest = Math.min(closest, shapeDistance(f.shape, x, z));
    }
    expect(closest).toBeGreaterThanOrEqual(AGENT_RADIUS - 1e-6);
  });

  it('blocks the planters beside the door but keeps the doorway and the patio passable', () => {
    for (const levels of [{}, FULL]) {
      const layout = layoutWith(levels);
      const grid = buildNavGrid(layout);
      const planters = doorPlanters(layout);
      expect(layoutFootprints(layout).filter((f) => f.kind === 'planter').map((f) => f.id)).toEqual(['planter:L', 'planter:R']);
      for (const p of planters) expect(isWalkable(grid, p)).toBe(false);
      // Straight out of the door onto the sidewalk, between the planters.
      expect(isWalkable(grid, { x: layout.door.x, z: planters[0]!.z })).toBe(true);
      expectClearPath(layout, grid, OUTSIDE, { x: layout.door.x, z: layout.indoor.maxZ - 0.5 });
      // Around the outside of a planter, toward the patio corners.
      expectClearPath(layout, grid, OUTSIDE, { x: -4, z: planters[0]!.z });
    }
  });

  it('ignores lamps and paintings', () => {
    const plain = createNavGrid(layoutWith({ tables: 6 }));
    const decorated = createNavGrid(layoutWith({ tables: 6, lights: 2, paintings: 3 }));
    expect(decorated.blocked).toEqual(plain.blocked);
  });

  it('is cached until the layout changes', () => {
    const layout = layoutWith({ tables: 2 });
    const grid = buildNavGrid(layout);
    expect(buildNavGrid(layoutWith({ tables: 2 }))).toBe(grid);
    const bigger = buildNavGrid(layoutWith({ tables: 3 }));
    expect(bigger).not.toBe(grid);
    expect(bigger.key).not.toBe(grid.key);
  });

  it('is built once per floor plan over a played day, not every tick', () => {
    const s = createNewGame('Nav', 'normal', 7);
    s.money = 1e15;
    expect(buyUpgrade(s, 'tables').ok).toBe(true);
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    const grids = new Set<NavGrid>();
    for (let t = 0; t < 300; t++) {
      step(s, 1);
      grids.add(buildNavGrid(getShopLayout(s)));
    }
    expect(grids.size).toBe(1);
    const [grid] = grids;
    expect(grid!.key).toBe(createNavGrid(getShopLayout(s)).key);
    // A new floor plan gets one new grid, then that one is reused.
    expect(buyUpgrade(s, 'tables').ok).toBe(true);
    for (let t = 0; t < 30; t++) {
      step(s, 1);
      grids.add(buildNavGrid(getShopLayout(s)));
    }
    expect(grids.size).toBe(2);
  });
});

describe('findPath', () => {
  it('walks from the sidewalk to every table around tables, chairs and walls', () => {
    const layout = layoutWith(FULL);
    const grid = buildNavGrid(layout);
    for (const t of layout.tables) {
      const seat = nearestFree(grid, { x: t.pos.x - CHAIR_OFFSET, z: t.pos.z })!;
      expect(Math.hypot(seat.x - (t.pos.x - CHAIR_OFFSET), seat.z - t.pos.z)).toBeLessThan(1);
      expectClearPath(layout, grid, OUTSIDE, seat);
    }
  });

  it('keeps a straight main aisle from the door to the counter and cross aisles between the table rows', () => {
    for (const levels of [{}, FULL]) {
      const layout = layoutWith(levels);
      const grid = buildNavGrid(layout);
      const front = layout.counter.pos.z + 1;
      // Three free cells across, all the way from inside the door to where customers order.
      for (let z = front; z <= layout.indoor.maxZ - 0.25; z += NAV_CELL) {
        for (const x of [-1, 0, 1]) expect(isWalkable(grid, { x: layout.door.x + x * NAV_CELL, z }), `${x * NAV_CELL},${z}`).toBe(true);
      }
      const path = expectClearPath(layout, grid, { x: layout.door.x, z: layout.indoor.maxZ - 0.25 }, { x: layout.counter.pos.x, z: front });
      for (const p of path) expect(Math.abs(p.x - layout.door.x)).toBeLessThanOrEqual(0.5);

      const rows = [...new Set(layout.tables.filter((t) => t.zone === 'indoor').map((t) => t.pos.z))].sort((a, b) => a - b);
      for (let r = 1; r < rows.length; r++) {
        const z = (rows[r - 1]! + rows[r]!) / 2;
        // Three free cells deep, wall to wall.
        for (let x = layout.indoor.minX + 0.25; x <= layout.indoor.maxX - 0.25; x += NAV_CELL) {
          for (const dz of [-1, 0, 1]) expect(isWalkable(grid, { x, z: z + dz * NAV_CELL }), `${x},${z + dz * NAV_CELL}`).toBe(true);
        }
      }
    }
  });

  it('goes around the counter to get behind it', () => {
    const layout = layoutWith(FULL);
    const grid = buildNavGrid(layout);
    const front = { x: layout.counter.pos.x, z: layout.counter.pos.z + 1 };
    const back = { x: layout.counter.pos.x, z: layout.counter.pos.z - 0.75 };
    // The straight line would cross the counter.
    expect(samples(front, [back]).some((p) => hits(layout, p).includes('counter'))).toBe(true);
    const path = expectClearPath(layout, grid, front, back);
    const halfWidth = layout.counter.width / 2;
    expect(path.some((p) => Math.abs(p.x - layout.counter.pos.x) > halfWidth)).toBe(true);
    expect(path.at(-1)).toEqual(back);
  });

  it('enters through the door, not through the front wall', () => {
    const layout = layoutWith({ tables: 6, window_bar: 2, plants: 3 });
    const grid = buildNavGrid(layout);
    const outsideLeft = { x: -3, z: 8 };
    const inside = { x: -3, z: 4 };
    const path = expectClearPath(layout, grid, outsideLeft, inside);
    const crossing = samples(outsideLeft, path).find((p) => Math.abs(p.z - 6.1) < 0.05)!;
    expect(Math.abs(crossing.x - layout.door.x)).toBeLessThan(0.8);
  });

  it('steps out of an obstacle first when starting inside one', () => {
    const layout = layoutWith({ tables: 2 });
    const grid = buildNavGrid(layout);
    const table = layout.tables[0]!.pos;
    expect(isWalkable(grid, table)).toBe(false);
    const out = nearestFree(grid, table)!;
    expect(isWalkable(grid, out)).toBe(true);
    expect(Math.hypot(out.x - table.x, out.z - table.z)).toBeLessThan(1.2);
    const path = findPath(grid, table, OUTSIDE)!;
    expect(path[0]).toEqual(out);
    expect(path.at(-1)).toEqual(OUTSIDE);
  });

  it('gives the same route for the same input', () => {
    const layout = layoutWith(FULL);
    const ends: Vec2[] = [OUTSIDE, layout.pickup, { x: 0, z: -2.75 }, ...layout.tables.map((t) => ({ x: t.pos.x + CHAIR_OFFSET, z: t.pos.z }))];
    const run = (): (Vec2[] | null)[] => {
      clearNavGridCache();
      clearPathCache();
      const grid = buildNavGrid(layoutWith(FULL));
      return ends.flatMap((a) => ends.map((b) => findPath(grid, a, b)));
    };
    const first = run();
    expect(run()).toEqual(first);
    // A cached answer matches a fresh one.
    const grid = buildNavGrid(layout);
    expect(ends.flatMap((a) => ends.map((b) => findPath(grid, a, b)))).toEqual(first);
  });
});

/** Steps from `from` toward `to` until arriving (or `max` steps); every position along the way. */
function walkAll(grid: NavGrid, from: Vec2, to: Vec2, step = 4, max = 40): Vec2[] {
  const trail = [from];
  let pos = from;
  for (let k = 0; k < max && (pos.x !== to.x || pos.z !== to.z); k++) {
    const next = walkToward(grid, pos, to, step);
    expect(next).not.toBeNull();
    pos = next!;
    trail.push(pos);
  }
  return trail;
}

describe('walkToward', () => {
  it('walks from the sidewalk to every chair and behind the counter through free floor only', () => {
    const layout = layoutWith(FULL);
    const grid = buildNavGrid(layout);
    const back = { x: layout.counter.pos.x, z: layout.counter.pos.z - 0.75 };
    const goals = [back, ...layout.tables.map((t) => nearestFree(grid, { x: t.pos.x - CHAIR_OFFSET, z: t.pos.z })!)];
    for (const goal of goals) {
      expect(walkAll(grid, OUTSIDE, goal).at(-1), JSON.stringify(goal)).toEqual(goal);
      // In short steps the line between two positions is the walk itself: it must miss every footprint.
      const trail = walkAll(grid, OUTSIDE, goal, 0.1, 600);
      expect(trail.at(-1), JSON.stringify(goal)).toEqual(goal);
      for (let k = 1; k < trail.length; k++) {
        for (const p of samples(trail[k - 1]!, [trail[k]!])) expect(hits(layout, p), `at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toEqual([]);
      }
    }
  });

  it('steps out of an obstacle first, and arrives in small steps as in big ones', () => {
    const layout = layoutWith({ tables: 2 });
    const grid = buildNavGrid(layout);
    const table = layout.tables[0]!.pos;
    // The first stretch leads to the nearest free cell, then on from there.
    const out = nearestFree(grid, table)!;
    const first = walkToward(grid, table, OUTSIDE, Math.hypot(out.x - table.x, out.z - table.z))!;
    expect(first).toEqual(out);
    expect(isWalkable(grid, walkToward(grid, table, OUTSIDE, 1.5)!)).toBe(true);
    // Short steps never stall between two cell centres.
    for (const step of [0.05, 0.1, 0.25]) expect(walkAll(grid, table, OUTSIDE, step, 2000).at(-1), `step ${step}`).toEqual(OUTSIDE);
    expect(walkAll(grid, table, OUTSIDE, 4).at(-1)).toEqual(OUTSIDE);
  });

  it('gives the same steps with cold caches', () => {
    const run = (): Vec2[] => {
      clearNavGridCache();
      clearPathCache();
      const layout = layoutWith(FULL);
      const grid = buildNavGrid(layout);
      return layout.tables.flatMap((t) => walkAll(grid, OUTSIDE, nearestFree(grid, { x: t.pos.x + CHAIR_OFFSET, z: t.pos.z })!));
    };
    expect(run()).toEqual(run());
  });

  it('builds one distance field per goal cell and drops them when the floor plan changes', () => {
    const small = buildNavGrid(layoutWith({ tables: 2 }));
    const big = buildNavGrid(layoutWith({ tables: 3 }));
    const starts: Vec2[] = [OUTSIDE, { x: -3, z: 4 }, { x: 3, z: -1 }, { x: 0, z: 5 }];
    for (const s of starts) walkAll(small, s, { x: 0, z: -1 });
    expect(navSearchCount()).toEqual({ paths: 0, fields: 1 });
    walkAll(small, OUTSIDE, { x: 2.5, z: -1 });
    expect(navSearchCount().fields).toBe(2);
    walkAll(big, OUTSIDE, { x: 0, z: -1 });
    expect(navSearchCount().fields).toBe(3);
    // Back on the first plan: its fields were dropped with the change.
    walkAll(small, OUTSIDE, { x: 0, z: -1 });
    expect(navSearchCount().fields).toBe(4);
  });
});

/** better_machine, paintings and lights levels: things that stand on no floor. */
const OFF_FLOOR: Levels[] = [];
for (let machine = 0; machine <= 3; machine++) {
  for (let paintings = 0; paintings <= 3; paintings++) {
    for (let lights = 0; lights <= 2; lights++) OFF_FLOOR.push({ better_machine: machine, paintings, lights });
  }
}

describe('validateLayout', () => {
  it('finds nothing wrong with any combination of upgrades', () => {
    const problems: string[] = [];
    const used = new Set<number>();
    let n = 0;
    // tables and window_bar both add indoor tables at the next free spot, so only their sum matters.
    for (let indoor = 0; indoor <= 8; indoor++) {
      for (let expand = 0; expand <= 2; expand++) {
        for (let outdoor = 0; outdoor <= 2; outdoor++) {
          for (let counter = 0; counter <= 2; counter++) {
            for (let fast = 0; fast <= 3; fast++) {
              for (let plants = 0; plants <= 3; plants++) {
                // Every floor combination, each with one of the off-floor combinations in turn; the
                // next test shows those never change what validateLayout looks at.
                const k = (n++ * 7 + indoor + expand + outdoor) % OFF_FLOOR.length;
                used.add(k);
                const levels: Levels = {
                  tables: Math.min(indoor, 6),
                  window_bar: Math.max(0, indoor - 6),
                  expand_area: expand,
                  outdoor_seating: outdoor,
                  big_counter: counter,
                  fast_machine: fast,
                  plants,
                  ...OFF_FLOOR[k],
                };
                const issues = validateLayout(layoutWith(levels));
                if (issues.length > 0) problems.push(`${JSON.stringify(levels)}: ${JSON.stringify(issues)}`);
              }
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(used.size).toBe(OFF_FLOOR.length);
  }, 60_000);

  it('gets the same footprints, free floor and verdict whatever the machine quality, paintings and lights', () => {
    const floors: Levels[] = [{}, { tables: 6, window_bar: 2, plants: 3 }, { expand_area: 2, outdoor_seating: 2, big_counter: 2, fast_machine: 3 }];
    for (const floor of floors) {
      const plain = layoutWith(floor);
      const fps = layoutFootprints(plain);
      const blocked = createNavGrid(plain).blocked;
      const verdict = validateLayout(plain);
      for (const extra of OFF_FLOOR) {
        const layout = layoutWith({ ...floor, ...extra });
        const name = JSON.stringify({ ...floor, ...extra });
        expect(layoutFootprints(layout), name).toEqual(fps);
        expect(createNavGrid(layout).blocked, name).toEqual(blocked);
        expect(validateLayout(layout), name).toEqual(verdict);
      }
    }
  });

  it('reports furniture standing on furniture', () => {
    const layout = layoutWith({ plants: 1 });
    layout.decor[0]!.pos = { ...layout.tables[0]!.pos };
    expect(validateLayout(layout)).toContainEqual({ kind: 'overlap', a: `table:${layout.tables[0]!.id}`, b: 'plant:0' });
  });

  it('reports a table standing on a door planter', () => {
    const layout = layoutWith({ outdoor_seating: 1 });
    const table = layout.tables.find((t) => t.zone === 'outdoor')!;
    table.pos = { ...doorPlanters(layout)[1] };
    expect(validateLayout(layout)).toContainEqual({ kind: 'overlap', a: 'planter:R', b: `table:${table.id}` });
  });

  it('reports a blocked door', () => {
    const layout = layoutWith({});
    layout.tables[0]!.pos = { x: layout.door.x, z: layout.indoor.maxZ - 0.5 };
    expect(validateLayout(layout)).toContainEqual({ kind: 'door_blocked' });
  });

  it('reports a counter that cannot be walked around', () => {
    const layout = layoutWith({});
    layout.counter.width = layout.indoor.maxX - layout.indoor.minX;
    const issues = validateLayout(layout);
    expect(issues).toContainEqual({ kind: 'counter_blocked', spot: 'back' });
    expect(issues.some((i) => i.kind === 'overlap' && i.a.startsWith('wall:'))).toBe(true);
  });

  it('reports a table nobody can reach', () => {
    const layout = layoutWith({});
    const table = layout.tables[0]!;
    // Behind the left wall, off the floor.
    table.pos = { x: -6, z: 0 };
    expect(validateLayout(layout)).toContainEqual({ kind: 'table_unreachable', tableId: table.id });
  });
});
