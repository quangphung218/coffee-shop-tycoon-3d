// Captures the README screenshots and demo clip from the production build.
// Run through `npm run media` (builds first). Needs Playwright with Chromium
// and ffmpeg; see docs/media.md.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  return { times: { openAt, reportAt, endAt }, glow };
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
    const { times, glow } = await playDay(page, videoStart);
    const video = page.video();
    await context.close();
    await makeGlowPair(browser, glow, join(OUT, 'facade-day-evening.png'));

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
    'facade-day-evening.png',
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
