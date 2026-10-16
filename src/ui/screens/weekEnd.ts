import { DIFFICULTIES } from '../../sim/data/difficulty';
import type { GameState, WeekResult } from '../../sim/types';
import { h, setChildren, uid } from '../core/dom';
import { formatMoney, formatRating } from '../core/format';
import { DAY_EVENT_ICONS, WEATHER_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';
import { DAY_EVENT_LABELS, WEATHER_LABELS } from '../hud/hud';
import { starsEl } from '../report/reviews';

export interface WeekEndActions {
  /** Game whose finished week is shown; read each time the screen opens. */
  getState(): GameState | null;
  /** "Chơi lại": a new week with the same shop name and difficulty. */
  onReplay(): void;
  /** "Về menu", also Esc. */
  onMenu(): void;
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

/** Score out of 100 and the cups, unearned cups dimmed. */
function scoreBlock(r: WeekResult): HTMLElement {
  const cups = Math.max(0, Math.min(MAX_CUPS, r.cups));
  return h(
    'div',
    { class: 'rpt-result wk-score', attrs: { 'data-block': 'score' } },
    icon('i-trophy', { size: 48, class: 'rpt-result-icon' }),
    h('span', { class: 'rpt-result-label', text: 'Điểm tuần' }),
    h('span', { class: 'rpt-result-value', text: `${r.score}/100` }),
    h(
      'span',
      { class: 'wk-cups', attrs: { role: 'img', 'aria-label': `${cups}/${MAX_CUPS} cúp`, 'data-block': 'cups', 'data-cups': String(cups) } },
      ...Array.from({ length: MAX_CUPS }, (_, i) => icon('i-trophy', { size: 32, class: i < cups ? 'wk-cup' : 'wk-cup is-off' })),
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

/** One short row per week day: weather and event, revenue, customers served. */
function daysBlock(r: WeekResult): HTMLElement {
  return section(
    'i-chart',
    'Từng ngày',
    h(
      'div',
      { class: 'rpt-table-wrap' },
      h(
        'table',
        { class: 'rpt-margins wk-days', attrs: { 'data-block': 'days' } },
        h('thead', {}, h('tr', {}, h('th', { text: 'Ngày' }), h('th', { text: 'Thời tiết' }), h('th', { class: 'is-num', text: 'Doanh thu' }), h('th', { class: 'is-num', text: 'Khách' }))),
        h(
          'tbody',
          {},
          ...r.days.map((d) =>
            h(
              'tr',
              { attrs: { 'data-day': String(d.day) } },
              h('td', { class: 'rpt-strong', text: String(d.day) }),
              h(
                'td',
                {},
                h('span', { class: 'wk-day-tag' }, icon(WEATHER_ICONS[d.weather], { size: 16 }), WEATHER_LABELS[d.weather]),
                d.event === 'none' ? null : h('span', { class: 'wk-day-tag' }, icon(DAY_EVENT_ICONS[d.event], { size: 16 }), DAY_EVENT_LABELS[d.event]),
              ),
              h('td', { class: 'is-num', text: formatMoney(d.revenue) }),
              h('td', { class: 'is-num', text: String(d.customersServed) }),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * End of the 7-day week: score and cups, revenue and stars against the goal,
 * one row per day, then "Chơi lại" (focused) and "Về menu" (also Esc).
 */
export function createWeekEnd(actions: WeekEndActions): Screen {
  const titleId = uid('week-t');
  const sub = h('p', { class: 'rpt-sub' });
  const body = h('div', { class: 'rpt-body' });
  const replay = h('button', { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'replay' }, on: { click: () => actions.onReplay() } }, icon('i-retry'), 'Chơi lại');
  const menu = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'menu' }, on: { click: () => actions.onMenu() } }, icon('i-home'), 'Về menu');
  const dialog = h(
    'div',
    { class: 'rpt-dialog' },
    h('div', { class: 'rpt-head' }, h('span', { class: 'rpt-head-icon' }, icon('i-trophy', { size: 32 })), h('div', { class: 'rpt-head-text' }, h('h3', { id: titleId, text: 'Kết thúc tuần' }), sub)),
    body,
    h('div', { class: 'rpt-foot' }, h('div', { class: 'rpt-foot-actions' }, menu, replay)),
  );
  const el = screenLayer(dialog, { variant: 'scrim', modal: true, label: 'Kết thúc tuần' });
  el.classList.add('rpt-layer');
  el.setAttribute('data-screen', 'weekEnd');
  el.setAttribute('aria-labelledby', titleId);
  el.removeAttribute('aria-label');
  return {
    el,
    onShow: () => {
      const state = actions.getState();
      const result = state?.week?.result;
      sub.textContent = state ? `${state.shopName} · ${DIFFICULTIES[state.difficulty].name} · 7 ngày` : '';
      setChildren(body, ...(result ? [scoreBlock(result), h('div', { class: 'rpt-grid' }, revenueBlock(result), starsBlock(result)), daysBlock(result)] : []));
    },
    initialFocus: () => replay,
    onEscape: () => {
      actions.onMenu();
      return true;
    },
  };
}
