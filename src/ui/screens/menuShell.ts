import { loadSettings, type Settings } from '../../save/settings';
import type { SaveSlot } from '../../save/slots';
import { defaultStorage, type StorageLike } from '../../save/storage';
import type { GameState } from '../../sim/types';
import { SceneGate } from '../core/sceneGate';
import { ScreenManager } from '../core/screens';
import { trackScrollActivity } from '../core/scrollActivity';
import { createMainMenu } from './mainMenu';
import { createSettings } from './settings';

export type ShellScreen = 'menu' | 'newGame' | 'load' | 'settings' | 'pause' | 'weekEnd' | 'bankrupt';

export interface ShellOptions {
  /** The #ui overlay element. */
  root: HTMLElement;
  storage?: StorageLike;
  /** Starting settings; read from storage when omitted. */
  settings?: Settings;
  /** Applies changed settings outside the UI (audio, renderer, camera keys). */
  onSettingsChange?(settings: Settings): void;
  onResetCamera?(): void;
  /** A game was started or loaded. */
  onGameStart?(state: GameState): void;
  /** Back on the main menu, no game running. */
  onMenu?(): void;
  /** Seed for new games. */
  seed?(): number;
  /** "Chơi lại" on the week-end screen, called with the finished game before the new one starts. */
  onReplay?(finished: GameState): void;
  /** Loading state of the 3D scene; the buttons that enter the shop wait for it. Always ready when omitted. */
  scene?: SceneGate;
}

/** What the game part (game.ts) hands to the menu shell when it is attached. */
export interface GameMount {
  /** "Tiếp tục" on the Main Menu. */
  continueGame(slot: SaveSlot): void;
  /** Settings is opening: pauses a running game and returns where Back goes. */
  beforeSettings(): ShellScreen;
  /** A changed setting, before it is applied outside the UI. */
  onSettingsChange(settings: Settings): void;
  /** Keys the menu shell did not handle (every key except an Esc a screen took). */
  onKeyDown(e: KeyboardEvent): void;
  onKeyUp(e: KeyboardEvent): void;
  /** Removes the game's listeners; the menu shell clears the root afterwards. */
  teardown(): void;
}

/**
 * Main Menu and Settings without the game code (sim, HUD, report, panels,
 * save.ts), so the menu can show before the game chunk arrives.
 */
export interface MenuShell {
  readonly root: HTMLElement;
  readonly storage: StorageLike;
  readonly scene: SceneGate;
  readonly screens: ScreenManager<ShellScreen>;
  readonly settings: Settings;
  /** True once attachGame was called. */
  readonly attached: boolean;
  openSettings(): void;
  /**
   * Plugs in the game part. "Ván mới" or "Tải game" pressed before this
   * opens its screen now, unless the player has left the menu since.
   */
  attachGame(game: GameMount): void;
  dispose(): void;
}

export function createMenuShell(options: ShellOptions): MenuShell {
  const storage = options.storage ?? defaultStorage();
  let settings: Settings = options.settings ?? loadSettings(storage);
  let settingsReturn: ShellScreen = 'menu';
  let game: GameMount | null = null;
  // "Ván mới" / "Tải game" pressed before the game part is attached.
  let pending: 'newGame' | 'load' | null = null;
  const root = options.root;
  const scene = options.scene ?? new SceneGate();

  const screens = new ScreenManager<ShellScreen>(root);

  // "Giảm chuyển động = Luôn giảm" forces the reduced-motion CSS (ui.css,
  // tokens.css) on even when the OS does not ask for it; "Theo máy" leaves it
  // to the prefers-reduced-motion media query.
  function applyReducedMotion(s: Settings): void {
    root.ownerDocument.documentElement.classList.toggle('reduce-motion', s.reducedMotion === 'reduce');
  }
  applyReducedMotion(settings);

  function openGameScreen(name: 'newGame' | 'load'): void {
    if (game) screens.show(name);
    else pending = name;
  }

  function openSettings(): void {
    pending = null;
    settingsReturn = game ? game.beforeSettings() : 'menu';
    screens.show('settings');
  }

  screens.add(
    'menu',
    createMainMenu(storage, {
      // The scene gate keeps "Tiếp tục" locked until the game part is in.
      onContinue: (slot) => game?.continueGame(slot),
      onNewGame: () => openGameScreen('newGame'),
      onLoad: () => openGameScreen('load'),
      onSettings: () => openSettings(),
    }, scene),
  );
  screens.add(
    'settings',
    createSettings(storage, settings, {
      onChange: (next) => {
        settings = next;
        game?.onSettingsChange(next);
        applyReducedMotion(next);
        options.onSettingsChange?.(next);
      },
      onBack: () => screens.show(settingsReturn),
    }),
  );

  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && screens.escape()) {
      e.preventDefault();
      return;
    }
    game?.onKeyDown(e);
  }
  function onKeyUp(e: KeyboardEvent): void {
    game?.onKeyUp(e);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Scroll areas show their thin bar while scrolling (scrollbar.css).
  const stopScrollActivity = trackScrollActivity(root.ownerDocument);

  screens.show('menu');
  options.onMenu?.();

  return {
    root,
    storage,
    scene,
    screens,
    get settings() {
      return { ...settings };
    },
    get attached() {
      return game !== null;
    },
    openSettings,
    attachGame(next) {
      game = next;
      const open = pending;
      pending = null;
      if (open && screens.current === 'menu') screens.show(open);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stopScrollActivity();
      game?.teardown();
      root.replaceChildren();
    },
  };
}
