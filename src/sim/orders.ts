import { isOpen } from './clock';
import { angryLeave, seatCustomer, serveCustomer } from './customers';
import { getMenuItem } from './data/menu';
import { totalUpgradeEffect } from './data/upgrades';
import { canMake, consume } from './inventory';
import type { GameState, MenuItemId, Order, StaffTask, StaffTaskKind } from './types';

/** Game minutes the player spends on each kind of task (brewing depends on the item). */
export const TASK_MINUTES = {
  take_order: 1,
  serve: 1,
  collect: 1,
  clean: 2,
} as const;

export function brewMinutes(state: GameState, itemId: MenuItemId): number {
  const speed = 1 + totalUpgradeEffect(state.upgrades).brewSpeed;
  return Math.max(1, Math.round(getMenuItem(itemId).prepMinutes / speed));
}

function hasTask(state: GameState, kind: StaffTaskKind, targetId: number): boolean {
  return state.playerTasks.some((t) => t.kind === kind && t.targetId === targetId);
}

function enqueue(state: GameState, kind: StaffTaskKind, targetId: number, remaining: number): boolean {
  if (!isOpen(state) || hasTask(state, kind, targetId)) return false;
  state.playerTasks.push({ kind, targetId, remaining });
  return true;
}

function findOrder(state: GameState, orderId: number | null): Order | undefined {
  return state.orders.find((o) => o.id === orderId);
}

/** Queues taking the order of a customer standing in line. */
export function takeOrder(state: GameState, customerId: number): boolean {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer || customer.state !== 'queueing') return false;
  return enqueue(state, 'take_order', customerId, TASK_MINUTES.take_order);
}

/** Queues preparing a pending order. */
export function brew(state: GameState, orderId: number): boolean {
  const order = findOrder(state, orderId);
  if (!order || order.status !== 'pending') return false;
  return enqueue(state, 'brew', orderId, order.remaining);
}

/** Queues carrying an order to its customer; it must be ready by the time the task starts. */
export function deliver(state: GameState, orderId: number): boolean {
  const order = findOrder(state, orderId);
  if (!order || order.status === 'delivered') return false;
  return enqueue(state, 'serve', orderId, TASK_MINUTES.serve);
}

/** Queues picking up the money left on a table. */
export function collectCash(state: GameState, tableId: number): boolean {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table || table.cash <= 0) return false;
  return enqueue(state, 'collect', tableId, TASK_MINUTES.collect);
}

/** Queues clearing the cups off a table so new customers can sit there. */
export function cleanTable(state: GameState, tableId: number): boolean {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table || table.trash <= 0) return false;
  return enqueue(state, 'clean', tableId, TASK_MINUTES.clean);
}

/** Checks the task can still be done and applies its start effects. False drops the task. */
function beginTask(state: GameState, task: StaffTask): boolean {
  switch (task.kind) {
    case 'take_order': {
      const customer = state.customers.find((c) => c.id === task.targetId);
      if (!customer || (customer.state !== 'queueing' && customer.state !== 'ordering')) return false;
      customer.state = 'ordering';
      return true;
    }
    case 'brew': {
      const order = findOrder(state, task.targetId);
      if (!order || (order.status !== 'pending' && order.status !== 'brewing')) return false;
      if (order.status === 'pending') {
        order.status = 'brewing';
        state.events.push({ type: 'brew', staffId: null, itemId: order.itemId });
      }
      return true;
    }
    case 'serve': {
      const order = findOrder(state, task.targetId);
      if (!order) return false;
      if (order.status !== 'ready') {
        state.events.push({ type: 'notify', level: 'warning', text: `${getMenuItem(order.itemId).name} chưa pha xong` });
        return false;
      }
      return true;
    }
    case 'collect':
      return (state.tables.find((t) => t.id === task.targetId)?.cash ?? 0) > 0;
    case 'clean':
      return (state.tables.find((t) => t.id === task.targetId)?.trash ?? 0) > 0;
    default:
      return false;
  }
}

function finishTask(state: GameState, task: StaffTask): void {
  switch (task.kind) {
    case 'take_order': {
      const customer = state.customers.find((c) => c.id === task.targetId);
      if (!customer?.order) return;
      if (!canMake(state, customer.order)) {
        angryLeave(state, customer, 'out_of_stock');
        return;
      }
      consume(state, customer.order);
      state.orders.push({
        id: state.nextId++,
        customerId: customer.id,
        itemId: customer.order,
        status: 'pending',
        remaining: brewMinutes(state, customer.order),
        staffId: null,
      });
      customer.state = 'waiting';
      customer.patience = customer.maxPatience;
      seatCustomer(state, customer);
      return;
    }
    case 'brew': {
      const order = findOrder(state, task.targetId);
      if (!order) return;
      order.status = 'ready';
      order.remaining = 0;
      return;
    }
    case 'serve': {
      const order = findOrder(state, task.targetId);
      if (!order) return;
      order.status = 'delivered';
      state.orders = state.orders.filter((o) => o.id !== order.id);
      const customer = state.customers.find((c) => c.id === order.customerId);
      if (customer) serveCustomer(state, customer, order.itemId);
      return;
    }
    case 'collect': {
      const table = state.tables.find((t) => t.id === task.targetId);
      if (!table) return;
      state.money += table.cash;
      state.today.revenue += table.cash;
      state.events.push({ type: 'cash', amount: table.cash, pos: { ...table.pos } });
      table.cash = 0;
      return;
    }
    case 'clean': {
      const table = state.tables.find((t) => t.id === task.targetId);
      if (!table) return;
      table.trash = 0;
      state.events.push({ type: 'cleaned', tableId: table.id });
      return;
    }
    default:
      return;
  }
}

/** One game minute of player work on the head of the task queue. Invalid tasks are skipped. */
export function updatePlayerTasks(state: GameState): void {
  while (state.playerTasks.length > 0) {
    const task = state.playerTasks[0]!;
    if (!beginTask(state, task)) {
      state.playerTasks.shift();
      continue;
    }
    task.remaining -= 1;
    if (task.kind === 'brew') {
      const order = findOrder(state, task.targetId);
      if (order) order.remaining = Math.max(0, task.remaining);
    }
    if (task.remaining <= 0) {
      state.playerTasks.shift();
      finishTask(state, task);
    }
    return;
  }
}
