// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame, saveKey, slotConsent } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, WeekResult } from '../../src/sim/types';
import { createAnalytics, type AnalyticsEnv } from '../../src/ui/analytics';
import { hitsForEvent, setAnalyticsConsent, wireAnalytics } from '../../src/ui/analyticsEvents';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

/** Mocked goatcounter: records script insertions and count calls; no network. */
function fakeEnv(loaded = true) {
  const scripts: unknown[] = [];
  const count = vi.fn();
  const env: AnalyticsEnv = {
    document: {
      createElement: () => ({ setAttribute() {} }),
      head: { appendChild: (el: unknown) => scripts.push(el) },
    } as unknown as AnalyticsEnv['document'],
    window: loaded ? { goatcounter: { count } } : {},
  };
  const paths = (): string[] => count.mock.calls.map((c) => (c[0] as { path: string }).path);
  return { env, scripts, count, paths };
}

function weekResult(cups: number): WeekResult {
  return { revenue: 1, revenueTarget: 1, stars: 4, starsTarget: 4, score: 80, cups, days: [] };
}

function withWeek(index: number): GameState {
  const s = createNewGame('Test', 'normal', 1);
  s.week = { ...s.week!, index };
  return s;
}

const SAMPLE: GameEvent[] = [
  { type: 'dayEnded', day: 1 },
  { type: 'dayEnded', day: 7 },
  { type: 'dayEnded', day: 8 },
  { type: 'week_ended', result: weekResult(2) },
  { type: 'level_up', level: 3, unlocks: {} as never },
  { type: 'regular_milestone', regularId: 'r1', milestone: 2, visits: 5, tickets: 1 },
  { type: 'served', customerId: 1, itemId: 'espresso' as never },
];

describe('analytics paths from sim events (E-23)', () => {
  it('maps each event to its exact path', () => {
    const s = withWeek(3);
    expect(SAMPLE.flatMap((e) => hitsForEvent(e, s).map((h) => h.path))).toEqual([
      '/day-end-1',
      '/day-end-7',
      '/week-end-3',
      '/week-3-cups-2',
      '/level-up-3',
      '/regular-milestone-2',
    ]);
  });

  it('with consent counts the exact paths through goatcounter.count', () => {
    const f = fakeEnv();
    const w = wireAnalytics(createAnalytics(() => f.env));
    w.setConsent('yes');
    w.onEvents(SAMPLE, withWeek(1));
    expect(f.paths()).toEqual(['/session-start', '/day-end-1', '/day-end-7', '/week-end-1', '/week-1-cups-2', '/level-up-3', '/regular-milestone-2']);
    expect(f.count).toHaveBeenCalledWith({ path: '/week-1-cups-2', title: 'Week 1 cups 2', event: true });
  });

  it('first-staff-hire only when the hire leaves exactly one staff', () => {
    const f = fakeEnv();
    const w = wireAnalytics(createAnalytics(() => f.env, 'yes'));
    const s = createNewGame('Test', 'normal', 1);
    s.staff = [{} as never, {} as never];
    w.onCommand({ type: 'hire_staff', candidateId: 1, role: 'barista' }, s);
    expect(f.paths()).toEqual([]);
    s.staff = [{} as never];
    w.onCommand({ type: 'fire_staff', staffId: 1 }, s);
    w.onCommand({ type: 'hire_staff', candidateId: 1, role: 'barista' }, s);
    expect(f.paths()).toEqual(['/first-staff-hire']);
  });

  it('quit-mid-day only while a day is open and count.js is loaded', () => {
    const s = createNewGame('Test', 'normal', 1);
    const f = fakeEnv();
    const w = wireAnalytics(createAnalytics(() => f.env, 'yes'));
    s.phase = 'preparation';
    w.onHidden(s);
    s.phase = 'report';
    w.onHidden(s);
    w.onHidden(null);
    expect(f.count).not.toHaveBeenCalled();
    s.phase = 'peak';
    w.onHidden(s);
    expect(f.paths()).toEqual(['/quit-mid-day']);

    // Script not loaded yet: nothing is inserted, queued or sent.
    const g = fakeEnv(false);
    const w2 = wireAnalytics(createAnalytics(() => g.env, 'yes'));
    w2.onHidden(s);
    expect(g.scripts).toHaveLength(0);
    (g.env.window as { goatcounter?: unknown }).goatcounter = { count: g.count };
    w2.analytics.track('/x', 'x');
    expect(g.paths()).toEqual(['/x']);
  });

  it('without consent: 0 script insertions and 0 count calls for every event', () => {
    for (const c of ['unasked', 'no'] as const) {
      const f = fakeEnv();
      const w = wireAnalytics(createAnalytics(() => f.env));
      w.setConsent(c);
      const s = withWeek(1);
      w.onEvents(SAMPLE, s);
      s.staff = [{} as never];
      w.onCommand({ type: 'hire_staff', candidateId: 1, role: 'barista' }, s);
      s.phase = 'peak';
      w.onHidden(s);
      expect(f.scripts).toHaveLength(0);
      expect(f.count).not.toHaveBeenCalled();
    }
  });

  it('revoking stops sending', () => {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env);
    setAnalyticsConsent('yes', a);
    setAnalyticsConsent('no', a);
    wireAnalytics(a).onEvents([{ type: 'dayEnded', day: 2 }], withWeek(1));
    expect(f.paths()).toEqual(['/session-start']);
  });
});

