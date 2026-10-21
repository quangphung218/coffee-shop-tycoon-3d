// Captures the P21 before/after boards: the v0.2.0 release (77c8387) next to
// the working tree, loading the same saves at the same window size, ringed
// where the 7-day week changed the UI. Run through `npm run media:p21`
// (builds first). Needs Playwright with Chromium and the git history back to
// P21_BASE; see docs/media.md.
//
// The saves come from the working tree's sim: a Normal week on WEEK_SEED
// played with the basic strategy of tests/integration/week.test.ts (restock
// as suggested, serve alone). The script prints that week's table, and writes
// the play-log export of the P21 session to docs/media/playlog-p21.json.
// Prints `!!` for a label with nothing to ring, a ring around a flat (empty)
// area or mostly off the frame, and a label that covers text.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';
import { buildRef, captureSettingsForm, FIXED_NOW, makeBoard, newContext, openMenu, OUT, PHONE, sizeMb, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The v0.2.0 release the boards compare against (git archive). */
const P21_BASE = process.env.P21_BASE ?? '77c8387';
/** Legend names on every P21 board. */
const NAMES = { before: `v0.2.0 (${P21_BASE})`, after: 'P21' };
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The v0.2.0 build is served on the next port. */
const BASE_PORT = PORT + 1;
/** Seed of the week, the one tests/integration/week.test.ts logs. */
const WEEK_SEED = Number(process.env.P21_SEED ?? 12345);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Decor item bought in the mid-week save, so its card has "Gỡ". */
const DECOR_ID = 'plants';
/** Upper bound on simulated minutes per day (tests/integration/helpers.ts DAY_GUARD). */
const DAY_GUARD = 3000;
const DESK = { width: 1280, height: 800 };
/** Window while only waiting for the game clock: slow frames slow the day down. */
const IDLE = { width: 320, height: 240 };
/** A 4x morning lasts about a minute with a fast renderer; software WebGL is slower. */
const PEAK_TIMEOUT_MS = 5 * 60_000;
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** Labels go in a strip this wide right of each frame, so they never sit on its text. */
const GUTTER = 280;
/** A ring whose pixels spread less than this (mean RGB standard deviation, 0–255) is around an empty area. */
const FLAT_SPREAD = 8;
/** A ring with less than this share of its box on the frame is around something scrolled out of view. */
const MIN_ON_IMAGE = 0.6;
const PLAYLOG_OUT = 'playlog-p21.json';

const shot = (page) => page.screenshot({ style: HIDE_TOASTS });

const START = Date.now();
/** Progress line with seconds since start, so a run stopped by a time limit shows where it was. */
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

// --- Saves from the working tree's sim. ---

/** One save file in localStorage form: key and JSON text. */
function saveText(save, state) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
  if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/** Same row format as tests/integration/week.test.ts. */
function formatWeek(rows) {
  const head = ['day', 'weather', 'event', 'arrived', 'revenue', 'ingCost', 'cups', 'cost/cup'];
  const body = rows.map((r) => [r.day, r.weather, r.event, r.arrived, r.revenue, r.ingredientCost, r.cups, r.costPerCup].map((v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)));
  const widths = head.map((h, c) => Math.max(h.length, ...body.map((b) => b[c].length)));
  const line = (cells) => cells.map((cell, c) => cell.padEnd(widths[c])).join(' | ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('-|-'), ...body.map(line)].join('\n');
}

/**
 * Plays the week on the working tree's sim and returns two saves: the
 * morning of the first day from 2 with an event (DECOR_ID bought at no cost
 * to the money shown), and the report of day 7 with the week scored. Also the
 * week's rows and result.
 */
async function loadWeek(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, upgrades, save, weekMod] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/sim/upgrades.ts', '/src/save/save.ts', '/src/sim/week.ts'].map((p) => vite.ssrLoadModule(p)),
    );
    // Serves alone on whatever is left (autoPlay in tests/integration/helpers.ts).
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
    const playDay = (s) => {
      if (!sim.dispatch(s, { type: 'start_day' })) throw new Error(`day ${s.day}: start_day refused`);
      for (let guard = 0; s.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(s);
        sim.step(s, 1);
        s.events = [];
      }
      if (s.phase !== 'report') throw new Error(`day ${s.day} did not reach the report`);
    };

    const state = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, WEEK_SEED);
    const plan = state.week.plan;
    const midDay = (plan.find((p) => p.day >= 2 && p.event === 'fair') ?? plan.find((p) => p.day >= 2 && p.event !== 'none') ?? plan[1]).day;
    const rows = [];
    let mid = null;
    for (let day = 1; day <= plan.length; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`next_day refused before day ${day}`);
      state.events = [];
      if (day === midDay) {
        mid = structuredClone(state);
        mid.money += upgrades.nextUpgradeCost(mid, DECOR_ID) ?? 0;
        const r = upgrades.buyUpgrade(mid, DECOR_ID);
        if (!r.ok) throw new Error(`cannot buy ${DECOR_ID} for the media save: ${r.reason}`);
      }
      sim.dispatch(state, { type: 'apply_restock' });
      playDay(state);
      const report = state.lastReport;
      const cups = Object.values(state.today.sold).reduce((a, n) => a + (n ?? 0), 0);
      rows.push({
        day,
        weather: state.weather,
        event: weekMod.todayPlan(state)?.event ?? 'none',
        arrived: report.customersArrived,
        revenue: report.revenue,
        ingredientCost: report.ingredientCost,
        cups,
        costPerCup: cups > 0 ? Math.round(report.ingredientCost / cups) : 0,
      });
    }
    if (!state.week.result) throw new Error('the week was not scored after day 7');
    return JSON.parse(
      JSON.stringify({
        midDay,
        rows,
        result: state.week.result,
        saves: { mid: saveText(save, mid), end: saveText(save, state) },
      }),
    );
  } finally {
    await vite.close();
  }
}

