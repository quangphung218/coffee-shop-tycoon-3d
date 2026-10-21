import type { GameState, Weather } from '../../src/sim/types';

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

export interface LoadModule extends SaveModule {
  loadGame(slot: 'auto', storage: unknown): { ok: true; value: GameState } | { ok: false; error: { message: string } };
}

export type SaveText = { key: string; text: string };

export const SCENE_DAY: number;
export const SEED: number;
export const SCENES: Readonly<Record<'dusk-rain' | 'noon-sunny', SceneSpec>>;
export const SCENE_IDS: readonly string[];
export const SHOT_MINUTES: readonly number[];
export const SHOT_WEATHERS: readonly Weather[];
export const SHOT_QUALITIES: readonly ('high' | 'low')[];
export function hhmm(minute: number): string;
export function clockOf(minute: number): string;
export function shotName(shot: { minute: number; weather: Weather; quality: string; width: number }): string;
export function saveText(save: SaveModule, state: GameState, now?: number): SaveText;
export function loadSave(save: LoadModule, saved: SaveText): GameState;
export function autoPlay(mods: SimModules, state: GameState): void;
export function playDay(mods: SimModules, state: GameState, options?: { weather?: Weather; until?: (s: GameState) => boolean }): void;
export function playToReport(mods: SimModules, state: GameState, lastDay: number): GameState;
export function openNextMorning(mods: SimModules, state: GameState): GameState;
export function newGame(mods: SimModules, seed?: number): GameState;
export function playToScene(mods: SimModules, scene: SceneSpec, seed?: number): GameState;
export function playToLevelUp(mods: SimModules, seed?: number): GameState;
export function sceneInfo(state: GameState): string;
export function sceneSavesOf(mods: SimModules & { save: SaveModule }, scenes: readonly (SceneSpec & { id: string })[], options?: { withLevelUp?: boolean; seed?: number }): Record<string, SaveText & { info: string }>;
export function sceneSaves(
  root: string,
  scenes: readonly (SceneSpec & { id: string })[],
  options?: { withLevelUp?: boolean; seed?: number },
): Promise<Record<string, SaveText & { info: string }>>;
