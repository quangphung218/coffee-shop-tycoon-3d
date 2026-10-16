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
import { readAssets, sceneProgress, watchDownloads, type SceneStage } from './ui/core/loadProgress';
import { enableHdIcons, watchIconAtlas } from './ui/core/icons';
import { SceneGate } from './ui/core/sceneGate';
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
/** Still loading the 3D scene after this long: say the network is slow, ms. */
const SCENE_SLOW_MS = 8000;

type WorldModule = typeof import('./render/scene');

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

/** True when the site answers, i.e. the network is back. */
async function online(): Promise<boolean> {
  try {
    return (await fetch(location.href, { method: 'HEAD', cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/**
 * Imports the scene chunk again after a failure. Browsers may keep a failed
 * module fetch for the life of the page (whatwg/html#6768), so when the
 * import fails again but the site answers, reload: the menu is cached and no
 * game is running yet (the play buttons wait for the scene).
 */
async function retryWorldModule(): Promise<WorldModule> {
  try {
    return await import('./render/scene');
  } catch (err) {
    if (await online()) location.reload();
    throw err;
  }
}

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  // three.js and the 3D world load as a separate chunk while the menu comes up.
  const worldModule = import('./render/scene');
  // Menu icons use the small @1x atlas; the @2x one waits for the scene.
  watchIconAtlas();
  const assets = readAssets();
  const scene = new SceneGate({ status: 'loading', progress: 0, slow: false });
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
      world?.setReducedMotion(s.reducedMotion === 'reduce');
      audio.setVolumes(s.musicVolume, s.sfxVolume);
    },
    onResetCamera: () => world?.resetCamera(),
    onGameStart: () => world?.resetCamera(),
    scene,
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

  // Build the scene only after the menu is on screen, then fade it in. The
  // play buttons wait on `scene`, which follows the real downloads and steps.
  const loadWorld = (module: Promise<WorldModule>): void => {
    let stage: SceneStage = 'download';
    let downloaded: number | null = null;
    const show = (): void => scene.set({ progress: sceneProgress(downloaded, stage) });
    scene.set({ status: 'loading', progress: 0, slow: false });
    const stopWatch = watchDownloads(assets.scene, (f) => {
      downloaded = f;
      show();
    });
    const slowTimer = setTimeout(() => scene.set({ slow: true }), SCENE_SLOW_MS);
    let downloadFailed = true;
    void Promise.all([module, afterPaint()])
      .then(async ([{ createWorld }]) => {
        downloadFailed = false;
        downloaded = 1;
        show();
        const s = shell.settings;
        const w = createWorld(canvas, {
          quality: s.quality,
          cameraKeys: s.cameraKeys,
          cameraRotateSpeed: s.cameraRotateSpeed,
          reducedMotion: s.reducedMotion === 'reduce',
        });
        stage = 'built';
        show();
        // Clicks in the scene go through the same dispatch as the UI.
        w.onCommand((cmd) => shell.dispatch(cmd));
        try {
          await w.prepare(shell.state ?? menuScene);
        } catch (err) {
          w.dispose();
          throw err;
        }
        world = w;
        canvas.classList.add('is-ready');
        scene.set({ status: 'ready', progress: 1, slow: false });
        performance.mark('cst:world');
        void enableHdIcons();
      })
      .catch((err: unknown) => {
        console.error('3D scene failed to load', err);
        scene.set({
          status: 'error',
          slow: false,
          message: downloadFailed ? undefined : 'Trình duyệt không dựng được quán 3D (WebGL). Thử lại, hoặc mở bằng trình duyệt khác.',
        });
      })
      .finally(() => {
        stopWatch();
        clearTimeout(slowTimer);
      });
  };
  scene.onRetry = () => loadWorld(retryWorldModule());
  loadWorld(worldModule);
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
