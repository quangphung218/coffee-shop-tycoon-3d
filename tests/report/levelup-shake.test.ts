// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState } from '../../src/sim/types';
import { createDailyReport } from '../../src/ui/report';
import { BADGE_POP_MS, BADGE_SHAKE_MS } from '../../src/ui/report/report';

// Confetti is loaded with import(); a no-op burst keeps jsdom off the canvas.
vi.mock('../../src/ui/fx/confetti', () => ({ burst: () => () => {} }));

let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animate = vi.fn();
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  document.body.replaceChildren();
  document.documentElement.classList.remove('reduce-motion');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function report(over: Partial<DailyReport> = {}): DailyReport {
  return {
    day: 3,
    revenue: 1_200_000,
    ingredientCost: 300_000,
    wages: 200_000,
    marketingCost: 0,
    profit: 700_000,
    money: 2_600_000,
    customersArrived: 50,
    customersServed: 45,
    customersLost: 5,
    topSellers: [],
    outOfStock: [],
    ratingStart: 3.8,
    ratingEnd: 3.9,
    reviews: [],
    suggestions: [],
    ...over,
  };
}

const LEVEL_UP: DailyReport['levelUp'] = { level: 2, unlocks: { menu: ['cappuccino'], upgrades: ['fast_machine'], tools: ['grinder'] } };

function atReport(r: DailyReport): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.day = r.day;
  state.phase = 'report';
  state.lastReport = r;
  return state;
}

function open(r: DailyReport) {
  const view = createDailyReport({ dispatch: () => true });
  document.body.append(view.el);
  const state = atReport(r);
  view.update(state, true);
  return { view, state };
}

describe('level-up badge shake', () => {
  it('shakes the badge once (±3 px, 0.3 s after the 400 ms pop) per report', () => {
    const { view, state } = open(report({ levelUp: LEVEL_UP }));
    expect(animate).toHaveBeenCalledTimes(1);
    const badge = view.el.querySelector('.rpt-levelup-badge');
    expect(animate.mock.contexts[0]).toBe(badge);
    const [frames, opts] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(frames.every((f) => Object.keys(f).join() === 'transform')).toBe(true);
    expect(new Set(frames.map((f) => f.transform))).toEqual(new Set(['translateX(0)', 'translateX(-3px)', 'translateX(3px)']));
    expect(opts).toMatchObject({ duration: BADGE_SHAKE_MS, delay: BADGE_POP_MS });

    // Further frames of the same report do not shake again.
    view.update(state, true);
    view.update(state, false);
    view.update(state, true);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does not shake without a level-up', () => {
    open(report());
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not shake under html.reduce-motion', () => {
    document.documentElement.classList.add('reduce-motion');
    open(report({ levelUp: LEVEL_UP }));
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not shake under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }));
    open(report({ levelUp: LEVEL_UP }));
    expect(animate).not.toHaveBeenCalled();
  });
});
