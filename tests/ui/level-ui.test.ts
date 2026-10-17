// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { MAX_SHOP_LEVEL, xpToReach } from '../../src/sim/data/levels';
import { createNewGame } from '../../src/sim/state';
import type { ActiveCampaign, Command, DailyReport, GameState, Mission, Staff, Unlocks } from '../../src/sim/types';
import { createHud } from '../../src/ui/hud/hud';
import type { PanelContext, PanelHandle, PanelRender } from '../../src/ui/hud/panels';
import { openTaskCount, registerPrepPanels } from '../../src/ui/panels';
import { renderMenuPanel } from '../../src/ui/panels/menu';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { UPGRADE_GROUPS, renderUpgradesPanel } from '../../src/ui/panels/upgrades';
import { registerReviewsPanel } from '../../src/ui/report';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { LEVEL_ICON, MENU_ICONS, UPGRADE_ICONS } from '../../src/ui/core/iconMap';
import { LEVELUP_CHIPS, renderSummary } from '../../src/ui/report/report';

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

  it('shows "Cấp N" and an XP progressbar scaled to the next threshold', () => {
    const state = game();
    state.xp = xpToReach(2) / 2;
    const el = makeHud(state);
    const chip = q(el, '[data-stat="level"]');
    expect(q(chip, '.level-name').textContent).toBe('Cấp 1');
    const bar = q(chip, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe(String(xpToReach(2)));
    expect(bar.getAttribute('aria-valuenow')).toBe(String(xpToReach(2) / 2));
    expect(bar.getAttribute('aria-valuetext')).toContain('Cấp 2');
    expect(q<HTMLElement>(chip, '.xp-fill').style.width).toBe('50%');
    expect(q(chip, '[data-stat="xp"]').textContent).toBe(`${xpToReach(2) / 2}/${xpToReach(2)}`);
  });

  it('keeps the level name out of the visible text, in the title and accessible name instead', () => {
    const state = game();
    const el = makeHud(state);
    const chip = q(el, '[data-stat="level"]');
    expect(chip.textContent).not.toContain('Quán nhỏ');
    expect(chip.textContent).not.toContain('·');
    expect(chip.getAttribute('title')).toBe('Cấp 1 · Quán nhỏ');
    expect(chip.getAttribute('role')).toBe('group');
    expect(chip.getAttribute('aria-label')).toBe('Cấp 1 · Quán nhỏ');

    state.shopLevel = 2;
    state.xp = xpToReach(2);
    hud!.update(state);
    expect(q(chip, '.level-name').textContent).toBe('Cấp 2');
    expect(chip.getAttribute('title')).toMatch(/^Cấp 2 · /);
    expect(chip.textContent).not.toContain(chip.getAttribute('title')!.split(' · ')[1]!);
  });

  it('lays the chip out on one row in the Tiến độ cluster: icon, "Cấp N", bar, count', () => {
    const el = makeHud(game());
    const chip = q(el, '[data-stat="level"]');
    const kids = [...chip.children].map((c) => c.className || c.tagName);
    expect(kids.slice(1)).toEqual(['level-name', 'xp', 'xp-num']);
    expect(chip.closest<HTMLElement>('[data-cluster]')?.dataset.cluster).toBe('progress');
    // The count can be hidden on narrow screens; the bar's title still says it.
    expect(q(chip, '[role="progressbar"]').title).toBe(q(chip, '[role="progressbar"]').getAttribute('aria-valuetext'));
  });

  it('narrows the level at ≤ 640 px: the number, and the XP bar as a line under the cluster', async () => {
    // Vitest stubs .css imports, so read the stylesheet like styles.test.ts does.
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: 'utf8'): string };
    // jsdom swaps the URL class, so use a path from the project root (vitest's cwd).
    const css = readFileSync('src/ui/styles/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
    const hiddenOnPhone = phone.match(/([^{}]+)\{\s*display:\s*none;\s*\}/g)?.join('') ?? '';
    expect(hiddenOnPhone).toContain('.hud-level .xp-num');
    expect(hiddenOnPhone).toContain('.hud-level .level-word');
    expect(phone).toMatch(/\.hud-level \.xp\s*\{[^}]*position:\s*absolute;/);
    expect(css).toMatch(/\.hud-level\s*\{[^}]*white-space:\s*nowrap;/);
    // "Cấp " is its own span, so the number stays when the word is hidden.
    const el = makeHud(game());
    expect(q(el, '.level-name .level-word').textContent).toBe('Cấp ');
    expect(q(el, '.level-name').textContent).toBe('Cấp 1');
  });

  it('shows the XP count of the current level, e.g. "320/500"', () => {
    const state = game();
    state.shopLevel = 2;
    state.xp = xpToReach(2) + 320;
    const el = makeHud(state);
    expect(q(el, '[data-stat="xp"]').textContent).toBe(`320/${xpToReach(3) - xpToReach(2)}`);
  });

  it('reports the top level as full and capped', () => {
    const state = game();
    state.shopLevel = MAX_SHOP_LEVEL;
    state.xp = 5000;
    const el = makeHud(state);
    const bar = q(el, '[data-stat="level"] [role="progressbar"]');
    expect(q(el, '.level-name').textContent).toContain(`Cấp ${MAX_SHOP_LEVEL}`);
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

  it('renders a row per mission in its state, with a goal, a bar and the reward', () => {
    const { body } = mount(renderTasksPanel, withMissions(game(), sample.map((m) => ({ ...m }))));
    const cards = [...body.querySelectorAll('li[data-mission]')];
    expect(cards.map((c) => c.getAttribute('data-status'))).toEqual(['completed', 'failed', 'active']);
    // Same row template as Kho: icon | title + one meta line | one status label.
    for (const c of cards) {
      expect(c.classList.contains('item-row')).toBe(true);
      expect(c.querySelectorAll('.item-status .badge')).toHaveLength(1);
    }

    const done = q(body, 'li[data-mission][data-status="completed"]');
    expect(q(done, '.badge').textContent).toContain('Xong');
    expect(q(done, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');

    const failed = q(body, 'li[data-mission][data-status="failed"]');
    expect(q(failed, '.badge').textContent).toContain('Hụt');

    const active = q(body, 'li[data-mission][data-status="active"]');
    expect(q(active, '.badge').textContent).toContain('Đang');
    const bar = q(active, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuetext')).toContain('≥ 3 phần ăn');
    expect(q(active, '.mission-reward').textContent).toContain('+25 KN');
    expect(q(active, '.mission-reward').textContent).toContain('40.000đ');
  });

  it('fills the bar of an active mission from today\'s live progress', () => {
    const state = withMissions(game(), [{ id: 'serve_customers', target: 20, progress: 0, rewardXp: 60, rewardMoney: 100000, status: 'active' }]);
    const { body, handle } = mount(renderTasksPanel, state);
    const bar = (): HTMLElement => q(body, 'li[data-mission="serve_customers"] [role="progressbar"]');
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    state.today.customersArrived = 12;
    state.today.customersServed = 10;
    (handle as PanelHandle).update!(state);
    expect(bar().getAttribute('aria-valuenow')).toBe('50');
    expect(bar().getAttribute('aria-valuetext')).toContain('10 khách');
  });

  it('labels an active mission with a clock icon on a flat badge', () => {
    const { body } = mount(renderTasksPanel, withMissions(game(), sample.map((m) => ({ ...m }))));
    const badge = q(body, 'li[data-mission][data-status="active"] .badge');
    expect(badge.classList.contains('badge-neutral')).toBe(true);
    expect(q(badge, '.ic').dataset.icon).toBe('i-clock');
  });

  it('shows a note instead of cards when an old save has no missions', () => {
    const { body } = mount(renderTasksPanel, withMissions(game(), []));
    expect(body.querySelectorAll('li[data-mission]')).toHaveLength(0);
    expect(q(body, '.mission-empty').hidden).toBe(false);
  });

  it('refreshes mission state in place on later frames', () => {
    const state = withMissions(game(), sample.map((m) => ({ ...m })));
    const { body, handle } = mount(renderTasksPanel, state);
    expect(q(body, 'li[data-mission="sell_food"]').getAttribute('data-status')).toBe('active');
    state.missions[2]!.status = 'completed';
    state.missions[2]!.progress = 4;
    (handle as PanelHandle).update!(state);
    expect(q(body, 'li[data-mission="sell_food"]').getAttribute('data-status')).toBe('completed');
  });
});

describe('Việc badge', () => {
  it('counts only the unfinished checklist, never the daily missions, and reaches 0', () => {
    const state = game();
    for (const item of state.inventory) item.qty = 1_000_000;
    state.staff = [{ id: 1, name: 'An', role: 'barista' } as unknown as Staff];
    state.campaigns = [{ id: 'flyers', daysLeft: 2 } as unknown as ActiveCampaign];
    expect(state.missions.filter((m) => m.status === 'active')).toHaveLength(3);
    expect(openTaskCount(state)).toBe(0);
  });
});

describe('menu level locks', () => {
  it('shows "Mở ở cấp N" with a disabled switch and its reason, and sends nothing', () => {
    const state = game();
    // Without a week only the level opens items ("Mở ngày N" is in decor-policies.test.ts).
    delete state.week;
    for (const item of state.inventory) item.qty = 1_000_000;
    const { body, sent, handle } = mount(renderMenuPanel, state);
    const row = q(body, '[data-item="cappuccino"]');
    expect(row.classList.contains('is-locked')).toBe(true);
    const label = q(row, '[data-lock="level"]');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toContain('Mở ở cấp 2');
    expect(label.tagName).toBe('SPAN');
    const sw = q<HTMLButtonElement>(row, '[role="switch"]');
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    expect(q(document, `#${sw.getAttribute('aria-describedby')}`).textContent).toContain('Mở khóa ở Cấp 2');
    sw.click();
    expect(sent).toHaveLength(0);

    // An unlocked item is not level-locked.
    expect(q(body, '[data-item="latte"] [data-lock="level"]').hidden).toBe(true);

    // Reaching the level clears the lock in place.
    state.shopLevel = 2;
    (handle as PanelHandle).update!(state);
    expect(q(body, '[data-item="cappuccino"] [data-lock="level"]').hidden).toBe(true);
    expect(q(body, '[data-item="cappuccino"] [role="switch"]').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('lets an item an old save already sells be switched off', () => {
    const state = game();
    for (const item of state.inventory) item.qty = 1_000_000;
    const entry = state.menu.find((m) => m.id === 'cake')!;
    entry.enabled = true;
    const { body } = mount(renderMenuPanel, state);
    expect(q(body, '[data-item="cake"] [data-lock="level"]').hidden).toBe(true);
    expect(q(body, '[data-item="cake"] [role="switch"]').getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('daily report: missions, XP and level-up', () => {
  const unlocks: Unlocks = { menu: ['cappuccino'], upgrades: ['fast_machine'], tools: ['grinder'] };

  function report(over: Partial<DailyReport> = {}): DailyReport {
    return {
      day: 3,
      revenue: 1_200_000,
      ingredientCost: 300_000,
      wages: 200_000,
      marketingCost: 0,
      profit: 700_000,
      money: 2_600_000,
      customersArrived: 50,
      customersServed: 45,
      customersLost: 5,
      topSellers: [],
      outOfStock: [],
      ratingStart: 3.8,
      ratingEnd: 3.9,
      reviews: [],
      suggestions: [],
      ...over,
    };
  }

  function summary(r: DailyReport): HTMLElement {
    const root = document.createElement('div');
    root.append(...renderSummary(r));
    document.body.append(root);
    return root;
  }

  it('lists each mission as reached or missed with its reward, and the XP earned', () => {
    const root = summary(
      report({
        missions: [
          { id: 'serve_customers', target: 25, progress: 45, rewardXp: 60, rewardMoney: 100000, status: 'completed' },
          { id: 'food_cost', target: 38, progress: 45, rewardXp: 60, rewardMoney: 100000, status: 'failed' },
        ],
        xpGained: 150,
      }),
    );
    const list = q(root, '[data-block="missions"]');
    const done = q(list, '[data-mission="serve_customers"]');
    expect(q(done, '.badge').textContent).toContain('Đạt');
    expect(done.textContent).toContain('45 khách');
    expect(done.textContent).toContain('+60 KN');
    expect(done.textContent).toContain('100.000đ');
    expect(q(list, '[data-mission="food_cost"] .badge').textContent).toContain('Hụt');
    expect(root.textContent).toContain('đạt 1/2');
    expect(q(root, '[data-block="xp"]').textContent).toContain('+150 KN');
    expect(root.querySelector('[data-block="level-up"]')).toBeNull();
  });

  it('shows a "Lên cấp N" card in place with a level badge and icon chips per group', () => {
    const root = summary(report({ missions: [], xpGained: 300, levelUp: { level: 2, unlocks } }));
    const band = q(root, '[data-block="level-up"]');
    expect(band.getAttribute('role')).toBe('status');
    expect(band.closest('[role="dialog"]')).toBeNull();
    expect(q(band, '.rpt-levelup-title').textContent).toBe('Lên cấp 2 · Quán quen');

    const badge = q(band, '[data-block="level-badge"]');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    const badgeIcon = q(badge, '.ic');
    expect(badgeIcon.dataset.icon).toBe(LEVEL_ICON);
    expect(badgeIcon.classList.contains('ic-xl')).toBe(true); // 48 px
    expect(q(badge, '.rpt-levelup-num').textContent).toBe('2');

    const groups = [...band.querySelectorAll<HTMLElement>('.rpt-unlock-group')].map((g) => [g.dataset.group, q(g, 'b').textContent]);
    expect(groups).toEqual([
      ['menu', 'Món mới'],
      ['upgrades', 'Nâng cấp'],
      ['tools', 'Dụng cụ'],
    ]);
    const chips = [...band.querySelectorAll<HTMLElement>('.rpt-unlock')].map((c) => [c.dataset.unlock, q(c, '.ic').dataset.icon, c.textContent]);
    expect(chips).toEqual([
      ['cappuccino', MENU_ICONS.cappuccino, 'Cappuccino'],
      ['fast_machine', UPGRADE_ICONS.fast_machine, getUpgrade('fast_machine').name],
      ['grinder', UPGRADE_ICONS.grinder, getUpgrade('grinder').name],
    ]);
    // 24 px is the default size: no size class.
    for (const c of band.querySelectorAll('.rpt-unlock .ic')) expect(c.className).toBe('ic');
    expect(band.querySelector('[data-block="unlocks-more"]')).toBeNull();
  });

  it(`shows at most ${LEVELUP_CHIPS} unlock chips and counts the rest as "+N"`, () => {
    const many: Unlocks = { menu: ['mocha', 'frappe', 'cake'], upgrades: ['paintings', 'lights', 'window_bar'], tools: ['blender', 'ice_maker'] };
    const band = q(summary(report({ levelUp: { level: 5, unlocks: many } })), '[data-block="level-up"]');
    expect(band.querySelectorAll('.rpt-unlock')).toHaveLength(LEVELUP_CHIPS);
    // The tools group has no chip left, so its heading is dropped too.
    expect(band.querySelector('[data-group="tools"]')).toBeNull();
    expect(q(band, '[data-block="unlocks-more"]').textContent).toBe('+2');
  });

  it('says so when a level unlocks nothing', () => {
    const band = q(summary(report({ levelUp: { level: 7, unlocks: { menu: [], upgrades: [], tools: [] } } })), '[data-block="level-up"]');
    expect(band.querySelector('.rpt-unlocks')).toBeNull();
    expect(band.textContent).toContain('Cấp này chưa mở thêm');
    expect(q(band, '[data-block="level-badge"] .rpt-levelup-num').textContent).toBe('7');
  });

  it('says so when an old save has no missions or XP in its report', () => {
    const root = summary(report());
    expect(root.querySelector('[data-block="missions"]')).toBeNull();
    expect(root.querySelector('[data-block="xp"]')).toBeNull();
    expect(root.querySelector('[data-block="level-up"]')).toBeNull();
    expect(root.textContent).toContain('lưu từ bản cũ');
  });
});

describe('dock groups', () => {
  // The 390 px CSS (divider takes no grid cell) is checked in styles.test.ts.
  it('puts Đánh giá in its own group after Phát triển, behind a divider', () => {
    const hud = createHud({ dispatch: () => true, getState: () => game(), onPause() {}, onSettings() {}, onResetCamera() {} });
    const offs = [registerPrepPanels(), registerReviewsPanel()];
    try {
      const order = [...hud.el.querySelectorAll('.dock > *')].map((el) => (el.classList.contains('dock-sep') ? '|' : (el as HTMLElement).dataset.panel));
      expect(order).toEqual(['tasks', 'menu', 'inventory', 'staff', '|', 'marketing', 'upgrades', '|', 'reviews']);
    } finally {
      offs.forEach((off) => off());
      hud.dispose();
    }
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
    delete state.week;
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
