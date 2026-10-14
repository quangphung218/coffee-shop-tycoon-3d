/**
 * Shop upgrades, marketing, staff roles, day phases, difficulty and
 * temperature (`object` pose). Models stand on y = 0 and face +Z.
 */
import { ConeGeometry, CylinderGeometry, type Group, LatheGeometry, type Shape, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { part, posed } from '../style';
import { clockFace } from './hud';
import { arc, arrowShape, at, badgeBase, box, disc, extrude, facing, group, handle, inkDot, lathe, polygon, steam, stroke } from './shapes';

// Upgrades: the same furniture the scene shows.

/** i-tables: round café table with a chair beside it. */
export function tables(): Group {
  const top = at(part(new CylinderGeometry(0.6, 0.6, 0.12, 18), 'latte'), 0.3, 0.9);
  const post = at(part(new CylinderGeometry(0.08, 0.08, 0.8, 8), 'coffee'), 0.3, 0.45);
  const foot = at(part(new CylinderGeometry(0.35, 0.38, 0.08, 14), 'coffee'), 0.3, 0.04);
  const chair = group(
    at(part(box(0.6, 0.1, 0.6, 0.04), 'latte'), 0, 0.55),
    at(part(box(0.6, 0.7, 0.1, 0.05), 'latte'), 0, 0.95, -0.27),
    ...[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].map(([x, z]) => at(part(box(0.08, 0.55, 0.08, 0.03), 'coffee'), x!, 0.27, z!)),
  );
  chair.position.set(-0.75, 0, 0.1);
  chair.rotation.y = 0.5;
  return group(top, post, foot, chair);
}

/** Espresso machine: sky body, group head, cup on the tray, honey button. */
function machineBody(): Group {
  const body = at(part(box(1.3, 1.3, 0.9, 0.1), 'sky'), 0, 0.85);
  const tray = at(part(box(1.1, 0.12, 0.7, 0.04), 'creamDeep'), 0, 0.06, 0.1);
  const head = at(part(new CylinderGeometry(0.16, 0.16, 0.2, 10), 'coffeeDark'), 0, 0.85, 0.5);
  const cup = at(part(lathe([[0, 0], [0.14, 0], [0.2, 0.28], [0, 0.28]]), 'cream'), 0, 0.12, 0.5);
  const button = at(part(new SphereGeometry(0.1, 8, 6), 'honey'), 0.4, 1.25, 0.46);
  const lip = at(part(box(1.3, 0.3, 0.12, 0.05), 'sky'), 0, 0.35, 0.4);
  return group(body, tray, head, cup, button, lip);
}

export const machine = () => machineBody();

/** i-fast-machine: the machine with a honey lightning bolt in front. */
export function fastMachine(): Group {
  const bolt = at(part(extrude(polygon([[0.1, 0.75], [-0.35, 0], [-0.02, 0], [-0.15, -0.65], [0.35, 0.12], [0.02, 0.12]]), 0.16, 0.04), 'honey'), 0.7, 1.0, 0.45);
  const g = machineBody();
  g.position.x = -0.15;
  return group(g, bolt);
}

/** i-counter: latte counter with a cream top and a sky cash register. */
export function counter(): Group {
  const body = at(part(box(1.9, 0.9, 0.8, 0.06), 'latte'), 0, 0.45);
  const top = at(part(box(2.0, 0.12, 0.9, 0.04), 'cream'), 0, 0.96);
  const register = at(part(box(0.7, 0.45, 0.55, 0.08), 'sky'), -0.4, 1.25);
  const screen = at(part(box(0.5, 0.3, 0.08, 0.04), 'sky'), -0.4, 1.62, -0.1);
  screen.rotation.x = -0.3;
  const stripe = at(part(box(1.4, 0.08, 0.02, 0.01), 'cream', { outline: false }), 0, 0.55, 0.41);
  return group(body, top, register, screen, stripe);
}

/** i-outdoor: berry parasol over a small table. */
export function outdoor(): Group {
  const shade = at(part(new ConeGeometry(1.1, 0.55, 8), 'coral'), 0, 1.75);
  const pole = at(part(new CylinderGeometry(0.05, 0.05, 1.7, 6), 'cream'), 0, 0.95);
  const knob = at(part(new SphereGeometry(0.08, 8, 6), 'cream'), 0, 2.08);
  const top = at(part(new CylinderGeometry(0.55, 0.55, 0.1, 16), 'latte'), 0, 0.7);
  const leg = at(part(new CylinderGeometry(0.07, 0.07, 0.65, 8), 'coffee'), 0, 0.33);
  return group(shade, pole, knob, top, leg);
}

/** i-expand: honey floor tile with four cream arrows pushing outwards. */
export function expand(): Group {
  const tile = at(part(box(1.15, 0.22, 1.15, 0.08), 'honey'), 0, 0.11);
  const g = group(tile);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arrow = part(extrude(arrowShape(0.75, 0.26, 0.6, 0.34), 0.18, 0.04).rotateX(-Math.PI / 2), 'cream');
    arrow.position.set(Math.cos(a) * 1.08, 0.12, -Math.sin(a) * 1.08);
    arrow.rotation.y = a;
    g.add(arrow);
  }
  return posed('top', g);
}

