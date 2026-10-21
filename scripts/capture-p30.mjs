// Captures the P30 before/after boards (named regulars, team uniforms and
// customer emotes): BASE_COMMIT on the left, the working tree on the right,
// the change ringed in red with a caption. Run through `npm run media:p30`
// (builds first). Needs Playwright and the git history back to BASE_COMMIT;
// see docs/media.md.
//
// Files (JPEG, docs/reports/p30-characters):
//   emotes-before-after-p30.jpg          heart, sweat drop and cloud over a customer, 1280×800
//   uniform-latte-before-after-p30.jpg   the team in the 'latte' uniform (shop level 5), 1280×800
//   uniform-picker-390-before-after-p30.jpg  the Đồng phục section of Nhân viên at 390×844:
//                                        worn, open and locked uniforms
//   regulars-390-before-after-p30.jpg    the Khách quen card of Việc and a regular's toast, 390×844
//
// Saves come from the sim of each build (the noon sunny day-2 save of
// capture-p29.mjs, same seed), then the same edits on both: every open order
// ready for the heart, low patience for the sweat drop, the ingredients of a
// queued customer's drink at 0 for the cloud (out of stock at the order),
// shop level 5 and 'latte' for the team, the opening of day 3 for the toast,
// shop level 3 and 'mint' with the day-4 morning for the panels. The heart,
// cloud and toast run at game speed FAST. The working tree is shot first; the
// base is shot the same real time after Tiếp tục, with the camera on the same
// point, and gets the same rings. Run headed (MEDIA_HEADED=1): headless
// software WebGL draws too few frames for the game clock to move.
// Also loads the base's untouched noon save (a v3 save of the P29 release)
// into the working-tree build and checks the clock runs with no error that
// the working tree's own save does not have.
// Before the browser, the cloud save is loaded back and played in Node at
// FAST in 60 fps frames; the summary gives the minute of the walk-out.
// P30_SAVES_ONLY=1 plays the working tree's saves and stops.
// Prints `!!` for an emote, team, section, card or toast that never showed,
// a cloud save nobody walks out of, or a failed load; a missing emote also
// gives the HUD clock and the frames the page drew over the wait. Any `!!`
// ends the run with exit code 1 and names where it hit.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXED_NOW, buildRef, newContext, openMenu, startPreview, urlFor } from './capture-media.mjs';
import { playToScene, saveText } from './capture-p29.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
const SEED = Number(process.env.P30_SEED ?? FIXED_NOW >>> 0);
/** Build "before": the P29 release the P30 branch starts from. */
const BASE_COMMIT = process.env.P30_BASE ?? '9f662fd';
const OUT_DIR = join(ROOT, 'docs', 'reports', 'p30-characters');
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const RED = '#e5383b';
const HIDE_TOASTS = '.toasts { display: none !important; }';
const SHOT_DPR = 2;
const BOARD_WIDTH = 1900;
/** Camera ease after Tiếp tục, ms. */
const SETTLE_MS = 2500;
/** Longest wait for an emote or a regular's toast, ms. */
const WAIT_MS = 40_000;
/** Camera zoom round an emote and round the team, CSS px per metre. */
const EMOTE_PPM = 150;
const TEAM_PPM = 95;
/** Game speed of the saves that wait for an event (the top of SPEEDS in src/save/settings.ts). */
const FAST = 4;
/** Game minutes per real second and the longest frame step, s (GAME_MINUTES_PER_SECOND, MAX_FRAME_S in src/main.ts). */
const GAME_MINUTES_PER_SECOND = 2;
const MAX_FRAME_S = 0.1;
/** Game minutes the Node check of the cloud save plays, at FAST in 60 fps frames. */
const CLOUD_CHECK_MINUTES = 30;
/** Patience left in the sweat save, a share of the most (impatient below 0.4). */
const SWEAT_PATIENCE = 0.3;
/** Customer states the sweat drop shows in (RESTLESS in src/render/actors/sync.ts). */
const RESTLESS = ['entering', 'queueing', 'ordering', 'waiting'];
/** Colours of src/render/actors/emotes.ts, src/render/actors/rig.ts and src/sim/data/uniforms.ts. */
const EMOTE_COLORS = { heart: 0xe0475e, sweat: 0x5bc0de, cloud: 0x9aa3ab };
const LATTE = { shirt: 0xd9a877, hat: 0x6b3f24 };
const EMOTE_NAMES = { heart: 'Tim', sweat: 'Giọt mồ hôi', cloud: 'Đám mây' };
const EMOTE_WHEN = {
  heart: 'khi được phục vụ món',
  sweat: 'khi còn dưới 40% kiên nhẫn',
  cloud: 'khi bỏ đi vì món hết hàng',
};
const START = Date.now();
const progress = (what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${what}`);
let warnings = 0;
/** Where the `!!` lines hit: the text before the first colon ("emotes", "cloud save"…). */
const warnedAt = new Set();
const warn = (what) => {
  warnings++;
  warnedAt.add(what.split(':')[0]);
  console.warn(`!! ${what}`);
};

// --- Saves, from the sim of the build that loads them. ---

/** autoPlay of tests/integration/helpers.ts (as in capture-p29.mjs). */
function autoPlay({ sim, orders }, s) {
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
}

/** Plays on from the noon save of day 2 to the report of `lastDay`. */
function playToReport(mods, s, lastDay) {
  const { sim } = mods;
  for (;;) {
    for (let guard = 0; s.phase !== 'report' && guard < 3000; guard++) {
      autoPlay(mods, s);
      sim.step(s, 1);
      s.events = [];
    }
    if (s.phase !== 'report') throw new Error(`day ${s.day} did not reach the report`);
    if (s.day >= lastDay) return s;
    s.events = [];
    if (!sim.dispatch(s, { type: 'next_day' })) throw new Error(`next_day refused after day ${s.day}`);
    sim.dispatch(s, { type: 'apply_restock' });
    if (!sim.dispatch(s, { type: 'start_day' })) throw new Error(`day ${s.day}: start_day refused`);
    s.events = [];
  }
}

const noonOf = (mods) => playToScene(mods, { weather: 'sunny', minute: 12 * 60 }, SEED);

/**
 * Loads the cloud save back as Tiếp tục does and plays it as the browser
 * would, at FAST in 60 fps frames, for CLOUD_CHECK_MINUTES. Returns the game
 * minute of the first walk-out over an empty stock (a cloud) and the clock at
 * the end; `at` is null when nobody walked out.
 */
export function cloudCheck(mods, save, { key, text }) {
  const data = new Map([[key, text]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.loadGame('auto', storage);
  if (!r.ok) throw new Error(`cloud save: does not load back: ${r.error.message}`);
  const s = r.value;
  const dt = (1 / 60) * GAME_MINUTES_PER_SECOND * FAST;
  for (let f = 0; f < CLOUD_CHECK_MINUTES / dt; f++) {
    s.events = [];
    mods.sim.step(s, dt);
    const out = s.events.find((e) => e.type === 'angry' && (s.customers.find((c) => c.id === e.customerId)?.patience ?? 0) > 0);
    if (out) return { at: s.minute, end: s.minute };
  }
  return { at: null, end: s.minute };
}

const clockOf = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;

/** The saves of one build: the same edits on its own noon state. `p30` adds the uniform field. */
export function buildSaves(mods, save, p30) {
  const out = {};
  const put = (id, s) => {
    s.events = [];
    out[id] = saveText(save, s);
  };
  put('noon', noonOf(mods));
  // Waits run at the top game speed; every open order is ready, so the server hands drinks out at once.
  const heart = noonOf(mods);
  heart.speed = FAST;
  for (const o of heart.orders) if (o.status !== 'delivered') o.status = 'ready';
  put('heart', heart);
  const sweat = noonOf(mods);
  let restless = 0;
  for (const c of sweat.customers) {
    if (!RESTLESS.includes(c.state)) continue;
    c.patience = Math.round(c.maxPatience * SWEAT_PATIENCE * 100) / 100;
    restless++;
  }
  put('sweat', sweat);
  // A customer in the queue whose drink can no longer be made: the barista takes the order and they storm out.
  const cloud = noonOf(mods);
  for (let guard = 0; guard < 240 && !cloud.customers.some((c) => c.state === 'queueing' && c.order); guard++) {
    mods.sim.step(cloud, 1);
    cloud.events = [];
  }
  const queued = cloud.customers.find((c) => c.state === 'queueing' && c.order);
  if (!queued) throw new Error('cloud save: nobody in the queue by the end of the afternoon');
  for (const need of mods.menu.getMenuItem(queued.order).ingredients) {
    const line = cloud.inventory.find((i) => i.id === need.id);
    if (line) line.qty = 0;
  }
  cloud.speed = FAST;
  put('cloud', cloud);
  const check = cloudCheck(mods, save, out.cloud);
  const cloudAt = check.at === null ? `no walk-out by ${clockOf(check.end)}` : `walk-out at ${clockOf(check.at)}`;
  if (check.at === null) warn(`cloud save: the sim plays it from ${clockOf(cloud.minute)} to ${clockOf(check.end)} with nobody walking out over the empty stock`);
  const team = noonOf(mods);
  team.shopLevel = Math.max(team.shopLevel, 5);
  if (p30) team.uniform = 'latte';
  put('team', team);
  // Day 3 just opened: the regulars of day 2 come back for their second visit.
  const toast = playToReport(mods, noonOf(mods), 2);
  if (!mods.sim.dispatch(toast, { type: 'next_day' })) throw new Error('next_day refused after day 2');
  mods.sim.dispatch(toast, { type: 'apply_restock' });
  if (!mods.sim.dispatch(toast, { type: 'start_day' })) throw new Error('day 3: start_day refused');
  toast.speed = FAST;
  put('toast', toast);
  const prep = playToReport(mods, noonOf(mods), 3);
  if (!mods.sim.dispatch(prep, { type: 'next_day' })) throw new Error('next_day refused after day 3');
  prep.shopLevel = Math.max(prep.shopLevel, 3);
  if (p30) prep.uniform = 'mint';
  put('prep', prep);
  const regulars = Object.entries(prep.regulars ?? {}).map(([id, v]) => `${id} ${v.visits}`);
  return { saves: out, info: `${restless} restless customers at noon, cloud ${queued.order} at ${clockOf(cloud.minute)} (sim: ${cloudAt}), day ${prep.day} ${prep.phase}, regulars: ${regulars.join(', ') || 'none'}` };
}

/** Loads `root`'s sim and save code through vite and returns its buildSaves. */
async function savesOf(root, p30) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, menu] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/data/menu.ts'].map((p) => vite.ssrLoadModule(p)),
    );
    return buildSaves({ stateMod, sim, orders, menu }, save, p30);
  } finally {
    await vite.close();
  }
}

// --- Browser. ---

/**
 * Runs in the page before its scripts. Keeps the last scene and camera of
 * #scene (window.__mediaScene, __mediaCamera); while window.__mediaFocus
 * ({ x, y, z, ppm }) is set, draws with the camera moved across the view to
 * centre that point at `ppm` CSS px per metre (kept as __mediaView), as the
 * coin board of capture-p29.mjs does.
 */
function focusHooks() {
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        const f = window.__mediaFocus;
        if (!f || !camera.isOrthographicCamera) return render.call(this, scene, camera);
        const pos = camera.position.clone();
        const zoom = camera.zoom;
        camera.updateMatrixWorld();
        const dir = camera.getWorldDirection(pos.clone());
        const d = pos.clone().set(f.x, f.y, f.z).sub(pos);
        camera.position.add(d.addScaledVector(dir, -d.dot(dir)));
        camera.zoom = (f.ppm * (camera.top - camera.bottom)) / this.domElement.clientHeight;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        try {
          return render.call(this, scene, camera);
        } finally {
          window.__mediaView = camera.clone();
          camera.position.copy(pos);
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/**
 * Runs in the page. Characters and emotes of the last frame, in the view
 * drawn (__mediaView while focused): `emotes` [{ kind, world, box }] for the
 * emote meshes showing (a group of three meshes in the emote colours), and
 * `team` [{ world, box, latteShirt, latteHat }] for every body under 'actors'
 * (teamShot picks the team). Boxes are CSS px; `inside` is in the middle 85%.
 */
function scan({ emoteColors, latte, withTeam }) {
  const scene = window.__mediaScene;
  const cam = window.__mediaFocus ? window.__mediaView : window.__mediaCamera;
  if (!scene || !cam) return { emotes: [], team: [] };
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const hex = (m) => m.material?.color?.getHex?.();
  const emoteHex = Object.values(emoteColors);
  const boxOf = (meshes) => {
    let [x0, y0, x1, y1, inside] = [Infinity, Infinity, -Infinity, -Infinity, true];
    for (const o of meshes) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) {
            const q = new o.position.constructor(x, y, z).applyMatrix4(o.matrixWorld).project(cam);
            inside &&= Math.abs(q.x) < 0.85 && Math.abs(q.y) < 0.85;
            const sx = r.left + ((q.x + 1) / 2) * r.width;
            const sy = r.top + ((1 - q.y) / 2) * r.height;
            [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
          }
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, inside };
  };
  const world = (o) => {
    const p = o.getWorldPosition(new o.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  };
  const emotes = [];
  scene.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    const kind = Object.keys(emoteColors).find((k) => emoteColors[k] === hex(o));
    const g = o.parent;
    if (!kind || !g || g.children.length !== 3 || !g.children.every((c) => c.isMesh && emoteHex.includes(hex(c)))) return;
    emotes.push({ kind, world: world(o), box: boxOf([o]) });
  });
  const team = [];
  if (!withTeam) return { emotes, team };
  for (const root of scene.getObjectByName('actors')?.children ?? []) {
    if (!root.visible) continue;
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && shown(o) && o.geometry) meshes.push(o);
    });
    // Characters, not the coin popups that share the group.
    if (meshes.length < 5) continue;
    team.push({ world: world(root), box: boxOf(meshes), latteShirt: meshes.some((m) => hex(m) === latte.shirt), latteHat: meshes.some((m) => hex(m) === latte.hat) });
  }
  return { emotes, team };
}

const scanArgs = { emoteColors: EMOTE_COLORS, latte: LATTE, withTeam: false };
/** scan() with every body boxed: slow, so only for the team shot. */
const teamArgs = { ...scanArgs, withTeam: true };
const clockText = (page) => page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');

/**
 * Opens `url` with `save` in the 'auto' slot at `viewport` (SHOT_DPR), presses
 * Tiếp tục and calls fn(page, t0) with the time of the click; `errors` gets
 * console errors and page errors. The game runs at `speed` (the Settings
 * game speed wins over the save's).
 */
async function session(browser, url, save, viewport, fn, { errors = [], speed = 1 } = {}) {
  const context = await newContext(browser, { viewport, deviceScaleFactor: SHOT_DPR });
  await context.addInitScript(
    ({ key, text, speed }) => {
      localStorage.setItem(key, text);
      const s = JSON.parse(localStorage.getItem('cst3d:settings') ?? '{}');
      localStorage.setItem('cst3d:settings', JSON.stringify({ ...s, gameSpeed: speed }));
    },
    { ...save, speed },
  );
  await context.addInitScript(focusHooks);
  // Frames the page drew (window.__mediaFrames): a clock that stops with few frames is the browser, not the game.
  await context.addInitScript(() => {
    window.__mediaFrames = 0;
    const tick = () => {
      window.__mediaFrames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // A headed window behind others reads as hidden, and the game pauses on a hidden tab.
  await context.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  try {
    await openMenu(page, url);
    const btn = page.getByRole('button', { name: /^Tiếp tục/ });
    await btn.waitFor({ timeout: 10_000 }).catch(() => {
      throw new Error(`no Tiếp tục on the Main Menu: the save in ${save.key} did not load`);
    });
    const t0 = Date.now();
    await btn.click();
    return await fn(page, t0);
  } finally {
    await context.close();
  }
}

const until = async (t0, ms) => {
  const left = t0 + ms - Date.now();
  if (left > 0) await sleep(left);
};

/** Union of the boxes of the selectors' first visible matches in the open panel, CSS px; null when none. */
function unionBox(page, selectors) {
  return page.evaluate((sels) => {
    const rs = sels.flatMap((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).slice(0, 1)).map((e) => e.getBoundingClientRect());
    if (rs.length === 0) return null;
    const x = Math.min(...rs.map((r) => r.left));
    const y = Math.min(...rs.map((r) => r.top));
    return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
  }, selectors);
}

async function openPanel(page, id) {
  await page.locator(`.dock [data-panel="${id}"]`).click();
  await page.locator(`.dock [data-panel="${id}"][aria-pressed="true"]`).waitFor();
  await sleep(600);
}

// --- Boards. ---

/**
 * Runs in the browser. Draws `rows` of panels: each row has its `crop` (CSS
 * px) and `dpr`, each panel a title, its image (base64 PNG) cropped, red
 * rings round its `boxes` and its caption in a red box; `notes` under all.
 * Returns the JPEG as base64.
 */
async function drawBoard({ rows, width, notes, red }) {
  const INK = '#2b1d14';
  const PAD = 24;
  const GAP = 24;
  const TITLE = 40;
  const CAP_LINE = 25;
  const NOTE_LINE = 24;
  const font = (weight, px) => `${weight} ${px}px Nunito, system-ui, sans-serif`;
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
  const laid = [];
  let y = PAD;
  for (const row of rows) {
    const n = row.panels.length;
    const scale = Math.min(1, (width - 2 * PAD - GAP * (n - 1)) / (n * row.crop.w * row.dpr));
    const k = row.dpr * scale;
    const pw = Math.round(row.crop.w * k);
    const ph = Math.round(row.crop.h * k);
    probe.font = font(700, 19);
    const caps = row.panels.map((p) => wrap(probe, p.caption, pw - 24));
    const capH = 16 + CAP_LINE * Math.max(...caps.map((c) => c.length));
    const imgs = await Promise.all(row.panels.map(async (p) => createImageBitmap(await (await fetch(`data:image/png;base64,${p.img}`)).blob())));
    laid.push({ row, k, pw, ph, caps, capH, imgs, top: y + TITLE });
    y += TITLE + ph + 10 + capH + GAP;
  }
  probe.font = font(600, 17);
  const noteLines = notes.flatMap((t) => wrap(probe, t, width - 2 * PAD));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = y + NOTE_LINE * noteLines.length + PAD - GAP + 12;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  for (const { row, k, pw, ph, caps, capH, imgs, top } of laid) {
    const { crop, dpr } = row;
    for (const [i, p] of row.panels.entries()) {
      const x = PAD + i * (pw + GAP);
      let size = 22;
      ctx.font = font(700, size);
      while (size > 12 && ctx.measureText(p.title).width > pw) ctx.font = font(700, --size);
      ctx.fillStyle = INK;
      ctx.fillText(p.title, x, top - TITLE / 2 - 4);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgs[i], crop.x * dpr, crop.y * dpr, crop.w * dpr, crop.h * dpr, x, top, pw, ph);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, top, pw, ph);
      ctx.clip();
      for (const b of p.boxes) {
        // Kept inside the panel, so a ring round a full-width section or a list longer than the view stays whole.
        const M = 7;
        const rx0 = Math.max(x + M, x + (b.x - crop.x) * k - 8);
        const ry0 = Math.max(top + M, top + (b.y - crop.y) * k - 8);
        const rx1 = Math.min(x + pw - M, x + (b.x + b.w - crop.x) * k + 8);
        const ry1 = Math.min(top + ph - M, top + (b.y + b.h - crop.y) * k + 8);
        ctx.beginPath();
        ctx.roundRect(rx0, ry0, rx1 - rx0, ry1 - ry0, 12);
        for (const [w, color] of [[9, '#fff'], [5, red]]) {
          ctx.lineWidth = w;
          ctx.strokeStyle = color;
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.strokeRect(x, top, pw, ph);
      const capTop = top + ph + 10;
      ctx.beginPath();
      ctx.roundRect(x, capTop, pw, capH, 10);
      ctx.fillStyle = red;
      ctx.fill();
      ctx.font = font(700, 19);
      ctx.fillStyle = '#fff';
      caps[i].forEach((t, j) => ctx.fillText(t, x + 12, capTop + 8 + CAP_LINE * j + CAP_LINE / 2));
    }
  }
  ctx.font = font(600, 17);
  ctx.fillStyle = INK;
  const notesTop = y - GAP + 12;
  noteLines.forEach((t, j) => ctx.fillText(t, PAD, notesTop + NOTE_LINE * j + NOTE_LINE / 2));
  return canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
}

async function writeBoard(browser, name, rows, notes, width = BOARD_WIDTH) {
  const page = await browser.newPage({ viewport: DESK, deviceScaleFactor: 1 });
  try {
    const jpeg = await page.evaluate(drawBoard, {
      rows: rows.map((r) => ({ crop: r.crop, dpr: SHOT_DPR, panels: r.panels.map((p) => ({ title: p.title, caption: p.caption, boxes: p.boxes, img: p.png.toString('base64') })) })),
      width,
      notes,
      red: RED,
    });
    if (!jpeg) {
      warn(`${name}: the board drew nothing`);
      return null;
    }
    const file = join(OUT_DIR, name);
    writeFileSync(file, Buffer.from(jpeg, 'base64'));
    return relative(ROOT, file);
  } finally {
    await page.close();
  }
}

/** A crop of `w`×`h` CSS px centred on `box` (shifted down by `down`), inside `view`. */
function cropRound(box, w, h, view, down = 0) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2 + down;
  return {
    x: Math.round(Math.min(view.width - w, Math.max(0, cx - w / 2))),
    y: Math.round(Math.min(view.height - h, Math.max(0, cy - h / 2))),
    w,
    h,
  };
}

/** Grows `box` by `pad` CSS px each side. */
const grow = (b, pad) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });

// --- Shots. ---

/** Working tree: waits for an emote of `kind` in view, centres the camera on it and shoots. */
async function emoteAfter(page, t0, kind) {
  await page.locator('nav.dock').waitFor();
  const frames = () => page.evaluate(() => window.__mediaFrames ?? 0);
  const from = { clock: await clockText(page), frames: await frames(), t: Date.now() };
  const deadline = Date.now() + WAIT_MS;
  let hit = null;
  const toasts = new Set();
  while (!hit && Date.now() < deadline) {
    const { emotes } = await page.evaluate(scan, scanArgs);
    // In the middle of the view first; the camera centres on it anyway.
    hit = emotes.find((e) => e.kind === kind && e.box.inside) ?? emotes.find((e) => e.kind === kind) ?? null;
    if (!hit) {
      for (const t of await page.evaluate(() => [...document.querySelectorAll('.toasts .toast-title')].map((e) => e.textContent.trim()))) toasts.add(t);
      await sleep(100);
    }
  }
  if (!hit) {
    const drawn = (await frames()) - from.frames;
    const sec = (Date.now() - from.t) / 1000;
    return { toasts: [...toasts], clock: `${from.clock} → ${await clockText(page)}`, frames: `${drawn} frames in ${Math.round(sec)} s (${(drawn / sec).toFixed(1)} fps)` };
  }
  // Hearts and clouds pop in first; let them reach full size.
  if (kind !== 'sweat') await sleep(250);
  const again = (await page.evaluate(scan, scanArgs)).emotes.filter((e) => e.kind === kind);
  const near = again.sort((a, b) => Math.hypot(a.world.x - hit.world.x, a.world.z - hit.world.z) - Math.hypot(b.world.x - hit.world.x, b.world.z - hit.world.z))[0] ?? hit;
  const focus = { ...near.world, ppm: EMOTE_PPM };
  const at = Date.now() - t0;
  await page.evaluate((f) => {
    window.__mediaFocus = f;
  }, focus);
  await sleep(120);
  const shown = (await page.evaluate(scan, scanArgs)).emotes.filter((e) => e.kind === kind);
  const centre = { x: DESK.width / 2, y: DESK.height / 2 };
  const box = shown.map((e) => e.box).sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0] ?? null;
  const clock = await clockText(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { at, focus, box, clock, png, count: shown.length };
}

/** Base: the same real time after Tiếp tục and the same camera point as `after`. */
async function emoteBefore(page, t0, after) {
  await page.locator('nav.dock').waitFor();
  await until(t0, after.at);
  await page.evaluate((f) => {
    window.__mediaFocus = f;
  }, after.focus);
  await sleep(120);
  const { emotes } = await page.evaluate(scan, scanArgs);
  const clock = await clockText(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { clock, png, count: emotes.length };
}

async function emoteBoard(browser, cur, base, head) {
  const rows = [];
  const notes = [];
  for (const kind of ['heart', 'sweat', 'cloud']) {
    const speed = kind === 'sweat' ? 1 : FAST;
    const errors = [];
    const after = await session(browser, cur.url, cur.saves[kind], DESK, (p, t0) => emoteAfter(p, t0, kind), { speed, errors });
    if (!after?.box) {
      warn(`emotes: no ${kind} on the working tree in ${WAIT_MS / 1000} s; HUD ${after?.clock}; ${after?.frames} (the clock moves at most ${MAX_FRAME_S * GAME_MINUTES_PER_SECOND * speed} game min a frame); toasts: ${after?.toasts?.join(' | ') || 'none'}; errors: ${errors.slice(0, 3).join(' | ') || 'none'}`);
      continue;
    }
    const before = await session(browser, base.url, base.saves[kind], DESK, (p, t0) => emoteBefore(p, t0, after), { speed });
    if (before.count > 0) warn(`emotes: ${before.count} emote mesh(es) on ${BASE_COMMIT}`);
    const ringBox = grow(after.box, 4);
    const crop = cropRound(after.box, 360, 300, DESK, 70);
    const sec = (after.at / 1000).toFixed(1).replace('.', ',');
    progress(`emote ${kind}: ${sec} s after Tiếp tục, HUD ${after.clock}, box ${Math.round(after.box.w)}×${Math.round(after.box.h)} px, ${after.count} on screen`);
    rows.push({
      crop,
      panels: [
        { png: before.png, boxes: [ringBox], title: `Trước · ${BASE_COMMIT} · HUD ${before.clock || '?'}`, caption: `Không có ${EMOTE_NAMES[kind].toLowerCase()}: ${before.count} khối biểu cảm trong cảnh` },
        { png: after.png, boxes: [ringBox], title: `Sau · ${head} · HUD ${after.clock || '?'}`, caption: `${EMOTE_NAMES[kind]} ${EMOTE_WHEN[kind]}; ${after.count} khách đang có ${EMOTE_NAMES[kind].toLowerCase()} trên màn` },
      ],
    });
    notes.push(`${EMOTE_NAMES[kind]}: chụp ${sec} s sau Tiếp tục ở cả hai bản, camera phóng quanh cùng một điểm (${EMOTE_PPM} px mỗi mét).`);
  }
  if (rows.length === 0) return null;
  notes.push(`Save trưa ngày 2 do sim mỗi bản chơi ra, cùng seed, 1280×800, mức Cao. Giọt mồ hôi: khách đang chờ còn ${Math.round(SWEAT_PATIENCE * 100)}% kiên nhẫn; đám mây: nguyên liệu món của một khách đang xếp hàng về 0 nên khách bỏ đi lúc gọi món. Tim và mây chạy tốc độ x${FAST}.`);
  return writeBoard(browser, 'emotes-before-after-p30.jpg', rows, notes, 1500);
}

/**
 * The team centred and zoomed, with a box round each member. Without `ref`
 * the team is everyone in the latte shirt (working tree); with `ref` (the
 * working tree's team) it is the body nearest each of its spots (base, where
 * everyone on the team wears the same cream shirt as some customers).
 */
async function teamShot(page, ref = null) {
  await page.locator('nav.dock').waitFor();
  await sleep(SETTLE_MS);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const pickTeam = (bodies) => (ref ? ref.map((r) => bodies.slice().sort((a, b) => dist(a.world, r.world) - dist(b.world, r.world))[0]).filter(Boolean) : bodies.filter((t) => t.latteShirt));
  const team = pickTeam((await page.evaluate(scan, teamArgs)).team);
  if (team.length === 0) return null;
  const mid = team.reduce((a, t) => ({ x: a.x + t.world.x / team.length, y: 0.8, z: a.z + t.world.z / team.length }), { x: 0, y: 0.8, z: 0 });
  await page.evaluate((f) => {
    window.__mediaFocus = f;
  }, { ...mid, ppm: TEAM_PPM });
  await sleep(150);
  const shown = pickTeam((await page.evaluate(scan, teamArgs)).team);
  const clock = await clockText(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { team: shown, clock, png };
}

async function uniformBoard(browser, cur, base, head) {
  const after = await session(browser, cur.url, cur.saves.team, DESK, (p) => teamShot(p));
  if (!after) {
    warn('uniform: nobody in the latte shirt on the working tree');
    return null;
  }
  const before = await session(browser, base.url, base.saves.team, DESK, (p) => teamShot(p, after.team));
  if (!before) {
    warn(`uniform: no team in the scene on ${BASE_COMMIT}`);
    return null;
  }
  const expected = 1 + JSON.parse(cur.saves.team.text).state.staff.length;
  if (after.team.length !== expected) warn(`uniform: ${after.team.length} in the latte shirt, the team is ${expected}`);
  const all = [...before.team, ...after.team].map((t) => t.box);
  const x0 = Math.max(0, Math.min(...all.map((b) => b.x)) - 50);
  const y0 = Math.max(0, Math.min(...all.map((b) => b.y)) - 50);
  const x1 = Math.min(DESK.width, Math.max(...all.map((b) => b.x + b.w)) + 50);
  const y1 = Math.min(DESK.height, Math.max(...all.map((b) => b.y + b.h)) + 50);
  const crop = { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(420, x1 - x0)), h: Math.round(Math.max(320, y1 - y0)) };
  crop.x = Math.min(crop.x, DESK.width - crop.w);
  crop.y = Math.min(crop.y, DESK.height - crop.h);
  const shirts = after.team.filter((t) => t.latteShirt).length;
  const hats = after.team.filter((t) => t.latteHat).length;
  progress(`uniform: ${after.team.length} in the team, ${shirts} latte shirts, ${hats} berets; ${BASE_COMMIT}: ${before.team.filter((t) => t.latteShirt).length} latte shirts`);
  const rows = [
    {
      crop,
      panels: [
        { png: before.png, boxes: before.team.map((t) => grow(t.box, 2)), title: `Trước · ${BASE_COMMIT} · HUD ${before.clock || '?'} · cấp quán 5`, caption: `${before.team.length} người trong đội: áo kem, người chơi mũ lưỡi trai đỏ, nhân viên không mũ` },
        { png: after.png, boxes: after.team.map((t) => grow(t.box, 2)), title: `Sau · ${head} · HUD ${after.clock || '?'} · đồng phục Áo latte, mũ nồi`, caption: `${shirts}/${after.team.length} người áo latte, ${hats} mũ nồi; tạp dề giữ màu theo vai` },
      ],
    },
  ];
  const notes = [`Cùng save trưa ngày 2 do sim mỗi bản chơi ra, đặt cấp quán 5 (bản sau chọn bộ latte, mở ở cấp 5), 1280×800, mức Cao; camera phóng quanh giữa đội (${TEAM_PPM} px mỗi mét). Khoanh từng người trong đội.`];
  return writeBoard(browser, 'uniform-latte-before-after-p30.jpg', rows, notes, 1700);
}

/** Nhân viên at 390: scrolled to its end; the Đồng phục section ringed with its button states. */
async function pickerShot(page) {
  await page.locator('nav.dock').waitFor();
  await openPanel(page, 'staff');
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#ui > .panel:not([hidden]) *')) {
      if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight;
    }
  });
  const grid = page.locator('#ui > .panel:not([hidden]) .uniform-grid');
  if ((await grid.count()) > 0) await grid.scrollIntoViewIfNeeded();
  await sleep(300);
  const box = await unionBox(page, ['#ui > .panel:not([hidden]) h3[id^="uniform-title"]', '#ui > .panel:not([hidden]) .uniform-grid']);
  const states = await page.evaluate(() =>
    [...document.querySelectorAll('#ui > .panel:not([hidden]) .uniform-opt')].map((b) => ({
      id: b.dataset.uniform,
      name: b.querySelector('.uniform-name')?.textContent ?? '',
      worn: b.getAttribute('aria-pressed') === 'true',
      locked: b.disabled,
      h: Math.round(b.getBoundingClientRect().height),
    })),
  );
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { box, states, png };
}

/** Việc at 390: the Khách quen card (or, on the base, the achievements button it sits over) in view. */
async function cardShot(page) {
  await page.locator('nav.dock').waitFor();
  await openPanel(page, 'tasks');
  const list = page.locator('#ui > .panel:not([hidden]) ul[aria-label="Khách quen"]');
  const anchor = (await list.count()) > 0 ? list : page.locator('#ui > .panel:not([hidden]) .ach-toggle');
  // The card's title at the top of the view, so the ring holds the title and the first rows.
  const heading = page.locator('#ui > .panel:not([hidden]) h3.section-title').filter({ hasText: /^Khách quen$/ });
  const top = (await heading.count()) > 0 ? heading : anchor;
  await top.first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await sleep(300);
  // Title and list, cut to the part of the panel's scroll box on screen.
  const box = await page.evaluate(() => {
    const ul = document.querySelector('#ui > .panel:not([hidden]) ul[aria-label="Khách quen"]');
    if (!ul) return null;
    const h = [...ul.parentElement.querySelectorAll('h3.section-title')].find((e) => e.textContent.trim() === 'Khách quen');
    let view = ul.parentElement;
    while (view && !(view.scrollHeight > view.clientHeight + 4 && getComputedStyle(view).overflowY !== 'visible')) view = view.parentElement;
    const v = (view ?? document.documentElement).getBoundingClientRect();
    const rs = [ul, h].filter(Boolean).map((e) => e.getBoundingClientRect());
    const x0 = Math.min(...rs.map((r) => r.left));
    const y0 = Math.max(v.top, Math.min(...rs.map((r) => r.top)));
    const x1 = Math.max(...rs.map((r) => r.right));
    const y1 = Math.min(v.bottom, Math.max(...rs.map((r) => r.bottom)));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#ui > .panel:not([hidden]) li[data-regular]')].map((li) => [...li.querySelectorAll('p')].map((p) => p.textContent.trim()).join(': ')),
  );
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { box, rows, png };
}

/** Working tree: waits for a regular's toast on the running day and shoots it. */
async function toastAfter(page, t0) {
  await page.locator('nav.dock').waitFor();
  const toast = page.locator('.toasts .toast-title').filter({ hasText: /Khách quen mới|ghé quán/ });
  const seen = await toast
    .first()
    .waitFor({ timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  if (!seen) return null;
  await sleep(400);
  const at = Date.now() - t0;
  const title = (await toast.first().textContent())?.trim() ?? '';
  const b = await toast.first().evaluate((el) => (el.closest('.toast') ?? el.parentElement).getBoundingClientRect().toJSON());
  const clock = await clockText(page);
  const png = await page.screenshot();
  return { at, title, box: { x: b.left, y: b.top, w: b.width, h: b.height }, clock, png };
}

async function toastBefore(page, t0, after) {
  await page.locator('nav.dock').waitFor();
  await until(t0, after.at);
  const titles = await page.evaluate(() => [...document.querySelectorAll('.toasts .toast-title')].map((e) => e.textContent.trim()));
  const clock = await clockText(page);
  const png = await page.screenshot();
  return { titles, clock, png };
}

async function regularsBoard(browser, cur, base, head) {
  const PANEL = { x: 0, y: 0, w: PHONE.width, h: PHONE.height };
  const rows = [];
  const notes = [];
  const pa = await session(browser, cur.url, cur.saves.prep, PHONE, pickerShot);
  const pb = await session(browser, base.url, base.saves.prep, PHONE, pickerShot);
  if (!pa.box || pa.states.length === 0) warn('uniform picker: no Đồng phục section on the working tree');
  else {
    const worn = pa.states.filter((s) => s.worn);
    const open = pa.states.filter((s) => !s.worn && !s.locked);
    const locked = pa.states.filter((s) => s.locked);
    if (worn.length !== 1 || open.length === 0 || locked.length === 0) warn(`uniform picker: states worn ${worn.length}, open ${open.length}, locked ${locked.length}`);
    progress(`uniform picker: ${pa.states.map((s) => `${s.id} ${s.worn ? 'worn' : s.locked ? 'locked' : 'open'} "${s.name}" ${s.h} px`).join('; ')}`);
    const picker = [
      {
        crop: PANEL,
        panels: [
          { png: pb.png, boxes: [], title: `Trước · ${BASE_COMMIT} · Nhân viên, cuối bảng`, caption: 'Không có mục Đồng phục' },
          {
            png: pa.png,
            boxes: [pa.box],
            title: `Sau · ${head} · Nhân viên, cuối bảng`,
            caption: `Đang mặc: ${worn.map((s) => s.name).join(', ')} (viền đậm); mở: ${open.map((s) => s.name).join(', ')}; khoá: ${locked.map((s) => s.name).join(', ')}`,
          },
        ],
      },
    ];
    files.push(await writeBoard(browser, 'uniform-picker-390-before-after-p30.jpg', picker, [`Sáng ngày 4 do sim mỗi bản chơi ra, đặt cấp quán 3 (bản sau mặc bộ bạc hà), 390×844. Nút cao ${Math.min(...pa.states.map((s) => s.h))}–${Math.max(...pa.states.map((s) => s.h))} px.`], 1100));
  }
  const ca = await session(browser, cur.url, cur.saves.prep, PHONE, cardShot);
  const cb = await session(browser, base.url, base.saves.prep, PHONE, cardShot);
  if (!ca.box || ca.rows.length === 0) warn('regulars: no Khách quen card rows on the working tree');
  else {
    progress(`regulars card: ${ca.rows.join(' | ')}`);
    rows.push({
      crop: PANEL,
      panels: [
        { png: cb.png, boxes: [], title: `Trước · ${BASE_COMMIT} · Việc`, caption: 'Không có thẻ Khách quen' },
        { png: ca.png, boxes: [ca.box], title: `Sau · ${head} · Việc`, caption: `Thẻ Khách quen: ${ca.rows.length} người, mới ghé nhất trước` },
      ],
    });
    notes.push(`Thẻ: sáng ngày 4 do sim mỗi bản chơi ra, 390×844. Dòng đầu: ${ca.rows[0]}.`);
  }
  const ta = await session(browser, cur.url, cur.saves.toast, PHONE, toastAfter, { speed: FAST });
  if (!ta) warn(`regulars: no regular's toast on the working tree in ${WAIT_MS / 1000} s`);
  else {
    const tb = await session(browser, base.url, base.saves.toast, PHONE, (p, t0) => toastBefore(p, t0, ta), { speed: FAST });
    const sec = (ta.at / 1000).toFixed(1).replace('.', ',');
    progress(`regular toast: "${ta.title}" ${sec} s after Tiếp tục, HUD ${ta.clock}; ${BASE_COMMIT} toasts: ${tb.titles.join(' | ') || 'none'}`);
    rows.push({
      crop: PANEL,
      panels: [
        { png: tb.png, boxes: [grow(ta.box, 2)], title: `Trước · ${BASE_COMMIT} · HUD ${tb.clock || '?'}`, caption: tb.titles.length ? `Toast khác: ${tb.titles.join('; ')}` : 'Không có toast khách quen' },
        { png: ta.png, boxes: [grow(ta.box, 2)], title: `Sau · ${head} · HUD ${ta.clock || '?'}`, caption: `Toast "${ta.title}"` },
      ],
    });
    notes.push(`Toast: save lúc mở cửa ngày 3, tốc độ x${FAST}, chụp ${sec} s sau Tiếp tục ở cả hai bản, 390×844.`);
  }
  if (rows.length) files.push(await writeBoard(browser, 'regulars-390-before-after-p30.jpg', rows, notes, 1100));
}

