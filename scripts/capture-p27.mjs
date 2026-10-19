// Captures the P27 shots: the P26 release (d58350b) next to the working tree
// for the Main Menu, the HUD and the Nhân viên panel, and the working tree
// alone for the Việc panel, Nâng cấp, the side room at level 4 and a VIP
// customer, at 390×844 and 1280×720. Each shot is ringed in red where P27
// changed the game, with its label kept inside the frame. Run through
// `npm run media:p27` (builds first). Needs Playwright and the git history
// back to P27_BASE; see docs/media.md.
//
// Files (JPEG, docs/media), <w> = 390 and 1280:
//   menu-gift-<w>-p27.jpg      Main Menu of a save with yesterday's gift claimed: "Quà ngày 2 đang chờ" (before/after)
//   hud-tem-<w>-p27.jpg        HUD on that save: the Tem chip beside the money (before/after)
//   staff-<w>-p27.jpg          Nhân viên after 2 days of work: trait chip, level, XP bar, Đào tạo confirm (before/after)
//   tasks-<w>-p27.jpg          Việc at 09:00 of day 3: gift card, special order, achievements opened
//   upgrades-tem-<w>-p27.jpg   Nâng cấp at the top shop level: Máy hát đĩa and Góc sofa priced in Tem
//   expand-<w>-p27.jpg         the shop with Mở rộng diện tích at level 4 and the four P27 furniture items
//   vip-<w>-p27.jpg            a VIP customer with the star over the head
//
// Each build plays its own saves with its own sim (Normal, the same seed,
// two hires on day 1 and the basic strategy of tests/integration/helpers.ts).
// The gift is claimed with yesterday's local date on the morning of day 3, so
// the Main Menu (which reads the real clock) shows the gift of day 2 waiting.
// P27_SAVES_ONLY=1 plays the saves and prints them, without a server or browser.
// Prints `!!` for a ring with nothing to ring or mostly off the frame; any
// `!!` ends the run with exit code 1.
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildRef, cuboid, FIXED_NOW, freeze, newContext, observeThree, OUT, sceneSnapshot, startPreview, thaw, urlFor, worldBox } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** The P26 release the before shots come from (git archive). */
const P27_BASE = process.env.P27_BASE ?? 'd58350b';
const NAMES = { before: `P26 (${P27_BASE})`, after: 'P27' };
const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
const BASE_PORT = PORT + 1;
const SEED = Number(process.env.P27_SEED ?? FIXED_NOW >>> 0);
const SHOP_NAME = 'Coffee Shop';
const DIFFICULTY = 'normal';
/** Morning of the menu, HUD and staff shots; the gift is claimed then with yesterday's date. */
const GIFT_DAY = 3;
/** Game minute of the Việc shot on GIFT_DAY (09:00): the special order is running. */
const TASKS_AT = 9 * 60;
/** Last day played while looking for a VIP in line. */
const LAST_DAY = 21;
const DAY_GUARD = 3000;
const HIRES = [['barista'], ['server']];
/** Money on the GIFT_DAY morning, so Đào tạo is not short of money in either build. */
const MORNING_MONEY = 3_000_000;
/** Tem on the top-level saves: enough for Máy hát đĩa and Góc sofa. */
const TICKETS = 12;
/** Upgrades of the expanded shop, bought to their cap: side room 4, the P27 furniture and the usual decor. */
const EXPAND_UPGRADES = ['expand_area', 'tables', 'neon_sign', 'bookshelf', 'record_player', 'sofa_corner', 'plants', 'paintings', 'lights', 'better_machine', 'big_counter'];
/** STAR_SIZE of src/render/actors/labels.ts, world units. */
const STAR_SIZE = 0.17;
/** Wheel delta for about 2x on the VIP (camera zoom = exp(-deltaY * 0.0015)). */
const VIP_WHEEL = -460;
const P27_DECOR =['neon', 'bookshelf', 'record_player', 'sofa'];
const DECOR_NAME = { neon: 'Biển neon', bookshelf: 'Kệ sách', record_player: 'Máy hát đĩa', sofa: 'Góc sofa' };
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 720 };
const VIEWPORTS = [PHONE, DESK];
const HIDE_TOASTS = '.toasts { display: none !important; }';
const PANEL = '#ui > .panel:not([hidden])';
const RED = '#e5383b';
const JPEG_QUALITY = 0.8;
/** A ring needs this share of its box on the frame. */
const MIN_ON_FRAME = 0.6;
const START = Date.now();
const progress = (who, what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${who}: ${what}`);

// --- Saves, each from the sim of the build that loads them. ---

/** Local 'YYYY-MM-DD' of `d`, as src/ui/core/today.ts localDateKey. */
const dateKey = (d) => `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
};

