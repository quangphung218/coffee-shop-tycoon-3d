// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import FIXED_UI from '../../docs/reports/p22-review/fixed-ui.json';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import type { PanelContext, PanelRender } from '../../src/ui/hud/panels';
import { renderInventoryPanel } from '../../src/ui/panels/inventory';
import { renderStaffPanel } from '../../src/ui/panels/staff';
import { renderTasksPanel } from '../../src/ui/panels/tasks';

// One guard per UI/layout finding that P22 f3 fixed
// (docs/reports/p22-review/fixed-ui.json), so the bug cannot come back.
// jsdom has no layout or @container support, so the guards read the CSS and
// the rendered DOM; npm run review:p22 measures the real taps.

// Vitest stubs .css imports (even ?raw) to '' and the project has no Node
// types, so read the files through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
// Under jsdom the global URL is jsdom's, which node:fs rejects; use a path
// from the project root (vitest's cwd).
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const UI_CSS = strip(readFileSync('src/ui/styles/ui.css', 'utf8'));
const PANELS_CSS = strip(readFileSync('src/ui/panels/panels.css', 'utf8'));

interface Rule {
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media/@container included). */
function rules(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }));
}

/** Value of one declaration in a rule body. */
function decl(body: string, prop: string): string | undefined {
  return body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim();
}

/** Each `@container <name> (<query>) { … }` block with its inner rules. */
function containerBlocks(css: string): { name: string; query: string; rules: Rule[] }[] {
  const out: { name: string; query: string; rules: Rule[] }[] = [];
  for (const m of css.matchAll(/@container\s+([\w-]+)\s*\(([^)]*)\)\s*\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const open = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push({ name: m[1]!, query: m[2]!.replace(/\s+/g, ' ').trim(), rules: rules(css.slice(open, i - 1)) });
  }
  return out;
}

const PANELS = rules(PANELS_CSS);
const ROOT_FONT_PX = 16;

function mount(render: PanelRender, state: GameState): HTMLElement {
  // The real panel body (hud/panels) carries .panel-body; the CSS keys on it.
  const body = document.createElement('div');
  body.className = 'panel-body';
  document.body.append(body);
  const ctx: PanelContext = {
    dispatch: (cmd) => simDispatch(state, cmd),
    getState: () => state,
    close: () => {},
  };
  render(body, ctx);
  return body;
}

afterEach(() => {
  document.body.replaceChildren();
});

/** Guards keyed by finding id; every id in fixed-ui.json must have one here. */
const GUARDED = ['layout-blocked-suggest-390'] as const;

describe('P22 f3 fixed-ui.json coverage', () => {
  it('lists at least one fixed finding', () => {
    expect(FIXED_UI.fixed.length).toBeGreaterThan(0);
  });

  it.each(FIXED_UI.fixed.map((f) => f.id))('has a regression guard for %s', (id) => {
    expect(GUARDED as readonly string[]).toContain(id);
  });
});

