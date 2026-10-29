import { getIngredient } from '../../sim/data/ingredients';
import { getCampaign } from '../../sim/data/marketing';
import { getMenuItem } from '../../sim/data/menu';
import { DAY_EVENTS, weekUnlockDay } from '../../sim/data/week';
import { autoRestockSuggestion, canMake } from '../../sim/inventory';
import { ACHIEVEMENTS } from '../../sim/data/retention';
import { missionProgress } from '../../sim/progression';
import { achievementProgress, giftPreview, parseDateKey, type AchievementProgress } from '../../sim/retention';
import { isVipDay, SPECIAL_ORDER_FROM_DAY } from '../../sim/specialOrders';
import { REGULARS } from '../../sim/data/regulars';
import type { GameState, MenuItemId, Mission, MissionId, SpecialOrder, SuggestionKind } from '../../sim/types';
import { todayPlan } from '../../sim/week';
import { h, isAriaDisabled, setAriaDisabled, setChildren, uid, Watcher } from '../core/dom';
import { formatClock, formatMoney, formatRating } from '../core/format';
import { DAY_EVENT_ICONS, MENU_ICONS, MISSION_ICON, UPGRADE_ICONS, WEATHER_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import { localDateKey } from '../core/today';
import { unlockNames } from '../hud/events';
import { DAY_EVENT_LABELS, WEATHER_LABELS, dayEventEffect, weatherEffect, weekDayLabel } from '../hud/hud';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { inlineConfirm, linkBtn, openOtherPanel, reasonLine, sender, setReason, withIcon } from './widgets';

export interface DayTask {
  id: 'menu' | 'restock' | 'staff' | 'marketing';
  title: string;
  done: boolean;
  /** Something is wrong, not just unfinished (locked items, empty stock). */
  warn: boolean;
  detail: string;
  panel: string;
  link: string;
}

/** True when the menu has dishes on but the stock cannot make even one serving of any. */
export function stockMakesNoDish(state: GameState): boolean {
  const enabled = state.menu.filter((m) => m.enabled);
  return enabled.length > 0 && !enabled.some((m) => canMake(state, m.id));
}

/** Today's checklist, read from the state. Unfinished tasks never block opening. */
export function dayTasks(state: GameState): DayTask[] {
  const enabled = state.menu.filter((m) => m.enabled);
  const locked = enabled.filter((m) => !canMake(state, m.id));
  const restock = autoRestockSuggestion(state).items;
  const unassigned = state.staff.filter((m) => m.role === 'none');
  const campaigns = state.campaigns.filter((c) => c.daysLeft > 0);
  const names = (ids: string[]): string => (ids.length > 3 ? `${ids.slice(0, 3).join(', ')}…` : ids.join(', '));

  return [
    {
      id: 'menu',
      title: 'Chọn menu hôm nay',
      done: enabled.length > 0 && locked.length === 0,
      warn: enabled.length === 0 || locked.length > 0,
      detail:
        enabled.length === 0
          ? 'Chưa bật món nào.'
          : locked.length > 0
            ? `${names(locked.map((m) => getMenuItem(m.id).name))} đang bán nhưng thiếu nguyên liệu.`
            : `Xong · ${enabled.length} món đang bán.`,
      panel: 'menu',
      link: 'Mở Menu',
    },
    {
      id: 'restock',
      title: 'Nhập nguyên liệu',
      done: restock.length === 0,
      warn: locked.length > 0,
      detail: restock.length === 0 ? 'Xong · kho đủ cho lượng khách dự kiến.' : `Nên nhập thêm: ${names(restock.map((l) => getIngredient(l.id).name))}.`,
      panel: 'inventory',
      link: 'Mở Kho',
    },
    {
      id: 'staff',
      title: 'Phân vai nhân viên',
      done: state.staff.length > 0 && unassigned.length === 0,
      warn: false,
      detail:
        state.staff.length === 0
          ? 'Chưa có nhân viên; bạn tự làm mọi việc. Tuyển ít nhất một Pha chế.'
          : unassigned.length > 0
            ? `${names(unassigned.map((m) => m.name))} chưa có vai.`
            : state.autoAssign
              ? `Xong · Tự phân vai đang bật cho ${state.staff.length} người.`
              : `Xong · ${state.staff.length} người đã có vai.`,
      panel: 'staff',
      link: 'Mở Nhân viên',
    },
    {
      id: 'marketing',
      title: 'Chạy marketing (tùy chọn)',
      done: campaigns.length > 0,
      warn: false,
      detail:
        campaigns.length > 0
          ? `Đang chạy: ${campaigns.map((c) => `${getCampaign(c.id).name} (còn ${c.daysLeft} ngày)`).join(', ')}.`
          : 'Kéo thêm khách từ hôm nay.',
      panel: 'marketing',
      link: 'Mở Marketing',
    },
  ];
}

const SUGGESTION_PANEL: Record<SuggestionKind, { panel: string; link: string }> = {
  restock: { panel: 'inventory', link: 'Mở Kho' },
  hire_barista: { panel: 'staff', link: 'Mở Nhân viên' },
  hire_server: { panel: 'staff', link: 'Mở Nhân viên' },
  hire_cleaner: { panel: 'staff', link: 'Mở Nhân viên' },
  marketing: { panel: 'marketing', link: 'Mở Marketing' },
  upgrade: { panel: 'upgrades', link: 'Mở Nâng cấp' },
};

/** Display name and goal phrasing for each daily mission (design/p20 §5). */
export const MISSION_META: Record<MissionId, { title: string; dir: 'gte' | 'lte'; goal: (t: number) => string; measure: (v: number) => string }> = {
  serve_customers: { title: 'Phục vụ khách', dir: 'gte', goal: (t) => `Mục tiêu ≥ ${t} khách`, measure: (v) => `${v} khách` },
  no_stockout_loss: { title: 'Không để hết hàng', dir: 'lte', goal: () => 'Mục tiêu 0 đơn lỡ vì hết hàng', measure: (v) => `${v} đơn lỡ` },
  food_cost: { title: 'Giữ giá vốn thấp', dir: 'lte', goal: (t) => `Mục tiêu ≤ ${t}% giá vốn`, measure: (v) => `${v}%` },
  sell_food: { title: 'Bán món ăn kèm', dir: 'gte', goal: (t) => `Mục tiêu ≥ ${t} phần ăn`, measure: (v) => `${v} phần` },
  end_rating: { title: 'Giữ đánh giá cao', dir: 'gte', goal: (t) => `Mục tiêu ≥ ${formatRating(t)} sao`, measure: (v) => `${formatRating(v)} sao` },
  low_abandon: { title: 'Ít khách bỏ về', dir: 'lte', goal: (t) => `Mục tiêu ≤ ${t}% bỏ về`, measure: (v) => `${v}%` },
};

const MISSION_STATE: Record<Mission['status'], { label: string; badge: string; icon: IconId }> = {
  active: { label: 'Đang theo dõi', badge: 'badge-neutral', icon: 'i-clock' },
  completed: { label: 'Xong', badge: 'badge-ok', icon: 'i-ok' },
  failed: { label: 'Hụt', badge: 'badge-warn', icon: 'i-warning' },
};

/**
 * 0..1 bar fill: today's live progress while active (missionProgress), full
 * when won, how close for a missed "reach" goal, else empty.
 */
function missionFill(state: GameState, m: Mission): number {
  if (m.status === 'active') return missionProgress(state, m).ratio;
  if (m.status === 'completed') return 1;
  if (MISSION_META[m.id].dir === 'gte') return m.target > 0 ? Math.min(1, m.progress / m.target) : 0;
  return 0;
}

/** Bar percent and value text of a card; also the key that tells when to redraw it. */
function missionView(state: GameState, m: Mission): { now: number; valueText: string } {
  const meta = MISSION_META[m.id];
  const now = Math.round(missionFill(state, m) * 100);
  const value = m.status === 'active' ? missionProgress(state, m).value : m.progress;
  return { now, valueText: `${value === null ? 'Chưa đủ dữ liệu' : meta.measure(value)} · ${meta.goal(m.target)}` };
}

/** One mission row: icon | name + value and goal | status label, then a progressbar and the XP/cash reward. */
function missionCard(state: GameState, m: Mission): HTMLElement {
  const meta = MISSION_META[m.id];
  const st = MISSION_STATE[m.status];
  const { now, valueText } = missionView(state, m);
  return h(
    'li',
    { class: 'item item-row', attrs: { 'data-mission': m.id, 'data-status': m.status } },
    h('span', { class: 'item-icon' }, icon(MISSION_ICON, { size: 32 })),
    h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: meta.title }), h('p', { class: 'item-meta', text: valueText })),
    h('span', { class: 'item-status' }, h('span', { class: `badge ${st.badge}` }, ...withIcon(st.icon, st.label))),
    h(
      'div',
      { class: 'item-actions' },
      h(
        'div',
        { class: 'progress', attrs: { role: 'progressbar', 'aria-label': meta.title, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(now), 'aria-valuetext': valueText } },
        h('span', { attrs: { style: `width:${now}%` } }),
      ),
      h('p', { class: 'item-meta mission-reward' }, ...withIcon('i-sparkle', `+${m.rewardXp} KN`), ' · ', ...withIcon('i-coin', `+${formatMoney(m.rewardMoney)}`)),
    ),
  );
}

