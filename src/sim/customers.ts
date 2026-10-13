import { DIFFICULTIES } from './data/difficulty';
import { getCampaign } from './data/marketing';
import { getMenuItem } from './data/menu';
import { totalUpgradeEffect } from './data/upgrades';
import { canMake } from './inventory';
import { randInt, randRange, weightedIndex, type RngHolder } from './rng';
import type { Customer, GameState, MenuItemId, Table, Vec2, Weather } from './types';

/** Customers per game minute at 3 stars, normal difficulty, outside peak hours. */
export const BASE_ARRIVALS_PER_MINUTE = 0.09;
export const PEAK_MULT = 2.5;
/** Customers standing in line (entering, queueing or ordering) before new arrivals are turned away. */
export const MAX_QUEUE = 6;
/** Minutes a normal-difficulty customer waits in line, and again for the drink, before leaving angry. */
export const BASE_PATIENCE = 40;
export const ENTER_MINUTES = 2;
export const LEAVE_MINUTES = 2;
export const PAY_MINUTES = 1;
export const DRINK_MINUTES: readonly [number, number] = [15, 30];
const WALK_PER_MINUTE = 4;

export const DOOR_POS: Vec2 = { x: 0, z: 6 };
/** Where seatless customers wait for a takeaway drink. */
export const PICKUP_POS: Vec2 = { x: 2.5, z: -1 };

const WEATHER_WEIGHTS: Record<Weather, number> = { sunny: 0.5, rainy: 0.25, hot: 0.25 };
const WEATHER_ARRIVALS: Record<Weather, number> = { sunny: 1, rainy: 0.75, hot: 1.1 };
/** Order weight multiplier for hot and cold items in each weather. */
const WEATHER_TEMPERATURE: Record<Weather, Record<'hot' | 'cold', number>> = {
  sunny: { hot: 1, cold: 1 },
  rainy: { hot: 1.6, cold: 0.6 },
  hot: { hot: 0.5, cold: 1.7 },
};

export function rollWeather(rng: RngHolder): Weather {
  const kinds = Object.keys(WEATHER_WEIGHTS) as Weather[];
  return kinds[weightedIndex(rng, kinds.map((k) => WEATHER_WEIGHTS[k]))] ?? 'sunny';
}

export function queueSlot(index: number): Vec2 {
  return { x: 0, z: -1 + index * 0.8 };
}

function seatPos(table: Table, seatIndex: number): Vec2 {
  return { x: table.pos.x + (seatIndex % 2 === 0 ? -0.5 : 0.5), z: table.pos.z };
}

/** base × rating × marketing × weather × hour × difficulty (× decor appeal), in customers per minute. */
export function arrivalRate(state: GameState): number {
  const rating = Math.max(0.2, state.rating / 3);
  const marketing = state.campaigns
    .filter((c) => c.daysLeft > 0)
    .reduce((m, c) => m * getCampaign(c.id).customerMult, 1);
  const weather = WEATHER_ARRIVALS[state.weather];
  const hour = state.phase === 'peak' ? PEAK_MULT : 1;
  const difficulty = DIFFICULTIES[state.difficulty].customerMult;
  const appeal = 1 + totalUpgradeEffect(state.upgrades).appeal;
  return BASE_ARRIVALS_PER_MINUTE * rating * marketing * weather * hour * difficulty * appeal;
}

/**
 * Picks an item weighted by popularity and weather, among enabled items that
 * are in stock. When every enabled item is out of stock the customer still
 * wants one of them and will leave angry at the counter. Null if the menu is empty.
 */
export function pickOrder(state: GameState): MenuItemId | null {
  const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
  if (enabled.length === 0) return null;
  const inStock = enabled.filter((id) => canMake(state, id));
  const pool = inStock.length > 0 ? inStock : enabled;
  const weights = pool.map((id) => {
    const def = getMenuItem(id);
    return def.popularity * WEATHER_TEMPERATURE[state.weather][def.temperature];
  });
  return pool[weightedIndex(state, weights)] ?? null;
}

function isInLine(c: Customer): boolean {
  return c.state === 'entering' || c.state === 'queueing' || c.state === 'ordering';
}

function isGone(c: Customer): boolean {
  return c.state === 'leaving' || c.state === 'angry_leave';
}

export function totalSeats(state: GameState): number {
  return state.tables.reduce((s, t) => s + t.seats, 0);
}

/** Room for one more customer: the line is short enough and the shop is not full. */
export function canAdmit(state: GameState): boolean {
  const present = state.customers.filter((c) => !isGone(c));
  return present.filter(isInLine).length < MAX_QUEUE && present.length < totalSeats(state) + MAX_QUEUE;
}

/** Brings one customer through the door. Returns null when the menu is empty. */
export function spawnCustomer(state: GameState): Customer | null {
  const order = pickOrder(state);
  if (!order) return null;
  const patience = Math.round(BASE_PATIENCE * DIFFICULTIES[state.difficulty].patienceMult * randRange(state, 0.8, 1.2));
  const customer: Customer = {
    id: state.nextId++,
    state: 'entering',
    pos: { ...DOOR_POS },
    target: queueSlot(state.customers.filter(isInLine).length),
    patience,
    maxPatience: patience,
    order,
    tableId: null,
    timer: ENTER_MINUTES,
    look: randInt(state, 0, 7),
  };
  state.customers.push(customer);
  state.today.customersArrived += 1;
  state.events.push({ type: 'doorbell', customerId: customer.id });
  return customer;
}

