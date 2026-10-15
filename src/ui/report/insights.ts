import { ABANDON_PCT, AVG_WAIT_MINUTES, FOOD_COST_PCT, LABOR_PCT, PRIME_COST_PCT, SEAT_FILL_PCT, WASTE_PCT_OF_COGS } from '../../sim/data/benchmarks';
import { getMenuItem } from '../../sim/data/menu';
import type { DailyReport, InsightMetric, InsightPanel, Insights, InsightStatus, MetricId } from '../../sim/types';
import { h } from '../core/dom';
import { formatMoney, formatRating } from '../core/format';
import { MENU_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';

/** The eight KPI cards, left to right; peak_hour drives the chart instead. */
const KPI_METRICS: MetricId[] = ['food_cost', 'labor_cost', 'prime_cost', 'aov', 'seat_fill', 'avg_wait', 'waste', 'abandon_rate'];

const METRIC_ICON: Record<MetricId, IconId> = {
  food_cost: 'i-beans',
  labor_cost: 'i-people',
  prime_cost: 'i-coin',
  aov: 'i-chart',
  seat_fill: 'i-tables',
  avg_wait: 'i-clock',
  waste: 'i-delete',
  peak_hour: 'i-clock',
  abandon_rate: 'i-face-angry',
};

const METRIC_LABEL: Record<MetricId, string> = {
  food_cost: 'Food cost',
  labor_cost: 'Chi phí lương',
  prime_cost: 'Prime cost',
  aov: 'Đơn trung bình',
  seat_fill: 'Lấp ghế',
  avg_wait: 'Chờ trung bình',
  waste: 'Hao hụt',
  peak_hour: 'Giờ cao điểm',
  abandon_rate: 'Tỷ lệ bỏ về',
};

/** "Ngưỡng tốt" line under each KPI; AOV is reference only, so it names its formula. */
const METRIC_TARGET: Partial<Record<MetricId, string>> = {
  food_cost: `Ngưỡng tốt: từ ${FOOD_COST_PCT.good}% trở xuống`,
  labor_cost: `Ngưỡng tốt: từ ${LABOR_PCT.good}% trở xuống`,
  prime_cost: `Ngưỡng tốt: từ ${PRIME_COST_PCT.good}% trở xuống`,
  aov: 'Doanh thu / số khách phục vụ',
  seat_fill: `Ngưỡng tốt: từ ${SEAT_FILL_PCT.good}% trở xuống`,
  avg_wait: `Ngưỡng tốt: từ ${AVG_WAIT_MINUTES.good} phút trở xuống`,
  waste: `Ngưỡng tốt: từ ${WASTE_PCT_OF_COGS.good}% nguyên liệu trở xuống`,
  abandon_rate: `Ngưỡng tốt: từ ${ABANDON_PCT.good}% trở xuống`,
};

/** Shape + word, not colour alone, for each benchmark status. */
const STATUS_INFO: Record<InsightStatus, { icon: IconId; text: string; cls: string }> = {
  good: { icon: 'i-ok', text: 'Tốt', cls: 'badge-ok' },
  watch: { icon: 'i-warning', text: 'Cần chú ý', cls: 'badge-warn' },
  bad: { icon: 'i-error', text: 'Xấu', cls: 'badge-danger' },
};

const PANEL_LABEL: Record<InsightPanel, string> = { menu: 'Menu', staff: 'Nhân viên', upgrades: 'Nâng cấp', inventory: 'Kho', marketing: 'Marketing' };
const PANEL_ICON: Record<InsightPanel, IconId> = { menu: 'i-menu', staff: 'i-people', upgrades: 'i-upgrades', inventory: 'i-inventory', marketing: 'i-marketing' };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function section(iconId: IconId, title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'rpt-section' }, h('h4', { class: 'rpt-h4' }, icon(iconId), title), ...children);
}

function muted(text: string): HTMLElement {
  return h('p', { class: 'rpt-muted', text });
}

/** KPI value in its own unit; "—" when the save could not supply the figure. */
function metricValue(m: InsightMetric): string {
  if (m.value === null) return '—';
  switch (m.id) {
    case 'aov':
    case 'waste':
      return formatMoney(m.value);
    case 'avg_wait':
      return `${formatRating(m.value)} phút`;
    case 'peak_hour':
      return `${pad2(m.value)}:00`;
    default:
      return `${Math.round(m.value)}%`;
  }
}

