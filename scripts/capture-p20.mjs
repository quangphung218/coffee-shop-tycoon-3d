// Captures the P20 before/after boards: the P19 release (96030ca) next to the
// working tree, same seed and camera, ringed where P20 changed. Run through
// `npm run media:p20` (builds first). Needs Playwright with Chromium and the
// git history back to P20_BASE; see docs/media.md.
//
// Reuses the preview/build/camera/board machinery of scripts/capture-media.mjs.
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
  makeBoard,
  measured,
  newContext,
  observeThree,
  openMenu,
  OUT,
  PHONE,
  sizeMb,
  startEasyDay,
  startPreview,
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
/** ~1.25x: the counter and tables fill the frame (matches capture-media peak). */
const ZOOM_WHEEL = -150;
/** ~1.6x: close on the counter and the barista. */
const QUEUE_WHEEL = -320;
/** A 4x day lasts about 2 minutes with a fast renderer; software WebGL is slower. */
const DAY_TIMEOUT_MS = 8 * 60_000;
/** Day-1 staff hired so a barista stands at the counter during the peak. */
const HIRES = 3;
/** 1280 window used for the Daily Report board, a little taller so the dialog fits. */
const DESK = { width: 1280, height: 800 };

const shot = (page) => page.screenshot({ style: HIDE_TOASTS });

/** Loads the sim of the checkout in `root` and reads the day-1 counter and machines (same for every build). */
async function loadLayout(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [state, upgrades] = await Promise.all(['/src/sim/state.ts', '/src/sim/upgrades.ts'].map((p) => vite.ssrLoadModule(p)));
    const layout = upgrades.getShopLayout(state.createNewGame('Coffee Shop', 'easy', FIXED_NOW >>> 0));
    return JSON.parse(JSON.stringify({ counter: layout.counter, machines: layout.machines }));
  } finally {
    await vite.close();
  }
}

// --- In-page measurements (viewport CSS px, deviceScaleFactor 1). ---

