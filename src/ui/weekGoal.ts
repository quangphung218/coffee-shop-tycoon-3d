import type { GameState } from '../sim/types';
import { scoreWeek, weekUpgradeCharge } from '../sim/week';
import { h } from './core/dom';
import { formatMoney, formatRating } from './core/format';
import { icon, type IconId } from './core/icons';

export type WeekGoalId = 'revenue' | 'profit' | 'stars';

/** One criterion of the week score against its target. */
export interface WeekGoalBar {
  id: WeekGoalId;
  label: string;
  value: number;
  target: number;
  /** value / target in whole percent, 0 for a loss; may pass 100. */
  pct: number;
}

/** The live week goal: the three scored criteria, the cups they lead to and the upgrade share the profit pays. */
export interface WeekGoalView {
  bars: WeekGoalBar[];
  score: number;
  cups: number;
  /** Upgrade spending this week's profit counts (weekUpgradeCharge); 0 when nothing was bought. */
  upgradeCharge: number;
}

const BAR_META: Readonly<Record<WeekGoalId, { label: string; icon: IconId }>> = {
  revenue: { label: 'Doanh thu', icon: 'i-coin' },
  profit: { label: 'Lợi nhuận', icon: 'i-chart' },
  stars: { label: 'Sao', icon: 'i-star' },
};

const percent = (value: number, target: number): number => (target > 0 ? Math.round((Math.max(0, value) / target) * 100) : 100);

/**
 * The week score read on the numbers so far (scoreWeek, read-only): revenue,
 * profit less this week's upgrade charge and stars, each against its target.
 * Null for saves without a week, so the blocks built from it hide.
 */
export function weekGoalView(state: GameState): WeekGoalView | null {
  const r = scoreWeek(state);
  if (!r) return null;
  const profitTarget = r.profitTarget ?? 0;
  const profit = r.profit ?? 0;
  return {
    bars: [
      { id: 'revenue', label: BAR_META.revenue.label, value: r.revenue, target: r.revenueTarget, pct: percent(r.revenue, r.revenueTarget) },
      { id: 'profit', label: BAR_META.profit.label, value: profit, target: profitTarget, pct: percent(profit, profitTarget) },
      { id: 'stars', label: BAR_META.stars.label, value: r.stars, target: r.starsTarget, pct: percent(r.stars, r.starsTarget) },
    ],
    score: r.score,
    cups: r.cups,
    upgradeCharge: weekUpgradeCharge(state),
  };
}

function barText(b: WeekGoalBar): string {
  return b.id === 'stars' ? `${formatRating(b.value)} / ${formatRating(b.target)}` : `${formatMoney(b.value)} / ${formatMoney(b.target)}`;
}

/** Three bars (revenue, profit, stars), "Đang hướng tới N cúp" and, after an upgrade, what it costs this week. */
export function weekGoalBlock(v: WeekGoalView): HTMLElement {
  return h(
    'div',
    { class: 'week-goal', attrs: { 'data-block': 'week-goal' } },
    ...v.bars.map((b) => {
      const fill = h('span');
      fill.setAttribute('style', `width:${Math.min(100, b.pct)}%`);
      return h(
        'div',
        { class: `week-goal-row${b.pct >= 100 ? ' is-done' : ''}`, attrs: { 'data-goal': b.id } },
        h('span', { class: 'week-goal-label' }, icon(BAR_META[b.id].icon, { size: 16 }), b.label),
        h(
          'span',
          {
            class: 'progress',
            attrs: { role: 'progressbar', 'aria-label': `${b.label} tuần so mục tiêu`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, b.pct)) },
          },
          fill,
        ),
        h('span', { class: 'week-goal-num', text: barText(b) }),
      );
    }),
    h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'cups' } }, icon('i-trophy', { size: 16 }), h('b', { text: `Đang hướng tới ${v.cups} cúp` }), ` · ${v.score} điểm`),
    v.upgradeCharge > 0
      ? h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'charge' } }, `Nâng cấp tuần này gánh: ${formatMoney(v.upgradeCharge)}`)
      : null,
  );
}
