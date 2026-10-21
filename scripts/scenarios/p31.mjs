// P31 boards (cold brew tower and oven, the items they open): the base commit
// next to the working tree, at 390×844 and 1280×800, ringed in red. Run
// through `npm run media -- --scenario p31` (= scripts/capture.mjs p31);
// P31_SAVES_ONLY=1 plays the saves and stops; --only compat,upgrades,menu,counter
// narrows the run. Files (JPEG, docs/reports/p31-equipment):
//   upgrades-lv8-before-after-p31.jpg   the end of Dụng cụ in Nâng cấp at shop level 8: the tower and oven rows, then at tier 2 ('Bậc 2/2')
//   menu-cold-brew-before-after-p31.jpg the Cold brew and cookie rows of Menu: 'Cần <công cụ>', then on after buying
//   back-counter-before-after-p31.jpg   the back counter at 1280, pendant lamps dropped: tower and oven at tier 1 and 2, then each close up
//                                       (the tools have 2 levels and no shop-level bonus, so no tier 3)
// The saves are described in docs/media.md.
import { DESK, PHONE } from '../lib/capture.mjs';
import { cropAround, grow } from '../lib/board.mjs';
import { SEED, playToScene, saveText } from '../lib/saves.mjs';

const BASE = process.env.P31_BASE ?? 'fe1fe8e';
const SHOT_DPR = 2;
/** Shop level of the saves: the tower opens at 7, the oven at 8 (src/sim/data/levels.ts). */
const LEVEL = 8;
/** Money of the level-8 saves: both tools to tier 2 cost under 10 000 000 đ. */
const MONEY = 50_000_000;
const TOOLS = ['cold_brew_tower', 'oven'];
const ITEMS = { cold_brew: 'Cold brew', cookie: 'Bánh quy sô-cô-la' };
/** Back-counter x of each tool (EQUIPMENT_SPOTS in src/sim/upgrades.ts), z of the machines, and the camera point between them. */
const SPOTS = { cold_brew_tower: -0.32, oven: -2.97 };
const MACHINE_Z = -3.3;
const FOCUS = { x: (SPOTS.cold_brew_tower + SPOTS.oven) / 2, y: 1.35, z: MACHINE_Z };
/** Camera zoom round the back counter at 1280, CSS px per metre: both tools, then one tool close up. */
const PPM = 240;
const CLOSE_PPM = 600;
/** Close-up point of each tool: its spot, half way up the tower, the oven's top. */
const CLOSE = { oven: { focus: { x: SPOTS.oven, y: 1.15, z: MACHINE_Z }, ppm: CLOSE_PPM }, cold_brew_tower: { focus: { x: SPOTS.cold_brew_tower, y: 1.35, z: MACHINE_Z }, ppm: CLOSE_PPM } };
/**
 * What tier 2 adds to each tool (src/render/scene/equipment.ts), metres in
 * the machine's own frame: the steel plinth under both, the cold brew glass
 * by the tower, the cookie tray on the oven.
 */
const TIER2_PARTS = {
  cold_brew_tower: [
    { min: { x: -0.13, y: 0.9, z: -0.19 }, max: { x: 0.13, y: 0.94, z: 0.19 } },
    { min: { x: 0.035, y: 0.94, z: 0.085 }, max: { x: 0.105, y: 1.03, z: 0.155 } },
  ],
  oven: [
    { min: { x: -0.24, y: 0.9, z: -0.24 }, max: { x: 0.24, y: 0.94, z: 0.24 } },
    { min: { x: -0.17, y: 1.31, z: -0.12 }, max: { x: 0.17, y: 1.34, z: 0.12 } },
  ],
};
/**
 * World box of the three pendant lamps over the front counter (shades,
 * bulbs and cords at z -2 from 2.11 m up, src/render/scene/facade.ts): they
 * stand between the camera and the back counter, so the counter shots drop
 * them (clearBox) before shooting.
 */
const PENDANTS = { min: { x: -2, y: 1.95, z: -2.45 }, max: { x: 2, y: 3.5, z: -1.55 } };
const VIEWS = [PHONE, DESK];
const seed = Number(process.env.P31_SEED ?? SEED);

// --- Saves: the same edits on each build's own noon state (day 2, sunny, 12:00). ---

const noonOf = (mods) => playToScene(mods, { weather: 'sunny', minute: 12 * 60 }, seed);

