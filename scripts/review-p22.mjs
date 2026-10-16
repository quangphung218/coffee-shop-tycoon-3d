// Plays a 7-day Normal week on the production build at 390x844 (phone,
// deviceScaleFactor 3, touch) and 1440x900, shooting every screen and
// measuring it, for the P22 review. Run through `npm run review:p22` (builds
// first). Needs Playwright with Chromium.
//
// Day 1 is played through the UI at 4x on New Game (seed from MEDIA_SEED):
// every dock panel, Mở cửa, the 11:00 peak and its queue, the Daily Report
// tabs. Days 2–7 load the morning of that day from the working tree's sim
// (the basic strategy of tests/integration/week.test.ts: restock as
// suggested, serve alone) through Tiếp tục, then shoot the HUD and Việc,
// restock and hire through the UI, open at 4x and shoot the peak. Day 7 also
// loads the scored report and the week-end screen.
//
// Writes docs/reports/p22-review/<viewport>/*.png|jpg, metrics.json and
// findings.json. Timeouts: REVIEW_TIMEOUT_MS for the whole run (default 20
// minutes), REVIEW_STEP_MS for one step (default 3 minutes; waits for the
// game clock get PEAK_TIMEOUT_MS and DAY_TIMEOUT_MS). REVIEW_SERIAL=1 plays
// the two viewports one after the other instead of side by side (cleaner FPS,
// twice as long). REVIEW_DAYS plays only some days ("1", "2-4"; default
// "1-7", the Main Menu goes with day 1) and keeps the other days of an
// existing metrics.json; REVIEW_VIEWPORTS ("390" or "1440") does the same
// for one viewport. REVIEW_QUALITY is the graphics setting (default
// medium, the game's default). REVIEW_SIM_ONLY=1 builds the saves and prints
// the week, no browser.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { FIXED_NOW, newContext, observeThree, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs', 'reports', 'p22-review');
const PORT = Number(process.env.REVIEW_PORT ?? 4173);
const TOTAL_MS = Number(process.env.REVIEW_TIMEOUT_MS ?? 20 * 60_000);
const STEP_MS = Number(process.env.REVIEW_STEP_MS ?? 3 * 60_000);
/** Open at 4x until the 11:00 peak: about 30 s with a fast renderer. */
const PEAK_TIMEOUT_MS = 5 * 60_000;
/** From the peak to the Daily Report at 4x. */
const DAY_TIMEOUT_MS = 8 * 60_000;
/** New Game seeds from Date.now(), which newContext() freezes at FIXED_NOW (MEDIA_SEED). */
const SEED = FIXED_NOW >>> 0;
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Upper bound on simulated minutes per day (tests/integration/helpers.ts DAY_GUARD). */
const DAY_GUARD = 3000;
const VIEWPORTS = [
  { name: '390', phone: true, context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: '1440', phone: false, context: { viewport: { width: 1440, height: 900 } } },
];
/** Window while only waiting for the game clock: slow frames slow the day down. */
const IDLE = { width: 320, height: 240 };
/** Staff hired through Nhân viên each day, so the shop serves while nobody clicks. */
const HIRES = 2;
/** Game clock of the queue shot on day 1, an hour into the lunch peak. */
const QUEUE_AT = '11:45';
const FPS_MS = 10_000;
const MAX_IMAGE_BYTES = 400 * 1024;
const MIN_TARGET = 44;
const MIN_FONT = 12;
const MIN_FPS = 55;
/** Ratio impact/effort from which a finding counts as 'high'. */
const HIGH = 1.5;
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** Graphics setting of every page; capture-media's SETTINGS use high, players start on medium. */
const QUALITY = process.env.REVIEW_QUALITY ?? 'medium';

