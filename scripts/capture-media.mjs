// Captures the README screenshots and demo clip from the production build,
// and the P18/P19 before/after boards. Run through `npm run media` (builds
// first). Needs Playwright with Chromium, ffmpeg and the git history back to
// P18_COMMIT; see docs/media.md.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs', 'media');
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The P18 build is served on the next port. */
const P18_PORT = PORT + 1;
const urlFor = (port) => `http://127.0.0.1:${port}/`;
const URL_BASE = urlFor(PORT);
/** Date.now() inside the page is frozen at this value, so New Game always gets the same seed. */
const FIXED_NOW = Number(process.env.MEDIA_SEED ?? 1760400000000);
const VIEWPORT = { width: 1280, height: 720 };
/** Phone screen of the Kho boards (the 390 px of the P19 layout check). */
const PHONE = { width: 390, height: 844 };
/** Settings stored before each page loads. */
const SETTINGS = { musicVolume: 0, sfxVolume: 0, quality: 'high', gameSpeed: 1, cameraKeys: 'qe-wasd' };
/** README limit per file. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Length of the sped-up day in the clip, seconds. */
const DAY_CLIP_S = 12;
/** Real-time lead-in before "Mở cửa" and hold on the Daily Report, seconds. */
const INTRO_S = 1.5;
const REPORT_HOLD_S = 3.5;
/**
 * Real-time part of the clip at the lunch peak: 1x, close on the counter, a
 * drag across the view released mid-swing so the camera coasts to a stop,
 * then people walking and rounding corners. Pixels and ms.
 */
const SPIN_LEAD_MS = 800;
const SPIN_DRAG_PX = 260;
const SPIN_DRAG_MS = 450;
const SPIN_STEPS = 18;
const SPIN_HOLD_MS = 3000;
/** Packs added on top of the Auto-restock suggestion, by ingredient name in the Kho panel. */
const EXTRA_PACKS = [
  ['Cà phê hạt', 3],
  ['Sữa tươi', 3],
  ['Chanh', 4],
  ['Trà', 1],
  ['Ly', 3],
];
/** Wheel delta for a ~1.25x zoom (camera zoom = exp(-deltaY * 0.0015)). */
const ZOOM_WHEEL = -150;
/** ~1.6x: the counter and the line fill the frame. */
const QUEUE_WHEEL = -320;
/** ~1.8x on the shop front. */
const FACADE_WHEEL = -400;
/**
 * Holding A+S pans straight toward the street (+z) at 12 / zoom units per
 * second; this long moves the view from the middle of the floor to the door.
 */
const FACADE_PAN_MS = 800;
/**
 * Game clock (HUD text) for the shop-front shots. The morning shot frames the
 * front at 10:00. For the day/evening pair the camera frames the front once from
 * 15:00, the shot landing near 15:30 with the lamps off, and stays there; at 19:30 the lamps are full
 * (street/layout.ts) and the game drops to 1x, so the evening shots land at
 * about 19:31-19:40, before the 20:00 close.
 */
const FACADE_DAY_AT = '10:00';
const FACADE_PAIR_DAY_AT = '15:00';
const FACADE_EVENING_AT = '19:30';
const FACADE_EVENING_END = '20:00';
/** Real time between the two evening frames; glow is what stays lit while people move. */
const GLOW_RECHECK_MS = 2000;
/** The HUD, dock and toasts are hidden in the frames the glow pair is built from. */
const HIDE_UI = '.hud-layer, .toasts { display: none !important; }';
/** Toasts would cover the shop and the panels in still images; the clip keeps them. */
const HIDE_TOASTS = '.toasts { display: none !important; }';
/**
 * Since v0.4.0 only .settings-body scrolls inside a sheet capped at the
 * window; while the Cài đặt form is shot it grows to its full height instead.
 * Builds without .settings-body match nothing here.
 */
const SETTINGS_UNCLIP = `
  .settings-sheet { max-height: none !important; }
  .settings-body { flex: none !important; max-height: none !important; overflow: visible !important; }
  .ui-screen.is-sheet { overflow: auto !important; }
`;
/** A 4x day lasts about 2 minutes with a fast renderer; software WebGL is slower. */
const DAY_TIMEOUT_MS = 8 * 60_000;
/** Commit of the P18 build and screenshots the P19 boards compare against (git archive, git show). */
const P18_COMMIT = 'd643d89';
/** Kho at open hours: staff hired, then the day runs at 4x to this clock with the starting stock. */
const KHO_HIRES = 2;
const KHO_OPEN_AT = '10:00';
/** Two chairs closer than this, side to side, leave no way between them (world units, metres). */
const NO_WAY = 0.5;
/** A gap this wide between two tables' chairs is an aisle. */
const AISLE = 1;
/** Height of a table with its chairs, for the rings. */
const TABLE_TOP = 0.9;
/** The aisle strip stops this far inside the front wall (world units). */
const FRONT_CLEAR = 0.3;
/** Most board width, px; frames are cropped to their rings and enlarged to fill it. */
const BOARD_WIDTH = 1900;
/**
 * Width of the strip ringed at the body's right edge for the scrollbar.
 * Chromium on macOS draws overlay scrollbars with no gutter, so it is not measured.
 */
const SCROLL_STRIP = 14;
/** GIF tries, largest first, until one fits under MAX_BYTES. */
const GIF_TRIES = [
  { width: 720, fps: 12 },
  { width: 640, fps: 10 },
  { width: 560, fps: 8 },
];

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

function sizeMb(path) {
  return statSync(path).size / 1024 / 1024;
}

/** Serves the build in `root`/dist with `vite preview` on `port`. */
async function startPreview(root, port) {
  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited (port ${port} busy?)`);
    try {
      if ((await fetch(urlFor(port))).ok) return server;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  server.kill();
  throw new Error('vite preview did not start');
}

/** Exports `ref` into a temp dir sharing this checkout's node_modules and builds it there. */
function buildRef(ref) {
  // macOS tmpdir() is under the /var -> /private/var symlink; vite needs the real path.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cst3d-media-ref-')));
  const tar = spawnSync('git', ['archive', '--format=tar', ref], { cwd: ROOT, maxBuffer: 1 << 30 });
  if (tar.status !== 0) throw new Error(`git archive ${ref} failed (shallow clone?): ${tar.stderr}`);
  const file = join(dir, 'src.tar');
  writeFileSync(file, tar.stdout);
  const x = spawnSync('tar', ['-xf', file, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar failed: ${x.stderr}`);
  rmSync(file);
  symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(dir, 'node_modules'));
  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const b = spawnSync(vite, ['build', '--logLevel', 'warn'], { cwd: dir, stdio: 'inherit' });
  if (b.status !== 0) throw new Error(`vite build of ${ref} failed`);
  return dir;
}

/** Waits until the HUD clock reads `hhmm` or later. */
function clockAt(page, hhmm) {
  return page.waitForFunction(
    (t) => {
      const clock = document.querySelectorAll('.hud .hud-stat b')[1]?.textContent ?? '';
      return clock >= t;
    },
    hhmm,
    { timeout: DAY_TIMEOUT_MS },
  );
}

/** HUD clock text, e.g. '19:32'. */
function clockText(page) {
  return page.evaluate(() => document.querySelectorAll('.hud .hud-stat b')[1]?.textContent ?? '');
}

/** Home resets the camera (smoothly); then zoom in by `wheel` around the middle of the view. */
async function cameraHome(page, wheel) {
  await page.keyboard.press('Home');
  await sleep(700);
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2 + 40);
  await page.mouse.wheel(0, wheel);
  await sleep(700);
}

/** Close-up of the door, awning and sign from the default angle. */
async function cameraFacade(page) {
  await cameraHome(page, FACADE_WHEEL);
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyS');
  await sleep(FACADE_PAN_MS);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('KeyA');
  await sleep(1000);
}

/** Drags across the middle of the view and lets go mid-swing, so the camera keeps turning and slows to a stop. */
async function dragSpin(page) {
  const x = VIEWPORT.width / 2 - SPIN_DRAG_PX / 2;
  const y = VIEWPORT.height / 2 + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= SPIN_STEPS; i++) {
    await page.mouse.move(x + (SPIN_DRAG_PX * i) / SPIN_STEPS, y);
    await sleep(SPIN_DRAG_MS / SPIN_STEPS);
  }
  await page.mouse.up();
}

