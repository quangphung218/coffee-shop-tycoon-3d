// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { createHud, type Hud } from '../../src/ui/hud/hud';
import type { PanelContext } from '../../src/ui/hud/panels';
import { openWarnings } from '../../src/ui/openGuard';
import { renderTasksPanel } from '../../src/ui/panels/tasks';

const NO_STAFF = 'Chưa có nhân viên: tự nhận order, pha và bưng';

function game(staffed: boolean): GameState {
  const s = createNewGame('Quán Thử', 'normal', 42);
  if (staffed) expect(simDispatch(s, { type: 'hire_staff', candidateId: s.candidates[0]!.id, role: 'barista' })).toBe(true);
  return s;
}

interface Mounted {
  root: HTMLElement;
  open: HTMLButtonElement;
  confirm: () => HTMLElement | null;
  sent: Command[];
  state: GameState;
}

let hud: Hud | null = null;

function mountTasks(state: GameState): Mounted {
  const root = document.createElement('div');
  document.body.append(root);
  const sent: Command[] = [];
  const ctx: PanelContext = { dispatch: (cmd) => (sent.push(cmd), simDispatch(state, cmd)), getState: () => state, close: () => {} };
  renderTasksPanel(root, ctx);
  return { root, open: root.querySelector('[data-action="open"]')!, confirm: () => root.querySelector('.panel-foot .confirm'), sent, state };
}

function mountHud(state: GameState): Mounted {
  const sent: Command[] = [];
  hud = createHud({ dispatch: (cmd) => (sent.push(cmd), simDispatch(state, cmd)), getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
  document.body.append(hud.el, hud.panelEl);
  hud.el.hidden = false;
  hud.update(state);
  const root = hud.el.querySelector<HTMLElement>('header.hud')!;
  return { root, open: root.querySelector('[data-action="open"]')!, confirm: () => root.querySelector('.hud-confirm'), sent, state };
}

const button = (row: HTMLElement, text: string): HTMLButtonElement | undefined => [...row.querySelectorAll('button')].find((b) => b.textContent === text);

afterEach(() => {
  hud?.dispose();
  hud = null;
  document.body.replaceChildren();
});

describe('T-37 openWarnings', () => {
  it('lists no staff on a new game, nothing once a barista is hired', () => {
    expect(openWarnings(game(false)).map((w) => w.id)).toEqual(['staff']);
    expect(openWarnings(game(true))).toEqual([]);
  });
});

for (const [where, mount] of [
  ['Việc panel', mountTasks],
  ['HUD Open button', mountHud],
] as const) {
  describe(`T-37 shared start_day guard: ${where} (UX-004)`, () => {
    it('0 staff: asks with the no-staff line and a Mở Nhân viên button, sends nothing yet', () => {
      const m = mount(game(false));
      m.open.click();
      const row = m.confirm()!;
      expect(row).not.toBeNull();
      expect(row.textContent).toContain(NO_STAFF);
      expect(button(row, 'Mở Nhân viên')?.getAttribute('data-goto')).toBe('staff');
      expect(row.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(m.sent).toEqual([]);
      m.open.click();
      expect(m.root.querySelectorAll('.confirm')).toHaveLength(1);
    });

    it('0 staff: confirming still opens the shop (never blocked)', () => {
      const m = mount(game(false));
      m.open.click();
      m.confirm()!.querySelector<HTMLButtonElement>('[data-action="confirm"]')!.click();
      expect(m.sent).toEqual([{ type: 'start_day' }]);
      expect(m.state.phase).not.toBe('preparation');
      expect(m.confirm()).toBeNull();
    });

    it('0 staff: Mở Nhân viên opens the staff panel and does not open the shop', () => {
      const m = mount(game(false));
      const dock = document.createElement('div');
      dock.className = 'dock';
      const staff = document.createElement('button');
      staff.setAttribute('data-panel', 'staff');
      let clicked = 0;
      staff.addEventListener('click', () => clicked++);
      dock.append(staff);
      document.body.append(dock);
      m.open.click();
      button(m.confirm()!, 'Mở Nhân viên')!.click();
      expect(clicked).toBe(1);
      expect(m.sent).toEqual([]);
      expect(m.confirm()).toBeNull();
    });

    it('staff and stock: opens at once, no confirmation', () => {
      const m = mount(game(true));
      m.open.click();
      expect(m.confirm()).toBeNull();
      expect(m.sent).toEqual([{ type: 'start_day' }]);
    });

    it('empty stock and 0 staff: one row with both lines and both links', () => {
      const s = game(false);
      for (const i of s.inventory) i.qty = 0;
      const m = mount(s);
      m.open.click();
      const row = m.confirm()!;
      expect(row.textContent).toContain('Kho trống: không bán được món nào');
      expect(row.textContent).toContain(NO_STAFF);
      expect(button(row, 'Mở Kho')).toBeDefined();
      expect(button(row, 'Mở Nhân viên')).toBeDefined();
    });
  });
}
