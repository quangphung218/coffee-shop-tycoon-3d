// Captures the P25 before/after boards: the P24 release (5d33195) next to the
// working tree, at 390×844 and 1280×800, ringed where P25 changed the game and
// labelled with what changed, the numbers read from each build at capture
// time. Run through `npm run media:p25` (builds first). Needs Playwright and
// the git history back to P25_BASE; see docs/media.md.
//
// Boards (JPEG quality 75, in docs/reports/p25-review only), <w> = 390 and 1280:
//   menu-<w>-p25.jpg            Menu of day 3 after a click on the Nước cam switch (no Cam):
//                               row heights, rows in view, the switch and "Thiếu Cam"
//   upgrades-<w>-p25.jpg        Nâng cấp at look tier 1/2/3: the tier icon and "Bậc n/3"
//   tier-pair-<w>-p25.jpg       the espresso tier icon next to the 3D machine of the same save
//   scene-espresso-<w>-p25.jpg  close-ups of the 3D shop at tier 1/2/3 (and P24 at the
//   scene-grinder-<w>-p25.jpg   same levels): espresso machine, grinder and pastry case,
//   scene-tables-<w>-p25.jpg    tables and chairs, plants and lamps
//   scene-decor-<w>-p25.jpg
//   fx-<w>-p25.jpg              the scene about 0 / 0.2 / 0.5 s after Mua on Máy espresso cao cấp
//   levelup-<w>-p25.jpg         the Daily Report of the first level-up: confetti in the air, then 2 s later
//   dock-<w>-p25.jpg            the dock on the morning of day 3, after Ngày tiếp theo opened Nước cam
//   week1-390-p25.jpg           week 1 summary at 390 px, the window grown to fit
//
// Each build plays its own saves with its own sim (Normal, the same seed, the
// basic strategy of tests/integration/helpers.ts). The tier saves are a new
// game at the top shop level with the upgrades of TIER_UPGRADES bought through
// the sim up to tier 1, 2 or 3 (upgradeTier: ceil(level / ceil(maxLevel / 3))).
// Close-ups crop the default camera view (yaw 45°, isometric pitch, zoom 1,
// centred on the indoor floor) around each object, projected with three.js.
// P25_SAVES_ONLY=1 plays the saves and prints them, without a server or browser.
//
// Uses the installed Chrome (GPU WebGL, so the 0.2 s shots land on time;
// $CHROME_PATH or the usual install paths), else Playwright's Chromium.
// Prints `!!` for a label with nothing to ring, a ring around a flat area or
// mostly off the frame, a label over text, a board over MAX_BYTES and a failed
// check (a Menu row over its height limit, no confetti, no "Mới" dot); any
// `!!` ends the run with exit code 1.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { OrthographicCamera, Vector3 } from 'three';
import { buildRef, FIXED_NOW, makeBoard, newContext, openMenu, OUT, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The P24 release the boards compare against (git archive). */
const P25_BASE = process.env.P25_BASE ?? '5d33195';
const NAMES = { before: `P24 (${P25_BASE})`, after: 'P25' };
const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
const BASE_PORT = PORT + 1;
const SEED = Number(process.env.P25_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Morning of the Menu shots: Nước cam opens on day 3 with no Cam in stock. */
const MENU_DAY = 3;
const WEEK = 7;
const DAY_GUARD = 3000;
/** Upgrades bought for the tier saves; each one's tier shows on a close-up or in Nâng cấp. */
const TIER_UPGRADES = ['better_machine', 'grinder', 'pastry_case', 'big_counter', 'tables', 'plants', 'paintings', 'lights'];
const TIERS = [1, 2, 3];
const UPGRADE_TIERS = 3;
/** Upgrade bought for the effect shots, from the tier-1 save (tier 1 → 2). */
const FX_UPGRADE = 'better_machine';
/** Effect shots, ms after the click on the confirm button. */
const FX_AT = [0, 200, 500];
/** Reference shot after the effect (0.9 s sparkle, 0.45 s bounce) is over, ms after the click. */
const FX_REST = 1500;
/** A pixel changed when a channel moves more than this (0–255): JPEG-free PNGs, so only real motion. */
const FX_STEP = 24;
/** Second level-up shot, ms after the first. */
const LEVELUP_LATER_MS = 2000;
/** First level-up shot, ms after the confetti canvas appears: the report has dropped in, confetti still flies. */
const LEVELUP_SETTLE_MS = 450;
/** Menu row height limits at 390 px: a sellable row, a row short of stock (as scripts/check-layout.mjs MENU_ROW_MAX). */
const ROW_MAX = { ok: 72, short: 96 };
const REVIEW = join(ROOT, 'docs', 'reports', 'p25-review');
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const VIEWPORTS = [PHONE, DESK];
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** Hides the side panel on the effect shots so the scene behind it shows; it stays clickable from the page. */
const HIDE_PANEL = '#ui > .panel { visibility: hidden !important; } .toasts { display: none !important; }';
const GUTTER = 260;
const FLAT_SPREAD = 8;
const MIN_ON_IMAGE = 0.6;
const JPEG_QUALITY = 0.75;
const MAX_BYTES = 600 * 1024;
/** Camera of src/render/scene/camera.ts at its defaults. */
const CAM = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), viewHeight: 22, distance: 40 };
/** Close-ups: world boxes (x, z half sizes; y range) around each object kind. */
const BACK_COUNTER_HEIGHT = 0.9;
const START = Date.now();
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

// --- Saves, each from the sim of the build that loads them. ---

/** Look tier of `level` for an upgrade with `maxLevel` (src/sim/data/upgrades.ts upgradeTier). */
const tierOf = (level, maxLevel) => (level <= 0 ? 0 : Math.min(UPGRADE_TIERS, Math.ceil(level / Math.ceil(maxLevel / UPGRADE_TIERS))));

/**
 * Loads `root`'s sim and save code through vite and returns the saves:
 * `morning` (day MENU_DAY before anything is switched on), `report2` (report
 * of day MENU_DAY − 1), `levelUp` (report of the first day with a level-up,
 * its day in `levelUpDay`), `week1` (report of day 7), `tiers[t]` (tier saves)
 * and `layouts[t]` (getShopLayout of each tier save).
 */