/**
 * Loads `root`'s sim and save code through vite and returns its saves:
 * `morning` (GIFT_DAY before opening, gift claimed with yesterday's date),
 * `tasks` (TASKS_AT of GIFT_DAY), `vip` (a VIP in line, P27 only),
 * `shop` (top shop level, side room 1, Tem for the Tem-priced furniture) and
 * `expanded` (the EXPAND_UPGRADES bought to their cap), plus `info` lines.
 */
export async function playSaves(root) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const [stateMod, sim, orders, save, upgrades, upgradeData, levels] = await Promise.all(
      ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/upgrades.ts', '/src/sim/data/upgrades.ts', '/src/sim/data/levels.ts'].map((p) => vite.ssrLoadModule(p)),
    );
    // P26 has no retention module: no Tem, gift or VIP there.
    const retention = existsSync(join(root, 'src', 'sim', 'retention.ts')) ? await vite.ssrLoadModule('/src/sim/retention.ts') : null;
    const saveText = (state) => {
      const data = new Map();
      const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
      const r = save.saveGame(state, 'auto', storage, FIXED_NOW);
      if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
      const key = save.saveKey('auto');
      return { key, text: data.get(key) };
    };
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
    const inLine = (c) => c.vip === true && (c.state === 'queueing' || c.state === 'ordering' || c.state === 'waiting');
    const saves = {};
    const info = [];
    const state = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
    for (let day = 1; day <= LAST_DAY; day++) {
      state.events = [];
      if (day > 1 && !sim.dispatch(state, { type: 'next_day' })) throw new Error(`${root}: next_day refused before day ${day}`);
      if (day === 1) {
        for (const [role] of HIRES) {
          const c = state.candidates[0];
          if (!c || !sim.dispatch(state, { type: 'hire_staff', candidateId: c.id, role })) throw new Error(`${root}: cannot hire a ${role}`);
        }
      }
      if (day === GIFT_DAY) {
        const claimed = sim.dispatch(state, { type: 'claim_daily_gift', dateKey: yesterdayKey() });
        state.money = Math.max(state.money, MORNING_MONEY);
        state.events = [];
        saves.morning = saveText(state);
        info.push(`morning of day ${day}: gift ${claimed ? 'claimed for yesterday' : 'not in this build'}, Tem ${state.retention?.tickets ?? '–'}, staff ${state.staff.map((m) => `${m.name} ${m.trait ?? '–'} exp ${m.exp ?? '–'}`).join(', ')}`);
      }
      sim.dispatch(state, { type: 'apply_restock' });
      state.events = [];
      if (!sim.dispatch(state, { type: 'start_day' })) throw new Error(`${root}: day ${day}: start_day refused`);
      for (let guard = 0; state.phase !== 'report' && guard < DAY_GUARD; guard++) {
        autoPlay(state);
        sim.step(state, 1);
        state.events = [];
        if (day === GIFT_DAY && !saves.tasks && state.minute >= TASKS_AT) {
          saves.tasks = saveText(state);
          info.push(`Việc at ${state.minute} min of day ${day}: special order ${state.specialOrder ? `${state.specialOrder.itemId} ${state.specialOrder.progress}/${state.specialOrder.target}` : 'none'}`);
        }
        if (retention && day >= GIFT_DAY && !saves.vip && state.customers.some(inLine)) {
          saves.vip = saveText(state);
          info.push(`VIP in line on day ${day} at ${state.minute} min`);
        }
      }
      if (state.phase !== 'report') throw new Error(`${root}: day ${day} did not reach the report`);
      if (day >= GIFT_DAY && (saves.vip || !retention)) break;
    }
    if (retention && !saves.vip) throw new Error(`${root}: no VIP in line by day ${LAST_DAY}`);

    const topShop = (bought) => {
      const s = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, SEED);
      s.shopLevel = levels.MAX_SHOP_LEVEL ?? levels.LEVELS.length;
      s.money = 1e12;
      if (retention) retention.ensureRetention(s).tickets = 100;
      for (const [id, max] of bought) {
        for (let guard = 0; guard < 12 && upgrades.upgradeLevel(s, id) < max; guard++) if (!sim.dispatch(s, { type: 'buy_upgrade', upgradeId: id })) break;
      }
      s.money = 20_000_000;
      if (retention) retention.ensureRetention(s).tickets = TICKETS;
      s.events = [];
      return s;
    };
    const shop = topShop([['expand_area', 1]]);
    saves.shop = saveText(shop);
    const expanded = topShop(EXPAND_UPGRADES.filter((id) => (() => { try { return upgradeData.getUpgrade(id); } catch { return null; } })()).map((id) => [id, 99]));
    saves.expanded = saveText(expanded);
    const layout = upgrades.getShopLayout(expanded);
    info.push(`expanded: ${EXPAND_UPGRADES.map((id) => `${id} ${upgrades.upgradeLevel(expanded, id)}`).join(', ')}`);
    return { saves, info, layout };
  } finally {
    await vite.close();
  }
}

