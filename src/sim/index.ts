import { advanceClock, closeUp, endOfDay, isOpen, openShop, startNextDay } from './clock';
import { spawnArrivals, updateCustomers } from './customers';
import { getIngredient } from './data/ingredients';
import { applyRestockSuggestion, buyIngredient, toggleMenuItem } from './inventory';
import { advanceCampaigns, runCampaign } from './marketing';
import { brew, cleanTable, collectCash, deliver, takeOrder, updatePlayerTasks } from './orders';
import { recordExperiencesSince } from './reviews';
import { assignRole, clearStaffTasks, fireStaff, hireStaff, setAutoAssign, startStaffDay, updateStaff } from './staff';
import { buildNavGrid, nearestFree } from './nav';
import { buyUpgrade, getShopLayout } from './upgrades';
import type { Command, GameState } from './types';

/** Upper bound on ticks per step so a long frame hitch cannot freeze the page. */
export const MAX_TICKS_PER_STEP = 240;

/** One fixed tick: one game minute. */
function tick(state: GameState): void {
  advanceClock(state);
  if (state.phase !== 'closing') spawnArrivals(state);
  const eventsBefore = state.events.length;
  updatePlayerTasks(state);
  updateStaff(state);
  updateCustomers(state);
  recordExperiencesSince(state, eventsBefore);
  if (state.phase === 'closing' && state.customers.length === 0) {
    closeUp(state);
    clearStaffTasks(state);
    endOfDay(state);
  }
}

/**
 * Advances the open shop by `dtMinutes` game minutes (already scaled by the
 * game speed) in fixed one-minute ticks. The leftover fraction stays in
 * `state.tickAccumulator` for render interpolation. Time stands still while
 * paused and in the preparation and report phases.
 */
export function step(state: GameState, dtMinutes: number): void {
  if (state.paused || !isOpen(state) || !(dtMinutes > 0)) return;
  state.tickAccumulator += dtMinutes;
  let ticks = 0;
  while (state.tickAccumulator >= 1 && isOpen(state)) {
    state.tickAccumulator -= 1;
    tick(state);
    if (++ticks >= MAX_TICKS_PER_STEP) {
      state.tickAccumulator = 0;
      break;
    }
  }
  if (!isOpen(state)) state.tickAccumulator = 0;
}

/**
 * Moves customers and staff that stand inside furniture or walls to the
 * nearest free spot. Saves from before the nav grid can hold such spots
 * (the old line ran across the chairs); people on free floor stay put.
 */
export function settleActors(state: GameState): void {
  const grid = buildNavGrid(getShopLayout(state));
  for (const actor of [...state.customers, ...state.staff]) {
    const p = nearestFree(grid, actor.pos);
    if (p) actor.pos = p;
  }
}

/**
 * Applies a player command. Returns false when the command does not apply
 * right now (wrong phase, unknown target, task already queued…).
 * 'start_day' opens the shop and 'next_day' leaves the report.
 */
export function dispatch(state: GameState, cmd: Command): boolean {
  switch (cmd.type) {
    case 'start_day':
      return openShop(state);
    case 'next_day':
      if (!startNextDay(state)) return false;
      advanceCampaigns(state);
      startStaffDay(state);
      return true;
    case 'set_speed':
      if (!(cmd.speed > 0)) return false;
      state.speed = cmd.speed;
      return true;
    case 'set_paused':
      state.paused = cmd.paused;
      return true;
    case 'take_order':
      return takeOrder(state, cmd.customerId);
    case 'brew':
      return brew(state, cmd.orderId);
    case 'deliver':
      return deliver(state, cmd.orderId);
    case 'collect_cash':
      return collectCash(state, cmd.tableId);
    case 'clean_table':
      return cleanTable(state, cmd.tableId);
    case 'buy_ingredient':
      if (!Number.isInteger(cmd.packs) || cmd.packs <= 0) return false;
      return buyIngredient(state, cmd.ingredientId, cmd.packs * getIngredient(cmd.ingredientId).packSize).ok;
    case 'apply_restock':
      return applyRestockSuggestion(state).bought.length > 0;
    case 'set_menu_item': {
      const entry = state.menu.find((m) => m.id === cmd.itemId);
      if (!entry) return false;
      if (entry.enabled !== cmd.enabled) toggleMenuItem(state, cmd.itemId);
      return true;
    }
    case 'hire_staff':
      return hireStaff(state, cmd.candidateId, cmd.role) !== null;
    case 'fire_staff':
      return fireStaff(state, cmd.staffId);
    case 'assign_role':
      return assignRole(state, cmd.staffId, cmd.role);
    case 'set_auto_assign':
      setAutoAssign(state, cmd.enabled);
      return true;
    case 'buy_upgrade':
      return buyUpgrade(state, cmd.upgradeId).ok;
    case 'start_campaign':
      return runCampaign(state, cmd.campaignId).ok;
    default:
      return false;
  }
}

export { endOfDay, openShop, startNextDay } from './clock';
export { brew, cleanTable, collectCash, deliver, takeOrder } from './orders';
export {
  applyRestockSuggestion,
  autoRestockSuggestion,
  buyIngredient,
  canMake,
  consume,
  lowStockItems,
  sellable,
  toggleMenuItem,
} from './inventory';
export { buildDailyReport, closeDay } from './report';
export { advanceCampaigns, customerMultiplier, runCampaign } from './marketing';
export { assignRole, autoAssignRoles, fireStaff, hireStaff, rolePlan, setAutoAssign } from './staff';
export { buyUpgrade, getShopLayout, nextUpgradeCost } from './upgrades';
