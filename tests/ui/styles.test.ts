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
    // `:not([hidden])` only tests whether a layer is open; it hides nothing itself.
    const scoped = rules(uiCss).filter((r) => /\S\[hidden\]/.test(r.selector.replace(/:not\(\[hidden\]\)/g, '')));
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

describe('ui.css icons (3D atlas)', () => {
  const all = rules(uiCss);
  const body = (selector: string): string => all.find((r) => r.selector === selector)?.body ?? '';

  it('gives every size class a fixed box, so nothing moves while the atlas loads', () => {
    const ic = body('.ic');
    expect(ic).toMatch(/width:\s*var\(--size-icon-md\)/);
    expect(ic).toMatch(/height:\s*var\(--size-icon-md\)/);
    expect(ic).toMatch(/display:\s*inline-block/);
    for (const [cls, size] of [['.ic-sm', 'sm'], ['.ic-lg', 'lg'], ['.ic-xl', 'xl']] as const) {
      expect(body(cls), cls).toMatch(new RegExp(`width:\\s*var\\(--size-icon-${size}\\)`));
      expect(body(cls), cls).toMatch(new RegExp(`height:\\s*var\\(--size-icon-${size}\\)`));
    }
  });

  it('draws the cell from the atlas icons.ts fetched (--ic-atlas) once ready, never from a URL of its own', () => {
    const ic = body('.ic');
    expect(ic).not.toContain('background-image');
    expect(body('html.icons-ready .ic,\nhtml.icons-hd .ic')).toMatch(/background-image:\s*var\(--ic-atlas, none\)/);
    expect(uiCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/icons3d|atlas@/);
    expect(ic).toMatch(/background-size:\s*var\(--ic-size/);
    expect(ic).toMatch(/background-position:\s*var\(--ic-pos/);
  });

  it('shows a still, faint wash without an ink line until the atlas is in, only from tokens, without changing the box', () => {
    const wait = body('html:not(.icons-ready, .icons-hd) .ic');
    expect(wait).toMatch(/background-color:\s*var\(--surface-icon-wait\)/);
    expect(wait).not.toMatch(/box-shadow|outline|border-color/);
    expect(wait).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    // A light wash of the ink colour, so it reads on cream and honey buttons alike.
    expect(token('--surface-icon-wait')).toMatch(/^rgba\(58, 34, 22, 0\.(0\d|1\d?)\)$/);
    expect(wait).not.toMatch(/#[0-9a-f]{3,8}\b|\d+(px|%)|--color-/i);
    expect(wait).not.toMatch(/animation|width|height|border:|margin|padding/);
  });

  it('hops on hover and squashes on press, and holds still for reduced motion', () => {
    const moving = all.filter((r) => /:(hover|active) \.ic\b/.test(r.selector));
    expect(moving.some((r) => r.selector.includes(':hover'))).toBe(true);
    expect(moving.some((r) => r.selector.includes(':active'))).toBe(true);
    for (const r of moving) expect(r.body, r.selector).toMatch(/transform:/);
    const reduced = uiCss.slice(uiCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    const still = rules(reduced).find((r) => r.body.includes('transform: none !important'));
    expect(still?.selector.split(',').map((s) => s.trim())).toContain('.ic');
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
    expect(token('--border-outline')).toBe('var(--color-neutral-900)');
    expect(token('--size-focus-clearance')).toBe('4px');
    expect(token('--size-group-gap')).toBe('var(--space-1)');
  });

  it('draws every frame and button with the one 2px P24 outline', () => {
    expect(token('--size-frame-outline')).toBe('2px');
    expect(token('--size-outline')).toBe('var(--size-frame-outline)');
  });

  it('uses the light P24 shadows: 1/2/3px ink and a soft haze', () => {
    expect(token('--shadow-sm-y')).toBe('1px');
    expect(token('--shadow-sm')).toBe('0 var(--shadow-sm-y) 0 0 var(--color-neutral-900)');
    expect(token('--shadow-md')).toBe('0 2px 0 0 var(--color-neutral-900)');
    expect(token('--shadow-lg')).toBe('0 3px 0 0 var(--color-neutral-900)');
    expect(token('--shadow-soft')).toBe('0 6px 14px 0 rgba(58, 34, 22, 0.12)');
    expect(token('--shadow-card')).toBe('var(--shadow-md), var(--shadow-soft)');
    expect(token('--frame-shadow')).toBe('var(--shadow-sm), var(--shadow-soft)');
  });

  it('sets the P24 type steps and control sizes', () => {
    expect(token('--font-size-caption')).toBe('var(--font-size-xs)');
    expect(token('--font-size-label')).toBe('var(--font-size-sm)');
    expect(token('--font-size-value')).toBe('var(--font-size-md)');
    expect(token('--font-size-panel-title')).toBe('var(--font-size-lg)');
    expect(['xs', 'sm', 'md', 'lg'].map((s) => token(`--font-size-${s}`))).toEqual(['12px', '14px', '16px', '20px']);
    expect(token('--size-control-sm')).toBe('32px');
    expect(token('--size-control-md')).toBe('44px');
    expect(token('--size-control-lg')).toBe('56px');
    expect(token('--size-hud-row')).toBe('48px');
  });

  it('puts Nunito first in the base font stack', () => {
    expect(token('--font-family-base')).toMatch(/^'Nunito',/);
  });

  it('zeroes the long animations for reduced motion', () => {
    expect(tokensCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--duration-pop:\s*0ms/);
  });

  it('aliases the button and label tokens to existing depth tokens (no new colours)', () => {
    expect(token('--btn-shadow-rest')).toBe('var(--shadow-md)');
    expect(token('--btn-shadow-hover')).toBe('var(--shadow-lg)');
    expect(token('--btn-shadow-press')).toBe('var(--shadow-sm)');
    expect(token('--label-shadow')).toBe('none');
    expect(token('--label-radius')).toBe('var(--radius-pill)');
  });

  it('also zeroes the long animations when the setting forces reduced motion', () => {
    expect(tokensCss).toMatch(/html\.reduce-motion\s*\{[^}]*--duration-pop:\s*0ms/);
  });
});

describe('ui.css panel head (P24 type scale)', () => {
  const body = (selector: string): string => rules(uiCss).find((r) => r.selector === selector)?.body ?? '';

  it('sets the panel title at the panel-title step (20 px), not the screen-title step', () => {
    expect(body('.panel-head h2')).toMatch(/font-size:\s*var\(--font-size-panel-title\)/);
  });

  it('gives the head a fixed height from --panel-head-h', () => {
    expect(body('.panel-head')).toMatch(/(?:^|;)\s*height:\s*var\(--panel-head-h\)/);
    expect(body('#ui')).toMatch(/--panel-head-h:\s*calc\(var\(--size-hud-row\) \+ 2 \* var\(--space-3\) \+ var\(--size-outline\)\)/);
    expect(body('.panel-head-icon')).toMatch(/width:\s*var\(--size-hud-row\);\s*height:\s*var\(--size-hud-row\)/);
  });

  it('gives the panel the HUD, dock and toast frame shadow', () => {
    expect(body('#ui > .panel')).toMatch(/box-shadow:\s*var\(--frame-shadow\)/);
  });

  it('keeps room under the dock for the frame shadow ink, not the old 6px', () => {
    const spaces = [...uiCss.matchAll(/--dock-space:\s*calc\(([^;]+)\);/g)].map((m) => m[1]!);
    expect(spaces).toHaveLength(2);
    for (const s of spaces) {
      expect(s).toContain('var(--shadow-sm-y)');
      expect(s).not.toMatch(/\d+px/);
    }
  });
});

describe('ui.css toasts with a panel open (UX-109)', () => {
  const all = rules(uiCss);

  it('keeps the stack above the dock: no rule moves it up under the HUD when a panel is open', () => {
    expect(all.find((r) => r.selector === '#ui > .toasts')?.body).toMatch(/bottom:\s*calc\(var\(--dock-h, var\(--dock-space\)\) \+ var\(--space-2\)\)/);
    const moved = all.filter((r) => r.selector.includes('.toasts') && r.selector.includes('aria-pressed'));
    expect(moved).toEqual([]);
    expect(all.filter((r) => /(^|,)\s*#ui[^,]*> \.toasts/.test(r.selector)).map((r) => r.body).join(';')).not.toMatch(/(^|[;\s])top:/);
  });

  it('stays absolute, so nothing else reflows', () => {
    expect(all.find((r) => r.selector === '#ui > .toasts')?.body).toMatch(/position:\s*absolute/);
  });
});

describe('ui.css HUD level chip (design/p20 §4)', () => {
  it('tints the chip and the XP bar through the P20 aliases', () => {
    const all = rules(uiCss);
    const body = (selector: string): string => all.find((r) => r.selector === selector)?.body ?? '';
    expect(body('.hud-level')).toMatch(/background:\s*var\(--level-chip-bg\)/);
    expect(body('.xp')).toMatch(/background:\s*var\(--xp-track\)/);
    expect(body('.xp-fill')).toMatch(/background:\s*var\(--xp-fill\)/);
    expect(token('--level-chip-bg')).toBe('var(--surface-selected)');
    expect(token('--xp-fill')).toBe('var(--data-bar)');
  });

  it('spaces the chip with tokens, no hand-set px', () => {
    const all = rules(uiCss);
    for (const sel of ['.hud-level', '.hud-level .level-body', '.xp-row', '.xp', '.xp-num']) {
      const body = all.find((r) => r.selector === sel)?.body ?? '';
      expect(body, sel).not.toMatch(/\b\d+px\b/);
    }
  });
});

describe('ui.css scene loading rows', () => {
  it('sizes and spaces the component rows with tokens, no hand-set px', () => {
    const all = rules(uiCss);
    for (const sel of ['.scene-load-list', '.scene-load-item']) {
      const body = all.find((r) => r.selector === sel)?.body;
      expect(body, sel).toBeTruthy();
      expect(body, sel).not.toMatch(/\b\d+px\b/);
    }
  });
});

describe('ui.css dock under the Daily Report', () => {
  it('hides the dock (and its badges) while the report is open', () => {
    const rule = rules(uiCss).find((r) => r.selector === '#ui:has(.rpt-layer:not([hidden])) .dock');
    expect(rule?.body).toMatch(/visibility:\s*hidden/);
  });
});

describe('ui.css dock at 390 px', () => {
  /** Innermost rules of the `@media (max-width: 640px)` block that lays the dock out as a grid. */
  function phoneRules(): Rule[] {
    const src = uiCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks: string[] = [];
    for (let i = src.indexOf('@media (max-width: 640px)'); i >= 0; i = src.indexOf('@media (max-width: 640px)', i + 1)) {
      const start = src.indexOf('{', i);
      let depth = 0;
      let end = start;
      for (; end < src.length; end++) {
        if (src[end] === '{') depth++;
        else if (src[end] === '}' && --depth === 0) break;
      }
      blocks.push(src.slice(start + 1, end));
    }
    return rules(blocks.find((b) => /\.dock\s*\{[^}]*grid-template-columns/.test(b)) ?? '');
  }

  it('keeps the divider out of the 4-column grid, so both rows hold whole buttons', () => {
    const phone = phoneRules();
    expect(phone.find((r) => r.selector === '.dock')?.body).toMatch(/grid-template-columns:\s*repeat\(4/);
    expect(phone.find((r) => r.selector === '.dock-sep')?.body).toMatch(/display:\s*none/);
  });

  it('marks a later group on the same row (Đánh giá) with a line that takes no cell', () => {
    const line = phoneRules().find((r) => r.selector === '.dock-sep ~ .dock-sep + .dock-btn::before');
    expect(line?.body).toMatch(/position:\s*absolute/);
  });
});

describe('ui.css buttons vs labels (design/p20 §4)', () => {
  const all = rules(uiCss);
  const body = (selector: string): string => all.find((r) => r.selector === selector)?.body ?? '';

  it('gives a button a bottom shadow, an ink border and a pointer cursor', () => {
    const btn = body('.btn');
    expect(btn).toMatch(/box-shadow:\s*var\(--btn-shadow-rest\)/);
    expect(btn).toMatch(/border:\s*var\(--size-outline\) solid var\(--border-outline\)/);
    expect(btn).toMatch(/cursor:\s*pointer/);
  });

  it('keeps a label flat: no shadow, no pointer cursor, so it never reads as a button', () => {
    const badge = body('.badge');
    expect(badge).toMatch(/box-shadow:\s*var\(--label-shadow\)/);
    expect(badge).not.toMatch(/box-shadow:\s*var\(--shadow-/);
    expect(badge).not.toMatch(/cursor:\s*pointer/);
  });

  it('forces reduced motion through a .reduce-motion class as well as the media query', () => {
    expect(all.some((r) => r.selector.includes('html.reduce-motion') && r.body.includes('transition-duration'))).toBe(true);
  });
});