// --- In-page measurements (viewport CSS px, deviceScaleFactor 1). ---

/**
 * Every visible run of text on screen, as boxes; with `form` relative to the
 * visible Cài đặt form (whose own screenshot is the frame). Labels must not
 * cover these.
 */
function measureTexts(arg) {
  let root = document.body;
  let ox = 0;
  let oy = 0;
  if (arg?.form) {
    root = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
    if (!root) return [];
    const r = root.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
  }
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || el.closest('.toasts, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      if (!arg?.form && (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)) continue;
      out.push({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });
    }
  }
  return out;
}

/**
 * Screen boxes of `arg.sels` (name → CSS selector, or { button: text } for a
 * visible button whose text holds it); null for what is missing or hidden.
 * With `arg.form` the boxes are relative to the visible Cài đặt form.
 */
function measureBoxes(arg) {
  let ox = 0;
  let oy = 0;
  let root = document;
  if (arg.form) {
    const form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
    if (!form) return {};
    const r = form.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    // Only inside the visible form: hidden screens may carry the same classes.
    root = form;
  }
  const find = (sel) =>
    typeof sel === 'string'
      ? root.querySelector(sel)
      : [...document.querySelectorAll('button')].find((b) => b.offsetParent !== null && (b.textContent || '').includes(sel.button));
  const out = {};
  for (const [name, sel] of Object.entries(arg.sels)) {
    const el = find(sel);
    const r = el?.getBoundingClientRect();
    out[name] = r && r.width > 0 && r.height > 0 ? { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height } : null;
  }
  return out;
}

/**
 * Height the window needs so nothing inside `sel` (or its scrolling parents)
 * is cut off; `sel` null means the visible Cài đặt form.
 */
