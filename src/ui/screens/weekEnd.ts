import { DIFFICULTIES } from '../../sim/data/difficulty';
import { LEVELS, MAX_SHOP_LEVEL, unlocksBetween, xpToReach } from '../../sim/data/levels';
import { getUpgrade, UPGRADES } from '../../sim/data/upgrades';
import { upgradeAmortizeWeeks, WEEK_REWARD_MIN_CUPS, weekGoal, weekProfitTarget, weekReward } from '../../sim/data/week';
import { profit as dayProfit } from '../../sim/economy';
import { isUnlocked, weekIndex } from '../../sim/progression';
import { bestDay, weekCompare, type StatId, type WeekCompare } from '../../sim/stats';
import { nextUpgradeCost, nextUpgradeTicketCost, upgradeBlockedReason } from '../../sim/upgrades';
import { nextWeekGoal, SCORE_PROFIT, SCORE_REVENUE, SCORE_STARS, weekCups } from '../../sim/week';
import type { Difficulty, GameState, UpgradeId, WeekResult } from '../../sim/types';
import { h, setChildren, uid } from '../core/dom';
import { formatMoney, formatRating, formatSavedAt } from '../core/format';
import { DAY_EVENT_ICONS, WEATHER_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';
import { unlockNames } from '../hud/events';
import { DAY_EVENT_LABELS, WEATHER_LABELS } from '../hud/hud';
import type { SaveStatus } from '../report';
import { starsEl } from '../report/reviews';

export interface WeekEndActions {
  /** Game whose finished week is shown; read each time the screen opens. */
  getState(): GameState | null;
  /** "Sang tuần N+1": day 1 of the next week, in preparation. */
  onNextWeek(): void;
  /** "Chơi lại": a new game with the same shop name and difficulty. */
  onReplay(): void;
  /** "Về menu", also Esc. */
  onMenu(): void;
  /** "Thử lại" when the last week day's autosave failed, like the Daily Report's. */
  onRetrySave?(): SaveStatus;
}

export interface WeekEndScreen extends Screen {
  /** Autosave result of the last week day; null clears it. */
  setSaveStatus(status: SaveStatus | null): void;
}

/** Cups a week can earn (weekCups in src/sim/week.ts). */
const MAX_CUPS = 3;

/** How long "Chơi lại" stays armed waiting for a second click, ms (as "Gỡ" in Nâng cấp). */
export const REPLAY_CONFIRM_MS = 3000;

function section(iconId: IconId, title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'rpt-section' }, h('h4', { class: 'rpt-h4' }, icon(iconId), title), ...children);
}

function goalBadge(reached: boolean): HTMLElement {
  return reached
    ? h('span', { class: 'badge badge-ok' }, icon('i-ok', { size: 16 }), 'Đạt mục tiêu')
    : h('span', { class: 'badge badge-warn' }, icon('i-warning', { size: 16 }), 'Chưa đạt');
}

/** One criterion of the score: the points it gave out of the most it can give. */
export interface ScoreRow {
  id: 'revenue' | 'profit' | 'stars';
  label: string;
  points: number;
  max: number;
}

/**
 * Points each criterion gave (weekScore's shares), split so they add up to the
 * stored score: rounded down, then the largest remainders get the points left.
 * Null for weeks scored before profit counted, whose score had other parts.
 */
export function scoreRows(r: WeekResult): ScoreRow[] | null {
  if (r.profit === undefined || r.profitTarget === undefined) return null;
  const share = (value: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, value) / target) : 1);
  const raw = [
    { id: 'revenue' as const, label: 'Doanh thu', max: SCORE_REVENUE, exact: SCORE_REVENUE * share(r.revenue, r.revenueTarget) },
    { id: 'profit' as const, label: 'Lợi nhuận', max: SCORE_PROFIT, exact: SCORE_PROFIT * share(r.profit, r.profitTarget) },
    { id: 'stars' as const, label: 'Sao', max: SCORE_STARS, exact: SCORE_STARS * share(r.stars, r.starsTarget) },
  ];
  const rows = raw.map((x) => ({ id: x.id, label: x.label, max: x.max, points: Math.floor(x.exact), rest: x.exact - Math.floor(x.exact) }));
  let left = r.score - rows.reduce((s, x) => s + x.points, 0);
  for (const x of [...rows].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    if (x.points < x.max) {
      x.points++;
      left--;
    }
  }
  return rows.map(({ id, label, points, max }) => ({ id, label, points, max }));
}

