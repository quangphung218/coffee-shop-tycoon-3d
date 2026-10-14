import { describe, expect, it } from 'vitest';
import { type AtlasManifest, CELL, checkManifest, GAP, orderIds, packAtlas } from '../../src/icon-studio/atlas';
import { MODELS } from '../../src/icon-studio/models';
import { ICON_IDS } from '../../src/ui/core/icons';

// The project has no Node types, so node:fs comes in through a dynamically
// named import; paths are relative to the repo root.
const FS_MODULE = 'node:fs';
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
  existsSync(path: string): boolean;
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8'): string;
};

/** Canvas size from a WebP header (VP8X, lossless VP8L or lossy VP8). */
function webpSize(b: Uint8Array): { width: number; height: number } {
  const tag = String.fromCharCode(...b.subarray(0, 4), ...b.subarray(8, 16));
  if (tag !== 'RIFFWEBPVP8X' && tag !== 'RIFFWEBPVP8L' && tag !== 'RIFFWEBPVP8 ') throw new Error(`not a WebP: ${tag}`);
  const u24 = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  if (tag.endsWith('VP8X')) return { width: u24(24) + 1, height: u24(27) + 1 };
  if (tag.endsWith('VP8L')) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return { width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
}

describe('packAtlas', () => {
  it('lays cells out row by row in a near-square grid with a gap all round', () => {
    const m = packAtlas(['a', 'b', 'c', 'd', 'e']);
    expect(m.columns).toBe(3);
    expect(m.rows).toBe(2);
    expect(m.width).toBe(GAP + 3 * (CELL + GAP));
    expect(m.height).toBe(GAP + 2 * (CELL + GAP));
    expect(m.icons.a).toEqual({ x: GAP, y: GAP, w: CELL, h: CELL });
    expect(m.icons.c).toEqual({ x: GAP + 2 * (CELL + GAP), y: GAP, w: CELL, h: CELL });
    expect(m.icons.d).toEqual({ x: GAP, y: GAP + CELL + GAP, w: CELL, h: CELL });
    expect(checkManifest(m, ['a', 'b', 'c', 'd', 'e'])).toEqual([]);
  });

  it('fits every count from 1 to 120 without overlap or wasted rows', () => {
    for (let n = 1; n <= 120; n++) {
      const ids = Array.from({ length: n }, (_, i) => `id${i}`);
      const m = packAtlas(ids);
      expect(Object.keys(m.icons)).toHaveLength(n);
      expect(m.columns * m.rows).toBeGreaterThanOrEqual(n);
      expect(m.columns * (m.rows - 1)).toBeLessThan(n);
      expect(checkManifest(m, ids)).toEqual([]);
    }
  });

  it('drops duplicate ids and rejects an empty list', () => {
    expect(Object.keys(packAtlas(['a', 'a', 'b']).icons)).toEqual(['a', 'b']);
    expect(() => packAtlas([])).toThrow();
  });
});

describe('checkManifest', () => {
  it('reports unknown ids, cells outside the atlas and overlaps', () => {
    const m: AtlasManifest = {
      ...packAtlas(['a', 'b']),
      icons: { a: { x: 0, y: 0, w: 48, h: 48 }, b: { x: 40, y: 0, w: 48, h: 48 }, zz: { x: 200, y: 0, w: 48, h: 48 } },
    };
    expect(checkManifest(m, ['a', 'b'])).toEqual(['zz: not an icon id', 'zz: outside the atlas', 'a overlaps b']);
  });
});

describe('icon models', () => {
  it('are keyed by real icon ids and include the eight samples plus the avatar', () => {
    const ids = Object.keys(MODELS);
    expect(orderIds(ids, ICON_IDS)).toHaveLength(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(['i-menu', 'i-inventory', 'i-upgrades', 'i-reviews', 'i-pause', 'i-close', 'i-latte', 'i-beans', 'i-avatar']),
    );
  });

  it('orderIds follows the app order and rejects unknown ids', () => {
    expect(orderIds(['i-close', 'i-menu'], ICON_IDS)).toEqual(['i-menu', 'i-close']);
    expect(() => orderIds(['i-nope'], ICON_IDS)).toThrow('i-nope');
  });
});

const ATLAS = 'public/icons3d/atlas.json';

describe.skipIf(!fs.existsSync(ATLAS))('committed atlas', () => {
  const m = JSON.parse(fs.existsSync(ATLAS) ? fs.readFileSync(ATLAS, 'utf8') : '{}') as AtlasManifest;

  it('matches the packer for its ids and only holds icons that have a model', () => {
    const ids = Object.keys(m.icons);
    expect(checkManifest(m, ICON_IDS)).toEqual([]);
    expect(m).toEqual(packAtlas(orderIds(ids, ICON_IDS)));
    for (const id of ids) expect(MODELS[id as keyof typeof MODELS]).toBeDefined();
  });

  it('has WebP images at 1x and 2x the manifest size', () => {
    expect(webpSize(fs.readFileSync('public/icons3d/atlas@1x.webp'))).toEqual({ width: m.width, height: m.height });
    expect(webpSize(fs.readFileSync('public/icons3d/atlas@2x.webp'))).toEqual({ width: m.width * 2, height: m.height * 2 });
  });
});
