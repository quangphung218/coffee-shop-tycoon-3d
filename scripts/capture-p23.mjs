// Captures the P23 before/after boards: the P22 release (f9508d8) next to the
// working tree, at 390×844 and 1280×720, ringed where P23 changed the UI and
// labelled with what changed. Run through `npm run media:p23` (builds first).
// Needs Playwright with Chromium and the git history back to P23_BASE; see
// docs/media.md.
//
// Boards (JPEG quality 75, in docs/reports/p23-review only), one per width
// <w> of 390 and 1280:
//   hud-prep-<w>-p23.jpg    HUD on the morning of SAVE_DAY, in preparation
//   hud-peak-<w>-p23.jpg    the same day at the peak (opened at 4x, then 1x)
//   report-day3-<w>-p23.jpg Daily Report of day 3, the window not grown
//   week1-<w>-p23.jpg       week summary after day 7
//   week2-<w>-p23.jpg       P23 week 2 summary after day 14 next to the
//                           f9508d8 week-end screen (that build stops at day 7)
//   loading-<w>-p23.jpg     Main Menu while the 3D scene loads over Slow 4G,
//                           three.js held back as in capture-loading.mjs
//
// Plain P23 shots for the README (JPEG quality 75, in docs/media only), at
// 1280: hud-1280.jpg (the peak HUD), report-1280.jpg (the day-3 report) and
// week-summary-1280.jpg (the week 2 summary).
//
// Each build plays its own saves with its own sim (Normal, the same seed, the
// basic strategy of tests/integration/helpers.ts), so a save always matches
// the build that loads it; the numbers can differ where P23 changed the
// balance. P23_SAVES_ONLY=1 plays the saves and prints them, without a server or browser.
//
// Prints `!!` for a label with nothing to ring, a ring around a flat area or
// mostly off the frame, a label that covers text, and a board over MAX_BYTES;
// any `!!` ends the run with exit code 1.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildRef, FIXED_NOW, makeBoard, newContext, openMenu, OUT, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The P22 release the boards compare against (git archive). */
const P23_BASE = process.env.P23_BASE ?? 'f9508d8';
/** Legend names on every P23 board. */
const NAMES = { before: `P22 (${P23_BASE})`, after: 'P23' };
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The P22 build is served on the next port. */
const BASE_PORT = PORT + 1;
/** New Game seeds from Date.now(), which newContext() freezes at FIXED_NOW. */
const SEED = Number(process.env.P23_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Morning of the HUD shots. */
const SAVE_DAY = 2;
/** Day of the Daily Report shots: it has a day before it to compare with. */
const REPORT_DAY = 3;
const WEEK = 7;
/** Upper bound on simulated minutes per day (tests/integration/helpers.ts DAY_GUARD). */
const DAY_GUARD = 3000;
const REVIEW = join(ROOT, 'docs', 'reports', 'p23-review');
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 720 };
const VIEWPORTS = [PHONE, DESK];
/** Window while only waiting for the game clock: slow frames slow the day down. */
const IDLE = { width: 320, height: 240 };
/** A 4x morning lasts about a minute with a fast renderer; software WebGL is slower. */
const PEAK_TIMEOUT_MS = 5 * 60_000;
/** Lighthouse's Slow 4G, as capture-loading.mjs. */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const THREE = /\/assets\/three-[^/]+\.js$/;
/** How long three.js is held back, so the loading list stays on screen. */
const HOLD_MS = 11_000;
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** Label strip right of each frame, so labels never sit on its text. */
const GUTTER = 260;
/** A ring whose pixels spread less than this (mean RGB standard deviation, 0–255) is around an empty area. */
const FLAT_SPREAD = 8;
/** A ring with less than this share of its box on the frame is around something out of view. */
const MIN_ON_IMAGE = 0.6;
const JPEG_QUALITY = 0.75;
/** Largest board file. */
const MAX_BYTES = 600 * 1024;

const START = Date.now();
/** Progress line with seconds since start, so a run stopped by a time limit shows where it was. */
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);
const shot = (page) => page.screenshot({ style: HIDE_TOASTS });
const money = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