/** Week days to play, from REVIEW_DAYS ("3", "2-4"; default all 7). */
function parseDays(text) {
  const m = /^(\d)(?:-(\d))?$/.exec(text.trim());
  if (!m) throw new Error(`REVIEW_DAYS "${text}" is not "N" or "N-M" with days 1–7`);
  const from = Number(m[1]);
  const to = Number(m[2] ?? m[1]);
  if (from < 1 || to > 7 || from > to) throw new Error(`REVIEW_DAYS "${text}" is outside 1–7`);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
const DAYS = parseDays(process.env.REVIEW_DAYS ?? '1-7');
/** Viewports to play, from REVIEW_VIEWPORTS ("390", "1440" or "390,1440", the default). */
const ACTIVE = (process.env.REVIEW_VIEWPORTS ?? '390,1440').split(',').map((s) => s.trim());
/** Day of a metrics key or shot file ("390/d3-peak", "d0-menu-first.png"); day 0 (Main Menu) goes with day 1. */
const dayOf = (key) => Math.max(1, Number(/(?:^|\/)d(\d)/.exec(key)?.[1] ?? 1));

const START = Date.now();
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

const metrics = {
  seed: SEED,
  difficulty: DIFFICULTY,
  commit: '',
  parallel: process.env.REVIEW_SERIAL !== '1',
  quality: QUALITY,
  runs: [],
  notes: [
    'Headless Chromium with SwiftShader (software WebGL): FPS is a floor, not what a GPU gets.',
    'With parallel=true both viewports render at once, so each FPS is lower than alone.',
    'stuckWalking: the sim state has no window hook; counted from the three.js scene (window.__THREE_DEVTOOLS__) as people whose legs swing (rotation range > 0.15 rad) while they move < 0.05 m for > 5 s.',
    'looks: distinct sets of visible mesh colours per person drawn, staff included.',
  ],
  week: null,
  menu: {},
  screens: {},
  peaks: {},
  steps: [],
  error: null,
};

/** Runs `fn` with its own time limit; records how long it took. */
async function step(who, name, fn, ms = STEP_MS) {
  const t0 = Date.now();
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${who}: step "${name}" timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    metrics.steps.push({ who, name, ms: Date.now() - t0 });
  }
}

// --- Saves from the working tree's sim (as in capture-p21.mjs). ---