/** i-plants: tangerine pot with two leaves. */
export function plants(): Group {
  const pot = part(lathe([[0, 0], [0.4, 0], [0.55, 0.7], [0.6, 0.75], [0, 0.75]]), 'tangerine');
  const soil = at(part(new CylinderGeometry(0.5, 0.5, 0.04, 14), 'coffeeDark', { outline: false }), 0, 0.77);
  const leaf = (rz: number, s: number) => {
    const m = part(new SphereGeometry(1, 10, 8).scale(0.28 * s, 0.6 * s, 0.1), 'leaf');
    m.position.set(Math.sin(-rz) * 0.5 * s, 0.75 + Math.cos(rz) * 0.55 * s, 0);
    m.rotation.z = rz;
    return m;
  };
  return facing(group(pot, soil, leaf(0.6, 1), leaf(-0.5, 1.2), leaf(0.05, 0.8)), 0.3);
}

/** i-paintings: latte frame, sky canvas, leaf hills and a honey sun. */
export function paintings(): Group {
  const frame = part(box(1.8, 1.5, 0.14, 0.06), 'latte');
  const canvas = at(part(box(1.45, 1.15, 0.04, 0.02), 'sky', { outline: false }), 0, 0, 0.07);
  const hill = at(part(extrude(polygon([[-0.72, -0.57], [-0.2, 0.05], [0.15, -0.2], [0.45, 0.0], [0.72, -0.3], [0.72, -0.57]]), 0.02, 0.01), 'leaf', { outline: false }), 0, 0, 0.1);
  const sun = at(part(disc(0.16, 0.04, 14), 'honey', { outline: false }), 0.4, 0.3, 0.11);
  const g = group(frame, canvas, hill, sun);
  g.position.y = 0.95;
  return facing(group(g), 0.3);
}

/** i-lights: pendant lamp, honey shade on a cord, warm bulb below. */
export function lights(): Group {
  // The bulb hangs below the rim so it shows from the 30° camera.
  const shade = part(new LatheGeometry([new Vector2(0, 0), new Vector2(0.7, 0), new Vector2(0.55, 0.2), new Vector2(0.25, 0.5), new Vector2(0.1, 0.58), new Vector2(0, 0.58)], 16), 'honey');
  shade.position.y = 0.55;
  const bulb = at(part(new SphereGeometry(0.34, 14, 10), 'honeyLight'), 0, 0.36);
  const cord = at(part(new CylinderGeometry(0.05, 0.05, 0.7, 6), 'coffeeDark'), 0, 1.45);
  return group(shade, bulb, cord);
}

