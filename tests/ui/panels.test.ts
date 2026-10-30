// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { getIngredient } from '../../src/sim/data/ingredients';
import { MAX_SHOP_LEVEL, maxLevelBonus } from '../../src/sim/data/levels';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { autoRestockSuggestion, ingredientPrice, restockPlan } from '../../src/sim/inventory';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { toastForEvent } from '../../src/ui/hud/events';
import { createHud } from '../../src/ui/hud/hud';
import { listPanels, type PanelContext, type PanelHandle, type PanelRender } from '../../src/ui/hud/panels';
import { PREP_PANELS, lowStockCount, registerPrepPanels } from '../../src/ui/panels';
import { NOTHING_TO_BUY, PICK_HINT, renderInventoryPanel } from '../../src/ui/panels/inventory';
import { renderMarketingPanel } from '../../src/ui/panels/marketing';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { renderStaffPanel } from '../../src/ui/panels/staff';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';

// The project has no Node types: read panels.css through a dynamically named
// node:fs import, from the project root (jsdom's URL is rejected by node:fs).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

function game(): GameState {
  return createNewGame('Quán Thử', 'normal', 42);
}

interface Mounted {
  body: HTMLElement;
  sent: Command[];
  handle: PanelHandle | void;
}

/** Renders a panel into the document with a dispatch that records commands and applies them to the sim. */
function mount(render: PanelRender, state: GameState): Mounted {
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
  return { body, sent, handle: render(body, ctx) };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** Id of the first icon inside `el`. */
function useOf(el: Element): string | null {
  return el.querySelector<HTMLElement>('.ic[aria-hidden="true"]')?.dataset.icon ?? null;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('registration', () => {
  it('registers the six preparation panels as HUD buttons', () => {
    const off = registerPrepPanels();
    try {
      expect(listPanels().map((p) => p.id)).toEqual(['tasks', 'menu', 'inventory', 'staff', 'marketing', 'upgrades']);
      const state = game();
      const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
      document.body.append(hud.el, hud.panelEl);
      expect(hud.el.querySelectorAll('[data-panel]')).toHaveLength(PREP_PANELS.length);
      q<HTMLButtonElement>(hud.el, '[data-panel="inventory"]').click();
      expect(hud.openPanelId).toBe('inventory');
      expect(hud.panelEl.querySelectorAll('[data-ingredient]').length).toBeGreaterThan(0);

      // Task Board links open another panel through its dock button.
      q<HTMLButtonElement>(hud.el, '[data-panel="tasks"]').click();
      q<HTMLButtonElement>(hud.panelEl, '[data-goto="staff"]').click();
      expect(hud.openPanelId).toBe('staff');
      hud.dispose();
    } finally {
      off();
    }
    expect(listPanels()).toHaveLength(0);
  });
});

describe('menu panel', () => {
  it('lists the 13 items and lets one that lacks an ingredient be switched on, with one warning label', () => {
    const state = game();
    // Mocha opens at a later shop level; reach it so only the ingredient blocks it.
    state.shopLevel = 6;
    state.inventory.find((i) => i.id === 'cacao')!.qty = 0;
    const { body, sent } = mount(renderMenuPanel, state);
    expect(body.querySelectorAll('li.item')).toHaveLength(13);

    const mocha = q(body, '[data-item="mocha"]');
    const sw = q<HTMLButtonElement>(mocha, '[role="switch"]');
    // Not the "not open yet" look: no dashed frame, no lock icon anywhere in the row.
    expect(mocha.classList.contains('is-locked')).toBe(false);
    expect(mocha.querySelector('[data-icon="i-lock"]')).toBeNull();
    expect(sw.getAttribute('aria-disabled')).not.toBe('true');
    // The amounts stay in the switch's description (after the full line), off screen.
    const why = q(document, `#${sw.getAttribute('aria-describedby')!.split(' ').pop()}`);
    expect(why.textContent).toContain(getIngredient('cacao').name);
    expect(why.classList.contains('sr-only')).toBe(true);
    expect(why.querySelector('.ic')).toBeNull();
    expect(useOf(q(mocha, '.item-icon'))).toBe('i-mocha');

    // One status label names the missing ingredient and is itself the way to Kho: no separate link.
    const label = q<HTMLButtonElement>(mocha, '[data-lock="stock"]');
    expect(label.tagName).toBe('BUTTON');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe(`Thiếu ${getIngredient('cacao').name}`);
    expect(useOf(label)).toBe('i-warning');
    expect(label.getAttribute('aria-describedby')).toBe(why.id);
    expect(q(mocha, '[data-lock="level"]').hidden).toBe(true);
    expect(mocha.querySelector('.link-btn')).toBeNull();

    // On while still short: the label stays until the stock arrives.
    sw.click();
    expect(sent).toEqual([{ type: 'set_menu_item', itemId: 'mocha', enabled: true }]);
    expect(state.menu.find((m) => m.id === 'mocha')!.enabled).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(label.hidden).toBe(false);
  });

  it('names the missing ingredient on an item already on sale, and drops it once stocked', () => {
    const state = game();
    state.inventory.find((i) => i.id === 'lemon')!.qty = 0;
    const { body, handle } = mount(renderMenuPanel, state);
    const row = q(body, '[data-item="lemon_tea"]');
    expect(q(row, '[role="switch"]').getAttribute('aria-checked')).toBe('true');
    expect(q(row, '[data-lock="stock"]').textContent).toBe(`Thiếu ${getIngredient('lemon').name}`);
    expect(q(row, '[data-lock="stock"]').hidden).toBe(false);

    // Two missing: the label stays short, the reason line names both.
    state.inventory.find((i) => i.id === 'tea')!.qty = 0;
    (handle as PanelHandle).update!(state);
    expect(q(row, '[data-lock="stock"]').textContent).toBe(`Thiếu ${getIngredient('tea').name} +1`);
    const why = q(document, `#${q(row, '[role="switch"]').getAttribute('aria-describedby')!.split(' ').pop()}`);
    expect(why.textContent).toContain(getIngredient('tea').name);
    expect(why.textContent).toContain(getIngredient('lemon').name);

    state.inventory.find((i) => i.id === 'lemon')!.qty = 1000;
    state.inventory.find((i) => i.id === 'tea')!.qty = 1000;
    (handle as PanelHandle).update!(state);
    expect(q(row, '[data-lock="stock"]').hidden).toBe(true);
    expect(row.classList.contains('is-locked')).toBe(false);
    // Nothing blocks it: the full line alone describes the switch.
    expect(q(document, `#${q(row, '[role="switch"]').getAttribute('aria-describedby')}`).textContent).toContain('phổ biến');
  });

  it('puts every item on one compact row with a short meta line; the full line is the description and title', () => {
    const { body } = mount(renderMenuPanel, game());
    for (const row of body.querySelectorAll('li.item')) {
      expect(row.classList.contains('item-row')).toBe(true);
      expect(row.classList.contains('menu-row')).toBe(true);
      expect(row.querySelectorAll('.item-meta')).toHaveLength(1);
      expect(row.querySelectorAll('.item-status')).toHaveLength(1);
      expect(row.querySelector('.item-actions')).toBeNull();
    }
    expect(body.querySelector('.dots')).toBeNull();
    const espresso = q(body, '[data-item="espresso"]');
    expect(q(espresso, '.item-meta').textContent).toMatch(/^Giá [\d.]+đ · lãi \d+%$/);
    expect(useOf(q(espresso, '.item-meta'))).toBe('i-flame');
    expect(useOf(q(body, '[data-item="orange_juice"] .item-meta'))).toBe('i-cold');
    const full = q(document, `#${q(espresso, '[role="switch"]').getAttribute('aria-describedby')}`);
    expect(full.textContent).toMatch(/^Giá [\d.]+đ · lãi [\d.]+đ\/ly \(\d+%\) · Nóng · phổ biến \d\/5$/);
    expect(espresso.title).toBe(full.textContent);
  });

  it('toggles an available item through set_menu_item', () => {
    const state = game();
    const { body, sent } = mount(renderMenuPanel, state);
    const sw = q<HTMLButtonElement>(body, '[data-item="espresso"] [role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    expect(sent).toEqual([{ type: 'set_menu_item', itemId: 'espresso', enabled: false }]);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});

describe('inventory panel', () => {
  it('fills the steppers with the auto-restock suggestion before buying, then buys those packs', () => {
    const state = game();
    const suggestion = autoRestockSuggestion(state);
    expect(suggestion.items.length).toBeGreaterThan(0);
    state.money = suggestion.totalCost + 1000;
    const { body, sent } = mount(renderInventoryPanel, state);

    q<HTMLButtonElement>(body, '[data-action="suggest"]').click();
    expect(sent).toHaveLength(0);
    for (const line of suggestion.items) {
      const packs = line.qty / getIngredient(line.id).packSize;
      expect(q<HTMLInputElement>(body, `.stepper[data-ingredient="${line.id}"] input`).value).toBe(String(packs));
      // One signal for a suggested row: the tag, switched on in place, never a tinted row too.
      const row = q(body, `li[data-ingredient="${line.id}"]`);
      expect(row.classList.contains('is-suggested')).toBe(false);
      const tag = q(row, '.sug');
      expect(tag.hidden).toBe(false);
      expect(tag.classList.contains('is-off')).toBe(false);
    }
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBeNull();

    buy.click();
    expect(sent).toEqual(
      suggestion.items.map((l) => ({ type: 'buy_ingredient', ingredientId: l.id, packs: l.qty / getIngredient(l.id).packSize })),
    );
    expect(state.money).toBe(1000);
    for (const line of suggestion.items) {
      expect(q(body, `li[data-ingredient="${line.id}"] .sug`).classList.contains('is-off')).toBe(true);
    }
  });

  it('reports a purchase through spend events only, never as text in the panel', () => {
    const state = game();
    const suggestion = autoRestockSuggestion(state);
    state.money = suggestion.totalCost + 1000;
    state.events = [];
    const { body } = mount(renderInventoryPanel, state);
    const note = q(body, '.kho-note');
    const intro = note.textContent;
    expect(intro).toContain('20% dự phòng');

    q<HTMLButtonElement>(body, '[data-action="suggest"]').click();
    expect(body.querySelector('.kho-note')).toBe(note);
    expect(note.textContent).toBe(intro);
    expect(body.textContent).not.toContain('Đã điền');

    q<HTMLButtonElement>(body, '[data-action="buy"]').click();
    expect(note.textContent).toBe(intro);
    expect(body.textContent).not.toContain('Đã nhập');
    expect(body.querySelector('[role="status"]')).toBeNull();
    // Each successful dispatch left one spend event for the HUD toast.
    const spends = state.events.filter((e) => e.type === 'spend');
    expect(spends).toHaveLength(suggestion.items.length);
    expect(spends.at(-1)).toMatchObject({ kind: 'restock', moneyLeft: 1000 });
  });

  it('says in the foot hint when the suggestion finds nothing to buy', () => {
    const state = game();
    for (const i of state.inventory) i.qty = 1_000_000;
    expect(autoRestockSuggestion(state).items).toHaveLength(0);
    const { body } = mount(renderInventoryPanel, state);
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    const hint = q(document, `#${buy.getAttribute('aria-describedby')}`);
    q<HTMLButtonElement>(body, '[data-action="suggest"]').click();
    expect(hint.textContent).toBe(NOTHING_TO_BUY);
    expect(body.querySelectorAll('.sug:not(.is-off)')).toHaveLength(0);

    q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Thêm"]').click();
    q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Bớt"]').click();
    expect(hint.textContent).toBe(PICK_HINT);
  });

  it('dims the buy button and names the money short in đ when money is short', () => {
    const state = game();
    state.money = 1000;
    const { body, sent } = mount(renderInventoryPanel, state);
    q<HTMLButtonElement>(body, '.stepper[data-ingredient="coffee_beans"] button[aria-label^="Thêm"]').click();
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    const pack = ingredientPrice(state, 'coffee_beans', getIngredient('coffee_beans').packSize);
    const hint = q(document, `#${buy.getAttribute('aria-describedby')}`);
    expect(hint.textContent).toBe(`Thiếu ${formatMoney(pack - 1000)}. Bớt ${getIngredient('coffee_beans').name} để vừa tiền.`);
    buy.click();
    expect(sent).toHaveLength(0);

    // Several lines: the hint names the one that costs the most.
    for (let i = 0; i < 3; i++) q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Thêm"]').click();
    const milk = ingredientPrice(state, 'milk', 3 * getIngredient('milk').packSize);
    const top = milk > pack ? 'milk' : 'coffee_beans';
    expect(hint.textContent).toBe(`Thiếu ${formatMoney(pack + milk - 1000)}. Bớt ${getIngredient(top).name} để vừa tiền.`);
  });

  it('lets a broke shop buy one pack on credit of an ingredient that ran low', () => {
    const state = game();
    state.money = -20000;
    state.inventory.find((i) => i.id === 'milk')!.qty = 0;
    const { body, sent } = mount(renderInventoryPanel, state);
    const plus = q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Thêm"]');
    plus.click();
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    const hint = q(document, `#${buy.getAttribute('aria-describedby')}`);
    const pack = ingredientPrice(state, 'milk', getIngredient('milk').packSize);
    expect(buy.getAttribute('aria-disabled')).toBeNull();
    expect(hint.textContent).toBe(`Nhập chịu 1 gói mỗi món sắp hết; tiền còn ${formatMoney(-20000 - pack)}.`);

    // Two packs are more than credit covers.
    plus.click();
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(hint.textContent).toContain('Thiếu');
    q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Bớt"]').click();
    buy.click();
    expect(sent).toEqual([{ type: 'buy_ingredient', ingredientId: 'milk', packs: 1 }]);
    expect(state.money).toBe(-20000 - pack);
  });

  it('fills Gợi ý the way apply_restock buys, so a broke shop can restock in one click', () => {
    const state = createNewGame('Quán Nợ', 'hard', 7);
    for (const i of state.inventory) i.qty = 0;
    state.money = -20000;
    const plan = restockPlan(state);
    expect(plan.buy.length).toBeGreaterThan(0);
    expect(autoRestockSuggestion(state).items.some((l) => l.qty > getIngredient(l.id).packSize)).toBe(true);
    const { body, sent } = mount(renderInventoryPanel, state);
    q<HTMLButtonElement>(body, '[data-action="suggest"]').click();
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBeNull();
    buy.click();
    expect(sent).toEqual(plan.buy.map((l) => ({ type: 'buy_ingredient', ingredientId: l.id, packs: 1 })));
    expect(state.money).toBe(-20000 - plan.buy.reduce((a, l) => a + l.cost, 0));
  });

  it('keeps a Gợi ý line credit cannot cover at full size and names it to trim', () => {
    const state = game();
    for (const i of state.inventory) i.qty = 0;
    // Milk at its warning level: still short for the day, not low enough for credit.
    state.inventory.find((i) => i.id === 'milk')!.qty = getIngredient('milk').lowStock;
    state.money = 0;
    const plan = restockPlan(state);
    const milk = plan.skipped.find((l) => l.id === 'milk')!;
    expect(milk).toBeTruthy();
    const { body } = mount(renderInventoryPanel, state);
    q<HTMLButtonElement>(body, '[data-action="suggest"]').click();
    const packs = milk.qty / getIngredient('milk').packSize;
    expect(q<HTMLInputElement>(body, '.stepper[data-ingredient="milk"] input').value).toBe(String(packs));
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    const hint = q(document, `#${buy.getAttribute('aria-describedby')}`);
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(hint.textContent).toContain(`Bớt ${getIngredient('milk').name}`);

    for (let i = 0; i < packs; i++) q<HTMLButtonElement>(body, '.stepper[data-ingredient="milk"] button[aria-label^="Bớt"]').click();
    expect(buy.getAttribute('aria-disabled')).toBeNull();
    expect(hint.textContent).toContain('Nhập chịu');
  });

  it('shows a low-stock badge', () => {
    const state = game();
    state.inventory.find((i) => i.id === 'milk')!.qty = 10;
    state.inventory.find((i) => i.id === 'cacao')!.qty = 0;
    // Enough for the whole day-1 demand.
    state.inventory.find((i) => i.id === 'coffee_beans')!.qty = 10_000;
    const { body } = mount(renderInventoryPanel, state);
    expect(q(body, 'li[data-ingredient="milk"] .badge').textContent).toBe('Sắp hết');
    expect(q(body, 'li[data-ingredient="cacao"] .badge').textContent).toBe('Hết');
    expect(q(body, 'li[data-ingredient="coffee_beans"] .badge').textContent).toBe('Đủ');
    // Icon + word, not colour alone.
    expect(useOf(q(body, 'li[data-ingredient="milk"] .badge'))).toBe('i-warning');
    expect(useOf(q(body, 'li[data-ingredient="cacao"] .badge'))).toBe('i-error');
    expect(useOf(q(body, 'li[data-ingredient="coffee_beans"] .badge'))).toBe('i-ok');
  });

  it('moves the badge and the dock count with the stock, against the demand left today', () => {
    const state = game();
    for (const m of state.menu) m.enabled = m.id === 'espresso';
    state.history.push({ ...createDayStats(1, 3), sold: { espresso: 40 } });
    state.day = 2;
    for (const i of state.inventory) i.qty = 10_000;
    const { body, handle } = mount(renderInventoryPanel, state);
    const badge = q(body, 'li[data-ingredient="coffee_beans"] .badge');
    expect(badge.textContent).toBe('Đủ');
    expect(lowStockCount(state)).toBe(0);

    // 704 g is above the fixed warning level (100 g) but short of 40 × 18 g.
    state.inventory.find((i) => i.id === 'coffee_beans')!.qty = 704;
    handle!.update!(state);
    expect(badge.textContent).toBe('Sắp hết');
    expect(badge.classList.contains('is-level-changed')).toBe(true);
    expect(q(body, 'li[data-ingredient="coffee_beans"] .item-meta').textContent).toContain('đủ khoảng 39 ly hôm nay');
    const notOk = body.querySelectorAll('li[data-ingredient] .badge:not(.badge-ok)').length;
    expect(lowStockCount(state)).toBe(notOk);
    expect(notOk).toBe(1);
    expect(toastForEvent({ type: 'low_stock', ingredientId: 'coffee_beans' }, state)?.title).toBe('Sắp hết Cà phê hạt');

    state.inventory.find((i) => i.id === 'coffee_beans')!.qty = 0;
    handle!.update!(state);
    expect(badge.textContent).toBe('Hết');
    expect(lowStockCount(state)).toBe(1);
  });

  it('keeps one hint slot under the buy button, never hidden, for every message', () => {
    const state = game();
    state.money = 1_000_000;
    const { body } = mount(renderInventoryPanel, state);
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    const hint = q(document, `#${buy.getAttribute('aria-describedby')}`);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(PICK_HINT);
    expect(useOf(hint)).toBe('i-info');
    expect(buy.getAttribute('aria-disabled')).toBe('true');

    const plus = q<HTMLButtonElement>(body, '.stepper[data-ingredient="coffee_beans"] button[aria-label^="Thêm"]');
    plus.click();
    expect(buy.getAttribute('aria-disabled')).toBeNull();
    expect(q(document, `#${buy.getAttribute('aria-describedby')}`)).toBe(hint);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).not.toBe(PICK_HINT);
    expect(hint.classList.contains('reason-danger')).toBe(false);

    state.money = 1000;
    plus.click();
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(q(document, `#${buy.getAttribute('aria-describedby')}`)).toBe(hint);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toContain('Thiếu');
    expect(hint.classList.contains('reason-danger')).toBe(true);
    expect(useOf(hint)).toBe('i-lock');
    expect(body.querySelectorAll('.panel-foot .reason')).toHaveLength(1);
  });

  it('puts Kho rows on the P24 scale: 44 px controls, one suggested signal, rows kept on phones', () => {
    const css = readFileSync('src/ui/panels/panels.css', 'utf8');
    const rule = (sel: string): string => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.step-btn,\n.step-input')).toContain('height: var(--size-control-md)');
    expect(rule('.step-btn')).toContain('box-shadow: var(--btn-shadow-rest)');
    expect(rule('.prep .btn-lg')).toContain('min-height: var(--size-control-lg)');
    expect(css).not.toMatch(/\.is-suggested|\.status-ok|\.item-cost/);
    // Every prep row is an .item-row now: no old card variant or phone rule that restacks it.
    expect(css).not.toMatch(/\.item:not\(\.item-row\)|\.item-side|\.stepper-label|\.(task|staff|mission|meter)[\s,.:[{]/);

    const { body } = mount(renderInventoryPanel, game());
    const row = q(body, 'li[data-ingredient="milk"]');
    expect(row.classList.contains('item-row')).toBe(true);
    expect([...row.children].map((c) => c.classList[0])).toEqual(['item-icon', 'item-text', 'badge', 'stepper']);
  });

  it('draws the ingredient icon by id and names the ingredient on − and +', () => {
    const state = game();
    const { body } = mount(renderInventoryPanel, state);
    expect(useOf(q(body, 'li[data-ingredient="milk"] .item-icon'))).toBe('i-milk');
    const name = getIngredient('milk').name;
    const buttons = [...body.querySelectorAll('.stepper[data-ingredient="milk"] .step-btn')].map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual([`Bớt 1 gói ${name}`, `Thêm 1 gói ${name}`]);
    expect(q(body, '.stepper[data-ingredient="milk"] .step-input').id).toBeTruthy();
  });
});

describe('money checks', () => {
  it('disables upgrade and campaign buttons when money is short', () => {
    const state = game();
    state.money = 0;
    const up = mount(renderUpgradesPanel, state);
    const buy = q<HTMLButtonElement>(up.body, '[data-upgrade="tables"] [data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    buy.click();
    expect(up.body.querySelector('.confirm')).toBeNull();

    const mk = mount(renderMarketingPanel, state);
    const run = q<HTMLButtonElement>(mk.body, '[data-campaign="flyers"] [data-action="run"]');
    expect(run.getAttribute('aria-disabled')).toBe('true');
    run.click();
    expect([...up.sent, ...mk.sent]).toHaveLength(0);
  });

  it('buys an upgrade after the in-place confirm', () => {
    const state = game();
    const { body, sent } = mount(renderUpgradesPanel, state);
    q<HTMLButtonElement>(body, '[data-upgrade="plants"] [data-action="buy"]').click();
    q<HTMLButtonElement>(body, '[data-upgrade="plants"] .confirm [data-action="confirm"]').click();
    expect(sent).toEqual([{ type: 'buy_upgrade', upgradeId: 'plants' }]);
    expect(state.upgrades.plants).toBe(1);
    expect(q(body, '[data-upgrade="plants"]').textContent).toContain('Cấp 1/');
  });
});

describe('staff panel', () => {
  it('sends assign_role when a role is picked from the dropdown', () => {
    const state = game();
    const candidate = state.candidates[0]!;
    simDispatch(state, { type: 'hire_staff', candidateId: candidate.id, role: 'barista' });
    const { body, sent } = mount(renderStaffPanel, state);

    const dd = q(body, `.dd[data-staff="${candidate.id}"]`);
    const btn = q<HTMLButtonElement>(dd, '.dd-btn');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const list = q(dd, '[role="listbox"]');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(sent).toEqual([{ type: 'assign_role', staffId: candidate.id, role: 'cleaner' }]);
    expect(state.staff[0]!.role).toBe('cleaner');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toContain('Dọn dẹp');
  });

  it('locks the role dropdown while auto-assign is on', () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    const { body, sent } = mount(renderStaffPanel, state);
    q<HTMLButtonElement>(body, '.setting [role="switch"]').click();
    expect(sent).toEqual([{ type: 'set_auto_assign', enabled: true }]);
    const btn = q<HTMLButtonElement>(body, '.dd-btn');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.textContent).toContain('Tự động');
    expect([...btn.querySelectorAll<HTMLElement>('.ic')].map((u) => u.dataset.icon)).toEqual(['i-auto', 'i-chevron-down']);
    expect(useOf(q(document, `#${btn.getAttribute('aria-describedby')}`))).toBe('i-lock');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('hires a candidate and lets staff go after an in-place confirm', () => {
    const state = game();
    const { body, sent } = mount(renderStaffPanel, state);
    const id = state.candidates[0]!.id;
    q<HTMLButtonElement>(body, `[data-candidate="${id}"] [data-action="hire"]`).click();
    expect(sent[0]).toEqual({ type: 'hire_staff', candidateId: id, role: 'barista' });
    expect(body.querySelector(`li[data-staff="${id}"]`)).not.toBeNull();

    q<HTMLButtonElement>(body, `li[data-staff="${id}"] [data-action="fire"]`).click();
    expect(sent).toHaveLength(1);
    expect(q(body, `li[data-staff="${id}"] .confirm`).textContent).toContain('Hôm nay không trả lương');
    q<HTMLButtonElement>(body, `li[data-staff="${id}"] .confirm [data-action="confirm"]`).click();
    expect(sent[1]).toEqual({ type: 'fire_staff', staffId: id });
    expect(state.staff).toHaveLength(0);
  });

  it('keeps a fired member\'s wage in the wage total once the doors opened', () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    const wage = state.staff[0]!.wagePerDay;
    state.phase = 'peak';
    const { body, handle } = mount(renderStaffPanel, state);
    simDispatch(state, { type: 'fire_staff', staffId: state.staff[0]!.id });
    handle!.update!(state);
    expect(q(body, '.foot-sum b').textContent).toBe(formatMoney(wage));
  });

  it('says the wage is still paid when letting staff go after opening', () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    state.phase = 'peak';
    const { body } = mount(renderStaffPanel, state);
    q<HTMLButtonElement>(body, '[data-action="fire"]').click();
    expect(q(body, '.confirm').textContent).toContain('Vẫn trả lương hôm nay');
  });
});

describe('one row template for Nhân viên, Marketing, Nâng cấp and Việc', () => {
  /** Hired staff, a running campaign, a maxed upgrade and report tips, so every row kind renders. */
  function rich(): GameState {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    state.campaigns.push({ id: 'flyers', daysLeft: 2 });
    state.upgrades.plants = getUpgrade('plants').maxLevel;
    state.lastReport = {
      day: 1,
      revenue: 0,
      ingredientCost: 0,
      wages: 0,
      marketingCost: 0,
      profit: 0,
      money: state.money,
      customersArrived: 0,
      customersServed: 0,
      customersLost: 0,
      topSellers: [],
      outOfStock: [],
      ratingStart: 3,
      ratingEnd: 3,
      reviews: [],
      suggestions: [{ kind: 'restock', text: 'Nhập thêm sữa' }],
    };
    return state;
  }

  it.each([
    ['staff', renderStaffPanel],
    ['marketing', renderMarketingPanel],
    ['upgrades', renderUpgradesPanel],
    ['tasks', renderTasksPanel],
  ] as const)('%s: every list row is an .item-row with one title, one meta line, at most one status label', (_, render) => {
    const { body } = mount(render, rich());
    const rows = [...body.querySelectorAll<HTMLElement>('li')].filter((li) => !li.classList.contains('empty') && !li.closest('.week-today, .dd'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toMatch(/^item item-row\b/);
      expect(q(row, ':scope > .item-icon')).toBeTruthy();
      expect(row.querySelectorAll(':scope > .item-text > .item-title')).toHaveLength(1);
      expect(row.querySelectorAll(':scope > .item-text > .item-meta').length).toBeLessThanOrEqual(1);
      expect(row.querySelectorAll(':scope > .item-status .badge:not([hidden])').length).toBeLessThanOrEqual(1);
    }
    expect(body.querySelector('.staff, .task, .mission, .meter, .stepper-label, .item-side')).toBeNull();
  });

  it('puts wage and speed on the staff meta line and the busy label in the status slot', () => {
    const state = rich();
    const member = state.staff[0]!;
    const { body } = mount(renderStaffPanel, state);
    const row = q(body, `li[data-staff="${member.id}"]`);
    expect(q(row, '.item-meta').textContent).toMatch(/^Lương [\d.]+đ\/ngày · tốc độ ×\d,\d\d$/);
    expect(q(row, '.item-status').textContent).toBe('Rảnh');
    // Đổi vai stays a menu in the row and Cho nghỉ sits next to it: no "Vai" label, no modal.
    expect([...q(row, '.item-control').children].map((c) => c.className.split(' ')[0])).toEqual(['dd', 'btn']);
    expect(row.textContent).not.toMatch(/^Vai|Tốc độ /);
  });

  it('shows the campaign price in the meta line and "Đang chạy" only while it runs', () => {
    const { body } = mount(renderMarketingPanel, rich());
    const flyers = q(body, '[data-campaign="flyers"]');
    expect(q(flyers, '.item-meta').textContent).toMatch(/^Giá [\d.]+đ · \+\d+% khách · /);
    expect(q(flyers, '.item-status .badge').hidden).toBe(false);
    expect(q(flyers, '.item-status').textContent).toBe('Đang chạy');
    expect(q(flyers, '[data-action="run"]').hidden).toBe(true);
    const other = q(body, 'li[data-campaign]:not([data-campaign="flyers"])');
    expect(q(other, '.item-status .badge').hidden).toBe(true);
    expect(q(other, '[data-action="run"]').hidden).toBe(false);
  });

  it('shows the next price and effect per level on one upgrade meta line, "Tối đa" and Gỡ when maxed', () => {
    const { body } = mount(renderUpgradesPanel, rich());
    const tables = q(body, '[data-upgrade="tables"]');
    expect(q(tables, '.item-meta').textContent).toMatch(/^Giá [\d.]+đ · Cấp 0\/\d+ · mỗi cấp \+\d+ chỗ ngồi$/);
    expect(q(tables, '.item-status .badge').hidden).toBe(true);

    // E-05: plants at its base max on a level-1 shop waits for the extra level shop level 4 opens.
    const plants = q(body, '[data-upgrade="plants"]');
    expect(q(plants, '.item-status').textContent).toBe('Cần cấp quán 4');
    expect(q(plants, '[data-action="buy"]').hidden).toBe(true);

    const top = rich();
    top.shopLevel = MAX_SHOP_LEVEL;
    top.upgrades.plants = getUpgrade('plants').maxLevel + maxLevelBonus(MAX_SHOP_LEVEL, 'plants');
    const maxed = q(mount(renderUpgradesPanel, top).body, '[data-upgrade="plants"]');
    expect(q(maxed, '.item-meta').textContent).toMatch(/^Cấp (\d+)\/\1 · mỗi cấp /);
    expect(q(maxed, '.item-status').textContent).toBe('Tối đa');
    expect(q(maxed, '[data-action="buy"]').hidden).toBe(true);
    expect(q(maxed, '[data-remove="plants"]').hidden).toBe(false);
  });

  it('brings Mua and its reason back when the upgrade confirm is cancelled', () => {
    const state = game();
    const { body } = mount(renderUpgradesPanel, state);
    const row = q(body, '[data-upgrade="tables"]');
    const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
    buy.click();
    expect(buy.hidden).toBe(true);
    q<HTMLButtonElement>(row, '.confirm [data-action="cancel"]').click();
    expect(buy.hidden).toBe(false);
    expect(row.querySelector('.confirm')).toBeNull();
  });

  it('writes no transaction sentence into the panels after hiring, running or buying', () => {
    const state = game();
    const staff = mount(renderStaffPanel, state);
    q<HTMLButtonElement>(staff.body, '[data-action="hire"]').click();
    const mk = mount(renderMarketingPanel, state);
    q<HTMLButtonElement>(mk.body, '[data-campaign="flyers"] [data-action="run"]').click();
    const up = mount(renderUpgradesPanel, state);
    q<HTMLButtonElement>(up.body, '[data-upgrade="tables"] [data-action="buy"]').click();
    q<HTMLButtonElement>(up.body, '[data-upgrade="tables"] .confirm [data-action="confirm"]').click();
    for (const body of [staff.body, mk.body, up.body]) {
      expect(body.textContent).not.toMatch(/Đã (tuyển|chạy|mua)|Còn lại|−[\d.]+đ/);
      expect(body.querySelector('[role="status"]')).toBeNull();
    }
  });
});

describe('focus after an action', () => {
  it('keeps focus in the panel after hiring, on the next candidate', () => {
    const state = game();
    const { body } = mount(renderStaffPanel, state);
    const [first, second] = state.candidates;
    const hire = q<HTMLButtonElement>(body, `[data-candidate="${first!.id}"] [data-action="hire"]`);
    hire.focus();
    hire.click();
    expect(hire.isConnected).toBe(false);
    expect(body.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(q(body, `[data-candidate="${second!.id}"] [data-action="hire"]`));
  });

  it('keeps focus in the panel after letting the last staff member go', async () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    const { body } = mount(renderStaffPanel, state);
    q<HTMLButtonElement>(body, '[data-action="fire"]').click();
    await Promise.resolve();
    const ok = q<HTMLButtonElement>(body, '.confirm [data-action="confirm"]');
    ok.focus();
    ok.click();
    expect(state.staff).toHaveLength(0);
    expect(document.activeElement).not.toBe(document.body);
    expect(body.contains(document.activeElement)).toBe(true);
  });

  it('moves focus to the next staff row when one of two is let go', () => {
    const state = game();
    const [a, b] = state.candidates;
    simDispatch(state, { type: 'hire_staff', candidateId: a!.id, role: 'barista' });
    simDispatch(state, { type: 'hire_staff', candidateId: b!.id, role: 'server' });
    const { body } = mount(renderStaffPanel, state);
    q<HTMLButtonElement>(body, `li[data-staff="${a!.id}"] [data-action="fire"]`).click();
    q<HTMLButtonElement>(body, `li[data-staff="${a!.id}"] .confirm [data-action="confirm"]`).click();
    expect(q(body, `li[data-staff="${b!.id}"]`).contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the upgrade row after buying', () => {
    const state = game();
    const { body } = mount(renderUpgradesPanel, state);
    q<HTMLButtonElement>(body, '[data-upgrade="plants"] [data-action="buy"]').click();
    q<HTMLButtonElement>(body, '[data-upgrade="plants"] .confirm [data-action="confirm"]').click();
    expect(document.activeElement).toBe(q(body, '[data-upgrade="plants"] [data-action="buy"]'));
  });
});

describe('task board', () => {
  it('shows the checklist and opens the shop with start_day', () => {
    const state = game();
    const { body, sent } = mount(renderTasksPanel, state);
    expect([...body.querySelectorAll('[data-task]')].map((t) => t.getAttribute('data-task'))).toEqual(['menu', 'restock', 'staff', 'marketing']);
    expect(q(body, '[data-task="staff"]').getAttribute('data-done')).toBe('false');

    const open = q<HTMLButtonElement>(body, '[data-action="open"]');
    open.click();
    expect(sent).toEqual([{ type: 'start_day' }]);
    expect(state.phase).not.toBe('preparation');
    expect(open.getAttribute('aria-disabled')).toBe('true');
  });

  it('lists suggestions from the last report', () => {
    const state = game();
    state.lastReport = {
      day: 1,
      revenue: 0,
      ingredientCost: 0,
      wages: 0,
      marketingCost: 0,
      profit: 0,
      money: state.money,
      customersArrived: 0,
      customersServed: 0,
      customersLost: 0,
      topSellers: [],
      outOfStock: [],
      ratingStart: 3,
      ratingEnd: 3,
      reviews: [],
      suggestions: [{ kind: 'hire_barista', text: '5 khách bỏ về vì chờ lâu' }],
    };
    const { body } = mount(renderTasksPanel, state);
    expect(body.textContent).toContain('5 khách bỏ về vì chờ lâu');
    expect(body.querySelector('[data-goto="staff"]')).not.toBeNull();
  });

  it('says "Cần chú ý" in words on a task that needs attention', () => {
    const state = game();
    for (const m of state.menu) m.enabled = false;
    const { body } = mount(renderTasksPanel, state);
    const menu = q(body, '[data-task="menu"]');
    // One signal: the status label (with its icon), no tinted row on top.
    expect(menu.classList.contains('is-warn')).toBe(false);
    expect(q(menu, '.item-status').textContent).toBe('Cần chú ý');
    expect(useOf(q(menu, '.item-status'))).toBe('i-warning');
    expect(q(body, '[data-task="staff"]').textContent).not.toContain('Cần chú ý');
  });

  it('keeps the "Mở Kho" link on the restock row while something should be bought', () => {
    const state = game();
    expect(autoRestockSuggestion(state).items.length).toBeGreaterThan(0);
    const { body } = mount(renderTasksPanel, state);
    const row = q(body, '[data-task="restock"]');
    expect(q(row, '.item-meta').textContent).toMatch(/^Nên nhập thêm: /);
    const link = q<HTMLButtonElement>(row, '[data-goto="inventory"]');
    expect(link.textContent).toBe('Mở Kho');
  });

  it('shows the week lines as plain text, not framed rows', () => {
    const { body } = mount(renderTasksPanel, game());
    const lines = [...body.querySelectorAll('.week-today > li')];
    expect(lines.length).toBeGreaterThan(0);
    for (const li of lines) expect(li.classList.contains('item')).toBe(false);
  });

  it('updates in place on later frames', () => {
    const state = game();
    const { body, handle } = mount(renderTasksPanel, state);
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    (handle as PanelHandle).update!(state);
    expect(q(body, '[data-task="staff"]').getAttribute('data-done')).toBe('true');
  });
});

describe('no emoji', () => {
  // Emoji plus the old symbol glyphs (dots, caret, box, tick, star, arrow).
  const EMOJI = /\p{Extended_Pictographic}|[●○▾⬜✓★→]/u;

  /** A state that reaches most branches: report tips, an unassigned and a busy hire, a locked item, low and empty stock, a running campaign, a maxed upgrade. */
  function busyState(): GameState {
    const state = game();
    const [a, b] = state.candidates;
    simDispatch(state, { type: 'hire_staff', candidateId: a!.id, role: 'none' });
    simDispatch(state, { type: 'hire_staff', candidateId: b!.id, role: 'barista' });
    state.staff[1]!.busy = true;
    state.inventory.find((i) => i.id === 'cacao')!.qty = 0;
    state.inventory.find((i) => i.id === 'milk')!.qty = 10;
    state.campaigns.push({ id: 'flyers', daysLeft: 2 });
    state.upgrades.plants = getUpgrade('plants').maxLevel;
    state.lastReport = {
      day: 1,
      revenue: 0,
      ingredientCost: 0,
      wages: 0,
      marketingCost: 0,
      profit: 0,
      money: state.money,
      customersArrived: 0,
      customersServed: 0,
      customersLost: 0,
      topSellers: [],
      outOfStock: [],
      ratingStart: 3,
      ratingEnd: 3,
      reviews: [],
      suggestions: [{ kind: 'restock', text: 'Nhập thêm sữa' }],
    };
    return state;
  }

  it.each(PREP_PANELS.map((p) => [p.id, p.render] as const))('%s panel text has no emoji', (_, render) => {
    const state = busyState();
    const { body, handle } = mount(render, state);
    expect(body.textContent).not.toMatch(EMOJI);
    expect(body.querySelectorAll('.ic').length).toBeGreaterThan(0);

    // Later states: suggestion filled, auto-assign on, money gone, shop open.
    body.querySelector<HTMLButtonElement>('[data-action="suggest"]')?.click();
    state.autoAssign = true;
    state.money = 0;
    state.phase = 'opening';
    (handle as PanelHandle).update?.(state);
    expect(body.textContent).not.toMatch(EMOJI);
  });

  it('shows an icon, not an emoji, when nobody is hired', () => {
    const { body } = mount(renderStaffPanel, game());
    expect(useOf(q(body, '.empty'))).toBe('i-chef');
    expect(body.textContent).not.toMatch(EMOJI);
  });

  it('keeps the data-action hooks the media script clicks', () => {
    const state = game();
    expect(mount(renderStaffPanel, state).body.querySelector('[data-action="hire"]')).not.toBeNull();
    const inv = mount(renderInventoryPanel, state).body;
    expect(inv.querySelector('[data-action="suggest"]')).not.toBeNull();
    expect(inv.querySelector('[data-action="buy"]')).not.toBeNull();
    expect(mount(renderUpgradesPanel, state).body.querySelector('[data-action="buy"]')).not.toBeNull();
  });
});

describe('dropdown keyboard', () => {
  it('Escape closes the list without bubbling to the panel', () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    const { body } = mount(renderStaffPanel, state);
    const onPanelKey = vi.fn();
    body.addEventListener('keydown', onPanelKey);
    q<HTMLButtonElement>(body, '.dd-btn').click();
    q(body, '[role="listbox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q(body, '.dd-btn').getAttribute('aria-expanded')).toBe('false');
    expect(onPanelKey).not.toHaveBeenCalled();
  });
});