function saveText(save, state) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
  if (!r.ok) throw new Error(`cannot write the review save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/** The morning save of days 2–7 (before the restock) and the scored day-7 report, plus the week's rows. */
async function loadWeek() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, weekMod] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/week.ts'].map((p) => vite.ssrLoadModule(p)),
    );
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
    const playDay = (s) => {
      if (!sim.dispatch(s, { type: 'start_day' })) throw new Error(`day ${s.day}: start_day refused`);
      for (let guard = 0; s.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(s);
        sim.step(s, 1);
        s.events = [];
      }
      if (s.phase !== 'report') throw new Error(`day ${s.day} did not reach the report`);
    };

    const state = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
    const mornings = {};
    const rows = [];
    for (let day = 1; day <= state.week.plan.length; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`next_day refused before day ${day}`);
      state.events = [];
      if (day > 1) mornings[day] = saveText(save, state);
      sim.dispatch(state, { type: 'apply_restock' });
      playDay(state);
      const report = state.lastReport;
      rows.push({
        day,
        weather: state.weather,
        event: weekMod.todayPlan(state)?.event ?? 'none',
        arrived: report.customersArrived,
        revenue: report.revenue,
        ingredientCost: report.ingredientCost,
        money: state.money,
        rating: state.rating,
      });
    }
    if (!state.week.result) throw new Error('the week was not scored after day 7');
    return JSON.parse(JSON.stringify({ rows, result: state.week.result, mornings, end: saveText(save, state) }));
  } finally {
    await vite.close();
  }
}

// --- In-page probes (run in the page; CSS px). ---

/**
 * Init script: counts the toasts on screen every 100 ms (the most at once in
 * window.__reviewToastMax) and, when main.ts marks cst:menu, how many visible
 * .ic boxes have no atlas image loaded yet.
 */
function reviewProbes() {
  window.__reviewToastMax = 0;
  setInterval(() => {
    const n = document.querySelectorAll('.toasts > *').length;
    if (n > window.__reviewToastMax) window.__reviewToastMax = n;
  }, 100);
  const atlasDone = () =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/icons3d/atlas') && e.responseEnd > 0)
      .map((e) => ({ file: e.name.slice(e.name.lastIndexOf('/') + 1), at: Math.round(e.responseEnd) }));
  const mark = performance.mark.bind(performance);
  performance.mark = (name, opts) => {
    if (name === 'cst:menu') {
      const boxes = [...document.querySelectorAll('.ic')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.checkVisibility();
      });
      const want = devicePixelRatio > 1 ? 'atlas@2x' : 'atlas@1x';
      const loaded = atlasDone().some((e) => e.file.startsWith(want));
      const noImage = boxes.filter((el) => getComputedStyle(el).backgroundImage === 'none').length;
      window.__reviewIcons = { at: Math.round(performance.now()), visible: boxes.length, blank: loaded ? noImage : boxes.length, atlas: want, atlasLoaded: loaded };
    }
    return mark(name, opts);
  };
  window.__reviewAtlas = atlasDone;
}

/** Everything measured on the current screen. `phone`: tap targets and the 3D scene cover too. */
function measureScreen({ phone, minTarget, minFont }) {
  const describe = (el) => {
    const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
    const data = [...el.attributes].find((a) => a.name.startsWith('data-'));
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}${data ? `[${data.name}="${data.value}"]` : ''}${text ? ` "${text}"` : ''}`;
  };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const onScreen = (r) => r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  const shown = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const srOnly = (el) => el.closest('.sr-only') !== null;

  const overflow = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth) overflow.push({ el: 'html', page: true, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth });
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (!onScreen(r) || !shown(el) || srOnly(el)) continue;
    const ox = getComputedStyle(el).overflowX;
    if (el.scrollWidth > el.clientWidth + 1 && (ox === 'auto' || ox === 'scroll' || el === document.body)) {
      overflow.push({ el: describe(el), page: false, overflowX: ox, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }

  const smallTargets = [];
  if (phone) {
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], label.choice';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!onScreen(r) || !shown(el) || srOnly(el) || el.disabled) continue;
      // A radio or checkbox inside its label is tapped through the label.
      if (el.tagName === 'INPUT' && el.closest('label')) continue;
      if (r.width < minTarget || r.height < minTarget) smallTargets.push({ el: describe(el), ...box(r) });
    }
  }

  const smallText = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || seen.has(el) || srOnly(el) || el.closest('script, style')) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (!onScreen(r) || !shown(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) smallText.push({ el: describe(el), fontSize: size, text: n.textContent.trim().slice(0, 40) });
  }

  const groups = {
    hud: '.hud',
    dock: '.dock',
    panel: '#ui-panel',
    toast: '.toasts .toast, .toasts > *',
    report: '.rpt-layer:not([hidden]) .rpt-dialog',
    note: '.hud-note',
  };
  const parts = [];
  for (const [group, sel] of Object.entries(groups)) {
    for (const el of new Set(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (onScreen(r) && shown(el) && (group !== 'note' || el.textContent.trim())) parts.push({ group, el, r });
    }
  }
  const overlaps = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      if (a.group === b.group || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 4 && h > 4) overlaps.push({ a: a.group, b: b.group, aEl: describe(a.el), bEl: describe(b.el), area: Math.round(w * h), box: { x: Math.round(Math.max(a.r.left, b.r.left)), y: Math.round(Math.max(a.r.top, b.r.top)), w: Math.round(w), h: Math.round(h) } });
    }
  }

  let sceneCover = null;
  if (phone) {
    const canvas = document.getElementById('scene');
    const painted = (el) => {
      if (el === document.documentElement || el === document.body || el.id === 'ui') return false;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor.match(/[\d.]+/g);
      if (bg && (bg.length < 4 || Number(bg[3]) > 0.05) && cs.backgroundColor !== 'transparent') return true;
      if (cs.backgroundImage !== 'none' || cs.backdropFilter !== 'none') return true;
      if (/^(IMG|SVG|CANVAS|VIDEO|BUTTON|INPUT|SELECT)$/i.test(el.tagName)) return true;
      return [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    };
    let total = 0;
    let covered = 0;
    for (let y = 5; y < innerHeight; y += 10) {
      for (let x = 5; x < innerWidth; x += 10) {
        total++;
        const stack = document.elementsFromPoint(x, y);
        const at = stack.indexOf(canvas);
        if ((at === -1 ? stack : stack.slice(0, at)).some(painted)) covered++;
      }
    }
    sceneCover = total ? Math.round((covered / total) * 1000) / 1000 : null;
  }

  return {
    overflow,
    smallTargets,
    smallText,
    overlaps,
    toasts: document.querySelectorAll('.toasts > *').length,
    toastMaxSoFar: window.__reviewToastMax ?? null,
    sceneCover,
  };
}

/**
 * FPS over `ms` of requestAnimationFrame, and the people of the three.js
 * scene sampled every 250 ms: how many there are, how many distinct looks,
 * and who stood still (or walked in place) for more than 5 s.
 */
