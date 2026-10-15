import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_IDS,
  type AtlasManifest,
  AVATAR_IDS,
  BUDGET,
  CELL,
  checkManifest,
  contrastRatio,
  GAP,
  hexRgb,
  ICON_ONLY_IDS,
  INK_CONTRAST,
  measureCell,
  orderIds,
  packAtlas,
  SHEET_IDS,
  SMALL_CELL,
  SMALL_QUALITY,
} from '../../src/icon-studio/atlas';
import { MODELS, SMALL_MODELS } from '../../src/icon-studio/models';
import { LOOKS, mat, PALETTE, type PaletteKey, POSES } from '../../src/icon-studio/style';
import { AVATAR_LOOKS } from '../../src/ui/core/iconMap';
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
    expect(m.icons.a).toEqual({ x: GAP, y: GAP, w: CELL, h: CELL });
    expect(m.icons.c).toEqual({ x: GAP + 2 * (CELL + GAP), y: GAP, w: CELL, h: CELL });
    expect(m.icons.d).toEqual({ x: GAP, y: GAP + CELL + GAP, w: CELL, h: CELL });
    expect(checkManifest(m, ['a', 'b', 'c', 'd', 'e'])).toEqual([]);
  });

  it('puts a small cell per id under the large grid, as many per row as fit the width', () => {
    const m = packAtlas(['a', 'b', 'c', 'd', 'e']);
    const top = GAP + 2 * (CELL + GAP);
    // 152 px wide: five 24 px cells and their gaps fit on one row.
    expect(m.small).toEqual({ cell: SMALL_CELL, columns: 5, rows: 1, top });
    expect(m.height).toBe(top + SMALL_CELL + GAP);
    expect(m.smallIcons.a).toEqual({ x: GAP, y: top, w: SMALL_CELL, h: SMALL_CELL });
    expect(m.smallIcons.e).toEqual({ x: GAP + 4 * (SMALL_CELL + GAP), y: top, w: SMALL_CELL, h: SMALL_CELL });
    expect(Object.keys(m.smallIcons)).toEqual(Object.keys(m.icons));
  });

  it('fits every count from 1 to 120 without overlap or wasted rows, in both grids', () => {
    for (let n = 1; n <= 120; n++) {
      const ids = Array.from({ length: n }, (_, i) => `id${i}`);
      const m = packAtlas(ids);
      expect(Object.keys(m.icons)).toHaveLength(n);
      expect(Object.keys(m.smallIcons)).toHaveLength(n);
      expect(m.columns * m.rows).toBeGreaterThanOrEqual(n);
      expect(m.columns * (m.rows - 1)).toBeLessThan(n);
      expect(m.small.columns * m.small.rows).toBeGreaterThanOrEqual(n);
      expect(m.small.columns * (m.small.rows - 1)).toBeLessThan(n);
      expect(checkManifest(m, ids)).toEqual([]);
    }
  });

  it('drops duplicate ids and rejects an empty list', () => {
    expect(Object.keys(packAtlas(['a', 'a', 'b']).icons)).toEqual(['a', 'b']);
    expect(() => packAtlas([])).toThrow();
  });
});

describe('checkManifest', () => {
  it('reports unknown ids, missing cells, cells outside the atlas and overlaps', () => {
    const base = packAtlas(['a', 'b']);
    const m: AtlasManifest = {
      ...base,
      icons: { a: { x: 0, y: 0, w: 48, h: 48 }, b: { x: 40, y: 0, w: 48, h: 48 }, zz: { x: 200, y: 0, w: 48, h: 48 } },
    };
    expect(checkManifest(m, ['a', 'b'])).toEqual(['zz: not an icon id', 'zz: no small cell', 'zz: outside the atlas', 'a overlaps b']);
  });

  it('reports a small cell without a large one, and a small cell on top of a large one', () => {
    const base = packAtlas(['a', 'b']);
    const m: AtlasManifest = { ...base, smallIcons: { a: { ...base.smallIcons.a!, y: base.icons.a!.y }, b: base.smallIcons.b!, c: base.smallIcons.b! } };
    expect(checkManifest(m, ['a', 'b', 'c'])).toEqual(['c: no 48 px cell', 'a overlaps a@24', 'b@24 overlaps c@24']);
  });
});

