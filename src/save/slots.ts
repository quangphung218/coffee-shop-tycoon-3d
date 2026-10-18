import { defaultStorage, type StorageLike } from './storage';

export const SAVE_VERSION = 3;
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
  /** Set when the slot holds data that cannot be loaded. */
  error?: SaveErrorKind;
}

export function saveKey(slot: SaveSlot): string {
  return SAVE_KEY_PREFIX + slot;
}

type Raw = Record<string, unknown>;

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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
  if (!state || typeof state.shopName !== 'string' || typeof state.day !== 'number' || typeof state.money !== 'number') {
    return { slot, empty: false, error: 'invalid' };
  }
  const savedAt = typeof file.savedAt === 'number' ? file.savedAt : 0;
  return { slot, empty: false, shopName: state.shopName, day: state.day, money: state.money, savedAt };
}

/**
 * Slot list for the Main Menu without loading the game code: reads only the
 * name, day, money and save time, never upgrades or writes the save. Fields
 * beyond those are checked when the slot is loaded.
 */
export function listSlotSummaries(storage: StorageLike = defaultStorage()): SlotInfo[] {
  return SAVE_SLOTS.map((slot) => summarize(slot, storage));
}
