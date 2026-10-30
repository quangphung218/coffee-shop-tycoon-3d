import { advanceClock, closeUp, endOfDay, isOpen, openShop, startNextDay } from './clock';
import { spawnArrivals, updateCustomers } from './customers';
import { getIngredient } from './data/ingredients';
import { applyRestockSuggestion, buyIngredient, toggleMenuItem } from './inventory';
import { advanceCampaigns, runCampaign } from './marketing';
import { brew, cleanTable, collectCash, deliver, takeOrder, updatePlayerTasks } from './orders';
import { isUnlocked } from './progression';
import { recordExperiencesSince } from './reviews';
import { assignRole, clearStaffTasks, fireStaff, hireStaff, placeStaff, setAutoAssign, startStaffDay, updateStaff } from './staff';
import { buildNavGrid, nearestFree } from './nav';
import { buyUpgrade, getShopLayout, menuBlockedReason, removeDecor } from './upgrades';
import { setPolicy } from './policies';
import { getMenuItem } from './data/menu';
import { getUpgrade } from './data/upgrades';
import { claimDailyGift } from './retention';
import { startDaySpecialOrder, tickSpecialOrders } from './specialOrders';
import { trainStaff } from './staffGrowth';
import { uniformById, uniformOf } from './data/uniforms';
import { buyStyle, selectStyle } from './styles';
import type { Command, GameState } from './types';

/** Upper bound on ticks per step so a long frame hitch cannot freeze the page. */
export const MAX_TICKS_PER_STEP = 240;

/** Samples seat use for this open minute: how many seats are occupied right now. */
function accrueSeatMinutes(state: GameState): void {
  if (state.today.seatMinutesUsed === undefined) return;
  let occupied = 0;
  for (const table of state.tables) occupied += table.occupants.length;
  state.today.seatMinutesUsed += occupied;
}

/** One fixed tick: one game minute. */
function tick(state: GameState): void {
  advanceClock(state);
  if (state.phase !== 'closing') {
    spawnArrivals(state);
    accrueSeatMinutes(state);
  }
  const eventsBefore = state.events.length;
  updatePlayerTasks(state);
  updateStaff(state);
  updateCustomers(state);
  tickSpecialOrders(state);
  // Customers who just started waiting got their takeaway spot after staff were placed; keep staff off it.
  placeStaff(state);
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
      if (!openShop(state)) return false;
      startDaySpecialOrder(state);
      return true;
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
      if (cmd.enabled && !isUnlocked(state, 'menu', cmd.itemId)) {
        state.events.push({ type: 'notify', level: 'error', text: `${getMenuItem(cmd.itemId).name} chưa mở khóa ở cấp quán này` });
        return false;
      }
      const blocked = cmd.enabled ? menuBlockedReason(state, cmd.itemId) : null;
      if (blocked) {
        state.events.push({ type: 'notify', level: 'error', text: blocked });
        return false;
      }
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
      if (!isUnlocked(state, 'upgrade', cmd.upgradeId)) {
        state.events.push({ type: 'notify', level: 'error', text: `${getUpgrade(cmd.upgradeId).name} chưa mở khóa ở cấp quán này` });
        return false;
      }
      return buyUpgrade(state, cmd.upgradeId).ok;
    case 'remove_decor':
      return removeDecor(state, cmd.upgradeId).ok;
    case 'set_policy':
      return setPolicy(state, cmd.policy, cmd.level);
    case 'start_campaign':
      return runCampaign(state, cmd.campaignId).ok;
    case 'train_staff':
      return trainStaff(state, cmd.staffId);
    case 'claim_daily_gift':
      return claimDailyGift(state, cmd.dateKey);
    case 'set_uniform': {
      const uniform = uniformById(cmd.uniformId);
      if (!uniform) {
        state.events.push({ type: 'notify', level: 'error', text: 'Không có bộ đồng phục này' });
        return false;
      }
      if (state.shopLevel < uniform.unlockLevel) {
        state.events.push({ type: 'notify', level: 'error', text: `${uniform.name} mở ở cấp quán ${uniform.unlockLevel}` });
        return false;
      }
      if (uniformOf(state).id === uniform.id) return true;
      state.uniform = uniform.id;
      state.events.push({ type: 'uniform_changed', uniformId: uniform.id });
      return true;
    }
    case 'buy_style':
      return buyStyle(state, cmd.styleId);
    case 'select_style':
      return selectStyle(state, cmd.styleId);
    default:
      return false;
  }
}

export { endOfDay, openShop, startNextDay } from './clock';
export { uniformOf, unlockedUniforms } from './data/uniforms';
export {
  MILESTONE_TICKETS,
  MILESTONE_VISITS,
  REGULAR_BOOK,
  milestonesReached,
  regularBook,
  regularBookEntry,
  type RegularBookEntry,
  type RegularBookPage,
  type RegularMilestone,
} from './data/regularMilestones';
export { STYLES, STYLE_SLOTS, defaultStyle, styleById, stylesOf, type StyleDef } from './data/styles';
export {
  buyStyle,
  canAffordStyle,
  chosenStyles,
  isStyleUnlocked,
  ownsStyle,
  selectStyle,
  styleBlockedReason,
  styleOf,
  unlockStyle,
} from './styles';
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
export { challengeProgress, challengesToUnlock, describeChallenge, nextChallengeStyle, rollWeekChallenge, type ChallengeProgress } from './challenges';
export { buildInsights } from './insights';
export { advanceCampaigns, customerMultiplier, runCampaign } from './marketing';
export { assignRole, autoAssignRoles, fireStaff, hireStaff, rolePlan, setAutoAssign } from './staff';
export { buyUpgrade, getShopLayout, isRemovableDecor, menuBlockedReason, nextUpgradeCost, removeDecor } from './upgrades';
export { PRICE_POLICY, WAGE_POLICY, policyLevel, setPolicy } from './policies';
export {
  isUnlocked,
  missionProgress,
  rollMissions,
  scoreProgression,
  type MissionProgress,
  type ProgressionResult,
} from './progression';
export { LEVELS, MAX_SHOP_LEVEL, levelDef, levelForXp, xpToReach } from './data/levels';