/** i-window-bar: window with cream mullions over a latte bar shelf. */
export function windowBar(): Group {
  const frame = at(part(box(1.8, 1.5, 0.12, 0.06), 'cream'), 0, 1.25);
  const panes = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => at(part(box(0.72, 0.6, 0.04, 0.03), 'sky', { outline: false }), sx * 0.42, 1.25 + sy * 0.34, 0.07)));
  const bar = at(part(box(2.1, 0.16, 0.6, 0.05), 'latte'), 0, 0.42, 0.2);
  const legs = [-0.85, 0.85].map((x) => at(part(box(0.1, 0.4, 0.1, 0.03), 'coffee'), x, 0.17, 0.3));
  return facing(group(frame, ...panes, bar, ...legs), 0.3);
}

// Marketing: hand-held things with a shared berry accent.

/** i-flyer: cream sheet with a folded corner and a berry block. */
export function flyer(): Group {
  const sheet = part(extrude(polygon([[-0.6, -0.8], [0.6, -0.8], [0.6, 0.45], [0.25, 0.8], [-0.6, 0.8]]), 0.06, 0.02), 'cream');
  const fold = at(part(extrude(polygon([[0.25, 0.45], [0.6, 0.45], [0.25, 0.8]]), 0.04, 0.01), 'creamDeep'), 0, 0, 0.05);
  const block = at(part(box(0.8, 0.45, 0.04, 0.04), 'coral', { outline: false }), -0.05, 0.0, 0.05);
  const line = at(part(box(0.6, 0.08, 0.02, 0.02), 'ink', { outline: false }), -0.15, -0.5, 0.05);
  const g = group(sheet, fold, block, line);
  g.position.y = 0.85;
  g.rotation.z = -0.12;
  return facing(group(g));
}

/** i-happy-hour: alarm clock with berry bells. */
export function happyHour(): Group {
  const face = clockFace(0.95);
  const bells = [-1, 1].map((s) => {
    const b = at(part(new SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'coral'), s * 0.6, 1.62, -0.05);
    b.rotation.z = -s * 0.5;
    return b;
  });
  const legs = [-1, 1].map((s) => at(part(box(0.1, 0.3, 0.1, 0.03), 'coffee'), s * 0.5, 0.12));
  return facing(group(face, ...bells, ...legs));
}

/** i-social: phone with a berry heart on its screen. */
export function social(): Group {
  const body = part(box(1.0, 1.75, 0.16, 0.14), 'sky');
  const screen = at(part(box(0.8, 1.35, 0.03, 0.06), 'cream', { outline: false }), 0, 0.05, 0.09);
  const heart = group(
    at(part(new SphereGeometry(0.15, 10, 8), 'coral', { outline: false }), -0.12, 0.17, 0.12),
    at(part(new SphereGeometry(0.15, 10, 8), 'coral', { outline: false }), 0.12, 0.17, 0.12),
    at(part(new ConeGeometry(0.255, 0.34, 10).rotateX(Math.PI), 'coral', { outline: false }), 0, -0.05, 0.12),
  );
  const g = group(body, screen, heart);
  g.position.y = 0.9;
  return facing(group(g));
}

/** i-kol: berry microphone on a stand. */
export function kol(): Group {
  const head = at(part(new CylinderGeometry(0.32, 0.32, 0.7, 14), 'coral'), 0, 1.5);
  const capTop = at(part(new SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'coral'), 0, 1.85);
  const capBottom = at(part(new SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'coral'), 0, 1.15);
  const yoke = at(part(new TorusGeometry(0.45, 0.05, 6, 14, Math.PI).rotateZ(Math.PI), 'creamDeep'), 0, 1.35);
  const stem = at(part(new CylinderGeometry(0.06, 0.06, 0.6, 6), 'creamDeep'), 0, 0.6);
  const foot = at(part(new CylinderGeometry(0.45, 0.5, 0.1, 14), 'creamDeep'), 0, 0.05);
  return group(head, capTop, capBottom, yoke, stem, foot);
}

