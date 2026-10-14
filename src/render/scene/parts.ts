import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, CylinderGeometry, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Shared look of the shop scene: palette, the one flat-shaded vertex-colour
 * material, and helpers that bake a primitive's transform and colour so many
 * parts merge into one geometry (src/render/scene/shop.ts, facade.ts).
 */

export const PALETTE = {
  ground: 0xb9de9a,
  floor: 0xe9cfa8,
  patio: 0xdcd3c4,
  wall: 0xf6e3c6,
  wood: 0xa0704c,
  woodDark: 0x5c3a26,
  woodLight: 0xc98b5a,
  cream: 0xfff9f0,
  mint: 0x2fb898,
  coral: 0xe07a5f,
  gold: 0xf2c14e,
  plant: 0x3fa66b,
  plantDark: 0x2f8a56,
  pot: 0xc8693f,
  cup: 0xf7f3ea,
  coffee: 0x6b4226,
  steel: 0x9aa3ab,
  steelDark: 0x4a4f55,
  bulb: 0xffe7a3,
} as const;

export const WALL_HEIGHT = 2.2;
export const WALL_LOW = 0.35;

export const SHARED_MATERIAL = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const GLOW_MATERIAL = new MeshBasicMaterial({ color: PALETTE.bulb });

const tmpColor = new Color();

/** Bakes a transform and a flat colour into a primitive so parts can be merged. */
export function part(geo: BufferGeometry, color: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  tmpColor.set(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('shop: could not merge geometry');
  merged.computeBoundingSphere();
  return merged;
}

export function box(w: number, h: number, d: number): BoxGeometry {
  return new BoxGeometry(w, h, d);
}

export function cyl(rTop: number, rBottom: number, h: number, segments = 8): CylinderGeometry {
  return new CylinderGeometry(rTop, rBottom, h, segments);
}
