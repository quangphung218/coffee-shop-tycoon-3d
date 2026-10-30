// Checks the panels and the Daily Report for sideways overflow, and the Kho
// panel for layout shift, on the production build in headless Chromium.
// Run through `npm run layout` (builds first). Needs Playwright with Chromium.
//
// For each viewport: a new game, the six dock panels in order, the shop opened
// at 4x, then the Daily Report of day 1 and its Đánh giá tab from a save this
// tree's sim played the same way (playFirstDay of scripts/lib/saves.mjs: two
// hires, the Kho suggestion bought, the staff alone through the day) up to
// the tick before the report, which the browser plays itself after Tiếp tục
// (day end, autosave, report), so no viewport waits for a day in the
// browser. On every screen the scroll
// boxes must not scroll sideways (scrollWidth <= clientWidth; a line cut with
// text-overflow: ellipsis and its full text in a title is allowed) and no element
// may stick out of the left or right edge of the panel or report card. In the
// Kho panel a layout-shift observer runs while the stepper, Auto-restock and
// an over-budget pack count change the order: CLS (shifts without recent
// input, as web-vitals counts it) must be 0, the foot and its rows (totals,
// buy button, hint) must keep their place and size, and the stock list must
// not move. Shifts that follow a click
// are listed per step as notes. The HUD is checked before opening, with the
// camera menu open and while open: three clusters inside the viewport, not
// overlapping, content inside each frame, one row from 1280 px up (same top
// and height) and at most two below, Điều khiển starting in the first row,
// every button at least --size-target (44 px) and, while
// open, each speed button with an icon and an aria-label (1280×800 runs
// this HUD check only). The same HUD check runs again at 390, 1100, 1280 and
// 1440 px on a day with an event ("Tăng giá nhập"), at 390 px and from
// 1100 px with late-game values (nine-digit sum, Tem, Cấp 5), from saves
// written by this tree's sim with the day-1 event swapped.
// P25, at 390×844, 768×1024, 1280×720 and 1440×900, from saves of
// scripts/capture-p25.mjs: the compact Menu on the day-3 morning after a
// click on the Nước cam switch (no Cam), and the Daily Report of the first
// level-up. Both must not overflow and every button must be at least
// --size-target (a positioned ::before counts as tap area); at 390 px a
// Menu row with no label must be at most 72 px and a row with a label
// ("Thiếu …", "Mở …", "Mới") 96 px; at every width no Menu name or meta line
// may be cut (scrollWidth > clientWidth or "…"); at 1280×720 the level-up
// report must fit without scrolling.
// P27, at the same four sizes, from saves of scripts/capture-p27.mjs: Việc
// with the gift card, special order and opened achievements, Nhân viên with
// the Đào tạo confirm open, Nâng cấp with the Tem-priced furniture. Each must
// not overflow, must show those parts and every button must be at least
// --size-target.
// LAYOUT_ONLY (day, hud, event, p25, p27, comma-separated) runs those parts
// only and LAYOUT_DAY_WIDTHS (e.g. 390) narrows the day runs, so a long run
// can be split; the default runs everything.
// Holds the machine's perf lock (scripts/lib/perf-lock.mjs) while Chrome is
// open: it shares the GPU with perf:frames and measure-startup, so it waits
// for a running measurement (PERF_LOCK_WAIT_S) and keeps one from starting
// over it.
// LAYOUT_OFFLINE=1 is for a sandbox that cannot bind a port or start Chrome's
// helper processes: no vite preview, the pages get dist/ through Playwright
// routes and each context gets its own Playwright Chromium in one process
// (--single-process; software WebGL, so slower, layout only).
// Prints PASS/FAIL tables; exits 1 on any FAIL.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BROWSER_ARGS, launchBrowser } from './lib/browser.mjs';
import { acquirePerfLock } from './lib/perf-lock.mjs';
import { clockOf, loadSim, playFirstDay, saveText } from './lib/saves.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.LAYOUT_PORT ?? 4173);
const URL_BASE = `http://127.0.0.1:${PORT}/`;
/** Date.now() inside the page is frozen at this value, so New Game always gets the same seed. */
const FIXED_NOW = 1760400000000;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
/** Dock panels in dock order (src/ui/panels/index.ts PREP_PANELS). */
const PANELS = [
  ['tasks', 'Việc'],
  ['menu', 'Menu'],
  ['inventory', 'Kho'],
  ['staff', 'Nhân viên'],
  ['marketing', 'Marketing'],
  ['upgrades', 'Nâng cấp'],
];
/** Staff hired in the Nhân viên panel so the day serves customers and the report has content. */
const HIRES = 2;
/** The New Game form's shop name (src/ui/screens/newGame.ts) and the difficulty startDayOne picks. */
const NEW_GAME = { shopName: 'Cà Phê Gió Mùa', difficulty: 'easy' };
/** Sub-pixel slack for box edges and the foot height, CSS px. */
const EPS = 0.5;
/** Elements listed per failing check. */
const SHOW = 6;

const OFFLINE = process.env.LAYOUT_OFFLINE === '1';

/**
 * LAYOUT_OFFLINE: a stand-in for the Browser whose newContext launches its own
 * Chromium in one process (that mode holds one context; closing the context
 * closes it) and answers URL_BASE from dist/ instead of a server.
 */
function offlineBrowser() {
  const dist = join(ROOT, 'dist');
  return {
    async newContext(options) {
      const browser = await chromium.launch({ headless: process.env.LAYOUT_HEADED !== '1', args: [...BROWSER_ARGS, '--single-process'] });
      const context = await browser.newContext(options);
      await context.route(`${URL_BASE}**`, (route) => {
        const path = decodeURIComponent(new URL(route.request().url()).pathname);
        const file = join(dist, normalize(path.endsWith('/') ? `${path}index.html` : path));
        if (!file.startsWith(dist) || !existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ path: file });
      });
      const close = context.close.bind(context);
      context.close = async () => {
        await close();
        await browser.close();
      };
      return context;
    },
    async close() {},
  };
}

