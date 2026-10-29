import { DIFFICULTIES } from '../../sim/data/difficulty';
import { levelDef } from '../../sim/data/levels';
import { getMenuItem } from '../../sim/data/menu';
import { getUpgrade } from '../../sim/data/upgrades';
import { WEEK_LENGTH } from '../../sim/data/week';
import { debtLimit } from '../../sim/economy';
import { dayCompare, weekToDate, type StatDelta, type WeekToDate } from '../../sim/stats';
import type { Command, DailyReport, GameState, InsightPanel, Mission, SuggestionKind } from '../../sim/types';
import { h, setChildren, trapFocus, Watcher, type Child } from '../core/dom';
import { formatMoney, formatRating, formatSavedAt } from '../core/format';
import { LEVEL_ICON, MENU_ICONS, MISSION_ICON, UPGRADE_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import { debtHints, debtWarning } from '../hud/hud';
import { MISSION_META } from '../panels/tasks';
import { weekGoalBlock, weekGoalView, type WeekGoalView } from '../weekGoal';
import { renderInsights } from './insights';
import { fillReviews } from './reviews';

/** Newest reviews the summary once listed; reviews now live on the Đánh giá tab only. */
export const REPORT_RECENT_REVIEWS = 3;

/** Tips shown on the summary, one line each; the Chỉ số tab lists the rest. */
export const REPORT_TIPS = 1;

/** Best sellers named on the summary's goods line. */
export const REPORT_TOP_SELLERS = 3;

/** Result of a day's autosave, shown in the footer of that day's report. */
export type SaveStatus = { day: number; ok: true; savedAt: number } | { day: number; ok: false };

export type ReportTab = 'summary' | 'insights' | 'reviews';

/** Left-to-right tab order, for arrow-key navigation. */
const TAB_ORDER: readonly ReportTab[] = ['summary', 'insights', 'reviews'];

export interface DailyReportOptions {
  dispatch(cmd: Command): boolean;
  /** Tries the autosave again; the footer shows the returned status. */
  onRetrySave?(): SaveStatus;
  /** Opens a dock panel from an insight's action link (the report closes first). */
  onOpenPanel?(panel: InsightPanel): void;
  /** The week is scored (state.week.result): the main button opens the week-end screen instead of next_day. */
  onWeekEnd?(): void;
}

export interface DailyReportView {
  /** Full-screen overlay; append it to the #ui root. */
  readonly el: HTMLElement;
  /** Per-frame refresh. Shows the overlay while `visible` (needs a state); touches the DOM only when values change. */
  update(state: GameState | null, visible: boolean): void;
  /** null hides the save line (e.g. a game loaded straight into the report). */
  setSaveStatus(status: SaveStatus | null): void;
  showTab(tab: ReportTab): void;
  readonly tab: ReportTab;
  readonly visible: boolean;
}

/** What the summary compares the day against (src/sim/stats.ts); null draws no comparison. */
export interface SummaryStats {
  deltas: readonly StatDelta[] | null;
  week: WeekToDate | null;
  /** Live week score (weekGoalView): the strip shows its three bars; absent or null keeps the revenue bar alone. */
  weekGoal?: WeekGoalView | null;
  /** The shop is counting down to bankruptcy (debtWarning); absent or null otherwise. */
  debt?: ReportDebt | null;
}

/** What the debt block at the top of Tổng kết states. */
export interface ReportDebt {
  money: number;
  limit: number;
  daysLeft: number;
  hints: readonly string[];
}

const NO_STATS: SummaryStats = { deltas: null, week: null };

/** The debt block's figures for a state, or null while debtWarning(state) is null. */
export function reportDebt(state: GameState): ReportDebt | null {
  const warning = debtWarning(state);
  return warning ? { money: state.money, limit: debtLimit(state), daysLeft: warning.daysLeft, hints: debtHints(state) } : null;
}

export type ResultKind = 'profit' | 'loss' | 'even' | 'none';

/** Headline of the report: profit, loss, break-even, or no customers at all. */
export function reportResult(r: DailyReport): { kind: ResultKind; label: string; value: string } {
  const value = signedMoney(r.profit);
  if (r.customersArrived === 0) return { kind: 'none', label: 'Không có khách', value };
  if (r.profit > 0) return { kind: 'profit', label: 'Lãi', value };
  if (r.profit < 0) return { kind: 'loss', label: 'Lỗ', value };
  return { kind: 'even', label: 'Hòa vốn', value };
}

const RESULT_CLASS: Record<ResultKind, string> = { profit: '', loss: ' is-loss', even: ' is-none', none: ' is-none' };

/** Shape as well as colour: triangle up/down, equals, or people for an empty day. */
const RESULT_ICON: Record<ResultKind, IconId> = { profit: 'i-trend-up', loss: 'i-trend-down', even: 'i-equal', none: 'i-people' };

const TIP_ICON: Record<SuggestionKind, IconId> = {
  restock: 'i-inventory',
  hire_barista: 'i-people',
  hire_server: 'i-people',
  hire_cleaner: 'i-role-cleaner',
  marketing: 'i-marketing',
  upgrade: 'i-upgrades',
};

function signedMoney(amount: number): string {
  return amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount);
}

