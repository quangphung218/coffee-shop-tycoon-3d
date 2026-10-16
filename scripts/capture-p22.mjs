// Captures the P22 before/after boards: the v0.4.0 release (f720b6f) next to
// the working tree, loading the same save at the same window size and camera,
// ringed where the P22 review fixes changed something, with the measured
// numbers in the labels. Run through `npm run media:p22` (builds first). Needs
// Playwright with Chromium and the git history back to P22_BASE; see
// docs/media.md.
//
// Boards: main-menu-icons-p22.png (Main Menu at 390 px when main.ts marks
// cst:menu, the icon atlas held back so the shot shows what a cold load
// shows), then one board per entry of docs/reports/p22-review/fixed-ui.json
// and fixed-actors.json, named <id>-p22.png. The save is the morning of day 2
// of the review week (Normal, seed of review:p22) from the working tree's sim.
// The actor close-ups aim the camera like capture-p20's aimAt and pick the
// customer by what can be seen: the persona accessory (colour and size of the
// mesh), the face (the impatient brows) and standing still in the queue.
//
// Prints `!!` for a label with nothing to ring, a ring around a flat (empty)
// area or mostly off the frame, a label that covers text, a close-up whose
// subject never showed up and a board over MAX_BYTES.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildRef, cameraHome, FIXED_NOW, freeze, makeBoard, newContext, openMenu, OUT, PHONE, startPreview, thaw, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The v0.4.0 release the boards compare against (git archive). */
const P22_BASE = process.env.P22_BASE ?? 'f720b6f';
/** Legend names on every P22 board. */
const NAMES = { before: `v0.4.0 (${P22_BASE})`, after: 'P22' };
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The v0.4.0 build is served on the next port. */
const BASE_PORT = PORT + 1;
/** New Game seeds from Date.now(), which newContext() freezes at FIXED_NOW: the seed of review:p22. */
const SEED = Number(process.env.P22_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Morning loaded by the Kho and actor sessions; the review found the covered Kho foot on it. */
const SAVE_DAY = 2;
/** Upper bound on simulated minutes per day (tests/integration/helpers.ts DAY_GUARD). */
const DAY_GUARD = 3000;
const REVIEW = join(ROOT, 'docs', 'reports', 'p22-review');
const FIXED_LISTS = ['fixed-ui.json', 'fixed-actors.json'];
const DESK = { width: 1280, height: 800 };
/** Window while only waiting for the game clock: slow frames slow the day down. */
const IDLE = { width: 320, height: 240 };
/** A 4x morning lasts about a minute with a fast renderer; software WebGL is slower. */
const PEAK_TIMEOUT_MS = 5 * 60_000;
/** How long the peak may take to show every close-up subject. */
const HUNT_MS = 150_000;
/** Gap between the two looks that tell a standing customer from a walking one. */
const STILL_MS = 400;
/** Moved less than this (world units) over STILL_MS: standing. */
const STILL_M = 0.02;
/** Queue and pick-up area: customers this close to the counter. */
const NEAR_COUNTER = 5;
/** Leg swing past this (rad) is a seated pose (animations.ts SIT_LEGS). */
const SEATED_LEG = 0.8;
/** ~1.25x: the counter and tables fill the frame (matches capture-p20). */
const ZOOM_WHEEL = -150;
/** Full-body close-up (world units, rad): people are about 1.32 tall (rig.ts). */
const BODY_SHOT = { height: 1.9, pitch: 0.15, margin: 0.1, targetY: 0.7 };
/** Camera yaw around the subject's heading, tried in turn: front three-quarter, then the other side. */
const FRONT_YAWS = [0.5, -0.5, 0.25];
/** Side views for the student's lean and back pockets. */
const SIDE_YAWS = [1.25, -1.25];
/** Least share of a box that is the subject (not something in front). */
const MIN_SEEN = 0.3;
/** Least head-to-camera cosine for a face that counts as turned to the camera. */
const MIN_FACING = 0.6;
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** The 3D close-ups show the scene alone. */
const HIDE_UI = '.hud-layer, .toasts { display: none !important; }';
/** Labels go in a strip this wide right of each DOM frame, so they never sit on its text. */
const GUTTER = 280;
/** A ring whose pixels spread less than this (mean RGB standard deviation, 0–255) is around an empty area. */
const FLAT_SPREAD = 8;
/** A ring with less than this share of its box on the frame is around something scrolled out of view. */
const MIN_ON_IMAGE = 0.6;
/** Largest board file; bigger ones are drawn again smaller. */
const MAX_BYTES = 600 * 1024;
/**
 * The persona accessories of src/render/actors/rig.ts ACCESSORIES: colour and
 * geometry size (x, y, z). v0.4.0 has the first three and the scarf.
 */
const ACCESSORIES = [
  { persona: 'office', name: 'cặp', color: 0x5c3a26, size: [0.18, 0.14, 0.06] },
  { persona: 'student', name: 'balo', color: 0x3d9be9, size: [0.26, 0.3, 0.12] },
  { persona: 'regular', name: 'mũ len', color: 0x6a4c93, size: [0.34, 0.19, 0.31] },
  { persona: 'connoisseur', name: 'khăn', color: 0xd8457a, size: [0.34, 0.07, 0.3] },
  { persona: 'family', name: 'túi tote', color: 0xf2a516, size: [0.17, 0.31, 0.08] },
];

const shot = (page) => page.screenshot({ style: HIDE_TOASTS });
const deg = (rad) => Math.round((rad * 180) / Math.PI);
const metres = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

const START = Date.now();
/** Progress line with seconds since start, so a run stopped by a time limit shows where it was. */
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

// --- The save from the working tree's sim (as in review-p22.mjs). ---

function saveText(save, state) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
  if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/**
 * Plays the week up to the morning of SAVE_DAY with the basic strategy
 * (restock as suggested, serve alone) and saves it; also where the counter
 * stands (the same in v0.4.0).
 */
async function loadMorning() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, upgrades] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/upgrades.ts'].map((p) => vite.ssrLoadModule(p)),
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
    const state = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
    for (let day = 1; day < SAVE_DAY; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`next_day refused before day ${day}`);
      state.events = [];
      sim.dispatch(state, { type: 'apply_restock' });
      if (!sim.dispatch(state, { type: 'start_day' })) throw new Error(`day ${day}: start_day refused`);
      for (let guard = 0; state.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(state);
        sim.step(state, 1);
        state.events = [];
      }
      if (state.phase !== 'report') throw new Error(`day ${day} did not reach the report`);
    }
    state.events = [];
    if (!sim.dispatch(state, { type: 'next_day' })) throw new Error(`next_day refused before day ${SAVE_DAY}`);
    state.events = [];
    const counter = upgrades.getShopLayout(state).counter.pos;
    return JSON.parse(JSON.stringify({ save: saveText(save, state), counter: { x: counter.x, z: counter.z } }));
  } finally {
    await vite.close();
  }
}

