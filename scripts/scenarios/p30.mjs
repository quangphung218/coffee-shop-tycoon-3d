// P30 boards (named regulars, team uniforms, customer emotes): the base
// commit on the left, the working tree on the right, ringed in red. Run
// through `npm run media:p30` (= scripts/capture.mjs p30); P30_SAVES_ONLY=1
// plays the saves and stops; --only compat,emotes,uniform,picker,regulars
// narrows the run. Files (JPEG, docs/reports/p30-characters):
//   emotes-before-after-p30.jpg             heart, sweat drop and cloud over a customer, 1280×800
//   uniform-latte-before-after-p30.jpg      the team in the 'latte' uniform (shop level 5), 1280×800
//   uniform-picker-390-before-after-p30.jpg the Đồng phục section of Nhân viên at 390×844
//   regulars-390-before-after-p30.jpg       the Khách quen card of Việc and a regular's toast, 390×844
// The saves and what each board waits for are described in docs/media.md.
import { DESK, PHONE } from '../lib/capture.mjs';
import { cropAround, cropRound, grow } from '../lib/board.mjs';
import { SEED, clockOf, loadSave, openNextMorning, playToReport, playToScene, saveText } from '../lib/saves.mjs';
import { GAME_MINUTES_PER_SECOND, MAX_FRAME_S } from '../lib/shots.mjs';

const BASE = process.env.P30_BASE ?? '9f662fd';
const SHOT_DPR = 2;
const WAIT_MS = 40_000;
/** Camera zoom round an emote and round the team, CSS px per metre. */
const EMOTE_PPM = 150;
const TEAM_PPM = 95;
/** Game speed of the saves that wait for an event (the top of SPEEDS in src/save/settings.ts). */
const FAST = 4;
/** Game minutes the Node check of the cloud save plays, at FAST in 60 fps frames. */
const CLOUD_CHECK_MINUTES = 30;
/** Patience left in the sweat save, a share of the most (impatient below 0.4). */
const SWEAT_PATIENCE = 0.3;
/** Customer states the sweat drop shows in (RESTLESS in src/render/actors/sync.ts). */
const RESTLESS = ['entering', 'queueing', 'ordering', 'waiting'];
/** Colours of src/render/actors/emotes.ts, src/render/actors/rig.ts and src/sim/data/uniforms.ts. */
const SCAN = { emoteColors: { heart: 0xe0475e, sweat: 0x5bc0de, cloud: 0x9aa3ab }, uniform: { shirt: 0xd9a877, hat: 0x6b3f24 } };
const EMOTES = {
  heart: { name: 'Tim', when: 'khi được phục vụ món', speed: FAST },
  sweat: { name: 'Giọt mồ hôi', when: 'khi còn dưới 40% kiên nhẫn', speed: 1 },
  cloud: { name: 'Đám mây', when: 'khi bỏ đi vì món hết hàng', speed: FAST },
};
const PANEL = { x: 0, y: 0, w: PHONE.width, h: PHONE.height };
const seed = Number(process.env.P30_SEED ?? SEED);

// --- Saves: the same edits on each build's own noon state (day 2, sunny, 12:00). ---

const noonOf = (mods) => playToScene(mods, { weather: 'sunny', minute: 12 * 60 }, seed);

/**
 * Loads the cloud save back as Tiếp tục does and plays it as the browser
 * would, at FAST in 60 fps frames, for CLOUD_CHECK_MINUTES. Returns the game
 * minute of the first walk-out over an empty stock (a cloud) and the clock at
 * the end; `at` is null when nobody walked out.
 */
export function cloudCheck(mods, save, saved) {
  const s = loadSave(save, saved);
  const dt = (1 / 60) * GAME_MINUTES_PER_SECOND * FAST;
  for (let f = 0; f < CLOUD_CHECK_MINUTES / dt; f++) {
    s.events = [];
    mods.sim.step(s, dt);
    const out = s.events.find((e) => e.type === 'angry' && (s.customers.find((c) => c.id === e.customerId)?.patience ?? 0) > 0);
    if (out) return { at: s.minute, end: s.minute };
  }
  return { at: null, end: s.minute };
}