/** Lowest score that earns `cups` cups (weekCups). */
function cupMinScore(cups: number): number {
  for (let s = 0; s <= 100; s++) if (weekCups(s) >= cups) return s;
  return 100;
}

/** "Từ 70 điểm được 2 cúp: thưởng …; từ 90 điểm được 3 cúp: thưởng …." */
export function cupRuleText(state: GameState): string {
  const parts: string[] = [];
  for (let c = WEEK_REWARD_MIN_CUPS; c <= MAX_CUPS; c++) parts.push(`từ ${cupMinScore(c)} điểm được ${c} cúp: thưởng ${formatMoney(weekReward(state.difficulty, c))}`);
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Sum of the daily profits of the scored week, before the upgrade charge; null without a week. */
function weekDaysProfit(state: GameState): number | null {
  const week = state.week;
  if (!week) return null;
  const lastDay = week.startedDay + week.length - 1;
  return [...state.history, state.today].filter((d) => d.day >= week.startedDay && d.day <= lastDay).reduce((s, d) => s + dayProfit(d), 0);
}

/** Money with "−" for a loss. */
function signed(dong: number): string {
  return dong < 0 ? `−${formatMoney(-dong)}` : formatMoney(dong);
}

/** Criterion → points, how the week profit was counted and the cups a score earns; null before profit counted. */
function scoreDetail(state: GameState, r: WeekResult): HTMLElement | null {
  const rows = scoreRows(r);
  if (!rows) return null;
  const days = weekDaysProfit(state);
  return h(
    'div',
    { class: 'wk-score-detail', attrs: { 'data-block': 'score-table' } },
    h(
      'table',
      { class: 'rpt-margins wk-points' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Tiêu chí' }), h('th', { class: 'is-num', text: 'Điểm' }))),
      h(
        'tbody',
        {},
        ...rows.map((row) =>
          h('tr', { attrs: { 'data-criterion': row.id } }, h('td', { class: 'rpt-strong', text: row.label }), h('td', { class: 'is-num', text: `${row.points}/${row.max}` })),
        ),
      ),
      h('tfoot', {}, h('tr', {}, h('td', { class: 'rpt-strong', text: 'Tổng' }), h('td', { class: 'is-num rpt-strong', text: `${r.score}/100` }))),
    ),
    days !== null
      ? h('p', { attrs: { 'data-line': 'profit-formula' }, text: `Lãi các ngày ${signed(days)} − khấu hao nâng cấp ${formatMoney(days - r.profit!)} = ${signed(r.profit!)}` })
      : null,
    h('p', { class: 'rpt-muted', attrs: { 'data-line': 'cup-rule' }, text: cupRuleText(state) }),
  );
}

/** A goal bar and its share of the target in percent, as the revenue and profit cards show it. */
function goalBar(label: string, value: number, target: number): { bar: HTMLElement; pct: number } {
  const pct = target > 0 ? Math.round((Math.max(0, value) / target) * 100) : 100;
  const fill = h('span', { class: 'rpt-bar-fill' });
  fill.setAttribute('style', `width:${Math.min(100, pct)}%`);
  const bar = h(
    'span',
    { class: 'rpt-bar-track wk-track', attrs: { role: 'progressbar', 'aria-label': `${label} so mục tiêu`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)) } },
    fill,
  );
  return { bar, pct };
}

/** Score out of 100, the cups (unearned ones dimmed) and the cup reward when there is one. */
function scoreBlock(r: WeekResult, reward: number): HTMLElement {
  const cups = Math.max(0, Math.min(MAX_CUPS, r.cups));
  return h(
    'div',
    { class: 'rpt-result wk-score', attrs: { 'data-block': 'score' } },
    icon('i-trophy', { size: 48, class: 'rpt-result-icon' }),
    h('span', { class: 'rpt-result-label', text: 'Điểm tuần' }),
    h('span', { class: 'rpt-result-value', text: `${r.score}/100` }),
    h(
      'span',
      { class: 'wk-score-foot' },
      h(
        'span',
        { class: 'wk-cups', attrs: { role: 'img', 'aria-label': `${cups}/${MAX_CUPS} cúp`, 'data-block': 'cups', 'data-cups': String(cups) } },
        ...Array.from({ length: MAX_CUPS }, (_, i) => icon('i-trophy', { size: 32, class: i < cups ? 'wk-cup' : 'wk-cup is-off' })),
      ),
      reward > 0
        ? h('span', { class: 'wk-reward', attrs: { 'data-block': 'reward' } }, icon('i-coin', { size: 16 }), 'Thưởng ', h('b', { text: `+${formatMoney(reward)}` }))
        : null,
    ),
  );
}

