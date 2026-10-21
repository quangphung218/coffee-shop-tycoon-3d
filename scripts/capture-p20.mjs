// Captures the P20 before/after boards: the P19 release (96030ca) next to the
// working tree, same seed and camera, ringed where P20 changed. Run through
// `npm run media:p20` (builds first). Needs Playwright with Chromium and the
// git history back to P20_BASE; see docs/media.md.
//
// Reuses the preview/build/camera/board machinery of scripts/capture-media.mjs.
// Prints `!!` for a label with nothing to ring, a ring around a flat (empty)
// area, a label that covers text, a close-up whose subject never showed up,
// and a close-up whose head turns away from the camera or whose face (or, in
// the brew hands shot, a hand) is hidden behind something.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';
import {
  buildRef,
  cameraHome,
  captureSettingsForm,
  clockAt,
  cuboid,
  FIXED_NOW,
  freeze,
  makeBoard,
  measured,
  newContext,
  openMenu,
  OUT,
  PHONE,
  sceneSnapshot,
  sizeMb,
  startEasyDay,
  startPreview,
  thaw,
  urlFor,
  worldBox,
} from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The P19 release the boards compare against (git archive, git show). */
const P20_BASE = process.env.P20_BASE ?? '96030ca';
/** Legend names on every P20 board. */
const NAMES = { before: `P19 (${P20_BASE})`, after: 'P20' };
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
/** The P19 build is served on the next port. */
const BASE_PORT = PORT + 1;
/** Toasts would cover the panels in still images. */
const HIDE_TOASTS = '.toasts { display: none !important; }';
/** The 3D close-ups show the scene alone. */
const HIDE_UI = '.hud-layer, .toasts { display: none !important; }';
/** ~1.25x: the counter and tables fill the frame (matches capture-media peak). */
const ZOOM_WHEEL = -150;
/** A 4x day lasts about 2 minutes with a fast renderer; software WebGL is slower. */
const DAY_TIMEOUT_MS = 8 * 60_000;
/** How long the peak may take to show a barista brewing, or a customer with a mood. */
const SUBJECT_WAIT_MS = 60_000;
/** Day-1 staff hired so a barista stands at the counter during the peak. */
const HIRES = 3;
/** 1280 window used for the game boards, a little taller so the Daily Report fits. */
const DESK = { width: 1280, height: 800 };
/**
 * Window while only waiting for the game clock. Slow frames slow the day down
 * (each frame advances the sim by a capped step), so drawing a tiny window
 * between shots plays the day several times faster.
 */
const IDLE = { width: 320, height: 240 };
/** Shop name the New Game screen starts with; the prepared saves use it too. */
const SHOP_NAME = 'Coffee Shop';
/** The five pieces of equipment P20 adds (ToolId in src/sim/types.ts). */
const TOOL_IDS = ['grinder', 'pastry_case', 'blender', 'ice_maker', 'dishwasher'];
/** Labels go in a strip this wide right of each DOM frame, so they never sit on its text. */
const GUTTER = 280;
/** A ring whose pixels spread less than this (mean RGB standard deviation, 0–255) is around an empty area. */
const FLAT_SPREAD = 8;
/** A ring with less than this share of its box on the frame is around something scrolled or turned out of view. */
const MIN_ON_IMAGE = 0.6;

/**
 * Close-up framings (world units): orthographic height in view, camera pitch,
 * and either `keep`, how far in front of the target geometry is kept, or for a
 * person `margin`, how far in front of their nearest point (hands, face) the
 * cut starts. Everything nearer the camera (walls, the machine, the counter) is
 * cut by the near plane.
 */
// People are about 1.32 tall (rig.ts: hips 0.55, head 0.98–1.32). The camera
// looks straight into the face, level with it and just above both counter tops
// (back 0.9, front 1.0), so no counter top hides the chest. The machine the
// barista faces is cut away in front of their hands.
const BREW_SHOT = { height: 1.9, pitch: 0.04, margin: 0.08, targetY: 1.02, yawOffset: 0 };
const MOOD_SHOT = { height: 2, pitch: 0.04, margin: 0.08, targetY: 0.95, yawOffset: 0 };
const TOOLS_SHOT = { height: 4.6, pitch: 0.42, keep: 0.5, targetY: 1.15 };
/**
 * Brew close-up moments, by the left arm's swing (animations.ts 'brew': armLX
 * runs -0.85 → -1.35): hands down so the face and chest are clear, then both
 * hands up at the portafilter (tamp, pull).
 */
const BREW_MOMENTS = { face: { armLMin: -0.95 }, hands: { armLMax: -1.2 } };
/** Least head-to-camera cosine for a face that counts as turned to the camera (~45°). */
const MIN_FACING = 0.7;
/** Least share of the face box, and of each hand box, that is the person (not something in front). */
const MIN_FACE_SEEN = 0.6;
const MIN_HAND_SEEN = 0.3;
/** Blank bands (frame px) above, between and below the two HUD strips; the board labels go there, off the UI. */
const HUD_BANDS = [90, 100, 100];
/** Scene kept above and below each HUD strip. */
const HUD_STRIP_PAD = 14;
const HUD_BAND_FILL = '#efe4d3';

const shot = (page) => page.screenshot({ style: HIDE_TOASTS });

const START = Date.now();
/** Progress line with seconds since start, so a run stopped by a time limit shows where it was. */
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

/** One save file in localStorage form: key and JSON text. */
function saveText(save, state) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
  if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/**
 * Loads the sim of the working tree: the day-1 counter and machines (same for
 * every build), and two saves of that same day-1 game: one a point short of
 * level 2 (the day ends with a level-up), one at the top level with all five
 * new tools bought, plus where those tools stand.
 */