// --- In-page probes (viewport CSS px, deviceScaleFactor 1). ---

/** Init script: when main.ts marks cst:menu, counts the visible .ic boxes that are blank, a placeholder tile, or drawn. */
function iconProbe() {
  const mark = performance.mark.bind(performance);
  performance.mark = (name, opts) => {
    if (name === 'cst:menu' && !window.__p22Icons) {
      const boxes = [...document.querySelectorAll('.ic')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.checkVisibility();
      });
      const loaded = performance.getEntriesByType('resource').some((e) => e.name.includes('/icons3d/atlas') && e.responseEnd > 0);
      const tile = (el) => !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(getComputedStyle(el).backgroundColor);
      const drawn = (el) => loaded && getComputedStyle(el).backgroundImage !== 'none';
      window.__p22Icons = {
        at: Math.round(performance.now()),
        visible: boxes.length,
        drawn: boxes.filter(drawn).length,
        placeholder: boxes.filter((el) => !drawn(el) && tile(el)).length,
        blank: boxes.filter((el) => !drawn(el) && !tile(el)).length,
        size: Math.round(boxes[0]?.getBoundingClientRect().width ?? 0),
      };
    }
    return mark(name, opts);
  };
}

/** Every visible run of text on screen, as boxes. Labels must not cover these. */
function measureTexts() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || el.closest('.toasts, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  return out;
}

/** The Main Menu buttons that carry an icon, as screen boxes. */
function measureMenu() {
  const out = [];
  for (const el of document.querySelectorAll('.ic')) {
    const host = el.closest('button, p') ?? el;
    const r = host.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && host.checkVisibility() && !out.some((b) => b.el === host)) out.push({ el: host, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/**
 * The open Kho panel: body, foot and Auto-restock boxes, whether the foot
 * sticks, what a tap on the middle of Auto-restock hits, and the stock rows
 * a tap can reach (their middle is the row itself, not the foot).
 */
function measureKho() {
  const box = (el) => {
    const r = el?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const panel = document.querySelector('#ui-panel:not([hidden])');
  const foot = panel?.querySelector('.panel-foot');
  const suggest = panel?.querySelector('[data-action="suggest"]');
  const reach = (el) => {
    const b = box(el);
    if (!b) return null;
    const hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2);
    return hit && el.contains(hit) ? null : (hit?.closest('[class]')?.className.split(' ')[0] ?? 'nothing');
  };
  const rows = [...(panel?.querySelectorAll('ul.stack > li.item') ?? [])];
  const seen = rows.filter((li) => reach(li) === null).map(box);
  const union = seen.length > 0 ? seen.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) })) : null;
  return {
    panel: box(panel),
    body: box(panel?.querySelector('.panel-body')),
    foot: box(foot),
    sticky: foot ? getComputedStyle(foot).position === 'sticky' : false,
    suggest: box(suggest),
    suggestCover: suggest ? reach(suggest) : 'missing',
    rows: rows.length,
    rowsSeen: seen.length,
    list: union,
  };
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

