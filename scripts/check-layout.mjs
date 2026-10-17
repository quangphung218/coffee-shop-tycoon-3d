// Checks the panels and the Daily Report for sideways overflow, and the Kho
// panel for layout shift, on the production build in headless Chromium.
// Run through `npm run layout` (builds first). Needs Playwright with Chromium.
//
// For each viewport: a new game, the six dock panels in order, a whole day at
// 4x, then the Daily Report and its Đánh giá tab. On every screen the scroll
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
// overlapping, content inside each frame, one row from 1280 px up and at
// most two below, every button at least --size-target (44 px) and, while
// open, each speed button with an icon and an aria-label (1280×800 runs
// this HUD check only). The same HUD check runs again at 390, 1280 and 1440 px on
// a day with an event ("Tăng giá nhập"), from a save written by this tree's
// sim with the day-1 event swapped.
// P25, at 390×844, 768×1024, 1280×720 and 1440×900, from saves of
// scripts/capture-p25.mjs: the compact Menu on the day-3 morning after a
// click on the Nước cam switch (no Cam), and the Daily Report of the first
// level-up. Both must not overflow and every button must be at least
// --size-target (a positioned ::before counts as tap area); at 390 px a
// Menu row with no label must be at most 72 px and a row with a label
// ("Thiếu …", "Mở …", "Mới") 96 px; at every width no Menu name or meta line
// may be cut (scrollWidth > clientWidth or "…"); at 1280×720 the level-up
// report must fit without scrolling.
// Prints PASS/FAIL tables; exits 1 on any FAIL.
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
/** A 4x day lasts about 2 minutes with a fast renderer; software WebGL is slower. */
const DAY_TIMEOUT_MS = 8 * 60_000;
/** Sub-pixel slack for box edges and the foot height, CSS px. */
const EPS = 0.5;
/** Elements listed per failing check. */
const SHOW = 6;

async function startPreview() {
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
  const event = m.event ? `; sự kiện ${m.event}` : '';
  results.push({ viewport, screen, pass: fails.length === 0, detail: `${m.rows} hàng, cao ${m.height} px; ${m.widths}; ${m.buttons} nút ≥ 44 px${event}`, fails });
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
    await page.locator('.hud [data-action="open"]').click();
    await setSpeed4(page);
    await checkHud(page, results, `${viewport.width}×${viewport.height}`, 'HUD: mở cửa', hudRows(viewport));
  } finally {
    await context.close();
  }
}

/** Viewports of the event-day HUD check. */
const EVENT_DAY = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  // The event's name shows again from 1440 px (ui.css).
  { width: 1440, height: 900 },
];
/** The event with the longest name (DAY_EVENT_LABELS "Tăng giá nhập"). */
const EVENT = 'supplier_hike';

/**
 * Autosave of a new Easy game on the morning of day 1, its plan turned into
 * an EVENT day (day 1 is always the grand opening), written by the sim and
 * save code of this tree.
 */
async function eventDaySave() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, save] = await Promise.all(['/src/sim/state.ts', '/src/save/save.ts'].map((p) => vite.ssrLoadModule(p)));
    const state = stateMod.createNewGame('Quán Thử', 'easy', FIXED_NOW >>> 0);
    const today = state.week?.plan.find((p) => p.day === 1);
    if (!today) throw new Error('the new game has no week plan');
    today.event = EVENT;
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
    const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
    if (!r.ok) throw new Error(`cannot write the event-day save: ${r.error.message}`);
    const key = save.saveKey('auto');
    return { key, text: data.get(key) };
  } finally {
    await vite.close();
  }
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
    await page.locator('.hud [data-action="open"]').click();
    await setSpeed4(page);
    await checkHud(page, results, size, 'HUD: mở cửa', hudRows(viewport));
    for (const r of results.slice(before)) r.screen += ' (ngày sự kiện)';
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

/** One viewport: new game on Easy, six panels, the day at 4x, the report and its reviews tab. */
async function runViewport(browser, viewport, overflow, shift) {
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

    await page.locator('.hud [data-action="open"]').click();
    await setSpeed4(page);
    await checkHud(page, overflow, size, 'HUD: mở cửa', hudRows(viewport));
    await page.waitForFunction(
      () => document.querySelector('.rpt-layer:not([hidden]) [data-block="money"]') && !document.querySelector('.rpt-layer:not([hidden]) [data-block="busy"]'),
      null,
      { timeout: DAY_TIMEOUT_MS },
    );
    await checkScreen(page, overflow, size, 'Daily Report', REPORT_FRAME);
    await page.locator('.rpt-layer:not([hidden]) [data-tab="reviews"]').click();
    await page.locator('#rpt-reviews:not([hidden])').waitFor();
    await checkScreen(page, overflow, size, 'Đánh giá', REPORT_FRAME);
  } finally {
    await context.close();
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
  const server = await startPreview();
  const browser = await chromium.launch({
    headless: process.env.LAYOUT_HEADED !== '1',
    // Lets WebGL fall back to software rendering when headless Chromium has no GPU.
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const overflow = [];
  const shift = [];
  try {
    for (const viewport of VIEWPORTS) {
      const size = `${viewport.width}×${viewport.height}`;
      const t0 = Date.now();
      try {
        await runViewport(browser, viewport, overflow, shift);
        console.log(`${size} done in ${Math.round((Date.now() - t0) / 1000)} s`);
      } catch (err) {
        // The screens measured so far keep their rows; the run still fails.
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'chạy kịch bản', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    for (const viewport of HUD_ONLY) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await runHudOnly(browser, viewport, overflow);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'HUD', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    const eventSave = await eventDaySave();
    for (const viewport of EVENT_DAY) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await runEventDay(browser, viewport, overflow, eventSave);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'HUD (ngày sự kiện)', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
    const p25 = await p25Saves();
    for (const viewport of P25_VIEWPORTS) {
      const size = `${viewport.width}×${viewport.height}`;
      try {
        await checkMenuCompact(browser, viewport, p25.morning, overflow);
        await checkLevelUpReport(browser, viewport, p25.levelUp, p25.levelUpDay, overflow);
      } catch (err) {
        console.error(`${size}: ${err.stack ?? err}`);
        overflow.push({ viewport: size, screen: 'P25: Menu gọn, thẻ lên cấp', pass: false, detail: 'dừng giữa chừng', fails: [String(err.message ?? err).split('\n')[0]] });
      }
    }
  } finally {
    await browser.close();
    server.kill();
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
