/**
 * Atlas layout shared by the studio page, scripts/build-icons.mjs (through
 * the page) and public/icons3d/index.html (which reads atlas.json).
 * Pure: no DOM, no three.js.
 */
import { ICON_IDS } from '../ui/core/icons';
import { AVATAR_LOOKS } from '../ui/core/iconMap';

/** One atlas cell per AVATAR_LOOKS entry, same index: `i-avatar-0` is AVATAR_LOOKS[0]. */
export const AVATAR_IDS: readonly string[] = AVATAR_LOOKS.map((_, i) => `i-avatar-${i}`);

/** Every cell of the full atlas, in atlas order: the icons, then the avatar looks. */
export const ATLAS_IDS: readonly string[] = [...ICON_IDS, ...AVATAR_IDS];

/** Icons that sit alone in a button, with only an aria-label: HUD camera, settings, pause, speeds, the reset tick, close. */
export const ICON_ONLY_IDS: readonly string[] = ['i-camera', 'i-settings', 'i-pause', 'i-speed-1', 'i-speed-2', 'i-speed-4', 'i-check', 'i-close'];

/** Icons on the report sheet (build-icons --sheet): ICON_ONLY_IDS, one or two of each group in ICON_IDS, one avatar look. */
export const SHEET_IDS: readonly string[] = [
  ...ICON_ONLY_IDS,
  'i-menu', 'i-inventory', 'i-phase-open', 'i-clock', 'i-warning', 'i-lock', 'i-coin', 'i-star',
  'i-chart', 'i-save', 'i-cup-hot', 'i-chef', 'i-face-happy', 'i-face-angry', 'i-latte', 'i-croissant',
  'i-beans', 'i-milk', 'i-flyer', 'i-machine', 'i-plants', 'i-avatar-3',
];

/** Size limits of the committed atlas images, small cells included, in bytes (120 kB and 300 kB). */
export const BUDGET = { 1: 120_000, 2: 300_000 } as const;

/** Cell size in px of atlas@1x.webp; atlas@2x.webp doubles every number. Shown at 32 and 48 px. */
export const CELL = 48;
/** Small cell size in px @1x, drawn on its own for icons shown at 16 and 24 px. */
export const SMALL_CELL = 24;
/** Transparent px between cells (and around the edge) so scaled-down icons never pick up a neighbour. */
export const GAP = 2;
export const SCALES = [1, 2] as const;

export interface AtlasCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The small cells: a grid of its own under the 48 px grid, starting at y = `top`, same gap. */
export interface SmallGrid {
  cell: number;
  columns: number;
  rows: number;
  top: number;
}

/** Shape of public/icons3d/atlas.json. Coordinates are @1x px. */
export interface AtlasManifest {
  version: 2;
  cell: number;
  gap: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  scales: readonly number[];
  icons: Record<string, AtlasCell>;
  small: SmallGrid;
  /** Same ids as `icons`, small cells. */
  smallIcons: Record<string, AtlasCell>;
  /** How each small cell reads on the cream HUD, measured on the encoded @1x image by the build. */
  smallQuality?: Record<string, CellQuality>;
}

/**
 * Legibility of one cell, from its pixels. Edge pixels are the opaque ones
 * (alpha ≥ 128) next to a see-through one or the cell border.
 * `edgeInk`: share of edge pixels dark as ink (at least INK_CONTRAST against
 * the background; lightness, since lossy WebP blurs hue across 2 px).
 * `edgeContrast`: WCAG contrast of the edge pixels' mean colour, laid on the
 * background, against the background. `creamShare`: share of opaque pixels
 * that, laid on the background, are within 1.25:1 of it (body melting into it).
 */
export interface CellQuality {
  edgeInk: number;
  edgeContrast: number;
  creamShare: number;
}

/** Minimums the small cells are held to (tests/icons): mostly ink edge, 3:1 for graphics (WCAG 1.4.11), at most half cream-like. */
export const SMALL_QUALITY = { edgeInk: 0.6, edgeContrast: 3, creamShare: 0.5 } as const;

/** Contrast with the cream background from which a pixel counts as ink: half of ink's own (≈ 14:1). */
export const INK_CONTRAST = 7;