/** The saves of one build; `p30` adds the uniform field. `warn` gets the `!!` of a cloud save nobody walks out of. */
export function buildSaves(mods, save, p30, warn = () => {}) {
  const out = {};
  const put = (id, s) => {
    s.events = [];
    out[id] = saveText(save, s);
  };
  put('noon', noonOf(mods));
  // Waits run at the top game speed; every open order is ready, so the server hands drinks out at once.
  const heart = noonOf(mods);
  heart.speed = FAST;
  for (const o of heart.orders) if (o.status !== 'delivered') o.status = 'ready';
  put('heart', heart);
  const sweat = noonOf(mods);
  let restless = 0;
  for (const c of sweat.customers) {
    if (!RESTLESS.includes(c.state)) continue;
    c.patience = Math.round(c.maxPatience * SWEAT_PATIENCE * 100) / 100;
    restless++;
  }
  put('sweat', sweat);
  // A customer in the queue whose drink can no longer be made: the barista takes the order and they storm out.
  const cloud = noonOf(mods);
  for (let guard = 0; guard < 240 && !cloud.customers.some((c) => c.state === 'queueing' && c.order); guard++) {
    mods.sim.step(cloud, 1);
    cloud.events = [];
  }
  const queued = cloud.customers.find((c) => c.state === 'queueing' && c.order);
  if (!queued) throw new Error('cloud save: nobody in the queue by the end of the afternoon');
  for (const need of mods.menu.getMenuItem(queued.order).ingredients) {
    const line = cloud.inventory.find((i) => i.id === need.id);
    if (line) line.qty = 0;
  }
  cloud.speed = FAST;
  put('cloud', cloud);
  const check = cloudCheck(mods, save, out.cloud);
  const cloudAt = check.at === null ? `no walk-out by ${clockOf(check.end)}` : `walk-out at ${clockOf(check.at)}`;
  if (check.at === null) warn(`cloud save: the sim plays it from ${clockOf(cloud.minute)} to ${clockOf(check.end)} with nobody walking out over the empty stock`);
  const team = noonOf(mods);
  team.shopLevel = Math.max(team.shopLevel, 5);
  if (p30) team.uniform = 'latte';
  put('team', team);
  // Day 3 just opened: the regulars of day 2 come back for their second visit.
  const toast = openNextMorning(mods, playToReport(mods, noonOf(mods), 2));
  if (!mods.sim.dispatch(toast, { type: 'start_day' })) throw new Error('day 3: start_day refused');
  toast.speed = FAST;
  put('toast', toast);
  const prep = openNextMorning(mods, playToReport(mods, noonOf(mods), 3));
  prep.shopLevel = Math.max(prep.shopLevel, 3);
  if (p30) prep.uniform = 'mint';
  put('prep', prep);
  const regulars = Object.entries(prep.regulars ?? {}).map(([id, v]) => `${id} ${v.visits}`);
  return { saves: out, info: `${restless} restless customers at noon, cloud ${queued.order} at ${clockOf(cloud.minute)} (sim: ${cloudAt}), day ${prep.day} ${prep.phase}, regulars: ${regulars.join(', ') || 'none'}` };
}

// --- Steps. ---

const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const title = (who, r, extra = '') => `${who} · HUD ${r?.clock || '?'}${extra}`;

/** One emote pair per kind, then the emotes board. */
const emoteSteps = Object.entries(EMOTES).map(([kind, e]) => ({
  kind: 'pair',
  id: `emote-${kind}`,
  tags: ['emotes'],
  shot: 'emote',
  save: kind,
  viewport: DESK,
  dpr: SHOT_DPR,
  speed: e.speed,
  errors: true,
  opts: { emote: kind, waitMs: WAIT_MS, ppm: EMOTE_PPM, scan: SCAN },
  need: (after) => Boolean(after?.box),
  log: ({ after }) => (after?.box ? `emote ${kind}: ${sec(after.at)} s after Tiếp tục, HUD ${after.clock}, box ${Math.round(after.box.w)}×${Math.round(after.box.h)} px, ${after.count} on screen${after.vanished ? `, ${after.vanished} earlier gone before the shot` : ''}` : []),
  check: ({ after, before }) => [
    ...(after?.box ? [] : [`emotes: no ${kind} on the working tree in ${WAIT_MS / 1000} s; HUD ${after?.clock}; ${after?.frames} (the clock moves at most ${MAX_FRAME_S * GAME_MINUTES_PER_SECOND * e.speed} game min a frame); ${after?.vanished ?? 0} seen but gone before the shot; toasts: ${after?.toasts?.join(' | ') || 'none'}; errors: ${after?.errors?.slice(0, 3).join(' | ') || 'none'}`]),
    ...(before?.count > 0 ? [`emotes: ${before.count} emote mesh(es) on ${BASE}`] : []),
  ],
}));

