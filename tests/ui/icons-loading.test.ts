// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MAIN_TS from '../../src/main.ts?raw';
import { ICON_ATLAS_URLS, ICON_ATLAS_VAR, ICONS_HD_CLASS, ICONS_READY_CLASS, icon } from '../../src/ui/core/icons';

// P22 f1: menu icons show a still placeholder until the @1x atlas is in
// (html.icons-ready), and the @2x atlas only loads once the 3D scene is up
// (html.icons-hd), so it does not compete with the three.js chunk.
// P22 fix2-2: each atlas file is fetched once and handed to ui.css as an
// object URL in --ic-atlas, so the CSS never requests it a second time.

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
const DRAWN = 'html.icons-ready .ic,\nhtml.icons-hd .ic';

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

type Icons = typeof import('../../src/ui/core/icons');

/** A fetch the test answers by hand. */
interface Request {
  url: string;
  init: RequestInit | undefined;
  answer(status?: number): void;
  fail(): void;
}

let requests: Request[] = [];
/** Every bitmap decoded by the code under test. */
let bitmaps: ImageBitmap[] = [];
let blobs = 0;
/** The module under test, fresh per test: its per-atlas cache starts empty. */
let mod: Icons;
const html = document.documentElement;

/** Lets the fetch → blob → bitmap chain move on. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
};

/** Answers request `i` with 200. */
async function deliver(i: number): Promise<void> {
  requests[i]!.answer();
  await settle();
}

const count = (url: string): number => requests.filter((r) => r.url === url).length;

beforeEach(async () => {
  requests = [];
  bitmaps = [];
  blobs = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          requests.push({
            url,
            init,
            answer: (status = 200) => resolve({ ok: status < 400, status, blob: () => Promise.resolve(new Blob([url])) }),
            fail: () => reject(new TypeError('Failed to fetch')),
          });
        }),
    ),
  );
  URL.createObjectURL = () => `blob:atlas-${++blobs}`;
  vi.stubGlobal('createImageBitmap', (blob: Blob) => {
    const bitmap = { width: 0, height: 0, source: blob } as unknown as ImageBitmap;
    bitmaps.push(bitmap);
    return Promise.resolve(bitmap);
  });
  html.classList.remove(ICONS_READY_CLASS, ICONS_HD_CLASS);
  html.style.removeProperty(ICON_ATLAS_VAR);
  vi.resetModules();
  mod = await import('../../src/ui/core/icons');
});

afterEach(() => {
  vi.unstubAllGlobals();
  html.classList.remove(ICONS_READY_CLASS, ICONS_HD_CLASS);
  html.style.removeProperty(ICON_ATLAS_VAR);
  document.body.replaceChildren();
});

