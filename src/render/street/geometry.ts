import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CENTER_LINE_Z,
  CURB_HEIGHT,
  FAR_WALK,
  NEAR_WALK,
  ROAD,
  STREET_HALF,
  type VehicleKind,
} from './layout';

/**
 * Low-poly street geometry with baked vertex colours, drawn with the shop's
 * shared flat Lambert material. Vehicle and building "body" parts are white
 * so the per-instance colour tints them; "detail" parts (glass, wheels) keep
 * their own colours in a second InstancedMesh with the same matrices.
 */

export const STREET_PALETTE = {
  asphalt: 0x5d6470,
  line: 0xfff9f0,
  centre: 0xf2c14e,
  walk: 0xe6dccb,
  walkFar: 0xdcd3c4,
  curb: 0xbfb6a8,
  glass: 0x9fd3ea,
  glassDark: 0x4a6a8a,
  tyre: 0x2a211c,
  headlight: 0xfff3c4,
  tail: 0xe05a4f,
  trunk: 0x8a5a3b,
  leaf: 0x3fa66b,
  leafLight: 0x6cc36f,
  pole: 0x4a4f55,
  white: 0xffffff,
  roof: 0xd6d0c8,
  awning: 0xe07a5f,
  rider: 0x3b4a6b,
  helmet: 0xf7f3ea,
} as const;

const tmp = new Color();

/** Bakes a transform and a flat colour into a primitive so parts can be merged. */
function part(geo: BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, rz = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  tmp.set(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  // UVs kept so SHARED_MATERIAL's grain map has coordinates on the street too.
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('street: could not merge geometry');
  merged.computeBoundingSphere();
  return merged;
}

const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);
const wheel = (r: number, w: number): BufferGeometry => new CylinderGeometry(r, r, w, 10);

/** Road, kerbs, sidewalks, lane markings and a zebra crossing in front of the shop: one static mesh. */
export function roadGeometry(): BufferGeometry {
  const length = STREET_HALF * 2 + 30;
  const roadW = ROAD.maxZ - ROAD.minZ;
  const parts: BufferGeometry[] = [
    part(box(length, 0.04, roadW), STREET_PALETTE.asphalt, 0, -0.02, (ROAD.minZ + ROAD.maxZ) / 2),
    part(box(length, CURB_HEIGHT, NEAR_WALK.maxZ - NEAR_WALK.minZ), STREET_PALETTE.walk, 0, CURB_HEIGHT / 2 - 0.001, (NEAR_WALK.minZ + NEAR_WALK.maxZ) / 2),
    part(box(length, CURB_HEIGHT, FAR_WALK.maxZ - FAR_WALK.minZ), STREET_PALETTE.walkFar, 0, CURB_HEIGHT / 2 - 0.001, (FAR_WALK.minZ + FAR_WALK.maxZ) / 2),
    part(box(length, CURB_HEIGHT + 0.03, 0.22), STREET_PALETTE.curb, 0, (CURB_HEIGHT + 0.03) / 2, ROAD.minZ + 0.11),
    part(box(length, CURB_HEIGHT + 0.03, 0.22), STREET_PALETTE.curb, 0, (CURB_HEIGHT + 0.03) / 2, ROAD.maxZ - 0.11),
    // Solid edge lines.
    part(box(length, 0.01, 0.12), STREET_PALETTE.line, 0, 0.005, ROAD.minZ + 0.45),
    part(box(length, 0.01, 0.12), STREET_PALETTE.line, 0, 0.005, ROAD.maxZ - 0.45),
  ];
  // Paving joints on the near sidewalk.
  for (let x = -STREET_HALF; x <= STREET_HALF; x += 1.5) {
    parts.push(part(box(0.04, 0.005, NEAR_WALK.maxZ - NEAR_WALK.minZ - 0.3), STREET_PALETTE.curb, x, CURB_HEIGHT + 0.002, (NEAR_WALK.minZ + NEAR_WALK.maxZ) / 2));
  }
  const crossing = 3;
  for (let x = -STREET_HALF; x < STREET_HALF; x += 4) {
    // Dashed centre line, broken by the zebra crossing.
    if (Math.abs(x + 1) < crossing + 1) continue;
    parts.push(part(box(2, 0.01, 0.14), STREET_PALETTE.centre, x + 1, 0.006, CENTER_LINE_Z));
  }
  for (let x = -crossing + 0.3; x <= crossing; x += 0.9) {
    parts.push(part(box(0.5, 0.012, roadW - 1.4), STREET_PALETTE.line, x, 0.007, (ROAD.minZ + ROAD.maxZ) / 2));
  }
  return merge(parts);
}

/** Unit building (1×1×1, base at y = 0, front at z = +0.5): white walls tinted per instance and a pale roof ledge. */
export function buildingBodyGeometry(): BufferGeometry {
  return merge([part(box(1, 1, 1), STREET_PALETTE.white, 0, 0.5, 0), part(box(1.04, 0.04, 1.04), STREET_PALETTE.roof, 0, 1.01, 0)]);
}

/** Shopfront glass, an awning and rows of windows on the front face of the unit building. */
export function buildingDetailGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    part(box(0.8, 0.22, 0.02), STREET_PALETTE.glassDark, 0, 0.13, 0.505),
    part(box(0.86, 0.025, 0.08), STREET_PALETTE.awning, 0, 0.27, 0.53),
  ];
  for (const y of [0.45, 0.65, 0.85]) {
    for (const x of [-0.3, 0, 0.3]) parts.push(part(box(0.16, 0.1, 0.02), STREET_PALETTE.glass, x, y, 0.505));
  }
  return merge(parts);
}

