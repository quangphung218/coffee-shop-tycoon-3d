import { appendPlayLog, type PlayLogKind, type PlayLogPhase } from '../../save/playlog';
import { autosave, loadGame, saveGame, type SaveSlot } from '../../save/save';
import { loadSettings, type Settings } from '../../save/settings';
import { defaultStorage, type StorageLike } from '../../save/storage';
import { dispatch as simDispatch } from '../../sim';
import { createNewGame as createGameState } from '../../sim/state';
import type { Command, GameEvent, GameState } from '../../sim/types';
import { isTyping } from '../core/dom';
import { formatClock } from '../core/format';
import { SceneGate } from '../core/sceneGate';
import { ScreenManager } from '../core/screens';
import { trackScrollActivity } from '../core/scrollActivity';
import { Toasts } from '../core/toast';
import { toastForEvent } from '../hud/events';
import { createHud, HUD_SPEEDS, phaseLabel, type Hud } from '../hud/hud';
import { openOtherPanel } from '../panels/widgets';
import { createDailyReport, type DailyReportView, type SaveStatus } from '../report';
import { createLoadGame } from './loadGame';
import { createMainMenu } from './mainMenu';
import { createNewGame } from './newGame';
import { createPause } from './pause';
import { createSettings, type SettingsScreen } from './settings';
import { createWeekEnd } from './weekEnd';

export type ShellScreen = 'menu' | 'newGame' | 'load' | 'settings' | 'pause' | 'weekEnd';

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