async function loadSim(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [state, upgrades, save, levels, data, footprints] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/upgrades.ts', '/src/save/save.ts', '/src/sim/data/levels.ts', '/src/sim/data/upgrades.ts', '/src/sim/nav/footprints.ts'].map((p) =>
        vite.ssrLoadModule(p),
      ),
    );
    const fresh = () => state.createNewGame(SHOP_NAME, 'easy', FIXED_NOW >>> 0);
    const layout = upgrades.getShopLayout(fresh());

    const levelUp = fresh();
    levelUp.xp = levels.xpToReach(2) - 1;

    const tooled = fresh();
    tooled.shopLevel = levels.LEVELS.length;
    tooled.xp = levels.xpToReach(tooled.shopLevel);
    tooled.money = 1_000_000_000;
    for (const id of TOOL_IDS) {
      const r = upgrades.buyUpgrade(tooled, id);
      if (!r.ok) throw new Error(`cannot buy ${id} for the media save: ${r.reason}`);
    }
    const tools = upgrades
      .getShopLayout(tooled)
      .machines.filter((m) => TOOL_IDS.includes(m.kind))
      .map((m) => ({ kind: m.kind, pos: m.pos, name: data.getUpgrade(m.kind).name, size: footprints.MACHINE_SIZE[m.kind] }));

    // The first locked row of the Nâng cấp panel (the Dụng cụ group comes first, sorted by unlock
    // level), so its group heading sits just above it; shown on the board of both builds.
    const unlock = (u) => levels.upgradeUnlockLevel(u.id);
    const lockedId = data.UPGRADES.filter((u) => u.category === 'equipment' && unlock(u) > 1).sort((a, b) => unlock(a) - unlock(b))[0]?.id ?? null;

    return JSON.parse(
      JSON.stringify({
        lockedId,
        counter: layout.counter,
        machines: layout.machines,
        tools,
        espressoSize: footprints.MACHINE_SIZE.espresso,
        saves: { levelUp: saveText(save, levelUp), tools: saveText(save, tooled) },
      }),
    );
  } finally {
    await vite.close();
  }
}

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

/** A game page with the fixed clock and settings, the three.js hook and, when given, a save in the autosave slot. */
async function gameContext(browser, viewport, save) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript(observeThreeWithRenderer);
  if (save) await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  return context;
}

/** From the Main Menu into day 1: the prepared save through Tiếp tục, else New Game on Easy. */
async function enterDay(page, url, save) {
  const newGame = await openMenu(page, url);
  if (!save) return startEasyDay(page, newGame);
  // The button's name also carries the slot detail ("Coffee Shop · Ngày 1").
  const resume = page.getByRole('button', { name: /^Tiếp tục/ });
  try {
    await resume.waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`no Tiếp tục on the Main Menu: the media save in ${save.key} did not load (wrong format for this build?)`);
  }
  await resume.click();
  await page.locator('[data-action="open"]').waitFor();
}

// --- In-page measurements (viewport CSS px, deviceScaleFactor 1). ---

/**
 * Every visible run of text on screen, as boxes. With `settingsForm` the boxes
 * are relative to the visible Cài đặt form (whose own screenshot is the frame).
 * Board labels must not cover these.
 */
function measureTexts(arg) {
  let root = document.body;
  let ox = 0;
  let oy = 0;
  if (arg?.settingsForm) {
    root = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
    if (!root) return [];
    const r = root.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
  }
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || el.closest('.toasts, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      if (!arg?.settingsForm && (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)) continue;
      out.push({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });
    }
  }
  return out;
}

/** HUD: the shop-level chip, the dock and its group dividers, and the bars they sit in (`hud`: the whole top HUD). */
function measureHud() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  return {
    level: rect(document.querySelector('.hud-level')),
    sep: rect(document.querySelector('.dock-sep')),
    seps: [...document.querySelectorAll('.dock-sep')].map(rect).filter(Boolean),
    hudLeft: rect(document.querySelector('.hud-left')),
    hud: rect(document.querySelector('.hud')),
    dock: rect(document.querySelector('.dock')),
  };
}

/** Việc panel: the daily-missions section (P20) and the plain checklist (both builds). */
function measureTasks() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const title = [...document.querySelectorAll('#ui-panel .section-title')].find((e) => /Nhiệm vụ/.test(e.textContent || ''));
  return {
    list: rect(document.querySelector('#ui-panel .stack[aria-label="Việc trong ngày"]')),
    missionsTitle: rect(title),
    firstMission: rect(document.querySelector('#ui-panel .mission')),
  };
}

/** Nâng cấp panel: a locked row's badge and its group heading (P20), or the same row's price (P19). */
function measureUpgrades(arg) {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  let id = arg.lockedId;
  if (!id) id = document.querySelector('#ui-panel .item.is-locked')?.getAttribute('data-upgrade') ?? null;
  const row = id ? document.querySelector(`#ui-panel .item[data-upgrade="${id}"]`) : null;
  const section = row?.closest('section');
  return {
    id,
    name: row?.querySelector('.item-title')?.textContent?.trim() ?? '',
    badge: rect(row?.querySelector('.badge') ?? row?.querySelector('.item-side')),
    groupTitle: rect(section?.querySelector('.section-title')),
    locked: !!row?.classList.contains('is-locked'),
  };
}

/** Daily Report: the tab strip, the summary money/customer numbers, the level-up band, the Chỉ số tab and its KPI cards. */
function measureReport() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  return {
    dialog: rect(document.querySelector('.rpt-layer:not([hidden]) [role="dialog"]') ?? document.querySelector('.rpt-layer:not([hidden]) .card')),
    tabs: rect(document.querySelector('.rpt-tabs')),
    money: rect(document.querySelector('[data-block="money"]')),
    customers: rect(document.querySelector('[data-block="customers"]')),
    levelUp: rect(document.querySelector('[data-block="level-up"]')),
    insightsTab: rect(document.querySelector('.rpt-tab[data-tab="insights"]')),
    kpis: rect(document.querySelector('.rpt-kpis')),
  };
}

/**
 * Cài đặt, measured against the visible form so the boxes land on the
 * full-height form screenshot: reduced-motion row and shortcuts details (P20),
 * or the old Đồ họa / Phím tắt groups (P19).
 */
function measureSettings() {
  const form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
  if (!form) return {};
  const fb = form.getBoundingClientRect();
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left - fb.left, y: r.top - fb.top, w: r.width, h: r.height } : null;
  };
  const title = (t) => [...form.querySelectorAll('.section-title')].find((e) => (e.textContent || '').trim() === t);
  return {
    motion: rect(form.querySelector('[data-setting="reducedMotion"]')?.closest('.set-row')),
    details: rect(form.querySelector('details.keys-details')),
    controls: rect(title('Điều khiển')),
    graphics: rect(title('Đồ họa')),
    keysSection: rect(title('Phím tắt')),
  };
}

