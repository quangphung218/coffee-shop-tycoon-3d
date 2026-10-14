/**
 * Icon studio: renders the 3D icon models (models/) with the shared rules
 * (style.ts) and packs them into the atlas. Not part of the game build;
 * scripts/build-icons.mjs opens this page under a Vite dev server and calls
 * window.iconStudio. Opened by hand (npm run dev, /src/icon-studio/), it shows
 * every model at 96 px.
 */
import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import { AVATAR_LOOKS } from '../ui/core/iconMap';
import { isIconId } from '../ui/core/icons';
import { iconSvgMarkup } from '../ui/core/iconSvg';
import { ATLAS_IDS, type AtlasManifest, AVATAR_IDS, CELL, orderIds, packAtlas } from './atlas';
import { MODELS } from './models';
import { createStage } from './style';

/** Each icon is drawn this many times larger than its @2x cell, then halved step by step. */
const SUPERSAMPLE = 4;
/** Lossy WebP; 0.85 keeps the full set inside the atlas budget (BUDGET in atlas.ts). */
const WEBP_QUALITY = 0.85;
/** Sizes compared on the report sheet, CSS px. */
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

/** The icon at @2x and @1x cell size. */
function renderIcon(id: string): { 1: HTMLCanvasElement; 2: HTMLCanvasElement } {
  const build = MODELS[id];
  if (!build) throw new Error(`No model for ${id}`);
  stage.show(build());
  const size = CELL * 2 * SUPERSAMPLE;
  renderer.setSize(size, size, false);
  renderer.render(stage.scene, stage.camera);
  const full = canvas(size);
  context(full).drawImage(renderer.domElement, 0, 0);
  const x2 = shrink(full, CELL * 2);
  return { 2: x2, 1: shrink(x2, CELL) };
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
}

async function build(input: BuildInput): Promise<BuildOutput> {
  const missing = input.render.filter((id) => !hasModel(id));
  if (missing.length) throw new Error(`No model for: ${missing.join(', ')}`);
  const prev = input.previous?.manifest.cell === CELL ? input.previous : undefined;
  const keep = prev ? Object.keys(prev.manifest.icons).filter((id) => hasModel(id) && !input.render.includes(id)) : [];
  const ids = orderIds([...keep, ...input.render], ATLAS_IDS);
  const manifest = packAtlas(ids);
  const rendered = new Map(orderIds(input.render, ATLAS_IDS).map((id) => [id, renderIcon(id)]));
  const images = { 1: '', 2: '' };
  for (const scale of [1, 2] as const) {
    const atlas = document.createElement('canvas');
    atlas.width = manifest.width * scale;
    atlas.height = manifest.height * scale;
    const ctx = context(atlas);
    const old = prev ? await loadImage(prev.images[scale]) : undefined;
    for (const id of ids) {
      const cell = manifest.icons[id]!;
      const [x, y, s] = [cell.x * scale, cell.y * scale, cell.w * scale];
      const fresh = rendered.get(id);
      if (fresh) ctx.drawImage(fresh[scale], x, y, s, s);
      else {
        const o = prev!.manifest.icons[id]!;
        ctx.drawImage(old!, o.x * scale, o.y * scale, o.w * scale, o.h * scale, x, y, s, s);
      }
    }
    images[scale] = atlas.toDataURL('image/webp', WEBP_QUALITY);
  }
  return { manifest, images };
}

/** One 3D icon from the atlas as a CSS sprite, `size` px square. */
function sprite(manifest: AtlasManifest, url: string, id: string, size: number): HTMLElement {
  const cell = manifest.icons[id]!;
  const k = size / manifest.cell;
  const el = document.createElement('i');
  el.className = 'sprite';
  el.style.cssText = `width:${size}px;height:${size}px;background-image:url(${url});background-size:${manifest.width * k}px ${manifest.height * k}px;background-position:${-cell.x * k}px ${-cell.y * k}px`;
  return el;
}

/** Old SVG next to the new 3D icon at 16/24/48 px for every icon in the atlas, in #sheet. */
async function showSheet(out: BuildOutput): Promise<void> {
  const sheet = document.getElementById('sheet')!;
  sheet.replaceChildren();
  const head = document.createElement('div');
  head.className = 'row head';
  head.innerHTML = `<span>id</span><span>SVG ${SHEET_SIZES.join(' / ')} px</span><span>3D ${SHEET_SIZES.join(' / ')} px</span>`;
  sheet.append(head);
  await loadImage(out.images[2]);
  for (const id of Object.keys(out.manifest.icons)) {
    const look = AVATAR_LOOKS[AVATAR_IDS.indexOf(id)];
    if (!isIconId(id) && !look) continue;
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('code');
    name.textContent = id;
    const svg = document.createElement('span');
    const markup = (size: number) =>
      look ? iconSvgMarkup('i-avatar', { size, skin: look.skin, hair: look.hair }) : isIconId(id) ? iconSvgMarkup(id, { size }) : '';
    svg.innerHTML = SHEET_SIZES.map(markup).join('');
    const solid = document.createElement('span');
    solid.append(...SHEET_SIZES.map((size) => sprite(out.manifest, out.images[2], id, size)));
    row.append(name, svg, solid);
    sheet.append(row);
  }
}

/** Every model at 96 px, for working on models by hand. */
function showPreview(): void {
  const preview = document.getElementById('preview')!;
  for (const id of ATLAS_IDS) {
    if (!hasModel(id)) continue;
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = id;
    fig.append(renderIcon(id)[2], cap);
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
    };
  }
}

window.iconStudio = { ids: ATLAS_IDS.filter(hasModel), build, showSheet };
if (!new URLSearchParams(location.search).has('headless')) showPreview();
