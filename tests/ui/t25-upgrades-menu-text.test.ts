// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { upgradeUnlockLevel } from '../../src/sim/data/levels';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';

// Vitest stubs .css imports, so read the file through a dynamically named node:fs import.
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const CSS = readFileSync('src/ui/panels/panels.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function game(level: number): GameState {
  const s = createNewGame('Quán T25', 'normal', 5);
  delete s.week;
  s.shopLevel = level;
  s.money = 1_000_000_000;
  return s;
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function mount(render: (body: HTMLElement, ctx: PanelContext) => PanelHandle, state: GameState): { body: HTMLElement; handle: PanelHandle; sent: Command[] } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  };
  return { body, handle: render(body, ctx), sent };
}

afterEach(() => document.body.replaceChildren());

describe('UX-009 Nâng cấp at level 1: later items in one collapsed group', () => {
  const waiting = UPGRADES.filter((u) => upgradeUnlockLevel(u.id) > 1);

  it('puts every item a later shop level opens in a closed "Mở ở cấp sau (N)" disclosure, no dialog', () => {
    const { body } = mount(renderUpgradesPanel, game(1));
    const later = q<HTMLDetailsElement>(body, 'details[data-group="later"]');
    expect(later.open).toBe(false);
    expect(later.hidden).toBe(false);
    expect(q(later, 'summary').textContent).toBe(`Mở ở cấp sau (${waiting.length})`);
    expect([...later.querySelectorAll('[data-upgrade]')].map((r) => r.getAttribute('data-upgrade')).sort()).toEqual(waiting.map((u) => u.id).sort());
    // Rows ordered by the level that opens them.
    const levels = [...later.querySelectorAll('[data-upgrade]')].map((r) => upgradeUnlockLevel(r.getAttribute('data-upgrade') as never));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    // Outside the group only rows open at level 1.
    for (const r of body.querySelectorAll('section [data-upgrade]')) expect(upgradeUnlockLevel(r.getAttribute('data-upgrade') as never)).toBe(1);
    expect(body.querySelector('[role="dialog"], dialog, .modal')).toBeNull();
    expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('shows one neutral "Cần cấp quán N" label per locked row and no red reason line', () => {
    const { body, sent } = mount(renderUpgradesPanel, game(1));
    for (const u of waiting) {
      const row = q(body, `[data-upgrade="${u.id}"]`);
      const labels = [...row.querySelectorAll<HTMLElement>('.badge:not([hidden])')];
      expect(labels).toHaveLength(1);
      expect(labels[0]!.textContent).toBe(`Cần cấp quán ${upgradeUnlockLevel(u.id)}`);
      expect(labels[0]!.classList.contains('badge-neutral')).toBe(true);
      expect([...row.querySelectorAll<HTMLElement>('.reason')].filter((r) => !r.hidden)).toHaveLength(0);
      expect(row.textContent!.split('Cần cấp quán').length - 1).toBe(1);
      // Mua stays disabled and names the label as its reason.
      const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
      expect(buy.getAttribute('aria-disabled')).toBe('true');
      expect(q(document, `#${buy.getAttribute('aria-describedby')}`)).toBe(labels[0]);
      buy.click();
    }
    expect(sent).toHaveLength(0);
  });

  it('moves rows out of the group as the shop levels up, and hides it when empty', () => {
    const state = game(1);
    const { body, handle } = mount(renderUpgradesPanel, state);
    const grinder = q(body, '[data-upgrade="grinder"]');
    expect(grinder.closest('details')).not.toBeNull();
    state.shopLevel = 2;
    handle.update!(state);
    expect(grinder.closest('details')).toBeNull();
    expect(grinder.closest('section')).not.toBeNull();
    const later = q<HTMLDetailsElement>(body, 'details[data-group="later"]');
    expect(q(later, 'summary').textContent).toBe(`Mở ở cấp sau (${UPGRADES.filter((u) => upgradeUnlockLevel(u.id) > 2).length})`);
    state.shopLevel = 10;
    handle.update!(state);
    expect(later.hidden).toBe(true);
    expect(body.querySelectorAll('section [data-upgrade]')).toHaveLength(UPGRADES.length);
  });
});

describe('UX-013 Menu: "Thiếu …" label is a 44 px button', () => {
  it('renders "Thiếu …" as .badge-btn and gives that rule min-height 44 px', () => {
    const state = game(1);
    for (const item of state.inventory) item.qty = 0;
    const { body } = mount(renderMenuPanel, state);
    const chip = [...body.querySelectorAll<HTMLElement>('[data-lock="stock"]')].find((b) => !b.hidden);
    expect(chip?.textContent).toMatch(/^Thiếu /);
    expect(chip!.classList.contains('badge-btn')).toBe(true);
    expect(CSS).toMatch(/\.badge-btn\.badge-btn\s*\{[^}]*min-height:\s*var\(--size-target\)/);
    const tokens = readFileSync('src/ui/styles/tokens.css', 'utf8');
    expect(tokens).toMatch(/--size-target:\s*44px/);
  });
});

describe('UX-014 Nâng cấp meta states only the level', () => {
  it('reads "Cấp 1/2" with no "Bậc" or "mua để lên bậc"', () => {
    const state = game(7);
    state.upgrades.big_counter = 1;
    const { body } = mount(renderUpgradesPanel, state);
    const meta = q(body, '[data-upgrade="big_counter"] .item-meta').textContent!;
    expect(meta).toMatch(/Cấp 1\/2 · /);
    expect(meta).not.toMatch(/Bậc|bậc/);
    expect(body.textContent).not.toMatch(/Bậc \d|mua để lên bậc/);
  });
});
