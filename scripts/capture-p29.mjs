// Captures the P29 shots of the working tree: the shop at 07:00, 12:00 and
// 19:30, sunny and rainy, at graphics Cao and Thấp, at 390×844 and 1280×800,
// plus a board of the three hours, before/after boards of the coin popping
// up from a sale and of 19:30 sunny, and one shot of the Lên cấp card of the
// Daily Report, each ringed in red. Run through `npm run media:p29` (builds
// first). Needs Playwright and the git history back to BASE_COMMIT; see
// docs/media.md.
//
// Files (JPEG, docs/media/p29):
//   scene-<hhmm>-<weather>-<quality>-<w>-p29.jpg   e.g. scene-1930-rainy-high-390-p29.jpg
//   hours-sunny-high-1280-p29.jpg                  the sunny Cao 1280 shots of SHOT_MINUTES side by side
//   coin-before-after-p29.jpg                      one coin of the BASE_COMMIT build, then one
//                                                  coin of the working tree at COIN_AGES
//   dusk-sunny-high-before-after-p29.jpg           19:30 sunny on Cao, BASE_COMMIT then the working
//                                                  tree: rings and notes on the light pools, the
//                                                  darker scene and the shadow the sun casts
//   levelup-390-p29.jpg                            the Lên cấp card of the first level-up
//
// The coin board stops the page clock (mediaClock) on the frame a coin pops
// up, steps it 1/COIN_FPS s at a time to each age, and zooms the camera
// around that coin (COIN_PX_PER_M) only while the coin frames are drawn.
//
// Saves come from the working tree's own sim (Normal, a fixed seed, a barista
// and a server hired on day 1, the basic strategy of
// tests/integration/helpers.ts): day 1 is played to its report, then day 2
// opens with its weather set to the shot's and is played up to the shot's
// minute. The level-up save is the report of the first day with a level-up.
// The game runs at 1x after Tiếp tục, so the clock moves on a little before a
// shot; each shot prints the HUD clock it shows.
// measure-frames.mjs --scene loads the SCENES saves from sceneSaves().
// P29_SAVES_ONLY=1 plays the saves and prints them, without a server or browser.
// P29_ONLY=coin shoots the coin board alone, P29_ONLY=dusk the 19:30 board.
// Prints `!!` for a coin, card, light pool or shadow that never showed; any
// `!!` ends the run with exit code 1.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXED_NOW, OUT, buildRef, newContext, observeThree, openMenu, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
const SEED = Number(process.env.P29_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Day the scene saves are taken on: day 1 is played first so the shop has customers and a rating. */
export const SCENE_DAY = 2;
const HIRES = ['barista', 'server'];
const DAY_GUARD = 3000;
/** Last day played while looking for the first level-up. */
const LEVELUP_LAST_DAY = 14;

/** measure-frames.mjs --scene ids: weather and game minute of each save. */
export const SCENES = {
  'dusk-rain': { weather: 'rainy', minute: 19 * 60 },
  'noon-sunny': { weather: 'sunny', minute: 12 * 60 },
};
export const SCENE_IDS = Object.keys(SCENES);
/** Shot minutes: 07:00, 12:00, 19:30. */
export const SHOT_MINUTES = [7 * 60, 12 * 60, 19 * 60 + 30];
/** Minute of the dusk board: the last of SHOT_MINUTES. */
const DUSK_MINUTE = 19 * 60 + 30;
export const SHOT_WEATHERS = ['sunny', 'rainy'];
/** Settings quality of graphics Cao and Thấp. */
export const SHOT_QUALITIES = ['high', 'low'];
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const VIEWPORTS = [PHONE, DESK];
const P29_OUT = join(OUT, 'p29');
const HIDE_TOASTS = '.toasts { display: none !important; }';
const RED = '#e5383b';
const JPEG_QUALITY = 78;
/** Camera ease and rain set in after Tiếp tục, ms. */
const SETTLE_MS = 2500;
/** Longest wait for a coin to pop up at noon, ms. */
const COIN_WAIT_MS = 30_000;
/** Build the coin board compares against: the merge-base of the P29 branch with origin/main. */
const BASE_COMMIT = process.env.P29_BASE ?? '774be34';
/** Age of the base coin, s: coin and chip at full opacity, risen clear of the head. */
const BASE_COIN_AGE = 0.25;
/**
 * Ages of the working-tree coin, s (src/render/actors/fx.ts): the arc near
 * its top with the "+X đ" chip, mid-spin, and the burst (from COIN_BURST
 * × COIN_SECONDS = 0,76 s) with the small coins spread out.
 */
const COIN_AGES = [0.25, 0.6, 0.85];
/** Frame rate of the stepped page clock. */
const COIN_FPS = 60;
/** Camera zoom around the coin while the coin frames are drawn, CSS px per metre. */
const COIN_PX_PER_M = 130;
/** The board's frames are shot at this device pixel ratio (the Cao cap of PIXEL_RATIO_CAP). */
const COIN_DPR = 2;
/** Margin round the rings of the coin frames, and the smallest crop (head and table in view), CSS px. */
const COIN_PAD = 34;
const COIN_CROP_MIN = { w: 200, h: 210 };
/** Widest coin board, px. */
const COIN_BOARD_WIDTH = 1900;
const COIN_BOARD = 'coin-before-after-p29.jpg';
const HOURS_BOARD = 'hours-sunny-high-1280-p29.jpg';
const DUSK_BOARD = 'dusk-sunny-high-before-after-p29.jpg';
/** Widest hours and dusk boards, px. */
const BOARD_WIDTH = 1900;
/** Cells the dusk board compares brightness in, CSS px, between the HUD and the dock. */
const LUMA_CELL = { w: 240, h: 160 };
const LUMA_TOP = 90;
const LUMA_BOTTOM = DESK.height - 110;
/** Height of the street props (lamps, trees) whose shadow the dusk board rings, m. */
const SHADOW_CASTER = { min: 1.5, max: 6 };
/** The report drops in and the badge shakes before the level-up shot, ms. */
const LEVELUP_SETTLE_MS = 1200;
const START = Date.now();
const progress = (what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${what}`);

// --- Saves, from the sim of the build that loads them. ---

/** 'HHMM' of a game minute, e.g. 1170 → '1930'. */
export const hhmm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}${String(minute % 60).padStart(2, '0')}`;

/** File name of a scene shot: hour, weather, quality and width. */
export const shotName = ({ minute, weather, quality, width }) => `scene-${hhmm(minute)}-${weather}-${quality}-${width}-p29.jpg`;

/** `{ key, text }` of `state` written to the 'auto' slot by the build's save module (current SAVE_VERSION). */
export function saveText(save, state, now = FIXED_NOW) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, now);
  if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/** autoPlay of tests/integration/helpers.ts, on the build's `sim` and `orders` modules. */
function autoPlay({ sim, orders }, s) {
  if (s.playerTasks.length > 0) return;
  const free = (kind, id) => !orders.isClaimed(s, kind, id, null);
  const ready = s.orders.find((o) => o.status === 'ready' && free('serve', o.id));
  if (ready && sim.dispatch(s, { type: 'deliver', orderId: ready.id })) return;
  const pending = s.orders.find((o) => o.status === 'pending' && free('brew', o.id));
  if (pending && sim.dispatch(s, { type: 'brew', orderId: pending.id })) return;
  const next = s.customers.find((c) => c.state === 'queueing' && free('take_order', c.id));
  if (next && sim.dispatch(s, { type: 'take_order', customerId: next.id })) return;
  const withCash = s.tables.find((t) => t.cash > 0 && free('collect', t.id));
  if (withCash && sim.dispatch(s, { type: 'collect_cash', tableId: withCash.id })) return;
  const dirty = s.tables.find((t) => t.trash > 0 && free('clean', t.id));
  if (dirty) sim.dispatch(s, { type: 'clean_table', tableId: dirty.id });
}

/** Opens the day with `weather` (when given) and plays it until `until(state)` or its report. */
function playDay(mods, s, { weather, until }) {
  const { sim } = mods;
  s.events = [];
  if (s.phase === 'report' && !sim.dispatch(s, { type: 'next_day' })) throw new Error(`next_day refused after day ${s.day}`);
  if (weather) s.weather = weather;
  sim.dispatch(s, { type: 'apply_restock' });
  s.events = [];
  if (!sim.dispatch(s, { type: 'start_day' })) throw new Error(`day ${s.day}: start_day refused`);
  s.events = [];
  for (let guard = 0; !until?.(s) && s.phase !== 'report' && guard < DAY_GUARD; guard++) {
    autoPlay(mods, s);
    sim.step(s, 1);
    s.events = [];
  }
}

/** A new game with HIRES hired on day 1. */
function newGame({ stateMod, sim }, seed) {
  const s = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, seed);
  for (const role of HIRES) {
    const c = s.candidates[0];
    if (!c || !sim.dispatch(s, { type: 'hire_staff', candidateId: c.id, role })) throw new Error(`cannot hire a ${role}`);
  }
  s.events = [];
  return s;
}