// --- Browser. ---

/** For each name → CSS selector, the boxes of every visible match (viewport CSS px). */
function measureAll(sels) {
  const out = {};
  for (const [name, sel] of Object.entries(sels)) {
    out[name] = [...document.querySelectorAll(sel)]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)
      .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
  }
  return out;
}

/** First visible match's text for each name → selector. */
function measureTexts(sels) {
  const out = {};
  for (const [name, sel] of Object.entries(sels)) {
    const el = [...document.querySelectorAll(sel)].find((e) => e.checkVisibility());
    out[name] = el ? String(el.textContent ?? '').trim().replace(/\s+/g, ' ') : '';
  }
  return out;
}

async function shot(page, sels = {}, texts = {}) {
  await sleep(300);
  return { png: await page.screenshot({ style: HIDE_TOASTS }), boxes: await page.evaluate(measureAll, sels), texts: await page.evaluate(measureTexts, texts) };
}

async function gameContext(browser, viewport, save) {
  const context = await newContext(browser, { viewport });
  await context.addInitScript(({ key, text }) => localStorage.setItem(key, text), save);
  await context.addInitScript(observeThree);
  return context;
}

/** Loads `url`, waits for the Main Menu with its 3D scene. */
async function openMenu(page, url) {
  // The loading screen now and then stays up headless; one reload gets past it.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url);
      await page.getByRole('button', { name: 'Ván mới', exact: true }).waitFor();
      await page.locator('#boot').waitFor({ state: 'detached' });
      await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
      console.log(`loading screen stuck at ${url}, reloading`);
    }
  }
}

async function resume(page, url, ready) {
  await openMenu(page, url);
  await page.getByRole('button', { name: /^Tiếp tục/ }).click();
  await page.locator(ready).first().waitFor();
  await sleep(800);
}

async function openPanel(page, id) {
  await page.evaluate((sel) => document.querySelector(sel)?.click(), `nav.dock [data-panel="${id}"]`);
  await page.locator(`${PANEL} .panel-body > *`).first().waitFor();
  await sleep(500);
}

async function scrollTo(page, sel, block = 'start') {
  await page.evaluate(({ sel, block }) => document.querySelector(sel)?.scrollIntoView({ block }), { sel, block });
  await sleep(300);
}

