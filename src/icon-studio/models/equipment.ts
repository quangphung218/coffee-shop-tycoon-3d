/**
 * Equipment the shop levels unlock (grinder, pastry case, blender, ice maker,
 * dishwasher), the frappe drink, and the two progression glyphs (shop level,
 * daily mission). Machines stand on y = 0 and face +Z; the glyphs are shot
 * straight on (`glyph` pose).
 */
import { CylinderGeometry, type Group, SphereGeometry, TorusGeometry } from 'three';
import { type PaletteKey, part, posed } from '../style';
import { at, box, disc, extrude, facing, group, handle, iceCube, lathe, polygon, star, stroke, type Tier, tierStar, trim } from './shapes';

// Tier looks follow the scene's machines (src/render/scene/equipment.ts):
// tier 2 adds its working detail with steel trim, tier 3 turns the trim gold
// and adds a star on the front.

/** i-grinder: burr grinder with a bean hopper on top and a catch cup at the spout. Tier 2 has a bigger hopper with a steel rim; tier 3 a gold rim and a star. */
export function grinder(tier: Tier = 1): Group {
  const body = at(part(box(1.0, 0.9, 0.85, 0.12), 'sky'), 0, 0.6);
  const neck = at(part(new CylinderGeometry(0.34, 0.42, 0.3, 16), 'sky'), 0, 1.12);
  const big = tier >= 2;
  const hopper = at(part(lathe(big ? [[0, 0], [0.5, 0], [0.76, 0.5], [0, 0.5]] : [[0, 0], [0.52, 0], [0.58, 0.5], [0, 0.5]], 16), 'skyLight'), 0, 1.25);
  const beans = (big ? ([[-0.24, 1.78, 0.14], [0.22, 1.8, -0.12], [0.04, 1.83, 0.3]] as const) : ([[-0.14, 1.55, 0.1], [0.14, 1.6, -0.08]] as const)).map(([x, y, z]) =>
    at(part(new SphereGeometry(0.14, 10, 8).scale(1, 0.72, 1.3), 'coffee'), x, y, z),
  );
  const spout = at(part(new CylinderGeometry(0.1, 0.15, 0.26, 10), 'coffeeDark'), 0, 0.2, 0.42);
  const cup = at(part(lathe([[0, 0], [0.24, 0], [0.28, 0.3], [0, 0.3]]), 'cream'), 0, 0.02, 0.42);
  const knob = at(part(new SphereGeometry(0.11, 8, 6), 'honey'), 0.4, 0.6, 0.44);
  const g = group(body, neck, hopper, ...beans, spout, cup, knob);
  if (big) g.add(at(part(new TorusGeometry(0.76, 0.07, 6, 20).rotateX(Math.PI / 2), trim(tier, 'sky')), 0, 1.75));
  if (tier === 3) g.add(at(tierStar(0.18), -0.3, 0.75, 0.44));
  return g;
}

/** Pastries on a shelf at height `y` inside the case: a croissant and a cake, or the other way round. */
function pastries(y: number, flip: boolean): Group[] {
  const croissant = at(part(new SphereGeometry(1, 10, 8).scale(0.32, 0.18, 0.22), 'honeyDeep'), flip ? 0.38 : -0.42, y + 0.06, 0.14);
  const cake = at(part(new CylinderGeometry(0.22, 0.24, 0.28, 14), 'coral'), flip ? -0.38 : 0.38, y + 0.14, 0.12);
  return [group(croissant), group(cake)];
}