/**
 * Runs in the page before its scripts. three.js announces each WebGLRenderer
 * to window.__THREE_DEVTOOLS__; the one drawing #scene gets its render()
 * wrapped so the last scene and camera drawn are kept for sceneSnapshot().
 */
function observeThree() {
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    // After the constructor has finished setting up render().
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        return render.call(this, scene, camera);
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/** A browser context whose pages get the fixed clock and SETTINGS. */
async function newContext(browser, options) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  await context.addInitScript(
    ({ now, settings }) => {
      Date.now = () => now;
      localStorage.setItem('cst3d:settings', JSON.stringify(settings));
    },
    { now: FIXED_NOW, settings: SETTINGS },
  );
  return context;
}

/**
 * Stops the page's frame loop after its next frame, so a screenshot and the
 * positions read with it show the same instant. thaw() starts it again.
 */
function freeze(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const raf = window.requestAnimationFrame;
        const held = [];
        window.__mediaThaw = () => {
          window.requestAnimationFrame = raf;
          for (const cb of held.splice(0)) raf.call(window, cb);
        };
        window.requestAnimationFrame = (cb) => {
          held.push(cb);
          return 0;
        };
        const t0 = performance.now();
        const wait = () => (held.length > 0 || performance.now() - t0 > 3000 ? setTimeout(resolve, 100) : setTimeout(wait, 20));
        wait();
      }),
  );
}

/**
 * Runs in the page. Height the window needs so the whole visible Cài đặt form
 * is on screen: the form plus its layer's padding, and whatever its scrolling
 * parents or inner scroll areas still hide.
 */
function settingsFitHeight() {
  const form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
  if (!form) return 0;
  let extra = 0;
  for (let e = form; e; e = e.parentElement) extra = Math.max(extra, e.scrollHeight - e.clientHeight);
  for (const e of form.querySelectorAll('*')) if (getComputedStyle(e).overflowY !== 'visible') extra = Math.max(extra, e.scrollHeight - e.clientHeight);
  const fit = Math.ceil(document.documentElement.clientHeight + extra);
  const layer = form.parentElement;
  const cs = layer ? getComputedStyle(layer) : null;
  const pad = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0;
  return Math.max(fit, Math.ceil(form.getBoundingClientRect().height + pad));
}

/**
 * Shoots the Cài đặt `form` (a locator) whole at `width`: lifts the sheet's
 * inner scroll (SETTINGS_UNCLIP), grows the window from `minHeight` until
 * the form fits, takes the shot and runs `measure()` (boxes, texts) in that
 * same layout, then takes the style off again. The window keeps its size.
 * Returns { png, height, ...measure() }.
 */
async function captureSettingsForm(page, form, { width, minHeight, measure }) {
  const style = await page.addStyleTag({ content: SETTINGS_UNCLIP });
  try {
    await page.setViewportSize({ width, height: minHeight });
    await sleep(200);
    let height = minHeight;
    // The form can reflow once the window grows (layer padding, centring); settle in a few steps.
    for (let i = 0; i < 3; i++) {
      const need = await page.evaluate(settingsFitHeight);
      if (need <= height) break;
      height = need;
      await page.setViewportSize({ width, height });
      await sleep(200);
    }
    await sleep(100);
    const png = await form.screenshot();
    return { png, height, ...(await measure()) };
  } finally {
    await style.evaluate((el) => el.remove());
  }
}

function thaw(page) {
  return page.evaluate(() => window.__mediaThaw?.());
}

/** Camera matrices of the last frame of #scene and the feet of everyone drawn in it. */
async function sceneSnapshot(page) {
  const snap = await page.evaluate(() => {
    const camera = window.__mediaCamera;
    const scene = window.__mediaScene;
    if (!camera || !scene) return null;
    const r = document.getElementById('scene').getBoundingClientRect();
    const people = [];
    for (const o of scene.getObjectByName('actors')?.children ?? []) {
      if (o.visible && o.name !== 'coins') people.push({ x: o.position.x, z: o.position.z });
    }
    return {
      view: Array.from(camera.matrixWorldInverse.elements),
      proj: Array.from(camera.projectionMatrix.elements),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      people,
    };
  });
  if (!snap) throw new Error('no three.js camera seen on #scene (window.__THREE_DEVTOOLS__ hook)');
  return snap;
}

/** Screen position (CSS px) of world point (x, y, z) through the snapshot's camera. */
function project(snap, x, y, z) {
  const v = snap.view;
  const p = snap.proj;
  const e = [0, 1, 2, 3].map((r) => v[r] * x + v[4 + r] * y + v[8 + r] * z + v[12 + r]);
  const c = [0, 1, 3].map((r) => p[r] * e[0] + p[4 + r] * e[1] + p[8 + r] * e[2] + p[12 + r] * e[3]);
  return { x: snap.rect.x + ((c[0] / c[2] + 1) / 2) * snap.rect.w, y: snap.rect.y + ((1 - c[1] / c[2]) / 2) * snap.rect.h };
}

/** Screen box around world points [x, y, z], or null when it is off screen. */
function worldBox(snap, points, pad = 4) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, z] of points) {
    const s = project(snap, x, y, z);
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
  }
  const box = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  const { x, y, w, h } = snap.rect;
  return box.x < x + w && box.x + box.w > x && box.y < y + h && box.y + box.h > y ? box : null;
}

/** World box corners: x0..x1, y0..y1, z0..z1. */
function cuboid(x0, x1, y0, y1, z0, z1) {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
}

/** Freezes the frame loop, takes `shoot()` and reads the camera and people of that frame. */
async function measured(page, shoot) {
  await freeze(page);
  try {
    await shoot();
    return { scene: await sceneSnapshot(page) };
  } finally {
    await thaw(page);
  }
}

/** Loads `url` and waits for the Main Menu with the 3D scene behind it. Returns the "Ván mới" button. */
async function openMenu(page, url) {
  await page.goto(url);
  const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
  await newGame.waitFor();
  // The menu comes up before the 3D scene; wait for the loading screen to go and the scene to fade in.
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  return newGame;
}

/** From the Main Menu: New Game on Easy, into the day-1 preparation. */
async function startEasyDay(page, newGame) {
  await newGame.click();
  await page.locator('label.choice', { has: page.locator('input[value="easy"]') }).click();
  await page.getByRole('button', { name: 'Bắt đầu ngày 1', exact: true }).click();
  await page.locator('[data-action="open"]').waitFor();
}