/** Flat label (never a button): icon + word for good/watch/bad, or a neutral note. */
function statusLabel(m: InsightMetric): HTMLElement {
  if (m.value === null) return h('span', { class: 'badge badge-neutral rpt-kpi-status' }, icon('i-info', { size: 16 }), 'Chưa đủ dữ liệu');
  if (m.status === null) return h('span', { class: 'badge badge-neutral rpt-kpi-status' }, icon('i-info', { size: 16 }), 'Tham khảo');
  const info = STATUS_INFO[m.status];
  return h('span', { class: `badge ${info.cls} rpt-kpi-status` }, icon(info.icon, { size: 16 }), info.text);
}

function kpiGrid(ins: Insights): HTMLElement {
  const byId = new Map(ins.metrics.map((m) => [m.id, m]));
  return h(
    'div',
    { class: 'rpt-kpis', attrs: { 'data-block': 'kpis' } },
    ...KPI_METRICS.flatMap((id) => {
      const m = byId.get(id);
      if (!m) return [];
      const target = METRIC_TARGET[id];
      return [
        h(
          'div',
          { class: 'rpt-kpi', attrs: { 'data-metric': id } },
          h('span', { class: 'rpt-kpi-label' }, icon(METRIC_ICON[id], { size: 16 }), METRIC_LABEL[id]),
          h('span', { class: 'rpt-kpi-value', text: metricValue(m) }),
          statusLabel(m),
          target ? h('span', { class: 'rpt-kpi-target', text: target }) : null,
        ),
      ];
    }),
  );
}

/** Arrivals 07–20 as CSS-height bars, with the peak hour marked and a hidden table for readers. */
function hoursChart(ins: Insights): HTMLElement {
  if (!ins.arrivalsByHour) return section('i-chart', 'Khách theo giờ (07–20)', muted('Bản lưu cũ chưa ghi lượng khách theo giờ.'));
  const arr = ins.arrivalsByHour;
  const hours = Array.from({ length: 14 }, (_, i) => ({ hour: 7 + i, n: arr[7 + i] ?? 0 }));
  const max = Math.max(1, ...hours.map((x) => x.n));
  const total = hours.reduce((s, x) => s + x.n, 0);
  const peak = ins.metrics.find((m) => m.id === 'peak_hour')?.value ?? null;

  const bars = h(
    'div',
    { class: 'rpt-chart-bars', attrs: { 'aria-hidden': 'true' } },
    ...hours.map(({ hour, n }) => {
      const isPeak = n > 0 && n >= max * 0.8;
      const bar = h('span', { class: 'rpt-hour-bar' });
      bar.setAttribute('style', `height:${Math.round((n / max) * 100)}%`);
      return h(
        'div',
        { class: `rpt-hour${isPeak ? ' is-peak' : ''}`, attrs: { 'data-hour': hour } },
        h('span', { class: 'rpt-hour-track' }, bar),
        h('span', { class: 'rpt-hour-label', text: pad2(hour) }),
      );
    }),
  );
  const table = h(
    'table',
    { class: 'sr-only' },
    h('caption', { text: 'Khách theo giờ' }),
    h('thead', {}, h('tr', {}, h('th', { attrs: { scope: 'col' }, text: 'Giờ' }), h('th', { attrs: { scope: 'col' }, text: 'Khách' }))),
    h('tbody', {}, ...hours.map(({ hour, n }) => h('tr', {}, h('th', { attrs: { scope: 'row' }, text: `${pad2(hour)}:00` }), h('td', { text: String(n) })))),
  );
  const peakTag = total > 0 && peak !== null ? h('p', { class: 'rpt-peak' }, h('span', { class: 'badge badge-warn' }, icon('i-clock', { size: 16 }), `Cao điểm ${pad2(peak)}:00`)) : null;
  return section('i-chart', 'Khách theo giờ (07–20)', bars, table, peakTag);
}