export async function playSaves(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, upgrades, upgradeData, levels] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/upgrades.ts', '/src/sim/data/upgrades.ts', '/src/sim/data/levels.ts'].map((p) => vite.ssrLoadModule(p)),
    );
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
    let levelUpDay = null;
    for (let day = 1; day <= WEEK; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`${root}: next_day refused before day ${day}`);
      state.events = [];
      if (day === MENU_DAY) saves.morning = saveText(state);
      // The sim sells Nước cam from day 3 on, as a player who switched it on.
      if (day === MENU_DAY) sim.dispatch(state, { type: 'set_menu_item', itemId: 'orange_juice', enabled: true });
      sim.dispatch(state, { type: 'apply_restock' });
      if (!sim.dispatch(state, { type: 'start_day' })) throw new Error(`${root}: day ${day}: start_day refused`);
      for (let guard = 0; state.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(state);
        sim.step(state, 1);
        state.events = [];
      }
      if (state.phase !== 'report') throw new Error(`${root}: day ${day} did not reach the report`);
      if (day === MENU_DAY - 1) saves.report2 = saveText(state);
      if (state.lastReport?.levelUp && levelUpDay === null) {
        levelUpDay = day;
        saves.levelUp = saveText(state);
      }
      if (day === WEEK) saves.week1 = saveText(state);
    }
    if (!saves.levelUp) throw new Error(`${root}: no level-up in week 1`);

    const maxShop = levels.MAX_SHOP_LEVEL ?? levels.LEVELS.length;
    const tiers = {};
    const layouts = {};
    const levelsAt = {};
    for (const t of TIERS) {
      const s = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
      s.shopLevel = maxShop;
      s.money = 1e12;
      const got = {};
      for (const id of TIER_UPGRADES) {
        const max = upgradeData.getUpgrade(id).maxLevel;
        for (let guard = 0; guard < 12 && tierOf(upgrades.upgradeLevel(s, id), max) < t; guard++) {
          if (!sim.dispatch(s, { type: 'buy_upgrade', upgradeId: id })) break;
        }
        const level = upgrades.upgradeLevel(s, id);
        got[id] = { level, tier: tierOf(level, max) };
      }
      // Money on screen as in a normal game, enough for the effect purchase.
      s.money = 20_000_000;
      s.events = [];
      tiers[t] = saveText(s);
      layouts[t] = upgrades.getShopLayout(s);
      levelsAt[t] = got;
    }
    return { saves, levelUpDay, tiers, layouts, levelsAt };
  } finally {
    await vite.close();
  }
}

function printSaves(who, { levelUpDay, levelsAt }) {
  console.log(`${who}: Normal, seed ${SEED}; first level-up after day ${levelUpDay}`);
  for (const t of TIERS) console.log(`  tier ${t} save: ${Object.entries(levelsAt[t]).map(([id, g]) => `${id} ${g.level} (t${g.tier})`).join(', ')}`);
}

// --- Browser. ---

/** Installed Chrome, as in measure-frames.mjs; null when there is none. */
function findChrome() {
  if (process.env.MEDIA_CHROMIUM === '1') return null;
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

// --- In-page probes (viewport CSS px, deviceScaleFactor 1). ---

/** Every visible run of text on screen, as boxes. Labels must not cover these. */
function measureTexts() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
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

/** For each name → CSS selector, the first visible match's font size, width, height and text, and the match count. */
function measureStyles(sels) {
  const out = {};
  for (const [name, sel] of Object.entries(sels)) {
    const all = [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility() && e.getBoundingClientRect().height > 0);
    const el = all[0];
    if (!el) {
      out[name] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    out[name] = {
      count: all.length,
      font: Math.round(parseFloat(getComputedStyle(el).fontSize)),
      w: Math.round(r.width),
      h: Math.round(r.height),
      text: String(el.textContent ?? '').trim().replace(/\s+/g, ' '),
    };
  }
  return out;
}

/**
 * Menu rows of the open panel: the height of each, whether it is short of
 * stock (its "Thiếu …" label shows) or not open yet, and how many rows lie
 * fully inside the visible part of the panel.
 */
function menuRows(panel) {
  const root = document.querySelector(panel);
  const rows = [...(root?.querySelectorAll('li[data-item]') ?? [])];
  // Visible part: the viewport cut by every clipping ancestor of the list.
  let top = 0;
  let bottom = innerHeight;
  for (let e = rows[0]?.parentElement; e; e = e.parentElement) {
    if (getComputedStyle(e).overflowY === 'visible') continue;
    const r = e.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  // The foot of the panel and the dock sit over the list on a phone.
  for (const el of document.querySelectorAll('nav.dock')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < bottom && r.top > top) bottom = r.top;
  }
  const shown = (el) => !!el && !el.hidden && el.getBoundingClientRect().height > 0;
  return rows.map((li) => {
    const r = li.getBoundingClientRect();
    return {
      id: li.dataset.item,
      h: Math.round(r.height * 10) / 10,
      short: shown(li.querySelector('[data-lock="stock"]')),
      locked: li.classList.contains('is-locked'),
      inView: r.top >= top - 0.5 && r.bottom <= bottom + 0.5,
    };
  });
}

/** Pixels the open Daily Report hides below its fold. */
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

/** Share of the pixels in `box` that differ by more than `step` (any RGB channel) between two PNGs (base64). */
async function ringDiff({ a, b, box, step }) {
  const load = async (png) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d');
    ctx.drawImage(img, 0, 0);
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    return ctx.getImageData(x, y, Math.max(1, Math.min(img.width - x, Math.ceil(box.w))), Math.max(1, Math.min(img.height - y, Math.ceil(box.h)))).data;
  };
  const [da, db] = await Promise.all([load(a), load(b)]);
  let changed = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > step || Math.abs(da[i + 1] - db[i + 1]) > step || Math.abs(da[i + 2] - db[i + 2]) > step) changed++;
  return changed / (da.length / 4);
}

