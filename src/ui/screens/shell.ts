import { mountGame, type Shell } from './game';
import { createMenuShell, type ShellOptions } from './menuShell';

export type { Shell } from './game';
export type { ShellOptions, ShellScreen } from './menuShell';

/**
 * Owns the overlay UI: main menu, new game, load, settings, pause, week end,
 * HUD and toasts, plus the keyboard shortcuts (Space, 1/2/3, Home, Esc).
 * Builds the menu shell and the game part at once; main.ts loads the game
 * part later instead (menuShell.ts, game.ts).
 */
export function createShell(options: ShellOptions): Shell {
  const menu = createMenuShell(options);
  const game = mountGame(menu, options);
  menu.attachGame(game);
  return game;
}
