import { describe, expect, it } from 'vitest';

// Guards against the P19 side-panel overflow (Kho cut on the left, "Đủ" past
// the right edge) by reading the CSS; jsdom has no layout, so the real
// scrollWidth <= clientWidth check runs in the browser measurement instead.

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const UI_CSS = read('../../src/ui/styles/ui.css');
const PANELS_CSS = read('../../src/ui/panels/panels.css');
const REPORT_CSS = read('../../src/ui/report/report.css');

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media included). */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }))
    .filter((r) => !r.selector.startsWith('@') && !/^(from|to|\d+%)/.test(r.selector));
}

/** Value of one declaration in a rule body. */
function decl(body: string, prop: string): string | undefined {
  return body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim();
}

/** A track list with every minmax(…) removed, nested parentheses included. */
function withoutMinmax(tracks: string): string {
  let out = tracks;
  for (let i = out.indexOf('minmax('); i >= 0; i = out.indexOf('minmax(')) {
    let depth = 0;
    let end = i + 'minmax'.length;
    for (; end < out.length; end++) {
      if (out[end] === '(') depth++;
      else if (out[end] === ')' && --depth === 0) break;
    }
    out = out.slice(0, i) + out.slice(end + 1);
  }
  return out;
}

const ALL = [...rules(UI_CSS), ...rules(PANELS_CSS), ...rules(REPORT_CSS)];
const PANELS = rules(PANELS_CSS);

describe('panel side margins (P19 overflow root cause)', () => {
  const prepMargins = PANELS.filter((r) => r.selector.includes('.prep') && decl(r.body, 'margin-inline') !== undefined);

  it('insets the children of a panel with a foot by --space-4', () => {
    expect(prepMargins.map((r) => r.selector)).toEqual(['.prep:has(> .panel-foot) > :not(.panel-foot)']);
    expect(decl(prepMargins[0]!.body, 'margin-inline')).toBe('var(--space-4)');
  });

  it('resets width: 100% on those children, so width plus margin never passes the panel', () => {
    const fullWidth = ALL.filter((r) => decl(r.body, 'width') === '100%').map((r) => r.selector);
    // .btn-block (Auto-restock, Nhập hàng) and .input are the full-width classes a panel child can carry.
    expect(fullWidth).toContain('.btn-block');
    expect(fullWidth).toContain('.input');
    for (const r of prepMargins) {
      expect(decl(r.body, 'width'), r.selector).toBe('auto');
      expect(decl(r.body, 'align-self'), r.selector).toBe('stretch');
    }
  });

  it('never gives a rule both width: 100% and a side margin', () => {
    for (const r of ALL) {
      if (decl(r.body, 'width') !== '100%') continue;
      for (const prop of ['margin-inline', 'margin-left', 'margin-right']) {
        const v = decl(r.body, prop);
        expect(v === undefined || v === '0', `${r.selector} ${prop}: ${v}`).toBe(true);
      }
    }
  });

  it('no .prep rule sets width: 100% on a child', () => {
    for (const r of PANELS.filter((x) => x.selector.includes('.prep'))) {
      expect(decl(r.body, 'width'), r.selector).not.toBe('100%');
    }
  });

  it('keeps .prep from widening the scroll area', () => {
    const prep = PANELS.find((r) => r.selector === '.prep');
    expect(prep).toBeDefined();
    expect(decl(prep!.body, 'min-width')).toBe('0');
    expect(decl(prep!.body, 'overflow-x')).toBe('clip');
    expect(decl(prep!.body, 'overflow-wrap')).toBe('break-word');
  });
});

describe('panel and report grids shrink with the panel', () => {
  it.each(['.item', '.task', '.staff'])('%s puts every fr column in minmax(0, …)', (selector) => {
    const cols = PANELS.filter((r) => r.selector === selector).map((r) => decl(r.body, 'grid-template-columns'));
    expect(cols.length, selector).toBeGreaterThan(0);
    for (const c of cols) {
      expect(c, selector).toBeDefined();
      expect(c, selector).toMatch(/minmax\(0, /);
      expect(withoutMinmax(c!), `${selector}: ${c}`).not.toMatch(/\dfr\b/);
    }
  });

  it('no grid in the panels or the report has a bare fr track', () => {
    for (const r of [...PANELS, ...rules(REPORT_CSS)]) {
      const cols = decl(r.body, 'grid-template-columns');
      if (cols === undefined) continue;
      expect(withoutMinmax(cols), `${r.selector}: ${cols}`).not.toMatch(/\dfr\b/);
    }
  });

  it('caps the report column minimum at the card width', () => {
    const grid = rules(REPORT_CSS).find((r) => r.selector === '.rpt-grid');
    expect(decl(grid!.body, 'grid-template-columns')).toContain('minmax(min(var(--size-report-col), 100%), 1fr)');
  });
});

describe('fixed widths inside a panel', () => {
  it('has no bare px min-width that a narrow panel cannot hold', () => {
    for (const r of [...PANELS, ...rules(REPORT_CSS)]) {
      const min = decl(r.body, 'min-width');
      if (min === undefined) continue;
      expect(min, r.selector).not.toMatch(/^\d+px$/);
    }
  });

  it('caps the role dropdown button and list', () => {
    const btn = PANELS.find((r) => r.selector === '.dd-btn');
    expect(decl(btn!.body, 'min-width')).toBe('min(184px, 100%)');
    const list = PANELS.filter((r) => r.selector === '.dd-list').map((r) => decl(r.body, 'min-width'));
    expect(list).toEqual(['max(100%, min(240px, 42vw - var(--space-16)))', 'max(100%, 240px)']);
  });

  it('lets the foot totals wrap instead of pushing past the edge', () => {
    const sum = PANELS.find((r) => r.selector === '.foot-sum');
    expect(decl(sum!.body, 'flex-wrap')).toBe('wrap');
  });
});

describe('padding uses the spacing tokens', () => {
  it.each([
    ['panels.css', PANELS_CSS],
    ['report.css', REPORT_CSS],
  ])('%s pads only with 0 or var(--space-*)', (name, css) => {
    for (const r of rules(css)) {
      for (const prop of ['padding', 'padding-inline', 'padding-left', 'padding-right']) {
        const v = decl(r.body, prop);
        if (v === undefined) continue;
        for (const part of v.split(/\s+/)) expect(part, `${name} ${r.selector} ${prop}: ${v}`).toMatch(/^(0|var\(--space-\d+\))$/);
      }
    }
  });
});
