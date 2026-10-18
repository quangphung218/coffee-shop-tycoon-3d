// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../src/save/save';
import { listSlotSummaries, saveKey } from '../../src/save/slots';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { dispatch as simDispatch } from '../../src/sim';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { claimDailyGift, ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameState } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { createHud, type Hud } from '../../src/ui/hud/hud';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderUpgradesPanel } from '../../src/ui/panels/upgrades';
import { createMainMenu, pendingGiftDay } from '../../src/ui/screens/mainMenu';
import { nextUpgradeCost } from '../../src/sim/upgrades';

function game(): GameState {
  return createNewGame('Quán Tem', 'normal', 27);
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

let hud: Hud | null = null;

afterEach(() => {
  hud?.dispose();
  hud = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('HUD Tem chip', () => {
  function mountHud(state: GameState): HTMLElement {
    hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
    document.body.append(hud.el, hud.panelEl);
    hud.el.hidden = false;
    hud.update(state);
    return q(hud.el, '[data-cluster="progress"]');
  }

  it('shows 0 for a save without retention, then the ticket count', () => {
    const state = game();
    delete state.retention;
    const progress = mountHud(state);
    const tickets = q(progress, '[data-stat="tickets"]');
    expect(tickets.textContent).toBe('0');
    const chip = tickets.parentElement!;
    expect(chip.className).toBe('hud-val');
    expect(chip.title).toBe('Tem');
    expect(q(chip, '.sr-only').textContent).toBe('Tem ');
    // Beside the money, before the rating.
    expect(chip.previousElementSibling?.querySelector('[data-stat="money"]')).toBeTruthy();

    ensureRetention(state).tickets = 12;
    hud!.update(state);
    expect(tickets.textContent).toBe('12');
  });
});

describe('Nâng cấp: Tem price and blocked reasons', () => {
  function mountUpgrades(state: GameState): { body: HTMLElement; handle: PanelHandle } {
    const body = document.createElement('div');
    document.body.append(body);
    const ctx: PanelContext = { dispatch: (cmd: Command) => simDispatch(state, cmd), getState: () => state, close: () => {} };
    return { body, handle: renderUpgradesPanel(body, ctx) };
  }

  const reasonOf = (row: HTMLElement): string => q(row, '.reason').textContent ?? '';

  it('prices a ticketCost row in money + Tem and names the missing Tem', () => {
    const state = game();
    state.shopLevel = 6;
    state.money = 100_000_000;
    delete state.retention;
    const { body, handle } = mountUpgrades(state);
    const row = q(body, '[data-upgrade="record_player"]');
    const cost = nextUpgradeCost(state, 'record_player')!;
    expect(q(row, '.item-meta').textContent).toMatch(new RegExp(`^Giá ${formatMoney(cost)} \\+ 3 Tem · Cấp 0/1`));
    const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(row)).toBe('Thiếu 3 Tem');

    ensureRetention(state).tickets = 1;
    handle.update?.(state);
    expect(reasonOf(row)).toBe('Thiếu 2 Tem');

    state.retention!.tickets = 3;
    handle.update?.(state);
    expect(buy.getAttribute('aria-disabled')).not.toBe('true');
    buy.click();
    expect(q(row, '.confirm').textContent).toContain(`với ${formatMoney(cost)} + 3 Tem?`);
  });

  it('keeps the money price alone on rows without tickets', () => {
    const state = game();
    const { body } = mountUpgrades(state);
    expect(q(body, '[data-upgrade="tables"] .item-meta').textContent).not.toContain('Tem');
  });

  it('locks the sofa until the area is expanded, with the reason under Mua', () => {
    const state = game();
    state.shopLevel = 8;
    state.money = 100_000_000;
    ensureRetention(state).tickets = 20;
    const { body, handle } = mountUpgrades(state);
    const row = q(body, '[data-upgrade="sofa_corner"]');
    const buy = q<HTMLButtonElement>(row, '[data-action="buy"]');
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(row)).toBe(`Cần ${getUpgrade('expand_area').name} trước khi mua ${getUpgrade('sofa_corner').name}`);

    state.upgrades.expand_area = 1;
    handle.update?.(state);
    expect(buy.getAttribute('aria-disabled')).not.toBe('true');
    expect(q(row, '.reason').hidden).toBe(true);
  });

  it('shows the shop level that opens the next expand_area level, then Tối đa', () => {
    const state = game();
    state.shopLevel = 6;
    state.upgrades.expand_area = getUpgrade('expand_area').maxLevel;
    const { body, handle } = mountUpgrades(state);
    const badge = q(body, '[data-upgrade="expand_area"] .item-status .badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('Mở ở cấp quán 7');

    state.shopLevel = 7;
    state.upgrades.expand_area += 1;
    handle.update?.(state);
    expect(badge.textContent).toBe('Mở ở cấp quán 9');

    state.shopLevel = 9;
    state.upgrades.expand_area += 1;
    handle.update?.(state);
    expect(badge.textContent).toBe('Tối đa');
  });
});

describe('Main Menu daily gift line', () => {
  const actions = { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() };

  function menuLine(storage: StorageLike, today: Date): HTMLElement {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(today);
    const menu = createMainMenu(storage, actions);
    document.body.append(menu.el);
    menu.onShow?.();
    return q(menu.el, '[data-menu-line="gift"]');
  }

  it('reads the last gift date and streak into the slot summary', () => {
    const storage = createMemoryStorage();
    const state = game();
    expect(claimDailyGift(state, '2026-10-17')).toBe(true);
    saveGame(state, '1', storage, 1000);
    const slot = listSlotSummaries(storage).find((s) => s.slot === '1')!;
    expect(slot.giftLastDate).toBe('2026-10-17');
    expect(slot.giftStreak).toBe(1);
  });

  it('shows the waiting gift until it is claimed today', () => {
    const storage = createMemoryStorage();
    const state = game();
    claimDailyGift(state, '2026-10-17');
    saveGame(state, '1', storage, 1000);

    const next = menuLine(storage, new Date(2026, 9, 18, 9));
    expect(next.hidden).toBe(false);
    expect(next.textContent).toBe('Quà ngày 2 đang chờ');
    expect(next.className).toBe('card-sub');
    document.body.replaceChildren();

    const same = menuLine(storage, new Date(2026, 9, 17, 23));
    expect(same.hidden).toBe(true);
    document.body.replaceChildren();

    // A missed day starts the streak again.
    expect(menuLine(storage, new Date(2026, 9, 20, 9)).textContent).toBe('Quà ngày 1 đang chờ');
  });

  it('reads a save without retention (or a broken one) as gift day 1, without errors', () => {
    const storage = createMemoryStorage();
    const state = game();
    delete state.retention;
    saveGame(state, '1', storage, 1000);
    const slot = listSlotSummaries(storage).find((s) => s.slot === '1')!;
    expect(slot.error).toBeUndefined();
    expect(slot.giftLastDate).toBeUndefined();
    expect(menuLine(storage, new Date(2026, 9, 18)).textContent).toBe('Quà ngày 1 đang chờ');

    const file = JSON.parse(storage.getItem(saveKey('1'))!);
    file.state.retention = { login: 'x' };
    storage.setItem(saveKey('1'), JSON.stringify(file));
    const broken = listSlotSummaries(storage).find((s) => s.slot === '1')!;
    expect(broken.error).toBeUndefined();
    expect(broken.giftStreak).toBeUndefined();
  });

  it('hides the line with Continue when there is no save', () => {
    const line = menuLine(createMemoryStorage(), new Date(2026, 9, 18));
    expect(line.hidden).toBe(true);
    expect(line.parentElement!.hidden).toBe(true);
  });

  it('pendingGiftDay wraps the streak after day 7 and ignores a clock moved back', () => {
    const slot = { slot: '1' as const, empty: false, giftLastDate: '2026-10-17', giftStreak: 7 };
    expect(pendingGiftDay(slot, '2026-10-18')).toBe(1);
    expect(pendingGiftDay({ ...slot, giftStreak: 3 }, '2026-10-18')).toBe(4);
    expect(pendingGiftDay(slot, '2026-10-16')).toBeNull();
    expect(pendingGiftDay(slot, '2026-10-17')).toBeNull();
    // Across a month end.
    expect(pendingGiftDay({ ...slot, giftLastDate: '2026-10-31', giftStreak: 2 }, '2026-11-01')).toBe(3);
  });
});