async function session(browser, url, save, viewport, fn) {
  const context = await gameContext(browser, viewport, save);
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

const GIFT_LINE = '[data-menu-line="gift"]';
const CONTINUE = '.menu-list button';

function menuShot(page, url) {
  return (async () => {
    await openMenu(page, url);
    await sleep(800);
    return shot(page, { gift: GIFT_LINE, cont: CONTINUE }, { gift: GIFT_LINE });
  })();
}

const TEM_CHIP = '.hud .hud-val:has([data-stat="tickets"])';
const MONEY = '.hud [data-cluster="progress"] .hud-val:first-child';

async function hudShot(page, url) {
  await resume(page, url, '.hud [data-action="open"]');
  return shot(page, { tem: TEM_CHIP, money: MONEY, cluster: '.hud [data-cluster="progress"]' }, { tem: '.hud [data-stat="tickets"]' });
}

const STAFF_ROW = `${PANEL} .item[data-staff]`;

/** Nhân viên with the first staff row in view; P27 clicks Đào tạo so its confirm shows. */
async function staffShot(page, url) {
  await resume(page, url, '.hud [data-action="open"]');
  await openPanel(page, 'staff');
  await scrollTo(page, STAFF_ROW);
  const train = page.locator(`${STAFF_ROW} [data-action="train"]`).first();
  const trainText = (await train.count()) ? (await train.textContent()).trim() : '';
  if (trainText) {
    await train.click();
    await page.locator(`${STAFF_ROW} .confirm`).first().waitFor({ timeout: 3000 }).catch(() => {});
    await scrollTo(page, STAFF_ROW);
  }
  const first = `${STAFF_ROW}:first-of-type`;
  const out = await shot(
    page,
    { row: STAFF_ROW, trait: `${STAFF_ROW} [data-trait]`, level: `${first} .item-actions > .item-meta`, bar: `${STAFF_ROW} [role="progressbar"]`, confirm: `${STAFF_ROW} .confirm` },
    { level: `${first} .item-actions > .item-meta`, confirm: `${STAFF_ROW} .confirm p`, trait: `${STAFF_ROW} [data-trait]` },
  );
  out.trainText = trainText;
  return out;
}

async function tasksShot(page, url) {
  // No pause: it opens the pause menu over the panel. The day runs at 1x while the panel is shot.
  await resume(page, url, 'nav.dock');
  await openPanel(page, 'tasks');
  await page.locator(`${PANEL} [data-action="achievements"]`).click();
  await sleep(300);
  const sels = { gift: `${PANEL} .gift`, order: `${PANEL} [data-special-order]`, toggle: `${PANEL} [data-action="achievements"]`, ach: `${PANEL} [data-achievement]` };
  const texts = { order: `${PANEL} [data-special-order] .item-title`, giftBtn: `${PANEL} [data-action="claim-gift"]`, ach: `${PANEL} [data-achievement] .item-meta` };
  // The panel scrolls on a phone: one frame from the gift card, one from the special order down.
  await scrollTo(page, `${PANEL} .gift`, 'center');
  const top = await shot(page, sels, texts);
  await scrollTo(page, `${PANEL} [data-special-order]`, 'start');
  const low = await shot(page, sels, texts);
  return { top, low };
}

const UPG = (id) => `${PANEL} li[data-upgrade="${id}"]`;

async function upgradesShot(page, url) {
  await resume(page, url, '.hud [data-action="open"]');
  await openPanel(page, 'upgrades');
  await scrollTo(page, UPG('record_player'), 'center');
  return shot(page, { record: UPG('record_player'), sofa: UPG('sofa_corner'), tem: '.hud .hud-val:has([data-stat="tickets"])' }, { record: `${UPG('record_player')} .item-meta`, sofa: `${UPG('sofa_corner')} .item-meta` });
}

/** The expanded shop with no panel open: the side room and the P27 furniture, projected with the frame's camera. */
async function expandShot(page, url, layout) {
  await resume(page, url, '.hud [data-action="open"]');
  await sleep(2500);
  const png = await page.screenshot({ style: HIDE_TOASTS });
  const snap = await sceneSnapshot(page);
  const e = layout.expansion;
  const room = e ? worldBox(snap, cuboid(e.minX, e.maxX, 0, 0.9, e.minZ, e.maxZ), 0) : null;
  const decor = {};
  for (const kind of P27_DECOR) {
    const y = kind === 'neon' ? [1.8, 2.8] : kind === 'record_player' ? [0.9, 1.3] : [0, kind === 'bookshelf' ? 1.9 : 0.9];
    decor[kind] = layout.decor.filter((d) => d.kind === kind).map((d) => worldBox(snap, cuboid(d.pos.x - 0.45, d.pos.x + 0.45, y[0], y[1], d.pos.z - 0.35, d.pos.z + 0.35), 2));
  }
  return { png, boxes: { room: room ? [room] : [], ...decor } };
}

/** Screen boxes of the VIP stars drawn in the last frame of #scene. */
function vipStars(starSize) {
  const scene = window.__mediaScene;
  const camera = window.__mediaCamera;
  if (!scene || !camera) return [];
  const r = document.getElementById('scene').getBoundingClientRect();
  const v = camera.matrixWorldInverse.elements;
  const p = camera.projectionMatrix.elements;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const out = [];
  scene.traverse((o) => {
    // The star of src/render/actors/labels.ts: renderOrder 13 like the bubble, told apart by its STAR_SIZE scale.
    if (!o.isSprite || o.renderOrder !== 13 || Math.abs(o.scale.x - starSize) > 1e-3 || !shown(o)) return;
    const [x, y, z] = [o.matrixWorld.elements[12], o.matrixWorld.elements[13], o.matrixWorld.elements[14]];
    const ev = [0, 1, 2, 3].map((i) => v[i] * x + v[4 + i] * y + v[8 + i] * z + v[12 + i]);
    const c = [0, 1, 3].map((i) => p[i] * ev[0] + p[4 + i] * ev[1] + p[8 + i] * ev[2] + p[12 + i] * ev[3]);
    const sx = r.left + ((c[0] / c[2] + 1) / 2) * r.width;
    const sy = r.top + ((1 - c[1] / c[2]) / 2) * r.height;
    out.push({ x: sx - 22, y: sy - 22, w: 44, h: 44 });
  });
  return out;
}

async function vipShot(page, url) {
  await resume(page, url, 'nav.dock');
  // The camera eases to its fit after loading; then one frozen frame for the shot and the star positions.
  await sleep(2500);
  // The star is a few px at zoom 1: zoom the game camera in on the star (wheel zooms around the pointer).
  const at = (await page.evaluate(vipStars, STAR_SIZE))[0];
  let zoomed = false;
  if (at) {
    zoomed = true;
    await page.mouse.move(at.x + at.w / 2, at.y + at.h / 2 + 30);
    await page.mouse.wheel(0, VIP_WHEEL);
    await sleep(1200);
    // On a narrow frame the zoom can push the star out: back to the default camera then.
    const now = (await page.evaluate(vipStars, STAR_SIZE))[0];
    const vp = page.viewportSize();
    if (!now || onFrame(now, vp.width, vp.height) < MIN_ON_FRAME) {
      await page.keyboard.press('Home');
      await sleep(1500);
      zoomed = false;
    }
  }
  await freeze(page);
  try {
    const png = await page.screenshot({ style: HIDE_TOASTS });
    return { png, zoomed, boxes: { star: (await page.evaluate(vipStars, STAR_SIZE)).map((b) => ({ x: b.x + 10, y: b.y + 10, w: b.w - 20, h: b.h - 20 })) } };
  } finally {
    await thaw(page);
  }
}

// --- Boards: frames side by side, red rings and labels inside each frame. ---

/**
 * Runs in the browser. Draws the `crop` of each frame at `scale` with a title
 * over it, rings each mark's boxes in red and puts its label next to them,
 * moved step by step until it is off every ring and label and inside the
 * frame. Returns a JPEG (base64) and the labels that found no free spot.
 */
async function drawP27({ frames, crop, scale, notes, red, quality }) {
  const INK = '#2b1d14';
  const PAD = 20;
  const TITLE = 40;
  const load = async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const imgs = await Promise.all(frames.map((f) => load(f.png)));
  const fw = Math.round(crop.w * scale);
  const fh = Math.round(crop.h * scale);
  const width = PAD + frames.length * (fw + PAD);
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
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
  probe.font = '600 16px Nunito, system-ui, sans-serif';
  const noteLines = notes.flatMap((n) => wrap(probe, n, width - 2 * PAD));
  const canvas = new OffscreenCanvas(width, PAD + TITLE + fh + 12 + 24 * noteLines.length + PAD);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  const top = PAD + TITLE;
  const missed = [];
  frames.forEach((f, i) => {
    const fx = PAD + i * (fw + PAD);
    ctx.font = '700 20px Nunito, system-ui, sans-serif';
    ctx.fillStyle = INK;
    ctx.fillText(f.title, fx, PAD + TITLE / 2 - 4, fw);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgs[i], crop.x, crop.y, crop.w, crop.h, fx, top, fw, fh);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.strokeRect(fx, top, fw, fh);
    const toBoard = (b) => ({ x: fx + (b.x - crop.x) * scale - 4, y: top + (b.y - crop.y) * scale - 4, w: b.w * scale + 8, h: b.h * scale + 8 });
    const rings = f.marks.map((m) => m.boxes.map(toBoard));
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, top, fw, fh);
    ctx.clip();
    for (const rs of rings) {
      for (const r of rs) {
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 8);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = red;
        ctx.stroke();
      }
    }
    ctx.restore();
    const placed = [];
    const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const all = rings.flat();
    const labelPx = Math.max(14, Math.round(15 * Math.min(scale, 1.4)));
    ctx.font = `700 ${labelPx}px Nunito, system-ui, sans-serif`;
    const lineH = Math.round(labelPx * 1.3);
    f.marks.forEach((m, k) => {
      const own = rings[k];
      if (own.length === 0) return;
      const text = wrap(ctx, m.label, Math.min(fw - 24, 340));
      const tw = Math.max(...text.map((t) => ctx.measureText(t).width)) + 16;
      const th = 8 + lineH * text.length;
      const x0 = Math.min(...own.map((r) => r.x));
      const x1 = Math.max(...own.map((r) => r.x + r.w));
      const y0 = Math.min(...own.map((r) => r.y));
      const y1 = Math.max(...own.map((r) => r.y + r.h));
      const cx = (x0 + x1) / 2;
      const inside = (x, y) => ({ x: Math.min(fx + fw - tw - 4, Math.max(fx + 4, x)), y: Math.min(top + fh - th - 4, Math.max(top + 4, y)), w: tw, h: th });
      const tries = [];
      for (let s = 0; s < 14; s++) {
        const d = 6 + s * (th / 2 + 4);
        tries.push(inside(cx - tw / 2, y1 + d), inside(cx - tw / 2, y0 - th - d), inside(x1 + 6 + s * 20, y0), inside(x0 - tw - 6 - s * 20, y0));
      }
      const free = tries.find((t) => !placed.some((b) => hits(t, b)) && !all.some((b) => hits(t, b)));
      if (!free) missed.push(m.label);
      const spot = free ?? tries[0];
      placed.push(spot);
      const lx = Math.min(Math.max(cx, spot.x), spot.x + tw);
      const ly = Math.min(Math.max((y0 + y1) / 2, spot.y), spot.y + th);
      const rx = Math.min(Math.max(lx, x0), x1);
      const ry = Math.min(Math.max(ly, y0), y1);
      if (Math.hypot(rx - lx, ry - ly) > 8) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.lineWidth = 3;
        ctx.strokeStyle = red;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.roundRect(spot.x, spot.y, tw, th, 10);
      ctx.fillStyle = red;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      text.forEach((t, j) => ctx.fillText(t, spot.x + 8, spot.y + 4 + lineH * j + lineH / 2));
    });
  });
  ctx.font = '600 16px Nunito, system-ui, sans-serif';
  ctx.fillStyle = INK;
  noteLines.forEach((line, i) => ctx.fillText(line, PAD, top + fh + 12 + 24 * i + 12));
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { jpg: btoa(bin), missed };
}

