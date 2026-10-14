// Captures the README screenshots and demo clip from the production build.
// Run through `npm run media` (builds first). Needs Playwright with Chromium
// and ffmpeg; see docs/media.md.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs', 'media');
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
const URL_BASE = `http://127.0.0.1:${PORT}/`;
/** Date.now() inside the page is frozen at this value, so New Game always gets the same seed. */
const FIXED_NOW = Number(process.env.MEDIA_SEED ?? 1760400000000);
const VIEWPORT = { width: 1280, height: 720 };
/** README limit per file. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Length of the sped-up day in the clip, seconds. */
const DAY_CLIP_S = 12;
/** Real-time lead-in before "Mở cửa" and hold on the Daily Report, seconds. */
const INTRO_S = 1.5;
const REPORT_HOLD_S = 3.5;
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
 * Game clock (HUD text) when the camera starts moving for the day and evening
 * shots of the shop front. Framing takes ~3 s, about 25 game minutes at 4x:
 * the evening shot lands near 19:25, lamps almost full, before the 20:00 close.
 */
const FACADE_DAY_AT = '10:00';
const FACADE_EVENING_AT = '19:00';
/** A 4x day lasts about 2 minutes with a fast renderer; software WebGL is slower. */
const DAY_TIMEOUT_MS = 8 * 60_000;
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

/** Plays day 1 on Easy with three hires, taking the screenshots. Returns clip timestamps in seconds. */
async function playDay(page, videoStart) {
  const at = () => (Date.now() - videoStart) / 1000;
  // Toasts would cover the shop in still images; the clip keeps them.
  const shot = (name) => page.screenshot({ path: join(OUT, name), style: '.toasts { display: none !important; }' });

  await page.goto(URL_BASE);
  const newGame = page.getByRole('button', { name: 'Ván mới', exact: true });
  await newGame.waitFor();
  // The menu comes up before the 3D scene; wait for the loading screen to go and the scene to fade in.
  await page.locator('#boot').waitFor({ state: 'detached' });
  await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
  // The menu backdrop is a busy lunchtime shop; give the first customers time to walk in.
  await sleep(4000);
  await shot('main-menu.png');

  await newGame.click();
  await page.locator('label.choice', { has: page.locator('input[value="easy"]') }).click();
  await page.getByRole('button', { name: 'Bắt đầu ngày 1', exact: true }).click();
  await page.locator('[data-action="open"]').waitFor();

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
  await clockAt(page, '12:00');
  await shot('peak.png');
  // Closer on the counter: the line follows the free aisle between the tables.
  await cameraHome(page, QUEUE_WHEEL);
  await shot('queue.png');
  await cameraHome(page, ZOOM_WHEEL);

  // Warm lamps and glowing windows.
  await clockAt(page, FACADE_EVENING_AT);
  await cameraFacade(page);
  await shot('facade-evening.png');
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
  return { openAt, reportAt, endAt };
}

/** Lead-in at 1x, the open day squeezed into DAY_CLIP_S, then the report at 1x. */
function makeMp4(video, { openAt, reportAt, endAt }, out) {
  const startDay = openAt + INTRO_S;
  const factor = Math.max(1, (reportAt - startDay) / DAY_CLIP_S);
  const graph = [
    `[0:v]trim=start=${openAt}:end=${startDay},setpts=PTS-STARTPTS[a]`,
    `[0:v]trim=start=${startDay}:end=${reportAt},setpts=(PTS-STARTPTS)/${factor.toFixed(3)}[b]`,
    `[0:v]trim=start=${reportAt}:end=${endAt},setpts=PTS-STARTPTS[c]`,
    '[a][b][c]concat=n=3:v=1:a=0,fps=30,scale=1280:-2,format=yuv420p[v]',
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
  const server = await startPreview();
  const browser = await chromium.launch({
    headless: process.env.MEDIA_HEADED !== '1',
    // Lets WebGL fall back to software rendering when headless Chromium has no GPU.
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: withVideo ? { dir: tmp, size: VIEWPORT } : undefined,
    });
    await context.addInitScript(
      ({ now, settings }) => {
        Date.now = () => now;
        localStorage.setItem('cst3d:settings', JSON.stringify(settings));
      },
      { now: FIXED_NOW, settings: { musicVolume: 0, sfxVolume: 0, quality: 'high', gameSpeed: 1, cameraKeys: 'qe-wasd' } },
    );
    const page = await context.newPage();
    const videoStart = Date.now();
    const times = await playDay(page, videoStart);
    const video = page.video();
    await context.close();

    if (withVideo && video) {
      const raw = await video.path();
      const mp4 = join(OUT, 'demo.mp4');
      makeMp4(raw, times, mp4);
      makeGif(mp4, join(OUT, 'demo.gif'));
    }
  } finally {
    await browser.close();
    server.kill();
    rmSync(tmp, { recursive: true, force: true });
  }

  const files = [
    'main-menu.png',
    'menu-icons.png',
    'prep-inventory.png',
    'facade-day.png',
    'peak.png',
    'queue.png',
    'facade-evening.png',
    'daily-report.png',
    'reviews.png',
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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
