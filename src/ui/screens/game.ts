import { appendPlayLog, type PlayLogKind, type PlayLogPhase } from '../../save/playlog';
import { autosave, autosaveAtRisk, keepAutosave, loadGame, saveGame, type SaveSlot } from '../../save/save';
import type { Settings } from '../../save/settings';
import { dispatch as simDispatch } from '../../sim';
import { createNewGame as createGameState } from '../../sim/state';
import type { Command, GameEvent, GameState } from '../../sim/types';
import { isTyping } from '../core/dom';
import { formatClock } from '../core/format';
import { MAX_TOASTS, Toasts } from '../core/toast';
import { resetRegularToasts, toastForEvent, uniformUnlockToast } from '../hud/events';
import { createHud, HUD_SPEEDS, phaseLabel, type Hud } from '../hud/hud';
import { openOtherPanel } from '../panels/widgets';
import { createDailyReport, type DailyReportView, type SaveStatus } from '../report';
import { createBankrupt, latestPlayableSave } from './bankrupt';
import { createLoadGame, slotLabel } from './loadGame';
import type { GameMount, MenuShell, ShellOptions, ShellScreen } from './menuShell';
import { createNewGame } from './newGame';
import { createPause } from './pause';
import { createWeekEnd } from './weekEnd';

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
  /** `from` is the slot the game was loaded from; a new run has none. */
  startGame(state: GameState, from?: SaveSlot): void;
  showMenu(): void;
  openPause(): void;
  dispose(): void;
}

/** Random id for a play-log run and, separately, a game run (state.runId); never tied to the player. */
function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * The game part of the overlay UI on top of the menu shell: new game, load,
 * pause, week end, HUD, Daily Report and toasts, plus the keyboard shortcuts
 * (Space, 1/2/3, Home, Esc to pause). Builds its DOM now; call
 * `base.attachGame(game)` to route the menu's buttons and keys to it.
 */