/** Gross profit per item sold, highest first; price, cost, margin and quantity. */
function marginTable(ins: Insights): HTMLElement {
  const rows = ins.itemProfits ?? [];
  if (rows.length === 0) return section('i-coin', 'Biên lợi nhuận từng món', muted('Chưa bán được món nào hôm nay.'));
  const head = h(
    'tr',
    {},
    h('th', { attrs: { scope: 'col' }, text: 'Món' }),
    h('th', { class: 'is-num', attrs: { scope: 'col' }, text: 'Giá' }),
    h('th', { class: 'is-num', attrs: { scope: 'col' }, text: 'Vốn' }),
    h('th', { class: 'is-num', attrs: { scope: 'col' }, text: 'Biên' }),
    h('th', { class: 'is-num', attrs: { scope: 'col' }, text: 'Bán' }),
    h('th', { class: 'is-num', attrs: { scope: 'col' }, text: 'Lãi gộp' }),
  );
  const body = rows.map((p) =>
    h(
      'tr',
      { attrs: { 'data-item': p.id } },
      h('th', { class: 'rpt-margin-name', attrs: { scope: 'row' } }, icon(MENU_ICONS[p.id], { size: 16 }), getMenuItem(p.id).name),
      h('td', { class: 'is-num', text: formatMoney(p.price) }),
      h('td', { class: 'is-num', text: formatMoney(p.cost) }),
      h('td', { class: 'is-num', text: `${Math.round(p.marginPct)}%` }),
      h('td', { class: 'is-num', text: String(p.qty) }),
      h('td', { class: 'is-num', text: formatMoney(p.grossProfit) }),
    ),
  );
  const table = h('table', { class: 'rpt-margins', attrs: { 'data-block': 'margins' } }, h('thead', {}, head), h('tbody', {}, ...body));
  return section('i-coin', 'Biên lợi nhuận từng món', h('div', { class: 'rpt-table-wrap' }, table));
}

/** Action list from the flagged metrics; each row links to the panel that fixes it. */
function actions(ins: Insights, onOpenPanel: (panel: InsightPanel) => void): HTMLElement {
  const flagged = ins.metrics.filter((m) => m.advice !== '');
  if (flagged.length === 0) return section('i-tip', 'Gợi ý hành động', muted('Các chỉ số hôm nay đều ổn, cứ giữ nhịp này.'));
  return section(
    'i-tip',
    'Gợi ý hành động',
    h(
      'ul',
      { class: 'rpt-list', attrs: { 'data-block': 'insight-tips' } },
      ...flagged.map((m) => {
        const panel = m.panel;
        return h(
          'li',
          { class: 'rpt-sugg', attrs: { 'data-metric': m.id } },
          h('span', { class: 'rpt-tip-icon' }, icon(panel ? PANEL_ICON[panel] : 'i-tip', { size: 24 })),
          h(
            'div',
            { class: 'rpt-sugg-body' },
            h('p', { class: 'rpt-sugg-text', text: m.advice }),
            panel
              ? h(
                  'button',
                  { class: 'link-btn', attrs: { type: 'button', 'data-goto': panel }, on: { click: () => onOpenPanel(panel) } },
                  `Mở ${PANEL_LABEL[panel]}`,
                  icon('i-forward', { size: 16 }),
                )
              : null,
          ),
        );
      }),
    ),
  );
}

function emptyBox(reason: string, title: string, text: string): HTMLElement {
  return h(
    'div',
    { class: 'rpt-empty', attrs: { 'data-empty': 'insights', 'data-reason': reason } },
    icon('i-chart', { size: 48, class: 'rpt-empty-icon' }),
    h('p', { class: 'rpt-strong', text: title }),
    h('p', { class: 'rpt-muted', text }),
  );
}

/**
 * The "Chỉ số" tab: KPI cards, the hourly chart, the per-item margin table and
 * the action list. Degrades to an empty note for a quiet day or an old save
 * that carries no insights.
 */
export function renderInsights(r: DailyReport, onOpenPanel: (panel: InsightPanel) => void): HTMLElement[] {
  const ins = r.insights;
  if (!ins) return [emptyBox('old', 'Chưa có số liệu chỉ số', 'Bản lưu này được ghi từ phiên bản cũ. Chơi thêm một ngày để xem food cost, lương và thời gian chờ.')];
  if (r.customersArrived === 0) return [emptyBox('quiet', 'Hôm nay chưa có khách', 'Chưa có số liệu để tính food cost, lương hay thời gian chờ. Mở cửa đón khách để xem chỉ số.')];
  return [kpiGrid(ins), hoursChart(ins), marginTable(ins), actions(ins, onOpenPanel)];
}