function measurePeak({ ms }) {
  return new Promise((resolveIt) => {
    const samples = new Map();
    const looks = new Set();
    let peopleMax = 0;
    const sample = () => {
      const root = window.__mediaScene?.getObjectByName('actors');
      if (!root) return false;
      const t = performance.now();
      let people = 0;
      for (const o of root.children) {
        if (!o.visible || o.name === 'coins') continue;
        people++;
        const leg = o.children[0]?.children[0]?.children[0];
        const list = samples.get(o.uuid) ?? [];
        list.push({ t, x: o.position.x, z: o.position.z, leg: leg ? leg.rotation.x : 0 });
        samples.set(o.uuid, list);
        const colours = [];
        o.traverseVisible((m) => {
          if (m.isMesh && m.material?.color) colours.push(m.material.color.getHexString());
        });
        looks.add(colours.sort().join(','));
      }
      peopleMax = Math.max(peopleMax, people);
      return true;
    };
    let frames = 0;
    const perSecond = [];
    let secondStart = performance.now();
    let secondFrames = 0;
    const t0 = performance.now();
    let hooked = sample();
    const timer = setInterval(() => (hooked = sample() || hooked), 250);
    const tick = (now) => {
      frames++;
      secondFrames++;
      if (now - secondStart >= 1000) {
        perSecond.push(Math.round((secondFrames * 1000) / (now - secondStart)));
        secondStart = now;
        secondFrames = 0;
      }
      if (now - t0 < ms) {
        requestAnimationFrame(tick);
        return;
      }
      clearInterval(timer);
      let still = 0;
      let stuckWalking = 0;
      for (const list of samples.values()) {
        let isStill = false;
        let isStuck = false;
        for (let i = 0; i < list.length && !isStuck; i++) {
          let j = i;
          while (j + 1 < list.length && Math.hypot(list[j + 1].x - list[i].x, list[j + 1].z - list[i].z) < 0.05) j++;
          if (list[j].t - list[i].t > 5000) {
            isStill = true;
            const legs = list.slice(i, j + 1).map((s) => s.leg);
            if (Math.max(...legs) - Math.min(...legs) > 0.15) isStuck = true;
          }
        }
        if (isStill) still++;
        if (isStuck) stuckWalking++;
      }
      resolveIt({
        fps: Math.round((frames * 1000 * 10) / (now - t0)) / 10,
        fpsMin: perSecond.length ? Math.min(...perSecond) : null,
        sceneHook: hooked,
        people: peopleMax,
        tracked: samples.size,
        looks: hooked ? looks.size : null,
        stillOver5s: hooked ? still : null,
        stuckWalking: hooked ? stuckWalking : null,
      });
    };
    requestAnimationFrame(tick);
  });
}

// --- One viewport. ---

/** Viewport screenshot under MAX_IMAGE_BYTES: PNG, else JPEG 80 at device then CSS scale, else JPEG 60 at CSS scale. */
async function saveShot(page, vp, name) {
  const tries = [
    { type: 'png' },
    { type: 'jpeg', quality: 80 },
    { type: 'jpeg', quality: 80, scale: 'css' },
    { type: 'jpeg', quality: 60, scale: 'css' },
  ];
  let buf;
  let opt;
  for (opt of tries) {
    buf = await page.screenshot({ ...opt, style: HIDE_TOASTS });
    if (buf.length < MAX_IMAGE_BYTES) break;
  }
  const file = `${vp.name}/${name}.${opt.type === 'png' ? 'png' : 'jpg'}`;
  writeFileSync(join(OUT, file), buf);
  return { file, bytes: buf.length, oversize: buf.length >= MAX_IMAGE_BYTES };
}

/** Shot and measurements of the current screen, stored as metrics.screens["<viewport>/<name>"]. */
async function capture(page, vp, name, extra = {}) {
  const shot = await saveShot(page, vp, name);
  const m = await page.evaluate(measureScreen, { phone: vp.phone, minTarget: MIN_TARGET, minFont: MIN_FONT });
  const key = `${vp.name}/${name}`;
  metrics.screens[key] = { viewport: vp.name, name, ...shot, clock: await clockText(page), ...m, ...extra };
  return key;
}

/** Runs in the page: the HUD clock, e.g. '11:05' (the pill labelled "Giờ"; the level chip has a <b> too). */
function hudClock() {
  const pill = [...document.querySelectorAll('.hud .hud-stat')].find((p) => p.querySelector('small')?.textContent === 'Giờ');
  return pill?.querySelector('b')?.textContent ?? '';
}

function clockText(page) {
  return page.evaluate(hudClock);
}

/** Waits until the HUD clock reads `hhmm` or later, in the small idle window. */
async function waitClock(page, vp, hhmm, ms) {
  await page.setViewportSize(IDLE);
  try {
    await page.waitForFunction(
      (t) => ([...document.querySelectorAll('.hud .hud-stat')].find((p) => p.querySelector('small')?.textContent === 'Giờ')?.querySelector('b')?.textContent ?? '') >= t,
      hhmm,
      { timeout: ms, polling: 250 },
    );
  } finally {
    await page.setViewportSize(vp.context.viewport);
  }
  await sleep(800);
}

async function waitPeak(page, vp) {
  await page.setViewportSize(IDLE);
  try {
    await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: PEAK_TIMEOUT_MS, polling: 250 });
  } finally {
    await page.setViewportSize(vp.context.viewport);
  }
  await sleep(800);
}