// --- Saves, each from the sim of the build that loads them. ---

/**
 * Plays a Normal game on `root`'s sim (restock as suggested, serve alone) up
 * to the report of `lastDay` and returns the autosaves: the SAVE_DAY morning,
 * the REPORT_DAY report, the day-7 report and, when lastDay is 14, the
 * day-14 report.
 */
async function playSaves(root, lastDay) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save] = await Promise.all(['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts'].map((p) => vite.ssrLoadModule(p)));
    const saveText = (state) => {
      const data = new Map();
      const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
      const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
      if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
      const key = save.saveKey('auto');
      return { key, text: data.get(key) };
    };
    // autoPlay of tests/integration/helpers.ts.
    const autoPlay = (s) => {
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
    };
    const state = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
    const saves = {};
    const days = [];
    for (let day = 1; day <= lastDay; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`${root}: next_day refused before day ${day}`);
      state.events = [];
      if (day === SAVE_DAY) saves.morning = saveText(state);
      sim.dispatch(state, { type: 'apply_restock' });
      if (!sim.dispatch(state, { type: 'start_day' })) throw new Error(`${root}: day ${day}: start_day refused`);
      for (let guard = 0; state.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(state);
        sim.step(state, 1);
        state.events = [];
      }
      if (state.phase !== 'report') throw new Error(`${root}: day ${day} did not reach the report`);
      const r = state.lastReport;
      days.push({ day, revenue: r.revenue, profit: r.profit, served: r.customersServed, arrived: r.customersArrived, stars: r.ratingEnd });
      if (day === REPORT_DAY) saves.report = saveText(state);
      if (day === WEEK) saves.week1 = saveText(state);
      if (day === 2 * WEEK) saves.week2 = saveText(state);
    }
    if (!state.week?.result) throw new Error(`${root}: the week was not scored after day ${lastDay}`);
    return { saves, days, result: state.week.result };
  } finally {
    await vite.close();
  }
}

function printSaves(who, { days, result }) {
  console.log(`${who}: Normal, seed ${SEED}`);
  for (const d of days) console.log(`  day ${String(d.day).padStart(2)}  revenue ${money(d.revenue).padStart(12)}  profit ${money(d.profit).padStart(12)}  served ${d.served}/${d.arrived}  stars ${d.stars.toFixed(2)}`);
  console.log(`  last week: ${money(result.revenue)} / ${money(result.revenueTarget)}, ${result.stars.toFixed(1)}/${result.starsTarget} sao, ${result.score} điểm, ${result.cups} cúp`);
}

// --- In-page probes (viewport CSS px, deviceScaleFactor 1). ---

/** Every visible run of text on screen, as boxes. Labels must not cover these. */
function measureTexts() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || el.closest('.toasts, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  return out;
}

/** For each name → CSS selector, the boxes of every visible element it matches. */
function measureAll(sels) {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility() ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const out = {};
  for (const [name, sel] of Object.entries(sels)) out[name] = [...document.querySelectorAll(sel)].map(box).filter(Boolean);
  return out;
}

/** Pixels the open Daily Report hides below its fold: the summary body and the layer around the dialog. */
function reportOverflow() {
  const over = (el) => (el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0);
  return over(document.querySelector('#rpt-summary')) + over(document.querySelector('.rpt-layer:not([hidden])'));
}

/** Height the window needs so nothing inside `sel` (or its scrolling parents) is cut off. */
function fitHeight(sel) {
  const el = document.querySelector(sel);
  if (!el) return 0;
  let extra = 0;
  for (let e = el; e; e = e.parentElement) extra = Math.max(extra, e.scrollHeight - e.clientHeight);
  for (const e of el.querySelectorAll('*')) if (getComputedStyle(e).overflowY !== 'visible') extra = Math.max(extra, e.scrollHeight - e.clientHeight);
  return Math.ceil(document.documentElement.clientHeight + extra);
}

