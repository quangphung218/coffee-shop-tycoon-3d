// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { DailyReport, GameState } from '../../src/sim/types';
import type * as Confetti from '../../src/ui/fx/confetti';
import { createDailyReport } from '../../src/ui/report';

// The report loads confetti with import(); this mock counts the loads and the bursts.
const fx = vi.hoisted(() => ({ loads: 0, bursts: 0, stops: 0 }));
vi.mock('../../src/ui/fx/confetti', async (importOriginal) => {
  fx.loads++;
  const actual = await importOriginal<typeof Confetti>();
  return {
    ...actual,
    burst: () => {
      fx.bursts++;
      return () => {
        fx.stops++;
      };
    },
  };
});

/** Manual rAF clock: step(ms) runs the queued frames at the advanced time. */
function stubFrames() {
  let now = 0;
  let next = 1;
  let queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(next, cb);
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  return {
    step(ms: number) {
      now += ms;
      const run = queue;
      queue = new Map();
      for (const cb of run.values()) cb(now);
    },
    get pending() {
      return queue.size;
    },
  };
}

/** jsdom has no 2D canvas: a context whose calls do nothing. */
function stubCanvas(): void {
  const ctx = new Proxy({}, { get: (_, key) => (key === 'canvas' ? undefined : () => {}), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
}

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

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

async function settle(): Promise<void> {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

/** Waits until the report's import('../fx/confetti') has resolved and its then() ran. Loads the module itself. */
async function loaded(): Promise<void> {
  await import('../../src/ui/fx/confetti');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove('reduce-motion');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('confetti burst', () => {
  let burst: typeof Confetti.burst;
  let C: typeof Confetti;
  beforeEach(async () => {
    C = await vi.importActual<typeof Confetti>('../../src/ui/fx/confetti');
    burst = C.burst;
    stubCanvas();
  });

  it('lays a hidden, click-through canvas over the host and removes it after 1.4 s', () => {
    const frames = stubFrames();
    const el = host();
    burst(el);
    const canvas = el.querySelector('canvas')!;
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.position).toBe('absolute');

    frames.step(16);
    for (let t = 16; t < C.CONFETTI_MS - 16; t += 16) frames.step(16);
    expect(el.querySelector('canvas')).not.toBeNull();
    frames.step(C.CONFETTI_MS);
    expect(el.querySelector('canvas')).toBeNull();
    expect(frames.pending).toBe(0);
  });

  it('removes the canvas at once when stopped, and stops only once', () => {
    const frames = stubFrames();
    const el = host();
    const stop = burst(el);
    frames.step(16);
    stop();
    expect(el.querySelector('canvas')).toBeNull();
    expect(frames.pending).toBe(0);
    stop();
    frames.step(16);
    expect(el.querySelector('canvas')).toBeNull();
  });

  it('caps the pixel ratio at 2', () => {
    stubFrames();
    const win = document.defaultView!;
    const saved = Object.getOwnPropertyDescriptor(win, 'devicePixelRatio');
    Object.defineProperty(win, 'devicePixelRatio', { configurable: true, value: 3 });
    try {
      const el = host();
      Object.defineProperty(el, 'clientWidth', { value: 400 });
      Object.defineProperty(el, 'clientHeight', { value: 300 });
      burst(el);
      const canvas = el.querySelector('canvas')!;
      expect([canvas.width, canvas.height]).toEqual([800, 600]);
    } finally {
      if (saved) Object.defineProperty(win, 'devicePixelRatio', saved);
      else delete (win as { devicePixelRatio?: number }).devicePixelRatio;
    }
  });

  it('draws nothing without a 2D context', () => {
    stubFrames();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const el = host();
    const stop = burst(el);
    expect(el.querySelector('canvas')).toBeNull();
    expect(() => stop()).not.toThrow();
  });
});

describe('daily report confetti', () => {
  function mount(state: GameState) {
    const view = createDailyReport({ dispatch: () => true });
    document.body.append(view.el);
    view.update(state, true);
    return view;
  }

  // First in this block: the module must not even load under reduced motion.
  it('does not load confetti when reduced motion is on', async () => {
    document.documentElement.classList.add('reduce-motion');
    const state = atReport(report({ levelUp: LEVEL_UP }));
    const view = mount(state);
    view.update(state, true);
    await settle();
    expect(fx.loads).toBe(0);
    expect(fx.bursts).toBe(0);
    expect(view.el.querySelector('[data-block="level-up"]')).not.toBeNull();
  });

  it('does not load confetti on a day without a level-up', async () => {
    mount(atReport(report()));
    await settle();
    expect(fx.loads).toBe(0);
  });

  it('throws confetti once per level-up report and stops it when the report closes', async () => {
    const before = fx.bursts;
    const state = atReport(report({ levelUp: LEVEL_UP }));
    const view = mount(state);
    view.update(state, true);
    await loaded();
    // loaded() imports it too, and the async mock factory may run for both imports.
    expect(fx.loads).toBeGreaterThan(0);
    expect(fx.bursts).toBe(before + 1);
    // The next-day button is not behind a modal: it still has focus and stays clickable.
    expect(document.activeElement?.getAttribute('data-action')).toBe('next-day');

    view.update(state, true);
    await loaded();
    expect(fx.bursts).toBe(before + 1);

    const stops = fx.stops;
    view.update(state, false);
    expect(fx.stops).toBe(stops + 1);

    // Reopening the same report does not throw it again.
    view.update(state, true);
    await loaded();
    expect(fx.bursts).toBe(before + 1);
  });

  it('skips the burst when the report closes before confetti has loaded', async () => {
    const before = fx.bursts;
    const state = atReport(report({ day: 4, levelUp: LEVEL_UP }));
    const view = mount(state);
    view.update(state, false);
    await loaded();
    expect(fx.bursts).toBe(before);
  });

  it('gives up quietly when confetti fails to load', async () => {
    vi.doMock('../../src/ui/fx/confetti', () => {
      throw new Error('offline');
    });
    vi.resetModules();
    try {
      const { createDailyReport: fresh } = await import('../../src/ui/report');
      const state = atReport(report({ day: 5, levelUp: LEVEL_UP }));
      const view = fresh({ dispatch: () => true });
      document.body.append(view.el);
      expect(() => view.update(state, true)).not.toThrow();
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.visible).toBe(true);
      expect(view.el.querySelector('[data-block="level-up"]')).not.toBeNull();
    } finally {
      vi.doUnmock('../../src/ui/fx/confetti');
      vi.resetModules();
    }
  });
});
