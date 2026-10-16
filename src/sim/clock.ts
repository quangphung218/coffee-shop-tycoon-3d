import { rollWeather } from './customers';
import { weekUnlockDay } from './data/week';
import { recordRevenue } from './economy';
import { rollMissions, weekDay } from './progression';
import { closeDay } from './report';
import { DAY_START_MINUTE, createDayStats } from './state';
import { grantUpgradeLevel, upgradeLevel } from './upgrades';
import type { GameState, Phase } from './types';

/** Peak windows [start, end) in game minutes: 11:00–13:00 and 17:00–19:00. */
export const PEAK_WINDOWS: readonly (readonly [number, number])[] = [
  [11 * 60, 13 * 60],
  [17 * 60, 19 * 60],
];
/** 20:00: no new customers from here on. */
export const CLOSING_MINUTE = 20 * 60;

export function isPeakMinute(minute: number): boolean {
  return PEAK_WINDOWS.some(([start, end]) => minute >= start && minute < end);
}

/** Phase for an open shop at the given minute. */
export function openPhaseAt(minute: number): Phase {
  if (minute >= CLOSING_MINUTE) return 'closing';
  return isPeakMinute(minute) ? 'peak' : 'opening';
}

export function isOpen(state: GameState): boolean {
  return state.phase === 'opening' || state.phase === 'peak' || state.phase === 'closing';
}

function setPhase(state: GameState, phase: Phase): void {
  if (state.phase === phase) return;
  state.phase = phase;
  state.events.push({ type: 'phase', phase });
}

/** Leaves preparation and opens the doors at 07:00. Returns false outside preparation. */
export function openShop(state: GameState): boolean {
  if (state.phase !== 'preparation') return false;
  state.minute = DAY_START_MINUTE;
  state.tickAccumulator = 0;
  setPhase(state, openPhaseAt(state.minute));
  state.events.push({ type: 'notify', level: 'info', text: 'Quán đã mở cửa!' });
  return true;
}

/** Advances the clock by one game minute and updates the open phase. */
export function advanceClock(state: GameState): void {
  state.minute += 1;
  setPhase(state, openPhaseAt(state.minute));
}

/** End-of-day cleanup once the last customer is gone: pocket table cash and clear tables. */
export function closeUp(state: GameState): void {
  for (const table of state.tables) {
    if (table.cash > 0) {
      state.money += table.cash;
      recordRevenue(state, table.cash);
      state.events.push({ type: 'cash', amount: table.cash, pos: { ...table.pos } });
      table.cash = 0;
    }
    if (table.trash > 0) {
      table.trash = 0;
      state.events.push({ type: 'cleaned', tableId: table.id });
    }
    table.occupants = [];
  }
  state.orders = [];
  state.playerTasks = [];
  state.spawnAccumulator = 0;
}

/**
 * Hook run when the shop is empty after closing: pays wages, updates the
 * rating, stores the daily report in `state.lastReport`, moves to 'report'
 * and emits 'dayEnded' (the UI autosaves on it).
 */
export function endOfDay(state: GameState): void {
  closeDay(state);
  setPhase(state, 'report');
  state.events.push({ type: 'notify', level: 'info', text: `Kết thúc ngày ${state.day}` });
  state.events.push({ type: 'dayEnded', day: state.day });
}

/** Leaves the report and starts the next day in preparation. Returns false outside 'report'. */
export function startNextDay(state: GameState): boolean {
  if (state.phase !== 'report') return false;
  state.history.push(state.today);
  state.day += 1;
  state.minute = DAY_START_MINUTE;
  state.tickAccumulator = 0;
  state.weather = rollWeather(state);
  state.today = createDayStats(state.day, state.rating);
  state.missions = rollMissions(state.seed, state.day, state.shopLevel);
  setPhase(state, 'preparation');
  openWeekDay(state);
  return true;
}

/**
 * Morning of a week day: announces what the calendar opens today and, on the
 * expansion day, gives the shop its side room (expand_area level 1) for free.
 */
function openWeekDay(state: GameState): void {
  if (!state.week) return;
  const entry = weekUnlockDay(weekDay(state));
  if (!entry) return;
  const { menu, upgrades, tools } = entry.unlocks;
  if (menu.length + upgrades.length + tools.length > 0) {
    state.events.push({ type: 'week_unlocks', day: entry.day, unlocks: entry.unlocks });
  }
  if (entry.expandShop && upgradeLevel(state, 'expand_area') < 1) {
    grantUpgradeLevel(state, 'expand_area');
    state.events.push({ type: 'notify', level: 'success', text: 'Quán mở rộng!' });
  }
}
