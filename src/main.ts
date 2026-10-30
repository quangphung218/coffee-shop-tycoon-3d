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
import type { World } from './render/scene';
import { loadSettings } from './save/settings';
import { defaultStorage } from './save/storage';
import { fresh } from './ui/core/fresh';
import { initialComponents, loadFonts, readAssets, watchDownloads, type LoadComponentId } from './ui/core/loadProgress';
import { enableHdIcons, onIconAtlas, retryIconAtlas, watchIconAtlas } from './ui/core/icons';
import { SceneGate } from './ui/core/sceneGate';
import { guardFrame, once, restartWorldLoad, retryModule, runEvents, watchAudioUnlock } from './ui/core/startup';
import { createMenuShell, type ShellOptions } from './ui/screens/menuShell';

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
type GameModule = typeof import('./game');

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

const reload = (): void => location.reload();

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  // The game (sim, HUD, panels, report, audio) and three.js with the 3D world
  // load as separate chunks, asked for once the menu has painted so their
  // parse never lands in the menu's first frame.
  const painted = afterPaint();
  const gameModule = painted.then(() => import('./game'));
  const worldModule = painted.then(() => import('./render/scene'));
  // Menu icons use the small @1x atlas, asked for right after the scene
  // chunk at low priority: it must be in before the 3D scene starts drawing,
  // which leaves the main thread too busy to hand it to the CSS quickly. The
  // boxes show placeholder tiles until then. The @2x one waits for the scene.
  // The shop opens only once every item on the loading list is done.
  const scene = new SceneGate({ status: 'loading', progress: 0, slow: false, components: initialComponents() });
  onIconAtlas((state) => scene.setComponent('icons', { status: state }));
  void painted.then(() => watchIconAtlas());
  const fetchFonts = (): void => {
    scene.setComponent('fonts', { status: 'loading' });
    loadFonts().then(
      () => scene.setComponent('fonts', { status: 'done' }),
      (err: unknown) => {
        console.error('Fonts failed to load', err);
        scene.setComponent('fonts', { status: 'error' });
      },
    );
  };
  void painted.then(fetchFonts);
  const assets = readAssets();
  const storage = defaultStorage();
  const settings = loadSettings(storage);
  let world: World | null = null;
  // Set once the game chunk is in.
  let sim: GameModule | null = null;
  let audio: ReturnType<GameModule['createAudio']> | null = null;
  let game: ReturnType<GameModule['mountGame']> | null = null;
  let menuScene: ReturnType<GameModule['createMenuScene']> | null = null;

  const options: ShellOptions = {
    root: ui,
    storage,
    settings,
    onSettingsChange: (s) => {
      world?.setQuality(s.quality);
      world?.setCameraKeys(s.cameraKeys);
      world?.setCameraRotateSpeed(s.cameraRotateSpeed);
      world?.setReducedMotion(s.reducedMotion === 'reduce');
      audio?.setVolumes(s.musicVolume, s.sfxVolume);
    },
    onResetCamera: () => world?.resetCamera(),
    locateHint: (target) => world?.screenPoint(target) ?? null,
    onGameStart: () => {
      // "Mới" marks belong to the game that opened them.
      fresh.clear();
      world?.resetCamera();
    },
    scene,
  };
  const shell = createMenuShell(options);
  hideBoot();
  performance.mark('cst:menu');

  // A tap before the game chunk (and so the audio) is in keeps the listeners for the next one.
  watchAudioUnlock(window, () => audio);

  /** Plugs the game chunk into the menu, once; returns the game part. */
  const useGame = once((m: GameModule): ReturnType<GameModule['mountGame']> => {
    sim = m;
    m.registerPrepPanels();
    m.registerReviewsPanel();
    const s = shell.settings;
    audio = m.createAudio({ music: s.musicVolume, sfx: s.sfxVolume });
    audio.setMusic(true);
    menuScene = m.createMenuScene();
    game = m.mountGame(shell, options);
    shell.attachGame(game);
    return game;
  });
  // Errors show on the loading list through loadWorld.
  gameModule.then(useGame).catch(() => undefined);

  let last = performance.now();
  const frame = guardFrame((now) => {
    const dt = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000));
    last = now;
    const state = game?.state;
    if (sim && game && state) {
      const [s, g] = [sim, game];
      // The step too: if it throws mid-day, the events it already queued still go out once.
      runEvents(state.events, [
        () => s.step(state, dt * GAME_MINUTES_PER_SECOND * state.speed),
        () => world?.update(state, state.tickAccumulator),
        () => g.update(),
        () => audio?.handleEvents(state.events),
        () => fresh.handleEvents(state.events),
        () => g.handleEvents(state.events),
      ]);
    } else if (sim && menuScene) {
      sim.step(menuScene, dt * GAME_MINUTES_PER_SECOND);
      if (menuScene.phase === 'report') menuScene = sim.createMenuScene();
      world?.rotateCamera(MENU_SPIN * dt);
      const scene = menuScene;
      runEvents(scene.events, [() => world?.update(scene, scene.tickAccumulator)]);
    }
  }, requestAnimationFrame);
  requestAnimationFrame(frame);

  // Build the scene only after the menu is on screen, then fade it in. The
  // play buttons wait on `scene`, which follows the real downloads and steps.
  const loadWorld = (modules: Promise<[GameModule, WorldModule]>): void => {
    restartWorldLoad(scene);
    const stopWatch = watchDownloads(assets.scene, (f) => scene.setComponent('code', { progress: f }));
    const slowTimer = setTimeout(() => scene.set({ slow: true }), SCENE_SLOW_MS);
    /** The item running when something throws. */
    let step: LoadComponentId = 'code';
    void Promise.all([modules, afterPaint()])
      .then(async ([[m, { createWorld }]]) => {
        const g = useGame(m);
        scene.setComponent('code', { status: 'done' });
        step = 'world';
        scene.setComponent('world', { status: 'loading' });
        const s = shell.settings;
        const w = createWorld(canvas, {
          quality: s.quality,
          cameraKeys: s.cameraKeys,
          cameraRotateSpeed: s.cameraRotateSpeed,
          reducedMotion: s.reducedMotion === 'reduce',
        });
        scene.setComponent('world', { status: 'done' });
        step = 'shaders';
        // Clicks in the scene go through the same dispatch as the UI.
        w.onCommand((cmd) => g.dispatch(cmd));
        try {
          // useGame() has set menuScene.
          await w.prepare(g.state ?? menuScene!, (id, fraction) => {
            step = id;
            scene.setComponent(id, { status: fraction >= 1 ? 'done' : 'loading', progress: fraction });
          });
        } catch (err) {
          w.dispose();
          throw err;
        }
        // prepare() has finished every step, including any it did not report.
        scene.setComponent('shaders', { status: 'done' });
        scene.setComponent('labels', { status: 'done' });
        scene.set({ slow: false });
        world = w;
        canvas.classList.add('is-ready');
        performance.mark('cst:world');
        void enableHdIcons();
      })
      .catch((err: unknown) => {
        console.error('3D scene failed to load', err);
        scene.setComponent(step, { status: 'error' });
        scene.set({
          slow: false,
          message: step === 'code' ? undefined : 'Trình duyệt không dựng được quán 3D (WebGL). Thử lại, hoặc mở bằng trình duyệt khác.',
        });
      })
      .finally(() => {
        stopWatch();
        clearTimeout(slowTimer);
      });
  };
  scene.onRetry = (id) => {
    if (id === 'fonts') fetchFonts();
    else if (id === 'icons') retryIconAtlas();
    else loadWorld(Promise.all([retryModule(() => import('./game'), online, reload), retryModule(() => import('./render/scene'), online, reload)]));
  };
  loadWorld(Promise.all([gameModule, worldModule]));
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