export function mountGame(base: MenuShell, options: ShellOptions): Shell & GameMount {
  const { root, storage, scene, screens } = base;
  let state: GameState | null = null;
  const toasts = new Toasts();

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
    onSettings: () => base.openSettings(),
    onResetCamera: () => options.onResetCamera?.(),
  });
  // Whether the 'auto' slot already holds this run. A new run (or one loaded
  // from a manual slot) first copies what is there to an empty slot, so the
  // last run's autosave is not lost. With no slot free it is replaced only
  // when the player was warned first (Ván mới, the load confirm, Chơi lại);
  // "Tiếp tục" into slot 1–3 was not, so that run skips autosaving until a
  // slot is free.
  let ownsAutosave = false;
  let mayReplaceAutosave = true;
  /** Why the last autosave was held back to keep another run, or null. */
  let autosaveHeld: string | null = null;
  function runAutosave(game: GameState, day: number): SaveStatus {
    autosaveHeld = null;
    if (!ownsAutosave) {
      const kept = keepAutosave(storage, game.runId);
      if (kept.kind === 'kept' && kept.copied) {
        toasts.show({ level: 'info', icon: 'i-save', title: `Đã chép bản tự lưu cũ sang ${slotLabel(kept.slot)}`, text: 'Mở lại trong Tải game.' });
      } else if (kept.kind === 'failed') {
        autosaveHeld = 'Không chép được bản tự lưu của ván trước sang slot trống. Lưu tay ván này trong Tạm dừng.';
      } else if (kept.kind === 'no_room' && !mayReplaceAutosave) {
        autosaveHeld = 'Ô Tự lưu đang giữ ván khác và Slot 1–3 đã đầy. Xoá một slot trong Tải game, hoặc lưu tay trong Tạm dừng.';
      }
      if (autosaveHeld) return { day, ok: false };
    }
    const r = autosave(game, storage);
    if (r.ok) ownsAutosave = true;
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
    // "Xem tổng kết tuần": the week summary, whose "Sang tuần N+1" starts the next week.
    onWeekEnd: () => {
      if (!state?.week?.result) return;
      screens.show('weekEnd');
      syncReport();
    },
  });
  // Under the screens, as when the whole shell was built at once: they share
  // a stacking level and the later element paints on top.
  const firstScreen = screens.get('menu')?.el ?? null;
  for (const el of [hud.el, hud.panelEl, report.el, toasts.el]) root.insertBefore(el, firstScreen);

  function syncReport(): void {
    // A bankrupt run is over: its screen covers everything and nothing goes on.
    if (state?.bankrupt && screens.current !== 'bankrupt') {
      hud.closePanel();
      screens.show('bankrupt');
    }
    report.update(state, state?.phase === 'report' && screens.current === null);
    // Over the report one toast at most; its footer already says the day was saved.
    toasts.limit = report.visible ? 1 : MAX_TOASTS;
  }

  function startGame(next: GameState, from?: SaveSlot): void {
    state = next;
    // A new run (Ván mới, Chơi lại) gets its id here; a loaded one keeps its own.
    state.runId ??= newRunId();
    ownsAutosave = from === 'auto';
    mayReplaceAutosave = true;
    state.speed = base.settings.gameSpeed;
    state.paused = false;
    state.events = [];
    runId = newRunId();
    logPlay('run_start');
    hud.closePanel();
    toasts.clear();
    resetRegularToasts();
    hud.el.hidden = false;
    screens.show(null);
    hud.update(state);
    report.setSaveStatus(null);
    weekEnd.setSaveStatus(null);
    syncReport();
    options.onGameStart?.(state);
    if (!report.visible && screens.current === null) hud.el.querySelector<HTMLElement>('.hud-btn-cta:not([hidden])')?.focus();
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

  // Same screen order as before the split (menu, new game, load, settings…):
  // lookups such as the first form under the root depend on it.
  const settingsEl = screens.get('settings')?.el ?? null;
  const newGame = createNewGame({
    onStart: (name, difficulty) => startGame(createGameState(name, difficulty, options.seed?.() ?? (Date.now() >>> 0))),
    onBack: () => screens.show('menu'),
    autosaveAtRisk: () => autosaveAtRisk(storage),
  }, scene);
  screens.add('newGame', newGame);
  root.insertBefore(newGame.el, settingsEl);
  const load = createLoadGame(storage, {
    onLoaded: (loaded, slot) => startGame(loaded, slot),
    onBack: () => screens.show('menu'),
  }, scene);
  screens.add('load', load);
  root.insertBefore(load.el, settingsEl);
  screens.add(
    'pause',
    createPause({
      onResume: resume,
      onSave: (slot: SaveSlot) => {
        if (!state) return 'Chưa có ván nào đang chơi';
        const r = saveGame(state, slot, storage);
        return r.ok ? null : 'Không lưu được: bộ nhớ trình duyệt đầy hoặc bị chặn';
      },
      onSettings: () => base.openSettings(),
      onMenu: showMenu,
      subtitle: () => (state ? `${state.shopName} · Ngày ${state.day} · ${formatClock(state.minute)} · ${phaseLabel(state.phase)}` : ''),
    }),
  );
  // A new game for the same shop name and difficulty, on a fresh seed.
  function replay(): void {
    if (!state) return;
    const finished = state;
    logPlay('replay');
    options.onReplay?.(finished);
    startGame(createGameState(finished.shopName, finished.difficulty, options.seed?.() ?? (Date.now() >>> 0)));
  }
  const weekEnd = createWeekEnd({
    getState: () => state,
    // Leaves the scored week's report into day 1 of the next week, in preparation.
    onNextWeek: () => {
      if (!state || !dispatch({ type: 'next_day' })) return;
      screens.show(null);
      hud.update(state);
      syncReport();
      hud.el.querySelector<HTMLElement>('.hud-btn-cta:not([hidden])')?.focus();
    },
    onReplay: replay,
    onMenu: showMenu,
    onRetrySave: () => {
      const r = retryAutosave();
      report.setSaveStatus(r);
      return r;
    },
  });
  screens.add('weekEnd', weekEnd);
  screens.add(
    'bankrupt',
    createBankrupt({
      getState: () => state,
      latestSave: () => latestPlayableSave(storage),
      onRestart: replay,
      onLoadLatest: (slot) => {
        const r = loadGame(slot, storage);
        if (r.ok) startGame(r.value, slot);
        else toasts.show({ level: 'error', icon: 'i-load', title: 'Không tải được bản lưu', text: 'Bản lưu bị hỏng hoặc trình duyệt chặn bộ nhớ.' });
      },
    }),
  );

  // Esc reaches here only when no screen took it (menuShell.ts).
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (state && screens.current === null) {
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
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  // The menu shell is already on the main menu; no game is running yet.
  hud.el.hidden = true;
  syncReport();

  return {
    get state() {
      return state;
    },
    get settings() {
      return base.settings;
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
        const uniform = uniformUnlockToast(event);
        if (uniform) toasts.show(uniform);
        if (event.type === 'phase') logPlay('phase', event.phase);
        else if (event.type === 'week_ended') logPlay('week_end');
        if (event.type === 'dayEnded') {
          logPlay('day_end');
          // The bankrupt day is not autosaved: the slot keeps the last day the run could still be saved.
          if (state.bankrupt) {
            syncReport();
            continue;
          }
          const r = runAutosave(state, event.day);
          report.setSaveStatus(r);
          weekEnd.setSaveStatus(r);
          // "Đã tự lưu" is a line in the report's footer, not a toast.
          if (!r.ok) {
            toasts.show(
              autosaveHeld
                ? { level: 'error', icon: 'i-save', title: 'Chưa tự lưu, để giữ ván trước', text: autosaveHeld }
                : { level: 'error', icon: 'i-save', title: 'Không tự lưu được', text: 'Bộ nhớ trình duyệt đầy hoặc bị chặn. Thử lưu tay trong Tạm dừng.' },
            );
          }
        }
      }
    },
    startGame,
    showMenu,
    openPause,
    dispose: () => base.dispose(),
    continueGame(slot) {
      const r = loadGame(slot, storage);
      if (r.ok) {
        startGame(r.value, slot);
        // Tiếp tục opens the newest slot without the load screen's warning.
        mayReplaceAutosave = false;
      }
      // The load screen explains what is wrong with the slot.
      else screens.show('load');
    },
    beforeSettings() {
      if (!state) return 'menu';
      simDispatch(state, { type: 'set_paused', paused: true });
      return 'pause';
    },
    onSettingsChange(next) {
      if (state) state.speed = next.gameSpeed;
    },
    onKeyDown,
    onKeyUp,
    teardown() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      hud.dispose();
      toasts.clear();
    },
  };
}