function revenueBlock(r: WeekResult): HTMLElement {
  const { bar, pct } = goalBar('Doanh thu', r.revenue, r.revenueTarget);
  return section(
    'i-coin',
    'Doanh thu tuần',
    h(
      'div',
      { class: 'wk-goal', attrs: { 'data-block': 'revenue' } },
      h('p', { class: 'wk-goal-num' }, h('b', { text: formatMoney(r.revenue) }), h('span', { class: 'rpt-muted', text: ` / mục tiêu ${formatMoney(r.revenueTarget)}` })),
      bar,
      h('p', { class: 'wk-goal-foot' }, goalBadge(r.revenue >= r.revenueTarget), h('span', { class: 'rpt-muted', text: `${pct}% mục tiêu` })),
    ),
  );
}

/**
 * How the week profit of the score is counted (weekUpgradeCharge): every week,
 * week 1 included, spreads each upgrade over upgradeAmortizeWeeks(difficulty).
 */
export function weekProfitRule(difficulty: Difficulty): string {
  return `Lãi các ngày trừ tiền nâng cấp chia đều ${upgradeAmortizeWeeks(difficulty)} tuần kể từ tuần mua.`;
}

/** Week profit the score counts against its target, with the rule; null for weeks scored before profit counted. */
function profitBlock(r: WeekResult, difficulty: Difficulty): HTMLElement | null {
  if (r.profit === undefined || r.profitTarget === undefined) return null;
  const { bar, pct } = goalBar('Lợi nhuận', r.profit, r.profitTarget);
  return section(
    'i-trend-up',
    'Lợi nhuận tuần',
    h(
      'div',
      { class: 'wk-goal', attrs: { 'data-block': 'profit' } },
      h('p', { class: 'wk-goal-num' }, h('b', { text: signed(r.profit) }), h('span', { class: 'rpt-muted', text: ` / mục tiêu ${formatMoney(r.profitTarget)}` })),
      bar,
      h('p', { class: 'wk-goal-foot' }, goalBadge(r.profit >= r.profitTarget), h('span', { class: 'rpt-muted', text: `${pct}% mục tiêu` })),
      h('p', { class: 'rpt-muted', attrs: { 'data-block': 'profit-rule' }, text: weekProfitRule(difficulty) }),
    ),
  );
}

function starsBlock(r: WeekResult): HTMLElement {
  return section(
    'i-star',
    'Đánh giá quán',
    h(
      'div',
      { class: 'wk-goal', attrs: { 'data-block': 'stars' } },
      h('p', { class: 'wk-goal-num' }, starsEl(r.stars, false, 'Cuối tuần '), h('span', { class: 'rpt-muted', text: ` / mục tiêu ${formatRating(r.starsTarget)} sao` })),
      h('p', { class: 'wk-goal-foot' }, goalBadge(r.stars >= r.starsTarget)),
    ),
  );
}

// ── Against the week before ─────────────────────────────────────────────────

const COMPARE_LABELS: Record<StatId, string> = {
  profit: 'Lợi nhuận',
  revenue: 'Doanh thu',
  customersServed: 'Khách phục vụ',
  abandonRate: 'Khách bỏ đi',
  stars: 'Sao',
};

function compareValue(id: StatId, v: number | null): string {
  if (v === null) return '—';
  if (id === 'profit' || id === 'revenue') return formatMoney(Math.round(v));
  if (id === 'stars') return formatRating(v);
  if (id === 'abandonRate') return `${Math.round(v)}%`;
  return String(Math.round(v));
}

