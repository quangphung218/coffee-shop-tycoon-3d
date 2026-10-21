import { describe, expect, it } from 'vitest';
import { DOOR_POS, floorSpots, queueSlot } from '../../src/sim/customers';
import {
  AGENT_RADIUS,
  CHAIR_OFFSET,
  SIDEWALK_MAX_Z,
  WALL_THICKNESS,
  buildNavGrid,
  buildingArea,
  findPath,
  isWalkable,
  layoutFootprints,
  shapeDistance,
  type Footprint,
  type FootprintKind,
  type NavGrid,
  type Shape,
} from '../../src/sim/nav';
import { staffSpots } from '../../src/sim/staff';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState, Order, Staff, StaffRole, StaffTask, Vec2 } from '../../src/sim/types';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { buyUpgrade, getShopLayout, nextUpgradeCost, tableZone, type ShopLayout, type TableZone } from '../../src/sim/upgrades';

/**
 * Top-down plans of the fully upgraded shop for docs/reports: the routes and
 * standing spots of P17 (commit 07439cf, straight lines, in red) next to the
 * ones the nav grid gives now (in green), one SVG per kind of collision.
 * The SVGs are file snapshots: a change in the nav code that moves a path
 * fails here until they are rewritten with `npx vitest run tests/report -u`.
 */

const SEED = 20261014;
const SAMPLE_STEP = 0.05;
const REPORT_DIR = '../../docs/reports';

/** Routes and spots of 07439cf: everyone walked (or jumped) in a straight line. */
const OLD = {
  queueSlot: (i: number): Vec2 => ({ x: 0, z: -1 + i * 0.8 }),
  /** Seats were ±0.5 from the table centre while the chairs were drawn at ±CHAIR_OFFSET. */
  seat: (table: Vec2, left: boolean): Vec2 => ({ x: table.x + (left ? -0.5 : 0.5), z: table.z }),
  pickup: { x: 2.5, z: -1 },
  baristaStation: { x: -1, z: -2.7 },
  serverStation: { x: 2.5, z: -1.8 },
  counterFront: { x: 0, z: -1.6 },
  machineFront: { x: -1, z: -2.9 },
} as const;

/**
 * The P18 floor plan the plots are drawn on, before P19 split the tables
 * around a main aisle: four tables a row 2 apart, and the P18 plant spots.
 */
const P18_PLAN = {
  table: (zone: TableZone, i: number): Vec2 => {
    switch (zone) {
      case 'indoor':
        return { x: -3 + (i % 4) * 2, z: 1 + Math.floor(i / 4) * 2 };
      case 'expansion':
        return { x: 6 + Math.floor(i / 3) * 2, z: -1 + (i % 3) * 2.2 };
      case 'outdoor':
        return { x: [-2.5, 2.5, -4.5, 4.5][i % 4]!, z: 7.8 + Math.floor(i / 4) };
    }
  },
  plants: [
    { x: -4, z: -4 },
    { x: 4, z: 5.4 },
    { x: -4, z: 4 },
  ],
} as const;

const INK = '#3a2216';
const RED = '#b3261e';
const GREEN = '#17663a';
const FLOOR = '#e9cfa8';
const OUTSIDE = '#e4ddd0';
const FILL: Readonly<Record<FootprintKind, string>> = {
  wall: '#e2c59d',
  door: '#a0704c',
  planter: '#8fcf5f',
  counter: '#a0673f',
  back_counter: '#6b3f24',
  machine: '#8fd3f4',
  table: '#d9a877',
  chair: '#f6e7d2',
  parasol: '#ff8a7a',
  plant: '#8fcf5f',
  bookshelf: '#a0704c',
  sofa: '#d9822b',
};
const KIND_NAME: Readonly<Record<FootprintKind, string>> = {
  wall: 'tường',
  door: 'khung cửa',
  planter: 'chậu cây cửa',
  counter: 'quầy',
  back_counter: 'quầy sau',
  machine: 'máy pha',
  table: 'bàn',
  chair: 'ghế',
  parasol: 'cột dù',
  plant: 'chậu cây',
  bookshelf: 'kệ sách',
  sofa: 'góc sofa',
};

/** World units to px. */
const SCALE = 36;
const PAD = 16;
const HEAD = 64;
const FOOT = 52;

interface Label {
  at: Vec2;
  text: string;
  /** Where the text sits from the point. */
  dx?: number;
  dy?: number;
  anchor?: 'start' | 'end' | 'middle';
}

interface Side {
  /** Walked polylines, each from its start. */
  routes: Vec2[][];
  /** People standing still; spots listed more than once stand on top of each other. */
  spots: Vec2[];
  labels: Label[];
}

