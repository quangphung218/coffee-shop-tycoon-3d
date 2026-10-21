// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { UNIFORMS } from '../../src/sim/data/uniforms';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { uniformUnlockToast } from '../../src/ui/hud/events';
import { renderStaffPanel } from '../../src/ui/panels/staff';

// Vitest stubs .css imports; read the file by path from the repo root (see focus-states.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function mount(state: GameState): { body: HTMLElement; sent: Command[]; update: (s: GameState) => void } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const handle = renderStaffPanel(body, {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  });
  return { body, sent, update: (s) => handle?.update?.(s) };
}

const cell = (body: HTMLElement, id: string): HTMLButtonElement => {
  const el = body.querySelector<HTMLButtonElement>(`.uniform-grid button[data-uniform="${id}"]`);
  if (!el) throw new Error(`missing uniform ${id}`);
  return el;
};

/** A level 3 shop: classic worn, mint open, latte and coral locked. */
function level3(): GameState {
  const state = createNewGame('Quán Thử', 'normal', 7);
  state.shopLevel = 3;
  return state;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Đồng phục picker', () => {
  it('sits at the end of the staff panel, before the foot, with one cell per uniform', () => {
    const { body } = mount(level3());
    const grid = body.querySelector('.uniform-grid')!;
    expect(grid.getAttribute('role')).toBe('group');
    expect(body.querySelector(`#${grid.getAttribute('aria-labelledby')}`)?.textContent).toBe('Đồng phục');
    expect(grid.nextElementSibling?.classList.contains('panel-foot')).toBe(true);
    expect([...grid.querySelectorAll('button')].map((b) => b.dataset.uniform)).toEqual(UNIFORMS.map((u) => u.id));
    expect(body.closest('body')!.querySelector('dialog, [role="dialog"]')).toBeNull();
  });

  it('renders worn, open and locked with one signal each', () => {
    const { body } = mount(level3());
    const worn = cell(body, 'classic');
    const open = cell(body, 'mint');
    const locked = cell(body, 'latte');

    expect(worn.getAttribute('aria-pressed')).toBe('true');
    expect(worn.disabled).toBe(false);
    expect(worn.textContent).toBe('Áo kem cổ điển');

    expect(open.getAttribute('aria-pressed')).toBe('false');
    expect(open.disabled).toBe(false);
    expect(open.textContent).toBe('Áo bạc hà, mũ lưỡi trai');

    expect(locked.disabled).toBe(true);
    expect(locked.getAttribute('aria-pressed')).toBe('false');
    expect(locked.textContent).toBe('Cấp 5');
    expect(locked.getAttribute('aria-label')).toContain('Áo latte, mũ nồi');
    expect(cell(body, 'coral').textContent).toBe('Cấp 7');
  });

  it('draws each cell as a CSS block figure with the uniform colours, no emoji', () => {
    const { body } = mount(level3());
    const swatch = cell(body, 'latte').querySelector<HTMLElement>('.uniform-swatch')!;
    expect(swatch.getAttribute('aria-hidden')).toBe('true');
    expect(swatch.dataset.hat).toBe('beret');
    expect(swatch.style.getPropertyValue('--uni-shirt')).toBe('#d9a877');
    expect(swatch.style.getPropertyValue('--uni-hat')).toBe('#6b3f24');
    expect(swatch.querySelector('.uni-shirt > .uni-apron')).not.toBeNull();
    expect(body.querySelector('.uniform-grid')!.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('sends set_uniform for an open cell and moves the pressed state', () => {
    const state = level3();
    const { body, sent } = mount(state);
    cell(body, 'mint').click();
    expect(sent).toEqual([{ type: 'set_uniform', uniformId: 'mint' }]);
    expect(state.uniform).toBe('mint');
    expect(cell(body, 'mint').getAttribute('aria-pressed')).toBe('true');
    expect(cell(body, 'classic').getAttribute('aria-pressed')).toBe('false');
  });

  it('sends nothing for a locked cell', () => {
    const state = level3();
    const { body, sent } = mount(state);
    cell(body, 'latte').click();
    cell(body, 'latte').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toEqual([]);
    expect(state.uniform).toBeUndefined();
  });

  it('opens a cell in place when the shop levels up', () => {
    const state = level3();
    const { body, update } = mount(state);
    const latte = cell(body, 'latte');
    state.shopLevel = 5;
    update(state);
    expect(cell(body, 'latte')).toBe(latte);
    expect(latte.disabled).toBe(false);
    expect(latte.textContent).toBe('Áo latte, mũ nồi');
    expect(latte.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps a 44 px target and two columns that cannot widen the panel', () => {
    const rule = (sel: string): string => CSS.match(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]'=()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.uniform-grid')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(rule('.uniform-opt')).toMatch(/min-height:\s*var\(--size-target\)/);
    expect(rule('.uniform-opt')).toMatch(/min-width:\s*0/);
    expect(rule(".uniform-opt[aria-pressed='true']")).toMatch(/inset 0 0 0 var\(--bw\)/);
    expect(CSS).toMatch(/\.uniform-opt:focus-visible/);
  });
});

describe('uniform unlock toast', () => {
  it('names the uniform a level-up opens', () => {
    const unlocks = { menu: [], upgrades: [], tools: [] };
    expect(uniformUnlockToast({ type: 'level_up', level: 5, unlocks })?.title).toBe('Mở khoá đồng phục Áo latte, mũ nồi');
    expect(uniformUnlockToast({ type: 'level_up', level: 4, unlocks })).toBeNull();
    expect(uniformUnlockToast({ type: 'angry', customerId: 1 })).toBeNull();
  });
});
