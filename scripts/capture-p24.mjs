// Captures the P24 before/after boards: the P23 release (3a08fe2) next to the
// working tree, at 390×844 and 1280×800, ringed where P24 changed the UI and
// labelled with what changed, the numbers read from the computed styles of
// each build. Run through `npm run media:p24` (builds first). Needs Playwright
// with Chromium and the git history back to P24_BASE; see docs/media.md.
//
// Boards (JPEG quality 75, in docs/reports/p24-review only), one per width
// <w> of 390 and 1280, all on day 3 of week 1 (Hội chợ) unless noted:
//   hud-prep-<w>-p24.jpg    HUD in preparation, Nước cam just switched on
//   hud-peak-<w>-p24.jpg    the same day at the peak (opened at 4x, then 1x)
//   dock-<w>-p24.jpg        the dock in preparation
//   kho-<w>-p24.jpg         Kho after Gợi ý, the Cam row in view
//   toast-<w>-p24.jpg       Kho after two Nhập hàng in a row (the suggestion, then one more pack of Ly)
//   menu-<w>-p24.jpg        Menu with Nước cam on and no Cam in stock
//   staff-<w>-p24.jpg       Nhân viên
//   upgrades-<w>-p24.jpg    Nâng cấp
//   report-<w>-p24.jpg      Daily Report of day 3, the window not grown
//   week1-<w>-p24.jpg       week 1 summary after day 7, the window grown to fit
//
// Each build plays its own saves with its own sim (Normal, the same seed, the
// basic strategy of tests/integration/helpers.ts, restock as suggested,
// Nước cam switched on on day 3 and Bánh ngọt on day 6), so a save always
// matches the build that loads it. Both print what Gợi ý suggests on those
// mornings: the P23 sim leaves out Cam, Bột bánh and Bơ. P24_SAVES_ONLY=1
// plays the saves and prints them, without a server or browser.
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
/** The P23 release the boards compare against (git archive). */
const P24_BASE = process.env.P24_BASE ?? '3a08fe2';
/** Legend names on every P24 board. */
const NAMES = { before: `P23 (${P24_BASE})`, after: 'P24' };
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The P23 build is served on the next port. */
const BASE_PORT = PORT + 1;
/** New Game seeds from Date.now(), which newContext() freezes at FIXED_NOW. */
const SEED = Number(process.env.P24_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Day 3 of week 1: Hội chợ, and Nước cam opens. Morning shots and the Daily Report. */
const SAVE_DAY = 3;
const WEEK = 7;
/** Menu items switched on in the morning of a day, before the restock. */
const ENABLE = { 3: 'orange_juice', 6: 'cake' };
/** Ingredients only those items use; printed with each suggestion. */
const WATCH = ['orange', 'flour', 'butter'];
/** Upper bound on simulated minutes per day (tests/integration/helpers.ts DAY_GUARD). */
const DAY_GUARD = 3000;
const REVIEW = join(ROOT, 'docs', 'reports', 'p24-review');
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const VIEWPORTS = [PHONE, DESK];
/** Window while only waiting for the game clock: slow frames slow the day down. */
const IDLE = { width: 320, height: 240 };
/** A 4x morning lasts about a minute with a fast renderer; software WebGL is slower. */
const PEAK_TIMEOUT_MS = 5 * 60_000;
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
const money = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

// --- Saves, each from the sim of the build that loads them. ---

/**
 * Plays a Normal game on `root`'s sim up to the report of day 7 and returns
 * the autosaves: the SAVE_DAY morning (Nước cam on, restock not bought yet),
 * the SAVE_DAY report and the day-7 report; plus the restock suggested on
 * each ENABLE morning.
 */
async function playSaves(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, inventory, ingredients] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/inventory.ts', '/src/sim/data/ingredients.ts'].map((p) => vite.ssrLoadModule(p)),
    );
    const name = (id) => ingredients.getIngredient(id).name;
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
    const suggestions = [];
    for (let day = 1; day <= WEEK; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`${root}: next_day refused before day ${day}`);
      const item = ENABLE[day];
      if (item) {
        if (!sim.dispatch(state, { type: 'set_menu_item', itemId: item, enabled: true })) throw new Error(`${root}: day ${day}: cannot switch on ${item}`);
        const plan = inventory.autoRestockSuggestion(state);
        const ids = plan.items.map((i) => i.id);
        suggestions.push({ day, item, items: plan.items.map((i) => `${name(i.id)} ${i.qty}`), missing: WATCH.filter((id) => !ids.includes(id) && inventory.stockOf(state, id) === 0).map(name) });
      }
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
      if (day === SAVE_DAY) saves.report = saveText(state);
      if (day === WEEK) saves.week1 = saveText(state);
    }
    if (!state.week?.result) throw new Error(`${root}: the week was not scored after day ${WEEK}`);
    return { saves, days, suggestions, result: state.week.result };
  } finally {
    await vite.close();
  }
}