interface PlotCase {
  slug: string;
  title: string;
  before: Side;
  after: Side;
  /** Footprint groups the person may touch on purpose (the table they sit at). */
  ignore: string[];
  /** The new routes end with the last step from the free floor onto a chair. */
  seated?: boolean;
}

interface Hit {
  fp: Footprint;
  at: Vec2;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function sample(route: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [{ ...route[0]! }];
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1]!;
    const b = route[k]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / SAMPLE_STEP));
    for (let i = 1; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  }
  return out;
}

/**
 * Furniture people run into along the routes and on the spots: every point
 * in a blocked nav cell (the body, AGENT_RADIUS wide, would overlap
 * something) is blamed on the closest footprint. Each footprint once, at
 * the first point.
 */
function bodyHits(layout: ShopLayout, side: Side, ignore: readonly string[]): Hit[] {
  const fps = layoutFootprints(layout);
  const hits = new Map<string, Hit>();
  for (const p of [...side.routes.flatMap(sample), ...side.spots]) {
    if (isWalkable(grid, p)) continue;
    let near = fps[0]!;
    for (const fp of fps) if (shapeDistance(fp.shape, p.x, p.z) < shapeDistance(near.shape, p.x, p.z)) near = fp;
    if (!ignore.includes(near.group) && !hits.has(near.id)) hits.set(near.id, { fp: near, at: p });
  }
  return [...hits.values()];
}

/** Number of spots someone else stands on top of (closer than one body width). */
function stacked(side: Side): number {
  let n = 0;
  side.spots.forEach((p, i) => {
    if (side.spots.some((q, j) => j < i && dist(p, q) < 2 * AGENT_RADIUS)) n++;
  });
  return n;
}

function summary(layout: ShopLayout, side: Side, ignore: readonly string[]): string {
  const counts = new Map<FootprintKind, number>();
  for (const h of bodyHits(layout, side, ignore)) counts.set(h.fp.kind, (counts.get(h.fp.kind) ?? 0) + 1);
  const parts: string[] = [];
  if (counts.size > 0) parts.push(`người chạm ${[...counts].map(([kind, n]) => `${n} ${KIND_NAME[kind]}`).join(', ')}`);
  const overlap = stacked(side);
  if (overlap > 0) parts.push(`${overlap} người đứng chồng lên người khác`);
  return parts.length > 0 ? parts.join('; ') : 'không chạm đồ vật, không ai đứng chồng';
}

const num = (v: number): string => String(Math.round(v * 10) / 10);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shapeSvg(s: Shape, px: (x: number) => number, pz: (z: number) => number, attrs: string): string {
  switch (s.type) {
    case 'rect':
      return `<rect x="${num(px(s.minX))}" y="${num(pz(s.minZ))}" width="${num((s.maxX - s.minX) * SCALE)}" height="${num((s.maxZ - s.minZ) * SCALE)}" ${attrs}/>`;
    case 'circle':
      return `<circle cx="${num(px(s.x))}" cy="${num(pz(s.z))}" r="${num(Math.max(s.r * SCALE, 1.5))}" ${attrs}/>`;
    case 'segment':
      return `<line x1="${num(px(s.ax))}" y1="${num(pz(s.az))}" x2="${num(px(s.bx))}" y2="${num(pz(s.bz))}" stroke="${INK}" stroke-width="${num(2 * s.r * SCALE + 1)}" stroke-linecap="round"/>`;
  }
}

