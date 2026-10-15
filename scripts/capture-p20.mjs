// Captures the P20 before/after boards: the P19 release (96030ca) next to the
// working tree, same seed and camera, ringed where P20 changed. Run through
// `npm run media:p20` (builds first). Needs Playwright with Chromium and the
// git history back to P20_BASE; see docs/media.md.
//
// Reuses the preview/build/camera/board machinery of scripts/capture-media.mjs.
// Prints `!!` for a label with nothing to ring, a ring around a flat (empty)
// area, a label that covers text, or a close-up whose subject never showed up.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  buildRef,
  cameraHome,
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
 * and how far in front of the subject geometry is kept; everything nearer the
 * camera (walls, the machine, the counter) is cut by the near plane.
 */
// People are about 1.32 tall (rig.ts: hips 0.55, head 0.98–1.32). The barista
// faces the machine, so the camera comes in 63° off their face to look past it.
const BREW_SHOT = { height: 2.2, pitch: 0.3, keep: 0.6, targetY: 1, yawOffset: 1.1 };
// A little off their face, so the camera does not look down a row of tables or the queue.
const MOOD_SHOT = { height: 2.2, pitch: 0.3, keep: 0.5, targetY: 0.9, yawOffset: 0.5 };
const TOOLS_SHOT = { height: 4.6, pitch: 0.42, keep: 0.5, targetY: 1.15 };
/** World boxes of a person standing at (x, z): head, arms and hands, whole body. */
const HEAD_Y = [0.96, 1.36];
const ARMS_Y = [0.6, 1.05];
const BODY_Y = [0, 1.36];

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

/** HUD: the shop-level chip, the dock and its group dividers, and the bars they sit in. */
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

/** Height the window needs so the whole Cài đặt form is on screen (no inner scroll cuts rows off). */
function settingsHeight() {
  const form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null && f.querySelector('.section-title'));
  if (!form) return 0;
  let extra = 0;
  for (let el = form; el; el = el.parentElement) extra = Math.max(extra, el.scrollHeight - el.clientHeight);
  return Math.ceil(document.documentElement.clientHeight + extra);
}

/**
 * Runs in the page with the frame loop frozen. Finds the close-up subject
 * (`kind` 'brewer': the person behind the counter nearest the espresso
 * machine while it steams; 'customer': a customer whose face shows a mood,
 * or on a build without moods the customer nearest the counter; 'point': a
 * fixed spot), aims the camera at it from the direction it faces and draws
 * one frame. Returns the subject (and the other customers with a mood) or null.
 */
function aimAt(arg) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const renderer = window.__mediaRenderer;
  if (!scene || !cam || !renderer) return null;
  const people = (scene.getObjectByName('actors')?.children ?? []).filter((o) => o.visible && o.name !== 'coins');
  // Character rig (src/render/actors/rig.ts): root > bounce > hips > torso > [body, apron, neck, armL, armR, head]; head > [.., face].
  const parts = (o) => {
    const torso = o.children[0]?.children[0]?.children[2];
    const apron = torso?.children[1];
    const face = torso?.children[5]?.children[4];
    return apron?.isMesh && face?.isMesh ? { apron, face } : null;
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
  } else if (arg.kind === 'customer') {
    const staffFace = people.map(parts).find((p) => p?.apron.visible)?.face.geometry;
    const customers = people.filter((o) => o.position.z > arg.counterZ + 0.3);
    const moody = staffFace ? customers.filter((o) => { const p = parts(o); return p && !p.apron.visible && p.face.geometry !== staffFace; }) : [];
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
  cam.near = D - arg.keep;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  renderer.render(scene, cam);
  return { x: target.x, z: target.z, heading, others };
}

/** Puts the near plane back; the camera controller re-aims on the next frame. */
function restoreCamera() {
  const cam = window.__mediaCamera;
  if (!cam) return;
  cam.near = 0.1;
  cam.updateProjectionMatrix();
}

