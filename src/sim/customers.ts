import { DIFFICULTIES } from './data/difficulty';
import { getMenuItem } from './data/menu';
import { PERSONAS, addOnPick, addOnRoll, pickPersona, type Persona } from './data/personas';
import { totalUpgradeEffect } from './data/upgrades';
import { hourOf, recordRevenue } from './economy';
import { canMake, consume, servingCost } from './inventory';
import { customerMultiplier } from './marketing';
import {
  CHAIR_OFFSET,
  DOOR_WIDTH,
  NAV_CELL,
  WALL_THICKNESS,
  buildNavGrid,
  cellAt,
  cellCenter,
  findPath,
  nearestFree,
  walkToward,
  type NavGrid,
} from './nav';
import { priceArrivalMult, sellPriceMult } from './policies';
import { randInt, randRange, weightedIndex, type RngHolder } from './rng';
import type { Customer, GameState, MenuItemId, Table, Vec2, Weather } from './types';
import { getShopLayout, type ShopLayout } from './upgrades';
import { dayArrivalMult } from './week';

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
/** Where seatless customers wait for a takeaway drink: the takeaway spots spread out from here. */
export const PICKUP_POS: Vec2 = { x: 2.5, z: -1 };
/** Customers order this far in front of the counter centre. */
export const ORDER_DISTANCE = 1;
/** Distance along the walkway between two people in line. */
const QUEUE_SPACING = 0.8;
/** Takeaway spots by the counter; past this many waiting customers, the overflow spots are used. */
export const PICKUP_SPOTS = 12;
/** Overflow spots in the aisle by the door; the rest are on the sidewalk in front. */
const AISLE_SPOTS = 4;
/** At least this many overflow spots, however few seats the shop has. */
const MIN_OVERFLOW_SPOTS = 8;
/** Where the overflow spots spread out from: this far inside the door, then this far out on the sidewalk. */
const AISLE_DEPTH = 1;
const SIDEWALK_OUT = 2.2;
/** The doorway kept clear of overflow spots reaches this far in and out of the front wall. */
const DOORWAY_MARGIN = 0.5;
const SPOT_CACHE_SIZE = 4;

const WEATHER_WEIGHTS: Record<Weather, number> = { sunny: 0.5, rainy: 0.25, hot: 0.25 };
export const WEATHER_ARRIVALS: Record<Weather, number> = { sunny: 1, rainy: 0.75, hot: 1.1 };
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

/**
 * True when someone may stand on cell i: it is free, reachable from the
 * door, and no claimed cell is in its 3×3 neighbourhood, so two people
 * standing still are at least two cells apart and never overlap.
 */
function isOpenCell(grid: NavGrid, i: number, taken: ReadonlySet<number>): boolean {
  if (grid.blocked[i] || (grid.mainComponent !== 0 && grid.component[i] !== grid.mainComponent)) return false;
  const c = i % grid.cols;
  const r = (i - c) / grid.cols;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < grid.cols && nr < grid.rows && taken.has(nr * grid.cols + nc)) return false;
    }
  }
  return true;
}

/** Index of the open cell closest to p (ties: lower index), or -1. */
function nearestOpenCell(grid: NavGrid, p: Vec2, taken: ReadonlySet<number>): number {
  const pc = Math.round(p.x / NAV_CELL) - grid.col0;
  const pr = Math.round(p.z / NAV_CELL) - grid.row0;
  const maxRing = Math.max(grid.cols, grid.rows) + Math.max(Math.abs(pc), Math.abs(pr));
  let best = -1;
  let bestDist = Infinity;
  for (let ring = 0; ring <= maxRing; ring++) {
    if ((ring - 0.5) * NAV_CELL > bestDist) break;
    for (let r = pr - ring; r <= pr + ring; r++) {
      if (r < 0 || r >= grid.rows) continue;
      const edge = r === pr - ring || r === pr + ring;
      for (let c = pc - ring; c <= pc + ring; c += edge || ring === 0 ? 1 : 2 * ring) {
        if (c < 0 || c >= grid.cols) continue;
        const i = r * grid.cols + c;
        if (!isOpenCell(grid, i, taken)) continue;
        const d = Math.hypot((grid.col0 + c) * NAV_CELL - p.x, (grid.row0 + r) * NAV_CELL - p.z);
        if (d < bestDist || (d === bestDist && i < best)) {
          bestDist = d;
          best = i;
        }
      }
    }
  }
  return best;
}