async function startPreview() {
  // Without a build, vite preview answers 404 and never looks started.
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('no dist/index.html: run npm run build first (npm run layout does)');
  if (OFFLINE) return null;
  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited (port ${PORT} busy?)`);
    try {
      if ((await fetch(URL_BASE)).ok) return server;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  server.kill();
  throw new Error('vite preview did not start');
}

/** Waits for the finite CSS animations (panel slide-in, report drop) to end, then two frames. */
function settle(page) {
  return page.evaluate(async () => {
    const running = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
    await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/**
 * Runs in the page. `frame` is the box content must stay inside (its padding
 * box, left to right); `scrollers` are the boxes that must not scroll
 * sideways. Every descendant of `frame` that clips or scrolls its overflow is
 * checked the same way, and every visible descendant must lie inside it.
 */
function measure({ frame, scrollers, eps }) {
  const describe = (el) => {
    const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
    const data = [...el.attributes].find((a) => a.name.startsWith('data-'));
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}${data ? `[${data.name}="${data.value}"]` : ''}${text ? ` "${text}"` : ''}`;
  };
  const root = document.querySelector(frame);
  if (!root) return { error: `${frame} not found` };
  const box = root.getBoundingClientRect();
  const left = box.left + root.clientLeft;
  const right = left + root.clientWidth;
  const wide = [];
  const ellipsized = [];
  const seen = new Set();
  // A line cut with text-overflow: ellipsis whose full text is in a title on
  // it or an ancestor (the level-up unlock chips) is not an overflow.
  const ellipsis = (el) => {
    if (getComputedStyle(el).textOverflow !== 'ellipsis') return false;
    const text = (el.textContent ?? '').trim();
    return text !== '' && el.closest('[title]')?.getAttribute('title') === text;
  };
  const checkScroll = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.scrollWidth <= el.clientWidth) return;
    if (ellipsis(el)) ellipsized.push(describe(el));
    else wide.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
  };
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth) wide.push(`html scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`);
  let scrollChecked = 0;
  for (const sel of scrollers) {
    for (const el of document.querySelectorAll(sel)) {
      checkScroll(el);
      scrollChecked++;
    }
  }
  const outside = [];
  if (box.left < -eps || box.right > innerWidth + eps) outside.push(`${frame} ${box.left.toFixed(1)}..${box.right.toFixed(1)} outside the viewport 0..${innerWidth}`);
  let checked = 0;
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // Hidden, display: contents and the 1px .sr-only labels (they clip their text on purpose).
    if (r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    if (cs.overflowX !== 'visible') {
      checkScroll(el);
      scrollChecked++;
    }
    checked++;
    if (r.left < left - eps || r.right > right + eps) {
      outside.push(`${describe(el)} ${r.left.toFixed(1)}..${r.right.toFixed(1)} outside ${left.toFixed(1)}..${right.toFixed(1)}`);
    }
  }
  return { wide, outside, ellipsized, checked, scrollChecked };
}

/** One overflow row per screen. */
async function checkScreen(page, results, viewport, screen, opts) {
  await settle(page);
  const m = await page.evaluate(measure, { ...opts, eps: EPS });
  const fails = m.error ? [m.error] : [...m.wide, ...m.outside];
  results.push({
    viewport,
    screen,
    pass: fails.length === 0,
    detail: m.error ?? `${m.scrollChecked} scroll box, ${m.checked} phần tử; ${m.wide.length} tràn scroll, ${m.outside.length} lệch khung${m.ellipsized.length ? `; ${m.ellipsized.length} chữ "…" có title đủ tên` : ''}`,
    fails,
  });
}

/**
 * HUD (P23): the three clusters must sit inside the viewport, not overlap,
 * hold their content inside their frame and take at most `maxRows` rows;
 * an open camera menu must stay inside the viewport.
 */
