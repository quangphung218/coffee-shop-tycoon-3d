/**
 * Startup steps of src/main.ts that do not need the page: they take what they
 * touch as parameters so tests can drive them. Part of the main chunk, so
 * nothing here may import sim, audio, render, HUD, panels or report code
 * (tests/scripts/startup-graph.test.ts).
 */
import type { LoadComponentId } from './loadProgress';
import type { SceneGate } from './sceneGate';

/** Loading-list items that come with the game and 3D scene chunks; one Thử lại redoes them all. */
export const WORLD_COMPONENTS: readonly LoadComponentId[] = ['code', 'world', 'shaders', 'labels'];

/**
 * Browsers only allow audio after a user gesture. Listens for the first
 * pointerdown or keydown (capture) on `target` that comes once `getAudio()`
 * has the audio, unlocks it and stops listening; a tap before then keeps the
 * listeners for the next one. Returns a function that stops listening.
 */
export function watchAudioUnlock(target: EventTarget, getAudio: () => { unlock(): void } | null): () => void {
  const stop = (): void => {
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
  };
  const unlock = (): void => {
    const audio = getAudio();
    if (!audio) return;
    audio.unlock();
    stop();
  };
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
  return stop;
}

/**
 * One animation frame that always schedules the next, so an exception in the
 * sim, the world or the UI shows in the console instead of freezing the page.
 * Reports the first error of each run of failing frames, not one per frame.
 */
export function guardFrame(
  body: (now: number) => void,
  schedule: (next: (now: number) => void) => void,
  report: (error: unknown) => void = (e) => console.error(e),
): (now: number) => void {
  let failing = false;
  const frame = (now: number): void => {
    try {
      body(now);
      failing = false;
    } catch (e) {
      if (!failing) report(e);
      failing = true;
    } finally {
      schedule(frame);
    }
  };
  return frame;
}

/**
 * Imports a lazy chunk again after a failure. Browsers may keep a failed
 * module fetch for the life of the page (whatwg/html#6768), so when the
 * import fails again but `online()` says the site answers, `reload()`: the
 * menu is cached and no game is running yet (the play buttons wait for the
 * scene). The error is thrown either way.
 */
export async function retryModule<T>(load: () => Promise<T>, online: () => Promise<boolean>, reload: () => void): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (await online()) reload();
    throw err;
  }
}

/** `fn` run on the first call that returns; later calls get that result without running it. */
export function once<A, R>(fn: (arg: A) => R): (arg: A) => R {
  let done = false;
  let result: R;
  return (arg) => {
    if (!done) {
      result = fn(arg);
      done = true;
    }
    return result;
  };
}

/** Puts the world items back to waiting, with the code item loading, before a (re)load. */
export function restartWorldLoad(scene: Pick<SceneGate, 'set' | 'setComponent'>): void {
  for (const id of WORLD_COMPONENTS) scene.setComponent(id, { status: 'waiting', progress: 0 });
  scene.setComponent('code', { status: 'loading' });
  scene.set({ slow: false });
}
