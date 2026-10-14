/** HUD, navigation and system icons (`object` pose). Models stand on y = 0 and face +Z. */
import { ConeGeometry, CylinderGeometry, Group, Shape, SphereGeometry, TorusGeometry } from 'three';
import { part } from '../style';
import { arc, at, box, disc, extrude, facing, group, inkDot, lathe, polygon, roundRect, stroke } from './shapes';

/** i-tasks: clipboard with a cream sheet and three ink lines. */
export function tasks(): Group {
  const board = at(part(box(1.3, 1.7, 0.12, 0.1), 'latte'), 0, 0.85);
  const sheet = at(part(box(1.05, 1.35, 0.03, 0.03), 'cream', { outline: false }), 0, 0.78, 0.075);
  const clip = at(part(box(0.6, 0.26, 0.2, 0.06), 'honey'), 0, 1.68, 0.03);
  const lines = [1.12, 0.84, 0.56].map((y, i) => at(part(box(i === 2 ? 0.45 : 0.7, 0.07, 0.02, 0.01), 'ink', { outline: false }), i === 2 ? -0.12 : 0, y, 0.1));
  const g = facing(group(board, sheet, clip, ...lines));
  g.rotation.x = -0.12;
  return g;
}

/** i-menu: plate standing up between a chunky fork and knife. */
export function menu(): Group {
  const plate = at(part(disc(0.66, 0.16, 20), 'honey'), 0, 0.8);
  const well = at(part(disc(0.4, 0.06, 20), 'cream'), 0, 0.8, 0.1);

  const fork = new Group();
  fork.add(at(part(box(0.24, 1.0, 0.16, 0.08), 'cream'), 0, 0.5), at(part(box(0.56, 0.2, 0.16, 0.07), 'cream'), 0, 1.06));
  for (const x of [-0.2, 0, 0.2]) fork.add(at(part(box(0.14, 0.42, 0.14, 0.05), 'cream'), x, 1.32));
  fork.position.x = -1.08;

  const knife = new Group();
  knife.add(
    at(part(box(0.26, 0.7, 0.16, 0.08), 'cream'), 0, 0.35),
    at(part(extrude(polygon([[-0.15, 0], [0.17, 0], [0.17, 0.62], [0, 0.95], [-0.15, 0.82]]), 0.08, 0.04), 'cream'), 0, 0.72),
  );
  knife.position.x = 1.08;
  return facing(group(plate, well, fork, knife), 0.2);
}

/** i-inventory: taped cardboard crate. */
export function inventory(): Group {
  const crate = at(part(box(1.5, 1.05, 1.2, 0.07), 'latte'), 0, 0.525);
  const tapeTop = at(part(box(0.34, 0.03, 1.23, 0.01), 'cream', { outline: false }), 0, 1.06);
  const tapeFront = at(part(box(0.34, 0.4, 0.03, 0.01), 'cream', { outline: false }), 0, 0.86, 0.61);
  const label = at(part(box(0.5, 0.3, 0.03, 0.02), 'creamDeep', { outline: false }), -0.4, 0.38, 0.61);
  return group(crate, tapeTop, tapeFront, label);
}

/** i-upgrades: hammer crossed over a wrench, the classic "build" badge. */
export function upgrades(): Group {
  const wrench = new Group();
  const jaw = polygon([[-0.34, -0.2], [0.34, -0.2], [0.34, 0.35], [0.13, 0.35], [0.13, 0.08], [-0.13, 0.08], [-0.13, 0.35], [-0.34, 0.35]]);
  wrench.add(at(part(box(0.24, 1.5, 0.14, 0.07), 'creamDeep'), 0, 0), at(part(extrude(jaw, 0.14, 0.04), 'creamDeep'), 0, 0.82));
  wrench.rotation.z = 0.7;

  const hammer = new Group();
  hammer.add(
    at(part(box(0.2, 1.6, 0.18, 0.08), 'latte'), 0, -0.1),
    at(part(box(0.9, 0.36, 0.34, 0.08), 'creamDeep'), 0.05, 0.75),
    at(part(box(0.18, 0.3, 0.3, 0.05), 'coffee'), -0.45, 0.75),
  );
  hammer.rotation.z = -0.7;
  hammer.position.z = 0.18;
  const g = facing(group(wrench, hammer), 0.55);
  g.position.y = 1;
  return g;
}