export type GiftStatus = 'ready' | 'claimed' | 'reset' | 'blocked';

export interface GiftView {
  status: GiftStatus;
  /** Days of the 7-day row that show a tick. */
  claimed: number;
  /** Streak day lit as the next gift; null when nothing can be claimed today. */
  next: number | null;
  /** Gift the button claims, e.g. "+50.000đ · +1 Tem". */
  reward: string;
  /** Line under the button; null when the gift is simply ready. */
  note: string | null;
}

/**
 * The "Quà hằng ngày" card for the machine's day `dateKey`, read from
 * giftPreview: ready, already claimed today, streak broken (back to day 1),
 * or blocked (clock moved back, bad date) with the sim's reason.
 */
export function giftView(state: GameState, dateKey: string): GiftView {
  const preview = giftPreview(state, dateKey);
  const login = state.retention?.login ?? { lastDate: null, streak: 0 };
  const reward = `+${formatMoney(preview.reward.money)} · +${preview.reward.tickets} Tem`;
  const today = parseDateKey(dateKey);
  const last = login.lastDate === null ? null : parseDateKey(login.lastDate);
  if (!preview.canClaim) {
    const claimedToday = today !== null && today === last;
    return {
      status: claimedToday ? 'claimed' : 'blocked',
      claimed: login.streak,
      next: null,
      reward,
      note: claimedToday ? 'Quay lại ngày mai' : preview.reason!,
    };
  }
  const broken = last !== null && login.streak > 0 && today !== last + 1;
  return {
    status: broken ? 'reset' : 'ready',
    claimed: preview.nextStreak - 1,
    next: preview.nextStreak,
    reward,
    note: broken ? 'Chuỗi bắt đầu lại từ ngày 1' : null,
  };
}

