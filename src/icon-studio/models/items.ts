/**
 * Menu items and ingredients. Models stand on y = 0 and face +Z.
 * Drinks share one base size and differ by the shape of the cup; flat or
 * round ingredients lie on the table and are shot from above (`top` pose).
 */
import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, type Group, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { type PaletteKey, part, posed } from '../style';
import { at, box, disc, extrude, facing, group, handle, iceCube, lathe, polygon, saucer, steam, stroke } from './shapes';

type Pt = readonly [number, number];

/** Cup or glass as a solid of revolution from (radius, y) pairs; the drink shows as its colour. */
const cupBody = (profile: readonly Pt[], color: PaletteKey) => part(lathe(profile, 16), color);

/** Liquid surface: flat disc at height y with radius r. */
const surface = (r: number, y: number, color: PaletteKey) => at(part(new CylinderGeometry(r, r, 0.04, 16), color, { outline: false }), 0, y);

/** Straw leaning out of a glass, top at (x, y). */
function straw(x: number, y: number, color: PaletteKey, r = 0.07): Group {
  return group(stroke([[x - 0.25, y - 0.9], [x, y]], r, color));
}

/** i-espresso: small cup with a handle on a saucer, two wisps of steam. */
export function espresso(): Group {
  const cup = at(cupBody([[0, 0], [0.32, 0], [0.48, 0.55], [0, 0.55]], 'cream'), 0, 0.14);
  return group(saucer(0.85), cup, surface(0.42, 0.7, 'coffeeDark'), handle(0.52, 0.42, 0.17), steam(0, 0.78, 0, 0.55));
}

/** i-americano: tall iced glass of black coffee with ice and a straw. */
export function americano(): Group {
  const glass = cupBody([[0, 0], [0.4, 0], [0.52, 1.5], [0, 1.5]], 'coffeeDark');
  const ice = [
    at(iceCube(0.36), -0.12, 1.55, 0.05),
    at(iceCube(0.3), 0.22, 1.5, -0.12),
  ];
  ice[0]!.rotation.set(0.3, 0.4, 0.2);
  return group(glass, ...ice, straw(0.3, 2.0, 'cream'));
}

/** i-latte: glass mug with a handle, three layers seen through: coffee, milk, foam. */
export function latte(): Group {
  const layers = (
    [
      [0, 0.55, 0.42, 0.45, 'coffee'],
      [0.55, 1.05, 0.45, 0.48, 'latte'],
      [1.05, 1.32, 0.48, 0.5, 'cream'],
    ] as const
  ).map(([y0, y1, r0, r1, color]) => at(part(new CylinderGeometry(r1, r0, y1 - y0, 16), color), 0, (y0 + y1) / 2));
  return group(...layers, handle(0.52, 0.7, 0.26, 'skyLight'));
}

/** i-cappuccino: wide cup, foam dome with a dusting dot, on a saucer. */
export function cappuccino(): Group {
  const cup = at(cupBody([[0, 0], [0.35, 0], [0.62, 0.32], [0.68, 0.62], [0, 0.62]], 'latte'), 0, 0.14);
  const foam = at(part(new SphereGeometry(0.66, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), 'cream'), 0, 0.76);
  const dust = at(part(new SphereGeometry(0.12, 8, 6).scale(1, 0.4, 1), 'coffee', { outline: false }), 0, 1.06);
  return group(saucer(1.0), cup, foam, dust, handle(0.7, 0.45, 0.18, 'latte'));
}

/** i-mocha: chocolate mug crowned with a whipped cream swirl. */
export function mocha(): Group {
  const mug = cupBody([[0, 0], [0.5, 0], [0.56, 0.9], [0, 0.9]], 'coffeeDark');
  const swirl = (
    [
      [0.52, 0.98],
      [0.38, 1.14],
      [0.22, 1.28],
    ] as const
  ).map(([r, y]) => at(part(new TorusGeometry(r * 0.75, r * 0.32, 8, 16).rotateX(Math.PI / 2), 'cream'), 0, y));
  const tip = at(part(new ConeGeometry(0.14, 0.22, 10), 'cream'), 0, 1.42);
  return group(mug, ...swirl, tip, handle(0.6, 0.48, 0.24, 'coffeeDark'));
}