function statRow(label: string, value: string, tone: 'pos' | 'neg' | '' = '', total = false): HTMLElement {
  return h('div', { class: `rpt-stat${total ? ' is-total' : ''}` }, h('dt', { text: label }), h('dd', { class: tone, text: value }));
}

function cost(amount: number): string {
  return amount > 0 ? formatMoney(-amount) : formatMoney(0);
}

/** Small heading of a block in the flat summary. */
function cap(iconId: IconId, ...title: Child[]): HTMLElement {
  return h('h4', { class: 'rpt-cap' }, icon(iconId, { size: 16 }), ...title);
}

function muted(text: string): HTMLElement {
  return h('p', { class: 'rpt-muted', text });
}

/** Label with a leading icon, for buttons and tabs. */
function labelled(iconId: IconId, text: string): (Node | string)[] {
  return [icon(iconId), text];
}

/** Footer button label: icon + text, named by aria-label too, so the phone layout can show the secondary one as an icon only. */
function footLabel(btn: HTMLElement, iconId: IconId, text: string): void {
  btn.setAttribute('aria-label', text);
  setChildren(btn, icon(iconId), h('span', { class: 'rpt-btn-text', text }));
}

// ── Figures: profit, revenue, customers, stars with their change ────────────

type FigureId = 'profit' | 'revenue' | 'customersServed' | 'stars';
type DeltaDir = 'up' | 'down' | 'flat';

const DELTA_ICON: Record<DeltaDir, IconId> = { up: 'i-trend-up', down: 'i-trend-down', flat: 'i-equal' };

/** A change rounded to what the cell shows (whole đồng and customers, a tenth of a star), signed. */
function deltaView(id: FigureId, delta: number): { dir: DeltaDir; text: string } {
  const shown = id === 'stars' ? Math.round(delta * 10) / 10 : Math.round(delta);
  if (shown === 0) return { dir: 'flat', text: '0' };
  const dir: DeltaDir = shown > 0 ? 'up' : 'down';
  const sign = shown > 0 ? '+' : '−';
  if (id === 'profit' || id === 'revenue') return { dir, text: signedMoney(shown) };
  if (id === 'stars') return { dir, text: `${sign}${formatRating(Math.abs(shown))}` };
  return { dir, text: `${sign}${Math.abs(shown)}` };
}

/** "▲ +120.000đ so hôm qua" as icon + number + label; higher is better for every figure shown. */
function deltaLine(id: FigureId, delta: number | null, vs: 'yesterday' | 'week'): HTMLElement | null {
  if (delta === null) return null;
  const { dir, text } = deltaView(id, delta);
  return h(
    'span',
    { class: `rpt-fig-delta is-${dir}`, attrs: { 'data-vs': vs, 'data-delta': dir } },
    icon(DELTA_ICON[dir], { size: 16 }),
    h('b', { text }),
    vs === 'yesterday' ? ' so hôm qua' : ' so TB tuần',
  );
}

function figure(
  id: FigureId,
  label: (Node | string)[],
  value: string,
  sub: string | null,
  stats: SummaryStats,
  attrs: Record<string, string> = {},
  tone = '',
): HTMLElement {
  const d = stats.deltas?.find((s) => s.id === id);
  // Every cell keeps the sub row (empty for Lãi and Doanh thu) so the changes of all four start on one line.
  return h(
    'div',
    { class: `rpt-fig${tone}`, attrs: { 'data-fig': id, ...attrs } },
    h('span', { class: 'rpt-fig-label' }, ...label),
    h('span', { class: 'rpt-fig-value', text: value }),
    sub ? h('span', { class: 'rpt-fig-sub', text: sub }) : h('span', { class: 'rpt-fig-sub', attrs: { 'aria-hidden': 'true', 'data-empty': '' } }),
    h('span', { class: 'rpt-fig-deltas' }, deltaLine(id, d?.vsYesterday ?? null, 'yesterday'), deltaLine(id, d?.vsWeekAvg ?? null, 'week')),
  );
}