/** Share of `b` inside the w × h frame. */
const onFrame = (b, w, h) => (Math.max(0, Math.min(b.x + b.w, w) - Math.max(b.x, 0)) * Math.max(0, Math.min(b.y + b.h, h) - Math.max(b.y, 0))) / Math.max(1, b.w * b.h);

/**
 * Writes docs/media/<name>: `frames` ({ png, title, marks: [{ boxes, label }] })
 * side by side, cropped to `crop` (viewport CSS px; the whole frame when
 * absent) and scaled to fit `maxWidth`. Warns with !! for a mark with nothing
 * to ring, a ring mostly off the frame or a label with no free spot.
 */
async function board(browser, name, viewport, { frames, crop, notes, maxWidth = 1800, zoom }) {
  // `optional` marks are left out of a frame where they ring nothing on it.
  for (const f of frames) f.marks = f.marks.map((m) => (m.optional ? { ...m, boxes: m.boxes.filter((b) => onFrame(b, viewport.width, viewport.height) >= MIN_ON_FRAME) } : m)).filter((m) => !m.optional || m.boxes.length > 0);
  for (const f of frames) {
    for (const m of f.marks) {
      if (m.boxes.length === 0) console.warn(`!! ${name}: nothing to ring for "${m.label}" (${f.title})`);
      const off = m.boxes.filter((b) => onFrame(b, viewport.width, viewport.height) < MIN_ON_FRAME);
      if (off.length > 0) console.warn(`!! ${name}: "${m.label}" rings something mostly off the frame`);
    }
  }
  const c = crop ?? { x: 0, y: 0, w: viewport.width, h: viewport.height };
  const scale = Math.min(zoom ?? (viewport.width < 600 ? 1.4 : 1),(maxWidth - 20 * (frames.length + 1)) / frames.length / c.w);
  const page = await browser.newPage();
  try {
    const r = await page.evaluate(drawP27, { frames: frames.map((f) => ({ ...f, png: f.png.toString('base64') })), crop: c, scale, notes, red: RED, quality: JPEG_QUALITY });
    if (r.missed.length > 0) console.warn(`!! ${name}: no free spot for ${r.missed.map((l) => `"${l}"`).join(', ')}`);
    const file = join(OUT, name);
    writeFileSync(file, Buffer.from(r.jpg, 'base64'));
    console.log(`${name}: ${frames.map((f) => `${f.title} [${f.marks.filter((m) => m.boxes.length).map((m) => m.label).join(' | ')}]`).join(' · ')}`);
    return relative(ROOT, file);
  } finally {
    await page.close();
  }
}

