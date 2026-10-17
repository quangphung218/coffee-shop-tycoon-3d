import { DIFFICULTIES } from '../../sim/data/difficulty';
import { LEVELS, MAX_SHOP_LEVEL, unlocksBetween, xpToReach } from '../../sim/data/levels';
import { getUpgrade } from '../../sim/data/upgrades';
import { weekGoal, weekReward } from '../../sim/data/week';
import { weekIndex } from '../../sim/progression';
import { bestDay, weekCompare, type StatId, type WeekCompare } from '../../sim/stats';
import type { GameState, UpgradeId, WeekResult } from '../../sim/types';
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

function section(iconId: IconId, title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'rpt-section' }, h('h4', { class: 'rpt-h4' }, icon(iconId), title), ...children);
}

function goalBadge(reached: boolean): HTMLElement {
  return reached
    ? h('span', { class: 'badge badge-ok' }, icon('i-ok', { size: 16 }), 'Đạt mục tiêu')
    : h('span', { class: 'badge badge-warn' }, icon('i-warning', { size: 16 }), 'Chưa đạt');
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
  const share = r.revenueTarget > 0 ? r.revenue / r.revenueTarget : 1;
  const pct = Math.round(Math.max(0, share) * 100);
  const fill = h('span', { class: 'rpt-bar-fill' });
  fill.setAttribute('style', `width:${Math.min(100, pct)}%`);
  return section(
    'i-coin',
    'Doanh thu tuần',
    h(
      'div',
      { class: 'wk-goal', attrs: { 'data-block': 'revenue' } },
      h('p', { class: 'wk-goal-num' }, h('b', { text: formatMoney(r.revenue) }), h('span', { class: 'rpt-muted', text: ` / mục tiêu ${formatMoney(r.revenueTarget)}` })),
      h('span', { class: 'rpt-bar-track wk-track', attrs: { role: 'progressbar', 'aria-label': 'Doanh thu so mục tiêu', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, pct)) } }, fill),
      h('p', { class: 'wk-goal-foot' }, goalBadge(r.revenue >= r.revenueTarget), h('span', { class: 'rpt-muted', text: `${pct}% mục tiêu` })),
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

/** Signed change as the cells show it; for the abandon rate a drop is the good direction. */
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

/** Each figure of this week next to last week's, with the change (arrow shape, sign, then colour). */
function compareBlock(c: WeekCompare): HTMLElement {
  return section(
    'i-chart',
    `So với tuần ${c.previous.index}`,
    h(
      'div',
      { class: 'rpt-table-wrap' },
      h(
        'table',
        { class: 'rpt-margins wk-compare', attrs: { 'data-block': 'compare' } },
        h(
          'thead',
          {},
          h('tr', {}, h('th', { text: 'Chỉ số' }), h('th', { class: 'is-num', text: `Tuần ${c.current.index}` }), h('th', { class: 'is-num', text: `Tuần ${c.previous.index}` }), h('th', { class: 'is-num', text: 'Thay đổi' })),
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
              h('td', { class: 'is-num rpt-muted', text: compareValue(row.id, row.previous) }),
              h(
                'td',
                { class: 'is-num' },
                d
                  ? h('span', { class: `rpt-fig-delta wk-delta is-${d.tone}`, attrs: { 'data-delta': d.dir } }, icon(DELTA_ICON[d.dir], { size: 16 }), h('b', { text: d.text }))
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
function daysBlock(r: WeekResult, best: number | null): HTMLElement {
  const max = Math.max(0, ...r.days.map((d) => d.revenue));
  return section(
    'i-chart',
    'Doanh thu từng ngày',
    h(
      'ol',
      { class: 'wk-chart', attrs: { 'data-block': 'days' } },
      ...r.days.map((d) => {
        const isBest = d.day === best;
        const bar = h('span', { class: 'wk-bar' });
        bar.setAttribute('style', `height:${max > 0 ? Math.round((d.revenue / max) * 100) : 0}%`);
        const label = [`Ngày ${d.day}`, WEATHER_LABELS[d.weather], d.event === 'none' ? null : DAY_EVENT_LABELS[d.event], formatMoney(d.revenue), `${d.customersServed} khách`, isBest ? 'ngày tốt nhất' : null]
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
            h('b', { text: `N${d.day}` }),
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
    h('b', { text: `Cấp ${level + 1} · ${def.name}` }),
    `: ${opens}. Còn ${xpLeft.toLocaleString('vi-VN')} KN.`,
  );
}

function nextWeekBlock(state: GameState, index: number): HTMLElement {
  const goal = weekGoal(state.difficulty, index + 1);
  return section(
    'i-forward',
    `Tuần ${index + 1}`,
    h(
      'div',
      { class: 'wk-next', attrs: { 'data-block': 'next-week' } },
      h(
        'p',
        { attrs: { 'data-next': 'goal' } },
        icon('i-trophy', { size: 16 }),
        'Mục tiêu: ',
        h('b', { text: formatMoney(goal.revenue) }),
        ' doanh thu và ',
        h('b', { text: `${formatRating(goal.stars)} sao` }),
        '.',
      ),
      nextLevelLine(state),
    ),
  );
}

/**
 * Week summary after the last week day: score, cups and cup reward, revenue
 * and stars against the goal, the figures against the week before (from week
 * 2), revenue per day with the best day marked, and next week's goal and shop
 * level. "Sang tuần N+1" (focused) starts the next week; "Chơi lại" and
 * "Về menu" (also Esc) leave. A failed autosave adds one light line with
 * "Thử lại" above the buttons.
 */
export function createWeekEnd(actions: WeekEndActions): WeekEndScreen {
  const titleId = uid('week-t');
  const title = h('h3', { id: titleId, text: 'Tổng kết tuần' });
  const sub = h('p', { class: 'rpt-sub' });
  const body = h('div', { class: 'rpt-body' });
  const save = h('div', { class: 'rpt-save wk-save', attrs: { 'data-save': '' } });
  let saveStatus: SaveStatus | null = null;
  // The ok line only answers a "Thử lại"; the Daily Report already said it was saved.
  let retried = false;
  const nextLabel = h('span', { text: 'Sang tuần mới' });
  const next = h('button', { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'next-week' }, on: { click: () => actions.onNextWeek() } }, icon('i-next-day'), nextLabel);
  const replay = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'replay' }, on: { click: () => actions.onReplay() } }, icon('i-retry'), 'Chơi lại');
  const menu = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'menu' }, on: { click: () => actions.onMenu() } }, icon('i-home'), 'Về menu');
  const dialog = h(
    'div',
    { class: 'rpt-dialog' },
    h('div', { class: 'rpt-head' }, h('span', { class: 'rpt-head-icon' }, icon('i-trophy', { size: 32 })), h('div', { class: 'rpt-head-text' }, title, sub)),
    body,
    h('div', { class: 'rpt-foot' }, save, h('div', { class: 'rpt-foot-actions' }, menu, replay, next)),
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
          scoreBlock(result, weekReward(state.difficulty, result.cups)),
          h('div', { class: 'rpt-grid' }, revenueBlock(result), starsBlock(result)),
          compare && compare.current.index === index ? compareBlock(compare) : null,
          daysBlock(result, bestDay(state)?.weekDay ?? null),
          nextWeekBlock(state, index),
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