async function gameContext(browser, vp, save) {
  const context = await newContext(browser, vp.context);
  // After newContext's own script, so this quality wins.
  await context.addInitScript((quality) => {
    const s = JSON.parse(localStorage.getItem('cst3d:settings') ?? '{}');
    localStorage.setItem('cst3d:settings', JSON.stringify({ ...s, quality }));
  }, QUALITY);
  await context.addInitScript(observeThree);
  await context.addInitScript(reviewProbes);
  if (save) await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

const panelOpen = (page) => page.locator('#ui-panel:not([hidden])');

async function openPanel(page, id) {
  await page.locator(`.dock [data-panel="${id}"]`).click();
  await panelOpen(page).locator('.panel-body').waitFor();
  await sleep(500);
}

async function closePanel(page) {
  if (await panelOpen(page).count()) {
    await panelOpen(page).locator('.panel-head .icon-btn').click();
    await panelOpen(page).waitFor({ state: 'hidden' });
  }
}

/** Restock as suggested and hire up to HIRES staff through the panels; closes the panel. */
async function prepare(page) {
  await openPanel(page, 'inventory');
  await panelOpen(page).locator('[data-action="suggest"]').click();
  const buy = panelOpen(page).locator('[data-action="buy"]');
  if (await buy.isEnabled()) await buy.click();
  await closePanel(page);
  await openPanel(page, 'staff');
  let hired = 0;
  for (let i = 0; i < HIRES; i++) {
    const hire = panelOpen(page).locator('[data-action="hire"]:not([disabled])').first();
    if (!(await hire.count())) break;
    await hire.click();
    hired++;
    await sleep(300);
  }
  await closePanel(page);
  return hired;
}

/** Mở cửa at 4x, to the peak; then the peak shot and the 10 s FPS and people count. */
async function openToPeak(page, vp, who, day) {
  await page.locator('.hud [data-action="open"]').click();
  await page.locator('.hud [data-speed="4"]').first().click();
  await step(who, `day ${day} to the peak`, () => waitPeak(page, vp), PEAK_TIMEOUT_MS + 10_000);
  const key = await step(who, `day ${day} peak shot`, () => capture(page, vp, `d${day}-peak`));
  const peak = await step(who, `day ${day} peak FPS`, () => page.evaluate(measurePeak, { ms: FPS_MS }), FPS_MS + 30_000);
  metrics.peaks[`${vp.name}/d${day}`] = { screen: key, clockAfter: await clockText(page), ...peak };
  progress(who, `day ${day} peak: ${peak.fps} fps, ${peak.people} people, ${peak.looks} looks`);
}

/** From the Main Menu through Tiếp tục into the autosaved game; waits for `ready`. */
async function resume(page, url, ready) {
  await page.goto(url);
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  await btn.waitFor({ timeout: 10_000 });
  await btn.click();
  await page.locator(ready).first().waitFor();
  await sleep(800);
}

async function dayOne(browser, vp, url) {
  const who = vp.name;
  const context = await gameContext(browser, vp, null);
  try {
    const page = await context.newPage();
    const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
    await step(who, 'cold Main Menu', async () => {
      await page.goto(url);
      await newGame.waitFor();
      await capture(page, vp, 'd0-menu-first');
    });
    await step(who, 'Main Menu with the 3D scene', async () => {
      await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
      await sleep(1500);
      await capture(page, vp, 'd0-menu-ready');
    });
    metrics.menu[vp.name] = await page.evaluate(() => ({
      menuMs: Math.round(performance.getEntriesByName('cst:menu')[0]?.startTime ?? -1),
      worldMs: Math.round(performance.getEntriesByName('cst:world')[0]?.startTime ?? -1),
      icons: window.__reviewIcons ?? null,
      atlas: window.__reviewAtlas?.() ?? [],
    }));
    progress(who, `menu ${metrics.menu[vp.name].menuMs} ms, world ${metrics.menu[vp.name].worldMs} ms, blank icons ${metrics.menu[vp.name].icons?.blank}`);

    await step(who, 'New Game on Normal', async () => {
      await newGame.click();
      await page.locator('label.choice', { has: page.locator(`input[value="${DIFFICULTY}"]`) }).click();
      await capture(page, vp, 'd1-new-game');
      await page.getByRole('button', { name: 'Bắt đầu ngày 1', exact: true }).click();
      await page.locator('.hud [data-action="open"]').waitFor();
      await sleep(800);
      await capture(page, vp, 'd1-hud');
    });
    const ids = await page.locator('.dock [data-panel]').evaluateAll((els) => els.map((e) => e.dataset.panel));
    for (const id of ids) {
      await step(who, `day 1 panel ${id}`, async () => {
        await openPanel(page, id);
        await capture(page, vp, `d1-panel-${id}`);
        await closePanel(page);
      });
    }
    const hired = await step(who, 'day 1 restock and hire', () => prepare(page));
    progress(who, `day 1 hired ${hired}`);
    await openToPeak(page, vp, who, 1);
    await step(who, 'day 1 queue', async () => {
      await waitClock(page, vp, QUEUE_AT, PEAK_TIMEOUT_MS);
      await capture(page, vp, 'd1-queue');
    }, PEAK_TIMEOUT_MS + 10_000);
    await step(who, 'day 1 to the report', async () => {
      await page.setViewportSize(IDLE);
      try {
        await page.locator('.rpt-layer:not([hidden])').waitFor({ timeout: DAY_TIMEOUT_MS });
      } finally {
        await page.setViewportSize(vp.context.viewport);
      }
      await sleep(1500);
    }, DAY_TIMEOUT_MS + 10_000);
    for (const tab of ['summary', 'insights', 'reviews']) {
      await step(who, `day 1 report ${tab}`, async () => {
        await page.locator(`.rpt-layer:not([hidden]) [data-tab="${tab}"]`).click();
        await page.locator(`#rpt-${tab}:not([hidden])`).waitFor();
        await page.evaluate(() => document.querySelectorAll('.rpt-layer, .rpt-layer *').forEach((el) => (el.scrollTop = 0)));
        await sleep(600);
        await capture(page, vp, `d1-report-${tab}`);
      });
    }
    metrics.menu[vp.name].toastMaxDay1 = await page.evaluate(() => window.__reviewToastMax);
  } finally {
    await context.close();
  }
}

async function laterDay(browser, vp, url, day, save) {
  const who = vp.name;
  const context = await gameContext(browser, vp, save);
  try {
    const page = await context.newPage();
    await step(who, `day ${day} load`, () => resume(page, url, '.hud [data-action="open"]'));
    await step(who, `day ${day} HUD and Việc`, async () => {
      await capture(page, vp, `d${day}-hud`);
      await openPanel(page, 'tasks');
      await capture(page, vp, `d${day}-panel-tasks`);
      await closePanel(page);
    });
    await step(who, `day ${day} restock and hire`, () => prepare(page));
    await openToPeak(page, vp, who, day);
    metrics.screens[`${vp.name}/d${day}-peak`].toastMaxDay = await page.evaluate(() => window.__reviewToastMax);
  } finally {
    await context.close();
  }
}

async function weekEnd(browser, vp, url, save) {
  const who = vp.name;
  const context = await gameContext(browser, vp, save);
  try {
    const page = await context.newPage();
    await step(who, 'day 7 report', async () => {
      await resume(page, url, '.rpt-layer:not([hidden])');
      await page.locator('[data-block="money"]').first().waitFor();
      await sleep(1200);
      await capture(page, vp, 'd7-report');
    });
    await step(who, 'week end', async () => {
      await page.locator('[data-action="week-end"]').click();
      await page.locator('[data-screen="weekEnd"] [data-block="score"]').waitFor();
      await sleep(800);
      await capture(page, vp, 'd7-week-end');
    });
  } finally {
    await context.close();
  }
}

async function playViewport(browser, vp, url, week) {
  const dir = join(OUT, vp.name);
  mkdirSync(dir, { recursive: true });
  // Only the shots of the days played now; the other days stay from earlier runs.
  for (const f of readdirSync(dir)) if (DAYS.includes(dayOf(f))) rmSync(join(dir, f));
  for (const day of DAYS) {
    progress(vp.name, `day ${day}`);
    if (day === 1) await dayOne(browser, vp, url);
    else await laterDay(browser, vp, url, day, week.mornings[day]);
    if (day === 7) await weekEnd(browser, vp, url, week.end);
    writeReport();
  }
  progress(vp.name, 'done');
}

/** With REVIEW_DAYS, keeps what an earlier run measured on the other days. */
function keepOtherDays() {
  const file = join(OUT, 'metrics.json');
  if (!existsSync(file)) return;
  const old = JSON.parse(readFileSync(file, 'utf8'));
  const redone = (vp, day) => ACTIVE.includes(vp) && DAYS.includes(day);
  const keep = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => !redone(k.split('/')[0], dayOf(k))));
  metrics.screens = keep(old.screens);
  metrics.peaks = keep(old.peaks);
  metrics.menu = Object.fromEntries(Object.entries(old.menu ?? {}).filter(([vp]) => !redone(vp, 1)));
  metrics.steps = (old.steps ?? []).filter((s) => s.who !== 'sim' && !redone(s.who, Number(/day (\d)/.exec(s.name)?.[1] ?? 1)));
  metrics.runs = old.runs ?? [];
}