function figures(r: DailyReport, stats: SummaryStats): HTMLElement {
  const result = reportResult(r);
  // A day's profit is no good news while the till is below zero: no green cell then.
  const tone = result.kind === 'profit' && r.money < 0 ? RESULT_CLASS.even : RESULT_CLASS[result.kind];
  const lost = r.customersLost > 0 ? ` · ${r.customersLost} bỏ đi` : '';
  return h(
    'div',
    { class: 'rpt-figs', attrs: { 'data-block': 'figures' } },
    figure('profit', [icon(RESULT_ICON[result.kind], { size: 16 }), result.label], result.value, null, stats, { 'data-result': result.kind }, ` is-result${tone}`),
    figure('revenue', [icon('i-coin', { size: 16 }), 'Doanh thu'], formatMoney(r.revenue), null, stats),
    figure('customersServed', [icon('i-people', { size: 16 }), 'Khách'], `${r.customersServed}/${r.customersArrived}`, `phục vụ/đến${lost}`, stats, { 'data-block': 'customers' }),
    figure('stars', [icon('i-star', { size: 16 }), 'Sao'], formatRating(r.ratingEnd), `đầu ngày ${formatRating(r.ratingStart)}`, stats, { 'data-block': 'rating' }),
  );
}

// ── Debt: money past the limit, days left, what to cut ──────────────────────

function debtBlock(d: ReportDebt): HTMLElement {
  return h(
    'section',
    { class: 'rpt-debt', attrs: { 'data-block': 'debt', role: 'alert' } },
    h('p', { class: 'rpt-debt-head' }, icon('i-warning'), h('b', { text: `Còn ${d.daysLeft} ngày trước khi phá sản` })),
    h(
      'p',
      { class: 'rpt-debt-figs' },
      'Tiền hiện có: ',
      h('b', { attrs: { 'data-debt': 'money' }, text: formatMoney(d.money) }),
      ' · Hạn mức nợ: ',
      h('b', { attrs: { 'data-debt': 'limit' }, text: formatMoney(-d.limit) }),
    ),
    d.hints.length ? h('ul', { class: 'rpt-debt-hints' }, ...d.hints.map((t) => h('li', { text: t }))) : null,
  );
}

// ── Week progress ───────────────────────────────────────────────────────────

/** The week day and, with a live goal, its revenue, profit and stars bars; otherwise the revenue bar alone. */
function weekStrip(w: WeekToDate, goal?: WeekGoalView | null): HTMLElement {
  if (goal) {
    return h(
      'div',
      { class: 'rpt-week is-goal', attrs: { 'data-block': 'week' } },
      h('span', { class: 'rpt-week-label' }, icon('i-trophy', { size: 16 }), h('b', { text: `Tuần ${w.index}` }), ` · ngày ${w.days}/${WEEK_LENGTH}`),
      weekGoalBlock(goal),
    );
  }
  const pct = Math.round(w.revenueProgress * 100);
  const fill = h('span', { class: 'rpt-bar-fill' });
  fill.setAttribute('style', `width:${Math.min(100, pct)}%`);
  return h(
    'div',
    { class: `rpt-week${pct >= 100 ? ' is-done' : ''}`, attrs: { 'data-block': 'week' } },
    h('span', { class: 'rpt-week-label' }, icon('i-trophy', { size: 16 }), h('b', { text: `Tuần ${w.index}` }), ` · ngày ${w.days}/${WEEK_LENGTH}`),
    h(
      'span',
      {
        class: 'rpt-bar-track rpt-week-track',
        attrs: { role: 'progressbar', 'aria-label': 'Doanh thu tuần so mục tiêu', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)) },
      },
      fill,
    ),
    h('span', { class: 'rpt-week-num' }, h('b', { text: formatMoney(w.totals.revenue) }), ` / ${formatMoney(w.goal.revenue)} · ${pct}%`),
  );
}

// ── Money | missions, sellers, stock-outs ───────────────────────────────────