export type SpecialOrderLineId = 'order' | 'hint' | 'vip';

/**
 * Lines of the "Đơn đặc biệt" block: today's order (running, done or
 * missed), the day-1 hint while there is none, and the VIP of the day.
 * Empty (block hidden) from day 2 while there is no order and no VIP.
 */
export function specialOrderLines(state: GameState): SpecialOrderLineId[] {
  const lines: SpecialOrderLineId[] = [];
  if (state.specialOrder) lines.push('order');
  else if (state.day < SPECIAL_ORDER_FROM_DAY) lines.push('hint');
  if (isVipDay(state.seed, state.day)) lines.push('vip');
  return lines;
}

const ORDER_STATE: Record<SpecialOrder['status'], { label: string; badge: string; icon: IconId }> = {
  active: { label: 'Đang làm', badge: 'badge-neutral', icon: 'i-clock' },
  completed: { label: 'Xong', badge: 'badge-ok', icon: 'i-ok' },
  failed: { label: 'Hụt', badge: 'badge-warn', icon: 'i-warning' },
};

/** Special order row: item icon | "3 Latte trước 13:00 · 1/3" + result | status, then the bar and the reward. */
function specialOrderCard(order: SpecialOrder): HTMLElement {
  const name = getMenuItem(order.itemId).name;
  const by = formatClock(order.byMinute);
  const st = ORDER_STATE[order.status];
  const now = order.target > 0 ? Math.round(Math.min(1, order.progress / order.target) * 100) : 0;
  const title = `${order.target} ${name} trước ${by} · ${order.progress}/${order.target}`;
  const reward = `+${formatMoney(order.rewardMoney)} · +${order.rewardTickets} Tem`;
  const result =
    order.status === 'completed'
      ? `Đã giao đủ, nhận ${reward}.`
      : order.status === 'failed'
        ? `Hết giờ, giao được ${order.progress}/${order.target} ${name}.`
        : null;
  return h(
    'li',
    { class: 'item item-row', attrs: { 'data-special-order': order.itemId, 'data-status': order.status } },
    h('span', { class: 'item-icon' }, icon(MENU_ICONS[order.itemId], { size: 32 })),
    h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: title }), result ? h('p', { class: 'item-meta', text: result }) : null),
    h('span', { class: 'item-status' }, h('span', { class: `badge ${st.badge}` }, ...withIcon(st.icon, st.label))),
    h(
      'div',
      { class: 'item-actions' },
      h(
        'div',
        { class: 'progress', attrs: { role: 'progressbar', 'aria-label': 'Đơn đặc biệt', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(now), 'aria-valuetext': `${order.progress}/${order.target} ${name}` } },
        h('span', { attrs: { style: `width:${now}%` } }),
      ),
      order.status === 'active' ? h('p', { class: 'item-meta mission-reward' }, ...withIcon('i-coin', `Thưởng ${reward}`)) : null,
    ),
  );
}

