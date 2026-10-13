import './ui/styles/tokens.css';
import './ui/styles/ui.css';
import { createAudio } from './audio';
import { createWorld } from './render/scene';
import { loadSettings } from './save/settings';
import { defaultStorage } from './save/storage';
import { dispatch, step } from './sim';
import { createNewGame } from './sim/state';
import type { GameState } from './sim/types';
import { registerPrepPanels } from './ui/panels';
import { createShell } from './ui/screens/shell';

/** Game minutes per real second at 1x: a 07:00–21:00 day in about 7 minutes. */
const GAME_MINUTES_PER_SECOND = 2;
/** Longest frame fed to the sim, so a background tab does not fast-forward the day. */
const MAX_FRAME_S = 0.1;
/** Camera spin behind the main menu, radians per second. */
const MENU_SPIN = 0.08;

/** A busy lunchtime shop that plays itself behind the main menu. */
function createMenuScene(): GameState {
  const state = createNewGame('Coffee Shop', 'normal', Date.now() >>> 0);
  state.rating = 4.5;
  dispatch(state, { type: 'start_day' });
  state.minute = 11 * 60;
  state.events.length = 0;
  return state;
}

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const storage = defaultStorage();
  const settings = loadSettings(storage);
  const world = createWorld(canvas, { quality: settings.quality, cameraKeys: settings.cameraKeys });
  const audio = createAudio({ music: settings.musicVolume, sfx: settings.sfxVolume });
  audio.setMusic(true);

  registerPrepPanels();
  const shell = createShell({
    root: ui,
    storage,
    settings,
    onSettingsChange: (s) => {
      world.setQuality(s.quality);
      world.setCameraKeys(s.cameraKeys);
      audio.setVolumes(s.musicVolume, s.sfxVolume);
    },
    onResetCamera: () => world.resetCamera(),
    onGameStart: () => world.resetCamera(),
  });
  // Clicks in the scene go through the same dispatch as the UI.
  world.onCommand((cmd) => shell.dispatch(cmd));

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
      world.update(game, game.tickAccumulator);
      shell.update();
      audio.handleEvents(game.events);
      shell.handleEvents(game.events);
      game.events.length = 0;
    } else {
      step(menuScene, dt * GAME_MINUTES_PER_SECOND);
      if (menuScene.phase === 'report') menuScene = createMenuScene();
      world.rotateCamera(MENU_SPIN * dt);
      world.update(menuScene, menuScene.tickAccumulator);
      menuScene.events.length = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const ui = document.getElementById('ui');
const canvas = document.getElementById('scene');
if (canvas instanceof HTMLCanvasElement && ui) {
  // Dev-only actors preview: npm run dev, then open /?preview=actors.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'actors') {
    void import('./render/actors/preview').then((m) => m.startActorsPreview(canvas, ui));
  } else {
    start(canvas, ui);
  }
}