/** The loading list: label and percent of each component. */
function loadingRows() {
  return [...document.querySelectorAll('.ui-screen:not([hidden]) .scene-load-item')].map((li) => ({
    label: li.querySelector('.scene-load-label')?.textContent ?? '',
    pct: li.querySelector('.scene-load-item-pct')?.textContent ?? '',
  }));
}

/** For each box of a frame PNG (base64): the share of it on the image, and the mean RGB standard deviation of that part. */
async function ringSpread({ png, boxes }) {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  return boxes.map((b) => {
    const x = Math.max(0, Math.floor(b.x));
    const y = Math.max(0, Math.floor(b.y));
    const w = Math.min(img.width, Math.ceil(b.x + b.w)) - x;
    const h = Math.min(img.height, Math.ceil(b.y + b.h)) - y;
    if (w <= 0 || h <= 0) return { onImage: 0, spread: null };
    const d = ctx.getImageData(x, y, w, h).data;
    const n = w * h;
    let spread = 0;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      let sq = 0;
      for (let i = c; i < d.length; i += 4) {
        sum += d[i];
        sq += d[i] * d[i];
      }
      const mean = sum / n;
      spread += Math.sqrt(Math.max(0, sq / n - mean * mean));
    }
    return { onImage: (w * h) / Math.max(1, b.w * b.h), spread: spread / 3 };
  });
}