const emoteBoard = {
  kind: 'board',
  tags: ['emotes'],
  file: 'emotes-before-after-p30.jpg',
  width: 1500,
  rows: ({ results }) =>
    Object.entries(EMOTES)
      .filter(([kind]) => results[`emote-${kind}`]?.before)
      .map(([kind, e]) => {
        const { after, before } = results[`emote-${kind}`];
        const ringBox = grow(after.box, 4);
        return {
          crop: cropRound(after.box, 360, 300, DESK, 70),
          dpr: SHOT_DPR,
          panels: [
            { png: before.png, boxes: [ringBox], title: title(`Trước · ${BASE}`, before), caption: `Không có ${e.name.toLowerCase()}: ${before.count} khối biểu cảm trong cảnh` },
            { png: after.png, boxes: [ringBox], title: (c) => title(`Sau · ${c.head}`, after), caption: `${e.name} ${e.when}; ${after.count} khách đang có ${e.name.toLowerCase()} trên màn` },
          ],
        };
      }),
  notes: ({ results }) => [
    ...Object.entries(EMOTES)
      .filter(([kind]) => results[`emote-${kind}`]?.before)
      .map(([kind, e]) => `${e.name}: chụp ${sec(results[`emote-${kind}`].after.at)} s sau Tiếp tục ở cả hai bản, camera phóng quanh cùng một điểm (${EMOTE_PPM} px mỗi mét).`),
    `Save trưa ngày 2 do sim mỗi bản chơi ra, cùng seed, 1280×800, mức Cao. Giọt mồ hôi: khách đang chờ còn ${Math.round(SWEAT_PATIENCE * 100)}% kiên nhẫn; đám mây: nguyên liệu món của một khách đang xếp hàng về 0 nên khách bỏ đi lúc gọi món. Tim và mây chạy tốc độ x${FAST}.`,
  ],
};

const teamPair = {
  kind: 'pair',
  id: 'team',
  tags: ['uniform'],
  shot: 'team',
  save: 'team',
  viewport: DESK,
  dpr: SHOT_DPR,
  opts: { ppm: TEAM_PPM, scan: SCAN },
  log: ({ after, before }) => (after && before ? `uniform: ${after.team.length} in the team, ${after.team.filter((t) => t.shirt).length} latte shirts, ${after.team.filter((t) => t.hat).length} berets; ${BASE}: ${before.team.filter((t) => t.shirt).length} latte shirts` : []),
  check: ({ after, before }, { scenario }) => {
    if (!after) return 'uniform: nobody in the latte shirt on the working tree';
    if (!before) return `uniform: no team in the scene on ${BASE}`;
    const expected = 1 + JSON.parse(scenario.curSaves.team.text).state.staff.length;
    return after.team.length !== expected ? `uniform: ${after.team.length} in the latte shirt, the team is ${expected}` : [];
  },
};

const teamBoard = {
  kind: 'board',
  tags: ['uniform'],
  file: 'uniform-latte-before-after-p30.jpg',
  width: 1700,
  rows: ({ results }) => {
    const { after, before } = results.team;
    if (!after || !before) return [];
    const shirts = after.team.filter((t) => t.shirt).length;
    const hats = after.team.filter((t) => t.hat).length;
    return [
      {
        crop: cropAround([...before.team, ...after.team].map((t) => t.box)),
        dpr: SHOT_DPR,
        panels: [
          { png: before.png, boxes: before.team.map((t) => grow(t.box, 2)), title: title(`Trước · ${BASE}`, before, ' · cấp quán 5'), caption: `${before.team.length} người trong đội: áo kem, người chơi mũ lưỡi trai đỏ, nhân viên không mũ` },
          { png: after.png, boxes: after.team.map((t) => grow(t.box, 2)), title: (c) => title(`Sau · ${c.head}`, after, ' · đồng phục Áo latte, mũ nồi'), caption: `${shirts}/${after.team.length} người áo latte, ${hats} mũ nồi; tạp dề giữ màu theo vai` },
        ],
      },
    ];
  },
  notes: [`Cùng save trưa ngày 2 do sim mỗi bản chơi ra, đặt cấp quán 5 (bản sau chọn bộ latte, mở ở cấp 5), 1280×800, mức Cao; camera phóng quanh giữa đội (${TEAM_PPM} px mỗi mét). Khoanh từng người trong đội.`],
};