// Staff roles: the tool of the job on a shared round badge.

/** i-cup-hot: latte mug with steam (barista, hot drinks). */
export function cupHot(): Group {
  const mug = at(part(lathe([[0, 0], [0.45, 0], [0.5, 0.75], [0, 0.75]]), 'latte'), 0, 0.2);
  const coffee = at(part(new CylinderGeometry(0.42, 0.42, 0.03, 14), 'coffeeDark', { outline: false }), 0, 0.96);
  return group(badgeBase(), mug, coffee, handle(0.52, 0.58, 0.2, 'latte'), steam(0, 1.05, 0, 0.6));
}

/** i-role-server: sky cloche on a tray. */
export function roleServer(): Group {
  const tray = at(part(new CylinderGeometry(0.82, 0.82, 0.1, 20), 'cream'), 0, 0.25);
  const dome = at(part(new SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'sky'), 0, 0.3);
  const knob = at(part(new SphereGeometry(0.14, 8, 6), 'sky'), 0, 1.08);
  return group(badgeBase(), tray, dome, knob);
}

/** i-role-cleaner: leaning broom, latte handle, honey bristles. */
export function roleCleaner(): Group {
  const broom = group(
    at(part(new CylinderGeometry(0.09, 0.09, 1.5, 8), 'latte'), 0, 1.35),
    at(part(box(0.75, 0.18, 0.32, 0.06), 'coffee'), 0, 0.62),
    at(part(new CylinderGeometry(0.36, 0.62, 0.62, 4).rotateY(Math.PI / 4).scale(1, 1, 0.5), 'honey'), 0, 0.3),
  );
  broom.rotation.z = -0.4;
  broom.position.set(0.15, 0.1, 0);
  return facing(group(badgeBase(), broom), 0.3);
}

/** i-chef: puffy cream chef hat with a band. */
export function chef(): Group {
  const band = at(part(new CylinderGeometry(0.5, 0.48, 0.45, 16), 'cream'), 0, 0.45);
  const line = at(part(new CylinderGeometry(0.505, 0.505, 0.08, 16), 'creamDeep', { outline: false }), 0, 0.5);
  const puffs = (
    [
      [0, 1.05, 0, 0.48],
      [-0.38, 0.92, 0.05, 0.36],
      [0.38, 0.92, 0.05, 0.36],
    ] as const
  ).map(([x, y, z, r]) => at(part(new SphereGeometry(r, 14, 10), 'cream'), x, y, z));
  return group(badgeBase(), band, line, ...puffs);
}

// Day phases.

/** i-phase-prep: latte basket with a handle. */
export function phasePrep(): Group {
  const basket = part(lathe([[0, 0], [0.55, 0], [0.8, 0.6], [0, 0.6]], 12), 'latte');
  const rim = at(part(new TorusGeometry(0.8, 0.06, 6, 16).rotateX(Math.PI / 2), 'coffee'), 0, 0.6);
  const grip = at(part(new TorusGeometry(0.6, 0.06, 6, 14, Math.PI), 'coffee'), 0, 0.6);
  const bread = at(part(new SphereGeometry(1, 10, 8).scale(0.35, 0.2, 0.22), 'honeyDeep'), -0.2, 0.68, 0.1);
  return group(basket, rim, grip, bread);
}

/** i-phase-open: shop door with a cream sign and a knob. */
export function phaseOpen(): Group {
  const door = at(part(box(1.1, 1.75, 0.16, 0.08), 'latte'), 0, 0.875);
  const sign = at(part(box(0.62, 0.32, 0.05, 0.04), 'cream'), 0, 1.35, 0.1);
  const knob = at(inkDot(0.08), 0.35, 0.8, 0.1);
  const step = at(part(box(1.5, 0.08, 0.6, 0.03), 'creamDeep'), 0, 0.04, 0.1);
  return facing(group(door, sign, knob, step), 0.3);
}

