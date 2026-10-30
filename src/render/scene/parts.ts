import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette';

/**
 * Shared look of the shop scene: palette (palette.ts), the flat-shaded
 * vertex-colour materials, and helpers that bake a primitive's transform and
 * colour so many parts merge into one geometry (src/render/scene/shop.ts,
 * facade.ts).
 *
 * The materials are MeshStandardMaterial (not Lambert): kept flat-shaded and
 * rough so they still read as hand-painted, but they pick up the soft
 * ambient and faint reflections of `scene.environment` (environment.ts).
 * SHARED_MATERIAL is plain palette colour; only WOOD_MATERIAL (counters,
 * tables, chairs, wooden floor) adds a small generated grain, at 0 bytes to
 * download.
 */

export { PALETTE };

export const WALL_HEIGHT = 2.2;
export const WALL_LOW = 0.35;

/** Side of the wood grain texture in px (small; tiled over the wood). */
const GRAIN_SIZE = 64;
/** Metres of wood one grain tile covers, so a chair and a long counter show grain at the same scale. */
export const GRAIN_TILE_METRES = 0.6;
/** Darkest a grain line gets as a multiplier on the vertex colour (1 = no grain); kept close to 1 for low contrast. */
const GRAIN_MIN = 0.9;

/** Small deterministic hash in 0..1, so the grain looks the same on every load. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Faint wood grain the wood material multiplies its vertex colours by: thin
 * wavy lines running along u, near white so palette hues stay flat. Built as
 * a DataTexture (no canvas needed, so it exists in tests too).
 */
export function grainTexture(): DataTexture {
  const n = GRAIN_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x / n) * Math.PI * 2;
      // Lines wobble a little across the tile; whole periods keep it seamless.
      const v = y + 1.5 * Math.sin(u + hash(y >> 3) * 6) + 0.8 * Math.sin(2 * u);
      const row = ((Math.floor(v) % n) + n) % n;
      const line = hash(row) < 0.22 ? 1 : 0;
      const fibre = hash(row * 7 + 3) * 0.35;
      const shade = 1 - (1 - GRAIN_MIN) * Math.min(1, line + fibre);
      const c = Math.round(255 * shade);
      const i = (y * n + x) * 4;
      data[i] = c;
      data[i + 1] = Math.round(c * 0.99);
      data[i + 2] = Math.round(c * 0.97);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, n, n);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Flat palette colour for everything that is not wood: grass, walls, street, machines, people. */
export const SHARED_MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.82,
  metalness: 0,
});

/**
 * Counters, tables, chairs and the wooden floor: the shared look plus a faint
 * grain. The grain is sampled from world-space position on the plane facing
 * the surface (not the part's 0..1 UV), so it keeps one real-world density
 * however big the piece or the scaled floor is, and never stretches into
 * wide stripes.
 */
export const WOOD_MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.78,
  metalness: 0,
  map: grainTexture(),
});
WOOD_MATERIAL.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
#ifdef USE_MAP
  vec4 woodPos = vec4( transformed, 1.0 );
  vec3 woodNormal = objectNormal;
  #ifdef USE_INSTANCING
    woodPos = instanceMatrix * woodPos;
    woodNormal = mat3( instanceMatrix ) * woodNormal;
  #endif
  woodPos = modelMatrix * woodPos;
  woodNormal = abs( mat3( modelMatrix ) * woodNormal );
  vec2 woodUv = woodNormal.y >= max( woodNormal.x, woodNormal.z ) ? woodPos.xz
    : ( woodNormal.x >= woodNormal.z ? woodPos.zy : woodPos.xy );
  vMapUv = woodUv * ${(1 / GRAIN_TILE_METRES).toFixed(4)};
#endif`,
  );
};
export const GLOW_MATERIAL = new MeshBasicMaterial({ color: PALETTE.bulb });
/** Window and door glass; smoother so it catches the environment, and ambient.ts raises its warm emissive in the evening. */
export const GLASS_MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.18,
  metalness: 0,
  emissive: 0xffb45e,
  emissiveIntensity: 0,
});

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
  // UVs are kept so any future map has somewhere to sample (the wood grain
  // works from world position instead); every merged primitive carries a 0..1 UV.
  return g;
}

/**
 * Rewrites the baked colour of vertices [start, start + count) in place, so a
 * part changes colour without a new geometry, material or draw call (shop
 * styles, E-17). `count` defaults to the rest of the geometry.
 */
export function recolor(geo: BufferGeometry, color: number, start = 0, count?: number): void {
  const attr = geo.getAttribute('color') as BufferAttribute;
  const end = count === undefined ? attr.count : Math.min(attr.count, start + count);
  tmpColor.set(color);
  for (let i = start; i < end; i++) attr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  attr.needsUpdate = true;
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
