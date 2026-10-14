/**
 * Control, status and feedback symbols, shot straight on (`glyph` pose).
 * Shapes lie in the XY plane, thick like candy, front towards +Z.
 * Colour follows the SVG meaning and every state also has its own shape.
 */
import { Group, type Object3D, type Shape, SphereGeometry } from 'three';
import { type PaletteKey, part, posed } from '../style';
import { arc, arrowShape, at, disc, extrude, group, inkDot, polygon, roundRect, star, stroke, triangle } from './shapes';

type Pt = readonly [number, number];

const DEPTH = 0.36;

function slab(shape: Shape, color: PaletteKey, depth = DEPTH): Object3D {
  return part(extrude(shape, depth, 0.07), color);
}

const glyph = (...parts: Object3D[]) => posed('glyph', group(...parts));

/** Arrow head (triangle) at (x, y) pointing along angle `a`. */
function head(x: number, y: number, a: number, color: PaletteKey): Object3D {
  return at(slab(triangle(0.5, 0.56), color, 0.3), x, y, 0, a);
}

/** Front face of a round token of radius `r`, for marks drawn on top of it. */
const FRONT = DEPTH / 2 + 0.08;

function token(color: PaletteKey, r = 0.9): Object3D {
  return part(disc(r, DEPTH, 28), color);
}

/** Ink line on the front of a token. */
function mark(points: readonly Pt[], r = 0.11): Group {
  return stroke(points, r, 'ink', { z: FRONT, outline: false });
}

export const pause = () => glyph(slab(roundRect(0.5, 1.6, 0.16, -0.4), 'honey'), slab(roundRect(0.5, 1.6, 0.16, 0.4), 'honey'));

export const speed1 = () => glyph(slab(triangle(1.3, 1.5), 'mint'));

export const speed2 = () => glyph(slab(triangle(0.95, 1.2, -0.48), 'mint'), slab(triangle(0.95, 1.2, 0.48), 'mint'));

export const speed4 = () =>
  glyph(slab(triangle(0.72, 0.95, -0.78), 'mint'), slab(triangle(0.72, 0.95, 0), 'mint'), slab(triangle(0.72, 0.95, 0.78), 'mint'));

/** i-close: neutral cream X (berry stays for delete and error). */
export function close(): Group {
  const w = 0.2;
  const l = 0.85;
  const cross = polygon([
    [w, l], [w, w], [l, w], [l, -w], [w, -w], [w, -l],
    [-w, -l], [-w, -w], [-l, -w], [-l, w], [-w, w], [-w, l],
  ]);
  return glyph(at(slab(cross, 'cream'), 0, 0, 0, Math.PI / 4));
}

const arrow = () => slab(arrowShape(1.8, 0.4, 1.1, 0.7), 'cream');
export const back = () => glyph(at(arrow(), 0, 0, 0, Math.PI));
export const forward = () => glyph(arrow());

export const check = () => glyph(stroke([[-0.7, 0.05], [-0.2, -0.45], [0.75, 0.55]], 0.19, 'mint'));

export const equal = () => glyph(slab(roundRect(1.5, 0.34, 0.15, 0, 0.3), 'cream'), slab(roundRect(1.5, 0.34, 0.15, 0, -0.3), 'cream'));

export const chevronDown = () => glyph(stroke([[-0.65, 0.3], [0, -0.35], [0.65, 0.3]], 0.19, 'cream'));

/** i-retry: two half-circle arrows chasing each other. */
export function retry(): Group {
  const r = 0.7;
  const a = [-0.25, Math.PI - 0.6] as const;
  const b = [Math.PI - 0.25, 2 * Math.PI - 0.6] as const;
  const end = (t: number) => [Math.cos(t) * r, Math.sin(t) * r] as const;
  return glyph(
    stroke(arc(0, 0, r, a[0], a[1]), 0.15, 'cream'),
    head(...end(a[1]), a[1] + Math.PI / 2, 'cream'),
    stroke(arc(0, 0, r, b[0], b[1]), 0.15, 'cream'),
    head(...end(b[1]), b[1] + Math.PI / 2, 'cream'),
  );
}

/** i-reset: one almost full turn back, arrow head at the upper left. */
export function reset(): Group {
  const r = 0.72;
  const [a0, a1] = [-Math.PI + 0.5, Math.PI - 0.6];
  return glyph(stroke(arc(0, 0, r, a0, a1, 14), 0.15, 'cream'), head(Math.cos(a1) * r, Math.sin(a1) * r, a1 + Math.PI / 2, 'cream'));
}

export const ok = () => glyph(token('mint'), mark([[-0.38, 0.02], [-0.1, -0.28], [0.4, 0.3]]));

export const error = () => glyph(token('coral'), mark([[-0.42, 0], [0.42, 0]]));