/**
 * One PNG (base64) of the `icon` crop of `iconPng` and the `scene` crop of
 * `scenePng`, side by side at height `h` on the board background, with the
 * boxes of both in it.
 */
async function pairPng({ iconPng, icon, scenePng, scene, h, gap }) {
  const load = async (png) => createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const [a, b] = await Promise.all([load(iconPng), load(scenePng)]);
  const iw = Math.round((icon.w / icon.h) * h);
  const sw = Math.round((scene.w / scene.h) * h);
  const canvas = new OffscreenCanvas(iw + gap + sw, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(a, icon.x, icon.y, icon.w, icon.h, 0, 0, iw, h);
  ctx.drawImage(b, scene.x, scene.y, scene.w, scene.h, iw + gap, 0, sw, h);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { png: btoa(bin), icon: { x: 0, y: 0, w: iw, h }, scene: { x: iw + gap, y: 0, w: sw, h } };
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

// --- Close-ups: the default camera, projected in Node. ---

/** Box of the #scene canvas, CSS px. */
const canvasBox = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('#scene canvas, canvas#scene, #scene')?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: innerWidth, h: innerHeight };
  });

/** Screen box (CSS px) of each world box [x0, x1, y0, y1, z0, z1] under the default camera of `layout`. */
function projector(layout, canvas) {
  const aspect = canvas.w / canvas.h;
  const half = CAM.viewHeight / 2;
  const cam = new OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 200);
  const cx = (layout.indoor.minX + layout.indoor.maxX) / 2;
  const cz = (layout.indoor.minZ + layout.indoor.maxZ) / 2;
  const cp = Math.cos(CAM.pitch);
  cam.position.set(cx + Math.sin(CAM.yaw) * cp * CAM.distance, Math.sin(CAM.pitch) * CAM.distance, cz + Math.cos(CAM.yaw) * cp * CAM.distance);
  cam.lookAt(cx, 0, cz);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const v = new Vector3();
  return ([x0, x1, y0, y1, z0, z1]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of [x0, x1]) {
      for (const y of [y0, y1]) {
        for (const z of [z0, z1]) {
          v.set(x, y, z).project(cam);
          const sx = canvas.x + ((v.x + 1) / 2) * canvas.w;
          const sy = canvas.y + ((1 - v.y) / 2) * canvas.h;
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
}

/** Share of a screen box inside the canvas box. */
const onScreen = (r, c) => (Math.max(0, Math.min(r.x + r.w, c.x + c.w) - Math.max(r.x, c.x)) * Math.max(0, Math.min(r.y + r.h, c.y + c.h) - Math.max(r.y, c.y))) / Math.max(1, r.w * r.h);
/** Close-up rings need at least this share of the object on screen. */
const ON_SCREEN = 0.8;
const around = (pos, hx, hz, y0, y1) => [pos.x - hx, pos.x + hx, y0, y1, pos.z - hz, pos.z + hz];
const machine = (layout, kind) => layout.machines.find((m) => m.kind === kind);

/** World boxes of each close-up, from a layout. */
const CLOSEUPS = {
  espresso: { title: 'Máy espresso', upgrade: 'better_machine', boxes: (l) => [machine(l, 'espresso')].filter(Boolean).map((m) => around(m.pos, 0.55, 0.45, BACK_COUNTER_HEIGHT, BACK_COUNTER_HEIGHT + 1.1)) },
  grinder: {
    title: 'Máy xay và tủ bánh',
    upgrade: 'grinder',
    boxes: (l) => ['grinder', 'pastry_case'].map((k) => machine(l, k)).filter(Boolean).map((m) => around(m.pos, 0.3, 0.4, BACK_COUNTER_HEIGHT, BACK_COUNTER_HEIGHT + 0.9)),
  },
  tables: { title: 'Bàn ghế', upgrade: 'tables', boxes: (l) => l.tables.filter((t) => t.zone === 'indoor').slice(0, 2).map((t) => around(t.pos, 1, 0.8, 0, 1.2)) },
  decor: { title: 'Cây và đèn', upgrade: 'plants', boxes: (l) => l.decor.filter((d) => d.kind === 'plant' || d.kind === 'light').slice(0, 3).map((d) => around(d.pos, 0.45, 0.45, 0, d.kind === 'light' ? 3.2 : 1.6)) },
};
const TIER_LOOK = { 0: 'chưa mua', 1: 'hình gốc', 2: 'thêm chi tiết, đế thép', 3: 'đế vàng, sao vàng' };

// --- Capture sessions. ---

async function frame(page, sels = {}, styles = {}, { style = HIDE_TOASTS } = {}) {
  const png = await page.screenshot({ style });
  return { png, boxes: await page.evaluate(measureAll, sels), styles: await page.evaluate(measureStyles, styles), texts: await page.evaluate(measureTexts) };
}

async function gameContext(browser, viewport, save) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

async function resume(page, url, save, ready) {
  await openMenu(page, url);
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  try {
    await btn.waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load`);
  }
  await btn.click();
  await page.locator(ready).first().waitFor();
}

const PANEL = '.panel:not([hidden])';

async function openPanel(page, id) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), `nav.dock [data-panel="${id}"]`);
  await page.locator(`${PANEL} .panel-body > *`).first().waitFor();
  await sleep(500);
}

/** Scrolls the panel to the top, then `sel` into view at `block`. */
async function scrollPanel(page, sel, block = 'center') {
  await page.evaluate(
    ({ panel, sel, block }) => {
      const root = document.querySelector(panel);
      if (!root) return;
      for (const el of [root, ...root.querySelectorAll('*')]) if (el.scrollTop > 0) el.scrollTop = 0;
      if (sel) root.querySelector(sel)?.scrollIntoView({ block });
    },
    { panel: PANEL, sel, block },
  );
  await sleep(300);
}

const OJ = `${PANEL} li[data-item="orange_juice"]`;
const MENU_SELS = { row: OJ, toggle: `${OJ} .toggle`, short: `${OJ} [data-lock="stock"]`, link: `${OJ} .link-btn` };
const MENU_STYLES = { toggle: `${OJ} .toggle`, toggleState: `${OJ} .toggle-state`, short: `${OJ} [data-lock="stock"]`, link: `${OJ} .link-btn`, row: OJ };

/** Day MENU_DAY morning: Menu, a click on the Nước cam switch; rows measured with the list at its top. */
async function menuSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(800);
    await openPanel(page, 'menu');
    const sw = page.locator(`${OJ} .toggle`);
    await sw.scrollIntoViewIfNeeded();
    await sw.click({ force: (await sw.getAttribute('aria-disabled')) === 'true' });
    await sleep(400);
    const checked = (await sw.getAttribute('aria-checked')) === 'true';
    await scrollPanel(page, `${PANEL} li[data-item]`, 'start');
    const rows = await page.evaluate(menuRows, PANEL);
    // The shot keeps the list at its top when Nước cam is in view there.
    if (!rows.find((r) => r.id === 'orange_juice')?.inView) await scrollPanel(page, OJ);
    const shot = await frame(page, MENU_SELS, MENU_STYLES);
    const ok = rows.filter((r) => !r.short && !r.locked);
    const short = rows.filter((r) => r.short);
    const out = { ...shot, checked, rows, okMax: Math.max(0, ...ok.map((r) => r.h)), shortMax: Math.max(0, ...short.map((r) => r.h)), inView: rows.filter((r) => r.inView).length };
    progress(who, `Menu at ${viewport.width}: Nước cam ${checked ? 'on' : 'off'}; rows ${rows.length}, ${out.inView} in view; sellable row ≤ ${out.okMax} px, short row ${out.shortMax} px`);
    return out;
  } finally {
    await context.close();
  }
}

const UPG = (id) => `${PANEL} li[data-upgrade="${id}"]`;
const UPGRADE_ICONS_SHOWN = ['better_machine', 'grinder', 'pastry_case'];
const UPGRADE_SELS = Object.fromEntries(UPGRADE_ICONS_SHOWN.map((id) => [id, `${UPG(id)} .item-icon`]));
const UPGRADE_STYLES = { ...Object.fromEntries(UPGRADE_ICONS_SHOWN.map((id) => [id, `${UPG(id)} .item-meta`])), tiersIcon: `${PANEL} [data-atlas="tiers"]` };

/** A tier save: the scene with no panel open, then Nâng cấp at its top once the tier atlas is in (P25). */
async function tierSession(browser, url, save, viewport, tier, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(2500);
    const scene = { png: await page.screenshot({ style: HIDE_TOASTS }), canvas: await canvasBox(page) };
    await openPanel(page, 'upgrades');
    if (tier >= 2) await page.locator(`${PANEL} [data-atlas="tiers"]`).first().waitFor({ timeout: 5000 }).catch(() => {});
    await scrollPanel(page, null);
    await sleep(300);
    const panel = await frame(page, UPGRADE_SELS, UPGRADE_STYLES);
    progress(who, `tier ${tier} at ${viewport.width}: ${panel.styles.tiersIcon?.count ?? 0} tier-atlas icons; "${panel.styles.better_machine?.text ?? ''}"`);
    return { scene, panel };
  } finally {
    await context.close();
  }
}

/**
 * The tier-1 save: Nâng cấp, Mua then the confirm on FX_UPGRADE, both clicked
 * in one page task with the panel hidden, and shots of the scene at FX_AT ms
 * after the click (the real offsets are returned).
 */
async function fxSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(2500);
    await openPanel(page, 'upgrades');
    await scrollPanel(page, UPG(FX_UPGRADE));
    const canvas = await canvasBox(page);
    await page.addStyleTag({ content: HIDE_PANEL });
    await sleep(400);
    const level = await page.evaluate(async (row) => {
      document.querySelector(`${row} [data-action="buy"]`)?.click();
      await new Promise((r) => setTimeout(r, 0));
      const ok = document.querySelector(`${row} [data-action="confirm"]`);
      ok?.click();
      return !!ok;
    }, UPG(FX_UPGRADE));
    const t0 = Date.now();
    const shots = [];
    for (const at of [...FX_AT, FX_REST]) {
      const wait = t0 + at - Date.now();
      if (wait > 0) await sleep(wait);
      const ms = Date.now() - t0;
      shots.push({ png: await page.screenshot({ style: HIDE_PANEL }), ms });
    }
    const rest = shots.pop();
    progress(who, `effect at ${viewport.width}: ${level ? 'bought' : '!! no confirm button'}; shots at ${shots.map((s) => `${s.ms} ms`).join(', ')}, rest at ${rest.ms} ms`);
    if (!level) console.warn(`!! ${who} effect at ${viewport.width}: Mua had no confirm step`);
    return { shots, rest, canvas };
  } finally {
    await context.close();
  }
}

const LEVELUP_SELS = { band: '.rpt-layer:not([hidden]) .rpt-levelup', title: '.rpt-layer:not([hidden]) .rpt-levelup-title',badge: '.rpt-layer:not([hidden]) .rpt-levelup-badge', dialog: '.rpt-layer:not([hidden]) .rpt-dialog' };
const LEVELUP_STYLES = { band: LEVELUP_SELS.band, title: '.rpt-layer:not([hidden]) .rpt-levelup-title', chips: '.rpt-layer:not([hidden]) .rpt-levelup .rpt-unlock', confetti: 'canvas.fx-confetti' };

/** The level-up report: a shot as soon as confetti is in the air (P25; P24 at the same time), then LEVELUP_LATER_MS later. */
async function levelUpSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    const t0 = Date.now();
    const confetti = await page
      .locator('canvas.fx-confetti')
      .waitFor({ state: 'attached', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    // The report drops in over about 0.4 s; confetti flies for 1.4 s.
    await sleep(LEVELUP_SETTLE_MS);
    const early = { ...(await frame(page, LEVELUP_SELS, LEVELUP_STYLES)), ms: Date.now() - t0, overflow: await page.evaluate(reportOverflow) };
    await sleep(Math.max(0, t0 + early.ms + LEVELUP_LATER_MS - Date.now()));
    const late = { ...(await frame(page, LEVELUP_SELS, LEVELUP_STYLES)), ms: Date.now() - t0 };
    progress(who, `level-up report at ${viewport.width}: confetti ${confetti ? `in the air at ${early.ms} ms` : 'none'}, ${late.styles.confetti ? 'still there' : 'gone'} at ${late.ms} ms; ${early.overflow} px below the fold`);
    return { early, late, confetti };
  } finally {
    await context.close();
  }
}

const DOCK_SELS = { dock: 'nav.dock', menuBtn: 'nav.dock [data-panel="menu"]', dot: 'nav.dock .dock-new:not([hidden])' };

/** Report of day MENU_DAY − 1 → Ngày tiếp theo: the dock of the morning that opens Nước cam. */
async function dockSession(browser, url, save, viewport, who) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    await page.locator('.rpt-layer:not([hidden]) [data-action="next-day"]').click();
    await page.locator('[data-action="open"]').first().waitFor();
    await sleep(1200);
    const out = await frame(page, DOCK_SELS, { dot: DOCK_SELS.dot });
    progress(who, `dock at ${viewport.width}: ${out.boxes.dot.length} "Mới" dot(s)`);
    return out;
  } finally {
    await context.close();
  }
}

const WEEK_SELS = { dialog: '[data-screen="weekEnd"] .rpt-dialog', foot: '[data-screen="weekEnd"] .rpt-foot-actions', score: '[data-screen="weekEnd"] [data-block="score"]' };
const WEEK_STYLES = { foot: WEEK_SELS.foot, next: '[data-screen="weekEnd"] [data-action="next-week"]', replay: '[data-screen="weekEnd"] .rpt-foot-actions > .btn:not(.btn-primary)' };

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
    // Rows of the foot: distinct tops of its buttons.
    out.footRows = await page.evaluate((sel) => new Set([...document.querySelectorAll(`${sel} > .btn`)].map((b) => Math.round(b.getBoundingClientRect().top))).size, WEEK_SELS.foot);
    out.footCut = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} > .btn`)].some((b) => b.scrollWidth > b.clientWidth + 1), WEEK_SELS.foot);
    progress(who, `week 1 at ${viewport.width}: foot in ${out.footRows} row(s)${out.footCut ? ', a button cut' : ''}`);
    return out;
  } finally {
    await context.close();
  }
}

