// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { xpToReach } from '../../src/sim/data/levels';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState, Mission } from '../../src/sim/types';
import { createHud } from '../../src/ui/hud/hud';
import type { PanelContext, PanelHandle, PanelRender } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { UPGRADE_GROUPS, renderUpgradesPanel } from '../../src/ui/panels/upgrades';

function game(): GameState {
  return createNewGame('Quán Thử', 'normal', 42);
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

interface Mounted {
  body: HTMLElement;
  sent: Command[];
  handle: PanelHandle | void;
}

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

/** jsdom has no matchMedia; stub it so the level-up flash is deterministic. */
function stubMotion(reduced: boolean): void {
  (globalThis as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query) =>
    ({
      matches: reduced,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('HUD level chip and XP bar', () => {
  let hud: ReturnType<typeof createHud> | null = null;

  beforeEach(() => stubMotion(false));
  afterEach(() => {
    hud?.dispose();
    hud = null;
  });

  function makeHud(state: GameState): HTMLElement {
    hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
    document.body.append(hud.el, hud.panelEl);
    hud.update(state);
    return hud.el;
  }

  it('shows the level name and an XP progressbar scaled to the next threshold', () => {
    const state = game();
    state.xp = 60;
    const el = makeHud(state);
    const chip = q(el, '[data-stat="level"]');
    expect(q(chip, '.level-name').textContent).toBe('Cấp 1 · Quán nhỏ');
    const bar = q(chip, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe(String(xpToReach(2)));
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuetext')).toContain('Cấp 2');
    expect(q<HTMLElement>(chip, '.xp-fill').style.width).toBe('50%');
  });

  it('reports the top level as full and capped', () => {
    const state = game();
    state.shopLevel = 6;
    state.xp = 5000;
    const el = makeHud(state);
    const bar = q(el, '[data-stat="level"] [role="progressbar"]');
    expect(q(el, '.level-name').textContent).toContain('Cấp 6');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('1');
    expect(bar.getAttribute('aria-valuetext')).toBe('Cấp tối đa');
    expect(q<HTMLElement>(el, '.xp-fill').style.width).toBe('100%');
  });

  it('flashes the chip when the level rises, but not under reduced motion', () => {
    const state = game();
    const el = makeHud(state);
    const chip = q(el, '[data-stat="level"]');
    expect(chip.classList.contains('is-level-up')).toBe(false);
    state.shopLevel = 2;
    state.xp = xpToReach(2);
    hud!.update(state);
    expect(chip.classList.contains('is-level-up')).toBe(true);

    stubMotion(true);
    chip.classList.remove('is-level-up');
    state.shopLevel = 3;
    state.xp = xpToReach(3);
    hud!.update(state);
    expect(chip.classList.contains('is-level-up')).toBe(false);
  });
});

describe('daily missions in the Task Board', () => {
  function withMissions(state: GameState, missions: Mission[]): GameState {
    state.missions = missions;
    return state;
  }

  const sample: Mission[] = [
    { id: 'serve_customers', target: 25, progress: 30, rewardXp: 25, rewardMoney: 40000, status: 'completed' },
    { id: 'food_cost', target: 38, progress: 45, rewardXp: 25, rewardMoney: 40000, status: 'failed' },
    { id: 'sell_food', target: 3, progress: 0, rewardXp: 25, rewardMoney: 40000, status: 'active' },
  ];

  it('renders a card per mission in its state, with a goal, a bar and the reward', () => {
    const { body } = mount(renderTasksPanel, withMissions(game(), sample.map((m) => ({ ...m }))));
    const cards = [...body.querySelectorAll('.mission')];
    expect(cards.map((c) => c.getAttribute('data-status'))).toEqual(['completed', 'failed', 'active']);

    const done = q(body, '.mission[data-status="completed"]');
    expect(q(done, '.badge').textContent).toContain('Xong');
    expect(q(done, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');

    const failed = q(body, '.mission[data-status="failed"]');
    expect(q(failed, '.badge').textContent).toContain('Hụt');

    const active = q(body, '.mission[data-status="active"]');
    expect(q(active, '.badge').textContent).toContain('Đang');
    const bar = q(active, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuetext')).toContain('≥ 3 phần ăn');
    expect(q(active, '.mission-reward').textContent).toContain('+25 KN');
    expect(q(active, '.mission-reward').textContent).toContain('40.000đ');
  });

  it('shows a note instead of cards when an old save has no missions', () => {
    const { body } = mount(renderTasksPanel, withMissions(game(), []));
    expect(body.querySelectorAll('.mission')).toHaveLength(0);
    expect(q(body, '.mission-empty').hidden).toBe(false);
  });

  it('refreshes mission state in place on later frames', () => {
    const state = withMissions(game(), sample.map((m) => ({ ...m })));
    const { body, handle } = mount(renderTasksPanel, state);
    expect(q(body, '.mission[data-mission="sell_food"]').getAttribute('data-status')).toBe('active');
    state.missions[2]!.status = 'completed';
    state.missions[2]!.progress = 4;
    (handle as PanelHandle).update!(state);
    expect(q(body, '.mission[data-mission="sell_food"]').getAttribute('data-status')).toBe('completed');
  });
});

describe('upgrade level locks', () => {
  it('groups upgrades into Dụng cụ / Không gian / Trang trí', () => {
    expect(UPGRADE_GROUPS.map((g) => g.title)).toEqual(['Dụng cụ', 'Không gian', 'Trang trí']);
    const equip = UPGRADE_GROUPS.find((g) => g.title === 'Dụng cụ')!;
    expect(equip.ids).toContain('grinder');
    expect(UPGRADE_GROUPS.find((g) => g.title === 'Không gian')!.ids).toContain('tables');
  });

  it('shows "Mở ở cấp N" with a disabled Mua for a tool above the shop level', () => {
    const state = game();
    state.money = 10_000_000;
    const { body, sent, handle } = mount(renderUpgradesPanel, state);
    const grinder = q(body, '[data-upgrade="grinder"]');
    expect(grinder.classList.contains('is-locked')).toBe(true);
    expect(grinder.textContent).toContain('Mở ở cấp 2');
    const buy = q<HTMLButtonElement>(grinder, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(q(document, `#${buy.getAttribute('aria-describedby')}`).textContent).toContain('Mở khóa ở Cấp 2');
    buy.click();
    expect(sent).toHaveLength(0);
    expect(grinder.querySelector('.confirm')).toBeNull();

    // An unlocked upgrade is not locked and shows its price.
    const tables = q(body, '[data-upgrade="tables"]');
    expect(tables.classList.contains('is-locked')).toBe(false);

    // Reaching the unlock level clears the lock in place.
    state.shopLevel = 2;
    (handle as PanelHandle).update!(state);
    expect(q(body, '[data-upgrade="grinder"]').classList.contains('is-locked')).toBe(false);
  });
});