/** Buys one level of each tool; throws when the sim refuses. */
function buyTools(mods, s) {
  for (const id of TOOLS) {
    if (!mods.sim.dispatch(s, { type: 'buy_upgrade', upgradeId: id })) throw new Error(`buy_upgrade ${id} refused at level ${s.upgrades[id] ?? 0}`);
  }
}

/** The saves of one build; `p31` buys the tools (the base has none, so its tool saves are the level-8 save). */
export function buildSaves(mods, save, p31) {
  const out = {};
  const put = (id, s) => {
    s.events = [];
    out[id] = saveText(save, s);
  };
  put('noon', noonOf(mods));
  const lv8 = () => {
    const s = noonOf(mods);
    s.shopLevel = LEVEL;
    s.money = MONEY;
    return s;
  };
  put('lv8', lv8());
  const t1 = lv8();
  if (p31) buyTools(mods, t1);
  const on = Object.keys(ITEMS).filter((id) => t1.menu.find((m) => m.id === id)?.enabled);
  put('tier1', t1);
  const t2 = lv8();
  if (p31) {
    buyTools(mods, t2);
    buyTools(mods, t2);
  }
  put('tier2', t2);
  const lv = (s) => TOOLS.map((id) => `${id} ${s.upgrades[id] ?? 0}`).join(', ');
  return { saves: out, info: `level ${LEVEL}, tier1: ${lv(t1)} (on the menu: ${on.join(', ') || 'none'}), tier2: ${lv(t2)}` };
}

// --- Steps. ---

const w = (v) => v.width;
const viewName = (v) => `${v.width}×${v.height}`;
const cropOf = (v, boxes, min) => (v === PHONE ? { x: 0, y: 0, w: PHONE.width, h: PHONE.height } : cropAround(boxes, { pad: 40, min, view: v }));

/**
 * (a) Nâng cấp at level 8, the end of Dụng cụ (the dishwasher row at the top
 * of the view in both builds); `save` lv8 before buying, tier2 after (the
 * tier icon and "Bậc 2/2").
 */
const upgradesShot = (build, v, save = 'lv8') => ({
  kind: 'shot',
  id: `upgrades-${build}-${save === 'lv8' ? '' : `${save}-`}${w(v)}`,
  tags: ['upgrades'],
  build,
  shot: 'panel',
  save,
  viewport: v,
  dpr: SHOT_DPR,
  opts: {
    panel: 'upgrades',
    scroll: { top: '[data-upgrade="dishwasher"]' },
    box: { union: TOOLS.map((id) => `[data-upgrade="${id}"]`) },
    read: { rows: { each: TOOLS.map((id) => `[data-upgrade="${id}"]`).join(', '), fields: { id: 'data:upgrade', name: 'text:.item-title', meta: 'text:.item-meta', buy: 'text:[data-action="buy"]' } } },
  },
  ...(build === 'cur'
    ? {
        log: (r) => (r.rows.length ? `upgrades ${w(v)}: ${r.rows.map((x) => `${x.name} "${x.meta}" [${x.buy}]`).join('; ')}` : []),
        check: (r) => (!r.box || r.rows.length !== TOOLS.length ? `upgrades ${w(v)}: ${r.rows.length} of ${TOOLS.length} tool rows in Nâng cấp at level ${LEVEL}` : []),
      }
    : { check: (r) => (r.rows.length ? `upgrades ${w(v)}: ${BASE} lists ${r.rows.length} P31 tool rows` : []) }),
});

const upgradesBoard = {
  kind: 'board',
  tags: ['upgrades'],
  file: 'upgrades-lv8-before-after-p31.jpg',
  width: 1800,
  rows: ({ results }) =>
    VIEWS.filter((v) => results[`upgrades-cur-${w(v)}`]?.box).map((v) => {
      const a = results[`upgrades-cur-${w(v)}`];
      const t = results[`upgrades-cur-tier2-${w(v)}`];
      const b = results[`upgrades-base-${w(v)}`];
      return {
        crop: cropOf(v, [a.box], { w: 620, h: 520 }),
        dpr: SHOT_DPR,
        panels: [
          { png: b.png, boxes: [grow(a.box, 2)], title: `Trước · ${BASE} · Nâng cấp, cấp ${LEVEL}, ${viewName(v)}`, caption: 'Dụng cụ dừng ở Máy rửa ly; không có công cụ mở ở cấp 7–8' },
          { png: a.png, boxes: [grow(a.box, 2)], title: `Sau · {head} · chưa mua, ${viewName(v)}`, caption: `Thêm 2 hàng: ${a.rows.map((x) => `${x.name} (${x.buy || x.meta})`).join(', ')}` },
          { png: t.png, boxes: t.box ? [grow(t.box, 2)] : [], title: `Sau · {head} · đã mua bậc 2, ${viewName(v)}`, caption: `Icon bậc 2, ${t.rows.map((x) => x.meta.match(/Bậc \d+\/\d+/)?.[0] ?? 'không có Bậc').join(', ')}` },
        ],
      };
    }),
  notes: [`Save trưa ngày 2 do sim mỗi bản chơi ra (cùng seed), đặt cấp quán ${LEVEL} và ${MONEY.toLocaleString('vi-VN')} đ, chưa mua công cụ nào; ảnh thứ ba mua Tháp cold brew và Lò nướng 2 cấp (bậc 2, cấp cao nhất). Bảng Nâng cấp cuộn tới hàng Máy rửa ly ở cả hai bản.`],
};