/** Draws a PNG (base64) again at `scale` and returns it (base64). */
async function rescale({ png, scale }) {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const canvas = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// --- 3D close-ups (as capture-p20's aimAt and closeUp). ---

/** Like capture-media's observeThree, and also keeps the renderer so a close-up can draw one frame by hand. */
function observeThreeWithRenderer() {
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    window.__mediaRenderer = renderer;
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

/** Where everyone stands now, so aimP22 can tell who stood still since. */
function samplePeople() {
  const people = window.__mediaScene?.getObjectByName('actors')?.children ?? [];
  window.__p22Sample = new Map(people.filter((o) => o.visible).map((o) => [o.uuid, { x: o.position.x, z: o.position.z }]));
}

/**
 * Runs in the page with the frame loop frozen. Picks a customer (`arg.want`:
 * 'persona' standing calm in the queue with the accessory of `arg.persona`,
 * 'noacc' the same without any accessory, 'acc' anyone with that accessory,
 * 'impatient' standing with the impatient face), aims the camera at their
 * body from `arg.yaws[arg.attempt]` around their heading, cuts everything in
 * front of them, renders, and returns their screen boxes, joint angles and
 * how much of the face, hands and accessory is them; null when nobody fits.
 */
function aimP22(arg) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const renderer = window.__mediaRenderer;
  if (!scene || !cam || !renderer) return null;
  const V = cam.position.constructor;
  const people = (scene.getObjectByName('actors')?.children ?? []).filter((o) => o.visible && o.name !== 'coins');
  // Character rig (src/render/actors/rig.ts): root > bounce > hips > [legL, legR, torso];
  // torso > [body, apron, neck, armL, armR, head, accessory, …]; head > [head, hair, eyeL, eyeR, face, cap, (accessory)].
  const rigOf = (o) => {
    const hips = o.children[0]?.children[0];
    const torso = hips?.children[2];
    if (!torso) return null;
    const groups = torso.children.filter((c) => c.isGroup);
    const head = groups.find((g) => g.children.length >= 5);
    const arms = groups.filter((g) => Math.abs(Math.abs(g.position.x) - 0.235) < 0.03).sort((a, b) => a.position.x - b.position.x);
    if (!head || arms.length !== 2) return null;
    const face = head.children[4]?.isMesh ? head.children[4] : null;
    return { legL: hips.children[0], legR: hips.children[1], torso, apron: torso.children[1], head, face, armL: arms[0], armR: arms[1] };
  };
  const accOf = (rig) => {
    for (const m of [...rig.torso.children, ...rig.head.children]) {
      if (!m.isMesh || !m.visible) continue;
      const a = arg.accessories.find((x) => x.color === m.material?.color?.getHex?.());
      if (!a) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
      if (size.every((v, i) => Math.abs(v - a.size[i]) < 0.02)) return { persona: a.persona, mesh: m, size, min: b.min.clone(), max: b.max.clone() };
    }
    return null;
  };
  const rigs = new Map(people.map((o) => [o, rigOf(o)]));
  const calmFace = [...rigs.values()].find((r) => r?.face && r.apron.visible)?.face.geometry ?? null;
  const customers = people.filter((o) => {
    const r = rigs.get(o);
    return r && !r.apron.visible && o.position.z > arg.counterZ + 0.3;
  });
  const near = (o) => Math.hypot(o.position.x - arg.counterX, o.position.z - arg.counterZ);
  const standing = (o) => Math.abs(rigs.get(o).legL.rotation.x) < arg.seatedLeg && near(o) < arg.near;
  const still = (o) => {
    const p = window.__p22Sample?.get(o.uuid);
    return !!p && Math.hypot(p.x - o.position.x, p.z - o.position.z) < arg.stillM;
  };
  const calm = (o) => !calmFace || rigs.get(o).face?.geometry === calmFace;
  const impatient = (o) => {
    const g = rigs.get(o).face?.geometry;
    // The impatient face has as many parts as the calm one (two brows, one mouth); happy and angry have five.
    return !!calmFace && !!g && g !== calmFace && g.attributes.position.count === calmFace.attributes.position.count;
  };
  const seenKinds = [...new Set(customers.map((o) => accOf(rigs.get(o))?.persona).filter(Boolean))];
  let pool = [];
  if (arg.want === 'persona') pool = customers.filter((o) => standing(o) && still(o) && calm(o) && accOf(rigs.get(o))?.persona === arg.persona);
  else if (arg.want === 'noacc') pool = customers.filter((o) => standing(o) && still(o) && calm(o) && !accOf(rigs.get(o)));
  else if (arg.want === 'acc') pool = customers.filter((o) => accOf(rigs.get(o))?.persona === arg.persona);
  else if (arg.want === 'impatient') pool = customers.filter((o) => standing(o) && impatient(o));
  // Standing ones first (a clear pose), then the nearest to the counter.
  const subject = pool.slice().sort((a, b) => Number(still(b)) - Number(still(a)) || near(a) - near(b))[0];
  if (!subject) return null;
  const rig = rigs.get(subject);
  const acc = accOf(rig);

  const heading = subject.rotation.y;
  const D = 40;
  const yaw = heading + arg.yaws[arg.attempt % arg.yaws.length];
  const cp = Math.cos(arg.pitch);
  cam.position.set(subject.position.x + Math.sin(yaw) * cp * D, arg.targetY + Math.sin(arg.pitch) * D, subject.position.z + Math.cos(yaw) * cp * D);
  cam.lookAt(subject.position.x, arg.targetY, subject.position.z);
  cam.zoom = (cam.top - cam.bottom) / arg.height;
  cam.near = D - 0.5;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  subject.updateMatrixWorld(true);
  const local = (obj, x, y, z) => obj.localToWorld(new V(x, y, z));
  const dir = cam.getWorldDirection(new V());
  const depth = (p) => p.clone().sub(cam.position).dot(dir);
  const facePts = [];
  for (const x of [-0.12, 0.12]) for (const y of [0.04, 0.24]) facePts.push(local(rig.head, x, y, 0.15));
  const headPts = [];
  for (const x of [-0.18, 0.18]) for (const y of [0, 0.44]) for (const z of [-0.17, 0.17]) headPts.push(local(rig.head, x, y, z));
  // Whole arm, shoulder to fist, and the fist alone.
  const armPts = (arm, y0) => {
    const pts = [];
    for (const x of [-0.07, 0.07]) for (const y of [y0, -0.47]) for (const z of [-0.07, 0.07]) pts.push(local(arm, x, y, z));
    return pts;
  };
  const arms = [rig.armL, rig.armR].map((a) => armPts(a, 0.05));
  const hands = [rig.armL, rig.armR].map((a) => armPts(a, -0.34));
  const bodyPts = [];
  for (const x of [-0.45, 0.45]) for (const y of [0, 1.5]) for (const z of [-0.35, 0.35]) bodyPts.push(local(subject, x, y, z));
  const accPts = [];
  if (acc) for (const x of [acc.min.x, acc.max.x]) for (const y of [acc.min.y, acc.max.y]) for (const z of [acc.min.z, acc.max.z]) accPts.push(acc.mesh.localToWorld(new V(x, y, z)));
  const nearest = Math.min(...[...facePts, ...headPts, ...arms.flat(), ...accPts].map(depth), ...[-0.2, 0.2].map((x) => depth(local(subject, x, 0.7, 0.22))));
  cam.near = Math.max(0.05, nearest - arg.margin);
  cam.updateProjectionMatrix();

  const canvas = renderer.domElement;
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width / r.width;
  const ky = canvas.height / r.height;
  const box = (pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      const n = p.clone().project(cam);
      const sx = r.left + ((n.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - n.y) / 2) * r.height;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const grab = () => {
    renderer.render(scene, cam);
    const c = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d', { willReadFrequently: true });
    c.drawImage(canvas, 0, 0);
    return c;
  };
  // Share of a box whose pixels change when `obj` is hidden: what of it is `obj`, not something in front.
  const shown = grab();
  const seenOf = (obj, boxes) => {
    obj.visible = false;
    const hidden = grab();
    obj.visible = true;
    return boxes.map((b) => {
      const x = Math.max(0, Math.floor((b.x - r.left) * kx));
      const y = Math.max(0, Math.floor((b.y - r.top) * ky));
      const w = Math.min(canvas.width, Math.ceil((b.x + b.w - r.left) * kx)) - x;
      const h = Math.min(canvas.height, Math.ceil((b.y + b.h - r.top) * ky)) - y;
      if (w <= 0 || h <= 0) return 0;
      const a = shown.getImageData(x, y, w, h).data;
      const c = hidden.getImageData(x, y, w, h).data;
      let changed = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 30) changed++;
      return changed / (w * h);
    });
  };
  const faceBox = box(facePts);
  const handBoxes = hands.map(box);
  const [faceSeen, ...handsSeen] = seenOf(subject, [faceBox, ...handBoxes]);
  const accBox = acc ? box(accPts) : null;
  const accSeen = acc ? seenOf(acc.mesh, [accBox])[0] : 0;
  renderer.render(scene, cam);
  const forward = local(rig.head, 0, 0, 1).sub(local(rig.head, 0, 0, 0)).normalize();
  return {
    persona: acc?.persona ?? null,
    accSize: acc?.size ?? null,
    seenKinds,
    still: still(subject),
    face: faceBox,
    head: box(headPts),
    arms: box(arms.flat()),
    armR: box(arms[1]),
    hands: handBoxes,
    body: box(bodyPts),
    acc: accBox,
    facing: -forward.dot(dir),
    faceSeen,
    handsSeen,
    accSeen,
    angles: {
      armLX: rig.armL.rotation.x,
      armLZ: rig.armL.rotation.z,
      armRX: rig.armR.rotation.x,
      armRZ: rig.armR.rotation.z,
      headX: rig.head.rotation.x,
      lean: rig.torso.rotation.x,
      legR: rig.legR.rotation.x,
    },
  };
}

/** Puts the near plane back; the camera controller re-aims on the next frame. */
function restoreCamera() {
  const cam = window.__mediaCamera;
  if (!cam) return;
  cam.near = 0.1;
  cam.updateProjectionMatrix();
}

/**
 * Looks for every close-up of `wants` ({ key, arg, accept }) at once: each
 * round samples who stands where, waits STILL_MS, freezes the scene and tries
 * each missing one (aimP22, shot without the UI). Stops when all are accepted
 * or after HUNT_MS; a want never accepted keeps its last shot (or none).
 */
async function hunt(page, wants, who) {
  const end = Date.now() + HUNT_MS;
  const got = {};
  const last = {};
  for (let attempt = 0; Date.now() < end && wants.some((w) => !got[w.key]); attempt++) {
    await page.evaluate(samplePeople);
    await sleep(STILL_MS);
    await freeze(page);
    try {
      for (const w of wants) {
        if (got[w.key]) continue;
        try {
          const subject = await page.evaluate(aimP22, { ...w.arg, attempt });
          if (!subject) continue;
          last[w.key] = { png: await page.screenshot({ style: HIDE_UI }), subject };
          if (w.accept(subject)) {
            got[w.key] = last[w.key];
            progress(who, `close-up ${w.key}`);
          }
        } finally {
          await page.evaluate(restoreCamera);
        }
      }
    } finally {
      await thaw(page);
    }
  }
  for (const w of wants) {
    if (got[w.key]) continue;
    got[w.key] = last[w.key] ?? null;
    progress(who, last[w.key] ? `close-up ${w.key}: no clear shot, keeping the last one` : `close-up ${w.key}: nobody fits`);
  }
  return got;
}

// --- Capture sessions. ---

/** A page with the fixed clock and settings, the three.js hook and, when given, a save in the autosave slot. */
async function gameContext(browser, viewport, save) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript(observeThreeWithRenderer);
  if (save) await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

/** From the Main Menu through Tiếp tục into the autosaved game; waits for `ready`. */
async function resume(page, url, save, ready) {
  await openMenu(page, url);
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  try {
    await btn.waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load (wrong format for this build?)`);
  }
  await btn.click();
  await page.locator(ready).first().waitFor();
}

/**
 * The Main Menu at 390 px the moment it comes up, the icon atlas held back
 * (as on a slow line, where the menu shows before the atlas): the shot, the
 * icon counts at cst:menu and the icon buttons.
 */
async function menuSession(browser, url, who) {
  const context = await newContext(browser, { viewport: PHONE });
  const held = [];
  await context.route('**/icons3d/atlas*', (route) => void held.push(route));
  await context.addInitScript(iconProbe);
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.getByRole('button', { name: 'Ván mới', exact: true }).waitFor();
    await page.waitForFunction(() => window.__p22Icons !== undefined, null, { timeout: 30_000 });
    await sleep(600);
    const out = {
      png: await shot(page),
      buttons: await page.evaluate(measureMenu),
      texts: await page.evaluate(measureTexts),
      icons: await page.evaluate(() => window.__p22Icons),
      menuMs: await page.evaluate(() => Math.round(performance.getEntriesByName('cst:menu')[0]?.startTime ?? -1)),
      atlasHeld: held.length,
    };
    progress(who, `Main Menu: ${out.icons.blank} blank, ${out.icons.placeholder} placeholder of ${out.icons.visible} icons at cst:menu ${out.menuMs} ms`);
    return out;
  } finally {
    for (const r of held) await r.abort().catch(() => {});
    await context.close();
  }
}

/** Kho at 390 px on the SAVE_DAY morning, as the player opens it: shot, boxes and what covers what. */
async function khoSession(browser, url, save, who) {
  const context = await gameContext(browser, PHONE, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await sleep(800);
    await page.locator('.dock [data-panel="inventory"]').click();
    await page.locator('#ui-panel .panel-body').waitFor();
    await sleep(800);
    const kho = await page.evaluate(measureKho);
    const out = { png: await shot(page), texts: await page.evaluate(measureTexts), kho };
    progress(who, `Kho 390: body ${Math.round(kho.body?.h ?? 0)} px, foot ${Math.round(kho.foot?.h ?? 0)} px ${kho.sticky ? 'sticky' : 'static'}, Auto-restock ${kho.suggestCover ? `covered by .${kho.suggestCover}` : 'reachable'}, ${kho.rowsSeen}/${kho.rows} rows`);
    return out;
  } finally {
    await context.close();
  }
}

/**
 * The SAVE_DAY morning at 1280 px: restock as suggested (no hires, so a queue
 * builds), open at 4x and, at the peak, the close-ups of `wants`.
 */
async function actorSession(browser, url, save, wants, who) {
  const context = await gameContext(browser, DESK, save);
  const page = await context.newPage();
  try {
    await resume(page, url, save, '[data-action="open"]');
    await page.locator('.dock [data-panel="inventory"]').click();
    await page.locator('#ui-panel [data-action="suggest"]').click();
    await sleep(300);
    const buy = page.locator('#ui-panel [data-action="buy"]');
    if ((await buy.getAttribute('aria-disabled')) !== 'true') await buy.click();
    await page.locator('.dock [data-panel="inventory"]').click();
    await page.locator('[data-action="open"]').click();
    await page.locator('[data-speed="4"]').first().click();
    progress(who, 'opened at 4x');
    await page.setViewportSize(IDLE);
    try {
      await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: PEAK_TIMEOUT_MS, polling: 250 });
    } finally {
      await page.setViewportSize(DESK);
    }
    await sleep(800);
    progress(who, 'peak');
    await cameraHome(page, ZOOM_WHEEL);
    return await hunt(page, wants, who);
  } finally {
    await context.close();
  }
}

// --- Boards. ---

/** makeBoard with the P22 legend, after warning `!!` for every ring around a flat or off-frame area; then kept under MAX_BYTES. */
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
  await fitBytes(browser, out);
}

/** Draws docs/media/<out> smaller until it is under MAX_BYTES (at most four times); `!!` when it stays over. */
async function fitBytes(browser, out) {
  const file = join(OUT, out);
  const page = await browser.newPage();
  try {
    for (let i = 0; i < 4 && statSync(file).size > MAX_BYTES; i++) {
      const scale = Math.min(0.9, Math.sqrt(MAX_BYTES / statSync(file).size) * 0.95);
      const png = await page.evaluate(rescale, { png: readFileSync(file).toString('base64'), scale });
      writeFileSync(file, Buffer.from(png, 'base64'));
    }
  } finally {
    await page.close();
  }
  const kb = Math.round(statSync(file).size / 1024);
  if (kb * 1024 > MAX_BYTES) console.warn(`!! ${out}: ${kb} kB, over ${MAX_BYTES / 1024} kB`);
}

/** Text boxes of each frame, for the board's label placement. */
const avoidTexts = (...frames) => frames.map((f, frame) => ({ frame, boxes: f.texts ?? [] }));
const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
/** A screen box grown by `pad` px on every side; null stays null. */
const grow = (b, pad) => (b ? { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad } : null);

async function menuBoard(browser, { base, cur }) {
  const count = (m) => `${m.icons.blank}/${m.icons.visible} ô icon trống`;
  await board(browser, 'main-menu-icons-p22.png', {
    frames: [before(base.png, 'Main Menu 390'), after(cur.png, 'Main Menu 390')],
    marks: [
      { frame: 0, boxes: base.buttons, label: `${count(base)} (${base.icons.size} px) lúc menu hiện, ${base.menuMs} ms` },
      {
        frame: 1,
        boxes: cur.buttons,
        label: `${cur.icons.placeholder}/${cur.icons.visible} ô chờ màu kem, ${count(cur)}, lúc menu hiện, ${cur.menuMs} ms`,
      },
    ],
    pad: 24,
    maxScale: 1.5,
    avoid: avoidTexts(base, cur),
    gutter: GUTTER,
    notes: [
      `Khổ 390×844, Main Menu ngay lúc main.ts đánh dấu cst:menu; atlas icon bị giữ lại (như mạng chậm, menu hiện trước khi atlas tải xong) để thấy đúng trạng thái lần tải đầu. Đếm ô .ic hiện trên màn lúc cst:menu: v0.4.0 ${base.icons.blank} trống / ${base.icons.placeholder} ô chờ; P22 ${cur.icons.blank} trống / ${cur.icons.placeholder} ô chờ. P22 tải atlas @1x trước, atlas @2x chỉ tải sau khi cảnh 3D hiện (cst:world).`,
    ],
  });
}

async function khoBoard(browser, out, { base, cur }) {
  const b = base.kho;
  const a = cur.kho;
  const px = (n) => Math.round(n ?? 0);
  const covered = b.suggestCover ? `nút Gợi ý bị .${b.suggestCover} che` : 'nút Gợi ý vẫn bấm được';
  await board(browser, out, {
    frames: [before(base.png, 'Kho 390'), after(cur.png, 'Kho 390')],
    marks: [
      { frame: 0, boxes: [b.foot], label: `Chân bảng ${b.sticky ? 'dính' : 'cuộn'} cao ${px(b.foot?.h)} px trên thân ${px(b.body?.h)} px: ${covered}, ${b.rowsSeen}/${b.rows} dòng hàng chạm được` },
      { frame: 1, boxes: [a.suggest], label: a.suggestCover ? `Nút Gợi ý vẫn bị .${a.suggestCover} che` : 'Nút Gợi ý (Auto-restock) chạm được' },
      { frame: 1, boxes: [a.list], label: `${a.rowsSeen}/${a.rows} dòng hàng chạm được; chân bảng ${px(a.foot?.h)} px ${a.sticky ? 'vẫn dính' : 'cuộn theo sau danh sách'}` },
    ],
    include: [b.panel, a.panel],
    pad: 16,
    maxScale: 1.5,
    avoid: avoidTexts(base, cur),
    gutter: GUTTER,
    notes: [
      `Khổ 390×844, sáng ngày ${SAVE_DAY} của ván Vừa, seed ${SEED} (ván review:p22), HUD 4 hàng, bảng Kho vừa mở. Thân bảng ${px(b.body?.h)} px (v0.4.0) / ${px(a.body?.h)} px (P22). P22: thân dưới 30rem thì chân bảng không dính mà cuộn sau danh sách; desktop và tablet vẫn dính.`,
    ],
  });
}

/** Board marks for a close-up, or a `!!` and no frame when the subject never showed up. */
function closeFrames(out, shots) {
  const missing = shots.filter((s) => !s.shot).map((s) => s.name);
  if (missing.length > 0) console.warn(`!! ${out}: no subject within ${HUNT_MS / 1000} s for ${missing.join(', ')}`);
  return shots.filter((s) => s.shot);
}

async function actorBoard(browser, out, frames, notes) {
  if (frames.length === 0) return false;
  await board(browser, out, {
    frames: frames.map((f) => (f.side === 'before' ? before : after)(f.shot.png, f.title)),
    marks: frames.flatMap((f, frame) => f.marks.map((m) => ({ frame, ...m }))),
    include: frames.map((f) => f.shot.subject.body),
    pad: 24,
    maxScale: 2,
    notes,
  });
  return true;
}

/** One board per fixed id of the review; returns the files written. */
async function fixedBoards(browser, fixed, { kho, actors }) {
  const files = [];
  const lift = (s, arm) => deg(-s.angles[`arm${arm}X`]);
  const builders = {
    'layout-blocked-suggest-390': async (out) => {
      await khoBoard(browser, out, kho);
      return true;
    },
    'actors-persona-motion': (out) =>
      actorBoard(
        browser,
        out,
        closeFrames(out, [
          { name: 'v0.4.0 office', side: 'before', title: 'Dân văn phòng chờ', shot: actors.base.office },
          { name: 'P22 office', side: 'after', title: 'Dân văn phòng chờ', shot: actors.cur.office },
          { name: 'v0.4.0 student', side: 'before', title: 'Sinh viên chờ', shot: actors.base.student },
          { name: 'P22 student', side: 'after', title: 'Sinh viên chờ', shot: actors.cur.student },
        ]).map((f) => {
          const s = f.shot.subject;
          const office = f.title.startsWith('Dân');
          const label = office
            ? f.side === 'before'
              ? `Tay phải ${lift(s, 'R')}°, đầu cúi ${deg(s.angles.headX)}°: dáng chờ chung`
              : `Cầm điện thoại: tay phải nâng ${lift(s, 'R')}°, đầu cúi ${deg(s.angles.headX)}°`
            : f.side === 'before'
              ? `Tay ${lift(s, 'L')}°, thân ${deg(s.angles.lean)}°: dáng chờ chung`
              : `Tay đút túi sau ${-lift(s, 'L')}°, ngả người ${-deg(s.angles.lean)}°`;
          return { ...f, marks: [{ boxes: [grow(office ? s.armR : s.arms, 4)], label }] };
        }),
        ['Giờ cao điểm sáng ngày 2 (không thuê nhân viên nên có hàng chờ), cùng ván và seed, camera nhìn cả người khách đang đứng chờ, cắt bỏ mọi thứ phía trước. Khách được chọn theo phụ kiện: cặp nâu (dân văn phòng), balo xanh (sinh viên). Góc tay, đầu và thân đọc từ khung xương ở đúng khung hình. Dáng đi riêng (bước ngắn, nhún, chậm) chỉ thấy khi chuyển động; tốc độ đi và đường đi không đổi.'],
      ),
    'actors-persona-accessory': (out) => {
      const kinds = (who) => {
        const seen = new Set(Object.values(actors[who]).flatMap((s) => s?.subject.seenKinds ?? []));
        return seen.size;
      };
      const size = (s) => (s.accSize ? `${metres(s.accSize[0])}×${metres(s.accSize[1])} m` : '');
      return actorBoard(
        browser,
        out,
        closeFrames(out, [
          { name: 'v0.4.0 no accessory', side: 'before', title: 'Khách quen / gia đình', shot: actors.base.plain, mark: (s) => ({ boxes: [grow(s.head, 4)], label: 'Không phụ kiện: khách quen và gia đình trông như nhau' }) },
          { name: 'P22 regular', side: 'after', title: 'Khách quen', shot: actors.cur.regular, mark: (s) => ({ boxes: [grow(s.acc, 4)], label: `Mũ len tím ${size(s)}, che tóc` }) },
          { name: 'P22 family', side: 'after', title: 'Gia đình', shot: actors.cur.family, mark: (s) => ({ boxes: [grow(s.acc, 4)], label: `Túi tote vàng ${size(s)} ở tay trái` }) },
        ]).map((f) => ({ ...f, marks: [f.mark(f.shot.subject)] })),
        [`Giờ cao điểm sáng ngày 2, cùng ván và seed. Số loại phụ kiện thấy trên khách trong các khung đã chụp: v0.4.0 ${kinds('base')}, P22 ${kinds('cur')} (P22 có đủ 5 tính cách). Phụ kiện dùng chung một mesh của nhân vật và không đổ bóng, nên không thêm draw call ở bóng.`],
      );
    },
    'actors-impatient-silhouette': (out) =>
      actorBoard(
        browser,
        out,
        closeFrames(out, [
          { name: 'v0.4.0 impatient', side: 'before', title: 'Khách sốt ruột', shot: actors.base.impatient },
          { name: 'P22 impatient', side: 'after', title: 'Khách sốt ruột', shot: actors.cur.impatient },
        ]).map((f) => {
          const s = f.shot.subject;
          const label =
            f.side === 'before'
              ? `Tay phải ${lift(s, 'R')}°, tay trái ${lift(s, 'L')}°: chỉ nhịp chân (${deg(s.angles.legR)}° lúc chụp)`
              : `Khoanh tay: hai tay nâng ${lift(s, 'R')}° / ${lift(s, 'L')}°, nhịp chân ${deg(s.angles.legR)}° lúc chụp`;
          return { ...f, marks: [{ boxes: [grow(s.arms, 4)], label }] };
        }),
        ['Giờ cao điểm sáng ngày 2, cùng ván và seed: khách đứng chờ có mặt sốt ruột (lông mày nhíu). v0.4.0 chỉ nhịp chân tối đa 20° và liếc đồng hồ; P22 khoanh tay, nhịp chân tối đa 29°, mở tay xem đồng hồ mỗi vòng.'],
      ),
  };
  for (const item of fixed) {
    const out = `${item.id}-p22.png`;
    if (await builders[item.id](out)) files.push(out);
  }
  return files;
}

/** The fixed ids of the review lists; throws for one with no board, before anything is built. */
function readFixed(known) {
  const fixed = FIXED_LISTS.flatMap((f) => JSON.parse(readFileSync(join(REVIEW, f), 'utf8')).fixed ?? []);
  const unknown = fixed.filter((i) => !known.includes(i.id)).map((i) => i.id);
  if (unknown.length > 0) throw new Error(`no P22 board for ${unknown.join(', ')}: add a builder in scripts/capture-p22.mjs`);
  return fixed;
}

/** Close-ups each build hunts for at the peak. */
function actorWants(sim, after) {
  const base = { counterX: sim.counter.x, counterZ: sim.counter.z, accessories: ACCESSORIES, stillM: STILL_M, near: NEAR_COUNTER, seatedLeg: SEATED_LEG, ...BODY_SHOT };
  const faceOk = (s) => s.facing >= MIN_FACING && s.faceSeen >= MIN_SEEN;
  const wants = [
    { key: 'office', arg: { ...base, want: 'persona', persona: 'office', yaws: FRONT_YAWS }, accept: (s) => faceOk(s) && s.handsSeen[1] >= MIN_SEEN },
    { key: 'student', arg: { ...base, want: 'persona', persona: 'student', yaws: SIDE_YAWS }, accept: (s) => s.handsSeen.some((v) => v >= MIN_SEEN) },
    { key: 'impatient', arg: { ...base, want: 'impatient', yaws: FRONT_YAWS }, accept: (s) => faceOk(s) },
  ];
  if (after) {
    wants.push(
      { key: 'regular', arg: { ...base, want: 'acc', persona: 'regular', yaws: FRONT_YAWS }, accept: (s) => s.accSeen >= MIN_SEEN },
      { key: 'family', arg: { ...base, want: 'acc', persona: 'family', yaws: [...FRONT_YAWS, ...SIDE_YAWS] }, accept: (s) => s.accSeen >= MIN_SEEN },
    );
  } else wants.push({ key: 'plain', arg: { ...base, want: 'noacc', yaws: FRONT_YAWS }, accept: (s) => faceOk(s) });
  return wants;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const BUILDERS = ['layout-blocked-suggest-390', 'actors-persona-motion', 'actors-persona-accessory', 'actors-impatient-silhouette'];
  const fixed = readFixed(BUILDERS);
  const temps = [];
  const servers = [];
  let browser = null;
  const files = [];
  try {
    const { save, counter } = await loadMorning();
    const sim = { counter };
    console.log(`building v0.4.0 (${P22_BASE})…`);
    const baseRoot = buildRef(P22_BASE);
    temps.push(baseRoot);
    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });
    const cur = urlFor(PORT);
    const base = urlFor(BASE_PORT);

    progress('both', 'Main Menu at 390');
    const [curMenu, baseMenu] = await Promise.all([menuSession(browser, cur, 'P22'), menuSession(browser, base, 'v0.4.0')]);
    progress('both', `Kho at 390, day ${SAVE_DAY}`);
    const [curKho, baseKho] = await Promise.all([khoSession(browser, cur, save, 'P22'), khoSession(browser, base, save, 'v0.4.0')]);
    progress('both', `day ${SAVE_DAY} peak close-ups`);
    const [curActors, baseActors] = await Promise.all([
      actorSession(browser, cur, save, actorWants(sim, true), 'P22'),
      actorSession(browser, base, save, actorWants(sim, false), 'v0.4.0'),
    ]);

    progress('both', 'drawing boards');
    await menuBoard(browser, { base: baseMenu, cur: curMenu });
    files.push('main-menu-icons-p22.png');
    files.push(...(await fixedBoards(browser, fixed, { kho: { base: baseKho, cur: curKho }, actors: { base: baseActors, cur: curActors } })));
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  for (const f of files) console.log(`ok docs/media/${f} ${Math.round(statSync(join(OUT, f)).size / 1024)} kB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
