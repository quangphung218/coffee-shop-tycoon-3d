// P31 boards (cold brew tower and oven, the items they open): the base commit
// next to the working tree, at 390×844 and 1280×800, ringed in red. Run
// through `npm run media -- --scenario p31` (= scripts/capture.mjs p31);
// P31_SAVES_ONLY=1 plays the saves and stops; --only compat,upgrades,menu,counter
// narrows the run. Files (JPEG, docs/reports/p31-equipment):
//   upgrades-lv8-before-after-p31.jpg   the end of Dụng cụ in Nâng cấp at shop level 8: the tower and oven rows
//   menu-cold-brew-before-after-p31.jpg the Cold brew and cookie rows of Menu: 'Cần <công cụ>', then on after buying
//   back-counter-before-after-p31.jpg   the back counter close up: tower and oven at tier 1 and 2
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
/** Camera zoom round the back counter, CSS px per metre, per viewport width. */
const PPM = { [DESK.width]: 240, [PHONE.width]: 105 };
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

/** (a) Nâng cấp at level 8, the end of Dụng cụ (the dishwasher row at the top of the view in both builds). */
const upgradesShot = (build, v) => ({
  kind: 'shot',
  id: `upgrades-${build}-${w(v)}`,
  tags: ['upgrades'],
  build,
  shot: 'panel',
  save: 'lv8',
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
  width: 1500,
  rows: ({ results }) =>
    VIEWS.filter((v) => results[`upgrades-cur-${w(v)}`]?.box).map((v) => {
      const a = results[`upgrades-cur-${w(v)}`];
      const b = results[`upgrades-base-${w(v)}`];
      return {
        crop: cropOf(v, [a.box], { w: 620, h: 520 }),
        dpr: SHOT_DPR,
        panels: [
          { png: b.png, boxes: [grow(a.box, 2)], title: `Trước · ${BASE} · Nâng cấp, cấp ${LEVEL}, ${viewName(v)}`, caption: 'Dụng cụ dừng ở Máy rửa ly; không có công cụ mở ở cấp 7–8' },
          { png: a.png, boxes: [grow(a.box, 2)], title: `Sau · {head} · Nâng cấp, cấp ${LEVEL}, ${viewName(v)}`, caption: `Thêm 2 hàng: ${a.rows.map((x) => `${x.name} (${x.buy || x.meta})`).join(', ')}` },
        ],
      };
    }),
  notes: [`Save trưa ngày 2 do sim mỗi bản chơi ra (cùng seed), đặt cấp quán ${LEVEL} và ${MONEY.toLocaleString('vi-VN')} đ, chưa mua công cụ nào. Bảng Nâng cấp cuộn tới hàng Máy rửa ly ở cả hai bản.`],
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

/** (c) The back counter close up: tier 1 and tier 2 of both tools, the base's same camera point. */
const counterPair = (save, v) => ({
  kind: 'pair',
  id: `counter-${save}-${w(v)}`,
  tags: ['counter'],
  shot: 'machines',
  save,
  viewport: v,
  dpr: SHOT_DPR,
  opts: { focus: FOCUS, ppm: PPM[w(v)], spots: SPOTS },
  need: (after) => TOOLS.every((id) => after?.boxes?.[id]),
  log: ({ after, before }) => `back counter ${save} ${w(v)}: ${TOOLS.map((id) => `${id} ${after.boxes[id] ? `${Math.round(after.boxes[id].w)}×${Math.round(after.boxes[id].h)} px` : 'missing'}`).join(', ')}; ${BASE}: ${TOOLS.filter((id) => before?.boxes?.[id]).length} of them`,
  check: ({ after, before }) => [
    ...(TOOLS.every((id) => after?.boxes?.[id]) ? [] : [`back counter ${save} ${w(v)}: ${TOOLS.filter((id) => !after?.boxes?.[id]).join(', ')} not on the working tree's back counter`]),
    ...(before && TOOLS.some((id) => before.boxes[id]) ? [`back counter ${save} ${w(v)}: ${BASE} has a machine at a P31 spot`] : []),
  ],
});
const counterSteps = VIEWS.flatMap((v) => ['tier1', 'tier2'].map((save) => counterPair(save, v)));

const counterBoard = {
  kind: 'board',
  tags: ['counter'],
  file: 'back-counter-before-after-p31.jpg',
  width: 1800,
  rows: ({ results }) =>
    [DESK, PHONE]
      .filter((v) => results[`counter-tier1-${w(v)}`]?.before && results[`counter-tier2-${w(v)}`]?.before)
      .map((v) => {
        const t1 = results[`counter-tier1-${w(v)}`];
        const t2 = results[`counter-tier2-${w(v)}`];
        const rings = (r) => TOOLS.map((id) => grow(r.after.boxes[id], 4));
        return {
          crop: cropAround([...rings(t1), ...rings(t2)], { pad: 50, min: v === PHONE ? { w: 390, h: 340 } : { w: 820, h: 420 }, view: v }),
          dpr: SHOT_DPR,
          panels: [
            { png: t1.before.png, boxes: rings(t1), title: `Trước · ${BASE} · HUD ${t1.before.clock} · ${viewName(v)}`, caption: 'Quầy sau không có tháp hay lò' },
            { png: t1.after.png, boxes: rings(t1), title: `Sau · {head} · bậc 1 · ${viewName(v)}`, caption: 'Lò nướng (trái) và Tháp cold brew (giữa) bậc 1' },
            { png: t2.after.png, boxes: rings(t2), title: `Sau · {head} · bậc 2 · ${viewName(v)}`, caption: 'Bậc 2: bệ, khay bánh quy trên lò, ly cold brew dưới tháp' },
          ],
        };
      }),
  notes: [`Cùng save cấp quán ${LEVEL}; bản sau mua mỗi công cụ 1 rồi 2 cấp bằng sim (bậc 1, bậc 2), bản gốc không có công cụ nào. Camera hai bản phóng quanh cùng một điểm giữa hai chỗ đặt máy (${PPM[DESK.width]} px mỗi mét ở 1280, ${PPM[PHONE.width]} ở 390), mức Cao. Vòng đỏ ở ảnh trước là chỗ máy đứng ở bản sau.`],
};

/**
 * (d) The base's untouched noon save (v3) in the working-tree build: the
 * clock runs and there are no more console errors or failed requests than
 * with the working tree's own noon save (the control), as `p30 --only compat`.
 */
const compatSteps = [
  { kind: 'shot', id: 'compat-own', tags: ['compat'], build: 'cur', shot: 'clock', save: 'noon', viewport: DESK, dpr: SHOT_DPR, errors: true, opts: {} },
  { kind: 'shot', id: 'compat-old', tags: ['compat'], build: 'cur', shot: 'clock', save: 'noon', from: 'base', viewport: DESK, dpr: SHOT_DPR, errors: true, opts: {} },
  {
    kind: 'check',
    id: 'compat',
    tags: ['compat'],
    run: ({ results, scenario, warn, progress }) => {
      const own = results['compat-own'];
      const old = results['compat-old'];
      const v = JSON.parse(scenario.baseSaves.noon.text).version;
      const extra = old.errors.filter((e) => !own.errors.includes(e));
      const line = `save v${v} of ${BASE} in the working tree: HUD ${old.a} → ${old.b}, ${old.errors.length} errors (own save: ${own.errors.length}), ${extra.length} only with the old save`;
      const all = [...new Set([...own.errors, ...old.errors])];
      if (all.length) progress(`errors seen: ${all.slice(0, 4).join(' | ')}`);
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
    ...VIEWS.flatMap((v) => [upgradesShot('cur', v), upgradesShot('base', v)]),
    upgradesBoard,
    ...menuSteps,
    menuBoard,
    ...counterSteps,
    counterBoard,
  ],
};