/** Plays day 1 on Easy with three hires, taking the screenshots. Returns clip timestamps in seconds. */
async function playDay(page, videoStart) {
  const at = () => (Date.now() - videoStart) / 1000;
  const shot = (name) => page.screenshot({ path: join(OUT, name), style: HIDE_TOASTS });

  const newGame = await openMenu(page, URL_BASE);
  // The menu backdrop is a busy lunchtime shop; give the first customers time to walk in.
  await sleep(4000);
  await shot('main-menu.png');

  await startEasyDay(page, newGame);

  // Panels open and close from the dock at the bottom centre. The Menu panel
  // shows a 3D atlas icon on every drink.
  await page.locator('.dock [data-panel="menu"]').click();
  await sleep(800);
  await shot('menu-icons.png');
  await page.locator('.dock [data-panel="staff"]').click();
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-action="hire"]').first().click();
    await sleep(300);
  }
  // Stock up so the day ends with served customers rather than "Hết món" reviews.
  await page.locator('.dock [data-panel="inventory"]').click();
  await page.locator('[data-action="suggest"]').click();
  for (const [name, packs] of EXTRA_PACKS) {
    for (let i = 0; i < packs; i++) await page.getByRole('button', { name: `Thêm 1 gói ${name}`, exact: true }).click();
  }
  await sleep(800);
  await shot('prep-inventory.png');
  await page.locator('[data-action="buy"]').click();
  await page.locator('.dock [data-panel="inventory"]').click();
  // Closer camera so customers and staff are readable in the clip.
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2 + 40);
  await page.mouse.wheel(0, ZOOM_WHEEL);
  await sleep(INTRO_S * 1000);

  const openAt = at() - INTRO_S;
  await page.locator('[data-action="open"]').click();
  await page.locator('[data-speed="4"]').click();

  // Mid-morning sun on the awning, sign and door.
  await clockAt(page, FACADE_DAY_AT);
  await cameraFacade(page);
  await shot('facade-day.png');
  await cameraHome(page, ZOOM_WHEEL);

  await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, {
    timeout: DAY_TIMEOUT_MS,
  });
  // About an hour of game time into the lunch peak, when the queue is longest.
  // The frame is measured as it is taken (camera, people) for the peak board.
  await clockAt(page, '12:00');
  const peak = await measured(page, () => shot('peak.png'));
  // Closer on the counter: the line follows the free aisle between the tables.
  await cameraHome(page, QUEUE_WHEEL);
  await shot('queue.png');

  // Real time in the clip: the camera coasts after a drag while people walk and round their corners.
  await page.locator('[data-speed="1"]').click();
  const spinAt = at();
  await sleep(SPIN_LEAD_MS);
  await dragSpin(page);
  await sleep(SPIN_HOLD_MS);
  const spinEnd = at();
  await page.locator('[data-speed="4"]').click();
  await cameraHome(page, ZOOM_WHEEL);

  // Day/evening pair from one framing: late afternoon with the lamps off,
  // then full lamps with warm windows, door glass, sign and pendant lamps.
  await clockAt(page, FACADE_PAIR_DAY_AT);
  await cameraFacade(page);
  await page.locator('#scene.is-ready').waitFor();
  const glow = { dayClock: await clockText(page), day: await page.screenshot({ style: HIDE_UI }) };
  await clockAt(page, FACADE_EVENING_AT);
  await page.locator('[data-speed="1"]').click();
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2 + 40);
  await page.locator('#scene.is-ready').waitFor();
  await sleep(500);
  glow.eveningClock = await clockText(page);
  await shot('facade-evening.png');
  glow.evening = await page.screenshot({ style: HIDE_UI });
  await sleep(GLOW_RECHECK_MS);
  glow.eveningLater = await page.screenshot({ style: HIDE_UI });
  if (glow.eveningClock < FACADE_EVENING_AT || glow.eveningClock >= FACADE_EVENING_END) {
    throw new Error(`evening shot at ${glow.eveningClock}, outside ${FACADE_EVENING_AT}-${FACADE_EVENING_END}`);
  }
  await page.locator('[data-speed="4"]').click();
  await cameraHome(page, ZOOM_WHEEL);

  const report = page.locator('.rpt-layer:not([hidden])');
  await report.waitFor({ timeout: DAY_TIMEOUT_MS });
  const reportAt = at();
  await sleep(1500);
  // Focus lands on "Ngày tiếp theo" at the bottom; show the profit summary instead.
  await page.evaluate(() => document.querySelectorAll('.rpt-layer, .rpt-layer *').forEach((el) => (el.scrollTop = 0)));
  await shot('daily-report.png');
  await sleep((REPORT_HOLD_S - 1.5) * 1000);
  const endAt = at();

  await page.locator('[data-tab="reviews"]').click();
  await sleep(600);
  await shot('reviews.png');
  return { times: { openAt, spinAt, spinEnd, reportAt, endAt }, glow, peak };
}

/**
 * Runs in the page. Boxes (viewport CSS px, not clipped) of the open panel's
 * body and its scrollbar, the Kho parts the boards ring, every stock row with
 * its badge, and the Kho dock button with its count. Works on the P18 and the
 * P19 markup (P18 .intro and a hidden reason line; P19 .kho-note and .foot-hint).
 */
function khoDom() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const body = document.querySelector('#ui > .panel:not([hidden]) .panel-body');
  if (!body) return null;
  const cs = getComputedStyle(body);
  const b = body.getBoundingClientRect();
  const left = b.left + body.clientLeft;
  const bar = body.offsetWidth - body.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
  const level = (badge) => (badge?.classList.contains('badge-ok') ? 'ok' : badge?.classList.contains('badge-danger') ? 'out' : 'low');
  const dockBadge = document.querySelector('.dock [data-panel="inventory"] .dock-badge');
  return {
    panel: rect(document.querySelector('#ui > .panel:not([hidden])')),
    body: rect(body),
    inner: { left, right: left + body.clientWidth },
    scrollWidth: body.scrollWidth,
    clientWidth: body.clientWidth,
    bar: bar > 0 ? { x: left + body.clientWidth, y: b.top + body.clientTop, w: bar, h: body.clientHeight } : null,
    barWidth: Math.max(0, Math.round(bar)),
    suggest: rect(body.querySelector('[data-action="suggest"]')),
    intro: rect(body.querySelector('.prep > .intro, .prep > .kho-note')),
    foot: rect(body.querySelector('.prep > .panel-foot')),
    hint: rect(body.querySelector('.panel-foot .reason:not([hidden])')),
    items: [...body.querySelectorAll('.stack > .item')].map((li) => {
      const badge = li.querySelector('.badge');
      const meta = li.querySelector('.item-meta');
      return {
        id: li.getAttribute('data-ingredient'),
        box: rect(li),
        badge: rect(badge),
        level: level(badge),
        text: badge?.textContent.trim() ?? '',
        meta: rect(meta),
        metaText: meta?.textContent.trim() ?? '',
      };
    }),
    dock: rect(document.querySelector('.dock [data-panel="inventory"]')),
    dockBadge: dockBadge && !dockBadge.hidden ? { box: rect(dockBadge), text: dockBadge.textContent.trim() } : null,
  };
}

/**
 * Kho frames of one build, the same steps on P18 and P19: on a phone, the
 * scrollbar at rest and while scrolling, the body pushed sideways as far as
 * it goes, the foot with 0 packs and with 1; then on a desktop screen at
 * open hours with the starting stock and no Auto-restock, the row of
 * `focus` (else the first one not "Đủ") in view.
 */
async function khoSession(browser, url, focus) {
  const context = await newContext(browser, { viewport: PHONE });
  const page = await context.newPage();
  const panel = '#ui > .panel:not([hidden])';
  const frame = async () => ({ png: await page.screenshot({ style: HIDE_TOASTS }), dom: await page.evaluate(khoDom) });
  const scrollBody = (top, left) =>
    page.evaluate(
      ({ sel, top, left }) => {
        const b = document.querySelector(sel);
        b.scrollTop = top;
        b.scrollLeft = left;
      },
      { sel: `${panel} .panel-body`, top, left },
    );
  const openKho = async () => {
    await page.locator('.dock [data-panel="inventory"]').click();
    await page.locator(`${panel} .panel-body .stack`).waitFor();
    await sleep(800);
  };
  try {
    await startEasyDay(page, await openMenu(page, url));
    await openKho();

    // Scrollbar at rest: pointer off the panel, nothing focused (the dock click left focus there).
    await page.mouse.move(2, 2);
    await page.evaluate(() => document.activeElement?.blur?.());
    await sleep(600);
    const idle = await frame();
    // Scrollbar while the body scrolls under the pointer.
    const body = idle.dom.body;
    await page.mouse.move(body.x + body.w / 2, body.y + body.h / 2);
    await page.mouse.wheel(0, 240);
    await sleep(300);
    const scrolling = await frame();

    // Margins: the body scrolled sideways as far as it goes; it only moves when content is wider than the panel.
    // Once at the top (intro, Auto-restock), once with the first stock row at the top of the body.
    await scrollBody(0, 100_000);
    await sleep(300);
    const margins = await frame();
    await page.evaluate((sel) => {
      const b = document.querySelector(sel);
      // The badge sits low in the row; bring it near the top so the sticky foot does not cover it.
      const row = b.querySelector('.stack > .item');
      const at = row.querySelector('.badge') ?? row;
      b.scrollTop += at.getBoundingClientRect().top - b.getBoundingClientRect().top - 60;
      b.scrollLeft = b.scrollWidth;
    }, `${panel} .panel-body`);
    await sleep(300);
    const marginsRow = await frame();

    // Foot with 0 packs, then 1 pack of the first ingredient.
    await scrollBody(0, 0);
    await sleep(300);
    const foot0 = await frame();
    const stepper = page.locator(`${panel} .item .stepper`).first();
    await stepper.locator('.step-btn').last().click();
    await scrollBody(0, 0);
    await sleep(400);
    const foot1 = await frame();
    await stepper.locator('.step-btn').first().click();

    // Open hours on a desktop screen.
    await page.setViewportSize(VIEWPORT);
    await page.locator('.dock [data-panel="inventory"]').click();
    await page.locator('.dock [data-panel="staff"]').click();
    for (let i = 0; i < KHO_HIRES; i++) {
      await page.locator(`${panel} [data-action="hire"]`).first().click();
      await sleep(300);
    }
    await page.locator('.dock [data-panel="staff"]').click();
    await page.locator('[data-action="open"]').click();
    await page.locator('[data-speed="4"]').click();
    await clockAt(page, KHO_OPEN_AT);
    await openKho();
    const id =
      focus ??
      (await page.evaluate((sel) => document.querySelector(`${sel} .stack > .item:has(.badge:not(.badge-ok))`)?.getAttribute('data-ingredient') ?? null, panel));
    if (id) await page.evaluate(({ sel, id }) => document.querySelector(`${sel} .stack > .item[data-ingredient="${id}"]`)?.scrollIntoView({ block: 'center' }), { sel: panel, id });
    await page.mouse.move(2, VIEWPORT.height / 2);
    await sleep(300);
    await freeze(page);
    let open;
    try {
      open = { ...(await frame()), clock: await clockText(page) };
    } finally {
      await thaw(page);
    }
    return { idle, scrolling, margins, marginsRow, foot0, foot1, open, focus: id };
  } finally {
    await context.close();
  }
}

