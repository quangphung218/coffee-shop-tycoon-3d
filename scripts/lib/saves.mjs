// Saves played by the sim of the build that loads them: a new game with two
// hires, days played with the basic strategy of tests/integration/helpers.ts,
// a scene at a given weather and minute, the first level-up, the first day
// as check-layout.mjs sets it up, and the text written to the 'auto' slot.
// Scenarios (scripts/scenarios/*.mjs) build their saves from these;
// measure-frames.mjs --scene loads SCENES through sceneSaves();
// check-layout.mjs reaches its Daily Report through playFirstDay().

/** Day the scene saves are taken on: day 1 is played first so the shop has customers and a rating. */
export const SCENE_DAY = 2;
export const SHOP_NAME = 'Coffee Shop';
export const DIFFICULTY = 'normal';
export const HIRES = ['barista', 'server'];
export const DAY_GUARD = 3000;
/** Last day played while looking for the first level-up. */
export const LEVELUP_LAST_DAY = 14;
/** Seed of the scenario saves: MEDIA_SEED (the page's fixed clock) as a 32-bit seed. */
export const SEED = Number(process.env.MEDIA_SEED ?? 1760400000000) >>> 0;

/** measure-frames.mjs --scene ids: weather and game minute of each save. */
export const SCENES = {
  'dusk-rain': { weather: 'rainy', minute: 19 * 60 },
  'noon-sunny': { weather: 'sunny', minute: 12 * 60 },
};
export const SCENE_IDS = Object.keys(SCENES);
/** Shot minutes of the P29 scene shots: 07:00, 12:00, 19:30. */
export const SHOT_MINUTES = [7 * 60, 12 * 60, 19 * 60 + 30];
export const SHOT_WEATHERS = ['sunny', 'rainy'];
/** Settings quality of graphics Cao and Thấp. */
export const SHOT_QUALITIES = ['high', 'low'];

