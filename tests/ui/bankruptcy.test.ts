// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { endOfDay } from '../../src/sim/clock';
import { BANKRUPT_DAYS, debtLimit } from '../../src/sim/economy';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import { createHud, debtHints, debtRule, debtWarning, type Hud } from '../../src/ui/hud/hud';
import { bankruptSummary, latestPlayableSave } from '../../src/ui/screens/bankrupt';
import { createShell, type Shell } from '../../src/ui/screens/shell';

let shell: Shell | null = null;
let hud: Hud | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  hud?.dispose();
  hud = null;
  document.body.replaceChildren();
});

function game(): GameState {
  return createNewGame('Quán Nợ', 'normal', 42);
}

/** A game past the debt limit with `debtDays` days already closed there. */
function inDebt(debtDays: number): GameState {
  const state = game();
  state.money = -debtLimit(state) - 1;
  state.debtDays = debtDays;
  return state;
}

/** A game whose last day just closed bankrupt, in the report phase: 9 days, two scored weeks with 3 cups. */
function bankruptGame(): GameState {
  const state = inDebt(BANKRUPT_DAYS);
  state.day = 9;
  state.bankrupt = true;
  state.phase = 'report';
  ensureRetention(state).lifetime.revenue = 12_345_000;
  state.week!.archive = [
    { index: 1, startedDay: 1, revenue: 1, profit: 0, customersServed: 0, stars: 4, score: 80, cups: 2 },
    { index: 2, startedDay: 8, revenue: 1, profit: 0, customersServed: 0, stars: 4, score: 40, cups: 1 },
  ];
  return state;
}

function boot(storage: StorageLike = createMemoryStorage()): { root: HTMLElement; shell: Shell } {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
  return { root, shell };
}

function bankruptEl(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[data-screen="bankrupt"]')!;
}

describe('HUD debt warning', () => {
  it('is null when not in debt, when only below zero, and once bankrupt', () => {
    expect(debtWarning(game())).toBeNull();
    const negative = game();
    negative.money = -1;
    expect(debtWarning(negative)).toBeNull();
    expect(debtWarning(bankruptGame())).toBeNull();
  });

  it('counts the days left as BANKRUPT_DAYS - debtDays', () => {
    for (let d = 0; d < BANKRUPT_DAYS; d++) expect(debtWarning(inDebt(d))?.daysLeft).toBe(BANKRUPT_DAYS - d);
    // Back within the limit during the day, but yesterday closed past it: still counting.
    const recovering = inDebt(1);
    recovering.money = 0;
    expect(debtWarning(recovering)?.daysLeft).toBe(BANKRUPT_DAYS - 1);
  });

  it('shows days left and the hints in the HUD, and hides when out of debt', () => {
    const state = inDebt(1);
    hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings: vi.fn(), onResetCamera: vi.fn() });
    document.body.append(hud.el);
    hud.el.hidden = false;
    hud.update(state);
    const el = hud.el.querySelector<HTMLElement>('[data-stat="debt"]')!;
    expect(el.hidden).toBe(false);
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain(`còn ${BANKRUPT_DAYS - 1} ngày trước khi phá sản`);
    expect(el.textContent).toContain(`Tiền dưới ${formatMoney(-debtLimit(state))}: còn`);
    const hints = debtHints(state);
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(el.textContent).toContain(hint);
    expect(el.textContent).not.toMatch(/Bán (bớt|hết)/);

    state.money = 0;
    state.debtDays = 0;
    hud.update(state);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
  });
});

describe('HUD debt limit and money', () => {
  it('states the debt limit in the warning text', () => {
    expect(debtWarning(inDebt(BANKRUPT_DAYS - 1))?.text).toBe('Tiền dưới −500.000đ: còn 1 ngày trước khi phá sản');
    const hard = inDebt(0);
    hard.difficulty = 'hard';
    hard.money = -debtLimit(hard) - 1;
    expect(debtWarning(hard)?.text).toContain(`Tiền dưới ${formatMoney(-debtLimit(hard))}:`);
  });

  it('turns the money red below zero, with the bankruptcy rule in its title', () => {
    const state = game();
    state.money = -2_150_000;
    hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings: vi.fn(), onResetCamera: vi.fn() });
    document.body.append(hud.el);
    hud.el.hidden = false;
    hud.update(state);
    const money = hud.el.querySelector<HTMLElement>('[data-stat="money"]')!;
    expect(money.classList.contains('hud-money-danger')).toBe(true);
    expect(money.title).toBe(`Tiền: −2.150.000đ. ${debtRule(debtLimit(state))}`);
    expect(debtRule(500_000)).toBe(`Đóng cửa với tiền dưới −500.000đ ${BANKRUPT_DAYS} ngày liền là phá sản`);

    state.money = 0;
    hud.update(state);
    expect(money.classList.contains('hud-money-danger')).toBe(false);
    expect(money.hasAttribute('title')).toBe(false);
  });
});