/**
 * Signed change as the cells show it; for the abandon rate a drop is the good
 * direction. The arrow and the sign tell which way the figure moved; the
 * colour tells better (green) or worse (red).
 */
function compareDelta(id: StatId, delta: number): { dir: 'up' | 'down' | 'flat'; tone: 'up' | 'down' | 'flat'; text: string } {
  const shown = id === 'stars' ? Math.round(delta * 10) / 10 : Math.round(delta);
  if (shown === 0) return { dir: 'flat', tone: 'flat', text: '0' };
  const dir = shown > 0 ? 'up' : 'down';
  const better = id === 'abandonRate' ? shown < 0 : shown > 0;
  const sign = shown > 0 ? '+' : '−';
  const abs = Math.abs(shown);
  const text =
    id === 'profit' || id === 'revenue'
      ? `${sign}${formatMoney(abs)}`
      : id === 'stars'
        ? `${sign}${formatRating(abs)}`
        : id === 'abandonRate'
          ? `${sign}${abs} điểm %`
          : `${sign}${abs}`;
  return { dir, tone: better ? 'up' : 'down', text };
}

const DELTA_ICON = { up: 'i-trend-up', down: 'i-trend-down', flat: 'i-equal' } as const satisfies Record<string, IconId>;

/** "Giảm 3 điểm %, tốt hơn": the change read out with its meaning. */
function deltaLabel(d: ReturnType<typeof compareDelta>): string {
  if (d.dir === 'flat') return 'Không đổi';
  return `${d.dir === 'up' ? 'Tăng' : 'Giảm'} ${d.text.slice(1)}, ${d.tone === 'up' ? 'tốt hơn' : 'kém hơn'}`;
}

/**
 * Each figure of this week next to last week's, with the change (arrow shape,
 * sign, then colour). Below 480 px each row becomes label, this week and the
 * change (ui.css), so nothing is cut or scrolls sideways.
 */
function compareBlock(c: WeekCompare): HTMLElement {
  return section(
    'i-chart',
    `So với tuần ${c.previous.index}`,
    h(
      'div',
      { class: 'rpt-table-wrap wk-compare-wrap', attrs: { tabindex: '0', 'aria-label': `Bảng so với tuần ${c.previous.index}` } },
      h(
        'table',
        { class: 'rpt-margins wk-compare', attrs: { 'data-block': 'compare' } },
        h(
          'thead',
          {},
          h('tr', {}, h('th', { text: 'Chỉ số' }), h('th', { class: 'is-num', text: `Tuần ${c.current.index}` }), h('th', { class: 'is-num wk-prev', text: `Tuần ${c.previous.index}` }), h('th', { class: 'is-num', text: 'Thay đổi' })),
        ),
        h(
          'tbody',
          {},
          ...c.rows.map((row) => {
            const d = row.delta === null ? null : compareDelta(row.id, row.delta);
            return h(
              'tr',
              { attrs: { 'data-stat': row.id } },
              h('td', { class: 'rpt-strong', text: COMPARE_LABELS[row.id] }),
              h('td', { class: 'is-num', text: compareValue(row.id, row.value) }),
              h('td', { class: 'is-num rpt-muted wk-prev', text: compareValue(row.id, row.previous) }),
              h(
                'td',
                { class: 'is-num' },
                d
                  ? h('span', { class: `rpt-fig-delta wk-delta is-${d.tone}`, attrs: { 'data-delta': d.dir, 'data-tone': d.tone, 'aria-label': deltaLabel(d) } }, icon(DELTA_ICON[d.dir], { size: 16 }), h('b', { text: d.text }))
                  : h('span', { class: 'rpt-muted', text: '—' }),
              ),
            );
          }),
        ),
      ),
    ),
  );
}

// ── Seven days as columns ───────────────────────────────────────────────────

/** 2_350_000 → "2,4tr", 850_000 → "850k": a column label that fits 390 px. */
function shortMoney(dong: number): string {
  if (Math.abs(dong) >= 1_000_000) return `${(Math.round(dong / 100_000) / 10).toFixed(1).replace('.', ',')}tr`;
  return `${Math.round(dong / 1_000)}k`;
}

