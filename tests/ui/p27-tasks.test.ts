// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { ACHIEVEMENT_IDS, ACHIEVEMENTS } from '../../src/sim/data/retention';
import { getMenuItem } from '../../src/sim/data/menu';
import { isVipDay, VIP_TICKETS } from '../../src/sim/specialOrders';
import { createNewGame } from '../../src/sim/state';
import type { Command, GameEvent, GameState, SpecialOrder } from '../../src/sim/types';
import { localDateKey } from '../../src/ui/core/today';
import { toastForEvent } from '../../src/ui/hud/events';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';

interface Mounted {
  body: HTMLElement;
  sent: Command[];
  handle: PanelHandle;
}

function mount(state: GameState): Mounted {
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
  return { body, sent, handle: renderTasksPanel(body, ctx) as PanelHandle };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

const game = (): GameState => createNewGame('Quán Thử', 'normal', 42);

/** Sets the machine clock to a local time, so localDateKey() returns that day. */
function setToday(y: number, month: number, d: number, hour = 9, minute = 0): void {
  vi.setSystemTime(new Date(y, month - 1, d, hour, minute));
}

const reasonOf = (body: HTMLElement, btn: HTMLElement): string => {
  const ids = (btn.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => body.querySelector(`#${id}`)?.textContent ?? '').join(' ');
};

const dayStates = (body: HTMLElement): string[] =>
  [...body.querySelectorAll('.gift-day')].map((c) => (c.classList.contains('is-claimed') ? 'claimed' : c.classList.contains('is-next') ? 'next' : '-'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('localDateKey', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(localDateKey(new Date(987, 1, 3))).toBe('0987-02-03');
  });

  it('reads the machine clock by default', () => {
    setToday(2026, 10, 18, 23, 59);
    expect(localDateKey()).toBe('2026-10-18');
  });
});

describe('daily gift card', () => {
  it('is ready on a new game: day 1 lit, nothing claimed, the button enabled', () => {
    setToday(2026, 10, 18);
    const { body } = mount(game());
    const gift = q(body, '.gift');
    expect(gift.getAttribute('data-gift')).toBe('ready');
    expect(dayStates(body)).toEqual(['next', '-', '-', '-', '-', '-', '-']);
    const btn = q(body, '[data-action="claim-gift"]');
    expect(btn.textContent).toBe('Nhận quà ngày 1');
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(gift.textContent).toContain('Quà ngày 1: +50.000đ · +1 Tem');
    // The card heads the panel.
    expect(q(body, '.prep').firstElementChild!.textContent).toBe('Quà hằng ngày');
  });

  it('sends claim_daily_gift with the local date key and then says to come back tomorrow', () => {
    setToday(2026, 10, 18, 23, 59);
    const state = game();
    const money = state.money;
    const { body, sent } = mount(state);
    q<HTMLButtonElement>(body, '[data-action="claim-gift"]').click();
    expect(sent).toEqual([{ type: 'claim_daily_gift', dateKey: '2026-10-18' }]);
    expect(state.money).toBe(money + 50000);

    const btn = q(body, '[data-action="claim-gift"]');
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('claimed');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(body, btn)).toBe('Quay lại ngày mai');
    expect(dayStates(body)).toEqual(['claimed', '-', '-', '-', '-', '-', '-']);
    // Disabled: a second click sends nothing.
    btn.click();
    expect(sent).toHaveLength(1);
  });

  it('continues the streak the next day and lights day 2', () => {
    setToday(2026, 10, 18);
    const state = game();
    simDispatch(state, { type: 'claim_daily_gift', dateKey: '2026-10-17' });
    const { body } = mount(state);
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('ready');
    expect(dayStates(body)).toEqual(['claimed', 'next', '-', '-', '-', '-', '-']);
    expect(q(body, '[data-action="claim-gift"]').textContent).toBe('Nhận quà ngày 2');
  });

  it('says the streak starts again from day 1 after a missed day', () => {
    setToday(2026, 10, 18);
    const state = game();
    simDispatch(state, { type: 'claim_daily_gift', dateKey: '2026-10-14' });
    simDispatch(state, { type: 'claim_daily_gift', dateKey: '2026-10-15' });
    const { body, sent } = mount(state);
    const btn = q(body, '[data-action="claim-gift"]');
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('reset');
    expect(dayStates(body)).toEqual(['next', '-', '-', '-', '-', '-', '-']);
    expect(reasonOf(body, btn)).toBe('Chuỗi bắt đầu lại từ ngày 1');
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    btn.click();
    expect(sent).toEqual([{ type: 'claim_daily_gift', dateKey: '2026-10-18' }]);
    expect(state.retention!.login.streak).toBe(1);
  });

  it('blocks the gift with the sim reason when the machine clock moved back', () => {
    setToday(2026, 10, 18);
    const state = game();
    simDispatch(state, { type: 'claim_daily_gift', dateKey: '2026-10-20' });
    const { body } = mount(state);
    const btn = q(body, '[data-action="claim-gift"]');
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('blocked');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(body, btn)).toBe('Ngày trên máy lùi lại, không nhận được quà');
    expect(dayStates(body)).toEqual(['claimed', '-', '-', '-', '-', '-', '-']);
  });

  it('updates when the machine day turns over with the panel open', () => {
    setToday(2026, 10, 18, 23, 59);
    const state = game();
    const { body, handle } = mount(state);
    q<HTMLButtonElement>(body, '[data-action="claim-gift"]').click();
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('claimed');
    setToday(2026, 10, 19, 0, 1);
    handle.update!(state);
    expect(q(body, '.gift').getAttribute('data-gift')).toBe('ready');
    expect(q(body, '[data-action="claim-gift"]').textContent).toBe('Nhận quà ngày 2');
  });
});