/** i-bubble-tea: milk tea cup with a dome lid, a fat straw and pearls at the bottom. */
export function bubbleTea(): Group {
  const cup = cupBody([[0, 0], [0.42, 0], [0.55, 1.3], [0, 1.3]], 'latte');
  const lid = at(part(new SphereGeometry(0.58, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), 'cream'), 0, 1.3);
  const pearls = [-0.22, 0.05, 0.3, -0.05].map((a, i) =>
    at(part(new SphereGeometry(0.11, 8, 6), 'coffeeDark', { outline: false }), Math.sin(a + i) * 0.3, 0.16 + (i % 2) * 0.17, 0.4 + Math.cos(a + i) * 0.05),
  );
  return group(cup, lid, ...pearls, straw(0.25, 2.1, 'coral', 0.11));
}

/** Round citrus slice (honey lemon or tangerine orange) standing on a glass rim at (x, y). */
function slice(color: PaletteKey, x: number, y: number): Group {
  const g = group(part(disc(0.36, 0.1, 18), color), at(part(disc(0.27, 0.12, 18), 'honeyLight', { outline: false }), 0, 0));
  for (let i = 0; i < 3; i++) {
    const seg = part(new CylinderGeometry(0.02, 0.02, 0.5, 4), color, { outline: false });
    seg.rotation.z = (i * Math.PI) / 3;
    seg.position.z = 0.07;
    g.add(seg);
  }
  return facing(at(g, x, y), 0.4);
}

/** Tall glass of a cold drink with an ice cube and a citrus slice on the rim. */
function coldGlass(drink: PaletteKey, fruit: PaletteKey): Group {
  const glass = cupBody([[0, 0], [0.4, 0], [0.5, 1.35], [0, 1.35]], drink);
  const cube = at(iceCube(0.34), -0.1, 1.4, 0.05);
  cube.rotation.set(0.3, 0.5, 0.2);
  return group(glass, cube, slice(fruit, 0.45, 1.45));
}

export const lemonTea = () => coldGlass('latte', 'honey');

export function orangeJuice(): Group {
  const g = coldGlass('tangerine', 'tangerine');
  g.add(straw(-0.15, 1.95, 'cream'));
  return g;
}

/** i-croissant: crescent of five puffy segments on a small plate. */
export function croissant(): Group {
  const g = group(saucer(0.95));
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = Math.PI * (0.12 + 0.76 * t);
    const mid = 1 - Math.abs(t - 0.5) * 2;
    const r = 0.26 + 0.24 * mid;
    const seg = part(new SphereGeometry(1, 12, 8).scale(r * 1.1, r * 0.9, r * 1.2), i % 2 ? 'latte' : 'honeyDeep');
    seg.position.set(-Math.cos(a) * 0.78, 0.14 + r * 0.85, -Math.sin(a) * 0.62 + 0.38);
    seg.rotation.y = -a;
    g.add(seg);
  }
  return g;
}

/** i-cake: cream sponge wedge with a berry layer and a berry on top, on a plate. */
export function cake(): Group {
  const wedge = polygon([[0, 0], [1.5, -0.6], [1.5, 0.6]]);
  const layer = (y: number, h: number, color: PaletteKey) => {
    const m = part(extrude(wedge, h, 0.03).rotateX(-Math.PI / 2), color);
    m.position.set(-0.75, y + h / 2, 0);
    return m;
  };
  const top = 0.14 + 0.42 + 0.18 + 0.42;
  const cherry = at(part(new SphereGeometry(0.22, 10, 8), 'coral'), 0.35, top + 0.2);
  const g = group(saucer(0.95), layer(0.14, 0.42, 'cream'), layer(0.56, 0.18, 'coral'), layer(0.74, 0.42, 'cream'), cherry);
  return facing(g, -0.9);
}

// Ingredients

