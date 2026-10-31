import { challengeProgress, describeChallenge, nextChallengeStyle } from '../sim/challenges';
import { WEEK_CHALLENGES } from '../sim/data/challenges';
import { styleById } from '../sim/data/styles';
import { MISSIONS_PER_DAY } from '../sim/progression';
import type { GameState, WeekChallenge } from '../sim/types';
import { WEEK_REWARD_MIN_CUPS } from '../sim/data/week';
import { isWeekGoalScaled, scoreWeek, totalUpgradeLevels, weekCups, weekUpgradeCharge } from '../sim/week';
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
  /** True when the week's goal follows the shop's recent revenue (isWeekGoalScaled, shop level 10+). */
  scaled?: boolean;
  /** Set when the week's goal is a SIZE_GOAL row (goal.profit, E-21): its total upgrade levels and profit target. */
  size?: { levels: number; profit: number };
}

/** Shown under the bars when the week's goal is scaled. */
export const SCALED_GOAL_TEXT = 'Quán đã lớn: mục tiêu theo 4 tuần gần nhất';

/** Shown under the bars, in place of SCALED_GOAL_TEXT, when the goal is a SIZE_GOAL row. */
export function sizeGoalText(levels: number): string {
  return `Mục tiêu theo cỡ quán (${levels} cấp nâng cấp)`;
}

/** The one-sentence hint under sizeGoalText. */
export function sizeGoalHint(profit: number): string {
  return `Quán cỡ này thường lãi ${formatMoney(profit)}. Thuê người thứ hai, chỉnh giá để vượt.`;
}

const BAR_META: Readonly<Record<WeekGoalId, { label: string; icon: IconId }>> = {
  revenue: { label: 'Doanh thu', icon: 'i-coin' },
  profit: { label: 'Lợi nhuận', icon: 'i-chart' },
  stars: { label: 'Sao', icon: 'i-star' },
};

/** Cups a week can earn (weekCups). */
const MAX_CUPS = 3;

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
  const goal = state.week?.goal;
  const size =
    goal && typeof goal.profit === 'number' && Number.isFinite(goal.profit)
      ? { levels: goal.levels ?? totalUpgradeLevels(state), profit: goal.profit }
      : undefined;
  return {
    bars: [
      { id: 'revenue', label: BAR_META.revenue.label, value: r.revenue, target: r.revenueTarget, pct: percent(r.revenue, r.revenueTarget) },
      { id: 'profit', label: BAR_META.profit.label, value: profit, target: profitTarget, pct: percent(profit, profitTarget) },
      { id: 'stars', label: BAR_META.stars.label, value: r.stars, target: r.starsTarget, pct: percent(r.stars, r.starsTarget) },
    ],
    score: r.score,
    cups: r.cups,
    upgradeCharge: weekUpgradeCharge(state),
    scaled: isWeekGoalScaled(state),
    ...(size ? { size } : {}),
  };
}

function barText(b: WeekGoalBar): string {
  return b.id === 'stars' ? `${formatRating(b.value)} / ${formatRating(b.target)}` : `${formatMoney(b.value)} / ${formatMoney(b.target)}`;
}

/** Lowest score that earns `cups` cups (weekCups). */
function cupMinScore(cups: number): number {
  for (let s = 0; s <= 100; s++) if (weekCups(s) >= cups) return s;
  return 100;
}

/**
 * "Hiện 52 điểm · cần 70 để 2 cúp": the score so far and the next cup that
 * pays a reward (at least WEEK_REWARD_MIN_CUPS), or "đủ 3 cúp" at the top.
 */
export function cupsLineText(v: Pick<WeekGoalView, 'score' | 'cups'>): string {
  if (v.cups >= MAX_CUPS) return `Hiện ${v.score} điểm · đủ ${MAX_CUPS} cúp`;
  const next = Math.max(v.cups + 1, WEEK_REWARD_MIN_CUPS);
  return `Hiện ${v.score} điểm · cần ${cupMinScore(next)} để ${next} cúp`;
}

/**
 * Three bars (revenue, profit, stars), "Hiện X điểm · cần Y để N cúp", the
 * goal note (SIZE_GOAL line and hint, else the E-19 scaled note from shop
 * level 10) and, after an upgrade, what it costs this week.
 */
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
    h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'cups' } }, icon('i-trophy', { size: 16 }), h('span', { text: cupsLineText(v) })),
    v.size ? h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'size' } }, sizeGoalText(v.size.levels)) : null,
    v.size ? h('p', { class: 'week-goal-line item-meta', attrs: { 'data-goal': 'size-hint' } }, sizeGoalHint(v.size.profit)) : null,
    !v.size && v.scaled ? h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'scaled' } }, SCALED_GOAL_TEXT) : null,
    v.upgradeCharge > 0
      ? h('p', { class: 'week-goal-line', attrs: { 'data-goal': 'charge' } }, `Nâng cấp tuần này gánh: ${formatMoney(v.upgradeCharge)}`)
      : null,
  );
}