// --- Boards. ---

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

/** makeBoard with the P25 legend, after `!!` for rings around a flat or off-frame area; then saved as JPEG. */
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
  const png = join(OUT, name.replace(/\.jpg$/, '.tmp.png'));
  try {
    await makeBoard(browser, basename(png), { names: NAMES, pad: 16, maxScale: 2, gutter: GUTTER, ...opts });
    return await writeJpeg(browser, readFileSync(png), REVIEW, name);
  } finally {
    rmSync(png, { force: true });
  }
}

const avoidTexts = (...frames) => frames.map((f, frame) => ({ frame, boxes: f.texts ?? [] }));
const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
const keep = (marks) => marks.filter((m) => !m.optional || m.boxes.some(Boolean));
const change = (a, b, unit = 'px') => (a === b ? `${b}${unit}` : `${a}${unit} → ${b}${unit}`);
const quote = (text, max = 60) => `"${text.length > max ? `${text.slice(0, max - 1)}…` : text}"`;
/** "Bậc 2/3 · mua để lên bậc 3" out of an upgrade meta line, or "" (P24 has none). */
const tierPart = (text) => /Bậc \d\/\d( · mua để lên bậc \d)?/.exec(text ?? '')?.[0] ?? '';

async function menuBoard(browser, name, width, { base, cur }) {
  const b = base.styles;
  const a = cur.styles;
  const limit = width === PHONE.width ? `; ngưỡng ≤ ${ROW_MAX.ok}/${ROW_MAX.short} px` : '';
  if (width === PHONE.width) {
    if (cur.okMax > ROW_MAX.ok) console.warn(`!! ${name}: a sellable Menu row is ${cur.okMax} px, over ${ROW_MAX.ok}`);
    if (cur.shortMax > ROW_MAX.short) console.warn(`!! ${name}: the short-of-stock row is ${cur.shortMax} px, over ${ROW_MAX.short}`);
  }
  if (!cur.checked) console.warn(`!! ${name}: the Nước cam switch did not turn on`);
  return board(browser, name, {
    frames: [before(base.png, 'Menu: bấm bật Nước cam, thiếu Cam'), after(cur.png, 'Menu: bấm bật Nước cam, thiếu Cam')],
    marks: keep([
      { frame: 0, boxes: base.boxes.toggle, label: `Công tắc có chữ "${b.toggleState?.text ?? ''}", ${b.toggle?.w}×${b.toggle?.h}px, dòng riêng` },
      { frame: 1, boxes: cur.boxes.toggle, label: `Công tắc gọn trên dòng món, vùng chạm ${a.toggle?.w}×${a.toggle?.h}px, không chữ` },
      { frame: 0, boxes: [...base.boxes.short, ...base.boxes.link], label: `Nhãn "${b.short?.text ?? ''}" + link "${b.link?.text ?? ''}" ở dòng 3` },
      { frame: 1, boxes: cur.boxes.short, label: `Nút "${a.short?.text ?? ''}" mở Kho, cao ${a.short?.h}px` },
    ]),
    include: [...base.boxes.row, ...cur.boxes.row],
    avoid: avoidTexts(base, cur),
    notes: [
      `Khổ ${width} px, sáng ngày ${MENU_DAY}, kho chưa có Cam, vừa bấm công tắc Nước cam. Cao dòng Nước cam (thiếu hàng) ${change(Math.round(base.shortMax), Math.round(cur.shortMax))}, dòng bán được cao nhất ${change(Math.round(base.okMax), Math.round(cur.okMax))}${limit}. Thấy trọn ${base.inView} → ${cur.inView}/${cur.rows.length} món khi danh sách ở đầu. P25 bỏ chữ Bán/Không (trạng thái đọc từ aria-checked), "Thiếu Cam" là nút mở Kho thay cho link "Mở Kho".`,
    ],
  });
}