/** i-reviews: speech bubble with three dots. */
export function reviews(): Group {
  const w = 1.7;
  const h = 1.15;
  const r = 0.3;
  const b = 0.32;
  const s = new Shape();
  s.moveTo(r, b);
  s.lineTo(0.38, b);
  s.lineTo(0.3, 0);
  s.lineTo(0.8, b);
  s.lineTo(w - r, b);
  s.quadraticCurveTo(w, b, w, b + r);
  s.lineTo(w, b + h - r);
  s.quadraticCurveTo(w, b + h, w - r, b + h);
  s.lineTo(r, b + h);
  s.quadraticCurveTo(0, b + h, 0, b + h - r);
  s.lineTo(0, b + r);
  s.quadraticCurveTo(0, b, r, b);
  const g = group(part(extrude(s, 0.3, 0.06).translate(-w / 2, 0, 0), 'sky'));
  for (const x of [-0.42, 0, 0.42]) {
    g.add(at(part(new SphereGeometry(0.13, 10, 8).scale(1, 1, 0.6), 'ink', { outline: false }), x, b + h / 2, 0.21));
  }
  return g;
}

/** i-people: two bean people, honey in front, sky behind. */
export function people(): Group {
  const person = (body: 'honey' | 'sky') =>
    group(part(lathe([[0, 0], [0.62, 0], [0.55, 0.4], [0.3, 0.62], [0, 0.66]]), body), at(part(new SphereGeometry(0.42, 14, 10), 'skin'), 0, 0.98));
  const back = at(person('sky'), 0.55, 0, -0.5);
  back.scale.setScalar(0.82);
  const front = at(person('honey'), -0.35, 0, 0.2);
  return group(back, front);
}

/** i-marketing: megaphone with a sound wave. */
export function marketing(): Group {
  const horn = at(part(new CylinderGeometry(0.26, 0.62, 1.2, 14).rotateZ(Math.PI / 2), 'coral'), 0.1, 0.9);
  const mouth = at(part(new CylinderGeometry(0.62, 0.62, 0.06, 14).rotateZ(Math.PI / 2), 'cream', { outline: false }), 0.69, 0.9);
  const cap = at(part(new CylinderGeometry(0.3, 0.3, 0.24, 12).rotateZ(Math.PI / 2), 'cream'), -0.58, 0.9);
  const grip = at(part(box(0.2, 0.55, 0.22, 0.06), 'cream'), -0.25, 0.42);
  const wave = stroke([[0.95, 1.35], [1.12, 1.1], [1.15, 0.9], [1.12, 0.7], [0.95, 0.45]], 0.07, 'honey');
  return facing(group(horn, mouth, cap, grip, wave), 0.25);
}

