import { HISTORY_DAYS } from '../sim/clock';
import { levelForXp, xpToReach } from '../sim/data/levels';
import { MENU } from '../sim/data/menu';
import { WEEK_LENGTH } from '../sim/data/week';
import { settleActors } from '../sim/index';
import { coverLevel, deriveSeed, historyXp, rollMissions } from '../sim/progression';
import { createDayStats } from '../sim/state';
import type { GameState, MenuEntry, UpgradeId, WeekSummary } from '../sim/types';
import { relayoutTables } from '../sim/upgrades';
import { SAVE_SLOTS, SAVE_VERSION, isObject, isValidState, saveKey, type SaveErrorKind, type SaveSlot, type SlotInfo } from './slots';
import { defaultStorage, type StorageLike } from './storage';

export { SAVE_KEY_PREFIX, SAVE_SLOTS, SAVE_VERSION, saveKey } from './slots';
export type { SaveErrorKind, SaveSlot, SlotInfo } from './slots';

export interface SaveFile {
  version: number;
  /** Epoch milliseconds. */
  savedAt: number;
  state: GameState;
}

export interface SaveError {
  kind: SaveErrorKind;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: SaveError };

function fail<T>(kind: SaveErrorKind, message: string): Result<T> {
  return { ok: false, error: { kind, message } };
}

type Raw = Record<string, unknown>;

/**
 * Upgrades from version N to N+1, keyed by N. Required fields a step always
 * sets are listed in FILLED_BY_MIGRATION (slots.ts), so the Main Menu summary
 * agrees with listSlots.
 * Version 0 is the prototype format: a bare GameState without wrapper and
 * without the events/campaigns/orders/history/reviews fields.
 */