function printSaves(who, { days, suggestions, result }) {
  console.log(`${who}: Normal, seed ${SEED}`);
  for (const d of days) console.log(`  day ${String(d.day).padStart(2)}  revenue ${money(d.revenue).padStart(12)}  profit ${money(d.profit).padStart(12)}  served ${d.served}/${d.arrived}  stars ${d.stars.toFixed(2)}`);
  for (const s of suggestions) console.log(`  day ${s.day} ${s.item} on, Gợi ý: ${s.items.join(', ') || '(nothing)'}${s.missing.length ? `; left out with none in stock: ${s.missing.join(', ')}` : ''}`);
  console.log(`  week 1: ${money(result.revenue)} / ${money(result.revenueTarget)}, ${result.stars.toFixed(1)}/${result.starsTarget} sao, ${result.score} điểm, ${result.cups} cúp`);
}

// --- In-page probes (viewport CSS px, deviceScaleFactor 1). ---

/** Every visible run of text on screen, as boxes. Labels must not cover these. */
function measureTexts() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    // Hidden toasts (HIDE_TOASTS) and sr-only words take no room on the shot.
    if (!el || !n.textContent.trim() || el.closest('.sr-only')) continue;
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
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

/**
 * For each name → CSS selector, the first visible match's font size, height,
 * outline (top border), drop of its first box-shadow (px, 0 for none), its
 * text, and how many visible elements match.
 */
function measureStyles(sels) {
  const out = {};
  for (const [name, sel] of Object.entries(sels)) {
    const all = [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility() && e.getBoundingClientRect().height > 0);
    const el = all[0];
    if (!el) {
      out[name] = null;
      continue;
    }
    const cs = getComputedStyle(el);
    // Chromium writes "rgb(…) 0px 4px 0px 0px, …": the second length of the first shadow is its drop.
    const drop = cs.boxShadow === 'none' ? null : /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(cs.boxShadow);
    const row = el.closest('li');
    out[name] = {
      count: all.length,
      // Matches in the same list row as the first one, e.g. the meta lines of one row.
      inRow: row ? all.filter((e) => e.closest('li') === row).length : 1,
      font: Math.round(parseFloat(cs.fontSize)),
      h: Math.round(el.getBoundingClientRect().height),
      outline: Math.round(parseFloat(cs.borderTopWidth) || 0),
      shadow: drop ? Math.round(Number(drop[2])) : 0,
      // An <li> or <button> has a `value` too; only an input's value is what it shows.
      text: String(el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')).trim().replace(/\s+/g, ' '),
    };
  }
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

/** Shot (toasts hidden unless `toasts`), boxes, styles and text boxes of the current screen. */
async function frame(page, sels, styles = {}, { toasts = false } = {}) {
  const png = await page.screenshot(toasts ? {} : { style: HIDE_TOASTS });
  return { png, boxes: await page.evaluate(measureAll, sels), styles: await page.evaluate(measureStyles, styles), texts: await page.evaluate(measureTexts) };
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

const HUD_SELS = {
  hud: 'header.hud',
  progress: '.hud [data-cluster="progress"]',
  // P23: the four-step strip (dots and the current pill); P24: the pill and "tới HH:MM".
  phase: '.hud ol.phases:not(.sr-only), .hud .hud-phase',
  dock: 'nav.dock',
};
const HUD_STYLES = {
  cluster: '.hud [data-cluster="progress"]',
  steps: '.hud ol.phases:not(.sr-only) > li',
  current: '.hud ol.phases:not(.sr-only) > li[aria-current="step"], .hud .phase-pill',
  next: '.hud .ph-next:not([hidden])',
  dock: 'nav.dock',
  dockBtn: 'nav.dock .dock-btn',
  dockLabel: 'nav.dock .dock-btn > span:not(.sr-only):not(.dock-badge)',
};

/** Shots of the HUD at each viewport, the window set to it first. */
async function hudAt(page) {
  const out = {};
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v);
    await sleep(900);
    out[v.width] = await frame(page, HUD_SELS, HUD_STYLES);
  }
  return out;
}

/** The SAVE_DAY morning: the HUD and dock in preparation, then opened at 4x and, at the peak, at 1x. */
async function hudSession(browser, url, save, who) {
  const context = await gameContext(browser, DESK, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(800);
    const prep = await hudAt(page);
    progress(who, `HUD in preparation: "${prep[DESK.width].styles.current?.text ?? ''}"`);
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
    progress(who, `HUD at the peak: "${peak[DESK.width].styles.current?.text ?? ''}"`);
    return { prep, peak };
  } finally {
    await context.close();
  }
}

const PANEL = '.panel:not([hidden])';

/** Opens the dock panel `id` (a click in the page: on a phone the open sheet can cover the dock). */
async function openPanel(page, id) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), `nav.dock [data-panel="${id}"]`);
  await page.locator(`${PANEL} .panel-body > *`).first().waitFor();
  await sleep(500);
}