export interface RegularRow {
  id: string;
  name: string;
  visits: number;
  /** Menu id of the drink they are known for. */
  favorite: MenuItemId;
  lastDay: number;
}

/**
 * The "Khách quen" card: named regulars met so far (state.regulars), latest
 * visit first; same day keeps the REGULARS order. Ids no longer in REGULARS
 * are skipped. Empty before the first regular comes in and on older saves.
 */
export function regularRows(state: GameState): RegularRow[] {
  const seen = state.regulars ?? {};
  return REGULARS.flatMap((r) => {
    const v = seen[r.id];
    return v && v.visits > 0 ? [{ id: r.id, name: r.name, visits: v.visits, favorite: r.favorite, lastDay: v.lastDay }] : [];
  }).sort((a, b) => b.lastDay - a.lastDay);
}

/** Regular row: favorite drink | name + "Ghé 3 lần · Hay gọi Latte". */
function regularCard(r: RegularRow): HTMLElement {
  return h(
    'li',
    { class: 'item item-row', attrs: { 'data-regular': r.id } },
    h('span', { class: 'item-icon' }, icon(MENU_ICONS[r.favorite], { size: 32 })),
    h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: r.name }), h('p', { class: 'item-meta', text: `Ghé ${r.visits} lần · Hay gọi ${getMenuItem(r.favorite).name}` })),
  );
}