/** Freezes the scene, aims a close-up (aimAt), takes it without the UI and reads its camera; retries until the subject shows up. */
async function closeUp(page, arg) {
  const end = Date.now() + SUBJECT_WAIT_MS;
  while (Date.now() < end) {
    await freeze(page);
    try {
      const subject = await page.evaluate(aimAt, arg);
      if (subject) {
        const png = await page.screenshot({ style: HIDE_UI });
        return { png, scene: await sceneSnapshot(page), subject };
      }
    } finally {
      await page.evaluate(restoreCamera);
      await thaw(page);
    }
    await sleep(400);
  }
  return null;
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

// --- Capture sessions. ---

/**
 * Plays day 1 on Easy on one build: the HUD, Việc and Nâng cấp panels in the
 * preparation phase, then at the peak the scene, a close-up of the barista at
 * the espresso machine and of a customer, and the Daily Report (summary, and
 * the Chỉ số tab where it exists) once the day ends. `save` starts P20 a
 * point short of level 2 so the report shows the level-up band. `lockedId`
 * picks the same locked upgrade on both builds.
 */
async function gameSession(browser, url, sim, { who, lockedId, save, needMood }) {
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
    const brew = await closeUp(page, { kind: 'brewer', machine: espresso.pos, ...counter, ...BREW_SHOT });
    progress(who, brew ? 'barista close-up' : 'no barista brewing');
    const mood = await closeUp(page, { kind: 'customer', needMood, ...counter, ...MOOD_SHOT });
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
  const grab = async (width, minHeight) => {
    await page.setViewportSize({ width, height: minHeight });
    await sleep(200);
    const height = Math.max(minHeight, await page.evaluate(settingsHeight));
    if (height > minHeight) await page.setViewportSize({ width, height });
    await sleep(300);
    return { png: await form.screenshot(), boxes: await page.evaluate(measureSettings), texts: await page.evaluate(measureTexts, { settingsForm: true }), height };
  };
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

  // HUD + dock.
  await put('hud-dock-p20.png', {
    frames: [before(base.hud.png, 'HUD'), after(cur.hud.png, 'HUD')],
    marks: [
      { frame: 1, boxes: [cur.hud.boxes.level], label: 'Chip "Cấp N" + thanh XP (mới)' },
      { frame: 1, boxes: cur.hud.boxes.seps, label: 'Vạch chia Vận hành | Phát triển | Đánh giá (mới)' },
    ],
    include: [cur.hud.boxes.hudLeft, cur.hud.boxes.dock, base.hud.boxes.hudLeft, base.hud.boxes.dock],
    pad: 24,
    avoid: avoidTexts(base.hud, cur.hud),
    gutter: GUTTER,
    notes: ['Khổ 1280×800, pha Chuẩn bị, cùng seed. P20 nạp ván ngày 1 thiếu 1 XP tới cấp 2 nên thanh XP gần đầy. P19 không có chip cấp quán và vạch chia nhóm dock.'],
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

  // Barista close-up, camera in front of their face while the espresso machine steams.
  if (cur.brew && base.brew) {
    const face = (s) => cuboid(s.x - 0.2, s.x + 0.2, HEAD_Y[0], HEAD_Y[1], s.z - 0.2, s.z + 0.2);
    const body = (s) => cuboid(s.x - 0.38, s.x + 0.38, ARMS_Y[0], ARMS_Y[1], s.z - 0.45, s.z + 0.45);
    await put('brew-closeup-p20.png', {
      frames: [before(base.brew.png, 'Pha chế'), after(cur.brew.png, 'Pha chế')],
      marks: [
        { frame: 0, boxes: [worldBox(base.brew.scene, face(base.brew.subject))], label: 'P19: mặt chỉ 2 chấm mắt' },
        { frame: 0, boxes: [worldBox(base.brew.scene, body(base.brew.subject))], label: 'P19: một vòng tay pha chung' },
        { frame: 1, boxes: [worldBox(cur.brew.scene, face(cur.brew.subject))], label: 'Mặt có lông mày, miệng, chớp mắt' },
        { frame: 1, boxes: [worldBox(cur.brew.scene, body(cur.brew.subject))], label: 'Tư thế pha: xay – nén – chiết – rót' },
      ],
      pad: 90,
      maxScale: 2,
      notes: ['Giờ cao điểm, lúc máy espresso đang pha; camera đặt trước mặt nhân viên đứng ở máy (lệch 63° để không bị máy che), cắt bỏ tường phía trước. Cùng seed.'],
    });
  } else console.warn(`!! brew-closeup-p20.png: no barista brewing at the espresso machine within ${SUBJECT_WAIT_MS / 1000} s (${cur.brew ? NAMES.before : NAMES.after})`);

  // A customer with a mood, camera in front of their face.
  if (cur.mood && base.mood) {
    const head = (s) => cuboid(s.x - 0.2, s.x + 0.2, HEAD_Y[0], HEAD_Y[1], s.z - 0.2, s.z + 0.2);
    await put('customer-mood-p20.png', {
      frames: [before(base.mood.png, 'Khách'), after(cur.mood.png, 'Khách')],
      marks: [
        { frame: 0, boxes: [worldBox(base.mood.scene, head(base.mood.subject))], label: 'P19: mặt 2 chấm, không đổi theo tâm trạng' },
        { frame: 1, boxes: [worldBox(cur.mood.scene, head(cur.mood.subject))], label: 'Khách vui / sốt ruột: lông mày + miệng đổi theo tâm trạng' },
      ],
      include: [base.mood, cur.mood].map(({ scene, subject: s }) => worldBox(scene, cuboid(s.x - 0.4, s.x + 0.4, BODY_Y[0], BODY_Y[1], s.z - 0.4, s.z + 0.4))),
      pad: 60,
      maxScale: 2,
      notes: ['Giờ cao điểm, camera đặt trước mặt khách gần quầy nhất (lệch 29°). P20 chọn khách có mặt khác mặt thường của nhân viên (vui khi uống, sốt ruột khi chờ lâu).'],
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
    notes: ['Giờ cao điểm, camera Home + zoom 1,25x, cùng seed. P20: vật liệu chuẩn, env map nhẹ, tổng ánh sáng giữ bằng P19 nên tường, sàn, cỏ không bạc màu.'],
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
    { frame, boxes: [counter], label: after ? 'Quầy: vật liệu chuẩn, mô hình chi tiết hơn' : 'Quầy: vật liệu Lambert phẳng, khối đơn giản' },
    { frame, boxes: [machines], label: after ? 'Máy pha: env map nhẹ, ánh sáng trong ngân sách P19' : 'Máy pha dưới hemi + directional' },
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
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });

    // Both builds play their day side by side (each in its own context), so the run takes one day, not two.
    progress('both', 'playing day 1 on P20 and P19');
    const [cur, base] = await Promise.all([
      gameSession(browser, urlFor(PORT), sim, { who: 'P20', lockedId: sim.lockedId, save: sim.saves.levelUp, needMood: true }),
      gameSession(browser, urlFor(BASE_PORT), sim, { who: 'P19', lockedId: sim.lockedId, save: null, needMood: false }),
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