/** One plan with both sides drawn over it. */
function plot(layout: ShopLayout, c: PlotCase): string {
  const room = buildingArea(layout);
  const t = WALL_THICKNESS;
  const x0 = Math.min(room.minX - t, layout.outdoor?.minX ?? Infinity) - 0.4;
  const x1 = Math.max(room.maxX + t, layout.outdoor?.maxX ?? -Infinity) + 0.4;
  const z0 = room.minZ - t - 0.4;
  const z1 = SIDEWALK_MAX_Z + 0.2;
  const width = Math.round((x1 - x0) * SCALE + 2 * PAD);
  const height = Math.round((z1 - z0) * SCALE + HEAD + FOOT);
  const px = (x: number) => PAD + (x - x0) * SCALE;
  const pz = (z: number) => HEAD + (z - z0) * SCALE;
  const out: string[] = [];
  const titleId = `t-${c.slug}`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId}" font-family="Nunito, system-ui, sans-serif">`,
    `<title id="${titleId}">${esc(c.title)}</title>`,
    `<rect width="${width}" height="${height}" fill="#fffaf2"/>`,
    `<text x="${PAD}" y="26" font-size="18" font-weight="800" fill="${INK}">${esc(c.title)}</text>`,
    `<line x1="${PAD}" y1="46" x2="${PAD + 34}" y2="46" stroke="${RED}" stroke-width="3" stroke-dasharray="7 4"/>`,
    `<text x="${PAD + 42}" y="50" font-size="13" font-weight="700" fill="${INK}">Trước (P17, 07439cf): đi thẳng</text>`,
    `<line x1="${PAD + 270}" y1="46" x2="${PAD + 304}" y2="46" stroke="${GREEN}" stroke-width="3"/>`,
    `<text x="${PAD + 312}" y="50" font-size="13" font-weight="700" fill="${INK}">Sau (P18): lưới điều hướng, A*</text>`,
  );

  // Floor: the room, and the patio and sidewalk in front of it.
  out.push(`<rect x="${num(px(x0))}" y="${num(pz(room.maxZ))}" width="${num((x1 - x0) * SCALE)}" height="${num((z1 - room.maxZ) * SCALE)}" fill="${OUTSIDE}"/>`);
  out.push(`<rect x="${num(px(room.minX))}" y="${num(pz(room.minZ))}" width="${num((room.maxX - room.minX) * SCALE)}" height="${num((room.maxZ - room.minZ) * SCALE)}" fill="${FLOOR}"/>`);
  for (const fp of layoutFootprints(layout)) {
    out.push(shapeSvg(fp.shape, px, pz, `fill="${FILL[fp.kind]}" stroke="${INK}" stroke-width="1"`));
  }

  const drawSide = (side: Side, color: string, dashed: boolean) => {
    for (const route of side.routes) {
      const pts = route.map((p) => `${num(px(p.x))},${num(pz(p.z))}`).join(' ');
      out.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="7 4"' : ''}/>`,
      );
    }
    for (const p of side.spots) {
      out.push(`<circle cx="${num(px(p.x))}" cy="${num(pz(p.z))}" r="${num(AGENT_RADIUS * SCALE)}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"/>`);
    }
  };
  drawSide(c.after, GREEN, false);
  drawSide(c.before, RED, true);

  // Where the old body runs into furniture.
  for (const h of bodyHits(layout, c.before, c.ignore)) {
    const x = px(h.at.x);
    const y = pz(h.at.z);
    out.push(`<path d="M${num(x - 6)} ${num(y - 6)}L${num(x + 6)} ${num(y + 6)}M${num(x + 6)} ${num(y - 6)}L${num(x - 6)} ${num(y + 6)}" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`);
  }

  const drawLabels = (labels: readonly Label[], color: string) => {
    for (const l of labels) {
      const x = px(l.at.x) + (l.dx ?? 10);
      const y = pz(l.at.z) + (l.dy ?? -10);
      out.push(
        `<text x="${num(x)}" y="${num(y)}" font-size="12" font-weight="800" fill="${color}" stroke="#fffaf2" stroke-width="3" paint-order="stroke" text-anchor="${l.anchor ?? 'start'}">${esc(l.text)}</text>`,
      );
    }
  };
  drawLabels(c.before.labels, RED);
  drawLabels(c.after.labels, GREEN);

  const footY = height - FOOT;
  out.push(
    `<text x="${PAD}" y="${footY + 20}" font-size="13" font-weight="700" fill="${RED}">Trước: ${esc(summary(layout, c.before, c.ignore))}</text>`,
    `<text x="${PAD}" y="${footY + 40}" font-size="13" font-weight="700" fill="${GREEN}">Sau: ${esc(summary(layout, c.after, c.ignore))}</text>`,
    '</svg>',
    '',
  );
  return out.join('\n');
}

const P27_FURNITURE: ReadonlySet<string> = new Set(['neon_sign', 'bookshelf', 'record_player', 'sofa_corner', 'cold_brew_tower', 'oven']);

/** Every upgrade at its last level: both table rows, the side room, the patio, the long counter. */
function maxedState(): GameState {
  const state = createNewGame('Quán Va Chạm', 'normal', SEED);
  state.money = 1e12;
  // The plots show the P18 floor: the P27 furniture and the P31 tools are left out.
  for (const def of UPGRADES.filter((u) => !P27_FURNITURE.has(u.id))) {
    while (nextUpgradeCost(state, def.id) !== null) {
      if (!buyUpgrade(state, def.id).ok) throw new Error(`cannot buy ${def.id}`);
    }
  }
  state.events = [];
  const count: Record<TableZone, number> = { indoor: 0, expansion: 0, outdoor: 0 };
  for (const t of state.tables) {
    const zone = tableZone(t.pos);
    t.pos = P18_PLAN.table(zone, count[zone]++);
  }
  return state;
}

