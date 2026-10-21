// P29 shots of the working tree: the shop at 07:00, 12:00 and 19:30, sunny
// and rainy, at graphics Cao and Thấp, at 390×844 and 1280×800, plus a board
// of the three hours, before/after boards of the coin popping up from a sale
// and of 19:30 sunny, and one shot of the Lên cấp card of the Daily Report,
// each ringed in red. Run through `npm run media:p29` (= scripts/capture.mjs
// p29); P29_ONLY=coin or dusk (or --only scenes,coin,dusk,levelup) narrows
// the run, P29_SAVES_ONLY=1 plays the saves and stops. Files (JPEG,
// docs/media/p29): scene-<hhmm>-<weather>-<quality>-<w>-p29.jpg,
// hours-sunny-high-1280-p29.jpg, coin-before-after-p29.jpg,
// dusk-sunny-high-before-after-p29.jpg, levelup-390-p29.jpg; see docs/media.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOARD_WIDTH, DESK, PHONE, ROOT } from '../lib/capture.mjs';
import { cropSpan } from '../lib/board.mjs';
import { lumaCells } from '../lib/probes.mjs';
import { SCENE_DAY, SEED, SHOT_MINUTES, SHOT_QUALITIES, SHOT_WEATHERS, hhmm, sceneSavesOf, shotName } from '../lib/saves.mjs';

/** Build the coin and dusk boards compare against: the merge-base of the P29 branch with origin/main. */
const BASE = process.env.P29_BASE ?? '774be34';
const seed = Number(process.env.P29_SEED ?? SEED);
const DUSK_MINUTE = 19 * 60 + 30;
const NOON = `${hhmm(12 * 60)}-sunny`;
const DUSK = `${hhmm(DUSK_MINUTE)}-sunny`;
const SHOTS = SHOT_MINUTES.flatMap((minute) => SHOT_WEATHERS.map((weather) => ({ id: `${hhmm(minute)}-${weather}`, weather, minute })));
const VIEWPORTS = [PHONE, DESK];
const COIN_WAIT_MS = 30_000;
/** Age of the base coin, s: coin and chip at full opacity, risen clear of the head. */
const BASE_COIN_AGE = 0.25;
/** Ages of the working-tree coin, s (src/render/actors/fx.ts): near the top with the "+X đ" chip, mid-spin, the burst. */
const COIN_AGES = [0.25, 0.6, 0.85];
const COIN_FPS = 60;
const COIN_PX_PER_M = 130;
const COIN_DPR = 2;
const COIN_BOARD = 'coin-before-after-p29.jpg';
const HOURS_BOARD = 'hours-sunny-high-1280-p29.jpg';
const DUSK_BOARD = 'dusk-sunny-high-before-after-p29.jpg';
/** Cells the dusk board compares brightness in, CSS px, between the HUD and the dock. */
const LUMA_CELL = { w: 240, h: 160 };
const LUMA_TOP = 90;
const LUMA_BOTTOM = DESK.height - 110;
const FULL = { x: 0, y: 0, w: DESK.width, h: DESK.height };

/** Decimal comma: f2 two digits (1,42), comma n digits. */
const f2 = (n) => n.toFixed(2).replace('.', ',');
const comma = (n, digits = 2) => n.toFixed(digits).replace('.', ',');
const sunSide = (l) => (l.west ? 'tây' : 'đông');
const pct = (n) => `${Math.round(n)}%`;
const deg = (l) => `${Math.round(l.elevation)}°`;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// --- Scene shots and the hours board. ---

const sceneSteps = VIEWPORTS.flatMap((viewport) =>
  SHOTS.flatMap((sh) =>
    SHOT_QUALITIES.map((quality) => {
      const name = shotName({ ...sh, quality, width: viewport.width });
      return {
        kind: 'shot',
        id: `scene-${sh.id}-${quality}-${viewport.width}`,
        shot: 'scene',
        save: sh.id,
        viewport,
        quality,
        tags: ['scenes'],
        // A fresh browser per width: after a dozen WebGL pages one browser left the loading screen up (P27).
        relaunch: sh === SHOTS[0] && quality === SHOT_QUALITIES[0],
        opts: { file: name },
        log: ({ clock, light: l }) => `${name}: HUD clock ${clock}, total light ${f2(l.total)} (hemi ${f2(l.hemi)}, sun ${f2(l.sun)} from the ${l.west ? 'west' : 'east'} at ${Math.round(l.elevation)}°)`,
      };
    }),
  ),
);

const hoursBoard = {
  kind: 'board',
  file: HOURS_BOARD,
  width: BOARD_WIDTH,
  fit: true,
  tags: ['scenes'],
  rows: ({ results }) => [
    {
      crop: FULL,
      clampRings: false,
      panels: SHOT_MINUTES.map((minute) => {
        const h = results[`scene-${hhmm(minute)}-sunny-high-${DESK.width}`];
        const l = h.light;
        return {
          jpeg: readFileSync(join(ROOT, h.file)),
          title: `${hhmm(minute).slice(0, 2)}:${hhmm(minute).slice(2)} · nắng · Cao`,
          caption: `HUD ${h.clock || '?'}; nắng ${f2(l.sun)} từ phía ${sunSide(l)}, cao ${Math.round(l.elevation)}°; trời ${f2(l.hemi)}; tổng sáng ${f2(l.total)}`,
        };
      }),
    },
  ],
  notes: [`Cùng save ngày ${SCENE_DAY}, trời nắng, 1280×800, mức Cao, bản {head}. Tổng sáng = trời + env × 6 + nắng, ngân sách 3,4.`],
};

