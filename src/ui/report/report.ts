import { DIFFICULTIES } from '../../sim/data/difficulty';
import { getMenuItem } from '../../sim/data/menu';
import type { Command, DailyReport, GameState, Review, SuggestionKind } from '../../sim/types';
import { h, setChildren, trapFocus, Watcher } from '../core/dom';
import { formatMoney, formatRating, formatSavedAt } from '../core/format';
import { fillReviews, newestFirst, reviewItem, starsEl } from './reviews';

/** Reviews shown on the summary tab. */
export const REPORT_RECENT_REVIEWS = 3;

/** Result of a day's autosave, shown in the footer of that day's report. */
export type SaveStatus = { day: number; ok: true; savedAt: number } | { day: number; ok: false };

export type ReportTab = 'summary' | 'reviews';

export interface DailyReportOptions {
  dispatch(cmd: Command): boolean;
  /** Tries the autosave again; the footer shows the returned status. */
  onRetrySave?(): SaveStatus;
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

export type ResultKind = 'profit' | 'loss' | 'even' | 'none';

/** Headline of the report: profit, loss, break-even, or no customers at all. */
export function reportResult(r: DailyReport): { kind: ResultKind; label: string; value: string } {
  const value = r.profit > 0 ? `+${formatMoney(r.profit)}` : formatMoney(r.profit);
  if (r.customersArrived === 0) return { kind: 'none', label: '○ Không có khách', value };
  if (r.profit > 0) return { kind: 'profit', label: '▲ Lãi', value };
  if (r.profit < 0) return { kind: 'loss', label: '▼ Lỗ', value };
  return { kind: 'even', label: '= Hòa vốn', value };
}

const RESULT_CLASS: Record<ResultKind, string> = { profit: '', loss: ' is-loss', even: ' is-none', none: ' is-none' };

const TIP_ICON: Record<SuggestionKind, string> = {
  restock: '📦',
  hire_barista: '👥',
  hire_server: '👥',
  hire_cleaner: '🧹',
  marketing: '📣',
  upgrade: '🛠️',
};

function statRow(label: string, value: string, tone: 'pos' | 'neg' | '' = '', total = false): HTMLElement {
  return h('div', { class: `rpt-stat${total ? ' is-total' : ''}` }, h('dt', { text: label }), h('dd', { class: tone, text: value }));
}

function cost(amount: number): string {
  return amount > 0 ? formatMoney(-amount) : formatMoney(0);
}

function section(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'rpt-section' }, h('h4', { class: 'rpt-h4', text: title }), ...children);
}

function muted(text: string): HTMLElement {
  return h('p', { class: 'rpt-muted', text });
}

function money(r: DailyReport): HTMLElement {
  return section(
    '💵 Thu chi',
    h(
      'dl',
      { class: 'rpt-stats', attrs: { 'data-block': 'money' } },
      statRow('Doanh thu', `+${formatMoney(r.revenue)}`, 'pos'),
      statRow('Nguyên liệu đã dùng', cost(r.ingredientCost), r.ingredientCost > 0 ? 'neg' : ''),
      statRow('Lương nhân viên', cost(r.wages), r.wages > 0 ? 'neg' : ''),
      statRow('Marketing', cost(r.marketingCost), r.marketingCost > 0 ? 'neg' : ''),
      statRow('Lợi nhuận', r.profit > 0 ? `+${formatMoney(r.profit)}` : formatMoney(r.profit), r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : '', true),
    ),
  );
}

function customers(r: DailyReport): HTMLElement {
  return section(
    '👥 Khách',
    h(
      'dl',
      { class: 'rpt-stats', attrs: { 'data-block': 'customers' } },
      statRow('Khách đến', `${r.customersArrived} khách`),
      statRow('Được phục vụ', `${r.customersServed} khách`),
      statRow('Bỏ đi', `${r.customersLost} khách`, r.customersLost > 0 ? 'neg' : ''),
    ),
  );
}

function rating(r: DailyReport): HTMLElement {
  const delta = Math.round(r.ratingEnd * 10) / 10 - Math.round(r.ratingStart * 10) / 10;
  const step = Math.round(delta * 10);
  const badge =
    step > 0
      ? h('span', { class: 'rpt-delta is-up', text: `▲ +${formatRating(delta)}` })
      : step < 0
        ? h('span', { class: 'rpt-delta is-down', text: `▼ −${formatRating(-delta)}` })
        : h('span', { class: 'rpt-delta', text: '= Không đổi' });
  return section(
    '⭐ Đánh giá quán',
    h(
      'div',
      { class: 'rpt-rating', attrs: { 'data-block': 'rating' } },
      starsEl(r.ratingStart, true, 'Đầu ngày '),
      h('span', { class: 'rpt-arrow', attrs: { 'aria-hidden': 'true' }, text: '→' }),
      starsEl(r.ratingEnd, false, 'Cuối ngày '),
      badge,
    ),
  );
}

