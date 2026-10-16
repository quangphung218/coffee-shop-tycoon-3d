import { DIFFICULTIES } from './data/difficulty';
import { wageMult } from './policies';
import type { DayStats, Difficulty, GameState } from './types';

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

/**
 * Ingredient cost of everything taken out of stock, at the difficulty's prices.
 * Includes drinks made for customers who left before being served.
 */
export function ingredientCostUsed(state: GameState, stats: DayStats = state.today): number {
  return Math.round((stats.ingredientsUsed ?? 0) * DIFFICULTIES[state.difficulty].priceMult);
}

/** Today's wage bill: every staff member's daily wage times the wage policy multiplier. */
export function totalWages(state: GameState): number {
  return Math.round(state.staff.reduce((s, member) => s + member.wagePerDay, 0) * wageMult(state));
}

export function profit(stats: DayStats): number {
  return stats.revenue - stats.ingredientCost - stats.wages - stats.marketingCost;
}

/** Hour of day (0..23) for a game minute since midnight. */
export function hourOf(minute: number): number {
  return Math.floor(minute / 60);
}

/** Books `amount` đồng of revenue for today and buckets it by the current hour. */
export function recordRevenue(state: GameState, amount: number): void {
  state.today.revenue += amount;
  const hour = hourOf(state.minute);
  const byHour = state.today.revenueByHour;
  if (byHour && hour >= 0 && hour < 24) byHour[hour] = (byHour[hour] ?? 0) + amount;
}

/** Records a marketing expense paid today. Refused when the money does not cover it. */
export function payMarketing(state: GameState, amount: number): boolean {
  if (!(amount > 0) || state.money < amount) return false;
  state.money -= amount;
  state.today.marketingCost += amount;
  return true;
}

/**
 * Closes the books for today: records the ingredient cost of what was used and
 * pays the staff. Wages are paid even into debt; the debt check warns.
 */
export function settleDay(state: GameState): void {
  state.today.ingredientCost = ingredientCostUsed(state);
  const wages = totalWages(state);
  state.today.wages = wages;
  state.money -= wages;
  checkDebt(state);
}
