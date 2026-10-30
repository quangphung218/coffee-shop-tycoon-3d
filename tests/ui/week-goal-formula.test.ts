// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { startNextDay } from '../../src/sim/clock';
import { WEEK_GOALS, WEEK_PROFIT_SHARE } from '../../src/sim/data/week';
import { createNewGame } from '../../src/sim/state';
import type { Difficulty, GameState } from '../../src/sim/types';
import { scoreWeek } from '../../src/sim/week';
import { formatMoney, formatRating } from '../../src/ui/core/format';
import { nextWeekGoalText, weekProfitRule } from '../../src/ui/screens/weekEnd';
import { weekGoalBlock, weekGoalView } from '../../src/ui/weekGoal';

/** The E-12 goal curve, written out: weeks 1–4, then a fixed step a week with no cap. */
const FACTORS: Record<Difficulty, { first: number[]; step: number }> = {
  easy: { first: [1, 1.7, 2.2, 2.35], step: 0.1 },
  normal: { first: [1, 1.7, 2.2, 2.4], step: 0.1 },
  hard: { first: [1, 1.65, 2.1, 2.25], step: 0.1 },
};
const SPREAD: Record<Difficulty, number> = { easy: 2, normal: 2, hard: 3 };
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const LAST_WEEK = 12;

const round100k = (x: number) => Math.round(x / 100_000) * 100_000;

function expected(d: Difficulty, week: number): { revenue: number; profit: number; factor: number } {
  const { first, step } = FACTORS[d];
  const factor = week <= first.length ? first[week - 1]! : first.at(-1)! + step * (week - first.length);
  const revenue = round100k(WEEK_GOALS[d].revenue * factor);
  return { revenue, profit: round100k(revenue * WEEK_PROFIT_SHARE[d]), factor };
}

/** A new game walked through the real week rollover (startNextDay after a scored week) to day 1 of `week`. */
function atWeek(d: Difficulty, week: number): GameState {
  const state = createNewGame('Quán Đường Dài', d, 7);
  for (let w = 1; w < week; w++) {
    state.week!.result = scoreWeek(state)!;
    state.phase = 'report';
    expect(startNextDay(state)).toBe(true);
  }
  return state;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('weekly goal shown under the E-12 formula', () => {
  for (const d of DIFFS) {
    it(`${d}: weeks 1–${LAST_WEEK} show the curve's revenue and profit targets`, () => {
      for (let week = 1; week <= LAST_WEEK; week++) {
        const state = atWeek(d, week);
        const want = expected(d, week);
        expect(state.week!.index).toBe(week);

        // Main-screen goal (Việc panel, report strip).
        const view = weekGoalView(state)!;
        const target = (id: string) => view.bars.find((b) => b.id === id)!.target;
        expect(target('revenue'), `${d} week ${week} revenue`).toBe(want.revenue);
        expect(target('profit'), `${d} week ${week} profit`).toBe(want.profit);
        expect(target('stars')).toBe(WEEK_GOALS[d].stars);
        const el = weekGoalBlock(view);
        expect(el.querySelector('[data-goal="revenue"] .week-goal-num')?.textContent).toBe(`${formatMoney(0)} / ${formatMoney(want.revenue)}`);
        expect(el.querySelector('[data-goal="profit"] .week-goal-num')?.textContent).toBe(`${formatMoney(0)} / ${formatMoney(want.profit)}`);

        // Week-end screen: next week's goal, read at the end of the week before.
        if (week > 1) {
          const text = nextWeekGoalText(atWeek(d, week - 1));
          const factor = (Math.round((want.revenue / WEEK_GOALS[d].revenue) * 10) / 10).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
          expect(text).toBe(
            `Mục tiêu: ${formatMoney(want.revenue)} doanh thu (×${factor} mục tiêu tuần 1), ${formatMoney(want.profit)} lợi nhuận và ${formatRating(WEEK_GOALS[d].stars)} sao.`,
          );
        }
      }
    });
  }

  it('keeps growing past week 4 with no cap (spot values)', () => {
    expect(expected('normal', 10).revenue).toBe(96_000_000); // 32tr × 3,0
    expect(expected('easy', 10).revenue).toBe(103_300_000); // 35tr × 2,95
    expect(expected('hard', 10).revenue).toBe(94_100_000); // 33tr × 2,85
    expect(weekGoalView(atWeek('hard', 10))!.bars[0]!.target).toBe(94_100_000);
  });
});

describe('week profit rule text', () => {
  for (const d of DIFFS) {
    it(`${d}: spreads upgrades over ${SPREAD[d]} weeks, week 1 included`, () => {
      const text = weekProfitRule(d);
      expect(text).toBe(`Lãi các ngày trừ tiền nâng cấp chia đều ${SPREAD[d]} tuần kể từ tuần mua.`);
      expect(text).not.toContain('toàn bộ');
      expect(text).not.toContain('tuần 1');
    });
  }
});