function topSellers(r: DailyReport): HTMLElement {
  const max = Math.max(1, ...r.topSellers.map((t) => t.qty));
  return section(
    '🏆 Món bán chạy',
    r.topSellers.length === 0
      ? muted('Chưa bán được món nào.')
      : h(
          'ol',
          { class: 'rpt-bars', attrs: { 'data-block': 'top' } },
          ...r.topSellers.map((t) => {
            const item = getMenuItem(t.id);
            const fill = h('span', { class: 'rpt-bar-fill' });
            fill.setAttribute('style', `width:${Math.round((t.qty / max) * 100)}%`);
            return h(
              'li',
              { class: 'rpt-bar', attrs: { 'data-item': t.id } },
              h('span', { text: `${item.icon} ${item.name}` }),
              h('span', { class: 'rpt-bar-track', attrs: { 'aria-hidden': 'true' } }, fill),
              h('span', { class: 'rpt-bar-num', text: `${t.qty} ${item.category === 'food' ? 'cái' : 'ly'}` }),
            );
          }),
        ),
  );
}

function outOfStock(r: DailyReport): HTMLElement {
  return section(
    '⛔ Món hết nguyên liệu',
    r.outOfStock.length === 0
      ? muted('Không món nào hết nguyên liệu.')
      : h(
          'ul',
          { class: 'rpt-list', attrs: { 'data-block': 'out' } },
          ...r.outOfStock.map((id) => {
            const item = getMenuItem(id);
            return h('li', { class: 'rpt-out', attrs: { 'data-item': id } }, `${item.icon} `, h('b', { text: item.name }), ' · thiếu nguyên liệu');
          }),
        ),
  );
}

function recentReviews(reviews: readonly Review[]): HTMLElement {
  const recent = newestFirst(reviews, REPORT_RECENT_REVIEWS);
  return section(
    '💬 Đánh giá gần nhất',
    recent.length === 0 ? muted('Hôm nay chưa có khách nào viết đánh giá.') : h('ul', { class: 'rpt-list', attrs: { 'data-block': 'recent' } }, ...recent.map(reviewItem)),
  );
}

function suggestions(r: DailyReport): HTMLElement {
  return section(
    `💡 Gợi ý cho ngày ${r.day + 1}`,
    r.suggestions.length === 0
      ? muted('Hôm nay mọi thứ ổn, cứ giữ nhịp này.')
      : h(
          'ol',
          { class: 'rpt-list', attrs: { 'data-block': 'tips' } },
          ...r.suggestions.map((s) =>
            h('li', { class: 'rpt-tip', attrs: { 'data-kind': s.kind } }, h('span', { class: 'rpt-tip-icon', attrs: { 'aria-hidden': 'true' }, text: TIP_ICON[s.kind] }), h('p', { text: s.text })),
          ),
        ),
  );
}

function resultNote(r: DailyReport, kind: ResultKind): string {
  const cash = `Tiền hiện có: ${formatMoney(r.money)}.`;
  if (kind === 'none') return `Chỉ có chi phí cố định trong ngày. ${cash}`;
  return `Phục vụ ${r.customersServed}/${r.customersArrived} khách. ${cash}`;
}

/** The summary tab, rebuilt once per report. */
export function renderSummary(r: DailyReport): HTMLElement[] {
  const result = reportResult(r);
  return [
    h(
      'div',
      { class: `rpt-result${RESULT_CLASS[result.kind]}`, attrs: { 'data-result': result.kind } },
      h('span', { class: 'rpt-result-label', text: result.label }),
      h('span', { class: 'rpt-result-value', text: result.value }),
      h('span', { class: 'rpt-result-note', text: resultNote(r, result.kind) }),
    ),
    h('div', { class: 'rpt-grid' }, money(r), h('div', { class: 'rpt-col' }, customers(r), rating(r))),
    h('div', { class: 'rpt-grid' }, topSellers(r), outOfStock(r)),
    recentReviews(r.reviews),
    suggestions(r),
  ];
}

/**
 * End-of-day overlay after design/report.html: tabs "Tổng kết" and "Đánh giá",
 * the autosave status, "Xem reviews" and "Ngày tiếp theo" (next_day).
 */
