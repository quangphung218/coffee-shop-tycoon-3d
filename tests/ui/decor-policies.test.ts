// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { sellPrice } from '../../src/sim/customers';
import { totalWages } from '../../src/sim/economy';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import type { PanelContext, PanelRender } from '../../src/ui/hud/panels';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { renderStaffPanel } from '../../src/ui/panels/staff';
import { REMOVE_CONFIRM_MS, renderUpgradesPanel } from '../../src/ui/panels/upgrades';
import { formatMoney } from '../../src/ui/core/format';

function game(): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.money = 10_000_000;
  return state;
}

function mount(render: PanelRender, state: GameState): { body: HTMLElement; sent: Command[] } {
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
  render(body, ctx);
  return { body, sent };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function pick(root: ParentNode, seg: string, value: string): void {
  const radio = q<HTMLInputElement>(root, `[data-seg="${seg}"] input[data-value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('decor removal in place', () => {
  it('hides Gỡ at level 0 and shows it with the refund once owned', () => {
    const state = game();
    const { body } = mount(renderUpgradesPanel, state);
    for (const id of ['plants', 'paintings', 'lights']) expect(q(body, `[data-remove="${id}"]`).hidden).toBe(true);
    // Seating decor and other upgrades have no Gỡ.
    expect(body.querySelector('[data-remove="window_bar"]')).toBeNull();
    expect(body.querySelector('[data-remove="tables"]')).toBeNull();

    simDispatch(state, { type: 'buy_upgrade', upgradeId: 'plants' });
    body.replaceChildren();
    const again = mount(renderUpgradesPanel, state);
    const row = q(again.body, '[data-remove="plants"]');
    expect(row.hidden).toBe(false);
    expect(row.textContent).toMatch(/^Gỡ \(\+.+\)$/);
  });

  it('needs two clicks within 3 s and then sends remove_decor', () => {
    vi.useFakeTimers();
    const state = game();
    simDispatch(state, { type: 'buy_upgrade', upgradeId: 'plants' });
    const money = state.money;
    const { body, sent } = mount(renderUpgradesPanel, state);
    const btn = q<HTMLButtonElement>(body, '[data-remove="plants"] [data-action="remove"]');

    btn.click();
    expect(btn.textContent).toBe('Bấm lần nữa để gỡ');
    expect(sent).toEqual([]);

    // The armed state runs out: back to "Gỡ", still nothing sent.
    vi.advanceTimersByTime(REMOVE_CONFIRM_MS + 1);
    expect(btn.textContent).toMatch(/^Gỡ/);
    btn.click();
    expect(sent).toEqual([]);

    btn.click();
    expect(sent).toEqual([{ type: 'remove_decor', upgradeId: 'plants' }]);
    expect(state.upgrades.plants ?? 0).toBe(0);
    expect(state.money).toBeGreaterThan(money);
    expect(q(body, '[data-remove="plants"]').hidden).toBe(true);
    expect(q(body, '[data-upgrade="plants"]').textContent).toContain('Cấp 0/');
  });
});

describe('Mức giá in the menu panel', () => {
  it('sends set_policy and shows prices at the chosen level', () => {
    const state = game();
    const { body, sent } = mount(renderMenuPanel, state);
    const meta = (): string => q(body, '[data-item="espresso"] .item-meta').textContent ?? '';
    const before = sellPrice(state, 'espresso');
    expect(meta()).toContain(`Giá ${formatMoney(before)}`);
    expect(q<HTMLInputElement>(body, '[data-seg="price"] input[data-value="standard"]').checked).toBe(true);

    pick(body, 'price', 'high');
    expect(sent).toEqual([{ type: 'set_policy', policy: 'price', level: 'high' }]);
    const after = sellPrice(state, 'espresso');
    expect(after).toBeGreaterThan(before);
    expect(meta()).toContain(`Giá ${formatMoney(after)}`);
    expect(q(body, '[data-hint="price"]').textContent).toBe('Cao: +15% tiền mỗi ly, khách khó tính hơn (−0,2 sao), ít khách hơn (−8%).');

    pick(body, 'price', 'low');
    expect(meta()).toContain(`Giá ${formatMoney(sellPrice(state, 'espresso'))}`);
    expect(q(body, '[data-hint="price"]').textContent).toContain('Rẻ: −10% tiền mỗi ly');
  });
});

describe('Mức lương in the staff panel', () => {
  it('sends set_policy and updates the wage bill and hint', () => {
    const state = game();
    const c = state.candidates[0]!;
    simDispatch(state, { type: 'hire_staff', candidateId: c.id, role: 'barista' });
    const { body, sent } = mount(renderStaffPanel, state);
    const total = (): string => q(body, '.foot-sum b').textContent ?? '';
    const before = total();
    expect(before).toBe(formatMoney(totalWages(state)));

    pick(body, 'wage', 'high');
    expect(sent).toEqual([{ type: 'set_policy', policy: 'wage', level: 'high' }]);
    expect(total()).not.toBe(before);
    expect(total()).toBe(formatMoney(totalWages(state)));
    expect(q(body, '[data-hint="wage"]').textContent).toBe(`Cao: tổng lương ${formatMoney(totalWages(state))}/ngày, làm nhanh hơn 12%.`);

    pick(body, 'wage', 'low');
    expect(total()).toBe(formatMoney(totalWages(state)));
    expect(q(body, '[data-hint="wage"]').textContent).toContain('làm chậm hơn 12%');
  });
});

describe('no modal', () => {
  it('opens no dialog while removing decor or changing policies', () => {
    const state = game();
    state.upgrades.lights = 1;
    const up = mount(renderUpgradesPanel, state);
    q<HTMLButtonElement>(up.body, '[data-remove="lights"] [data-action="remove"]').click();
    const menu = mount(renderMenuPanel, state);
    pick(menu.body, 'price', 'high');
    const staff = mount(renderStaffPanel, state);
    pick(staff.body, 'wage', 'low');
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog')).toHaveLength(0);
  });
});