async function checkHud(page, results, viewport, screen, maxRows) {
  await settle(page);
  const m = await page.evaluate(
    ({ eps }) => {
      const fails = [];
      const name = (el) => el.dataset.cluster ?? el.className;
      const clusters = [...document.querySelectorAll('.hud > .hud-cluster')];
      if (clusters.length !== 3) fails.push(`${clusters.length} clusters, expected 3`);
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth) fails.push(`html scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`);
      const boxes = clusters.map((c) => [c, c.getBoundingClientRect()]);
      for (const [c, r] of boxes) {
        if (r.left < -eps || r.right > innerWidth + eps) fails.push(`${name(c)} ${r.left.toFixed(1)}..${r.right.toFixed(1)} outside 0..${innerWidth}`);
        if (c.scrollWidth > c.clientWidth + 1) fails.push(`${name(c)} scrollWidth ${c.scrollWidth} > clientWidth ${c.clientWidth}`);
        for (const el of c.querySelectorAll('*')) {
          if (el.closest('.hud-menu') || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) continue;
          const e = el.getBoundingClientRect();
          if (e.width <= 1 || e.height <= 1) continue;
          if (e.left < r.left - eps || e.right > r.right + eps) fails.push(`${name(c)}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${e.left.toFixed(1)}..${e.right.toFixed(1)} outside ${r.left.toFixed(1)}..${r.right.toFixed(1)}`);
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, ra] = boxes[i];
          const [b, rb] = boxes[j];
          if (ra.left < rb.right - eps && rb.left < ra.right - eps && ra.top < rb.bottom - eps && rb.top < ra.bottom - eps) fails.push(`${name(a)} overlaps ${name(b)}`);
        }
      }
      // A cluster starts a new row when it begins below the shortest cluster
      // of the current row: centred clusters of different heights share a row
      // with different tops, and Điều khiển spans both grid rows.
      const spans = boxes.map(([, r]) => [r.top, r.bottom]).sort((a, b) => a[0] - b[0]);
      let rows = 0;
      let rowBottom = -Infinity;
      for (const [top, bottom] of spans) {
        if (top >= rowBottom - eps) {
          rows++;
          rowBottom = bottom;
        } else rowBottom = Math.min(rowBottom, bottom);
      }
      // Điều khiển starts in the first row: never wrapped alone under Tiến độ.
      const at = (n) => boxes.find(([c]) => c.dataset.cluster === n)?.[1];
      const today = at('today');
      const controls = at('controls');
      if (today && controls && controls.top >= today.bottom - eps) fails.push(`controls top ${controls.top.toFixed(1)} below today ${today.top.toFixed(1)}..${today.bottom.toFixed(1)}`);
      const menu = document.querySelector('.hud-menu:not([hidden])');
      if (menu) {
        const r = menu.getBoundingClientRect();
        if (r.left < -eps || r.right > innerWidth + eps) fails.push(`menu ${r.left.toFixed(1)}..${r.right.toFixed(1)} outside 0..${innerWidth}`);
      }
      // Every shown button is at least --size-target on both sides.
      const target = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-target')) || 44;
      const shown = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
      };
      const buttons = [...document.querySelectorAll('.hud button')].filter(shown);
      for (const b of buttons) {
        const r = b.getBoundingClientRect();
        if (r.width < target - eps || r.height < target - eps) fails.push(`button ${b.dataset.action ?? b.dataset.speed ?? b.getAttribute('aria-label')} ${r.width.toFixed(1)}×${r.height.toFixed(1)} < ${target} px`);
      }
      // While open, the speed control shows: each speed button an icon and a name.
      const speed = buttons.filter((b) => b.matches('.speed button, .speed-cycle'));
      const open = document.querySelector('.phases li[aria-current="step"]')?.dataset.phase;
      if (open && open !== 'preparation' && speed.length === 0) fails.push('no speed button shown while open');
      for (const b of speed) {
        const ic = b.querySelector('.ic');
        if (!ic || !shown(ic)) fails.push(`speed button ${b.getAttribute('aria-label')} shows no icon`);
        if (!b.getAttribute('aria-label')) fails.push('speed button without aria-label');
      }
      const event = document.querySelector('.hud [data-chip="event"]:not([hidden])');
      const bar = document.querySelector('.hud').getBoundingClientRect();
      return {
        fails,
        rows,
        tops: boxes.map(([c, r]) => [name(c), r.top, r.height]),
        height: Math.round(bar.height),
        widths: boxes.map(([c, r]) => `${name(c)} ${Math.round(r.width)}`).join(', '),
        buttons: buttons.length,
        event: event?.getAttribute('aria-label')?.split(':')[0] ?? null,
      };
    },
    { eps: EPS },
  );
  const fails = [...m.fails];
  if (m.rows > maxRows) fails.push(`${m.rows} rows, at most ${maxRows}`);
  // One row: the three frames share their top edge and height.
  if (maxRows === 1 && m.tops.length) {
    const [, top0, h0] = m.tops[0];
    for (const [n, top, h] of m.tops) {
      if (Math.abs(top - top0) > EPS || Math.abs(h - h0) > EPS) fails.push(`${n} top ${top.toFixed(1)} h ${h.toFixed(1)} ≠ ${top0.toFixed(1)} h ${h0.toFixed(1)}`);
    }
  }
  const event = m.event ? `; sự kiện ${m.event}` : '';
  results.push({ viewport, screen, pass: fails.length === 0, detail: `${m.rows} hàng, cao ${m.height} px; ${m.widths}; ${m.buttons} nút ≥ 44 px${event}`, fails });
}

/**
 * "Mở cửa" through the start-day guard (src/ui/openGuard.ts): with no staff
 * or no dish in stock (a new game, the event-day saves) the HUD asks first and
 * the day only opens after "Vẫn mở cửa". Waiting for the speed control
 * without that click timed out on every HUD-only and event-day run.
 */
async function openShop(page) {
  await page.locator('.hud [data-action="open"]').click();
  await page.waitForFunction(() => document.querySelector('.hud .speed:not([hidden]), .hud .hud-confirm [data-action="confirm"]'));
  const confirm = page.locator('.hud .hud-confirm [data-action="confirm"]');
  if (await confirm.count()) await confirm.click();
}

/** Sets 4x: the speed option where the group shows, else the phone's cycling button until it reads 4x. */
async function setSpeed4(page) {
  // Right after "Mở cửa" the HUD has not redrawn yet; the group and the
  // cycling button lose `hidden` together on the next frame.
  await page.locator('.hud .speed:not([hidden])').waitFor({ state: 'attached' });
  const option = page.locator('.hud .speed [data-speed="4"]');
  if (await option.isVisible()) return option.click();
  const cycle = page.locator('.hud [data-action="speed-cycle"]');
  for (let i = 0; i < 3; i++) {
    const now = await cycle.getAttribute('data-current');
    if (now === '4') return;
    await cycle.click();
    // The HUD redraws on the next frame.
    await page.locator(`.hud [data-action="speed-cycle"]:not([data-current="${now}"])`).waitFor();
  }
  throw new Error('the speed button did not reach 4x');
}

/** Rows the HUD may take: one on a wide screen, two from 1279 px down. */
const hudRows = (viewport) => (viewport.width >= 1280 ? 1 : 2);

/** New game on Easy up to the HUD of day 1. */
async function startDayOne(page) {
  await page.goto(URL_BASE);
  const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
  await newGame.waitFor();
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  await newGame.click();
  await page.locator('label.choice', { has: page.locator('input[value="easy"]') }).click();
  await page.getByRole('button', { name: 'Bắt đầu ngày 1', exact: true }).click();
  await page.locator('.hud [data-action="open"]').waitFor();
}

/** HUD before opening, with the camera menu open, and while open at 4x. */
async function checkHudPhases(page, results, viewport) {
  const size = `${viewport.width}×${viewport.height}`;
  await checkHud(page, results, size, 'HUD: chuẩn bị', hudRows(viewport));
  await page.locator('.hud [data-action="more"]').click();
  await checkHud(page, results, size, 'HUD: menu camera', hudRows(viewport));
  await page.keyboard.press('Escape');
  await page.locator('.hud-menu').waitFor({ state: 'hidden' });
}

/** Viewports where only the HUD is checked (no panels or day). */
const HUD_ONLY = [{ width: 1280, height: 800 }];

