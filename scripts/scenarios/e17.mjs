// E-17 shots (Phong cách quán): the shop at noon, sunny, at graphics Cao and
// 1280×800, once in each of three looks bought through the sim, one style per
// slot (wall, floor, sign, awning) from docs/reports/e17-shop-style.md. Run
// through `npm run media -- --scenario e17` (= scripts/capture.mjs e17);
// E17_SAVES_ONLY=1 (or --saves-only) plays the saves and stops. Files (JPEG,
// docs/media/e17): style-<look>-1280-e17.jpg for each key of LOOKS; see
// docs/media.md.
import { DESK } from '../lib/capture.mjs';
import { SEED, playToScene, saveText } from '../lib/saves.mjs';

const seed = Number(process.env.E17_SEED ?? SEED);
/** Money and Tem given to each save before buying: enough for the dearest look (1.3 tỷ đ, 340 Tem). */
const MONEY = 2_000_000_000;
const TICKETS = 400;
/**
 * The three looks, cheapest to dearest, by slot: style ids of
 * src/sim/data/styles.ts. Challenge-gated ones (sign_neon, wall_mural) are
 * unlocked through the sim first, as a weekly challenge reward would.
 */
export const LOOKS = {
  mint: { wall: 'wall_mint', floor: 'floor_tile', sign: 'sign_chalk', awning: 'awning_mint' },
  brick: { wall: 'wall_brick', floor: 'floor_terrazzo', sign: 'sign_neon', awning: 'awning_navy' },
  royal: { wall: 'wall_mural', floor: 'floor_marble', sign: 'sign_brass', awning: 'awning_royal' },
};
const LOOK_IDS = Object.keys(LOOKS);
export const shotFile = (look) => `style-${look}-1280-e17.jpg`;

/** Noon of day 2, sunny, wearing `look`; throws when the sim refuses a style. */
function lookState(mods, look) {
  const s = playToScene(mods, { weather: 'sunny', minute: 12 * 60 }, seed);
  if (!s.retention) throw new Error(`e17 ${look}: the noon save has no retention state to hold Tem`);
  s.money = MONEY;
  s.retention.tickets = TICKETS;
  for (const id of Object.values(LOOKS[look])) {
    mods.sim.unlockStyle(s, id);
    if (!mods.sim.dispatch(s, { type: 'buy_style', styleId: id })) {
      throw new Error(`e17 ${look}: buy_style ${id} refused (${mods.sim.styleBlockedReason(s, id) ?? 'no reason'})`);
    }
  }
  return s;
}

const lookShot = (look) => ({
  kind: 'shot',
  id: `style-${look}`,
  tags: [look],
  build: 'cur',
  shot: 'scene',
  save: look,
  viewport: DESK,
  quality: 'high',
  opts: { file: shotFile(look) },
  log: (r) => `style ${look}: ${Object.values(LOOKS[look]).join(', ')}, HUD ${r.clock}`,
  check: (r) => (r.file ? [] : `style ${look}: no shot written`),
});

export default {
  id: 'e17',
  out: 'docs/media/e17',
  base: null,
  tags: LOOK_IDS,
  savesOnlyEnv: 'E17_SAVES_ONLY',
  saves(mods) {
    const saves = {};
    const worn = [];
    for (const look of LOOK_IDS) {
      const s = lookState(mods, look);
      worn.push(`${look}: ${Object.entries(s.styles?.chosen ?? {}).map(([slot, id]) => `${slot} ${id}`).join(', ')}`);
      s.events = [];
      saves[look] = saveText(mods.save, s);
    }
    return { saves, info: worn.join('; ') };
  },
  steps: LOOK_IDS.map(lookShot),
};