/** "1.200.000đ" for the revenue achievement, plain counts for the others. */
function achievementAmount(a: AchievementProgress, n: number): string {
  return a.id === 'revenue' ? formatMoney(n) : String(n);
}

/** Achievement row: trophy | name + "Mốc 1/3 · 120/500" | bar toward the next tier. */
function achievementCard(a: AchievementProgress): HTMLElement {
  const tiers = ACHIEVEMENTS[a.id].tiers.length;
  const now = a.next === null ? 100 : a.next > 0 ? Math.round(Math.min(1, a.value / a.next) * 100) : 0;
  const meta = a.next === null ? `Mốc ${a.tier}/${tiers} · Đã đạt mọi mốc` : `Mốc ${a.tier}/${tiers} · ${achievementAmount(a, a.value)}/${achievementAmount(a, a.next)}`;
  return h(
    'li',
    { class: 'item item-row', attrs: { 'data-achievement': a.id, 'data-tier': String(a.tier) } },
    h('span', { class: 'item-icon' }, icon('i-trophy', { size: 32 })),
    h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: a.name }), h('p', { class: 'item-meta', text: meta })),
    h(
      'div',
      { class: 'item-actions' },
      h(
        'div',
        { class: 'progress', attrs: { role: 'progressbar', 'aria-label': a.name, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(now), 'aria-valuetext': meta } },
        h('span', { attrs: { style: `width:${now}%` } }),
      ),
    ),
  );
}

export interface WeekTodayLine {
  id: 'weather' | 'event' | 'unlocks' | 'expand' | 'tomorrow';
  icon: IconId;
  text: string;
}

/**
 * The "Hôm nay" block of a week day: weather and event with what they do,
 * what the calendar opened today, the expansion on its day, and tomorrow's
 * plan. Empty when the game has no week or today is past it.
 */
export function weekTodayLines(state: GameState): WeekTodayLine[] {
  const plan = todayPlan(state);
  if (!plan || !weekDayLabel(state)) return [];
  const lines: WeekTodayLine[] = [
    { id: 'weather', icon: WEATHER_ICONS[state.weather], text: `${WEATHER_LABELS[state.weather]}: ${weatherEffect(state.weather)}.` },
  ];
  if (plan.event !== 'none') {
    const def = DAY_EVENTS[plan.event];
    lines.push({ id: 'event', icon: DAY_EVENT_ICONS[plan.event], text: `${DAY_EVENT_LABELS[plan.event]}: ${def.description} (${dayEventEffect(plan.event)}).` });
  }
  const entry = weekUnlockDay(plan.day);
  const names = entry ? unlockNames(entry.unlocks) : '';
  if (names) lines.push({ id: 'unlocks', icon: 'i-sparkle', text: plan.day === 1 ? `Khởi đầu với: ${names}.` : `Mới mở khóa hôm nay: ${names}.` });
  if (entry?.expandShop) lines.push({ id: 'expand', icon: UPGRADE_ICONS.expand_area, text: 'Quán đã mở rộng.' });
  const next = state.week?.plan.find((p) => p.day === plan.day + 1);
  if (next) {
    const event = next.event === 'none' ? 'không sự kiện' : DAY_EVENT_LABELS[next.event];
    lines.push({ id: 'tomorrow', icon: 'i-next-day', text: `Ngày mai: ${WEATHER_LABELS[next.weather]} · ${event}.` });
  }
  return lines;
}

/**
 * Task Board: the daily gift card, today's week lines, the checklist with
 * done/not-done state, today's daily missions, the special order and VIP,
 * the regulars met so far, the achievements (shown in place), yesterday's report suggestions, and "Mở cửa"
 * (start_day). Checklist, mission and suggestion rows share the Kho row
 * template (icon | title + meta | one status label | link). Unfinished tasks
 * only remind.
 */