/**
 * Claims a standing spot for one person: the first of `wants` whose cell is
 * open, otherwise the open cell closest to the first one. The cell goes into
 * `taken`, so people claiming in a fixed order (by id) never stand on top of
 * each other. Falls back to the nearest free point when the floor is full.
 */
export function claimSpot(grid: NavGrid, wants: readonly Vec2[], taken: Set<number>): Vec2 {
  const first = wants[0]!;
  let cell = -1;
  for (const want of wants) {
    const i = cellAt(grid, want);
    if (i >= 0 && isOpenCell(grid, i, taken)) {
      cell = i;
      break;
    }
  }
  if (cell < 0) cell = nearestOpenCell(grid, first, taken);
  if (cell < 0) return nearestFree(grid, first) ?? { x: first.x, z: first.z };
  taken.add(cell);
  return cellCenter(grid, cell);
}

/** Standing spots of a layout, worked out once per floor plan. */
export interface FloorSpots {
  /** MAX_QUEUE spots from the counter along the walkway toward the door; 0 is where customers order. */
  queue: Vec2[];
  /** PICKUP_SPOTS takeaway spots around the pickup mat, clear of the line. */
  pickup: Vec2[];
  /**
   * Takeaway spots for when the mat is full: AISLE_SPOTS in the aisle inside
   * the door, then on the sidewalk in front, enough for every customer the
   * shop admits (seats plus a full line).
   */
  overflow: Vec2[];
  /** pickup then overflow: every takeaway spot in the order they are handed out. */
  takeaway: Vec2[];
}

/** Point `d` along the polyline, or its end. */
function along(line: readonly Vec2[], d: number): Vec2 {
  let left = d;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!;
    const b = line[k]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len >= left && len > 0) return { x: a.x + ((b.x - a.x) * left) / len, z: a.z + ((b.z - a.z) * left) / len };
    left -= len;
  }
  return line[line.length - 1]!;
}

function computeFloorSpots(layout: ShopLayout, grid: NavGrid): FloorSpots {
  const taken = new Set<number>();
  const c = layout.counter.pos;
  const front = nearestFree(grid, { x: c.x, z: c.z + ORDER_DISTANCE }) ?? { x: c.x, z: c.z + ORDER_DISTANCE };
  const doorIn = grid.doorInside >= 0 ? cellCenter(grid, grid.doorInside) : layout.door;
  const walkway = [front, ...(findPath(grid, front, doorIn) ?? [])];
  const queue: Vec2[] = [];
  for (let k = 0; k < MAX_QUEUE; k++) queue.push(claimSpot(grid, [along(walkway, k * QUEUE_SPACING)], taken));
  const pickup: Vec2[] = [];
  for (let k = 0; k < PICKUP_SPOTS; k++) pickup.push(claimSpot(grid, [layout.pickup], taken));
  // Nobody waits in the doorway: its cells count as taken for the overflow.
  const wall = layout.indoor.maxZ;
  for (let z = wall - DOORWAY_MARGIN; z <= wall + WALL_THICKNESS + DOORWAY_MARGIN; z += NAV_CELL) {
    for (let x = layout.door.x - DOOR_WIDTH / 2; x <= layout.door.x + DOOR_WIDTH / 2; x += NAV_CELL) taken.add(cellAt(grid, { x, z }));
  }
  const overflow: Vec2[] = [];
  const count = Math.max(MIN_OVERFLOW_SPOTS, layout.totalSeats + MAX_QUEUE - PICKUP_SPOTS);
  const aisle = { x: layout.door.x, z: wall - AISLE_DEPTH };
  const sidewalk = { x: layout.door.x, z: wall + SIDEWALK_OUT };
  for (let k = 0; k < count; k++) overflow.push(claimSpot(grid, [k < AISLE_SPOTS ? aisle : sidewalk], taken));
  return { queue, pickup, overflow, takeaway: [...pickup, ...overflow] };
}