/** One CSS column per week day, height by revenue, the best day marked; weather and event below. */
function daysBlock(r: WeekResult, best: number | null, startDay = 1): HTMLElement {
  const max = Math.max(0, ...r.days.map((d) => d.revenue));
  return section(
    'i-chart',
    'Doanh thu từng ngày',
    h(
      'ol',
      { class: 'wk-chart', attrs: { 'data-block': 'days' } },
      ...r.days.map((d) => {
        const isBest = d.day === best;
        // d.day counts 1–7 inside the week; the player knows the run's day (Ngày 8–14 in week 2).
        const day = startDay + d.day - 1;
        const bar = h('span', { class: 'wk-bar' });
        bar.setAttribute('style', `height:${max > 0 ? Math.round((d.revenue / max) * 100) : 0}%`);
        const label = [`Ngày ${day}`, WEATHER_LABELS[d.weather], d.event === 'none' ? null : DAY_EVENT_LABELS[d.event], formatMoney(d.revenue), `${d.customersServed} khách`, isBest ? 'ngày tốt nhất' : null]
          .filter(Boolean)
          .join(' · ');
        return h(
          'li',
          { class: `wk-col${isBest ? ' is-best' : ''}`, attrs: { 'data-day': String(d.day), 'aria-label': label, title: label, ...(isBest ? { 'data-best': '' } : {}) } },
          h('span', { class: 'wk-col-value', attrs: { 'aria-hidden': 'true' } }, isBest ? icon('i-star', { size: 16 }) : null, shortMoney(d.revenue)),
          h('span', { class: 'wk-col-track', attrs: { 'aria-hidden': 'true' } }, bar),
          h(
            'span',
            { class: 'wk-col-day', attrs: { 'aria-hidden': 'true' } },
            icon(WEATHER_ICONS[d.weather], { size: 16 }),
            d.event === 'none' ? null : icon(DAY_EVENT_ICONS[d.event], { size: 16 }),
            h('b', { class: 'wk-col-date' }, h('small', { text: 'Ngày' }), String(day)),
          ),
        );
      }),
    ),
  );
}

// ── Next week ───────────────────────────────────────────────────────────────

/** What the next shop level brings: new items, or one more level on a few upgrades. */
function nextLevelLine(state: GameState): HTMLElement {
  const level = state.shopLevel;
  if (level >= MAX_SHOP_LEVEL) return h('p', { attrs: { 'data-next': 'level' } }, icon('i-level', { size: 16 }), 'Quán đã ở cấp cao nhất.');
  const def = LEVELS[level]!;
  const names = unlockNames(unlocksBetween(level, level + 1));
  const bonus = Object.keys(def.maxLevelBonus ?? {}).map((id) => getUpgrade(id as UpgradeId).name).join(', ');
  const opens = names ? `mở ${names}` : bonus ? `thêm 1 cấp cho ${bonus}` : 'quán lớn hơn';
  const xpLeft = Math.max(0, xpToReach(level + 1) - state.xp);
  return h(
    'p',
    { attrs: { 'data-next': 'level' } },
    icon('i-level', { size: 16 }),
    // The label and its colon never break apart.
    h('span', { class: 'wk-next-label' }, h('b', { text: `Cấp ${level + 1} · ${def.name}` }), ':'),
    ` ${opens}. Còn ${xpLeft.toLocaleString('vi-VN')} KN.`,
  );
}