// --- Coin board: one coin of the base at BASE_COIN_AGE, one of the working tree at each of COIN_AGES. ---

const coinShot = (build, ages, who) => ({
  kind: 'shot',
  id: `coin-${build}`,
  build,
  shot: 'coin',
  save: NOON,
  viewport: DESK,
  dpr: COIN_DPR,
  quality: 'high',
  tags: ['coin'],
  relaunch: build === 'base',
  opts: { ages, waitMs: COIN_WAIT_MS, fps: COIN_FPS, ppm: COIN_PX_PER_M },
  log: (r) => (r ? r.frames.map((f) => `${COIN_BOARD}: ${comma(f.age)} s, lift ${comma(f.lift)} m, width ${comma(f.width)}, ${f.debris} small coins`) : []),
  check: (r) => (r ? [] : `${COIN_BOARD}: no coin popped up on ${who} in ${COIN_WAIT_MS / 1000} s`),
});

const coinBoard = {
  kind: 'board',
  file: COIN_BOARD,
  width: BOARD_WIDTH,
  fit: true,
  tags: ['coin'],
  when: ({ results }) => results['coin-base'] && results['coin-cur'],
  rows: ({ results, head, warn }) => {
    const [b] = results['coin-base'].frames;
    const [arc, spin, burst] = results['coin-cur'].frames;
    if (burst.debris === 0) warn(`${COIN_BOARD}: no small coins at ${comma(burst.age)} s`);
    const panels = [
      { ...b, title: `Trước · ${BASE} · ${comma(b.age)} s`, caption: `Xu và chip "+X đ" trôi thẳng lên ${comma(b.lift)} m rồi mờ dần, không xoay, không vỡ` },
      { ...arc, title: `Sau · ${head} · ${comma(arc.age)} s`, caption: `Xu nảy theo cung, đã cao ${comma(arc.lift)} m; chip "+X đ" bay riêng phía trên` },
      { ...spin, title: `Sau · ${head} · ${comma(spin.age)} s`, caption: `Xu xoay quanh trục đứng (bề ngang còn ${Math.round(spin.width * 100)}%) và nghiêng, chip mờ dần` },
      { ...burst, title: `Sau · ${head} · ${comma(burst.age)} s`, caption: `Xu vỡ thành ${burst.debris} xu nhỏ toả ra quanh chỗ nổ` },
    ];
    // One crop for every panel (both builds centre the coin's start the same way): the rings grown, at least the head and table, in the window.
    return [{ crop: cropSpan(panels.map((p) => p.box)), dpr: COIN_DPR, clampRings: false, panels: panels.map((p) => ({ title: p.title, caption: p.caption, boxes: [p.box], png: p.png })) }];
  },
  notes: ({ results }) => [
    `Mỗi bản một đồng xu, bán lúc HUD ${results['coin-base'].clock || '?'} (trước) và ${results['coin-cur'].clock || '?'} (sau), 1280×800, mức Cao. ` +
      `Đồng hồ trang dừng ở khung xu hiện rồi chạy từng 1/${COIN_FPS} s tới đúng tuổi xu ghi trên khung; ` +
      `camera phóng quanh xu (${COIN_PX_PER_M} px mỗi mét) chỉ khi chụp.`,
  ],
};

// --- Dusk board: 19:30 sunny on Cao, base then working tree, rings 1 light pools, 2 the cell that darkened most, 3 a street prop and its shadow. ---

const duskShot = (build, who) => ({
  kind: 'shot',
  id: `dusk-${build}`,
  build,
  shot: 'dusk',
  save: DUSK,
  viewport: DESK,
  quality: 'high',
  tags: ['dusk'],
  opts: {},
  check: (r) => [...(build === 'cur' && !r.pools ? [`${DUSK_BOARD}: no light pool showing on the working tree`] : []), ...(r.shadow ? [] : [`${DUSK_BOARD}: no street prop with its shadow in view on ${who}`])],
});

/** Brightness of both frames, and the cell that darkened most away from the other rings. */
const duskLuma = {
  kind: 'check',
  id: 'dusk-luma',
  tags: ['dusk'],
  run: async (ctx) => {
    const before = ctx.results['dusk-base'];
    const after = ctx.results['dusk-cur'];
    const [lb, la] = await ctx.evaluate(lumaCells, { imgs: [before.png, after.png].map((b) => b.toString('base64')), cell: LUMA_CELL, top: LUMA_TOP, bottom: LUMA_BOTTOM });
    const taken = [before.pools, after.pools, before.shadow?.box, after.shadow?.box].filter(Boolean);
    let dark = null;
    lb.cells.forEach((c, i) => {
      const drop = c.luma - la.cells[i].luma;
      if (taken.some((t) => overlaps(c, t)) || (dark && drop <= dark.drop)) return;
      dark = { ...c, drop, before: c.luma, after: la.cells[i].luma };
    });
    return { lb, la, dark };
  },
};