async function runHudOnly(browser, viewport, results) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ now, settings }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
    },
    { now: FIXED_NOW, settings: { musicVolume: 0, sfxVolume: 0, quality: 'low', gameSpeed: 1, cameraKeys: 'qe-wasd' } },
  );
  const page = await context.newPage();
  try {
    await startDayOne(page);
    await checkHudPhases(page, results, viewport);
    await openShop(page);
    await setSpeed4(page);
    await checkHud(page, results, `${viewport.width}×${viewport.height}`, 'HUD: mở cửa', hudRows(viewport));
  } finally {
    await context.close();
  }
}

/** Viewports of the event-day HUD check. */
const EVENT_DAY = [
  { width: 390, height: 844 },
  // At 390 px the nine-digit sum overlapped Điều khiển before opening; the
  // HUD now shows it compact ("109,6tr", formatMoneyShort).
  { width: 390, height: 844, late: true },
  // From 1024 px up with LATE_GAME values. Between the tablet grid and one
  // row: two rows (.is-stacked), never Điều khiển alone.
  { width: 1100, height: 800, late: true },
  { width: 1280, height: 800, late: true },
  // The event's name shows again from 1440 px (ui.css).
  { width: 1440, height: 900, late: true },
];
/** The event with the longest name (DAY_EVENT_LABELS "Tăng giá nhập"). */
const EVENT = 'supplier_hike';
/**
 * Late-game HUD values (T451 report: a nine-digit sum, Tem, Cấp 5 at
 * 2929/7000): at 1440 px they pushed Điều khiển to a second row.
 */
const LATE_GAME = { money: 109_582_093, tickets: 2, shopLevel: 5, xp: 14_929 };

/** This tree's sim, save code, retention (Tem) and staff (hire roles), loaded once through vite. */
const loadTree = () => loadSim(ROOT, { retention: '/src/sim/retention.ts', staff: '/src/sim/staff.ts' });

/**
 * Autosave of a new Easy game on the morning of day 1, its plan turned into
 * an EVENT day (day 1 is always the grand opening), with LATE_GAME values
 * when `late`, written by the sim and save code of this tree (`mods` of loadTree).
 */
function eventDaySave(mods, late) {
  const state = mods.stateMod.createNewGame('Quán Thử', 'easy', FIXED_NOW >>> 0);
  const today = state.week?.plan.find((p) => p.day === 1);
  if (!today) throw new Error('the new game has no week plan');
  today.event = EVENT;
  if (late) {
    state.money = LATE_GAME.money;
    state.shopLevel = LATE_GAME.shopLevel;
    state.xp = LATE_GAME.xp;
    mods.retention.ensureRetention(state).tickets = LATE_GAME.tickets;
  }
  return saveText(mods.save, state, FIXED_NOW);
}

/**
 * Autosave one tick before the Daily Report of day 1 of the game runViewport
 * starts (same name, difficulty and seed), with HIRES hired and the Kho
 * suggestion bought as the panels do it, the day run by the staff alone;
 * played by this tree's sim (playFirstDay) instead of waiting for the
 * browser's 4x day. The browser plays that last tick itself after Tiếp tục,
 * so the report, its autosave line and toasts come up the usual way.
 */
function firstDaySave(mods) {
  const state = playFirstDay(mods, { ...NEW_GAME, seed: FIXED_NOW >>> 0, hires: HIRES });
  const peek = structuredClone(state);
  mods.sim.step(peek, 1);
  const r = peek.lastReport;
  if (peek.phase !== 'report' || !r) throw new Error('day 1 does not end on the next tick');
  console.log(`day-1 save at ${clockOf(state.minute)}, one tick before the report: ${r.customersServed}/${r.customersArrived} khách, doanh thu ${r.revenue}, ${state.staff.length} nhân viên`);
  return saveText(mods.save, state, FIXED_NOW);
}

/** HUD of an EVENT day (from eventDaySave) before opening, with the menu and while open. */
async function runEventDay(browser, viewport, results, eventSave) {
  const size = `${viewport.width}×${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ now, settings, save }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
      localStorage.setItem(save.key, save.text);
    },
    { now: FIXED_NOW, settings: { musicVolume: 0, sfxVolume: 0, quality: 'low', gameSpeed: 1, cameraKeys: 'qe-wasd' }, save: eventSave },
  );
  const page = await context.newPage();
  try {
    await page.goto(URL_BASE);
    await page.locator('#boot').waitFor({ state: 'detached' });
    await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Tiếp tục/ }).click();
    await page.locator('.hud [data-action="open"]').waitFor();
    await page.locator('.hud [data-chip="event"]:not([hidden])').waitFor();
    const before = results.length;
    await checkHudPhases(page, results, viewport);
    await openShop(page);
    await setSpeed4(page);
    await checkHud(page, results, size, 'HUD: mở cửa', hudRows(viewport));
    for (const r of results.slice(before)) r.screen += viewport.late ? ' (ngày sự kiện, cuối game)' : ' (ngày sự kiện)';
  } finally {
    await context.close();
  }
}

const PANEL_FRAME = { frame: '#ui > .panel:not([hidden]) .panel-body', scrollers: ['#ui > .panel:not([hidden])', '#ui > .panel:not([hidden]) .panel-body'] };
const REPORT_FRAME = { frame: '.rpt-layer:not([hidden]) .rpt-dialog', scrollers: ['.rpt-layer:not([hidden])', '.rpt-layer:not([hidden]) .rpt-dialog', '.rpt-layer:not([hidden]) .rpt-body:not([hidden])'] };

async function openPanel(page, id) {
  await page.locator(`.dock [data-panel="${id}"]`).click();
  await page.locator(`.dock [data-panel="${id}"][aria-pressed="true"]`).waitFor();
  await page.locator('#ui > .panel:not([hidden]) .panel-body > *').first().waitFor();
}

/** Starts recording layout shifts in the page; takeShifts() returns and clears them. */
function watchShifts(page) {
  return page.evaluate(() => {
    window.__shifts = [];
    const describe = (n) => (n instanceof Element ? `${n.tagName.toLowerCase()}${[...n.classList].slice(0, 2).map((c) => `.${c}`).join('')}` : String(n?.nodeName ?? 'removed'));
    // A node gone by the time the entry is read is named by where it was.
    const where = (s) => {
      const r = s.previousRect;
      return s.node ? describe(s.node) : `removed@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    };
    window.__keepShifts = (entries) => {
      for (const e of entries) window.__shifts.push({ value: e.value, input: e.hadRecentInput, sources: e.sources.map(where) });
    };
    window.__shiftObserver = new PerformanceObserver((list) => window.__keepShifts(list.getEntries()));
    window.__shiftObserver.observe({ type: 'layout-shift' });
  });
}