export function warning(): Group {
  const tri = polygon([[-0.95, -0.78], [0.95, -0.78], [0, 0.88]]);
  const bang = mark([[0, 0.3], [0, -0.15]], 0.1);
  const point = at(inkDot(0.11), 0, -0.45, FRONT);
  return glyph(slab(tri, 'honey'), bang, point);
}

export const info = () => glyph(token('sky'), mark([[0, 0.05], [0, -0.45]], 0.11), at(inkDot(0.12), 0, 0.38, FRONT));

export const trendUp = () => glyph(slab(polygon([[-0.85, -0.6], [0.85, -0.6], [0, 0.8]]), 'mint'));
export const trendDown = () => glyph(slab(polygon([[-0.85, 0.6], [0, -0.8], [0.85, 0.6]]), 'coral'));

export const starFull = () => glyph(slab(star(5, 0.98, 0.45), 'honey'));
export const starEmpty = () => glyph(slab(star(5, 0.98, 0.45), 'creamDeep'));

const bead = (color: PaletteKey) => part(new SphereGeometry(0.55, 16, 12).scale(1, 1, 0.6), color);
export const dot = () => glyph(bead('honey'));
export const dotEmpty = () => glyph(bead('creamDeep'));

export const todo = () => glyph(slab(roundRect(1.5, 1.5, 0.36), 'cream'));

export const free = () => glyph(token('mint', 0.75), at(part(disc(0.28, 0.2, 18), 'cream'), 0, 0, FRONT - 0.05));

/** i-rest: three Zs, small to big. */
export function rest(): Group {
  const z = (x: number, y: number, s: number) =>
    stroke([[x - s / 2, y + s / 2], [x + s / 2, y + s / 2], [x - s / 2, y - s / 2], [x + s / 2, y - s / 2]], 0.09 + s * 0.04, 'sky');
  return glyph(z(-0.55, -0.05, 0.6), z(0.05, 0.6, 0.42), z(0.55, -0.45, 0.8));
}

export const sparkle = () => glyph(at(slab(star(4, 0.95, 0.3), 'honey'), -0.2, -0.1), at(slab(star(4, 0.42, 0.14), 'honey'), 0.72, 0.62));

/** Hand with the thumb up and a cream cuff on the left; i-thumb-down is the same hand turned over. */
function hand(color: PaletteKey): Group {
  return group(
    at(slab(roundRect(1.0, 1.0, 0.3), color), 0.18, -0.3),
    stroke([[0.0, 0.1], [0.1, 0.85]], 0.2, color, { z: 0.02 }),
    at(slab(roundRect(0.42, 1.15, 0.14), 'cream'), -0.55, -0.3),
  );
}

export const thumbUp = () => glyph(hand('mint'));
export const thumbDown = () => glyph(at(hand('coral'), 0, 0, 0, Math.PI));

/** Customer face: a candy ball with ink features that differ in shape, not only in colour. */
const BALL = 0.9;
const BALL_DEPTH = 0.62;

function onBall(x: number, y: number): number {
  return BALL_DEPTH * Math.sqrt(Math.max(1 - (x * x + y * y) / (BALL * BALL), 0)) + 0.03;
}

function face(color: PaletteKey, eyesY: number, mouth: readonly Pt[], brows?: readonly [Pt, Pt][]): Group {
  const g = glyph(part(new SphereGeometry(BALL, 18, 14).scale(1, 1, BALL_DEPTH / BALL), color));
  for (const x of [-0.32, 0.32]) g.add(at(inkDot(0.11), x, eyesY, onBall(x, eyesY)));
  const line = (pts: readonly Pt[]) => g.add(stroke(pts, 0.07, 'ink', { z: Math.max(...pts.map(([x, y]) => onBall(x, y))), outline: false }));
  line(mouth);
  for (const b of brows ?? []) line(b);
  return g;
}

export const faceHappy = () => face('mint', 0.18, arc(0, -0.05, 0.36, Math.PI + 0.35, 2 * Math.PI - 0.35, 6));
export const faceOk = () => face('honey', 0.18, [[-0.3, -0.3], [0.3, -0.3]]);

export function faceWorried(): Group {
  const g = face('tangerine', 0.1, arc(0, -0.62, 0.36, 0.5, Math.PI - 0.5, 6), [
    [[-0.5, 0.42], [-0.18, 0.32]],
    [[0.5, 0.42], [0.18, 0.32]],
  ]);
  const drop = part(new SphereGeometry(0.17, 10, 8).scale(1, 1.4, 0.8), 'sky');
  g.add(at(drop, 0.78, 0.72, 0.15));
  return g;
}

export const faceAngry = () =>
  face('coral', 0.05, arc(0, -0.72, 0.4, 0.6, Math.PI - 0.6, 6), [
    [[-0.55, 0.4], [-0.15, 0.22]],
    [[0.55, 0.4], [0.15, 0.22]],
  ]);
