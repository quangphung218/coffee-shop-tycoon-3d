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

/** Size limits of the committed atlas images, in bytes (120 kB and 300 kB). */
export const BUDGET = { 1: 120_000, 2: 300_000 } as const;

/** Cell size in px of atlas@1x.webp; atlas@2x.webp doubles every number. */
export const CELL = 48;
/** Transparent px between cells (and around the edge) so scaled-down icons never pick up a neighbour. */
export const GAP = 2;
export const SCALES = [1, 2] as const;

export interface AtlasCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shape of public/icons3d/atlas.json. Coordinates are @1x px. */
export interface AtlasManifest {
  version: 1;
  cell: number;
  gap: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  scales: readonly number[];
  icons: Record<string, AtlasCell>;
}

/** Near-square grid, ids in the given order, row by row. Duplicates are dropped. */
export function packAtlas(ids: readonly string[], cell = CELL, gap = GAP): AtlasManifest {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error('packAtlas: no icons');
  const columns = Math.ceil(Math.sqrt(unique.length));
  const rows = Math.ceil(unique.length / columns);
  const icons: Record<string, AtlasCell> = {};
  unique.forEach((id, i) => {
    icons[id] = { x: gap + (i % columns) * (cell + gap), y: gap + Math.floor(i / columns) * (cell + gap), w: cell, h: cell };
  });
  return {
    version: 1,
    cell,
    gap,
    columns,
    rows,
    width: gap + columns * (cell + gap),
    height: gap + rows * (cell + gap),
    scales: SCALES,
    icons,
  };
}

/** `ids` sorted into `order` (the app's icon order); ids missing from `order` throw. */
export function orderIds(ids: Iterable<string>, order: readonly string[]): string[] {
  const set = new Set(ids);
  const unknown = [...set].filter((id) => !order.includes(id));
  if (unknown.length) throw new Error(`Unknown icon id: ${unknown.join(', ')}`);
  return order.filter((id) => set.has(id));
}

/** Problems with a manifest: ids not in `known`, cells outside the atlas or overlapping. Empty when valid. */
export function checkManifest(m: AtlasManifest, known: readonly string[]): string[] {
  const out: string[] = [];
  const cells = Object.entries(m.icons);
  for (const [id, c] of cells) {
    if (!known.includes(id)) out.push(`${id}: not an icon id`);
    if (c.x < 0 || c.y < 0 || c.x + c.w > m.width || c.y + c.h > m.height) out.push(`${id}: outside the atlas`);
  }
  cells.forEach(([a, p], i) => {
    for (const [b, q] of cells.slice(i + 1)) {
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) out.push(`${a} overlaps ${b}`);
    }
  });
  return out;
}