/** Four frames: P24 at the tier-3 levels, P25 at tier 1, 2, 3; with gutters too narrow, labels sit on the frames. */
const tierFrames = (base, cur, title, pick) => [before(pick(base[3]), `${title}, cấp bậc 3`), ...TIERS.map((t) => after(pick(cur[t]), `${title}, bậc ${t}`))];

async function upgradesBoard(browser, name, width, { base, cur, levels }) {
  const id = 'better_machine';
  const lv = (t) => levels[t][id].level;
  return board(browser, name, {
    frames: tierFrames(base, cur, 'Nâng cấp', (s) => s.panel.png),
    marks: keep([
      { frame: 0, boxes: base[3].panel.boxes[id], label: `Cấp ${lv(3)}: icon như cấp 1` },
      ...TIERS.map((t, i) => ({ frame: i + 1, boxes: cur[t].panel.boxes[id], label: `Icon bậc ${t}${tierPart(cur[t].panel.styles[id]?.text) ? `, ${quote(tierPart(cur[t].panel.styles[id]?.text), 34)}` : ''}` })),
    ]),
    include: [base[3].panel, ...TIERS.map((t) => cur[t].panel)].flatMap((p) => UPGRADE_ICONS_SHOWN.flatMap((k) => p.boxes[k])).map((r) => ({ ...r, w: Math.min(r.w + 300, width - r.x) })),
    gutter: 0,
    avoid: avoidTexts(base[3].panel, ...TIERS.map((t) => cur[t].panel)),
    notes: [
      `Khổ ${width} px, bảng Nâng cấp ở đầu. Máy espresso cao cấp cấp ${TIERS.map(lv).join(' / ')} → bậc ${TIERS.join(' / ')}. P24 vẽ cùng một icon ở mọi cấp. P25 lấy icon bậc 2–3 từ atlas tiers (tải khi mở bảng lần đầu) và ghi "Bậc n/3" trên dòng phụ, thêm "mua để lên bậc n+1" khi cấp kế tiếp đổi bậc. Dòng phụ bậc 3: ${quote(cur[3].panel.styles[id]?.text ?? '', 90)}.`,
    ],
  });
}

