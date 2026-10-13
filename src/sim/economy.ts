import { DIFFICULTIES } from './data/difficulty';
import { getMenuItem } from './data/menu';
import type { DayStats, Difficulty, GameState, MenuItemId } from './types';

/** How far below zero the money may go (from forced costs such as wages) before the shop is in trouble. */
export const DEBT_LIMIT: Readonly<Record<Difficulty, number>> = {
  easy: 1000000,
  normal: 500000,
  hard: 200000,
};

export function debtLimit(state: GameState): number {
  return DEBT_LIMIT[state.difficulty];
}

export function isOverDebtLimit(state: GameState): boolean {
  return state.money < -debtLimit(state);
}

/** Warns when the money is negative, louder once past the debt limit. */
export function checkDebt(state: GameState): void {
  if (state.money >= 0) return;
  if (isOverDebtLimit(state)) {
    state.events.push({ type: 'notify', level: 'error', text: 'Quán đã vượt ngưỡng nợ cho phép!' });
  } else {
    state.events.push({ type: 'notify', level: 'warning', text: 'Quán đang âm tiền' });
  }
}

/** Ingredient cost (giá vốn) of everything sold, at the difficulty's prices. */
export function costOfGoodsSold(state: GameState, stats: DayStats = state.today): number {
  const mult = DIFFICULTIES[state.difficulty].priceMult;
  let total = 0;
  for (const [id, qty] of Object.entries(stats.sold) as [MenuItemId, number][]) {
    total += getMenuItem(id).cost * qty;
  }
  return Math.round(total * mult);
}

export function totalWages(state: GameState): number {
  return state.staff.reduce((s, member) => s + member.wagePerDay, 0);
}

export function profit(stats: DayStats): number {
  return stats.revenue - stats.ingredientCost - stats.wages - stats.marketingCost;
}

/** Records a marketing expense paid today. Refused when the money does not cover it. */
export function payMarketing(state: GameState, amount: number): boolean {
  if (!(amount > 0) || state.money < amount) return false;
  state.money -= amount;
  state.today.marketingCost += amount;
  return true;
}

/**
 * Closes the books for today: records the ingredient cost of what was sold and
 * pays the staff. Wages are paid even into debt; the debt check warns.
 */
export function settleDay(state: GameState): void {
  state.today.ingredientCost = costOfGoodsSold(state);
  const wages = totalWages(state);
  state.today.wages = wages;
  state.money -= wages;
  checkDebt(state);
}