async function takeShifts(page) {
  await settle(page);
  await sleep(300);
  return page.evaluate(() => {
    window.__keepShifts(window.__shiftObserver.takeRecords());
    return window.__shifts.splice(0);
  });
}

/**
 * Boxes of the Kho foot, its direct rows and the stock list, rounded to
 * 0.1 px; null without a foot. The list's height grows with the cost text,
 * so only its top and left edge count, measured in the scrolled content
 * (clicks scroll the body to their target; that is not a layout change).
 */
function footBoxes(page) {
  return page.evaluate(() => {
    const body = document.querySelector('#ui > .panel:not([hidden]) .panel-body');
    const foot = body?.querySelector('.prep > .panel-foot');
    const list = body?.querySelector('.prep > .stack');
    if (!foot || !list) return null;
    // A short body does not stick the foot (panels.css @container), so it
    // scrolls with the list: read it, like the list, in content coordinates.
    const scroll = getComputedStyle(foot).position === 'sticky' ? 0 : body.scrollTop;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return [r.top + scroll, r.height, r.left, r.width].map((v) => Math.round(v * 10) / 10);
    };
    const r = list.getBoundingClientRect();
    const at = (v) => Math.round(v * 10) / 10;
    return { foot: box(foot), rows: [...foot.children].map(box), list: [at(r.top + body.scrollTop), at(r.left)] };
  });
}

/** Largest difference between two footBoxes() readings, px. */
function footMoved(a, b) {
  const flat = (x) => [...x.foot, ...x.rows.flat(), ...x.list];
  const fa = flat(a);
  const fb = flat(b);
  if (fa.length !== fb.length) return Infinity;
  return Math.max(...fa.map((v, i) => Math.abs(v - fb[i])));
}

/**
 * Kho: + then − on the first stepper, Auto-restock, then a pack count past
 * the money. Fails on CLS (shifts with no recent input), on any move or
 * resize of the foot or its rows and on a move of the stock list; shifts
 * that follow the click are notes.
 */
async function checkKhoShift(page, results, viewport) {
  const stepper = page.locator('#ui > .panel:not([hidden]) .item .stepper').first();
  const steps = [
    ['+ 1 gói', () => stepper.locator('.step-btn').last().click()],
    ['− 1 gói', () => stepper.locator('.step-btn').first().click()],
    ['Gợi ý nhập tự động', () => page.locator('#ui > .panel:not([hidden]) [data-action="suggest"]').click()],
    [
      'Số gói vượt tiền',
      async () => {
        // Typed key by key: fill() inserts text with no key events, so the
        // centred digits moving inside the field counted as a shift without input.
        await stepper.locator('.step-input').selectText();
        await stepper.locator('.step-input').pressSequentially('99');
        // Clicking away commits the value (change event), as a player would.
        // A click always counts as recent input for layout shift; a Tab key press did not here.
        await page.locator('#ui > .panel:not([hidden]) .kho-note').click();
      },
    ],
  ];
  // Toasts close on a timer and are removed, which shifts the stack outside
  // the panel with no input; hidden here so only the Kho panel is scored.
  const hideToasts = await page.addStyleTag({ content: '#ui > .toasts { display: none !important; }' });
  await settle(page);
  await watchShifts(page);
  const start = await footBoxes(page);
  let cls = 0;
  let afterInput = 0;
  let moved = 0;
  const notes = [];
  for (const [name, act] of steps) {
    await act();
    const shifts = await takeShifts(page);
    const own = shifts.filter((s) => !s.input).reduce((a, s) => a + s.value, 0);
    const input = shifts.filter((s) => s.input).reduce((a, s) => a + s.value, 0);
    cls += own;
    afterInput += input;
    const now = await footBoxes(page);
    const d = start && now ? footMoved(start, now) : Infinity;
    moved = Math.max(moved, d);
    const from = (list) => {
      const names = [...new Set(list.flatMap((s) => s.sources))].join(', ');
      return names ? ` (${names})` : '';
    };
    notes.push(
      `${name}: CLS ${own.toFixed(6)}${from(shifts.filter((s) => !s.input))}, sau thao tác ${input.toFixed(4)}${from(shifts.filter((s) => s.input))}; foot/danh sách lệch ${d.toFixed(1)} px`,
    );
  }
  await hideToasts.evaluate((el) => el.remove());
  const short = await page.locator('#ui > .panel:not([hidden]) .foot-hint.reason-danger').count();
  const fails = [];
  if (cls > 0) fails.push(`CLS ${cls.toFixed(6)} > 0`);
  if (!start) fails.push('.panel-foot or .stack not found');
  else if (moved > EPS) fails.push(`the foot, one of its rows or the stock list moved by ${moved.toFixed(1)} px`);
  if (short === 0) fails.push('the over-budget step did not show the short-of-money hint');
  results.push({
    viewport,
    screen: 'Kho: đổi số gói',
    pass: fails.length === 0,
    detail: `CLS ${cls.toFixed(6)}; foot cao ${start ? start.foot[1].toFixed(1) : '?'} px; foot/danh sách lệch tối đa ${moved.toFixed(1)} px; shift ngay sau thao tác ${afterInput.toFixed(4)}`,
    fails,
    notes,
  });
}