/** (b) Menu at level 8: the last rows (cake at the top of the view); `save` lv8 before buying, tier1 after. */
const menuShot = (build, v, save) => ({
  kind: 'shot',
  id: `menu-${build}-${save}-${w(v)}`,
  tags: ['menu'],
  build,
  shot: 'panel',
  save,
  viewport: v,
  dpr: SHOT_DPR,
  opts: {
    panel: 'menu',
    scroll: { top: 'li[data-item="cake"]' },
    box: { union: Object.keys(ITEMS).map((id) => `li[data-item="${id}"]`) },
    read: {
      rows: { each: Object.keys(ITEMS).map((id) => `li[data-item="${id}"]`).join(', '), fields: { id: 'data:item', badge: 'text:[data-lock="tool"]' } },
      switches: { each: Object.keys(ITEMS).map((id) => `li[data-item="${id}"] [role="switch"]`).join(', '), fields: { on: 'attr:aria-checked', off: 'attr:aria-disabled' } },
    },
  },
});
/** Row id, its tool label and whether its switch is on, from a menu shot. */
const menuRows = (r) => r.rows.map((x, i) => ({ ...x, on: r.switches[i]?.on === 'true', locked: r.switches[i]?.off === 'true' }));
const menuSteps = VIEWS.flatMap((v) => [
  {
    ...menuShot('cur', v, 'lv8'),
    log: (r) => `menu ${w(v)} before buying: ${menuRows(r).map((x) => `${x.id} "${x.badge}" ${x.on ? 'on' : 'off'}${x.locked ? ' locked' : ''}`).join('; ')}`,
    check: (r) => {
      const rows = menuRows(r);
      const cb = rows.find((x) => x.id === 'cold_brew');
      return !cb || cb.badge !== 'Cần Tháp cold brew' || cb.on || !cb.locked ? `menu ${w(v)}: the Cold brew row reads "${cb?.badge ?? 'no row'}" (${cb?.on ? 'on' : 'off'}) before the tower is bought` : [];
    },
  },
  {
    ...menuShot('cur', v, 'tier1'),
    log: (r) => `menu ${w(v)} after buying: ${menuRows(r).map((x) => `${x.id} "${x.badge}" ${x.on ? 'on' : 'off'}`).join('; ')}`,
    check: (r) => (menuRows(r).every((x) => x.on && !x.badge) && r.rows.length === 2 ? [] : `menu ${w(v)}: after buying the tools, ${menuRows(r).filter((x) => x.on).length}/2 rows on`),
  },
  menuShot('base', v, 'lv8'),
]);

const menuBoard = {
  kind: 'board',
  tags: ['menu'],
  file: 'menu-cold-brew-before-after-p31.jpg',
  width: 1800,
  rows: ({ results }) =>
    VIEWS.filter((v) => results[`menu-cur-lv8-${w(v)}`]?.box).map((v) => {
      const a = results[`menu-cur-lv8-${w(v)}`];
      const t = results[`menu-cur-tier1-${w(v)}`];
      const b = results[`menu-base-lv8-${w(v)}`];
      const ring = grow(a.box, 2);
      const labels = menuRows(a).map((x) => `"${x.badge}"`).join(', ');
      return {
        crop: cropOf(v, [a.box], { w: 560, h: 420 }),
        dpr: SHOT_DPR,
        panels: [
          { png: b.png, boxes: [ring], title: `Trước · ${BASE} · Menu, ${viewName(v)}`, caption: 'Menu dừng ở Bánh ngọt' },
          { png: a.png, boxes: [ring], title: `Sau · {head} · chưa mua, ${viewName(v)}`, caption: `2 món mới tắt, nhãn ${labels} mở Nâng cấp` },
          { png: t.png, boxes: t.box ? [grow(t.box, 2)] : [], title: `Sau · {head} · đã mua bậc 1, ${viewName(v)}`, caption: `${menuRows(t).filter((x) => x.on).length}/2 món tự bật, hết nhãn Cần <công cụ> (nhãn Thiếu là kho)` },
        ],
      };
    }),
  notes: [`Cùng save cấp quán ${LEVEL} như bảng Nâng cấp; ảnh thứ ba mua Tháp cold brew và Lò nướng bậc 1 bằng sim trước khi ghi save (buy_upgrade tự bật món). Bảng Menu cuộn tới hàng Bánh ngọt ở mọi ảnh.`],
};