/**
 * Runs in the browser. Draws the `crop` part of each frame in a row at
 * `scale` with a title over each, rings each mark's boxes on its frame (P18
 * dashed coral, P19 solid mint), draws the yellow `lines` across frames,
 * puts each label off the rings with a leader line, and a legend with the
 * notes below.
 */
async function drawBoard({ frames, marks, lines, lineLegend, notes, names, crop, scale, avoid = [], gutter = 0, labelShare = 0 }) {
  const INK = '#2b1d14';
  const COLOR = { before: '#e07a5f', after: '#2fb898' };
  const LINE = '#f2c14e';
  const SCALE = scale;
  const PAD = 24;
  const TITLE = 44;
  const ROW = 28;
  const TITLE_FONT = (px) => `700 ${px}px Nunito, system-ui, sans-serif`;
  const LEGEND_FONT = '600 17px Nunito, system-ui, sans-serif';
  const load = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const imgs = await Promise.all(frames.map((f) => load(f.png)));
  const panels = [];
  let px = PAD;
  for (const [i, img] of imgs.entries()) {
    const w = Math.round(crop.w * SCALE);
    panels.push({ img, x: px, w, h: Math.round(crop.h * SCALE), title: frames[i].title, side: frames[i].side });
    // A `gutter` right of each frame holds labels that would cover the frame's text.
    px += w + gutter + PAD;
  }
  // Frame CSS px (deviceScaleFactor 1) to board px, relative to a panel's left edge and the image top.
  const sx = (x) => (x - crop.x) * SCALE;
  const sy = (y) => (y - crop.y) * SCALE;
  const width = px;
  // Label text is 15 px, or `labelShare` of the board width when that is larger.
  const labelPx = Math.max(15, Math.ceil(width * labelShare));
  const LABEL_FONT = `700 ${labelPx}px Nunito, system-ui, sans-serif`;
  const LABEL_LINE = Math.round(labelPx * 1.27);
  const ph =Math.max(...panels.map((p) => p.h));
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
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  probe.font = LEGEND_FONT;
  const noteLines = notes.flatMap((n) => wrap(probe, n, width - 2 * PAD));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = PAD + TITLE + ph + 16 + ROW * (1 + noteLines.length) + 12;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  const top = PAD + TITLE;
  for (const p of panels) {
    let size = 22;
    ctx.font = TITLE_FONT(size);
    while (size > 13 && ctx.measureText(p.title).width > p.w) ctx.font = TITLE_FONT(--size);
    ctx.fillStyle = INK;
    ctx.fillText(p.title, p.x, PAD + TITLE / 2 - 4);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(p.img, crop.x, crop.y, crop.w, crop.h, p.x, top, p.w, p.h);
  }

  // Ring rectangles on the board, per mark.
  const ringRects = marks.map((m) => {
    const p = panels[m.frame];
    return m.boxes.map((b) => ({ x: p.x + sx(b.x) - 3, y: top + sy(b.y) - 3, w: b.w * SCALE + 6, h: b.h * SCALE + 6 }));
  });

  // Rings, clipped to their frame.
  for (const [i, m] of marks.entries()) {
    const p = panels[m.frame];
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, top, p.w, p.h);
    ctx.clip();
    ctx.setLineDash(p.side === 'before' ? [8, 6] : []);
    // A mark with `polys` (e.g. a floor strip seen in perspective) is outlined and tinted as drawn, not boxed.
    const shapes = m.polys
      ? m.polys.map((poly) => () => poly.forEach((pt, k) => (k === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, p.x + sx(pt.x), top + sy(pt.y))))
      : ringRects[i].map((r) => () => ctx.roundRect(r.x, r.y, r.w, r.h, 8));
    for (const shape of shapes) {
      ctx.beginPath();
      shape();
      if (m.polys) {
        ctx.closePath();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = COLOR[p.side];
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // `thin` marks (rings close around small text) get half the line.
      ctx.lineWidth = m.thin ? 3 : 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = m.thin ? 1.5 : 3;
      ctx.strokeStyle = COLOR[p.side];
      ctx.stroke();
    }
    ctx.restore();
  }
  // Level lines across frames, e.g. the top of the foot in two states.
  ctx.setLineDash([]);
  for (const l of lines) {
    const a = panels[l.from];
    const b = panels[l.to];
    const y = top + sy(l.y);
    for (const [w, color] of [[5, INK], [3, LINE]]) {
      ctx.beginPath();
      ctx.moveTo(a.x - 8, y);
      ctx.lineTo(b.x + b.w + 8, y);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }
  for (const p of panels) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(p.x, top, p.w, p.h);
  }

  // One label per mark, next to its rings and off every ring and label of
  // the board: above, below, left or right, further out step by step; a
  // leader line joins a label that ended up away from its rings.
  ctx.font = LABEL_FONT;
  const placed = [];
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const rings = ringRects.flat();
  // Text on the frames (`avoid`, frame CSS px) that labels must not cover.
  const texts = avoid.flatMap((a) => {
    const p = panels[a.frame];
    return a.boxes.filter(Boolean).map((b) => ({ x: p.x + sx(b.x), y: top + sy(b.y), w: b.w * SCALE, h: b.h * SCALE }));
  });
  const clash = (a) => placed.some((b) => hits(a, b)) || rings.some((b) => hits(a, b)) || texts.some((b) => hits(a, b));
  const overText = [];
  for (const [i, m] of marks.entries()) {
    const p = panels[m.frame];
    const text = wrap(ctx, m.label, Math.max(p.w, gutter) - 26);
    const tw = Math.max(...text.map((t) => ctx.measureText(t).width)) + 18;
    const th = 8 + LABEL_LINE * text.length;
    const own = ringRects[i];
    const x0 = Math.min(...own.map((r) => r.x));
    const x1 = Math.max(...own.map((r) => r.x + r.w));
    const y0 = Math.min(...own.map((r) => r.y));
    const y1 = Math.max(...own.map((r) => r.y + r.h));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const at = (x, y) => ({
      x: Math.min(p.x + p.w + gutter - tw - 4, Math.max(p.x + 4, x)),
      y: Math.min(top + p.h - th - 4, Math.max(top + 4, y)),
      w: tw,
      h: th,
    });
    const tries = [];
    // With a gutter, first in it level with the rings, then further up and down.
    if (gutter > 0) for (let k = 0; k < 24; k++) tries.push(at(p.x + p.w + 10, cy - th / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (th / 2 + 2)));
    for (let k = 0; k < 12; k++) {
      const d = 6 + k * (th + 4);
      tries.push(at(cx - tw / 2, y0 - th - d), at(cx - tw / 2, y1 + d), at(x0 - tw - 6 - k * 24, cy - th / 2), at(x1 + 6 + k * 24, cy - th / 2));
    }
    const spot = tries.find((t) => !clash(t)) ?? tries[0];
    if (texts.some((b) => hits(spot, b))) overText.push(m.label);
    placed.push(spot);
    // Leader from the label's nearest edge point to the rings' box.
    const lx = Math.min(Math.max(cx, spot.x), spot.x + tw);
    const ly = Math.min(Math.max(cy, spot.y), spot.y + th);
    const rx = Math.min(Math.max(lx, x0), x1);
    const ry = Math.min(Math.max(ly, y0), y1);
    if (Math.hypot(rx - lx, ry - ly) > 10) {
      ctx.setLineDash([]);
      for (const [w, color] of [[4, INK], [2, COLOR[p.side]]]) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.roundRect(spot.x, spot.y, tw, th, 12);
    ctx.fillStyle = COLOR[p.side];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    text.forEach((t, i) => ctx.fillText(t, spot.x + 9, spot.y + 4 + LABEL_LINE * i + LABEL_LINE / 2));
  }

  // Legend: the two ring styles, the yellow line, then the notes.
  let fy = top + ph + 16 + ROW / 2;
  ctx.font = LEGEND_FONT;
  let x = PAD;
  const chips = [['before', `Nét đứt: ${names.before}`], ['after', `Nét liền: ${names.after}`]];
  for (const [side, text] of chips) {
    ctx.beginPath();
    ctx.roundRect(x, fy - 10, 34, 20, 8);
    ctx.setLineDash(side === 'before' ? [6, 4] : []);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR[side];
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = INK;
    ctx.fillText(text, x + 44, fy);
    x += 44 + ctx.measureText(text).width + 28;
  }
  if (lines.length > 0 && lineLegend) {
    ctx.beginPath();
    ctx.moveTo(x, fy);
    ctx.lineTo(x + 34, fy);
    ctx.lineWidth = 4;
    ctx.strokeStyle = LINE;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(lineLegend, x + 44, fy);
  }
  for (const line of noteLines) {
    fy += ROW;
    ctx.fillText(line, PAD, fy);
  }
  return { png: canvas.toDataURL('image/png').split(',')[1], overText };
}

/** Width and height of a PNG, from its header. */
function pngSize(png) {
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

/** The union of `boxes` grown by `pad`, inside a w × h frame; the whole frame without boxes. */
function cropAround(boxes, pad, { w, h }) {
  if (boxes.length === 0) return { x: 0, y: 0, w, h };
  const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - pad));
  const x1 = Math.min(w, Math.ceil(Math.max(...boxes.map((b) => b.x + b.w)) + pad));
  const y1 = Math.min(h, Math.ceil(Math.max(...boxes.map((b) => b.y + b.h)) + pad));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Writes docs/media/<out>: `frames` ({ png, title, side }) side by side with
 * the marks ({ frame, boxes, label }) ringed and labelled. Every frame shows
 * the same crop: the rings and `include` boxes grown by `pad`, enlarged up to
 * `maxScale` so the row fits BOARD_WIDTH. Labels keep off the `avoid` text
 * boxes ({ frame, boxes }), using a `gutter` px strip right of each frame when
 * needed, and are drawn at `labelShare` of the board width (at least 15 px).
 * Prints the rings per label and warns with !! for a label with nothing to
 * ring or one that still covers text.
 */
async function makeBoard(browser, out, { frames, marks, lines = [], lineLegend = '', notes = [], include = [], pad = 40, maxScale = 1.25, names = { before: `P18 (${P18_COMMIT})`, after: 'P19' }, avoid = [], gutter = 0, labelShare = 0 }) {
  const kept = marks.map((m) => ({ ...m, boxes: m.boxes.filter(Boolean) }));
  const ringed = kept.filter((m) => m.boxes.length > 0);
  // The largest frame bounds the crop, so a ring on a taller frame (a longer form) is not cut off.
  const sizes = frames.map((f) => pngSize(f.png));
  const bounds = { w: Math.max(...sizes.map((s) => s.w)), h: Math.max(...sizes.map((s) => s.h)) };
  const crop = cropAround([...ringed.flatMap((m) => m.boxes), ...include.filter(Boolean)], pad, bounds);
  const room = (BOARD_WIDTH - 24 * (frames.length + 1) - gutter * frames.length) / frames.length;
  const scale = Math.min(maxScale, room / crop.w);
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  let overText = [];
  try {
    const board = await page.evaluate(drawBoard, {
      frames: frames.map((f) => ({ ...f, png: f.png.toString('base64') })),
      marks: ringed,
      lines,
      lineLegend,
      notes,
      names,
      crop,
      scale,
      avoid,
      gutter,
      labelShare,
    });
    overText = board.overText;
    writeFileSync(join(OUT, out), Buffer.from(board.png, 'base64'));
  } finally {
    await page.close();
  }
  console.log(`${out}: ${ringed.map((m) => `${frames[m.frame].side} "${m.label}" ×${m.boxes.length}`).join(', ')}`);
  const missing = kept.filter((m) => m.boxes.length === 0);
  if (missing.length > 0) console.warn(`!! ${out}: nothing to ring for ${missing.map((m) => `"${m.label}"`).join(', ')}`);
  if (overText.length > 0) console.warn(`!! ${out}: label covers text for ${overText.map((l) => `"${l}"`).join(', ')}`);
}

/** Metres to 2 decimals with a decimal comma, e.g. 1,32 or 2. */
const metres = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const px = (n) => String(Math.round(n));

/** True when `box` lies in the body's visible height, above the foot (sticky, or scrolled into view on a short body). */
function inView(dom, box) {
  if (!box || !dom.body) return false;
  const bottom = Math.min(dom.body.y + dom.body.h, dom.foot ? dom.foot.y : Infinity);
  return box.y >= dom.body.y - 0.5 && box.y + box.h <= bottom + 0.5;
}

/** How far `box` sticks out past `left` and `right`, whole px. */
function cutOf(box, left, right) {
  return { left: Math.max(0, Math.round(left - box.x)), right: Math.max(0, Math.round(box.x + box.w - right)) };
}

/** "Nút Auto-restock: cắt 16 px mép trái", or "Nút Auto-restock: nằm gọn trong khung" when nothing sticks out. */
function cutLabel(name, cut, fits) {
  const parts = [];
  if (cut.left > 0) parts.push(`cắt ${cut.left} px mép trái`);
  if (cut.right > 0) parts.push(`lòi ${cut.right} px mép phải`);
  return `${name}: ${parts.length > 0 ? parts.join(', ') : fits}`;
}

/**
 * Board (a): intro and Auto-restock button against the body's edges in the
 * `top` frame, the first row's badge against its card and the body in the
 * `row` frame.
 */
function marginMarks(top, row, frame) {
  const marks = [];
  const add = (dom, at, box, name, fits, right = dom.inner.right) => {
    const cut = box ? cutOf(box, dom.inner.left, right) : { left: 0, right: 0 };
    marks.push({ frame: at, boxes: [box], label: box ? cutLabel(name, cut, fits) : name, cut: cut.left + cut.right });
  };
  add(top, frame, top.intro, 'Đoạn giới thiệu', 'đủ chữ');
  add(top, frame, top.suggest, 'Nút Auto-restock', 'nằm gọn trong khung');
  const item = row.items.find((i) => inView(row, i.badge));
  if (item) {
    add(row, frame + 1, item.badge, `Nhãn "${item.text}"`, 'nằm trong thẻ', Math.min(row.inner.right, item.box.x + item.box.w));
    add(row, frame + 1, item.box, 'Thẻ dòng đầu', 'nằm trong khung');
  } else add(row, frame + 1, null, 'Nhãn trạng thái của dòng đầu');
  return marks;
}

/** The scrollbar: its gutter when it has one, else a SCROLL_STRIP strip at the body's right edge (overlay scrollbars). */
function scrollbarBox(dom) {
  return dom.bar ?? (dom.body ? { x: dom.inner.right - SCROLL_STRIP, y: dom.body.y, w: SCROLL_STRIP, h: dom.body.h } : null);
}

/** ", rãnh 15 px" for a scrollbar with a gutter; nothing for an overlay one. */
const gutter = (dom) => (dom.barWidth > 0 ? `, rãnh ${dom.barWidth} px` : '');

/** Board (b): the foot with 0 packs (frame i) and with 1 pack (frame i + 1), and the level line of the first. */
function footMarks(k, i) {
  const a = k.foot0.dom;
  const b = k.foot1.dom;
  const h0 = a.foot?.h ?? 0;
  const h1 = b.foot?.h ?? 0;
  const d = Math.round(h1 - h0);
  const change = d === 0 ? 'chiều cao không đổi' : `khung ${d < 0 ? 'thấp đi' : 'cao thêm'} ${Math.abs(d)} px`;
  const gone = a.hint && !b.hint ? ', dòng hướng dẫn biến mất' : '';
  const marks = [
    { frame: i, boxes: [a.foot], label: `0 gói: khung tổng cao ${px(h0)} px` },
    { frame: i, boxes: [a.hint], label: 'Dòng hướng dẫn "Chọn số gói…"' },
    { frame: i + 1, boxes: [b.foot], label: `1 gói: ${px(h1)} px, ${change}${gone}` },
  ];
  if (b.hint) marks.push({ frame: i + 1, boxes: [b.hint], label: 'Cùng ô, chỉ đổi chữ' });
  return { marks, lines: a.foot ? [{ from: i, to: i + 1, y: a.foot.y }] : [] };
}

/** Board (c): rows not "Đủ" in P19 and the same rows in P18, the cups line, the dock count. */
function openMarks(dom, frame, ids, after) {
  const rows = dom.items.filter((i) => ids.includes(i.id) && inView(dom, i.badge));
  const texts = [...new Set(rows.map((r) => `"${r.text}"`))].join(' / ');
  const marks = [
    {
      frame,
      boxes: rows.map((r) => r.badge),
      label: after ? `${texts} theo lượng bán còn lại hôm nay` : `Cùng mặt hàng: ${texts}, so với ngưỡng cố định`,
    },
  ];
  if (after) {
    const row = rows.find((r) => /đủ khoảng \d+ ly hôm nay/.test(r.metaText));
    const cups = row?.metaText.match(/đủ khoảng \d+ ly hôm nay/)?.[0];
    marks.push({ frame, boxes: [row?.meta], label: cups ? `"${cups}"` : 'Dòng số ly còn đủ' });
  }
  marks.push(
    dom.dockBadge
      ? { frame, boxes: [dom.dockBadge.box], label: `Huy hiệu dock: ${dom.dockBadge.text} mặt hàng cần nhập` }
      : { frame, boxes: [dom.dock], label: 'Dock Kho: không có huy hiệu' },
  );
  return marks;
}

/** Board (e): tables and chairs of one floor plan, through the camera of the P19 peak frame. */
function tableMarks(scene, plan, frame, after) {
  const { chairOffset, chairSize, tableRadius } = plan;
  // An aisle runs the depth of its table row: the row pitch where the plan has one.
  const aisleHalf = (plan.rowPitch ?? 2 * tableRadius) / 2;
  const rows = new Map();
  for (const t of plan.tables) {
    const key = t.pos.z.toFixed(2);
    rows.set(key, [...(rows.get(key) ?? []), t.pos]);
  }
  const tight = [];
  const aisles = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1];
      const b = row[i];
      const x0 = a.x + chairOffset + chairSize / 2;
      const x1 = b.x - chairOffset - chairSize / 2;
      const gap = x1 - x0;
      if (gap < NO_WAY) tight.push({ gap, box: worldBox(scene, cuboid(x0 - chairSize, x1 + chairSize, 0, TABLE_TOP, a.z - chairSize / 2, a.z + chairSize / 2)) });
      if (gap >= AISLE) {
        // From the counter side of the row to the front wall, where the door is.
        const z0 = a.z - aisleHalf;
        const z1 = plan.frontZ - FRONT_CLEAR;
        const floor = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
        aisles.push({ gap, box: worldBox(scene, floor.map(([x, z]) => [x, 0, z]), 0), poly: floor.map(([x, z]) => project(scene, x, 0, z)) });
      }
    }
  }
  if (!after) {
    const gap = tight.length > 0 ? Math.min(...tight.map((t) => t.gap)) : null;
    return [{ frame, boxes: tight.map((t) => t.box), label: gap === null ? 'Ghế hai bàn sát nhau' : `Ghế hai bàn cách ${metres(gap)} m, không có lối đi` }];
  }
  const span = chairOffset + chairSize / 2;
  return [
    {
      frame,
      boxes: aisles.map((a) => a.box),
      polys: aisles.filter((a) => a.box).map((a) => a.poly),
      label: aisles.length > 0 ? `Lối đi chính rộng ${metres(Math.min(...aisles.map((a) => a.gap)))} m giữa hai khối bàn` : 'Lối đi chính',
    },
    {
      frame,
      boxes: plan.tables.map((t) => worldBox(scene, cuboid(t.pos.x - span, t.pos.x + span, 0, TABLE_TOP, t.pos.z - tableRadius, t.pos.z + tableRadius))),
      label: `Bàn theo lưới ${metres(plan.tablePitch ?? 0)} m, ghế hai bên quay vào bàn`,
    },
  ];
}