/** The week's side challenge as the Mục tiêu tuần block shows it (challengeProgress). */
export interface ChallengeView {
  name: string;
  description: string;
  value: number;
  target: number;
  done: boolean;
  failed: boolean;
  /** Tem paid on completion. */
  tickets: number;
  /** Shop style it opens: the one it unlocked once done, else the next challenge-gated one; null once all are open. */
  style: string | null;
  /** "Ngày tốt nhất: …" for the challenges counted per day (calm_day, stars_week, perfect_days); null for the others. */
  best: string | null;
}

/** The challenges whose progress counts whole days, where a value like 0/1 says little on its own. */
const PER_DAY_CHALLENGES: ReadonlySet<WeekChallenge['id']> = new Set(['calm_day', 'stars_week', 'perfect_days']);

/** "Ngày tốt nhất: 245/300 khách, không ai bỏ về", "… 4,8 sao", "… 2/3 nhiệm vụ"; null for additive challenges. */
export function challengeBestText(challenge: WeekChallenge): string | null {
  if (!PER_DAY_CHALLENGES.has(challenge.id)) return null;
  const best = challenge.best;
  if (challenge.id === 'calm_day') {
    const min = challenge.minServed ?? WEEK_CHALLENGES.calm_day.minServed ?? 0;
    return best === undefined ? 'Ngày tốt nhất: chưa có ngày nào không ai bỏ về' : `Ngày tốt nhất: ${best}/${min} khách, không ai bỏ về`;
  }
  if (best === undefined) return 'Ngày tốt nhất: chưa có ngày nào khép lại';
  if (challenge.id === 'stars_week') return `Ngày tốt nhất: ${formatRating(best)} sao`;
  return `Ngày tốt nhất: ${best}/${MISSIONS_PER_DAY} nhiệm vụ`;
}

/** The week's side challenge and its progress so far; null before CHALLENGE_FIRST_WEEK or without one, so its block hides. */
export function challengeView(state: GameState): ChallengeView | null {
  const challenge = state.week?.challenge;
  const p = challengeProgress(state);
  if (!challenge || !p) return null;
  const { name, description } = describeChallenge(challenge);
  const styleId = p.done ? challenge.reward.unlock?.id : nextChallengeStyle(state);
  const style = (styleId && styleById(styleId)?.name) || null;
  const best = challengeBestText(challenge);
  return { name, description, value: p.value, target: p.target, done: p.done, failed: p.failed, tickets: challenge.reward.tickets, style, best };
}

/** "Mở kiểu Biển neon" while it can still be won, "Đã mở kiểu Biển neon" once done; null when failed or with no style left. */
export function challengeStyleText(v: Pick<ChallengeView, 'style' | 'done' | 'failed'>): string | null {
  if (!v.style || v.failed) return null;
  return v.done ? `Đã mở kiểu ${v.style}` : `Mở kiểu ${v.style}`;
}

function challengeStatus(v: ChallengeView): string {
  if (v.done) return 'Đã xong';
  if (v.failed) return 'Đã hụt';
  return `Thưởng +${v.tickets} Tem`;
}

/** "3/7 ngày" for a per-day challenge, "Đạt"/"Chưa đạt" for a one-day one (not "0/1"), else "value/target". */
function challengeValueText(v: ChallengeView): string {
  if (!v.best) return `${v.value}/${v.target}`;
  if (v.target === 1) return v.done ? 'Đạt' : 'Chưa đạt';
  return `${v.value}/${v.target} ngày`;
}

/** "Thử thách: name", what to do, one bar with "value/target" and the reward, or done/failed in its place, then the style it opens. */
export function challengeBlock(v: ChallengeView): HTMLElement {
  const style = challengeStyleText(v);
  const pct = v.done ? 100 : v.target > 0 ? Math.min(100, Math.round((v.value / v.target) * 100)) : 100;
  const fill = h('span');
  fill.setAttribute('style', `width:${pct}%`);
  return h(
    'div',
    { class: 'week-goal week-challenge', attrs: { 'data-block': 'challenge', 'data-state': v.done ? 'done' : v.failed ? 'failed' : 'active' } },
    h('p', { class: 'week-goal-line', attrs: { 'data-challenge': 'name' } }, icon('i-sparkle', { size: 16 }), h('span', { text: `Thử thách: ${v.name}` })),
    h('p', { class: 'week-goal-line item-meta', attrs: { 'data-challenge': 'description' }, text: v.description }),
    h(
      'div',
      { class: `week-goal-row${v.done ? ' is-done' : ''}${v.failed ? ' is-failed' : ''}`, attrs: { 'data-challenge': 'bar' } },
      h('span', { class: 'week-goal-num', attrs: { 'data-challenge': 'value' }, text: challengeValueText(v) }),
      h(
        'span',
        {
          class: 'progress',
          attrs: { role: 'progressbar', 'aria-label': `Thử thách ${v.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        },
        fill,
      ),
      h('span', { class: 'week-goal-num', attrs: { 'data-challenge': 'reward' }, text: challengeStatus(v) }),
    ),
    v.best ? h('p', { class: 'week-goal-line item-meta', attrs: { 'data-challenge': 'best' }, text: v.best }) : null,
    style ? h('p', { class: 'week-goal-line item-meta', attrs: { 'data-challenge': 'style' }, text: style }) : null,
  );
}