/** Scrolls the panel so `sel` sits in the middle of it (top of the panel when `sel` is null). */
async function scrollPanel(page, sel) {
  await page.evaluate(
    ({ panel, sel }) => {
      const root = document.querySelector(panel);
      if (!root) return;
      for (const el of [root, ...root.querySelectorAll('*')]) if (el.scrollTop > 0) el.scrollTop = 0;
      if (sel) root.querySelector(sel)?.scrollIntoView({ block: 'center' });
    },
    { panel: PANEL, sel },
  );
  await sleep(300);
}

const ROW = (attr, id) => `${PANEL} li[${attr}="${id}"]`;
const MENU_SELS = { panel: PANEL, row: ROW('data-item', 'orange_juice') };
const MENU_STYLES = {
  badge: `${ROW('data-item', 'orange_juice')} .badge:not([hidden])`,
  dots: `${ROW('data-item', 'orange_juice')} .dots > *`,
  link: `${ROW('data-item', 'orange_juice')} .link-btn`,
  toggle: `${ROW('data-item', 'orange_juice')} .toggle`,
};
const PEOPLE = `${PANEL} li[data-staff], ${PANEL} li[data-candidate]`;
const STAFF_SELS = { panel: PANEL, row: PEOPLE };
const STAFF_STYLES = { row: PEOPLE, meta: `:is(${PEOPLE}) .item-meta`, meter: `${PANEL} .meter`, vai: `${PANEL} .staff-row .stepper-label` };
const UPGRADE = `${PANEL} li[data-upgrade]`;
const UPGRADE_SELS = { panel: PANEL, row: UPGRADE };
const UPGRADE_STYLES = { row: UPGRADE, meta: `:is(${UPGRADE}) .item-meta`, side: `${PANEL} .item-side` };
const KHO_ROW = ROW('data-ingredient', 'orange');
const KHO_SELS = { panel: PANEL, row: KHO_ROW, label: `${PANEL} .stepper-label`, note: `${PANEL} .kho-note`, toast: '.toasts .toast' };
const KHO_STYLES = {
  qty: `${KHO_ROW} .step-input`,
  tag: `${KHO_ROW} .sug:not(.is-off)`,
  label: `${PANEL} .stepper-label`,
  note: `${PANEL} .kho-note`,
  toast: '.toasts .toast',
  toastTitle: '.toasts .toast-title',
  toastText: '.toasts .toast-text',
};