/**
 * (c) The back counter at 1280, pendant lamps dropped: both tools, then each
 * close up, at tier 1 and tier 2; the base at the same camera points.
 */
const counterPair = (save) => ({
  kind: 'pair',
  id: `counter-${save}`,
  tags: ['counter'],
  shot: 'machines',
  save,
  viewport: DESK,
  dpr: SHOT_DPR,
  opts: { focus: FOCUS, ppm: PPM, spots: SPOTS, marks: TIER2_PARTS, clear: PENDANTS, close: CLOSE },
  need: (after) => TOOLS.every((id) => after?.boxes?.[id] && after.close[id]?.boxes[id]),
  log: ({ after, before }) =>
    `back counter ${save}: ${after.cleared} pendant triangles dropped; ${TOOLS.map((id) => `${id} ${after.boxes[id] ? `${Math.round(after.boxes[id].w)}×${Math.round(after.boxes[id].h)} px, close ${Math.round(after.close[id]?.boxes[id]?.w ?? 0)}×${Math.round(after.close[id]?.boxes[id]?.h ?? 0)} px` : 'missing'}`).join(', ')}; ${BASE}: ${TOOLS.filter((id) => before?.boxes?.[id]).length} of them`,
  check: ({ after, before }) => [
    ...(TOOLS.every((id) => after?.boxes?.[id] && after.close[id]?.boxes[id]) ? [] : [`back counter ${save}: ${TOOLS.filter((id) => !after?.boxes?.[id] || !after.close[id]?.boxes[id]).join(', ')} not on the working tree's back counter`]),
    ...(after?.cleared ? [] : [`back counter ${save}: no pendant lamp dropped before the shot`]),
    ...(before && TOOLS.some((id) => before.boxes[id]) ? [`back counter ${save}: ${BASE} has a machine at a P31 spot`] : []),
  ],
});
const counterSteps = ['tier1', 'tier2'].map(counterPair);

/** Rows of the counter board: both tools, then the oven and the tower close up. */
const COUNTER_ROWS = [
  { pick: (r) => r, tools: TOOLS, min: { w: 820, h: 420 }, name: `Lò nướng và Tháp cold brew, ${PPM} px/m` },
  { pick: (r) => r.close.oven, tools: ['oven'], min: { w: 540, h: 560 }, name: `Lò nướng cận cảnh, ${CLOSE_PPM} px/m` },
  { pick: (r) => r.close.cold_brew_tower, tools: ['cold_brew_tower'], min: { w: 540, h: 640 }, name: `Tháp cold brew cận cảnh, ${CLOSE_PPM} px/m` },
];

const counterBoard = {
  kind: 'board',
  tags: ['counter'],
  file: 'back-counter-before-after-p31.jpg',
  width: 1800,
  rows: ({ results }) => {
    const t1 = results['counter-tier1'];
    const t2 = results['counter-tier2'];
    if (!t1?.before || !t2?.before) return [];
    return COUNTER_ROWS.map(({ pick, tools, min, name }) => {
      const [b, a1, a2] = [pick(t1.before), pick(t1.after), pick(t2.after)];
      // Base and tier 1: the whole machine is new; tier 2: only the plinth and the glass or tray.
      const whole = tools.map((id) => grow(a1.boxes[id], 4));
      const parts = tools.flatMap((id) => (a2.marks[id] ?? []).map((m) => grow(m, 3)));
      return {
        crop: cropAround([...whole, ...tools.map((id) => grow(a2.boxes[id], 4))], { pad: 50, min, view: DESK }),
        dpr: SHOT_DPR,
        panels: [
          { png: b.png, boxes: whole, title: `Trước · ${BASE} · ${name}`, caption: 'Quầy sau không có tháp hay lò' },
          { png: a1.png, boxes: whole, title: `Sau · {head} · bậc 1 · ${name}`, caption: tools.length > 1 ? 'Lò nướng (trái) và Tháp cold brew (giữa) bậc 1' : 'Bậc 1: máy mới' },
          { png: a2.png, boxes: parts, title: `Sau · {head} · bậc 2 · ${name}`, caption: 'Bậc 2 thêm bục thép dưới máy, khay bánh quy trên lò, ly cold brew trước tháp' },
        ],
      };
    });
  },
  notes: [
    `Cùng save cấp quán ${LEVEL}, 1280×800, mức Cao; bản sau mua mỗi công cụ 1 rồi 2 cấp bằng sim (bậc 1, bậc 2), bản gốc không có công cụ nào. Camera hai bản phóng quanh cùng điểm. Ba đèn thả trên quầy trước bị ẩn khi chụp (chỉ trong ảnh) để không che quầy sau. Vòng đỏ: cả máy ở ảnh trước và bậc 1; bục thép và ly hay khay ở bậc 2. Công cụ mới có tối đa 2 cấp, không có cấp thưởng, nên không có bậc 3.`,
  ],
};