describe('small look', () => {
  it('rings the silhouette in 1.5–2 px of flat ink, less margin, no contact shadow and drops fine parts', () => {
    expect(LOOKS.regular.ring).toBe(0);
    expect(LOOKS.small.ring * SMALL_CELL).toBeGreaterThanOrEqual(1.5);
    expect(LOOKS.small.ring * SMALL_CELL).toBeLessThanOrEqual(2);
    expect((LOOKS.small.outline + LOOKS.small.ring) / SMALL_CELL).toBeGreaterThan(LOOKS.regular.outline / CELL);
    expect(LOOKS.small.margin).toBeLessThan(LOOKS.regular.margin);
    expect(LOOKS.small.shadow).toBe(false);
    expect(LOOKS.small.minPart).toBeGreaterThan(0);
    expect(LOOKS.small.contrast).toBeGreaterThan(1);
    expect(LOOKS.regular).toMatchObject({ shadow: true, minPart: 0, contrast: 1, saturate: 1 });
  });
});

describe('measureCell', () => {
  const ink = hexRgb(PALETTE.ink);
  const cream = hexRgb(PALETTE.cream);
  /** A `w`-px-wide RGBA image with a 10 px cell at (2, 2): a disc of `body`, ringed by `edge` when given. */
  function image(body: readonly [number, number, number], edge?: readonly [number, number, number]) {
    const w = 14;
    const px = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const d = Math.hypot(x - 4.5, y - 4.5);
        if (d > 4.6) continue;
        const color = edge && d > 3.2 ? edge : body;
        px.set([...color, 255], ((2 + y) * w + 2 + x) * 4);
      }
    }
    return { px, w, cell: { x: 2, y: 2, w: 10, h: 10 } };
  }

  it('scores an ink-ringed body as fully inked, high contrast and not cream', () => {
    const { px, w, cell } = image(hexRgb(PALETTE.honey), ink);
    const q = measureCell(px, w, cell, cream);
    expect(q.edgeInk).toBe(1);
    expect(q.edgeContrast).toBeGreaterThan(10);
    expect(q.creamShare).toBe(0);
  });

  it('flags a cream body without ink, the old 16 px i-close', () => {
    const { px, w, cell } = image(cream);
    const q = measureCell(px, w, cell, cream);
    expect(q.edgeInk).toBe(0);
    expect(q.edgeContrast).toBeLessThan(SMALL_QUALITY.edgeContrast);
    expect(q.creamShare).toBeGreaterThan(SMALL_QUALITY.creamShare);
  });

  it('counts contrast with the WCAG formula, ink well past INK_CONTRAST and the body colours below it', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio(ink, cream)).toBeGreaterThan(2 * INK_CONTRAST - 1);
    for (const key of ['honey', 'mint', 'sky', 'coral', 'latte'] as const) expect(contrastRatio(hexRgb(PALETTE[key]), cream), key).toBeLessThan(INK_CONTRAST);
  });
});

describe('small models', () => {
  it('replace the 24 px cell of icon-only HUD buttons and the coin, straight on, never in cream', () => {
    expect(Object.keys(SMALL_MODELS).sort()).toEqual(['i-camera', 'i-close', 'i-coin', 'i-pause', 'i-settings', 'i-speed-4']);
    for (const [id, build] of Object.entries(SMALL_MODELS)) {
      const model = build();
      expect(model.userData.pose, id).toBe('glyph');
      const meshes: Mesh[] = [];
      model.traverse((o) => {
        if (o instanceof Mesh) meshes.push(o);
      });
      // The largest part (the body) is not HUD cream.
      const size = (m: Mesh) => new Box3().setFromObject(m).getSize(new Vector3()).lengthSq();
      const body = meshes.reduce((a, b) => (size(b) > size(a) ? b : a));
      expect(body.material, id).not.toBe(mat('cream'));
    }
    const close = SMALL_MODELS['i-close']!();
    close.traverse((o) => {
      if (o instanceof Mesh) expect(o.material).toBe(mat('coral'));
    });
  });
});