/** Height of each icon + 3D pair on the tier board, px, and the gap between the two. */
const PAIR_H = 200;
const PAIR_GAP = 12;

/**
 * The tier icon of Máy espresso cao cấp next to the 3D machine of the same
 * save: P24 at the tier-3 levels, P25 at tier 1, 2, 3. Each frame pairs the
 * icon crop of the Nâng cấp shot with the close-up of the scene shot.
 */
async function tierPairBoard(browser, name, width, { base, cur, baseLayouts, curLayouts, levels }) {
  const id = 'better_machine';
  const lv = (t) => levels[t][id].level;
  const grow = (r, x, y) => ({ x: r.x - x, y: r.y - y, w: r.w + 2 * x, h: r.h + 2 * y });
  const inside = (r, crop, tile) => {
    const k = tile.h / crop.h;
    return { x: tile.x + (r.x - crop.x) * k, y: tile.y + (r.y - crop.y) * k, w: r.w * k, h: r.h * k };
  };
  const page = await browser.newPage();
  const pairs = [];
  try {
    for (const [shot, layout] of [[base[3], baseLayouts[3]], ...TIERS.map((t) => [cur[t], curLayouts[t]])]) {
      const iconBox = shot.panel.boxes[id]?.[0];
      const machineBox = CLOSEUPS.espresso.boxes(layout).map(projector(layout, shot.scene.canvas))[0];
      if (!iconBox || !machineBox) {
        console.warn(`!! ${name}: no ${!iconBox ? 'icon' : '3D machine'} to pair`);
        pairs.push(null);
        continue;
      }
      const iconCrop = grow(iconBox, 10, 10);
      const sceneCrop = grow(machineBox, 40, 40);
      const r = await page.evaluate(pairPng, { iconPng: shot.panel.png.toString('base64'), icon: iconCrop, scenePng: shot.scene.png.toString('base64'), scene: sceneCrop, h: PAIR_H, gap: PAIR_GAP });
      pairs.push({ png: Buffer.from(r.png, 'base64'), boxes: [inside(iconBox, iconCrop, r.icon), inside(machineBox, sceneCrop, r.scene)] });
    }
  } finally {
    await page.close();
  }
  if (pairs.some((p) => !p)) return null;
  return board(browser, name, {
    frames: [before(pairs[0].png, 'Icon và máy, cấp bậc 3'), ...TIERS.map((t, i) => after(pairs[i + 1].png, `Icon và máy, bậc ${t}`))],
    marks: [
      { frame: 0, boxes: pairs[0].boxes, label: `Cấp ${lv(3)}: icon và máy như cấp 1` },
      ...TIERS.map((t, i) => ({ frame: i + 1, boxes: pairs[i + 1].boxes, label: `Bậc ${t}: icon và máy cùng bậc` })),
    ],
    gutter: 0,
    notes: [
      `Khổ ${width} px. Mỗi khung ghép icon Máy espresso cao cấp trong bảng Nâng cấp (trái) với máy espresso trong cảnh 3D của cùng save (phải), camera mặc định. Cấp ${TIERS.map(lv).join(' / ')} → bậc ${TIERS.join(' / ')}. P24 một icon và một hình cho mọi cấp; P25 icon bậc và hình 3D đổi cùng nhau: bậc 2 thêm chi tiết và đế thép, bậc 3 đế vàng và sao vàng.`,
    ],
  });
}