function money(r: DailyReport): HTMLElement {
  return h(
    'div',
    { class: 'rpt-col' },
    cap('i-coin', 'Thu chi'),
    h(
      'dl',
      { class: 'rpt-stats', attrs: { 'data-block': 'money' } },
      statRow('Doanh thu', `+${formatMoney(r.revenue)}`, 'pos'),
      statRow('Nguyên liệu đã dùng', cost(r.ingredientCost), r.ingredientCost > 0 ? 'neg' : ''),
      statRow('Lương nhân viên', cost(r.wages), r.wages > 0 ? 'neg' : ''),
      statRow('Marketing', cost(r.marketingCost), r.marketingCost > 0 ? 'neg' : ''),
      // Reports saved before rent existed have no rent line.
      typeof r.rent === 'number' ? statRow('Tiền thuê mặt bằng', cost(r.rent), r.rent > 0 ? 'neg' : '') : null,
      statRow('Lợi nhuận', signedMoney(r.profit), r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : '', true),
    ),
    h('p', { class: 'rpt-muted rpt-cash' }, 'Tiền hiện có: ', h('b', { text: formatMoney(r.money) })),
    typeof r.rentNext === 'number'
      ? h('p', { class: 'rpt-muted rpt-rent', attrs: { 'data-block': 'rent-next' } }, 'Tiền thuê ngày mai (trừ lúc đóng cửa): ', h('b', { text: formatMoney(r.rentNext) }))
      : null,
  );
}

const MISSION_RESULT: Record<Mission['status'], { label: string; badge: string; icon: IconId }> = {
  completed: { label: 'Đạt', badge: 'badge-ok', icon: 'i-ok' },
  failed: { label: 'Hụt', badge: 'badge-warn', icon: 'i-warning' },
  active: { label: 'Chưa chấm', badge: 'badge-neutral', icon: 'i-clock' },
};

/** Today's missions, reached or missed, with their rewards, plus the XP earned. Old saves lack both. */
function missionsBlock(r: DailyReport): HTMLElement[] {
  const xp = typeof r.xpGained === 'number' ? h('span', { class: 'rpt-xp', attrs: { 'data-block': 'xp' } }, ' · ', h('b', { text: `+${r.xpGained} KN` })) : null;
  const missions = r.missions;
  if (!missions) return [cap(MISSION_ICON, 'Nhiệm vụ ngày', xp), muted('Báo cáo này lưu từ bản cũ, chưa có nhiệm vụ ngày.')];
  if (missions.length === 0) return [cap(MISSION_ICON, 'Nhiệm vụ ngày', xp), muted('Ngày này chưa có nhiệm vụ.')];
  return [
    cap(MISSION_ICON, `Nhiệm vụ · đạt ${missions.filter((m) => m.status === 'completed').length}/${missions.length}`, xp),
    h(
      'ul',
      { class: 'rpt-list rpt-missions', attrs: { 'data-block': 'missions' } },
      ...missions.map((m) => {
        const meta = MISSION_META[m.id];
        const st = MISSION_RESULT[m.status];
        return h(
          'li',
          { class: 'rpt-mission', attrs: { 'data-mission': m.id, 'data-status': m.status } },
          h('span', { class: `badge ${st.badge}` }, icon(st.icon, { size: 16 }), st.label),
          h('span', { class: 'rpt-strong rpt-mission-name', text: meta.title }),
          h('span', { class: `rpt-mission-reward${m.status === 'completed' ? '' : ' rpt-muted'}`, text: `+${m.rewardXp} KN · +${formatMoney(m.rewardMoney)}` }),
          h('span', { class: 'rpt-muted rpt-mission-goal', text: m.status === 'active' ? meta.goal(m.target) : `${meta.measure(m.progress)} · ${meta.goal(m.target)}` }),
        );
      }),
    ),
  ];
}

function topSellers(r: DailyReport): Child[] {
  const top = r.topSellers.slice(0, REPORT_TOP_SELLERS);
  if (top.length === 0) return [h('b', { text: 'Bán chạy: ' }), h('span', { class: 'rpt-muted', text: 'chưa có món nào' })];
  return [
    h('b', { text: 'Bán chạy: ' }),
    h(
      'ol',
      { class: 'rpt-inline', attrs: { 'data-block': 'top' } },
      ...top.map((t) => {
        const item = getMenuItem(t.id);
        return h('li', { attrs: { 'data-item': t.id } }, icon(MENU_ICONS[t.id], { size: 16 }), `${item.name} `, h('b', { text: `${t.qty} ${item.category === 'food' ? 'cái' : 'ly'}` }));
      }),
    ),
  ];
}

