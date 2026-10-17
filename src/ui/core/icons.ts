/**
 * The 3D icon set: low-poly models from src/icon-studio rendered by
 * `npm run icons` into public/icons3d (atlas@1x.webp, atlas@2x.webp and
 * atlas.json with each cell's position). Every icon has two cells: 48 px for
 * the 32 and 48 px sizes, and a 24 px one drawn for small sizes (thicker
 * ink, no fine detail) for 16 and 24 px.
 *
 * The DOM shows a cell as the background of an empty box. Until the @1x
 * atlas has loaded (watchIconAtlas, `html.icons-ready`) ui.css draws a plain
 * placeholder tile; once the 3D scene is up, enableHdIcons switches `.ic` to
 * image-set so a 2x screen gets the @2x image (`html.icons-hd`) without
 * taking bandwidth from three.js. The canvas (3D labels) copies the cell out
 * of the @2x image with drawImage. Nothing waits for the atlas, and the box
 * has its final size before it arrives.
 */
// Named imports only: Vite tree-shakes the rest of the JSON (the per-icon table).
import { cell, columns, gap, height, rows, small, width } from '../../../public/icons3d/atlas.json';

/** Every icon, in atlas order. Each id needs a model in src/icon-studio/models. */
export const ICON_IDS = [
  // HUD & điều hướng
  'i-tasks', 'i-menu', 'i-inventory', 'i-people', 'i-marketing', 'i-upgrades', 'i-reviews', 'i-open', 'i-next-day', 'i-camera',
  'i-settings', 'i-pause', 'i-speed-1', 'i-speed-2', 'i-speed-4', 'i-close', 'i-home', 'i-back', 'i-forward',
  // Pha trong ngày
  'i-phase-prep', 'i-phase-open', 'i-flame', 'i-phase-close', 'i-clock',
  // Trạng thái & phản hồi
  'i-ok', 'i-check', 'i-warning', 'i-error', 'i-info', 'i-lock', 'i-sparkle', 'i-tip', 'i-busy', 'i-free', 'i-rest', 'i-auto',
  'i-trend-up', 'i-trend-down', 'i-equal', 'i-todo', 'i-dot', 'i-dot-empty', 'i-chevron-down', 'i-retry', 'i-reset',
  // Tiền & sao
  'i-coin', 'i-star', 'i-star-empty',
  // Báo cáo & đánh giá
  'i-chart', 'i-trophy', 'i-thumb-up', 'i-thumb-down',
  // Hệ thống & cài đặt
  'i-load', 'i-delete', 'i-save', 'i-music', 'i-sound', 'i-quality',
  // Độ khó, nhiệt độ
  'i-easy', 'i-cup-hot', 'i-cold',
  // Nhân viên
  'i-role-server', 'i-role-cleaner', 'i-chef', 'i-avatar',
  // Cảm xúc khách
  'i-face-happy', 'i-face-ok', 'i-face-worried', 'i-face-angry',
  // Món
  'i-espresso', 'i-americano', 'i-latte', 'i-cappuccino', 'i-mocha', 'i-bubble-tea', 'i-lemon-tea', 'i-orange-juice', 'i-croissant', 'i-cake',
  // Nguyên liệu
  'i-beans', 'i-milk', 'i-sugar', 'i-cacao', 'i-tea', 'i-pearls', 'i-lemon', 'i-orange', 'i-flour', 'i-butter', 'i-ice', 'i-cup',
  // Marketing
  'i-flyer', 'i-happy-hour', 'i-social', 'i-kol',
  // Nâng cấp
  'i-tables', 'i-machine', 'i-fast-machine', 'i-counter', 'i-outdoor', 'i-expand', 'i-plants', 'i-paintings', 'i-lights', 'i-window-bar',
  // Dụng cụ mới (tools mở theo cấp quán)
  'i-grinder', 'i-pastry-case', 'i-blender', 'i-ice-maker', 'i-dishwasher',
  // Món mới, cấp quán và nhiệm vụ
  'i-frappe', 'i-level', 'i-mission',
] as const;

export type IconId = (typeof ICON_IDS)[number];

/** Atlas cell of one staff look: `i-avatar-0` is AVATAR_LOOKS[0] (iconMap.ts). */
export type AvatarCellId = `i-avatar-${number}`;

/** Anything with a cell in the atlas. */
export type IconCellId = IconId | AvatarCellId;

const ID_SET: ReadonlySet<string> = new Set(ICON_IDS);

export function isIconId(id: string): id is IconId {
  return ID_SET.has(id);
}

/** Default avatar look (skin-1, hair-2), the one the plain i-avatar model wears. */
export const AVATAR_DEFAULT = { skin: '#ffdcbf', hair: '#6b3f24' } as const;

interface AtlasCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Atlas cells after the icons: one per AVATAR_LOOKS entry (iconMap.ts). */
export const AVATAR_CELLS = 8;

/** Cell number in atlas order: the icons, then the avatar looks. */
const CELL_INDEX: ReadonlyMap<string, number> = new Map<string, number>([
  ...ICON_IDS.map((id, i) => [id, i] as const),
  ...Array.from({ length: AVATAR_CELLS }, (_, n) => [`i-avatar-${n}`, ICON_IDS.length + n] as const),
]);

/** Image URLs, relative to the page so they hold under base './'. */
export const ICON_ATLAS_URLS = { 1: 'icons3d/atlas@1x.webp', 2: 'icons3d/atlas@2x.webp' } as const;