/**
 * Runs in the page with the frame loop frozen. Finds the close-up subject
 * (`kind` 'brewer': the person behind the counter nearest the espresso
 * machine while it steams, at the brew `moment` when given; 'customer': a
 * customer whose face shows a mood, or on a build without moods the customer
 * nearest the counter; 'point': a fixed spot), aims the camera straight at
 * the face it turns, cuts everything in front of the person, and draws one
 * frame. Returns null when there is no subject yet. For a person it also
 * returns screen boxes (viewport CSS px) of the face, head, each hand and the
 * body, how squarely the head faces the camera (cosine), and the share of the
 * face and each hand box the person covers (the frame drawn again without
 * them: pixels that change are theirs; anything left unchanged hides them).
 */
function aimAt(arg) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const renderer = window.__mediaRenderer;
  if (!scene || !cam || !renderer) return null;
  const V = cam.position.constructor;
  const people = (scene.getObjectByName('actors')?.children ?? []).filter((o) => o.visible && o.name !== 'coins');
  // Character rig (src/render/actors/rig.ts): root > bounce > hips > torso > [body, apron, (neck,) armL, armR, head, …];
  // head > [head, hair, eyeL, eyeR, (face,) cap]; arm > [arm, hand, …] with the hand 0.4 below the shoulder. P19 has no neck or face.
  const rigOf = (o) => {
    const torso = o.children[0]?.children[0]?.children[2];
    if (!torso) return null;
    const groups = torso.children.filter((c) => c.isGroup);
    const head = groups.find((g) => g.children.length >= 5);
    const arms = groups.filter((g) => Math.abs(Math.abs(g.position.x) - 0.235) < 0.03).sort((a, b) => a.position.x - b.position.x);
    if (!head || arms.length !== 2) return null;
    const face = head.children[4]?.isMesh ? head.children[4] : null;
    return { apron: torso.children[1], head, face, armL: arms[0], armR: arms[1] };
  };
  let subject = null;
  let heading = 0;
  let others = [];
  const target = { x: 0, z: 0 };
  if (arg.kind === 'brewer') {
    const steam = scene.getObjectByName('machine-steam');
    if (steam && !steam.visible) return null;
    let best = Infinity;
    for (const o of people) {
      if (o.position.z > arg.counterZ - 0.3) continue;
      const d = Math.hypot(o.position.x - arg.machine.x, o.position.z - arg.machine.z);
      if (d < best) {
        best = d;
        subject = o;
      }
    }
    if (!subject || best > 1.3) return null;
    const swing = rigOf(subject)?.armL.rotation.x;
    if (arg.moment && swing === undefined) return null;
    if (arg.moment?.armLMin !== undefined && swing < arg.moment.armLMin) return null;
    if (arg.moment?.armLMax !== undefined && swing > arg.moment.armLMax) return null;
  } else if (arg.kind === 'customer') {
    const staffFace = people.map(rigOf).find((r) => r?.face && r.apron.visible)?.face.geometry;
    const customers = people.filter((o) => o.position.z > arg.counterZ + 0.3);
    const moody = staffFace ? customers.filter((o) => { const r = rigOf(o); return r?.face && !r.apron.visible && r.face.geometry !== staffFace; }) : [];
    const pool = arg.needMood ? moody : customers;
    const near = (o) => Math.hypot(o.position.x - arg.counterX, o.position.z - arg.counterZ);
    subject = pool.slice().sort((a, b) => near(a) - near(b))[0] ?? null;
    if (!subject) return null;
    others = moody.filter((o) => o !== subject).map((o) => ({ x: o.position.x, z: o.position.z }));
  }
  if (subject) {
    target.x = subject.position.x;
    target.z = subject.position.z;
    heading = subject.rotation.y;
  } else {
    target.x = arg.point.x;
    target.z = arg.point.z;
  }
  const D = 40;
  const yaw = heading + (arg.yawOffset ?? 0);
  const cp = Math.cos(arg.pitch);
  cam.position.set(target.x + Math.sin(yaw) * cp * D, arg.targetY + Math.sin(arg.pitch) * D, target.z + Math.cos(yaw) * cp * D);
  cam.lookAt(target.x, arg.targetY, target.z);
  cam.zoom = (cam.top - cam.bottom) / arg.height;
  cam.near = D - (arg.keep ?? 0.5);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const rig = subject ? rigOf(subject) : null;
  if (subject && !rig) return null;
  if (!rig) {
    renderer.render(scene, cam);
    return { x: target.x, z: target.z, heading, others };
  }

  subject.updateMatrixWorld(true);
  const local = (obj, x, y, z) => obj.localToWorld(new V(x, y, z));
  const dir = cam.getWorldDirection(new V());
  const depth = (p) => p.clone().sub(cam.position).dot(dir);
  // Points of the person in world space: face features (eyes 0.16, brows 0.2, mouth 0.07 up the head, front 0.14), head, hands, body front.
  const facePts = [];
  for (const x of [-0.12, 0.12]) for (const y of [0.04, 0.24]) facePts.push(local(rig.head, x, y, 0.15));
  const headPts = [];
  for (const x of [-0.16, 0.16]) for (const y of [0, 0.34]) for (const z of [-0.15, 0.15]) headPts.push(local(rig.head, x, y, z));
  const handPts = [rig.armL, rig.armR].map((arm) => {
    const pts = [];
    for (const x of [-0.06, 0.06]) for (const y of [-0.46, -0.34]) for (const z of [-0.06, 0.06]) pts.push(local(arm, x, y, z));
    return pts;
  });
  const bodyPts = [];
  for (const x of [-0.4, 0.4]) for (const y of [0.4, 1.4]) for (const z of [-0.3, 0.3]) bodyPts.push(local(subject, x, y, z));
  // Cut just in front of the person's nearest point, so nothing between them and the camera is drawn.
  const nearest = Math.min(...[...facePts, ...headPts, ...handPts.flat()].map(depth), ...[-0.2, 0.2].map((x) => depth(local(subject, x, 0.7, 0.22))));
  cam.near = Math.max(0.05, nearest - arg.margin);
  cam.updateProjectionMatrix();

  // Screen boxes in viewport CSS px and in canvas px.
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
  const faceBox = box(facePts);
  const handBoxes = handPts.map(box);
  const grab = () => {
    renderer.render(scene, cam);
    const c = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d', { willReadFrequently: true });
    c.drawImage(canvas, 0, 0);
    return c;
  };
  const shown = grab();
  subject.visible = false;
  const hidden = grab();
  subject.visible = true;
  renderer.render(scene, cam);
  const seen = (b) => {
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
  };
  const forward = local(rig.head, 0, 0, 1).sub(local(rig.head, 0, 0, 0)).normalize();
  return {
    x: target.x,
    z: target.z,
    heading,
    others,
    face: faceBox,
    head: box(headPts),
    hands: handBoxes,
    body: box(bodyPts),
    facing: -forward.dot(dir),
    faceSeen: seen(faceBox),
    handsSeen: handBoxes.map(seen),
  };
}