/** A PNG (base64) as a JPEG (base64) at `quality`. */
async function toJpeg({ png, quality }) {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const canvas = new OffscreenCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// --- Capture sessions. ---

/**
 * Number of rows `boxes` take, as check-layout.mjs counts HUD rows: a box
 * starts a new row when it begins below the shortest box of the current row
 * (Điều khiển spans both rows on a phone).
 */
function rowCount(boxes) {
  let rows = 0;
  let bottom = -Infinity;
  for (const b of [...boxes].sort((a, c) => a.y - c.y)) {
    if (b.y >= bottom - 2) {
      rows++;
      bottom = b.y + b.h;
    } else bottom = Math.min(bottom, b.y + b.h);
  }
  return rows;
}

/** Scene strip (px) kept under a desktop HUD, so its labels have room off the HUD text. */
const HUD_LABEL_ROOM = 170;

/** HUD parts of each build: P22 pills (direct children of .hud-left / .hud-right), P23 clusters. */
const HUD_SELS = {
  hud: 'header.hud',
  pills: '.hud .hud-left > *, .hud .hud-right > *',
  clusters: '.hud .hud-cluster',
  note: '.hud .hud-note:not(:empty)',
  open: '.hud [data-action="open"]',
  camera: '.hud > .hud-right > button[aria-label^="Đặt lại camera"], .hud > .hud-right > button[aria-label="Cài đặt"]',
  menu: '.hud [data-action="more"]',
};

/** Shot, HUD boxes and text boxes of the current screen. */
async function hudFrame(page) {
  return { png: await shot(page), boxes: await page.evaluate(measureAll, HUD_SELS), texts: await page.evaluate(measureTexts) };
}

/** A page with the fixed clock and settings and `save` in the autosave slot. */
async function gameContext(browser, viewport, save) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

/** From the Main Menu through Tiếp tục into the autosaved game; waits for `ready`. */
async function resume(page, url, save, ready) {
  await openMenu(page, url);
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  try {
    await btn.waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load (wrong format for this build?)`);
  }
  await btn.click();
  await page.locator(ready).first().waitFor();
}

/** Shots of the HUD at each viewport, the window set to it first. */
async function hudAt(page) {
  const out = {};
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    await sleep(900);
    out[v.width] = await hudFrame(page);
  }
  return out;
}

/** The SAVE_DAY morning: the HUD in preparation, then opened at 4x and, at the peak, at 1x. */
async function hudSession(browser, url, save, who) {
  const context = await gameContext(browser, DESK, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(800);
    const prep = await hudAt(page);
    progress(who, `HUD in preparation: ${prep[DESK.width].boxes.pills.length} pills / ${prep[DESK.width].boxes.clusters.length} clusters at 1280`);
    await page.locator('[data-action="open"]').click();
    await page.locator('[data-speed="4"]').first().click();
    await page.setViewportSize(IDLE);
    try {
      await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: PEAK_TIMEOUT_MS, polling: 250 });
    } finally {
      await page.setViewportSize(DESK);
    }
    // Back to 1x so the peak lasts through both shots, as on the photo of the request.
    await page.locator('[data-speed="1"]').first().click();
    const peak = await hudAt(page);
    progress(who, 'HUD at the peak');
    return { prep, peak };
  } finally {
    await context.close();
  }
}

const REPORT_SELS = {
  dialog: '.rpt-layer:not([hidden]) .rpt-dialog',
  // P22 summary: the result card and every section frame.
  frames: '#rpt-summary > .rpt-result, #rpt-summary .rpt-section',
  figures: '#rpt-summary [data-block="figures"]',
  vsYesterday: '#rpt-summary .rpt-fig-delta[data-vs="yesterday"]',
  vsWeek: '#rpt-summary .rpt-fig-delta[data-vs="week"]',
  week: '#rpt-summary [data-block="week"]',
  split: '#rpt-summary .rpt-split',
};

/** The REPORT_DAY report at `viewport` as it opens, the window not grown: shot, boxes and what is below the fold. */
async function reportSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    await page.locator('[data-block="money"]').first().waitFor();
    await sleep(1200);
    // Focus on "Ngày tiếp theo" scrolls the P22 layer to its foot; both frames start at the top.
    await page.evaluate(() => {
      const layer = document.querySelector('.rpt-layer:not([hidden])');
      for (const el of [layer, ...(layer?.querySelectorAll('*') ?? [])]) if (el && el.scrollTop > 0) el.scrollTop = 0;
    });
    await sleep(300);
    const out = { png: await shot(page), boxes: await page.evaluate(measureAll, REPORT_SELS), texts: await page.evaluate(measureTexts), overflow: await page.evaluate(reportOverflow) };
    progress(who, `report day ${REPORT_DAY} at ${viewport.width}: ${out.overflow} px below the fold`);
    return out;
  } finally {
    await context.close();
  }
}

const WEEK_SELS = {
  dialog: '[data-screen="weekEnd"] .rpt-dialog',
  title: '[data-screen="weekEnd"] .rpt-head h3',
  days: '[data-screen="weekEnd"] [data-block="days"]',
  reward: '[data-screen="weekEnd"] [data-block="reward"]',
  compare: '[data-screen="weekEnd"] [data-block="compare"]',
  nextWeek: '[data-screen="weekEnd"] [data-block="next-week"]',
  nextBtn: '[data-screen="weekEnd"] [data-action="next-week"]',
  replay: '[data-screen="weekEnd"] [data-action="replay"]',
};

/** The week summary that the report of `save` leads to, the window grown so the whole dialog fits. */
async function weekSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    await page.locator('[data-action="week-end"]').click();
    await page.locator('[data-screen="weekEnd"] [data-block="score"]').waitFor();
    await sleep(800);
    const height = Math.max(viewport.height, await page.evaluate(fitHeight, WEEK_SELS.dialog));
    if (height > viewport.height) await page.setViewportSize({ width: viewport.width, height });
    await sleep(400);
    const out = {
      png: await shot(page),
      boxes: await page.evaluate(measureAll, WEEK_SELS),
      texts: await page.evaluate(measureTexts),
      // The P22 screen has no next-week button: read both without waiting.
      ...(await page.evaluate(
        ({ title, nextBtn }) => ({ title: document.querySelector(title)?.textContent?.trim() ?? '', next: document.querySelector(nextBtn)?.textContent?.trim() ?? null }),
        WEEK_SELS,
      )),
    };
    progress(who, `"${out.title}" at ${viewport.width}`);
    return out;
  } finally {
    await context.close();
  }
}

const LOADING_SELS = {
  load: '.ui-screen.is-menu .scene-load:not([hidden])',
  list: '.ui-screen.is-menu .scene-load-list:not([hidden])',
  bar: '.ui-screen.is-menu .scene-load-bar',
};

/** A cold Main Menu at `viewport` over Slow 4G with CPU 4x, three.js held back: shot while the scene loads. */
async function loadingSession(browser, url, viewport, who) {
  const context = await newContext(browser, { viewport });
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.route(THREE, async (route) => {
      await sleep(HOLD_MS);
      await route.continue().catch(() => {});
    });
    void page.goto(url).catch(() => {});
    await page.locator('#boot').waitFor({ state: 'detached', timeout: 60_000 });
    await page.locator(LOADING_SELS.load).waitFor({ timeout: 30_000 });
    // Let the fonts and icons rows tick past 0 while three.js is still held.
    await sleep(2500);
    const out = { png: await shot(page), boxes: await page.evaluate(measureAll, LOADING_SELS), texts: await page.evaluate(measureTexts), rows: await page.evaluate(loadingRows) };
    progress(who, `loading at ${viewport.width}: ${out.rows.map((r) => `${r.label} ${r.pct}`).join(', ') || 'one bar'}`);
    return out;
  } finally {
    await context.close();
  }
}

// --- Boards. ---

/** Writes the PNG `png` (Buffer) to `dir`/<name> as JPEG; warns `!!` over MAX_BYTES. Returns the path from the repo root. */
async function writeJpeg(browser, png, dir, name) {
  const page = await browser.newPage();
  try {
    const jpg = Buffer.from(await page.evaluate(toJpeg, { png: png.toString('base64'), quality: JPEG_QUALITY }), 'base64');
    writeFileSync(join(dir, name), jpg);
    if (jpg.length > MAX_BYTES) console.warn(`!! ${name}: ${Math.round(jpg.length / 1024)} kB, over ${MAX_BYTES / 1024} kB`);
  } finally {
    await page.close();
  }
  return relative(ROOT, join(dir, name));
}

/** makeBoard with the P23 legend, after warning `!!` for every ring around a flat or off-frame area; then saved as JPEG. */
async function board(browser, name, opts) {
  const page = await browser.newPage();
  try {
    for (const m of opts.marks) {
      const boxes = m.boxes.filter(Boolean);
      if (boxes.length === 0) continue;
      const rings = await page.evaluate(ringSpread, { png: opts.frames[m.frame].png.toString('base64'), boxes });
      const off = rings.filter((r) => r.onImage < MIN_ON_IMAGE);
      if (off.length > 0) console.warn(`!! ${name}: "${m.label}" rings something mostly off the frame (${off.map((r) => `${Math.round(r.onImage * 100)}%`).join(', ')} on it)`);
      const flat = rings.filter((r) => r.spread !== null && r.spread < FLAT_SPREAD);
      if (flat.length > 0) console.warn(`!! ${name}: "${m.label}" rings a flat area (colour spread ${flat.map((r) => r.spread.toFixed(1)).join(', ')} < ${FLAT_SPREAD})`);
    }
  } finally {
    await page.close();
  }
  // makeBoard writes to docs/media; the PNG is only a step to the JPEG in docs/reports/p23-review.
  const png = join(OUT, name.replace(/\.jpg$/, '.tmp.png'));
  try {
    await makeBoard(browser, basename(png), { names: NAMES, pad: 16, maxScale: 1.5, gutter: GUTTER, ...opts });
    return await writeJpeg(browser, readFileSync(png), REVIEW, name);
  } finally {
    rmSync(png, { force: true });
  }
}

const avoidTexts = (...frames) => frames.map((f, frame) => ({ frame, boxes: f.texts ?? [] }));
const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
/** Boxes with at least MIN_ON_IMAGE of them inside the `w`×`h` window. */
const inWindow = (boxes, { width: w, height: h }) =>
  boxes.filter((b) => {
    const x = Math.max(0, Math.min(w, b.x + b.w) - Math.max(0, b.x));
    const y = Math.max(0, Math.min(h, b.y + b.h) - Math.max(0, b.y));
    return (x * y) / Math.max(1, b.w * b.h) >= MIN_ON_IMAGE;
  });
/** Marks with nothing to ring are left out when `optional`. */
const keep = (marks) => marks.filter((m) => !m.optional || m.boxes.some(Boolean));

async function hudBoard(browser, name, title, width, { base, cur }, prep) {
  const b = base.boxes;
  const a = cur.boxes;
  const marks = [
    { frame: 0, boxes: b.pills, label: `${b.pills.length} khung rời, ${rowCount(b.pills)} hàng` },
    { frame: 1, boxes: a.clusters, label: `${b.pills.length} khung thành ${a.clusters.length} cụm: Hôm nay | Tiến độ | Điều khiển, ${rowCount(a.clusters)} hàng` },
  ];
  if (prep) {
    marks.push(
      { frame: 0, boxes: b.note, label: 'Dòng ghi chú "Đồng hồ dừng ở 07:00…"', optional: true },
      { frame: 1, boxes: a.open, label: 'Bỏ dòng ghi chú: lời nhắc nằm trong title nút Mở cửa' },
    );
  } else {
    marks.push(
      { frame: 0, boxes: b.camera, label: 'Camera, Cài đặt: 2 nút riêng', optional: true },
      { frame: 1, boxes: a.menu, label: 'Camera + Cài đặt gộp vào 1 menu' },
    );
  }
  return board(browser, name, {
    frames: [before(base.png, title), after(cur.png, title)],
    marks: keep(marks),
    // A desktop HUD is a thin strip: keep some scene under it for the labels.
    include: [...b.hud, ...a.hud].map((r) => (width >= DESK.width ? { ...r, h: r.h + HUD_LABEL_ROOM } : r)),
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, ${prep ? `sáng ngày ${SAVE_DAY} (pha chuẩn bị)` : `ngày ${SAVE_DAY} giờ cao điểm (mở ở 4x, chụp ở 1x)`}, ván Vừa seed ${SEED}. P22: ${b.pills.length} khung pill rời trên ${rowCount(b.pills)} hàng. P23: ${a.clusters.length} cụm trên ${rowCount(a.clusters)} hàng; Hôm nay gồm ngày, tuần, thời tiết, giờ và dải pha; Tiến độ gồm tiền, sao, cấp và thanh KN; Điều khiển gồm nút pha hoặc tốc độ, dừng và menu camera/cài đặt.`,
    ],
  });
}