/** 1.9 → "1,9". */
function factorText(x: number): string {
  return (Math.round(x * 10) / 10).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Next week's revenue (with its multiple of week 1), profit and stars targets as one sentence; scaled from shop level 10 (nextWeekGoal). */
export function nextWeekGoalText(state: GameState): string {
  const { goal } = nextWeekGoal(state);
  const base = weekGoal(state.difficulty, 1).revenue;
  const profitTarget = weekProfitTarget(state.difficulty, goal.revenue);
  return `Mục tiêu: ${formatMoney(goal.revenue)} doanh thu (×${factorText(base > 0 ? goal.revenue / base : 1)} mục tiêu tuần 1), ${formatMoney(profitTarget)} lợi nhuận và ${formatRating(goal.stars)} sao.`;
}

function nextWeekBlock(state: GameState, index: number): HTMLElement {
  return section(
    'i-forward',
    `Tuần ${index + 1}`,
    h(
      'div',
      { class: 'wk-next', attrs: { 'data-block': 'next-week' } },
      // One text node, so the line's flex gap never puts a space before the period.
      h('p', { attrs: { 'data-next': 'goal' } }, icon('i-trophy', { size: 16 }), h('span', { text: nextWeekGoalText(state) })),
      nextLevelLine(state),
    ),
  );
}

// ── Week 1 below 3 cups ─────────────────────────────────────────────────────

/** True when the money pays the next level of an upgrade or tool open now that needs no tickets and no other upgrade first. */
function canAffordUpgrade(state: GameState): boolean {
  return UPGRADES.some((u) => {
    if (!isUnlocked(state, 'upgrade', u.id) || upgradeBlockedReason(state, u.id)) return false;
    const cost = nextUpgradeCost(state, u.id);
    return cost !== null && (nextUpgradeTicketCost(state, u.id) ?? 0) === 0 && state.money >= cost;
  });
}

/** Up to two things to do next week, read from the shop: hire when nobody works, buy when the money pays an upgrade. */
export function weekOneHints(state: GameState): string[] {
  const hints: string[] = [];
  if (state.staff.length === 0) hints.push('Thuê pha chế');
  if (canAffordUpgrade(state)) hints.push('Mua nâng cấp, tiền chia ra các tuần');
  return hints.slice(0, 2);
}

/** Week 1 below 3 cups: revenue a day week 2 needs against this week's, and the hints; null otherwise. */
function weekOneBlock(state: GameState, r: WeekResult, index: number): HTMLElement | null {
  const week = state.week;
  if (!week || index !== 1 || r.cups >= MAX_CUPS) return null;
  const need = Math.round(weekGoal(state.difficulty, index + 1).revenue / week.length);
  const got = Math.round(r.revenue / (r.days.length || week.length));
  const hints = weekOneHints(state);
  return section(
    'i-forward',
    `Chuẩn bị tuần ${index + 1}`,
    h(
      'div',
      { class: 'wk-next', attrs: { 'data-block': 'week-one' } },
      h('p', { attrs: { 'data-next': 'per-day' } }, icon('i-coin', { size: 16 }), h('span', { text: `Doanh thu mỗi ngày tuần ${index + 1} cần ${formatMoney(need)}, tuần này đạt ${formatMoney(got)}.` })),
      hints.length ? h('ul', { class: 'wk-hints', attrs: { 'data-block': 'hints' } }, ...hints.map((t) => h('li', { attrs: { 'data-hint': '' }, text: `${t}.` }))) : null,
    ),
  );
}

/**
 * Week summary after the last week day: score, cups and cup reward, revenue
 * and stars against the goal, the figures against the week before (from week
 * 2), revenue per day with the best day marked, and next week's goal and shop
 * level. "Sang tuần N+1" (focused) starts the next week; "Chơi lại" (two
 * clicks) and "Về menu" (also Esc) leave. A failed autosave adds one light line with
 * "Thử lại" above the buttons.
 */
export function createWeekEnd(actions: WeekEndActions): WeekEndScreen {
  const titleId = uid('week-t');
  const title = h('h3', { id: titleId, text: 'Tổng kết tuần' });
  const sub = h('p', { class: 'rpt-sub' });
  const body = h('div', { class: 'rpt-body', attrs: { tabindex: '0', 'aria-label': 'Nội dung tổng kết tuần' } });
  const save = h('div', { class: 'rpt-save wk-save', attrs: { 'data-save': '' } });
  let saveStatus: SaveStatus | null = null;
  // The ok line only answers a "Thử lại"; the Daily Report already said it was saved.
  let retried = false;
  const nextLabel = h('span', { text: 'Sang tuần mới' });
  const next = h('button', { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'next-week' }, on: { click: () => actions.onNextWeek() } }, icon('i-next-day'), nextLabel);
  // "Chơi lại" drops the running game: the first click arms it for REPLAY_CONFIRM_MS, the second replays.
  const replayLabel = h('span', { text: 'Chơi lại' });
  const replay = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'replay' } }, icon('i-retry'), replayLabel);
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  const disarmReplay = (): void => {
    if (replayTimer !== null) clearTimeout(replayTimer);
    replayTimer = null;
    replay.removeAttribute('data-armed');
    replayLabel.textContent = 'Chơi lại';
  };
  replay.addEventListener('click', () => {
    if (replayTimer === null) {
      replay.setAttribute('data-armed', '');
      replayLabel.textContent = 'Bấm lần nữa để bỏ ván';
      replayTimer = setTimeout(disarmReplay, REPLAY_CONFIRM_MS);
      return;
    }
    disarmReplay();
    actions.onReplay();
  });
  const menu = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'menu' }, on: { click: () => actions.onMenu() } }, icon('i-home'), 'Về menu');
  const dialog = h(
    'div',
    { class: 'rpt-dialog' },
    h('div', { class: 'rpt-head' }, h('span', { class: 'rpt-head-icon' }, icon('i-trophy', { size: 32 })), h('div', { class: 'rpt-head-text' }, title, sub)),
    body,
    h('div', { class: 'rpt-foot' }, save, h('div', { class: 'rpt-foot-actions wk-foot-actions' }, menu, replay, next)),
  );

  function renderSave(): void {
    const state = actions.getState();
    // A status from another day (or another game) is stale: say nothing.
    const day = state ? (state.lastReport?.day ?? state.day) : null;
    if (saveStatus === null || saveStatus.day !== day || (saveStatus.ok && !retried)) {
      setChildren(save);
      save.className = 'rpt-save wk-save';
      save.removeAttribute('role');
      return;
    }
    if (saveStatus.ok) {
      save.className = 'rpt-save wk-save';
      save.setAttribute('role', 'status');
      setChildren(save, icon('i-ok'), `Đã tự lưu ngày ${saveStatus.day} · ${formatSavedAt(saveStatus.savedAt)}`);
      return;
    }
    save.className = 'rpt-save wk-save is-error';
    save.setAttribute('role', 'alert');
    const retry = actions.onRetrySave;
    setChildren(
      save,
      h('p', {}, icon('i-warning'), `Chưa tự lưu được ngày ${saveStatus.day}, kết quả vẫn hiển thị`),
      retry
        ? h(
            'button',
            {
              class: 'btn btn-secondary btn-sm',
              attrs: { type: 'button', 'data-action': 'retry-save' },
              on: {
                click: () => {
                  retried = true;
                  saveStatus = retry();
                  renderSave();
                  if (saveStatus.ok) next.focus();
                },
              },
            },
            icon('i-retry'),
            'Thử lại',
          )
        : null,
    );
  }

  const el = screenLayer(dialog, { variant: 'scrim', modal: true, label: 'Tổng kết tuần' });
  el.classList.add('rpt-layer');
  el.setAttribute('data-screen', 'weekEnd');
  el.setAttribute('aria-labelledby', titleId);
  el.removeAttribute('aria-label');
  return {
    el,
    onShow: () => {
      disarmReplay();
      const state = actions.getState();
      const result = state?.week?.result;
      const index = state ? weekIndex(state) : 1;
      title.textContent = `Tổng kết tuần ${index}`;
      nextLabel.textContent = `Sang tuần ${index + 1}`;
      const start = state?.week?.startedDay;
      sub.textContent = state
        ? `${state.shopName} · ${DIFFICULTIES[state.difficulty].name}${start !== undefined ? ` · Ngày ${start}–${start + state.week!.length - 1}` : ''}`
        : '';
      if (!state || !result) {
        setChildren(body);
      } else {
        // The archive's last row is this week once it is scored; week 1 has nothing to compare with.
        const compare = weekCompare(state);
        setChildren(
          body,
          // Only what closeDay actually paid; v2 weeks have no reward and show none.
          scoreBlock(result, result.reward ?? 0),
          scoreDetail(state, result),
          h('div', { class: 'rpt-grid wk-grid' }, revenueBlock(result), profitBlock(result, state.difficulty), starsBlock(result)),
          compare && compare.current.index === index ? compareBlock(compare) : null,
          daysBlock(result, bestDay(state)?.weekDay ?? null, start),
          nextWeekBlock(state, index),
          weekOneBlock(state, result, index),
        );
      }
      renderSave();
    },
    setSaveStatus(status) {
      saveStatus = status;
      retried = false;
      renderSave();
    },
    initialFocus: () => next,
    onEscape: () => {
      actions.onMenu();
      return true;
    },
  };
}