/** HUD: the shop-level chip, the dock group divider, and the bars they sit in. */
function measureHud() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  return {
    level: rect(document.querySelector('.hud-level')),
    sep: rect(document.querySelector('.dock-sep')),
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

/** Daily Report: the tab strip, the new Chỉ số tab and its KPI cards. */
function measureReport() {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  return {
    tabs: rect(document.querySelector('.rpt-tabs')),
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

// --- Capture sessions. ---

/**
 * Plays day 1 on Easy on one build: the HUD, Việc and Nâng cấp panels in the
 * preparation phase, then the counter close-up, the peak scene and the Daily
 * Report once the day ends. `lockedId` picks the same locked upgrade on both
 * builds. The scene is frozen for the 3D shots so the ring matches the pixels.
 */
async function gameSession(browser, url, layout, lockedId) {
  const context = await newContext(browser, { viewport: DESK });
  await context.addInitScript(observeThree);
  const page = await context.newPage();
  const dockBtn = (id) => page.locator(`.dock [data-panel="${id}"]`);
  const panelBody = () => page.locator('#ui-panel .panel-body');
  try {
    const newGame = await openMenu(page, url);
    await startEasyDay(page, newGame);

    // (c) HUD + dock during preparation.
    await sleep(500);
    const hud = { png: await shot(page), boxes: await page.evaluate(measureHud) };

    // (d) Việc: scroll the missions into view where they exist.
    await dockBtn('tasks').click();
    await panelBody().waitFor();
    await page.locator('#ui-panel .mission').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
    const tasks = { png: await shot(page), boxes: await page.evaluate(measureTasks) };
    await dockBtn('tasks').click();

    // (e) Nâng cấp: scroll the locked row into view.
    await dockBtn('upgrades').click();
    await panelBody().waitFor();
    const upgProbe = await page.evaluate(measureUpgrades, { lockedId: lockedId ?? null });
    if (upgProbe.id) await page.evaluate((id) => document.querySelector(`#ui-panel .item[data-upgrade="${id}"]`)?.scrollIntoView({ block: 'center' }), upgProbe.id);
    await sleep(400);
    const upgrades = { png: await shot(page), boxes: await page.evaluate(measureUpgrades, { lockedId: upgProbe.id }) };
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

    // Peak: one framing for the scene, a closer one for the barista.
    await page.waitForFunction(() => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', null, { timeout: DAY_TIMEOUT_MS });
    await clockAt(page, '12:00');
    await cameraHome(page, ZOOM_WHEEL);
    let peakPng;
    const peakSnap = await measured(page, async () => (peakPng = await shot(page)));
    const peak = { png: peakPng, scene: peakSnap.scene };
    await cameraHome(page, QUEUE_WHEEL);
    let brewPng;
    const brewSnap = await measured(page, async () => (brewPng = await shot(page)));
    const brew = { png: brewPng, scene: brewSnap.scene };
    await cameraHome(page, ZOOM_WHEEL);

    // (f) Daily Report: the Chỉ số tab where it exists, else the summary.
    const report = page.locator('.rpt-layer:not([hidden])');
    await report.waitFor({ timeout: DAY_TIMEOUT_MS });
    await sleep(1200);
    const hasInsights = (await page.locator('.rpt-tab[data-tab="insights"]').count()) > 0;
    if (hasInsights) {
      await page.locator('.rpt-tab[data-tab="insights"]').click();
      await sleep(600);
    }
    const reportShot = { png: await shot(page), boxes: await page.evaluate(measureReport), hasInsights };

    return { hud, tasks, upgrades, brew, peak, report: reportShot, lockedId: upgrades.boxes?.id ?? upgProbe.id };
  } finally {
    await context.close();
  }
}

/** The Cài đặt screen at 390 px and 1280 px, measured each time. */
async function settingsSession(browser, url) {
  const context = await newContext(browser, { viewport: PHONE });
  const page = await context.newPage();
  // The form (not the viewport) is captured at full height, so no row is cut off.
  const form = page.locator('form', { hasText: 'Cài đặt' });
  const grab = async () => {
    await sleep(300);
    return { png: await form.screenshot(), boxes: await page.evaluate(measureSettings) };
  };
  try {
    await openMenu(page, url);
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await page.getByText('Âm thanh', { exact: true }).waitFor();
    const at390 = await grab();
    await page.setViewportSize(DESK);
    const at1280 = await grab();
    return { at390, at1280 };
  } finally {
    await context.close();
  }
}

// --- Boards. ---

async function makeP20Boards(browser, cur, base, curSet, baseSet, layout) {
  const before = (png, title) => ({ png, title: `${title} · ${NAMES.before}`, side: 'before' });
  const after = (png, title) => ({ png, title: `${title} · ${NAMES.after}`, side: 'after' });
  const board = (out, opts) => makeBoard(browser, out, { names: NAMES, ...opts });

  // (c) HUD + dock.
  await board('hud-dock-p20.png', {
    frames: [before(base.hud.png, 'HUD'), after(cur.hud.png, 'HUD')],
    marks: [
      { frame: 1, boxes: [cur.hud.boxes.level], label: 'Chip "Cấp N" + thanh XP (mới)' },
      { frame: 1, boxes: [cur.hud.boxes.sep], label: 'Vạch chia Vận hành | Phát triển (mới)' },
    ],
    include: [cur.hud.boxes.hudLeft, cur.hud.boxes.dock, base.hud.boxes.hudLeft, base.hud.boxes.dock],
    pad: 24,
    notes: ['Khổ 1280×800, pha Chuẩn bị, cùng seed. P19 không có chip cấp quán và vạch chia nhóm dock.'],
  });

  // (d) Việc + nhiệm vụ.
  await board('tasks-missions-p20.png', {
    frames: [before(base.tasks.png, 'Việc'), after(cur.tasks.png, 'Việc')],
    marks: [
      { frame: 0, boxes: [base.tasks.boxes.list], label: 'P19: chỉ có checklist việc' },
      { frame: 1, boxes: [cur.tasks.boxes.missionsTitle], label: 'Mục "Nhiệm vụ hôm nay" (mới)' },
      { frame: 1, boxes: [cur.tasks.boxes.firstMission], label: 'Thẻ nhiệm vụ: tên · tiến độ · thưởng' },
    ],
    pad: 24,
    notes: ['Khổ 1280×800, bảng Việc lúc Chuẩn bị. P20 thêm 3 nhiệm vụ ngày, tự chấm cuối ngày.'],
  });

  // (e) Nâng cấp + khóa.
  await board('upgrades-locks-p20.png', {
    frames: [before(base.upgrades.png, 'Nâng cấp'), after(cur.upgrades.png, 'Nâng cấp')],
    marks: [
      { frame: 0, boxes: [base.upgrades.boxes.badge], label: `"${cur.upgrades.boxes.name}": mua được ngay (không khóa)` },
      { frame: 1, boxes: [cur.upgrades.boxes.badge], label: 'Nhãn "Mở ở cấp N" (khóa theo cấp)' },
      { frame: 1, boxes: [cur.upgrades.boxes.groupTitle], label: 'Nhóm Dụng cụ / Không gian / Trang trí (mới)' },
    ],
    pad: 24,
    notes: ['Khổ 1280×800, bảng Nâng cấp ở Cấp 1. P20 chia nhóm theo loại và khóa món chưa tới cấp.'],
  });

  // (f) Daily Report + tab Chỉ số.
  await board('report-insights-p20.png', {
    frames: [before(base.report.png, 'Báo cáo'), after(cur.report.png, 'Báo cáo')],
    marks: [
      { frame: 0, boxes: [base.report.boxes.tabs], label: 'P19: chỉ Tổng kết + Đánh giá' },
      { frame: 1, boxes: [cur.report.boxes.insightsTab], label: 'Tab "Chỉ số" (mới)' },
      { frame: 1, boxes: [cur.report.boxes.kpis], label: 'KPI ngành F&B có ngưỡng Tốt / Cần chú ý' },
    ],
    pad: 24,
    notes: ['Cuối ngày 1, cùng seed. P19 chỉ có hai tab; P20 chèn tab Chỉ số với food cost, lương, prime cost, lấp ghế…'],
  });

  // (g) Cài đặt, một bảng mỗi khổ.
  for (const [name, b, a] of [
    ['settings-390-p20.png', baseSet.at390, curSet.at390],
    ['settings-1280-p20.png', baseSet.at1280, curSet.at1280],
  ]) {
    await board(name, {
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
      notes: ['Màn Cài đặt. P20 đổi "Đồ họa"→"Hiển thị" (thêm Giảm chuyển động), tách "Điều khiển", thu "Phím tắt" vào ô xổ.'],
    });
  }

  // (a) Nhân vật cận cảnh quầy (3D, vòng quanh nhân viên pha chế gần quầy nhất).
  await board('brew-closeup-p20.png', {
    frames: [before(base.brew.png, 'Pha chế'), after(cur.brew.png, 'Pha chế')],
    marks: [
      { frame: 0, boxes: [baristaBox(base.brew.scene, layout)], label: 'Mặt chỉ 2 chấm mắt, một vòng pha chung' },
      { frame: 1, boxes: [baristaBox(cur.brew.scene, layout)], label: 'Mặt biểu cảm + chuỗi xay–nén–chiết–rót' },
    ],
    pad: 120,
    maxScale: 2,
    notes: ['Giờ cao điểm, camera gần quầy (Home + zoom 1,6x), cùng seed. Vòng quanh nhân viên pha chế đứng gần quầy nhất.'],
  });

  // (b) Cảnh giờ cao điểm (3D, vòng quanh quầy và vùng máy pha).
  await board('peak-p20.png', {
    frames: [before(base.peak.png, 'Cao điểm'), after(cur.peak.png, 'Cao điểm')],
    marks: [
      ...counterMarks(base.peak.scene, layout, 0, false),
      ...counterMarks(cur.peak.scene, layout, 1, true),
    ],
    pad: 150,
    maxScale: 2,
    notes: ['Giờ cao điểm, camera Home + zoom 1,25x, cùng seed. P20 dùng vật liệu chuẩn + RoomEnvironment và mô hình quầy chi tiết hơn.'],
  });
}

/** Screen box around the actor nearest the counter (the barista), through the frame's camera. */
function baristaBox(scene, layout) {
  const c = layout.counter.pos;
  const people = scene.people ?? [];
  let best = null;
  let bestD = Infinity;
  for (const p of people) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? worldBox(scene, cuboid(best.x - 0.35, best.x + 0.35, 0, 1.85, best.z - 0.35, best.z + 0.35)) : null;
}

/** Peak board marks: the counter block and the machines strip, projected through the frame's camera. */
function counterMarks(scene, layout, frame, after) {
  const c = layout.counter;
  const x0 = c.pos.x - c.width / 2;
  const x1 = c.pos.x + c.width / 2;
  const counter = worldBox(scene, cuboid(x0, x1, 0, 1.2, c.pos.z - 0.4, c.pos.z + 0.4));
  const mx = (layout.machines ?? []).map((m) => m.pos.x);
  const mz = (layout.machines ?? []).map((m) => m.pos.z);
  const machines = mx.length > 0 ? worldBox(scene, cuboid(Math.min(...mx) - 0.5, Math.max(...mx) + 0.5, 0, 1.2, Math.min(...mz) - 0.4, Math.max(...mz) + 0.4)) : null;
  return [
    { frame, boxes: [counter], label: after ? 'Quầy: vật liệu chuẩn, mô hình chi tiết hơn' : 'Quầy: vật liệu Lambert phẳng, khối đơn giản' },
    { frame, boxes: [machines], label: after ? 'Máy pha dưới ánh sáng RoomEnvironment mềm' : 'Máy pha dưới hemi + directional' },
  ];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const temps = [];
  const servers = [];
  let browser = null;
  try {
    console.log(`building P19 (${P20_BASE})…`);
    const baseRoot = buildRef(P20_BASE);
    temps.push(baseRoot);
    const layout = await loadLayout(ROOT);
    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    browser = await chromium.launch({
      headless: process.env.MEDIA_HEADED !== '1',
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });

    console.log('capturing P20 (working tree)…');
    const cur = await gameSession(browser, urlFor(PORT), layout, null);
    const curSet = await settingsSession(browser, urlFor(PORT));
    console.log(`capturing P19 (${P20_BASE})…`);
    const base = await gameSession(browser, urlFor(BASE_PORT), layout, cur.lockedId);
    const baseSet = await settingsSession(browser, urlFor(BASE_PORT));

    await makeP20Boards(browser, cur, base, curSet, baseSet, layout);
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }

  const files = [
    'hud-dock-p20.png',
    'tasks-missions-p20.png',
    'upgrades-locks-p20.png',
    'report-insights-p20.png',
    'settings-390-p20.png',
    'settings-1280-p20.png',
    'brew-closeup-p20.png',
    'peak-p20.png',
  ];
  for (const f of files) console.log(`ok docs/media/${f} ${sizeMb(join(OUT, f)).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
