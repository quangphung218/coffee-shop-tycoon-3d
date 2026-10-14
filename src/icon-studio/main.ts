/**
 * Icon studio: renders the 3D icon models (models/) with the shared rules
 * (style.ts) and packs them into the atlas. Not part of the game build;
 * scripts/build-icons.mjs opens this page under a Vite dev server and calls
 * window.iconStudio. Opened by hand (npm run dev, /src/icon-studio/), it shows
 * every model at 96 px next to its small cell at 48 px.
 */
import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import { AVATAR_LOOKS } from '../ui/core/iconMap';
import { isIconId } from '../ui/core/icons';
import { iconSvgMarkup } from '../ui/core/iconSvg';
import { ATLAS_IDS, type AtlasCell, type AtlasManifest, AVATAR_IDS, BUDGET, CELL, orderIds, packAtlas, SHEET_IDS, SMALL_CELL } from './atlas';
import { MODELS } from './models';
import { createStage, type Look, LOOKS } from './style';

/** Each icon is drawn this many times larger than its @2x cell, then halved step by step. */
const SUPERSAMPLE = 4;
/**
 * Encodings tried in order until the image fits its budget (BUDGET in
 * atlas.ts): lossy WebP quality for colour, and how many alpha levels are
 * kept. Chromium stores alpha losslessly whatever the quality, so fewer
 * alpha levels (edges and soft shadows) save more than a lower quality.
 */
const ENCODINGS = [
  { quality: 0.85, alphaLevels: 256 },
  { quality: 0.8, alphaLevels: 256 },
  { quality: 0.85, alphaLevels: 64 },
  { quality: 0.85, alphaLevels: 32 },
  { quality: 0.8, alphaLevels: 32 },
  { quality: 0.8, alphaLevels: 16 },
  { quality: 0.7, alphaLevels: 16 },
  { quality: 0.7, alphaLevels: 8 },
  { quality: 0.6, alphaLevels: 8 },
] as const;
/** Sizes compared on the report sheet, CSS px: 16 and 24 show the small cell, 48 the large one. */
const SHEET_SIZES = [16, 24, 48] as const;

const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = SRGBColorSpace;
// Token colours stay as specified; the game's NeutralToneMapping would shift them.
renderer.toneMapping = NoToneMapping;
const stage = createStage();

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Halves `src` until it is `px` wide. */
function shrink(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  let out = src;
  while (out.width > px) {
    const next = canvas(Math.max(px, out.width / 2));
    context(next).drawImage(out, 0, 0, next.width, next.height);
    out = next;
  }
  return out;
}

function hasModel(id: string): boolean {
  return ATLAS_IDS.includes(id) && Object.hasOwn(MODELS, id);
}

type Scaled = { 1: HTMLCanvasElement; 2: HTMLCanvasElement };

/** The icon drawn in `look` at @2x and @1x of `cell` px. */
function renderLook(id: string, look: Look, cell: number): Scaled {
  const build = MODELS[id];
  if (!build) throw new Error(`No model for ${id}`);
  stage.show(build(), look);
  const size = cell * 2 * SUPERSAMPLE;
  renderer.setSize(size, size, false);
  renderer.render(stage.scene, stage.camera);
  const full = canvas(size);
  const ctx = context(full);
  const { contrast, saturate } = LOOKS[look];
  if (contrast !== 1 || saturate !== 1) ctx.filter = `contrast(${contrast}) saturate(${saturate})`;
  ctx.drawImage(renderer.domElement, 0, 0);
  const x2 = shrink(full, cell * 2);
  return { 2: x2, 1: shrink(x2, cell) };
}

/** The icon's large (48 px) and small (24 px) cells. */
function renderIcon(id: string): { large: Scaled; small: Scaled } {
  return { large: renderLook(id, 'regular', CELL), small: renderLook(id, 'small', SMALL_CELL) };
}