/** True when a close-up shows the face squarely and unhidden, and (with `hands`) both hands. */
function clearShot(s, { hands = false } = {}) {
  if (s.facing === undefined) return true;
  return s.facing >= MIN_FACING && s.faceSeen >= MIN_FACE_SEEN && (!hands || s.handsSeen.every((v) => v >= MIN_HAND_SEEN));
}

/** `!!` lines for a close-up whose face turns away or is hidden, or (with `hands`) whose hands are hidden. */
function warnShot(out, who, s, { hands = false } = {}) {
  if (s.facing === undefined) return;
  if (s.facing < MIN_FACING) console.warn(`!! ${out}: ${who}: the head turns away from the camera (cos ${s.facing.toFixed(2)} < ${MIN_FACING})`);
  if (s.faceSeen < MIN_FACE_SEEN) console.warn(`!! ${out}: ${who}: the face is hidden (${Math.round(s.faceSeen * 100)}% of its box is the person, < ${MIN_FACE_SEEN * 100}%)`);
  if (hands && s.handsSeen.some((v) => v < MIN_HAND_SEEN)) console.warn(`!! ${out}: ${who}: a hand is hidden (${s.handsSeen.map((v) => `${Math.round(v * 100)}%`).join(', ')} of the hand boxes is the person, < ${MIN_HAND_SEEN * 100}%)`);
}

/** The union of screen boxes. */
function unionBox(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
}

/** A screen box grown by `pad` px on every side. */
const grow = (b, pad) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });

/** Puts the near plane back; the camera controller re-aims on the next frame. */
function restoreCamera() {
  const cam = window.__mediaCamera;
  if (!cam) return;
  cam.near = 0.1;
  cam.updateProjectionMatrix();
}

/**
 * Freezes the scene, aims a close-up (aimAt), takes it without the UI and
 * reads its camera; retries until the subject shows up and `accept(subject)`
 * holds. Past SUBJECT_WAIT_MS it returns the last shot with the subject (the
 * board warns about it), or null when the subject never showed up.
 */
async function closeUp(page, arg, accept = () => true) {
  const end = Date.now() + SUBJECT_WAIT_MS;
  let last = null;
  while (Date.now() < end) {
    await freeze(page);
    try {
      const subject = await page.evaluate(aimAt, arg);
      if (subject) {
        const png = await page.screenshot({ style: HIDE_UI });
        last = { png, scene: await sceneSnapshot(page), subject };
        if (accept(subject)) return last;
      }
    } finally {
      await page.evaluate(restoreCamera);
      await thaw(page);
    }
    await sleep(400);
  }
  return last;
}

/** For each box of a frame PNG (base64): the share of it on the image, and the mean RGB standard deviation of that part (null when none is on it). */
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
    const onImage = (w * h) / Math.max(1, b.w * b.h);
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
    return { onImage, spread: spread / 3 };
  });
}

