import { autosave, loadGame, saveGame, type SaveSlot } from '../../save/save';
import { loadSettings, type Settings } from '../../save/settings';
import { defaultStorage, type StorageLike } from '../../save/storage';
import { dispatch as simDispatch } from '../../sim';
import { createNewGame as createGameState } from '../../sim/state';
import type { Command, GameEvent, GameState } from '../../sim/types';
import { isTyping } from '../core/dom';
import { formatClock } from '../core/format';
import { ScreenManager } from '../core/screens';
import { Toasts } from '../core/toast';
import { toastForEvent } from '../hud/events';
import { createHud, HUD_SPEEDS, phaseLabel, type Hud } from '../hud/hud';
import { createLoadGame } from './loadGame';
import { createMainMenu } from './mainMenu';
import { createNewGame } from './newGame';
import { createPause } from './pause';
import { createSettings, type SettingsScreen } from './settings';

export type ShellScreen = 'menu' | 'newGame' | 'load' | 'settings' | 'pause';

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
}

export interface Shell {
  /** Running game, or null on the main menu. */
  readonly state: GameState | null;
  readonly settings: Settings;
  /** Visible full-screen layer, or null during gameplay. */
  readonly screen: ShellScreen | null;
  readonly hud: Hud;
  readonly toasts: Toasts;
  /** Single entry for player commands from the UI and scene picking. */
  dispatch(cmd: Command): boolean;
  /** Per-frame UI refresh. */
  update(): void;
  /** Toasts and autosave for this frame's events; the caller clears the queue. */
  handleEvents(events: readonly GameEvent[]): void;
  startGame(state: GameState): void;
  showMenu(): void;
  openPause(): void;
  dispose(): void;
}

/**
 * Owns the overlay UI: main menu, new game, load, settings, pause, HUD and
 * toasts, plus the keyboard shortcuts (Space, 1/2/3, Home, Esc).
 */