const BEAN = { rx: 0.5, ry: 0.32, rz: 0.72 };

/** One coffee bean lying on its flat side, with a deep S-shaped crease on top. */
function bean(): Group {
  const body = at(part(new SphereGeometry(1, 14, 10).scale(BEAN.rx, BEAN.ry, BEAN.rz), 'coffee'), 0, BEAN.ry);
  const points: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const z = (t - 0.5) * 1.6 * BEAN.rz;
    const x = Math.sin(t * Math.PI * 2) * 0.08;
    const inside = 1 - (x / BEAN.rx) ** 2 - (z / BEAN.rz) ** 2;
    points.push(new Vector3(x, BEAN.ry + BEAN.ry * Math.sqrt(Math.max(inside, 0)) + 0.005, z));
  }
  const crease = part(new TubeGeometry(new CatmullRomCurve3(points), 16, 0.06, 5), 'coffeeDark', { outline: false });
  return group(body, crease);
}

/** i-beans: two big beans overlapping, seen from above. */
export function beans(): Group {
  const a = at(bean(), -0.38, 0, 0.1);
  a.rotation.y = 0.45;
  const b = at(bean(), 0.42, 0.1, -0.15);
  b.rotation.set(0, -0.5, 0.18);
  return posed('top', group(a, b));
}

/** i-milk: gable-top carton, cream with a sky band. */
export function milk(): Group {
  const body = at(part(box(0.9, 1.2, 0.9, 0.05), 'cream'), 0, 0.6);
  const roof = at(part(extrude(polygon([[-0.45, 0], [0.45, 0], [0, 0.4]]), 0.9, 0.02).rotateY(Math.PI / 2), 'cream'), 0, 1.2);
  const fin = at(part(box(0.95, 0.16, 0.08, 0.03), 'creamDeep'), 0, 1.66);
  const band = at(part(box(0.92, 0.4, 0.92, 0.03), 'sky', { outline: false }), 0, 0.62);
  return group(body, roof, fin, band);
}

/** i-sugar: three sugar cubes, two below and one on top. */
export function sugar(): Group {
  const cube = (x: number, y: number, z: number, ry: number) => {
    const m = at(part(box(0.62, 0.62, 0.62, 0.1), 'cream'), x, y, z);
    m.rotation.y = ry;
    return m;
  };
  return posed('top', group(cube(-0.36, 0.31, 0.1, 0.2), cube(0.36, 0.31, 0.05, -0.15), cube(0, 0.93, 0.05, 0.4)));
}

/** i-cacao: latte box with a berry band and a lid seam. */
export function cacao(): Group {
  const tin = at(part(box(1.0, 1.4, 0.8, 0.08), 'latte'), 0, 0.7);
  const band = at(part(box(1.02, 0.6, 0.82, 0.06), 'coral', { outline: false }), 0, 0.45);
  const lid = at(part(box(1.06, 0.2, 0.86, 0.06), 'coffee'), 0, 1.35);
  return group(tin, band, lid);
}

/** i-tea: one big tea leaf with a stem and a vein. */
export function tea(): Group {
  const leafShape = polygon([[0, 0], [0.45, 0.25], [0.6, 0.7], [0.45, 1.15], [0, 1.5], [-0.45, 1.15], [-0.6, 0.7], [-0.45, 0.25]]);
  const leaf = part(extrude(leafShape, 0.14, 0.06), 'leaf');
  const vein = stroke([[0, 0.1], [0, 1.3]], 0.035, 'cream', { z: 0.14, outline: false });
  const stem = stroke([[0, 0], [-0.12, -0.3]], 0.07, 'leaf');
  const g = group(leaf, vein, stem);
  g.rotation.set(-0.35, 0, -0.55);
  g.position.y = 0.45;
  return facing(group(g));
}