/** Runs in the browser: the `strips` ({ y0, y1 }) of a frame PNG (base64) stacked with blank `gaps` above, between and below them, as a PNG (base64). */
async function stackStrips({ png, strips, gaps, fill }) {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
  const height = gaps.reduce((a, g) => a + g, 0) + strips.reduce((a, s) => a + s.y1 - s.y0, 0);
  const canvas = new OffscreenCanvas(img.width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, img.width, height);
  let y = gaps[0];
  strips.forEach((s, i) => {
    ctx.drawImage(img, 0, s.y0, img.width, s.y1 - s.y0, 0, y, img.width, s.y1 - s.y0);
    y += s.y1 - s.y0 + gaps[i + 1];
  });
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * The HUD frames of both builds cut to the top HUD row and the dock (the same
 * strips for both, so they line up) and stacked between HUD_BANDS blank bands.
 * Returns each build's PNG with its chip and dock-divider boxes moved onto
 * it, the strips' boxes (`ui`, what labels must not cover) and the span of
 * the HUD row and dock with the bands (`span`, the board's crop).
 */
async function stackHud(browser, baseHud, curHud) {
  const all = [baseHud.boxes, curHud.boxes];
  const bottom = (b) => b.y + b.h;
  const tops = all.flatMap((b) => [b.hud, b.hudLeft, b.level]).filter(Boolean);
  const docks = all.map((b) => b.dock).filter(Boolean);
  const height = DESK.height;
  const rowEnd = Math.min(height, Math.ceil(Math.max(0, ...tops.map(bottom)) + HUD_STRIP_PAD));
  const dockStart = Math.max(rowEnd, Math.floor(Math.min(height, ...docks.map((b) => b.y)) - HUD_STRIP_PAD));
  const dockEnd = Math.min(height, Math.ceil(Math.max(dockStart, ...docks.map(bottom)) + HUD_STRIP_PAD));
  const strips = [{ y0: 0, y1: rowEnd }, { y0: dockStart, y1: dockEnd }];
  // Where each strip starts on the stacked image.
  const at = [];
  let y = HUD_BANDS[0];
  for (const [i, s] of strips.entries()) {
    at.push(y);
    y += s.y1 - s.y0 + HUD_BANDS[i + 1];
  }
  // A frame box moved onto the stacked image; null when it is not inside one strip.
  const move = (b) => {
    if (!b) return null;
    const i = strips.findIndex((s) => b.y >= s.y0 && bottom(b) <= s.y1);
    return i < 0 ? null : { ...b, y: at[i] + b.y - strips[i].y0 };
  };
  const page = await browser.newPage();
  try {
    const stack = async (hud) => ({
      png: Buffer.from(await page.evaluate(stackStrips, { png: hud.png.toString('base64'), strips, gaps: HUD_BANDS, fill: HUD_BAND_FILL }), 'base64'),
      level: move(hud.boxes.level),
      seps: hud.boxes.seps.map(move),
    });
    const width = DESK.width;
    const xs = all.flatMap((b) => [b.hud, b.hudLeft, b.level, b.dock]).filter(Boolean);
    const x0 = Math.min(...xs.map((b) => b.x));
    const x1 = Math.max(...xs.map((b) => b.x + b.w));
    return {
      before: await stack(baseHud),
      after: await stack(curHud),
      ui: strips.map((s, i) => ({ x: 0, y: at[i], w: width, h: s.y1 - s.y0 })),
      span: { x: x0, y: 0, w: x1 - x0, h: y },
    };
  } finally {
    await page.close();
  }
}

// --- Capture sessions. ---

/**
 * Plays day 1 on Easy on one build: the HUD, Việc and Nâng cấp panels in the
 * preparation phase, then at the peak the scene, a close-up of the barista at
 * the espresso machine and of a customer, and the Daily Report (summary, and
 * the Chỉ số tab where it exists) once the day ends. `save` starts P20 a
 * point short of level 2 so the report shows the level-up band. `lockedId`
 * picks the same locked upgrade on both builds.
 */
async function gameSession(browser, url, sim, { who, lockedId, save, needMood, brewMoments }) {
  const context = await gameContext(browser, DESK, save);
  const page = await context.newPage();
  const dockBtn = (id) => page.locator(`.dock [data-panel="${id}"]`);
  const panelBody = () => page.locator('#ui-panel .panel-body');
  const texts = () => page.evaluate(measureTexts);
  const idle = () => page.setViewportSize(IDLE);
  const wake = async () => {
    await page.setViewportSize(DESK);
    await sleep(800);
  };
  try {
    await enterDay(page, url, save);
    progress(who, 'day 1, preparation');

    // HUD + dock during preparation.
    await sleep(500);
    const hud = { png: await shot(page), boxes: await page.evaluate(measureHud), texts: await texts() };

    // Việc: scroll the missions into view where they exist.
    await dockBtn('tasks').click();
    await panelBody().waitFor();
    await page.locator('#ui-panel .mission').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
    const tasks = { png: await shot(page), boxes: await page.evaluate(measureTasks), texts: await texts() };
    await dockBtn('tasks').click();

    // Nâng cấp: scroll the locked row into view.
    await dockBtn('upgrades').click();
    await panelBody().waitFor();
    const upgProbe = await page.evaluate(measureUpgrades, { lockedId: lockedId ?? null });
    if (upgProbe.id) await page.evaluate((id) => document.querySelector(`#ui-panel .item[data-upgrade="${id}"]`)?.scrollIntoView({ block: 'center' }), upgProbe.id);
    await sleep(400);
    const upgrades = { png: await shot(page), boxes: await page.evaluate(measureUpgrades, { lockedId: upgProbe.id }), texts: await texts() };
    await dockBtn('upgrades').click();

    // Hire, stock and open so the day runs with served customers.
    await dockBtn('staff').click();
    for (let i = 0; i < HIRES; i++) {
      await page.locator('#ui-panel [data-action="hire"]').first().click();
      await sleep(250);
    }
    await dockBtn('staff').click();
    await dockBtn('inventory').click();
    await page.locator('#ui-panel [data-action="suggest"]').click();
    await sleep(300);
    await page.locator('#ui-panel [data-action="buy"]').click();
    await dockBtn('inventory').click();

    await page.locator('[data-action="open"]').click();
    await page.locator('[data-speed="4"]').click();
    progress(who, 'opened at 4x');
    await idle();

    // Peak: the scene, then the two close-ups.
    await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: DAY_TIMEOUT_MS });
    await clockAt(page, '12:00');
    await wake();
    progress(who, 'peak, 12:00');
    await cameraHome(page, ZOOM_WHEEL);
    let peakPng;
    const peakSnap = await measured(page, async () => (peakPng = await shot(page)));
    const peak = { png: peakPng, scene: peakSnap.scene, texts: await texts() };
    const espresso = sim.machines.find((m) => m.kind === 'espresso') ?? sim.machines[0];
    const counter = { counterX: sim.counter.pos.x, counterZ: sim.counter.pos.z };
    const brewArg = { kind: 'brewer', machine: espresso.pos, ...counter, ...BREW_SHOT };
    // P20 at two moments of the brew (hands down: the face; hands up at the machine); P19 at any moment.
    const brew = brewMoments
      ? { face: await closeUp(page, { ...brewArg, moment: BREW_MOMENTS.face }, (s) => clearShot(s)), hands: await closeUp(page, { ...brewArg, moment: BREW_MOMENTS.hands }, (s) => clearShot(s, { hands: true })) }
      : { face: await closeUp(page, brewArg, (s) => clearShot(s)) };
    progress(who, brew.face ? 'barista close-up' : 'no barista brewing');
    const mood = await closeUp(page, { kind: 'customer', needMood, ...counter, ...MOOD_SHOT }, (s) => clearShot(s));
    progress(who, mood ? 'customer close-up' : 'no customer with a mood');
    await cameraHome(page, ZOOM_WHEEL);
    await idle();

    // Daily Report: the summary (numbers, and the level-up band where it exists), then the Chỉ số tab.
    const report = page.locator('.rpt-layer:not([hidden])');
    await report.waitFor({ timeout: DAY_TIMEOUT_MS });
    await wake();
    progress(who, 'Daily Report');
    await page.locator('[data-block="money"]').first().waitFor();
    await sleep(1200);
    // The dialog opens scrolled to its buttons; bring the top of the summary (level-up band, then the numbers) into view.
    await page.evaluate(() => (document.querySelector('[data-block="level-up"]') ?? document.querySelector('[data-block="money"]'))?.scrollIntoView({ block: 'center' }));
    await sleep(300);
    const summary = { png: await shot(page), boxes: await page.evaluate(measureReport), texts: await texts() };
    let insights = null;
    if ((await page.locator('.rpt-tab[data-tab="insights"]').count()) > 0) {
      await page.locator('.rpt-tab[data-tab="insights"]').click();
      await page.locator('.rpt-kpis').waitFor();
      await sleep(600);
      insights = { png: await shot(page), boxes: await page.evaluate(measureReport), texts: await texts() };
    }

    return { hud, tasks, upgrades, peak, brew, mood, summary, insights, lockedId: upgrades.boxes?.id ?? upgProbe.id };
  } finally {
    await context.close();
  }
}