function fitHeight(sel) {
  const el = sel
    ? document.querySelector(sel)
    : [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
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

// --- Capture sessions. ---

/**
 * A page with the fixed settings, a save in the autosave slot and, with
 * `ticking`, a clock that runs on from FIXED_NOW (so play-log lines get real
 * time gaps).
 */
async function gameContext(browser, viewport, save, { ticking = false } = {}) {
  const context = await newContext(browser, { viewport });
  if (ticking) {
    await context.addInitScript((now) => {
      const t0 = performance.now();
      Date.now = () => now + Math.round(performance.now() - t0);
    }, FIXED_NOW);
  }
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

/** From the Main Menu through Tiếp tục into the autosaved game; waits for `ready`. */
async function resume(page, url, save, ready) {
  await openMenu(page, url);
  // The button's name also carries the slot detail ("Coffee Shop · Ngày 3").
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  try {
    await btn.waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load (wrong format for this build?)`);
  }
  await btn.click();
  await page.locator(ready).first().waitFor();
}

/** Shot, boxes and text boxes of the current screen. */
async function frame(page, sels) {
  return { png: await shot(page), boxes: await page.evaluate(measureBoxes, { sels }), texts: await page.evaluate(measureTexts) };
}

/**
 * The mid-week morning on one build: the HUD, then the Việc, Nâng cấp and
 * Menu panels. With `after`, also opens the shop, plays to the peak and quits
 * to the Main Menu, so the page's play log has a real stop; the page is
 * returned open on the Main Menu for the Cài đặt shot.
 */
async function weekDaySession(browser, url, save, { who, after }) {
  const context = await gameContext(browser, DESK, save, { ticking: after });
  const page = await context.newPage();
  const dockBtn = (id) => page.locator(`.dock [data-panel="${id}"]`);
  const panelBody = () => page.locator('#ui-panel .panel-body');
  const openPanel = async (id) => {
    await dockBtn(id).click();
    await panelBody().waitFor();
  };
  await resume(page, url, save, '[data-action="open"]');
  progress(who, 'mid-week morning');
  await sleep(800);

  const hud = await frame(page, { day: '.hud-left > .hud-stat', week: '.hud-week:not([hidden])', chip: '.hud-week [data-chip="event"]:not([hidden])' });

  await openPanel('tasks');
  await page.evaluate(() => document.querySelector('#ui-panel .week-today')?.scrollIntoView({ block: 'start' }));
  await sleep(400);
  const tasks = await frame(page, {
    weekList: '#ui-panel .week-today:not([hidden])',
    unlock: '#ui-panel [data-week="unlocks"]',
    checklist: '#ui-panel .stack[aria-label="Việc trong ngày"]',
  });
  await dockBtn('tasks').click();

  await openPanel('upgrades');
  await page.evaluate((id) => document.querySelector(`#ui-panel .item[data-upgrade="${id}"]`)?.scrollIntoView({ block: 'center' }), DECOR_ID);
  await sleep(400);
  const decor = await frame(page, {
    row: `#ui-panel .item[data-upgrade="${DECOR_ID}"]`,
    remove: `#ui-panel [data-remove="${DECOR_ID}"] button`,
    side: `#ui-panel .item[data-upgrade="${DECOR_ID}"] .item-side`,
  });
  await dockBtn('upgrades').click();

  await openPanel('menu');
  await sleep(400);
  const price = await frame(page, { policy: '#ui-panel [data-policy="price"]', intro: '#ui-panel .prep > .intro' });
  await dockBtn('menu').click();

  if (!after) {
    await context.close();
    return { hud, tasks, decor, price };
  }

  // Play to the peak and quit, so Số liệu chơi shows where this run stopped.
  await page.locator('[data-action="open"]').click();
  await page.locator('[data-speed="4"]').click();
  progress(who, 'opened at 4x');
  await page.setViewportSize(IDLE);
  await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: PEAK_TIMEOUT_MS });
  await page.setViewportSize(DESK);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Về Main Menu' }).click();
  await page.getByRole('button', { name: 'Ván mới', exact: true }).waitFor();
  progress(who, 'quit to the Main Menu at the peak');
  return { hud, tasks, decor, price, context, page };
}

/**
 * Cài đặt from the Main Menu of `page`, the window grown so the whole form is
 * on screen. With `after`, also returns the play-log export the screen shows.
 */
async function settingsShot(page, { after }) {
  await page.setViewportSize(DESK);
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await page.getByText('Âm thanh', { exact: true }).waitFor();
  // By accessible name (aria-labelledby), so the hidden new-game form never matches.
  const form = page.getByRole('form', { name: 'Cài đặt' });
  const sels = { title: 'h2', foot: '.foot', playlog: 'section.playlog', summary: '.playlog-summary', actions: '.playlog-actions', game: '.app-version' };
  const out = await captureSettingsForm(page, form, {
    width: DESK.width,
    minHeight: DESK.height,
    measure: async () => ({ boxes: await page.evaluate(measureBoxes, { sels, form: true }), texts: await page.evaluate(measureTexts, { form: true }) }),
  });
  if (after) out.json = await page.evaluate(() => document.querySelector('pre.playlog-json')?.textContent ?? '');
  return out;
}

/** Cài đặt of a build with no game played in the page. */
async function settingsSession(browser, url) {
  const context = await newContext(browser, { viewport: DESK });
  const page = await context.newPage();
  try {
    await openMenu(page, url);
    return await settingsShot(page, { after: false });
  } finally {
    await context.close();
  }
}

/**
 * The day-7 report at `viewport` on one build, the window grown so the whole
 * dialog fits; with `after`, then the week-end screen it leads to.
 */
async function weekEndSession(browser, url, save, viewport, { who, after }) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  const grow = async (sel) => {
    const height = Math.max(viewport.height, await page.evaluate(fitHeight, sel));
    if (height > viewport.height) await page.setViewportSize({ width: viewport.width, height });
    await sleep(400);
  };
  try {
    await resume(page, url, save, '.rpt-layer:not([hidden])');
    await page.locator('[data-block="money"]').first().waitFor();
    await sleep(1200);
    await grow('.rpt-layer:not([hidden]) .rpt-dialog');
    const report = await frame(page, { next: { button: 'Ngày tiếp theo' }, weekBtn: { button: 'Xem kết tuần' }, dialog: '.rpt-layer:not([hidden]) .rpt-dialog' });
    progress(who, `day-7 report at ${viewport.width} px`);
    if (!after) return { report };
    await page.setViewportSize(viewport);
    await page.locator('[data-action="week-end"]').click();
    await page.locator('[data-screen="weekEnd"] [data-block="score"]').waitFor();
    await sleep(800);
    await grow('[data-screen="weekEnd"] .rpt-dialog');
    const weekEnd = await frame(page, {
      score: '[data-screen="weekEnd"] [data-block="score"]',
      revenue: '[data-screen="weekEnd"] [data-block="revenue"]',
      stars: '[data-screen="weekEnd"] [data-block="stars"]',
      days: '[data-screen="weekEnd"] [data-block="days"]',
      replay: '[data-screen="weekEnd"] [data-action="replay"]',
      dialog: '[data-screen="weekEnd"] .rpt-dialog',
    });
    progress(who, `week-end screen at ${viewport.width} px`);
    return { report, weekEnd };
  } finally {
    await context.close();
  }
}

// --- Boards. ---

/** makeBoard with the P21 legend, after warning `!!` for every ring around a flat or off-frame area. */
async function board(browser, out, opts) {
  const page = await browser.newPage();
  try {
    for (const m of opts.marks) {
      const boxes = m.boxes.filter(Boolean);
      if (boxes.length === 0) continue;
      const rings = await page.evaluate(ringSpread, { png: opts.frames[m.frame].png.toString('base64'), boxes });
      const off = rings.filter((r) => r.onImage < MIN_ON_IMAGE);
      if (off.length > 0) console.warn(`!! ${out}: "${m.label}" rings something mostly off the frame (${off.map((r) => `${Math.round(r.onImage * 100)}%`).join(', ')} on it)`);
      const flat = rings.filter((r) => r.spread !== null && r.spread < FLAT_SPREAD);
      if (flat.length > 0) console.warn(`!! ${out}: "${m.label}" rings a flat area (colour spread ${flat.map((r) => r.spread.toFixed(1)).join(', ')} < ${FLAT_SPREAD})`);
    }
  } finally {
    await page.close();
  }
  await makeBoard(browser, out, { names: NAMES, ...opts });
}

/** Text boxes of each frame, for the board's label placement. */
const avoidTexts = (...frames) => frames.map((f, frame) => ({ frame, boxes: f.texts ?? [] }));

async function makeP21Boards(browser, { cur, base, curSet, baseSet, ends, week }) {
  const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
  const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
  const day = `ngày ${week.midDay}`;
  const files = [];
  const put = async (out, opts) => {
    await board(browser, out, opts);
    files.push(out);
  };

  await put('hud-week-p21.png', {
    frames: [before(base.hud.png, 'HUD'), after(cur.hud.png, 'HUD')],
    marks: [
      { frame: 0, boxes: [base.hud.boxes.day], label: `v0.2.0: chỉ số ngày "${week.midDay}"` },
      { frame: 1, boxes: [cur.hud.boxes.day], label: `"Ngày ${week.midDay}/7" (mới)` },
      { frame: 1, boxes: [cur.hud.boxes.week], label: 'Chip thời tiết + sự kiện hôm nay (mới)' },
    ],
    pad: 24,
    maxScale: 2,
    avoid: avoidTexts(base.hud, cur.hud),
    gutter: GUTTER,
    notes: [`Khổ 1280×800, pha Chuẩn bị sáng ${day} của cùng một ván (Vừa, seed ${WEEK_SEED}). Rê chuột lên chip để xem hệ số khách và giá nhập.`],
  });

  await put('tasks-unlocks-p21.png', {
    frames: [before(base.tasks.png, 'Việc'), after(cur.tasks.png, 'Việc')],
    marks: [
      { frame: 0, boxes: [base.tasks.boxes.checklist], label: 'v0.2.0: bảng mở đầu bằng checklist việc' },
      { frame: 1, boxes: [cur.tasks.boxes.weekList], label: 'Khối "Hôm nay · Ngày N/7" (mới)' },
      { frame: 1, boxes: [cur.tasks.boxes.unlock], label: 'Dòng "Mới mở khóa hôm nay" theo lịch tuần' },
    ],
    pad: 24,
    avoid: avoidTexts(base.tasks, cur.tasks),
    gutter: GUTTER,
    notes: [`Khổ 1280×800, bảng Việc lúc Chuẩn bị ${day}. Khối Hôm nay ghi thời tiết, sự kiện, món/dụng cụ vừa mở và lịch ngày mai.`],
  });

  await put('decor-remove-p21.png', {
    frames: [before(base.decor.png, 'Nâng cấp'), after(cur.decor.png, 'Nâng cấp')],
    marks: [
      { frame: 0, boxes: [base.decor.boxes.side], label: 'v0.2.0: đã mua thì chỉ mua thêm được' },
      { frame: 1, boxes: [cur.decor.boxes.remove], label: 'Nút "Gỡ (+tiền hoàn)", bấm 2 lần tại chỗ (mới)' },
    ],
    include: [base.decor.boxes.row, cur.decor.boxes.row],
    pad: 24,
    avoid: avoidTexts(base.decor, cur.decor),
    gutter: GUTTER,
    notes: [`Khổ 1280×800, bảng Nâng cấp ${day}, ván đã mua Cây xanh cấp 1. Gỡ hoàn 50% giá cấp đó, không mở hộp thoại.`],
  });

  await put('price-policy-p21.png', {
    frames: [before(base.price.png, 'Menu'), after(cur.price.png, 'Menu')],
    marks: [
      { frame: 0, boxes: [base.price.boxes.intro], label: 'v0.2.0: giá cố định từng món' },
      { frame: 1, boxes: [cur.price.boxes.policy], label: 'Mức giá Rẻ / Chuẩn / Cao, đổi tại chỗ (mới)' },
    ],
    pad: 24,
    avoid: avoidTexts(base.price, cur.price),
    gutter: GUTTER,
    notes: ['Khổ 1280×800, bảng Menu lúc Chuẩn bị. Dòng gợi ý dưới Mức giá ghi tiền mỗi ly, sao và lượng khách đổi ra sao.'],
  });

  for (const [width, end] of ends) {
    const { report: baseReport } = end.base;
    const { report: curReport, weekEnd } = end.cur;
    await put(`week-end-${width}-p21.png`, {
      frames: [before(baseReport.png, 'Cuối ngày 7'), after(weekEnd.png, 'Kết tuần')],
      marks: [
        { frame: 0, boxes: [baseReport.boxes.next], label: 'v0.2.0: chỉ có "Ngày tiếp theo"' },
        { frame: 1, boxes: [weekEnd.boxes.score], label: 'Điểm tuần /100 và cúp (mới)' },
        { frame: 1, boxes: [weekEnd.boxes.revenue, weekEnd.boxes.stars], label: 'Doanh thu, sao so mục tiêu tuần' },
        { frame: 1, boxes: [weekEnd.boxes.days], label: 'Bảng 7 ngày: thời tiết, sự kiện, doanh thu, khách' },
        { frame: 1, boxes: [weekEnd.boxes.replay], label: 'Nút "Chơi lại"' },
      ],
      include: [baseReport.boxes.dialog, weekEnd.boxes.dialog],
      pad: 16,
      maxScale: width < 600 ? 1.5 : 1,
      avoid: avoidTexts(baseReport, weekEnd),
      gutter: GUTTER,
      notes: [
        `Khổ ${width} px, cuối ngày 7 của cùng một ván (Vừa, seed ${WEEK_SEED}): ${week.result.revenue.toLocaleString('vi-VN')}đ / ${week.result.revenueTarget.toLocaleString('vi-VN')}đ, ${week.result.stars.toFixed(1)}/${week.result.starsTarget} sao, ${week.result.score} điểm. P21 vào màn này qua nút "Xem kết tuần" của báo cáo ngày 7${curReport.boxes.weekBtn ? '' : ' (không thấy nút này trên báo cáo P21)'}.`,
      ],
    });
  }

  await put('settings-playlog-p21.png', {
    frames: [before(baseSet.png, 'Cài đặt'), after(curSet.png, 'Cài đặt')],
    marks: [
      { frame: 0, boxes: [baseSet.boxes.game], label: 'v0.2.0: hết form sau nhóm Trò chơi' },
      { frame: 1, boxes: [curSet.boxes.summary], label: 'Lần dừng gần nhất: ngày, pha, giờ game (mới)' },
      { frame: 1, boxes: [curSet.boxes.actions], label: '"Xuất JSON" và "Xoá" (bấm 2 lần)' },
    ],
    // Title to footer of both forms, so the board shows each form whole.
    include: [curSet.boxes.title, curSet.boxes.foot, curSet.boxes.playlog, baseSet.boxes.title, baseSet.boxes.foot, baseSet.boxes.game],
    pad: 40,
    maxScale: 1,
    avoid: avoidTexts(baseSet, curSet),
    gutter: GUTTER,
    notes: [`Màn Cài đặt khổ 1280, chụp cả form. P21 vừa chơi ${day} tới giờ cao điểm rồi về Main Menu, nên log có một lần dừng thật.`],
  });

  return files;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const temps = [];
  const servers = [];
  let browser = null;
  let files = [];
  try {
    const week = await loadWeek(ROOT);
    console.log(`Week, Normal, seed ${WEEK_SEED}\n${formatWeek(week.rows)}`);
    const r = week.result;
    console.log(`Result: revenue ${r.revenue.toLocaleString('en-US')} / ${r.revenueTarget.toLocaleString('en-US')}, stars ${r.stars} / ${r.starsTarget}, score ${r.score}, cups ${r.cups}`);
    // P21_WEEK_ONLY=1: the week table alone, no build, browser or boards.
    if (process.env.P21_WEEK_ONLY === '1') return;
    console.log(`building v0.2.0 (${P21_BASE})…`);
    const baseRoot = buildRef(P21_BASE);
    temps.push(baseRoot);
    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    browser = await launchBrowser({ headless: process.env.MEDIA_HEADED !== '1', ignoreDefaultArgs: ['--hide-scrollbars'] });

    progress('both', `day ${week.midDay} on P21 and v0.2.0`);
    const [cur, base] = await Promise.all([
      weekDaySession(browser, urlFor(PORT), week.saves.mid, { who: 'P21', after: true }),
      weekDaySession(browser, urlFor(BASE_PORT), week.saves.mid, { who: 'v0.2.0', after: false }),
    ]);
    let curSet;
    try {
      curSet = await settingsShot(cur.page, { after: true });
    } finally {
      await cur.context.close();
    }
    const baseSet = await settingsSession(browser, urlFor(BASE_PORT));
    writeFileSync(join(OUT, PLAYLOG_OUT), `${curSet.json.trim()}\n`);

    progress('both', 'day-7 report and week end');
    const ends = [];
    for (const viewport of [DESK, PHONE]) {
      const [c, b] = await Promise.all([
        weekEndSession(browser, urlFor(PORT), week.saves.end, viewport, { who: 'P21', after: true }),
        weekEndSession(browser, urlFor(BASE_PORT), week.saves.end, viewport, { who: 'v0.2.0', after: false }),
      ]);
      ends.push([viewport.width, { cur: c, base: b }]);
    }
    progress('both', 'drawing boards');
    files = await makeP21Boards(browser, { cur, base, curSet, baseSet, ends, week });
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  for (const f of [...files, PLAYLOG_OUT]) console.log(`ok docs/media/${f} ${sizeMb(join(OUT, f)).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
