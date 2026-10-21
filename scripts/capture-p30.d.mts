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