/** The back counter head-on in the preparation phase: P20 from the save with all five tools, P19 as a new game. */
async function toolsSession(browser, url, sim, save) {
  const context = await gameContext(browser, DESK, save);
  const page = await context.newPage();
  try {
    await enterDay(page, url, save);
    await sleep(1500);
    const xs = [...sim.tools.map((t) => t.pos.x), ...sim.machines.map((m) => m.pos.x)];
    const point = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: sim.machines[0].pos.z };
    const view = await closeUp(page, { kind: 'point', point, ...TOOLS_SHOT });
    if (!view) throw new Error('tools close-up: no three.js frame on #scene');
    return view;
  } finally {
    await context.close();
  }
}

/** The dock at 390 px in the preparation phase of a new game. */
async function dockSession(browser, url) {
  const context = await newContext(browser, { viewport: PHONE });
  const page = await context.newPage();
  try {
    await startEasyDay(page, await openMenu(page, url));
    await sleep(600);
    return { png: await shot(page), boxes: await page.evaluate(measureHud), texts: await page.evaluate(measureTexts) };
  } finally {
    await context.close();
  }
}

/** The Cài đặt screen at 390 px and 1280 px, the window grown so the whole form is on screen. */
async function settingsSession(browser, url) {
  const context = await newContext(browser, { viewport: PHONE });
  const page = await context.newPage();
  // By accessible name (aria-labelledby), so the hidden new-game form never matches.
  const form = page.getByRole('form', { name: 'Cài đặt' });
  const grab = (width, minHeight) =>
    captureSettingsForm(page, form, {
      width,
      minHeight,
      measure: async () => ({ boxes: await page.evaluate(measureSettings), texts: await page.evaluate(measureTexts, { settingsForm: true }) }),
    });
  try {
    await openMenu(page, url);
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page.getByText('Âm thanh', { exact: true }).waitFor();
    const at390 = await grab(PHONE.width, PHONE.height);
    const at1280 = await grab(DESK.width, DESK.height);
    return { at390, at1280 };
  } finally {
    await context.close();
  }
}

// --- Boards. ---

/** makeBoard with the P20 legend, after warning `!!` for every ring around a flat, empty-looking area. */
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
}

/** Text boxes of each frame, for the board's label placement. */
const avoidTexts = (...frames) => frames.map((f, frame) => ({ frame, boxes: f.texts ?? [] }));