async function sceneBoard(browser, name, width, kind, { base, cur, baseLayouts, curLayouts, levels }) {
  const c = CLOSEUPS[kind];
  const boxesOf = (layout, canvas) => c.boxes(layout).map(projector(layout, canvas));
  const shots = [base[3], ...TIERS.map((t) => cur[t])];
  const layouts = [baseLayouts[3], ...TIERS.map((t) => curLayouts[t])];
  // Objects out of the narrow phone view are left out of that frame.
  const rings = shots.map((s, i) => boxesOf(layouts[i], s.scene.canvas).filter((r) => onScreen(r, s.scene.canvas) >= ON_SCREEN));
  // Some room around the objects for their labels.
  const room = (r) => ({ x: r.x - 30, y: r.y - 60, w: r.w + 60, h: r.h + 90 });
  const lv = (t) => levels[t][c.upgrade].level;
  return board(browser, name, {
    frames: tierFrames(base, cur, c.title, (s) => s.scene.png),
    marks: keep([
      { frame: 0, boxes: rings[0], label: `Cấp ${lv(3)}: hình gốc` },
      ...TIERS.map((t, i) => ({ frame: i + 1, boxes: rings[i + 1], label: `Bậc ${t}: ${TIER_LOOK[t]}` })),
    ]),
    include: rings.flat().map(room),
    gutter: 0,
    notes: [
      `Khổ ${width} px, camera mặc định (góc 45°, zoom 1), không mở bảng. ${c.title}: cấp ${TIERS.map(lv).join(' / ')} của ${c.upgrade} cho bậc ${TIERS.join(' / ')}. Khung trái là P24 ở cấp của bậc 3: một hình cho mọi cấp. P25: bậc 1 hình gốc, bậc 2 thêm chi tiết và viền thép, bậc 3 viền vàng và huy hiệu sao; mỗi vật vẫn một mesh gộp hoặc một InstancedMesh.`,
    ],
  });
}

async function fxBoard(browser, name, width, { base, cur, baseLayout, curLayout }) {
  const box = (layout, canvas) => CLOSEUPS.espresso.boxes(layout).map(projector(layout, canvas));
  const baseShot = base.shots[1];
  const room = (r) => ({ x: r.x - 30, y: r.y - 50, w: r.w + 60, h: r.h + 70 });
  const curBoxes = box(curLayout, cur.canvas);
  const baseBoxes = box(baseLayout, base.canvas);
  // Motion inside the ring, against a shot after the effect: P24 gives the noise of the idle scene.
  const page = await browser.newPage();
  const diff = async (shot, rest, boxes) => (boxes[0] ? page.evaluate(ringDiff, { a: shot.png.toString('base64'), b: rest.png.toString('base64'), box: boxes[0], step: FX_STEP }) : 0);
  let baseDiff;
  let curDiff;
  try {
    baseDiff = await diff(baseShot, base.rest, baseBoxes);
    curDiff = await Promise.all(cur.shots.map((s) => diff(s, cur.rest, curBoxes)));
  } finally {
    await page.close();
  }
  const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
  progress('both', `${name}: pixels changed against the shot at rest, P24 ${pct(baseDiff)}, P25 ${curDiff.map(pct).join(' / ')}`);
  return board(browser, name, {
    frames: [before(baseShot.png, `${baseShot.ms} ms sau Mua`), ...cur.shots.map((s) => after(s.png, `${s.ms} ms sau Mua`))],
    marks: [
      { frame: 0, boxes: baseBoxes, label: `Không hiệu ứng: ${pct(baseDiff)} điểm ảnh khác lúc yên` },
      ...cur.shots.map((s, i) => ({ frame: i + 1, boxes: curBoxes, label: `${pct(curDiff[i])} điểm ảnh khác lúc yên` })),
    ],
    include: [...baseBoxes, ...curBoxes].map(room),
    gutter: 0,
    // Small stars: the crop is drawn larger than the other boards.
    maxScale: 3,
    notes: [
      `Khổ ${width} px, save bậc 1, bấm Mua rồi xác nhận Máy espresso cao cấp (cấp 1 → 2); bảng Nâng cấp ẩn lúc chụp để thấy máy phía sau. Mốc chụp đo thật: P24 ${baseShot.ms} ms; P25 ${cur.shots.map((s) => s.ms).join(' / ')} ms sau cú bấm. Nhãn: phần điểm ảnh trong khung khác khung chụp lúc ${cur.rest.ms} ms (hiệu ứng đã xong), kênh màu lệch > ${FX_STEP}; khung P24 là mức nhiễu của cảnh. P25 đổi máy sang hình bậc 2 ngay khi mua, rắc 32 sao vàng trong 0,9 s và nảy máy 0,45 s.`,
    ],
  });
}

async function levelUpBoard(browser, name, viewport, day, { base, cur }) {
  const a = cur.early.styles;
  const b = base.early.styles;
  if (!cur.confetti) console.warn(`!! ${name}: no confetti canvas on the P25 level-up report`);
  else if (!a.confetti) console.warn(`!! ${name}: confetti already gone at the first shot (${cur.early.ms} ms)`);
  if (cur.late.styles.confetti) console.warn(`!! ${name}: confetti still on screen ${cur.late.ms} ms after opening`);
  const fold = (px) => (px > 0 ? `cuộn thêm ${px} px` : 'vừa một màn');
  return board(browser, name, {
    frames: [before(base.early.png, `Báo cáo ngày ${day}`), after(cur.early.png, `Confetti, ${cur.early.ms} ms`), after(cur.late.png, `${cur.late.ms} ms sau khi mở`)],
    marks: keep([
      { frame: 0, boxes: base.early.boxes.title, label: `Dải 1 dòng, chữ ${b.title?.font}px` },
      { frame: 1, boxes: cur.early.boxes.badge, label: 'Huy hiệu cấp bật lên, confetti phủ trên' },
      { frame: 2, boxes: [...cur.late.boxes.badge, ...cur.late.boxes.title], label: `Thẻ ở lại, ${a.chips?.count ?? 0} chip` },
    ]),
    // The top of the report: its head and the level-up band or card.
    include: [...base.early.boxes.band, ...cur.early.boxes.band, ...cur.late.boxes.band].map((r) => ({ x: r.x - 8, y: r.y - 70, w: Math.min(r.w, 360) + 16, h: r.h + 110 })),
    gutter: GUTTER,
    avoid: avoidTexts(base.early, cur.early, cur.late),
    notes: [
      `Khổ ${viewport.width}×${viewport.height}, báo cáo ngày ${day} (lần lên cấp đầu tiên của ván), cửa sổ không nới (P24 ${fold(base.early.overflow)}, P25 ${fold(cur.early.overflow)}). P25: thẻ ${quote(a.title?.text ?? '', 40)} với huy hiệu cấp và chip icon theo nhóm; confetti là canvas không nhận bấm, nạp lần đầu cần, tự gỡ sau 1,4 s. Báo cáo vẫn bấm được ngay.`,
    ],
  });
}