/** Layout of a maxed state, with the plants on their P18 spots. */
function p18Layout(state: GameState): ShopLayout {
  const layout = getShopLayout(state);
  let plant = 0;
  for (const d of layout.decor) if (d.kind === 'plant') d.pos = { ...P18_PLAN.plants[plant++]! };
  return layout;
}

function path(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const p = findPath(grid, from, to);
  if (!p) throw new Error(`no path ${from.x},${from.z} → ${to.x},${to.z}`);
  return [{ ...from }, ...p];
}

function customer(id: number, state: Customer['state'], at: Vec2, tableId: number | null): Customer {
  return { id, state, pos: { ...at }, target: { ...at }, patience: 99, maxPatience: 99, order: 'latte', tableId, timer: 0, look: 0 };
}

function staff(id: number, role: StaffRole, task: StaffTask | null): Staff {
  return { id, name: `NV ${id}`, role, wagePerDay: 0, speed: 1, busy: task !== null, task, pos: { x: 0, z: -3 }, look: 0 };
}

const state = maxedState();
const layout = p18Layout(state);
const grid = buildNavGrid(layout);
const spots = floorSpots(layout, grid);

function tableAt(x: number, z: number) {
  const t = layout.tables.find((tb) => tb.pos.x === x && tb.pos.z === z);
  if (!t) throw new Error(`no table at ${x},${z}`);
  return t;
}

/** A customer walks in and sits at the back-left table, past the front row. */
function tableCase(): PlotCase {
  const table = tableAt(-3, 1);
  const chair = { x: table.pos.x - CHAIR_OFFSET, z: table.pos.z };
  const oldSeat = OLD.seat(table.pos, true);
  return {
    slug: 'table',
    title: 'Khách vào chỗ ngồi: xuyên ghế bàn trước → đi vòng',
    ignore: [`table:${table.id}`],
    seated: true,
    before: {
      routes: [[DOOR_POS, oldSeat]],
      spots: [oldSeat],
      labels: [{ at: oldSeat, text: 'ngồi ở mép bàn, lệch ghế', dx: 0, dy: -16, anchor: 'middle' }],
    },
    after: {
      routes: [[...path(grid, DOOR_POS, chair), chair]],
      spots: [chair],
      labels: [{ at: chair, text: 'ngồi đúng ghế', dx: 0, dy: 26, anchor: 'middle' }],
    },
  };
}

/** A full line of six from the counter toward the door. */
function queueCase(): PlotCase {
  const oldLine = Array.from({ length: 6 }, (_, i) => OLD.queueSlot(i));
  const newLine = spots.queue;
  const newRoute: Vec2[] = path(grid, DOOR_POS, newLine[newLine.length - 1]!);
  for (let k = newLine.length - 1; k > 0; k--) newRoute.push(...path(grid, newLine[k]!, newLine[k - 1]!).slice(1));
  return {
    slug: 'queue',
    title: 'Hàng chờ: thẳng x = 0 đè ghế hai bàn giữa → theo lối đi trống',
    ignore: [],
    before: {
      routes: [[DOOR_POS, ...[...oldLine].reverse()]],
      spots: oldLine,
      labels: [{ at: oldLine[5]!, text: 'chỗ 6 kẹt giữa hai ghế', dx: -14, dy: 4, anchor: 'end' }],
    },
    after: {
      routes: [newRoute],
      spots: newLine,
      labels: [{ at: newLine[0]!, text: 'chỗ gọi món', dx: 14, dy: 4 }],
    },
  };
}

/** Six takeaway customers waiting for their drinks. */
function pickupCase(): PlotCase {
  return {
    slug: 'pickup',
    title: 'Khách mang đi: cùng một điểm → mỗi người một ô',
    ignore: [],
    before: {
      routes: [],
      spots: Array.from({ length: 6 }, () => ({ ...OLD.pickup })),
      labels: [{ at: OLD.pickup, text: '6 khách chồng một điểm', dx: 0, dy: -16, anchor: 'middle' }],
    },
    after: {
      routes: [],
      spots: spots.pickup.slice(0, 6),
      labels: [{ at: spots.pickup[5]!, text: '6 ô riêng (tối đa 12)', dx: 14, dy: 16 }],
    },
  };
}

/**
 * The bar at work: one barista taking an order, one brewing, two idle; one
 * server idle and one bringing a drink to a seated customer.
 */