/**
 * Loads the base's untouched noon save (P29, v3) into the working-tree build:
 * the clock runs and there are no more console errors or failed requests than
 * with the working tree's own noon save (the control).
 */
async function compatCheck(browser, cur, base) {
  const run = async (save) => {
    const errors = [];
    const r = await session(
      browser,
      cur.url,
      save,
      DESK,
      async (page) => {
        await page.locator('nav.dock').waitFor();
        await page.locator('#scene.is-ready').waitFor();
        const a = await clockText(page);
        await sleep(4000);
        return { a, b: await clockText(page) };
      },
      { errors },
    );
    return { ...r, errors };
  };
  const v = JSON.parse(base.saves.noon.text).version;
  const own = await run(cur.saves.noon);
  const old = await run(base.saves.noon);
  const extra = old.errors.filter((e) => !own.errors.includes(e));
  const line = `save v${v} of ${BASE_COMMIT} in the working tree: HUD ${old.a} → ${old.b}, ${old.errors.length} errors (own save: ${own.errors.length}), ${extra.length} only with the old save`;
  const all = [...new Set([...own.errors, ...old.errors])];
  if (all.length) progress(`errors seen: ${all.slice(0, 4).join(' | ')}`);
  if (old.a !== old.b && extra.length === 0) progress(`PASS ${line}`);
  else warn(`${line}${extra.length ? `: ${extra.slice(0, 3).join(' | ')}` : ''}`);
}