// --- Findings from the numbers. ---

function findings() {
  const out = [];
  const add = (f) => out.push({ ...f, ratio: Math.round((f.impact / f.effort) * 100) / 100, high: f.impact / f.effort >= HIGH });
  const screens = Object.entries(metrics.screens);
  /** Groups `items(screen)` by `keyOf(item)` across screens of one viewport: { key: { item, evidence[] } }. */
  const group = (vpName, items, keyOf) => {
    const map = new Map();
    for (const [key, s] of screens) {
      if (s.viewport !== vpName) continue;
      for (const item of items(s)) {
        const k = keyOf(item);
        const g = map.get(k) ?? { item, evidence: new Set() };
        g.evidence.add(s.file);
        g.evidence.add(`screens.${key}`);
        map.set(k, g);
      }
    }
    return [...map.entries()];
  };
  for (const vp of VIEWPORTS) {
    const v = vp.name;
    let n = 0;
    for (const [k, g] of group(v, (s) => s.overflow, (o) => o.el)) {
      add({ id: `layout-overflow-${v}-${++n}`, area: 'layout', title: `Tràn ngang: ${k} (scrollWidth ${g.item.scrollWidth} > ${g.item.clientWidth})`, evidence: [...g.evidence], impact: g.item.page ? 3 : 1, effort: g.item.page ? 1 : 2, viewport: v });
    }
    n = 0;
    for (const [k, g] of group(v, (s) => s.smallTargets, (t) => t.el)) {
      const small = Math.min(g.item.w, g.item.h);
      add({ id: `ui-small-target-${v}-${++n}`, area: 'ui', title: `Vùng bấm nhỏ ${g.item.w}x${g.item.h} px (< ${MIN_TARGET}): ${k}`, evidence: [...g.evidence], impact: small < 32 ? 2 : 1, effort: 1, viewport: v });
    }
    n = 0;
    for (const [k, g] of group(v, (s) => s.smallText, (t) => `${t.el} @${t.fontSize}`)) {
      add({ id: `ui-small-text-${v}-${++n}`, area: 'ui', title: `Chữ ${g.item.fontSize} px (< ${MIN_FONT}): ${k.replace(/ @[\d.]+$/, '')}`, evidence: [...g.evidence], impact: g.item.fontSize < 11 ? 2 : 1, effort: 1, viewport: v });
    }
    n = 0;
    for (const [k, g] of group(v, (s) => s.overlaps, (o) => `${o.a}/${o.b}`)) {
      const toast = g.item.a === 'toast' || g.item.b === 'toast';
      add({ id: `layout-overlap-${v}-${++n}`, area: 'layout', title: `Che nhau ${k}: ${g.item.aEl} và ${g.item.bEl} (${g.item.area} px²)`, evidence: [...g.evidence], impact: toast ? 1 : 2, effort: toast ? 1 : 2, viewport: v });
    }
    const own = screens.filter(([, s]) => s.viewport === v);
    const toastMax = Math.max(0, ...own.map(([, s]) => s.toastMaxSoFar ?? 0), metrics.menu[v]?.toastMaxDay1 ?? 0);
    if (toastMax > 3) {
      add({ id: `ui-toasts-${v}`, area: 'ui', title: `${toastMax} toast cùng lúc`, evidence: own.filter(([, s]) => (s.toastMaxSoFar ?? 0) > 3).map(([k]) => `screens.${k}.toastMaxSoFar`), impact: 2, effort: 1, viewport: v });
    }
    if (vp.phone) {
      const covered = own.filter(([, s]) => s.name.endsWith('-peak') && s.sceneCover !== null && s.sceneCover > 0.5);
      if (covered.length) {
        const worst = Math.max(...covered.map(([, s]) => s.sceneCover));
        add({ id: `layout-scene-cover-${v}`, area: 'layout', title: `UI che ${Math.round(worst * 100)}% cảnh 3D lúc cao điểm`, evidence: covered.flatMap(([k, s]) => [s.file, `screens.${k}.sceneCover`]), impact: 2, effort: 3, viewport: v });
      }
    }
    const icons = metrics.menu[v]?.icons;
    if (icons && icons.blank > 0) {
      add({ id: `ui-icons-blank-${v}`, area: 'ui', title: `${icons.blank}/${icons.visible} ô icon trống lúc Main Menu hiện (${icons.atlas} chưa tải)`, evidence: [`${v}/d0-menu-first`, `menu.${v}.icons`].map((e, i) => (i === 0 ? metrics.screens[e]?.file ?? e : e)), impact: 2, effort: 1, viewport: v });
    }
    const peaks = Object.entries(metrics.peaks).filter(([k]) => k.startsWith(`${v}/`));
    const slow = peaks.filter(([, p]) => p.fps < MIN_FPS);
    if (slow.length) {
      const worst = Math.min(...slow.map(([, p]) => p.fps));
      add({ id: `perf-fps-${v}`, area: 'perf', title: `FPS cao điểm ${worst} (< ${MIN_FPS}) ở ${slow.length}/${peaks.length} ngày (SwiftShader)`, evidence: slow.map(([k]) => `peaks.${k}.fps`), impact: worst < 30 ? 3 : 2, effort: 3, viewport: v });
    }
    const stuck = peaks.filter(([, p]) => (p.stuckWalking ?? 0) > 0);
    if (stuck.length) {
      add({ id: `characters-stuck-${v}`, area: 'characters', title: `Nhân vật bước tại chỗ > 5 s ở ${stuck.length} ngày (nhiều nhất ${Math.max(...stuck.map(([, p]) => p.stuckWalking))})`, evidence: stuck.flatMap(([k, p]) => [metrics.screens[p.screen]?.file, `peaks.${k}.stuckWalking`].filter(Boolean)), impact: 2, effort: 2, viewport: v });
    }
    const samey = peaks.filter(([, p]) => p.looks !== null && p.people >= 6 && p.looks < 4);
    if (samey.length) {
      add({ id: `characters-looks-${v}`, area: 'characters', title: `Ít kiểu ngoại hình lúc cao điểm (${Math.min(...samey.map(([, p]) => p.looks))} kiểu)`, evidence: samey.map(([k]) => `peaks.${k}.looks`), impact: 1, effort: 2, viewport: v });
    }
    const big = own.filter(([, s]) => s.oversize);
    if (big.length) metrics.notes.push(`${v}: ${big.length} shots are still >= ${MAX_IMAGE_BYTES} bytes at JPEG 60.`);
  }
  return out.sort((a, b) => b.ratio - a.ratio || b.impact - a.impact || a.id.localeCompare(b.id));
}