/** Nhân viên at 390 scrolled to its end: the Đồng phục section and its button states. */
const pickerShot = (build) => ({
  kind: 'shot',
  id: `picker-${build}`,
  tags: ['picker'],
  build,
  shot: 'panel',
  save: 'prep',
  viewport: PHONE,
  dpr: SHOT_DPR,
  opts: {
    panel: 'staff',
    scroll: ['end', { into: '.uniform-grid' }],
    box: { union: ['h3[id^="uniform-title"]', '.uniform-grid'] },
    read: { states: { each: '.uniform-opt', fields: { id: 'data:uniform', name: 'text:.uniform-name', worn: 'pressed', locked: 'disabled', h: 'height' } } },
  },
});
const pickerAfter = {
  ...pickerShot('cur'),
  log: (r) => (r.box && r.states.length ? `uniform picker: ${r.states.map((s) => `${s.id} ${s.worn ? 'worn' : s.locked ? 'locked' : 'open'} "${s.name}" ${s.h} px`).join('; ')}` : []),
  check: (r) => {
    if (!r.box || r.states.length === 0) return 'uniform picker: no Đồng phục section on the working tree';
    const worn = r.states.filter((s) => s.worn).length;
    const open = r.states.filter((s) => !s.worn && !s.locked).length;
    const locked = r.states.filter((s) => s.locked).length;
    return worn !== 1 || open === 0 || locked === 0 ? `uniform picker: states worn ${worn}, open ${open}, locked ${locked}` : [];
  },
};

const pickerBoard = {
  kind: 'board',
  tags: ['picker'],
  file: 'uniform-picker-390-before-after-p30.jpg',
  width: 1100,
  when: ({ results }) => results['picker-cur'].box && results['picker-cur'].states.length > 0,
  rows: ({ results }) => {
    const pa = results['picker-cur'];
    const pb = results['picker-base'];
    const names = (f) => pa.states.filter(f).map((s) => s.name).join(', ');
    return [
      {
        crop: PANEL,
        dpr: SHOT_DPR,
        panels: [
          { png: pb.png, boxes: [], title: `Trước · ${BASE} · Nhân viên, cuối bảng`, caption: 'Không có mục Đồng phục' },
          { png: pa.png, boxes: [pa.box], title: 'Sau · {head} · Nhân viên, cuối bảng', caption: `Đang mặc: ${names((s) => s.worn)} (viền đậm); mở: ${names((s) => !s.worn && !s.locked)}; khoá: ${names((s) => s.locked)}` },
        ],
      },
    ];
  },
  notes: ({ results }) => {
    const hs = results['picker-cur'].states.map((s) => s.h);
    return [`Sáng ngày 4 do sim mỗi bản chơi ra, đặt cấp quán 3 (bản sau mặc bộ bạc hà), 390×844. Nút cao ${Math.min(...hs)}–${Math.max(...hs)} px.`];
  },
};