const spotCache = new Map<string, FloorSpots>();

/** Queue and takeaway spots of this layout, from a small cache keyed by the floor plan. */
export function floorSpots(layout: ShopLayout, grid: NavGrid = buildNavGrid(layout)): FloorSpots {
  const key = `${grid.key}|${layout.pickup.x}|${layout.pickup.z}`;
  const cached = spotCache.get(key);
  if (cached) return cached;
  const spots = computeFloorSpots(layout, grid);
  spotCache.set(key, spots);
  if (spotCache.size > SPOT_CACHE_SIZE) spotCache.delete(spotCache.keys().next().value!);
  return spots;
}

/** Spot of the `index`-th customer in line (0 orders at the counter). */
export function queueSlot(layout: ShopLayout, index: number): Vec2 {
  const queue = floorSpots(layout).queue;
  return { ...queue[Math.min(index, queue.length - 1)]! };
}

/** The chair of the side no other occupant sits on (left first), as the renderer draws it. */
function seatPos(state: GameState, table: Table): Vec2 {
  let left = false;
  for (const id of table.occupants) {
    const other = state.customers.find((c) => c.id === id);
    if (other?.target && other.target.x < table.pos.x) left = true;
  }
  return { x: table.pos.x + (left ? CHAIR_OFFSET : -CHAIR_OFFSET), z: table.pos.z };
}

/** base × rating × marketing × weather × day event × hour × difficulty × price policy (× decor appeal), in customers per minute. */
export function arrivalRate(state: GameState): number {
  const rating = Math.max(0.2, state.rating / 3);
  const marketing = customerMultiplier(state);
  const weather = WEATHER_ARRIVALS[state.weather];
  const event = dayArrivalMult(state);
  const hour = state.phase === 'peak' ? PEAK_MULT : 1;
  const difficulty = DIFFICULTIES[state.difficulty].customerMult;
  const price = priceArrivalMult(state);
  const appeal = 1 + totalUpgradeEffect(state.upgrades).appeal;
  return BASE_ARRIVALS_PER_MINUTE * rating * marketing * weather * event * hour * difficulty * price * appeal;
}

/**
 * Picks an item weighted by popularity and weather, among enabled items that
 * are in stock. When every enabled item is out of stock the customer still
 * wants one of them and will leave angry at the counter. Null if the menu is empty.
 * Items left out for empty stock add their share of the full weight to
 * today's missed demand, so restocking still plans for them.
 */
export function pickOrder(state: GameState, persona?: Persona): MenuItemId | null {
  const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
  if (enabled.length === 0) return null;
  const inStock = enabled.filter((id) => canMake(state, id));
  const foodBoost = 1 + totalUpgradeEffect(state.upgrades).foodAppeal;
  const weightOf = (id: MenuItemId): number => {
    const def = getMenuItem(id);
    const boost = def.category === 'food' ? foodBoost : 1;
    const taste = persona?.itemWeights[id] ?? 1;
    return def.popularity * WEATHER_TEMPERATURE[state.weather][def.temperature] * boost * taste;
  };
  if (inStock.length > 0 && inStock.length < enabled.length) recordMissed(state, enabled, inStock, weightOf);
  const pool = inStock.length > 0 ? inStock : enabled;
  return pool[weightedIndex(state, pool.map(weightOf))] ?? null;
}

function recordMissed(
  state: GameState,
  enabled: readonly MenuItemId[],
  inStock: readonly MenuItemId[],
  weightOf: (id: MenuItemId) => number,
): void {
  const total = enabled.reduce((s, id) => s + weightOf(id), 0);
  if (total <= 0) return;
  const missed = (state.today.missedDemand ??= {});
  for (const id of enabled) {
    if (!inStock.includes(id)) missed[id] = (missed[id] ?? 0) + weightOf(id) / total;
  }
}

/**
 * Picks a food to add alongside the drink when the persona orders one: an
 * enabled, in-stock food other than the drink itself, consumed now like the
 * drink. Deterministic from the seed and the id, so it never touches the game
 * RNG. Does nothing when no suitable food is on the menu.
 */
