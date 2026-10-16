// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MAIN_TS from '../../src/main.ts?raw';
import { enableHdIcons, ICON_ATLAS_URLS, ICONS_HD_CLASS, ICONS_READY_CLASS, icon, watchIconAtlas } from '../../src/ui/core/icons';

// P22 f1: menu icons show a still placeholder tile until the @1x atlas is in
// (html.icons-ready), and the @2x atlas only loads once the 3D scene is up
// (html.icons-hd), so it does not compete with the three.js chunk.

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
// Under jsdom the global URL is jsdom's, which node:fs rejects; use a path
// from the project root (vitest's cwd).
const UI_CSS = readFileSync('src/ui/styles/ui.css', 'utf8');

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media included). */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }));
}

const ALL = rules(UI_CSS);
const PLACEHOLDER = 'html:not(.icons-ready, .icons-hd) .ic';

function rule(selector: string): Rule {
  const found = ALL.filter((r) => r.selector === selector);
  expect(found, selector).toHaveLength(1);
  return found[0]!;
}

/** Body of the `@media (prefers-reduced-motion: reduce) { … }` block. */
function reducedMotionBlock(): string {
  const src = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = src.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(open + 1, i);
}

/** Every Image created by the code under test, so a test can fire its load or error. */
let images: HTMLImageElement[] = [];
const RealImage = globalThis.Image;
const html = document.documentElement;

beforeEach(() => {
  images = [];
  globalThis.Image = class extends RealImage {
    constructor() {
      super();
      images.push(this);
    }
  } as typeof Image;
  html.classList.remove(ICONS_READY_CLASS, ICONS_HD_CLASS);
});

afterEach(() => {
  globalThis.Image = RealImage;
  html.classList.remove(ICONS_READY_CLASS, ICONS_HD_CLASS);
  document.body.replaceChildren();
});

describe('html.icons-ready (@1x atlas)', () => {
  it('is not set while the @1x atlas is loading', () => {
    watchIconAtlas();
    expect(images).toHaveLength(1);
    expect(images[0]!.getAttribute('src')).toBe(ICON_ATLAS_URLS[1]);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
  });

  it('is set on <html> by default once the @1x atlas has loaded, without icons-hd', () => {
    watchIconAtlas();
    images[0]!.onload?.(new Event('load'));
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(true);
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
  });

  it('never requests the @2x atlas for the menu', () => {
    watchIconAtlas();
    images[0]!.onload?.(new Event('load'));
    expect(images.map((img) => img.getAttribute('src'))).toEqual([ICON_ATLAS_URLS[1]]);
  });

  it('loads the same @1x file that ui.css draws from', () => {
    const file = ICON_ATLAS_URLS[1].split('/').pop()!;
    expect(rule('html.icons-ready .ic').body).toContain(`url('/icons3d/${file}')`);
  });
});