// At 390×844 with a four-row HUD the Kho body is ~210–270 px and its sticky
// foot ~190 px, so the foot covered Auto-restock and the stock list.
describe('layout-blocked-suggest-390: Kho foot does not cover Auto-restock on a short body', () => {
  const finding = FIXED_UI.fixed.find((f) => f.id === 'layout-blocked-suggest-390')!;

  it('is the finding these guards are for', () => {
    expect(finding).toBeDefined();
  });

  it('makes every body with a foot a named size container on a flex-sized body', () => {
    const withFoot = PANELS.filter((r) => r.selector === '.panel-body:has(> .prep > .panel-foot)');
    expect(withFoot).toHaveLength(1);
    expect(decl(withFoot[0]!.body, 'container-type')).toBe('size');
    expect(decl(withFoot[0]!.body, 'container-name')).toBe('panel-body');
    // Size containment ignores content height, so the body must get its
    // height from the panel column, not from its children.
    const body = rules(UI_CSS).find((r) => r.selector === '.panel-body')!;
    expect(decl(body.body, 'flex')).toBe('1 1 auto');
    expect(decl(body.body, 'min-height')).toBe('0');
    expect(decl(body.body, 'overflow')).toBe('auto');
  });

  const blocks = containerBlocks(PANELS_CSS).filter((b) => b.name === 'panel-body');
  const maxPx = (query: string): number => {
    const m = query.match(/^max-height: ([\d.]+)rem$/);
    expect(m, query).not.toBeNull();
    return Number(m![1]) * ROOT_FONT_PX;
  };

  it('packs the foot on a short body, still stuck, with a 44 px buy button', () => {
    expect(blocks).toHaveLength(2);
    const px = maxPx(blocks[0]!.query);
    // The tallest body that was covered at 390 was ~270 px.
    expect(px).toBeGreaterThanOrEqual(270);
    // A 900 px tall desktop panel body stays above it and keeps the full foot.
    expect(px).toBeLessThan(600);
    const foot = blocks[0]!.rules.find((r) => r.selector === '.prep .panel-foot')!;
    expect(decl(foot.body, 'position')).toBeUndefined();
    expect(decl(foot.body, 'display')).toBe('grid');
    // Equal fixed columns: a longer total never moves the other cell or the button.
    expect(decl(foot.body, 'grid-template-columns')).toBe('minmax(0, 1fr) minmax(0, 1fr)');
    for (const r of blocks[0]!.rules) {
      for (const prop of ['padding', 'gap']) {
        const v = decl(r.body, prop);
        if (v) expect(v, `${r.selector} ${prop}`).toMatch(/^(0|var\(--space-\d+\))( (0|var\(--space-\d+\)))*$/);
      }
    }
    const btn = blocks[0]!.rules.find((r) => r.selector === '.prep .panel-foot > .btn-lg')!;
    expect(decl(btn.body, 'min-height')).toBe('var(--size-target)');
  });

  it('unsticks the foot only on a very low body, below the 207 px Kho body at 390', () => {
    const px = maxPx(blocks[1]!.query);
    expect(px).toBeLessThan(207);
    expect(px).toBeGreaterThan(0);
    const foot = blocks[1]!.rules.find((r) => r.selector === '.prep .panel-foot');
    expect(foot).toBeDefined();
    expect(decl(foot!.body, 'position')).toBe('static');
  });

  it('keeps the sticky foot by default, before the container rule so the short-body rule wins', () => {
    const src = PANELS_CSS;
    const sticky = src.search(/\.prep \.panel-foot\s*\{[^}]*position:\s*sticky/);
    const container = src.indexOf('@container panel-body');
    expect(sticky).toBeGreaterThan(-1);
    expect(container).toBeGreaterThan(sticky);
    // No later unconditional rule puts the sticking back.
    const after = rules(src.slice(container));
    expect(after.filter((r) => /panel-foot/.test(r.selector) && decl(r.body, 'position') === 'sticky')).toEqual([]);
  });

  it('renders Auto-restock and the stock list before the foot in the Kho panel', () => {
    const body = mount(renderInventoryPanel, createNewGame('Quán Thử', 'normal', 42));
    const prep = body.querySelector(':scope > .prep')!;
    const kids = [...prep.children];
    const suggest = prep.querySelector('[data-action="suggest"]')!;
    const list = prep.querySelector(':scope > ul.stack')!;
    const foot = prep.querySelector(':scope > .panel-foot')!;
    expect(suggest).not.toBeNull();
    expect(suggest.textContent).toContain('Auto-restock');
    expect(foot).not.toBeNull();
    // Static foot flows after the list, never on top of the button.
    expect(kids.at(-1)).toBe(foot);
    expect(kids.indexOf(suggest)).toBeLessThan(kids.indexOf(list));
    expect(kids.indexOf(list)).toBeLessThan(kids.indexOf(foot));
    expect(foot.contains(suggest)).toBe(false);
    expect(body.matches('.panel-body:has(> .prep > .panel-foot)')).toBe(true);
  });

  it.each([
    ['staff', renderStaffPanel],
    ['tasks', renderTasksPanel],
  ] as const)('applies the same rule to the %s panel foot', (_name, render) => {
    const body = mount(render, createNewGame('Quán Thử', 'normal', 42));
    const prep = body.querySelector(':scope > .prep')!;
    const foot = prep.querySelector(':scope > .panel-foot')!;
    expect(foot).not.toBeNull();
    expect([...prep.children].at(-1)).toBe(foot);
    expect(body.matches('.panel-body:has(> .prep > .panel-foot)')).toBe(true);
  });
});