export function maybeAddOn(state: GameState, customer: Customer): void {
  if (!customer.persona) return;
  const persona = PERSONAS[customer.persona];
  // The pastry case puts food on show, so more customers add something to eat.
  const chance = Math.min(1, persona.foodChance * (1 + totalUpgradeEffect(state.upgrades).foodAppeal));
  if (chance <= 0 || addOnRoll(state.seed, customer.id) >= chance) return;
  const foods = state.menu
    .filter((m) => m.enabled && m.id !== customer.order && getMenuItem(m.id).category === 'food' && canMake(state, m.id))
    .map((m) => m.id);
  if (foods.length === 0) return;
  const food = foods[Math.floor(addOnPick(state.seed, customer.id) * foods.length)]!;
  consume(state, food);
  customer.extraItem = food;
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
  const persona = PERSONAS[pickPersona(state.seed, state.nextId, state.minute, state.weather)];
  const order = pickOrder(state, persona);
  if (!order) return null;
  const patience = Math.round(
    BASE_PATIENCE * DIFFICULTIES[state.difficulty].patienceMult * persona.patienceMult * randRange(state, 0.8, 1.2),
  );
  const customer: Customer = {
    id: state.nextId++,
    state: 'entering',
    pos: { ...DOOR_POS },
    target: queueSlot(getShopLayout(state), state.customers.filter(isInLine).length),
    patience,
    maxPatience: patience,
    order,
    tableId: null,
    timer: ENTER_MINUTES,
    look: randInt(state, 0, 7),
    persona: persona.id,
    arrivedMinute: state.minute,
  };
  state.customers.push(customer);
  state.today.customersArrived += 1;
  const hour = hourOf(state.minute);
  const byHour = state.today.arrivalsByHour;
  if (byHour && hour >= 0 && hour < 24) byHour[hour] = (byHour[hour] ?? 0) + 1;
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
  customer.target = seatPos(state, table);
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
  const theirOrders = state.orders.filter((o) => o.customerId === customer.id);
  // Drinks already brewed for a customer who leaves are wasted ingredients.
  if (state.today.wasteCost !== undefined) {
    let waste = theirOrders.reduce((s, o) => s + servingCost(state, o.itemId), 0);
    if (customer.extraItem) waste += servingCost(state, customer.extraItem);
    state.today.wasteCost += waste;
  }
  const orderIds = new Set(theirOrders.map((o) => o.id));
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

/** Menu price of the item times the price policy multiplier, rounded to the đồng. */
export function sellPrice(state: GameState, itemId: MenuItemId): number {
  const price = state.menu.find((m) => m.id === itemId)?.price ?? getMenuItem(itemId).price;
  return Math.round(price * sellPriceMult(state));
}

/** Price of the food the customer ordered alongside the drink, or 0 when there is none. */
function extraPrice(state: GameState, customer: Customer): number {
  return customer.extraItem ? sellPrice(state, customer.extraItem) : 0;
}

/** Adds a sale's đồng to the per-item revenue tally, when the day tracks it. */
function recordSale(state: GameState, itemId: MenuItemId, price: number): void {
  if (state.today.soldRevenue) state.today.soldRevenue[itemId] = (state.today.soldRevenue[itemId] ?? 0) + price;
}

/** Records how long a served customer waited, from the door to getting the drink. */
function recordWait(state: GameState, customer: Customer): void {
  if (customer.arrivedMinute === undefined || state.today.waitMinutesSum === undefined || state.today.waitCount === undefined) return;
  state.today.waitMinutesSum += Math.max(0, state.minute - customer.arrivedMinute);
  state.today.waitCount += 1;
}

/**
 * Hands the drink over. Seated customers start drinking; customers without a
 * clean seat take it away and pay at the counter.
 */
export function serveCustomer(state: GameState, customer: Customer, itemId: MenuItemId): void {
  state.today.customersServed += 1;
  state.today.sold[itemId] = (state.today.sold[itemId] ?? 0) + 1;
  if (customer.extraItem) state.today.sold[customer.extraItem] = (state.today.sold[customer.extraItem] ?? 0) + 1;
  recordWait(state, customer);
  state.events.push({ type: 'served', customerId: customer.id, itemId });
  if (seatCustomer(state, customer)) {
    customer.state = 'drinking';
    const sitMult = customer.persona ? PERSONAS[customer.persona].sitMult : 1;
    customer.timer = Math.max(1, Math.round(randInt(state, DRINK_MINUTES[0], DRINK_MINUTES[1]) * sitMult));
    return;
  }
  const drinkPrice = sellPrice(state, itemId);
  const extra = extraPrice(state, customer);
  state.money += drinkPrice + extra;
  recordRevenue(state, drinkPrice + extra);
  recordSale(state, itemId, drinkPrice);
  if (customer.extraItem) recordSale(state, customer.extraItem, extra);
  state.events.push({ type: 'cash', amount: drinkPrice + extra, pos: { ...customer.pos } });
  startLeaving(state, customer, 'leaving');
}

/** Drinking done: leaves the money and the dirty cup on the table. */
function payAtTable(state: GameState, customer: Customer): void {
  const table = state.tables.find((t) => t.id === customer.tableId);
  if (table && customer.order) {
    const drinkPrice = sellPrice(state, customer.order);
    const extra = extraPrice(state, customer);
    table.cash += drinkPrice + extra;
    table.trash += 1;
    recordSale(state, customer.order, drinkPrice);
    if (customer.extraItem) recordSale(state, customer.extraItem, extra);
  }
  startLeaving(state, customer, 'leaving');
}

/**
 * WALK_PER_MINUTE around the furniture, along the cached distance field of
 * the target (walkToward). A seated customer stops on the free floor next to
 * the chair (the chair itself is blocked). Without any free floor to walk on
 * the customer walks straight.
 */
function walk(grid: NavGrid, customer: Customer): void {
  const target = customer.target;
  if (!target || (customer.pos.x === target.x && customer.pos.z === target.z)) return;
  const next = walkToward(grid, customer.pos, target, WALK_PER_MINUTE);
  if (next) {
    customer.pos = next;
    return;
  }
  const d = Math.hypot(target.x - customer.pos.x, target.z - customer.pos.z);
  const k = WALK_PER_MINUTE / d;
  customer.pos = k >= 1 ? { ...target } : { x: customer.pos.x + (target.x - customer.pos.x) * k, z: customer.pos.z + (target.z - customer.pos.z) * k };
}

/**
 * Gives every seatless waiting customer a takeaway spot of their own. A
 * customer keeps the spot they already hold; newcomers take the first free
 * one in customer order, by the mat first, then the overflow spots. Should
 * more wait than the shop admits, each extra one claims a free cell of their
 * own next to the last overflow spot.
 */
function assignPickupSpots(state: GameState, grid: NavGrid, spots: FloorSpots): void {
  const all = spots.takeaway;
  const used = new Set<number>();
  const newcomers: Customer[] = [];
  for (const c of state.customers) {
    if (c.state !== 'waiting' || c.tableId !== null) continue;
    const t = c.target;
    const k = t ? all.findIndex((p) => p.x === t.x && p.z === t.z) : -1;
    if (k >= 0 && !used.has(k)) used.add(k);
    else newcomers.push(c);
  }
  let extra: Set<number> | null = null;
  for (const c of newcomers) {
    const k = all.findIndex((_, i) => !used.has(i));
    if (k >= 0) {
      used.add(k);
      c.target = { ...all[k]! };
      continue;
    }
    extra ??= new Set([...spots.queue, ...all].map((p) => cellAt(grid, p)));
    c.target = claimSpot(grid, [all[all.length - 1]!], extra);
  }
}

/** One game minute for every customer: timers, patience, seating, movement. */
export function updateCustomers(state: GameState): void {
  const layout = getShopLayout(state);
  const grid = buildNavGrid(layout);
  const spots = floorSpots(layout, grid);
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
        if (c.tableId === null) seatCustomer(state, c);
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
    if (isInLine(c)) c.target = { ...spots.queue[Math.min(lineIndex++, spots.queue.length - 1)]! };
  }
  assignPickupSpots(state, grid, spots);
  for (const c of state.customers) walk(grid, c);
  state.customers = state.customers.filter((c) => !(isGone(c) && c.timer <= 0));
}