/** 'HHMM' of a game minute, e.g. 1170 → '1930'. */
export const hhmm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}${String(minute % 60).padStart(2, '0')}`;
/** 'HH:MM' of a game minute, e.g. 725 → '12:05'. */
export const clockOf = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;

/** File name of a P29 scene shot: hour, weather, quality and width. */
export const shotName = ({ minute, weather, quality, width }) => `scene-${hhmm(minute)}-${weather}-${quality}-${width}-p29.jpg`;

/** `{ key, text }` of `state` written to the 'auto' slot by the build's save module (current SAVE_VERSION). */
export function saveText(save, state, now = Number(process.env.MEDIA_SEED ?? 1760400000000)) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.saveGame(state, 'auto', storage, now);
  if (!r.ok) throw new Error(`cannot write the media save: ${r.error.message}`);
  const key = save.saveKey('auto');
  return { key, text: data.get(key) };
}

/** Loads `{ key, text }` back through the build's save module, as Tiếp tục does. */
export function loadSave(save, { key, text }) {
  const data = new Map([[key, text]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const r = save.loadGame('auto', storage);
  if (!r.ok) throw new Error(`save does not load back: ${r.error.message}`);
  return r.value;
}

/** autoPlay of tests/integration/helpers.ts, on the build's `sim` and `orders` modules. */
export function autoPlay({ sim, orders }, s) {
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

/** Opens the day with `weather` (when given) and plays it until `until(state)` or its report. */
export function playDay(mods, s, { weather, until } = {}) {
  const { sim } = mods;
  s.events = [];
  if (s.phase === 'report' && !sim.dispatch(s, { type: 'next_day' })) throw new Error(`next_day refused after day ${s.day}`);
  if (weather) s.weather = weather;
  sim.dispatch(s, { type: 'apply_restock' });
  s.events = [];
  if (!sim.dispatch(s, { type: 'start_day' })) throw new Error(`day ${s.day}: start_day refused`);
  s.events = [];
  for (let guard = 0; !until?.(s) && s.phase !== 'report' && guard < DAY_GUARD; guard++) {
    autoPlay(mods, s);
    sim.step(s, 1);
    s.events = [];
  }
}

/** Plays the running day on to its report, then each next day up to the report of `lastDay`. */
export function playToReport(mods, s, lastDay) {
  const { sim } = mods;
  for (;;) {
    for (let guard = 0; s.phase !== 'report' && guard < DAY_GUARD; guard++) {
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

/** After the report of a day: the next morning in preparation (restocked, not yet open). */
export function openNextMorning(mods, s) {
  const { sim } = mods;
  s.events = [];
  if (!sim.dispatch(s, { type: 'next_day' })) throw new Error(`next_day refused after day ${s.day}`);
  sim.dispatch(s, { type: 'apply_restock' });
  s.events = [];
  return s;
}

/** A new game with HIRES hired on day 1. */
export function newGame({ stateMod, sim }, seed = SEED) {
  const s = stateMod.createNewGame(SHOP_NAME, DIFFICULTY, seed);
  for (const role of HIRES) {
    const c = s.candidates[0];
    if (!c || !sim.dispatch(s, { type: 'hire_staff', candidateId: c.id, role })) throw new Error(`cannot hire a ${role}`);
  }
  s.events = [];
  return s;
}

/**
 * The GameState of a scene: day 1 played to its report, then day SCENE_DAY
 * opened with `weather` and played until the clock reaches `minute`.
 * `mods` = the build's { stateMod: sim/state, sim: sim/index, orders: sim/orders }.
 */
export function playToScene(mods, { weather, minute }, seed = SEED) {
  const s = newGame(mods, seed);
  for (let day = 1; day < SCENE_DAY; day++) {
    playDay(mods, s, {});
    if (s.phase !== 'report') throw new Error(`day ${day} did not reach the report`);
  }
  playDay(mods, s, { weather, until: (st) => st.minute >= minute });
  if (s.minute !== minute || s.weather !== weather) throw new Error(`scene ${weather} ${minute}: stopped at ${s.weather} ${s.minute} (${s.phase})`);
  s.events = [];
  return s;
}

/** The GameState at the report of the first day with a level-up. */
export function playToLevelUp(mods, seed = SEED) {
  const s = newGame(mods, seed);
  for (let day = 1; day <= LEVELUP_LAST_DAY; day++) {
    playDay(mods, s, {});
    if (s.phase !== 'report') throw new Error(`day ${day} did not reach the report`);
    if (s.lastReport?.levelUp) {
      s.events = [];
      return s;
    }
  }
  throw new Error(`no level-up by day ${LEVELUP_LAST_DAY}`);
}

/**
 * Day 1 the way check-layout.mjs used to play it in the browser, up to the
 * last tick before its report: a new game (`shopName`, `difficulty`, `seed`
 * as the New Game form sends them), the Kho suggestion bought (apply_restock,
 * what Gợi ý + Nhập hàng buy), `hires` candidates taken from the top of the
 * list in the role the Nhân viên panel picks (rolePlan of src/sim/staff.ts
 * with no day stats: barista, then server), the day opened and run on the
 * staff alone: no player action, as nobody plays while the layout check
 * waits. The state returned is still open, one tick (step 1) before the day
 * ends (often 19:59 with the shop already empty), so a browser that resumes
 * it runs its own day end (dayEnded, the autosave and its line on the Daily
 * Report) just as it did when the check waited for the whole day.
 * `mods` adds `staff` (sim/staff) to the usual modules.
 */
export function playFirstDay({ stateMod, sim, staff }, { shopName, difficulty, seed, hires }) {
  const s = stateMod.createNewGame(shopName, difficulty, seed);
  sim.dispatch(s, { type: 'apply_restock' });
  for (let i = 0; i < hires; i++) {
    const c = s.candidates[0];
    const role = staff.rolePlan(null, s.staff.length + 1)[s.staff.length] ?? 'none';
    if (!c || !sim.dispatch(s, { type: 'hire_staff', candidateId: c.id, role })) throw new Error(`cannot hire a ${role}`);
  }
  s.events = [];
  if (!sim.dispatch(s, { type: 'start_day' })) throw new Error('day 1: start_day refused');
  // The day ends on the tick that finds the shop empty from 20:00 on (that can
  // be the tick that reaches 20:00): keep the state before each tick and hand
  // back the one before the report.
  let before = null;
  for (let guard = 0; s.phase !== 'report' && guard < DAY_GUARD; guard++) {
    before = structuredClone(s);
    sim.step(s, 1);
    s.events = [];
  }
  if (s.phase !== 'report' || !before) throw new Error('day 1 did not reach the report');
  before.events = [];
  return before;
}

/** One line on a scene state for the logs. */
export const sceneInfo = (s) => `day ${s.day} ${hhmm(s.minute)} ${s.weather}, ${s.customers.length} customers, ${s.staff.length} staff`;

/**
 * The modules of the build at `root`, loaded through vite: sim state, sim,
 * orders, save, menu, and the character rig (face prints); `extra` names
 * more, `{ staff: '/src/sim/staff.ts' }` adds `staff`.
 */
export async function loadSim(root, extra = {}) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const names = ['stateMod', 'sim', 'orders', 'save', 'menu', 'rig', ...Object.keys(extra)];
    const paths = ['/src/sim/state.ts', '/src/sim/index.ts', '/src/sim/orders.ts', '/src/save/save.ts', '/src/sim/data/menu.ts', '/src/render/actors/rig.ts', ...Object.values(extra)];
    const mods = await Promise.all(paths.map((p) => vite.ssrLoadModule(p)));
    return Object.fromEntries(names.map((n, i) => [n, mods[i]]));
  } finally {
    await vite.close();
  }
}

/**
 * Loads `root`'s sim and returns `{ key, text, info }` saves for each
 * `{ id, weather, minute }` of `scenes`, plus `levelUp` when `withLevelUp`; `seed` is SEED by default.
 */
export async function sceneSaves(root, scenes, options = {}) {
  return sceneSavesOf(await loadSim(root), scenes, options);
}

/** sceneSaves on modules already loaded. */
export function sceneSavesOf(mods, scenes, { withLevelUp = false, seed = SEED } = {}) {
  const out = {};
  for (const sc of scenes) {
    const s = playToScene(mods, sc, seed);
    out[sc.id] = { ...saveText(mods.save, s), info: sceneInfo(s) };
  }
  if (withLevelUp) {
    const s = playToLevelUp(mods, seed);
    out.levelUp = { ...saveText(mods.save, s), info: `report of day ${s.day}, level ${s.lastReport.levelUp.level}` };
  }
  return out;
}