describe('html.icons-ready (@1x atlas)', () => {
  it('is not set while the @1x atlas is loading', async () => {
    mod.watchIconAtlas();
    await settle();
    expect(requests.map((r) => r.url)).toEqual([ICON_ATLAS_URLS[1]]);
    expect(requests[0]!.init?.priority).toBe('low');
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('');
  });

  it('is set once the @1x atlas has loaded, with --ic-atlas pointing at the fetched file', async () => {
    mod.watchIconAtlas();
    await deliver(0);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(true);
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('url("blob:atlas-1")');
    // Straight to ui.css: no extra decode or load step before the swap.
    expect(bitmaps).toHaveLength(0);
    expect(performance.getEntriesByName(mod.ICONS_MARK)).not.toHaveLength(0);
  });

  it('sets --ic-atlas before or with icons-ready, never after', async () => {
    const seen: string[] = [];
    const observer = new MutationObserver((records) => seen.push(...records.map((m) => m.attributeName!)));
    observer.observe(html, { attributes: true, attributeFilter: ['class', 'style'] });
    mod.watchIconAtlas();
    await deliver(0);
    observer.disconnect();
    expect(seen).toEqual(['style', 'class']);
  });

  it('fetches the @1x file exactly once, however often it is watched', async () => {
    mod.watchIconAtlas();
    mod.watchIconAtlas();
    await deliver(0);
    mod.watchIconAtlas();
    await settle();
    expect(count(ICON_ATLAS_URLS[1])).toBe(1);
    expect(count(ICON_ATLAS_URLS[2])).toBe(0);
  });

  it('draws only from --ic-atlas in ui.css, with no URL of its own the browser could fetch again', () => {
    expect(rule(DRAWN).body).toMatch(/background-image:\s*var\(--ic-atlas, none\)/);
    expect(UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/atlas@[12]x|image-set\(/);
  });
});

describe('a failed @1x load', () => {
  it('keeps the placeholder on every icon and leaves the box size alone', async () => {
    const el = icon('i-sparkle', { size: 32 });
    document.body.append(el);
    const before = { className: el.className, style: el.getAttribute('style') };
    const win = new EventTarget() as Window;
    mod.watchIconAtlas(html, win);
    requests[0]!.fail();
    await settle();
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('');
    expect(el.matches(PLACEHOLDER)).toBe(true);
    expect({ className: el.className, style: el.getAttribute('style') }).toEqual(before);
  });

  it('treats an HTTP error like a network error', async () => {
    mod.watchIconAtlas(html, new EventTarget() as Window);
    requests[0]!.answer(404);
    await settle();
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('');
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
  });

  it('retries once when back online and only marks ready on a real load', async () => {
    const win = new EventTarget() as Window;
    mod.watchIconAtlas(html, win);
    requests[0]!.fail();
    await settle();
    expect(requests).toHaveLength(1);
    win.dispatchEvent(new Event('online'));
    await settle();
    expect(requests).toHaveLength(2);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
    await deliver(1);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(true);
  });

  it('gives up after the retry fails, still on placeholders', async () => {
    const win = new EventTarget() as Window;
    mod.watchIconAtlas(html, win);
    requests[0]!.fail();
    await settle();
    win.dispatchEvent(new Event('online'));
    await settle();
    requests[1]!.fail();
    await settle();
    win.dispatchEvent(new Event('online'));
    win.dispatchEvent(new Event('online'));
    await settle();
    expect(requests).toHaveLength(2);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(false);
  });
});

describe('html.icons-hd (@2x atlas)', () => {
  const screen2x = { devicePixelRatio: 2 };

  it('waits for the @2x load and is added only when it succeeds', async () => {
    let done!: (url: string) => void;
    const pending = mod.enableHdIcons(html, screen2x, () => new Promise((resolve) => (done = resolve)));
    await settle();
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
    done('blob:hd');
    await pending;
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(true);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('url("blob:hd")');
  });

  it('is not added on a failed load, and the call does not throw', async () => {
    await expect(mod.enableHdIcons(html, screen2x, () => Promise.reject(new Error('offline')))).resolves.toBeUndefined();
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
  });

  it('asks for nothing on a 1x screen', async () => {
    await mod.enableHdIcons(html, { devicePixelRatio: 1 });
    expect(requests).toHaveLength(0);
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(false);
  });

  it('fetches the @2x file once for the DOM and the 3D labels together', async () => {
    const hd = mod.enableHdIcons(html, screen2x);
    const labels = mod.loadIconAtlas();
    await deliver(0);
    await hd;
    const [a, b] = await Promise.all([labels, mod.loadIconAtlas()]);
    expect(count(ICON_ATLAS_URLS[2])).toBe(1);
    expect(a).toBe(b);
    // One decode, and the DOM uses the URL of the same blob.
    expect(bitmaps).toEqual([a]);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('url("blob:atlas-1")');
    expect(html.classList.contains(ICONS_HD_CLASS)).toBe(true);
  });

  it('keeps the @2x image when the @1x one comes in later', async () => {
    mod.watchIconAtlas();
    const hd = mod.enableHdIcons(html, screen2x);
    await deliver(1);
    await hd;
    await deliver(0);
    expect(html.classList.contains(ICONS_READY_CLASS)).toBe(true);
    expect(html.style.getPropertyValue(ICON_ATLAS_VAR)).toBe('url("blob:atlas-1")');
    expect(requests.map((r) => r.url)).toEqual([ICON_ATLAS_URLS[1], ICON_ATLAS_URLS[2]]);
  });

  it('lets the labels retry after a failed @2x fetch', async () => {
    const first = mod.loadIconAtlas();
    requests[0]!.fail();
    await expect(first).rejects.toThrow();
    const second = mod.loadIconAtlas();
    await deliver(1);
    await expect(second).resolves.toBe(bitmaps.at(-1));
    expect(count(ICON_ATLAS_URLS[2])).toBe(2);
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

describe('ui.css placeholder', () => {
  it('matches only while neither atlas class is on <html>', () => {
    const el = icon('i-sparkle');
    document.body.append(el);
    expect(el.matches(PLACEHOLDER)).toBe(true);
    html.classList.add(ICONS_READY_CLASS);
    expect(el.matches(PLACEHOLDER)).toBe(false);
    html.classList.replace(ICONS_READY_CLASS, ICONS_HD_CLASS);
    expect(el.matches(PLACEHOLDER)).toBe(false);
  });

  it('draws a faint wash without an image or an outline, so it does not read as a checkbox', () => {
    const body = rule(PLACEHOLDER).body;
    expect(body).toMatch(/background-color:\s*var\(--surface-icon-wait\)/);
    expect(body).not.toMatch(/background-image|url\(|box-shadow|border(-color|-width)?:|outline/);
    expect(rule('.ic').body).not.toMatch(/background-image|url\(/);
  });

  it('only sets the box size in the size rules, never in a loading-state rule', () => {
    const sizing = /(^|;)\s*(width|height|min-width|min-height|padding|margin|border(-width)?|font-size)\s*:/;
    const stateRules = ALL.filter((r) => /icons-(ready|hd)/.test(r.selector));
    expect(stateRules.map((r) => r.selector)).toEqual([PLACEHOLDER, DRAWN]);
    for (const r of stateRules) expect(r.body, r.selector).not.toMatch(sizing);
    expect(rule('.ic').body).toMatch(/width:\s*var\(--size-icon-md\)/);
    expect(rule('.ic').body).toMatch(/height:\s*var\(--size-icon-md\)/);
  });

  it('is still: no animation or transition on the placeholder', () => {
    expect(rule(PLACEHOLDER).body).not.toMatch(/animation|transition|transform/);
    const shimmer = ALL.filter((r) => /icons-(ready|hd)/.test(r.selector) && /animation/.test(r.body));
    expect(shimmer).toEqual([]);
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
