import { describe, expect, it } from 'vitest';
import {
  DOOR_POS,
  ENTER_MINUTES,
  MAX_QUEUE,
  PICKUP_SPOTS,
  findSeat,
  floorSpots,
  pickOrder,
  queueSlot,
  seatCustomer,
  spawnCustomer,
  updateCustomers,
} from '../../src/sim/customers';
import { getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import {
  AGENT_RADIUS,
  CHAIR_OFFSET,
  NAV_CELL,
  buildNavGrid,
  isWalkable,
  layoutFootprints,
  shapeDistance,
} from '../../src/sim/nav';
import { TASK_MINUTES, updatePlayerTasks } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState, MenuItemId, UpgradeId, Vec2 } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, type ShopLayout } from '../../src/sim/upgrades';

/** An open shop serving only `item`, with random arrivals left out. */
function openShopWith(item: MenuItemId): GameState {
  const s = createNewGame('Quán Test', 'normal', 42);
  for (const m of s.menu) m.enabled = m.id === item;
  dispatch(s, { type: 'start_day' });
  s.events = [];
  return s;
}

/** Runs customers and player work for `minutes` without the clock spawning anyone. */
function advance(s: GameState, minutes: number): void {
  for (let i = 0; i < minutes; i++) {
    updatePlayerTasks(s);
    updateCustomers(s);
  }
}

function setStock(s: GameState, id: string, qty: number): void {
  const item = s.inventory.find((i) => i.id === id);
  if (item) item.qty = qty;
}

function arrive(s: GameState): Customer {
  const c = spawnCustomer(s);
  if (!c) throw new Error('no customer');
  advance(s, ENTER_MINUTES);
  expect(c.state).toBe('queueing');
  return c;
}

/** Takes the order, brews and delivers it. */
function serve(s: GameState, c: Customer): void {
  expect(dispatch(s, { type: 'take_order', customerId: c.id })).toBe(true);
  advance(s, TASK_MINUTES.take_order);
  expect(c.state).toBe('waiting');
  const order = s.orders.find((o) => o.customerId === c.id)!;
  expect(dispatch(s, { type: 'brew', orderId: order.id })).toBe(true);
  expect(dispatch(s, { type: 'deliver', orderId: order.id })).toBe(true);
  advance(s, getMenuItem(order.itemId).prepMinutes + TASK_MINUTES.serve);
}

describe('customer orders', () => {
  it('only picks enabled items that are in stock', () => {
    const s = createNewGame('A', 'normal', 7);
    for (const m of s.menu) m.enabled = m.id === 'latte' || m.id === 'espresso';
    setStock(s, 'milk', 0);
    for (let i = 0; i < 50; i++) expect(pickOrder(s)).toBe('espresso');
    for (const m of s.menu) m.enabled = false;
    expect(pickOrder(s)).toBeNull();
    expect(spawnCustomer(s)).toBeNull();
  });

  it('leaves angry when the wanted item runs out before ordering', () => {
    const s = openShopWith('latte');
    const c = arrive(s);
    expect(c.order).toBe('latte');
    setStock(s, 'milk', 0);
    expect(dispatch(s, { type: 'take_order', customerId: c.id })).toBe(true);
    advance(s, TASK_MINUTES.take_order);
    expect(c.state).toBe('angry_leave');
    expect(s.orders).toEqual([]);
    expect(s.today.outOfStock.latte).toBe(1);
    expect(s.today.customersLost).toBe(1);
    expect(s.events).toContainEqual({ type: 'angry', customerId: c.id });
    expect(s.events.some((e) => e.type === 'notify' && e.level === 'warning')).toBe(true);
  });

  it('consumes ingredients when the order is taken', () => {
    const s = openShopWith('espresso');
    const before = s.inventory.find((i) => i.id === 'coffee_beans')!.qty;
    const c = arrive(s);
    dispatch(s, { type: 'take_order', customerId: c.id });
    advance(s, TASK_MINUTES.take_order);
    expect(s.inventory.find((i) => i.id === 'coffee_beans')!.qty).toBe(before - 18);
    expect(s.orders[0]).toMatchObject({ customerId: c.id, itemId: 'espresso', status: 'pending' });
  });
});

