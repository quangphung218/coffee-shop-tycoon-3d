/** HUD and navigation icons. Models stand on y = 0 and face +Z. */
import { CylinderGeometry, Group, Shape, SphereGeometry } from 'three';
import { part } from '../style';
import { box, extrude, polygon } from './shapes';

/** i-menu: plate standing up between a fork and a knife. */
export function menu(): Group {
  const g = new Group();
  const plate = part(new CylinderGeometry(0.66, 0.66, 0.14, 20).rotateX(Math.PI / 2), 'honey');
  plate.position.set(0, 0.8, 0);
  const well = part(new CylinderGeometry(0.4, 0.44, 0.06, 20).rotateX(Math.PI / 2), 'cream');
  well.position.set(0, 0.8, 0.09);
  g.add(plate, well);

  const fork = new Group();
  const handle = part(box(0.14, 1.0, 0.1, 0.05), 'cream');
  handle.position.y = 0.5;
  const neck = part(box(0.4, 0.14, 0.1, 0.04), 'cream');
  neck.position.y = 1.05;
  fork.add(handle, neck);
  for (const x of [-0.14, 0, 0.14]) {
    const tine = part(box(0.08, 0.42, 0.08, 0.03), 'cream');
    tine.position.set(x, 1.3, 0);
    fork.add(tine);
  }
  fork.position.x = -1.0;

  const knife = new Group();
  const grip = part(box(0.16, 0.7, 0.1, 0.05), 'cream');
  grip.position.y = 0.35;
  const blade = part(extrude(polygon([[-0.1, 0], [0.12, 0], [0.12, 0.62], [0, 0.92], [-0.1, 0.8]]), 0.04, 0.03), 'cream');
  blade.position.y = 0.72;
  knife.add(grip, blade);
  knife.position.x = 1.0;

  g.add(fork, knife);
  return g;
}

/** i-inventory: taped cardboard crate. */
export function inventory(): Group {
  const g = new Group();
  const crate = part(box(1.5, 1.05, 1.2, 0.07), 'latte');
  crate.position.y = 0.525;
  const tapeTop = part(box(0.34, 0.03, 1.23, 0.01), 'cream', { outline: false });
  tapeTop.position.y = 1.06;
  const tapeFront = part(box(0.34, 0.4, 0.03, 0.01), 'cream', { outline: false });
  tapeFront.position.set(0, 0.86, 0.61);
  const label = part(box(0.5, 0.3, 0.03, 0.02), 'creamDeep', { outline: false });
  label.position.set(-0.4, 0.38, 0.61);
  g.add(crate, tapeTop, tapeFront, label);
  return g;
}

/** i-upgrades: arrow sign on a post. */
export function upgrades(): Group {
  const g = new Group();
  const base = part(new CylinderGeometry(0.34, 0.4, 0.14, 12), 'coffee');
  base.position.y = 0.07;
  const post = part(new CylinderGeometry(0.09, 0.09, 1.6, 8), 'latte');
  post.position.y = 0.85;
  const sign = part(extrude(polygon([[-0.7, -0.3], [0.45, -0.3], [0.8, 0], [0.45, 0.3], [-0.7, 0.3]]), 0.16), 'sky');
  sign.position.set(0.12, 1.35, 0.12);
  const stripe = part(box(0.75, 0.1, 0.02, 0.02), 'cream', { outline: false });
  stripe.position.set(0.0, 1.35, 0.33);
  g.add(base, post, sign, stripe);
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
  const g = new Group();
  const bubble = part(extrude(s, 0.3, 0.06).translate(-w / 2, 0, 0), 'sky');
  g.add(bubble);
  for (const x of [-0.42, 0, 0.42]) {
    const dot = part(new SphereGeometry(0.13, 10, 8).scale(1, 1, 0.6), 'ink', { outline: false });
    dot.position.set(x, b + h / 2, 0.21);
    g.add(dot);
  }
  return g;
}

/** i-pause: two chunky bars. */
export function pause(): Group {
  const g = new Group();
  for (const x of [-0.38, 0.38]) {
    const bar = part(box(0.46, 1.5, 0.46, 0.14), 'honey');
    bar.position.set(x, 0.75, 0);
    g.add(bar);
  }
  return g;
}

/** i-close: one chunky X. */
export function close(): Group {
  const w = 0.2;
  const l = 0.85;
  const cross = polygon([
    [w, l], [w, w], [l, w], [l, -w], [w, -w], [w, -l],
    [-w, -l], [-w, -w], [-l, -w], [-l, w], [-w, w], [-w, l],
  ]);
  const x = part(extrude(cross, 0.34, 0.07).rotateZ(Math.PI / 4), 'coral');
  x.position.y = 0.9;
  const g = new Group();
  g.add(x);
  return g;
}