/** i-pearls: three tapioca pearls with a cream glint each. */
export function pearls(): Group {
  const pearl = (x: number, y: number, z: number) =>
    group(
      at(part(new SphereGeometry(0.42, 14, 10), 'coffeeDark'), x, y, z),
      at(part(new SphereGeometry(0.1, 8, 6), 'cream', { outline: false }), x - 0.16, y + 0.22, z + 0.22),
    );
  return posed('top', group(pearl(-0.42, 0.42, 0.25), pearl(0.45, 0.42, 0.2), pearl(0, 0.42, -0.45)));
}

/** i-lemon: lemon with pointed ends and a leaf. */
export function lemon(): Group {
  const fruit = at(part(new SphereGeometry(1, 16, 10).scale(0.85, 0.55, 0.6), 'honey'), 0, 0.55);
  const tips = [-1, 1].map((s) => at(part(new SphereGeometry(0.13, 8, 6), 'honey'), s * 0.86, 0.55));
  const leaf = at(part(new SphereGeometry(1, 8, 6).scale(0.3, 0.06, 0.14), 'leaf'), -0.95, 0.75, 0.12);
  leaf.rotation.y = 0.5;
  const g = group(fruit, ...tips, leaf);
  g.rotation.y = 0.5;
  return posed('top', group(g));
}

/** i-orange: orange with a stalk and a leaf on top. */
export function orange(): Group {
  const fruit = at(part(new SphereGeometry(0.78, 18, 12), 'tangerine'), 0, 0.78);
  const stalk = at(part(new CylinderGeometry(0.05, 0.06, 0.16, 6), 'coffee'), 0, 1.6);
  const leaf = at(part(new SphereGeometry(1, 8, 6).scale(0.38, 0.06, 0.18), 'leaf'), 0.3, 1.58, 0.05);
  leaf.rotation.set(0, 0.4, 0.25);
  return posed('top', group(fruit, stalk, leaf));
}

/** i-flour: tied cream sack with a honey wheat ear. */
export function flour(): Group {
  const sack = part(lathe([[0, 0], [0.6, 0], [0.72, 0.5], [0.62, 1.05], [0.28, 1.25], [0, 1.25]]), 'cream');
  const tie = at(part(new TorusGeometry(0.28, 0.06, 6, 14).rotateX(Math.PI / 2), 'latte'), 0, 1.25);
  const top = at(part(new ConeGeometry(0.3, 0.32, 10).rotateX(Math.PI), 'cream'), 0, 1.43);
  const ear = at(part(new SphereGeometry(1, 8, 6).scale(0.12, 0.3, 0.08), 'honey', { outline: false }), 0, 0.58, 0.7);
  const stalk = stroke([[0, 0.2], [0, 0.4]], 0.035, 'honeyDeep', { z: 0.68, outline: false });
  return group(sack, tie, top, ear, stalk);
}

/** i-butter: honey butter block on a cream dish. */
export function butter(): Group {
  const dish = at(part(box(1.6, 0.12, 1.0, 0.05), 'cream'), 0, 0.06);
  const block = at(part(box(1.15, 0.5, 0.7, 0.06), 'honey'), -0.05, 0.37);
  const pat = at(part(box(0.3, 0.12, 0.3, 0.04), 'honeyLight'), 0.52, 0.18, 0.2);
  return posed('top', group(dish, block, pat));
}

/** i-ice: two ice cubes. */
export function ice(): Group {
  const a = at(iceCube(0.9), -0.3, 0.45, 0.1);
  a.rotation.y = 0.3;
  const b = at(iceCube(0.7), 0.5, 0.35, -0.3);
  b.rotation.y = -0.4;
  return posed('top', group(a, b));
}

/** i-cup: paper takeaway cup with a honey sleeve and a berry lid (the old i-latte sample). */
export function cup(): Group {
  const body = part(lathe([[0, 0], [0.4, 0], [0.54, 1.25], [0, 1.25]]), 'cream');
  const sleeve = part(lathe([[0.45, 0.32], [0.48, 0.32], [0.515, 0.86], [0.485, 0.86]]), 'honey', { outline: false });
  const lid = part(lathe([[0, 1.22], [0.6, 1.22], [0.6, 1.32], [0.5, 1.42], [0, 1.42]]), 'coral');
  return group(body, sleeve, lid);
}