function outOfStock(r: DailyReport): HTMLElement {
  if (r.outOfStock.length === 0) return h('span', { class: 'rpt-goods-out' }, h('b', { text: 'Hết nguyên liệu: ' }), h('span', { class: 'rpt-muted', text: 'không' }));
  return h(
    'span',
    { class: 'rpt-goods-out is-warn' },
    icon('i-error', { size: 16 }),
    h('b', { text: 'Hết nguyên liệu: ' }),
    h(
      'ul',
      { class: 'rpt-inline', attrs: { 'data-block': 'out' } },
      ...r.outOfStock.map((id) => h('li', { class: 'rpt-out', attrs: { 'data-item': id } }, icon(MENU_ICONS[id], { size: 16 }), getMenuItem(id).name)),
    ),
  );
}

/** Best sellers and stock-outs as one line of text. */
function goodsLine(r: DailyReport): HTMLElement {
  return h('p', { class: 'rpt-line rpt-goods', attrs: { 'data-block': 'goods' } }, ...topSellers(r), h('span', { class: 'rpt-muted', text: '·' }), outOfStock(r));
}

/** One tip on one line next to its heading; the full text is in the title and on the Chỉ số tab. */
function suggestions(r: DailyReport, weekEnded: boolean): HTMLElement {
  const tips = r.suggestions.slice(0, REPORT_TIPS);
  return h(
    'div',
    { class: 'rpt-tips' },
    cap('i-tip', weekEnded ? 'Gợi ý cho tuần sau:' : `Gợi ý cho ngày ${r.day + 1}:`),
    tips.length === 0
      ? muted('Hôm nay mọi thứ ổn, cứ giữ nhịp này.')
      : h(
          'ol',
          { class: 'rpt-list', attrs: { 'data-block': 'tips' } },
          ...tips.map((s) => h('li', { class: 'rpt-tip', attrs: { 'data-kind': s.kind, title: s.text } }, icon(TIP_ICON[s.kind], { size: 16 }), h('p', { text: s.text }))),
        ),
  );
}

/** Unlock chips the level-up card shows (one line from 1024 px); the rest is counted as "+N". */
export const LEVELUP_CHIPS = 3;
/** The badge's rpt-badge-pop length (report.css), then the one sideways shake (±BADGE_SHAKE_PX). */
export const BADGE_POP_MS = 400;
export const BADGE_SHAKE_MS = 300;
export const BADGE_SHAKE_PX = 3;
/** The shake's easing comes from --easing-standard; this is used if it cannot be read. */
export const BADGE_SHAKE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

type UnlockGroup = 'menu' | 'upgrades' | 'tools';
interface UnlockChip {
  id: string;
  name: string;
  icon: IconId;
}

/**
 * "Lên cấp N" card at the top of the summary: a level badge that pops in, the
 * new level's name, and what it unlocks as icon chips grouped Món mới /
 * Nâng cấp / Dụng cụ. A status in place, not a modal. Null when the day
 * brought no level-up.
 */
