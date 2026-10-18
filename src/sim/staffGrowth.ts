import type { GameState, Staff } from './types';

/** Team size cap before any expansion raises it. */
export const BASE_MAX_STAFF = 6;

/**
 * Pays to train a staff member one level up. Returns false when the training
 * does not apply (unknown staff, top level, not enough money or tickets…).
 */
export function trainStaff(_state: GameState, _staffId: number): boolean {
  return false;
}

/** One tick of work experience for a staff member; called for every staff member each game minute. */
export function onStaffTick(_state: GameState, _member: Staff, _dtMinutes: number): void {}

/** End-of-day staff growth (experience into levels); called from closeDay. */
export function endOfDayStaffGrowth(_state: GameState): void {}

/** How many staff the shop can employ right now. */
export function maxStaff(_state: GameState): number {
  return BASE_MAX_STAFF;
}
