// A game session in the browser (save in the 'auto' slot, Tiếp tục pressed,
// hooks in place) and the shot kinds a scenario can ask for. A kind with
// `run` shoots one build; a kind with `after` and `before` shoots the
// working tree first, then the base the same real time after Tiếp tục with
// the same camera point, so the two frames of a board compare. Every shot
// returns `png` (a Buffer of the whole viewport at the session's dpr) or
// writes `file`, plus what it measured for the captions.
import { DESK, HIDE_TOASTS, hudClock, newContext, observeThree, openMenu, sleep } from './capture.mjs';
import { ringOverlay, writeShot } from './board.mjs';
import * as probes from './probes.mjs';

/** Game minutes per real second and the longest frame step, s (GAME_MINUTES_PER_SECOND, MAX_FRAME_S in src/main.ts). */
export const GAME_MINUTES_PER_SECOND = 2;
export const MAX_FRAME_S = 0.1;

/**
 * Opens `url` with `save` ({ key, text }) in the 'auto' slot at `viewport`
 * and `dpr`, with the settings `quality` and game `speed` (the Settings game
 * speed wins over the save's), the init scripts `hooks` (observeThree by
 * default), a frame counter and the visible-tab override; presses Tiếp tục
 * and calls fn(page, t0) with the time of the click. Without a save, fn
 * runs on the Main Menu. `errors` collects console errors, page errors and
 * failed requests.
 */