describe('viewer page', () => {
  const html = fs.readFileSync('public/icons3d/index.html', 'utf8');

  it('never lets a card column be wider than the screen (390 px phones)', () => {
    expect(html).toContain('minmax(min(100%, 360px), 1fr)');
    expect(html).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
  });

  it('takes colours and type sizes from token values only', () => {
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const tokens = fs.readFileSync('src/ui/styles/tokens.css', 'utf8');
    const declared = [...css.matchAll(/(--[\w-]+): ([^;]+);/g)];
    expect(declared.length).toBeGreaterThan(10);
    for (const [, name, value] of declared) {
      // Hex colours are copies of a palette value; the rest keep the token's name and value.
      if (value!.startsWith('#')) expect(tokens, name).toContain(value);
      else if (!name!.startsWith('--font-family')) expect(tokens, name).toContain(`${name}: ${value}`);
    }
    // Outside :root, no raw hex colours.
    expect(css.slice(css.indexOf('}')).match(/#[0-9a-f]{3,6}\b/gi)).toBeNull();
  });

  it('shows an alert when atlas.json or a WebP fails to load', () => {
    expect(html).toContain("image('atlas@1x.webp'), image('atlas@2x.webp')");
    expect(html).toContain('img.onerror');
    expect(html).toContain("meta.setAttribute('role', 'alert')");
  });
});

describe('report sheet', () => {
  it('shows the icon-only buttons and at least one icon of each group, all in the atlas', () => {
    for (const id of SHEET_IDS) expect(ATLAS_IDS, id).toContain(id);
    expect(new Set(SHEET_IDS).size).toBe(SHEET_IDS.length);
    expect(SHEET_IDS.slice(0, ICON_ONLY_IDS.length)).toEqual([...ICON_ONLY_IDS]);
    expect(ICON_ONLY_IDS).toEqual(expect.arrayContaining(['i-camera', 'i-settings', 'i-close', 'i-pause', 'i-speed-1', 'i-speed-2', 'i-speed-4']));
    // One id per group of ICON_IDS (the group comments in src/ui/core/icons.ts), plus an avatar look.
    const groups = ['i-menu', 'i-phase-open', 'i-warning', 'i-coin', 'i-chart', 'i-save', 'i-cup-hot', 'i-chef', 'i-face-happy', 'i-latte', 'i-beans', 'i-flyer', 'i-machine'];
    expect(SHEET_IDS).toEqual(expect.arrayContaining([...groups, AVATAR_IDS[3]]));
  });

  it('is written by build-icons only with --sheet', () => {
    const script = fs.readFileSync('scripts/build-icons.mjs', 'utf8');
    expect(script).toContain("argv.includes('--sheet')");
    expect([...script.matchAll(/screenshot\(\{ path: SHEET \}\)/g)]).toHaveLength(1);
    // The one screenshot sits in the body of `if (sheet) { … }`, one indent deeper.
    expect(script).toMatch(/\n(\s*)if \(sheet\) \{\n(?:\1 {2}.*\n)*\1 {2}await page\.locator\('#sheet'\)\.screenshot\(\{ path: SHEET \}\);\n\1\}/);
  });
});

describe('icon models', () => {
  it('cover every icon id and one avatar per AVATAR_LOOKS entry, nothing else', () => {
    expect(ICON_IDS).toHaveLength(113);
    expect(AVATAR_IDS).toHaveLength(AVATAR_LOOKS.length);
    expect(Object.keys(MODELS).sort()).toEqual([...ATLAS_IDS].sort());
  });

  it('each build into finite geometry in palette colours and a known pose', () => {
    const palette = new Set<unknown>((Object.keys(PALETTE) as PaletteKey[]).map(mat));
    for (const [id, build] of Object.entries(MODELS)) {
      const model = build();
      const meshes: Mesh[] = [];
      model.traverse((o) => {
        if (o instanceof Mesh) meshes.push(o);
      });
      expect(meshes.length, id).toBeGreaterThan(0);
      for (const m of meshes) expect(palette.has(m.material), id).toBe(true);
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      expect([size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0), id).toBe(true);
      expect(Object.keys(POSES), id).toContain(model.userData.pose ?? 'object');
    }
  });

  it('orderIds follows the app order and rejects unknown ids', () => {
    expect(orderIds(['i-close', 'i-menu'], ICON_IDS)).toEqual(['i-menu', 'i-close']);
    expect(orderIds(['i-avatar-1', 'i-close'], ATLAS_IDS)).toEqual(['i-close', 'i-avatar-1']);
    expect(() => orderIds(['i-nope'], ICON_IDS)).toThrow('i-nope');
  });
});

const ATLAS = 'public/icons3d/atlas.json';

describe.skipIf(!fs.existsSync(ATLAS))('committed atlas', () => {
  const m = JSON.parse(fs.existsSync(ATLAS) ? fs.readFileSync(ATLAS, 'utf8') : '{}') as AtlasManifest;

  it('holds a 48 px and a 24 px cell for every icon id and every avatar look, laid out by the packer', () => {
    expect(checkManifest(m, ATLAS_IDS)).toEqual([]);
    expect(Object.keys(m.icons)).toEqual([...ATLAS_IDS]);
    expect(Object.keys(m.smallIcons)).toEqual([...ATLAS_IDS]);
    for (const id of ATLAS_IDS) {
      expect(m.icons[id], id).toMatchObject({ w: CELL, h: CELL });
      expect(m.smallIcons[id], id).toMatchObject({ w: SMALL_CELL, h: SMALL_CELL });
    }
    // toEqual skips undefined keys, so this compares the layout without the measures.
    expect({ ...m, smallQuality: undefined }).toEqual(packAtlas(ATLAS_IDS));
  });

  it('measured every 24 px cell as ink-edged and clear of the cream HUD', () => {
    expect(Object.keys(m.smallQuality ?? {})).toEqual([...ATLAS_IDS]);
    for (const [id, q] of Object.entries(m.smallQuality ?? {})) {
      expect(q.edgeInk, id).toBeGreaterThanOrEqual(SMALL_QUALITY.edgeInk);
      expect(q.edgeContrast, id).toBeGreaterThanOrEqual(SMALL_QUALITY.edgeContrast);
    }
    for (const id of [...ICON_ONLY_IDS, 'i-coin']) expect(m.smallQuality?.[id]?.creamShare, id).toBeLessThanOrEqual(SMALL_QUALITY.creamShare);
  });

  it('has WebP images at 1x and 2x the manifest size', () => {
    expect(webpSize(fs.readFileSync('public/icons3d/atlas@1x.webp'))).toEqual({ width: m.width, height: m.height });
    expect(webpSize(fs.readFileSync('public/icons3d/atlas@2x.webp'))).toEqual({ width: m.width * 2, height: m.height * 2 });
  });

  it('stays inside the size budget with the small cells (120 kB @1x, 300 kB @2x)', () => {
    expect(fs.readFileSync('public/icons3d/atlas@1x.webp').length).toBeLessThanOrEqual(BUDGET[1]);
    expect(fs.readFileSync('public/icons3d/atlas@2x.webp').length).toBeLessThanOrEqual(BUDGET[2]);
  });

  it('ships the old flat SVG of every icon id for the viewer page', () => {
    const svgs = JSON.parse(fs.readFileSync('public/icons3d/svg.json', 'utf8')) as Record<string, string>;
    expect(Object.keys(svgs)).toEqual([...ATLAS_IDS]);
    for (const [id, svg] of Object.entries(svgs)) expect(svg, id).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
  });
});
