import type { GameState } from '../sim/types';
import { defaultStorage, type StorageLike } from './storage';

export const SAVE_VERSION = 6;
export const SAVE_KEY_PREFIX = 'cst3d:save:';
export const SAVE_SLOTS = ['auto', '1', '2', '3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

export type SaveErrorKind = 'not_found' | 'corrupt' | 'invalid' | 'version_unsupported' | 'storage';

export interface SlotInfo {
  slot: SaveSlot;
  empty: boolean;
  shopName?: string;
  day?: number;
  money?: number;
  savedAt?: number;
  /** 'YYYY-MM-DD' of the last daily gift claimed (retention.login.lastDate); absent when never claimed or in an older save. */
  giftLastDate?: string;
  /** Daily gift streak day last claimed (retention.login.streak). */
  giftStreak?: number;
  /** Set when the slot holds data that cannot be loaded. */
  error?: SaveErrorKind;
}

export function saveKey(slot: SaveSlot): string {
  return SAVE_KEY_PREFIX + slot;
}

type Raw = Record<string, unknown>;

export function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type FieldKind = 'string' | 'number' | 'array' | 'object';

/** Fields a save must hold, once at SAVE_VERSION, to be loaded. */
const REQUIRED_FIELDS: Record<string, FieldKind> = {
  shopName: 'string',
  difficulty: 'string',
  day: 'number',
  minute: 'number',
  phase: 'string',
  money: 'number',
  rating: 'number',
  rngState: 'number',
  seed: 'number',
  shopLevel: 'number',
  xp: 'number',
  nextId: 'number',
  missions: 'array',
  menu: 'array',
  inventory: 'array',
  customers: 'array',
  staff: 'array',
  tables: 'array',
  events: 'array',
  upgrades: 'object',
  today: 'object',
};

/**
 * Required fields that MIGRATIONS in save.ts always sets, keyed by the version
 * the step upgrades from. Keep in step with MIGRATIONS.
 */
const FILLED_BY_MIGRATION: Record<number, readonly string[]> = {
  0: ['events', 'today'],
  1: ['seed', 'shopLevel', 'xp', 'missions'],
  2: [],
  3: [],
  4: [],
  5: [],
};

function hasKind(s: Raw, key: string, kind: FieldKind): boolean {
  const v = s[key];
  if (kind === 'array') return Array.isArray(v);
  if (kind === 'object') return isObject(v);
  return typeof v === kind;
}

/** Whether `s` holds every required field of a save written at `version`, before migrating. */
function hasRequiredFields(s: Raw, version: number): boolean {
  const filled = new Set<string>();
  for (let v = version; v < SAVE_VERSION; v++) for (const key of FILLED_BY_MIGRATION[v] ?? []) filled.add(key);
  return Object.entries(REQUIRED_FIELDS).every(([key, kind]) => filled.has(key) || hasKind(s, key, kind));
}

export function isValidState(s: unknown): s is GameState {
  return isObject(s) && hasRequiredFields(s, SAVE_VERSION);
}

function summarize(slot: SaveSlot, storage: StorageLike): SlotInfo {
  let text: string | null;
  try {
    text = storage.getItem(saveKey(slot));
  } catch {
    return { slot, empty: false, error: 'storage' };
  }
  if (text === null) return { slot, empty: true };
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { slot, empty: false, error: 'corrupt' };
  }
  if (!isObject(file)) return { slot, empty: false, error: 'invalid' };
  const version = typeof file.version === 'number' ? file.version : 0;
  if (!Number.isInteger(version) || version < 0) return { slot, empty: false, error: 'invalid' };
  if (version > SAVE_VERSION) return { slot, empty: false, error: 'version_unsupported' };
  const state = isObject(file.state) ? file.state : version === 0 ? file : null;
  if (!state || !hasRequiredFields(state, version)) return { slot, empty: false, error: 'invalid' };
  const savedAt = typeof file.savedAt === 'number' ? file.savedAt : 0;
  const info: SlotInfo = { slot, empty: false, shopName: state.shopName as string, day: state.day as number, money: state.money as number, savedAt };
  const login = isObject(state.retention) ? state.retention.login : undefined;
  if (isObject(login)) {
    if (typeof login.lastDate === 'string') info.giftLastDate = login.lastDate;
    if (typeof login.streak === 'number') info.giftStreak = login.streak;
  }
  return info;
}

/**
 * Slot list for the Main Menu without loading the game code: reads only the
 * name, day, money, save time and the daily gift's last date and streak,
 * never upgrades or writes the save. Checks
 * the same required fields as listSlots, leaving out those migration fills
 * in, so both report the same slots as loadable.
 */
export function listSlotSummaries(storage: StorageLike = defaultStorage()): SlotInfo[] {
  return SAVE_SLOTS.map((slot) => summarize(slot, storage));
}