/**
 * (d) The base's untouched noon save (v3) in the working-tree build: the
 * clock runs and there are no more console errors or failed requests than
 * with the working tree's own noon save (the control), as `p30 --only compat`.
 */
const compatSteps = [
  { kind: 'shot', id: 'compat-own', tags: ['compat'], build: 'cur', shot: 'clock', save: 'noon', viewport: DESK, dpr: SHOT_DPR, errors: true, opts: {} },
  { kind: 'shot', id: 'compat-old', tags: ['compat'], build: 'cur', shot: 'clock', save: 'noon', from: 'base', viewport: DESK, dpr: SHOT_DPR, errors: true, opts: {} },
  // The base build on its own save: an error it shows too is not P31's.
  { kind: 'shot', id: 'compat-base', tags: ['compat'], build: 'base', shot: 'clock', save: 'noon', viewport: DESK, dpr: SHOT_DPR, errors: true, opts: {} },
  {
    kind: 'check',
    id: 'compat',
    tags: ['compat'],
    run: ({ results, scenario, warn, progress }) => {
      const own = results['compat-own'];
      const old = results['compat-old'];
      const base = results['compat-base'];
      const v = JSON.parse(scenario.baseSaves.noon.text).version;
      const extra = old.errors.filter((e) => !own.errors.includes(e));
      const line = `save v${v} of ${BASE} in the working tree: HUD ${old.a} → ${old.b}, ${old.errors.length} errors (own save: ${own.errors.length}), ${extra.length} only with the old save`;
      const all = [...new Set([...own.errors, ...old.errors])];
      if (all.length) progress(`errors seen: ${all.slice(0, 4).join(' | ')}`);
      progress(`${BASE} on its own save: ${base.errors.length} errors${base.errors.length ? `: ${base.errors.slice(0, 4).join(' | ')}` : ''}`);
      if (old.a !== old.b && extra.length === 0) progress(`PASS ${line}`);
      else warn(`${line}${extra.length ? `: ${extra.slice(0, 3).join(' | ')}` : ''}`);
    },
  },
];

export default {
  id: 'p31',
  out: 'docs/reports/p31-equipment',
  base: BASE,
  tags: ['compat', 'upgrades', 'menu', 'counter'],
  savesOnlyEnv: 'P31_SAVES_ONLY',
  /** Both builds play the same edits on their own sim; the base's saves are kept for the compat check. */
  async saves(mods, { isBase }) {
    const r = buildSaves(mods, mods.save, !isBase);
    this[isBase ? 'baseSaves' : 'curSaves'] = r.saves;
    return r;
  },
  steps: [
    ...compatSteps,
    ...VIEWS.flatMap((v) => [
      upgradesShot('cur', v),
      {
        ...upgradesShot('cur', v, 'tier2'),
        log: (r) => `upgrades ${w(v)} at tier 2: ${r.rows.map((x) => `${x.name} "${x.meta}"`).join('; ')}`,
        check: (r) => (r.rows.length === TOOLS.length && r.rows.every((x) => x.meta.includes('Bậc 2/2')) ? [] : `upgrades ${w(v)}: ${r.rows.filter((x) => x.meta.includes('Bậc 2/2')).length} of ${TOOLS.length} tool rows read "Bậc 2/2" at tier 2`),
      },
      upgradesShot('base', v),
    ]),
    upgradesBoard,
    ...menuSteps,
    menuBoard,
    ...counterSteps,
    counterBoard,
  ],
};
