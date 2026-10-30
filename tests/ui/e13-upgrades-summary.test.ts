// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { createNewGame } from '../../src/sim/state';
import { nextTicketUpgrade, ownedPriceBonus } from '../../src/sim/upgrades';
import type { Command, GameState } from '../../src/sim/types';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';

function game(level: number): GameState {
  const s = createNewGame('Quán E13', 'normal', 5);
  delete s.week;
  s.shopLevel = level;
  s.money = 1_000_000_000;
  return s;
}

function mount(state: GameState): { body: HTMLElement; handle: PanelHandle } {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = {
    dispatch: (cmd: Command) => simDispatch(state, cmd),
    getState: () => state,
    close: () => {},
  };
  return { body, handle: renderUpgradesPanel(body, ctx) };
}

const line = (body: HTMLElement, which: 'tickets' | 'price'): string => body.querySelector(`[data-summary="${which}"]`)?.textContent ?? '';

afterEach(() => document.body.replaceChildren());

describe('E-13 Nâng cấp: Tem goal and price bonus lines', () => {
  it('shows "Tem: X/Y → <item>" for the next level that costs Tem, and follows the ticket count', () => {
    const state = game(4);
    state.upgrades.plants = getUpgrade('plants').maxLevel;
    state.retention = { ...state.retention!, tickets: 3 };
    const next = nextTicketUpgrade(state)!;
    expect(next).not.toBeNull();
    const { body, handle } = mount(state);
    expect(line(body, 'tickets')).toBe(`Tem: 3/${next.tickets} → ${getUpgrade(next.id).name}`);

    state.retention!.tickets = 9;
    handle.update?.(state);
    expect(line(body, 'tickets')).toBe(`Tem: 9/${next.tickets} → ${getUpgrade(next.id).name}`);
  });

  it('shows just "Tem: X" when no open level costs Tem', () => {
    const state = game(1);
    expect(nextTicketUpgrade(state)).toBeNull();
    const { body } = mount(state);
    expect(line(body, 'tickets')).toBe(`Tem: ${state.retention?.tickets ?? 0}`);
  });

  it('shows "Giá bán +X% nhờ nâng cấp" from the owned price bonus, updated after a buy', () => {
    const state = game(7);
    const { body, handle } = mount(state);
    expect(ownedPriceBonus(state)).toBe(0);
    expect(line(body, 'price')).toBe('Giá bán +0% nhờ nâng cấp');

    state.upgrades.chandelier = 1;
    const bonus = ownedPriceBonus(state);
    expect(bonus).toBeGreaterThan(0);
    handle.update?.(state);
    expect(line(body, 'price')).toBe(`Giá bán +${String(Math.round(bonus * 1000) / 10).replace('.', ',')}% nhờ nâng cấp`);
  });

  it('keeps both lines plain text in the panel: no emoji, no modal', () => {
    const state = game(4);
    state.upgrades.plants = getUpgrade('plants').maxLevel;
    const { body } = mount(state);
    const summary = body.querySelector('.prep > .intro')!;
    expect(summary.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(body.querySelector('[role="dialog"], dialog, .modal')).toBeNull();
  });
});
