import type { GameState, Weather } from '../src/sim/types';

export interface SceneSpec {
  weather: Weather;
  minute: number;
}

/** The build's sim modules, loaded through vite (or imported directly in tests). */
export interface SimModules {
  stateMod: { createNewGame(shopName: string, difficulty: string, seed: number): GameState };
  sim: { dispatch(state: GameState, cmd: object): boolean; step(state: GameState, dtMinutes: number): void };
  orders: { isClaimed(state: GameState, kind: string, id: number, by: unknown): boolean };
}

export interface SaveModule {
  saveGame(state: GameState, slot: 'auto', storage: unknown, now: number): { ok: true } | { ok: false; error: { message: string } };
  saveKey(slot: 'auto'): string;
}

export const SCENE_DAY: number;
export const SCENES: Readonly<Record<'dusk-rain' | 'noon-sunny', SceneSpec>>;
export const SCENE_IDS: readonly string[];
export const SHOT_MINUTES: readonly number[];
export const SHOT_WEATHERS: readonly Weather[];
export const SHOT_QUALITIES: readonly ('high' | 'low')[];
export function hhmm(minute: number): string;
export function shotName(shot: { minute: number; weather: Weather; quality: string; width: number }): string;
export function saveText(save: SaveModule, state: GameState, now?: number): { key: string; text: string };
export function playToScene(mods: SimModules, scene: SceneSpec, seed?: number): GameState;
export function playToLevelUp(mods: SimModules, seed?: number): GameState;
export function sceneSaves(
  root: string,
  scenes: readonly (SceneSpec & { id: string })[],
  options?: { withLevelUp?: boolean },
): Promise<Record<string, { key: string; text: string; info: string }>>;
