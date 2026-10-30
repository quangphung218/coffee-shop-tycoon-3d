import { describe, expect, it } from 'vitest';

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { recursive: true }): string[];
};

/**
 * Since P26 the build ships two stylesheets: index-*.css (tokens, ui,
 * scrollbar) in a <link> that vite.config.ts moves into <body> after #boot,
 * and game-*.css (panels, report), which Vite's preload helper appends to
 * <head> when the game chunk loads. game-*.css therefore comes first in the
 * cascade, while up to P25 the one bundled stylesheet put it last: a game
 * rule that tied with a ui.css rule used to win and now loses. Such rules
 * repeat their class (`.rpt-layer.rpt-layer`) to win again; these tests
 * check that every outcome still matches the old "game CSS last" order.
 */
const MAIN = ['src/ui/styles/tokens.css', 'src/ui/styles/ui.css', 'src/ui/styles/scrollbar.css'];
const GAME = ['src/ui/panels/panels.css', 'src/ui/report/report.css'];
/** ui.css ancestors whose markup (loading list, HUD controls, Pause save row) never holds panel or report elements. */
const NEVER_HOLDS_GAME = ['.scene-load', '.hud-controls', '.save-row'];

interface Rule {
  file: string;
  /** Position in the file, for ties within the game stylesheet. */
  index: number;
  selector: string;
  decls: [string, string][];
}

/** Style rules (inside @media/@supports too), skipping @keyframes, @font-face and @property. */
function rules(file: string): Rule[] {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const walk = (text: string): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) return;
      const head = text.slice(i, open).trim();
      let depth = 0;
      let end = open;
      for (; end < text.length; end++) {
        if (text[end] === '{') depth++;
        else if (text[end] === '}' && --depth === 0) break;
      }
      const body = text.slice(open + 1, end);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body);
      else if (!head.startsWith('@')) {
        const decls = splitTop(body, ';')
          .map((d) => /^\s*([-\w]+)\s*:([\s\S]*)$/.exec(d))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m): [string, string] => [m[1]!, m[2]!.replace(/\s+/g, ' ').trim()]);
        for (const selector of splitTop(head, ',')) out.push({ file, index: out.length, selector: selector.trim(), decls });
      }
      i = end + 1;
    }
  };
  walk(src);
  return out;
}

/** Splits on `sep` outside parentheses and brackets. */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

type Spec = [number, number, number];