describe('special order block', () => {
  function withOrder(status: SpecialOrder['status'], progress: number): GameState {
    const state = game();
    state.day = 2;
    state.specialOrder = { itemId: state.menu[0]!.id, target: 3, byMinute: 13 * 60, progress, rewardTickets: 2, rewardMoney: 60000, status };
    return state;
  }

  it('shows the running order with its progress bar and reward', () => {
    const state = withOrder('active', 1);
    const name = getMenuItem(state.specialOrder!.itemId).name;
    const { body } = mount(state);
    const row = q(body, '[data-special-order]');
    expect(row.getAttribute('data-status')).toBe('active');
    expect(q(row, '.item-title').textContent).toBe(`3 ${name} trước 13:00 · 1/3`);
    expect(q(row, '.item-status').textContent).toBe('Đang làm');
    expect(q(row, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('33');
    expect(row.textContent).toContain('Thưởng +60.000đ · +2 Tem');
    expect(q(body, '[data-order-line="hint"]').hidden).toBe(true);
  });

  it('shows the result line once the order is done', () => {
    const { body } = mount(withOrder('completed', 3));
    const row = q(body, '[data-special-order]');
    expect(q(row, '.item-status').textContent).toBe('Xong');
    expect(q(row, '.item-meta').textContent).toBe('Đã giao đủ, nhận +60.000đ · +2 Tem.');
    expect(q(row, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');
  });

  it('shows the result line once the order is missed', () => {
    const state = withOrder('failed', 2);
    const name = getMenuItem(state.specialOrder!.itemId).name;
    const { body } = mount(state);
    const row = q(body, '[data-special-order]');
    expect(q(row, '.item-status').textContent).toBe('Hụt');
    expect(q(row, '.item-meta').textContent).toBe(`Hết giờ, giao được 2/3 ${name}.`);
  });

  it('hides the block without an order from day 2, and gives the day-1 hint', () => {
    const state = withOrder('active', 0);
    state.specialOrder = null;
    const { body, handle } = mount(state);
    const title = [...body.querySelectorAll('h3')].find((t) => t.textContent === 'Đơn đặc biệt')!;
    expect(title.hidden).toBe(true);
    expect(q(body, 'ul[aria-label="Đơn đặc biệt"]').hidden).toBe(true);
    expect(q(body, '[data-order-line="hint"]').hidden).toBe(true);

    state.day = 1;
    delete state.specialOrder;
    handle.update!(state);
    expect(title.hidden).toBe(false);
    expect(q(body, '[data-order-line="hint"]').hidden).toBe(false);
    expect(q(body, '[data-order-line="hint"]').textContent).toBe('Từ ngày 2 có đơn đặc biệt');
  });

  it('adds the VIP line on a VIP day', () => {
    const state = game();
    const vipDay = Array.from({ length: 60 }, (_, i) => i + 3).find((d) => isVipDay(state.seed, d))!;
    state.day = vipDay;
    state.specialOrder = null;
    const { body } = mount(state);
    expect(q(body, '[data-order-line="vip"]').hidden).toBe(false);
    expect(q(body, '[data-order-line="vip"]').textContent).toBe('Khách VIP ghé hôm nay');
    const title = [...body.querySelectorAll('h3')].find((t) => t.textContent === 'Đơn đặc biệt')!;
    expect(title.hidden).toBe(false);
  });
});

describe('achievements', () => {
  it('opens and closes the list in place with aria-expanded', () => {
    const state = game();
    const { body } = mount(state);
    const btn = q(body, '[data-action="achievements"]');
    const list = q(body, `#${btn.getAttribute('aria-controls')}`);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(btn.textContent).toBe('Thành tựu · 0/18 mốc');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect([...list.querySelectorAll('[data-achievement]')].map((r) => r.getAttribute('data-achievement'))).toEqual(ACHIEVEMENT_IDS);
    expect(body.querySelector('[role="dialog"]')).toBeNull();
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
  });

  it('shows the tier and a bar toward the next tier', () => {
    const state = game();
    state.retention = {
      tickets: 0,
      login: { lastDate: null, streak: 0, claimed: 0 },
      lifetime: { served: 120, revenue: 0, fiveStar: 0, perfectDays: 0, threeCupWeeks: 30 },
      achievements: { served: 1, three_cups: 3 },
    };
    const { body } = mount(state);
    expect(q(body, '[data-action="achievements"]').textContent).toBe('Thành tựu · 4/18 mốc');
    const served = q(body, '[data-achievement="served"]');
    expect(q(served, '.item-title').textContent).toBe(ACHIEVEMENTS.served.name);
    expect(q(served, '.item-meta').textContent).toBe('Mốc 1/3 · 120/500');
    expect(q(served, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('24');
    expect(q(body, '[data-achievement="revenue"] .item-meta').textContent).toBe('Mốc 0/3 · 0đ/5.000.000đ');
    const cups = q(body, '[data-achievement="three_cups"]');
    expect(q(cups, '.item-meta').textContent).toBe('Mốc 3/3 · Đã đạt mọi mốc');
    expect(q(cups, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('P27 toasts', () => {
  const toast = (event: GameEvent, state = game()) => toastForEvent(event, state);

  it('gift_claimed shows money and tickets', () => {
    const t = toast({ type: 'gift_claimed', streak: 3, money: 50000, tickets: 2 })!;
    expect(t.level).toBe('success');
    expect(t.title).toBe('Quà ngày 3');
    expect(t.text).toBe('+50.000đ · +2 Tem');
  });

  it('achievement_unlocked names the achievement and the tier', () => {
    const t = toast({ type: 'achievement_unlocked', id: 'served', tier: 2 })!;
    expect(t.title).toBe(`Thành tựu: ${ACHIEVEMENTS.served.name} mốc 2`);
    expect(t.text).toBe('+4 Tem');
  });

  it('special_order reports a done order with its reward and a missed one', () => {
    const state = game();
    const itemId = state.menu[0]!.id;
    const name = getMenuItem(itemId).name;
    state.specialOrder = { itemId, target: 3, byMinute: 780, progress: 3, rewardTickets: 2, rewardMoney: 60000, status: 'completed' };
    const done = toast({ type: 'special_order', status: 'completed', itemId }, state)!;
    expect(done.level).toBe('success');
    expect(done.title).toBe(`Xong đơn đặc biệt: ${name}`);
    expect(done.text).toBe('+60.000đ · +2 Tem');
    const missed = toast({ type: 'special_order', status: 'failed', itemId }, state)!;
    expect(missed.title).toBe(`Hụt đơn đặc biệt: ${name}`);
  });

  it('vip_arrived says a VIP came in', () => {
    const t = toast({ type: 'vip_arrived', customerId: 1 })!;
    expect(t.title).toBe('Khách VIP vừa tới!');
    expect(t.text).toBe(`Phục vụ để nhận +${VIP_TICKETS} Tem.`);
  });

  it('staff_promoted names the member and the level', () => {
    const state = game();
    simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    const member = state.staff[0]!;
    expect(toast({ type: 'staff_promoted', staffId: member.id, level: 2 }, state)!.title).toBe(`${member.name} lên cấp 2`);
  });

  it('adds no toast for tickets_earned, which the toasts above already show', () => {
    expect(toast({ type: 'tickets_earned', amount: 2, total: 2, reason: 'gift' })).toBeNull();
  });

  it('a gift claim makes one toast and no notify', () => {
    const state = game();
    state.events = [];
    simDispatch(state, { type: 'claim_daily_gift', dateKey: '2026-10-18' });
    const toasts = state.events.map((e) => toastForEvent(e, state)).filter(Boolean);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.title).toBe('Quà ngày 1');
  });
});