/**
 * The SAVE_DAY morning at `viewport`: Menu (Nước cam row), Nhân viên, Nâng
 * cấp, Kho after Gợi ý (Cam row), then Nhập hàng, one more pack of Ly and
 * Nhập hàng again, shot with the toasts.
 */
async function panelSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(800);
    await openPanel(page, 'menu');
    await scrollPanel(page, MENU_SELS.row);
    const menu = await frame(page, MENU_SELS, MENU_STYLES);
    await openPanel(page, 'staff');
    await scrollPanel(page, null);
    const staff = await frame(page, STAFF_SELS, STAFF_STYLES);
    await openPanel(page, 'upgrades');
    await scrollPanel(page, null);
    const upgrades = await frame(page, UPGRADE_SELS, UPGRADE_STYLES);
    await openPanel(page, 'inventory');
    await page.locator(`${PANEL} [data-action="suggest"]`).click();
    await sleep(400);
    await scrollPanel(page, KHO_ROW);
    const kho = await frame(page, KHO_SELS, KHO_STYLES);
    await page.locator(`${PANEL} [data-action="buy"]`).click();
    await sleep(500);
    await page.locator(`${ROW('data-ingredient', 'cup')} .step-btn[aria-label^="Thêm"]`).click();
    await page.locator(`${PANEL} [data-action="buy"]`).click();
    await sleep(600);
    await scrollPanel(page, null);
    const toast = await frame(page, KHO_SELS, KHO_STYLES, { toasts: true });
    progress(who, `panels at ${viewport.width}: Gợi ý Cam ${kho.styles.qty?.text ?? '?'}, ${toast.boxes.toast.length} toast(s)`);
    return { menu, staff, upgrades, kho, toast };
  } finally {
    await context.close();
  }
}

const REPORT_SELS = {
  dialog: '.rpt-layer:not([hidden]) .rpt-dialog',
  sub: '.rpt-layer:not([hidden]) .rpt-sub',
  result: '#rpt-summary .rpt-result',
  main: '.rpt-layer:not([hidden]) .rpt-foot .btn-primary',
};
const REPORT_STYLES = {
  dialog: REPORT_SELS.dialog,
  title: '.rpt-layer:not([hidden]) .rpt-head-text > :first-child',
  sub: REPORT_SELS.sub,
  result: REPORT_SELS.result,
  main: REPORT_SELS.main,
};

/** The SAVE_DAY report at `viewport` as it opens, the window not grown. */
async function reportSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    await page.locator('[data-block="money"]').first().waitFor();
    await sleep(1200);
    await page.evaluate(() => {
      const layer = document.querySelector('.rpt-layer:not([hidden])');
      for (const el of [layer, ...(layer?.querySelectorAll('*') ?? [])]) if (el && el.scrollTop > 0) el.scrollTop = 0;
    });
    await sleep(300);
    const out = { ...(await frame(page, REPORT_SELS, REPORT_STYLES)), overflow: await page.evaluate(reportOverflow) };
    progress(who, `report day ${SAVE_DAY} at ${viewport.width}: ${out.overflow} px below the fold`);
    return out;
  } finally {
    await context.close();
  }
}

const WEEK_SELS = {
  dialog: '[data-screen="weekEnd"] .rpt-dialog',
  title: '[data-screen="weekEnd"] .rpt-head h3',
  nextBtn: '[data-screen="weekEnd"] [data-action="next-week"]',
};
const WEEK_STYLES = { dialog: WEEK_SELS.dialog, title: WEEK_SELS.title, nextBtn: WEEK_SELS.nextBtn };

/** The week summary that the day-7 report leads to, the window grown so the whole dialog fits. */
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
    const out = await frame(page, WEEK_SELS, WEEK_STYLES);
    progress(who, `"${out.styles.title?.text ?? ''}" at ${viewport.width}`);
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