/** Selector specificity (Selectors 4: :is/:not/:has take their argument's, :where is zero). */
function specificity(sel: string): Spec {
  const s: Spec = [0, 0, 0];
  let i = 0;
  while (i < sel.length) {
    const c = sel[i]!;
    if (c === '#' || c === '.') {
      const m = /^[#.][-\w]+/.exec(sel.slice(i))!;
      s[c === '#' ? 0 : 1]++;
      i += m[0].length;
    } else if (c === '[') {
      s[1]++;
      i = sel.indexOf(']', i) + 1;
    } else if (c === ':') {
      const m = /^(::?)([-\w]+)(\()?/.exec(sel.slice(i))!;
      i += m[0].length;
      let arg = '';
      if (m[3]) {
        const start = i;
        for (let depth = 1; depth > 0; i++) {
          if (sel[i] === '(') depth++;
          else if (sel[i] === ')') depth--;
        }
        arg = sel.slice(start, i - 1);
      }
      const name = m[2]!;
      if (m[1] === '::' || name === 'before' || name === 'after') s[2]++;
      else if (name === 'is' || name === 'not' || name === 'has') {
        const best = splitTop(arg, ',').map((a) => specificity(a.trim())).sort(compare).pop()!;
        s[0] += best[0];
        s[1] += best[1];
        s[2] += best[2];
      } else if (name !== 'where') s[1]++;
    } else if (/[a-z*]/i.test(c)) {
      const m = /^(\*|[a-z][-\w]*)/i.exec(sel.slice(i))!;
      if (m[0] !== '*') s[2]++;
      i += m[0].length;
    } else i++;
  }
  return s;
}

function compare(a: Spec, b: Spec): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The selector as written before P26: a class repeated only to raise specificity counts once. */
function original(sel: string): string {
  return sel.replace(/(\.[-\w]+)\1(?![-\w])/g, '$1');
}

function compounds(sel: string): string[] {
  return splitTop(sel.replace(/\s*([>+~])\s*/g, ' '), ' ').filter(Boolean);
}

/** Classes the styled element needs outside :not()/:has(); state classes (is-*, has-*) are toggled at run time. */
function subjectClasses(sel: string): string[] {
  const own = compounds(sel).pop()!.replace(/:(not|has|where|is)\((?:[^()]|\([^()]*\))*\)/g, '');
  return [...new Set([...own.matchAll(/\.([-\w]+)/g)].map((m) => m[1]!))].filter((c) => !/^(is|has)-/.test(c));
}

function pseudoElement(sel: string): string {
  return /::?(before|after|[-\w]*scrollbar[-\w]*|placeholder|marker)\b/.exec(compounds(sel).pop()!)?.[1] ?? '';
}

/** Class lists the UI puts on one element: class: '…' and class: `…` in src/ui. */
const ELEMENTS: string[][] = (() => {
  const sets: string[][] = [];
  for (const f of readdirSync('src/ui', { recursive: true })) {
    if (!f.endsWith('.ts')) continue;
    for (const m of readFileSync(`src/ui/${f}`, 'utf8').matchAll(/class:\s*(?:'([^']*)'|`([^`]*)`)/g)) {
      const list = (m[1] ?? m[2]!).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean);
      if (list.length > 0) sets.push(list);
    }
  }
  return sets;
})();

/** Both rules can style one element (same pseudo-element, classes found together in the markup). */
function sameElement(a: Rule, b: Rule): boolean {
  if (pseudoElement(a.selector) !== pseudoElement(b.selector)) return false;
  const need = [...subjectClasses(a.selector), ...subjectClasses(b.selector)];
  return ELEMENTS.some((el) => need.every((c) => el.includes(c)));
}

/** Both set one longhand to different values ("padding" against "padding-top" always counts). */
function conflicts(a: Rule, b: Rule): boolean {
  const covers = (x: string, y: string): boolean => y.startsWith(`${x}-`) || (x === 'inset' && /^(top|right|bottom|left)$/.test(y));
  return a.decls.some(([p, v]) =>
    b.decls.some(([q, w]) => {
      if (/!important/.test(v) !== /!important/.test(w)) return false;
      return p === q ? v !== w : covers(p, q) || covers(q, p);
    }),
  );
}

/**
 * Pairs whose winner in the shipped order (game CSS first) differs from the
 * intended one (game CSS last). Rules that style a bare element type
 * (`.rpt-head h3`) are left out: their ancestors decide, which the markup
 * scan cannot see.
 */
function flipped(): string[] {
  const main = MAIN.flatMap(rules).filter(
    (r) => subjectClasses(r.selector).length > 0 && !NEVER_HOLDS_GAME.some((a) => r.selector.startsWith(`${a} `)),
  );
  const game = GAME.flatMap(rules).filter((r) => subjectClasses(r.selector).length > 0);
  const gameRank = (r: Rule): number => GAME.indexOf(r.file) * 1e6 + r.index;
  const out: string[] = [];
  const check = (a: Rule, b: Rule, aLaterNow: boolean, aLaterIntended: boolean): void => {
    if (!sameElement(a, b) || !conflicts(a, b)) return;
    const intended = compare(specificity(original(a.selector)), specificity(original(b.selector)));
    const now = compare(specificity(a.selector), specificity(b.selector));
    const aWinsIntended = intended > 0 || (intended === 0 && aLaterIntended);
    const aWinsNow = now > 0 || (now === 0 && aLaterNow);
    if (aWinsIntended !== aWinsNow) out.push(`${a.selector} (${a.file}) vs ${b.selector} (${b.file})`);
  };
  for (const g of game) {
    for (const m of main) check(g, m, false, true);
    for (const o of game) if (gameRank(o) < gameRank(g)) check(g, o, true, true);
  }
  return [...new Set(out)];
}

describe('game-*.css loads before index-*.css', () => {
  it('computes specificity like the browser', () => {
    expect(specificity('.rpt-layer')).toEqual([0, 1, 0]);
    expect(specificity('.rpt-layer.rpt-layer')).toEqual([0, 2, 0]);
    expect(specificity(".rpt-layer[data-screen='report'] .rpt-dialog")).toEqual([0, 3, 0]);
    expect(specificity('#ui:has(.rpt-layer:not([hidden])) .dock')).toEqual([1, 3, 0]);
    expect(specificity('.rpt-head h3')).toEqual([0, 1, 1]);
    expect(specificity(':where(.a) .b::before')).toEqual([0, 1, 1]);
    expect(original('.btn-sm.btn-sm:hover')).toBe('.btn-sm:hover');
  });

  it('sees that the Daily Report layer is also a .ui-screen', () => {
    expect(ELEMENTS.some((el) => el.includes('rpt-layer') && el.includes('ui-screen'))).toBe(true);
  });

  it('keeps the Daily Report layer padding over the .ui-screen padding (the 1280×720 summary fits)', () => {
    const layer = rules('src/ui/report/report.css').find((r) => original(r.selector) === '.rpt-layer');
    const screen = rules('src/ui/styles/ui.css').find((r) => r.selector === '.ui-screen');
    expect(layer?.decls).toContainEqual(['padding', 'var(--space-4)']);
    expect(screen?.decls.some(([p]) => p === 'padding')).toBe(true);
    expect(compare(specificity(layer!.selector), specificity(screen!.selector))).toBeGreaterThan(0);
  });

  // Compares every rule pair: about 1 s alone, past the 5 s default under the full parallel run.
  it('gives every panel and report rule the same winner as when game CSS came last', { timeout: 20_000 }, () => {
    expect(flipped()).toEqual([]);
  });
});
