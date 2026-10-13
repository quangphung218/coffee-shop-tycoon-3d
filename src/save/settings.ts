import { defaultStorage, type StorageLike } from './storage';

export const SETTINGS_KEY = 'cst3d:settings';

export type Quality = 'low' | 'medium' | 'high';
export type GameSpeed = 1 | 2 | 4;
/**
 * 'qe-wasd': Q/E rotate, WASD or arrows pan.
 * 'qa-arrows': Q/A rotate, arrows pan (WASD panning off).
 */
export type CameraKeys = 'qe-wasd' | 'qa-arrows';

export interface Settings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  quality: Quality;
  gameSpeed: GameSpeed;
  cameraKeys: CameraKeys;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  musicVolume: 0.5,
  sfxVolume: 0.8,
  quality: 'medium',
  gameSpeed: 1,
  cameraKeys: 'qe-wasd',
};

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
const SPEEDS: readonly GameSpeed[] = [1, 2, 4];
const CAMERA_KEYS: readonly CameraKeys[] = ['qe-wasd', 'qa-arrows'];

function volume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Fills missing or invalid fields with defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    musicVolume: volume(r.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: volume(r.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    quality: oneOf(r.quality, QUALITIES, DEFAULT_SETTINGS.quality),
    gameSpeed: oneOf(r.gameSpeed, SPEEDS, DEFAULT_SETTINGS.gameSpeed),
    cameraKeys: oneOf(r.cameraKeys, CAMERA_KEYS, DEFAULT_SETTINGS.cameraKeys),
  };
}

/** Never throws; broken or missing data yields defaults. */
export function loadSettings(storage: StorageLike = defaultStorage()): Settings {
  try {
    const text = storage.getItem(SETTINGS_KEY);
    return sanitizeSettings(text === null ? null : JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns false when storage is unavailable or full. */
export function saveSettings(settings: Settings, storage: StorageLike = defaultStorage()): boolean {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
