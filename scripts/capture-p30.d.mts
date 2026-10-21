import type { GameState } from '../src/sim/types';
import type { SaveModule, SimModules } from './capture-p29.mjs';

/** SimModules plus the build's menu data. */
export interface P30Modules extends SimModules {
  menu: { getMenuItem(id: string): { ingredients: readonly { id: string }[] } };
}

export interface P30SaveModule extends SaveModule {
  loadGame(slot: 'auto', storage: unknown): { ok: true; value: GameState } | { ok: false; error: { message: string } };
}

export type SaveText = { key: string; text: string };

export function buildSaves(mods: P30Modules, save: P30SaveModule, p30: boolean): { saves: Record<'noon' | 'heart' | 'sweat' | 'cloud' | 'team' | 'toast' | 'prep', SaveText>; info: string };
export function cloudCheck(mods: P30Modules, save: P30SaveModule, saved: SaveText): { at: number | null; end: number };

/** Face prints per mood: [min x, y, z, max x, y, z] of the brows-and-mouth geometry. */
export type FaceMarks = Record<string, number[]>;
export function faceMarks(rig: typeof import('../src/render/actors/rig')): FaceMarks;
export function matchMood(print: readonly number[], marks: FaceMarks): string | null;