describe('customer patience', () => {
  it('leaves angry after waiting in line too long', () => {
    const s = openShopWith('espresso');
    const c = arrive(s);
    advance(s, c.maxPatience - 1);
    expect(c.state).toBe('queueing');
    advance(s, 1);
    expect(c.state).toBe('angry_leave');
    expect(s.today.customersLost).toBe(1);
    expect(s.events).toContainEqual({ type: 'angry', customerId: c.id });
    expect(dispatch(s, { type: 'take_order', customerId: c.id })).toBe(false);
    advance(s, 5);
    expect(s.customers).toEqual([]);
  });

  it('leaves angry when the drink never comes and drops its order and tasks', () => {
    const s = openShopWith('espresso');
    const c = arrive(s);
    dispatch(s, { type: 'take_order', customerId: c.id });
    advance(s, TASK_MINUTES.take_order);
    const order = s.orders[0]!;
    // Something else blocks the player, so the brew never starts.
    s.tables[0]!.trash = 1;
    s.playerTasks.unshift({ kind: 'clean', targetId: s.tables[0]!.id, remaining: 1000 });
    dispatch(s, { type: 'brew', orderId: order.id });
    advance(s, c.maxPatience);
    expect(c.state).toBe('angry_leave');
    expect(c.tableId).toBeNull();
    expect(s.orders).toEqual([]);
    expect(s.playerTasks.map((t) => t.kind)).toEqual(['clean']);
    expect(s.tables.every((t) => t.occupants.length === 0)).toBe(true);
  });
});

describe('tables', () => {
  it('does not seat customers at dirty tables', () => {
    const s = openShopWith('espresso');
    for (const t of s.tables) t.trash = 1;
    expect(findSeat(s)).toBeNull();

    const c = arrive(s);
    const money = s.money;
    serve(s, c);
    // No clean seat: takes the drink away and pays at the counter.
    expect(c.tableId).toBeNull();
    expect(c.state).toBe('leaving');
    expect(s.tables.every((t) => t.occupants.length === 0)).toBe(true);
    expect(s.money).toBe(money + 25000);
    expect(s.today.customersServed).toBe(1);

    const table = s.tables[1]!;
    expect(dispatch(s, { type: 'clean_table', tableId: table.id })).toBe(true);
    advance(s, 2);
    expect(table.trash).toBe(0);
    expect(s.events).toContainEqual({ type: 'cleaned', tableId: table.id });
    expect(findSeat(s)?.id).toBe(table.id);

    const d = arrive(s);
    serve(s, d);
    expect(d.tableId).toBe(table.id);
    expect(d.state).toBe('drinking');
  });

  it('leaves cash and trash on the table after drinking', () => {
    const s = openShopWith('espresso');
    const c = arrive(s);
    serve(s, c);
    const table = s.tables.find((t) => t.id === c.tableId)!;
    expect(c.state).toBe('drinking');
    advance(s, c.timer + 1);
    expect(c.state).toBe('leaving');
    expect(table.cash).toBe(25000);
    expect(table.trash).toBe(1);
    expect(table.occupants).toEqual([]);

    const money = s.money;
    expect(dispatch(s, { type: 'collect_cash', tableId: table.id })).toBe(true);
    expect(dispatch(s, { type: 'collect_cash', tableId: table.id })).toBe(false);
    advance(s, 1);
    expect(s.money).toBe(money + 25000);
    expect(s.today.revenue).toBe(25000);
    expect(table.cash).toBe(0);
  });

  it('seats customers on the chairs the renderer draws, one per side', () => {
    const s = openShopWith('espresso');
    const table = s.tables[0]!;
    const [a, b] = [arrive(s), arrive(s)];
    expect(seatCustomer(s, a) && seatCustomer(s, b)).toBe(true);
    expect([a.target, b.target]).toEqual([
      { x: table.pos.x - CHAIR_OFFSET, z: table.pos.z },
      { x: table.pos.x + CHAIR_OFFSET, z: table.pos.z },
    ]);
    // a leaves and b stays: the next customer takes the free left chair, not b's.
    b.state = 'drinking';
    b.timer = 99;
    table.occupants = [b.id];
    s.customers = s.customers.filter((x) => x !== a);
    const c = arrive(s);
    expect(seatCustomer(s, c)).toBe(true);
    expect(c.target).toEqual({ x: table.pos.x - CHAIR_OFFSET, z: table.pos.z });
  });
});

/** A game in preparation with these upgrades bought. */
function gameWith(levels: Partial<Record<UpgradeId, number>>): GameState {
  const s = createNewGame('Quán Test', 'normal', 42);
  s.money = 1e15;
  for (const [id, n] of Object.entries(levels) as [UpgradeId, number][]) {
    for (let i = 0; i < n; i++) expect(buyUpgrade(s, id).ok).toBe(true);
  }
  return s;
}