export function renderTasksPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));

  const giftTitle = h('h3', { class: 'section-title' }, ...withIcon('i-sparkle', 'Quà hằng ngày', 24));
  const giftDays = h('div', { class: 'gift-days', attrs: { role: 'list', 'aria-label': 'Chuỗi quà 7 ngày' } });
  const giftReward = h('p', { class: 'item-meta' });
  const giftBtn = h('button', { class: 'btn btn-primary btn-block', attrs: { type: 'button', 'data-action': 'claim-gift' } });
  const giftWhy = reasonLine(false);
  const gift = h('div', { class: 'gift' }, giftDays, giftReward, giftBtn, giftWhy);
  giftBtn.addEventListener('click', () => {
    if (!isAriaDisabled(giftBtn)) send({ type: 'claim_daily_gift', dateKey: localDateKey() });
  });
  w.watch(
    (s) => JSON.stringify(giftView(s, localDateKey())),
    (key) => {
      const v = JSON.parse(key) as GiftView;
      gift.setAttribute('data-gift', v.status);
      setChildren(
        giftDays,
        ...Array.from({ length: 7 }, (_, i) => {
          const day = i + 1;
          const done = day <= v.claimed;
          const next = day === v.next;
          return h(
            'div',
            {
              class: `gift-day${done ? ' is-claimed' : ''}${next ? ' is-next' : ''}`,
              attrs: { role: 'listitem', 'data-day': String(day), 'aria-label': `Ngày ${day}${done ? ', đã nhận' : next ? ', quà kế tiếp' : ''}` },
            },
            icon(done ? 'i-check' : day === 7 ? 'i-trophy' : 'i-coin', { size: 16 }),
            h('span', { attrs: { 'aria-hidden': 'true' }, text: String(day) }),
          );
        }),
      );
      giftReward.textContent = v.next === null ? `Đã nhận ${v.claimed}/7 ngày liền` : `Quà ngày ${v.next}: ${v.reward}`;
      setChildren(giftBtn, icon('i-sparkle'), v.next === null ? 'Đã nhận quà hôm nay' : `Nhận quà ngày ${v.next}`);
      setAriaDisabled(giftBtn, v.next === null);
      setReason(giftWhy, giftBtn, v.note, v.status === 'claimed' ? 'i-ok' : v.status === 'reset' ? 'i-info' : 'i-lock');
    },
  );

  const weekTitle = h('h3', { class: 'section-title' });
  const weekList = h('ul', { class: 'stack week-today', attrs: { 'aria-label': 'Hôm nay' } });
  w.watch(
    (s) => `${weekDayLabel(s) ?? ''}|${JSON.stringify(weekTodayLines(s))}`,
    (_, s) => {
      const lines = weekTodayLines(s);
      weekTitle.hidden = weekList.hidden = lines.length === 0;
      setChildren(weekTitle, ...withIcon('i-clock', `Hôm nay · Ngày ${weekDayLabel(s) ?? s.day}`, 24));
      setChildren(
        weekList,
        // Plain lines, not framed rows: they only inform and have no action.
        ...lines.map((l) => h('li', { class: 'intro intro-icon', attrs: { 'data-week': l.id } }, icon(l.icon, { size: 16 }), h('span', { text: l.text }))),
      );
    },
  );

  const summary = h('span');
  const bar = h('span');
  const list = h('ul', { class: 'stack', attrs: { 'aria-label': 'Việc trong ngày' } });
  const missionTitle = h('h3', { class: 'section-title' }, ...withIcon(MISSION_ICON, 'Nhiệm vụ hôm nay', 24));
  const missionList = h('ul', { class: 'stack', attrs: { 'aria-label': 'Nhiệm vụ hôm nay' } });
  const missionEmpty = h('p', { class: 'item-meta mission-empty', text: 'Ván này chưa có nhiệm vụ ngày (lưu từ bản cũ).', hidden: true });
  const sugTitle = h('h3', { class: 'section-title' }, ...withIcon('i-tip', 'Gợi ý từ báo cáo hôm qua', 24));
  const sugList = h('ul', { class: 'stack' });
  const openBtn = h('button', { class: 'btn btn-accent btn-lg btn-block', attrs: { type: 'button', 'data-action': 'open' } }, icon('i-open'), 'Mở cửa');
  const why = reasonLine(false);
  // Stock that makes no dish only asks first (UX-004); it never blocks opening.
  const foot = h('div', { class: 'panel-foot' }, openBtn, why);
  openBtn.addEventListener('click', () => {
    if (isAriaDisabled(openBtn) || foot.querySelector('.confirm')) return;
    const s = ctx.getState();
    if (!s || !stockMakesNoDish(s)) {
      send({ type: 'start_day' });
      return;
    }
    const ask = inlineConfirm(
      'Kho trống: không bán được món nào',
      'Vẫn mở cửa',
      'btn-accent',
      () => send({ type: 'start_day' }),
      () => openBtn.focus(),
    );
    const stock = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-goto': 'inventory' }, text: 'Mở Kho' });
    stock.addEventListener('click', () => {
      ask.remove();
      openOtherPanel('inventory');
    });
    ask.querySelector('[data-action="confirm"]')!.before(stock);
    foot.insertBefore(ask, why);
  });

  w.watch(
    (s) => `${s.phase}|${JSON.stringify(dayTasks(s))}`,
    (_, s) => {
      const tasks = dayTasks(s);
      const done = tasks.filter((t) => t.done).length;
      summary.textContent = `Đã xong ${done}/${tasks.length} việc`;
      bar.setAttribute('style', `width:${Math.round((done / tasks.length) * 100)}%`);
      setChildren(
        list,
        ...tasks.map((t) =>
          h(
            'li',
            { class: `item item-row${t.done ? ' is-done' : ''}`, attrs: { 'data-task': t.id, 'data-done': String(t.done) } },
            h('span', { class: 'item-icon' }, icon(t.done ? 'i-ok' : t.warn ? 'i-warning' : 'i-todo', { size: 32 })),
            h(
              'div',
              { class: 'item-text' },
              h('p', { class: 'item-title' }, h('span', { class: 'sr-only', text: t.done ? 'Đã xong: ' : 'Chưa xong: ' }), t.title),
              h('p', { class: 'item-meta', text: t.detail }),
            ),
            h('span', { class: 'item-status' }, !t.done && t.warn ? h('span', { class: 'badge badge-warn' }, ...withIcon('i-warning', 'Cần chú ý')) : null),
            t.done ? null : linkBtn(t.link, t.panel),
          ),
        ),
      );
      const open = s.phase === 'preparation';
      const left = tasks.filter((t) => !t.done).length;
      setAriaDisabled(openBtn, !open);
      if (!open) setReason(why, openBtn, 'Quán đã mở cửa hôm nay.');
      else if (left > 0) setReason(why, openBtn, `Còn ${left} việc nên làm. Vẫn mở cửa được.`, 'i-info');
      else setReason(why, openBtn, 'Mọi việc đã xong. Sẵn sàng đón khách!', 'i-ok');
    },
  );
  w.watch(
    (s) => `${JSON.stringify(s.missions)}|${s.missions.map((m) => JSON.stringify(missionView(s, m))).join('|')}`,
    (_, s) => {
      missionEmpty.hidden = s.missions.length > 0;
      setChildren(missionList, ...s.missions.map((m) => missionCard(s, m)));
    },
  );

  const orderTitle = h('h3', { class: 'section-title' }, ...withIcon('i-cup-hot', 'Đơn đặc biệt', 24));
  const orderList = h('ul', { class: 'stack', attrs: { 'aria-label': 'Đơn đặc biệt' } });
  const orderHint = h('p', { class: 'intro intro-icon', attrs: { 'data-order-line': 'hint' } }, icon('i-info', { size: 16 }), h('span', { text: `Từ ngày ${SPECIAL_ORDER_FROM_DAY} có đơn đặc biệt` }));
  const vipLine = h('p', { class: 'intro intro-icon', attrs: { 'data-order-line': 'vip' } }, icon('i-star', { size: 16 }), h('span', { text: 'Khách VIP ghé hôm nay' }));
  w.watch(
    (s) => `${specialOrderLines(s).join(',')}|${JSON.stringify(s.specialOrder ?? null)}`,
    (_, s) => {
      const lines = specialOrderLines(s);
      orderTitle.hidden = lines.length === 0;
      orderList.hidden = !lines.includes('order');
      orderHint.hidden = !lines.includes('hint');
      vipLine.hidden = !lines.includes('vip');
      setChildren(orderList, s.specialOrder ? specialOrderCard(s.specialOrder) : null);
    },
  );

  const regularTitle = h('h3', { class: 'section-title' }, ...withIcon('i-face-happy', 'Khách quen', 24));
  const regularList = h('ul', { class: 'stack', attrs: { 'aria-label': 'Khách quen' } });
  const regularEmpty = h('p', { class: 'intro intro-icon', attrs: { 'data-regular-empty': '' } }, icon('i-info', { size: 16 }), h('span', { text: 'Chưa có khách quen nào ghé' }));
  w.watch(
    (s) => JSON.stringify(regularRows(s)),
    (key) => {
      const rows = JSON.parse(key) as RegularRow[];
      regularEmpty.hidden = rows.length > 0;
      regularList.hidden = rows.length === 0;
      setChildren(regularList, ...rows.map(regularCard));
    },
  );

  const achListId = uid('ach');
  const achLabel = h('span');
  const achBtn = h(
    'button',
    { class: 'btn btn-secondary btn-block ach-toggle', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': achListId, 'data-action': 'achievements' } },
    icon('i-trophy'),
    achLabel,
    icon('i-chevron-down', { size: 16, class: 'ach-chevron' }),
  );
  const achList = h('ul', { id: achListId, class: 'stack', hidden: true, attrs: { 'aria-label': 'Thành tựu' } });
  achBtn.addEventListener('click', () => {
    const open = achBtn.getAttribute('aria-expanded') !== 'true';
    achBtn.setAttribute('aria-expanded', String(open));
    achList.hidden = !open;
  });
  w.watch(
    (s) => JSON.stringify(achievementProgress(s)),
    (key) => {
      const all = JSON.parse(key) as AchievementProgress[];
      const reached = all.reduce((n, a) => n + a.tier, 0);
      const total = all.reduce((n, a) => n + ACHIEVEMENTS[a.id].tiers.length, 0);
      achLabel.textContent = `Thành tựu · ${reached}/${total} mốc`;
      setChildren(achList, ...all.map(achievementCard));
    },
  );

  w.watch(
    (s) => s.lastReport ?? null,
    (report) => {
      const items = report?.suggestions ?? [];
      sugTitle.hidden = items.length === 0;
      setChildren(
        sugList,
        ...items.map((sug) =>
          h(
            'li',
            { class: 'item item-row' },
            h('span', { class: 'item-icon' }, icon('i-tip', { size: 32 })),
            h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: sug.text })),
            linkBtn(SUGGESTION_PANEL[sug.kind].link, SUGGESTION_PANEL[sug.kind].panel),
          ),
        ),
      );
    },
  );

  body.append(
    h(
      'div',
      { class: 'prep' },
      giftTitle,
      gift,
      weekTitle,
      weekList,
      h('div', { class: 'stack' }, h('div', { class: 'foot-sum' }, summary), h('div', { class: 'progress', attrs: { 'aria-hidden': 'true' } }, bar)),
      list,
      missionTitle,
      missionEmpty,
      missionList,
      orderTitle,
      orderHint,
      vipLine,
      orderList,
      regularTitle,
      regularEmpty,
      regularList,
      achBtn,
      achList,
      sugTitle,
      sugList,
      foot,
    ),
  );
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
