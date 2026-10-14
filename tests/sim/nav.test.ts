import { beforeEach, describe, expect, it } from 'vitest';
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
  nearestFree,
  shapeDistance,
  validateLayout,
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

  it('builds in under 5 ms', () => {
    const layout = layoutWith(FULL);
    for (let i = 0; i < 5; i++) createNavGrid(layout);
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const t0 = performance.now();
      createNavGrid(layout);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[10]!).toBeLessThan(5);
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

describe('validateLayout', () => {
  it('finds nothing wrong with any combination of upgrades', () => {
    const problems: string[] = [];
    // tables and window_bar both add indoor tables at the next free spot, so only their sum matters.
    for (let indoor = 0; indoor <= 8; indoor++) {
      for (let expand = 0; expand <= 2; expand++) {
        for (let outdoor = 0; outdoor <= 2; outdoor++) {
          for (let counter = 0; counter <= 2; counter++) {
            for (let fast = 0; fast <= 3; fast++) {
              for (let plants = 0; plants <= 3; plants++) {
                const levels: Levels = {
                  tables: Math.min(indoor, 6),
                  window_bar: Math.max(0, indoor - 6),
                  expand_area: expand,
                  outdoor_seating: outdoor,
                  big_counter: counter,
                  fast_machine: fast,
                  plants,
                  paintings: 3,
                  lights: 2,
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
  }, 60_000);

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
