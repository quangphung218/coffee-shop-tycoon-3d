/** Geometry helpers shared by the icon models. Everything is low-poly on purpose. */
import {
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  type Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, type PaletteKey } from '../style';

type Pt = readonly [number, number];

/** Turn (rad) that points a model's +Z front most of the way at the `object` camera, keeping some side in view. */
export const FACE = 0.45;

export function group(...parts: Object3D[]): Group {
  const g = new Group();
  if (parts.length) g.add(...parts);
  return g;
}

/** Moves `o` to (x, y, z) and, when `rz` is given, turns it about Z. */
export function at<T extends Object3D>(o: T, x: number, y: number, z = 0, rz?: number): T {
  o.position.set(x, y, z);
  if (rz !== undefined) o.rotation.z = rz;
  return o;
}

/** Turns a mostly flat model towards the `object` camera. */
export function facing<T extends Object3D>(o: T, turn = FACE): T {
  o.rotation.y = turn;
  return o;
}

/** A flat shape given thickness `depth` along Z, centred on z = 0, with a soft bevel. */
export function extrude(shape: Shape, depth: number, bevel = 0.05): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Box with rounded edges, centred on the origin. */
export function box(w: number, h: number, d: number, r = 0.06): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
}

/** Closed polygon from points. */
export function polygon(points: readonly Pt[]): Shape {
  return new Shape(points.map(([x, y]) => new Vector2(x, y)));
}

/** Circle of radius `r` centred on (x, y). */
export function circle(r: number, x = 0, y = 0): Shape {
  const s = new Shape();
  s.absarc(x, y, r, 0, Math.PI * 2, false);
  return s;
}

/** Rectangle `w` × `h` with corner radius `r`, centred on (x, y). */
export function roundRect(w: number, h: number, r: number, x = 0, y = 0): Shape {
  const [l, b] = [x - w / 2, y - h / 2];
  const k = Math.min(r, w / 2, h / 2);
  const s = new Shape();
  s.moveTo(l + k, b);
  s.lineTo(l + w - k, b);
  s.quadraticCurveTo(l + w, b, l + w, b + k);
  s.lineTo(l + w, b + h - k);
  s.quadraticCurveTo(l + w, b + h, l + w - k, b + h);
  s.lineTo(l + k, b + h);
  s.quadraticCurveTo(l, b + h, l, b + h - k);
  s.lineTo(l, b + k);
  s.quadraticCurveTo(l, b, l + k, b);
  return s;
}

/** `n`-pointed star with tips at radius `outer` and notches at `inner`, first tip straight up. */
export function star(n: number, outer: number, inner: number): Shape {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return polygon(pts);
}

/** Triangle pointing to +X with its centre on (x, y), rounded by the extrude bevel. */
export function triangle(w: number, h: number, x = 0, y = 0): Shape {
  return polygon([
    [x - w / 2, y - h / 2],
    [x + w / 2, y],
    [x - w / 2, y + h / 2],
  ]);
}

/** Solid of revolution from (radius, y) pairs; start and end on the axis to close it. */
export function lathe(profile: readonly Pt[], segments = 14): LatheGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
}

/** Cylinder whose axis runs along Z, so its round face looks at the front. */
export function disc(r: number, depth: number, segments = 24): CylinderGeometry {
  return new CylinderGeometry(r, r, depth, segments).rotateX(Math.PI / 2);
}

/** Points on an arc around (cx, cy) from angle a0 to a1 (rad), for `stroke`. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 8): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  });
}

/** Thick round stroke through 2D points in the XY plane at depth `z`: one capsule per segment, like a candy rope. */
export function stroke(points: readonly Pt[], r: number, color: PaletteKey, opts: { z?: number; outline?: boolean } = {}): Group {
  const g = new Group();
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    const m = part(new CapsuleGeometry(r, len, 3, 10), color, { outline: opts.outline });
    m.position.set((ax + bx) / 2, (ay + by) / 2, opts.z ?? 0);
    m.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
    g.add(m);
  }
  return g;
}

/** Arrow `len` long pointing to +X, centred on the origin: shaft plus head, flat in XY. */
export function arrowShape(len: number, shaft: number, head: number, headLen: number): Shape {
  const x0 = -len / 2;
  const x1 = len / 2 - headLen;
  return polygon([
    [x0, -shaft / 2],
    [x1, -shaft / 2],
    [x1, -head / 2],
    [len / 2, 0],
    [x1, head / 2],
    [x1, shaft / 2],
    [x0, shaft / 2],
  ]);
}

/** Two wavy wisps of steam, cream, rising from (x, y, z). */
export function steam(x: number, y: number, z: number, height = 0.6): Group {
  const g = new Group();
  for (const dx of [-0.17, 0.17]) {
    const pts: Pt[] = [0, 1, 2, 3].map((i) => [dx + Math.sin(i * 1.7) * 0.07, (i * height) / 3] as const);
    g.add(stroke(pts, 0.055, 'cream'));
  }
  g.position.set(x, y, z);
  return g;
}

/** Ice cube with a light streak, side `s`, centred on its own origin. */
export function iceCube(s: number): Group {
  const g = new Group();
  g.add(part(box(s, s, s, s * 0.22), 'skyLight'));
  const shine = part(box(s * 0.12, s * 0.5, 0.02, 0.01), 'cream', { outline: false });
  shine.position.set(-s * 0.25, s * 0.05, s / 2 + 0.01);
  g.add(shine);
  return g;
}

/** Saucer (low cream disc) standing on y = 0. */
export function saucer(r: number): Object3D {
  return part(lathe([[0, 0], [r * 0.7, 0], [r, 0.1], [r * 0.95, 0.14], [0, 0.1]], 20), 'cream');
}

/** Mug handle: a ring in the XY plane at (x, y), half sunk into the cup wall. */
export function handle(x: number, y: number, r = 0.24, color: PaletteKey = 'cream'): Object3D {
  const h = part(new TorusGeometry(r, 0.07, 6, 14), color);
  h.position.set(x, y, 0);
  return h;
}

/** Ink bead without outline, for eyes and small marks. */
export function inkDot(r: number): Object3D {
  return part(new SphereGeometry(r, 8, 6), 'ink', { outline: false });
}

/** Flat round badge (cream-200) that role icons stand on, so they read as one set. */
export function badgeBase(r = 0.95): Object3D {
  return part(lathe([[0, 0], [r, 0], [r, 0.14], [r * 0.92, 0.2], [0, 0.2]], 24), 'creamDeep');
}
