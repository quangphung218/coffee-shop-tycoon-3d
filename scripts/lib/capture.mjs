// What every capture script shares: the repo root, the fixed page clock and
// settings, the preview server, a build of another commit, the browser
// context, the Main Menu, the HUD clock and the progress/warning lines. The
// scenario runner (scripts/capture.mjs) and capture-media.mjs (which
// re-exports these for the older capture-pNN scripts) build on it.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
/** docs/media: where the README shots and most boards go. */
export const OUT = join(ROOT, 'docs', 'media');
/** First preview port: MEDIA_PORT, then PORT, then 4173; a base build is served on the next one. */
export const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
export const urlFor = (port) => `http://127.0.0.1:${port}/`;
/** Date.now() inside the page is frozen at this value, so New Game always gets the same seed. */
export const FIXED_NOW = Number(process.env.MEDIA_SEED ?? 1760400000000);
/** Settings stored before each page loads: no sound, graphics Cao, 1x. */
export const SETTINGS = { musicVolume: 0, sfxVolume: 0, quality: 'high', gameSpeed: 1, cameraKeys: 'qe-wasd' };
export const VIEWPORT = { width: 1280, height: 720 };
/** Phone screen of the layout checks and the 390 boards. */
export const PHONE = { width: 390, height: 844 };
/** Desktop screen of the P29/P30 boards. */
export const DESK = { width: 1280, height: 800 };
/** Most board width, px. */
export const BOARD_WIDTH = 1900;
/** Toasts would cover the shop and the panels in still images. */
export const HIDE_TOASTS = '.toasts { display: none !important; }';
export const RED = '#e5383b';

const START = Date.now();
/** `[12 s] what`: a progress line with the seconds since the script started. */
export const progress = (what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${what}`);

/** `!!` lines so far and where they hit (the text before the first colon); any of them fails a run. */
export const warnings = { count: 0, at: new Set() };
export const warn = (what) => {
  warnings.count++;
  warnings.at.add(String(what).split(':')[0]);
  console.warn(`!! ${what}`);
};

/** Serves the build in `root`/dist with `vite preview` on `port`. */
export async function startPreview(root, port) {
  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited (port ${port} busy?)`);
    try {
      if ((await fetch(urlFor(port))).ok) return server;
    } catch (e) {
      // Node's fetch refuses the ports browsers block (4045, 4190, 5060, 6000…) before it connects.
      if (/bad port/i.test(String(e.cause ?? e))) {
        server.kill();
        throw new Error(`port ${port} is one fetch refuses (the browsers' bad-port list); pick another MEDIA_PORT, e.g. 4200`);
      }
      // not listening yet
    }
    await sleep(200);
  }
  server.kill();
  throw new Error(`vite preview on port ${port} did not answer in 20 s`);
}

/** Exports `ref` into a temp dir sharing this checkout's node_modules and builds it there. */
export function buildRef(ref) {
  // macOS tmpdir() is under the /var -> /private/var symlink; vite needs the real path.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cst3d-media-ref-')));
  const tar = spawnSync('git', ['archive', '--format=tar', ref], { cwd: ROOT, maxBuffer: 1 << 30 });
  if (tar.status !== 0) throw new Error(`git archive ${ref} failed (shallow clone?): ${tar.stderr}`);
  const file = join(dir, 'src.tar');
  writeFileSync(file, tar.stdout);
  const x = spawnSync('tar', ['-xf', file, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar failed: ${x.stderr}`);
  rmSync(file);
  symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(dir, 'node_modules'));
  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const b = spawnSync(vite, ['build', '--logLevel', 'warn'], { cwd: dir, stdio: 'inherit' });
  if (b.status !== 0) throw new Error(`vite build of ${ref} failed`);
  return dir;
}

/** Short hash of HEAD, the build the working-tree frames show. */
export function headCommit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'HEAD';
}

/**
 * Runs in the page before its scripts. three.js announces each WebGLRenderer
 * to window.__THREE_DEVTOOLS__; the one drawing #scene gets its render()
 * wrapped so the last scene and camera drawn are kept (window.__mediaScene,
 * __mediaCamera).
 */
export function observeThree() {
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    // After the constructor has finished setting up render().
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        return render.call(this, scene, camera);
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/** A browser context whose pages get the fixed clock and SETTINGS (`settings` adds to them). */
export async function newContext(browser, { settings = {}, ...options } = {}) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  await context.addInitScript(
    ({ now, settings }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
    },
    { now: FIXED_NOW, settings: { ...SETTINGS, ...settings } },
  );
  return context;
}

/** Opens `url` and waits for the Main Menu with the 3D scene ready behind it; returns the Ván mới button. */
export async function openMenu(page, url) {
  await page.goto(url);
  const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
  await newGame.waitFor();
  // The menu comes up before the 3D scene; wait for the loading screen to go and the scene to fade in.
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  return newGame;
}

/** HUD clock text, e.g. '12:04' ('' before the HUD is up). */
export const hudClock = (page) => page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');

export { sleep };