describe('a failed @1x load', () => {
  it('keeps the placeholder tile on every icon and leaves the box size alone', () => {
    const el = icon('i-sparkle', { size: 32 });
    document.body.append(el);
    const before = { className: el.className, style: el.getAttribute('style') };
    const win = new EventTarget() as Window;
    watchIconAtlas(html, win);
    images[0]!.onerror?.(new Event('error'));
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
    expect(el.matches(PLACEHOLDER)).toBe(true);
    expect({ className: el.className, style: el.getAttribute('style') }).toEqual(before);
    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  it('retries once when back online and only marks ready on a real load', () => {
    const win = new EventTarget() as Window;
    watchIconAtlas(html, win);
    images[0]!.onerror?.(new Event('error'));
    win.dispatchEvent(new Event('online'));
    expect(images).toHaveLength(2);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
    images[1]!.onload?.(new Event('load'));
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(true);
  });

  it('gives up after the retry fails, still on placeholders', () => {
    const win = new EventTarget() as Window;
    watchIconAtlas(html, win);
    images[0]!.onerror?.(new Event('error'));
    win.dispatchEvent(new Event('online'));
    images[1]!.onerror?.(new Event('error'));
    win.dispatchEvent(new Event('online'));
    win.dispatchEvent(new Event('online'));
    expect(images).toHaveLength(2);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
  });
});

describe('html.icons-hd (@2x atlas)', () => {
  it('waits for the @2x load and is added only when it succeeds', async () => {
    let done!: () => void;
    const pending = enableHdIcons(html, () => new Promise<void>((resolve) => (done = resolve)));
    await Promise.resolve();
    await Promise.resolve();
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
    done();
    await pending;
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(true);
  });

  it('is not added on a failed load, and the call does not throw', async () => {
    await expect(enableHdIcons(html, () => Promise.reject(new Error('offline')))).resolves.toBeUndefined();
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
  });

  it('loads the @2x atlas by default', async () => {
    const pending = enableHdIcons();
    expect(images.map((img) => img.getAttribute('src'))).toEqual([ICON_ATLAS_URLS[2]]);
    images[0]!.onload?.(new Event('load'));
    await pending;
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(true);
  });

  it('is turned on by main.ts only in the scene-ready branch, after cst:world', () => {
    const src = MAIN_TS.replace(/\/\/.*$/gm, '');
    const calls = [...src.matchAll(/enableHdIcons\(\)/g)].map((m) => m.index!);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    const ready = src.lastIndexOf("scene.set({ status: 'ready'", call);
    const world = src.lastIndexOf("performance.mark('cst:world')", call);
    expect(ready).toBeGreaterThan(-1);
    expect(world).toBeGreaterThan(ready);
    // Same .then block: no catch or failure branch between the mark and the call.
    expect(src.slice(world, call)).not.toMatch(/catch|status: 'error'/);
  });

  it('starts the @1x watch in main.ts before the menu mark, independent of the scene', () => {
    const src = MAIN_TS.replace(/\/\/.*$/gm, '');
    const start = src.indexOf('function start(');
    const watch = src.indexOf('watchIconAtlas()', start);
    expect(watch).toBeGreaterThan(start);
    expect(watch).toBeLessThan(src.indexOf("performance.mark('cst:menu')"));
    expect(watch).toBeLessThan(src.indexOf("performance.mark('cst:world')"));
  });
});

describe('ui.css placeholder tile', () => {
  it('matches only while neither atlas class is on <html>', () => {
    const el = icon('i-sparkle');
    document.body.append(el);
    expect(el.matches(PLACEHOLDER)).toBe(true);
    html.classList.add(ICONS_READY_CLASS);
    expect(el.matches(PLACEHOLDER)).toBe(false);
    html.classList.replace(ICONS_READY_CLASS, ICONS_HD_CLASS);
    expect(el.matches(PLACEHOLDER)).toBe(false);
  });

  it('draws a tile without an image, so nothing is fetched before the atlas is ready', () => {
    const body = rule(PLACEHOLDER).body;
    expect(body).toMatch(/background-color:/);
    expect(body).not.toMatch(/background-image|url\(/);
    expect(rule('.ic').body).not.toMatch(/background-image|url\(/);
  });

  it('only sets the box size in the size rules, never in a loading-state rule', () => {
    const sizing = /(^|;)\s*(width|height|min-width|min-height|padding|margin|border(-width)?|font-size)\s*:/;
    const stateRules = ALL.filter((r) => /icons-(ready|hd)/.test(r.selector));
    expect(stateRules.map((r) => r.selector)).toEqual([PLACEHOLDER, 'html.icons-ready .ic', 'html.icons-hd .ic']);
    for (const r of stateRules) expect(r.body, r.selector).not.toMatch(sizing);
    expect(rule('.ic').body).toMatch(/width:\s*var\(--size-icon-md\)/);
    expect(rule('.ic').body).toMatch(/height:\s*var\(--size-icon-md\)/);
  });

  it('is still: no animation or transition on the placeholder', () => {
    expect(rule(PLACEHOLDER).body).not.toMatch(/animation|transition|transform/);
    const shimmer = ALL.filter((r) => /icons-(ready|hd)/.test(r.selector) && /animation/.test(r.body));
    expect(shimmer).toEqual([]);
  });

  it('uses the @2x atlas only under html.icons-hd', () => {
    const with2x = ALL.filter((r) => r.body.includes('atlas@2x'));
    expect(with2x.map((r) => r.selector)).toEqual(['html.icons-hd .ic']);
    // A browser without image-set() keeps the @1x declaration before it.
    const hd = rule('html.icons-hd .ic').body;
    expect(hd.indexOf("url('/icons3d/atlas@1x.webp');")).toBeLessThan(hd.indexOf('image-set('));
  });
});

describe('ui.css icons under reduced motion', () => {
  it('holds .ic still when the OS asks for reduced motion', () => {
    const block = reducedMotionBlock();
    const still = rules(block).find((r) => r.selector.split(',').map((s) => s.trim()).includes('.ic'));
    expect(still, 'no .ic rule in @media (prefers-reduced-motion: reduce)').toBeDefined();
    expect(still!.body).toMatch(/transform:\s*none\s*!important/);
    const cuts = rules(block).find((r) => r.selector.includes('#ui *'));
    expect(cuts!.body).toMatch(/transition-duration:\s*1ms\s*!important/);
    expect(cuts!.body).toMatch(/animation-duration:\s*1ms\s*!important/);
  });

  it('holds .ic still with the in-game "Giảm chuyển động" setting (html.reduce-motion)', () => {
    const still = ALL.find((r) => r.selector.split(',').map((s) => s.trim()).includes('html.reduce-motion .ic'));
    expect(still).toBeDefined();
    expect(still!.body).toMatch(/transform:\s*none\s*!important/);
    const el = icon('i-sparkle');
    document.body.append(el);
    html.classList.add('reduce-motion');
    try {
      expect(el.matches('html.reduce-motion .ic')).toBe(true);
    } finally {
      html.classList.remove('reduce-motion');
    }
  });
});
