import { describe, expect, it } from 'vitest';
import { ENTER_MINUTES, findSeat, pickOrder, spawnCustomer, updateCustomers } from '../../src/sim/customers';
import { getMenuItem } from '../../src/sim/data/menu';
import { dispatch } from '../../src/sim/index';
import { TASK_MINUTES, updatePlayerTasks } from '../../src/sim/orders';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState, MenuItemId } from '../../src/sim/types';

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
});