describe('Bankruptcy screen', () => {
  it('summarises days, revenue and cups', () => {
    const state = bankruptGame();
    expect(bankruptSummary(state)).toEqual({ days: 9, revenue: 12_345_000, trophies: 3, money: state.money, limit: debtLimit(state), debtDays: BANKRUPT_DAYS });
  });

  it('opens on a bankrupt game with the run figures; Esc does not close it', () => {
    const { root, shell } = boot();
    shell.startGame(bankruptGame());
    expect(shell.screen).toBe('bankrupt');
    expect(shell.report.visible).toBe(false);
    const el = bankruptEl(root);
    expect(el.hidden).toBe(false);
    expect(el.querySelector('[data-block="days"]')!.textContent).toContain('9 ngày');
    expect(el.querySelector('[data-block="revenue"]')!.textContent).toContain(formatMoney(12_345_000));
    expect(el.querySelector('[data-block="trophies"]')!.textContent).toContain('3');
    const debt = el.querySelector('[data-block="debt"]')!;
    expect(debt.querySelector('[data-debt="money"]')!.textContent).toBe(formatMoney(-debtLimit(game()) - 1));
    expect(debt.querySelector('[data-debt="limit"]')!.textContent).toBe(formatMoney(-debtLimit(game())));
    expect(debt.querySelector('[data-debt="days"]')!.textContent).toBe(`${BANKRUPT_DAYS} ngày liền`);
    expect(document.activeElement).toBe(el.querySelector('[data-action="restart"]'));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shell.screen).toBe('bankrupt');
  });

  it('opens when the last allowed day in debt closes, without autosaving that day', () => {
    const storage = createMemoryStorage();
    const { shell } = boot(storage);
    const state = inDebt(BANKRUPT_DAYS - 1);
    state.phase = 'closing';
    state.customers = [];
    shell.startGame(state);
    expect(shell.screen).toBeNull();
    endOfDay(state);
    shell.handleEvents(state.events);
    state.events = [];
    shell.update();
    expect(state.bankrupt).toBe(true);
    expect(shell.screen).toBe('bankrupt');
    expect(latestPlayableSave(storage)).toBeNull();
  });

  it('"Chơi lại từ đầu" starts a new game for the same shop', () => {
    const { root, shell } = boot();
    shell.startGame(bankruptGame());
    bankruptEl(root).querySelector<HTMLElement>('[data-action="restart"]')!.click();
    expect(shell.screen).toBeNull();
    expect(shell.state?.shopName).toBe('Quán Nợ');
    expect(shell.state?.day).toBe(1);
    expect(shell.state?.bankrupt).toBe(false);
  });

  it('disables "Tải bản lưu gần nhất" when there is no save', () => {
    const { root, shell } = boot();
    shell.startGame(bankruptGame());
    const load = bankruptEl(root).querySelector<HTMLElement>('[data-action="load-latest"]')!;
    expect(load.getAttribute('aria-disabled')).toBe('true');
    expect(bankruptEl(root).querySelector('[data-load-note]')!.textContent).toBe('Chưa có bản lưu nào để tải.');
    load.click();
    expect(shell.screen).toBe('bankrupt');
  });

  it('loads the newest save that is not bankrupt', () => {
    const storage = createMemoryStorage();
    const older = game();
    older.day = 5;
    saveGame(older, '1', storage, 1_000);
    const newer = game();
    newer.day = 7;
    saveGame(newer, '2', storage, 2_000);
    saveGame(bankruptGame(), '3', storage, 3_000);
    expect(latestPlayableSave(storage)).toMatchObject({ slot: '2', day: 7 });

    const { root, shell } = boot(storage);
    shell.startGame(bankruptGame());
    const load = bankruptEl(root).querySelector<HTMLElement>('[data-action="load-latest"]')!;
    expect(load.hasAttribute('aria-disabled')).toBe(false);
    load.click();
    expect(shell.screen).toBeNull();
    expect(shell.state?.day).toBe(7);
    expect(shell.state?.bankrupt).toBe(false);
  });
});