/** i-flame: berry flame with a honey core in front, both thick flat shapes like the SVG. */
export function flame(): Group {
  const outer = polygon([
    [0, 1.75], [0.25, 1.2], [0.6, 0.85], [0.7, 0.45], [0.5, 0.1], [0, 0],
    [-0.5, 0.1], [-0.7, 0.45], [-0.55, 0.95], [-0.3, 0.85], [-0.2, 1.25],
  ]);
  const inner = polygon([[0, 1.0], [0.32, 0.55], [0.36, 0.25], [0.2, 0.08], [0, 0.05], [-0.2, 0.08], [-0.36, 0.25], [-0.3, 0.6]]);
  return facing(group(part(extrude(outer, 0.36, 0.07), 'coral'), at(part(extrude(inner, 0.16, 0.05), 'honey'), 0, 0.02, 0.24)), 0.3);
}

/** Crescent: the circle of radius `r` at the origin minus the circle of radius `rc` at (cx, cy). */
function crescent(r: number, cx: number, cy: number, rc: number): Shape {
  const d = Math.hypot(cx, cy);
  const toCut = Math.atan2(cy, cx);
  // Half the angle, seen from the origin, between the two points where the circles cross.
  const half = Math.acos((r * r + d * d - rc * rc) / (2 * r * d));
  const p = (a: number) => [Math.cos(a) * r - cx, Math.sin(a) * r - cy] as const;
  const b0 = Math.atan2(p(toCut - half)[1], p(toCut - half)[0]);
  let b1 = Math.atan2(p(toCut + half)[1], p(toCut + half)[0]);
  // The cut edge runs through the side of the small circle that faces the origin.
  while (b1 < b0) b1 += Math.PI * 2;
  const back = toCut + Math.PI;
  const mid = (b0 + b1) / 2;
  const [i0, i1] = Math.abs(Math.atan2(Math.sin(mid - back), Math.cos(mid - back))) < Math.PI / 2 ? [b0, b1] : [b0, b1 - Math.PI * 2];
  return polygon([...arc(0, 0, r, toCut + half, toCut + Math.PI * 2 - half, 18), ...arc(cx, cy, rc, i0, i1, 12).slice(1, -1)]);
}

/** i-phase-close: honey crescent moon. */
export function phaseClose(): Group {
  const g = group(part(extrude(crescent(0.85, 0.42, 0.3, 0.72), 0.36, 0.07), 'honey'));
  g.position.y = 0.9;
  return facing(group(g));
}

/** i-easy: sprout with two leaves in a soil mound. */
export function easy(): Group {
  const soil = part(new SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), 'coffee');
  const stem = at(part(new CylinderGeometry(0.06, 0.07, 0.8, 6), 'leaf'), 0, 0.6);
  const leaf = (s: number) => {
    const m = part(new SphereGeometry(1, 10, 8).scale(0.42, 0.1, 0.22), 'leaf');
    m.position.set(s * 0.36, 0.95 + (s > 0 ? 0.1 : 0), 0);
    m.rotation.z = s * 0.45;
    return m;
  };
  return group(soil, stem, leaf(-1), leaf(1));
}

/** i-cold: chunky sky snowflake. */
export function cold(): Group {
  const g = group();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    g.add(stroke([[-c * 0.85, -s * 0.85], [c * 0.85, s * 0.85]], 0.11, 'sky'));
    for (const end of [-1, 1]) {
      const [ex, ey] = [end * c * 0.55, end * s * 0.55];
      const b = a + (end > 0 ? 0 : Math.PI);
      for (const side of [-1, 1]) {
        const t = b + side * 0.7;
        g.add(stroke([[ex, ey], [ex + Math.cos(t) * 0.28, ey + Math.sin(t) * 0.28]], 0.08, 'sky'));
      }
    }
  }
  g.position.y = 0.95;
  return facing(group(g));
}
