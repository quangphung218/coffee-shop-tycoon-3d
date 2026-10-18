import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { getMenuItem } from '../../src/sim/data/menu';
import { spawnCustomer } from '../../src/sim/customers';
import { dispatch } from '../../src/sim/index';
import {
  SPECIAL_ORDER_DEADLINES,
  SPECIAL_ORDER_MONEY,
  VIP_DAY_CHANCE,
  VIP_FROM_MINUTE,
  VIP_TICKETS,
  endOfDaySpecialOrder,
  isVipDay,
  onServed,
  startDaySpecialOrder,
  tickSpecialOrders,
} from '../../src/sim/specialOrders';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, GameEvent, GameState, SpecialOrder } from '../../src/sim/types';
import { runOpenDay } from '../integration/helpers';

/** A new game moved to `day`, still in preparation. */
function gameOnDay(day: number, seed = 7): GameState {
  const s = createNewGame('Quán Đơn', 'normal', seed);
  s.day = day;
  s.today.day = day;
  return s;
}

function openOnDay(day: number, seed = 7): GameState {
  const s = gameOnDay(day, seed);
  expect(dispatch(s, { type: 'start_day' })).toBe(true);
  return s;
}

function activeOrder(s: GameState): SpecialOrder {
  const order = s.specialOrder;
  if (!order) throw new Error('no special order');
  return order;
}