const MIGRATIONS: Record<number, (file: Raw) => Raw> = {
  0: (file) => {
    const state = isObject(file.state) ? { ...file.state } : { ...file };
    delete state.version;
    delete state.savedAt;
    state.events ??= [];
    state.campaigns ??= [];
    state.orders ??= [];
    state.history ??= [];
    state.reviews ??= [];
    state.candidates ??= [];
    state.spawnAccumulator ??= 0;
    state.weather ??= 'sunny';
    state.tickAccumulator ??= 0;
    state.playerTasks ??= [];
    if (!isObject(state.today)) {
      const day = typeof state.day === 'number' ? state.day : 1;
      const rating = typeof state.rating === 'number' ? state.rating : 3;
      state.today = createDayStats(day, rating);
    }
    return { version: 1, savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0, state };
  },
  // Adds shop level, XP and daily missions. The level is taken from the days
  // already played, but never below what keeps every owned upgrade and enabled
  // menu item unlocked, so nothing bought before levelling becomes unusable.
  // XP is raised to at least that level's threshold so the XP bar is not
  // negative and the next level-up is not a level the shop already has.
  1: (file) => {
    const state: Raw = isObject(file.state) ? { ...file.state } : {};
    const shopName = typeof state.shopName === 'string' ? state.shopName : '';
    const menu = Array.isArray(state.menu) ? (state.menu as MenuEntry[]) : [];
    const upgrades = isObject(state.upgrades) ? (state.upgrades as Partial<Record<UpgradeId, number>>) : {};
    const history = Array.isArray(state.history) ? (state.history as { customersServed?: number }[]) : [];
    if (typeof state.seed !== 'number') state.seed = deriveSeed(shopName);
    if (typeof state.xp !== 'number') state.xp = historyXp(history);
    if (typeof state.shopLevel !== 'number') {
      state.shopLevel = Math.max(levelForXp(state.xp as number), coverLevel(menu, upgrades));
    }
    state.xp = Math.max(state.xp as number, xpToReach(state.shopLevel as number));
    if (!Array.isArray(state.missions)) {
      const day = typeof state.day === 'number' ? state.day : 1;
      state.missions = rollMissions(state.seed as number, day, state.shopLevel as number);
    }
    return { version: 2, savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0, state };
  },
  // Weeks roll on instead of stopping after day 7. A week gets its index and
  // an archive; a week 1 that v2 already scored gets its archive row now (its
  // result stays, so the week summary still shows and next_day opens week 2).
  // Saves without a week keep none. History is cut like the sim does.
  // That v2 result gets no `reward`: v2 never paid the cup reward, and paying
  // it now would hand out cash for a week already closed, so the week summary
  // hides the reward line instead of showing money that never landed.
  2: (file) => {
    const state: Raw = isObject(file.state) ? { ...file.state } : {};
    if (isObject(state.week)) {
      const week: Raw = { ...state.week };
      if (typeof week.index !== 'number') week.index = 1;
      const archive: unknown[] = Array.isArray(week.archive) ? [...week.archive] : [];
      if (isObject(week.result) && !archive.some((row) => isObject(row) && row.index === week.index)) {
        archive.push(archivedWeek(state, week, week.result));
      }
      week.archive = archive;
      state.week = week;
    }
    if (Array.isArray(state.history) && state.history.length > HISTORY_DAYS) {
      state.history = state.history.slice(-HISTORY_DAYS);
    }
    return { version: 3, savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0, state };
  },
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Archive row of a week a v2 save already scored: revenue, stars, score and
 * cups from the result; profit and customers summed over the week's days in
 * history and today (0 when the save has none of them).
 */
function archivedWeek(state: Raw, week: Raw, result: Raw): WeekSummary {
  const startedDay = num(week.startedDay) || 1;
  const length = num(week.length) || WEEK_LENGTH;
  const days = [...(Array.isArray(state.history) ? state.history : []), state.today].filter(
    (d): d is Raw => isObject(d) && num(d.day) >= startedDay && num(d.day) <= startedDay + length - 1,
  );
  return {
    index: week.index as number,
    startedDay,
    revenue: num(result.revenue),
    profit: days.reduce((s, d) => s + num(d.revenue) - num(d.ingredientCost) - num(d.wages) - num(d.marketingCost), 0),
    customersServed: days.reduce((s, d) => s + num(d.customersServed), 0),
    stars: num(result.stars),
    score: num(result.score),
    cups: num(result.cups),
  };
}

/** Brings a parsed save of any known version up to SAVE_VERSION. */
export function migrate(raw: unknown): Result<SaveFile> {
  if (!isObject(raw)) return fail('invalid', 'Save data is not an object');
  let file: Raw = raw;
  let version = typeof file.version === 'number' ? file.version : 0;
  if (!Number.isInteger(version) || version < 0) return fail('invalid', `Bad save version: ${String(file.version)}`);
  if (version > SAVE_VERSION) return fail('version_unsupported', `Save version ${version} is newer than ${SAVE_VERSION}`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return fail('version_unsupported', `No migration from version ${version}`);
    file = step(file);
    version = file.version as number;
  }
  if (!isValidState(file.state)) return fail('invalid', 'Save data is missing required game fields');
  addMissingMenuItems(file.state);
  try {
    relayoutTables(file.state);
  } catch {
    // Tables that cannot be read keep their saved spots.
  }
  try {
    settleActors(file.state);
  } catch {
    // Positions are only where people stand; a layout that cannot be read leaves them as saved.
  }
  return { ok: true, value: { version, savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0, state: file.state } };
}

/**
 * Adds the menu items the game gained after the save was written (the frappe
 * came with v2), switched off at their default price, so they can be enabled
 * once the shop level allows. Runs on every load, so a v2 save written before
 * an item existed gets it too. Entries keep the order of MENU; entries for
 * items the game no longer knows stay at the end, switched off: the sim looks
 * up every enabled item and would throw on them.
 */
function addMissingMenuItems(state: GameState): void {
  const saved = new Map(state.menu.filter(isObject).map((m) => [m.id, m]));
  const known = new Set<unknown>(MENU.map((m) => m.id));
  state.menu = [
    ...MENU.map((item) => saved.get(item.id) ?? { id: item.id, enabled: false, price: item.price }),
    ...state.menu.filter((m) => !isObject(m) || !known.has(m.id)).map((m) => (isObject(m) ? { ...m, enabled: false } : m)),
  ];
}

function readSlot(slot: SaveSlot, storage: StorageLike): Result<SaveFile> {
  let text: string | null;
  try {
    text = storage.getItem(saveKey(slot));
  } catch (e) {
    return fail('storage', `Cannot read storage: ${String(e)}`);
  }
  if (text === null) return fail('not_found', `Slot ${slot} is empty`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('corrupt', `Slot ${slot} contains invalid JSON`);
  }
  return migrate(parsed);
}

/** Writes the state to a slot. Transient events are not saved. */
export function saveGame(
  state: GameState,
  slot: SaveSlot,
  storage: StorageLike = defaultStorage(),
  now: number = Date.now(),
): Result<SaveFile> {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state: { ...state, events: [] } };
  try {
    storage.setItem(saveKey(slot), JSON.stringify(file));
  } catch (e) {
    return fail('storage', `Cannot write storage: ${String(e)}`);
  }
  return { ok: true, value: file };
}

/** Saves into the 'auto' slot; called at the end of every day. */
export function autosave(state: GameState, storage: StorageLike = defaultStorage(), now: number = Date.now()): Result<SaveFile> {
  return saveGame(state, 'auto', storage, now);
}

/** Reads a slot. Never throws and never modifies the stored data, even when it is broken. */
export function loadGame(slot: SaveSlot, storage: StorageLike = defaultStorage()): Result<GameState> {
  const r = readSlot(slot, storage);
  return r.ok ? { ok: true, value: r.value.state } : r;
}

export function deleteSave(slot: SaveSlot, storage: StorageLike = defaultStorage()): Result<true> {
  try {
    storage.removeItem(saveKey(slot));
  } catch (e) {
    return fail('storage', `Cannot write storage: ${String(e)}`);
  }
  return { ok: true, value: true };
}

export function listSlots(storage: StorageLike = defaultStorage()): SlotInfo[] {
  return SAVE_SLOTS.map((slot) => {
    const r = readSlot(slot, storage);
    if (r.ok) {
      const { state, savedAt } = r.value;
      return { slot, empty: false, shopName: state.shopName, day: state.day, money: state.money, savedAt };
    }
    if (r.error.kind === 'not_found') return { slot, empty: true };
    return { slot, empty: false, error: r.error.kind };
  });
}