/** i-pastry-case: glass display case with a shelf of pastries and a latte base. Tier 2 is a taller case with a second shelf under a steel roof trim; tier 3 a gold trim and a star. */
export function pastryCase(tier: Tier = 1): Group {
  const base = at(part(box(1.6, 0.5, 0.9, 0.08), 'latte'), 0, 0.25);
  if (tier === 1) {
    const glass = at(part(box(1.5, 0.8, 0.82, 0.05), 'skyLight'), 0, 0.92);
    const shelf = at(part(box(1.45, 0.06, 0.8, 0.02), 'cream', { outline: false }), 0, 0.72);
    const croissant = at(part(new SphereGeometry(1, 10, 8).scale(0.32, 0.18, 0.22), 'honeyDeep'), -0.42, 0.78, 0.14);
    const cake = at(part(new CylinderGeometry(0.22, 0.24, 0.28, 14), 'coral'), 0.38, 0.86, 0.12);
    const roof = at(part(box(1.66, 0.12, 0.96, 0.05), 'coffee'), 0, 1.36);
    return facing(group(base, glass, shelf, croissant, cake, roof), 0.3);
  }
  // A lower base keeps the taller case inside the tier 1 frame.
  base.scale.y = 0.8;
  base.position.y = 0.2;
  const glass = at(part(box(1.5, 1.04, 0.82, 0.05), 'skyLight'), 0, 0.92);
  const shelves = ([0.46, 0.9] as const).map((y) => at(part(box(1.45, 0.06, 0.8, 0.02), 'cream', { outline: false }), 0, y));
  const roof = at(part(box(1.66, 0.12, 0.96, 0.05), 'coffee'), 0, 1.5);
  const rim = at(part(box(1.7, 0.08, 1.0, 0.03), trim(tier, 'coffee')), 0, 1.42);
  const g = group(base, glass, ...shelves, ...pastries(0.46, false), ...pastries(0.9, true), roof, rim);
  if (tier === 3) g.add(at(tierStar(0.16), 0.5, 0.2, 0.47));
  return facing(g, 0.3);
}

/** Blender jug with a rim and a lid, standing at x on the base. */
function jug(x: number, r: number, drink: PaletteKey, rimColor: PaletteKey): Group {
  const jar = at(part(lathe([[0, 0], [r * 0.875, 0], [r, 1.05], [0, 1.05]], 16), drink), x, 0.75);
  const rim = at(part(new TorusGeometry(r - 0.01, 0.06, 8, 18).rotateX(Math.PI / 2), rimColor), x, 1.8);
  const lid = at(part(new CylinderGeometry(r + 0.02, r, 0.16, 16), 'coral'), x, 1.9);
  return group(jar, rim, lid);
}

/** i-blender: a green smoothie jug with a coral lid and a handle on a sky base. Tier 2 has two jugs with steel rims on a wider base; tier 3 a berry jug beside the green one, gold rims and a star. */
export function blender(tier: Tier = 1): Group {
  if (tier === 1) {
    const base = at(part(box(0.9, 0.7, 0.82, 0.12), 'sky'), 0, 0.4);
    const jar = at(part(lathe([[0, 0], [0.42, 0], [0.48, 1.05], [0, 1.05]], 16), 'leaf'), 0, 0.75);
    const rim = at(part(new TorusGeometry(0.47, 0.06, 8, 18).rotateX(Math.PI / 2), 'skyLight'), 0, 1.8);
    const lid = at(part(new CylinderGeometry(0.5, 0.48, 0.16, 16), 'coral'), 0, 1.9);
    const knob = at(part(new SphereGeometry(0.11, 8, 6), 'honey'), 0.3, 0.42, 0.42);
    return group(base, jar, rim, lid, handle(0.58, 1.0, 0.26, 'skyLight'), knob);
  }
  const base = at(part(box(1.5, 0.7, 0.82, 0.12), 'sky'), 0, 0.4);
  const knob = at(part(new SphereGeometry(0.11, 8, 6), 'honey'), 0.5, 0.42, 0.42);
  const g = group(base, jug(-0.36, 0.36, 'leaf', trim(tier, 'skyLight')), jug(0.36, 0.36, tier === 3 ? 'coral' : 'leaf', trim(tier, 'skyLight')), knob);
  if (tier === 3) g.add(at(tierStar(0.18), -0.45, 0.42, 0.43));
  return g;
}