/** makeBoard with the P24 legend, after warning `!!` for every ring around a flat or off-frame area; then saved as JPEG. */
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
  // makeBoard writes to docs/media; the PNG is only a step to the JPEG in docs/reports/p24-review.
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
/** Marks with nothing to ring are left out when `optional`. */
const keep = (marks) => marks.filter((m) => !m.optional || m.boxes.some(Boolean));
/** First box only: one ring per mark where a selector matches every row. */
const first = (boxes) => boxes.slice(0, 1);
/** "a → b" with a unit, or "b" alone when both are the same. */
const change = (a, b, unit = 'px') => (a === b ? `${b}${unit}` : `${a}${unit} → ${b}${unit}`);
const quote = (text, max = 60) => `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
/** A desktop HUD is a thin strip: keep some scene under it for the labels. */
const HUD_LABEL_ROOM = 170;
const PHASE_WORD = { prep: 'pha chuẩn bị', peak: 'giờ cao điểm (mở ở 4x, chụp ở 1x)' };

async function hudBoard(browser, name, width, when, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const dots = Math.max(0, (b.steps?.count ?? 0) - 1);
  const next = a.next?.text ? ` + "${a.next.text}"` : '';
  const title = when === 'prep' ? 'HUD pha chuẩn bị' : 'HUD giờ cao điểm';
  return board(browser, name, {
    frames: [before(base.png, title), after(cur.png, title)],
    marks: keep([
      { frame: 0, boxes: base.boxes.phase, label: `Dải ${b.steps?.count ?? 0} bước: ${dots} chấm không chữ quanh pill "${b.current?.text ?? ''}"` },
      { frame: 1, boxes: cur.boxes.phase, label: `Chấm pha → 1 pill có chữ "${a.current?.text ?? ''}"${next}` },
      { frame: 0, boxes: base.boxes.progress, label: `Khung cụm: viền ${b.cluster?.outline}px, bóng ${b.cluster?.shadow}px` },
      { frame: 1, boxes: cur.boxes.progress, label: `Viền ${change(b.cluster?.outline, a.cluster?.outline)}, bóng ${change(b.cluster?.shadow, a.cluster?.shadow)}, cao ${change(b.cluster?.h, a.cluster?.h)}` },
    ]),
    include: [...base.boxes.hud, ...cur.boxes.hud].map((r) => (width >= DESK.width ? { ...r, h: r.h + HUD_LABEL_ROOM } : r)),
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, ngày ${SAVE_DAY} tuần 1 (Hội chợ), ${PHASE_WORD[when]}, ván Vừa seed ${SEED}. P23: dải ${b.steps?.count ?? 0} bước pha, chỉ bước hiện tại có chữ, ${dots} bước còn lại là chấm. P24: một pill tên pha${a.next?.text ? ` và giờ đổi pha (${a.next.text})` : ''}, danh sách 4 pha chỉ còn cho trình đọc màn hình và trong title. Khung cụm: viền ${change(b.cluster?.outline, a.cluster?.outline)}, bóng ${change(b.cluster?.shadow, a.cluster?.shadow)}.`,
    ],
  });
}