describe('game shell sends analytics (E-23)', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
    document.body.innerHTML = '';
  });

  function mount(storage = createMemoryStorage(), consent?: 'yes' | 'no') {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env);
    if (consent) a.setConsent(consent);
    const root = document.createElement('div');
    document.body.appendChild(root);
    shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7, analytics: a });
    return { f, a, storage, shell };
  }

  it('reads consent from the autosave slot at start and counts the session', () => {
    const storage = createMemoryStorage();
    saveGame(createNewGame('Test', 'normal', 1), 'auto', storage, 1, 'yes');
    const { f, a } = mount(storage);
    expect(a.consent()).toBe('yes');
    expect(f.paths()).toEqual(['/session-start']);
  });

  it('a loaded slot brings its consent', () => {
    const storage = createMemoryStorage();
    saveGame(createNewGame('Test', 'normal', 1), '1', storage, 1, 'no');
    const { a, shell: s } = mount(storage, 'yes');
    s.startGame(createNewGame('Test', 'normal', 1), '1');
    expect(a.consent()).toBe('no');
  });

  it('a played day sends its paths, hire and quit-mid-day; the autosave keeps the consent', () => {
    const { f, storage, shell: s } = mount(createMemoryStorage(), 'yes');
    s.startGame(createNewGame('Test', 'normal', 7));
    const state = s.state!;
    expect(s.dispatch({ type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' })).toBe(true);
    const events = playDay(state);
    s.handleEvents(events);
    expect(f.paths()).toEqual(['/session-start', '/first-staff-hire', '/day-end-1']);
    expect(slotConsent('auto', storage)).toBe('yes');
    expect(storage.getItem(saveKey('auto'))).not.toBeNull();

    s.dispatch({ type: 'next_day' });
    s.dispatch({ type: 'start_day' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(f.paths().at(-1)).toBe('/quit-mid-day');
  });

  it('without consent the shell sends nothing', () => {
    const { f, shell: s } = mount();
    s.startGame(createNewGame('Test', 'normal', 7));
    const state = s.state!;
    s.dispatch({ type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
    s.handleEvents(playDay(state));
    s.dispatch({ type: 'next_day' });
    s.dispatch({ type: 'start_day' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(f.scripts).toHaveLength(0);
    expect(f.count).not.toHaveBeenCalled();
  });
});