/** Writes the five P18/P19 boards. */
async function makeP19Boards(browser, kho, peak, plans) {
  const before = (png, title) => ({ png, title: `${title} · P18`, side: 'before' });
  const after = (png, title) => ({ png, title: `${title} · P19`, side: 'after' });
  const { p18, p19 } = kho;

  // (a) Margins at 390 px.
  const a18 = marginMarks(p18.margins.dom, p18.marginsRow.dom, 0);
  const a19 = marginMarks(p19.margins.dom, p19.marginsRow.dom, 2);
  const width = (k) => `${k.margins.dom.scrollWidth}/${k.margins.dom.clientWidth} px`;
  await makeBoard(browser, 'kho-390-p18-p19.png', {
    frames: [
      before(p18.margins.png, 'Đầu bảng'),
      before(p18.marginsRow.png, 'Dòng đầu'),
      after(p19.margins.png, 'Đầu bảng'),
      after(p19.marginsRow.png, 'Dòng đầu'),
    ],
    marks: [...a18, ...a19],
    include: [p18.margins.dom.panel, p19.margins.dom.panel],
    pad: 12,
    notes: [
      `Khổ 390×844. Cả hai bản cuộn ngang khung bảng hết cỡ trước khi chụp; "Dòng đầu" cuộn thêm xuống dòng hàng đầu. Rộng nội dung / khung: P18 ${width(p18)}, P19 ${width(p19)}.`,
    ],
  });
  if (a19.some((m) => m.cut > 0)) console.warn('!! kho-390-p18-p19.png: P19 still has content past the panel edge');
  if (!a18.some((m) => m.cut > 0)) console.log('note: kho-390-p18-p19.png: nothing sticks out of the P18 panel in this run');

  // (b) Foot with 0 and 1 pack.
  const b18 = footMarks(p18, 0);
  const b19 = footMarks(p19, 2);
  await makeBoard(browser, 'kho-foot-p18-p19.png', {
    frames: [before(p18.foot0.png, '0 gói'), before(p18.foot1.png, '1 gói'), after(p19.foot0.png, '0 gói'), after(p19.foot1.png, '1 gói')],
    marks: [...b18.marks, ...b19.marks],
    lines: [...b18.lines, ...b19.lines],
    lineLegend: 'Vạch vàng: mép trên khung tổng lúc 0 gói',
    include: [p18.foot0.dom.panel, p19.foot0.dom.panel],
    pad: 12,
    notes: ['Khổ 390×844. Bấm + một gói ở dòng đầu. Khung tổng dính đáy bảng, nên nó đổi chiều cao thì mép trên lệch khỏi vạch vàng.'],
  });

  // (c) Open hours, no Auto-restock.
  const ids = p19.open.dom.items.filter((i) => i.level !== 'ok' && inView(p19.open.dom, i.badge)).map((i) => i.id);
  await makeBoard(browser, 'kho-open-p18-p19.png', {
    frames: [before(p18.open.png, `Kho ${p18.open.clock}`), after(p19.open.png, `Kho ${p19.open.clock}`)],
    marks: [...openMarks(p18.open.dom, 0, ids, false), ...openMarks(p19.open.dom, 1, ids, true)],
    include: [p18.open.dom.panel, p19.open.dom.panel, p18.open.dom.dock, p19.open.dom.dock],
    pad: 16,
    notes: [`Không bấm Gợi ý. Mỗi bản: kho ban đầu, ${KHO_HIRES} nhân viên, mở cửa chạy 4x tới ${KHO_OPEN_AT}, rồi mở bảng Kho.`],
  });

  // (d) Scrollbar.
  await makeBoard(browser, 'scrollbar-p18-p19.png', {
    frames: [before(p18.scrolling.png, 'Đang cuộn'), after(p19.idle.png, 'Đứng yên'), after(p19.scrolling.png, 'Đang cuộn')],
    marks: [
      { frame: 0, boxes: [scrollbarBox(p18.scrolling.dom)], label: `Thanh cuộn mặc định của trình duyệt${gutter(p18.scrolling.dom)}` },
      { frame: 1, boxes: [scrollbarBox(p19.idle.dom)], label: 'Chuột ngoài bảng: thanh ẩn' },
      { frame: 2, boxes: [scrollbarBox(p19.scrolling.dom)], label: `Khi cuộn: thanh mảnh, màu viền theo token${gutter(p19.scrolling.dom)}` },
    ],
    include: [p18.scrolling.dom.panel, p19.scrolling.dom.panel],
    pad: 12,
    notes: [
      'Khổ 390×844. Đứng yên: chuột ngoài bảng, không ô nào được focus. Đang cuộn: lăn chuột trên bảng, chụp sau 0,3 giây.',
      p18.scrolling.dom.barWidth === 0 ? 'Chromium trên macOS vẽ thanh cuộn nổi (không chiếm rãnh); vòng khoanh dải mép phải khung bảng.' : '',
    ].filter(Boolean),
  });

  // (e) Peak: tables and aisle.
  await makeBoard(browser, 'peak-p18-p19.png', {
    frames: [before(refFrame(P18_COMMIT, 'peak.png'), 'Cao điểm'), after(readFileSync(join(OUT, 'peak.png')), 'Cao điểm')],
    marks: [...tableMarks(peak.scene, plans.p18, 0, false), ...tableMarks(peak.scene, plans.p19, 1, true)],
    pad: 150,
    maxScale: 2,
    notes: [`Cùng góc máy (Home, zoom 1,25x). Vòng P18: bàn ghế theo sim P18 (${P18_COMMIT}), chiếu qua camera của ảnh P19.`],
  });
}