/**
 * The GameState of a scene: day 1 played to its report, then day SCENE_DAY
 * opened with `weather` and played until the clock reaches `minute`.
 * `mods` = the build's { stateMod: sim/state, sim: sim/index, orders: sim/orders }.
 */
export function playToScene(mods, { weather, minute }, seed = SEED) {
  const s = newGame(mods, seed);
  for (let day = 1; day < SCENE_DAY; day++) {
    playDay(mods, s, {});
    if (s.phase !== 'report') throw new Error(`day ${day} did not reach the report`);
  }
  playDay(mods, s, { weather, until: (st) => st.minute >= minute });
  if (s.minute !== minute || s.weather !== weather) throw new Error(`scene ${weather} ${minute}: stopped at ${s.weather} ${s.minute} (${s.phase})`);
  s.events = [];
  return s;
}

/** The GameState at the report of the first day with a level-up. */
export function playToLevelUp(mods, seed = SEED) {
  const s = newGame(mods, seed);
  for (let day = 1; day <= LEVELUP_LAST_DAY; day++) {
    playDay(mods, s, {});
    if (s.phase !== 'report') throw new Error(`day ${day} did not reach the report`);
    if (s.lastReport?.levelUp) {
      s.events = [];
      return s;
    }
  }
  throw new Error(`no level-up by day ${LEVELUP_LAST_DAY}`);
}

/** One line on a scene state for the logs. */
const sceneInfo = (s) => `day ${s.day} ${hhmm(s.minute)} ${s.weather}, ${s.customers.length} customers, ${s.staff.length} staff`;

/**
 * Loads `root`'s sim and save code through vite and returns `{ key, text, info }`
 * saves for each `{ id, weather, minute }` of `scenes`, plus `levelUp` when
 * `withLevelUp`.
 */
export async function sceneSaves(root, scenes, { withLevelUp = false } = {}) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save] = await Promise.all(['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts'].map((p) => vite.ssrLoadModule(p)));
    const mods = { stateMod, sim, orders };
    const out = {};
    for (const sc of scenes) {
      const s = playToScene(mods, sc);
      out[sc.id] = { ...saveText(save, s), info: sceneInfo(s) };
    }
    if (withLevelUp) {
      const s = playToLevelUp(mods);
      out.levelUp = { ...saveText(save, s), info: `report of day ${s.day}, level ${s.lastReport.levelUp.level}` };
    }
    return out;
  } finally {
    await vite.close();
  }
}