/** A crop of the frame around `boxes`, grown by `pad`, at least `minH` high. */
function cropAround(boxes, viewport, pad = 60, minH = 0) {
  if (boxes.length === 0) return null;
  let x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  let x1 = Math.min(viewport.width, Math.max(...boxes.map((b) => b.x + b.w)) + pad);
  let y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  let y1 = Math.min(viewport.height, Math.max(...boxes.map((b) => b.y + b.h)) + pad);
  if (y1 - y0 < minH) y1 = Math.min(viewport.height, y0 + minH);
  if (viewport.width < 600) [x0, x1] = [0, viewport.width];
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
}

/** A square-ish crop of `pad` px around the middle of `boxes`, inside the frame; null without boxes. */
function closeCrop(boxes, viewport, pad) {
  if (boxes.length === 0) return null;
  const cx = boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / boxes.length;
  const cy = boxes.reduce((s, b) => s + b.y + b.h / 2, 0) / boxes.length;
  const w = Math.min(viewport.width, 2 * pad);
  const h = Math.min(viewport.height, 2 * pad);
  return { x: Math.round(Math.min(viewport.width - w, Math.max(0, cx - w / 2))), y: Math.round(Math.min(viewport.height - h, Math.max(0, cy - h / 2))), w, h };
}