async function dockBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  return board(browser, name, {
    frames: [before(base.png, 'Dock'), after(cur.png, 'Dock')],
    marks: [
      { frame: 0, boxes: base.boxes.dock, label: `Nút ${b.dockBtn?.h}px, chữ ${b.dockLabel?.font}px, bóng ${b.dock?.shadow}px` },
      { frame: 1, boxes: cur.boxes.dock, label: `Nút ${change(b.dockBtn?.h, a.dockBtn?.h)}, chữ ${change(b.dockLabel?.font, a.dockLabel?.font)}, bóng ${change(b.dock?.shadow, a.dock?.shadow)}, viền ${change(b.dock?.outline, a.dock?.outline)}` },
    ],
    include: [...base.boxes.dock, ...cur.boxes.dock],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}. Dock ${b.dockBtn?.count ?? 0} nút. P23 → P24: chiều cao nút ${change(b.dockBtn?.h, a.dockBtn?.h)}, cỡ chữ nhãn ${change(b.dockLabel?.font, a.dockLabel?.font)}, bóng dưới khung ${change(b.dock?.shadow, a.dock?.shadow)}, viền ${change(b.dock?.outline, a.dock?.outline)}.`,
    ],
  });
}

async function khoBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const qty = (s) => s.qty?.text ?? '0';
  return board(browser, name, {
    frames: [before(base.png, 'Kho sau Gợi ý'), after(cur.png, 'Kho sau Gợi ý')],
    marks: keep([
      { frame: 0, boxes: base.boxes.row, label: b.tag ? `Cam trong gợi ý: ô nhập ${qty(b)}` : `Gợi ý bỏ qua Cam: ô nhập ${qty(b)}, không nhãn gợi ý` },
      { frame: 1, boxes: cur.boxes.row, label: a.tag ? `Cam vào gợi ý: ô nhập ${qty(a)}, nhãn "gợi ý"` : `Cam vẫn ngoài gợi ý: ô nhập ${qty(a)}` },
      { frame: 0, boxes: first(base.boxes.label), label: `Nhãn thừa ${quote(b.label?.text ?? '', 34)} trên mỗi ô`, optional: true },
    ]),
    include: [...base.boxes.row, ...cur.boxes.row],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}: Nước cam vừa bật, kho chưa có Cam, bấm Gợi ý nhập tự động. P23 tính nhu cầu từ số bán hôm qua nên món chưa bán lần nào có nhu cầu 0 và Cam không vào gợi ý. P24 cho món mới bật phần nhu cầu theo độ phổ biến, Cam vào gợi ý (ô nhập ${qty(a)}). Hàng Kho dùng chung mẫu item-row: icon, tên, một dòng meta, một nhãn, ô nhập; bỏ nhãn "Nhập thêm (gói …)".`,
    ],
  });
}

async function toastBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const note = b.note?.text ?? '';
  const toastText = [a.toastTitle?.text, a.toastText?.text].filter(Boolean).join(' · ');
  return board(browser, name, {
    frames: [before(base.png, 'Sau 2 lần Nhập hàng'), after(cur.png, 'Sau 2 lần Nhập hàng')],
    marks: keep([
      { frame: 0, boxes: base.boxes.note, label: `Câu trong bảng ${quote(note)}` },
      { frame: 1, boxes: cur.boxes.toast, label: `Câu trong bảng → ${a.toast?.count ?? 0} toast gộp 2 lần nhập ${quote(toastText)}` },
      { frame: 1, boxes: cur.boxes.note, label: 'Bảng chỉ giữ 1 dòng giới thiệu cố định', optional: true },
    ]),
    include: [...base.boxes.note, ...cur.boxes.note, ...cur.boxes.toast],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}: Gợi ý → Nhập hàng, rồi thêm 1 gói Ly → Nhập hàng lần nữa, chụp ngay sau lần thứ hai. P23 ghi câu mua hàng vào khung trên cùng của Kho, lần sau đè lần trước. P24 báo bằng ${a.toast?.count ?? 0} toast: các lần nhập trong 4 giây cộng dồn tiền, liệt kê tối đa 3 tên và số dư mới; khung Kho không còn câu mua hàng.`,
    ],
  });
}

async function menuBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const link = a.link?.text ? ` + link "${a.link.text}"` : '';
  return board(browser, name, {
    frames: [before(base.png, 'Menu: Nước cam thiếu Cam'), after(cur.png, 'Menu: Nước cam thiếu Cam')],
    marks: [
      { frame: 0, boxes: base.boxes.row, label: `Nhãn "${b.badge?.text ?? ''}"${b.dots ? ` + ${b.dots.count} chấm phổ biến` : ''}, không nói thiếu gì` },
      { frame: 1, boxes: cur.boxes.row, label: `Nhãn "${a.badge?.text ?? ''}"${link}` },
    ],
    include: [...base.boxes.row, ...cur.boxes.row],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}, Nước cam đã bật, kho chưa có Cam. P23: nhãn "${b.badge?.text ?? ''}" và chấm độ phổ biến. P24: nhãn nêu nguyên liệu thiếu ("${a.badge?.text ?? ''}")${a.link?.text ? ` và link "${a.link.text}" mở thẳng bảng Kho` : ''}; hàng dùng chung mẫu item-row với Kho.`,
    ],
  });
}