const duskNotes = ({ results }) => {
  const before = results['dusk-base'];
  const after = results['dusk-cur'];
  const { lb, la, dark } = results['dusk-luma'];
  const shadowLen = (r) => (r.shadow ? `${comma(r.shadow.length, 1)} m` : '?');
  const caster = after.shadow ?? before.shadow;
  return [
    `1 · Vũng sáng ấm trên sàn dưới đèn quán: ${before.light.pools} → ${after.light.pools} vũng, đèn quán sáng ${before.light.points} → ${after.light.points} PointLight.`,
    `2 · Cảnh tối hơn lúc chạng vạng: tổng sáng ${f2(before.light.total)} → ${f2(after.light.total)} (trời ${f2(before.light.hemi)} → ${f2(after.light.hemi)}, nắng ${f2(before.light.sun)} → ${f2(after.light.sun)}); ` +
      (dark ? `vùng khoanh sáng ${pct(dark.before)} → ${pct(dark.after)} màu trắng, ` : '') +
      `cả khung ${pct(lb.mean)} → ${pct(la.mean)}.`,
    `3 · Bóng dài hơn và đổi hướng theo nắng: trước, mặt trời đứng yên phía ${sunSide(before.light)}, cao ${deg(before.light)}; sau, mặt trời đi theo giờ, lúc này ở phía ${sunSide(after.light)}, cao ${deg(after.light)}. ` +
      `Bóng của ${caster ? `vật cao ${comma(caster.height, 1)} m bên đường` : 'vật bên đường'} dài ${shadowLen(before)} → ${shadowLen(after)}.`,
    `Cùng save ngày ${SCENE_DAY} của sim mỗi bản, 1280×800, mức Cao.`,
  ];
};

const duskBoard = {
  kind: 'board',
  file: DUSK_BOARD,
  width: BOARD_WIDTH,
  fit: true,
  tags: ['dusk'],
  rows: (ctx) => {
    const before = ctx.results['dusk-base'];
    const after = ctx.results['dusk-cur'];
    const { dark } = ctx.results['dusk-luma'];
    ctx.progress(`${DUSK_BOARD}: ${duskNotes(ctx).slice(0, 3).join(' ')}`);
    const boxesOf = (r) => [...(r.pools ? [{ ...r.pools, label: '1' }] : []), ...(dark ? [{ ...dark, label: '2' }] : []), ...(r.shadow ? [{ ...r.shadow.box, label: '3' }] : [])];
    const caption = (r) => `Tổng sáng ${f2(r.light.total)}; ${r.light.points} đèn quán sáng, ${r.light.pools} vũng sáng; nắng từ phía ${sunSide(r.light)}, cao ${deg(r.light)}`;
    return [
      {
        crop: FULL,
        clampRings: false,
        panels: [
          { png: before.png, boxes: boxesOf(before), title: `Trước · ${BASE} · HUD ${before.clock || '?'} · nắng, Cao`, caption: caption(before) },
          { png: after.png, boxes: boxesOf(after), title: `Sau · ${ctx.head} · HUD ${after.clock || '?'} · nắng, Cao`, caption: caption(after) },
        ],
      },
    ];
  },
  notes: duskNotes,
};

const levelUp = {
  kind: 'shot',
  id: 'levelup',
  shot: 'levelup',
  save: 'levelUp',
  viewport: PHONE,
  quality: 'high',
  tags: ['levelup'],
  opts: { file: 'levelup-390-p29.jpg' },
  log: (r) => (r.card ? `levelup-390-p29.jpg: ${r.text}` : []),
  check: (r) => (r.card ? [] : 'levelup-390-p29.jpg: no Lên cấp card on the report'),
};

export default {
  id: 'p29',
  out: 'docs/media/p29',
  base: BASE,
  tags: ['scenes', 'coin', 'dusk', 'levelup'],
  onlyEnv: 'P29_ONLY',
  savesOnlyEnv: 'P29_SAVES_ONLY',
  /** The working tree plays every scene it shoots (and the level-up day); the base only the scenes of the boards it is in. */
  saves(mods, { isBase, only }) {
    const wants = (tag) => !only || only.includes(tag);
    const scenes = SHOTS.filter((s) => (!isBase && wants('scenes')) || (wants('coin') && s.id === NOON) || (wants('dusk') && s.id === DUSK));
    const out = sceneSavesOf(mods, scenes, { withLevelUp: !isBase && wants('levelup'), seed });
    return { saves: out, info: Object.entries(out).map(([id, s]) => `${id}: ${s.info}`).join('; ') };
  },
  steps: [...sceneSteps, hoursBoard, coinShot('base', [BASE_COIN_AGE], BASE), coinShot('cur', COIN_AGES, 'working tree'), coinBoard, duskShot('base', BASE), duskShot('cur', 'working tree'), duskLuma, duskBoard, levelUp],
};