export function levelUpBand(r: DailyReport): HTMLElement | null {
  const up = r.levelUp;
  if (!up) return null;
  const groups: [UnlockGroup, string, UnlockChip[]][] = [
    ['menu', 'Món mới', up.unlocks.menu.map((id) => ({ id, name: getMenuItem(id).name, icon: MENU_ICONS[id] }))],
    ['upgrades', 'Nâng cấp', up.unlocks.upgrades.map((id) => ({ id, name: getUpgrade(id).name, icon: UPGRADE_ICONS[id] }))],
    ['tools', 'Dụng cụ', up.unlocks.tools.map((id) => ({ id, name: getUpgrade(id).name, icon: UPGRADE_ICONS[id] }))],
  ];
  const total = groups.reduce((n, [, , chips]) => n + chips.length, 0);
  let room = LEVELUP_CHIPS;
  const items: HTMLElement[] = [];
  for (const [group, title, chips] of groups) {
    const shown = chips.slice(0, room);
    room -= shown.length;
    if (shown.length === 0) continue;
    items.push(
      h(
        'li',
        { class: 'rpt-unlock-group', attrs: { 'data-group': group } },
        h('b', { text: title }),
        // A long name ends in "…" on screen; the title and the text node keep it whole.
        ...shown.map((c) =>
          h('span', { class: 'rpt-unlock', attrs: { 'data-unlock': c.id, title: c.name } }, icon(c.icon, { size: 24 }), h('span', { class: 'rpt-unlock-name', text: c.name })),
        ),
      ),
    );
  }
  const hidden = total - (LEVELUP_CHIPS - room);
  if (hidden > 0) items.push(h('li', { class: 'rpt-unlock-more', attrs: { 'data-block': 'unlocks-more' }, text: `+${hidden}` }));
  return h(
    'div',
    { class: 'rpt-levelup', attrs: { role: 'status', 'data-block': 'level-up' } },
    h(
      'span',
      { class: 'rpt-levelup-badge', attrs: { 'aria-hidden': 'true', 'data-block': 'level-badge' } },
      icon(LEVEL_ICON, { size: 48 }),
      h('b', { class: 'rpt-levelup-num', text: String(up.level) }),
    ),
    h(
      'div',
      { class: 'rpt-levelup-text' },
      h('p', { class: 'rpt-levelup-title' }, h('b', { text: `Lên cấp ${up.level}` }), ` · ${levelDef(up.level).name}`),
      items.length === 0
        ? h('span', { class: 'rpt-muted', text: 'Cấp này chưa mở thêm món hay dụng cụ.' })
        : h('ul', { class: 'rpt-unlocks', attrs: { 'aria-label': 'Mở khóa' } }, ...items),
    ),
  );
}