function writeReport() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  const list = findings();
  writeFileSync(join(OUT, 'findings.json'), `${JSON.stringify(list, null, 2)}\n`);
  const high = list.filter((f) => f.high).length;
  console.log(`ok docs/reports/p22-review/metrics.json (${Object.keys(metrics.screens).length} screens)`);
  console.log(`ok docs/reports/p22-review/findings.json (${list.length} findings, ${high} high)`);
}

async function main() {
  let browser = null;
  let server = null;
  const cleanup = async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill();
    browser = null;
    server = null;
  };
  // metrics.json is only written once the other days of an earlier run are merged in.
  let merged = false;
  const stop = (why, code) => {
    console.error(`review-p22: ${why}, stopping`);
    metrics.error = why;
    try {
      if (merged) writeReport();
    } catch {
      // keep the first message
    }
    void cleanup().finally(() => process.exit(code));
  };
  const total = setTimeout(() => stop(`over REVIEW_TIMEOUT_MS (${TOTAL_MS} ms)`, 1), TOTAL_MS);
  process.once('SIGINT', () => stop('SIGINT', 130));
  process.once('SIGTERM', () => stop('SIGTERM', 143));
  try {
    metrics.commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const week = await step('sim', 'week saves', loadWeek);
    metrics.week = { rows: week.rows, result: week.result };
    console.log(`Week, ${DIFFICULTY}, seed ${SEED}`);
    console.table(week.rows);
    if (process.env.REVIEW_SIM_ONLY === '1') return;
    mkdirSync(OUT, { recursive: true });
    const playing = VIEWPORTS.filter((vp) => ACTIVE.includes(vp.name));
    if (playing.length === 0) throw new Error(`REVIEW_VIEWPORTS "${ACTIVE.join(',')}" names none of ${VIEWPORTS.map((v) => v.name).join(', ')}`);
    if (DAYS.length < 7 || playing.length < VIEWPORTS.length) keepOtherDays();
    metrics.runs = metrics.runs.filter((r) => !(r.days.every((d) => DAYS.includes(d)) && (r.viewports ?? []).every((v) => ACTIVE.includes(v))));
    metrics.runs.push({ days: DAYS, viewports: playing.map((v) => v.name), commit: metrics.commit, quality: QUALITY, parallel: metrics.parallel });
    merged = true;
    server = await startPreview(ROOT, PORT);
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    });
    const url = urlFor(PORT);
    if (metrics.parallel) await Promise.all(playing.map((vp) => playViewport(browser, vp, url, week)));
    else for (const vp of playing) await playViewport(browser, vp, url, week);
  } catch (err) {
    metrics.error = String(err?.stack ?? err);
    throw err;
  } finally {
    clearTimeout(total);
    await cleanup();
    if (merged) writeReport();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