/**
 * Where `id` sits in the atlas (@1x px), or undefined when it has no cell:
 * the 48 px cell, or the 24 px one when `size` is 16 or 24. The atlas is two
 * row-by-row grids in ICON_IDS order, 48 px cells on top and 24 px cells
 * under them (packAtlas in src/icon-studio/atlas.ts), so only the grid
 * numbers are imported from atlas.json; the per-icon tables stay out of the
 * bundle and a test checks every cell against them.
 */
export function iconCell(id: IconCellId, size: IconSize = 48): AtlasCell | undefined {
  const i = CELL_INDEX.get(id);
  if (size <= small.cell) {
    if (i === undefined || i >= small.columns * small.rows) return undefined;
    const s = small.cell;
    return { x: gap + (i % small.columns) * (s + gap), y: small.top + Math.floor(i / small.columns) * (s + gap), w: s, h: s };
  }
  if (i === undefined || i >= columns * rows) return undefined;
  return { x: gap + (i % columns) * (cell + gap), y: gap + Math.floor(i / columns) * (cell + gap), w: cell, h: cell };
}

const pct = (n: number): string => `${+n.toFixed(4)}%`;

/**
 * background-size and -position of a cell as percentages of the box, so the
 * cell fills any box size (size classes, media queries) without new numbers.
 * icon() hands them to ui.css as --ic-size and --ic-pos.
 */
function cellBackground(c: AtlasCell): { size: string; position: string } {
  return {
    size: `${pct((width / c.w) * 100)} ${pct((height / c.h) * 100)}`,
    position: `${pct(width === c.w ? 0 : (c.x / (width - c.w)) * 100)} ${pct(height === c.h ? 0 : (c.y / (height - c.h)) * 100)}`,
  };
}

export type IconSize = 16 | 24 | 32 | 48;

const SIZE_CLASS: Record<IconSize, string> = { 16: 'ic-sm', 24: '', 32: 'ic-lg', 48: 'ic-xl' };

export interface IconOptions {
  /** px, one of --size-icon-sm/md/lg/xl. Default 24. */
  size?: IconSize;
  /** Extra classes, e.g. for layout. */
  class?: string;
}

/** Decorative icon: <span class="ic" data-icon="id" aria-hidden="true" focusable="false"> showing the atlas cell for its size. */
export function icon(id: IconCellId, opts: IconOptions = {}): HTMLElement {
  const size = opts.size ?? 24;
  const el = document.createElement('span');
  el.className = ['ic', SIZE_CLASS[size], opts.class].filter(Boolean).join(' ');
  el.dataset.icon = id;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  const cell = iconCell(id, size);
  if (cell) {
    const bg = cellBackground(cell);
    el.style.setProperty('--ic-size', bg.size);
    el.style.setProperty('--ic-pos', bg.position);
  }
  return el;
}

let atlasImage: Promise<HTMLImageElement> | undefined;

/** The @2x atlas as an image, for canvas drawing; loaded once and shared. A failed load can be retried. */
export function loadIconAtlas(): Promise<HTMLImageElement> {
  atlasImage ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      atlasImage = undefined;
      reject(new Error(`icon atlas: cannot load ${ICON_ATLAS_URLS[2]}`));
    };
    img.src = ICON_ATLAS_URLS[2];
  });
  return atlasImage;
}

/** Class on <html> once the @1x atlas has loaded: ui.css drops the placeholder tile and draws the cells. */
export const ICONS_READY_CLASS = 'icons-ready';
/** Class on <html> once the @2x atlas has loaded after the 3D scene: ui.css lets 2x screens use it. */
export const ICONS_HD_CLASS = 'icons-hd';

/**
 * Loads the @1x atlas, the one every screen starts with, and marks `root`
 * with ICONS_READY_CLASS when it is in. On error the placeholders stay and
 * the load is tried once more when the browser comes back `online`.
 */
export function watchIconAtlas(root: HTMLElement = document.documentElement, win: Window = window): void {
  let retried = false;
  const load = (): void => {
    const img = new Image();
    img.decoding = 'async';
    // Below the scripts and fonts the page is still loading.
    img.fetchPriority = 'low';
    img.onload = () => root.classList.add(ICONS_READY_CLASS);
    img.onerror = () => {
      if (retried) return;
      retried = true;
      win.addEventListener('online', load, { once: true });
    };
    img.src = ICON_ATLAS_URLS[1];
  };
  load();
}

/**
 * Call once the 3D scene is on screen: loads the @2x atlas (shared with the
 * 3D labels) and then marks `root` with ICONS_HD_CLASS, so the switch never
 * shows an empty box. A failed load keeps the @1x icons.
 */
export function enableHdIcons(root: HTMLElement = document.documentElement, load: () => Promise<unknown> = loadIconAtlas): Promise<void> {
  return load().then(
    () => void root.classList.add(ICONS_HD_CLASS),
    () => {},
  );
}

/** Copies the cell of `id` from a loaded atlas image into a `size` px square at (x, y). False when there is no cell. */
export function drawIcon(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, id: IconCellId, x: number, y: number, size: number): boolean {
  const c = iconCell(id);
  if (!c) return false;
  const k = atlas.naturalWidth / width;
  ctx.drawImage(atlas, c.x * k, c.y * k, c.w * k, c.h * k, x, y, size, size);
  return true;
}