/** i-ice-maker: a chilled cabinet with cubes in the tray and one resting on top. Tier 2 adds a mint light strip and a steel lid; tier 3 a gold lid, a star and a second cube on top. */
export function iceMaker(tier: Tier = 1): Group {
  const body = at(part(box(1.1, 1.2, 0.9, 0.14), 'sky'), 0, 0.75);
  const door = at(part(box(0.82, 0.5, 0.06, 0.05), 'skyLight'), 0, 0.55, 0.46);
  const tray = at(part(box(0.92, 0.1, 0.42, 0.04), 'cream'), 0, 0.16, 0.32);
  const cubes = [at(iceCube(0.3), -0.18, 0.24, 0.44), at(iceCube(0.26), 0.2, 0.2, 0.42)];
  cubes[0]!.rotation.set(0.3, 0.4, 0.2);
  const knob = at(part(new SphereGeometry(0.1, 8, 6), 'honey'), 0.4, 1.18, 0.46);
  const topCube = at(iceCube(0.36), tier === 3 ? -0.2 : 0.1, 1.62, 0);
  topCube.rotation.set(0.2, 0.4, 0.15);
  const g = group(body, door, tray, ...cubes, knob, topCube);
  if (tier >= 2) {
    g.add(at(part(box(0.9, 0.1, 0.05, 0.02), 'mint'), 0, 0.98, 0.46));
    g.add(at(part(box(1.16, 0.1, 0.96, 0.04), trim(tier, 'sky')), 0, 1.36));
  }
  if (tier === 3) {
    const second = at(iceCube(0.32), 0.28, 1.58, 0.1);
    second.rotation.set(-0.15, -0.3, 0.1);
    g.add(second, at(tierStar(0.16), -0.38, 1.18, 0.47));
  }
  return g;
}

/** i-dishwasher: a front-loader with a round window showing a plate inside. Tier 2 adds a steel glass rack on top; tier 3 a gold rack, and a star takes the place of the knob. */
export function dishwasher(tier: Tier = 1): Group {
  const body = at(part(box(1.1, 1.4, 0.9, 0.12), 'latte'), 0, 0.85);
  const window = at(part(disc(0.44, 0.08, 24), 'skyLight'), 0, 0.95, 0.46);
  const plate = at(part(new CylinderGeometry(0.3, 0.3, 0.06, 18), 'cream'), 0, 0.95, 0.52);
  const panel = at(part(box(0.92, 0.2, 0.08, 0.04), 'coffee'), 0, 1.52, 0.3);
  const knob = tier === 3 ? at(tierStar(0.16), 0.32, 1.52, 0.36) : at(part(new SphereGeometry(0.09, 8, 6), 'honey'), 0.32, 1.52, 0.38);
  const g = group(body, window, plate, panel, knob);
  if (tier >= 2) {
    g.add(at(part(box(0.96, 0.06, 0.7, 0.03), trim(tier, 'latte')), 0, 1.58, -0.05));
    for (const x of [-0.24, 0.24]) g.add(at(part(lathe([[0, 0], [0.13, 0], [0.17, 0.22], [0, 0.22]]), 'skyLight'), x, 1.6, -0.08));
  }
  return g;
}

/** i-frappe: tall blended-coffee glass with a cream dome, a cherry and a straw. */
export function frappe(): Group {
  const glass = part(lathe([[0, 0], [0.44, 0], [0.56, 1.35], [0, 1.35]], 16), 'latte');
  const dome = at(part(new SphereGeometry(0.58, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1), 'cream'), 0, 1.35);
  const cherry = at(part(new SphereGeometry(0.15, 10, 8), 'coral'), -0.08, 1.9, 0.1);
  const straw = stroke([[0.12, 1.45], [0.3, 2.35]], 0.09, 'coral');
  return group(glass, dome, cherry, straw);
}

/** i-level: honey shield with a cream star, the shop-level badge. */
export function level(): Group {
  const shield = polygon([[-0.8, 0.9], [0.8, 0.9], [0.8, -0.1], [0, -1.0], [-0.8, -0.1]]);
  return posed(
    'glyph',
    group(
      part(extrude(shield, 0.34, 0.07), 'honey'),
      at(part(extrude(star(5, 0.52, 0.23), 0.16, 0.05), 'cream'), 0, 0.28, 0.21),
    ),
  );
}

/** i-mission: a clipboard with a mint tick over ruled lines. */
export function mission(): Group {
  const board = part(box(1.5, 1.8, 0.16, 0.08), 'latte');
  const sheet = at(part(box(1.2, 1.5, 0.06, 0.04), 'cream', { outline: false }), 0, -0.06, 0.09);
  const clip = at(part(box(0.5, 0.28, 0.18, 0.06), 'coffee'), 0, 0.96);
  const tick = stroke([[-0.5, 0.0], [-0.22, -0.28], [0.28, 0.42]], 0.11, 'mint', { z: 0.14, outline: false });
  const lines = ([-0.35, -0.68] as const).map((y) => at(part(box(0.8, 0.09, 0.02, 0.02), 'ink', { outline: false }), 0.02, y, 0.13));
  return facing(group(board, sheet, clip, tick, ...lines), 0.26);
}