/** i-open: service bell on the counter. */
export function open(): Group {
  const base = part(lathe([[0, 0], [0.95, 0], [0.95, 0.14], [0.85, 0.2], [0, 0.2]], 20), 'latte');
  const dome = at(part(new SphereGeometry(0.75, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'honey'), 0, 0.2);
  const button = at(part(new CylinderGeometry(0.1, 0.12, 0.26, 10), 'coffeeDark'), 0, 1.05);
  const knob = at(part(new SphereGeometry(0.15, 10, 8), 'coffeeDark'), 0, 1.2);
  return group(base, dome, button, knob);
}

/** i-next-day: rising sun, a fat disc with eight short rays. */
export function nextDay(): Group {
  const sun = part(disc(0.62, 0.34, 24), 'honey');
  const g = group(sun);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const ray = part(box(0.18, 0.36, 0.2, 0.08), 'honeyDeep');
    ray.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  g.position.y = 1.15;
  return facing(group(g));
}

/** i-camera: video camera, body and hood in sky, cream lens. */
export function camera(): Group {
  const body = at(part(box(1.25, 0.9, 0.8, 0.14), 'sky'), -0.2, 0.55);
  const hood = at(part(new CylinderGeometry(0.5, 0.32, 0.5, 4, 1).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4), 'sky'), 0.65, 0.55);
  const lens = at(part(disc(0.26, 0.1, 16), 'cream'), -0.45, 0.55, 0.42);
  const pupil = at(part(disc(0.12, 0.06, 12), 'ink', { outline: false }), -0.45, 0.55, 0.48);
  const rec = at(part(new SphereGeometry(0.08, 8, 6), 'coral', { outline: false }), 0.18, 0.85, 0.41);
  return facing(group(body, hood, lens, pupil, rec), 0.3);
}

/** Gear outline: `teeth` square teeth between radius `r0` and `r1`. */
function gear(teeth: number, r0: number, r1: number): Shape {
  const pts: (readonly [number, number])[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth;
    const w = Math.PI / teeth / 2;
    for (const [r, da] of [[r0, -w * 1.3], [r1, -w * 0.75], [r1, w * 0.75], [r0, w * 1.3]] as const) {
      pts.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
    }
  }
  return polygon(pts);
}

/** i-settings: chunky gear with a cream hub. */
export function settings(): Group {
  const g = group(part(extrude(gear(8, 0.7, 0.98), 0.4, 0.06), 'sky'), at(part(disc(0.32, 0.56, 16), 'cream'), 0, 0));
  g.position.y = 1.05;
  return facing(group(g));
}

/** i-home: little house with a coffee roof and a latte door. */
export function home(): Group {
  const walls = at(part(box(1.4, 0.95, 1.1, 0.05), 'honey'), 0, 0.475);
  const roof = at(part(extrude(polygon([[-0.95, 0], [0.95, 0], [0, 0.75]]), 1.2, 0.05), 'coffee'), 0, 0.92);
  const door = at(part(box(0.38, 0.6, 0.06, 0.04), 'latte'), 0.15, 0.3, 0.56);
  return group(walls, roof, door);
}

/** Round clock face (honey rim, cream face, ink hands) facing +Z, centre at (0, y). */
export function clockFace(y: number): Group {
  const g = group(
    part(disc(0.85, 0.34, 28), 'honey'),
    at(part(disc(0.68, 0.06, 28), 'cream', { outline: false }), 0, 0, 0.18),
    stroke([[0, 0], [0, 0.45]], 0.06, 'ink', { z: 0.23, outline: false }),
    stroke([[0, 0], [0.32, -0.18]], 0.06, 'ink', { z: 0.23, outline: false }),
  );
  g.position.y = y;
  return g;
}

/** i-clock: wall clock. */
export const clock = () => facing(group(clockFace(0.9)));

/** i-coin: gold coin standing on its edge, rim and bar raised. */
export function coin(): Group {
  const face = part(disc(0.85, 0.24, 28), 'honey');
  const ring = at(part(new TorusGeometry(0.52, 0.06, 6, 24), 'honeyDeep', { outline: false }), 0, 0, 0.13);
  const bar = at(part(box(0.14, 0.6, 0.06, 0.03), 'honeyDeep', { outline: false }), 0, 0, 0.14);
  const g = group(face, ring, bar);
  g.position.y = 0.85;
  return facing(group(g), 0.55);
}

/** i-chart: three bars (mint, honey, berry) on a cream base. */
export function chart(): Group {
  const base = at(part(box(1.7, 0.16, 1.0, 0.05), 'cream'), 0, 0.08);
  const bars = (
    [
      [-0.55, 0.7, 'mint'],
      [0, 1.3, 'honey'],
      [0.55, 0.95, 'coral'],
    ] as const
  ).map(([x, h, color]) => at(part(box(0.42, h, 0.42, 0.06), color), x, 0.16 + h / 2));
  return group(base, ...bars);
}

