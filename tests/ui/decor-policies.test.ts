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

describe('policies locked once the shop is open', () => {
  it.each([
    ['menu', renderMenuPanel, 'price'],
    ['staff', renderStaffPanel, 'wage'],
  ] as const)('%s panel: Mức is aria-disabled with the reason and sends nothing', (_, render, seg) => {
    const state = game();
    const { body, sent } = mount(render, state);
    const group = q(body, `[data-seg="${seg}"]`);
    expect(group.getAttribute('aria-disabled')).toBeNull();

    simDispatch(state, { type: 'start_day' });
    expect(state.phase).not.toBe('preparation');
    body.replaceChildren();
    const open = mount(render, state);
    const locked = q(open.body, `[data-seg="${seg}"]`);
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    for (const radio of locked.querySelectorAll('input')) expect(radio.getAttribute('aria-disabled')).toBe('true');
    const why = q(document, `#${locked.getAttribute('aria-describedby')}`);
    expect(why.hidden).toBe(false);
    expect(why.textContent).toBe('Đổi lúc chuẩn bị ngày mai.');

    pick(open.body, seg, 'high');
    expect(open.sent).toEqual([]);
    expect(sent).toEqual([]);
    expect(q<HTMLInputElement>(open.body, `[data-seg="${seg}"] input[data-value="standard"]`).checked).toBe(true);
    expect(state.policies).toBeUndefined();
  });

  it('unlocks in place when the next preparation starts', () => {
    const state = game();
    simDispatch(state, { type: 'start_day' });
    const body = document.createElement('div');
    document.body.append(body);
    const handle = renderMenuPanel(body, { dispatch: (cmd) => simDispatch(state, cmd), getState: () => state, close: () => {} });
    expect(q(body, '[data-seg="price"]').getAttribute('aria-disabled')).toBe('true');
    state.phase = 'preparation';
    handle.update!(state);
    const seg = q(body, '[data-seg="price"]');
    expect(seg.getAttribute('aria-disabled')).toBeNull();
    expect(seg.getAttribute('aria-describedby')).toBeNull();
  });
});

describe('"Mở ngày N" on items the week calendar opens', () => {
  it('labels a menu item by its calendar day, and keeps the level label without a week', () => {
    const state = game();
    for (const item of state.inventory) item.qty = 1_000_000;
    const { body } = mount(renderMenuPanel, state);
    const label = q(body, '[data-item="mocha"] [data-lock="level"]');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('Mở ngày 4');
    const sw = q(body, '[data-item="mocha"] [role="switch"]');
    expect(q(document, `#${sw.getAttribute('aria-describedby')!.split(' ').pop()}`).textContent).toContain('Mở khóa vào ngày 4');

    const old = game();
    delete old.week;
    const again = mount(renderMenuPanel, old);
    expect(q(again.body, '[data-item="mocha"] [data-lock="level"]').textContent).toMatch(/^Mở ở cấp \d$/);
  });

  it('labels an upgrade by its calendar day', () => {
    const state = game();
    const { body } = mount(renderUpgradesPanel, state);
    const paintings = q(body, '[data-upgrade="paintings"]');
    expect(paintings.classList.contains('is-locked')).toBe(true);
    expect(paintings.textContent).toContain('Mở ngày 4');
  });

  it('opens an upgrade on its calendar day even below its level', () => {
    const state = game();
    state.day = state.week!.startedDay + 3;
    const { body } = mount(renderUpgradesPanel, state);
    const paintings = q(body, '[data-upgrade="paintings"]');
    expect(paintings.classList.contains('is-locked')).toBe(false);
    expect(q(paintings, '[data-action="buy"]').getAttribute('aria-disabled')).toBeNull();
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
