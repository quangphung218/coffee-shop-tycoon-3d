import type { LoadModule, SaveText, SimModules } from '../lib/saves.mjs';

/** SimModules plus the build's menu data. */
export interface P30Modules extends SimModules {
  menu: { getMenuItem(id: string): { ingredients: readonly { id: string }[] } };
}

export function buildSaves(mods: P30Modules, save: LoadModule, p30: boolean, warn?: (line: string) => void): { saves: Record<'noon' | 'heart' | 'sweat' | 'cloud' | 'team' | 'toast' | 'prep', SaveText>; info: string };
export function cloudCheck(mods: P30Modules, save: LoadModule, saved: SaveText): { at: number | null; end: number };