export type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** CellQuality of cell `c` in RGBA pixels `px` of an image `stride` px wide, against background `bg`. */
export function measureCell(px: ArrayLike<number>, stride: number, c: AtlasCell, bg: Rgb): CellQuality {
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= c.w || y >= c.h ? 0 : px[((c.y + y) * stride + c.x + x) * 4 + 3]!);
  const onBg = (i: number): Rgb => {
    const a = px[i + 3]! / 255;
    return [0, 1, 2].map((k) => px[i + k]! * a + bg[k]! * (1 - a)) as unknown as Rgb;
  };
  let opaque = 0;
  let creamy = 0;
  let edges = 0;
  let inky = 0;
  const sum = [0, 0, 0];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (alpha(x, y) < 128) continue;
      const i = ((c.y + y) * stride + c.x + x) * 4;
      const color = onBg(i);
      opaque++;
      if (contrastRatio(color, bg) < 1.25) creamy++;
      if (alpha(x - 1, y) >= 128 && alpha(x + 1, y) >= 128 && alpha(x, y - 1) >= 128 && alpha(x, y + 1) >= 128) continue;
      edges++;
      if (contrastRatio([px[i]!, px[i + 1]!, px[i + 2]!], bg) >= INK_CONTRAST) inky++;
      for (const k of [0, 1, 2]) sum[k] = sum[k]! + color[k]!;
    }
  }
  if (edges === 0) return { edgeInk: 0, edgeContrast: 1, creamShare: opaque ? round3(creamy / opaque) : 1 };
  const mean = sum.map((v) => v / edges) as unknown as Rgb;
  return { edgeInk: round3(inky / edges), edgeContrast: round3(contrastRatio(mean, bg)), creamShare: round3(creamy / opaque) };
}

/**
 * Near-square grid of `cell` px cells, ids in the given order, row by row;
 * under it, as many `small` px cells per row as fit the width, same order.
 * Duplicates are dropped.
 */
export function packAtlas(ids: readonly string[], cell = CELL, gap = GAP, small = SMALL_CELL): AtlasManifest {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error('packAtlas: no icons');
  const columns = Math.ceil(Math.sqrt(unique.length));
  const rows = Math.ceil(unique.length / columns);
  const width = gap + columns * (cell + gap);
  const top = gap + rows * (cell + gap);
  const smallColumns = Math.min(unique.length, Math.max(1, Math.floor((width - gap) / (small + gap))));
  const smallRows = Math.ceil(unique.length / smallColumns);
  const icons: Record<string, AtlasCell> = {};
  const smallIcons: Record<string, AtlasCell> = {};
  unique.forEach((id, i) => {
    icons[id] = { x: gap + (i % columns) * (cell + gap), y: gap + Math.floor(i / columns) * (cell + gap), w: cell, h: cell };
    smallIcons[id] = { x: gap + (i % smallColumns) * (small + gap), y: top + Math.floor(i / smallColumns) * (small + gap), w: small, h: small };
  });
  return {
    version: 2,
    cell,
    gap,
    columns,
    rows,
    width,
    height: top + smallRows * (small + gap),
    scales: SCALES,
    icons,
    small: { cell: small, columns: smallColumns, rows: smallRows, top },
    smallIcons,
  };
}

/** `ids` sorted into `order` (the app's icon order); ids missing from `order` throw. */
export function orderIds(ids: Iterable<string>, order: readonly string[]): string[] {
  const set = new Set(ids);
  const unknown = [...set].filter((id) => !order.includes(id));
  if (unknown.length) throw new Error(`Unknown icon id: ${unknown.join(', ')}`);
  return order.filter((id) => set.has(id));
}

/**
 * Problems with a manifest: ids not in `known`, an id with only one of its
 * two cells, cells outside the atlas or overlapping (small cells are named
 * `id@24`). Empty when valid.
 */
export function checkManifest(m: AtlasManifest, known: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of Object.keys(m.icons)) if (!known.includes(id)) out.push(`${id}: not an icon id`);
  const large = new Set(Object.keys(m.icons));
  const small = new Set(Object.keys(m.smallIcons));
  for (const id of large) if (!small.has(id)) out.push(`${id}: no small cell`);
  for (const id of small) if (!large.has(id)) out.push(`${id}: no ${m.cell} px cell`);
  const cells = [...Object.entries(m.icons), ...Object.entries(m.smallIcons).map(([id, c]) => [`${id}@${c.w}`, c] as const)];
  for (const [id, c] of cells) {
    if (c.x < 0 || c.y < 0 || c.x + c.w > m.width || c.y + c.h > m.height) out.push(`${id}: outside the atlas`);
  }
  cells.forEach(([a, p], i) => {
    for (const [b, q] of cells.slice(i + 1)) {
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) out.push(`${a} overlaps ${b}`);
    }
  });
  return out;
}
