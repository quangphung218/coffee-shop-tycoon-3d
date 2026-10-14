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
