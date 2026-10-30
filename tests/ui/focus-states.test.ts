// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { createHud } from '../../src/ui/hud/hud';
import { registerPrepPanels } from '../../src/ui/panels';
import { registerReviewsPanel } from '../../src/ui/report';

// Vitest stubs .css imports; read the files through a dynamically named node:fs
// import, by path from the repo root (see report.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };

const CSS_FILES = ['src/ui/styles/ui.css', 'src/ui/panels/panels.css', 'src/ui/report/report.css'] as const;

interface Rule {
  file: string;
  selector: string;
  body: string;
}

/** Innermost `selector { body }` blocks in source order (rules inside @media included). */
function rules(file: string): Rule[] {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ file, selector: m[1]!.trim(), body: m[2]!.trim() }));
}

const ALL = CSS_FILES.flatMap(rules);

/** Zero or negative: `0`, `0px`, `-2px`, `calc(-1 * …)`. */
function insideBorder(offset: string): boolean {
  return /^(0(px)?|-\S.*|calc\(\s*-.*)$/.test(offset);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('focus CSS stays inside the border', () => {
  it('each stylesheet has :focus-visible rules', () => {
    for (const file of CSS_FILES) {
      expect(rules(file).some((r) => r.selector.includes(':focus-visible')), file).toBe(true);
    }
  });

  it('no :focus-visible rule pushes the ring out with a positive outline-offset', () => {
    const outside = ALL.filter((r) => r.selector.includes(':focus-visible')).flatMap((r) =>
      [...r.body.matchAll(/outline-offset:\s*([^;]+)/g)]
        .map((m) => m[1]!.trim())
        .filter((offset) => !insideBorder(offset))
        .map((offset) => `${r.file} ${r.selector}: ${offset}`),
    );
    expect(outside).toEqual([]);
  });

  it('no rule uses a bare :focus', () => {
    const bare = ALL.filter((r) => /:focus(?![-\w])/.test(r.selector)).map((r) => `${r.file} ${r.selector}`);
    expect(bare).toEqual([]);
  });

  it('ui.css has one global [hidden] rule that wins over component display', () => {
    const hidden = rules('src/ui/styles/ui.css').filter((r) => r.selector === '[hidden]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.body).toMatch(/display:\s*none\s*!important/);
  });

  it('dock and speed buttons get their ring from the shared inset rule', () => {
    const shared = rules('src/ui/styles/ui.css').find((r) => r.selector.includes('.dock-btn:focus-visible'));
    expect(shared?.selector).toContain('.seg button:focus-visible');
    expect(shared?.body).toMatch(/outline-offset:\s*calc\(-1 \*/);
  });

  it('HUD menu items and the ghost buttons in the Điều khiển cluster draw the ring inside a thin border', () => {
    const ui = rules('src/ui/styles/ui.css');
    const shared = ui.find((r) => r.selector.includes('.dock-btn:focus-visible'));
    expect(shared?.selector).toContain('.hud-menu-item:focus-visible');
    expect(shared?.selector).toContain('.hud-btn:focus-visible');
    const thin = ui.filter((r) => /--bw:\s*var\(--size-outline-sm\)/.test(r.body)).map((r) => r.selector);
    expect(thin.some((s) => s.includes('.hud-menu-item'))).toBe(true);
    expect(thin).toContain('.hud-controls .hud-btn:not(.hud-btn-cta)');
  });
});

describe('aria-pressed on dock and speed buttons', () => {
  it('marks only the open panel and the current speed as pressed', () => {
    const offs = [registerPrepPanels(), registerReviewsPanel()];
    const state = createNewGame('Quán Thử', 'normal', 42);
    const hud = createHud({ dispatch: (cmd) => dispatch(state, cmd), getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
    document.body.append(hud.el, hud.panelEl);
    try {
      hud.el.hidden = false;
      const dock = [...hud.el.querySelectorAll<HTMLButtonElement>('.dock button[data-panel]')];
      expect(dock).toHaveLength(8);
      const pressed = (list: HTMLElement[]) => list.filter((b) => b.getAttribute('aria-pressed') === 'true');
      expect(dock.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);

      for (const b of dock) {
        b.click();
        expect(pressed(dock), b.dataset.panel).toEqual([b]);
      }
      dock.at(-1)!.click();
      expect(pressed(dock)).toEqual([]);

      expect(dispatch(state, { type: 'start_day' })).toBe(true);
      hud.update(state);
      const speeds = [...hud.el.querySelectorAll<HTMLButtonElement>('.seg [data-speed]')];
      expect(speeds.map((b) => b.dataset.speed)).toEqual(['1', '2', '4']);
      for (const b of speeds) expect(b.getAttribute('type')).toBe('button');
      for (const b of speeds) {
        b.click();
        hud.update(state);
        expect(state.speed).toBe(Number(b.dataset.speed));
        expect(pressed(speeds)).toEqual([b]);
      }
    } finally {
      hud.dispose();
      offs.forEach((off) => off());
    }
  });
});
