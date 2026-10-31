import { describe, expect, it } from 'vitest';
import { MILESTONE_COUNT, MILESTONE_TICKETS, MILESTONE_VISITS, REGULAR_BOOK, milestoneAt, milestonesReached, regularBook } from '../../src/sim/data/regularMilestones';
import { REGULARS } from '../../src/sim/data/regulars';
import { createNewGame } from '../../src/sim/state';
import { toastForEvent } from '../../src/ui/hud/events';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('regular milestones data (E-18, E-22)', () => {
  it('has a book entry for every regular, in REGULARS order', () => {
    expect(REGULAR_BOOK.map((e) => e.regularId)).toEqual(REGULARS.map((r) => r.id));
  });

  it('gives each regular a dish and four rising milestones with small Tem', () => {
    for (const e of REGULAR_BOOK) {
      expect(e.favoriteDish.length, e.regularId).toBeGreaterThan(0);
      expect(e.milestones, e.regularId).toHaveLength(MILESTONE_COUNT);
      const visits = e.milestones.map((m) => m.visits);
      expect(visits).toEqual(MILESTONE_VISITS[e.regularId]);
      for (let i = 1; i < visits.length; i++) expect(visits[i]!, e.regularId).toBeGreaterThan(visits[i - 1]!);
      expect(e.milestones.map((m) => m.tickets)).toEqual([...MILESTONE_TICKETS]);
      for (const m of e.milestones) {
        expect(m.tickets, e.regularId).toBeGreaterThan(0);
        expect(m.tickets, e.regularId).toBeLessThanOrEqual(3);
      }
    }
  });

  it('staggers the thresholds: no two regulars share one, milestone 4 near 250 visits', () => {
    const all = REGULAR_BOOK.flatMap((e) => e.milestones.map((m) => m.visits));
    expect(new Set(all).size).toBe(REGULAR_BOOK.length * MILESTONE_COUNT);
    for (const e of REGULAR_BOOK) {
      expect(e.milestones[3].visits, e.regularId).toBeGreaterThanOrEqual(230);
      expect(e.milestones[3].visits, e.regularId).toBeLessThanOrEqual(275);
    }
  });

  it('tells a Vietnamese story of 2–3 sentences per milestone, without emoji', () => {
    for (const e of REGULAR_BOOK) {
      for (const m of e.milestones) {
        const sentences = m.story.split(/(?<=[.!?])\s+/).filter(Boolean);
        expect(sentences.length, m.story).toBeGreaterThanOrEqual(2);
        expect(sentences.length, m.story).toBeLessThanOrEqual(3);
        expect(EMOJI.test(m.story), m.story).toBe(false);
        expect(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(m.story), m.story).toBe(true);
      }
      expect(EMOJI.test(e.favoriteDish)).toBe(false);
    }
  });

  it('counts milestones from the regular’s own visits', () => {
    const [a, b, c, d] = MILESTONE_VISITS.chi_hoa!;
    const reached = (v: number) => milestonesReached('chi_hoa', v);
    expect([0, a - 1, a, b - 1, b, c - 1, c, d - 1, d, d + 50].map(reached)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([a - 1, a, a + 1, b, c, d].map((v) => milestoneAt('chi_hoa', v))).toEqual([0, 1, 0, 2, 3, 4]);
    // Another regular's threshold is not chi_hoa's.
    expect(milestoneAt('chi_hoa', MILESTONE_VISITS.co_lan![1])).toBe(0);
    expect(milestonesReached('nobody', 500)).toBe(0);
  });

  it('keeps milestones from E-18 as reached and does not reach them again', () => {
    const [a, b, c] = MILESTONE_VISITS.chi_hoa!;
    expect(milestonesReached('chi_hoa', 45, 2)).toBe(2);
    expect(milestonesReached('chi_hoa', a, 2)).toBe(2);
    expect(milestoneAt('chi_hoa', b, 2)).toBe(0);
    expect(milestoneAt('chi_hoa', c, 2)).toBe(3);
  });

  it('builds the book from state.regulars, empty when none came yet', () => {
    const state = createNewGame('Quán Sổ', 'normal', 7);
    expect(regularBook(state).every((p) => p.visits === 0 && p.reached === 0 && p.nextVisits === MILESTONE_VISITS[p.regular.id]![0])).toBe(true);
    const [, b, c] = MILESTONE_VISITS.em_vy!;
    state.regulars = { em_vy: { visits: b, firstDay: 2, lastDay: 40, keptMilestones: 0 } };
    const vy = regularBook(state).find((p) => p.regular.id === 'em_vy')!;
    expect(vy.reached).toBe(2);
    expect(vy.nextVisits).toBe(c);
    expect(vy.milestones.map((m) => m.reached)).toEqual([true, true, false, false]);
  });

  it('toasts a reached milestone with the regular’s name and its Tem, without emoji', () => {
    const state = createNewGame('Quán Sổ', 'normal', 7);
    const visits = MILESTONE_VISITS.co_lan![1];
    const t = toastForEvent({ type: 'regular_milestone', regularId: 'co_lan', milestone: 2, visits, tickets: 2 }, state, 0)!;
    expect(t.level).toBe('success');
    expect(t.title).toBe('Cô Lan: mốc 2 trong Sổ khách quen');
    expect(t.text).toBe(`Ghé ${visits} lần · +2 Tem`);
    expect(EMOJI.test(`${t.title}${t.text}`)).toBe(false);
  });
});
