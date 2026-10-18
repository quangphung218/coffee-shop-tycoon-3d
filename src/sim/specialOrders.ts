import type { DailyReport, GameState, MenuItemId } from './types';

/** Rolls today's special order when the shop opens. */
export function startDaySpecialOrder(_state: GameState): void {}

/** Counts a served item toward the active special order. */
export function onServed(_state: GameState, _itemId: MenuItemId, _customerId: number): void {}

/** One game minute: fails the active order once its deadline passes. */
export function tickSpecialOrders(_state: GameState): void {}

/** Settles the special order into the day's report; called from closeDay. */
export function endOfDaySpecialOrder(_state: GameState, _report: DailyReport): void {}