/** Every upgrade at its last level: the most crowded floor. */
const FULL: Partial<Record<UpgradeId, number>> = {
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

/** Asserts that p is free floor, at least a body's width from every footprint. */
function expectClear(layout: ShopLayout, p: Vec2): void {
  expect(isWalkable(buildNavGrid(layout), p), `${p.x},${p.z}`).toBe(true);
  for (const f of layoutFootprints(layout)) {
    expect(shapeDistance(f.shape, p.x, p.z), `${f.id} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(AGENT_RADIUS - 1e-9);
  }
}

/** Asserts that no two spots are closer than two nav cells. */
function expectApart(spots: Vec2[]): void {
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i]!;
      const b = spots[j]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${i} and ${j}`).toBeGreaterThanOrEqual(2 * NAV_CELL - 1e-9);
    }
  }
}

describe('standing spots and walking', () => {
  for (const [name, levels] of [
    ['a new shop', {}],
    ['a long counter', { big_counter: 2 }],
    ['every upgrade', FULL],
  ] as const) {
    it(`lines six customers up clear of the chairs in ${name}`, () => {
      const layout = getShopLayout(gameWith(levels));
      const { queue } = floorSpots(layout);
      expect(queue).toHaveLength(MAX_QUEUE);
      for (const p of queue) expectClear(layout, p);
      expectApart(queue);
      // The first spot is in front of the counter, the rest follow one another along the walkway.
      const c = layout.counter;
      expect(Math.abs(queue[0]!.x - c.pos.x)).toBeLessThanOrEqual(NAV_CELL);
      expect(queue[0]!.z).toBeGreaterThan(c.pos.z);
      for (let k = 1; k < queue.length; k++) {
        const [a, b] = [queue[k - 1]!, queue[k]!];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThanOrEqual(0.8 + 2 * NAV_CELL);
      }
    });
  }

  it('no longer stands the line on the chairs of the middle tables', () => {
    const layout = getShopLayout(gameWith({ tables: 6 }));
    const grid = buildNavGrid(layout);
    // The line runs down x = 0, which is now the main aisle between the two blocks of tables.
    const aisleLine = Array.from({ length: MAX_QUEUE }, (_, i) => ({ x: 0, z: -1 + i * 0.8 }));
    expect(aisleLine.every((p) => isWalkable(grid, p) && layoutFootprints(layout).every((f) => shapeDistance(f.shape, p.x, p.z) >= AGENT_RADIUS))).toBe(true);
    for (let i = 0; i < MAX_QUEUE; i++) expectClear(layout, queueSlot(layout, i));
  });

  it('walks a full line from the door to its spots without entering furniture', () => {
    const s = gameWith({ tables: 6 });
    for (const m of s.menu) m.enabled = m.id === 'espresso';
    dispatch(s, { type: 'start_day' });
    const layout = getShopLayout(s);
    const grid = buildNavGrid(layout);
    for (let i = 0; i < MAX_QUEUE; i++) expect(spawnCustomer(s)).not.toBeNull();
    for (let minute = 0; minute < 20; minute++) {
      updateCustomers(s);
      for (const c of s.customers) {
        expect(c.state === 'entering' || c.state === 'queueing', c.state).toBe(true);
        expect(isWalkable(grid, c.pos), `${c.id} at ${c.pos.x},${c.pos.z}`).toBe(true);
      }
    }
    const { queue } = floorSpots(layout);
    expect(s.customers.map((c) => c.pos)).toEqual(queue);
  });

  it('gives four takeaway customers four separate spots by the counter', () => {
    const s = openShopWith('espresso');
    for (const t of s.tables) t.trash = 1;
    const layout = getShopLayout(s);
    const grid = buildNavGrid(layout);
    const crowd = Array.from({ length: 4 }, () => arrive(s));
    for (const c of crowd) c.state = 'waiting';
    for (let minute = 0; minute < 10; minute++) updateCustomers(s);
    const { pickup, queue } = floorSpots(layout);
    const targets = crowd.map((c) => c.target!);
    expect(targets).toEqual(pickup.slice(0, 4));
    for (const p of targets) expectClear(layout, p);
    expectApart([...targets, ...queue]);
    expect(crowd.map((c) => c.pos)).toEqual(targets);
    for (const c of crowd) {
      expect(isWalkable(grid, c.pos)).toBe(true);
      expect(Math.hypot(c.pos.x - layout.pickup.x, c.pos.z - layout.pickup.z)).toBeLessThan(1.5);
    }

    // Spots are kept: when the first one is served, nobody else moves.
    crowd[0]!.state = 'leaving';
    crowd[0]!.timer = 1;
    updateCustomers(s);
    expect(crowd.slice(1).map((c) => c.target)).toEqual(targets.slice(1));
  });

  /** `count` takeaway customers waiting at once from the door, walked for a while; returns them. */
  function takeawayCrowd(s: GameState, count: number): Customer[] {
    for (const t of s.tables) t.trash = 1;
    const grid = buildNavGrid(getShopLayout(s));
    const crowd = Array.from({ length: count }, (_, k): Customer => {
      const c: Customer = {
        id: s.nextId++,
        state: 'waiting',
        pos: { ...DOOR_POS },
        target: null,
        patience: 999,
        maxPatience: 999,
        order: 'espresso',
        tableId: null,
        timer: 0,
        look: k % 8,
      };
      s.customers.push(c);
      return c;
    });
    for (let minute = 0; minute < 15; minute++) {
      updateCustomers(s);
      for (const c of crowd) expect(isWalkable(grid, c.pos), `${c.id} at ${c.pos.x},${c.pos.z}`).toBe(true);
    }
    return crowd;
  }

  for (const [name, levels] of [
    ['a new shop', {}],
    ['every upgrade', FULL],
  ] as const) {
    it(`gives 13 to 20 takeaway customers a spot each, past the mat's ${PICKUP_SPOTS}, in ${name}`, () => {
      for (let count = PICKUP_SPOTS + 1; count <= 20; count++) {
        const s = gameWith(levels);
        for (const m of s.menu) m.enabled = m.id === 'espresso';
        dispatch(s, { type: 'start_day' });
        const layout = getShopLayout(s);
        const spots = floorSpots(layout);
        const crowd = takeawayCrowd(s, count);
        const targets = crowd.map((c) => c.target!);
        // The mat first, then the aisle by the door, then the sidewalk, in customer order.
        expect(targets).toEqual(spots.takeaway.slice(0, count));
        expect(spots.takeaway.slice(0, PICKUP_SPOTS)).toEqual(spots.pickup);
        expect(crowd.map((c) => c.pos)).toEqual(targets);
        const cells = new Set(targets.map((p) => `${p.x},${p.z}`));
        expect(cells.size, `${count} customers`).toBe(count);
        for (const p of targets) expectClear(layout, p);
        expectApart([...targets, ...spots.queue]);
      }
    });
  }

  it('places the overflow in the aisle by the door, then on the sidewalk, for every customer the shop admits', () => {
    for (const levels of [{}, FULL]) {
      const layout = getShopLayout(gameWith(levels));
      const { overflow } = floorSpots(layout);
      expect(PICKUP_SPOTS + overflow.length).toBeGreaterThanOrEqual(layout.totalSeats + MAX_QUEUE);
      expect(overflow.length).toBeGreaterThanOrEqual(8);
      for (const p of overflow.slice(0, 4)) {
        expect(p.z).toBeLessThan(layout.indoor.maxZ - 0.5);
        expect(Math.hypot(p.x - layout.door.x, p.z - layout.indoor.maxZ)).toBeLessThan(3);
      }
      // Then out on the sidewalk, spreading from in front of the door.
      expect(overflow[4]!.z).toBeGreaterThan(layout.indoor.maxZ + 0.5);
      expect(overflow.slice(4, 8).every((p) => p.z > layout.indoor.maxZ)).toBe(true);
      // The doorway stays clear.
      for (const p of overflow) expect(Math.abs(p.x - layout.door.x) > 1 || Math.abs(p.z - layout.indoor.maxZ) > 0.5, `${p.x},${p.z}`).toBe(true);
    }
  });

  it('still gives everyone a spot of their own when more wait than the shop admits', () => {
    const s = openShopWith('espresso');
    const layout = getShopLayout(s);
    const all = floorSpots(layout).takeaway.length;
    const crowd = takeawayCrowd(s, all + 4);
    const targets = crowd.map((c) => c.target!);
    expect(new Set(targets.map((p) => `${p.x},${p.z}`)).size).toBe(crowd.length);
    expectApart([...targets, ...floorSpots(layout).queue]);
  });

  it('works the spots out once per floor plan', () => {
    const a = floorSpots(getShopLayout(gameWith(FULL)));
    expect(floorSpots(getShopLayout(gameWith(FULL)))).toBe(a);
    expect(floorSpots(getShopLayout(gameWith({ ...FULL, plants: 2 })))).not.toBe(a);
  });
});