export async function session(browser, url, save, { viewport = DESK, dpr = 1, quality, speed, hooks = [observeThree], errors } = {}, fn) {
  const settings = {};
  if (quality) settings.quality = quality;
  if (speed) settings.gameSpeed = speed;
  const context = await newContext(browser, { viewport, deviceScaleFactor: dpr, settings });
  if (save) await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  for (const h of hooks) await context.addInitScript(h);
  await context.addInitScript(probes.framesCounter);
  await context.addInitScript(probes.alwaysVisible);
  const page = await context.newPage();
  if (errors) {
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
  }
  try {
    await openMenu(page, url);
    if (!save) return await fn(page, Date.now());
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

/** Waits until `ms` after `t0`. */
export const until = async (t0, ms) => {
  const left = t0 + ms - Date.now();
  if (left > 0) await sleep(left);
};

const dock = (page) => page.locator('nav.dock').waitFor();
const frames = (page) => page.evaluate(() => window.__mediaFrames ?? 0);
const setFocus = (page, f) =>
  page.evaluate((focus) => {
    window.__mediaFocus = focus;
  }, f);

/** Opens the dock panel `id` and waits for its slide-in. */
export async function openPanel(page, id, settleMs = 600) {
  await page.locator(`.dock [data-panel="${id}"]`).click();
  await page.locator(`.dock [data-panel="${id}"][aria-pressed="true"]`).waitFor();
  await sleep(settleMs);
}

// --- Shot kinds. ---

/**
 * The running shop: waits for the dock and `settleMs` (camera ease, rain),
 * reads the HUD clock and the lights, then shoots: to `file` (JPEG, toasts
 * hidden) when the step names one, else a PNG.
 */
async function sceneShot(page, t0, { settleMs = 2500, file, jpegQuality = 78, hideToasts = true } = {}) {
  await dock(page);
  await sleep(settleMs);
  const clock = await hudClock(page);
  const light = await page.evaluate(probes.lightInfo);
  if (file) return { file: await writeShot(page, file, { quality: jpegQuality, hideToasts }), clock, light };
  return { png: await page.screenshot(hideToasts ? { style: HIDE_TOASTS } : {}), clock, light };
}

/**
 * Working tree: once the HUD clock runs (within `hudWaitMs`; else
 * `hudStuck` names the time it stayed at), waits up to `waitMs` for an emote
 * of `emote` (a key of `scan.emoteColors`) in view, holds the page clock on
 * that frame (clockHooks), steps it `popFrames` frames at 60 fps so the
 * emote reaches full size, centres the camera on it at `ppm` px/m for one
 * more frame and shoots; the game runs on after. With `mood` and `marks`
 * (face prints of probes.faceMarks), only an emote over a face in that mood
 * counts (a cloud over a sad face), and `face` { mood, box } comes back with
 * the shot. An emote gone within the held frames (a cloud: the customer
 * storms out) is counted in `vanished` and waited for again. Without one:
 * the toasts seen, the clock over the wait and the frames the page drew (a
 * clock that stops with few frames is the browser, not the game), and no
 * `box`.
 */
async function emoteAfter(page, t0, { emote, waitMs = 40_000, hudWaitMs = 15_000, ppm = 150, scan, marks = null, mood = null, viewport = DESK, popFrames = { heart: 15, cloud: 3 } }) {
  await dock(page);
  await page.locator('#scene.is-ready').waitFor();
  const args = { ...scan, withTeam: false };
  const first = await hudClock(page);
  // The fade-in after Tiếp tục is over once the HUD clock has moved.
  const ran = await page
    .waitForFunction((c) => (document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '') !== c, first, { timeout: hudWaitMs, polling: 50 })
    .then(() => true)
    .catch(() => false);
  const hudStuck = ran ? null : first;
  const from = { clock: await hudClock(page), frames: await frames(page), t: Date.now() };
  const deadline = Date.now() + waitMs;
  const toasts = new Set();
  let vanished = 0;
  let wrongFace = 0;
  const ofKind = (r) => r.emotes.filter((e) => e.kind === emote);
  const faceAt = async (near) => (marks ? probes.faceOf((await page.evaluate(probes.scanActors, { ...args, near })).faces, marks) : null);
  const tick = (n) =>
    page.evaluate(
      async ({ n, ms }) => {
        for (let i = 0; i < n; i++) await window.__mediaClock.tick(ms);
      },
      { n, ms: 1000 / 60 },
    );
  const release = () => page.evaluate(() => window.__mediaClock.release());
  while (Date.now() < deadline) {
    const { emotes } = await page.evaluate(probes.scanActors, args);
    // In the middle of the view first; the camera centres on it anyway.
    let hit = emotes.find((e) => e.kind === emote && e.box.inside) ?? emotes.find((e) => e.kind === emote) ?? null;
    if (hit && mood && (await faceAt(hit.world))?.mood !== mood) {
      wrongFace++;
      hit = null;
    }
    if (!hit) {
      for (const t of await page.evaluate(probes.textsOf, '.toasts .toast-title')) toasts.add(t);
      await sleep(100);
      continue;
    }
    const at = Date.now() - t0;
    await page.evaluate(() => window.__mediaClock.hold());
    // Hearts and clouds pop in first; a few frames let them reach full size.
    await tick(popFrames[emote] ?? 0);
    const again = ofKind(await page.evaluate(probes.scanActors, args));
    const near = again.sort((a, b) => Math.hypot(a.world.x - hit.world.x, a.world.z - hit.world.z) - Math.hypot(b.world.x - hit.world.x, b.world.z - hit.world.z))[0] ?? hit;
    const focus = { ...near.world, ppm };
    await setFocus(page, focus);
    // One frame drawn with the focus camera.
    await tick(1);
    const look = await page.evaluate(probes.scanActors, { ...args, near: focus });
    const shown = ofKind(look);
    const centre = { x: viewport.width / 2, y: viewport.height / 2 };
    const box = shown.map((e) => e.box).sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0] ?? null;
    const face = marks ? probes.faceOf(look.faces, marks) : null;
    if (!box || (mood && face?.mood !== mood)) {
      // Gone within those frames (or the face changed): back to the game's camera and clock, wait for the next one.
      vanished++;
      await setFocus(page, null);
      await release();
      continue;
    }
    const clock = await hudClock(page);
    const png = await page.screenshot({ style: HIDE_TOASTS });
    await release();
    return { at, focus, box, face, clock, png, count: shown.length, vanished, wrongFace, hudStuck };
  }
  const drawn = (await frames(page)) - from.frames;
  const sec = (Date.now() - from.t) / 1000;
  return { box: null, vanished, wrongFace, hudStuck, toasts: [...toasts], clock: `${from.clock} → ${await hudClock(page)}`, frames: `${drawn} frames in ${Math.round(sec)} s (${(drawn / sec).toFixed(1)} fps)` };
}

/**
 * Base, on the real clock: waits up to `reachMs` for its HUD clock to reach
 * the HUD time of `after`, puts the camera on the same point and shoots;
 * counts the emote meshes it has and reads the face under the point. Null
 * when the clock never got there.
 */
async function emoteBefore(page, t0, { scan, marks = null, reachMs = 30_000 }, after) {
  await dock(page);
  await page.locator('#scene.is-ready').waitFor();
  const reached = await page
    .waitForFunction((c) => (document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '') >= c, after.clock, { timeout: reachMs, polling: 16 })
    .then(() => true)
    .catch(() => false);
  if (!reached) return null;
  await setFocus(page, after.focus);
  // Long enough for a few frames drawn round the focus.
  await sleep(300);
  const { emotes, faces } = await page.evaluate(probes.scanActors, { ...scan, withTeam: false, near: after.focus });
  const clock = await hudClock(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { clock, png, count: emotes.length, face: marks ? probes.faceOf(faces, marks) : null };
}

/**
 * The team centred and zoomed at `ppm` px/m, with a box round each member.
 * Working tree: the team is everyone in the uniform shirt (`scan.uniform`).
 * Base (`ref` = the working tree's team): the body nearest each of its
 * spots, since there everyone on the team wears the same shirt as some
 * customers. Null when nobody qualifies.
 */
async function teamShot(page, t0, { settleMs = 2500, ppm = 95, scan }, ref = null) {
  await dock(page);
  await sleep(settleMs);
  const args = { ...scan, withTeam: true };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const pickTeam = (bodies) => (ref ? ref.map((r) => bodies.slice().sort((a, b) => dist(a.world, r.world) - dist(b.world, r.world))[0]).filter(Boolean) : bodies.filter((t) => t.shirt));
  const team = pickTeam((await page.evaluate(probes.scanActors, args)).team);
  if (team.length === 0) return null;
  const mid = team.reduce((a, t) => ({ x: a.x + t.world.x / team.length, y: 0.8, z: a.z + t.world.z / team.length }), { x: 0, y: 0.8, z: 0 });
  await setFocus(page, { ...mid, ppm });
  await sleep(150);
  const shown = pickTeam((await page.evaluate(probes.scanActors, args)).team);
  const clock = await hudClock(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { team: shown, clock, png };
}

/**
 * A dock panel: opens `panel`, runs the `scroll` actions in order ('end':
 * every scroll box to its end; { into: selector }: the element into view;
 * { top: selector, text, fallback: [selectors] }: the first match (filtered
 * by text; else the first fallback found) at the top of the view), waits
 * `settleMs`, measures `box` ({ union: [selectors] } or { section: { list,
 * heading } }, the first visible match of each) and `read` ({ name: { each,
 * fields } } through readDom, or { name: 'texts:<sel>' }) and shoots.
 * Selectors are inside the open panel unless they start with '.dock' or '#'.
 */
async function panelShot(page, t0, { panel, scroll = [], settleMs = 300, box, read = {}, hideToasts = true }) {
  const IN = '#ui > .panel:not([hidden]) ';
  const sel = (s) => (/^(\.dock|#)/.test(s) ? s : IN + s);
  await dock(page);
  await openPanel(page, panel);
  for (const action of [].concat(scroll)) {
    if (action === 'end') await page.evaluate(probes.scrollPanelToEnd);
    if (action.into) {
      const el = page.locator(sel(action.into));
      if ((await el.count()) > 0) await el.scrollIntoViewIfNeeded();
    }
    if (action.top) {
      let el = page.locator(sel(action.top));
      if (action.text) el = el.filter({ hasText: action.text });
      for (const f of action.fallback ?? []) {
        if ((await el.count()) > 0) break;
        el = page.locator(sel(f));
      }
      if ((await el.count()) > 0) await el.first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
    }
  }
  await sleep(settleMs);
  let measured = null;
  if (box?.union) measured = await page.evaluate(probes.unionBox, box.union.map(sel));
  if (box?.section) measured = await page.evaluate(probes.sectionBox, { list: sel(box.section.list), heading: box.section.heading });
  const out = { box: measured };
  for (const [name, spec] of Object.entries(read)) {
    out[name] = typeof spec === 'string' ? await page.evaluate(probes.textsOf, sel(spec.replace(/^texts:/, ''))) : await page.evaluate(probes.readDom, { each: sel(spec.each), fields: spec.fields });
  }
  out.png = await page.screenshot(hideToasts ? { style: HIDE_TOASTS } : {});
  return out;
}

/** Working tree: waits up to `waitMs` for a toast whose title matches `match` and shoots it (toasts kept). */
async function toastAfter(page, t0, { match, waitMs = 40_000 }) {
  await dock(page);
  const toast = page.locator('.toasts .toast-title').filter({ hasText: match });
  const seen = await toast
    .first()
    .waitFor({ timeout: waitMs })
    .then(() => true)
    .catch(() => false);
  if (!seen) return null;
  await sleep(400);
  const at = Date.now() - t0;
  const title = (await toast.first().textContent())?.trim() ?? '';
  const b = await toast.first().evaluate((el) => (el.closest('.toast') ?? el.parentElement).getBoundingClientRect().toJSON());
  const clock = await hudClock(page);
  const png = await page.screenshot();
  return { at, title, box: { x: b.left, y: b.top, w: b.width, h: b.height }, clock, png };
}

/** Base: the same real time after Tiếp tục; the toast titles it shows. */
async function toastBefore(page, t0, _opts, after) {
  await dock(page);
  await until(t0, after.at);
  const titles = await page.evaluate(probes.textsOf, '.toasts .toast-title');
  const clock = await hudClock(page);
  const png = await page.screenshot();
  return { titles, clock, png };
}

/**
 * In a coinHooks session: waits up to `waitMs` for a coin to pop up, holds
 * the clock on that frame and steps it at `fps` to each of `ages` (s),
 * shooting the page with the camera zoomed round the coin at `ppm` px/m
 * (`lift` above the start, in the middle of the hop). Null when no coin came.
 */
async function coinFrames(page, t0, { settleMs = 2500, waitMs = 30_000, ages, fps = 60, ppm = 130, lift = 0.3 }) {
  await dock(page);
  await sleep(settleMs);
  await page.evaluate(() => {
    window.__mediaClock.watch = true;
  });
  const seen = await page
    .waitForFunction(() => window.__mediaClock.coin !== null, null, { timeout: waitMs, polling: 100 })
    .then(() => true)
    .catch(() => false);
  if (!seen) return null;
  const clock = await hudClock(page);
  await page.evaluate(
    ({ ppm, lift }) => {
      const c = window.__mediaClock.coin;
      const p = c.getWorldPosition(new c.position.constructor());
      window.__mediaFocus = { x: p.x, y: p.y + lift, z: p.z, ppm };
    },
    { ppm, lift },
  );
  const out = [];
  let done = 0;
  for (const age of ages) {
    const n = Math.round(age * fps);
    await page.evaluate(
      ({ n, ms }) => {
        for (let i = 0; i < n; i++) window.__mediaClock.tick(ms);
      },
      { n: n - done, ms: 1000 / fps },
    );
    done = n;
    await sleep(200);
    const m = await page.evaluate(probes.coinMeasure);
    out.push({ age: n / fps, png: await page.screenshot({ style: HIDE_TOASTS }), ...m });
  }
  return { clock, frames: out };
}

/** The dusk frame: a PNG with the lights, the light pools' box and a street prop's shadow (`shadow`: { min, max } m tall). */
async function duskFrame(page, t0, { settleMs = 2500, shadow = { min: 1.5, max: 6 } }) {
  await dock(page);
  await sleep(settleMs);
  const clock = await hudClock(page);
  const light = await page.evaluate(probes.lightInfo);
  const pools = await page.evaluate(probes.poolBox);
  const sh = await page.evaluate(probes.shadowOf, shadow);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { png, clock, light, pools, shadow: sh };
}

/** The Lên cấp card of the Daily Report, ringed, shot to `file`; `card: false` when it never showed. */
async function levelUpShot(page, t0, { file, settleMs = 1200, timeoutMs = 5000 }) {
  const LEVELUP = '.rpt-layer:not([hidden]) .rpt-levelup';
  await page.locator('.rpt-layer:not([hidden])').waitFor();
  const card = page.locator(LEVELUP);
  const seen = await card
    .waitFor({ timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!seen) return { card: false, file: null };
  await card.scrollIntoViewIfNeeded();
  await sleep(settleMs);
  const box = await card.boundingBox();
  await ringOverlay(page, box ? [{ x: box.x, y: box.y, w: box.width, h: box.height }] : []);
  const text = (await card.textContent())?.trim().replace(/\s+/g, ' ');
  return { card: true, text, file: await writeShot(page, file) };
}

/**
 * Runs in the page. Screen box (CSS px, in the view drawn) of the machine
 * mesh standing at each x of `spots` ({ name: x }) on the back counter: the
 * meshes ShopView marks `userData.pick = 'machine'`, placed at the layout x.
 * Null for a spot with no machine.
 */
function machineBoxes(spots) {
  const scene = window.__mediaScene;
  const cam = window.__mediaFocus ? window.__mediaView : window.__mediaCamera;
  const out = Object.fromEntries(Object.keys(spots).map((k) => [k, null]));
  if (!scene || !cam) return out;
  const r = document.getElementById('scene').getBoundingClientRect();
  scene.traverse((o) => {
    if (!o.isMesh || o.userData?.pick !== 'machine' || !o.geometry) return;
    const name = Object.keys(spots).find((k) => Math.abs(o.position.x - spots[k]) < 0.01);
    if (!name) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = new o.position.constructor(x, y, z).applyMatrix4(o.matrixWorld).project(cam);
          const sx = r.left + ((q.x + 1) / 2) * r.width;
          const sy = r.top + ((1 - q.y) / 2) * r.height;
          [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
        }
      }
    }
    out[name] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
  return out;
}

/**
 * The back counter close up: once the scene is ready and `settleMs` later,
 * centres the camera on `focus` ({ x, y, z }) at `ppm` px/m and shoots, with
 * the screen box of the machine at each x of `spots` (machineBoxes). The base
 * of a pair shoots the same point, ringed where the working tree's machines stand.
 */
async function machinesShot(page, t0, { settleMs = 2500, focus, ppm = 200, spots }) {
  await dock(page);
  await page.locator('#scene.is-ready').waitFor();
  await sleep(settleMs);
  await setFocus(page, { ...focus, ppm });
  // Long enough for a few frames drawn round the focus.
  await sleep(300);
  const boxes = await page.evaluate(machineBoxes, spots);
  const clock = await hudClock(page);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  return { boxes, clock, png };
}

/** The HUD clock when the scene is ready and `waitMs` later (does the game run on this save?). */
async function clockRun(page, t0, { waitMs = 4000 }) {
  await dock(page);
  await page.locator('#scene.is-ready').waitFor();
  const a = await hudClock(page);
  await sleep(waitMs);
  return { a, b: await hudClock(page) };
}

/** The shot kinds by name: `run` for one build, `after`/`before` for a pair; `hooks` are their init scripts. */
export const SHOTS = {
  scene: { run: sceneShot, hooks: [observeThree] },
  emote: { after: emoteAfter, before: emoteBefore, hooks: [probes.clockHooks] },
  team: { after: teamShot, before: (page, t0, opts, after) => teamShot(page, t0, opts, after.team), hooks: [probes.focusHooks] },
  panel: { run: panelShot, hooks: [observeThree] },
  toast: { after: toastAfter, before: toastBefore, hooks: [observeThree] },
  coin: { run: coinFrames, hooks: [probes.coinHooks] },
  dusk: { run: duskFrame, hooks: [observeThree] },
  levelup: { run: levelUpShot, hooks: [observeThree] },
  clock: { run: clockRun, hooks: [observeThree] },
  machines: { after: machinesShot, before: (page, t0, opts) => machinesShot(page, t0, opts), hooks: [probes.focusHooks] },
};