function staffCase(): PlotCase {
  const table = tableAt(-3, 1);
  const chair = { x: table.pos.x - CHAIR_OFFSET, z: table.pos.z };
  const s = maxedState();
  let id = s.nextId;
  const seated = customer(id++, 'waiting', chair, table.id);
  const queued = customer(id++, 'ordering', queueSlot(layout, 0), null);
  s.customers = [seated, queued];
  const order: Order = { id: id++, customerId: seated.id, itemId: 'latte', status: 'ready', remaining: 0, staffId: null };
  s.orders = [order];
  const takeOrder = staff(id++, 'barista', { kind: 'take_order', targetId: queued.id, remaining: 1 });
  const brew = staff(id++, 'barista', { kind: 'brew', targetId: null, remaining: 3 });
  const idleA = staff(id++, 'barista', null);
  const idleB = staff(id++, 'barista', null);
  const serverIdle = staff(id++, 'server', null);
  const serving = staff(id++, 'server', { kind: 'serve', targetId: order.id, remaining: 1 });
  s.staff = [takeOrder, brew, idleA, idleB, serverIdle, serving];
  s.nextId = id;
  const at = staffSpots(s, layout);
  const spot = (m: Staff) => at.get(m.id)!;
  const oldSeat = OLD.seat(table.pos, true);
  return {
    slug: 'staff',
    title: 'Nhân viên: đứng trong quầy, chồng nhau, đè khách → mỗi người một ô trống',
    // The seated customer is drawn on their chair.
    ignore: [`table:${table.id}`],
    before: {
      routes: [[OLD.serverStation, oldSeat]],
      spots: [OLD.counterFront, OLD.machineFront, OLD.baristaStation, OLD.baristaStation, OLD.serverStation, oldSeat, oldSeat],
      labels: [
        { at: OLD.counterFront, text: 'nhận order trong quầy', dx: 14, dy: 22 },
        { at: OLD.baristaStation, text: '2 pha chế chồng nhau', dx: -14, dy: 22, anchor: 'end' },
        { at: oldSeat, text: 'phục vụ đè lên khách', dx: 0, dy: -16, anchor: 'middle' },
      ],
    },
    after: {
      routes: [path(grid, spot(serverIdle), spot(serving))],
      spots: [spot(takeOrder), spot(brew), spot(idleA), spot(idleB), spot(serverIdle), spot(serving), seated.pos],
      labels: [{ at: spot(serving), text: 'phục vụ đứng ô cạnh khách', dx: 0, dy: 26, anchor: 'middle' }],
    },
  };
}

/** A customer who ordered goes out to a patio table. */
function wallCase(): PlotCase {
  const table = tableAt(2.5, 7.8);
  const chair = { x: table.pos.x - CHAIR_OFFSET, z: table.pos.z };
  const oldSeat = OLD.seat(table.pos, true);
  const from = queueSlot(layout, 0);
  return {
    slug: 'wall',
    title: 'Ra bàn ngoài hiên: xuyên tường trước → đi qua cửa',
    ignore: [`table:${table.id}`],
    seated: true,
    before: {
      routes: [[OLD.queueSlot(0), oldSeat]],
      spots: [],
      labels: [{ at: oldSeat, text: 'bàn ngoài hiên', dx: 14, dy: 4 }],
    },
    after: {
      routes: [[...path(grid, from, chair), chair]],
      spots: [],
      labels: [],
    },
  };
}

const CASES: Readonly<Record<string, () => PlotCase>> = { table: tableCase, queue: queueCase, pickup: pickupCase, staff: staffCase, wall: wallCase };

/** Every point of the new side is on free floor; only the last step onto a chair leaves it. */
function expectClear(c: PlotCase): void {
  for (const route of c.after.routes) {
    const walked = c.seated ? route.slice(0, -1) : route;
    const blocked = sample(walked).filter((p) => !isWalkable(grid, p));
    expect(blocked.length, `${c.slug}: new route through blocked cells`).toBe(0);
  }
  expect(bodyHits(layout, c.after, c.ignore).map((h) => h.fp.id), `${c.slug}: new side touches furniture`).toEqual([]);
  expect(stacked(c.after), `${c.slug}: people on top of each other`).toBe(0);
}

describe('collision plots for docs/reports', () => {
  for (const [slug, make] of Object.entries(CASES)) {
    it(`${slug}: the old side collides, the new one does not, and the plot is up to date`, async () => {
      const c = make();
      const old = bodyHits(layout, c.before, c.ignore).length + stacked(c.before);
      expect(old, `${c.slug}: the P17 side should show a collision`).toBeGreaterThan(0);
      expectClear(c);
      await expect(plot(layout, c)).toMatchFileSnapshot(`${REPORT_DIR}/p18-collision-${c.slug}.svg`);
    });
  }
});