/** One viewport: new game on Easy, six panels, the shop opened at 4x, then the day-1 report (`report` save) and its reviews tab. */
async function runViewport(browser, viewport, overflow, shift, report) {
  const size = `${viewport.width}×${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ now, settings }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
    },
    { now: FIXED_NOW, settings: { musicVolume: 0, sfxVolume: 0, quality: 'low', gameSpeed: 1, cameraKeys: 'qe-wasd' } },
  );
  const page = await context.newPage();
  try {
    await startDayOne(page);
    await checkHudPhases(page, overflow, viewport);

    for (const [id, label] of PANELS) {
      await openPanel(page, id);
      if (id === 'staff') {
        for (let i = 0; i < HIRES; i++) {
          await page.locator('#ui > .panel:not([hidden]) [data-action="hire"]').first().click();
          await sleep(300);
        }
      }
      if (id === 'inventory') await checkKhoShift(page, shift, size);
      await checkScreen(page, overflow, size, label, PANEL_FRAME);
      if (id === 'inventory') {
        // Buy the suggestion so the day sells and the report has every block.
        await page.locator('#ui > .panel:not([hidden]) [data-action="suggest"]').click();
        await page.locator('#ui > .panel:not([hidden]) [data-action="buy"]').click();
      }
    }
    await page.locator(`.dock [data-panel="${PANELS.at(-1)[0]}"]`).click();
    await page.locator('#ui > .panel').waitFor({ state: 'hidden' });

    await openShop(page);
    await setSpeed4(page);
    await checkHud(page, overflow, size, 'HUD: mở cửa', hudRows(viewport));
  } finally {
    await context.close();
  }
  // That day one tick before its end, played by the sim: after Tiếp tục the
  // browser ends it (dayEnded, autosave) and the Daily Report comes up with its numbers and the autosave line.
  const { context: rc, page: rp } = await resumeSave(browser, viewport, report, '.rpt-layer:not([hidden]) [data-block="money"]');
  try {
    await rp.waitForFunction(() => !document.querySelector('.rpt-layer:not([hidden]) [data-block="busy"]') && document.querySelector('.rpt-layer:not([hidden]) .rpt-save[role]'));
    await checkScreen(rp, overflow, size, 'Daily Report', REPORT_FRAME);
    await rp.locator('.rpt-layer:not([hidden]) [data-tab="reviews"]').click();
    await rp.locator('#rpt-reviews:not([hidden])').waitFor();
    await checkScreen(rp, overflow, size, 'Đánh giá', REPORT_FRAME);
  } finally {
    await rc.close();
  }
}

/** Viewports of the P25 checks: the four widths, 1280 at 720 px high for the level-up report. */
const P25_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];
/**
 * Menu row height limits at 390 px: a sellable row, a row with a status label
 * (P25 compact Menu). Room for a name and a "Giá … · lãi …%" line that wrap
 * whole instead of being cut.
 */
const MENU_ROW_MAX = { ok: 72, short: 96 };
const MENU_ROW_WIDTH = 390;

/**
 * Runs in the page: every shown button inside `root` smaller than `target`
 * on a side. A ::before with a size (the 44 px tap area of .badge-btn)
 * counts as part of the button.
 */
function smallButtons({ root, target, eps }) {
  const out = [];
  let count = 0;
  for (const b of document.querySelectorAll(`${root} button`)) {
    const r = b.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || getComputedStyle(b).visibility === 'hidden') continue;
    count++;
    const before = getComputedStyle(b, '::before');
    const extra = before.content !== 'none' && before.position === 'absolute';
    const w = Math.max(r.width, extra ? parseFloat(before.width) || 0 : 0);
    const h = Math.max(r.height, extra ? parseFloat(before.height) || 0 : 0);
    if (w < target - eps || h < target - eps) out.push(`button ${b.dataset.action ?? b.getAttribute('aria-label') ?? b.textContent.trim().slice(0, 24)} ${w.toFixed(1)}×${h.toFixed(1)} < ${target} px`);
  }
  return { out, count };
}

/**
 * Runs in the page: the name and meta line of each shown Menu row that is cut,
 * i.e. scrolls sideways (scrollWidth > clientWidth) or shows "…".
 */
function menuTextCut() {
  const out = [];
  let count = 0;
  for (const li of document.querySelectorAll('#ui > .panel:not([hidden]) li[data-item]')) {
    for (const el of li.querySelectorAll('.item-text > .item-title, .item-text > .item-meta')) {
      if (el.getClientRects().length === 0) continue;
      count++;
      const text = (el.textContent ?? '').trim();
      const kind = el.classList.contains('item-title') ? 'name' : 'meta';
      if (el.scrollWidth > el.clientWidth) out.push(`${li.dataset.item} ${kind} "${text}" scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      if (text.includes('…')) out.push(`${li.dataset.item} ${kind} "${text}" shows "…"`);
    }
  }
  return { out, count };
}

/** Morning save of day 3 (Nước cam opens, no Cam) and the report of the first level-up, from scripts/capture-p25.mjs. */
async function p25Saves() {
  const { playSaves } = await import('./capture-p25.mjs');
  const s = await playSaves(ROOT);
  return { morning: s.saves.morning, levelUp: s.saves.levelUp, levelUpDay: s.levelUpDay };
}

/** A page at `viewport` with `save` in the autosave slot, resumed from the Main Menu until `ready`. */
async function resumeSave(browser, viewport, save, ready) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ now, settings, save }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
      localStorage.setItem(save.key, save.text);
    },
    { now: FIXED_NOW, settings: { musicVolume: 0, sfxVolume: 0, quality: 'low', gameSpeed: 1, cameraKeys: 'qe-wasd' }, save },
  );
  const page = await context.newPage();
  await page.goto(URL_BASE);
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: /^Tiếp tục/ }).click();
  await page.locator(ready).first().waitFor();
  return { context, page };
}

/**
 * P25 compact Menu on the day-3 morning, after a click on the Nước cam
 * switch (no Cam in stock): no overflow, every button ≥ --size-target, no
 * name or meta line cut (menuTextCut), and at 390 px each row without a label
 * ≤ MENU_ROW_MAX.ok and each row with one ≤ MENU_ROW_MAX.short.
 */
