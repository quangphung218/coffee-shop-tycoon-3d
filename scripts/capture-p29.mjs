// Captures the P29 shots of the working tree: the shop at 07:00, 12:00 and
// 19:30, sunny and rainy, at graphics Cao and Thấp, at 390×844 and 1280×800,
// plus one shot of a coin flying up from a sale and one of the Lên cấp card
// of the Daily Report, each ringed in red. Run through `npm run media:p29`
// (builds first). Needs Playwright; see docs/media.md.
//
// Files (JPEG, docs/media/p29):
//   scene-<hhmm>-<weather>-<quality>-<w>-p29.jpg   e.g. scene-1930-rainy-high-390-p29.jpg
//   coin-1280-p29.jpg                              a "+X đ" coin over the noon shop
//   levelup-390-p29.jpg                            the Lên cấp card of the first level-up
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
// Prints `!!` for a coin or card that never showed; any `!!` ends the run with
// exit code 1.
import { mkdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXED_NOW, OUT, freeze, newContext, observeThree, openMenu, startPreview, thaw, urlFor } from './capture-media.mjs';

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

/** A context with SETTINGS of capture-media at `quality`, `save` in localStorage and the three.js hook. */
async function gameContext(browser, viewport, save, quality) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript((q) => {
    const s = JSON.parse(localStorage.getItem('cst3d:settings') ?? '{}');
    localStorage.setItem('cst3d:settings', JSON.stringify({ ...s, quality: q }));
  }, quality);
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  await context.addInitScript(observeThree);
  return context;
}

async function session(browser, url, save, viewport, quality, fn) {
  const context = await gameContext(browser, viewport, save, quality);
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

/** Screen boxes of the live coin popups (coin and "+X đ" chip) of the last frame of #scene. */
function coinBoxes() {
  const scene = window.__mediaScene;
  const camera = window.__mediaCamera;
  const group = scene?.getObjectByName('coins');
  if (!group || !camera) return [];
  const r = document.getElementById('scene').getBoundingClientRect();
  const v = camera.matrixWorldInverse.elements;
  const p = camera.projectionMatrix.elements;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const out = [];
  for (const c of group.children) {
    if (!shown(c) || (c.children[0]?.material?.opacity ?? 0) < 0.5) continue;
    const [x, y, z] = [c.matrixWorld.elements[12], c.matrixWorld.elements[13], c.matrixWorld.elements[14]];
    const ev = [0, 1, 2, 3].map((i) => v[i] * x + v[4 + i] * y + v[8 + i] * z + v[12 + i]);
    const cl = [0, 1, 3].map((i) => p[i] * ev[0] + p[4 + i] * ev[1] + p[8 + i] * ev[2] + p[12 + i] * ev[3]);
    const sx = r.left + ((cl[0] / cl[2] + 1) / 2) * r.width;
    const sy = r.top + ((1 - cl[1] / cl[2]) / 2) * r.height;
    out.push({ x: sx - 40, y: sy - 44, w: 80, h: 66 });
  }
  return out;
}

async function sceneShot(page, name) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  const clock = await clockText(page);
  const file = await writeShot(page, name);
  progress(`${name}: HUD clock ${clock}`);
  return file;
}

async function coinShot(page, name) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  const seen = await page
    .waitForFunction(`(${coinBoxes})().length > 0`, null, { timeout: COIN_WAIT_MS, polling: 'raf' })
    .then(() => true)
    .catch(() => false);
  if (!seen) {
    console.warn(`!! ${name}: no coin popped up in ${COIN_WAIT_MS / 1000} s`);
    return null;
  }
  await freeze(page);
  try {
    const boxes = await page.evaluate(coinBoxes);
    await ring(page, boxes);
    const file = await writeShot(page, name);
    progress(`${name}: ${boxes.length} coin(s) at HUD clock ${await clockText(page)}`);
    return file;
  } finally {
    await thaw(page);
  }
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
  const shots = SHOT_MINUTES.flatMap((minute) => SHOT_WEATHERS.map((weather) => ({ id: `${hhmm(minute)}-${weather}`, weather, minute })));
  const saves = await sceneSaves(ROOT, shots, { withLevelUp: true });
  for (const [id, s] of Object.entries(saves)) progress(`save ${id}: ${s.info}`);
  if (process.env.P29_SAVES_ONLY === '1') return;

  mkdirSync(P29_OUT, { recursive: true });
  const { chromium } = await import('playwright');
  const server = await startPreview(ROOT, PORT);
  const url = urlFor(PORT);
  const files = [];
  let browser = null;
  try {
    for (const v of VIEWPORTS) {
      // A fresh browser per width: after a dozen WebGL pages one browser left the loading screen up (P27).
      if (browser) await browser.close();
      browser = await chromium.launch({ headless: process.env.MEDIA_HEADED !== '1', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
      for (const sh of shots) {
        for (const quality of SHOT_QUALITIES) {
          const name = shotName({ ...sh, quality, width: v.width });
          files.push(await session(browser, url, saves[sh.id], v, quality, (p) => sceneShot(p, name)));
        }
      }
    }
    files.push(await session(browser, url, saves[`${hhmm(12 * 60)}-sunny`], DESK, 'high', (p) => coinShot(p, 'coin-1280-p29.jpg')));
    files.push(await session(browser, url, saves.levelUp, PHONE, 'high', (p) => levelUpShot(p, 'levelup-390-p29.jpg')));
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