// --- Browser. ---

/**
 * A context with SETTINGS of capture-media at `quality`, `save` in
 * localStorage and the three.js hook; `coin` swaps the hook for coinHooks
 * and shoots at COIN_DPR.
 */
async function gameContext(browser, viewport, save, quality, coin = false) {
  const context = await newContext(browser, { viewport, deviceScaleFactor: coin ? COIN_DPR : 1 });
  await context.addInitScript((q) => {
    const s = JSON.parse(localStorage.getItem('cst3d:settings') ?? '{}');
    localStorage.setItem('cst3d:settings', JSON.stringify({ ...s, quality: q }));
  }, quality);
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  await context.addInitScript(coin ? coinHooks : observeThree);
  return context;
}

async function session(browser, url, save, viewport, quality, fn, coin = false) {
  const context = await gameContext(browser, viewport, save, quality, coin);
  const page = await context.newPage();
  try {
    await openMenu(page, url);
    const btn = page.getByRole('button', { name: /^Tiếp tục/ });
    await btn.waitFor({ timeout: 10_000 }).catch(() => {
      throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load`);
    });
    await btn.click();
    return await fn(page);
  } finally {
    await context.close();
  }
}

/** Draws red rings (fixed, over everything) around `boxes`, viewport CSS px. */
function ring(page, boxes) {
  return page.evaluate(
    ({ boxes, red }) => {
      for (const b of boxes) {
        const d = document.createElement('div');
        Object.assign(d.style, {
          position: 'fixed',
          left: `${b.x - 6}px`,
          top: `${b.y - 6}px`,
          width: `${b.w + 12}px`,
          height: `${b.h + 12}px`,
          border: `4px solid ${red}`,
          borderRadius: '12px',
          boxShadow: '0 0 0 2px #fff',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        document.body.append(d);
      }
    },
    { boxes, red: RED },
  );
}

async function writeShot(page, name) {
  const file = join(P29_OUT, name);
  await page.screenshot({ path: file, type: 'jpeg', quality: JPEG_QUALITY, style: HIDE_TOASTS });
  return relative(ROOT, file);
}

const clockText = (page) => page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');

/**
 * Runs in the page. The lights of the last frame: hemisphere, sun and
 * environment map, their total as totalLightOf in src/render/scene/renderer.ts
 * (hemi + env × 6 + sun), PointLights on, light pools showing, and the sun's
 * elevation (degrees) and side (west when it is toward -x).
 */
function lightInfo() {
  const scene = window.__mediaScene;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const out = { hemi: 0, sun: 0, env: 0, total: 0, points: 0, pools: 0, elevation: 0, west: false };
  scene?.traverse((o) => {
    if (!shown(o)) return;
    if (o.isHemisphereLight) out.hemi += o.intensity;
    if (o.isPointLight && o.intensity > 0) out.points++;
    if (o.name === 'light-pool' && (o.material?.opacity ?? 1) > 0.01) out.pools++;
    if (o.isDirectionalLight) {
      out.sun += o.intensity;
      const d = o.position.clone().sub(o.target.position).normalize();
      out.elevation = (Math.asin(d.y) * 180) / Math.PI;
      out.west = d.x < 0;
    }
  });
  out.env = scene?.environment ? scene.environmentIntensity : 0;
  out.total = out.hemi + out.env * 6 + out.sun;
  return out;
}

/** Decimal comma, 2 digits: 1,42. */
const f2 = (n) => n.toFixed(2).replace('.', ',');
const sunSide = (l) => (l.west ? 'tây' : 'đông');

async function sceneShot(page, name) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  const clock = await clockText(page);
  const light = await page.evaluate(lightInfo);
  const file = await writeShot(page, name);
  progress(`${name}: HUD clock ${clock}, total light ${f2(light.total)} (hemi ${f2(light.hemi)}, sun ${f2(light.sun)} from the ${light.west ? 'west' : 'east'} at ${Math.round(light.elevation)}°)`);
  return { file, clock, light };
}

// --- Coin board. ---

/**
 * Runs in the page before its scripts. The game loop keeps the
 * requestAnimationFrame it finds at start-up, so the clock has to be in
 * place first. window.__mediaClock: frames run on the real clock until
 * `watch` is set; then the first frame a coin pops up on screen holds the
 * clock (`coin`, its height `spawnY`), and frames only run on `tick(ms)`,
 * with performance.now() and the frame time moved on by `ms`. Keeps the last
 * scene and camera of #scene as observeThree does. While
 * window.__mediaFocus ({ x, y, z, ppm }) is set, #scene is drawn by its
 * camera moved across the view to centre that point at `ppm` CSS px per
 * metre, kept as window.__mediaView; the game's camera is put back after.
 */
function coinHooks() {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const clock = { watch: false, primed: false, manual: false, t: 0, held: [], coin: null, spawnY: 0 };
  const seen = new WeakSet();
  const check = () => {
    const camera = window.__mediaCamera;
    const group = window.__mediaScene?.getObjectByName('coins');
    if (!clock.watch || clock.manual || !group || !camera) return;
    for (const c of group.children) {
      if (!c.visible) {
        seen.delete(c);
        continue;
      }
      if (seen.has(c)) continue;
      seen.add(c);
      // Coins already up when the watch starts are mid-life: skip them.
      if (!clock.primed) continue;
      const p = c.getWorldPosition(new c.position.constructor());
      const y = p.y;
      p.project(camera);
      if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue;
      clock.coin = c;
      clock.spawnY = y;
      clock.manual = true;
      clock.t = realNow();
      return;
    }
    clock.primed = true;
  };
  clock.tick = (ms) => {
    clock.t += ms;
    for (const cb of clock.held.splice(0)) cb(clock.t);
  };
  window.__mediaClock = clock;
  performance.now = () => (clock.manual ? clock.t : realNow());
  window.requestAnimationFrame = (cb) => {
    if (clock.manual) {
      clock.held.push(cb);
      return 0;
    }
    return raf((ts) => {
      if (clock.manual) {
        clock.held.push(cb);
        return;
      }
      cb(ts);
      check();
    });
  };

  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        const f = window.__mediaFocus;
        if (!f || !camera.isOrthographicCamera) return render.call(this, scene, camera);
        const pos = camera.position.clone();
        const zoom = camera.zoom;
        camera.updateMatrixWorld();
        const dir = camera.getWorldDirection(pos.clone());
        const d = pos.clone().set(f.x, f.y, f.z).sub(pos);
        camera.position.add(d.addScaledVector(dir, -d.dot(dir)));
        camera.zoom = (f.ppm * (camera.top - camera.bottom)) / this.domElement.clientHeight;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        try {
          return render.call(this, scene, camera);
        } finally {
          window.__mediaView = camera.clone();
          camera.position.copy(pos);
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/**
 * Runs in the page. The held coin in the last frame drawn by __mediaView:
 * the screen box (CSS px) of its sprites still showing, its small coins, its
 * coin's height above where it popped (m) and width over height (spin).
 * fx.ts adds the small coins first, so the coin and the chip are the last
 * two children (the only two in builds without the burst).
 */
function coinMeasure() {
  const { coin: c, spawnY } = window.__mediaClock;
  const view = window.__mediaView;
  const V = c.position.constructor;
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const right = new V().setFromMatrixColumn(view.matrixWorld, 0).normalize();
  const up = new V().setFromMatrixColumn(view.matrixWorld, 1).normalize();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of c.children) {
    if (!shown(s) || (s.material?.opacity ?? 0) < 0.03) continue;
    const p = s.getWorldPosition(new V());
    const size = s.getWorldScale(new V());
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const q = p.clone().addScaledVector(right, (a * size.x) / 2).addScaledVector(up, (b * size.y) / 2).project(view);
      const sx = r.left + ((q.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - q.y) / 2) * r.height;
      [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
    }
  }
  const coin = c.children[c.children.length - 2];
  return {
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    debris: Math.max(0, c.children.filter(shown).length - 2),
    lift: coin.getWorldPosition(new V()).y - spawnY,
    width: coin.scale.x / coin.scale.y,
  };
}

/**
 * In a coinHooks session: waits for a coin to pop up, holds the clock on
 * that frame and steps it to each of `ages` (s), shooting the page (PNG at
 * COIN_DPR) with the camera zoomed round the coin. Null when no coin came.
 */
async function coinFrames(page, ages) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  await page.evaluate(() => {
    window.__mediaClock.watch = true;
  });
  const seen = await page
    .waitForFunction(() => window.__mediaClock.coin !== null, null, { timeout: COIN_WAIT_MS, polling: 100 })
    .then(() => true)
    .catch(() => false);
  if (!seen) return null;
  const clock = await clockText(page);
  await page.evaluate((ppm) => {
    const c = window.__mediaClock.coin;
    const p = c.getWorldPosition(new c.position.constructor());
    // Centred a little above the start, in the middle of the hop.
    window.__mediaFocus = { x: p.x, y: p.y + 0.3, z: p.z, ppm };
  }, COIN_PX_PER_M);
  const frames = [];
  let done = 0;
  for (const age of ages) {
    const n = Math.round(age * COIN_FPS);
    await page.evaluate(
      ({ n, ms }) => {
        for (let i = 0; i < n; i++) window.__mediaClock.tick(ms);
      },
      { n: n - done, ms: 1000 / COIN_FPS },
    );
    done = n;
    await sleep(200);
    const m = await page.evaluate(coinMeasure);
    frames.push({ age: n / COIN_FPS, png: await page.screenshot({ style: HIDE_TOASTS }), ...m });
  }
  return { clock, frames };
}

/**
 * Runs in the browser. Draws the `crop` (CSS px) of each panel's frame
 * (`img`, base64 of `mime`, PNG by default) side by side at `scale` of its
 * `dpr` pixels, a title over each, a red ring round each of its `boxes` (with
 * its `label` in a red badge when given) and its caption in a red box under
 * it, wrapped to the panel; then each of `notes` wrapped to the board.
 * Returns the JPEG as base64.
 */
async function drawBoard({ panels, crop, dpr, scale, notes, red, quality }) {
  const INK = '#2b1d14';
  const PAD = 24;
  const GAP = 24;
  const TITLE = 40;
  const CAP_LINE = 25;
  const NOTE_LINE = 24;
  const font = (weight, px) => `${weight} ${px}px Nunito, system-ui, sans-serif`;
  const wrap = (c, text, max) => {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > max) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const load = async (p) => createImageBitmap(await (await fetch(`data:${p.mime ?? 'image/png'};base64,${p.img}`)).blob());
  const imgs = await Promise.all(panels.map(load));
  const k = dpr * scale;
  const pw = Math.round(crop.w * k);
  const ph = Math.round(crop.h * k);
  const width = 2 * PAD + panels.length * pw + (panels.length - 1) * GAP;
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  probe.font = font(700, 19);
  const caps = panels.map((p) => wrap(probe, p.caption, pw - 24));
  const capH = 16 + CAP_LINE * Math.max(...caps.map((c) => c.length));
  probe.font = font(600, 17);
  const noteLines = notes.flatMap((n) => wrap(probe, n, width - 2 * PAD));
  const top = PAD + TITLE;
  const capTop = top + ph + 10;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = capTop + capH + 12 + NOTE_LINE * noteLines.length + PAD;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  for (const [i, p] of panels.entries()) {
    const x = PAD + i * (pw + GAP);
    let size = 22;
    ctx.font = font(700, size);
    while (size > 12 && ctx.measureText(p.title).width > pw) ctx.font = font(700, --size);
    ctx.fillStyle = INK;
    ctx.fillText(p.title, x, PAD + TITLE / 2 - 4);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgs[i], crop.x * dpr, crop.y * dpr, crop.w * dpr, crop.h * dpr, x, top, pw, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, pw, ph);
    ctx.clip();
    for (const b of p.boxes) {
      const rx = x + (b.x - crop.x) * k - 8;
      const ry = top + (b.y - crop.y) * k - 8;
      ctx.beginPath();
      ctx.roundRect(rx, ry, b.w * k + 16, b.h * k + 16, 12);
      for (const [w, color] of [[9, '#fff'], [5, red]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      if (!b.label) continue;
      const R = 16;
      const bx = Math.min(x + pw - R - 4, Math.max(x + R + 4, rx));
      const by = Math.min(top + ph - R - 4, Math.max(top + R + 4, ry));
      ctx.beginPath();
      ctx.arc(bx, by, R, 0, 2 * Math.PI);
      ctx.fillStyle = red;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.font = font(800, 18);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, bx, by + 1);
      ctx.textAlign = 'start';
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(x, top, pw, ph);
    ctx.beginPath();
    ctx.roundRect(x, capTop, pw, capH, 10);
    ctx.fillStyle = red;
    ctx.fill();
    ctx.font = font(700, 19);
    ctx.fillStyle = '#fff';
    caps[i].forEach((t, j) => ctx.fillText(t, x + 12, capTop + 8 + CAP_LINE * j + CAP_LINE / 2));
  }
  ctx.font = font(600, 17);
  ctx.fillStyle = INK;
  noteLines.forEach((t, j) => ctx.fillText(t, PAD, capTop + capH + 12 + NOTE_LINE * j + NOTE_LINE / 2));
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

/** Seconds and metres with a decimal comma, e.g. 0,25. */
const comma = (n, digits = 2) => n.toFixed(digits).replace('.', ',');

/** Short hash of HEAD, the build the working-tree frames show. */
function headCommit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'HEAD';
}

/** Writes a drawBoard JPEG to docs/media/p29/`name`; `panels` carry `png` (Buffer) or `jpeg` (Buffer). */
async function writeBoard(browser, name, { panels, crop, dpr, scale, notes }) {
  const page = await browser.newPage({ viewport: DESK, deviceScaleFactor: 1 });
  try {
    const jpeg = await page.evaluate(drawBoard, {
      panels: panels.map((p) => ({
        title: p.title,
        caption: p.caption,
        boxes: p.boxes,
        img: (p.jpeg ?? p.png).toString('base64'),
        mime: p.jpeg ? 'image/jpeg' : 'image/png',
      })),
      crop,
      dpr,
      scale,
      notes,
      red: RED,
      quality: 0.86,
    });
    const file = join(P29_OUT, name);
    writeFileSync(file, Buffer.from(jpeg, 'base64'));
    return relative(ROOT, file);
  } finally {
    await page.close();
  }
}

/**
 * Builds BASE_COMMIT, plays its `scenes` saves on its own sim, serves it on
 * PORT + 1 and calls `fn({ url, saves })`; removes the build after.
 */
async function withBase(scenes, fn) {
  progress(`building ${BASE_COMMIT}`);
  const baseDir = buildRef(BASE_COMMIT);
  let server = null;
  try {
    const saves = await sceneSaves(baseDir, scenes);
    for (const [id, s] of Object.entries(saves)) progress(`${BASE_COMMIT} save ${id}: ${s.info}`);
    server = await startPreview(baseDir, PORT + 1);
    return await fn({ url: urlFor(PORT + 1), saves });
  } finally {
    server?.kill();
    rmSync(baseDir, { recursive: true, force: true });
  }
}

/**
 * Writes HOURS_BOARD from the sunny Cao 1280 shots `hours` (minute → the
 * sceneShot result), one panel per SHOT_MINUTES, titled with its hour.
 */
async function hoursBoard(browser, hours) {
  const head = headCommit();
  const panels = SHOT_MINUTES.map((minute) => {
    const h = hours.get(minute);
    const l = h.light;
    return {
      jpeg: readFileSync(join(ROOT, h.file)),
      boxes: [],
      title: `${hhmm(minute).slice(0, 2)}:${hhmm(minute).slice(2)} · nắng · Cao`,
      caption: `HUD ${h.clock || '?'}; nắng ${f2(l.sun)} từ phía ${sunSide(l)}, cao ${Math.round(l.elevation)}°; trời ${f2(l.hemi)}; tổng sáng ${f2(l.total)}`,
    };
  });
  const crop = { x: 0, y: 0, ...DESK };
  const scale = Math.min(1, (BOARD_WIDTH - 48 - 24 * (panels.length - 1)) / (panels.length * crop.w));
  const notes = [`Cùng save ngày ${SCENE_DAY}, trời nắng, 1280×800, mức Cao, bản ${head}. Tổng sáng = trời + env × 6 + nắng, ngân sách 3,4.`];
  return writeBoard(browser, HOURS_BOARD, { panels, crop, dpr: 1, scale, notes });
}

/**
 * Runs in the page. Screen box (CSS px) of the light pools showing (opacity
 * above 0: the pools are drawn by day too, at opacity 0), or null.
 */
function poolBox() {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  scene?.traverse((o) => {
    if (o.name !== 'light-pool' || !shown(o) || (o.material?.opacity ?? 1) <= 0.01) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = new o.position.constructor(x, y, z).applyMatrix4(o.matrixWorld).project(cam);
          const sx = r.left + ((q.x + 1) / 2) * r.width;
          const sy = r.top + ((1 - q.y) / 2) * r.height;
          [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
        }
      }
    }
  });
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * Runs in the page. The shadow the sun casts from one still street prop
 * (instanced lamps, trees: castShadow, not the traffic) `min`..`max` m tall,
 * the one nearest the middle of the view with its foot, top and shadow tip
 * in view: the screen box round them (CSS px), its height and shadow length
 * (m). Null when none is in view.
 */
function shadowOf({ min, max }) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const street = scene?.getObjectByName('street');
  let sun = null;
  scene?.traverse((o) => {
    if (!sun && o.isDirectionalLight) sun = o;
  });
  if (!street || !sun || !cam) return null;
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  const V = dir.constructor;
  const r = document.getElementById('scene').getBoundingClientRect();
  const screen = (p) => {
    const q = p.clone().project(cam);
    return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height, inside: Math.abs(q.x) < 0.9 && q.y > -0.7 && q.y < 0.8 };
  };
  const inst = street.matrixWorld.clone();
  const world = street.matrixWorld.clone();
  let best = null;
  for (const o of street.children) {
    // Traffic is drawn without frustum culling; it moves, so its shadows do too.
    if (!o.isInstancedMesh || !o.castShadow || !o.visible || !o.frustumCulled) continue;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, inst);
      world.multiplyMatrices(o.matrixWorld, inst);
      const foot = new V(cx, b.min.y, cz).applyMatrix4(world);
      const top = new V(cx, b.max.y, cz).applyMatrix4(world);
      const height = top.y - foot.y;
      if (height < min || height > max) continue;
      const tip = top.clone().addScaledVector(dir, -height / dir.y);
      const pts = [foot, top, tip].map(screen);
      if (!pts.every((p) => p.inside)) continue;
      const d = Math.hypot(pts[0].x - (r.left + r.width / 2), pts[0].y - (r.top + r.height / 2));
      if (best && d >= best.d) continue;
      best = { d, pts, height, length: Math.hypot(tip.x - foot.x, tip.z - foot.z) };
    }
  }
  if (!best) return null;
  const xs = best.pts.map((p) => p.x);
  const ys = best.pts.map((p) => p.y);
  const pad = 18;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { box: { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }, height: best.height, length: best.length };
}

/** The dusk board's frame: a PNG with the lights, light pools and a shadow of that frame. */
async function duskFrame(page) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  const clock = await clockText(page);
  const light = await page.evaluate(lightInfo);
  const pools = await page.evaluate(poolBox);
  const shadow = await page.evaluate(shadowOf, SHADOW_CASTER);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { png, clock, light, pools, shadow };
}

/**
 * Runs in the browser. Mean brightness (0–100% of white, Rec. 709 luma) of
 * each PNG (`imgs`, base64, CSS px at dpr 1): of the whole frame and of every
 * `cell` between `top` and `bottom`, the cells half a cell apart.
 */
async function lumaCells({ imgs, cell, top, bottom }) {
  return Promise.all(
    imgs.map(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      c.drawImage(bmp, 0, 0);
      const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
      const luma = (x0, y0, w, h) => {
        let s = 0;
        let n = 0;
        for (let y = y0; y < y0 + h; y += 4) {
          for (let x = x0; x < x0 + w; x += 4) {
            const i = (y * bmp.width + x) * 4;
            s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            n++;
          }
        }
        return (s / n / 255) * 100;
      };
      const cells = [];
      for (let y = top; y + cell.h <= bottom; y += cell.h / 2) {
        for (let x = 0; x + cell.w <= bmp.width; x += cell.w / 2) cells.push({ x, y, w: cell.w, h: cell.h, luma: luma(x, y, cell.w, cell.h) });
      }
      return { mean: luma(0, 0, bmp.width, bmp.height), cells };
    }),
  );
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Writes DUSK_BOARD: 19:30 sunny on Cao at 1280×800, the BASE_COMMIT build
 * (`base`: { url, saves } of withBase) then the working tree (`url`, `save`
 * from its sim). Rings 1 the light pools, 2 the cell that darkened most
 * (away from rings 1 and 3), 3 a street prop and its shadow; the notes give
 * the numbers of each.
 */
async function duskBoard(browser, url, save, base) {
  const id = `${hhmm(DUSK_MINUTE)}-sunny`;
  const before = await session(browser, base.url, base.saves[id], DESK, 'high', duskFrame);
  const after = await session(browser, url, save, DESK, 'high', duskFrame);
  if (!after.pools) console.warn(`!! ${DUSK_BOARD}: no light pool showing on the working tree`);
  for (const [who, r] of [[BASE_COMMIT, before], ['working tree', after]]) {
    if (!r.shadow) console.warn(`!! ${DUSK_BOARD}: no street prop with its shadow in view on ${who}`);
  }
  const [lb, la] = await (async () => {
    const page = await browser.newPage({ viewport: DESK, deviceScaleFactor: 1 });
    try {
      return await page.evaluate(lumaCells, { imgs: [before.png, after.png].map((b) => b.toString('base64')), cell: LUMA_CELL, top: LUMA_TOP, bottom: LUMA_BOTTOM });
    } finally {
      await page.close();
    }
  })();
  const taken = [before.pools, after.pools, before.shadow?.box, after.shadow?.box].filter(Boolean);
  let dark = null;
  lb.cells.forEach((c, i) => {
    const drop = c.luma - la.cells[i].luma;
    if (taken.some((t) => overlaps(c, t)) || (dark && drop <= dark.drop)) return;
    dark = { ...c, drop, before: c.luma, after: la.cells[i].luma };
  });
  const head = headCommit();
  const pct = (n) => `${Math.round(n)}%`;
  const deg = (l) => `${Math.round(l.elevation)}°`;
  const boxesOf = (r) => [
    ...(r.pools ? [{ ...r.pools, label: '1' }] : []),
    ...(dark ? [{ ...dark, label: '2' }] : []),
    ...(r.shadow ? [{ ...r.shadow.box, label: '3' }] : []),
  ];
  const caption = (r) => `Tổng sáng ${f2(r.light.total)}; ${r.light.points} đèn quán sáng, ${r.light.pools} vũng sáng; nắng từ phía ${sunSide(r.light)}, cao ${deg(r.light)}`;
  const shadowLen = (r) => (r.shadow ? `${comma(r.shadow.length, 1)} m` : '?');
  const caster = after.shadow ?? before.shadow;
  const notes = [
    `1 · Vũng sáng ấm trên sàn dưới đèn quán: ${before.light.pools} → ${after.light.pools} vũng, đèn quán sáng ${before.light.points} → ${after.light.points} PointLight.`,
    `2 · Cảnh tối hơn lúc chạng vạng: tổng sáng ${f2(before.light.total)} → ${f2(after.light.total)} (trời ${f2(before.light.hemi)} → ${f2(after.light.hemi)}, nắng ${f2(before.light.sun)} → ${f2(after.light.sun)}); ` +
      (dark ? `vùng khoanh sáng ${pct(dark.before)} → ${pct(dark.after)} màu trắng, ` : '') +
      `cả khung ${pct(lb.mean)} → ${pct(la.mean)}.`,
    `3 · Bóng dài hơn và đổi hướng theo nắng: trước, mặt trời đứng yên phía ${sunSide(before.light)}, cao ${deg(before.light)}; sau, mặt trời đi theo giờ, lúc này ở phía ${sunSide(after.light)}, cao ${deg(after.light)}. ` +
      `Bóng của ${caster ? `vật cao ${comma(caster.height, 1)} m bên đường` : 'vật bên đường'} dài ${shadowLen(before)} → ${shadowLen(after)}.`,
    `Cùng save ngày ${SCENE_DAY} của sim mỗi bản, 1280×800, mức Cao.`,
  ];
  progress(`${DUSK_BOARD}: ${notes.slice(0, 3).join(' ')}`);
  const panels = [
    { png: before.png, boxes: boxesOf(before), title: `Trước · ${BASE_COMMIT} · HUD ${before.clock || '?'} · nắng, Cao`, caption: caption(before) },
    { png: after.png, boxes: boxesOf(after), title: `Sau · ${head} · HUD ${after.clock || '?'} · nắng, Cao`, caption: caption(after) },
  ];
  const crop = { x: 0, y: 0, ...DESK };
  const scale = Math.min(1, (BOARD_WIDTH - 48 - 24) / (2 * crop.w));
  return writeBoard(browser, DUSK_BOARD, { panels, crop, dpr: 1, scale, notes });
}

/**
 * Writes COIN_BOARD: one coin of the BASE_COMMIT build (`base`: { url, saves }
 * of withBase) at BASE_COIN_AGE, then one coin of the working tree (served at
 * `url`, `save` from its sim) at each of COIN_AGES, all from the noon sunny
 * save at 1280×800 on Cao.
 */
async function coinBoard(browser, url, save, base) {
  const before = await session(browser, base.url, base.saves[`${hhmm(12 * 60)}-sunny`], DESK, 'high', (p) => coinFrames(p, [BASE_COIN_AGE]), true);
  const after = await session(browser, url, save, DESK, 'high', (p) => coinFrames(p, COIN_AGES), true);
  for (const [who, r] of [[BASE_COMMIT, before], ['working tree', after]]) {
    if (!r) console.warn(`!! ${COIN_BOARD}: no coin popped up on ${who} in ${COIN_WAIT_MS / 1000} s`);
  }
  if (!before || !after) return null;
  const head = headCommit();
  const [b] = before.frames;
  const [arc, spin, burst] = after.frames;
  for (const f of [b, ...after.frames]) progress(`${COIN_BOARD}: ${comma(f.age)} s, lift ${comma(f.lift)} m, width ${comma(f.width)}, ${f.debris} small coins`);
  if (burst.debris === 0) console.warn(`!! ${COIN_BOARD}: no small coins at ${comma(burst.age)} s`);
  const panels = [
    { ...b, title: `Trước · ${BASE_COMMIT} · ${comma(b.age)} s`, caption: `Xu và chip "+X đ" trôi thẳng lên ${comma(b.lift)} m rồi mờ dần, không xoay, không vỡ` },
    { ...arc, title: `Sau · ${head} · ${comma(arc.age)} s`, caption: `Xu nảy theo cung, đã cao ${comma(arc.lift)} m; chip "+X đ" bay riêng phía trên` },
    { ...spin, title: `Sau · ${head} · ${comma(spin.age)} s`, caption: `Xu xoay quanh trục đứng (bề ngang còn ${Math.round(spin.width * 100)}%) và nghiêng, chip mờ dần` },
    { ...burst, title: `Sau · ${head} · ${comma(burst.age)} s`, caption: `Xu vỡ thành ${burst.debris} xu nhỏ toả ra quanh chỗ nổ` },
  ];
  // One crop for every panel (both builds centre the coin's start the same
  // way): the rings grown by COIN_PAD, at least COIN_CROP_MIN, in the window.
  const boxes = panels.map((p) => p.box);
  const span = (lo, hi, min, limit) => {
    const mid = (lo + hi) / 2;
    const half = Math.max(hi - lo, min) / 2;
    const a = Math.max(0, Math.floor(mid - half));
    return [a, Math.min(limit, Math.ceil(mid + half)) - a];
  };
  const [x, w] = span(Math.min(...boxes.map((p) => p.x)) - COIN_PAD, Math.max(...boxes.map((p) => p.x + p.w)) + COIN_PAD, COIN_CROP_MIN.w, DESK.width);
  const [y, h] = span(Math.min(...boxes.map((p) => p.y)) - COIN_PAD, Math.max(...boxes.map((p) => p.y + p.h)) + COIN_PAD, COIN_CROP_MIN.h, DESK.height);
  const crop = { x, y, w, h };
  const scale = Math.min(1, (COIN_BOARD_WIDTH - 48 - 24 * (panels.length - 1)) / (panels.length * crop.w * COIN_DPR));
  const note =
    `Mỗi bản một đồng xu, bán lúc HUD ${before.clock || '?'} (trước) và ${after.clock || '?'} (sau), 1280×800, mức Cao. ` +
    `Đồng hồ trang dừng ở khung xu hiện rồi chạy từng 1/${COIN_FPS} s tới đúng tuổi xu ghi trên khung; ` +
    `camera phóng quanh xu (${COIN_PX_PER_M} px mỗi mét) chỉ khi chụp.`;
  return writeBoard(browser, COIN_BOARD, {
    panels: panels.map((p) => ({ title: p.title, caption: p.caption, boxes: [p.box], png: p.png })),
    crop,
    dpr: COIN_DPR,
    scale,
    notes: [note],
  });
}

const LEVELUP = '.rpt-layer:not([hidden]) .rpt-levelup';

async function levelUpShot(page, name) {
  await page.locator('.rpt-layer:not([hidden])').waitFor();
  const card = page.locator(LEVELUP);
  const seen = await card
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!seen) {
    console.warn(`!! ${name}: no Lên cấp card on the report`);
    return null;
  }
  await card.scrollIntoViewIfNeeded();
  await sleep(LEVELUP_SETTLE_MS);
  const box = await card.boundingBox();
  await ring(page, box ? [{ x: box.x, y: box.y, w: box.width, h: box.height }] : []);
  const file = await writeShot(page, name);
  progress(`${name}: ${(await card.textContent())?.trim().replace(/\s+/g, ' ')}`);
  return file;
}

async function main() {
  const only = process.env.P29_ONLY;
  if (only && only !== 'coin' && only !== 'dusk') throw new Error(`P29_ONLY=${only}: only 'coin' and 'dusk' are known`);
  const noon = `${hhmm(12 * 60)}-sunny`;
  const dusk = `${hhmm(DUSK_MINUTE)}-sunny`;
  const shots = SHOT_MINUTES.flatMap((minute) => SHOT_WEATHERS.map((weather) => ({ id: `${hhmm(minute)}-${weather}`, weather, minute })));
  const boardScenes = shots.filter((s) => (only !== 'dusk' && s.id === noon) || (only !== 'coin' && s.id === dusk));
  const saves = await sceneSaves(ROOT, only ? boardScenes : shots, { withLevelUp: !only });
  for (const [id, s] of Object.entries(saves)) progress(`save ${id}: ${s.info}`);
  if (process.env.P29_SAVES_ONLY === '1') return;

  mkdirSync(P29_OUT, { recursive: true });
  const { chromium } = await import('playwright');
  const server = await startPreview(ROOT, PORT);
  const url = urlFor(PORT);
  const files = [];
  let browser = null;
  // A fresh browser per width and for the coin board: after a dozen WebGL pages one browser left the loading screen up (P27).
  const launch = async () => {
    if (browser) await browser.close();
    browser = await chromium.launch({ headless: process.env.MEDIA_HEADED !== '1', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  };
  // Sunny Cao 1280 shots for the hours board, by minute.
  const hours = new Map();
  try {
    for (const v of only ? [] : VIEWPORTS) {
      await launch();
      for (const sh of shots) {
        for (const quality of SHOT_QUALITIES) {
          const name = shotName({ ...sh, quality, width: v.width });
          const shot = await session(browser, url, saves[sh.id], v, quality, (p) => sceneShot(p, name));
          files.push(shot.file);
          if (v === DESK && sh.weather === 'sunny' && quality === 'high') hours.set(sh.minute, shot);
        }
      }
    }
    if (!only) files.push(await hoursBoard(browser, hours));
    await launch();
    files.push(
      ...(await withBase(boardScenes, async (base) => [
        only !== 'dusk' ? await coinBoard(browser, url, saves[noon], base) : null,
        only !== 'coin' ? await duskBoard(browser, url, saves[dusk], base) : null,
      ])),
    );
    if (!only) files.push(await session(browser, url, saves.levelUp, PHONE, 'high', (p) => levelUpShot(p, 'levelup-390-p29.jpg')));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  for (const f of files.filter(Boolean)) console.log(`ok ${f} ${Math.round(statSync(join(ROOT, f)).size / 1024)} kB`);
  if (warnings > 0) {
    console.error(`${warnings} !! warning(s): fix them before using the shots`);
    process.exitCode = 1;
  }
}

/** `!!` lines printed so far; any of them fails the run. */
let warnings = 0;

// measure-frames.mjs imports sceneSaves; only a direct run captures.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const warn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).startsWith('!!')) warnings++;
    warn(...args);
  };
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