/**
 * Runs in the browser. Finds the spots that glow warm in the evening frames
 * (warm and bright in both, redder than by day: glass, sign, bulbs), sorts
 * them into window / door / sign / pendant lamp, and draws the day and
 * evening frames side by side with the spots ringed and labelled.
 */
async function drawGlowPair({ day, evening, eveningLater, dayTitle, eveningTitle }) {
  const CELL = 4;
  const KINDS = {
    window: { label: 'Cửa sổ', color: '#f2c14e' },
    door: { label: 'Cửa kính', color: '#2fb898' },
    sign: { label: 'Biển hiệu', color: '#e07a5f' },
    pendant: { label: 'Đèn thả', color: '#fff9f0' },
  };
  const INK = '#2b1d14';
  const load = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const [dayImg, eveImg, laterImg] = await Promise.all([day, evening, eveningLater].map(load));
  const w = eveImg.width;
  const h = eveImg.height;
  const pixels = (img) => {
    const c = new OffscreenCanvas(w, h).getContext('2d');
    c.drawImage(img, 0, 0);
    return c.getImageData(0, 0, w, h).data;
  };
  const d = pixels(dayImg);
  const e = pixels(eveImg);
  const l = pixels(laterImg);
  // Lit glass, bulbs and the sign stay pale (green >= 170); table tops under
  // the warm point lights are redder and darker, so they drop out.
  const warm = (p, i) => (p[i] >= 200 && p[i + 1] >= 170 && p[i] - p[i + 2] >= 30) || (p[i] >= 235 && p[i + 1] >= 225 && p[i + 2] >= 200);
  const glows = (i) => warm(e, i) && warm(l, i) && e[i] - d[i] >= 12;

  // Glowing pixels per CELL x CELL cell, then cells grouped with a 1-cell gap allowed.
  const gw = Math.ceil(w / CELL);
  const gh = Math.ceil(h / CELL);
  const hits = new Uint16Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (glows((y * w + x) * 4)) hits[((y / CELL) | 0) * gw + ((x / CELL) | 0)]++;
  }
  const minHits = Math.ceil(CELL * CELL * 0.2);
  const seen = new Uint8Array(gw * gh);
  const spots = [];
  for (let s = 0; s < hits.length; s++) {
    if (seen[s] || hits[s] < minHits) continue;
    seen[s] = 1;
    const stack = [s];
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, count = 0;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % gw;
      const cy = (c / gw) | 0;
      count += hits[c];
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (!seen[n] && hits[n] >= minHits) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (count < 12) continue;
    const box = { x: x0 * CELL, y: y0 * CELL, w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL };
    let r = 0, g = 0, b = 0;
    for (let y = box.y; y < Math.min(h, box.y + box.h); y++) {
      for (let x = box.x; x < Math.min(w, box.x + box.w); x++) {
        const i = (y * w + x) * 4;
        if (glows(i)) { r += e[i]; g += e[i + 1]; b += e[i + 2]; }
      }
    }
    spots.push({ ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2, count, g: g / count, b: b / count });
  }

  // The sign is the palest (most blue) large spot; the door glass is the
  // nearest spot under it, small or not. Pendant lamps (bulb and lit shade)
  // are small or wider than tall; wall windows are taller than wide. A spot
  // cut by the frame edge keeps the window reading.
  const small = (s) => (s.count < 80 && s.w <= 24 && s.h <= 24) || (s.w > s.h && s.x > 0 && s.y > 0 && s.x + s.w < w && s.y + s.h < h);
  const sign = spots.filter((s) => s.count >= 80 && s.b >= 150).sort((a, b) => b.b - a.b)[0];
  if (sign) sign.kind = 'sign';
  const dist = (s) => Math.hypot(s.cx - sign.cx, s.cy - sign.cy);
  const door = sign && spots.filter((s) => !s.kind && s.cy > sign.cy && dist(s) < 150).sort((a, b) => dist(a) - dist(b))[0];
  if (door) door.kind = 'door';
  for (const s of spots) if (!s.kind && small(s)) s.kind = 'pendant';
  // Pendants hang in a row over the counter: a spot right by one is another.
  const lamps = spots.filter((s) => s.kind === 'pendant');
  for (const s of spots) {
    if (!s.kind && lamps.some((p) => Math.hypot(p.cx - s.cx, p.cy - s.cy) < 90)) s.kind = 'pendant';
  }
  for (const s of spots) s.kind ??= 'window';

  // Layout: two panels at 3/4 size, a title over each and a legend below.
  const SCALE = 0.75;
  const PAD = 24;
  const TITLE = 44;
  const FOOT = 60;
  const pw = Math.round(w * SCALE);
  const ph = Math.round(h * SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = PAD * 3 + pw * 2;
  canvas.height = PAD + TITLE + ph + FOOT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 22px Nunito, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const panels = [
    { img: dayImg, x: PAD, title: dayTitle, lit: false },
    { img: eveImg, x: PAD * 2 + pw, title: eveningTitle, lit: true },
  ];
  const top = PAD + TITLE;
  for (const p of panels) {
    ctx.fillStyle = INK;
    ctx.fillText(p.title, p.x, PAD + TITLE / 2 - 4);
    ctx.drawImage(p.img, p.x, top, pw, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, top, pw, ph);
    ctx.clip();
    for (const s of spots) {
      const rx = Math.max(s.w / 2 + 8, 14) * SCALE;
      const ry = Math.max(s.h / 2 + 8, 14) * SCALE;
      ctx.beginPath();
      ctx.ellipse(p.x + s.cx * SCALE, top + s.cy * SCALE, rx, ry, 0, 0, Math.PI * 2);
      ctx.setLineDash(p.lit ? [] : [8, 6]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = KINDS[s.kind].color;
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.strokeRect(p.x, top, pw, ph);
  }

  // One label per kind and neighbourhood on the evening panel.
  const ev = panels[1];
  ctx.font = '700 17px Nunito, system-ui, sans-serif';
  const placed = [];
  const boxes = [];
  const clash = (a) => boxes.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  for (const s of [...spots].sort((a, b) => b.count - a.count)) {
    const { label, color } = KINDS[s.kind];
    if (placed.some((q) => q.kind === s.kind && Math.hypot(q.cx - s.cx, q.cy - s.cy) < 160)) continue;
    const tw = ctx.measureText(label).width + 18;
    const lx = Math.min(ev.x + pw - tw - 4, Math.max(ev.x + 4, ev.x + s.cx * SCALE - tw / 2));
    // Above the ring, else below it; a label that would cover another is left out (the legend still names the colour).
    const above = { x: lx, y: Math.max(top + 4, top + (s.y - 14) * SCALE - 28), w: tw, h: 26 };
    const below = { x: lx, y: Math.min(top + ph - 30, top + (s.y + s.h + 14) * SCALE + 2), w: tw, h: 26 };
    const spot = !clash(above) ? above : !clash(below) ? below : null;
    if (!spot) continue;
    placed.push(s);
    boxes.push(spot);
    const ly = spot.y;
    ctx.beginPath();
    ctx.roundRect(lx, ly, tw, 26, 13);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label, lx + 9, ly + 14);
  }

  // Legend: what the rings mean, and a chip per kind found.
  const fy = top + ph + FOOT / 2;
  ctx.font = '600 17px Nunito, system-ui, sans-serif';
  ctx.fillStyle = INK;
  const note = 'Vòng liền: chỗ phát sáng ấm lúc tối. Vòng nét đứt: cùng chỗ ban ngày, đèn chưa bật.';
  ctx.fillText(note, PAD, fy);
  let x = PAD + ctx.measureText(note).width + 28;
  for (const kind of Object.keys(KINDS)) {
    if (!spots.some((s) => s.kind === kind)) continue;
    ctx.beginPath();
    ctx.arc(x + 8, fy, 8, 0, Math.PI * 2);
    ctx.fillStyle = KINDS[kind].color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(KINDS[kind].label, x + 22, fy);
    x += 22 + ctx.measureText(KINDS[kind].label).width + 24;
  }

  const found = {};
  for (const s of spots) found[s.kind] = (found[s.kind] ?? 0) + 1;
  return { png: canvas.toDataURL('image/png').split(',')[1], found };
}

/** Writes the ringed day/evening pair of the shop front to `out`. */
async function makeGlowPair(browser, glow, out) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const { png, found } = await page.evaluate(drawGlowPair, {
      day: glow.day.toString('base64'),
      evening: glow.evening.toString('base64'),
      eveningLater: glow.eveningLater.toString('base64'),
      dayTitle: `Ban ngày ${glow.dayClock}`,
      eveningTitle: `Buổi tối ${glow.eveningClock}, đèn sáng đầy`,
    });
    writeFileSync(out, Buffer.from(png, 'base64'));
    console.log(`glow spots: ${JSON.stringify(found)}`);
    if (!found.sign || !(found.window || found.door)) {
      console.warn('!! facade-day-evening.png: no sign or glass found; check the frames and thresholds');
      process.exitCode = 1;
    }
  } finally {
    await page.close();
  }
}