async function reportBoard(browser, name, viewport, { base, cur }) {
  const b = base.boxes;
  const a = cur.boxes;
  const fold = (px) => (px > 0 ? `cuộn thêm ${px} px` : 'vừa một màn');
  return board(browser, name, {
    frames: [before(base.png, `Báo cáo ngày ${REPORT_DAY}`), after(cur.png, `Báo cáo ngày ${REPORT_DAY}`)],
    marks: keep([
      { frame: 0, boxes: inWindow(b.frames, viewport), label: `${b.frames.length} khung lồng nhau, ${fold(base.overflow)}` },
      { frame: 1, boxes: a.figures, label: `4 ô số chính, ${fold(cur.overflow)}` },
      { frame: 1, boxes: inWindow(a.vsYesterday, viewport), label: 'Δ so hôm qua' },
      { frame: 1, boxes: inWindow(a.vsWeek, viewport), label: 'Δ so TB tuần' },
      { frame: 1, boxes: inWindow(a.week, viewport), label: 'Doanh thu tuần so mục tiêu', optional: true },
    ]),
    include: [...b.dialog, ...a.dialog],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${viewport.width}×${viewport.height}, báo cáo ngày ${REPORT_DAY} vừa mở và cuộn về đầu, cửa sổ không nới thêm. P22: ô kết quả và ${Math.max(0, b.frames.length - 1)} khung mục, phải ${fold(base.overflow)}. P23: 4 ô số chính (lãi/lỗ, doanh thu, khách, sao) mỗi ô kèm Δ so hôm qua và so trung bình tuần, một dòng tiến độ tuần, Thu chi bên cạnh nhiệm vụ, bán chạy và hết nguyên liệu; đánh giá chuyển sang tab Đánh giá. Mỗi bản dùng save do sim của chính nó chơi nên số có thể lệch nhau.`,
    ],
  });
}

async function week1Board(browser, name, width, { base, cur }) {
  const b = base.boxes;
  const a = cur.boxes;
  return board(browser, name, {
    frames: [before(base.png, 'Hết tuần 1'), after(cur.png, cur.title)],
    marks: keep([
      { frame: 0, boxes: b.days, label: 'Bảng 7 dòng ngày' },
      { frame: 0, boxes: b.replay, label: 'Nút chính "Chơi lại": ván dừng ở ngày 7' },
      { frame: 1, boxes: a.days, label: 'Cột doanh thu 7 ngày, ngày tốt nhất gắn sao' },
      { frame: 1, boxes: a.reward, label: 'Thưởng cúp', optional: true },
      { frame: 1, boxes: a.nextWeek, label: 'Mục tiêu tuần 2 và cấp kế tiếp' },
      { frame: 1, boxes: a.nextBtn, label: `Nút chính "${cur.next ?? 'Sang tuần 2'}"` },
    ]),
    include: [...b.dialog, ...a.dialog],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, cửa sổ nới cao cho vừa cả hộp. Mở từ nút "Xem tổng kết tuần" của báo cáo ngày 7. P22: điểm, cúp, bảng 7 ngày, nút chính Chơi lại vì ván dừng sau ngày 7. P23: thêm thưởng cúp, biểu đồ cột doanh thu từng ngày, khối tuần sau (mục tiêu, cấp kế tiếp) và nút chính "${cur.next ?? 'Sang tuần 2'}"; Chơi lại thành nút phụ.`,
    ],
  });
}