export function createShell(options: ShellOptions): Shell {
  const storage = options.storage ?? defaultStorage();
  let settings: Settings = options.settings ?? loadSettings(storage);
  let state: GameState | null = null;
  let settingsReturn: ShellScreen = 'menu';
  const root = options.root;

  const screens = new ScreenManager<ShellScreen>(root);
  const toasts = new Toasts();

  function dispatch(cmd: Command): boolean {
    return state ? simDispatch(state, cmd) : false;
  }

  const hud = createHud({
    dispatch,
    getState: () => state,
    onPause: () => openPause(),
    onSettings: () => openSettings(),
    onResetCamera: () => options.onResetCamera?.(),
  });
  root.append(hud.el, hud.panelEl, toasts.el);

  function startGame(next: GameState): void {
    state = next;
    state.speed = settings.gameSpeed;
    state.paused = false;
    state.events = [];
    hud.closePanel();
    toasts.clear();
    hud.el.hidden = false;
    screens.show(null);
    hud.update(state);
    options.onGameStart?.(state);
    hud.el.querySelector<HTMLElement>('.hud-btn-cta:not([hidden])')?.focus();
  }

  function showMenu(): void {
    state = null;
    hud.closePanel();
    toasts.clear();
    hud.el.hidden = true;
    screens.show('menu');
    options.onMenu?.();
  }

  function openPause(): void {
    if (!state) return;
    hud.closePanel();
    simDispatch(state, { type: 'set_paused', paused: true });
    screens.show('pause');
  }

  function resume(): void {
    if (!state) return;
    simDispatch(state, { type: 'set_paused', paused: false });
    screens.show(null);
    hud.el.querySelector<HTMLElement>('[data-action="pause"]')?.focus();
  }

  function openSettings(): void {
    if (state) {
      simDispatch(state, { type: 'set_paused', paused: true });
      settingsReturn = 'pause';
    } else {
      settingsReturn = 'menu';
    }
    screens.show('settings');
  }

  screens.add(
    'menu',
    createMainMenu(storage, {
      onContinue: (slot) => {
        const r = loadGame(slot, storage);
        if (r.ok) startGame(r.value);
        // The load screen explains what is wrong with the slot.
        else screens.show('load');
      },
      onNewGame: () => screens.show('newGame'),
      onLoad: () => screens.show('load'),
      onSettings: () => openSettings(),
    }),
  );
  screens.add(
    'newGame',
    createNewGame({
      onStart: (name, difficulty) => startGame(createGameState(name, difficulty, options.seed?.() ?? (Date.now() >>> 0))),
      onBack: () => screens.show('menu'),
    }),
  );
  screens.add(
    'load',
    createLoadGame(storage, {
      onLoaded: (loaded) => startGame(loaded),
      onBack: () => screens.show('menu'),
    }),
  );
  const settingsScreen: SettingsScreen = createSettings(storage, settings, {
    onChange: (next) => {
      settings = next;
      if (state) state.speed = next.gameSpeed;
      options.onSettingsChange?.(next);
    },
    onBack: () => screens.show(settingsReturn),
  });
  screens.add('settings', settingsScreen);
  screens.add(
    'pause',
    createPause({
      onResume: resume,
      onSave: (slot: SaveSlot) => {
        if (!state) return 'Chưa có ván nào đang chơi';
        const r = saveGame(state, slot, storage);
        return r.ok ? null : 'Không lưu được: bộ nhớ trình duyệt đầy hoặc bị chặn';
      },
      onSettings: openSettings,
      onMenu: showMenu,
      subtitle: () => (state ? `${state.shopName} · Ngày ${state.day} · ${formatClock(state.minute)} · ${phaseLabel(state.phase)}` : ''),
    }),
  );

  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (screens.escape()) e.preventDefault();
      else if (state && screens.current === null) {
        e.preventDefault();
        if (hud.openPanelId !== null) hud.closePanel();
        else openPause();
      }
      return;
    }
    if (!state || isTyping(e.target)) return;
    if (e.code === 'Space' && spaceTogglesPause(e.target)) {
      // Space always toggles pause, even with a button focused.
      e.preventDefault();
      if (screens.current === 'pause') resume();
      else openPause();
      return;
    }
    if (screens.current !== null) return;
    const speedIndex = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (speedIndex >= 0) {
      dispatch({ type: 'set_speed', speed: HUD_SPEEDS[speedIndex]! });
      return;
    }
    if (e.code === 'Home') {
      e.preventDefault();
      options.onResetCamera?.();
    }
  }
  // Stops the browser from also "clicking" a focused button on Space key-up.
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space' && state && !isTyping(e.target) && spaceTogglesPause(e.target)) e.preventDefault();
  }
  // Space keeps its usual meaning (press the focused control) on Settings and other screens.
  function spaceTogglesPause(target: EventTarget | null): boolean {
    if (target instanceof Node && hud.panelEl.contains(target)) return false;
    return screens.current === null || screens.current === 'pause';
  }
  function onVisibility(): void {
    if (document.hidden && state && screens.current === null) openPause();
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);

  showMenu();

  return {
    get state() {
      return state;
    },
    get settings() {
      return { ...settings };
    },
    get screen() {
      return screens.current;
    },
    hud,
    toasts,
    dispatch,
    update() {
      if (state) hud.update(state);
    },
    handleEvents(events) {
      if (!state) return;
      for (const event of events) {
        const toast = toastForEvent(event, state);
        if (toast) toasts.show(toast);
        if (event.type === 'dayEnded') {
          const r = autosave(state, storage);
          toasts.show(
            r.ok
              ? { level: 'success', icon: '💾', title: `Đã tự lưu ngày ${event.day}` }
              : { level: 'error', icon: '💾', title: 'Không tự lưu được', text: 'Bộ nhớ trình duyệt đầy hoặc bị chặn. Thử lưu tay trong Tạm dừng.' },
          );
        }
      }
    },
    startGame,
    showMenu,
    openPause,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      hud.dispose();
      toasts.clear();
      root.replaceChildren();
    },
  };
}
