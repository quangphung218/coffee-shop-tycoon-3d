import { describe, expect, it } from 'vitest';

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};
const tokensCss = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');
const uiCss = readFileSync(new URL('../../src/ui/styles/ui.css', import.meta.url), 'utf8');

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media included). */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }));
}

/** Value of a custom property declared in tokens.css :root. */
function token(name: string): string | undefined {
  const m = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m?.[1]?.trim();
}

describe('ui.css [hidden]', () => {
  it('has one global [hidden] rule that beats component display values', () => {
    const hidden = rules(uiCss).filter((r) => r.selector === '[hidden]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.body).toMatch(/display:\s*none\s*!important/);
  });

  it('declares [hidden] before any component rule', () => {
    const first = rules(uiCss)[0];
    expect(first?.selector).toBe('[hidden]');
  });

  it('drops the per-component [hidden] rules', () => {
    const scoped = rules(uiCss).filter((r) => /\S\[hidden\]/.test(r.selector));
    expect(scoped.map((r) => r.selector)).toEqual([]);
  });
});

describe('ui.css focus (P17 inset ring)', () => {
  const focus = rules(uiCss).filter((r) => r.selector.includes(':focus-visible'));

  it('has :focus-visible rules and no plain :focus rules', () => {
    expect(focus.length).toBeGreaterThan(0);
    expect(rules(uiCss).filter((r) => /:focus(?![-\w])/.test(r.selector))).toEqual([]);
  });

  it('never pushes the ring outside the border', () => {
    for (const r of focus) {
      expect(r.body, r.selector).not.toContain('var(--size-focus-offset)');
      const offset = r.body.match(/outline-offset:\s*([^;]+)/)?.[1]?.trim();
      if (offset === undefined) continue;
      expect(offset === '0' || offset.startsWith('calc(-1 *'), `${r.selector}: ${offset}`).toBe(true);
    }
  });

  it('draws the shared ring inside the border on every common control', () => {
    const shared = focus.find((r) => r.selector.includes('.btn:focus-visible'));
    expect(shared).toBeDefined();
    for (const sel of [
      '.btn:focus-visible',
      '.input:focus-visible',
      '.icon-btn:focus-visible',
      '.choice:has(input:focus-visible)',
      '.seg-opt input:focus-visible + span',
      '.toggle:focus-visible .toggle-track',
    ]) {
      expect(shared!.selector).toContain(sel);
    }
    expect(shared!.body).toMatch(/border-color:\s*var\(--focus-ring\)/);
    expect(shared!.body).toMatch(/outline:\s*var\(--size-focus-width\) solid var\(--focus-ring\)/);
    expect(shared!.body).toMatch(/outline-offset:\s*calc\(-1 \* \(var\(--bw\) \+ var\(--size-focus-width\)\)\)/);
  });
});

describe('tokens.css', () => {
  it('uses the warm cinnamon focus colour, not the old blue', () => {
    expect(token('--color-cinnamon-700')).toBe('#7a3000');
    expect(token('--color-focus-500')).toBe('var(--color-cinnamon-700)');
    expect(token('--focus-ring')).toBe('var(--color-focus-500)');
    expect(tokensCss).not.toContain('#0b57d0');
  });

  it('keeps the deprecated focus offset at zero', () => {
    expect(token('--size-focus-offset')).toBe('0px');
  });

  it('adds the cartoon outline, shadow and group tokens', () => {
    expect(token('--size-outline')).toBe('3px');
    expect(token('--border-outline')).toBe('var(--color-neutral-900)');
    expect(token('--shadow-md')).toBe('0 4px 0 0 var(--color-neutral-900)');
    expect(token('--size-focus-clearance')).toBe('4px');
    expect(token('--size-group-gap')).toBe('var(--space-1)');
  });

  it('puts Nunito first in the base font stack', () => {
    expect(token('--font-family-base')).toMatch(/^'Nunito',/);
  });

  it('zeroes the long animations for reduced motion', () => {
    expect(tokensCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--duration-pop:\s*0ms/);
  });
});
