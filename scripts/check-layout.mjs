// Checks the panels and the Daily Report for sideways overflow, and the Kho
// panel for layout shift, on the production build in headless Chromium.
// Run through `npm run layout` (builds first). Needs Playwright with Chromium.
//
// For each viewport: a new game, the six dock panels in order, a whole day at
// 4x, then the Daily Report and its Đánh giá tab. On every screen the scroll
// boxes must not scroll sideways (scrollWidth <= clientWidth) and no element
// may stick out of the left or right edge of the panel or report card. In the
// Kho panel a layout-shift observer runs while the stepper, Auto-restock and
// an over-budget pack count change the order: CLS (shifts without recent
// input, as web-vitals counts it) must be 0, the foot and its rows (totals,
// buy button, hint) must keep their place and size, and the stock list must
// not move. Shifts that follow a click
// are listed per step as notes. Prints PASS/FAIL tables; exits 1 on any FAIL.
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
  const seen = new Set();
  const checkScroll = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.scrollWidth > el.clientWidth) wide.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
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
  return { wide, outside, checked, scrollChecked };
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
    detail: m.error ?? `${m.scrollChecked} scroll box, ${m.checked} phần tử; ${m.wide.length} tràn scroll, ${m.outside.length} lệch khung`,
    fails,
  });
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
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return [r.top, r.height, r.left, r.width].map((v) => Math.round(v * 10) / 10);
    };
    const [top, , left] = box(list);
    return { foot: box(foot), rows: [...foot.children].map(box), list: [Math.round((top + body.scrollTop) * 10) / 10, left] };
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
    await page.goto(URL_BASE);
    const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
    await newGame.waitFor();
    await page.locator('#boot').waitFor({ state: 'detached' });
    await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
    await newGame.click();
    await page.locator('label.choice', { has: page.locator('input[value="easy"]') }).click();
    await page.getByRole('button', { name: 'Bắt đầu ngày 1', exact: true }).click();
    await page.locator('.hud [data-action="open"]').waitFor();

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
    await page.locator('[data-speed="4"]').click();
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
