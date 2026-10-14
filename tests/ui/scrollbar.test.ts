// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCROLL_IDLE_MS, SCROLLING_CLASS, trackScrollActivity } from '../../src/ui/core/scrollActivity';

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
// Under jsdom the global URL is jsdom's, which node:fs rejects; pass a plain path.
const readSrc = (rel: string): string => readFileSync(decodeURIComponent(new URL(rel, import.meta.url).pathname), 'utf8');
const SCROLLBAR_CSS = readSrc('../../src/ui/styles/scrollbar.css');
const UI_CSS = readSrc('../../src/ui/styles/ui.css');
const MAIN_TS = readSrc('../../src/main.ts');

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media/@supports included). */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }));
}

function selectors(rule: Rule): string[] {
  return rule.selector.split(',').map((s) => s.trim());
}

/** Body of the `@supports not (scrollbar-color: auto) { … }` block. */
function supportsFallback(css: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = src.indexOf('@supports not (scrollbar-color: auto)');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unclosed @supports block');
}

describe('scrollActivity', () => {
  let stop: () => void;
  let a: HTMLElement;
  let b: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    a = document.createElement('div');
    b = document.createElement('div');
    document.body.append(a, b);
    stop = trackScrollActivity(document);
  });
  afterEach(() => {
    stop();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  const scroll = (el: Element): boolean => el.dispatchEvent(new Event('scroll'));

  it('adds .is-scrolling on scroll and removes it after the idle delay', () => {
    scroll(a);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(true);
    expect(b.classList.contains(SCROLLING_CLASS)).toBe(false);
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 1);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
  });

  it('keeps the class while scrolling continues and runs one timer at a time', () => {
    scroll(a);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(200);
      scroll(a);
    }
    expect(vi.getTimerCount()).toBe(1);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 1);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tracks each scroll area on its own clock', () => {
    scroll(a);
    vi.advanceTimersByTime(500);
    scroll(b);
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 500);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
    expect(b.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(b.classList.contains(SCROLLING_CLASS)).toBe(false);
  });

  it('listens in the capture phase, so nested scroll areas are seen', () => {
    const inner = document.createElement('div');
    a.append(inner);
    // A scroll event on an element does not bubble.
    inner.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(inner.classList.contains(SCROLLING_CLASS)).toBe(true);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
  });

  it('stop() removes the listener, the timer and the class', () => {
    scroll(a);
    stop();
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    scroll(a);
    expect(a.classList.contains(SCROLLING_CLASS)).toBe(false);
  });
});

describe('scrollbar.css', () => {
  const all = rules(SCROLLBAR_CSS);
  const base = all.find((r) => selectors(r).includes('.panel-body') && /scrollbar-width/.test(r.body));

  it('is loaded right after ui.css', () => {
    expect(MAIN_TS).toMatch(/import '\.\/ui\/styles\/ui\.css';\s*import '\.\/ui\/styles\/scrollbar\.css';/);
  });

  it('covers every overflow: auto scroll area in ui.css', () => {
    const scrollers = rules(UI_CSS)
      .filter((r) => /overflow(-y)?:\s*(auto|scroll)/.test(r.body))
      .flatMap(selectors);
    expect(scrollers.length).toBeGreaterThan(0);
    for (const s of scrollers) expect(selectors(base!)).toContain(s);
  });

  it('uses a thin standard bar with a token thumb, a clear track and a stable gutter', () => {
    expect(base).toBeDefined();
    expect(base!.body).toMatch(/scrollbar-width:\s*thin/);
    expect(base!.body).toMatch(/scrollbar-color:\s*var\(--sb-thumb\)\s+transparent/);
    expect(base!.body).toMatch(/scrollbar-gutter:\s*stable/);
    expect(base!.body).toMatch(/--sb-thumb:\s*transparent/);
    expect(base!.body).toMatch(/var\(--border-outline\)/);
  });

  it('shows the thumb only on hover, focus-within or while scrolling', () => {
    const shown = all.filter((r) => /--sb-thumb:\s*var\(--sb-thumb-(shown|active)\)/.test(r.body)).flatMap(selectors);
    for (const area of ['.ui-screen', '.panel-body']) {
      for (const state of [':hover', ':focus-within', `.${SCROLLING_CLASS}`]) expect(shown).toContain(`${area}${state}`);
    }
  });

  it('falls back to ::-webkit-scrollbar only without scrollbar-color support', () => {
    const fallback = supportsFallback(SCROLLBAR_CSS);
    const inner = rules(fallback);
    const bar = inner.find((r) => selectors(r).includes('.panel-body::-webkit-scrollbar'));
    expect(bar?.body).toMatch(/width:\s*8px/);
    const thumb = inner.find((r) => selectors(r).includes('.panel-body::-webkit-scrollbar-thumb'));
    expect(thumb?.body).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(thumb?.body).toMatch(/background:\s*transparent/);
    const shown = inner.find((r) => selectors(r).includes('.panel-body.is-scrolling::-webkit-scrollbar-thumb'));
    expect(shown?.body).toMatch(/border-color:\s*var\(--border-outline\)/);
    // No WebKit pseudo-element outside the fallback, so Chrome 121+ keeps the standard bar.
    expect(SCROLLBAR_CSS.replace(fallback, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/::-webkit-scrollbar/);
  });

  it('drops the colour transition under prefers-reduced-motion', () => {
    const src = SCROLLBAR_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const at = src.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(at).toBeGreaterThanOrEqual(0);
    const reduced = rules(src.slice(at)).find((r) => selectors(r).includes('.panel-body'));
    expect(reduced?.body).toMatch(/transition:\s*none/);
  });
});