async function staffBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const extra = [b.meter ? 'thanh tốc độ' : '', b.vai ? `nhãn "${b.vai.text}"` : ''].filter(Boolean).join(' + ');
  return board(browser, name, {
    frames: [before(base.png, 'Nhân viên'), after(cur.png, 'Nhân viên')],
    marks: [
      { frame: 0, boxes: first(base.boxes.row), label: `Khung riêng, cao ${b.row?.h}px${extra ? `: ${extra}` : ''}` },
      { frame: 1, boxes: first(cur.boxes.row), label: `Hàng chung item-row, cao ${change(b.row?.h, a.row?.h)}: ${quote(a.meta?.text ?? '', 44)}` },
    ],
    include: [...first(base.boxes.row), ...first(cur.boxes.row)],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}. Hàng nhân viên và ứng viên theo mẫu Kho/Menu: ảnh đại diện ở ô icon, lương và tốc độ trên một dòng meta, Bận/Rảnh là nhãn trạng thái; bỏ thanh tốc độ và nhãn "Vai".`,
    ],
  });
}

async function upgradesBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  return board(browser, name, {
    frames: [before(base.png, 'Nâng cấp'), after(cur.png, 'Nâng cấp')],
    marks: [
      { frame: 0, boxes: first(base.boxes.row), label: `${b.meta?.inRow ?? 0} dòng meta${b.side ? ' + cột giá riêng' : ''}, cao ${b.row?.h}px` },
      { frame: 1, boxes: first(cur.boxes.row), label: `${a.meta?.inRow ?? 0} dòng meta ${quote(a.meta?.text ?? '', 44)}, cao ${change(b.row?.h, a.row?.h)}` },
    ],
    include: [...first(base.boxes.row), ...first(cur.boxes.row)],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${SAVE_DAY}. P24 gộp giá, cấp và hiệu quả mỗi cấp vào một dòng meta, bỏ dòng mô tả và cột giá; nhãn trạng thái chỉ còn "Mở ngày N"/"Mở ở cấp N" và "Tối đa".`,
    ],
  });
}