function eventsOf<T extends GameEvent['type']>(s: GameState, type: T): Extract<GameEvent, { type: T }>[] {
  return s.events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** First seed whose `day` is (or is not) a VIP day. */
function seedWithVip(day: number, vip: boolean): number {
  for (let seed = 1; seed < 1000; seed++) if (isVipDay(seed, day) === vip) return seed;
  throw new Error('no seed found');
}

/** A customer in the shop ready to be handed `itemId`. */
function addCustomer(s: GameState, itemId: GameState['menu'][number]['id']): number {
  const c = spawnCustomer(s);
  if (!c) throw new Error('empty menu');
  c.order = itemId;
  delete c.extraItem;
  return c.id;
}

describe('special order', () => {
  it('has none on day 1', () => {
    const s = openOnDay(1);
    expect(s.specialOrder).toBeUndefined();
  });

  it('is the same for the same seed and day, and never draws from rngState', () => {
    const a = gameOnDay(4, 11);
    const b = gameOnDay(4, 11);
    const rngBefore = a.rngState;
    startDaySpecialOrder(a);
    startDaySpecialOrder(b);
    expect(a.specialOrder).toEqual(b.specialOrder);
    expect(a.rngState).toBe(rngBefore);
  });

  it('sets target, deadline and reward from the shop level and difficulty', () => {
    const s = gameOnDay(3);
    s.shopLevel = 5;
    s.difficulty = 'hard';
    startDaySpecialOrder(s);
    const order = activeOrder(s);
    expect(order.target).toBe(3 + 2);
    expect(SPECIAL_ORDER_DEADLINES).toContain(order.byMinute);
    expect(order.rewardTickets).toBe(2);
    expect(order.rewardMoney).toBe(Math.round(SPECIAL_ORDER_MONEY * DIFFICULTIES.hard.priceMult));
    expect(order).toMatchObject({ progress: 0, status: 'active' });
  });

  it('uses both deadlines and several items across days', () => {
    const deadlines = new Set<number>();
    const items = new Set<string>();
    for (let day = 2; day < 40; day++) {
      const s = gameOnDay(day);
      startDaySpecialOrder(s);
      deadlines.add(activeOrder(s).byMinute);
      items.add(activeOrder(s).itemId);
    }
    expect([...deadlines].sort((a, b) => a - b)).toEqual([13 * 60, 19 * 60]);
    expect(items.size).toBeGreaterThan(1);
  });

  it('never picks a disabled item or one out of stock', () => {
    for (let day = 2; day < 40; day++) {
      const s = gameOnDay(day);
      const enabled = s.menu.filter((m) => m.enabled);
      enabled[0]!.enabled = false;
      const empty = getMenuItem(enabled[1]!.id).ingredients[0]!.id;
      for (const inv of s.inventory) if (inv.id === empty) inv.qty = 0;
      startDaySpecialOrder(s);
      const order = s.specialOrder;
      if (!order) continue;
      expect(order.itemId).not.toBe(enabled[0]!.id);
      expect(s.menu.find((m) => m.id === order.itemId)?.enabled).toBe(true);
      expect(getMenuItem(order.itemId).ingredients.some((n) => n.id === empty)).toBe(false);
    }
  });

  it('is null when no enabled item can be made', () => {
    const s = gameOnDay(5);
    for (const inv of s.inventory) inv.qty = 0;
    startDaySpecialOrder(s);
    expect(s.specialOrder).toBeNull();

    const t = gameOnDay(5);
    for (const m of t.menu) m.enabled = false;
    startDaySpecialOrder(t);
    expect(t.specialOrder).toBeNull();
  });

  it('completes on target: pays tickets and money once, and lands in the report', () => {
    const s = openOnDay(3);
    const order = activeOrder(s);
    const other = s.menu.find((m) => m.enabled && m.id !== order.itemId)!.id;
    s.minute = order.byMinute - 30;
    s.events = [];
    const money = s.money;
    onServed(s, other, addCustomer(s, other));
    expect(order.progress).toBe(0);
    for (let k = 0; k < order.target; k++) onServed(s, order.itemId, addCustomer(s, order.itemId));
    expect(order.status).toBe('completed');
    expect(order.progress).toBe(order.target);
    onServed(s, order.itemId, addCustomer(s, order.itemId));
    expect(order.progress).toBe(order.target);
    expect(s.money).toBe(money + order.rewardMoney);
    expect(s.retention?.tickets).toBe(2);
    expect(eventsOf(s, 'special_order')).toEqual([{ type: 'special_order', status: 'completed', itemId: order.itemId }]);
    expect(eventsOf(s, 'tickets_earned')).toEqual([{ type: 'tickets_earned', amount: 2, total: 2, reason: 'special_order' }]);
    tickSpecialOrders(s);
    expect(order.status).toBe('completed');

    const report = {} as DailyReport;
    endOfDaySpecialOrder(s, report);
    expect(report.specialOrder).toEqual({ ...order });
    expect(s.specialOrder).toBeNull();
  });

  it('fails once the deadline passes and stops counting after it', () => {
    const s = openOnDay(3);
    const order = activeOrder(s);
    s.events = [];
    s.minute = order.byMinute;
    onServed(s, order.itemId, addCustomer(s, order.itemId));
    tickSpecialOrders(s);
    expect(order).toMatchObject({ progress: 1, status: 'active' });
    s.minute = order.byMinute + 1;
    tickSpecialOrders(s);
    tickSpecialOrders(s);
    expect(order.status).toBe('failed');
    for (let k = 0; k < order.target; k++) onServed(s, order.itemId, addCustomer(s, order.itemId));
    expect(order.progress).toBe(1);
    expect(eventsOf(s, 'special_order')).toEqual([{ type: 'special_order', status: 'failed', itemId: order.itemId }]);
    expect(s.retention?.tickets ?? 0).toBe(0);

    const report = {} as DailyReport;
    endOfDaySpecialOrder(s, report);
    expect(report.specialOrder?.status).toBe('failed');
  });

  it('leaves the report without a special order when there was none', () => {
    const s = openOnDay(1);
    const report = {} as DailyReport;
    endOfDaySpecialOrder(s, report);
    expect(report.specialOrder).toBeUndefined();
    expect(s.specialOrder).toBeNull();
  });

  it('settles into lastReport over a played day', () => {
    const s = openOnDay(2);
    const order = activeOrder(s);
    runOpenDay(s);
    expect(s.phase).toBe('report');
    expect(s.lastReport?.specialOrder?.itemId).toBe(order.itemId);
    expect(['completed', 'failed']).toContain(s.lastReport?.specialOrder?.status);
    expect(s.specialOrder).toBeNull();
  });

  it('does not change the RNG draws of a played day', () => {
    const withOrder = openOnDay(3, 21);
    const without = openOnDay(3, 21);
    without.specialOrder = null;
    runOpenDay(withOrder);
    runOpenDay(without);
    expect(withOrder.rngState).toBe(without.rngState);
  });
});

describe('VIP customer', () => {
  it('visits about VIP_DAY_CHANCE of the days, never before day 3', () => {
    expect(isVipDay(1, 1)).toBe(false);
    for (let seed = 1; seed < 50; seed++) {
      expect(isVipDay(seed, 1)).toBe(false);
      expect(isVipDay(seed, 2)).toBe(false);
    }
    let vipDays = 0;
    const days = 2000;
    for (let day = 3; day < 3 + days; day++) if (isVipDay(5, day)) vipDays++;
    expect(vipDays / days).toBeGreaterThan(VIP_DAY_CHANCE - 0.05);
    expect(vipDays / days).toBeLessThan(VIP_DAY_CHANCE + 0.05);
  });

  it('flags only the first arrival from 10:00 on a VIP day', () => {
    const s = openOnDay(4, seedWithVip(4, true));
    s.minute = VIP_FROM_MINUTE - 1;
    expect(spawnCustomer(s)?.vip).toBeUndefined();
    s.minute = VIP_FROM_MINUTE;
    s.events = [];
    const vip = spawnCustomer(s)!;
    expect(vip.vip).toBe(true);
    expect(eventsOf(s, 'vip_arrived')).toEqual([{ type: 'vip_arrived', customerId: vip.id }]);
    s.minute = 15 * 60;
    expect(spawnCustomer(s)?.vip).toBeUndefined();
  });

  it('has one VIP at most over a played day, and none on other days', () => {
    const seed = seedWithVip(4, true);
    const s = openOnDay(4, seed);
    const vips = new Set<number>();
    const events = runOpenDay(s, { onMinute: (st) => st.customers.forEach((c) => c.vip && vips.add(c.id)) });
    expect(vips.size).toBe(1);
    expect(events.filter((e) => e.type === 'vip_arrived')).toHaveLength(1);

    const quiet = openOnDay(4, seedWithVip(4, false));
    const quietEvents = runOpenDay(quiet, { onMinute: (st) => expect(st.customers.some((c) => c.vip)).toBe(false) });
    expect(quietEvents.some((e) => e.type === 'vip_arrived')).toBe(false);
  });

  it('draws the same RNG as a normal customer and has 0.8 of the patience', () => {
    const seed = seedWithVip(4, true);
    const vipShop = openOnDay(4, seed);
    const normalShop = openOnDay(4, seed);
    vipShop.minute = VIP_FROM_MINUTE;
    normalShop.minute = VIP_FROM_MINUTE;
    normalShop.today.arrivalsByHour![10] = 1;
    const vip = spawnCustomer(vipShop)!;
    const normal = spawnCustomer(normalShop)!;
    expect(vip.vip).toBe(true);
    expect(normal.vip).toBeUndefined();
    expect(vipShop.rngState).toBe(normalShop.rngState);
    expect(vipShop.nextId).toBe(normalShop.nextId);
    expect(vip.order).toBe(normal.order);
    expect(vip.look).toBe(normal.look);
    expect(vip.patience).toBeLessThan(normal.patience);
    expect(Math.abs(vip.patience - normal.patience * 0.8)).toBeLessThanOrEqual(1);
  });

  it('pays VIP_TICKETS when served and nothing for other customers', () => {
    const s = openOnDay(4, seedWithVip(4, true));
    s.specialOrder = null;
    s.minute = VIP_FROM_MINUTE;
    const vip = spawnCustomer(s)!;
    const other = spawnCustomer(s)!;
    s.events = [];
    onServed(s, other.order!, other.id);
    expect(s.retention?.tickets ?? 0).toBe(0);
    onServed(s, vip.order!, vip.id);
    expect(s.retention?.tickets).toBe(VIP_TICKETS);
    expect(eventsOf(s, 'tickets_earned')).toEqual([{ type: 'tickets_earned', amount: VIP_TICKETS, total: VIP_TICKETS, reason: 'vip' }]);
  });

  it('pays nothing when the VIP leaves unserved', () => {
    const s = openOnDay(4, seedWithVip(4, true));
    s.minute = VIP_FROM_MINUTE;
    const vip = spawnCustomer(s)!;
    s.customers = [vip];
    const events = runOpenDay(s, { play: false });
    expect(events.some((e) => e.type === 'angry' && e.customerId === vip.id)).toBe(true);
    expect(events.some((e) => e.type === 'tickets_earned' && e.reason === 'vip')).toBe(false);
  });
});