async function makeP20Boards(browser, { cur, base, curSet, baseSet, curTools, baseTools, curDock, baseDock, sim }) {
  const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
  const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
  const files = [];
  const put = async (out, opts) => {
    await board(browser, out, opts);
    files.push(out);
  };

  // HUD + dock: the top HUD row and the dock cut out and stacked between blank bands, so labels and their leaders stay off the UI.
  const hud = await stackHud(browser, base.hud, cur.hud);
  const seps = hud.after.seps;
  const sepNames = ['Vận hành | Phát triển', 'Phát triển | Đánh giá'];
  await put('hud-dock-p20.png', {
    frames: [before(hud.before.png, 'HUD + dock'), after(hud.after.png, 'HUD + dock')],
    marks: [
      { frame: 1, boxes: [hud.after.level], label: 'Chip "Cấp N" + thanh XP (mới)' },
      ...(seps.length === sepNames.length
        ? seps.map((s, i) => ({ frame: 1, boxes: [s], label: `Vạch chia ${sepNames[i]} (mới)` }))
        : [{ frame: 1, boxes: seps, label: 'Vạch chia nhóm dock (mới)' }]),
    ],
    include: [hud.span],
    pad: 16,
    avoid: [0, 1].map((frame) => ({ frame, boxes: hud.ui })),
    notes: ['Khổ 1280×800, pha Chuẩn bị, cùng seed; cắt lấy hàng HUD trên và dock, phần cảnh giữa bỏ đi, nhãn nằm ở dải trống ngoài giao diện. P20 nạp ván ngày 1 thiếu 1 XP tới cấp 2 nên thanh XP gần đầy. P19 không có chip cấp quán và vạch chia nhóm dock.'],
  });

  // Dock at 390 px.
  await put('dock-390-p20.png', {
    frames: [before(baseDock.png, 'Dock 390 px'), after(curDock.png, 'Dock 390 px')],
    marks: [
      { frame: 0, boxes: [baseDock.boxes.dock], label: 'P19: một dải nút, không chia nhóm' },
      { frame: 1, boxes: [curDock.boxes.dock], label: 'Dock sau khi sửa: vạch chia không chiếm ô, Đánh giá nhóm riêng' },
    ],
    include: [baseDock.boxes.dock, curDock.boxes.dock],
    pad: 24,
    maxScale: 2,
    avoid: avoidTexts(baseDock, curDock),
    gutter: GUTTER,
    notes: ['Khổ 390×844, pha Chuẩn bị của ván mới, cùng seed.'],
  });

  // Việc + nhiệm vụ.
  await put('tasks-missions-p20.png', {
    frames: [before(base.tasks.png, 'Việc'), after(cur.tasks.png, 'Việc')],
    marks: [
      { frame: 0, boxes: [base.tasks.boxes.list], label: 'P19: chỉ có checklist việc' },
      { frame: 1, boxes: [cur.tasks.boxes.missionsTitle], label: 'Mục "Nhiệm vụ hôm nay" (mới)' },
      { frame: 1, boxes: [cur.tasks.boxes.firstMission], label: 'Thẻ nhiệm vụ: tên · tiến độ · thưởng' },
    ],
    pad: 24,
    avoid: avoidTexts(base.tasks, cur.tasks),
    gutter: GUTTER,
    notes: ['Khổ 1280×800, bảng Việc lúc Chuẩn bị. P20 thêm 3 nhiệm vụ ngày, tự chấm cuối ngày.'],
  });

  // Nâng cấp + khóa.
  await put('upgrades-locks-p20.png', {
    frames: [before(base.upgrades.png, 'Nâng cấp'), after(cur.upgrades.png, 'Nâng cấp')],
    marks: [
      { frame: 0, boxes: [base.upgrades.boxes.badge], label: `"${cur.upgrades.boxes.name}": mua được ngay (không khóa)` },
      { frame: 1, boxes: [cur.upgrades.boxes.badge], label: 'Nhãn "Mở ở cấp N" (khóa theo cấp)' },
      { frame: 1, boxes: [cur.upgrades.boxes.groupTitle], label: 'Nhóm Dụng cụ / Không gian / Trang trí (mới)' },
    ],
    pad: 24,
    avoid: avoidTexts(base.upgrades, cur.upgrades),
    gutter: GUTTER,
    notes: ['Khổ 1280×800, bảng Nâng cấp ở Cấp 1. P20 chia nhóm theo loại và khóa món chưa tới cấp.'],
  });

  // Daily Report: P19 summary with its numbers next to P20's Chỉ số tab, and next to P20's summary with the level-up band.
  const p19Numbers = { frame: 0, boxes: [base.summary.boxes.money, base.summary.boxes.customers], label: 'P19: tab Tổng kết, tiền và khách trong ngày' };
  if (cur.insights) {
    await put('report-insights-p20.png', {
      frames: [before(base.summary.png, 'Báo cáo · Tổng kết'), after(cur.insights.png, 'Báo cáo · Chỉ số')],
      marks: [
        p19Numbers,
        { frame: 1, boxes: [cur.insights.boxes.insightsTab], label: 'Tab "Chỉ số" (mới)' },
        { frame: 1, boxes: [cur.insights.boxes.kpis], label: 'KPI ngành F&B có ngưỡng Tốt / Cần chú ý' },
      ],
      include: [base.summary.boxes.dialog, cur.insights.boxes.dialog],
      pad: 16,
      avoid: avoidTexts(base.summary, cur.insights),
      gutter: GUTTER,
      notes: ['Cuối ngày 1, cùng seed. P19 chỉ có Tổng kết + Đánh giá; P20 thêm tab Chỉ số với food cost, lương, prime cost, lấp ghế…'],
    });
  } else console.warn('!! report-insights-p20.png: P20 report has no Chỉ số tab');
  await put('report-levelup-p20.png', {
    frames: [before(base.summary.png, 'Báo cáo · Tổng kết'), after(cur.summary.png, 'Báo cáo · Tổng kết')],
    marks: [p19Numbers, { frame: 1, boxes: [cur.summary.boxes.levelUp], label: 'Băng "Lên cấp N" và món mở khóa (mới)' }],
    include: [base.summary.boxes.dialog, cur.summary.boxes.dialog],
    pad: 16,
    avoid: avoidTexts(base.summary, cur.summary),
    gutter: GUTTER,
    notes: ['Cuối ngày 1. P20 nạp ván ngày 1 thiếu 1 XP tới cấp 2, nên hết ngày lên cấp 2 và băng Lên cấp hiện đầu tab Tổng kết.'],
  });

  // Cài đặt, one board per width.
  for (const [name, b, a] of [
    ['settings-390-p20.png', baseSet.at390, curSet.at390],
    ['settings-1280-p20.png', baseSet.at1280, curSet.at1280],
  ]) {
    await put(name, {
      frames: [before(b.png, 'Cài đặt'), after(a.png, 'Cài đặt')],
      marks: [
        { frame: 0, boxes: [b.boxes.graphics], label: 'Nhóm "Đồ họa"' },
        { frame: 0, boxes: [b.boxes.keysSection], label: '"Phím tắt" là mục riêng' },
        { frame: 1, boxes: [a.boxes.motion], label: '"Giảm chuyển động" (mới)' },
        { frame: 1, boxes: [a.boxes.controls], label: 'Nhóm "Điều khiển" (gộp phím + xoay)' },
        { frame: 1, boxes: [a.boxes.details], label: 'Phím tắt gộp trong ô xổ' },
      ],
      pad: 20,
      maxScale: 1,
      avoid: avoidTexts(b, a),
      gutter: GUTTER,
      notes: [`Màn Cài đặt, chụp cả form (cửa sổ cao ${b.height}/${a.height} px để không hàng nào bị cắt). P20 đổi "Đồ họa"→"Hiển thị" (thêm Giảm chuyển động), tách "Điều khiển", thu "Phím tắt" vào ô xổ.`],
    });
  }

  // Barista close-up while the espresso machine steams: camera level with their face, the machine cut away in front of their hands.
  const brewShots = [base.brew.face, cur.brew.face, cur.brew.hands];
  if (brewShots.every(Boolean)) {
    const [p19, face, hands] = brewShots.map((s) => s.subject);
    warnShot('brew-closeup-p20.png', NAMES.before, p19);
    warnShot('brew-closeup-p20.png', `${NAMES.after} (mặt)`, face);
    warnShot('brew-closeup-p20.png', `${NAMES.after} (tay)`, hands, { hands: true });
    await put('brew-closeup-p20.png', {
      frames: [before(base.brew.face.png, 'Pha chế'), after(cur.brew.face.png, 'Pha chế · mặt'), after(cur.brew.hands.png, 'Pha chế · tay')],
      marks: [
        { frame: 0, boxes: [grow(p19.face, 4)], label: 'P19: mặt chỉ 2 chấm mắt' },
        { frame: 0, boxes: [grow(unionBox(p19.hands), 4)], label: 'P19: một vòng tay chung' },
        { frame: 1, boxes: [grow(face.face, 4)], label: 'Lông mày + miệng (mới)' },
        { frame: 2, boxes: [grow(unionBox(hands.hands), 4)], label: 'Hai tay lên máy: nén, chiết' },
      ],
      include: brewShots.map((s) => s.subject.body),
      pad: 24,
      maxScale: 2,
      notes: [
        'Giờ cao điểm, lúc máy espresso đang pha, cùng seed. Camera nhìn thẳng vào mặt nhân viên đứng ở máy, ngang tầm mặt và trên mặt hai quầy (quầy không che ngực); máy và quầy sau phía trước tay được cắt bỏ. P20 chụp hai thời điểm của một vòng pha: tay hạ (thấy rõ mặt) và hai tay đưa lên máy.',
      ],
    });
  } else console.warn(`!! brew-closeup-p20.png: no barista brewing at the espresso machine within ${SUBJECT_WAIT_MS / 1000} s (${[!base.brew.face && NAMES.before, !cur.brew.face && `${NAMES.after} mặt`, !cur.brew.hands && `${NAMES.after} tay`].filter(Boolean).join(', ')})`);

  // A customer with a mood, camera straight at their face.
  if (cur.mood && base.mood) {
    warnShot('customer-mood-p20.png', NAMES.before, base.mood.subject);
    warnShot('customer-mood-p20.png', NAMES.after, cur.mood.subject);
    await put('customer-mood-p20.png', {
      frames: [before(base.mood.png, 'Khách'), after(cur.mood.png, 'Khách')],
      marks: [
        { frame: 0, boxes: [grow(base.mood.subject.face, 4)], label: 'P19: mặt 2 chấm, không đổi theo tâm trạng' },
        { frame: 1, boxes: [grow(cur.mood.subject.face, 4)], label: 'Khách vui / sốt ruột: lông mày + miệng đổi theo tâm trạng' },
      ],
      include: [base.mood, cur.mood].map((s) => s.subject.body),
      pad: 40,
      maxScale: 2,
      notes: ['Giờ cao điểm, camera nhìn thẳng vào mặt khách gần quầy nhất, cắt bỏ mọi thứ phía trước khách. P20 chọn khách có mặt khác mặt thường của nhân viên (vui khi uống, sốt ruột khi chờ lâu).'],
    });
  } else console.warn(`!! customer-mood-p20.png: no customer with a mood within ${SUBJECT_WAIT_MS / 1000} s (${cur.mood ? NAMES.before : NAMES.after})`);

  // The five new tools on the back counter.
  const toolBox = (scene, t) => worldBox(scene, cuboid(t.pos.x - t.size.width / 2, t.pos.x + t.size.width / 2, 0.9, 1.65, t.pos.z - t.size.depth / 2, t.pos.z + t.size.depth / 2));
  const espresso = sim.machines.find((m) => m.kind === 'espresso') ?? sim.machines[0];
  await put('tools-p20.png', {
    frames: [before(baseTools.png, 'Quầy sau'), after(curTools.png, 'Quầy sau')],
    marks: [
      { frame: 0, boxes: [toolBox(baseTools.scene, { pos: espresso.pos, size: sim.espressoSize })], label: 'P19: quầy sau chỉ có máy espresso' },
      ...sim.tools.map((t) => ({ frame: 1, boxes: [toolBox(curTools.scene, t)], label: t.name })),
    ],
    pad: 100,
    maxScale: 2,
    notes: ['Pha Chuẩn bị, camera nhìn thẳng quầy sau. P20 nạp ván đã mua đủ 5 dụng cụ mới (cấp 6); P19 là ván mới.'],
  });

  // Peak scene.
  await put('peak-p20.png', {
    frames: [before(base.peak.png, 'Cao điểm'), after(cur.peak.png, 'Cao điểm')],
    marks: [...counterMarks(base.peak.scene, sim, 0, false), ...counterMarks(cur.peak.scene, sim, 1, true)],
    pad: 150,
    maxScale: 2,
    avoid: avoidTexts(base.peak, cur.peak),
    gutter: GUTTER,
    notes: ['Giờ cao điểm, camera Home + zoom 1,25x, cùng seed. P20: vân gỗ chỉ còn trên quầy, bàn, ghế và sàn (một mật độ theo toạ độ thế giới); cỏ, tường, đường và máy pha trơn màu. Vật liệu chuẩn, env map nhẹ, tổng ánh sáng giữ bằng P19 nên màu không bạc.'],
  });

  return files;
}