async function checkMenuCompact(browser, viewport, save, results) {
  const size = `${viewport.width}×${viewport.height}`;
  const { context, page } = await resumeSave(browser, viewport, save, '.hud [data-action="open"]');
  try {
    await openPanel(page, 'menu');
    const sw = page.locator('#ui > .panel:not([hidden]) li[data-item="orange_juice"] .toggle');
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await page.locator('#ui > .panel:not([hidden]) li[data-item="orange_juice"] [data-lock="stock"]:not([hidden])').waitFor();
    await checkScreen(page, results, size, 'Menu gọn (Nước cam thiếu Cam)', PANEL_FRAME);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#ui > .panel:not([hidden]) li[data-item]')].map((li) => {
        const miss = li.querySelector('[data-lock="stock"]');
        const labelled = [...li.querySelectorAll('.item-status > *')].some((b) => !b.hidden);
        return { id: li.dataset.item, h: li.getBoundingClientRect().height, short: !!miss && !miss.hidden, labelled };
      }),
    );
    const target = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-target')) || 44);
    const small = await page.evaluate(smallButtons, { root: '#ui > .panel:not([hidden])', target, eps: EPS });
    const ok = rows.filter((r) => !r.labelled);
    const labelled = rows.filter((r) => r.labelled);
    const max = (list) => Math.max(0, ...list.map((r) => r.h));
    const fails = [...small.out];
    if (viewport.width === MENU_ROW_WIDTH) {
      for (const r of ok) if (r.h > MENU_ROW_MAX.ok + EPS) fails.push(`${r.id} row ${r.h.toFixed(1)} px > ${MENU_ROW_MAX.ok} px`);
      for (const r of labelled) if (r.h > MENU_ROW_MAX.short + EPS) fails.push(`${r.id} (with a label) row ${r.h.toFixed(1)} px > ${MENU_ROW_MAX.short} px`);
    }
    if (!rows.some((r) => r.short)) fails.push('no row shows a "Thiếu …" label');
    const limit = viewport.width === MENU_ROW_WIDTH ? ` (ngưỡng ${MENU_ROW_MAX.ok}/${MENU_ROW_MAX.short} px)` : '';
    results.push({
      viewport: size,
      screen: 'Menu gọn: cao dòng, nút',
      pass: fails.length === 0,
      detail: `${rows.length} dòng; không nhãn cao tối đa ${max(ok).toFixed(1)} px, có nhãn ${max(labelled).toFixed(1)} px${limit}; ${small.count} nút ≥ ${target} px`,
      fails,
    });
    const cut = await page.evaluate(menuTextCut);
    results.push({
      viewport: size,
      screen: 'Menu gọn: tên, giá không bị cắt',
      pass: cut.out.length === 0,
      detail: `${cut.count} dòng chữ, ${cut.out.length} bị cắt`,
      fails: cut.out,
    });
  } finally {
    await context.close();
  }
}

/**
 * P25 level-up report (card, unlock chips, confetti): no overflow, every
 * button ≥ --size-target, and at 1280×720 the summary tab fits without
 * scrolling.
 */
async function checkLevelUpReport(browser, viewport, save, day, results) {
  const size = `${viewport.width}×${viewport.height}`;
  const { context, page } = await resumeSave(browser, viewport, save, '.rpt-layer:not([hidden]) [data-block="level-up"]');
  try {
    await checkScreen(page, results, size, `Báo cáo ngày ${day} có thẻ lên cấp`, REPORT_FRAME);
    const target = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-target')) || 44);
    const small = await page.evaluate(smallButtons, { root: '.rpt-layer:not([hidden])', target, eps: EPS });
    const fold = await page.evaluate(() => {
      const over = (el) => (el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0);
      return over(document.querySelector('#rpt-summary')) + over(document.querySelector('.rpt-layer:not([hidden])')) + over(document.querySelector('.rpt-layer:not([hidden]) .rpt-dialog'));
    });
    const card = await page.evaluate(() => {
      const el = document.querySelector('.rpt-layer:not([hidden]) [data-block="level-up"]');
      return { h: Math.round(el.getBoundingClientRect().height), chips: el.querySelectorAll('.rpt-unlock').length };
    });
    const fails = [...small.out];
    const mustFit = viewport.width === 1280 && viewport.height === 720;
    if (mustFit && fold > 0) fails.push(`the summary scrolls ${fold} px at 1280×720`);
    results.push({
      viewport: size,
      screen: 'Thẻ lên cấp: vừa màn, nút',
      pass: fails.length === 0,
      detail: `thẻ cao ${card.h} px, ${card.chips} chip; ${fold > 0 ? `cuộn thêm ${fold} px` : 'vừa một màn'}${mustFit ? ' (phải vừa)' : ''}; ${small.count} nút ≥ ${target} px`,
      fails,
    });
  } finally {
    await context.close();
  }
}

/** Saves of scripts/capture-p27.mjs: GIFT_DAY morning (staff to train), 09:00 of that day (special order), top shop level (Tem prices). */
async function p27Saves() {
  const { playSaves } = await import('./capture-p27.mjs');
  const s = await playSaves(ROOT);
  return { morning: s.saves.morning, tasks: s.saves.tasks, shop: s.saves.shop };
}

/**
 * P27 panels: Việc with the gift card, the special order and the
 * achievements list opened; Nhân viên with the Đào tạo confirm open; Nâng cấp
 * with the Tem-priced furniture in view. Each must not overflow and every
 * button must be at least --size-target.
 */
