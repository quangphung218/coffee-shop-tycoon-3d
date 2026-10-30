// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { upgradeUnlockLevel } from '../../src/sim/data/levels';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState, UpgradeId } from '../../src/sim/types';
import { UPGRADE_ICONS } from '../../src/ui/core/iconMap';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';

const PREMIUM: readonly [UpgradeId, number][] = [
  ['chandelier', 7],
  ['marble_tables', 8],
  ['art_gallery', 9],
  ['grand_piano', 10],
];

function game(level: number): GameState {
  const s = createNewGame('Quán E05', 'normal', 5);
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

function mount(state: GameState): { body: HTMLElement; handle: PanelHandle; sent: Command[] } {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd: Command) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  };
  return { body, handle: renderUpgradesPanel(body, ctx), sent };
}

const badgeOf = (row: HTMLElement): HTMLElement => q(row, '.item-status .badge:not([data-fresh])');
const reasonOf = (row: HTMLElement): string => q(document, `#${q(row, '[data-action="buy"]').getAttribute('aria-describedby')}`).textContent ?? '';

afterEach(() => document.body.replaceChildren());

describe('E-05 Nâng cấp: premium decor and extra levels', () => {
  it('lists every premium decor item under Trang trí with its atlas icon, not the data emoji', () => {
    const { body } = mount(game(10));
    const decor = q(body, 'section[aria-label="Trang trí"]');
    for (const [id] of PREMIUM) {
      const row = q(decor, `[data-upgrade="${id}"]`);
      expect(row.textContent).toContain(getUpgrade(id).name);
      expect(row.textContent).not.toContain(getUpgrade(id).icon);
      expect(q(row, '.item-icon [data-icon]').dataset.icon).toBe(UPGRADE_ICONS[id]);
    }
    // No emoji anywhere in the panel text (icons come from the atlas).
    expect(body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(body.querySelector('[role="dialog"], dialog, .modal')).toBeNull();
  });

  it('locks each premium item with "Cần cấp quán N" and a disabled Mua below its level', () => {
    for (const [id, level] of PREMIUM) {
      expect(upgradeUnlockLevel(id)).toBe(level);
      const { body, sent } = mount(game(level - 1));
      const row = q(body, `[data-upgrade="${id}"]`);
      expect(row.classList.contains('is-locked')).toBe(true);
      expect(badgeOf(row).hidden).toBe(false);
      expect(badgeOf(row).textContent).toBe(`Cần cấp quán ${level}`);
      const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
      expect(buy.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(row)).toBe(`Cần cấp quán ${level}`);
      buy.click();
      expect(sent).toHaveLength(0);
      expect(row.querySelector('.confirm')).toBeNull();
      document.body.replaceChildren();
    }
  });

  it('opens a premium item at its level with the price bonus shown and an in-place confirm', () => {
    const state = game(7);
    const { body, sent, handle } = mount(state);
    const row = q(body, '[data-upgrade="chandelier"]');
    expect(row.classList.contains('is-locked')).toBe(false);
    expect(badgeOf(row).hidden).toBe(true);
    expect(q(row, '.item-meta').textContent).toMatch(/^Giá [\d.]+đ · Cấp 0\/\d+ · .*giá bán \+[\d,]+%/);
    const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).not.toBe('true');
    buy.click();
    expect(q(row, '.confirm')).toBeTruthy();
    q<HTMLButtonElement>(row, '.confirm .btn-primary').click();
    expect(sent).toEqual([{ type: 'buy_upgrade', upgradeId: 'chandelier' }]);
    handle.update?.(state);
    expect(q(row, '.item-meta').textContent).toContain('Cấp 1/');
  });

  it('waits on "Cần cấp quán 4" for plants L4, then prices it in money + Tem with its own effect (E-13)', () => {
    const def = getUpgrade('plants');
    const state = game(3);
    state.upgrades.plants = def.maxLevel;
    const { body, handle } = mount(state);
    const row = q(body, '[data-upgrade="plants"]');
    expect(badgeOf(row).textContent).toBe('Cần cấp quán 4');
    expect(q(row, '[data-action="buy"]').hidden).toBe(true);

    state.shopLevel = 4;
    handle.update?.(state);
    expect(badgeOf(row).hidden).toBe(true);
    expect(q(row, '.item-meta').textContent).toContain(`Giá 3.000.000đ + 15 Tem · Cấp ${def.maxLevel}/${def.maxLevel + 1}`);
    expect(q(row, '.item-meta').textContent).toContain(`cấp ${def.maxLevel + 1}: `);
  });

  it('prices better_machine L4 in money only, below its L5 (E-13)', () => {
    const def = getUpgrade('better_machine');
    const state = game(4);
    state.upgrades.better_machine = def.maxLevel;
    const { body } = mount(state);
    const meta = q(q(body, '[data-upgrade="better_machine"]'), '.item-meta').textContent!;
    expect(meta).toContain(`Giá 10.000.000đ · Cấp ${def.maxLevel}/${def.maxLevel + 1}`);
    expect(meta).not.toContain('Tem');
    expect(meta).toContain(`cấp ${def.maxLevel + 1}: +0,2 sao mỗi đơn`);
  });
});