async function dockBoard(browser, name, width, { base, cur }) {
  if (cur.boxes.dot.length === 0) console.warn(`!! ${name}: no "Mới" dot on the P25 dock`);
  const room = (r) => ({ ...r, y: r.y - 120, h: r.h + 120 });
  return board(browser, name, {
    frames: [before(base.png, 'Dock sáng ngày 3'), after(cur.png, 'Dock sáng ngày 3')],
    marks: keep([
      { frame: 0, boxes: base.boxes.menuBtn, label: 'Không báo món mới mở' },
      { frame: 1, boxes: cur.boxes.menuBtn, label: `Chấm "Mới" trên Menu: Nước cam vừa mở` },
    ]),
    include: [...base.boxes.dock, ...cur.boxes.dock].map(room),
    avoid: avoidTexts(base, cur),
    notes: [`Khổ ${width} px, bấm Ngày tiếp theo ở báo cáo ngày ${MENU_DAY - 1}: lịch tuần mở Nước cam sáng ngày ${MENU_DAY}. P25 hiện chấm trên nút bảng có mục mới, mất khi mở bảng; trong bảng hàng đó có nhãn "Mới".`],
  });
}

async function weekBoard(browser, name, width, { base, cur }) {
  if (cur.footCut) console.warn(`!! ${name}: a button of the P25 week foot is cut`);
  return board(browser, name, {
    frames: [before(base.png, 'Tổng kết tuần 1'), after(cur.png, 'Tổng kết tuần 1')],
    marks: keep([
      { frame: 0, boxes: base.boxes.foot, label: `Chân ${base.footRows} hàng${base.footCut ? ', nút bị cắt' : ''}` },
      { frame: 1, boxes: cur.boxes.foot, label: `Chân ${cur.footRows} hàng, "${cur.styles.next?.text ?? ''}" cả hàng dưới` },
    ]),
    include: [...base.boxes.dialog, ...cur.boxes.dialog],
    avoid: avoidTexts(base, cur),
    notes: [`Khổ ${width} px, cửa sổ nới cao cho vừa cả hộp. Nợ P24: ở 390 px chân một hàng làm "Sang tuần" bị cắt; P25 xếp "Về menu", "Chơi lại" hàng trên, nút chính hàng dưới (cao ${change(base.styles.next?.h, cur.styles.next?.h)}).`],
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
    console.log(`exporting and building P24 (${P25_BASE})…`);
    const baseRoot = buildRef(P25_BASE);
    temps.push(baseRoot);
    const cur = await playSaves(ROOT);
    printSaves('P25', cur);
    const base = await playSaves(baseRoot);
    printSaves('P24', base);
    if (process.env.P25_SAVES_ONLY === '1') return;

    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: process.env.MEDIA_HEADED !== '1', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'], ignoreDefaultArgs: ['--hide-scrollbars'] });
    progress('both', `browser ${executablePath ?? 'Playwright Chromium'} ${browser.version()}`);
    const curUrl = urlFor(PORT);
    const baseUrl = urlFor(BASE_PORT);

    for (const v of VIEWPORTS) {
      const w = v.width;
      progress('both', `sessions at ${w}`);
      const [curMenu, baseMenu] = await Promise.all([menuSession(browser, curUrl, cur.saves.morning, v, 'P25'), menuSession(browser, baseUrl, base.saves.morning, v, 'P24')]);
      const curTiers = {};
      for (const t of TIERS) curTiers[t] = await tierSession(browser, curUrl, cur.tiers[t], v, t, 'P25');
      const baseTiers = { 3: await tierSession(browser, baseUrl, base.tiers[3], v, 3, 'P24') };
      // One at a time: the effect shots are timed.
      const curFx = await fxSession(browser, curUrl, cur.tiers[1], v, 'P25');
      const baseFx = await fxSession(browser, baseUrl, base.tiers[1], v, 'P24');
      const curUp = await levelUpSession(browser, curUrl, cur.saves.levelUp, v, 'P25');
      const baseUp = await levelUpSession(browser, baseUrl, base.saves.levelUp, v, 'P24');
      const [curDock, baseDock] = await Promise.all([dockSession(browser, curUrl, cur.saves.report2, v, 'P25'), dockSession(browser, baseUrl, base.saves.report2, v, 'P24')]);

      files.push(await menuBoard(browser, `menu-${w}-p25.jpg`, w, { base: baseMenu, cur: curMenu }));
      const tierPair = { base: baseTiers, cur: curTiers, baseLayouts: base.layouts, curLayouts: cur.layouts, levels: cur.levelsAt };
      files.push(await upgradesBoard(browser, `upgrades-${w}-p25.jpg`, w, tierPair));
      const pairFile = await tierPairBoard(browser, `tier-pair-${w}-p25.jpg`, w, tierPair);
      if (pairFile) files.push(pairFile);
      for (const kind of Object.keys(CLOSEUPS)) files.push(await sceneBoard(browser, `scene-${kind}-${w}-p25.jpg`, w, kind, tierPair));
      // The effect save is tier 1 bought one level up: the layout after the purchase.
      files.push(await fxBoard(browser, `fx-${w}-p25.jpg`, w, { base: baseFx, cur: curFx, baseLayout: base.layouts[1], curLayout: cur.layouts[1] }));
      files.push(await levelUpBoard(browser, `levelup-${w}-p25.jpg`, v, cur.levelUpDay, { base: baseUp, cur: curUp }));
      files.push(await dockBoard(browser, `dock-${w}-p25.jpg`, w, { base: baseDock, cur: curDock }));
    }
    progress('both', 'week summary at 390');
    const [curWeek, baseWeek] = await Promise.all([weekSession(browser, curUrl, cur.saves.week1, PHONE, 'P25'), weekSession(browser, baseUrl, base.saves.week1, PHONE, 'P24')]);
    files.push(await weekBoard(browser, 'week1-390-p25.jpg', PHONE.width, { base: baseWeek, cur: curWeek }));
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

// measure-frames.mjs imports playSaves; only a direct run captures.
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
