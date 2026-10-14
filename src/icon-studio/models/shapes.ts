/** Geometry helpers shared by the icon models. Everything is low-poly on purpose. */
import { ExtrudeGeometry, Shape, Vector2 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
export function polygon(points: readonly (readonly [number, number])[]): Shape {
  return new Shape(points.map(([x, y]) => new Vector2(x, y)));
}