/** Peak board marks: the counter block and the machines strip, projected through the frame's camera. */
function counterMarks(scene, sim, frame, after) {
  const c = sim.counter;
  const x0 = c.pos.x - c.width / 2;
  const x1 = c.pos.x + c.width / 2;
  const counter = worldBox(scene, cuboid(x0, x1, 0, 1.2, c.pos.z - 0.4, c.pos.z + 0.4));
  const mx = (sim.machines ?? []).map((m) => m.pos.x);
  const mz = (sim.machines ?? []).map((m) => m.pos.z);
  const machines = mx.length > 0 ? worldBox(scene, cuboid(Math.min(...mx) - 0.5, Math.max(...mx) + 0.5, 0, 1.2, Math.min(...mz) - 0.4, Math.max(...mz) + 0.4)) : null;
  return [
    { frame, boxes: [counter], label: after ? 'Quầy: vân gỗ mảnh, cùng mật độ với sàn' : 'Quầy: vật liệu Lambert phẳng, khối đơn giản' },
    { frame, boxes: [machines], label: after ? 'Máy pha: trơn màu, không sọc gỗ, env map nhẹ' : 'Máy pha dưới hemi + directional' },
  ];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const temps = [];
  const servers = [];
  let browser = null;
  let files = [];
  try {
    console.log(`building P19 (${P20_BASE})…`);
    const baseRoot = buildRef(P20_BASE);
    temps.push(baseRoot);
    const sim = await loadSim(ROOT);
    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    browser = await launchBrowser({ headless: process.env.MEDIA_HEADED !== '1', ignoreDefaultArgs: ['--hide-scrollbars'] });

    // Both builds play their day side by side (each in its own context), so the run takes one day, not two.
    progress('both', 'playing day 1 on P20 and P19');
    const [cur, base] = await Promise.all([
      gameSession(browser, urlFor(PORT), sim, { who: 'P20', lockedId: sim.lockedId, save: sim.saves.levelUp, needMood: true, brewMoments: true }),
      gameSession(browser, urlFor(BASE_PORT), sim, { who: 'P19', lockedId: sim.lockedId, save: null, needMood: false, brewMoments: false }),
    ]);
    progress('both', 'settings, tools and dock');
    const curSet = await settingsSession(browser, urlFor(PORT));
    const baseSet = await settingsSession(browser, urlFor(BASE_PORT));
    const curTools = await toolsSession(browser, urlFor(PORT), sim, sim.saves.tools);
    const baseTools = await toolsSession(browser, urlFor(BASE_PORT), sim, null);
    const curDock = await dockSession(browser, urlFor(PORT));
    const baseDock = await dockSession(browser, urlFor(BASE_PORT));
    progress('both', 'drawing boards');

    files = await makeP20Boards(browser, { cur, base, curSet, baseSet, curTools, baseTools, curDock, baseDock, sim });
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  for (const f of files) console.log(`ok docs/media/${f} ${sizeMb(join(OUT, f)).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
