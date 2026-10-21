// Temporary P29 verify script (removed before commit).
//   node p29-verify.tmp.mjs saves   → loads v0–v3 saves into the built game (dist/)
//   node p29-verify.tmp.mjs pairs   → before (774be34) / after (HEAD) pairs in docs/media/p29
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildRef, newContext, observeThree, openMenu, startPreview, urlFor, freeze, thaw, FIXED_NOW } from './scripts/capture-media.mjs';
import { sceneSaves } from './scripts/capture-p29.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? 43904);
const BASE = '774be34';
const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const OUTDIR = join(ROOT, 'docs', 'media', 'p29');
const RED = '#e5383b';
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const LAUNCH = { headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] };

async function gameContext(browser, viewport, save, quality, scale = 1) {
  const context = await newContext(browser, { viewport, deviceScaleFactor: scale });
  await context.addInitScript((q) => {
    const s = JSON.parse(localStorage.getItem('cst3d:settings') ?? '{}');
    localStorage.setItem('cst3d:settings', JSON.stringify({ ...s, quality: q }));
  }, quality);
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  await context.addInitScript(observeThree);
  // Calls window.__afterRender() right after each render of #scene (observeThree's wrapper runs inside).
  await context.addInitScript(() => {
    const hook = window.__THREE_DEVTOOLS__;
    hook.addEventListener('observe', (e) => {
      const r = e.detail;
      if (!r?.isWebGLRenderer || r.domElement?.id !== 'scene') return;
      queueMicrotask(() =>
        queueMicrotask(() => {
          const render = r.render;
          r.render = function (scene, camera) {
            const out = render.call(this, scene, camera);
            window.__afterRender?.();
            return out;
          };
        }),
      );
    });
  });
  return context;
}

async function resume(page, url) {
  await openMenu(page, url);
  const btn = page.getByRole('button', { name: /^Tiếp tục/ });
  await btn.waitFor({ timeout: 10_000 });
  await btn.click();
}

// ---------------- saves ----------------

function variants(v3text) {
  const file = JSON.parse(v3text);
  const raw = () => JSON.parse(JSON.stringify(file.state));
  const v2 = () => {
    const s = raw();
    if (s.week) {
      delete s.week.index;
      delete s.week.archive;
    }
    return s;
  };
  const v1 = () => {
    const s = v2();
    for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete s[k];
    return s;
  };
  const v0 = () => {
    const s = v1();
    for (const k of ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'today', 'weather']) delete s[k];
    return s;
  };
  return [
    { version: 0, text: JSON.stringify(v0()) },
    { version: 1, text: JSON.stringify({ version: 1, savedAt: FIXED_NOW, state: v1() }) },
    { version: 2, text: JSON.stringify({ version: 2, savedAt: FIXED_NOW, state: v2() }) },
    { version: 3, text: JSON.stringify({ version: 3, savedAt: FIXED_NOW, state: raw() }) },
  ];
}