/** Việc at 390: the Khách quen card (or, on the base, the achievements button it sits over) in view. */
const cardShot = (build) => ({
  kind: 'shot',
  id: `card-${build}`,
  tags: ['regulars'],
  build,
  shot: 'panel',
  save: 'prep',
  viewport: PHONE,
  dpr: SHOT_DPR,
  opts: {
    panel: 'tasks',
    // The card's title at the top of the view, so the ring holds the title and the first rows.
    scroll: { top: 'h3.section-title', text: /^Khách quen$/, fallback: ['ul[aria-label="Khách quen"]', '.ach-toggle'] },
    box: { section: { list: 'ul[aria-label="Khách quen"]', heading: 'Khách quen' } },
    read: { rows: { each: 'li[data-regular]', fields: { text: 'texts:p|: ' } } },
  },
});
const cardAfter = {
  ...cardShot('cur'),
  log: (r) => (r.box && r.rows.length ? `regulars card: ${r.rows.map((x) => x.text).join(' | ')}` : []),
  check: (r) => (!r.box || r.rows.length === 0 ? 'regulars: no Khách quen card rows on the working tree' : []),
};

const toastPair = {
  kind: 'pair',
  id: 'toast',
  tags: ['regulars'],
  shot: 'toast',
  save: 'toast',
  viewport: PHONE,
  dpr: SHOT_DPR,
  speed: FAST,
  opts: { match: /Khách quen mới|ghé quán/, waitMs: WAIT_MS },
  log: ({ after, before }) => (after ? `regular toast: "${after.title}" ${sec(after.at)} s after Tiếp tục, HUD ${after.clock}; ${BASE} toasts: ${before.titles.join(' | ') || 'none'}` : []),
  check: ({ after }) => (after ? [] : `regulars: no regular's toast on the working tree in ${WAIT_MS / 1000} s`),
};

const regularsBoard = {
  kind: 'board',
  tags: ['regulars'],
  file: 'regulars-390-before-after-p30.jpg',
  width: 1100,
  rows: ({ results }) => {
    const rows = [];
    const ca = results['card-cur'];
    const cb = results['card-base'];
    if (ca.box && ca.rows.length > 0) {
      rows.push({
        crop: PANEL,
        dpr: SHOT_DPR,
        panels: [
          { png: cb.png, boxes: [], title: `Trước · ${BASE} · Việc`, caption: 'Không có thẻ Khách quen' },
          { png: ca.png, boxes: [ca.box], title: 'Sau · {head} · Việc', caption: `Thẻ Khách quen: ${ca.rows.length} người, mới ghé nhất trước` },
        ],
      });
    }
    const { after: ta, before: tb } = results.toast;
    if (ta) {
      rows.push({
        crop: PANEL,
        dpr: SHOT_DPR,
        panels: [
          { png: tb.png, boxes: [grow(ta.box, 2)], title: title(`Trước · ${BASE}`, tb), caption: tb.titles.length ? `Toast khác: ${tb.titles.join('; ')}` : 'Không có toast khách quen' },
          { png: ta.png, boxes: [grow(ta.box, 2)], title: (c) => title(`Sau · ${c.head}`, ta), caption: `Toast "${ta.title}"` },
        ],
      });
    }
    return rows;
  },
  notes: ({ results }) => [
    ...(results['card-cur'].box && results['card-cur'].rows.length > 0 ? [`Thẻ: sáng ngày 4 do sim mỗi bản chơi ra, 390×844. Dòng đầu: ${results['card-cur'].rows[0].text}.`] : []),
    ...(results.toast.after ? [`Toast: save lúc mở cửa ngày 3, tốc độ x${FAST}, chụp ${sec(results.toast.after.at)} s sau Tiếp tục ở cả hai bản, 390×844.`] : []),
  ],
};

/**
 * The base's untouched noon save (P29, v3) in the working-tree build: the
 * clock runs and there are no more console errors or failed requests than
 * with the working tree's own noon save (the control).
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
  id: 'p30',
  out: 'docs/reports/p30-characters',
  base: BASE,
  tags: ['compat', 'emotes', 'uniform', 'picker', 'regulars'],
  savesOnlyEnv: 'P30_SAVES_ONLY',
  /** Both builds play the same edits on their own sim; the working tree's and the base's saves are kept for the checks. */
  async saves(mods, { isBase, ctx }) {
    const r = buildSaves(mods, mods.save, !isBase, ctx.warn);
    this[isBase ? 'baseSaves' : 'curSaves'] = r.saves;
    return r;
  },
  steps: [...compatSteps, ...emoteSteps, emoteBoard, teamPair, teamBoard, pickerAfter, pickerShot('base'), pickerBoard, cardAfter, cardShot('base'), toastPair, regularsBoard],
};
