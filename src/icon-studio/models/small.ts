/**
 * Simpler models for the 24 px cell of icons that sit alone in a HUD button,
 * where the 48 px model turns into a blob at 16 px: straight on (`glyph`),
 * fewer and fatter parts, ink marks instead of same-hue ones, no cream body
 * on the cream HUD.
 */
import { type Object3D, TorusGeometry } from 'three';
import { part } from '../style';
import { glyph, slab } from './glyphs';
import { gear } from './hud';
import { at, box, disc, polygon, roundRect, triangle } from './shapes';

/** Just in front of a glyph slab's face (glyphs.ts DEPTH / 2 plus the bevel), where marks sit. */
const FRONT = 0.26;

/** i-coin: honey token seen straight on, ink ring and bar like the SVG. */
export function coin(): Object3D {
  const ring = at(part(new TorusGeometry(0.56, 0.1, 6, 24), 'ink', { outline: false }), 0, 0, FRONT);
  const bar = at(part(box(0.22, 0.66, 0.12, 0.04), 'ink', { outline: false }), 0, 0, FRONT);
  return glyph(part(disc(0.92, 0.5, 28), 'honey'), ring, bar);
}

/** i-camera: sky body and hood straight on, one big cream lens with an ink pupil. */
export function camera(): Object3D {
  const body = slab(roundRect(1.3, 1.0, 0.18, -0.3, 0), 'sky');
  const hood = slab(polygon([[0.3, -0.2], [1.0, -0.5], [1.0, 0.5], [0.3, 0.2]]), 'sky');
  const lens = at(part(disc(0.32, 0.12, 18), 'cream'), -0.3, 0, FRONT);
  const pupil = at(part(disc(0.15, 0.06, 12), 'ink', { outline: false }), -0.3, 0, FRONT + 0.06);
  return glyph(body, hood, lens, pupil);
}

/** i-close: coral X inside the ink band, so it never melts into the cream HUD (an ink body merged with the band into a blob). */
export function close(): Object3D {
  const w = 0.22;
  const l = 0.85;
  const cross = polygon([
    [w, l], [w, w], [l, w], [l, -w], [w, -w], [w, -l],
    [-w, -l], [-w, -w], [-l, -w], [-l, w], [-w, w], [-w, l],
  ]);
  return glyph(at(slab(cross, 'coral'), 0, 0, 0, Math.PI / 4));
}

/** i-settings: six fat teeth straight on, an ink hole in the middle. */
export function settings(): Object3D {
  return glyph(slab(gear(6, 0.66, 0.98), 'sky'), at(part(disc(0.3, 0.1, 16), 'ink', { outline: false }), 0, 0, FRONT));
}

/** i-pause: the two bars further apart, so ink shows between them. */
export const pause = () => glyph(slab(roundRect(0.52, 1.6, 0.16, -0.48), 'honey'), slab(roundRect(0.52, 1.6, 0.16, 0.48), 'honey'));

/** i-speed-4: three taller arrow heads, still three. */
export const speed4 = () =>
  glyph(slab(triangle(0.75, 1.25, -0.72), 'mint'), slab(triangle(0.75, 1.25, 0), 'mint'), slab(triangle(0.75, 1.25, 0.72), 'mint'));