/** i-trophy: honey cup with handles on a latte base. */
export function trophy(): Group {
  const cup = at(part(lathe([[0, 0], [0.14, 0], [0.5, 0.35], [0.62, 0.95], [0, 0.95]]), 'honey'), 0, 0.62);
  const stem = at(part(new CylinderGeometry(0.1, 0.16, 0.3, 10), 'honey'), 0, 0.5);
  const base = at(part(box(0.9, 0.34, 0.6, 0.06), 'latte'), 0, 0.17);
  const handles = [-1, 1].map((s) => at(part(new TorusGeometry(0.22, 0.06, 6, 12), 'honey'), s * 0.62, 1.2));
  return facing(group(cup, stem, base, ...handles), 0.2);
}

/** i-lock: padlock, honey body, cream-200 shackle, ink keyhole. */
export function lock(): Group {
  const body = at(part(box(1.2, 0.95, 0.5, 0.14), 'honey'), 0, 0.48);
  const shackle = at(part(new TorusGeometry(0.36, 0.1, 8, 16, Math.PI), 'creamDeep'), 0, 0.95);
  const legs = [-0.36, 0.36].map((x) => at(part(new CylinderGeometry(0.1, 0.1, 0.25, 8), 'creamDeep'), x, 0.95));
  const hole = at(inkDot(0.1), 0, 0.55, 0.26);
  const slot = at(part(box(0.08, 0.22, 0.04, 0.02), 'ink', { outline: false }), 0, 0.4, 0.26);
  return facing(group(body, shackle, ...legs, hole, slot), 0.3);
}

/** i-tip: light bulb with a cream-200 screw base. */
export function tip(): Group {
  const glass = at(part(new SphereGeometry(0.62, 16, 12), 'honey'), 0, 1.12);
  const neck = at(part(new CylinderGeometry(0.32, 0.4, 0.3, 12), 'honey'), 0, 0.55);
  const screw = at(part(lathe([[0, 0], [0.2, 0], [0.3, 0.08], [0.32, 0.42], [0, 0.42]], 12), 'creamDeep'), 0, 0);
  const shine = at(part(new SphereGeometry(0.12, 8, 6).scale(1, 1.6, 0.5), 'cream', { outline: false }), -0.28, 1.28, 0.5);
  return group(glass, neck, screw, shine);
}

/** i-busy: hourglass, coffee caps, honey sand. */
export function busy(): Group {
  const glass = at(part(lathe([[0, 0], [0.5, 0], [0.42, 0.35], [0.1, 0.7], [0.42, 1.05], [0.5, 1.4], [0, 1.4]], 14), 'honey'), 0, 0.16);
  const caps = [0.08, 1.64].map((y) => at(part(new CylinderGeometry(0.66, 0.66, 0.16, 16), 'coffee'), 0, y));
  return group(glass, ...caps);
}

/** i-auto: little robot head with an antenna. */
export function auto(): Group {
  const head = at(part(box(1.3, 1.0, 0.9, 0.22), 'sky'), 0, 0.5);
  const eyes = [-0.28, 0.28].map((x) => at(inkDot(0.11), x, 0.6, 0.46));
  const mouth = at(part(box(0.5, 0.08, 0.04, 0.03), 'ink', { outline: false }), 0, 0.3, 0.46);
  const ears = [-0.72, 0.72].map((x) => at(part(new CylinderGeometry(0.15, 0.15, 0.16, 10).rotateZ(Math.PI / 2), 'creamDeep'), x, 0.55));
  const stalk = at(part(new CylinderGeometry(0.05, 0.05, 0.3, 6), 'coffee'), 0, 1.13);
  const ball = at(part(new SphereGeometry(0.15, 10, 8), 'honey'), 0, 1.33);
  return facing(group(head, ...eyes, mouth, ...ears, stalk, ball), 0.3);
}

