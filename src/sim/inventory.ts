// Pure string formatting with no imports, so the sim stays free of DOM.
import { formatMoney } from '../ui/core/format';
import { CLOSING_MINUTE } from './clock';
import { DIFFICULTIES } from './data/difficulty';
import { INGREDIENTS, getIngredient } from './data/ingredients';
import { getMenuItem } from './data/menu';
import { totalUpgradeEffect } from './data/upgrades';
import { DAY_START_MINUTE } from './state';
import type { DayStats, Difficulty, GameState, IngredientId, MenuItemId } from './types';
import { dayIngredientPriceMult } from './week';

/**
 * Unit price of an ingredient today: after equipment discounts (the ice maker
 * cuts ice) and the day event (a supplier hike raises it). Buying and the cost
 * of servings made both use it.
 */
export function effectiveUnitPrice(state: GameState, id: IngredientId): number {
  const base = getIngredient(id).unitPrice * dayIngredientPriceMult(state);
  if (id !== 'ice') return base;
  const cut = Math.min(0.9, totalUpgradeEffect(state.upgrades).iceCostReduction);
  return base * (1 - cut);
}

/** Ingredient cost of one serving at current prices (ice maker lowers ice). */
export function servingCost(state: GameState, itemId: MenuItemId): number {
  return Math.round(getMenuItem(itemId).ingredients.reduce((sum, a) => sum + effectiveUnitPrice(state, a.id) * a.qty, 0));
}

/** Safety margin added on top of the expected usage when restocking. */
export const RESTOCK_BUFFER = 0.2;

/** Servings expected on day 1, before there are sales to learn from. */
export const DAY_ONE_SERVINGS: Readonly<Record<Difficulty, number>> = {
  easy: 60,
  normal: 50,
  hard: 40,
};

export function stockOf(state: GameState, id: IngredientId): number {
  return state.inventory.find((i) => i.id === id)?.qty ?? 0;
}

/** True when the stock covers one serving of the item. */
export function canMake(state: GameState, itemId: MenuItemId): boolean {
  return getMenuItem(itemId).ingredients.every((need) => stockOf(state, need.id) >= need.qty);
}

/**
 * Takes one serving's ingredients out of stock. Call canMake first.
 * Emits `low_stock` when an ingredient drops below its warning level. Adds the
 * serving's cost to today's ingredient use, whether or not it gets sold.
 */
export function consume(state: GameState, itemId: MenuItemId): void {
  const def = getMenuItem(itemId);
  state.today.ingredientsUsed = (state.today.ingredientsUsed ?? 0) + servingCost(state, itemId);
  for (const need of def.ingredients) {
    const item = state.inventory.find((i) => i.id === need.id);
    if (!item) continue;
    const before = item.qty;
    item.qty = Math.max(0, before - need.qty);
    const threshold = getIngredient(need.id).lowStock;
    if (before >= threshold && item.qty < threshold) state.events.push({ type: 'low_stock', ingredientId: need.id });
  }
}

/** Purchase price of `qty` units at the current difficulty, in đồng. */
export function ingredientPrice(state: GameState, id: IngredientId, qty: number): number {
  return Math.round(effectiveUnitPrice(state, id) * qty * DIFFICULTIES[state.difficulty].priceMult);
}

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: string };

/**
 * Whether `qty` units the money does not cover may be bought on credit: at
 * most one pack of an ingredient below its warning level. A pack always lifts
 * the stock above that level, so each empty shelf gets one pack until it sells
 * down again. Keeps a shop that wages pushed below zero able to restock and
 * sell instead of stuck with an empty store; the debt only warns (checkDebt).
 */
export function canBuyOnCredit(state: GameState, id: IngredientId, qty: number): boolean {
  const def = getIngredient(id);
  return qty <= def.packSize && stockOf(state, id) < def.lowStock;
}

/**
 * Buys `qty` units of an ingredient. Refused when the money does not cover the
 * price, unless canBuyOnCredit allows it.
 */
export function buyIngredient(state: GameState, id: IngredientId, qty: number): BuyResult {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Số lượng không hợp lệ' };
  const def = getIngredient(id);
  const cost = ingredientPrice(state, id, qty);
  if (state.money < cost && !canBuyOnCredit(state, id, qty)) {
    const reason = `Không đủ tiền mua ${def.name}`;
    state.events.push({ type: 'notify', level: 'error', text: reason });
    return { ok: false, reason };
  }
  state.money -= cost;
  const item = state.inventory.find((i) => i.id === id);
  if (item) item.qty += qty;
  else state.inventory.push({ id, qty });
  state.events.push({ type: 'spend', kind: 'restock', label: def.name, amount: cost, moneyLeft: state.money });
  return { ok: true, cost };
}

export interface LowStockItem {
  id: IngredientId;
  qty: number;
  threshold: number;
}

