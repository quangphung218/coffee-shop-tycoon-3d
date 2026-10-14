// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { getIngredient } from '../../src/sim/data/ingredients';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { createHud } from '../../src/ui/hud/hud';
import { listPanels, type PanelContext, type PanelHandle, type PanelRender } from '../../src/ui/hud/panels';
import { PREP_PANELS, registerPrepPanels } from '../../src/ui/panels';
import { renderInventoryPanel } from '../../src/ui/panels/inventory';
import { renderMarketingPanel } from '../../src/ui/panels/marketing';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { renderStaffPanel } from '../../src/ui/panels/staff';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';

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

/** href of the first icon inside `el`. */
function useOf(el: Element): string | null {
  return el.querySelector('svg.ic use')?.getAttribute('href') ?? null;
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
  it('lists the 10 items and locks one that lacks an ingredient, with the reason', () => {
    const state = game();
    state.inventory.find((i) => i.id === 'cacao')!.qty = 0;
    const { body, sent } = mount(renderMenuPanel, state);
    expect(body.querySelectorAll('li.item')).toHaveLength(10);

    const mocha = q(body, '[data-item="mocha"]');
    const sw = q<HTMLButtonElement>(mocha, '[role="switch"]');
    expect(mocha.classList.contains('is-locked')).toBe(true);
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    const why = q(document, `#${sw.getAttribute('aria-describedby')}`);
    expect(why.textContent).toContain(getIngredient('cacao').name);
    expect(useOf(why)).toBe('#i-lock');
    expect(useOf(q(mocha, '.item-icon'))).toBe('#i-mocha');

    sw.click();
    expect(sent).toHaveLength(0);
    expect(state.menu.find((m) => m.id === 'mocha')!.enabled).toBe(false);
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
      expect(q(body, `li[data-ingredient="${line.id}"]`).classList.contains('is-suggested')).toBe(true);
    }
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBeNull();

    buy.click();
    expect(sent).toEqual(
      suggestion.items.map((l) => ({ type: 'buy_ingredient', ingredientId: l.id, packs: l.qty / getIngredient(l.id).packSize })),
    );
    expect(state.money).toBe(1000);
  });

  it('dims the buy button with the shortfall when money is short', () => {
    const state = game();
    state.money = 1000;
    const { body, sent } = mount(renderInventoryPanel, state);
    q<HTMLButtonElement>(body, '.stepper[data-ingredient="coffee_beans"] button[aria-label^="Thêm"]').click();
    const buy = q<HTMLButtonElement>(body, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(q(document, `#${buy.getAttribute('aria-describedby')}`).textContent).toContain('Thiếu');
    buy.click();
    expect(sent).toHaveLength(0);
  });

  it('shows a low-stock badge', () => {
    const state = game();
    state.inventory.find((i) => i.id === 'milk')!.qty = 10;
    state.inventory.find((i) => i.id === 'cacao')!.qty = 0;
    const { body } = mount(renderInventoryPanel, state);
    expect(q(body, 'li[data-ingredient="milk"] .badge').textContent).toBe('Sắp hết');
    expect(q(body, 'li[data-ingredient="cacao"] .badge').textContent).toBe('Hết');
    expect(q(body, 'li[data-ingredient="coffee_beans"] .badge').textContent).toBe('Đủ');
    // Icon + word, not colour alone.
    expect(useOf(q(body, 'li[data-ingredient="milk"] .badge'))).toBe('#i-warning');
    expect(useOf(q(body, 'li[data-ingredient="cacao"] .badge'))).toBe('#i-error');
    expect(useOf(q(body, 'li[data-ingredient="coffee_beans"] .badge'))).toBe('#i-ok');
  });

  it('draws the ingredient icon by id and names the ingredient on − and +', () => {
    const state = game();
    const { body } = mount(renderInventoryPanel, state);
    expect(useOf(q(body, 'li[data-ingredient="milk"] .item-icon'))).toBe('#i-milk');
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
    expect([...btn.querySelectorAll('use')].map((u) => u.getAttribute('href'))).toEqual(['#i-auto', '#i-chevron-down']);
    expect(useOf(q(document, `#${btn.getAttribute('aria-describedby')}`))).toBe('#i-lock');
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
    q<HTMLButtonElement>(body, `li[data-staff="${id}"] .confirm [data-action="confirm"]`).click();
    expect(sent[1]).toEqual({ type: 'fire_staff', staffId: id });
    expect(state.staff).toHaveLength(0);
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
    expect(body.querySelectorAll('svg.ic').length).toBeGreaterThan(0);

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
    expect(useOf(q(body, '.empty'))).toBe('#i-chef');
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