const files = [];

async function main() {
  const cur = await savesOf(ROOT, true);
  progress(`working tree saves: ${cur.info}`);
  if (process.env.P30_SAVES_ONLY === '1') {
    if (warnings > 0) process.exitCode = 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() || 'HEAD';
  progress(`building ${BASE_COMMIT}`);
  const baseDir = buildRef(BASE_COMMIT);
  const servers = [];
  let browser = null;
  try {
    const base = await savesOf(baseDir, false);
    progress(`${BASE_COMMIT} saves: ${base.info}`);
    servers.push(await startPreview(ROOT, PORT), await startPreview(baseDir, PORT + 1));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    });
    const c = { url: urlFor(PORT), saves: cur.saves };
    const b = { url: urlFor(PORT + 1), saves: base.saves };
    await compatCheck(browser, c, b);
    files.push(await emoteBoard(browser, c, b, head));
    files.push(await uniformBoard(browser, c, b, head));
    await regularsBoard(browser, c, b, head);
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    rmSync(baseDir, { recursive: true, force: true });
  }
  for (const f of files.filter(Boolean)) console.log(`ok ${f} ${Math.round(statSync(join(ROOT, f)).size / 1024)} kB`);
  if (warnings > 0) {
    console.error(`${warnings} !! warning(s) (${[...warnedAt].join(', ')}): fix them and run again before using the shots`);
    process.exitCode = 1;
  }
}

// tests/scripts/p30-cloud.test.ts imports cloudCheck; only a direct run captures.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
