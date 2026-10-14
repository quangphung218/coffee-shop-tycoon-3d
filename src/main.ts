// Nunito, latin + vietnamese subsets only, 400 and 700 (600 and 800 render with
// 700; 800 alone would add ~23 KB woff2). The @font-face rules use
// font-display: swap and nothing is preloaded, so the menu paints with the
// system font and swaps when ready.
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/vietnamese-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/vietnamese-700.css';
import './ui/styles/tokens.css';
import './ui/styles/ui.css';
import './ui/styles/scrollbar.css';
import { createAudio } from './audio';
import type { World } from './render/scene';
import { loadSettings } from './save/settings';
import { defaultStorage } from './save/storage';
import { dispatch, step } from './sim';
import { createNewGame } from './sim/state';
import type { GameState } from './sim/types';
import { registerPrepPanels } from './ui/panels';
import { registerReviewsPanel } from './ui/report';
import { createShell } from './ui/screens/shell';

/** Game minutes per real second at 1x: a 07:00–21:00 day in about 7 minutes. */
const GAME_MINUTES_PER_SECOND = 2;
/** Longest frame fed to the sim, so a background tab does not fast-forward the day. */
const MAX_FRAME_S = 0.1;
/** Camera spin behind the main menu, radians per second. */
const MENU_SPIN = 0.08;
/** Fade-out of the #boot loading screen in index.html, ms. */
const BOOT_FADE_MS = 300;

/** A busy lunchtime shop that plays itself behind the main menu. */
function createMenuScene(): GameState {
  const state = createNewGame('Coffee Shop', 'normal', Date.now() >>> 0);
  state.rating = 4.5;
  dispatch(state, { type: 'start_day' });
  state.minute = 11 * 60;
  state.events.length = 0;
  return state;
}

/** Resolves after the browser has painted the current DOM. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

function hideBoot(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('is-done');
  setTimeout(() => boot.remove(), BOOT_FADE_MS);
}

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  // three.js and the 3D world load as a separate chunk while the menu comes up.
  const worldModule = import('./render/scene');
  const storage = defaultStorage();
  const settings = loadSettings(storage);
  const audio = createAudio({ music: settings.musicVolume, sfx: settings.sfxVolume });
  audio.setMusic(true);
  let world: World | null = null;

  registerPrepPanels();
  registerReviewsPanel();
  const shell = createShell({
    root: ui,
    storage,
    settings,
    onSettingsChange: (s) => {
      world?.setQuality(s.quality);
      world?.setCameraKeys(s.cameraKeys);
      world?.setCameraRotateSpeed(s.cameraRotateSpeed);
      audio.setVolumes(s.musicVolume, s.sfxVolume);
    },
    onResetCamera: () => world?.resetCamera(),
    onGameStart: () => world?.resetCamera(),
  });
  hideBoot();
  performance.mark('cst:menu');

  // Browsers only allow audio after a user gesture.
  const unlock = (): void => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  let menuScene = createMenuScene();
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    const game = shell.state;
    if (game) {
      step(game, dt * GAME_MINUTES_PER_SECOND * game.speed);
      world?.update(game, game.tickAccumulator);
      shell.update();
      audio.handleEvents(game.events);
      shell.handleEvents(game.events);
      game.events.length = 0;
    } else {
      step(menuScene, dt * GAME_MINUTES_PER_SECOND);
      if (menuScene.phase === 'report') menuScene = createMenuScene();
      world?.rotateCamera(MENU_SPIN * dt);
      world?.update(menuScene, menuScene.tickAccumulator);
      menuScene.events.length = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Build the scene only after the menu is on screen, then fade it in.
  void Promise.all([worldModule, afterPaint()])
    .then(async ([{ createWorld }]) => {
      const s = shell.settings;
      const w = createWorld(canvas, { quality: s.quality, cameraKeys: s.cameraKeys, cameraRotateSpeed: s.cameraRotateSpeed });
      // Clicks in the scene go through the same dispatch as the UI.
      w.onCommand((cmd) => shell.dispatch(cmd));
      await w.prepare(shell.state ?? menuScene);
      world = w;
      canvas.classList.add('is-ready');
      performance.mark('cst:world');
    })
    .catch((err: unknown) => console.error('3D scene failed to load', err));
}

const ui = document.getElementById('ui');
const canvas = document.getElementById('scene');
if (canvas instanceof HTMLCanvasElement && ui) {
  // Dev-only actors preview: npm run dev, then open /?preview=actors.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'actors') {
    hideBoot();
    canvas.classList.add('is-ready');
    void import('./render/actors/preview').then((m) => m.startActorsPreview(canvas, ui));
  } else {
    start(canvas, ui);
  }
}