async function reportBoard(browser, name, viewport, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const fold = (px) => (px > 0 ? `cuộn thêm ${px} px` : 'vừa một màn');
  return board(browser, name, {
    frames: [before(base.png, `Báo cáo ngày ${SAVE_DAY}`), after(cur.png, `Báo cáo ngày ${SAVE_DAY}`)],
    marks: keep([
      { frame: 0, boxes: base.boxes.sub, label: `Dòng phụ ${quote(b.sub?.text ?? '')}` },
      { frame: 1, boxes: cur.boxes.sub, label: `Bỏ giờ mở cửa cố định: ${quote(a.sub?.text ?? '')}` },
      { frame: 0, boxes: base.boxes.result, label: `Dải kết quả: bóng ${b.result?.shadow}px, viền ${b.result?.outline}px`, optional: true },
      { frame: 1, boxes: cur.boxes.result, label: `Dải kết quả: bóng ${change(b.result?.shadow, a.result?.shadow)}, viền ${change(b.result?.outline, a.result?.outline)}`, optional: true },
      { frame: 1, boxes: cur.boxes.main, label: `Nút chính cao ${change(b.main?.h, a.main?.h)}, chữ ${change(b.main?.font, a.main?.font)}`, optional: true },
    ]),
    include: [...base.boxes.dialog, ...cur.boxes.dialog],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${viewport.width}×${viewport.height}, báo cáo ngày ${SAVE_DAY} vừa mở, cửa sổ không nới (P23 ${fold(base.overflow)}, P24 ${fold(cur.overflow)}). Tiêu đề ${change(b.title?.font, a.title?.font)}, viền hộp ${change(b.dialog?.outline, a.dialog?.outline)}, bóng hộp ${change(b.dialog?.shadow, a.dialog?.shadow)}; chỉ hộp còn bóng, dải kết quả và ô mẹo bỏ bóng lồng. Mỗi bản dùng save do sim của chính nó chơi nên số có thể lệch nhau.`,
    ],
  });
}

async function weekBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  return board(browser, name, {
    frames: [before(base.png, b.title?.text ?? 'Tổng kết tuần 1'), after(cur.png, a.title?.text ?? 'Tổng kết tuần 1')],
    marks: keep([
      { frame: 0, boxes: base.boxes.dialog, label: `Hộp: viền ${b.dialog?.outline}px, bóng ${b.dialog?.shadow}px` },
      { frame: 1, boxes: cur.boxes.nextBtn, label: `Nút chính cao ${change(b.nextBtn?.h, a.nextBtn?.h)}, chữ ${change(b.nextBtn?.font, a.nextBtn?.font)}`, optional: true },
      { frame: 1, boxes: cur.boxes.title, label: `Tiêu đề ${change(b.title?.font, a.title?.font)}; hộp viền ${change(b.dialog?.outline, a.dialog?.outline)}, bóng ${change(b.dialog?.shadow, a.dialog?.shadow)}` },
    ]),
    include: [...base.boxes.dialog, ...cur.boxes.dialog],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, cửa sổ nới cao cho vừa cả hộp, mở từ nút "Xem tổng kết tuần" của báo cáo ngày ${WEEK}. P24 đặt tổng kết tuần trên cùng thang với báo cáo ngày: tiêu đề màn, viền 2 px, chỉ hộp có bóng.`,
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
    console.log(`exporting and building P23 (${P24_BASE})…`);
    const baseRoot = buildRef(P24_BASE);
    temps.push(baseRoot);
    const cur = await playSaves(ROOT);
    printSaves('P24', cur);
    const base = await playSaves(baseRoot);
    printSaves('P23', base);
    if (process.env.P24_SAVES_ONLY === '1') return;

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
    const [curHud, baseHud] = await Promise.all([hudSession(browser, curUrl, cur.saves.morning, 'P24'), hudSession(browser, baseUrl, base.saves.morning, 'P23')]);
    const shots = {};
    for (const v of VIEWPORTS) {
      progress('both', `panels, report and week summary at ${v.width}`);
      const [curPanels, basePanels] = await Promise.all([panelSession(browser, curUrl, cur.saves.morning, v, 'P24'), panelSession(browser, baseUrl, base.saves.morning, v, 'P23')]);
      const [curReport, baseReport, curWeek, baseWeek] = await Promise.all([
        reportSession(browser, curUrl, cur.saves.report, v, 'P24'),
        reportSession(browser, baseUrl, base.saves.report, v, 'P23'),
        weekSession(browser, curUrl, cur.saves.week1, v, 'P24'),
        weekSession(browser, baseUrl, base.saves.week1, v, 'P23'),
      ]);
      shots[v.width] = { curPanels, basePanels, curReport, baseReport, curWeek, baseWeek };
    }

    progress('both', 'drawing boards');
    for (const v of VIEWPORTS) {
      const w = v.width;
      const s = shots[w];
      const pair = (key) => ({ base: s.basePanels[key], cur: s.curPanels[key] });
      files.push(await hudBoard(browser, `hud-prep-${w}-p24.jpg`, w, 'prep', { base: baseHud.prep[w], cur: curHud.prep[w] }));
      files.push(await hudBoard(browser, `hud-peak-${w}-p24.jpg`, w, 'peak', { base: baseHud.peak[w], cur: curHud.peak[w] }));
      files.push(await dockBoard(browser, `dock-${w}-p24.jpg`, w, { base: baseHud.prep[w], cur: curHud.prep[w] }));
      files.push(await khoBoard(browser, `kho-${w}-p24.jpg`, w, pair('kho')));
      files.push(await toastBoard(browser, `toast-${w}-p24.jpg`, w, pair('toast')));
      files.push(await menuBoard(browser, `menu-${w}-p24.jpg`, w, pair('menu')));
      files.push(await staffBoard(browser, `staff-${w}-p24.jpg`, w, pair('staff')));
      files.push(await upgradesBoard(browser, `upgrades-${w}-p24.jpg`, w, pair('upgrades')));
      files.push(await reportBoard(browser, `report-${w}-p24.jpg`, v, { base: s.baseReport, cur: s.curReport }));
      files.push(await weekBoard(browser, `week1-${w}-p24.jpg`, w, { base: s.baseWeek, cur: s.curWeek }));
    }
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