export interface Shell {
  /** Running game, or null on the main menu. */
  readonly state: GameState | null;
  readonly settings: Settings;
  /** Visible full-screen layer, or null during gameplay. */
  readonly screen: ShellScreen | null;
  readonly hud: Hud;
  /** Daily Report overlay, shown in the report phase when no other screen is up. */
  readonly report: DailyReportView;
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

/** Random play-log run id; not tied to the player or the save. */
function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Owns the overlay UI: main menu, new game, load, settings, pause, week end,
 * HUD and toasts, plus the keyboard shortcuts (Space, 1/2/3, Home, Esc).
 */
export function createShell(options: ShellOptions): Shell {
  const storage = options.storage ?? defaultStorage();
  let settings: Settings = options.settings ?? loadSettings(storage);
  let state: GameState | null = null;
  let settingsReturn: ShellScreen = 'menu';
  const root = options.root;
  const scene = options.scene ?? new SceneGate();

  const screens = new ScreenManager<ShellScreen>(root);
  const toasts = new Toasts();

  // "Giảm chuyển động = Luôn giảm" forces the reduced-motion CSS (ui.css,
  // tokens.css) on even when the OS does not ask for it; "Theo máy" leaves it
  // to the prefers-reduced-motion media query.
  function applyReducedMotion(s: Settings): void {
    root.ownerDocument.documentElement.classList.toggle('reduce-motion', s.reducedMotion === 'reduce');
  }
  applyReducedMotion(settings);

  function dispatch(cmd: Command): boolean {
    return state ? simDispatch(state, cmd) : false;
  }

  // Anonymous play log (save/playlog.ts): one random id per run, and only the
  // running game's day, phase and minute plus the real time.
  let runId: string | null = null;
  function logPlay(kind: PlayLogKind, phase?: PlayLogPhase): void {
    if (!state || runId === null) return;
    appendPlayLog({ v: 1, run: runId, kind, day: state.day, phase: phase ?? state.phase, minute: state.minute, at: Date.now() }, storage);
  }
  // Leaving from the week-end screen is logged as 'week_end', not the day's last phase.
  function leavePhase(): PlayLogPhase | undefined {
    return screens.current === 'weekEnd' ? 'week_end' : undefined;
  }

  const hud = createHud({
    dispatch,
    getState: () => state,
    onPause: () => openPause(),
    onSettings: () => openSettings(),
    onResetCamera: () => options.onResetCamera?.(),
  });
  function runAutosave(game: GameState, day: number): SaveStatus {
    const r = autosave(game, storage);
    return r.ok ? { day, ok: true, savedAt: r.value.savedAt } : { day, ok: false };
  }
  // "Thử lưu lại" on the Daily Report and "Thử lại" on the week end save the same day;
  // each tells the other screen the new result.
  function retryAutosave(): SaveStatus {
    return state ? runAutosave(state, state.lastReport?.day ?? state.day) : { day: 0, ok: false };
  }
  const report = createDailyReport({
    dispatch: (cmd) => {
      const ok = dispatch(cmd);
      if (state) hud.update(state);
      syncReport();
      // "Ngày tiếp theo" closes the report; keep focus on the HUD's next step ("Mở cửa").
      if (!report.visible) hud.el.querySelector<HTMLElement>('.hud-btn-cta:not([hidden])')?.focus();
      return ok;
    },
    onRetrySave: () => {
      const r = retryAutosave();
      weekEnd.setSaveStatus(r);
      return r;
    },
    // An insight's action link leaves the report (next day) and opens the dock panel to act on.
    onOpenPanel: (panel) => {
      dispatch({ type: 'next_day' });
      if (state) hud.update(state);
      syncReport();
      openOtherPanel(panel);
    },
    onWeekEnd: () => {
      screens.show('weekEnd');
      syncReport();
    },
  });
  root.append(hud.el, hud.panelEl, report.el, toasts.el);

  function syncReport(): void {
    report.update(state, state?.phase === 'report' && screens.current === null);
  }

  function startGame(next: GameState): void {
    state = next;
    state.speed = settings.gameSpeed;
    state.paused = false;
    state.events = [];
    runId = newRunId();
    logPlay('run_start');
    hud.closePanel();
    toasts.clear();
    hud.el.hidden = false;
    screens.show(null);
    hud.update(state);
    report.setSaveStatus(null);
    weekEnd.setSaveStatus(null);
    syncReport();
    options.onGameStart?.(state);
    if (!report.visible) hud.el.querySelector<HTMLElement>('.hud-btn-cta:not([hidden])')?.focus();
  }

  function showMenu(): void {
    logPlay('quit_to_menu', leavePhase());
    state = null;
    runId = null;
    hud.closePanel();
    toasts.clear();
    hud.el.hidden = true;
    screens.show('menu');
    syncReport();
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
    }, scene),
  );
  screens.add(
    'newGame',
    createNewGame({
      onStart: (name, difficulty) => startGame(createGameState(name, difficulty, options.seed?.() ?? (Date.now() >>> 0))),
      onBack: () => screens.show('menu'),
    }, scene),
  );
  screens.add(
    'load',
    createLoadGame(storage, {
      onLoaded: (loaded) => startGame(loaded),
      onBack: () => screens.show('menu'),
    }, scene),
  );
  const settingsScreen: SettingsScreen = createSettings(storage, settings, {
    onChange: (next) => {
      settings = next;
      if (state) state.speed = next.gameSpeed;
      applyReducedMotion(next);
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
  const weekEnd = createWeekEnd({
    getState: () => state,
    // A new week for the same shop name and difficulty, on a fresh seed.
    onReplay: () => {
      if (!state) return;
      const finished = state;
      logPlay('replay');
      options.onReplay?.(finished);
      startGame(createGameState(finished.shopName, finished.difficulty, options.seed?.() ?? (Date.now() >>> 0)));
    },
    onMenu: showMenu,
    onRetrySave: () => {
      const r = retryAutosave();
      report.setSaveStatus(r);
      return r;
    },
  });
  screens.add('weekEnd', weekEnd);

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
    if (target instanceof Node && (hud.panelEl.contains(target) || report.el.contains(target))) return false;
    return screens.current === null || screens.current === 'pause';
  }
  function onVisibility(): void {
    logPlay(document.hidden ? 'hidden' : 'visible', leavePhase());
    if (document.hidden && state && screens.current === null) openPause();
  }
  // Closing the tab or navigating away may skip visibilitychange on some browsers.
  function onPageHide(): void {
    logPlay('hidden', leavePhase());
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  // Scroll areas show their thin bar while scrolling (scrollbar.css).
  const stopScrollActivity = trackScrollActivity(root.ownerDocument);

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
    report,
    toasts,
    dispatch,
    update() {
      if (state) hud.update(state);
      syncReport();
    },
    handleEvents(events) {
      if (!state) return;
      for (const event of events) {
        const toast = toastForEvent(event, state);
        if (toast) toasts.show(toast);
        if (event.type === 'phase') logPlay('phase', event.phase);
        else if (event.type === 'week_ended') logPlay('week_end');
        if (event.type === 'dayEnded') {
          logPlay('day_end');
          const r = runAutosave(state, event.day);
          report.setSaveStatus(r);
          weekEnd.setSaveStatus(r);
          toasts.show(
            r.ok
              ? { level: 'success', icon: 'i-save', title: `Đã tự lưu ngày ${event.day}` }
              : { level: 'error', icon: 'i-save', title: 'Không tự lưu được', text: 'Bộ nhớ trình duyệt đầy hoặc bị chặn. Thử lưu tay trong Tạm dừng.' },
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
      window.removeEventListener('pagehide', onPageHide);
      stopScrollActivity();
      hud.dispose();
      toasts.clear();
      root.replaceChildren();
    },
  };
}
