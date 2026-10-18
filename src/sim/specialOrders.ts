import { DIFFICULTIES } from './data/difficulty';
import { canMake } from './inventory';
import { ensureRetention } from './retention';
import type { DailyReport, GameState, MenuItemId } from './types';

/** First day with a special order. */
export const SPECIAL_ORDER_FROM_DAY = 2;
/** Due times a special order can have: 13:00 or 19:00. */
export const SPECIAL_ORDER_DEADLINES: readonly number[] = [13 * 60, 19 * 60];
export const SPECIAL_ORDER_TICKETS = 2;
/** Cash reward at normal difficulty, scaled by the difficulty's price multiplier. */
export const SPECIAL_ORDER_MONEY = 60_000;
/** First day a VIP may visit. */
export const VIP_FROM_DAY = 3;
/** Share of days (from VIP_FROM_DAY) with a VIP. */
export const VIP_DAY_CHANCE = 0.35;
/** The VIP is the first customer through the door from this minute (10:00). */
export const VIP_FROM_MINUTE = 10 * 60;
export const VIP_PATIENCE_MULT = 0.8;
export const VIP_TICKETS = 3;

const ITEM_SALT = 0x1b873593;
const DEADLINE_SALT = 0xcc9e2d51;
const VIP_SALT = 0xe6546b64;
const UNIT = 4294967296;

/** A stable 32-bit hash of the seed, the day and a salt, independent of the game RNG. */
function dayHash(seed: number, day: number, salt: number): number {
  let h = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((day + salt) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

function addTickets(state: GameState, amount: number, reason: 'special_order' | 'vip'): void {
  const retention = ensureRetention(state);
  retention.tickets += amount;
  state.events.push({ type: 'tickets_earned', amount, total: retention.tickets, reason });
}

/**
 * Rolls today's special order when the shop opens, from day 2: an enabled
 * item the shop can make now, picked by a hash of the seed and the day (never
 * from rngState). Null when no item qualifies.
 */
export function startDaySpecialOrder(state: GameState): void {
  state.specialOrder = null;
  if (state.day < SPECIAL_ORDER_FROM_DAY) return;
  const items = state.menu.filter((m) => m.enabled && canMake(state, m.id)).map((m) => m.id);
  if (items.length === 0) return;
  const deadline = dayHash(state.seed, state.day, DEADLINE_SALT) % SPECIAL_ORDER_DEADLINES.length;
  state.specialOrder = {
    itemId: items[dayHash(state.seed, state.day, ITEM_SALT) % items.length]!,
    target: 3 + Math.floor(state.shopLevel / 2),
    byMinute: SPECIAL_ORDER_DEADLINES[deadline]!,
    progress: 0,
    rewardTickets: SPECIAL_ORDER_TICKETS,
    rewardMoney: Math.round(SPECIAL_ORDER_MONEY * DIFFICULTIES[state.difficulty].priceMult),
    status: 'active',
  };
}

/** Whether today brings a VIP: about VIP_DAY_CHANCE of the days from VIP_FROM_DAY, by a hash of the seed and the day. */
export function isVipDay(seed: number, day: number): boolean {
  return day >= VIP_FROM_DAY && dayHash(seed, day, VIP_SALT) / UNIT < VIP_DAY_CHANCE;
}

/**
 * Whether the customer about to come through the door is today's VIP: the
 * first arrival from 10:00 on a VIP day. Call before the arrival is counted
 * in `today.arrivalsByHour`, which tells whether anyone came in since 10:00.
 */
export function isNextArrivalVip(state: GameState): boolean {
  const byHour = state.today.arrivalsByHour;
  if (!byHour || state.minute < VIP_FROM_MINUTE || !isVipDay(state.seed, state.day)) return false;
  for (let h = Math.floor(VIP_FROM_MINUTE / 60); h < byHour.length; h++) if ((byHour[h] ?? 0) > 0) return false;
  return true;
}

/**
 * Counts a served customer toward the active special order (the drink and
 * the food alongside it, until the due minute) and pays out the tickets of a VIP.
 */
export function onServed(state: GameState, itemId: MenuItemId, customerId: number): void {
  const customer = state.customers.find((c) => c.id === customerId);
  if (customer?.vip) addTickets(state, VIP_TICKETS, 'vip');
  const order = state.specialOrder;
  if (!order || order.status !== 'active' || state.minute > order.byMinute) return;
  if (itemId === order.itemId) order.progress += 1;
  if (customer?.extraItem === order.itemId) order.progress += 1;
  if (order.progress < order.target) return;
  order.progress = order.target;
  order.status = 'completed';
  state.money += order.rewardMoney;
  state.events.push({ type: 'special_order', status: 'completed', itemId: order.itemId });
  addTickets(state, order.rewardTickets, 'special_order');
}

function failOrder(state: GameState): void {
  const order = state.specialOrder;
  if (!order || order.status !== 'active') return;
  order.status = 'failed';
  state.events.push({ type: 'special_order', status: 'failed', itemId: order.itemId });
}

/** One game minute: fails the active order once its deadline passes. */
export function tickSpecialOrders(state: GameState): void {
  if (state.specialOrder && state.minute > state.specialOrder.byMinute) failOrder(state);
}

/** Settles the special order into the day's report; called from closeDay. */
export function endOfDaySpecialOrder(state: GameState, report: DailyReport): void {
  failOrder(state);
  if (state.specialOrder) report.specialOrder = { ...state.specialOrder };
  state.specialOrder = null;
}