/**
 * Loads the sim of the checkout in `root` with Vite (TypeScript as is) and
 * reads the day-1 floor plan: tables, chair and table sizes, table and row
 * pitch (P19 only). The main menu and day 1 both have the starting layout.
 */
async function simPlan(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const load = (path) => vite.ssrLoadModule(path);
    const [state, { getShopLayout }, footprints] = await Promise.all(['/src/sim/state.ts', '/src/sim/upgrades.ts', '/src/sim/nav/footprints.ts'].map(load));
    const layout = getShopLayout(state.createNewGame('Coffee Shop', 'easy', FIXED_NOW >>> 0));
    return JSON.parse(
      JSON.stringify({
        tables: layout.tables,
        chairOffset: footprints.CHAIR_OFFSET,
        chairSize: footprints.CHAIR_SIZE,
        tableRadius: footprints.TABLE_RADIUS,
        tablePitch: state.TABLE_PITCH ?? null,
        rowPitch: state.TABLE_ROW_PITCH ?? null,
        frontZ: layout.indoor.maxZ,
      }),
    );
  } finally {
    await vite.close();
  }
}

/** The screenshot `name` committed at `commit`. */
function refFrame(commit, name) {
  const r = spawnSync('git', ['show', `${commit}:docs/media/${name}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git show ${commit}:docs/media/${name} failed (shallow clone?): ${r.stderr}`);
  return r.stdout;
}

/** Lead-in at 1x, the open day squeezed into DAY_CLIP_S with the camera spin kept at 1x, then the report at 1x. */
function makeMp4(video, { openAt, spinAt, spinEnd, reportAt, endAt }, out) {
  const startDay = openAt + INTRO_S;
  const factor = Math.max(1, (spinAt - startDay + (reportAt - spinEnd)) / DAY_CLIP_S);
  const fast = factor.toFixed(3);
  const graph = [
    `[0:v]trim=start=${openAt}:end=${startDay},setpts=PTS-STARTPTS[a]`,
    `[0:v]trim=start=${startDay}:end=${spinAt},setpts=(PTS-STARTPTS)/${fast}[b]`,
    `[0:v]trim=start=${spinAt}:end=${spinEnd},setpts=PTS-STARTPTS[s]`,
    `[0:v]trim=start=${spinEnd}:end=${reportAt},setpts=(PTS-STARTPTS)/${fast}[d]`,
    `[0:v]trim=start=${reportAt}:end=${endAt},setpts=PTS-STARTPTS[c]`,
    '[a][b][s][d][c]concat=n=5:v=1:a=0,fps=30,scale=1280:-2,format=yuv420p[v]',
  ].join(';');
  ffmpeg(['-i', video, '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', out]);
}

function makeGif(mp4, out) {
  for (const { width, fps } of GIF_TRIES) {
    const filters = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    ffmpeg(['-i', mp4, '-filter_complex', filters, '-loop', '0', out]);
    if (statSync(out).size <= MAX_BYTES) return;
    console.log(`demo.gif ${sizeMb(out).toFixed(1)} MB at ${width}px/${fps}fps, trying smaller`);
  }
  throw new Error('demo.gif is still over 5 MB');
}

async function main() {
  const withVideo = hasFfmpeg();
  if (!withVideo) {
    console.warn('ffmpeg not found: taking screenshots only. Install it (macOS: brew install ffmpeg; Debian/Ubuntu: sudo apt install ffmpeg) and run again for demo.gif and demo.mp4.');
  }
  mkdirSync(OUT, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'cst3d-media-'));
  const temps = [tmp];
  const servers = [];
  const browsers = [];
  try {
    // The P18 build first, so a missing commit fails before the long run.
    console.log(`building P18 (${P18_COMMIT})…`);
    const p18Root = buildRef(P18_COMMIT);
    temps.push(p18Root);
    const plans = { p18: await simPlan(p18Root), p19: await simPlan(ROOT) };
    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(p18Root, P18_PORT));
    const browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      // Lets WebGL fall back to software rendering when headless Chromium has no GPU.
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    });
    browsers.push(browser);
    const context = await newContext(browser, { viewport: VIEWPORT, recordVideo: withVideo ? { dir: tmp, size: VIEWPORT } : undefined });
    await context.addInitScript(observeThree);
    const page = await context.newPage();
    const videoStart = Date.now();
    const { times, glow, peak } = await playDay(page, videoStart);
    const video = page.video();
    await context.close();
    await makeGlowPair(browser, glow, join(OUT, 'facade-day-evening.png'));

    // Headless Chromium hides scrollbars unless told otherwise; the Kho frames need them.
    const khoBrowser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });
    browsers.push(khoBrowser);
    const p19 = await khoSession(khoBrowser, URL_BASE, null);
    const p18 = await khoSession(khoBrowser, urlFor(P18_PORT), p19.focus);
    await makeP19Boards(browser, { p18, p19 }, peak, plans);

    if (withVideo && video) {
      const raw = await video.path();
      const mp4 = join(OUT, 'demo.mp4');
      makeMp4(raw, times, mp4);
      makeGif(mp4, join(OUT, 'demo.gif'));
    }
  } finally {
    for (const b of browsers) await b.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  const files = [
    'main-menu.png',
    'menu-icons.png',
    'prep-inventory.png',
    'facade-day.png',
    'peak.png',
    'queue.png',
    'facade-evening.png',
    'facade-day-evening.png',
    'daily-report.png',
    'reviews.png',
    'kho-390-p18-p19.png',
    'kho-foot-p18-p19.png',
    'kho-open-p18-p19.png',
    'scrollbar-p18-p19.png',
    'peak-p18-p19.png',
    ...(withVideo ? ['demo.gif', 'demo.mp4'] : []),
  ];
  let over = false;
  for (const f of files) {
    const mb = sizeMb(join(OUT, f));
    over ||= mb * 1024 * 1024 > MAX_BYTES;
    console.log(`${mb > 5 ? '!!' : 'ok'} docs/media/${f} ${mb.toFixed(2)} MB`);
  }
  if (over || !withVideo) process.exitCode = 1;
}

// Reusable pieces for scripts/capture-p20.mjs. Importing this module must not
// start a capture, so main() only runs when the file is the entry point.
export {
  OUT,
  VIEWPORT,
  PHONE,
  FIXED_NOW,
  SETTINGS,
  BOARD_WIDTH,
  startPreview,
  buildRef,
  newContext,
  observeThree,
  openMenu,
  startEasyDay,
  freeze,
  thaw,
  captureSettingsForm,
  measured,
  sceneSnapshot,
  project,
  worldBox,
  cuboid,
  clockAt,
  clockText,
  cameraHome,
  cameraFacade,
  drawBoard,
  cropAround,
  pngSize,
  makeBoard,
  sizeMb,
  urlFor,
};

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