/** Ingredients below their warning level, in catalogue order. */
export function lowStockItems(state: GameState): LowStockItem[] {
  return INGREDIENTS.map((def) => ({ id: def.id, qty: stockOf(state, def.id), threshold: def.lowStock })).filter(
    (i) => i.qty < i.threshold,
  );
}

/** Turns an item on or off for today. Returns the new state, or null for an unknown item. */
export function toggleMenuItem(state: GameState, itemId: MenuItemId): boolean | null {
  const entry = state.menu.find((m) => m.id === itemId);
  if (!entry) return null;
  entry.enabled = !entry.enabled;
  return entry.enabled;
}

export type SellableResult = { ok: true } | { ok: false; reason: string };

/** Whether customers can buy the item right now, with the reason when not. */
export function sellable(state: GameState, itemId: MenuItemId): SellableResult {
  const entry = state.menu.find((m) => m.id === itemId);
  if (!entry?.enabled) return { ok: false, reason: 'Món đang tắt trong menu hôm nay' };
  const missing = getMenuItem(itemId).ingredients.filter((need) => stockOf(state, need.id) < need.qty);
  if (missing.length > 0) {
    return { ok: false, reason: `Thiếu ${missing.map((n) => getIngredient(n.id).name).join(', ')}` };
  }
  return { ok: true };
}

/** Enabled items that cannot be made with the stock left. */
export function blockedMenuItems(state: GameState): MenuItemId[] {
  return state.menu.filter((m) => m.enabled && !canMake(state, m.id)).map((m) => m.id);
}

export interface RestockLine {
  id: IngredientId;
  /** Units to buy, rounded up to whole packs. */
  qty: number;
  cost: number;
}

export interface RestockSuggestion {
  items: RestockLine[];
  totalCost: number;
}

/**
 * Stats of the day to learn demand from: today once the doors have closed,
 * otherwise the last finished day. Undefined before the first day ends.
 */
function referenceDay(state: GameState): DayStats | undefined {
  if (state.phase === 'closing' || state.phase === 'report') return state.today;
  return state.history[state.history.length - 1];
}

/**
 * Servings a day asked for: sold, plus orders lost to empty stock, plus the
 * missed-demand balance (positive for an item that could not be made, negative
 * for the items sold in its place). Never below zero per item.
 */
function observedDemand(day: DayStats): Partial<Record<MenuItemId, number>> {
  const demand: Partial<Record<MenuItemId, number>> = {};
  for (const counts of [day.sold, day.outOfStock, day.missedDemand ?? {}]) {
    for (const [id, n] of Object.entries(counts) as [MenuItemId, number | undefined][]) demand[id] = (demand[id] ?? 0) + (n ?? 0);
  }
  for (const id of Object.keys(demand) as MenuItemId[]) demand[id] = Math.max(0, demand[id]!);
  return demand;
}

/**
 * Expected servings per enabled item for the next day: what the reference
 * day asked for. An enabled item it did not ask for at all (just switched on,
 * or never offered) gets its popularity share of that day's servings, or of
 * the day-1 default before there is a day with servings.
 */
export function expectedDemand(state: GameState): Partial<Record<MenuItemId, number>> {
  const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
  const ref = referenceDay(state);
  const observed = ref ? observedDemand(ref) : {};
  const servings = Object.values(observed).reduce<number>((s, n) => s + (n ?? 0), 0);
  const total = servings > 0 ? servings : DAY_ONE_SERVINGS[state.difficulty];
  const weight = enabled.reduce((s, id) => s + getMenuItem(id).popularity, 0);
  const demand: Partial<Record<MenuItemId, number>> = {};
  for (const id of enabled) {
    const seen = observed[id] ?? 0;
    demand[id] = seen > 0 ? seen : weight > 0 ? (total * getMenuItem(id).popularity) / weight : 0;
  }
  return demand;
}

/**
 * What to buy for tomorrow: expected usage from the previous day's sales
 * (day-1 default by difficulty) plus a 20% buffer, minus current stock,
 * rounded up to whole packs.
 */
export function autoRestockSuggestion(state: GameState): RestockSuggestion {
  const usage = new Map<IngredientId, number>();
  for (const [id, servings] of Object.entries(expectedDemand(state)) as [MenuItemId, number][]) {
    for (const need of getMenuItem(id).ingredients) {
      usage.set(need.id, (usage.get(need.id) ?? 0) + need.qty * servings);
    }
  }
  const items: RestockLine[] = [];
  for (const def of INGREDIENTS) {
    const used = usage.get(def.id) ?? 0;
    const missing = Math.ceil(used * (1 + RESTOCK_BUFFER)) - stockOf(state, def.id);
    if (missing <= 0) continue;
    const qty = Math.ceil(missing / def.packSize) * def.packSize;
    items.push({ id: def.id, qty, cost: ingredientPrice(state, def.id, qty) });
  }
  return { items, totalCost: items.reduce((s, i) => s + i.cost, 0) };
}