const before = (title) => `${title} · ${NAMES.before}`;
const after = (title) => `${title} · ${NAMES.after}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const temps = [];
  const servers = [];
  let browser = null;
  const files = [];
  try {
    console.log(`exporting and building P26 (${P27_BASE})…`);
    const baseRoot = buildRef(P27_BASE);
    temps.push(baseRoot);
    const cur = await playSaves(ROOT);
    for (const l of cur.info) console.log(`P27 ${l}`);
    const base = await playSaves(baseRoot);
    for (const l of base.info) console.log(`P26 ${l}`);
    if (process.env.P27_SAVES_ONLY === '1') return;

    servers.push(await startPreview(ROOT, PORT));
    servers.push(await startPreview(baseRoot, BASE_PORT));
    const curUrl = urlFor(PORT);
    const baseUrl = urlFor(BASE_PORT);

    // P27_WIDTHS=1280 captures one width only.
    const widths = process.env.P27_WIDTHS?.split(',').map(Number);
    for (const v of VIEWPORTS.filter((x) => !widths || widths.includes(x.width))) {
      const w = v.width;
      // A fresh browser per width: after a dozen WebGL pages one browser left the loading screen up.
      if (browser) await browser.close();
      browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
      progress('both', `sessions at ${w}`);
      const [m1, m0] = await Promise.all([session(browser, curUrl, cur.saves.morning, v, (p) => menuShot(p, curUrl)), session(browser, baseUrl, base.saves.morning, v, (p) => menuShot(p, baseUrl))]);
      files.push(
        await board(browser, `menu-gift-${w}-p27.jpg`, v, {
          frames: [
            { png: m0.png, title: before('Main Menu'), marks: [{ boxes: m0.boxes.cont.slice(0, 1), label: 'Tiếp tục: chưa có dòng quà' }] },
            { png: m1.png, title: after('Main Menu'), marks: [{ boxes: m1.boxes.gift, label: `Dòng mới "${m1.texts.gift}" dưới Tiếp tục` }] },
          ],
          crop: cropAround([...m0.boxes.cont, ...m1.boxes.gift], v, 90),
          notes: [`Khổ ${w} px. Save ngày ${GIFT_DAY}, quà đã nhận với ngày hôm qua của máy: hôm nay chờ quà ngày 2 của chuỗi.`],
        }),
      );

      const [h1, h0] = await Promise.all([session(browser, curUrl, cur.saves.morning, v, (p) => hudShot(p, curUrl)), session(browser, baseUrl, base.saves.morning, v, (p) => hudShot(p, baseUrl))]);
      files.push(
        await board(browser, `hud-tem-${w}-p27.jpg`, v, {
          frames: [
            { png: h0.png, title: before('HUD'), marks: [{ boxes: h0.boxes.cluster, label: 'Tiền, sao, cấp: chưa có Tem' }] },
            { png: h1.png, title: after('HUD'), marks: [{ boxes: h1.boxes.tem, label: `Chip Tem: ${h1.texts.tem}` }] },
          ],
          crop: cropAround([...h0.boxes.cluster, ...h1.boxes.cluster], v, 30, w < 600 ? 260 : 200),
          notes: [`Khổ ${w} px, sáng ngày ${GIFT_DAY} sau khi nhận quà ngày 1. Tem nằm ngay sau tiền trong cụm Tiến độ.`],
        }),
      );

      const [s1, s0] = await Promise.all([session(browser, curUrl, cur.saves.morning, v, (p) => staffShot(p, curUrl)), session(browser, baseUrl, base.saves.morning, v, (p) => staffShot(p, baseUrl))]);
      files.push(
        await board(browser, `staff-${w}-p27.jpg`, v, {
          frames: [
            { png: s0.png, title: before('Nhân viên'), marks: [{ boxes: s0.boxes.row.slice(0, 1), label: 'Chỉ tên, vai, lương: không cấp, không đặc điểm' }] },
            {
              png: s1.png,
              title: after('Nhân viên'),
              marks: [
                { boxes: s1.boxes.trait.slice(0, 1), label: `Chip đặc điểm "${s1.texts.trait}"` },
                { boxes: s1.boxes.bar.slice(0, 1), label: `Thanh KN: ${s1.texts.level.slice(s1.texts.level.indexOf('Cấp'))}` },
                { boxes: s1.boxes.confirm, label: 'Xác nhận Đào tạo tại chỗ' },
              ],
            },
          ],
          crop: w < 600 ? null : cropAround([...s0.boxes.row, ...s1.boxes.row], v, 40, 360),
          notes: [`Khổ ${w} px, sáng ngày ${GIFT_DAY}, hai nhân viên đã làm 2 ngày. Đã bấm "${s1.trainText}": ${s1.texts.confirm}`],
        }),
      );

      const t = await session(browser, curUrl, cur.saves.tasks, v, (p) => tasksShot(p, curUrl));
      const tMarks = (f) => [
        { boxes: f.boxes.gift, label: `Thẻ Quà hằng ngày: chuỗi 7 ô, nút "${f.texts.giftBtn}"`, optional: true },
        { boxes: f.boxes.order, label: `Đơn đặc biệt: ${f.texts.order}`, optional: true },
        { boxes: f.boxes.ach.slice(0, 2), label: `Thành tựu đã sổ ra: ${f.texts.ach}`, optional: true },
      ];
      // The panel scrolls at both widths: the gift card at the top, the special order and achievements below.
      const tFrames = [
        { png: t.top.png, title: after('Việc, đầu bảng'), marks: tMarks(t.top) },
        { png: t.low.png, title: after('Việc, cuộn xuống'), marks: tMarks(t.low) },
      ];
      for (const k of ['gift', 'order', 'ach']) if (t.top.boxes[k].length === 0 && t.low.boxes[k].length === 0) console.warn(`!! tasks-${w}-p27.jpg: no ${k} in the Việc panel`);
      files.push(await board(browser, `tasks-${w}-p27.jpg`, v, { frames: tFrames, notes: [`Khổ ${w} px, save lúc 09:00 ngày ${GIFT_DAY}, game chạy 1x khi chụp. Bấm "Thành tựu" để sổ danh sách.`] }));

      const u = await session(browser, curUrl, cur.saves.shop, v, (p) => upgradesShot(p, curUrl));
      files.push(
        await board(browser, `upgrades-tem-${w}-p27.jpg`, v, {
          frames: [
            {
              png: u.png,
              title: after('Nâng cấp'),
              marks: [
                { boxes: u.boxes.record, label: `Máy hát đĩa: ${/Giá [^·]+/.exec(u.texts.record)?.[0]?.trim() ?? ''}` },
                { boxes: u.boxes.sofa, label: `Góc sofa: ${/Giá [^·]+/.exec(u.texts.sofa)?.[0]?.trim() ?? ''}` },
                { boxes: u.boxes.tem, label: 'Số Tem đang có' },
              ],
            },
          ],
          notes: [`Khổ ${w} px, cấp quán tối đa, Mở rộng diện tích cấp 1, ${TICKETS} Tem. Nội thất P27 trả tiền và Tem.`],
        }),
      );

      const x = await session(browser, curUrl, cur.saves.expanded, v, (p) => expandShot(p, curUrl, cur.layout));
      files.push(
        await board(browser, `expand-${w}-p27.jpg`, v, {
          frames: [
            {
              png: x.png,
              title: after('Quán mở rộng cấp 4'),
              // A phone frame shows part of the shop: what lies off it is left out there (1280 rings all).
              marks: [{ boxes: x.boxes.room, label: 'Phòng bên, Mở rộng diện tích cấp 4' }, ...P27_DECOR.map((k) => ({ boxes: x.boxes[k].filter(Boolean), label: DECOR_NAME[k] }))].map((m) => ({ ...m, optional: w < 600 })),
            },
          ],
          notes: [`Khổ ${w} px, camera mặc định${w < 600 ? ' (khổ điện thoại thấy một phần quán, chỉ khoanh món nằm trong khung)' : ''}. Save: ${cur.info.at(-1).replace('expanded: ', '')}.`],
        }),
      );

      const vip = await session(browser, curUrl, cur.saves.vip, v, (p) => vipShot(p, curUrl));
      files.push(
        await board(browser, `vip-${w}-p27.jpg`, v, {
          frames: [{ png: vip.png, title: after('Khách VIP'), marks: [{ boxes: vip.boxes.star, label: 'Ngôi sao trên đầu khách VIP' }] }],
          // The star is small: a close crop around it, enlarged.
          crop: closeCrop(vip.boxes.star, v, 150),
          zoom: 2,
          notes: [`Khổ ${w} px, save lúc khách VIP đang xếp hàng (ngày ${/day (\d+)/.exec(cur.info.find((l) => l.startsWith('VIP')))?.[1]}), chụp 2,5 s sau khi vào quán${vip.zoomed ? ', camera phóng khoảng 2x vào khách VIP' : ', camera mặc định'}.`],
        }),
      );
    }
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }
  for (const f of files) console.log(`ok ${f} ${Math.round(statSync(join(ROOT, f)).size / 1024)} kB`);
  if (warnings > 0) {
    console.error(`${warnings} !! warning(s): fix them before using the shots`);
    process.exitCode = 1;
  }
}

/** `!!` lines printed so far; any of them fails the run. */
let warnings = 0;

// check-layout.mjs imports playSaves; only a direct run captures.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const warn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).startsWith('!!')) warnings++;
    warn(...args);
  };
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