/** Adds this minute's arrivals. Arrivals blocked by a full shop wait outside (at most one). */
export function spawnArrivals(state: GameState): void {
  state.spawnAccumulator += arrivalRate(state) * randRange(state, 0.6, 1.4);
  while (state.spawnAccumulator >= 1) {
    if (!canAdmit(state)) {
      state.spawnAccumulator = Math.min(state.spawnAccumulator, 1);
      return;
    }
    if (!spawnCustomer(state)) {
      state.spawnAccumulator = 0;
      return;
    }
    state.spawnAccumulator -= 1;
  }
}

/** A table with a free seat that has been cleaned; dirty tables cannot be used. */
export function findSeat(state: GameState): Table | null {
  return state.tables.find((t) => t.trash === 0 && t.occupants.length < t.seats) ?? null;
}

/** Seats the customer at a clean table if one is free. */
export function seatCustomer(state: GameState, customer: Customer): boolean {
  if (customer.tableId !== null) return true;
  const table = findSeat(state);
  if (!table) return false;
  customer.tableId = table.id;
  customer.target = seatPos(table, table.occupants.length);
  table.occupants.push(customer.id);
  return true;
}

function freeSeat(state: GameState, customer: Customer): void {
  if (customer.tableId === null) return;
  const table = state.tables.find((t) => t.id === customer.tableId);
  if (table) table.occupants = table.occupants.filter((id) => id !== customer.id);
  customer.tableId = null;
}

function startLeaving(state: GameState, customer: Customer, next: 'leaving' | 'angry_leave'): void {
  freeSeat(state, customer);
  customer.state = next;
  customer.timer = LEAVE_MINUTES;
  customer.target = { ...DOOR_POS };
}

/** Customer storms out: drops their orders and the player's tasks for them. */
export function angryLeave(state: GameState, customer: Customer, reason: 'patience' | 'out_of_stock'): void {
  const orderIds = new Set(state.orders.filter((o) => o.customerId === customer.id).map((o) => o.id));
  state.orders = state.orders.filter((o) => !orderIds.has(o.id));
  state.playerTasks = state.playerTasks.filter((t) => {
    if (t.kind === 'take_order') return t.targetId !== customer.id;
    if (t.kind === 'brew' || t.kind === 'serve') return t.targetId === null || !orderIds.has(t.targetId);
    return true;
  });
  startLeaving(state, customer, 'angry_leave');
  state.today.customersLost += 1;
  state.events.push({ type: 'angry', customerId: customer.id });
  if (reason === 'out_of_stock' && customer.order) {
    state.today.outOfStock[customer.order] = (state.today.outOfStock[customer.order] ?? 0) + 1;
    const name = getMenuItem(customer.order).name;
    state.events.push({ type: 'notify', level: 'warning', text: `Hết nguyên liệu làm ${name}, khách bỏ đi` });
  }
}

function sellPrice(state: GameState, itemId: MenuItemId): number {
  return state.menu.find((m) => m.id === itemId)?.price ?? getMenuItem(itemId).price;
}

/**
 * Hands the drink over. Seated customers start drinking; customers without a
 * clean seat take it away and pay at the counter.
 */
export function serveCustomer(state: GameState, customer: Customer, itemId: MenuItemId): void {
  state.today.customersServed += 1;
  state.today.sold[itemId] = (state.today.sold[itemId] ?? 0) + 1;
  state.events.push({ type: 'served', customerId: customer.id, itemId });
  if (seatCustomer(state, customer)) {
    customer.state = 'drinking';
    customer.timer = randInt(state, DRINK_MINUTES[0], DRINK_MINUTES[1]);
    return;
  }
  const price = sellPrice(state, itemId);
  state.money += price;
  state.today.revenue += price;
  state.events.push({ type: 'cash', amount: price, pos: { ...customer.pos } });
  startLeaving(state, customer, 'leaving');
}

/** Drinking done: leaves the money and the dirty cup on the table. */
function payAtTable(state: GameState, customer: Customer): void {
  const table = state.tables.find((t) => t.id === customer.tableId);
  if (table && customer.order) {
    table.cash += sellPrice(state, customer.order);
    table.trash += 1;
  }
  startLeaving(state, customer, 'leaving');
}

function walk(customer: Customer): void {
  const target = customer.target;
  if (!target) return;
  const dx = target.x - customer.pos.x;
  const dz = target.z - customer.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= WALK_PER_MINUTE) {
    customer.pos = { ...target };
  } else {
    customer.pos = { x: customer.pos.x + (dx / dist) * WALK_PER_MINUTE, z: customer.pos.z + (dz / dist) * WALK_PER_MINUTE };
  }
}

/** One game minute for every customer: timers, patience, seating, movement. */
export function updateCustomers(state: GameState): void {
  let lineIndex = 0;
  for (const c of state.customers) {
    switch (c.state) {
      case 'entering':
        c.timer -= 1;
        if (c.timer <= 0) c.state = 'queueing';
        break;
      case 'queueing':
        c.patience -= 1;
        if (c.patience <= 0) angryLeave(state, c, 'patience');
        break;
      case 'ordering':
        break;
      case 'waiting':
        c.patience -= 1;
        if (c.patience <= 0) {
          angryLeave(state, c, 'patience');
          break;
        }
        if (c.tableId === null && !seatCustomer(state, c)) c.target = { ...PICKUP_POS };
        break;
      case 'drinking':
        c.timer -= 1;
        if (c.timer <= 0) {
          c.state = 'paying';
          c.timer = PAY_MINUTES;
        }
        break;
      case 'paying':
        c.timer -= 1;
        if (c.timer <= 0) payAtTable(state, c);
        break;
      case 'leaving':
      case 'angry_leave':
        c.timer -= 1;
        break;
    }
    if (isInLine(c)) c.target = queueSlot(lineIndex++);
    walk(c);
  }
  state.customers = state.customers.filter((c) => !(isGone(c) && c.timer <= 0));
}
