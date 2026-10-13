import { getIngredient } from './data/ingredients';
import { getMenuItem } from './data/menu';
import type { GameState, IngredientId, MenuItemId } from './types';

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