export type StockLevel = 'ok' | 'low' | 'out';

export interface StockOutlook {
  qty: number;
  /** Units today's remaining expected sales will use (whole day before opening). */
  need: number;
  level: StockLevel;
  /** Rough servings of today's expected mix this stock still covers; null when the menu does not use it. */
  cups: number | null;
}

/** Share of the open day (07:00–20:00) still ahead: 1 outside service, 0 once the doors close. */
function dayLeft(state: GameState): number {
  if (state.phase === 'preparation' || state.phase === 'report') return 1;
  if (state.phase === 'closing') return 0;
  const left = (CLOSING_MINUTE - state.minute) / (CLOSING_MINUTE - DAY_START_MINUTE);
  return Math.min(1, Math.max(0, left));
}

/** Clock bucket of the outlook cache, in game minutes. */
const OUTLOOK_BUCKET = 15;
const outlookCache = new WeakMap<GameState, { key: string; value: Readonly<Record<IngredientId, StockOutlook>> }>();

/**
 * Stock level per ingredient against the demand left today: "out" at zero,
 * "low" below that demand or below the fixed warning level, else "ok".
 * Cached per state until stock, menu or the 15-minute clock bucket changes,
 * so callers can ask every frame.
 */
export function stockOutlook(state: GameState): Readonly<Record<IngredientId, StockOutlook>> {
  const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
  const key = [
    state.inventory.map((i) => `${i.id}:${i.qty}`).join(','),
    enabled.join(','),
    state.phase,
    state.day,
    state.history.length,
    state.difficulty,
    Math.floor(state.minute / OUTLOOK_BUCKET),
  ].join('|');
  const hit = outlookCache.get(state);
  if (hit?.key === key) return hit.value;

  const demand = expectedDemand(state);
  const left = dayLeft(state);
  let servings = 0;
  for (const id of enabled) servings += demand[id] ?? 0;
  // Mix of one average serving: by expected demand, or by popularity when there is none.
  const weights = enabled.map((id) => [id, servings > 0 ? (demand[id] ?? 0) : getMenuItem(id).popularity] as const);
  const weightSum = weights.reduce((s, [, w]) => s + w, 0);
  const perServing = new Map<IngredientId, number>();
  const dayUse = new Map<IngredientId, number>();
  for (const [id, w] of weights) {
    for (const need of getMenuItem(id).ingredients) {
      if (weightSum > 0) perServing.set(need.id, (perServing.get(need.id) ?? 0) + (need.qty * w) / weightSum);
      dayUse.set(need.id, (dayUse.get(need.id) ?? 0) + need.qty * (demand[id] ?? 0));
    }
  }

  const value = {} as Record<IngredientId, StockOutlook>;
  for (const def of INGREDIENTS) {
    const qty = stockOf(state, def.id);
    const need = Math.ceil((dayUse.get(def.id) ?? 0) * left);
    const unit = perServing.get(def.id) ?? 0;
    const level: StockLevel = qty <= 0 ? 'out' : qty < need || qty < def.lowStock ? 'low' : 'ok';
    value[def.id] = { qty, need, level, cups: unit > 0 ? Math.floor(qty / unit) : null };
  }
  outlookCache.set(state, { key, value });
  return value;
}

export interface RestockResult {
  bought: RestockLine[];
  skipped: IngredientId[];
  spent: number;
}

/**
 * Buys the suggested lines in order. A line the money cannot cover is cut to
 * one pack bought on credit when canBuyOnCredit allows it, else skipped; the
 * notice names the skipped lines with the money still short.
 */
export function applyRestockSuggestion(state: GameState): RestockResult {
  const result: RestockResult = { bought: [], skipped: [], spent: 0 };
  let skippedCost = 0;
  for (const suggested of autoRestockSuggestion(state).items) {
    let line = suggested;
    if (state.money < line.cost) {
      const pack = getIngredient(line.id).packSize;
      if (!canBuyOnCredit(state, line.id, pack)) {
        result.skipped.push(line.id);
        skippedCost += line.cost;
        continue;
      }
      line = { id: line.id, qty: pack, cost: ingredientPrice(state, line.id, pack) };
    }
    const r = buyIngredient(state, line.id, line.qty);
    if (r.ok) {
      result.bought.push(line);
      result.spent += r.cost;
    }
  }
  if (result.skipped.length > 0) {
    const names = result.skipped.map((id) => getIngredient(id).name).join(', ');
    const short = formatMoney(Math.max(0, skippedCost - state.money));
    state.events.push({ type: 'notify', level: 'warning', text: `Thiếu ${short} để nhập ${names}` });
  }
  return result;
}