/** i-load: honey folder with a tab. */
export function load(): Group {
  const back = at(part(extrude(polygon([[-0.85, 0], [0.85, 0], [0.85, 1.05], [-0.1, 1.05], [-0.3, 1.25], [-0.85, 1.25]]), 0.1, 0.05), 'honeyDeep'), 0, 0.1, -0.1);
  const front = at(part(box(1.75, 0.95, 0.12, 0.06), 'honey'), 0, 0.58, 0.05);
  front.rotation.x = -0.18;
  return facing(group(back, front));
}

/** i-delete: berry bin with a lid and grooves. */
export function del(): Group {
  const bin = part(lathe([[0, 0], [0.5, 0], [0.62, 1.15], [0, 1.15]], 14), 'coral');
  const lid = at(part(box(1.45, 0.16, 1.45 * 0.62, 0.06), 'coralDeep'), 0, 1.24);
  const grip = at(part(box(0.4, 0.14, 0.2, 0.05), 'coralDeep'), 0, 1.38);
  const grooves = [-0.2, 0.2].map((x) => at(part(box(0.07, 0.65, 0.04, 0.03), 'cream', { outline: false }), x, 0.58, 0.56));
  return facing(group(bin, lid, grip, ...grooves), 0.2);
}

/** i-save: floppy disk standing up. */
export function save(): Group {
  const disk = part(box(1.4, 1.4, 0.18, 0.1), 'sky');
  const label = at(part(box(0.95, 0.62, 0.04, 0.04), 'cream'), 0, -0.3, 0.1);
  const shutter = at(part(box(0.7, 0.4, 0.04, 0.03), 'creamDeep', { outline: false }), 0.05, 0.47, 0.1);
  const g = group(disk, label, shutter);
  g.position.y = 0.75;
  return facing(group(g));
}

/** i-music: two berry notes joined by a beam. */
export function music(): Group {
  const heads = (
    [
      [-0.45, 0.35],
      [0.55, 0.55],
    ] as const
  ).map(([x, y]) => at(part(new SphereGeometry(0.3, 12, 8).scale(1.2, 0.9, 0.8), 'coral'), x, y));
  const stems = (
    [
      [-0.2, 0.35, 1.4],
      [0.8, 0.55, 1.2],
    ] as const
  ).map(([x, y, h]) => at(part(box(0.1, h, 0.1, 0.04), 'coffeeDark'), x, y + h / 2));
  const beam = at(part(box(1.15, 0.2, 0.14, 0.05), 'coffeeDark'), 0.3, 1.68);
  beam.rotation.z = 0.06;
  return facing(group(...heads, ...stems, beam), 0.25);
}

/** i-sound: speaker box with two sound waves. */
export function sound(): Group {
  const boxy = at(part(box(0.5, 0.65, 0.6, 0.08), 'sky'), -0.55, 0.9);
  const cone = at(part(new ConeGeometry(0.62, 0.7, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), 'sky'), -0.1, 0.9);
  const waves = [0.4, 0.7].map((r) => stroke(arc(0.15, 0.9, r, -0.9, 0.9, 6), 0.07, 'ink', { outline: false }));
  return facing(group(boxy, cone, ...waves), 0.2);
}

/** i-quality: monitor on a stand. */
export function quality(): Group {
  const screen = at(part(box(1.7, 1.15, 0.16, 0.1), 'sky'), 0, 1.12);
  const glass = at(part(extrude(roundRect(1.45, 0.9, 0.08), 0.02, 0.01), 'skyLight', { outline: false }), 0, 1.14, 0.09);
  const neck = at(part(box(0.16, 0.4, 0.12, 0.04), 'creamDeep'), 0, 0.38);
  const foot = at(part(box(0.8, 0.12, 0.45, 0.05), 'creamDeep'), 0, 0.06);
  return facing(group(screen, glass, neck, foot));
}
