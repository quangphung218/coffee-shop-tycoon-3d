import { DIFFICULTIES } from './data/difficulty';
import { INGREDIENTS, getIngredient } from './data/ingredients';
import { getMenuItem } from './data/menu';
import type { DayStats, Difficulty, GameState, IngredientId, MenuItemId } from './types';

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
 * Emits `low_stock` when an ingredient drops below its warning level.
 */
export function consume(state: GameState, itemId: MenuItemId): void {
  for (const need of getMenuItem(itemId).ingredients) {
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
  return Math.round(getIngredient(id).unitPrice * qty * DIFFICULTIES[state.difficulty].priceMult);
}

export type BuyResult = { ok: true; cost: number } | { ok: false; reason: string };

/** Buys `qty` units of an ingredient. Refused when the money does not cover the price. */
export function buyIngredient(state: GameState, id: IngredientId, qty: number): BuyResult {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'Số lượng không hợp lệ' };
  const def = getIngredient(id);
  const cost = ingredientPrice(state, id, qty);
  if (state.money < cost) {
    const reason = `Không đủ tiền mua ${def.name}`;
    state.events.push({ type: 'notify', level: 'error', text: reason });
    return { ok: false, reason };
  }
  state.money -= cost;
  const item = state.inventory.find((i) => i.id === id);
  if (item) item.qty += qty;
  else state.inventory.push({ id, qty });
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

/** Expected servings per enabled item for the next day. */
export function expectedDemand(state: GameState): Partial<Record<MenuItemId, number>> {
  const enabled = state.menu.filter((m) => m.enabled).map((m) => m.id);
  const demand: Partial<Record<MenuItemId, number>> = {};
  const ref = referenceDay(state);
  if (ref) {
    // Orders lost to empty stock were demand too.
    for (const id of enabled) demand[id] = (ref.sold[id] ?? 0) + (ref.outOfStock[id] ?? 0);
    return demand;
  }
  const total = DAY_ONE_SERVINGS[state.difficulty];
  const weight = enabled.reduce((s, id) => s + getMenuItem(id).popularity, 0);
  for (const id of enabled) demand[id] = weight > 0 ? (total * getMenuItem(id).popularity) / weight : 0;
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

export interface RestockResult {
  bought: RestockLine[];
  skipped: IngredientId[];
  spent: number;
}

/** Buys the suggested lines in order; lines the money cannot cover are skipped. */
export function applyRestockSuggestion(state: GameState): RestockResult {
  const result: RestockResult = { bought: [], skipped: [], spent: 0 };
  for (const line of autoRestockSuggestion(state).items) {
    if (state.money < line.cost) {
      result.skipped.push(line.id);
      continue;
    }
    const r = buyIngredient(state, line.id, line.qty);
    if (r.ok) {
      result.bought.push(line);
      result.spent += r.cost;
    }
  }
  if (result.skipped.length > 0) {
    const names = result.skipped.map((id) => getIngredient(id).name).join(', ');
    state.events.push({ type: 'notify', level: 'warning', text: `Không đủ tiền nhập: ${names}` });
  } else if (result.bought.length > 0) {
    state.events.push({ type: 'notify', level: 'success', text: 'Đã nhập hàng theo gợi ý' });
  }
  return result;
}