async function week2Board(browser, name, width, { base, cur }) {
  const b = base.boxes;
  const a = cur.boxes;
  return board(browser, name, {
    frames: [before(base.png, 'Hết tuần 1 (không có tuần 2)'), after(cur.png, cur.title)],
    marks: keep([
      { frame: 0, boxes: b.replay, label: 'Không có tuần 2: chỉ Chơi lại hoặc Về menu' },
      { frame: 1, boxes: a.title, label: `"${cur.title}", ngày 8–14` },
      { frame: 1, boxes: a.compare, label: 'So với tuần 1: Δ từng chỉ số' },
      { frame: 1, boxes: a.nextBtn, label: `Nút chính "${cur.next ?? 'Sang tuần 3'}"` },
    ]),
    include: [...b.dialog, ...a.dialog],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, cửa sổ nới cao cho vừa cả hộp. P22 dừng sau ngày 7 nên khung trái là màn kết tuần 1 của bản đó. P23 chơi tiếp tới ngày 14: tổng kết tuần 2 có bảng so với tuần 1 (lợi nhuận, doanh thu, khách, tỉ lệ bỏ đi, sao kèm Δ), mục tiêu tuần 3 tăng dần và nút "${cur.next ?? 'Sang tuần 3'}".`,
    ],
  });
}

async function loadingBoard(browser, name, width, { base, cur }) {
  const b = base.boxes;
  const a = cur.boxes;
  const rows = cur.rows.map((r) => `${r.label} ${r.pct}`).join(', ');
  return board(browser, name, {
    frames: [before(base.png, 'Main Menu đang tải'), after(cur.png, 'Main Menu đang tải')],
    marks: keep([
      { frame: 0, boxes: b.load, label: 'Một thanh %, không rõ đang tải gì' },
      { frame: 1, boxes: a.list, label: `${cur.rows.length} thành phần, mỗi dòng % riêng` },
    ]),
    include: [...b.load, ...a.load],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, lần tải không cache qua Slow 4G (150 ms RTT, 1,6 Mbps, CPU 4x), chunk three.js giữ lại ${HOLD_MS / 1000} s như capture-loading.mjs để thấy lúc đang tải. P23 liệt kê: ${rows || '(không thấy danh sách)'}. Nút vào quán chỉ mở khi mọi thành phần xong; âm thanh tổng hợp bằng Web Audio nên không có dòng riêng.`,
    ],
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(REVIEW, { recursive: true });
  const temps = [];
  const servers = [];
  let browser = null;
  const files = [];
  try {
    console.log(`exporting and building P22 (${P23_BASE})…`);
    const baseRoot = buildRef(P23_BASE);
    temps.push(baseRoot);
    const cur = await playSaves(ROOT, 2 * WEEK);
    printSaves('P23', cur);
    const base = await playSaves(baseRoot, WEEK);
    printSaves('P22', base);
    if (process.env.P23_SAVES_ONLY === '1') return;

    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });
    const curUrl = urlFor(PORT);
    const baseUrl = urlFor(BASE_PORT);

    progress('both', `HUD on day ${SAVE_DAY}`);
    const [curHud, baseHud] = await Promise.all([hudSession(browser, curUrl, cur.saves.morning, 'P23'), hudSession(browser, baseUrl, base.saves.morning, 'P22')]);
    const shots = {};
    for (const v of VIEWPORTS) {
      progress('both', `report and week summaries at ${v.width}`);
      const [curReport, baseReport] = await Promise.all([reportSession(browser, curUrl, cur.saves.report, v, 'P23'), reportSession(browser, baseUrl, base.saves.report, v, 'P22')]);
      const [curWeek1, baseWeek1, curWeek2] = await Promise.all([
        weekSession(browser, curUrl, cur.saves.week1, v, 'P23'),
        weekSession(browser, baseUrl, base.saves.week1, v, 'P22'),
        weekSession(browser, curUrl, cur.saves.week2, v, 'P23'),
      ]);
      // One build at a time, so the two throttled loads do not share the CPU.
      progress('both', `loading at ${v.width}`);
      const curLoad = await loadingSession(browser, curUrl, v, 'P23');
      const baseLoad = await loadingSession(browser, baseUrl, v, 'P22');
      shots[v.width] = { curReport, baseReport, curWeek1, baseWeek1, curWeek2, curLoad, baseLoad };
    }

    progress('both', 'drawing boards');
    for (const v of VIEWPORTS) {
      const w = v.width;
      const s = shots[w];
      files.push(await hudBoard(browser, `hud-prep-${w}-p23.jpg`, 'HUD pha chuẩn bị', w, { base: baseHud.prep[w], cur: curHud.prep[w] }, true));
      files.push(await hudBoard(browser, `hud-peak-${w}-p23.jpg`, 'HUD giờ cao điểm', w, { base: baseHud.peak[w], cur: curHud.peak[w] }, false));
      files.push(await reportBoard(browser, `report-day3-${w}-p23.jpg`, v, { base: s.baseReport, cur: s.curReport }));
      files.push(await week1Board(browser, `week1-${w}-p23.jpg`, w, { base: s.baseWeek1, cur: s.curWeek1 }));
      files.push(await week2Board(browser, `week2-${w}-p23.jpg`, w, { base: s.baseWeek1, cur: s.curWeek2 }));
      files.push(await loadingBoard(browser, `loading-${w}-p23.jpg`, w, { base: s.baseLoad, cur: s.curLoad }));
    }
    progress('P23', 'plain shots for the README');
    const desk = shots[DESK.width];
    files.push(await writeJpeg(browser, curHud.peak[DESK.width].png, OUT, 'hud-1280.jpg'));
    files.push(await writeJpeg(browser, desk.curReport.png, OUT, 'report-1280.jpg'));
    files.push(await writeJpeg(browser, desk.curWeek2.png, OUT, 'week-summary-1280.jpg'));
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  for (const f of files) console.log(`ok ${f} ${Math.round(statSync(join(ROOT, f)).size / 1024)} kB`);
  if (warnings > 0) {
    console.error(`${warnings} !! warning(s): fix them before using the boards`);
    process.exitCode = 1;
  }
}

/** `!!` lines printed so far (here and by makeBoard); any of them fails the run. */
let warnings = 0;
const warn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).startsWith('!!')) warnings++;
  warn(...args);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