async function saves() {
  const s = await sceneSaves(ROOT, [{ id: 'dusk', weather: 'rainy', minute: 19 * 60 }]);
  console.log(`source save: ${s.dusk.info}, key ${s.dusk.key}`);
  const server = await startPreview(ROOT, PORT);
  const browser = await chromium.launch(LAUNCH);
  let fails = 0;
  try {
    for (const v of variants(s.dusk.text)) {
      const context = await gameContext(browser, DESK, { key: s.dusk.key, text: v.text }, 'high');
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
      try {
        await resume(page, urlFor(PORT));
        await page.locator('nav.dock').waitFor({ timeout: 15_000 });
        const c0 = await page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');
        await sleep(4000);
        const info = await page.evaluate(() => {
          const scene = window.__mediaScene;
          let rain = false;
          scene?.traverse((o) => {
            if (o.name === 'rain-streaks' && o.visible) rain = true;
          });
          return {
            clock: document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '',
            ready: !!document.querySelector('#scene.is-ready'),
            rain,
          };
        });
        const ok = errors.length === 0 && info.ready && info.clock > c0;
        if (!ok) fails++;
        console.log(`v${v.version}: ${ok ? 'PASS' : 'FAIL'} clock ${c0} → ${info.clock}, scene ready ${info.ready}, rain visible ${info.rain}, console errors ${errors.length}${errors.length ? ` (${errors.join(' | ')})` : ''}`);
      } catch (err) {
        fails++;
        console.log(`v${v.version}: FAIL ${String(err.message).split('\n')[0]}; errors ${errors.join(' | ')}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(fails ? `FAIL ${fails}/4` : 'PASS 4/4');
  if (fails) process.exitCode = 1;
}

// ---------------- pairs ----------------

/** In page: light totals in hemisphere units (hemi + env*6 + sun), point lights on, pools shown. */
function lightInfo() {
  const scene = window.__mediaScene;
  let hemi = 0, sun = 0, points = 0, pools = 0;
  scene.traverse((o) => {
    if (!o.visible) return;
    if (o.isHemisphereLight) hemi += o.intensity;
    if (o.isDirectionalLight) sun += o.intensity;
    if (o.isPointLight && o.intensity > 0) points++;
    if (o.name === 'light-pool') pools++;
  });
  const env = scene.environment ? scene.environmentIntensity : 0;
  return { hemi, sun, env, total: hemi + env * 6 + sun, points, pools };
}

/** In page: screen box (CSS px, clipped to #scene) of the visible objects named `names` (geometry bounds or position). */
function boxOf(names) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const r = document.getElementById('scene').getBoundingClientRect();
  const v = cam.matrixWorldInverse.elements;
  const p = cam.projectionMatrix.elements;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const add = (m, x, y, z) => {
    const w = [x * m[0] + y * m[4] + z * m[8] + m[12], x * m[1] + y * m[5] + z * m[9] + m[13], x * m[2] + y * m[6] + z * m[10] + m[14]];
    const e = [0, 1, 2, 3].map((i) => v[i] * w[0] + v[4 + i] * w[1] + v[8 + i] * w[2] + v[12 + i]);
    const c = [0, 1, 3].map((i) => p[i] * e[0] + p[4 + i] * e[1] + p[8 + i] * e[2] + p[12 + i] * e[3]);
    if (c[2] <= 0) return;
    const sx = r.left + ((c[0] / c[2] + 1) / 2) * r.width;
    const sy = r.top + ((1 - c[1] / c[2]) / 2) * r.height;
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  };
  scene.traverse((o) => {
    if (!names.includes(o.name) || !shown(o)) return;
    const m = o.matrixWorld.elements;
    const g = o.geometry;
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) add(m, x, y, z);
    } else add(m, 0, 0, 0);
  });
  if (!Number.isFinite(x0)) return null;
  x0 = Math.max(r.left + 4, x0); y0 = Math.max(r.top + 4, y0); x1 = Math.min(r.right - 4, x1); y1 = Math.min(r.bottom - 4, y1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** In page: drawn rain streaks and splashes (any build), and screen boxes of their points (CSS px, inside #scene). */
function rainInfo() {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const r = document.getElementById('scene').getBoundingClientRect();
  const v = cam.matrixWorldInverse.elements;
  const p = cam.projectionMatrix.elements;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const proj = (m, x, y, z) => {
    const w = [x * m[0] + y * m[4] + z * m[8] + m[12], x * m[1] + y * m[5] + z * m[9] + m[13], x * m[2] + y * m[6] + z * m[10] + m[14]];
    const e = [0, 1, 2, 3].map((i) => v[i] * w[0] + v[4 + i] * w[1] + v[8 + i] * w[2] + v[12 + i]);
    const c = [0, 1, 3].map((i) => p[i] * e[0] + p[4 + i] * e[1] + p[8 + i] * e[2] + p[12 + i] * e[3]);
    if (c[2] <= 0) return null;
    const sx = r.left + ((c[0] / c[2] + 1) / 2) * r.width;
    const sy = r.top + ((1 - c[1] / c[2]) / 2) * r.height;
    return sx >= r.left && sx <= r.right && sy >= r.top + 70 && sy <= r.bottom - 90 ? [sx, sy] : null;
  };
  const names = new Set();
  const streakPts = [];
  const splashPts = [];
  let streaks = 0, splashes = 0;
  scene.traverse((o) => {
    // 774be34 draws its streaks as an unnamed LineSegments in the rain colour 0xd6e9f5.
    const unnamedRain = o.isLineSegments && o.material?.color?.getHex?.() === 0xd6e9f5;
    if ((!/rain/i.test(o.name) && !unnamedRain) || !shown(o)) return;
    names.add(o.name || '(unnamed LineSegments 0xd6e9f5)');
    const m = o.matrixWorld.elements;
    if (o.isLineSegments) {
      const pos = o.geometry.attributes.position;
      const n = Math.min(pos.count, Number.isFinite(o.geometry.drawRange.count) ? o.geometry.drawRange.count : pos.count);
      streaks += n / 2;
      for (let i = 0; i < n; i++) {
        const s = proj(m, pos.getX(i), pos.getY(i), pos.getZ(i));
        if (s) streakPts.push(s);
      }
    } else if (o.isInstancedMesh) {
      splashes += o.count;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const s = proj(m, a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]);
        if (s) splashPts.push(s);
      }
    } else if (o.isPoints) {
      const pos = o.geometry.attributes.position;
      streaks += pos.count;
      for (let i = 0; i < pos.count; i++) {
        const s = proj(m, pos.getX(i), pos.getY(i), pos.getZ(i));
        if (s) streakPts.push(s);
      }
    }
  });
  const box = (pts, pad = 14) => {
    if (!pts.length) return null;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0 - pad, y: y0 - pad, w: Math.max(...xs) - x0 + 2 * pad, h: Math.max(...ys) - y0 + 2 * pad };
  };
  // A 360×220 window holding the most points of `pts` (coarse 40 px grid), so the ring sits where rain is densest.
  const densest = (pts) => {
    if (!pts.length) return null;
    let best = null;
    for (let x = r.left; x + 360 <= r.right; x += 40) {
      for (let y = r.top + 70; y + 220 <= r.bottom - 90; y += 40) {
        const n = pts.filter((q) => q[0] >= x && q[0] <= x + 360 && q[1] >= y && q[1] <= y + 220).length;
        if (!best || n > best.n) best = { x, y, w: 360, h: 220, n };
      }
    }
    return best;
  };
  return { names: [...names], streaks, splashes, streakBox: box(streakPts), splashBox: box(splashPts), streakPts: streakPts.length, splashPts: splashPts.length, dense: densest(splashPts.length ? splashPts : streakPts) };
}

/** In page: screen boxes of visible coin sprites (opacity > 0.05) under 'coins'. */
function coinBox() {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const g = scene?.getObjectByName('coins');
  if (!g || !cam) return null;
  const r = document.getElementById('scene').getBoundingClientRect();
  const v = cam.matrixWorldInverse.elements;
  const p = cam.projectionMatrix.elements;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, op = 0;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  g.traverse((o) => {
    if (!o.isSprite || !shown(o) || (o.material?.opacity ?? 0) < 0.05) return;
    n++;
    op += o.material.opacity;
    const m = o.matrixWorld.elements;
    const e = [0, 1, 2, 3].map((i) => v[i] * m[12] + v[4 + i] * m[13] + v[8 + i] * m[14] + v[12 + i]);
    const c = [0, 1, 3].map((i) => p[i] * e[0] + p[4 + i] * e[1] + p[8 + i] * e[2] + p[12 + i] * e[3]);
    const sx = r.left + ((c[0] / c[2] + 1) / 2) * r.width;
    const sy = r.top + ((1 - c[1] / c[2]) / 2) * r.height;
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  });
  return n ? { x: x0 - 30, y: y0 - 30, w: x1 - x0 + 60, h: y1 - y0 + 60, n, op } : null;
}

const clock = (page) => page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');

/** One scene shot: after Tiếp tục and `settle` ms, frozen; returns png, light info, ring box (from `ringNames`). */
async function sceneShot(browser, url, save, viewport, quality, ringNames) {
  const context = await gameContext(browser, viewport, save, quality);
  const page = await context.newPage();
  try {
    await resume(page, url);
    await page.locator('nav.dock').waitFor();
    await sleep(2500);
    const rain = await page.evaluate(rainInfo);
    const png = await page.screenshot({ style: '.toasts { display: none !important; }' });
    const light = await page.evaluate(lightInfo);
    const box = ringNames ? await page.evaluate(boxOf, ringNames) : null;
    const hud = await clock(page);
    return { png, light, box, hud, rain };
  } finally {
    await context.close();
  }
}

/** Coin: three frames of one coin, ~0.25 / 0.55 / 0.85 s after it shows; each with its box. */
async function coinFrames(browser, url, save) {
  const context = await gameContext(browser, DESK, save, 'high', 1);
  const page = await context.newPage();
  try {
    await resume(page, url);
    await page.locator('nav.dock').waitFor();
    await sleep(2500);
    // A fresh coin: wait for none, then for one (opacity > 0.05).
    await page.waitForFunction(`(${coinBox})() !== null`, null, { timeout: 30_000, polling: 'raf' });
    // A headless screenshot takes ~1.6 s, longer than a coin lives. Instead, right after each
    // render of #scene, read the coin sprites of that frame and, when there are more than in any
    // frame so far, copy the canvas in the same task (the drawing buffer is still intact).
    const best = await page.evaluate(
      (src) =>
        new Promise((done) => {
          const coinBox = eval(`(${src})`);
          const canvas = document.getElementById('scene');
          let best = null, frames = 0;
          window.__afterRender = () => {
            frames++;
            const box = coinBox();
            // Copy after the whole frame callback (every render pass of this frame), still before compositing.
            if (box && (!best || box.n * 10 + box.op > best.box.n * 10 + best.box.op)) {
              const entry = { box, url: null };
              best = entry;
              queueMicrotask(() => (entry.url = canvas.toDataURL('image/png')));
            }
          };
          setTimeout(() => {
            window.__afterRender = null;
            done(best && { ...best, frames });
          }, 20_000);
        }),
      coinBox.toString(),
    );
    if (!best) throw new Error('no coin seen in 20 s');
    return { png: Buffer.from(best.url.split(',')[1], 'base64'), box: best.box, tries: best.frames };
  } finally {
    await context.close();
  }
}

/** Level-up: the report card with the badge's Web Animation paused at its first -3 px step. */
async function levelUpShot(browser, url, save) {
  const context = await gameContext(browser, PHONE, save, 'high', 2);
  const page = await context.newPage();
  try {
    await resume(page, url);
    const badgeSel = '.rpt-layer:not([hidden]) .rpt-levelup-badge';
    // On the first frame the badge has its shake: finish every other animation of the page (report
    // drop-in, badge pop), hold the shake, read the rest x (shake at 0 = in its delay), sweep it
    // 400–700 ms by the computed transform and leave it at the furthest shift. All in one task.
    const peak = await page.evaluate(
      (sel) =>
        new Promise((done) => {
          const t0 = performance.now();
          const tick = () => {
            const b = document.querySelector(sel);
            const all = b ? b.getAnimations() : [];
            const shakes = all.filter((a) => JSON.stringify(a.effect.getKeyframes()).includes('-3px'));
            if (b && (shakes.length || performance.now() - t0 > 3000)) {
              for (const a of shakes) a.pause();
              for (const a of document.getAnimations()) {
                if (shakes.includes(a)) continue;
                try {
                  a.finish();
                } catch {
                  // infinite animation
                }
              }
              b.scrollIntoView({ block: 'center' });
              for (const a of shakes) a.currentTime = 0;
              const rest = b.getBoundingClientRect().x;
              const best = { found: shakes.length, t: 0, dx: 0, rest, samples: [] };
              for (let t = 400; shakes.length && t <= 700; t += 5) {
                for (const a of shakes) a.currentTime = t;
                const dx = b.getBoundingClientRect().x - rest;
                if (t % 50 === 0) best.samples.push(`${t}:${dx.toFixed(2)}`);
                if (Math.abs(dx) > Math.abs(best.dx)) Object.assign(best, { t, dx });
              }
              for (const a of shakes) a.currentTime = best.t;
              return done(best);
            }
            requestAnimationFrame(tick);
          };
          tick();
        }),
      badgeSel,
    );
    const shake = peak.found;
    const card = page.locator('.rpt-layer:not([hidden]) .rpt-levelup');
    const badge = await page.locator(badgeSel).boundingBox();
    const rest = { ...badge, x: badge.x - peak.dx };
    const moved = badge;
    console.log(`levelup peak ${JSON.stringify(peak)}, badge x now ${badge.x}`);
    const cardBox = await card.boundingBox();
    const png = await page.screenshot({ clip: { x: cardBox.x - 8, y: cardBox.y - 8, width: cardBox.width + 16, height: cardBox.height + 16 } });
    return { png, rest, moved, cardBox, shake, peak, text: (await card.textContent()).trim().replace(/\s+/g, ' ') };
  } finally {
    await context.close();
  }
}

/** Composes before | after in a page, rings on both, label bars, caption; writes a JPEG. */
async function compose(browser, name, { before, after, rings = [], ringsAfter, scale = 0.75, caption, beforeNote, afterNote, marks = [] }) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  try {
    const b64 = (png) => `data:image/png;base64,${png.toString('base64')}`;
    const html = await page.evaluate(
      async ({ a, b, rings, ringsAfter, scale, caption, beforeNote, afterNote, red, marks, BASE, HEAD }) => {
        const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.round(ia.width * scale), ha = Math.round(ia.height * scale);
        const wb = Math.round(ib.width * scale), hb = Math.round(ib.height * scale);
        const h = Math.max(ha, hb);
        const gap = 16, bar = 40, foot = 52;
        const c = document.createElement('canvas');
        c.width = Math.max(w + gap + wb, 1100); c.height = h + bar + foot;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(ia, 0, bar, w, ha);
        x.drawImage(ib, w + gap, bar, wb, hb);
        x.font = 'bold 20px Helvetica, Arial'; x.fillStyle = '#222';
        x.fillText(`Trước · ${BASE}${beforeNote ? ` · ${beforeNote}` : ''}`, 8, 27);
        x.fillText(`Sau · ${HEAD}${afterNote ? ` · ${afterNote}` : ''}`, w + gap + 8, 27);
        const s = scale;
        const ringAt = (r, ox) => {
          x.lineWidth = 6; x.strokeStyle = '#fff';
          x.beginPath(); x.roundRect(ox + r.x * s - 6, bar + r.y * s - 6, r.w * s + 12, r.h * s + 12, 12); x.stroke();
          x.lineWidth = 4; x.strokeStyle = red; x.stroke();
        };
        for (const r of rings) ringAt(r, 0);
        for (const r of ringsAfter ?? rings) ringAt(r, w + gap);
        for (const m of marks) {
          x.setLineDash([6, 4]); x.lineWidth = 2; x.strokeStyle = m.color;
          const ox = m.side === 'b' ? w + gap : 0;
          x.beginPath(); x.moveTo(ox + m.x * s, bar + m.y0 * s); x.lineTo(ox + m.x * s, bar + m.y1 * s); x.stroke();
          x.setLineDash([]);
        }
        x.fillStyle = red; x.fillRect(0, bar + h + 8, c.width, foot - 8);
        x.fillStyle = '#fff'; x.font = 'bold 18px Helvetica, Arial';
        x.fillText(caption, 12, bar + h + 37);
        return c.toDataURL('image/jpeg', 0.8);
      },
      { a: b64(before), b: b64(after), rings, ringsAfter, scale, caption, beforeNote, afterNote, red: RED, marks, BASE, HEAD },
    );
    const file = join(OUTDIR, name);
    writeFileSync(file, Buffer.from(html.split(',')[1], 'base64'));
    console.log(`ok docs/media/p29/${name}`);
  } finally {
    await page.close();
  }
}

const f2 = (n) => n.toFixed(2).replace('.', ',');
const lt = (l) => `tổng sáng ${f2(l.total)} (hemi ${f2(l.hemi)}, env ${f2(l.env)}×6, nắng ${f2(l.sun)})`;
const union = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });

/** Crop of a PNG via a page canvas: returns PNG buffer. */
async function crop(browser, png, r, scale = 1) {
  const page = await browser.newPage();
  try {
    const url = await page.evaluate(
      async ({ src, r, scale }) => {
        const i = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = src; });
        const c = document.createElement('canvas');
        c.width = Math.round(r.w * scale); c.height = Math.round(r.h * scale);
        c.getContext('2d').drawImage(i, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      },
      { src: `data:image/png;base64,${png.toString('base64')}`, r, scale },
    );
    return Buffer.from(url.split(',')[1], 'base64');
  } finally {
    await page.close();
  }
}

async function pairs() {
  mkdirSync(OUTDIR, { recursive: true });
  const scenes = [
    { id: 'noon', weather: 'sunny', minute: 12 * 60 },
    { id: 'dusk-sun', weather: 'sunny', minute: 19 * 60 + 30 },
    { id: 'dusk-rain', weather: 'rainy', minute: 19 * 60 + 30 },
  ];
  console.log(`building ${BASE}…`);
  const baseRoot = buildRef(BASE);
  const servers = [];
  let browser = null;
  try {
    const sv = { base: await sceneSaves(baseRoot, scenes, { withLevelUp: true }), head: await sceneSaves(ROOT, scenes, { withLevelUp: true }) };
    for (const k of ['base', 'head']) for (const [id, s] of Object.entries(sv[k])) console.log(`${k} save ${id}: ${s.info}`);
    servers.push(await startPreview(baseRoot, PORT), await startPreview(ROOT, PORT + 1));
    const url = { base: urlFor(PORT), head: urlFor(PORT + 1) };
    browser = await chromium.launch(LAUNCH);
    const both = async (fn) => ({ base: await fn('base'), head: await fn('head') });

    // 1. 12:00 sunny, Vừa: light budget.
    if (only.has('light')) {
    const noon = await both((k) => sceneShot(browser, url[k], sv[k].noon, DESK, 'medium', ['light-pool', 'machine-steam']));
    console.log(`noon medium: base ${JSON.stringify(noon.base.light)} HUD ${noon.base.hud}; head ${JSON.stringify(noon.head.light)} HUD ${noon.head.hud}`);
    await compose(browser, 'noon-medium-before-after-p29.jpg', {
      before: noon.base.png, after: noon.head.png,
      // The whole scene changes; the ring marks the shop floor and walls, where it reads best (1280×800 CSS px).
      rings: [{ x: 378, y: 182, w: 526, h: 366 }],
      beforeNote: `${noon.base.hud} Vừa`, afterNote: `${noon.head.hud} Vừa`,
      caption: `12:00 nắng, Vừa: ${lt(noon.base.light)} → ${lt(noon.head.light)}; ngân sách 3,4`,
    });

    // 2. 19:30 sunny, Cao: shop lights on.
    const dusk = await both((k) => sceneShot(browser, url[k], sv[k]['dusk-sun'], DESK, 'high', ['light-pool']));
    console.log(`dusk sunny high: base ${JSON.stringify(dusk.base.light)} HUD ${dusk.base.hud}; head ${JSON.stringify(dusk.head.light)} HUD ${dusk.head.hud} box ${JSON.stringify(dusk.head.box)}`);
    await compose(browser, 'dusk-sunny-high-before-after-p29.jpg', {
      before: dusk.base.png, after: dusk.head.png,
      rings: dusk.head.box ? [dusk.head.box] : [],
      beforeNote: `${dusk.base.hud} Cao`, afterNote: `${dusk.head.hud} Cao`,
      caption: `19:30 nắng, Cao: đèn quán ${dusk.base.light.points} → ${dusk.head.light.points} PointLight, vũng sáng sàn ${dusk.base.light.pools} → ${dusk.head.light.pools}`,
    });
    }

    // 3. 19:30 rainy, Cao and Thấp: rain.
    for (const q of only.has('rain') ? ['high', 'low'] : []) {
      const rain = await both((k) => sceneShot(browser, url[k], sv[k]['dusk-rain'], DESK, q, null));
      const vn = q === 'high' ? 'Cao' : 'Thấp';
      for (const k of ['base', 'head']) {
        const { dense, ...rest } = rain[k].rain;
        console.log(`dusk rainy ${q} ${k}: HUD ${rain[k].hud} light ${JSON.stringify(rain[k].light)} rain ${JSON.stringify(rest)} dense ${JSON.stringify(dense)}`);
      }
      const rb = rain.base.rain, rh = rain.head.rain;
      await compose(browser, `dusk-rainy-${q}-before-after-p29.jpg`, {
        before: rain.base.png, after: rain.head.png,
        rings: rh.dense ? [rh.dense] : [],
        beforeNote: `${rain.base.hud} mưa ${vn}`, afterNote: `${rain.head.hud} mưa ${vn}`,
        caption: `19:30 mưa, ${vn}: vệt mưa ${rb.streaks} → ${rh.streaks}, tia bắn mặt đất ${rb.splashes} → ${rh.splashes}; khoanh vùng mưa dày nhất`,
      });
    }

    // 4. Coin: three frames side by side per build.
    if (only.has('coin')) {
    const coins = await both((k) => coinFrames(browser, url[k], sv[k].noon));
    for (const k of ['base', 'head']) console.log(`coin ${k}: tries ${coins[k]?.tries} box ${JSON.stringify(coins[k]?.box)}`);
    // 200×150 CSS px around each build's coin from the DPR 2 canvas, shown at 4x.
    const cut = async (f) => {
      const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2;
      const r = { x: Math.round(Math.min(Math.max(0, cx - 100), 1280 - 200)), y: Math.round(Math.min(Math.max(0, cy - 75), 800 - 150)), w: 200, h: 150 };
      return { png: await crop(browser, f.png, r, 4), ring: { x: (f.box.x - r.x) * 4, y: (f.box.y - r.y) * 4, w: f.box.w * 4, h: f.box.h * 4 } };
    };
    const cb = await cut(coins.base);
    const ch = await cut(coins.head);
    await compose(browser, 'coin-before-after-p29.jpg', {
      before: cb.png, after: ch.png, scale: 0.75, rings: [cb.ring], ringsAfter: [ch.ring],
      beforeNote: `Cao, phóng 4x`, afterNote: `Cao, phóng 4x`,
      caption: `Đồng xu khi bán (khoanh), khung nhiều sprite nhất trong 20 s: ${coins.base.box.n} (xu + nhãn) → ${coins.head.box.n} (xu vỡ thành xu nhỏ)`,
    });
    }

    // 5. Level-up badge shake.
    if (only.has('level')) {
    const lv = await both((k) => levelUpShot(browser, url[k], sv[k].levelUp));
    for (const k of ['base', 'head']) console.log(`levelup ${k}: shake anims ${lv[k].shake}, rest x ${lv[k].rest?.x}, held x ${lv[k].moved?.x}; ${lv[k].text}`);
    const toCard = (k, b) => ({ x: (b.x - lv[k].cardBox.x + 8) * 2, y: (b.y - lv[k].cardBox.y + 8) * 2, w: b.width * 2, h: b.height * 2 });
    const restA = toCard('base', lv.base.rest);
    const restB = toCard('head', lv.head.rest);
    await compose(browser, 'levelup-shake-before-after-p29.jpg', {
      before: lv.base.png, after: lv.head.png, scale: 1,
      rings: [toCard('base', lv.base.moved)], ringsAfter: [toCard('head', lv.head.moved)],
      marks: [
        { side: 'a', x: restA.x, y0: restA.y - 10, y1: restA.y + restA.h + 10, color: '#1a73e8' },
        { side: 'b', x: restB.x, y0: restB.y - 10, y1: restB.y + restB.h + 10, color: '#1a73e8' },
      ],
      beforeNote: 'không có rung', afterNote: `giữ ở ${lv.head.peak.t} ms`,
      caption: `Huy hiệu cấp (khoanh) giữ ở chỗ lệch xa nhất của lượt rung, nét đứt xanh là mép trái lúc đứng yên: trước lệch ${(lv.base.moved.x - lv.base.rest.x).toFixed(1).replace('.', ',')} px, sau lệch ${(lv.head.moved.x - lv.head.rest.x).toFixed(1).replace('.', ',')} px`,
    });
    }
  } finally {
    await browser?.close();
    for (const s of servers) s.kill();
    rmSync(baseRoot, { recursive: true, force: true });
  }
}

const cmd = process.argv[2];
const only = new Set((process.argv[3] ?? 'light,rain,coin,level').split(','));
(cmd === 'saves' ? saves() : pairs()).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