/** The OS asks for less motion, or the "Giảm chuyển động" setting forces it (html.reduce-motion). */
function reducedMotion(doc: Document): boolean {
  if (doc.documentElement.classList.contains('reduce-motion')) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The summary tab, rebuilt once per report: figures with their change, the
 * week so far, money | missions and a goods line, one tip. It fits a
 * 1280×720 window without scrolling. After the last week day the tip is for
 * next week.
 */
export function renderSummary(r: DailyReport, weekEnded = false, stats: SummaryStats = NO_STATS): HTMLElement[] {
  const band = levelUpBand(r);
  return [
    ...(stats.debt ? [debtBlock(stats.debt)] : []),
    ...(band ? [band] : []),
    figures(r, stats),
    ...(stats.week ? [weekStrip(stats.week, stats.weekGoal)] : []),
    h('div', { class: 'rpt-split' }, money(r), h('div', { class: 'rpt-col' }, ...missionsBlock(r), goodsLine(r))),
    suggestions(r, weekEnded),
  ];
}

/** Placeholder while the day's numbers are not in yet. */
function renderBusy(day: number): HTMLElement {
  return h(
    'div',
    { class: 'rpt-section rpt-busy', attrs: { role: 'status', 'data-block': 'busy' } },
    h('p', { class: 'rpt-busy-title' }, icon('i-busy'), h('b', { text: `Đang tổng kết ngày ${day}…` })),
    h('span', { class: 'rpt-skel is-lg', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'rpt-skel', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'rpt-skel is-short', attrs: { 'aria-hidden': 'true' } }),
  );
}

/**
 * End-of-day overlay after the Daily Report of design/t237-cartoon: tabs
 * "Tổng kết", "Chỉ số" and "Đánh giá", the autosave status, "Xem đánh giá" and
 * "Ngày tiếp theo" (next_day), or "Xem tổng kết tuần" once the week is scored.
 * The footer stays in view; only the tab body scrolls.
 */
export function createDailyReport(options: DailyReportOptions): DailyReportView {
  const w = new Watcher<GameState>();
  let tab: ReportTab = 'summary';
  let shown = false;
  let saveStatus: SaveStatus | null = null;
  let day = 0;
  let weekEnded = false;
  let celebrated: DailyReport | null = null;
  let stopConfetti: (() => void) | null = null;
  let fxGen = 0;

  const title = h('h3', { id: 'rpt-title' });
  const sub = h('p', { class: 'rpt-sub' });
  const summaryTab = h('button', { class: 'rpt-tab', id: 'rpt-tab-summary', attrs: { type: 'button', role: 'tab', 'aria-controls': 'rpt-summary', 'data-tab': 'summary' } }, ...labelled('i-chart', 'Tổng kết'));
  const insightsTab = h('button', { class: 'rpt-tab', id: 'rpt-tab-insights', attrs: { type: 'button', role: 'tab', 'aria-controls': 'rpt-insights', 'data-tab': 'insights' } }, ...labelled('i-trend-up', 'Chỉ số'));
  const reviewsTab = h('button', { class: 'rpt-tab', id: 'rpt-tab-reviews', attrs: { type: 'button', role: 'tab', 'aria-controls': 'rpt-reviews', 'data-tab': 'reviews' } });
  const summary = h('div', { class: 'rpt-body is-summary', id: 'rpt-summary', attrs: { role: 'tabpanel', 'aria-labelledby': 'rpt-tab-summary' } });
  const insights = h('div', { class: 'rpt-body', id: 'rpt-insights', attrs: { role: 'tabpanel', 'aria-labelledby': 'rpt-tab-insights' } });
  const reviews = h('div', { class: 'rpt-body', id: 'rpt-reviews', attrs: { role: 'tabpanel', 'aria-labelledby': 'rpt-tab-reviews' } });
  const tabButtons: Record<ReportTab, HTMLElement> = { summary: summaryTab, insights: insightsTab, reviews: reviewsTab };
  const tabPanels: Record<ReportTab, HTMLElement> = { summary, insights, reviews };

  const save = h('div', { class: 'rpt-save', attrs: { 'data-save': '' } });
  const toggleBtn = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'reviews' } });
  const nextBtn = h('button', { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'next-day' } });
  footLabel(nextBtn, 'i-next-day', 'Ngày tiếp theo');
  const backBtn = (): HTMLElement => h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => showTab('summary') } }, ...labelled('i-chart', 'Về Tổng kết'));

  summaryTab.addEventListener('click', () => showTab('summary'));
  insightsTab.addEventListener('click', () => showTab('insights'));
  reviewsTab.addEventListener('click', () => showTab('reviews'));
  toggleBtn.addEventListener('click', () => showTab(tab === 'summary' ? 'reviews' : 'summary'));
  nextBtn.addEventListener('click', () => (weekEnded ? options.onWeekEnd?.() : options.dispatch({ type: 'next_day' })));
  const tabs = h('div', { class: 'rpt-tabs', attrs: { role: 'tablist', 'aria-label': 'Báo cáo ngày' } }, summaryTab, insightsTab, reviewsTab);
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const at = TAB_ORDER.indexOf(tab);
    const next = TAB_ORDER[(at + (e.key === 'ArrowRight' ? 1 : TAB_ORDER.length - 1)) % TAB_ORDER.length]!;
    showTab(next);
    tabButtons[next].focus();
  });

  const dialog = h(
    'div',
    { class: 'rpt-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rpt-title' } },
    h('div', { class: 'rpt-head' }, h('span', { class: 'rpt-head-icon' }, icon('i-phase-close', { size: 32 })), h('div', { class: 'rpt-head-text' }, title, sub), tabs),
    summary,
    insights,
    reviews,
    h('div', { class: 'rpt-foot' }, save, h('div', { class: 'rpt-foot-actions' }, toggleBtn, nextBtn)),
  );
  dialog.addEventListener('keydown', (e) => trapFocus(dialog, e));
  const el = h('div', { class: 'ui-screen is-scrim rpt-layer', hidden: true, attrs: { 'data-screen': 'report' } }, dialog);

  function showTab(next: ReportTab): void {
    tab = next;
    for (const name of TAB_ORDER) {
      tabButtons[name].setAttribute('aria-selected', String(name === next));
      tabButtons[name].tabIndex = name === next ? 0 : -1;
      tabPanels[name].hidden = name !== next;
    }
    if (next === 'summary') footLabel(toggleBtn, 'i-reviews', 'Xem đánh giá');
    else footLabel(toggleBtn, 'i-chart', 'Về Tổng kết');
  }

  function renderSave(): void {
    // A status from another day (or another game) is stale: say nothing rather than something wrong.
    if (saveStatus === null || saveStatus.day !== day) {
      setChildren(save);
      save.className = 'rpt-save';
      save.removeAttribute('role');
      return;
    }
    if (saveStatus.ok) {
      save.className = 'rpt-save';
      save.setAttribute('role', 'status');
      setChildren(save, icon('i-ok'), `Đã tự lưu ngày ${day} · ${formatSavedAt(saveStatus.savedAt)}`);
      return;
    }
    save.className = 'rpt-save is-error';
    save.setAttribute('role', 'alert');
    const retry = options.onRetrySave;
    setChildren(
      save,
      h('p', {}, icon('i-warning'), `Chưa tự lưu được: bộ nhớ trình duyệt đầy hoặc bị chặn. Tiến độ ngày ${day} sẽ mất nếu đóng tab.`),
      retry
        ? h(
            'button',
            {
              class: 'btn btn-secondary',
              attrs: { type: 'button', 'data-action': 'retry-save' },
              on: {
                click: () => {
                  saveStatus = retry();
                  renderSave();
                  if (saveStatus.ok) nextBtn.focus();
                },
              },
            },
            ...labelled('i-retry', 'Thử lưu lại'),
          )
        : null,
    );
  }

  // Once the week is scored there is no next day: tips are for next week and
  // the insight links (which start the next day) are dropped.
  function renderBodies(s: GameState): void {
    const r = s.lastReport ?? null;
    const ended = s.week?.result !== undefined;
    setChildren(summary, ...(r ? renderSummary(r, ended, { deltas: dayCompare(s, r), week: weekToDate(s), weekGoal: weekGoalView(s), debt: reportDebt(s) }) : [renderBusy(day)]));
    setChildren(insights, ...(r ? renderInsights(r, ended ? null : (panel) => options.onOpenPanel?.(panel)) : [renderBusy(day)]));
  }

  // Confetti for a level-up: loaded on first use, thrown once per report over
  // the overlay (clicks pass through), stopped when the report closes.
  function celebrate(r: DailyReport | null): void {
    if (!r?.levelUp || r === celebrated) return;
    celebrated = r;
    if (reducedMotion(el.ownerDocument)) return;
    shakeBadge();
    const gen = ++fxGen;
    import('../fx/confetti')
      .then(({ burst }) => {
        if (gen === fxGen && shown) stopConfetti = burst(el);
      })
      .catch(() => {});
  }

  // Once the level badge has popped in (BADGE_POP_MS), it shakes sideways once.
  function shakeBadge(): void {
    const badge = summary.querySelector<HTMLElement>('.rpt-levelup-badge');
    if (!badge || typeof badge.animate !== 'function') return;
    const left = { transform: `translateX(-${BADGE_SHAKE_PX}px)` };
    const right = { transform: `translateX(${BADGE_SHAKE_PX}px)` };
    const easing = getComputedStyle(badge).getPropertyValue('--easing-standard').trim() || BADGE_SHAKE_EASING;
    badge.animate([{ transform: 'translateX(0)' }, left, right, left, right, { transform: 'translateX(0)' }], {
      duration: BADGE_SHAKE_MS,
      delay: BADGE_POP_MS,
      easing,
    });
  }

  function endConfetti(): void {
    fxGen++;
    stopConfetti?.();
    stopConfetti = null;
  }

  w.watch(
    (s) => s.lastReport ?? null,
    (r, s) => {
      endConfetti();
      day = r?.day ?? s.day;
      title.textContent = `Hết ngày ${day} · ${s.shopName}`;
      // Opening hours never change, so the line names only the difficulty.
      sub.textContent = DIFFICULTIES[s.difficulty].name;
      renderBodies(s);
      showTab('summary');
      renderSave();
    },
  );
  // Reviews are only appended (oldest dropped), so the newest one tells when the list changed.
  w.watch(
    (s) => s.reviews[s.reviews.length - 1],
    (_, s) => {
      setChildren(reviewsTab, ...labelled('i-reviews', `Đánh giá (${s.reviews.length})`));
      fillReviews(reviews, s.reviews, backBtn());
    },
  );
  // After the last week day the main button leads to the week summary, which starts the next week.
  w.watch(
    (s) => s.week?.result !== undefined,
    (ended, s) => {
      if (ended !== weekEnded) renderBodies(s);
      weekEnded = ended;
      nextBtn.setAttribute('data-action', ended ? 'week-end' : 'next-day');
      if (ended) footLabel(nextBtn, 'i-trophy', 'Xem tổng kết tuần');
      else footLabel(nextBtn, 'i-next-day', 'Ngày tiếp theo');
    },
  );
  showTab('summary');

  return {
    el,
    update(state, want) {
      const visible = want && state !== null;
      if (visible && state) w.run(state);
      if (visible !== shown) {
        shown = visible;
        el.hidden = !visible;
        if (visible) nextBtn.focus();
        else endConfetti();
      }
      if (visible && state) celebrate(state.lastReport ?? null);
    },
    setSaveStatus(status) {
      saveStatus = status;
      renderSave();
    },
    showTab,
    get tab() {
      return tab;
    },
    get visible() {
      return shown;
    },
  };
}