export function createDailyReport(options: DailyReportOptions): DailyReportView {
  const w = new Watcher<GameState>();
  let tab: ReportTab = 'summary';
  let shown = false;
  let saveStatus: SaveStatus | null = null;
  let day = 0;

  const title = h('h3', { id: 'rpt-title' });
  const sub = h('p', { class: 'rpt-sub' });
  const summaryTab = h('button', { class: 'rpt-tab', id: 'rpt-tab-summary', attrs: { type: 'button', role: 'tab', 'aria-controls': 'rpt-summary', 'data-tab': 'summary' }, text: '📊 Tổng kết' });
  const reviewsTab = h('button', { class: 'rpt-tab', id: 'rpt-tab-reviews', attrs: { type: 'button', role: 'tab', 'aria-controls': 'rpt-reviews', 'data-tab': 'reviews' } });
  const summary = h('div', { class: 'rpt-body', id: 'rpt-summary', attrs: { role: 'tabpanel', 'aria-labelledby': 'rpt-tab-summary' } });
  const reviews = h('div', { class: 'rpt-body', id: 'rpt-reviews', attrs: { role: 'tabpanel', 'aria-labelledby': 'rpt-tab-reviews' } });

  const save = h('div', { class: 'rpt-save', attrs: { 'data-save': '' } });
  const toggleBtn = h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'data-action': 'reviews' } });
  const nextBtn = h('button', { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'next-day' }, text: '☀️ Ngày tiếp theo' });
  const backBtn = (): HTMLElement => h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => showTab('summary') }, text: '📊 Về Tổng kết' });

  summaryTab.addEventListener('click', () => showTab('summary'));
  reviewsTab.addEventListener('click', () => showTab('reviews'));
  toggleBtn.addEventListener('click', () => showTab(tab === 'summary' ? 'reviews' : 'summary'));
  nextBtn.addEventListener('click', () => options.dispatch({ type: 'next_day' }));
  const tabs = h('div', { class: 'rpt-tabs', attrs: { role: 'tablist', 'aria-label': 'Báo cáo ngày' } }, summaryTab, reviewsTab);
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    showTab(tab === 'summary' ? 'reviews' : 'summary');
    (tab === 'summary' ? summaryTab : reviewsTab).focus();
  });

  const dialog = h(
    'div',
    { class: 'rpt-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rpt-title' } },
    h('div', { class: 'rpt-head' }, title, sub),
    tabs,
    summary,
    reviews,
    h('div', { class: 'rpt-foot' }, save, toggleBtn, nextBtn),
  );
  dialog.addEventListener('keydown', (e) => trapFocus(dialog, e));
  const el = h('div', { class: 'ui-screen is-scrim rpt-layer', hidden: true, attrs: { 'data-screen': 'report' } }, dialog);

  function showTab(next: ReportTab): void {
    tab = next;
    summaryTab.setAttribute('aria-selected', String(next === 'summary'));
    reviewsTab.setAttribute('aria-selected', String(next === 'reviews'));
    summaryTab.tabIndex = next === 'summary' ? 0 : -1;
    reviewsTab.tabIndex = next === 'reviews' ? 0 : -1;
    summary.hidden = next !== 'summary';
    reviews.hidden = next !== 'reviews';
    toggleBtn.textContent = next === 'summary' ? '💬 Xem reviews' : '📊 Về Tổng kết';
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
      setChildren(save, `✓ Đã tự lưu ngày ${day} · ${formatSavedAt(saveStatus.savedAt)}`);
      return;
    }
    save.className = 'rpt-save is-error';
    save.setAttribute('role', 'alert');
    const retry = options.onRetrySave;
    setChildren(
      save,
      h('p', { text: `⚠️ Chưa tự lưu được: bộ nhớ trình duyệt đầy hoặc bị chặn. Tiến độ ngày ${day} sẽ mất nếu đóng tab.` }),
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
            '🔄 Thử lưu lại',
          )
        : null,
    );
  }

  w.watch(
    (s) => s.lastReport ?? null,
    (r, s) => {
      day = r?.day ?? s.day;
      title.textContent = `🌙 Hết ngày ${day} · ${s.shopName}`;
      sub.textContent = `${DIFFICULTIES[s.difficulty].name} · 07:00–21:00`;
      setChildren(summary, ...(r ? renderSummary(r) : [muted('Chưa có số liệu cho ngày này.')]));
      showTab('summary');
      renderSave();
    },
  );
  // Reviews are only appended (oldest dropped), so the newest one tells when the list changed.
  w.watch(
    (s) => s.reviews[s.reviews.length - 1],
    (_, s) => {
      reviewsTab.textContent = `💬 Đánh giá (${s.reviews.length})`;
      fillReviews(reviews, s.reviews, backBtn());
    },
  );
  showTab('summary');

  return {
    el,
    update(state, want) {
      const visible = want && state !== null;
      if (visible && state) w.run(state);
      if (visible === shown) return;
      shown = visible;
      el.hidden = !visible;
      if (visible) nextBtn.focus();
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