/** Tree: trunk and two stacked low-poly canopies. */
export function treeGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.1, 0.14, 1.4, 6), STREET_PALETTE.trunk, 0, 0.7 + CURB_HEIGHT, 0),
    part(new IcosahedronGeometry(0.85, 0), STREET_PALETTE.leaf, 0, 2.0 + CURB_HEIGHT, 0),
    part(new ConeGeometry(0.6, 1, 6), STREET_PALETTE.leafLight, 0, 2.7 + CURB_HEIGHT, 0),
    part(new CylinderGeometry(0.42, 0.42, 0.04, 8), STREET_PALETTE.trunk, 0, CURB_HEIGHT + 0.02, 0),
  ]);
}

/** Lamp post with an arm over the road (+z); the bulb is a separate mesh. */
export function lampGeometry(): BufferGeometry {
  return merge([
    part(new CylinderGeometry(0.06, 0.09, 3.6, 6), STREET_PALETTE.pole, 0, 1.8 + CURB_HEIGHT, 0),
    part(box(0.08, 0.08, 0.9), STREET_PALETTE.pole, 0, 3.55 + CURB_HEIGHT, 0.42),
    part(box(0.34, 0.1, 0.4), STREET_PALETTE.pole, 0, 3.5 + CURB_HEIGHT, 0.85),
  ]);
}

export const LAMP_BULB_Y = 3.42 + CURB_HEIGHT;
export const LAMP_BULB_Z = 0.85;

export function lampBulbGeometry(): BufferGeometry {
  const g = new BoxGeometry(0.26, 0.06, 0.32);
  g.translate(0, LAMP_BULB_Y, LAMP_BULB_Z);
  g.deleteAttribute('uv');
  return g;
}

/** Vehicles point along +x. Body parts are white (tinted per instance), details keep their colour. */
export function vehicleBodyGeometry(kind: VehicleKind): BufferGeometry {
  const W = STREET_PALETTE.white;
  switch (kind) {
    case 'car':
      return merge([part(box(3.2, 0.62, 1.6), W, 0, 0.6, 0), part(box(1.8, 0.56, 1.4), W, -0.2, 1.18, 0)]);
    case 'bike':
      return merge([part(box(1.2, 0.32, 0.28), W, 0, 0.58, 0), part(box(0.3, 0.42, 0.3), W, 0.5, 0.72, 0)]);
    case 'bus':
      return merge([part(box(6.2, 2.3, 2.1), W, 0, 1.45, 0), part(box(6.3, 0.14, 2.2), W, 0, 2.66, 0)]);
  }
}

export function vehicleDetailGeometry(kind: VehicleKind): BufferGeometry {
  const P = STREET_PALETTE;
  switch (kind) {
    case 'car': {
      const parts = [
        part(box(1.86, 0.36, 1.2), P.glass, -0.2, 1.2, 0),
        part(box(1.5, 0.36, 1.44), P.glass, -0.2, 1.2, 0),
        part(box(0.04, 0.14, 0.3), P.headlight, 1.61, 0.68, 0.5),
        part(box(0.04, 0.14, 0.3), P.headlight, 1.61, 0.68, -0.5),
        part(box(0.04, 0.12, 0.3), P.tail, -1.61, 0.7, 0.5),
        part(box(0.04, 0.12, 0.3), P.tail, -1.61, 0.7, -0.5),
      ];
      for (const x of [-1.05, 1.05]) for (const z of [-0.74, 0.74]) parts.push(part(wheel(0.32, 0.24), P.tyre, x, 0.32, z, Math.PI / 2));
      return merge(parts);
    }
    case 'bike':
      return merge([
        part(wheel(0.28, 0.1), P.tyre, -0.5, 0.28, 0, Math.PI / 2),
        part(wheel(0.28, 0.1), P.tyre, 0.55, 0.28, 0, Math.PI / 2),
        part(box(0.5, 0.1, 0.3), P.tyre, -0.15, 0.78, 0),
        // Rider: legs, torso, arms to the handlebar and a helmet.
        part(box(0.36, 0.14, 0.34), P.rider, 0, 0.88, 0),
        part(box(0.3, 0.55, 0.4), P.rider, -0.1, 1.2, 0),
        part(box(0.5, 0.1, 0.5), P.rider, 0.18, 1.3, 0),
        part(new IcosahedronGeometry(0.17, 0), P.helmet, -0.05, 1.62, 0),
        part(box(0.04, 0.1, 0.12), P.headlight, 0.66, 0.85, 0),
      ]);
    case 'bus': {
      const parts = [
        part(box(5.4, 0.75, 2.14), P.glass, -0.25, 1.95, 0),
        part(box(6.24, 0.85, 1.8), P.glass, 0, 1.9, 0),
        part(box(6.22, 0.3, 2.12), P.line, 0, 0.75, 0),
        part(box(0.04, 0.16, 0.36), P.headlight, 3.11, 0.75, 0.7),
        part(box(0.04, 0.16, 0.36), P.headlight, 3.11, 0.75, -0.7),
      ];
      for (const x of [-2, 2.1]) for (const z of [-0.95, 0.95]) parts.push(part(wheel(0.45, 0.3), P.tyre, x, 0.45, z, Math.PI / 2));
      return merge(parts);
    }
  }
}

export const VEHICLE_COLORS: Readonly<Record<VehicleKind, readonly number[]>> = {
  car: [0xe05a4f, 0x3d9be9, 0xf2c14e, 0xfff9f0, 0x2fb898, 0x8e6bd8, 0xff9f43],
  bike: [0xe05a4f, 0x3d9be9, 0x2a211c, 0xf2a516, 0xf28cb1],
  bus: [0xf2c14e, 0x2fb898],
};