async function checkP27Panels(browser, viewport, saves, results) {
  const size = `${viewport.width}×${viewport.height}`;
  const panel = '#ui > .panel:not([hidden])';
  const buttons = async (page, screen, extra) => {
    const target = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-target')) || 44);
    const small = await page.evaluate(smallButtons, { root: panel, target, eps: EPS });
    const fails = [...small.out, ...extra.fails];
    results.push({ viewport: size, screen, pass: fails.length === 0, detail: `${extra.detail}; ${small.count} nút ≥ ${target} px`, fails });
  };
  const needs = async (page, sels) => {
    const missing = await page.evaluate((list) => list.filter((s) => ![...document.querySelectorAll(s)].some((e) => e.checkVisibility())), sels);
    return missing.map((s) => `${s} not shown`);
  };
  {
    const { context, page } = await resumeSave(browser, viewport, saves.tasks, 'nav.dock');
    try {
      await openPanel(page, 'tasks');
      await page.locator(`${panel} [data-action="achievements"]`).click();
      await page.locator(`${panel} [data-achievement]`).first().waitFor();
      await checkScreen(page, results, size, 'Việc P27: quà, đơn đặc biệt, thành tựu', PANEL_FRAME);
      const fails = await needs(page, [`${panel} .gift`, `${panel} [data-special-order]`, `${panel} [data-achievement]`]);
      await buttons(page, 'Việc P27: nút', { fails, detail: 'thẻ quà, đơn đặc biệt, thành tựu sổ ra' });
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await resumeSave(browser, viewport, saves.morning, '.hud [data-action="open"]');
    try {
      await openPanel(page, 'staff');
      await page.locator(`${panel} [data-action="train"]`).first().click();
      await page.locator(`${panel} .item[data-staff] .confirm`).first().waitFor();
      await checkScreen(page, results, size, 'Nhân viên P27: đặc điểm, cấp, xác nhận Đào tạo', PANEL_FRAME);
      const fails = await needs(page, [`${panel} [data-trait]`, `${panel} .item[data-staff] [role="progressbar"]`, `${panel} .item[data-staff] .confirm`]);
      await buttons(page, 'Nhân viên P27: nút', { fails, detail: 'chip đặc điểm, thanh KN, xác nhận Đào tạo mở' });
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await resumeSave(browser, viewport, saves.shop, '.hud [data-action="open"]');
    try {
      await openPanel(page, 'upgrades');
      await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), `${panel} li[data-upgrade="record_player"]`);
      await checkScreen(page, results, size, 'Nâng cấp P27: giá Tem', PANEL_FRAME);
      const tem = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => /\d+ Tem/.test(e.textContent ?? '')).length, `${panel} li[data-upgrade] .item-meta`);
      await buttons(page, 'Nâng cấp P27: nút', { fails: tem >= 2 ? [] : [`${tem} rows priced in Tem, want ≥ 2`], detail: `${tem} dòng giá có Tem` });
    } finally {
      await context.close();
    }
  }
}

function printTable(title, rows) {
  console.log(`\n### ${title}\n\n| Khổ | Màn | Kết quả | Chi tiết |\n| --- | --- | --- | --- |`);
  for (const r of rows) console.log(`| ${r.viewport} | ${r.screen} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`);
  for (const r of rows.filter((x) => !x.pass || x.notes?.length)) {
    console.log(`\n${r.pass ? '' : 'FAIL '}${r.viewport} ${r.screen}:`);
    for (const f of r.fails.slice(0, SHOW)) console.log(`- ${f}`);
    if (r.fails.length > SHOW) console.log(`- … ${r.fails.length - SHOW} more`);
    for (const n of r.notes ?? []) console.log(`  - ${n}`);
  }
}

async function main() {
  // One Chrome on the GPU at a time: wait for a running measurement, and keep one from starting while this runs.
  const only = process.env.LAYOUT_ONLY?.split(',');
  const lock = await acquirePerfLock(ROOT, { label: `check-layout${only ? ` LAYOUT_ONLY=${only.join(',')}` : ''}` });
  const server = await startPreview();
  const browser = OFFLINE ? offlineBrowser() : await launchBrowser({ headless: process.env.LAYOUT_HEADED !== '1' });
  const overflow = [];
  const shift = [];
  // LAYOUT_ONLY=day,hud,event,p25,p27 runs some parts only (all by default); LAYOUT_DAY_WIDTHS=390 narrows the day runs.
  const part = (name) => !only || only.includes(name);
  const dayWidths = process.env.LAYOUT_DAY_WIDTHS?.split(',').map(Number);
  try {
    const mods = part('day') || part('event') ? await loadTree() : null;
    const report = part('day') ? firstDaySave(mods) : null;
    for (const viewport of part('day') ? VIEWPORTS.filter((v) => !dayWidths || dayWidths.includes(v.width)) : []) {
      const size = `${viewport.width}×${viewport.height}`;
      const t0 = Date.now();
      try {
        await runViewport(browser, viewport, overflow, shift, report);
        console.log(`${size} done in ${Math.round((Date.now() - t0) / 1000)} s`);
      } catch (err) {
        // The screens measured so far keep their rows; the run still fails.
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'chạy kịch bản', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    for (const viewport of part('hud') ? HUD_ONLY : []) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await runHudOnly(browser, viewport, overflow);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'HUD', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    const eventSaves = part('event') ? { start: eventDaySave(mods, false), late: eventDaySave(mods, true) } : null;
    for (const viewport of part('event') ? EVENT_DAY : []) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await runEventDay(browser, viewport, overflow, viewport.late ? eventSaves.late : eventSaves.start);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'HUD (ngày sự kiện)', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    const p25 = part('p25') ? await p25Saves() : null;
    for (const viewport of part('p25') ? P25_VIEWPORTS : []) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await checkMenuCompact(browser, viewport, p25.morning, overflow);
        await checkLevelUpReport(browser, viewport, p25.levelUp, p25.levelUpDay, overflow);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'P25: Menu gọn, thẻ lên cấp', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    const p27 = part('p27') ? await p27Saves() : null;
    for (const viewport of part('p27') ? P25_VIEWPORTS : []) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await checkP27Panels(browser, viewport, p27, overflow);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'P27: Việc, Nhân viên, Nâng cấp', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
  } finally {
    await browser.close();
    server?.kill();
    lock.release();
  }
  printTable('Tràn ngang', overflow);
  printTable('CLS bảng Kho', shift);
  const failed = [...overflow, ...shift].filter((r) => !r.pass).length;
  console.log(`\n${failed === 0 ? 'PASS' : `FAIL: ${failed}`} / ${overflow.length + shift.length} checks`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