/** Byte length of a base64 data URL's payload. */
function dataUrlBytes(url: string): number {
  const b64 = url.slice(url.indexOf(',') + 1);
  return (b64.length * 3) / 4 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

/** A copy of `src` with alpha rounded to `levels` evenly spaced values (0 and 255 kept). */
function quantizeAlpha(src: HTMLCanvasElement, levels: number): HTMLCanvasElement {
  if (levels >= 256) return src;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  const img = src.getContext('2d')!.getImageData(0, 0, src.width, src.height);
  const step = 255 / (levels - 1);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = Math.round(Math.round(d[i]! / step) * step);
  ctx.putImageData(img, 0, 0);
  return out;
}

export interface Encoded {
  url: string;
  quality: number;
  alphaLevels: number;
  bytes: number;
}

/** The atlas as WebP with the first of ENCODINGS that fits `budget` bytes; throws with every size tried when none does. */
function encode(atlas: HTMLCanvasElement, budget: number): Encoded {
  const tried: string[] = [];
  for (const { quality, alphaLevels } of ENCODINGS) {
    const url = quantizeAlpha(atlas, alphaLevels).toDataURL('image/webp', quality);
    const bytes = dataUrlBytes(url);
    if (bytes <= budget) return { url, quality, alphaLevels, bytes };
    tried.push(`q${quality}/a${alphaLevels}: ${bytes}`);
  }
  throw new Error(`Atlas ${atlas.width}x${atlas.height} is over ${budget} bytes with every encoding (${tried.join(', ')})`);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export interface BuildInput {
  /** Ids to render now. */
  render: string[];
  /** Current atlas; its other icons are copied over unchanged (--only). */
  previous?: { manifest: AtlasManifest; images: { 1: string; 2: string } };
}

export interface BuildOutput {
  manifest: AtlasManifest;
  /** WebP data URLs. */
  images: { 1: string; 2: string };
  /** Encoding each image ended up with, for the build log. */
  encodings: { 1: Omit<Encoded, 'url'>; 2: Omit<Encoded, 'url'> };
}

async function build(input: BuildInput): Promise<BuildOutput> {
  const missing = input.render.filter((id) => !hasModel(id));
  if (missing.length) throw new Error(`No model for: ${missing.join(', ')}`);
  // --only keeps cells from the current atlas only when it has the same layout (both cell sizes).
  const prevManifest = input.previous?.manifest;
  const prev = prevManifest?.version === 2 && prevManifest.cell === CELL && prevManifest.small?.cell === SMALL_CELL ? input.previous : undefined;
  const keep = prev ? Object.keys(prev.manifest.icons).filter((id) => hasModel(id) && !input.render.includes(id)) : [];
  const ids = orderIds([...keep, ...input.render], ATLAS_IDS);
  const manifest = packAtlas(ids);
  const rendered = new Map(orderIds(input.render, ATLAS_IDS).map((id) => [id, renderIcon(id)]));
  const images = { 1: '', 2: '' };
  const encodings = {} as BuildOutput['encodings'];
  for (const scale of [1, 2] as const) {
    const atlas = document.createElement('canvas');
    atlas.width = manifest.width * scale;
    atlas.height = manifest.height * scale;
    const ctx = context(atlas);
    const old = prev ? await loadImage(prev.images[scale]) : undefined;
    const put = (cell: AtlasCell, fresh: HTMLCanvasElement | undefined, from: AtlasCell | undefined) => {
      const [x, y, s] = [cell.x * scale, cell.y * scale, cell.w * scale];
      if (fresh) ctx.drawImage(fresh, x, y, s, s);
      else ctx.drawImage(old!, from!.x * scale, from!.y * scale, from!.w * scale, from!.h * scale, x, y, s, s);
    };
    for (const id of ids) {
      const fresh = rendered.get(id);
      put(manifest.icons[id]!, fresh?.large[scale], prev?.manifest.icons[id]);
      put(manifest.smallIcons[id]!, fresh?.small[scale], prev?.manifest.smallIcons[id]);
    }
    const { url, ...used } = encode(atlas, BUDGET[scale]);
    images[scale] = url;
    encodings[scale] = used;
  }
  return { manifest, images, encodings };
}

/** One 3D icon from the atlas as a CSS sprite, `size` px square: the small cell up to its size, else the large one. */
function sprite(manifest: AtlasManifest, url: string, id: string, size: number): HTMLElement {
  const cell = size <= manifest.small.cell ? manifest.smallIcons[id]! : manifest.icons[id]!;
  const k = size / cell.w;
  const el = document.createElement('i');
  el.className = 'sprite';
  el.style.cssText = `width:${size}px;height:${size}px;background-image:url(${url});background-size:${manifest.width * k}px ${manifest.height * k}px;background-position:${-cell.x * k}px ${-cell.y * k}px`;
  return el;
}

/** The old flat SVG of an atlas id (an avatar cell wears its look), `size` px; empty when there is none. */
function flatSvg(id: string, size = 24): string {
  const look = AVATAR_LOOKS[AVATAR_IDS.indexOf(id)];
  if (look) return iconSvgMarkup('i-avatar', { size, skin: look.skin, hair: look.hair });
  return isIconId(id) ? iconSvgMarkup(id, { size }) : '';
}

/** Id → old flat SVG at 24 px for every atlas id that has one, for public/icons3d/svg.json. */
function flatSvgs(): Record<string, string> {
  return Object.fromEntries(ATLAS_IDS.map((id) => [id, flatSvg(id)] as const).filter(([, svg]) => svg));
}

/** Old SVG next to the new 3D icon at 16/24/48 px for the SHEET_IDS in the atlas, in #sheet. */
async function showSheet(out: BuildOutput): Promise<void> {
  const sheet = document.getElementById('sheet')!;
  sheet.replaceChildren();
  const head = document.createElement('div');
  head.className = 'row head';
  head.innerHTML = `<span>id</span><span>SVG ${SHEET_SIZES.join(' / ')} px</span><span>3D ${SHEET_SIZES.join(' / ')} px</span>`;
  sheet.append(head);
  await loadImage(out.images[2]);
  for (const id of SHEET_IDS) {
    if (!out.manifest.icons[id] || !flatSvg(id)) continue;
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('code');
    name.textContent = id;
    const svg = document.createElement('span');
    svg.innerHTML = SHEET_SIZES.map((size) => flatSvg(id, size)).join('');
    const solid = document.createElement('span');
    solid.append(...SHEET_SIZES.map((size) => sprite(out.manifest, out.images[2], id, size)));
    row.append(name, svg, solid);
    sheet.append(row);
  }
}

/** Every model at 96 px, and its small cell at 48 px, for working on models by hand. */
function showPreview(): void {
  const preview = document.getElementById('preview')!;
  for (const id of ATLAS_IDS) {
    if (!hasModel(id)) continue;
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = id;
    const { large, small } = renderIcon(id);
    fig.append(large[2], small[2], cap);
    preview.append(fig);
  }
}

declare global {
  interface Window {
    iconStudio: {
      /** Ids that have a model, in app order. */
      ids: string[];
      build(input: BuildInput): Promise<BuildOutput>;
      showSheet(out: BuildOutput): Promise<void>;
      flatSvgs(): Record<string, string>;
    };
  }
}

window.iconStudio = { ids: ATLAS_IDS.filter(hasModel), build, showSheet, flatSvgs };
if (!new URLSearchParams(location.search).has('headless')) showPreview();
