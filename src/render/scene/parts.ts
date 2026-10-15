import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, cssColor } from './palette';

/**
 * Shared look of the shop scene: palette (palette.ts), the one flat-shaded
 * vertex-colour material, and helpers that bake a primitive's transform and
 * colour so many parts merge into one geometry (src/render/scene/shop.ts,
 * facade.ts).
 *
 * The material is MeshStandardMaterial (not Lambert): kept flat-shaded and
 * rough so it still reads as hand-painted, but now it picks up the soft
 * ambient and faint reflections of `scene.environment` (environment.ts). One
 * small CanvasTexture of a warm grain is tiled over every surface as the
 * colour map, so the flat palette colours gain a little painted texture at 0
 * bytes to download; parts keep their UVs for it.
 */

export { PALETTE };

export const WALL_HEIGHT = 2.2;
export const WALL_LOW = 0.35;

/** Side of the shared grain texture in px (small; tiled over everything). */
const GRAIN_SIZE = 128;
/** How many times the grain tiles across a part's 0..1 UV. */
const GRAIN_REPEAT = 4;

/** A faint warm grain the shared material multiplies its vertex colours by; null without OffscreenCanvas (tests, jsdom). */
function grainTexture(): Texture | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(GRAIN_SIZE, GRAIN_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, GRAIN_SIZE, GRAIN_SIZE);
  // Faint warm streaks: low-alpha strokes keep the multiplier near white, so
  // hues stay flat while large surfaces (floor, counters, tabletops) gain grain.
  ctx.strokeStyle = cssColor(PALETTE.woodDark);
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * GRAIN_SIZE;
    ctx.globalAlpha = 0.04 + Math.random() * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(GRAIN_SIZE / 3, y + (Math.random() - 0.5) * 6, (GRAIN_SIZE * 2) / 3, y + (Math.random() - 0.5) * 6, GRAIN_SIZE, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(GRAIN_REPEAT, GRAIN_REPEAT);
  return tex;
}

export const SHARED_MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.82,
  metalness: 0,
  map: grainTexture(),
});
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
  // UVs are kept so SHARED_MATERIAL's grain map (and any future map) has
  // somewhere to sample; every primitive we merge carries its own 0..1 UV.
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
