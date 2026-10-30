import { describe, expect, it } from 'vitest';
import { MILESTONE_VISITS, REGULAR_BOOK, milestoneAt, milestonesReached, regularBook } from '../../src/sim/data/regularMilestones';
import { REGULARS } from '../../src/sim/data/regulars';
import { createNewGame } from '../../src/sim/state';
import { toastForEvent } from '../../src/ui/hud/events';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('regular milestones data (E-18)', () => {
  it('has a book entry for every regular, in REGULARS order', () => {
    expect(REGULAR_BOOK.map((e) => e.regularId)).toEqual(REGULARS.map((r) => r.id));
  });

  it('gives each regular a dish and three rising milestones with small Tem', () => {
    for (const e of REGULAR_BOOK) {
      expect(e.favoriteDish.length, e.regularId).toBeGreaterThan(0);
      expect(e.milestones.map((m) => m.visits)).toEqual([...MILESTONE_VISITS]);
      for (const m of e.milestones) {
        expect(m.tickets, e.regularId).toBeGreaterThan(0);
        expect(m.tickets, e.regularId).toBeLessThanOrEqual(3);
      }
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

  it('counts milestones from the visits', () => {
    const [a, b, c] = MILESTONE_VISITS;
    expect([0, a - 1, a, b - 1, b, c - 1, c, c + 50].map(milestonesReached)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([a - 1, a, a + 1, b, c].map(milestoneAt)).toEqual([0, 1, 0, 2, 3]);
  });

  it('builds the book from state.regulars, empty when none came yet', () => {
    const state = createNewGame('Quán Sổ', 'normal', 7);
    expect(regularBook(state).every((p) => p.visits === 0 && p.reached === 0 && p.nextVisits === MILESTONE_VISITS[0])).toBe(true);
    state.regulars = { em_vy: { visits: MILESTONE_VISITS[1], firstDay: 2, lastDay: 40 } };
    const vy = regularBook(state).find((p) => p.regular.id === 'em_vy')!;
    expect(vy.reached).toBe(2);
    expect(vy.nextVisits).toBe(MILESTONE_VISITS[2]);
    expect(vy.milestones.map((m) => m.reached)).toEqual([true, true, false]);
  });

  it('toasts a reached milestone with the regular’s name and its Tem, without emoji', () => {
    const state = createNewGame('Quán Sổ', 'normal', 7);
    const t = toastForEvent({ type: 'regular_milestone', regularId: 'co_lan', milestone: 2, visits: MILESTONE_VISITS[1], tickets: 2 }, state, 0)!;
    expect(t.level).toBe('success');
    expect(t.title).toBe('Cô Lan: mốc 2 trong Sổ khách quen');
    expect(t.text).toBe(`Ghé ${MILESTONE_VISITS[1]} lần · +2 Tem`);
    expect(EMOJI.test(`${t.title}${t.text}`)).toBe(false);
  });
});
